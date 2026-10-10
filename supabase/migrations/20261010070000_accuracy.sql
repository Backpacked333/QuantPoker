-- P1-10: accuracy on the profile. The plain mean of a player's latest 500
-- graded decisions from matches that are over, and the grade distribution
-- over the same decisions, labelled "Accuracy vs. a model opponent, not a
-- solver." The plain mean is the shown number; the QA review compared
-- pot-weighted variants and keeps them for the real-data analysis
-- (.10x/decisions/qa/accuracy.md, hand_grades.pot).
--
-- Raw grades are readable by a match's two players only (hand_grades RLS),
-- so the public number is a stored aggregate written by a security definer
-- that browsers cannot run (the RLS-matrix rule). A match in play never
-- moves it: the filter is explicit, so a live grade cannot leak through it.
-- It is refreshed when a rated match finishes (trigger) and when grades
-- land after the finish (record_grades).
-- (Created by the learning_cloud migration in production; here too, so this
-- migration stands alone.)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.accuracy (
  user_id uuid not null references public.players (user_id) on delete cascade,
  format text not null check (format in ('hu-duplicate', '6max')),
  -- Null until the first graded decision.
  accuracy real check (accuracy between 0 and 100),
  graded integer not null default 0 check (graded between 0 and 500),
  best integer not null default 0 check (best >= 0),
  good integer not null default 0 check (good >= 0),
  inaccuracy integer not null default 0 check (inaccuracy >= 0),
  mistake integer not null default 0 check (mistake >= 0),
  blunder integer not null default 0 check (blunder >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, format)
);

alter table public.accuracy enable row level security;
revoke all on public.accuracy from anon, authenticated;
grant select on public.accuracy to anon, authenticated;
create policy accuracy_public_read on public.accuracy
  for select to anon, authenticated using (true);

-- The latest 500 graded decisions of matches that are over, in the order the
-- hands were played (archived), not the order they were graded: a retry can
-- grade an old hand late, and it must not push newer play out of the window.
-- Only definers call it.
create function private.player_accuracy(p_user uuid, p_format text default 'hu-duplicate')
returns table (accuracy real, graded integer, best integer, good integer,
               inaccuracy integer, mistake integer, blunder integer)
language sql stable set search_path = '' as $$
  select avg(l.accuracy)::real, count(*)::int,
         count(*) filter (where l.grade = 'best')::int,
         count(*) filter (where l.grade = 'good')::int,
         count(*) filter (where l.grade = 'inaccuracy')::int,
         count(*) filter (where l.grade = 'mistake')::int,
         count(*) filter (where l.grade = 'blunder')::int
  from (
    select g.accuracy, g.grade from public.hand_grades g
    join public.hands h on h.id = g.hand_id
    join public.matches m on m.id = h.match_id
    where g.user_id = p_user and g.format = p_format and m.status <> 'playing'
    order by h.created_at desc, h.match_id, h.hand_no desc, g.idx desc
    limit 500
  ) l
$$;
revoke all on function private.player_accuracy(uuid, text) from public, anon, authenticated;

create function private.refresh_accuracy(p_user uuid, p_format text) returns void
language sql security definer set search_path = '' as $$
  insert into public.accuracy (user_id, format, accuracy, graded, best, good,
                               inaccuracy, mistake, blunder, updated_at)
  select p_user, p_format, a.accuracy, a.graded, a.best, a.good,
         a.inaccuracy, a.mistake, a.blunder, now()
  from private.player_accuracy(p_user, p_format) a
  where a.graded > 0
  on conflict (user_id, format) do update
    set accuracy = excluded.accuracy, graded = excluded.graded,
        best = excluded.best, good = excluded.good,
        inaccuracy = excluded.inaccuracy, mistake = excluded.mistake,
        blunder = excluded.blunder, updated_at = excluded.updated_at;
$$;
revoke all on function private.refresh_accuracy(uuid, text) from public, anon, authenticated;

-- A rated match that finishes (or is voided) refreshes both players.
create function private.refresh_finished_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  for v_user in
    select mp.user_id from public.match_players mp where mp.match_id = new.id
  loop
    perform private.refresh_accuracy(v_user, 'hu-duplicate');
  end loop;
  return null;
end $$;
revoke all on function private.refresh_finished_match() from public, anon, authenticated;

create trigger matches_refresh_accuracy
  after update of status on public.matches
  for each row
  when (old.status = 'playing' and new.status <> 'playing' and new.kind = 'hu-rated')
  execute function private.refresh_finished_match();

-- record_grades as of 20261010060000, now refreshing both players when the
-- grades land after their match is over (the last hand's always do).
create or replace function public.record_grades(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hand text := p ->> 'handId';
  v_match uuid;
  v_verified boolean;
  v_kind text;
  v_status text;
  v_user uuid;
begin
  -- The share lock serializes this with the match's finish: either the
  -- finish trigger runs after these grades commit and counts them, or this
  -- reads the finished status and refreshes itself. Unlocked, a finish
  -- committing in between would count neither (review finding).
  select h.match_id, h.verified, m.kind, m.status
    into v_match, v_verified, v_kind, v_status
  from public.hands h join public.matches m on m.id = h.match_id
  where h.id = v_hand
  for share of m;
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
  if v_status <> 'playing' then
    for v_user in
      select mp.user_id from public.match_players mp where mp.match_id = v_match
    loop
      perform private.refresh_accuracy(v_user, p ->> 'format');
    end loop;
  end if;
end $$;

revoke all on function public.record_grades(jsonb) from public, anon, authenticated;
grant execute on function public.record_grades(jsonb) to service_role;

-- Grades written before this migration (the consumer shipped first) are
-- counted now, so nobody who was graded reads "Not graded yet".
select private.refresh_accuracy(g.user_id, g.format)
from (select distinct user_id, format from public.hand_grades) g;

-- The luck-versus-skill chart across rated matches: each hand of a player's
-- rated matches that are over, oldest first, with their net and their net
-- with all-in luck taken out (hands.record luck, P1-02). Hands are public,
-- so this runs with the caller's rights. At most the latest p_limit hands.
create function public.rated_luck(p_user uuid, p_limit integer default 2000)
returns table (match_id uuid, hand_no integer, net real, adjusted real)
language sql stable set search_path = '' as $$
  select l.match_id, l.hand_no, l.net, l.adjusted from (
    select h.match_id, h.hand_no, h.created_at,
           (h.record -> 'netBySeat' ->> mp.seat::text)::real as net,
           coalesce((h.record -> 'luck' -> 'adjustedBySeat' ->> mp.seat::text)::real,
                    (h.record -> 'netBySeat' ->> mp.seat::text)::real) as adjusted
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    join public.hands h on h.match_id = m.id
    where mp.user_id = p_user and m.kind = 'hu-rated' and m.status <> 'playing'
    order by h.created_at desc, h.match_id desc, h.hand_no desc
    limit least(greatest(p_limit, 1), 5000)
  ) l
  order by l.created_at, l.match_id, l.hand_no
$$;
