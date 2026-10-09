# 10x prompts for every remaining step

Ordered like the roadmap in `.10x/status.md` and the migration path in the architecture doc: **Phase 0 → Phase 1 → Phase 2 → Later.** Run top to bottom, one prompt per fresh Claude Code session. Each prompt is self-contained: mission, what to read, method, deliverables, a verifiable definition of done, when to stop and ask, and what not to do.

| #   | Phase | Prompt                                   | Source spec                                | Header skill                   |
| --- | ----- | ---------------------------------------- | ------------------------------------------ | ------------------------------ |
| 0   | all   | Operating contract (after the header)    | —                                          | —                              |
| 1   | 0     | Deploy verification + ES256 sign-in      | status.md tasks, ADR day-5 check           | `10x-Team:sre`                 |
| 2   | 0     | Tickets for Step 7 and Phases 1–2        | status.md task, ADR §Migration path        | `10x-Team:engineering-manager` |
| 3   | 0     | Security review (gate)                   | status.md task                             | `10x-Team:security-engineer`   |
| 4   | 0     | DBA review (gate)                        | status.md task                             | `10x-Team:dba`                 |
| 5   | 0     | **Step 7:** hardening, CI, launch        | ADR §Migration path row 7                  | `10x-Team:sde`                 |
| 6   | 1     | Heads-up duplicate engine and match flow | `heads-up-duplicate-ladder`                | `10x-Team:principal-architect` |
| 7   | 1     | Grading pipeline + accuracy              | `rating-and-leaderboard` §Accuracy         | `10x-Team:sde`                 |
| 8   | 1     | Glicko-2 rating, ladder, public profile  | `rating-and-leaderboard`                   | `10x-Team:sde`                 |
| 9   | 1     | Integrity v1 + review→lesson loop        | `integrity-and-trust` v1                   | `10x-Team:sde`                 |
| 10  | 2     | N-seat `Table` and casual 6-max          | `six-max-tables`                           | `10x-Team:qa-engineer`         |
| 11  | 2     | Arenas and 6-max rating                  | `six-max-tables`, `rating-and-leaderboard` | `10x-Team:principal-architect` |
| 12  | Later | Integrity v2 (only when triggered)       | `integrity-and-trust` v2                   | `10x-Team:security-engineer`   |
| 13  | Later | Optional: port the AI coach              | status.md §Repository                      | `10x-Team:sde`                 |

**How to paste.** In a fresh session send, as one message: the prompt's header line (for example `/10x-Team:sde`), a blank line, the operating contract (#0), a blank line, the prompt. The header loads the right 10x role skill first; the prompt names any mid-task role switches inline ("invoke /10x-Team:qa-engineer for this block").

**Why not the `/10x-Team:10x-team` orchestrator.** It starts every task with brainstorming and roams across all twelve roles. These prompts are already decided and scoped, so a single focused role per prompt, with named switches, gives tighter output and less drift. Use the orchestrator only for a brand-new initiative with no spec.

Not prompts, your decisions: the five open questions at the end of `.10x/decisions/architect/multiplayer-platform.md` (commitment scheme, invite-link visibility, domain, plan state) and the dashboard steps in `.10x/handoff.md`. Prompt 1 assumes both are done. Prompts 3 and 4 are gates: both finish before Prompt 5 deploys.

Already true in the repo (so prompts do not ask you to build it): `typecheck:worker`, `worker:test`, `engine:soak` scripts exist; `ci.yml` runs check + e2e, and `playwright.config.ts` already starts `wrangler dev` for the two-browser live e2e; `wrangler.jsonc` has observability on and the `TABLE`/`LOBBY` DOs; `worker/src` has `auth, clock, controller, deadlines, env, index, lobby, shuffle, supabase, table`. Still missing: queues, rate limits, Origin allowlist, deploy/soak workflows, bench test, smoke script, Fair Play page.

---

## 0. Operating contract (goes after the header line, before every prompt)

