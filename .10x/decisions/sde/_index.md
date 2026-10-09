# SDE — index

Last updated: 2026-10-09

## Active features

| Slug                     | Description                                            | Status                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `multiplayer-platform`   | Phase 0 per the architect's ADR, 7 steps               | Steps 1–7 **done**; Step 7 **deployed** 2026-10-09 (`3cc9bd0`, launch evidence in `.10x/reviews/2026-10-09-launch-verification.md`); S7-11 closes after U-4 |
| `rating-and-leaderboard` | Phase 1 rating model, ladder and profile (P1-11…P1-16) | P1-11 **done** 2026-10-09: Glicko-2 pure module, Glickman example reproduced, properties over 10k sequences                                                 |

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
- **Freeze the table clock in time tests.** Real milliseconds pass between test steps; `freezeClock` + `elapse` make "1 ms before the deadline" exact.
- **Check where the awaits are before claiming a race.** A lock added for a click/clock race turned out to guard "frames before the write" instead; the mutation check showed the race test passed without it, so the comment says what it really does.
- **Dry-run SQL against production inside a transaction that raises.** It proves the real schema accepts the real payloads and leaves nothing behind.
- **Ask the source of truth, not a cache, before refusing a user.** The lobby's active-table map is checked against the table itself, so a lost release cannot lock anyone out.
- **Refusals the user must understand go over an accepted socket.** Browsers hide why an upgrade failed; accept and close with a code and reason instead.
- **Make the sink the test.** Logging rules are only real if a test captures every console line of a full match (and of each failure path) and greps it for card, deck, secret and token shapes; the first run found a crash path nobody had logged before.
- **Chaos with processes, not mocks.** SIGKILL a client process (no close frame), SIGSTOP the runtime past a deadline, SIGKILL the whole dev server's process group and restart on the same state: each exercises a path the unit harness cannot. Kill exact pids or process groups; `pkill -f` matches its own shell.
- **A smoke must prove it can fail.** Disable redaction once and watch it report leaks; cut a CPU budget to 50 ms and watch the bench fail.
