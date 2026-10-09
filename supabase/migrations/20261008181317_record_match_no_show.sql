-- A paired table nobody (or only one player) opened: the match is void and
-- each absent seat gets a no-show abandonment. Otherwise as before.
create or replace function public.record_match(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid := (p ->> 'id')::uuid;
  v_status text;
  v_reason text := p -> 'result' ->> 'reason';
begin
  select status into v_status from public.matches where id = v_match for update;
  if v_status is null then
    insert into public.matches (id, kind, status, config)
    values (v_match, p ->> 'kind', 'playing', p -> 'config');
    insert into public.match_players (match_id, user_id, seat)
    select v_match, (s ->> 'userId')::uuid, (s ->> 'seat')::smallint
    from jsonb_array_elements(p -> 'players') s;
    v_status := 'playing';
  end if;

  if p -> 'result' is null or v_status <> 'playing' then
    return;
  end if;

  update public.matches
  set status = case when v_reason in ('engine_fault', 'no_show') then 'void' else 'finished' end,
      result = p -> 'result',
      finished_at = now()
  where id = v_match;

  update public.match_players mp
  set timeouts = coalesce((p -> 'timeouts' ->> mp.seat::text)::smallint, 0),
      abandoned = coalesce(mp.seat::text = (p -> 'result' ->> 'forfeit'), false)
        or coalesce(p -> 'result' -> 'noShow' @> to_jsonb(mp.seat), false)
  where mp.match_id = v_match;

  insert into public.abandonments (user_id, match_id, hand_no, kind)
  select mp.user_id, v_match, (p ->> 'handNo')::integer, 'timeout_x3'
  from public.match_players mp
  where mp.match_id = v_match and mp.seat::text = (p -> 'result' ->> 'forfeit');

  insert into public.abandonments (user_id, match_id, hand_no, kind)
  select mp.user_id, v_match, null, 'no_show'
  from public.match_players mp
  where mp.match_id = v_match
    and coalesce(p -> 'result' -> 'noShow' @> to_jsonb(mp.seat), false);
end $$;

revoke all on function public.record_match(jsonb) from public, anon, authenticated;
grant execute on function public.record_match(jsonb) to service_role;
