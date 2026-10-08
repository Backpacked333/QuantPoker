# SDE — index

Last updated: 2026-10-08

## Active features

| Slug                   | Description                              | Status                                                                                                                               |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `multiplayer-platform` | Phase 0 per the architect's ADR, 7 steps | Steps 1–4 **done** (engine, accounts, table server, live table — two-browser milestone); Steps 5–7 next; 3 dashboard actions pending |

## Cross-cutting notes

- **Node-environment suites.** Pure-logic tests (engine, protocol) start with `// @vitest-environment node`; jsdom costs seconds per file and the setup file is DOM-guarded for them.
- **Long property walks** take an explicit timeout (`180_000`, or one hour under `ENGINE_SOAK=1`) and avoid `expect()` in the hot loop: plain throws for per-action checks, `expect` for per-hand checks.
- **Engine states are values.** Never mutate a `HandState` you did not just create inside a transition; `act` shares config, deck, actions and card tuples between states.
- **Profile before trimming tests.** The first fix for a slow suite was in the engine (structural clone), not in fewer assertions.
- **Check the live project before writing migrations.** The Supabase project already held another branch's schema; list tables and migrations first, then write strictly additive SQL with timestamped names after the latest recorded version.
- **SQL is tested on real Postgres.** `supabase/tests/` runs migrations in PGlite against a stub of Supabase's roles and permissive default grants, so revokes and RLS are exercised. Mutation-check new access rules (remove the grant, see the test fail).
- **Prove fresh state in restart tests.** A restart test passed while nothing restarted; assert a new instance (a marker on the object) before trusting it.
- **Real clients find what harnesses miss.** The Workers test harness accepted `:` in a subprotocol; Node and browsers reject it. Run a real two-client smoke against `wrangler dev` for every protocol change.
- **Phones zoom out instead of scrolling.** An overflow check must compare against the device width (`page.viewportSize()`), not `innerWidth`.
