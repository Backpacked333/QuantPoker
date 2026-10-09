# 10x prompts for every remaining step

Paste one prompt per fresh Claude Code session. Each prompt stands alone: it names the files to read first, the exact deliverable, the quality gates, what not to touch, and how to hand off. Run them in the order below; the order is the dependency order.

| #   | Prompt                                      | Roles               | Blocks  |
| --- | ------------------------------------------- | ------------------- | ------- |
| 0   | Preamble (prepend to every prompt)          | all                 | —       |
| 1   | Post-cleanup verification + ES256 sign-in   | SDE                 | 2, 3, 4 |
| 2   | Security review before the Step 7 deploy    | Security Engineer   | 4       |
| 3   | DBA review of the applied migrations        | DBA                 | 4       |
| 4   | Tickets for Step 7 and Phase 1              | Staff Engineer / EM | 5, 6    |
| 5   | Phase 0 Step 7: hardening, CI, launch       | SDE + DevOps + SRE  | 6       |
| 6   | Phase 1a: heads-up duplicate engine         | Architect → SDE     | 7       |
| 7   | Phase 1b: grading pipeline + accuracy       | SDE                 | 8       |
| 8   | Phase 1c: rating, ladder, profile           | SDE + DBA           | 9       |
| 9   | Phase 1d: integrity v1 + review→lesson loop | SDE + Security      | 10      |
| 10  | Phase 2a: N-seat `Table` and 6-max casual   | SDE                 | 11      |
| 11  | Phase 2b: arenas and 6-max rating           | SDE                 | —       |
| 12  | Later: integrity v2 (only when triggered)   | Security Engineer   | —       |
| 13  | Optional: port the AI coach to the Worker   | SDE                 | —       |

Decisions only you can make (not prompts): the five open questions at the end of `.10x/decisions/architect/multiplayer-platform.md` (commitment scheme, invite-link visibility, domain, plan state), and the dashboard steps in `.10x/handoff.md`. Prompt 1 assumes you did them.

---

## 0. Preamble (prepend to every prompt)

```
You are working in the QuantPoker repo (branch: the one the session gives you; never push elsewhere, never open a PR unless I ask).
Use the 10x-Team skill and switch to the role named in the task.

Orient first, in this order, and do not skip:
1. .10x/status.md (phase, roadmap, open tasks)
2. .10x/handoff.md (latest handoff section)
3. The files named in the task below
Do not re-derive anything the ADR already decided. If the ADR and the code disagree, the code is the truth: say so, fix the doc.

Non-negotiables:
- Server owns the cards. No client ever receives an opponent's hole cards, the deck, or analysis data during a live rated hand.
- Entry bundle stays under the 150 kB budget (npm run build + scripts/check-bundle.mjs). Lobby/network/lab stay lazy chunks.
- No Math.random, timers or globals in src/engine. Never await inside the evaluator hot path.
- Never skip, disable or loosen a test to get green. A flaky test is a bug to root-cause.
- Secrets never printed, logged, committed or sent anywhere but their one intended host.
- Every migration is additive and applied through supabase/migrations with a PGlite RLS test.

Gates before you call anything done (run them, paste the real counts):
npm run lint && npm run typecheck && npm run typecheck:worker (if it exists) && npm test && npm run worker:test && npm run build && npm run e2e
If a gate does not exist yet, say so; do not invent a pass.

Finish by (a) updating .10x/status.md (tasks ticked, phase line, date), (b) appending a dated handoff section to .10x/handoff.md in the existing format (Read first / What to test / What to review / Next step), (c) appending your log to .10x/decisions/<role>/<feature>.md, (d) committing with clear messages and pushing the designated branch.
Report outcomes faithfully: failing tests, skipped steps and unverified claims are stated plainly, not smoothed over.
```

---

## 1. Post-cleanup verification and first real ES256 sign-in

Role: SDE.

