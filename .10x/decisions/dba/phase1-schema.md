# phase1-schema — DBA log

## 2026-10-09 — Phase 1 schema, designed and measured (not applied)

Prompt 4, item 6. The proposed SQL is `supabase/proposed/phase1.sql`. It is **not a migration**: nothing in it is applied anywhere. Each section names the ticket that ships it as its own timestamped migration with its PGlite test. `supabase/bench/plans.ts` loads it on top of the real migrations, times every Phase 1 query at 10k, 100k and 1M generated matches, and self-checks every integrity and access rule. `supabase/bench/concurrency.ts` races two real Postgres sessions on each write. Findings are in `.10x/reviews/2026-10-09-dba-review.md` (DB-n ids below).

Decided inputs, which this log does not reopen:

- **PM specs:** rating-and-leaderboard, heads-up-duplicate-ladder, integrity-and-trust.
- **ADR:** §Data model.
- **Tickets:** P1-01 to P1-18, and the resolutions:
  - R-13: abandonment over the lifetime;
  - R-14: a rated no-show is void, unrated, but counted;
  - R-15: grades visible to nobody mid-match and to everyone after;
  - R-16: the "this month" ladder;
  - R-23: grade rated hands only.
- **Prompts 6–9 in `.10x/prompts.md`** (as of `a71a0bb`).

### Data model and access patterns

| Screen or job (ticket)                    | Query (bench id)                                           | Hot?                                           | Reads                                                                |
| ----------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| Profile: last 20 matches (P1-15)          | Q1c                                                        | Every profile view                             | `match_players_history`, then 20 × (matches, opponent seat, players) |
| Match history, next page (P1-15)          | Q2b                                                        | Paging                                         | `match_players_history`                                              |
| Rated pairing rule ≤ 2/day (P1-13, audit) | Q3                                                         | Lobby keeps its own counter; SQL is for audits | `match_players_user`                                                 |
| Ladder, all time (P1-14)                  | Q4, Q4b (page 2), Q4c (inner plan)                         | Public page                                    | `ratings_ladder` walk, stops at 50 eligible                          |
| Ladder, this month (R-16)                 | Q4d                                                        | Public page                                    | `rating_history_month` for one month, then `ratings`                 |
| Review a match (P1-05)                    | Q5                                                         | Per review                                     | `hands_match_id_hand_no_key`                                         |
| Abandonment rate (profile, ladder rule)   | Q6 (lifetime counters), Q6b (30-day shape Prompt 4 listed) | Per profile                                    | `ratings` PK; Q6b `match_players_history`                            |
| Archive retries (outbox, queue)           | Q7, Q7b                                                    | Every write                                    | PKs                                                                  |
| `/api/stats` (S7-04)                      | Q8, Q8b                                                    | 14 per 5 min per isolate                       | `hands_created` (DB-1, applied)                                      |
| Accuracy refresh (P1-10)                  | Q9, Q9b                                                    | Once per player at match end                   | `hand_grades_user`, hands and matches PKs                            |
| Rating graph (P1-15)                      | Q10                                                        | Per profile                                    | `rating_history_user`                                                |
| Own hole cards (S7-12)                    | Q11                                                        | Per review                                     | `hand_holes_pkey`                                                    |
| Verify consumer (S7-03)                   | Q12                                                        | Every hand                                     | PKs                                                                  |

Volume model: 1k hands/day (ADR §Verified assumptions row 8), with 4k/day as the growth case. A rated duplicate match is 40 hands. Writes are low (≈ 25–100 rated matches/day); reads are public pages. Consistency needs:

- a rating changes exactly once per match;
- history is append-only;
- grades are invisible until the match ends.

Concurrency is low but real: outbox retries can overlap a slow first call, and the queue redelivers.

### Decisions

**D1 · Rating state: a current row plus an append-only history, with compare-and-set (chosen).**

- Options:
  - (a) Chosen: `ratings` (one row per player and format, with a `version`) plus `rating_history`, written in one transaction by `apply_rating`.
  - (b) History only, with the current rating as the latest history row. Rejected: every ladder page would need `DISTINCT ON` over all history, O(history).
  - (c) Rating as JSON on `players`. Rejected: no audit trail, no per-format rows, no CAS.
