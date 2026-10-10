-- P1-09: per-decision grades of rated heads-up hands, written by the
-- grading consumer once a hand is verified (worker/src/grade.ts), against
-- the human population model (src/lib/population.ts).
--
-- A grade is analysis data: nobody reads one while its match is playing
-- (the lab-off rule, P1-03). Once the match is over, its two players read
-- both seats, and nobody else reads any (Q6).
--
-- The design is the DBA's (.10x/decisions/dba/phase1-schema.md), with three
-- changes: readers are the match's players only, each grade's player comes
-- from its seat, and the accuracy kept on ratings waits for P1-12, which
-- creates ratings.
create table public.hand_grades (
  hand_id text not null references public.hands (id) on delete cascade,
  seat smallint not null check (seat between 0 and 5),
  -- The decision's index in the hand's actions (hands.record -> actions),
  -- so its decision time and source join directly.
  idx smallint not null check (idx >= 0),
  user_id uuid not null references public.players (user_id),
  -- Rated only (R-23); the format keeps accuracy per format for Phase 2.
  format text not null check (format in ('hu-duplicate', '6max')),
  grade text not null
    check (grade in ('best', 'good', 'inaccuracy', 'mistake', 'blunder')),
  ev_lost real not null check (ev_lost >= 0),
  accuracy real not null check (accuracy between 0 and 100),
  model_version text not null,
  created_at timestamptz not null default now(),
  primary key (hand_id, seat, idx)
);
-- A player's latest graded decisions (rolling accuracy, P1-10).
create index hand_grades_user on public.hand_grades (user_id, format, created_at desc);

alter table public.hand_grades enable row level security;
revoke all on public.hand_grades from anon, authenticated;
grant select on public.hand_grades to authenticated;
create policy hand_grades_players_after_match on public.hand_grades
  for select to authenticated
  using (exists (
    select 1 from public.hands h
    join public.matches m on m.id = h.match_id
    join public.match_players mp on mp.match_id = m.id
    where h.id = hand_grades.hand_id
      and m.status <> 'playing'
      and mp.user_id = (select auth.uid())
  ));

-- The grading consumer's write: a redelivery adds nothing and changes
-- nothing. A hand not archived yet is refused (P0002), so the consumer
-- retries it. Only a verified hand of a rated match is graded: the consumer
-- grades after verifying, and this holds even if it did not. Each grade's
-- player is the hand's player in that seat.
-- p: { handId, format, modelVersion,
--      grades: [{ seat, idx, grade, evLost, accuracy }] }
create function public.record_grades(p jsonb) returns void
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
                                  ev_lost, accuracy, model_version)
  select v_hand, (g ->> 'seat')::smallint, (g ->> 'idx')::smallint,
         mp.user_id, p ->> 'format', g ->> 'grade',
         (g ->> 'evLost')::real, (g ->> 'accuracy')::real, p ->> 'modelVersion'
  from jsonb_array_elements(p -> 'grades') g
  join public.match_players mp
    on mp.match_id = v_match and mp.seat = (g ->> 'seat')::smallint
  on conflict do nothing;
end $$;

revoke all on function public.record_grades(jsonb) from public, anon, authenticated;
grant execute on function public.record_grades(jsonb) to service_role;
