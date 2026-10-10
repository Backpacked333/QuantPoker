-- P1-12: ratings. Each finished rated match changes both players' Glicko-2
-- ratings exactly once, in one transaction, with an append-only history.
-- The Worker computes the new values with src/rating/glicko2.ts (glicko2.v1)
-- and sends them with the version of each row it read; apply_rating checks
-- the versions (compare-and-set) and answers a repeat with the change it
-- already made. The design is the DBA's (.10x/decisions/dba/phase1-schema.md
-- D1, D2, D3), with two changes: apply_rating returns the change and checks
-- the payload against the archived match, and abandonments are counted by a
-- trigger on the match's seats instead of a payload flag.

-- (Created by the learning_cloud migration in production; here too, so this
-- migration stands alone.)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Glicko-2 state per format, on the display scale: rating = 1500 +
-- 173.7178·μ, rd = 173.7178·φ, and σ. The ladder reads every column it
-- shows from this row (D3).
create table public.ratings (
  user_id uuid not null references public.players (user_id) on delete cascade,
  format text not null check (format in ('hu-duplicate', '6max')),
  -- Glicko-2 ratings are unbounded (a weak new player who keeps losing goes
  -- below zero); the check refuses only what no model produces, and NaN.
  rating double precision not null default 1500
    check (rating > -100000 and rating < 100000),
  rd double precision not null default 350 check (rd > 0 and rd <= 350),
  sigma double precision not null default 0.06 check (sigma > 0 and sigma < 1),
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0,
  draws integer not null default 0,
  -- Rated matches this player abandoned: a forfeit (three timeouts), a
  -- no-show or leaving a match both players left (R-14: void and unrated,
  -- but counted). The ladder rule is abandoned / matches over the lifetime
  -- (R-13), so a lapse is diluted by later play.
  abandoned integer not null default 0 check (abandoned >= 0),
  last_match_at timestamptz,
  -- Compare-and-set: apply_rating names the version it computed from.
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, format),
  check (wins >= 0 and draws >= 0 and wins + draws <= matches)
);
create index ratings_ladder on public.ratings (format, rating desc, user_id);

-- Append-only. One 'match' row per player per rated match: the partial
-- unique index makes rating a match twice impossible. 'reset' rows come from
-- sanctions (P1-18); 'decay' is reserved.
create table public.rating_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.players (user_id) on delete cascade,
  format text not null check (format in ('hu-duplicate', '6max')),
  kind text not null check (kind in ('match', 'reset', 'decay')),
  match_id uuid references public.matches (id),
  outcome text check (outcome in ('win', 'draw', 'loss')),
  before_rating double precision not null,
  before_rd double precision not null,
  before_sigma double precision not null,
  after_rating double precision not null,
  after_rd double precision not null,
  after_sigma double precision not null,
  model_version text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'match') = (match_id is not null and outcome is not null))
);
create unique index rating_history_once on public.rating_history (match_id, user_id)
  where kind = 'match';
create index rating_history_user on public.rating_history (user_id, format, created_at desc);
create index rating_history_match on public.rating_history (match_id);
-- The "this month" ladder (R-16) reads one month of match rows.
create index rating_history_month on public.rating_history (format, created_at)
  where kind = 'match';

create function private.refuse_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
revoke all on function private.refuse_change() from public, anon, authenticated;
create trigger rating_history_append_only
  before update or delete on public.rating_history
  for each row execute function private.refuse_change();
create trigger rating_history_no_truncate
  before truncate on public.rating_history
  for each statement execute function private.refuse_change();

-- Ratings are public: the number people climb and recruiters read.
alter table public.ratings enable row level security;
alter table public.rating_history enable row level security;
revoke all on public.ratings, public.rating_history from anon, authenticated;
grant select on public.ratings, public.rating_history to anon, authenticated;
create policy ratings_public_read on public.ratings
  for select to anon, authenticated using (true);
create policy rating_history_public_read on public.rating_history
  for select to anon, authenticated using (true);

-- The rating change of one match, as apply_rating reports it: per player,
-- ordered by user, the rating before and after, and how many rated matches
-- they had played counting this one (stable, so a repeat reports the same).
create function private.rating_change(p_match uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', h.user_id,
      'outcome', h.outcome,
      'before', jsonb_build_object('rating', h.before_rating, 'rd', h.before_rd),
      'after', jsonb_build_object('rating', h.after_rating, 'rd', h.after_rd),
      'matches', (select count(*) from public.rating_history e
                  where e.user_id = h.user_id and e.format = h.format
                    and e.kind = 'match' and e.id <= h.id))
    order by h.user_id), '[]'::jsonb)
  from public.rating_history h
  where h.match_id = p_match and h.kind = 'match'
$$;
revoke all on function private.rating_change(uuid) from public, anon, authenticated;