- Glicko-2 state is stored on the display scale (`rating = 1500 + 173.7178·μ`, `rd = 173.7178·φ`, `sigma`); `src/rating/glicko2.ts` converts.
- Integrity constraints, by name:
  - `rating_history_once` (unique `(match_id, user_id)` where `kind = 'match'`): a match is rated at most once, structurally;
  - `rating_history_append_only` and `rating_history_no_truncate` (triggers raising 42501);
  - the `version` CAS (stale → 40001, nothing written);
  - `check (wins + draws <= matches)`;
  - `check ((kind = 'match') = (match_id is not null and outcome is not null))`.
- Evidence:
  - self-checks 1–3;
  - concurrency check 4: two matches sharing a player rated at once from the same versions; one applies, the other is refused stale with nothing written, and it applies when recomputed.

**D2 · Lock order in `apply_rating` (DB-10).** Rows are locked in `user_id` order whatever the payload order, so two applies that share a player wait instead of deadlocking. Concurrency check 4 sends opposite payload orders.

**D3 · Ladder columns come from counters on `ratings` (DB-6, DB-9; chosen).**

- Options:
  - (a) Chosen: `matches`, `wins`, `draws`, `abandoned`, `accuracy`, `graded` on `ratings`.
    - The match counters are updated by `apply_rating` in the same exactly-once transaction. Rated no-shows go to `abandoned` from `record_match` v4's void branch, which runs once under the match row lock (R-14).
    - Accuracy is refreshed by `private.refresh_accuracy` when the match finishes, and by `record_grades` for grades that land after it.
  - (b) Per-candidate aggregates over `match_players` and `hand_grades`. This was my first draft:
    - ladder page 1: 22 ms at 100k, 43 ms at 1M;
    - plus ≈ 4–5 ms of accuracy per row, ≈ 250 ms per 50-row page;
    - the draft also used a 30-day abandonment window that contradicted R-13.
  - (c) A ladder snapshot table refreshed by cron. More moving parts and stale data; not needed at these numbers.
- Evidence: Q4 1.87 ms at 100k and 2.27 ms at 1M; Q4c walks `ratings_ladder` and stops after 50. Self-checks:
  - "exactly 10% abandonment excludes";
  - "pages without gaps or repeats".

**D4 · Profiles read `match_players.finished_at` (DB-5; chosen).**

- Options:
  - (a) Chosen: a copy of `matches.finished_at` on the seat, written by `record_match` v4 in the same statement as `outcome`, plus the partial index `match_players_history (user_id, finished_at desc) where finished_at is not null`.
  - (b) Join on `matches`. Cost grows with the player's match count: Q1 121 ms for the heaviest player at 1M.
  - (c) An index on `matches (finished_at)`. Rejected: the filter is the player, which lives on `match_players`.
- Evidence: Q1c 0.97 ms at 100k and 0.31 ms at 1M; Q2b 0.06 ms at 1M.
- Backfill for Phase 0 rows ships in the same migration (statement in the SQL comment). Phase 0 has 0 rows in production today.

**D5 · Grades: one row per decision; visibility by match status (R-15).**

- Table: `hand_grades`, primary key `(hand_id, seat, idx)`, with a `format` column so accuracy stays per format from Phase 2.
- Visibility: policy `hand_grades_after_match`. Nobody reads a grade while its match is playing (it is analysis data; P1-03). Everyone reads it after the match.
- Writes: only `record_grades` (service role), `on conflict do nothing`.
- `player_accuracy` filters on match status explicitly, so the service role, which bypasses RLS, computes the same number as a client.
- Alternative rejected: grades as JSON inside `hands.record`. No per-player index, accuracy would parse every hand, and `hands` is public mid-match.
- Evidence:
  - the self-check on grades (nobody during, everyone after, a redelivery changes nothing, the stored aggregate equals the recomputation);
  - concurrency check 5.
- Size: **245 B per decision** including indexes; 6.55 decisions per real hand gives ≈ 1.6 kB per hand.

**D6 · Monthly ladder computed per page from `rating_history_month` (DB-16).**