```
OPERATING CONTRACT — read fully before touching anything.

Context. QuantPoker: a quant-poker trainer plus (in progress) online play-money poker with a chess-style rating. One Cloudflare Worker serves the site and the game server (Durable Objects TableDO/LobbyDO); Supabase holds auth and the hand archive. Solo builder, AI-assisted, shipping fast but trusted: a rating on a résumé is only worth what its fairness is worth.

Branch/PR rules. Work only on the branch this session gives you. Never push elsewhere. Never open a PR unless asked. Commit in small, reviewable steps with messages that say why.

Orient (mandatory, in this order, parallelise the reads with subagents where the files are independent):
1. .10x/status.md  2. latest section of .10x/handoff.md  3. the files the task names.
The ADR and PM specs are decided; do not re-litigate. Where the code disagrees with a doc, the code is the truth: say so and fix the doc. Where the spec is silent, choose the simplest option that keeps the specified guarantees and write the decision down.

Method (follow it, do not shortcut it):
1. PLAN FIRST. Before editing, write a plan of at most 15 lines: the smallest change that meets the definition of done, the files you will touch, the riskiest assumption, and how you will test that assumption first. Verify the riskiest assumption before building on it.
2. RED THEN GREEN. For every behaviour change, write the failing test first, run it, see it fail for the right reason, then make it pass. Bug fix = a test that reproduces the bug. Never write a test that cannot fail.
3. SMALLEST SCOPE. Do exactly the task. Note adjacent problems in the handoff under "Noticed, not done"; do not fix them here.
4. ADVERSARIAL SELF-REVIEW. Before each commit, reread your own diff as a hostile reviewer: what input, ordering, retry, restart, or malicious client breaks this? Fix what you find or record it.
5. VERIFY LIKE A USER. Tests passing is necessary, not sufficient. Run the real thing (wrangler dev, two real browsers, a killed socket, a restarted DO) and say what you saw.

Non-negotiables:
- Server owns the cards. No client ever receives an opponent's hole cards, the deck, or analysis data during a live rated hand. Any new message type gets a redaction test.
- Entry bundle stays under 150 kB (npm run build runs scripts/check-bundle.mjs). Lobby/network/lab stay lazy chunks.
- src/engine: no Math.random, timers or globals; never await inside the evaluator hot path.
- Never skip, disable, loosen or delete a test to get green. A flaky test is a bug with a cause; find it.
- Migrations are additive, live in supabase/migrations, and ship with a PGlite RLS test (supabase/tests). Never write to production data while investigating; read-only unless the task says otherwise.
- Secrets are never printed, logged, committed, or sent anywhere except their one intended host. Never ask me to paste a full token or key.
- Destructive or outward-facing actions (production deploys, deletes, force-pushes, dashboard changes, sending anything externally) need my explicit go-ahead in this session.

Gates (run them; paste the real command output summary with counts):
npm run typecheck && npm run typecheck:worker && npm run lint && npm test && npm run worker:test && npm run build && npm run e2e
If a gate fails, you are not done. If a gate does not exist, say so; never claim a pass you did not see.

Evidence standard. Every claim in your final report is one of: VERIFIED (you ran it, say how), INFERRED (from code/docs, say which), or UNKNOWN (say what would settle it). No unlabeled confidence. Failing tests, skipped steps and workarounds are stated plainly.

Missing inputs. If a file the task tells you to read does not exist yet (a review, the tickets, a schema doc), say so in your plan and use the fallback the task names; never invent its contents.

Unfinished work. If the task cannot be completed in this session, stop at a green, shippable commit and list exactly what remains as ready-to-run next steps. Never leave the branch red.

Stop and ask me (one concise question with your recommendation) only when: the spec forces a product tradeoff I have not decided; an action is destructive/outward-facing; or two documented requirements contradict and neither is clearly older. Otherwise decide, document, continue.

Close-out (all four, in this order):
a) .10x/status.md: tick tasks, update phase line and date.
b) Append a dated section to .10x/handoff.md in the existing format: Read first / User actions / What to test / What to review / Noticed, not done / Next step.
c) Append your log to .10x/decisions/<role>/<feature>.md: what you built, deviations from the ADR and why, numbers measured.
d) Commit and push the designated branch. Final message: 5 lines max — what is now true, evidence, what I must do, what is next.
```

---

# PHASE 0: Foundation (finish `multiplayer-platform`)

## 1. Deploy verification and first real ES256 sign-in

**Header:** `/10x-Team:sre`. Production ground truth: read-only checks, evidence over assertions. SRE is stricter than SDE about not changing what it inspects.

```
MISSION. Phase 0 claims "two browsers play each other through the Worker" and "every hand is archived", but those claims have not been checked on the deployed system after the repo cleanup. Establish ground truth before anything is built on it, and close the ADR day-5 auth check. Evidence over assertions.

READ: .10x/handoff.md (cleanup section), .10x/status.md §Repository and §Stack, wrangler.jsonc, worker/src/auth.ts, worker/src/supabase.ts, worker/test/auth.test.ts, supabase/migrations/, ADR §Auth and §Verified assumptions row 4.

PRE-CHECK: walk the user steps in .10x/handoff.md (cleanup section) and report which are done. If one blocks a check below, mark that check BLOCKED with the step I must do, and continue with the rest.

DO (read-only against production; no dashboard or schema changes):
1. Repo state: default branch is main; production deploys from main; git log shows the PR #8 squash and PR #5.
2. Migrations: Supabase MCP list_migrations equals the 7 files in supabase/migrations (names and order). Any drift is a finding.
3. GET https://quantpoker.bbcroysalman.workers.dev/api/config returns only the Supabase URL and publishable key. Assert no secret-looking field. Try an unauthenticated /ws/ upgrade and an invalid token: both must be refused with the documented close/status.
4. JWKS: fetch the project JWKS; assert exactly one ES256 key; record the kid.
5. Real sign-in: ask me to sign in once and give you ONLY the base64url of the token's first (header) segment. Decode it; assert alg=ES256 and kid matches the JWKS. If it is HS256, stop: explain the dashboard rotation; do NOT add an HS256 fallback to the Worker.
6. Archive proof: after I play one real two-account match (ask me to), use the Supabase MCP with SELECT only to confirm rows exist in matches, match_players, hands and hand_holes with consistent counts, and that SUPABASE_SECRET_KEY is therefore set. Prove RLS with two role-scoped queries (as player A, as player B): each sees only their own hand_holes row, neither sees hands_private. Do not rely on reading the policy text.
7. Record anything surprising (latency from first connect, console errors, warnings) as findings.

DONE WHEN: .10x/reviews/<date>-deploy-verification.md exists with a table (check, command or query, result, VERIFIED/INFERRED/UNKNOWN); every item from the DO list has a verdict; failing checks have a proposed fix and an owner (you or me); status.md tasks "first real sign-in" and "SUPABASE_SECRET_KEY" are ticked only if proven.

DO NOT: change infrastructure, apply migrations, add features, or print the token.
```

