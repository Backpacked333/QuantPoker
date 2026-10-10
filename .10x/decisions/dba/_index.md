# DBA — index

Last updated: 2026-10-10

## Active features

| Slug                | Description                                                                           | Status                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase1-schema`     | Prompt 4: review of the Phase 0 schema; the Phase 1 schema designed and measured      | Done 2026-10-09. DB-1 (Medium, `/api/stats` full scans) fixed and applied to production with `verify_hand`. Phase 1 proposal in `supabase/proposed/phase1.sql`, not applied. Review: `.10x/reviews/2026-10-09-dba-review.md` |
| `ladder`            | P1-14: ladder functions (keyset, eligibility), rating metrics query, simulated season | Built 2026-10-10. Shipped design and 10k/100k plans in `ladder.md`; metrics read-only on production: insufficient data (0 rated matches).                                                                                    |
| `hands-after-match` | Hands of a match in play unreadable by clients (restrictive RLS, Devin #29)           | Built 2026-10-10. Scalar `matches_pkey` probe per hand; bench Q8c; rollback is one `drop policy`.                                                                                                                            |

## Cross-cutting principles

- **Production is read-only unless a real defect needs a migration.** Then: red test first in PGlite, an additive migration, apply through the connector, rename the repo file to the version production recorded, re-check the advisors.
- **Every public read is on an index.** `anon` has a 3 s statement timeout in production: a full scan of a growing table is a future outage, not a slow page.
- **Measure at 10k, 100k and 1M before choosing.** `supabase/bench/plans.ts` ranks plans in PGlite; absolute times differ on hosted Postgres, growth does not. Materialize only past a measured trigger.
- **Counters, not aggregates, for anything a list shows per row.** Maintain them in the same exactly-once transaction as the event that changes them.
- **Duplicates must be structurally impossible.** A primary key or unique index plus `on conflict`, or a row lock on a state the transaction leaves. Prove it with two real sessions (`supabase/bench/concurrency.ts`), not only with a repeat.
- **Access rules come with the table.** RLS on and grants revoked in the same migration, then explicit reads. No security definer is callable by a browser. `rls-matrix.test.ts` fails on a new table without its rows.
- **Lock-safe DDL.** `NOT VALID` + `VALIDATE` for constraints on existing tables, with `VALIDATE` in a migration of its own once the table is large (one transaction holds the first statement's lock through the scan); `CONCURRENTLY` outside the migration for indexes once a table passes ≈ 1M rows.
- **Mutation-check every rule.** Remove it, watch its check fail, put it back.