- `ladder_month()` aggregates one month of `kind = 'match'` rows: Q4d 12 ms at 100k and 140 ms at 1M.
- The bench's 100k scale is ≈ 5,500 rated matches a month (133k history rows over a year), and 1M is ≈ 55,000. The 4k hands/day model is ≈ 3,000. Linear in monthly volume: ≈ 2.5 ms per 1,000 rated matches a month.
- Materialization trigger: when rated matches per month pass ≈ 20,000 (≈ 7× the model; ≈ 50 ms on the bench's slope) or Q4d passes 50 ms in production. At that point, add `ratings_month (user_id, format, month, matches, wins, draws, first_before, last_after)`, upserted by `apply_rating`.

**D7 · Reports (P1-17).**

- Reporters `insert` directly, through a column grant and policy `reports_file`. The reporter is set from the token (`default auth.uid()`). The policy requires a finished rated match that both players sat in, and `check (reporter_id <> reported_id)` refuses self-reports.
- `unique (match_id, reporter_id)` allows one report per match.
- The cap of 10 per reporter per 24 h is enforced in a trigger. A per-reporter transaction advisory lock makes concurrent reports count in turn (DB-11; concurrency check 6, which a removed lock turns red: 11 rows).
- Reporters read their own rows; a reported player never reads reports about them.
- Indexes: `reports_open` for triage and the 7-day SLA, `reports_reporter_day` for the cap, `reports_reported` for moderation and the foreign key (DB-14).

**D8 · Sanctions (P1-18).**

- `apply_sanction` is service role only. A `rating_reset` restores 1500 ± 350 and appends a `reset` history row (the append-only trigger allows inserts). The version bump makes any in-flight rating stale.
- Publicly readable columns: id, user, kind, dates and appeal outcome. Reason and appeal text stay private.
- `appeal_sanction` runs with **invoker** rights over a one-column update grant and policy `sanctions_appeal` (own standing sanction, not yet appealed). Trigger `sanctions_appeal_at` stamps the time. This keeps Phase 0's rule that no browser can call a security definer (`rls-matrix.test.ts`; DB-13).
- `ladder()` and `ladder_month()` v2 exclude active `ladder_removal`.

**D9 · Lock-safe DDL (DB-12).**

- Changing `matches_kind_check` uses `NOT VALID` then `VALIDATE`, so no exclusive-lock table scan.
- New indexes on tables that already hold rows are built in the migration transaction while those tables are small (Phase 0 traffic only).
- Rule for later: above ≈ 1M rows, create the index `CONCURRENTLY` outside the migration through the SQL editor, and record the migration as `create index if not exists`. Supabase runs a migration in one transaction, where `CONCURRENTLY` is refused.

**D10 · Not materialized, measured instead.**

- No ladder snapshot (D3, D6).
- No partitioning: `hands` stays one table to ≈ 10 GB at 4k hands/day. See the review's growth model.

### Migration plan (order, per ticket)

| Ticket | Migration (`supabase/migrations/<ts>_…`) | Contents from `phase1.sql`                                                                                                                                                                                                                                                      | Lock / backfill                                                                   | Rollback                                                                                                                                                                                  |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01  | `rated_matches`                          | kind check (NOT VALID + VALIDATE); `outcome`, `adjusted_chips` (replaces `segment_chips` under Q1 = B, ADR amendment 2026-10-10), `finished_at`, `match_players_history`; backfill; `record_match` v4 (sets them, voids with the no-show counter, refreshes accuracy at finish) | Column adds are metadata-only; backfill is one UPDATE over Phase 0 rows (0 today) | `drop index match_players_history`; drop the three columns; restore the old check; restore `record_match` v3 from its migration                                                           |
| P1-04  | `rematch`                                | `matches.rematch_of`; `record_match` v5                                                                                                                                                                                                                                         | Metadata-only                                                                     | Drop the column; restore v4                                                                                                                                                               |
| P1-12  | `ratings`                                | `ratings`, `rating_history` with all four indexes and both triggers, `apply_rating`, Access for both tables                                                                                                                                                                     | New tables                                                                        | `drop table rating_history, ratings cascade; drop function apply_rating, private.refuse_change`. Only before any rated match; after that, forward fixes only (history is the audit trail) |
| P1-09  | `hand_grades`                            | `hand_grades`, `record_grades`, policy `hand_grades_after_match`                                                                                                                                                                                                                | New table                                                                         | Drop the function and table (grades can be recomputed from hands + `hand_holes`)                                                                                                          |
| P1-10  | `accuracy`                               | `player_accuracy`, `private.refresh_accuracy`                                                                                                                                                                                                                                   | Functions only                                                                    | Drop the functions; `ratings.accuracy` stays null                                                                                                                                         |
| P1-14  | `ladder`                                 | `abandonment_rate`, `ladder` v1 and `ladder_month` v1 (without the sanctions clause)                                                                                                                                                                                            | Functions only                                                                    | Drop the functions                                                                                                                                                                        |
| P1-17  | `reports`                                | `reports`, three indexes, cap trigger, grants and two policies                                                                                                                                                                                                                  | New table                                                                         | Drop the table and trigger function                                                                                                                                                       |
| P1-18  | `sanctions`                              | `sanctions`, `apply_sanction`, `appeal_sanction`, appeal trigger, grants, policies; `ladder` v2 and `ladder_month` v2                                                                                                                                                           | New table                                                                         | Restore the v1 ladders; drop the rest                                                                                                                                                     |
| P1-16  | `profile_views`                          | `profile_views` (service role only)                                                                                                                                                                                                                                             | New table                                                                         | Drop the table                                                                                                                                                                            |

Every migration carries its rows in `supabase/tests/rls-matrix.test.ts`; its "covers every table" test fails until it does. Each also carries the matching self-checks from `plans.ts`, as the ticket's acceptance tests.

### Evidence

Timings are PGlite (Postgres 17 compiled to WebAssembly, one connection, in memory). They rank plans and show growth; hosted Postgres 17 runs the same plans faster in absolute terms, and the 1M run stores 1-byte `leaves` to fit in memory (row width only). Medians of three `EXPLAIN (ANALYZE)` runs. Full output: `.10x/reviews/2026-10-09-dba-review.md` §Plans.

- Self-checks:
  - 12/12 PASS at 10k on the final files;
  - 11/11 in the final 100k run, before the twelfth was added.
- Concurrency: 8/8 PASS on PostgreSQL 16.15.
- Mutation-checked, each turning its check red when removed:
  - the `<` in the 10% rule;
  - the finished-match condition on reports;
  - the daily cap;
  - the private sanction columns;
  - the mid-match grade rule;
  - the `apply_rating` revoke;
  - the report advisory lock (concurrency).

### What Prompts 7–9 get, so nobody invents a table

- **Prompt 7 (grading):** `hand_grades`, `record_grades(p)`, `player_accuracy`, `private.refresh_accuracy`, `ratings.accuracy` / `graded`. Grade distribution comes from `hand_grades` grouped by grade over the same 500 rows; it is public after the match, so no new table is needed.
- **Prompt 8 (rating, ladder, profile):**
  - `ratings`, `rating_history`, `apply_rating(p)` (payload documented in the SQL);
  - `ladder`, `ladder_month`, `abandonment_rate`;
  - the profile queries Q1c, Q2b and Q10.
  - The PM metrics script reads `rating_history`, self-joined on `match_id` for predictive validity.
- **Prompt 9 (integrity):** `reports`, `sanctions`, `apply_sanction`, `appeal_sanction`. Triage reads `reports_open`.

### Open questions (for the user; neither blocks Phase 0)

- **Q-DBA-1 · Grade visibility vs the Terms.**
  - The conflict:
    - R-15 makes every grade public once the match ends. Prompt 7 had said "both players".
    - A grade is computed from the player's hole cards, so a "blunder" on a fold says something about the folded hand.
    - The Terms say "Your folded cards are never published".
  - Options:
    - (a) Keep R-15 and add one line to the Terms: grades of every decision are published after the match.
    - (b) Narrow to the two players of the match (Prompt 7's wording); the policy gains one participant clause.
  - My recommendation is (b) until a recruiter-facing need for public per-decision grades exists; the public accuracy number does not need it. Decide before P1-09.
- **Q-DBA-2 · `hands_private` retention.** See the review's growth model. Proposed: delete deck, secret and holes 90 days after a verified hand with no open report or incident. It saves little disk (≈ 0.4 kB of ≈ 4.9 kB per hand) and is data minimization. It deletes data by design, so it needs your OK; nothing ships without it.