```
Task: prove the deployed system matches the repo after the cleanup, and close the ADR day-5 auth check.

Read: .10x/handoff.md (cleanup section), .10x/status.md §Repository and §Stack, wrangler.jsonc, worker/src/auth.ts, worker/test/auth.test.ts, supabase/migrations/.

Do:
1. Confirm main is the default branch, the 7 migrations in supabase/migrations equal what Supabase reports (use the Supabase MCP list_migrations; do not apply anything), and Cloudflare deploys from main (read, don't change).
2. Check GET /api/config on https://quantpoker.bbcroysalman.workers.dev returns the Supabase URL and publishable key and nothing secret.
3. Fetch the project JWKS and confirm it still has exactly one ES256 key. Document the kid.
4. I will sign in once with a real account in a browser and paste you the access token header only (base64url of the first segment, never the full token). Decode it, confirm alg is ES256 and kid matches the JWKS. If it is HS256, stop and tell me how to rotate the signing key on the Supabase dashboard; do not add an HS256 fallback to the Worker.
5. Confirm SUPABASE_SECRET_KEY is set as a Worker secret by running one two-account match against production and then querying matches, match_players, hands and hand_holes with the Supabase MCP (read-only). Each player must see only their own hand_holes row through RLS; prove it with two role-scoped queries, not by reading the policy.

Deliverable: a short .10x/reviews/<date>-deploy-verification.md with the evidence (commands, ids, counts), and any repo fixes as small commits. Tick the matching tasks in status.md.
Out of scope: new features, dashboard changes, schema changes.
```

---

## 2. Security review before the Step 7 deploy

Role: Security Engineer.

```
Task: light but adversarial security review of Phase 0 before launch hardening. Find exploitable problems; do not write essays.

Read: worker/src/auth.ts, table.ts, lobby.ts, supabase.ts, index.ts; src/shared/protocol.ts (validator); src/engine/redact.ts and its tests; supabase/migrations/* (RLS, security definer functions); .10x/decisions/integrity-and-trust (PM) and the QA file. Handoff sections for Steps 5 and 6 list reviewer pointers: cover each.

Threat model to work through, with a concrete exploit attempt or test for each:
1. Token handling: ES256-only, issuer, audience, exp/nbf clock tolerance, token in WebSocket subprotocol never logged, dev.<user>.<secret> path impossible in production (DEV_AUTH_SECRET absent) and fail-closed if the var is misconfigured.
2. Seat hijack and replay: invite-link seat claim race, replaying an old action with a stale seq/idempotency key, acting out of turn, acting for the other seat, two sockets on one account.
3. Information leaks: per-seat redaction in every frame type (welcome, state, hand_end, reveal, errors, close reasons, the 4409 body); anything in logs; timing or frame-size side channels that reveal a hole card; the reveal opening only publicSlots.
4. Commitment scheme: can the server cheat undetectably; can a client pre-compute; does the secret ever leave the Worker before the hand ends.
5. Database: hand_holes and hands_private RLS from anon, authenticated and a different authenticated user; record_match and record_hand are security definer with search_path '' and not executable by anon/authenticated; the service-role key goes only to ${SUPABASE_URL}/rest/v1/rpc/*; username enumeration and profile exposure.
6. Abuse and DoS: frame size and rate limits (table and lobby have none yet), queue flooding, match creation spam, alarm abuse, unbounded DO storage growth.
7. Supply chain and CI: workflow permissions, secrets exposure to forks, pinned actions.

Deliverable: .10x/reviews/<date>-security-review.md with a table (finding, severity, exploit steps, fix, status). Fix the High/Medium findings that are small and local with tests that fail before the fix and pass after; list the rest as tickets for Prompt 5 with exact file:line. Do not weaken any existing test. Do not touch Phase 1 designs.
```

---

## 3. DBA review of the applied migrations

Role: DBA.

```
Task: post-hoc review of the live schema and its migrations before ratings and ladders are built on top of it.

Read: supabase/migrations/* (the 4 files named 202610081*, record_match, and the learning_cloud one), supabase/tests/migrations.test.ts, the ADR §Data model, the PM rating-and-leaderboard and heads-up-duplicate-ladder files.

Do, using the Supabase MCP read-only tools (list_tables, execute_sql SELECT only, get_advisors, list_extensions):
1. Run security and performance advisors; triage every finding (real / accepted / false positive) with a reason.
2. Verify indexes against the real query shapes Phase 1 needs: player match history, opponent-pair counts per day (the ≤2/day limit), ladder by rating, last-20-matches profile, hands by match, outbox idempotency. Run EXPLAIN on each with realistic generated row counts in a scratch schema or transaction that you roll back; never write to production tables.
3. Check idempotency of record_match/record_hand under retry and concurrent duplicate delivery; constraints that make a duplicate impossible rather than merely unlikely.
4. Growth: bytes per hand with and without hands_private, projected rows/day at 1k and 4k hands/day, the day Supabase Pro limits bite, retention and archival policy for hands_private (the deck) after it is revealed.
5. RLS matrix as a table: every table × anon / authenticated-self / authenticated-other / service. Anything not tested in PGlite gets a test.
6. Design (do not apply yet) the additive migrations Phase 1 needs: ratings (per format, Glicko-2 mu/phi/sigma, history), accuracy aggregates, match_results with duplicate segment totals, reports, sanctions-ready columns. Write them as proposed SQL in .10x/decisions/dba/phase1-schema.md with rationale.

Deliverable: .10x/reviews/<date>-dba-review.md + the proposed Phase 1 schema doc. Only apply a migration if it fixes a real defect found here, with a test, and say so explicitly.
```

