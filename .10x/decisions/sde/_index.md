# SDE — index

Last updated: 2026-10-10

## Active features

| Slug                        | Description                                                                                            | Status                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `multiplayer-platform`      | Phase 0 per the architect's ADR, 7 steps                                                               | Steps 1–7 **done**; Step 7 **deployed** 2026-10-09 (`3cc9bd0`, launch evidence in `.10x/reviews/2026-10-09-launch-verification.md`); S7-11 closes after U-4                                                                                             |
| `rating-and-leaderboard`    | Phase 1 rating model, ladder and profile (P1-11…P1-16)                                                 | P1-11 **done** 2026-10-09: Glicko-2 pure module, Glickman example reproduced, properties over 10k sequences                                                                                                                                             |
| `heads-up-duplicate-ladder` | Rated heads-up match: fresh decks with a luck adjustment (Q1 = B), lifecycle, end screen (P1-00…P1-04) | P1-02 engine module **done** 2026-10-09; **P1-01 live** 2026-10-10 (PRs #12–#16: archive, table server, grace, gated queue, UI); **P1-03** (nothing to analyse on a rated table, PR #17); **P1-04** (end of match and rematch, PRs #18–#19); P1-12 next |
| `accuracy`                  | Accuracy against a model opponent: population model, grading consumer, profile number (P1-08…P1-10)    | **P1-08** (PR #20) and **P1-09** (PRs #21, #23) live 2026-10-10, QA attack run (clock exploit fixed, averaging weakness measured); **P1-10** built (accuracy table, luck series, lobby panel)                                                           |
| `six-max-tables`            | Casual 6-max (P2-01…P2-08), in the PR order of `engineering-manager/six-max-casual.md`                 | **P2-01** built 2026-10-10 (PR-01): four crafted pot cases, soak at seed 20261010 with 0 failures in 100k hands per size (side pots in 45.6–97.0% for N > 2); CI run link added after the push                                                          |

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
- **A busy guard must not drop work.** `if (flushing) return` lost a call queued mid-pass, and the pass then removed the deadline that would have retried it. Record the request and run the pass again instead.
- **Rate limiters count in wall-clock windows.** A burst test that straddles a window boundary resets halfway. Start the burst in a fresh window, and reproduce by starting 300 ms before a boundary.
- **A rule about acting again needs a seat that has already acted.** Counting a short all-in call as a raise passed every crafted case until one had a seat act before the short call and then face a short raise.
