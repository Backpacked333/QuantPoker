-- P1-01: rated heads-up matches (ADR amendment 2026-10-10; DBA design in
-- .10x/decisions/dba/phase1-schema.md D4). Additive: one more kind, three
-- nullable columns on match_players, one index, and record_match v4, which
-- accepts every payload v3 did.

-- A plain ADD CONSTRAINT CHECK scans matches under an exclusive lock; NOT
-- VALID records the rule at once and VALIDATE scans without blocking writes.
alter table public.matches drop constraint matches_kind_check;
alter table public.matches
  add constraint matches_kind_check check (kind in ('hu-casual', 'hu-rated'))
  not valid;
alter table public.matches validate constraint matches_kind_check;

alter table public.match_players
  -- W/D/L of a finished rated match, decided by the table server from the
  -- luck-adjusted total and the draw band (DRAW_BAND_BB). Null for casual
  -- and void matches.
  add column outcome text check (outcome in ('win', 'draw', 'loss')),
  -- The luck-adjusted net in chips (src/engine/luck.ts: all-in pots settled
  -- at equity). net_chips stays the chips actually won.
  add column adjusted_chips double precision,
  -- A copy of matches.finished_at, so a player's matches list newest first
  -- from one index instead of joining and sorting all of them.
  add column finished_at timestamptz;

update public.match_players mp
set finished_at = m.finished_at
from public.matches m
where m.id = mp.match_id and m.finished_at is not null;

create index match_players_history on public.match_players (user_id, finished_at desc)
  where finished_at is not null;

-- v4: as v3 (record_match_no_show), and at the finish also copies
-- finished_at to every seat and, for a finished rated match, stores each
-- seat's outcome and adjusted chips from result.outcomeBySeat and
-- result.adjustedBySeat. The rules live in the Worker; the checks above
-- refuse anything else, and the whole call rolls back with them.
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
    insert into public.matches (id, kind, status, config)
    values (v_match, p ->> 'kind', 'playing', p -> 'config');
    insert into public.match_players (match_id, user_id, seat)
    select v_match, (s ->> 'userId')::uuid, (s ->> 'seat')::smallint
    from jsonb_array_elements(p -> 'players') s;
    v_status := 'playing';
    v_kind := p ->> 'kind';
  end if;

  if p -> 'result' is null or v_status <> 'playing' then
    return;
  end if;

  v_final := case when v_reason in ('engine_fault', 'no_show') then 'void' else 'finished' end;
  update public.matches
  set status = v_final, result = p -> 'result', finished_at = v_at
  where id = v_match;

  update public.match_players mp
  set timeouts = coalesce((p -> 'timeouts' ->> mp.seat::text)::smallint, 0),
      abandoned = coalesce(mp.seat::text = (p -> 'result' ->> 'forfeit'), false)
        or coalesce(p -> 'result' -> 'noShow' @> to_jsonb(mp.seat), false),
      finished_at = v_at,
      outcome = case when v_kind = 'hu-rated' and v_final = 'finished'
        then p -> 'result' -> 'outcomeBySeat' ->> mp.seat::text end,
      adjusted_chips = case when v_kind = 'hu-rated' and v_final = 'finished'
        then (p -> 'result' -> 'adjustedBySeat' ->> mp.seat::text)::double precision end
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
