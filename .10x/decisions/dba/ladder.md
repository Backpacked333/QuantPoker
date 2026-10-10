# DBA — the ladder and the rating metrics (P1-14)

Last updated: 2026-10-10. Builds on `phase1-schema.md` D3 (ladder columns from counters on `ratings`) and D6 (monthly ladder computed per page).

## What shipped

`supabase/migrations/20261010090000_ladder.sql` is additive (functions only; the index `ratings_ladder` and `rating_history_month` came with P1-12's migration).

- **`public.ladder(format, after_rating, after_user, page)`** is all time.
  - It lists only eligible players: `rd < 100`, `matches >= 20`, `last_match_at` within 30 days, and `10 * abandoned < matches` (exactly 10% is out).
  - It orders by `(rating desc, user_id)` with a keyset cursor. The page size is capped at 100 whatever is asked.
  - Trend is the rating change over 30 days, looked up per row of the page only (`rating_history_user`).
- **`public.ladder_month(...)`** has the same eligibility and keyset. Matches, wins, draws and trend are over the UTC month, aggregated from `rating_history_month`.
- **`public.abandonment_rate(user)`** is the lifetime share, for the profile.
- **Rights:** all three are invoker-rights, `stable`, and pin `search_path`. Every table they read is public. No security definer is callable by browsers (`rls-matrix.test.ts`).
- **P1-18:** `supabase/proposed/phase1.sql` now holds only P1-18's `create or replace` of the two ladder functions, which add "no active ladder removal".

## Options considered

1. **Chosen: functions over the counters on `ratings` (D3), keyset on the `ratings_ladder` index.** One index walk per page, stopping at the page size; no snapshot to refresh.
2. **Offset pagination.** Rejected: deep pages rescan every row above them, and a rating change between two clicks repeats or skips a player. Keyset has neither problem (`ladder.test.ts › pages of 50 over 1,000 players have no gaps or repeats`).
3. **A materialized ladder refreshed on a schedule.** Rejected at these volumes (D10): stale data, another moving part, and nothing measured needs it.

## Evidence

Bench: `node supabase/bench/plans.ts <N>`, PGlite (Postgres 17). Plans carry over to hosted Postgres; absolute times do not.

| Query                                           | 10k matches (500 players) | 100k matches (5,000 players) | Plan at 100k                                                                              |
| ----------------------------------------------- | ------------------------: | ---------------------------: | ----------------------------------------------------------------------------------------- |
| Q4 ladder page 1 (function, with trend)         |                   1.67 ms |                      3.43 ms | function scan                                                                             |
| Q4b ladder page 2 (keyset)                      |                   1.12 ms |                      3.61 ms | function scan                                                                             |
| Q4e page 1 inlined, as shipped                  |                   0.21 ms |                      0.66 ms | Limit → Nested Loop → **Index Scan using ratings_ladder** → Index Scan using players_pkey |
| Q4c page 1 inlined, P1-18 (sanctions anti-join) |                   0.25 ms |                      0.76 ms | Limit → Nested Loop Anti Join → Nested Loop → Index Scan using ratings_ladder             |
| Q4d this month, page 1 (function)               |                   2.75 ms |                        16 ms | function scan                                                                             |
| Q4f this month inlined                          |                   0.59 ms |                      6.45 ms | Limit → Sort (top-N heapsort, 23 kB) → Hash Join on the month's aggregate                 |

- At 10k the planner sorts a hash join instead (500 ratings rows fit in one page); from 5,000 players it walks `ratings_ladder` in order and stops after 50.
- The month ladder at 100k is ≈ 5,500 rated matches a month, in line with D6's slope (12 ms there; 16 ms here with trend and accuracy). D6's trigger stands: materialize `ratings_month` once rated matches pass ≈ 20,000 a month or Q4d passes 50 ms in production.
- **Production, read-only (2026-10-10):** `EXPLAIN` of Q4e on hosted Postgres plans `Bitmap Index Scan on ratings_ladder` → Nested Loop → `players_pkey`. The table has 0 rows today, so this proves the query and index are valid there, not the plan at scale. Re-run once `ratings` passes ≈ 1,000 rows: expect the ordered `Index Scan using ratings_ladder` seen at 100k.
- 12/12 self-checks PASS at both scales, including "exactly 10% abandonment excludes" and "the ladder pages without gaps or repeats".

## The rating metrics (INSTRUMENT)

`supabase/metrics/rating-metrics.sql` is one read-only query; it writes nothing. It returns `(metric, value, sample, target, verdict)`, and the verdict reads `insufficient data (need 30)` until a metric's sample reaches 30.

| Metric              | Definition                                                                                                                           | Target |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| predictive validity | Among rated matches with a pre-match rating gap ≥ 150, the share the higher-rated player won (a draw is not a win).                  | ≥ 60%  |
| rating stability    | Median absolute rating change per match, for players who were not provisional before it (RD < 100 and ≥ 20 earlier rated matches).   | < 15   |
| accuracy validity   | Spearman correlation of rating and accuracy across non-provisional players (average ranks for ties; Pearson over ranks with `corr`). | > 0.4  |

- **Production (2026-10-10, read-only):** all three say "insufficient data (need 30)", with sample 0. There are no rated matches yet.
- **Simulated season** (`supabase/tests/season.test.ts`, PGlite scratch database, 44 s): 200 players with a hidden skill (1500 ± 250) played 5,000 rated matches over 60 days, paired near rating, with 8% draws. Each was rated the production way, Glicko-2 via `apply_rating` with compare-and-set. Five players stopped after day 20; five abandoned 15% of their matches.
  - The database matches the season played: every version, and every rating to 6 digits.
  - **All-time ladder:** 190 players, every one non-provisional. The 5 inactive and the 5 abandoners are absent. Spearman(true skill, ladder rating) = **0.975**.
  - **This month:** 190, a subset with the same rules.
  - **Metrics:** predictive validity **65.4%** (547 matches with a gap ≥ 150); rating stability **13.4** (6,013 changes); accuracy validity **0.860** (196 players; accuracy simulated as skill plus noise).
  - On the empty database first, all three are "insufficient data".
- Nothing is seeded into production; the season exists only in PGlite.

## Migration safety and rollback

- Functions only: no table rewrite, no lock beyond the catalog. It is safe to apply under traffic.
- Rollback is `drop function public.ladder, public.ladder_month, public.abandonment_rate`. Nothing else depends on them, and the client shows "The ladder could not be loaded" if they are missing.
