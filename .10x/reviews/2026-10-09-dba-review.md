# DBA review: Phase 0 schema and the Phase 1 design (2026-10-09)

Role: DBA (Prompt 4), run as the gate before the Step 7 deploy. Branch `claude/sharp-cannon-4150j6` (PR #9).

Scope:

- the eight Phase 0 migrations plus `learning_cloud`;
- the queries Phase 1 will run;
- retry safety, the growth model and the access matrix;
- the Phase 1 schema, in `.10x/decisions/dba/phase1-schema.md` and `supabase/proposed/phase1.sql`.

**Production writes, with your go-ahead ("you need to do that stuff"):** two additive migrations applied through the Supabase connector on 2026-10-09 at 21:39 UTC, `20261009213919 verify_hand` and `20261009213923 hands_created_index`. Before applying, production held 0 hands, 0 matches and 0 incidents, and none of the objects existed.

Everything else in production was read-only:

- advisors;
- `list_migrations`;
- counts;
- `pg_roles`;
- one `EXPLAIN` as `anon` inside a rolled-back transaction.

## Executive summary

1. **One real Phase 0 defect, fixed and live (DB-1, Medium).** `/api/stats` counted `hands` by `created_at` with no index, so every count read the whole table. The endpoint is public, and `anon` has a 3 s statement timeout, so the stats would have started failing as the archive grew.
   - Fixed with `hands_created`, red then green.
   - The count is now an index-only scan: 0.03 ms at 1M hands, against 78 ms at 100k before (linear).
   - The production plan uses the index (VERIFIED).
2. **Phase 0 archive writes are retry-safe, now with evidence for every case Prompt 4 names.**
   - Repeat, failure part-way and out-of-order arrival: `supabase/tests/retry.test.ts`, 5 tests, mutation-checked.
   - Two sessions at once on a real PostgreSQL 16: `supabase/bench/concurrency.ts`, 8/8.
   - Duplicates are structurally impossible, by primary keys, `on conflict`, row locks and unique indexes; not merely unlikely.
3. **The Phase 1 schema is designed, measured at 10k, 100k and 1M, and self-checked.**
   - My own first draft had eight defects that would have shipped (DB-5 to DB-14). The serious one: no access rules on six new tables, so anyone with the publishable key could have written ratings.
   - All are fixed in the proposal and covered by 12 self-checks and 8 concurrency checks, each new rule mutation-checked.
4. **Growth is cheap.**
   - Size per hand: 4.9 kB today, 6.5 kB with Phase 1 grades.
   - The Pro plan's 8 GB disk lasts about 3 years at 1k hands/day and about 9 months at 4k/day. After that disk costs $0.125 per GB-month: roughly $1.20 more per month for each further year at 4k/day.
   - Disk is not the constraint; unindexed public reads were, and DB-1 removes the only one.
5. **No Critical or High is open.** Two questions are for you (Q-DBA-1, grade visibility vs the Terms; Q-DBA-2, `hands_private` retention), and one Low is a new ticket (S7-13). None blocks the deploy.

## Findings

| ID    | Severity                            | Evidence                                                                                                                                                                                                                                                                                                                                                                  | Fix                                                                                                                                                                                                                                                                                                                              | Status                                                                                                                                                                |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB-1  | Medium                              | `worker/src/stats.ts` counts `hands` per UTC day (`created_at` range, optionally `verified`) as `anon` with `count=exact`; 14 counts per isolate every 5 min. No index on `created_at`: Seq Scan, 78 ms at 100k hands in PGlite and linear. Production `anon` has `statement_timeout=3s` (VERIFIED, `pg_roles`), so the endpoint would return 503 once a count passed 3 s | `hands_created on hands (created_at) include (verified)`. Test: `migrations.test.ts › are counted per UTC day from an index, not by reading every hand` explains the stats query as `anon` and fails on a Seq Scan (red without the migration: "Seq Scan on hands")                                                              | **Fixed** `5c22986`; **applied** `20261009213923`. Index Only Scan, 0.03 ms at 1M. Production `EXPLAIN` as `anon`: Bitmap Index Scan on `hands_created` (empty table) |
| DB-2  | Low (test gap)                      | Retry tests covered only a plain repeat. A write that fails part-way must leave nothing behind: if the hand row survived, the retry would stop at "already recorded" and chips would never move                                                                                                                                                                           | `supabase/tests/retry.test.ts`: hand fails part-way, hand before its match, match start fails part-way, match finish fails part-way, start after finish. Mutation: swallowing the hole-card failure turns the first test red                                                                                                     | **Fixed** `c19387c` (no code defect: each call is one transaction)                                                                                                    |
| DB-3  | Info                                | PGlite has one connection, so no PGlite test can race two transactions                                                                                                                                                                                                                                                                                                    | `supabase/bench/concurrency.ts` starts a throwaway PostgreSQL 16 and races two sessions per write. The Worker's outbox retries every non-2xx with backoff (`worker/src/table.ts` `flushOutbox`), so a lost create race (409) is retried and lands                                                                                | **Verified** 8/8                                                                                                                                                      |
| DB-4  | Low                                 | A call that can never succeed is retried every 5 min forever (`outboxBackoff` caps at 300 s, `worker/src/deadlines.ts:68`). Example: a seat whose account was deleted mid-match makes the `hand_holes` foreign key fail. The call also holds back that match's later archive calls, because `flushOutbox` stops at the first failure                                      | New ticket **S7-13**: after N attempts (proposal: 12, ≈ 1 h) that failed with a Postgres data or constraint error (class 22 or 23), write a `record_incident` with the rpc and code, park the call, and let the flush continue. Never park on 401/403 or 5xx: a missing key (U-4) or an outage must replay everything once fixed | Open (ticket)                                                                                                                                                         |
| DB-5  | Medium (Phase 1 design)             | Profile and history pages joined `matches` to sort by `finished_at`: O(player's matches). Q1 121 ms and Q2 21 ms for the heaviest player at 1M                                                                                                                                                                                                                            | `match_players.finished_at` (a copy, written by `record_match` v4) plus `match_players_history`                                                                                                                                                                                                                                  | **In proposal**: Q1c 0.31 ms, Q2b 0.06 ms at 1M                                                                                                                       |
| DB-6  | Medium (Phase 1 design)             | First draft: the ladder computed each candidate's abandonment rate from `match_players` (22 ms page 1 at 100k, 43 ms at 1M), over a 30-day window that contradicted R-13 (lifetime)                                                                                                                                                                                       | Lifetime counters on `ratings` (`matches`, `abandoned`), maintained by `apply_rating` exactly once, plus no-shows from `record_match` v4 (R-14). Rule `10 * abandoned < matches`                                                                                                                                                 | **In proposal**: Q4 2.27 ms, Q6 0.22 ms at 1M. Self-check "exactly 10% excludes" (mutation: `<=` turns it red)                                                        |
| DB-7  | High (Phase 1 draft, never applied) | First draft: six new public tables with no RLS and no grants. Under Supabase's default privileges, `anon` and `authenticated` get full access to new public tables: anyone with the publishable key could write `ratings`                                                                                                                                                 | An Access section mirroring Phase 0: RLS on and grants revoked for every table, then explicit reads. Writes go through service-role functions, except a report                                                                                                                                                                   | **Fixed in proposal**. Self-check "clients … write nothing else" (14 writes × 2 roles refused). Mutation: dropping the `apply_rating` revoke turns it red             |
| DB-8  | High (Phase 1 draft, never applied) | Grades are computed from hole cards. Readable mid-match (draft: public; later draft: owner-only, which contradicted R-15), they are analysis data during a live rated match, and in duplicate format segment 2 replays segment 1's decks                                                                                                                                  | Policy `hand_grades_after_match` (R-15): nobody while the match is playing, everyone after. `player_accuracy` filters on status itself, so service and clients agree                                                                                                                                                             | **Fixed in proposal**. Self-check on grades; mutation: dropping the status clause turns it red. See Q-DBA-1                                                           |
| DB-9  | Medium (Phase 1 design)             | The ladder shows accuracy and win rate per row. Per-row `player_accuracy` costs ≈ 4–5 ms (Q9), ≈ 250 ms per 50-row page                                                                                                                                                                                                                                                   | Stored aggregates: `ratings.wins/draws` (from `apply_rating`), `ratings.accuracy/graded` (from `private.refresh_accuracy` at match end and for late grades)                                                                                                                                                                      | **In proposal**. Q9 is now paid once per player per match, not per view                                                                                               |
| DB-10 | Low (Phase 1 design)                | `apply_rating` locked players in payload order. Two matches sharing two players, rated at once in opposite orders, could deadlock                                                                                                                                                                                                                                         | Lock in `user_id` order                                                                                                                                                                                                                                                                                                          | **In proposal**. Concurrency check 4 (opposite orders: one waits, is refused stale, recomputes, applies; no lost update)                                              |
| DB-11 | Low (Phase 1 design)                | The 10-per-day report cap counts in a BEFORE trigger; two reports at once at 9 both see 9                                                                                                                                                                                                                                                                                 | `pg_advisory_xact_lock` per reporter in the trigger                                                                                                                                                                                                                                                                              | **In proposal**. Concurrency check 6; without the lock: 11 rows                                                                                                       |
| DB-12 | Low (Phase 1 design)                | Replacing `matches_kind_check` with a plain `ADD CONSTRAINT CHECK` scans `matches` under an exclusive lock                                                                                                                                                                                                                                                                | `NOT VALID` then `VALIDATE CONSTRAINT`                                                                                                                                                                                                                                                                                           | **In proposal**                                                                                                                                                       |
| DB-13 | Low (Phase 1 design)                | Draft `appeal_sanction` was a security definer executable by `authenticated`, breaking Phase 0's rule (`rls-matrix.test.ts › keep every security definer away from browsers`)                                                                                                                                                                                             | Invoker RPC over `grant update (appeal_text)` and policy `sanctions_appeal`; trigger stamps `appeal_at`                                                                                                                                                                                                                          | **In proposal**. Self-check of the function rule over the proposal                                                                                                    |
| DB-14 | Info (Phase 1 design)               | `reports.reported_id` (a foreign key and the moderation lookup) had no index                                                                                                                                                                                                                                                                                              | `reports_reported (reported_id, created_at desc)`                                                                                                                                                                                                                                                                                | **In proposal**                                                                                                                                                       |
| DB-15 | Info                                | SQL functions with `SET search_path` are never inlined ("Function Scan on ladder")                                                                                                                                                                                                                                                                                        | None needed: the plan inside is the indexed walk (Q4c); the function boundary costs ≈ 1 ms                                                                                                                                                                                                                                       | Accepted                                                                                                                                                              |
| DB-16 | Info                                | `ladder_month` aggregates one month of history per page: Q4d 12 ms at 100k (≈ 5,500 rated matches a month), 140 ms at 1M; linear in monthly volume. The 4k hands/day model is ≈ 3,000 a month                                                                                                                                                                             | Materialize a monthly counter (`ratings_month`, upserted by `apply_rating`) when rated matches per month pass ≈ 20,000 or Q4d passes 50 ms in production                                                                                                                                                                         | Accepted with a trigger                                                                                                                                               |

## Advisors (production, 2026-10-09 21:40 UTC, after both migrations)

| Advisor     | Item                                                                                                                         | Triage                                                                                                                                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security    | INFO `rls_enabled_no_policy`: `private.coach_usage`, `public.hands_private`, `public.incidents`                              | **Accepted, intended.** Service-role-only tables: RLS on with no policy means no client reads or writes. `rls-matrix.test.ts` proves every cell denied for anon/self/other                                                                                                                                 |
| Security    | WARN `auth_leaked_password_protection`                                                                                       | **Real, yours (SR-13 / U-8 c).** Dashboard: Authentication → enable leaked-password protection, or turn off password sign-in for the email provider. Not reachable from this session                                                                                                                       |
| Performance | INFO `unused_index` × 5: `hand_results_recent`, `matches_recent`, `match_players_user`, `abandonments_user`, `hands_created` | **False positive for now (no traffic).** Each serves a query: `hands_created` → `/api/stats` (DB-1); `match_players_user` → Q3 and profile joins; `abandonments_user`, `matches_recent` → Phase 1 profile and audit; `hand_results_recent` → the learning app's history. Re-check after a month of traffic |
| Performance | INFO `auth_db_connections_absolute` (Auth capped at 10 connections)                                                          | **Accepted.** Matters only when the compute size grows; switch Auth to a percentage then (dashboard, at the upgrade)                                                                                                                                                                                       |

## Plans (PGlite, medians of 3 × `EXPLAIN ANALYZE`)

PGlite is Postgres 17 compiled to WebAssembly: same planner, one connection, in memory. Use it to rank plans and see growth; hosted Postgres runs the same plans faster. Generated data:

- players: 1 per 20 matches;
- match frequency: skewed, so the heaviest player has ≈ 0.5–1.5% of all matches;
- 70% rated; 95% finished, 3% void, 2% playing;
- 20 hands for each of 1 in 20 matches;
- 1 grade per hand;
- ratings for every player.

The 1M run stores 1-byte `leaves`, because 1M realistic rows (≈ 4 GB) do not fit in WebAssembly memory; this changes row width only. Reproduce with `node supabase/bench/plans.ts 10000 100000 1000000`.

| Query                                                                           | 100k | 1M   | Plan at 1M                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 Profile: last 20 matches, join on matches (heaviest player)                  | 44   | 121  | Limit → Sort → Sort Key: m.finished_at DESC NULLS LAST → Sort Method: top-N heapsort Memory: 21kB → Hash Join → Hash Cond: (o.user_id = op.user_id)                                                           |
| Q1b Profile: last 20 matches, join on matches (typical player)                  | 0.45 | 0.49 | Limit → Sort → Sort Key: m.finished_at DESC NULLS LAST → Sort Method: quicksort Memory: 21kB → Nested Loop → Nested Loop                                                                                      |
| Q1c Profile: last 20 matches from match_players.finished_at (heaviest)          | 0.97 | 0.31 | Nested Loop → Nested Loop → Join Filter: (o.user_id <> match_players.user_id) → Nested Loop → Limit → Index Scan using match_players_history on match_players                                                 |
| Q2 Match history, next page (keyset on finished_at)                             | 58   | 21   | Limit → Sort → Sort Key: m.finished_at DESC → Sort Method: top-N heapsort Memory: 19kB → Nested Loop → Bitmap Heap Scan on match_players mp                                                                   |
| Q2b Match history, next page from match_players.finished_at (heaviest)          | 0.07 | 0.06 | Limit → Index Scan using match_players_history on match_players mp                                                                                                                                            |
| Q3 Same pair, rated pairings today (≤ 2/day rule)                               | 0.22 | 0.15 | Aggregate → Nested Loop → Merge Join → Index Only Scan using match_players_user on match_players a → Index Only Scan using match_players_user on match_players b → Index Scan using matches_pkey on matches m |
| Q4 Ladder page 1 (eligibility filters)                                          | 1.87 | 2.27 | Function Scan on ladder                                                                                                                                                                                       |
| Q4b Ladder page 2 (keyset)                                                      | 2.50 | 3.00 | Function Scan on ladder                                                                                                                                                                                       |
| Q4c Ladder page 1 inlined (the plan inside ladder())                            | 0.97 | 0.91 | Limit → Nested Loop Anti Join → Join Filter: (s.user_id = r.user_id) → Nested Loop → Index Scan using ratings_ladder on ratings r → Index Scan using players_pkey on players p                                |
| Q4d Ladder this month, page 1 (R-16)                                            | 12   | 140  | Function Scan on ladder_month                                                                                                                                                                                 |
| Q5 Hands of a match, in order                                                   | 0.10 | 0.05 | Index Scan using hands_match_id_hand_no_key on hands                                                                                                                                                          |
| Q6 Abandonment rate, lifetime, from the counters (heaviest player)              | 0.22 | 0.22 | (one call; PK lookups)                                                                                                                                                                                        |
| Q6b Abandonment rate over 30 days, the shape Prompt 4 lists (heaviest player)   | 0.71 | 2.12 | Aggregate → Nested Loop → Bitmap Heap Scan on match_players mp → Bitmap Index Scan on match_players_history → Index Scan using matches_pkey on matches m                                                      |
| Q7 Idempotency: record_hand retry lookup                                        | 0.13 | 0.13 | Index Scan using hands_pkey on hands hands_1                                                                                                                                                                  |
| Q7b Idempotency: record_match lock                                              | 0.05 | 0.04 | Index Scan using matches_pkey on matches                                                                                                                                                                      |
| Q8 /api/stats: hands archived one UTC day                                       | 0.03 | 0.03 | Aggregate → Index Only Scan using hands_created on hands                                                                                                                                                      |
| Q8b /api/stats: verified hands one UTC day                                      | 0.04 | 0.03 | Aggregate → Index Only Scan using hands_created on hands                                                                                                                                                      |
| Q9 Accuracy recompute: latest 500 graded decisions (at match end, not per view) | 4.17 | 3.91 | Function Scan on player_accuracy                                                                                                                                                                              |
| Q9b Accuracy inlined (the plan inside player_accuracy())                        | 3.36 | 2.89 | Aggregate → Limit → Nested Loop → Nested Loop → Index Scan using hand_grades_user on hand_grades g → Index Scan using hands_pkey on hands h                                                                   |
| Q10 Rating graph: a player history                                              | 0.29 | 0.35 | Limit → Index Scan using rating_history_user on rating_history                                                                                                                                                |
| Q11 Own hole cards for a hand                                                   | 0.03 | 0.06 | Index Scan using hand_holes_pkey on hand_holes                                                                                                                                                                |
| Q12 audit_hand (verify consumer)                                                | 0.33 | 0.32 | (one call; PK lookups)                                                                                                                                                                                        |

Before the proposal's changes (first full runs, same generator):

| Query                                  | 100k | 1M                          |
| -------------------------------------- | ---- | --------------------------- |
| Q1 profile via `matches` (heaviest)    | 36   | 142                         |
| Q2 history via `matches` (heaviest)    | 49   | 26                          |
| Q4 ladder page 1, per-candidate rate   | 22   | 43                          |
| Q6 abandonment, 30-day join (heaviest) | 16   | 32                          |
| Q8 `/api/stats` count, no index        | 78   | n/a (index applied by then) |

## Retry safety

Columns:

- **Repeat**, **Part-way failure** and **Out of order**: VERIFIED in PGlite (`migrations.test.ts`, `retry.test.ts`, `verify.test.ts`).
- **Two at once**: VERIFIED on PostgreSQL 16 (`concurrency.ts`).

| Call                       | Repeat                       | Part-way failure                                         | Out of order                                               | Two at once                                                                                            | Why duplicates are impossible                                                                                       |
| -------------------------- | ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `record_hand`              | No-op                        | Nothing survives; the retry applies chips once           | Before its match: refused whole (foreign key), lands after | Second waits on the first's insert, then does nothing (waited 1.2 s; 1 hand, 2 hole rows, nets 40/−40) | `hands_pkey` + `on conflict (id) do nothing` + `if not found then return` before any other write                    |
| `record_match` (start)     | No-op                        | Nothing survives (seat foreign key); the retry creates   | After the finish: no-op                                    | Second fails whole with 23505 (`matches_pkey`); its retry succeeds; 1 match, 2 seats                   | `matches_pkey`; `match_players` primary key                                                                         |
| `record_match` (finish)    | No-op                        | Stays `playing`; the retry finishes with one abandonment | Finish before start: creates and finishes                  | Second waits on `FOR UPDATE`, reads `finished`, returns (1 abandonment)                                | The abandonment insert is reached only from `playing`, under the row lock, in the transaction that leaves `playing` |
| `verify_hand`              | No-op (`where not verified`) | Single statement                                         | Any order                                                  | Row lock; second updates 0 rows                                                                        | Idempotent update                                                                                                   |
| `record_incident`          | No-op                        | Single statement                                         | Any order                                                  | Unique index wait, then `do nothing`                                                                   | `incidents_once` unique nulls not distinct + `on conflict do nothing`                                               |
| `apply_rating` (proposed)  | No-op                        | Single transaction                                       | Stale version → 40001, recompute                           | One applies; the other is refused stale and writes nothing; recomputed, it applies                     | `rating_history_once` + version CAS + `user_id` lock order                                                          |
| `record_grades` (proposed) | No-op                        | Single statement                                         | Before the match ends: stored, hidden                      | One row per decision                                                                                   | `hand_grades` primary key + `on conflict do nothing`                                                                |
| Report insert (proposed)   | Refused (one per match)      | Single statement                                         | n/a                                                        | At 9 of 10: one lands, one refused                                                                     | `unique (match_id, reporter_id)`; cap serialized by advisory lock                                                   |

## Access matrix

- **Phase 0: complete and enforced.**
  - `supabase/tests/rls-matrix.test.ts` holds every table in `public` and `private` × {anon, self, other, service} × {select, insert, update, delete}.
  - It asserts that the table list equals the set of tables the migrations create, so a new table without matrix rows fails CI.
  - It asserts that every function pins `search_path` and that no security definer is executable by `anon` or `authenticated`.
  - `verify.test.ts` covers the three verify functions.
  - The new migration adds an index only.
- **Production** agrees for the new functions (VERIFIED): `audit_hand`, `verify_hand` and `record_incident` are executable by `service_role` only and run as invoker.
- **Phase 1: specified in the proposal's Access section and self-checked.**
  - 12 checks;
  - reports abuse: duplicate, unfinished match, outsider, self, spoofed reporter, anon, 11th in a day, reported player reading;
  - sanctions: public kind and private reason, own appeal once, no client writes;
  - grades: nobody mid-match, everyone after;
  - no client writes to ratings, history, grades or reports.
  - Each Phase 1 migration adds its rows to the matrix test (forced by its completeness check).

## Growth model

Bytes per hand from 40 real hands (`supabase/bench/payloads.json`, captured from `wrangler dev`), replicated to 10k hands with `record_match`/`record_hand`, then `VACUUM ANALYZE`. Sizes are `pg_total_relation_size`, which includes indexes and TOAST. `leaves` is 52 SHA-256 leaves, 1,664 B and incompressible.

| Table                                                                                | Bytes per hand                                |
| ------------------------------------------------------------------------------------ | --------------------------------------------- |
| `hands` (row ≈ 3.1 kB: `leaves` 1,664, `record` 1,020, `reveal` 284; plus 3 indexes) | 3,883                                         |
| `hand_holes` (2 rows)                                                                | 456                                           |
| `hands_private` (deck, secret, holes)                                                | 397                                           |
| `matches` + `match_players` (8 hands per captured match)                             | 130                                           |
| **Phase 0 total**                                                                    | **4,866** (4,469 without `hands_private`)     |
| `hand_grades` (Phase 1: 245 B per decision × 6.55 decisions)                         | 1,603                                         |
| `ratings` + `rating_history` (2 rows per 40-hand match)                              | ≈ 12                                          |
| **Phase 1 total**                                                                    | **≈ 6,480** (≈ 6,080 without `hands_private`) |

| Volume                   | Per day | Per year (Phase 1) | Database reaches ≈ 7 GB                                           | Cost after the included 8 GB                    |
| ------------------------ | ------- | ------------------ | ----------------------------------------------------------------- | ----------------------------------------------- |
| 1k hands/day (ADR model) | 6.5 MB  | 2.4 GB             | ≈ 3 years                                                         | $0.125/GB-month: ≈ $0.30/month per further year |
| 4k hands/day             | 26 MB   | 9.5 GB             | ≈ 9 months (≈ July 2027 if Phase 1 opens this month at that rate) | ≈ $1.20/month per further year                  |

Sources and labels:

- Plan and price: the org is on Pro (VERIFIED, `get_organization`). Pro includes 8 GB of gp3 disk per project, then $0.125 per GB-month (VERIFIED, Supabase docs "Manage Disk size usage").
- The ≈ 7 GB budget leaves ≈ 1 GB of the disk for WAL and system files (INFERRED). The database is 12 MB today.

What bites first is not disk:

- the `anon` statement timeout (3 s) on any unindexed public read (DB-1 removes the only one);
- compute size (`max_connections` 60, `shared_buffers` 224 MB).

Both Phase 0 and the Phase 1 design keep every public read on an index (table above).

**`hands_private` retention (Q-DBA-2, a proposal that needs your OK).**

- What it holds: the full deck order, the per-hand secret and both seats' hole cards. That is every folded card, which no client ever reads.
- What it costs to keep: 397 B per hand, ≈ 8% of the archive, ≈ $0.07/month per year at 4k hands/day. Retention is data minimization, not a saving.
- Who needs it after the hand:
  - the verify consumer, for minutes;
  - incident and report investigation (P1-17 SLA 7 days, plus one appeal).
  - Re-grading with a new model does not need it: each seat's own cards are in `hand_holes`. The public proof does not either: `leaves` are stored.
- Proposal: a daily job (pg_cron on Supabase, no extra cost) deletes `hands_private` rows 90 days after the hand when it is verified and its match has no open report or incident.
- Rollback: none for deleted rows (by design); stop the job.
- It ships only with your OK; nothing deletes data today.

## Production log

| Time (UTC, ≈) | Call                                                                                           | Effect                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 20:32         | `get_advisors` × 2                                                                             | Read                                                                                                                            |
| 20:36         | `get_project`, `get_organization`, `list_migrations`                                           | Read (Pro plan, PG 17.11, 7 migrations)                                                                                         |
| 21:37         | `execute_sql` `pg_roles`                                                                       | Read (`anon` timeout 3 s)                                                                                                       |
| 21:39         | `execute_sql` counts and object checks                                                         | Read (0 hands, matches, incidents; no verify objects)                                                                           |
| 21:39         | `apply_migration verify_hand`                                                                  | **Write (DDL)**: `incidents_once`; `audit_hand`, `verify_hand`, `record_incident` (service role only)                           |
| 21:39         | `apply_migration hands_created_index`                                                          | **Write (DDL)**: index `hands_created`                                                                                          |
| 21:40         | `list_migrations`, `execute_sql` grants, `EXPLAIN` as `anon` (rolled back), `get_advisors` × 2 | Read. Repo files renamed to the recorded versions (`f37036a`) so the repo, production and the Supabase GitHub integration agree |

Rollback:

- **`hands_created`:** run `drop index public.hands_created;`, which is instant; `/api/stats` returns to full scans.
- **`verify_hand`:**
  1. roll back the Worker first, because its verify consumer calls these functions;
  2. drop the three functions and `incidents_once`.
- Either rollback ships as a new migration. Never edit an applied one.