-- The Worker's write. p: { matchId, format, modelVersion, finishedAt,
--   players: [{ userId, outcome, version, rating, rd, sigma }] }
-- - calls for one match run one at a time (the match row is locked first),
--   so a retry overlapping a slow first call waits and then reports its
--   change instead of colliding on rating_history_once;
-- - a match not finished yet is refused with P0002, so the Worker retries;
-- - a payload that does not match the archived rated result (not rated, void,
--   other players or outcomes) is refused with 23514;
-- - a match already rated changes nothing and reports its change;
-- - a stale version raises 40001 and writes nothing: the Worker re-reads and
--   recomputes (two matches of one player finishing out of order both apply,
--   each against the then-current rating).
create function public.apply_rating(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid := (p ->> 'matchId')::uuid;
  v_format text := p ->> 'format';
  v_kind text;
  v_status text;
  -- When the match was played: inactivity counts from here, not from when
  -- a delayed rating happened to apply.
  v_at timestamptz := coalesce((p ->> 'finishedAt')::timestamptz, now());
  r jsonb;
  cur public.ratings;
begin
  select kind, status into v_kind, v_status
  from public.matches where id = v_match
  for update;
  if v_status is null or v_status = 'playing' then
    raise exception 'match % is not finished', v_match using errcode = 'P0002';
  end if;
  if v_kind <> 'hu-rated' or v_status <> 'finished'
     or v_format is distinct from 'hu-duplicate'
     or jsonb_array_length(p -> 'players') <> (
       select count(*) from public.match_players where match_id = v_match)
     or exists (
       select 1 from jsonb_array_elements(p -> 'players') x
       left join public.match_players mp
         on mp.match_id = v_match and mp.user_id = (x ->> 'userId')::uuid
       where mp.user_id is null or mp.outcome is distinct from x ->> 'outcome')
  then
    raise exception 'rating does not match the result of %', v_match
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.rating_history
    where match_id = v_match and kind = 'match'
  ) then
    return private.rating_change(v_match);
  end if;

  -- Rows are locked in user order, so two matches that share a player and
  -- are rated at once wait for each other instead of deadlocking (D2).
  for r in
    select value from jsonb_array_elements(p -> 'players')
    order by value ->> 'userId'
  loop
    insert into public.ratings (user_id, format)
    values ((r ->> 'userId')::uuid, v_format)
    on conflict do nothing;
    select * into cur from public.ratings
    where user_id = (r ->> 'userId')::uuid and format = v_format
    for update;
    if cur.version <> (r ->> 'version')::integer then
      raise exception 'stale rating version for %', cur.user_id
        using errcode = '40001';
    end if;
    insert into public.rating_history (
      user_id, format, kind, match_id, outcome,
      before_rating, before_rd, before_sigma,
      after_rating, after_rd, after_sigma, model_version)
    values (
      cur.user_id, v_format, 'match', v_match, r ->> 'outcome',
      cur.rating, cur.rd, cur.sigma,
      (r ->> 'rating')::float8, (r ->> 'rd')::float8, (r ->> 'sigma')::float8,
      p ->> 'modelVersion');
    update public.ratings
    set rating = (r ->> 'rating')::float8, rd = (r ->> 'rd')::float8,
        sigma = (r ->> 'sigma')::float8, matches = matches + 1,
        wins = wins + (r ->> 'outcome' = 'win')::int,
        draws = draws + (r ->> 'outcome' = 'draw')::int,
        -- An older match rated late never moves the last match backwards.
        last_match_at = greatest(coalesce(last_match_at, v_at), v_at),
        version = version + 1, updated_at = now()
    where user_id = cur.user_id and format = v_format;
  end loop;
  return private.rating_change(v_match);
end $$;
revoke all on function public.apply_rating(jsonb) from public, anon, authenticated;
grant execute on function public.apply_rating(jsonb) to service_role;

-- Abandonment of a rated match, counted once: record_match marks a seat
-- abandoned (forfeit, no-show, both gone) in the branch that finishes the
-- match, which runs once under the match row lock.
create function private.count_abandonment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.matches m
    where m.id = new.match_id and m.kind = 'hu-rated'
  ) then
    insert into public.ratings (user_id, format, abandoned)
    values (new.user_id, 'hu-duplicate', 1)
    on conflict (user_id, format) do update
      set abandoned = public.ratings.abandoned + 1, updated_at = now();
  end if;
  return null;
end $$;
revoke all on function private.count_abandonment() from public, anon, authenticated;
create trigger match_players_count_abandonment
  after update of abandoned on public.match_players
  for each row when (new.abandoned and not old.abandoned)
  execute function private.count_abandonment();

-- Rated abandonments archived before this migration.
insert into public.ratings (user_id, format, abandoned)
select mp.user_id, 'hu-duplicate', count(*)
from public.match_players mp
join public.matches m on m.id = mp.match_id
where m.kind = 'hu-rated' and mp.abandoned
group by mp.user_id
on conflict (user_id, format) do update set abandoned = excluded.abandoned;