## 2. Tickets for Step 7 and Phases 1–2

**Header:** `/10x-Team:engineering-manager`. Tickets, estimates calibrated on real velocity, critical path and parallel lanes are this role's core output. It writes no code, which is what this step needs.

```
MISSION. The remaining plan is big and the builder is one person working through AI sessions. Convert it into tickets so unambiguous that a fresh session can pick any ticket and finish it without asking questions, and so the order of work is the shortest path to a trustworthy ladder. Do not write product code.

READ: .10x/status.md, ADR §Migration path, §Out of scope, §Risks, all four PM feature files, .10x/prompts.md (the prompts are the draft scope per ticket), the deploy verification (Prompt 1), and the SDE log for how long Steps 1–6 really took versus the ADR estimate (use that ratio to calibrate).

METHOD:
1. Inventory every deliverable named in the PM specs and ADR for Step 7, Phase 1, Phase 2. Build a traceability table: spec requirement → ticket id. Any requirement without a ticket is a gap; any ticket without a requirement is scope creep (cut or justify).
2. Slice vertically. Each ticket ships something testable end to end (migration + worker + UI + test), not a layer. Max 2 days of work each; split anything larger.
3. For each ticket write: id, goal in one sentence, user-visible outcome, files to create/change (real paths from the repo), dependencies, estimate in half-days with a confidence (H/M/L), acceptance tests as concrete test names with the assertion (e.g. `worker/test/duplicate.test.ts › segment 2 deals segment 1's decks, seats swapped, card-for-card`), the riskiest assumption and the cheapest experiment that checks it, and the cut line (what ships if time runs out).
4. Build the critical path and mark which tickets can run as parallel sessions without merge conflicts (name the files that would collide).
5. Reconcile contradictions: PM vs ADR vs status.md (for example success metrics that need data we do not record). Resolve the clear ones; list the rest as at most 5 questions for me, each with your recommendation.
6. Leave an explicit "fold in review findings" slot on Step 7 and Phase 1 tickets: the security and DBA reviews (Prompts 3, 4) run after you and will adjust them. List which tickets are most likely to change.
7. Make every PM success metric measurable: name the table/column or log line that produces it, or mark it "needs instrumentation" and add the ticket.

DONE WHEN: .10x/tickets.md has the traceability table, all tickets, the critical path with parallel lanes, the question list, and a 5-bullet summary at top (total estimate, earliest ladder date at the calibrated pace, the top 3 risks).

DO NOT: start implementing, re-decide the ADR, or invent features the PM files do not contain.
```

## 3. Security review (gate before Step 7 deploy)

**Header:** `/10x-Team:security-engineer`. Threat modelling and real exploit attempts.

```
MISSION. A rating that recruiters trust is only as good as the weakest exploit. Find real, demonstrable weaknesses in Phase 0 before strangers arrive. Prefer a working exploit or failing test over a theoretical concern; rank by what an attacker with a normal account can actually do.

