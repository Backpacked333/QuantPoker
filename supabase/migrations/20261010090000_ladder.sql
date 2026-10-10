-- P1-14: the ladder, per format, all time and this month (R-16). Only
-- eligible players appear: not provisional (RD < 100 and at least 20 rated
-- matches, src/rating/rules.ts), a rated match in the last 30 days, and
-- abandonment under 10% of rated matches over the lifetime (R-13). Keyset
-- pagination on (rating desc, user_id), served by ratings_ladder. The DBA's
-- design and measurements: .10x/decisions/dba/phase1-schema.md D3 and D6,
-- and .10x/decisions/dba/ladder.md. Every table read here is public, so the
-- functions run with the caller's rights.

-- When each rated match was played. rating_history.created_at is when its
-- rating was applied, which a retry can push past midnight at the end of a
-- month; "this month" must count the month the match was played in.
-- Adding a nullable column with a constant default rewrites nothing.
alter table public.rating_history
  add column played_at timestamptz not null default now();
-- Rows written before this migration: the match's finish time (rows of
-- other kinds keep when they were written). History is append-only, so the
-- one-time backfill steps around its trigger inside this transaction.
alter table public.rating_history disable trigger rating_history_append_only;
update public.rating_history h
set played_at = coalesce(
  (select m.finished_at from public.matches m where m.id = h.match_id),
  h.created_at);
alter table public.rating_history enable trigger rating_history_append_only;
-- The "this month" ladder reads one month of match rows by when they were
-- played (rating_history_month, by created_at, no longer serves it).
create index rating_history_played on public.rating_history (format, played_at)
  where kind = 'match';
-- A player's trend over the last 30 days of play (ladder()).
create index rating_history_user_played
  on public.rating_history (user_id, format, played_at);

-- apply_rating as shipped in *_ratings.sql, now also storing when the match
-- was played (the finish time the table sends) on each history row.
create or replace function public.apply_rating(p jsonb) returns jsonb
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
      after_rating, after_rd, after_sigma, model_version, played_at)
    values (
      cur.user_id, v_format, 'match', v_match, r ->> 'outcome',
      cur.rating, cur.rd, cur.sigma,
      (r ->> 'rating')::float8, (r ->> 'rd')::float8, (r ->> 'sigma')::float8,
      p ->> 'modelVersion', v_at);
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


-- Share of the player's rated matches they abandoned, over the lifetime
-- (R-13). For the profile; the ladder reads the same counters inline.
create function public.abandonment_rate(p_user uuid, p_format text default 'hu-duplicate')
returns real
language sql stable set search_path = '' as $$
  select coalesce((
    select r.abandoned::real / nullif(r.matches, 0)
    from public.ratings r
    where r.user_id = p_user and r.format = p_format), 0)::real
$$;

-- All-time ladder: eligible players by rating, keyset on (rating desc,
-- user_id). Eligible: not provisional (rd < 100 and ≥ 20 matches), a rated
-- match in the last 30 days, and abandonment < 10% (exactly 10% is out);
-- P1-18 adds "no active ladder removal". Trend is the rating change over
-- matches played in the last 30 days, looked up for the page's rows only.
create function public.ladder(
  p_format text, p_after_rating double precision default null,
  p_after_user uuid default null, p_page integer default 50)
returns table (user_id uuid, username text, rating double precision,
               rd double precision, matches integer, wins integer,
               draws integer, accuracy real, trend double precision)
language sql stable set search_path = '' as $$
  select l.*, l.rating - (
      select h.before_rating from public.rating_history h
      where h.user_id = l.user_id and h.format = p_format
        and h.played_at >= now() - interval '30 days'
      order by h.played_at, h.id
      limit 1) as trend
  from (
    select r.user_id, p.username, r.rating, r.rd, r.matches, r.wins, r.draws,
           a.accuracy
    from public.ratings r
    join public.players p on p.user_id = r.user_id
    left join public.accuracy a on a.user_id = r.user_id and a.format = r.format
    where r.format = p_format
      and r.rd < 100 and r.matches >= 20
      and r.last_match_at >= now() - interval '30 days'
      and 10 * r.abandoned < r.matches
      and (p_after_rating is null
           or r.rating < p_after_rating
           or (r.rating = p_after_rating and r.user_id > p_after_user))
    order by r.rating desc, r.user_id
    limit least(p_page, 100)
  ) l
  order by l.rating desc, l.user_id
$$;

-- "This month" (R-16): current rating, players with a rated match played
-- this UTC month, and matches, wins, draws and trend over the month. Same
-- eligibility and keyset as ladder().
create function public.ladder_month(
  p_format text, p_after_rating double precision default null,
  p_after_user uuid default null, p_page integer default 50,
  p_month date default date_trunc('month', now() at time zone 'utc')::date)
returns table (user_id uuid, username text, rating double precision,
               rd double precision, matches integer, wins integer,
               draws integer, accuracy real, trend double precision)
language sql stable set search_path = '' as $$
  with month as (
    select h.user_id, count(*)::int as matches,
           count(*) filter (where h.outcome = 'win')::int as wins,
           count(*) filter (where h.outcome = 'draw')::int as draws,
           (array_agg(h.after_rating order by h.played_at desc, h.id desc))[1]
             - (array_agg(h.before_rating order by h.played_at, h.id))[1] as trend
    from public.rating_history h
    where h.format = p_format and h.kind = 'match'
      -- The UTC month containing p_month, whichever day of it is passed.
      and h.played_at >= date_trunc('month', p_month::timestamp) at time zone 'utc'
      and h.played_at < (date_trunc('month', p_month::timestamp)
                         + interval '1 month') at time zone 'utc'
    group by h.user_id)
  select r.user_id, p.username, r.rating, r.rd, mo.matches, mo.wins, mo.draws,
         a.accuracy, mo.trend
  from month mo
  join public.ratings r on r.user_id = mo.user_id and r.format = p_format
  join public.players p on p.user_id = r.user_id
  left join public.accuracy a on a.user_id = r.user_id and a.format = r.format
  where r.rd < 100 and r.matches >= 20
    and r.last_match_at >= now() - interval '30 days'
    and 10 * r.abandoned < r.matches
    and (p_after_rating is null
         or r.rating < p_after_rating
         or (r.rating = p_after_rating and r.user_id > p_after_user))
  order by r.rating desc, r.user_id
  limit least(p_page, 100)
$$;