---

## 4. Tickets for Step 7 and Phase 1

Role: Staff Engineer / Engineering Manager.

```
Task: turn the remaining plan into tickets an AI-assisted solo builder can execute without ambiguity.

Read: .10x/status.md, the ADR §Migration path and §Out of scope, all four PM feature files, and the reviews from Prompts 1-3 (security, DBA, deploy verification).

Produce .10x/tickets.md with, for Step 7, Phase 1 and Phase 2:
- Ticket id, one-line goal, files to create/change, dependencies, effort in half-days (be honest; use the ADR's 15 days + 3 reserve as the calibration for Phase 0 and say where Phase 1/2 estimates are weaker).
- Acceptance tests written as concrete test names and assertions, not prose ("segment 2 deals segment 1's decks with seats swapped, card-for-card equality" becomes an exact test file and case).
- A risk line per ticket and the cut line: what ships if time runs out.
- A critical path and what can run in parallel as separate sessions.
- Fold in every High/Medium finding from the security and DBA reviews.
Confirm or correct the success metrics and exit criteria in status.md so each is measurable from data we actually record.
Resolve contradictions between PM files and the ADR yourself where the answer is clear; list the rest as questions for the user (max 5, each with your recommendation).

Do not write product code. Deliver the file and a three-bullet summary.
```

---

## 5. Phase 0 Step 7: hardening, CI, launch

Role: SDE with DevOps and SRE hats.

```
Task: ADR Step 7 (day 15). Make Phase 0 safe to put in front of strangers.

Read: ADR §Migration path row 7, §Failure modes, §Local development/testing/CI, §Post-hand grading placement, §Verified assumptions rows 2, 5, 6; .10x/decisions/sde/multiplayer-platform.md (Steps 5-6); the security review (Prompt 2) and tickets (Prompt 4) if they exist.

Build, each with tests that fail before and pass after:
1. Rate limits and frame caps: per-socket token bucket and max frame size for TableDO and LobbyDO, with a clean error then close; match-creation limit per account.
2. Origin allowlist for WebSocket upgrades (same-origin plus localhost in dev).
3. HAND_QUEUE producer in TableDO endOfHand, a verify consumer (re-run the engine over the recorded actions and assert chip conservation and commitment match; max_batch_size 1; cpu stays default), and a DLQ consumer that writes incidents. Idempotent on redelivery.
4. bench.test.ts in Node using process.cpuUsage on cold boards, recording preflop-table cost; fail if analyzeSpot exceeds the budget (< 500 ms CPU).
5. CI: typecheck:worker, worker:test with @cloudflare/vitest-plugin, e2e/live.spec.ts with the second webServer, engine-soak.yml (nightly 100k random hands, N=2..6, invariants), and a deploy check that Workers Builds from main succeeded. Use least-privilege workflow permissions; pin actions by SHA.
6. Observability: Workers Logs on, structured one-line logs for match start/end/forfeit/no-show/errors with ids only (no cards, no tokens), and hands/day counter exposed in /api/config-adjacent admin-only metric or a log line I can chart.
7. scripts/smoke-ws.mjs: 20 concurrent Node ws clients playing 500 hands against production-like wrangler dev (and, with my explicit flag, production); prints ack p95 and fails above 300 ms p95 or any invariant break. Never run it against production without my flag.
8. Fair Play page (what we do: server-owned cards, lab off mid-hand, deck commitment, abandonment counting; what we do not: collusion/RTA detection yet; how to report), "play money only" and public-hand-history ToS copy, README multiplayer section, and Phase 1 handoff notes naming the seams (queue, project.ts, DuplicateController, deck:<n>).

Verify like an operator: run wrangler dev, two real browsers, kill the socket mid-hand, let the alarm fire late, restart the DO, and show the match resumes. Report the real numbers.
Out of scope: rating, duplicate, 6-max, spectating, anything in the ADR §Out of scope.
```

