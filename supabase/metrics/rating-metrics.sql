-- The rating's success metrics (rating-and-leaderboard.md §Success criteria),
-- read-only. Run it in the Supabase SQL editor, or with psql against any
-- database that has the migrations; it writes nothing. Each metric says
-- "insufficient data" until its sample reaches the minimum below, rather
-- than reporting a number nobody should trust.
--
--   predictive validity  the higher-rated player (before the match) wins,
--                        among rated matches with a gap of at least 150;
--                        a draw counts as not a win. Target at least 60%.
--   rating stability     median absolute rating change per match for players
--                        who were not provisional before it (RD < 100 and at
--                        least 20 earlier rated matches). Target under 15.
--   accuracy validity    Spearman correlation between rating and accuracy
--                        across non-provisional players (average ranks for
--                        ties). Target above 0.4.
--
-- supabase/tests/season.test.ts runs this file on an empty database and on a
-- simulated 200-player, 5,000-match season.
with
minimums (metric, needed) as (
  values ('predictive validity', 30), ('rating stability', 30),
         ('accuracy validity', 30)
),
history as (
  select h.user_id, h.match_id, h.outcome, h.before_rating, h.before_rd,
         h.after_rating,
         count(*) over (partition by h.user_id, h.format order by h.id
                        rows between unbounded preceding and 1 preceding)
           as matches_before
  from public.rating_history h
  where h.kind = 'match' and h.format = 'hu-duplicate'
),
pairs as (
  select a.before_rating as ra, b.before_rating as rb, a.outcome as oa
  from history a
  join history b on b.match_id = a.match_id and b.user_id > a.user_id
),
gaps as (
  select count(*) as n,
         count(*) filter (
           where (ra > rb and oa = 'win') or (rb > ra and oa = 'loss')) as won
  from pairs
  where abs(ra - rb) >= 150
),
changes as (
  select abs(after_rating - before_rating) as change
  from history
  where before_rd < 100 and matches_before >= 20
),
established as (
  select r.rating, a.accuracy
  from public.ratings r
  join public.accuracy a on a.user_id = r.user_id and a.format = r.format
  where r.format = 'hu-duplicate' and r.rd < 100 and r.matches >= 20
    and a.accuracy is not null
),
ranked as (
  select (rank() over (order by rating) + count(*) over () + 1
            - rank() over (order by rating desc)) / 2.0 as by_rating,
         (rank() over (order by accuracy) + count(*) over () + 1
            - rank() over (order by accuracy desc)) / 2.0 as by_accuracy
  from established
),
results (metric, value, sample, target, meets) as (
  select 'predictive validity',
         round(100.0 * won / nullif(n, 0), 1), n, '>= 60%',
         100.0 * won / nullif(n, 0) >= 60
  from gaps
  union all
  select 'rating stability',
         round((select percentile_cont(0.5) within group (order by change)
                from changes)::numeric, 1),
         (select count(*) from changes), '< 15',
         (select percentile_cont(0.5) within group (order by change)
          from changes) < 15
  union all
  select 'accuracy validity',
         round(corr(by_rating, by_accuracy)::numeric, 3),
         count(*), '> 0.4', corr(by_rating, by_accuracy) > 0.4
  from ranked
)
select r.metric,
       case when r.sample < m.needed then null else r.value end as value,
       r.sample,
       r.target,
       case when r.sample < m.needed then 'insufficient data (need ' || m.needed || ')'
            when r.meets then 'meets target'
            else 'misses target' end as verdict
from results r
join minimums m using (metric)
order by r.metric;
