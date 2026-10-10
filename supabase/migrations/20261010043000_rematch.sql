-- P1-04: a rematch links the new rated match to the one it follows, so the
-- rematch rate is a count: matches with rematch_of over finished rated
-- matches. Readable like the rest of matches (public rated histories).
alter table public.matches
  add column rematch_of uuid references public.matches (id) on delete set null;

-- The foreign key's index, so deleting a match (the app never does; on
-- delete set null) does not scan matches. Partial: most rows have none.
create index matches_rematch_of on public.matches (rematch_of)
  where rematch_of is not null;

-- v5: exactly v4 (rated_matches), plus the rematch link: p.rematchOf is
-- stored when that match is in the archive as a finished rated match, by
-- the call that creates the row or, failing that, by the finish. Two
-- tables archive the two matches, so the rematch can arrive first; the
-- link then waits for the rematch's own finish rather than the call being
-- refused, because a foreign-key refusal would retry and then park the
-- whole match (S7-13). A predecessor that never arrives finished leaves
-- no link.
create or replace function public.record_match(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid := (p ->> 'id')::uuid;
  v_status text;
  v_kind text;
  v_reason text := p -> 'result' ->> 'reason';
  v_final text;
  v_at timestamptz := now();
begin
  select status, kind into v_status, v_kind
  from public.matches where id = v_match for update;
  if v_status is null then
    -- v5: the rematch link, if its match is archived and finished.
    insert into public.matches (id, kind, status, config, rematch_of)
    values (v_match, p ->> 'kind', 'playing', p -> 'config',
      (select m.id from public.matches m
       where m.id = (p ->> 'rematchOf')::uuid
         and m.kind = 'hu-rated' and m.status = 'finished'));
    insert into public.match_players (match_id, user_id, seat)
    select v_match, (s ->> 'userId')::uuid, (s ->> 'seat')::smallint
    from jsonb_array_elements(p -> 'players') s;
    v_status := 'playing';
    v_kind := p ->> 'kind';
  end if;

  if p -> 'result' is null or v_status <> 'playing' then
    return;
  end if;

  v_final := case when v_reason in ('engine_fault', 'no_show', 'abandoned')
    then 'void' else 'finished' end;
  -- v5: a link the first call could not make yet is made now.
  update public.matches
  set status = v_final, result = p -> 'result', finished_at = v_at,
      rematch_of = coalesce(rematch_of,
        (select m.id from public.matches m
         where m.id = (p ->> 'rematchOf')::uuid
           and m.kind = 'hu-rated' and m.status = 'finished'))
  where id = v_match;

  update public.match_players mp
  set timeouts = coalesce((p -> 'timeouts' ->> mp.seat::text)::smallint, 0),
      abandoned = coalesce(mp.seat::text = (p -> 'result' ->> 'forfeit'), false)
        or coalesce(p -> 'result' -> 'noShow' @> to_jsonb(mp.seat), false)
        or coalesce(p -> 'result' -> 'abandoned' @> to_jsonb(mp.seat), false),
      finished_at = v_at,
      outcome = case when v_kind = 'hu-rated' and v_final = 'finished'
        then p -> 'result' -> 'outcomeBySeat' ->> mp.seat::text end,
      adjusted_chips = case when v_kind = 'hu-rated' and v_final = 'finished'
        then (p -> 'result' -> 'adjustedBySeat' ->> mp.seat::text)::double precision end
  where mp.match_id = v_match;

  -- A rated result missing a seat would archive as finished with a hole in
  -- it; refused instead (23502), so the Worker retries and then parks the
  -- call with an incident (S7-13).
  if v_kind = 'hu-rated' and v_final = 'finished' and exists (
    select 1 from public.match_players mp
    where mp.match_id = v_match
      and (mp.outcome is null or mp.adjusted_chips is null)
  ) then
    raise exception 'rated result incomplete for match %', v_match
      using errcode = '23502';
  end if;

  insert into public.abandonments (user_id, match_id, hand_no, kind)
  select mp.user_id, v_match, (p ->> 'handNo')::integer, 'timeout_x3'
  from public.match_players mp
  where mp.match_id = v_match and mp.seat::text = (p -> 'result' ->> 'forfeit');

  insert into public.abandonments (user_id, match_id, hand_no, kind)
  select mp.user_id, v_match, null, 'no_show'
  from public.match_players mp
  where mp.match_id = v_match
    and coalesce(p -> 'result' -> 'noShow' @> to_jsonb(mp.seat), false);

  insert into public.abandonments (user_id, match_id, hand_no, kind)
  select mp.user_id, v_match, (p ->> 'handNo')::integer, 'leave_mid_hand'
  from public.match_players mp
  where mp.match_id = v_match
    and coalesce(p -> 'result' -> 'abandoned' @> to_jsonb(mp.seat), false);
end $$;

revoke all on function public.record_match(jsonb) from public, anon, authenticated;
grant execute on function public.record_match(jsonb) to service_role;