---

## 6. Phase 1a: heads-up duplicate engine

Role: Principal Architect first (short design addendum), then SDE.

```
Task: heads-up duplicate matches, the format the whole ladder rests on.

Read: .10x/decisions/product-manager/heads-up-duplicate-ladder.md in full, ADR §Durable Objects and §Randomness and deck commitment (the Phase 1 seams: DuplicateController, deck:<n> retention, fresh secrets), src/engine/, worker/src/table.ts, the tickets from Prompt 4.

Step 1 (architect, <= 1 page appended to the ADR as an Amendment): how a match of 2 segments x N hands is stored in the TableDO, how segment 2 reuses segment 1's decks with seats swapped WITHOUT leaking segment 2's cards during segment 1 (the opponent must not learn upcoming cards: commitments per deck, reveal rules for reused decks, fresh per-use secrets), and how fixed 100 bb stack resets, the +-2 bb draw band, the 20 s / 60 s clock, and 60 s reconnect grace map onto the existing clock and forfeit code.

Step 2 (SDE): implement it.
- DuplicateController in the TableDO; rated flag on the match; match result in bb = seg1 + seg2 net; win / draw / loss with the noise band as a named constant.
- Lab, equity ring and EV labels are not rendered AND not shipped to the client while a rated hand is live. Prove with a network-level test that asserts the exact set of frame fields.
- End-of-match screen: result in bb, winner/draw, biggest EV swings (placeholder until Prompt 7), rematch button (reuses the pair limit logic and the ≤2/day rule).
- Review: "compare with opponent on the same deck" side by side.
- Quick-match lobby gets a Rated card next to Casual; casual keeps working untouched.

Tests (must exist): segment 2 deals exactly segment 1's decks with seats swapped (card-for-card); server rejects any non-legal action; neither client gets opponent hole cards or the deck before showdown; commitments verify for reused decks; forfeit and no-show mid-segment produce correct results and abandonment records; DO restart mid-segment resumes; e2e with two simulated clients passes the keyboard loop, axe, mobile layout and frame-time tests.
Out of scope: rating math, grading pipeline, ladder UI.
```

---

## 7. Phase 1b: grading pipeline and accuracy

Role: SDE.

```
Task: server-side post-hand grading and per-player accuracy, honestly labelled.

Read: PM rating-and-leaderboard.md §Accuracy, ADR §Post-hand grading placement (queue, max_batch_size 1, CPU evidence), src/lib/grading.ts, model.ts, range code, src/engine/project.ts and its grading-equality test, worker/ queue consumer from Step 7.

Build:
1. A population opponent model for humans (position-aware preflop ranges + a simple postflop continuation policy) behind the same interface as the existing uniform model. Document the numbers and where they come from. The UI label is exactly "Accuracy vs. a model opponent, not a solver."
2. Grading in the queue consumer: per decision EV lost as a share of pot -> Best/Good/Inaccuracy/Mistake/Blunder and 0-100 accuracy. Heads-up hands are fully graded. Idempotent on redelivery; a failure never blocks the next hand or the match result.
3. Persist per-decision grades (additive migration + PGlite RLS test: players read their own and their opponent's grades only for finished matches).
4. Rolling accuracy over the last 500 graded decisions, grade distribution, and the luck-vs-skill cumulative chart extended across rated matches.
5. Decision timing logged per action (needed for integrity v2 later), no detection logic.

Tests: project.ts + grading-equality still green; a golden set of 50 hands graded identically to the client-side trainer; replay determinism; bench stays under the CPU budget on cold boards; redelivery creates no duplicate rows.
Be explicit in the log about what the model gets wrong (e.g. human tendencies it does not capture) and propose how we would validate it with real data (Spearman rating vs accuracy > 0.4 is the PM's check).
```

---

## 8. Phase 1c: Glicko-2 rating, ladder, profile

Role: SDE with DBA review.