READ: worker/src/{auth,table,lobby,supabase,index,shuffle,deadlines,controller}.ts, src/shared/protocol.ts, src/engine/{redact,deck}.ts and tests, supabase/migrations/* and supabase/tests, the handoff reviewer pointers for Steps 5 and 6, PM integrity-and-trust.md, QA notes.

METHOD. For each threat below, (a) state the attacker and goal, (b) attempt it for real (a Worker test with a hand-rolled malicious client, a PGlite query as another role, a crafted frame), (c) record result: EXPLOITED / HELD / NOT TESTABLE, with the artifact.
1. Auth: ES256-only, issuer/audience/exp/nbf enforcement; alg=none, HS256-with-public-key confusion, wrong issuer, expired and not-yet-valid tokens; token only in the subprotocol and never logged; the dev.<user>.<secret> path impossible when DEV_AUTH_SECRET is absent and fail-closed when blank/short.
2. Seat and session integrity: invite-link claim race (two clients, one empty seat); acting out of turn; acting for the other seat; replaying an old action with a stale seq or reused idempotency key; two sockets on one account; reconnect hijack.
3. Information leaks: walk EVERY server→client frame type and error/close reason with the redaction rules: welcome, state, hand_end, reveal, errors, the 4409 body. Check logs for cards/tokens. Check frame size/timing side channels that could reveal a hidden card or whose turn is auto.
   Also: Supabase Auth settings (email confirmation required, redirect URL allowlist has no wildcard to a foreign host), the post-sign-in return path (src/lib/authReturn.ts) for open redirects, and that DEV_AUTH_SECRET exists only in local/e2e config, never in wrangler.jsonc vars.
4. Commitment scheme: can the server cheat undetectably; can a client predict the deck; does the per-hand secret ever leave the Worker before reveal; does reveal expose more than publicSlots.
5. Database: from anon, authenticated-self, authenticated-other, service: matrix of read/insert/update/delete on every table; hands_private and hand_holes isolation; security definer functions have search_path '' and are not executable by anon/authenticated; service key goes only to ${SUPABASE_URL}/rest/v1/rpc/*; username enumeration and profile exposure.
6. Abuse/DoS: oversized or malformed frames, frame floods (table and lobby have no limiter yet), queue flooding, match-creation spam, alarm abuse, unbounded Durable Object storage growth, WebSocket connection floods per account/IP.
7. CI/supply chain: workflow permissions, secrets reachable from fork PRs, unpinned actions, dependency advisories (npm audit, read the results critically).

DELIVERABLE. .10x/reviews/<date>-security-review.md: executive summary (3 lines), then a findings table (id, severity Critical/High/Medium/Low, exploit steps, impact, fix, status). Fix every Critical/High and every small local Medium with a test that fails before and passes after (show both runs). Everything else becomes a ticket with exact file:line for Prompt 5 (Step 7). Also list what you did NOT test and why.

DONE WHEN: every item 1–7 has a recorded verdict; zero unfixed Critical/High, or an explicit written risk acceptance request to me; gates green.

DO NOT: weaken any test, touch Phase 1 designs, run load against production, or "fix" by hiding information in logs while leaving the leak.
```

## 4. DBA review (gate before Step 7 deploy)

**Header:** `/10x-Team:dba`. Schema, indexes, RLS, retry-safety and growth modelling.

```
MISSION. Ratings, ladders and public profiles are about to be built on seven migrations nobody has reviewed. Make sure the schema is correct, retry-safe, fast for the queries Phase 1 will run, and cheap at the projected volume — and design the additive Phase 1 schema before SDE work needs it.

READ: supabase/migrations/* (all 7), supabase/tests/migrations.test.ts, ADR §Data model and §Verified assumptions row 8, PM rating-and-leaderboard.md, heads-up-duplicate-ladder.md, integrity-and-trust.md.

METHOD. Production is read-only (Supabase MCP: list_tables, list_migrations, get_advisors, list_extensions, execute_sql with SELECT/EXPLAIN only). All generated-data experiments run in PGlite (the harness supabase/tests already uses) loaded with the same migrations; state when a PGlite timing may differ from hosted Postgres 17.
1. Advisors: run security and performance advisors; triage every item as real / accepted (with reason) / false positive.
2. Query shapes and indexes: for each Phase 1 query write the real SQL and run EXPLAIN (ANALYZE) over generated data at 10k, 100k, 1M rows: profile last-20 matches; player match history; same-pair-pairings-today (the ≤2/day rule); ladder by rating with eligibility filters and pagination; hands by match; abandonment rate over 30 days; outbox/idempotency lookup. Missing or redundant indexes are findings with the migration to fix them.
3. Retry-safety: call record_match/record_hand twice, concurrently twice, and after partial failure; show duplicates are structurally impossible (unique constraints, ON CONFLICT), not merely unlikely.
4. Growth model: bytes per hand with and without hands_private, rows/day at 1k and 4k hands/day, the date Supabase limits bite, and a retention policy for hands_private (the deck) once revealed. Quantify cost.
5. RLS matrix: table × {anon, authenticated-self, authenticated-other, service} × {select, insert, update, delete}. Every cell that is not already covered by a PGlite test gets one.
6. Design (write, do not apply) the Phase 1 migrations as SQL with rationale and rollback notes: per-format Glicko-2 rating state (mu, phi, sigma) and rating history; per-decision grades and accuracy aggregates; match result with per-segment bb totals and draw band; reports; sanctions columns; ladder materialisation if needed. Name the constraints that protect integrity (a match is rated at most once; rating history append-only).

DELIVERABLES. .10x/reviews/<date>-dba-review.md (findings table: id, severity, evidence, fix) and .10x/decisions/dba/phase1-schema.md (proposed SQL + the queries it was designed against + EXPLAIN evidence). Apply a migration only to fix a real defect found here, with a PGlite test, and say so loudly.

DONE WHEN: every advisor item triaged; every Phase 1 query has a plan and measured timing; RLS matrix complete and fully tested; the schema doc is complete enough that Prompts 7–9 never need to invent a table.

DO NOT: modify production data, apply speculative Phase 1 migrations, or recommend extensions/plans without the cost.
```

## 5. Step 7: hardening, CI, launch

**Header:** `/10x-Team:sde`. Most of this step is code (limits, queues, bench, smoke script). The prompt switches role in place for item 5 (`/10x-Team:devops-engineer`) and items 6 and 8 (`/10x-Team:sre`).

```
MISSION. Phase 0 works for friends. Make it survive strangers: abuse, restarts, late alarms, bad actors, and a bad deploy — and make failures visible. This is the last Phase 0 step; when it is done, the system can be pointed at the public.

READ: ADR §Migration path row 7, §Failure modes, §Local development/testing/CI, §Post-hand grading placement, §Verified assumptions rows 2, 5, 6; .10x/decisions/sde/multiplayer-platform.md (Steps 5–6); the security review (Prompt 3), DBA review (Prompt 4) and tickets (Prompt 2). Every High/Medium finding from the reviews is in scope here unless the review says otherwise. Existing: typecheck:worker, worker:test, engine:soak, ci.yml, observability on.

BUILD (each with a failing test first):
1. Limits. Per-socket token bucket and max frame size in TableDO and LobbyDO → typed error, then close with a documented code; per-account match-creation limit; per-IP connection cap if the platform allows (otherwise document). Tests: flood, oversized frame, slow-drip frames.
2. Origin allowlist on WebSocket upgrade (same origin + localhost in dev) with tests for missing/foreign Origin.
3. HAND_QUEUE. Producer in endOfHand; verify consumer (re-run the engine over recorded actions: chip conservation, final stacks, commitment matches reveal) with max_batch_size 1; DLQ consumer writing an incidents row. Idempotent under redelivery and out-of-order delivery. A consumer failure must never block play or archiving.
4. Bench. bench.test.ts in Node with process.cpuUsage on cold boards, recording the one-time preflop-table cost; fail above the per-decision CPU budget (500 ms). Note performance.now() is frozen in deployed Workers; do not use it for the budget.
5. CI (invoke /10x-Team:devops-engineer for this item). Add: (a) deploy-check job or documented verification that the Cloudflare Git build for main succeeded; (b) engine-soak.yml nightly (100k random hands, N=2..6, invariants) failing loudly with the seed in the log; (c) confirm the live two-browser e2e (playwright.config.ts already starts wrangler dev as a second webServer) runs in CI and is not silently skipped; (d) pinned-by-SHA actions and least-privilege permissions across all workflows.
6. Observability (invoke /10x-Team:sre for items 6 and 8). One structured log line per match start/end/forfeit/no-show/error/limit-hit, ids only — never cards, tokens, or secrets (add a test that greps the log sink for hole-card patterns). A hands/day figure I can read without SQL. Document how to find a failed hand end to end.
7. scripts/smoke-ws.mjs. 20 concurrent Node ws clients, 500 hands, against wrangler dev; prints ack p50/p95/p99 and invariants; exits non-zero above 300 ms p95 or any invariant break. A --prod flag exists but refuses to run without me typing the confirmation phrase in this session; do not run it against production without that.
8. Chaos pass (by hand, record results): kill a socket mid-hand; delay the alarm; restart the DO mid-hand; two tabs on one account; Supabase down for 60 s (outbox must retry, play continues). Fix what breaks.
9. Trust content. Fair Play page (what exists today: server-owned cards, lab off mid-hand, deck commitment with the verify step, abandonment counting; what does NOT exist yet: collusion/RTA detection; how to report), "play money only" and public-hand-history ToS copy, README multiplayer section, and Phase 1 seam notes (queue, project.ts, DuplicateController, deck:<n>).

DONE WHEN: gates green; chaos pass table in the SDE log with every row VERIFIED; smoke run numbers recorded; no unfixed Critical/High from the reviews; log sink test passes; deploy to production happens only after I say go.

DO NOT: add rating, duplicate or 6-max; relax limits to make a test pass; deploy to production unasked.
```

---

# PHASE 1: HU ladder (`heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1, review→lesson loop)

## 6. Heads-up duplicate engine and match flow

**Header:** `/10x-Team:principal-architect`. Step A is a design decision that is hard to change later (deck reuse without leaks). The prompt switches to `/10x-Team:sde` for Step B.

```
MISSION. The whole ladder rests on one idea: both players play the same shuffled decks twice with seats swapped, so card luck cancels and decisions decide. Get this exactly right, including the part that is easy to get wrong: reusing decks must not leak upcoming cards.

READ: heads-up-duplicate-ladder.md in full, ADR §Durable Objects and §Randomness and deck commitment (seams: DuplicateController, deck:<n> retention, fresh secrets), src/engine/, worker/src/{table,controller,deadlines,shuffle}.ts, the DBA Phase 1 schema, tickets.

PRE-CHECK: ADR open question 1 (commitment scheme) must be answered in the ADR or status.md. If it is not, stop and ask me, with your recommendation; everything below depends on it.

STEP A — ARCHITECT ADDENDUM (≤ 1 page, appended to the ADR as an Amendment, before any code). Answer precisely:
- Storage of a match of 2 segments × N hands in TableDO (keys, size, hibernation, restore).
- Segment 2 reuses segment 1's decks with seats swapped: how are the decks committed up front, what is revealed when, and why can neither player learn a segment 2 card during segment 1 (per-use secrets, commitment per deck, what the opponent could verify afterward)?
- Stack reset to 100 bb each hand; match result = seg1 + seg2 net bb; draw band ±2 bb as a named constant.
- Clock (20 s + 60 s bank per segment), 60 s reconnect grace, three timeouts = forfeit at segment end, abandonment = loss — mapped onto the existing deadlines/alarm code.
- Failure matrix: DO restart mid-segment, one player gone for good, both gone, Supabase down at match end.
- Three spec/implementation conflicts to resolve explicitly: (1) the draw band boundary (is exactly ±2.00 bb a draw?); (2) Phase 0 forfeits immediately on the 3rd consecutive timeout, the spec says forfeit at segment end: pick one for rated play and justify; (3) the rematch button vs the ≤ 2 pairings per pair per day rule (the spec targets a ≥ 25% rematch rate): does an accepted rematch count, and what does the button show at the cap?
List every decision and the alternative you rejected. If any requirement is infeasible, say so before building.

STEP B — invoke /10x-Team:sde now.
1. DuplicateController in the TableDO, rated flag on the match, match state machine with persisted transitions.
2. The lab, equity ring and EV labels are not rendered AND not shipped while a rated hand is live. Prove it with a test that asserts the exact allowed field set of every server frame during a rated hand.
3. End-of-match screen: result in bb, win/draw/loss, rematch button (obeys the ≤2 pairings/day rule), placeholder for swings (Prompt 7 fills it).
4. Review: "compare with opponent on the same deck" side by side, showing only cards shown at showdown.
5. Lobby gets a Rated card; Casual untouched and still tested. Rated play requires a verified email.
6. On rated tables: read-guess prompts off, the ?seed and ?motion debug params ignored (test both).

TESTS THAT MUST EXIST (names in the log): segment 2 deals exactly segment 1's decks, seats swapped, card for card; per-use secrets prevent pre-reveal inference (attempt it); server rejects every non-legal action; neither client gets opponent hole cards or deck before showdown (network-level); commitments verify for reused decks; forfeit / no-show / disconnect each produce the right result and abandonment row; DO restart mid-segment resumes to an identical state; draw band boundaries (±2.0, ±2.01); e2e with two clients passes the keyboard loop, axe, mobile layout, frame time.

DONE WHEN: a scripted 40-hand rated match runs end to end in wrangler dev with a restart in the middle and ends with the correct result, archived rows and verifiable commitments; gates green; addendum merged into the ADR.

DO NOT: write rating math, grading, or ladder UI; change casual behaviour.
```

## 7. Grading pipeline and accuracy

**Header:** `/10x-Team:sde`. Implementation-heavy. The prompt switches to `/10x-Team:qa-engineer` for the VALIDATE block, so the model is checked by a role whose job is to break it.

```
MISSION. Accuracy is the second number on every profile. It must be computed server-side after the hand, never during it, be cheap, be repeatable, and be labelled honestly: it measures play against a model opponent, not a solver.

READ: rating-and-leaderboard.md §Accuracy, ADR §Post-hand grading placement (queue, max_batch_size 1, measured CPU), src/lib/{grading,model,range,equity.worker,sim,poker}.ts, src/engine/project.ts + project.test.ts (grading-equality), the Step 7 queue consumer and bench, the DBA schema for grades.

BUILD:
1. Population opponent model for humans (position-aware preflop ranges, simple postflop continuation policy) behind the same interface as the uniform model. Document every number and its source. The UI label is exactly "Accuracy vs. a model opponent, not a solver."
2. Grading consumer: per decision, EV lost as a share of pot → Best/Good/Inaccuracy/Mistake/Blunder and a 0–100 accuracy. Heads-up hands fully graded. Idempotent on redelivery; a grading failure never blocks the next hand, the match result, or the rating update (it degrades to "not graded yet" and retries).
3. Persist per-decision grades (additive migration, PGlite RLS: no player can read any grade, own or opponent's, until the match is finished (grades mid-match are analysis data and break the lab-off rule); after the match both players read both sides).
4. Rolling accuracy over the last 500 graded decisions; grade distribution; extend the luck-vs-skill chart across rated matches.
5. Log decision time per action (for integrity v2). No detection.

VALIDATE (invoke /10x-Team:qa-engineer for this block; its job is to break the model):
- Golden set: 50 recorded hands graded identically by the client trainer and the server consumer.
- Replay determinism: same input → same grades bit for bit.
- Bench within CPU budget on cold boards, worst-case multiway-free HU spots included.
- Sanity on synthetic players: always-fold, always-call, a tight-aggressive scripted policy, and Atlas's own policy must rank in the order a poker player would expect. If they do not, the model is wrong; say so before shipping.
- Write down in the log what the model misjudges (human tendencies it ignores) and the exact analysis you would run on real data later (Spearman of rating vs accuracy, target > 0.4).

DONE WHEN: grades appear after real rated hands in wrangler dev; redelivery test passes; sanity ordering holds; gates green.

DO NOT: send any analysis to a client during a live rated hand; grade multiway (that is Phase 2); change the displayed label.
```

## 8. Glicko-2 rating, ladder, public profile

**Header:** `/10x-Team:sde`. The prompt switches to `/10x-Team:dba` for ladder queries and indexes (item 4) and the metrics instrumentation.

```
MISSION. The number people climb and recruiters read. It must move noticeably after each match, show its own uncertainty, resist gaming, and be explainable from a public method page.

READ: rating-and-leaderboard.md in full, the DBA Phase 1 schema, heads-up-duplicate-ladder.md acceptance criterion 4, grading output (Prompt 7), existing hash-route and lobby code in src/net.

BUILD:
1. Glicko-2 as a pure module (no I/O) with unit tests against the published Glickman worked example to the printed digits; draw handling and the rating-period convention as named, commented constants; versioned (`glicko2.v1`).
2. Rating update in one transaction when a rated match completes: idempotent, a match rated at most once (constraint), append-only history. Forfeit/abandon rules per spec. Provisional until RD < 100 or ≥ 20 matches, whichever is later.
3. Matchmaking: rated quick-match pairs near rating with a window that widens with wait time; keeps the ≤ 2 pairings per pair per day rule; never pairs the same two accounts as an instant rematch loop beyond the limit.
4. (Invoke /10x-Team:dba for this item and the INSTRUMENT block.) Ladder per format, all-time and this month: rank, player, rating ± RD, accuracy, matches, win rate, trend; ≥ 20 rated matches to appear; eligibility (not provisional, ≥ 1 match in 30 days, abandonment < 10%); provisional players see "X matches to go". Keyset pagination; EXPLAIN evidence in the log.
5. Public profile (route form per the domain decision): rating ± RD over time, accuracy, volume, last 20 matches with review links, abandonment rate, sanctions field (empty), link to a Method page stating formulas and versions; OG share image. Hole cards only where shown at showdown.
6. End-of-match screen shows the real rating change and why.

TESTS: published-example match; properties over random match sequences (RD shrinks with play and grows with inactivity, a win never lowers rating, upsets move more than expected results, repeat updates are idempotent); RLS for profile and ladder reads; e2e for ladder and profile; axe and mobile layout.

INSTRUMENT the PM metrics as a script or SQL view I can run today, producing "insufficient data" honestly when it is: predictive validity at gap ≥ 150 (target ≥ 60%), median absolute rating change < 15, Spearman(rating, accuracy) > 0.4. Never seed fake data into production.

DONE WHEN: a simulated 200-player, 5k-match season in a scratch DB produces sane ladders and the metrics script runs on it; gates green.

DO NOT: add a Quant Score ladder (P1), merge formats, or hide RD.
```

## 9. Integrity v1 and the review→lesson loop

**Header:** `/10x-Team:sde`. The prompt switches to `/10x-Team:product-manager` for the lesson mapping (item 6: a product judgement about what to teach) and to `/10x-Team:security-engineer` for the final adversarial pass.

```
MISSION. Two things that turn a game into a credible product: protections that cost almost nothing but make the ladder defensible, and a loop that turns each mistake into learning (the reason people return).

READ: integrity-and-trust.md (v1 column and Sanctions v1), the security review and Prompt 5 outcomes, multiplayer-platform.md PM file (review→lesson loop), src/curriculum/ (the Learn tab, its item ids and tags), src/lib/grading.ts, src/net/ReviewLive.tsx.

BUILD — Integrity v1:
0. Confirm from Prompt 6 that rated play requires a verified email and one active table per account; add the test if missing.
1. Abandonment score; > 10% removes ladder eligibility until it recovers; shown on profile.
2. Report button in review → reports table (additive, RLS: reporter inserts only, service reads), rate-limited, includes match id and optional note; a minimal admin triage script or view. SLA 7 days is a number you can compute from the table.
3. Sanctions plumbing, manual only and logged: profile flag, rating reset, ladder removal, one appeal field. No auto-bans.
4. Win-trade guard (≤ 2 pairings per pair per day) end to end, with a test through the real lobby.
5. Update the Fair Play page to describe exactly what now exists, nothing more.

BUILD — Review→lesson loop:
6. (Invoke /10x-Team:product-manager for this item.) Map error classes and decision types to curriculum items (start with what Learn already teaches; produce a gap list for what it does not). Mapping is data with a completeness test: every grade class either links to a lesson or is explicitly "none yet".
7. From a graded mistake in review, deep link to the lesson with the situation pre-loaded where the lab supports it.
8. Post-match "what to review first": the three biggest EV swings, each with its lesson link.

TESTS: CI gate asserting zero analysis data on any client frame during a live rated hand (this is a PM success metric: 0); commitment verification failures = 0 across a 500-hand smoke; report flow e2e; abuse tests on reports (spam, self-report, report of a match you were not in); sanction endpoints reject non-admins.

FINISH by invoking /10x-Team:security-engineer for a short adversarial pass on the report and sanction paths and record the result.

DONE WHEN: all of the above verified in wrangler dev with two accounts; gates green.

DO NOT: build v2 detectors, auto-ban anyone, or claim protections the Fair Play page cannot back.
```

---

# PHASE 2: 6-max (`six-max-tables` casual, then rated arenas)

## 10. N-seat `Table` and casual 6-max

**Header:** `/10x-Team:qa-engineer`. The step opens with a hard correctness gate (100k hands against a reference). QA owns that gate. The prompt switches to `/10x-Team:sde` once the gate is green.

```
MISSION. The user's bar is "highest quality, especially 6-max". Retire the heads-up crutch and ship casual 6-max that feels as good as the trainer table and is provably correct about chips.

READ: six-max-tables.md in full, ADR §Engine N-player generalisation and the toHeroGame risk note, src/engine invariants and soak, src/components Table/ActionBar and motion code, worker/src/table.ts, e2e frame-time and mobile tests.

HARD GATE FIRST. Before any UI work, run the engine through the reference comparison: 0 failures over 100k simulated random 6-max hands for chip conservation, side-pot sums, legal action sets, showdown award order, odd-chip rule. Extend the reference implementation or crafted cases if coverage is thin (multiple all-ins, split pots with odd chips, folded dead money, short stacks). If anything fails, stop and fix the engine; UI waits. When the gate is green, invoke /10x-Team:sde for BUILD.

BUILD:
1. N-seat Table: six seats with the same card art, chips and spring choreography; side-pot chip animation; turn indicator and timer legible on a phone; keyboard parity. Replace toHeroGame everywhere; a generic seat plate for humans (Atlas's avatar is for Atlas only).
2. Table service: 6 seats, 100 bb fixed, blinds 1/2, rebuy to 100 bb when below, sit/stand, join = sit in the next hand. Dead-button rule: pick the standard rule, write it into the ADR, test it with crafted departures.
3. Clock 20 s + 30 s bank per orbit; sit-out after 2 consecutive timeouts; removal after 3 orbits.
4. Atlas bots back-fill so no table is empty, clearly labelled; never at rated tables.
5. Table list: seats, average pot, players/hour; quick-sit.
6. 60 s reconnect keeps the seat; handle mobile Safari background tabs (test what you can, document what you cannot).
7. Post-hand review with the lab for every seat played; decisions in pots that are heads-up at the moment of the decision are graded (reuse Prompt 7's consumer); multiway decisions show "not graded" with a count.
8. 6-max stats on profile: VPIP, PFR, aggression, luck-adjusted bb/100.

QUALITY GATES: action-to-render p95 < 150 ms with six seats; zero dropped frames through a 3-way all-in runout (extend the frame-time Playwright test); axe and mobile layout at 320 px; all earlier gates.

DONE WHEN: six clients (scripted Node clients, plus at least two real browsers among them) play 200 hands with joins, leaves, timeouts and a reconnect, ending with chip conservation verified and no console errors.

DO NOT: ship rated arenas, or let a bot sit at a rated table.
```

## 11. Arenas and the 6-max rating

**Header:** `/10x-Team:principal-architect`. ArenaDO (seating by band, rebalancing) is new architecture. The prompt asks for a short design note, then switches to `/10x-Team:sde`.

```
MISSION. Give 6-max a rating people can believe: scheduled humans-only arenas and a luck-adjusted result model, shown as provisional until the data supports it.

READ: six-max-tables.md §Format (Arena) and §Gates, rating-and-leaderboard.md §6-max, the Glicko-2 module and ladder (Prompt 8), casual 6-max invariant results from Prompt 10 and the first human hands.

PRE-CHECK (stop if it fails): 0 invariant failures over 100k simulated hands AND over the first 1,000 human casual hands. Report the counts.

DESIGN NOTE (≤ half a page, appended to the ADR): ArenaDO ownership of seating, rating-band rules, the rebalancing algorithm, what happens to a hand in progress during a rebalance, and the failure matrix. Then invoke /10x-Team:sde for BUILD.

BUILD:
1. Arena scheduling: fixed 60-minute windows announced in the lobby (plus email/notification only if the infrastructure exists; otherwise record the gap). An ArenaDO seats by rating band, rebalances as people leave, humans only.
2. Luck-adjusted bb/100: all-in pots settled at equity; convert to pairwise results per opponent weighted by shared hands; feed Glicko-2 for the 6-max format (separate rating, never merged with HU).
3. Fewer than 4 humans in a window → played but not rated. Provisional until ≥ 500 rated hands; ladder lists provisional players separately.
4. Ladder and profile show the 6-max rating with RD and volume side by side.

TESTS: luck adjustment against hand-computed examples (include a runout where the loser was 95% ahead); a player who is unlucky but plays well does not lose rating relative to expectation; conservation and symmetry properties of the pairwise conversion; arena rebalancing under joins/leaves/disconnects; e2e with six simulated clients; instrument the PM 6-max success metrics honestly.

DONE WHEN: a scripted 60-minute arena with 12 scripted test-account clients (test environment only; never Atlas bots, never production) across 2 tables rebalances correctly and produces plausible ratings; gates green.

DO NOT: build collusion detection (growth-triggered, Prompt 12) or treat provisional ratings as final in any UI.
```

---

# LATER (triggered)

## 12. Integrity v2 (run only when a trigger fires)

Triggers: 1,000 registered players, first recruiter or firm inbound, first credible cheating report, or a sponsored event.

**Header:** `/10x-Team:security-engineer`. Detectors and sanctions are security calls. The prompt switches to `/data:statistical-analysis` for precision/recall and false-positive estimates.

```
MISSION. Defend the ladder with evidence, not vibes. Build detectors against the real data we now have and apply them retroactively to public rated histories. Humans decide sanctions; the system produces ranked, explainable review packets.

READ: integrity-and-trust.md (v2 column), the reports table and triage log, decision-timing logs, accuracy and rating history, the Fair Play page, the security review.

BUILD, each as an offline job first, a review queue second, never an auto-ban:
1. External-RTA screen: accuracy and timing-variance distributions against the population, outliers with confidence and a review packet (hands, timings, comparison to peers).
2. Collusion/chip dumping (6-max): seat co-occurrence score, soft-play in checked-down pots between linked accounts, large all-in losses with weak holdings to the same account.
3. Win-trade graph for HU: match-pair graph, decayed gains against repeat opponents.
4. Multi-account soft linkage (device/IP) and verified email-domain badges; phone verification for the ladder only if the data justifies it.
5. Public read-only profile JSON API for firms.

FOR EVERY DETECTOR (invoke /data:statistical-analysis for the evaluation): evaluate on seeded synthetic cheaters AND on the real population; report precision/recall, the false-positive budget (how many innocent players per 1,000 flagged), and what it cannot catch. If a detector is noise, say so and do not ship it. Update the Fair Play page to describe exactly what exists.

DONE WHEN: each shipped detector has an evaluation report, a human review workflow, and an appeal path; the API respects profile privacy rules.

DO NOT: auto-sanction, publish raw suspicion scores, or ship anything whose false-positive rate you did not measure.
```

## 13. Optional: port the AI coach to the Worker

**Header:** `/10x-Team:sde`. The prompt switches to `/10x-Team:security-engineer` for the abuse and prompt-injection tests. Code lives in `archive/context-aware-coach` and `refs/pull/2/head`.

```
MISSION. Bring back the AI coach on the new stack without weakening fairness or exposing keys. It explains finished hands; it must be impossible to use as real-time assistance.

READ: git show archive/context-aware-coach for server/coach.ts, src/lib/coach.ts, coach-stream.ts and their tests; .10x/status.md §Repository; worker/src/index.ts; grading output (Prompt 7); the security review.

BUILD: a Worker route with streaming; per-account usage limits in Postgres (additive migration + RLS test); the model key as a Worker secret and never sent to the client; grounded only in finished-hand data the requester is allowed to see; refused server-side whenever the requester has a live rated hand (test it, including races where a hand starts mid-request); lazy chunk keeping the entry bundle under budget; ported tests; then invoke /10x-Team:security-engineer for abuse tests (rate limits, prompt injection via opponent usernames, notes or hand text cannot expand data access or tool use; output never echoes secrets).

DONE WHEN: coach works on a finished hand in wrangler dev, is refused during a live rated hand, and all gates are green.

DO NOT: port the 3D terrain frontier/slice/camera (separate task), or let the coach see hidden cards of any hand not finished.
```
