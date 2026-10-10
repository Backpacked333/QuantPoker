-- P1-09 (QA review): keep each graded decision's pot. A grade is EV lost as a
-- share of the pot at that decision, so a plain mean of accuracies counts a
-- 2 bb preflop choice the same as a 200 bb river call. The QA attack found
-- players who raise every street losing the most chips yet averaging near
-- Atlas's accuracy (.10x/decisions/qa/accuracy.md). With the pot kept, the
-- rolling aggregate (P1-10) can weigh each decision by what was at stake.
--
-- Additive: nullable, because a grade written by a Worker that predates this
-- column (none in production: the table is empty) has no pot.
alter table public.hand_grades add column pot real check (pot > 0);

-- record_grades as shipped (20261010053000), now also writing the pot.
create or replace function public.record_grades(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hand text := p ->> 'handId';
  v_match uuid;
  v_verified boolean;
  v_kind text;
begin
  select h.match_id, h.verified, m.kind into v_match, v_verified, v_kind
  from public.hands h join public.matches m on m.id = h.match_id
  where h.id = v_hand;
  if v_match is null then
    raise exception 'hand % is not archived', v_hand using errcode = 'P0002';
  end if;
  if not v_verified then
    raise exception 'hand % is not verified', v_hand;
  end if;
  if v_kind <> 'hu-rated' then
    raise exception 'hand % is not rated', v_hand;
  end if;
  insert into public.hand_grades (hand_id, seat, idx, user_id, format, grade,
                                  ev_lost, accuracy, pot, model_version)
  select v_hand, (g ->> 'seat')::smallint, (g ->> 'idx')::smallint,
         mp.user_id, p ->> 'format', g ->> 'grade',
         (g ->> 'evLost')::real, (g ->> 'accuracy')::real, (g ->> 'pot')::real,
         p ->> 'modelVersion'
  from jsonb_array_elements(p -> 'grades') g
  join public.match_players mp
    on mp.match_id = v_match and mp.seat = (g ->> 'seat')::smallint
  on conflict do nothing;
end $$;

revoke all on function public.record_grades(jsonb) from public, anon, authenticated;
grant execute on function public.record_grades(jsonb) to service_role;