```
Task: the number people climb and recruiters read.

Read: PM rating-and-leaderboard.md in full, the DBA Phase 1 schema proposal (Prompt 3), heads-up-duplicate-ladder.md acceptance criteria 4, grading output from Prompt 7.

Build:
1. Glicko-2 as a pure, fully unit-tested module (src/shared or worker/, no I/O), per format (hu-duplicate now; 6-max later). Test against the published Glickman worked example to the digits. Draw handling and the rating period convention are named constants with comments.
2. Rating update in a single transaction when a rated match completes; idempotent on retry; abandonment/forfeit rules; "provisional" until RD < 100 or >= 20 matches (whichever is later).
3. Matchmaking: rated quick-match pairs near rating (widening window with wait time), keeps the <= 2 pairings per pair per day rule.
4. Ladder: per format, all-time and this month; columns rank, player, rating +- RD, accuracy, matches, win rate, trend; min 20 rated matches to appear; eligibility (not provisional, >= 1 match in 30 days, abandonment < 10%); provisional players see "X matches to go". Pagination and the index plan from the DBA doc; EXPLAIN evidence in the log.
5. Public profile at #/u/<username> (or the URL form the domain decision allows): rating +- RD over time, accuracy, volume, last 20 matches with review links, abandonment rate, sanctions field (empty for now), link to a Method page that states the formulas and versions. OG share image. Hole cards shown only where shown at showdown.
6. End-of-match screen now shows real rating change and why.

Tests: rating invariants (zero-sum-ish sanity, monotonic with results, RD shrinks with play), property tests on random match sequences, RLS tests for profile data, e2e for ladder and profile, axe + mobile layout.
Instrument the PM success metrics (predictive validity at gap >= 150, median abs rating change < 15, Spearman) as a SQL view or script I can run; do not fake data.
```

---

## 9. Phase 1d: integrity v1 and the review→lesson loop

Role: SDE with Security review at the end.

```
Task: the near-free protections that make the ladder credible, and the loop that turns a mistake into learning.

Read: PM integrity-and-trust.md (v1 column only), the security review, PM multiplayer-platform.md for the review->lesson loop, src/curriculum/ (the Learn tab) and src/lib/grading.ts.

Integrity v1:
1. Abandonment score and ladder-eligibility effect (> 10% removes eligibility until it recovers), shown on profile.
2. One-click "Report" from review: reports table (additive migration, RLS: reporter inserts, only service reads), rate-limited, with the match id and optional note. A tiny admin-only view or SQL script to triage; SLA target is 7 days.
3. Sanctions plumbing: manual only, logged, with profile flag "sanctioned" and rating reset. No auto-bans.
4. Win-trade guard verified end to end (<= 2 pairings per pair per day) and a test.
5. Published Fair Play page updated to describe exactly what exists.

Review -> lesson loop:
6. From a graded mistake in review, deep-link to the specific curriculum item that teaches the underlying concept (map decision types and error classes to lessons; start with the ones the Learn tab already covers, list gaps). The link opens the lab with the situation pre-loaded where the lab supports it.
7. A post-match "what to review first" list: the three biggest EV swings, each with its lesson link.

Tests: network test that no analysis data reaches a client during a live rated hand (CI gate, success metric = 0); deck commitment verification failure count = 0 in the 500-hand smoke; report flow e2e; mapping completeness test that every grade class has a lesson or an explicit "none yet".
Finish with a short security pass on reports and sanctions endpoints.
```

---

## 10. Phase 2a: N-seat `Table` and casual 6-max

Role: SDE.

```
Task: retire the toHeroGame crutch and ship casual 6-max with Atlas fill.

Read: PM six-max-tables.md in full, ADR §Engine N-player generalisation and the risk note on toHeroGame, src/engine/ invariant suite, the Table/ActionBar components, worker/src/table.ts, e2e frame-time test.

Build:
1. N-seat Table UI: six seats with the same card art, chips and spring choreography; side-pot chip animation; turn indicator and timers readable on a phone; keyboard handling parity. Replace toHeroGame everywhere; a generic seat plate for humans (no Atlas avatar on humans).
2. Table service: 6 seats, 100 bb fixed buy-in, blinds 1/2, rebuy to 100 bb when below, sit/stand, join = sit in the next hand, dead-button rule (pick the standard rule, document it in the ADR, test it), clock 20 s + 30 s time bank per orbit, sit-out after 2 consecutive timeouts, removal after 3 orbits.
3. Atlas bots back-fill so a table is never empty, clearly labelled; bots never appear at rated tables.
4. Table list: seats, average pot, players/hour; quick-sit.
5. Reconnect without losing the seat for 60 s, including mobile Safari background-tab behaviour (document what you could and could not test).
6. Post-hand review with the lab for every seat played; opponents' cards only where shown. Multiway decisions show "not graded" with a count.
7. 6-max stats on profile (VPIP/PFR/aggression, luck-adjusted bb/100).

Hard gate before you call it done: 0 invariant failures over 100k simulated random 6-max hands (chip conservation, side-pot sums, legal action sets, showdown award order and odd-chip rule vs a reference implementation), plus action-to-render p95 < 150 ms and no dropped frames through a 3-way all-in runout.
Out of scope: rated arenas and the 6-max rating.
```

