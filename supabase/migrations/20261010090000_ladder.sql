-- P1-14: the ladder, per format, all time and this month (R-16). Only
-- eligible players appear: not provisional (RD < 100 and at least 20 rated
-- matches, src/rating/rules.ts), a rated match in the last 30 days, and
-- abandonment under 10% of rated matches over the lifetime (R-13). Keyset
-- pagination on (rating desc, user_id), served by ratings_ladder. The DBA's
-- design and measurements: .10x/decisions/dba/phase1-schema.md D3 and D6,
-- and .10x/decisions/dba/ladder.md. Every table read here is public, so the
-- functions run with the caller's rights.

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
-- P1-18 adds "no active ladder removal". Trend is the rating change over 30 days,
-- looked up for the page's rows only.
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
        and h.created_at >= now() - interval '30 days'
      order by h.created_at
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

-- "This month" (R-16): current rating, players with a rated match this UTC
-- month, and matches, wins, draws and trend over the month. Same
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
           (array_agg(h.after_rating order by h.created_at desc))[1]
             - (array_agg(h.before_rating order by h.created_at))[1] as trend
    from public.rating_history h
    where h.format = p_format and h.kind = 'match'
      and h.created_at >= p_month::timestamp at time zone 'utc'
      and h.created_at < (p_month + interval '1 month')::timestamp at time zone 'utc'
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