---

## 11. Phase 2b: arenas and the 6-max rating

Role: SDE.

```
Task: scheduled rated arenas and a luck-adjusted 6-max rating.

Read: PM six-max-tables.md §Format (Arena) and §Gates, PM rating-and-leaderboard.md §6-max, the Glicko-2 module and ladder from Prompt 8, the first 1,000 human casual hands' invariant results.

Pre-check: confirm the hard gate (0 invariant failures over 100k simulated + first 1,000 human casual hands). If it fails, stop and report.

Build:
1. Arena scheduling: fixed 60-minute windows announced in the lobby (and email/notification if the infrastructure exists; otherwise note the gap), an ArenaDO that seats by rating band, rebalances as people leave, humans only.
2. Luck-adjusted bb/100 with all-in pots settled at equity, converted to a pairwise result per opponent weighted by shared hands, fed to Glicko-2 for the 6-max format (separate rating, never merged).
3. A rated arena with fewer than 4 humans is played but not rated. Players show "provisional" until >= 500 rated hands; ladder lists provisional separately.
4. Ladder/profile: 6-max rating column and card, with RD and volume next to it.

Tests: the luck-adjustment against hand-computed examples; rating conservation properties; arena rebalancing under joins/leaves; e2e with 6 simulated clients. Update the success metrics instrumentation.
Out of scope: collusion detection (growth-triggered, Prompt 12).
```

---

## 12. Later: integrity v2 (run only when a trigger fires)

Role: Security Engineer. Triggers: 1,000 registered players, first recruiter or firm inbound, first credible cheating report, or a sponsored event.

```
Task: build integrity v2 against the real data we now have, retroactively over public rated histories.

Read: PM integrity-and-trust.md (v2 column), the reports table and triage notes, decision-timing logs, accuracy data, rating history.

Build, each as an offline analysis job first (queue or scheduled script), a human review queue second, never auto-ban:
1. External-RTA screen: accuracy and timing-variance distributions vs the population, flagged outliers with confidence and a review packet.
2. Collusion and chip dumping (6-max): seat co-occurrence score, soft-play detection in checked-down pots between linked accounts, large all-in losses with weak holdings to the same account.
3. Win-trade graph analysis for HU: match-pair graph, decayed gains against repeat opponents.
4. Multi-accounting soft linkage (device/IP) and verified-email-domain badges; phone verification to appear on the ladder if the data says it is needed.
5. Public read-only profile JSON API for firms.

For every detector: precision/recall estimate on seeded synthetic cheaters AND on the real population, a false-positive budget, and the explicit statement of what it cannot catch. Update the Fair Play page. Report the numbers faithfully; if a detector is noise, say so and do not ship it.
```

---

## 13. Optional: port the AI coach to the Worker

Role: SDE. Only if you want the coach back; the code lives in `archive/context-aware-coach` and `refs/pull/2/head`.

```
Task: port the AI coach (server/coach.ts, src/lib/coach.ts, coach-stream.ts) from the archived branch to the Cloudflare Worker.

Read: git show archive/context-aware-coach (the three files and their tests), .10x/status.md §Repository, worker/src/index.ts, the grading output (Prompt 7).

Do: re-implement as a Worker route with streaming, per-account usage limits stored in Postgres, the model key as a Worker secret, never reachable during a live rated hand (server refuses; test it), grounded only in finished-hand data the requester is allowed to see. Entry bundle stays under budget (lazy chunk). Port the old tests; add abuse tests (rate limit, prompt injection through opponent usernames or notes cannot change tool or data access).
Out of scope: the 3D terrain frontier/slice/camera port (a separate task).
```
