# 10x prompts for what is left

Rewritten 2026-10-10 against `main` at `a3b9aed` (PR #26). It replaces the 2026-10-09 version that lived only on the branch `claude/amazing-ride-4vip4x`. That version's Prompts 1–5 are done, its Prompt 6 was written for the same-deck duplicate format that Q1 = B dropped, and most of its Prompts 7 and 8 is built.

Order: **finish Phase 0 → Phase 1 → Phase 2 → Later.** One prompt per fresh Claude Code session, top to bottom, except where "Runs after" allows two at once. Each prompt names the tickets it closes; the acceptance tests under those tickets in `.10x/tickets.md` are the definition of done.

| #   | Phase | Prompt                                         | Tickets             | Header                          | Runs after                       |
| --- | ----- | ---------------------------------------------- | ------------------- | ------------------------------- | -------------------------------- |
| 0   | all   | Operating contract (after the header)          | —                   | —                               | —                                |
| 1   | 0     | Production proof of the rated pipeline         | S7-11               | `/10x-Team:sre`                 | U-4 (your Supabase key)          |
| 2   | 0     | Queue wait, ack latency and a build marker     | S7-05               | `/10x-Team:sde`                 | nothing; can run beside 3        |
| 3   | 1     | Live table keyboard, sounds and quality gates  | P1-07               | `/10x-Team:sde`                 | nothing; can run beside 2        |
| 4   | 1     | Review any finished match                      | P1-05, P1-06        | `/10x-Team:sde`                 | 3 (both edit `src/App.tsx`)      |
| 5   | 1     | The ladder                                     | P1-14               | `/10x-Team:dba`                 | nothing; can run beside 4        |
| 6   | 1     | Public profile, share card and Method page     | P1-15, P1-16        | `/10x-Team:sde`                 | 4 and 5                          |
| 7   | 1     | Reports, sanctions and appeals                 | P1-17, P1-18        | `/10x-Team:sde`                 | 6                                |
| 8   | 1     | Mistakes to lessons, and what to review first  | P1-19, P1-20        | `/10x-Team:sde`                 | 4; can run beside 6 or 7         |
| 9   | 1     | Metrics pack and ladder launch                 | P1-21, P1-22        | `/10x-Team:sre`                 | 1–8                              |
| 10  | 2     | 6-max engine gate, positions, pairwise results | P2-01, P2-02, P2-12 | `/10x-Team:qa-engineer`         | nothing; pure code, any time     |
| 11  | 2     | Casual 6-max table service                     | P2-03, P2-04, P2-07 | `/10x-Team:sde`                 | 9 and 10                         |
| 12  | 2     | Six-seat table UI, side pots and table list    | P2-05, P2-06, P2-08 | `/10x-Team:sde`                 | 11                               |
| 13  | 2     | 6-max review, stats and six-client acceptance  | P2-09, P2-10, P2-11 | `/10x-Team:sde`                 | 12                               |
| 14  | 2     | Arenas and the 6-max rating                    | P2-13, P2-14, P2-15 | `/10x-Team:principal-architect` | 13, and 1,000 human casual hands |
| 15  | Later | Integrity v2 (only when triggered)             | —                   | `/10x-Team:security-engineer`   | a trigger                        |
| 16  | Later | Optional: port the AI coach                    | —                   | `/10x-Team:sde`                 | nothing                          |

P2-16 (the trainer onto `src/engine`) stays cut, as the tickets recommend.

**How to paste.** In a fresh session send, as one message: the prompt's header line (for example `/10x-Team:sde`), a blank line, the operating contract (#0), a blank line, the prompt. The header loads the right 10x role skill first; the prompt names any mid-task role switches inline.

**Why not the `/10x-Team:10x-team` orchestrator.** It starts every task with brainstorming and roams across all twelve roles. These prompts are already decided and scoped, so one focused role per prompt, with named switches, drifts less.

**Already done, so no prompt asks for it** (all merged to `main` and deployed):

- Phase 0 Steps 1–7, with the security and DBA reviews; S7-12 and S7-13.
- P1-00 the rated-match design; P1-01 the rated queue and match; P1-02 the luck adjustment; P1-03 nothing to analyse on a rated table; P1-04 rematch and the end panel.
- P1-08 the population model; P1-09 per-decision grades and the grading consumer; P1-10 accuracy, its distribution and luck versus skill (shown in the lobby until the profile exists).
- P1-11 Glicko-2; P1-12 the rating update at match end; P1-13 pairing near your rating.

**Not prompts, yours to do or decide:**

- **U-4:** add `SUPABASE_SECRET_KEY` to the Worker, sign in once, and be ready to play one rated match between two of your accounts. Until then production saves nothing, so verification, grading and ratings have never run on a real match. Prompt 1 needs it.
- **U-8:** the four dashboard checks in `.10x/tickets.md` §User gates.
- **Q3** (profile URL), **Q4** (where load tests run), **Q5** (public decision times), **Q7** (`hands_private` retention). Each has a recommendation in `.10x/tickets.md` §Questions; the prompts use it, reversibly, until you answer.
- The open rematch-link finding on PR #19 (recommendation: leave it).
- PR #22, Devin's animated landing page, is outside this plan: merge, close or fold it in as you see fit.

---

## 0. Operating contract (goes after the header line, before every prompt)

```
OPERATING CONTRACT — read fully before touching anything.

Context. QuantPoker: a quant-poker trainer plus online play-money poker with a chess-style rating. One Cloudflare Worker serves the site and the game server (Durable Objects TableDO and LobbyDO, plus Queue consumers that verify every archived hand and grade rated ones); Supabase holds auth and the hand archive. Rated heads-up is live: 40 fresh-deck hands, a luck-adjusted result, per-decision grades, accuracy, Glicko-2 ratings, rematch and pairing near your rating. Solo builder, AI-assisted, shipping fast but trusted: a rating on a résumé is only worth what its fairness is worth.

Decided, do not reopen:
- Q1 = B: fresh decks every hand, all-in pots settled at equity. No deck is ever reused, so there is no "same deck" comparison anywhere.
- Q2: the third timeout in a row forfeits immediately.
- Q6: per-decision grades, and anything derived from them, are readable only by the match's two players, and only after the match ends.
Open: Q3 profile URL, Q4 load-test target, Q5 public decision times, Q7 hands_private retention. When you reach one, use the recommendation in .10x/tickets.md §Questions, keep it reversible, and write it down.

Branch, PR and deploy rules. The user's standing instruction is "merge when green".
- Work only on the branch this session gives you; never push elsewhere. Commit in small steps with messages that say why.
- Open one PR per finished, shippable piece (usually a ticket, or a ticket's database part) and merge it to main once CI is green.
- A merge deploys: Cloudflare Workers Builds deploys the Worker and the site, and the Supabase GitHub integration applies new migrations to production. After each merge run npm run verify:deploy; for a Worker-only change also confirm the deployed Worker carries it; for a migration confirm it read-only (the migration list and the table or function you changed). Say what you checked.
- Before merging a migration, make sure its timestamp is later than every migration on main; rename it if a parallel PR merged first.
- Everything else outward-facing needs my explicit go-ahead in this session: dashboard changes, deleting anything, force-pushes, writes to production data, load against production, sending anything outside.

Orient (mandatory, in this order; parallelise independent reads with subagents):
1. .10x/status.md  2. the latest section of .10x/handoff.md  3. git log origin/main -15 (parallel sessions merge often; start from the newest main)  4. every ticket this prompt names, in full, in .10x/tickets.md  5. the files the prompt names.
For a new table or function, start from .10x/decisions/dba/phase1-schema.md and supabase/proposed/phase1.sql; where they differ from the shipped migrations in supabase/migrations, the shipped migrations win.
The ADR (including its 2026-10-10 Phase 1 amendment) and the PM specs are decided; do not re-litigate. Where the code disagrees with a doc, the code is the truth: say so and fix the doc. Where the spec is silent, choose the simplest option that keeps the specified guarantees and write the decision down.

Definition of done. The acceptance tests under each named ticket, with their exact file and test names, plus the prompt's DONE WHEN. Extra tests are welcome. A ticket written before Q1 = B or before later tickets shipped may name a stale detail (a record_match version, a file that moved); follow the prompt's correction and log it.

Method (follow it, do not shortcut it):
1. PLAN FIRST. Before editing, write a plan of at most 15 lines: the smallest change that meets the definition of done, the files you will touch, the riskiest assumption, and how you will test that assumption first. Verify the riskiest assumption before building on it.
2. RED THEN GREEN. For every behaviour change, write the failing test first, run it, see it fail for the right reason, then make it pass. Bug fix = a test that reproduces the bug. Never write a test that cannot fail.
3. SMALLEST SCOPE. Do exactly the task. Note adjacent problems in the handoff under "Noticed, not done"; do not fix them here.
4. ADVERSARIAL SELF-REVIEW. Before each commit, reread your own diff as a hostile reviewer: what input, ordering, retry, restart, or malicious client breaks this? Fix what you find or record it.
5. VERIFY LIKE A USER. Tests passing is necessary, not sufficient. Run the real thing (wrangler dev, two real browsers, a killed socket, a restarted DO) and say what you saw, and what the local setup could not show you.

Non-negotiables:
- Server owns the cards. No client ever receives an opponent's hole cards, the deck, or analysis data during a live rated hand. worker/test/rated-leak.test.ts stays green, and every new message type gets an allowlist and redaction test.
- Entry bundle stays under 150 kB (npm run build runs scripts/check-bundle.mjs). Lobby, network, review and lab code stay in lazy chunks; src/net/imports.test.ts stays green.
- src/engine and src/rating: no Math.random, timers or globals; never await inside the evaluator hot path.
- Never skip, disable, loosen or delete a test to get green. A flaky test is a bug with a cause; find it.
- Migrations are additive, live in supabase/migrations, ship with PGlite tests in supabase/tests, and add their rows to supabase/tests/rls-matrix.test.ts. record_match, ladder() and the queue dispatch in worker/src/index.ts are redefined whole, each from the latest merged version.
- Secrets are never printed, logged, committed, or sent anywhere except their one intended host. Never ask me to paste a full token or key.

Gates (run them; paste the real command output summary with counts):
npm run typecheck && npm run typecheck:worker && npm run lint && npm test && npm run worker:test && npm run build && npm run e2e
npm test includes the SQL suites in supabase/tests. If a gate fails, you are not done. If a gate does not exist, say so; never claim a pass you did not see.

Evidence standard. Every claim in your final report is one of: VERIFIED (you ran it, say how), INFERRED (from code or docs, say which), or UNKNOWN (say what would settle it). No unlabeled confidence. Failing tests, skipped steps and workarounds are stated plainly.

Missing inputs. If a file the task tells you to read does not exist yet, say so in your plan and use the fallback the task names; never invent its contents.

Unfinished work. If the task cannot be completed in this session, stop at a green, merged, shippable point and list exactly what remains as ready-to-run next steps. Never leave the branch or main red.

Stop and ask me (one concise question with your recommendation) only when: the spec forces a product tradeoff I have not decided; an action is outward-facing beyond the merge rule above; or two documented requirements contradict and neither is clearly newer. Otherwise decide, document, continue.

Close-out (all five, in this order):
a) .10x/tickets.md: a dated Status line under each ticket you touched.
b) .10x/status.md: tick tasks, update the phase line and date. Append and tick only; never reflow other sections.
c) Append a dated section to .10x/handoff.md in the existing format: Read first / User actions / What to test / What to review / Noticed, not done / Next step.
d) Append your log to .10x/decisions/<role>/<feature>.md: what you built, deviations from the tickets or ADR and why, numbers measured.
e) Final message: 5 lines max — what is now true, evidence, what I must do, what is next.
```

---

# PHASE 0: finish `multiplayer-platform`

## 1. Production proof of the rated pipeline (closes S7-11)

**Header:** `/10x-Team:sre`. Read-only ground truth on production. Run it as soon as U-4 is done; Prompts 2–8 do not wait for it.

```
MISSION. Everything built since Step 7 passes its tests and is deployed, but production has never saved a match: without the Worker's SUPABASE_SECRET_KEY nothing was archived, so hand verification, grading, accuracy and ratings have never run on a real hand. Prove the whole rated pipeline on production with one real match, read-only, and close S7-11.

PRE-CHECK: ask me whether U-4 is done (SUPABASE_SECRET_KEY set on the Worker in Cloudflare). If not, stop and give me the exact dashboard steps, nothing else.

READ: .10x/tickets.md S7-11; .10x/reviews/2026-10-09-launch-verification.md (rows already VERIFIED); worker/src/{verify,grade,rating,supabase}.ts; every file in supabase/migrations; supabase/tests/rls-matrix.test.ts.

DO (read-only against production: the Supabase MCP on project quantpoker with SELECT only, and plain HTTPS GETs. If this session cannot see that project, say so and give me the exact SQL to paste into the Supabase SQL editor instead):
1. Migrations: production's list equals the files in supabase/migrations, names and order. Drift is a finding.
2. Token: ask me to sign in once and give you ONLY the base64url of the access token's first segment. Decode it and check alg ES256 and a kid that matches the project JWKS (146bb67a-…).
3. One real rated match: ask me to play one rated match between two of my accounts, both with confirmed emails. Then check with SELECTs:
   - matches (kind hu-rated, status finished, its result), match_players, hands and hand_holes: counts consistent with the hands played;
   - every hand verified = true within a few minutes, and no incidents rows for the match;
   - hand_grades rows for both seats on every hand, with model_version;
   - ratings rows for both players that count this match; exactly two rating_history rows for it; public.accuracy refreshed for both;
   - access by role, not by reading policy text: as player A and as player B, each reads only their own hand_holes and both seats' grades; as a third account and as anon, no hand_holes and no grades; nobody reads hands_private.
4. GET /api/stats counts the new hands; /api/health and /api/config are unchanged.
5. The smoke row: Q4 is unanswered. Record it as Open (Q4) with the local numbers. Do not run load against production.
6. Record anything surprising as findings: grading latency after the last hand, console errors, log lines, outbox retries.

DONE WHEN: the launch verification review is updated so every S7-11 row is VERIFIED or Open with its reason, with new rows for verification, grades, rating and accuracy on the real match; every failing row has a proposed fix and an owner (you or me); S7-11 is ticked in tickets.md and status.md only if proven.

DO NOT: change infrastructure or dashboards, write to production data, apply migrations, add features, or print a token.
```

## 2. Queue wait, ack latency and a build marker (S7-05)

**Header:** `/10x-Team:sde`. The last Phase 0 build ticket, plus the deploy-check gap every Worker merge has hit since.

```
MISSION. Two Phase 0 success metrics are still unmeasured: median matchmaking wait and action latency (server ack to render). And verify-deploy cannot see a Worker-only change, so every Worker merge has needed a manual look at the deployed code. Fix both.

READ: .10x/tickets.md S7-05 in full; worker/src/{lobby,pairing,table,index,limits}.ts; src/net/{client,api}.ts; supabase/migrations/20261010043000_rematch.sql (record_match v5, the latest); supabase/tests/{rated,rematch,migrations}.test.ts; scripts/verify-deploy.ts and its test; .github/workflows/deploy-check.yml.

BUILD (failing test first for each):
1. S7-05 as ticketed, corrected for what shipped since:
   - record_match is v5 now (rated outcome, rematch_of, the no-show and both-gone voids). Write v6 with create or replace from v5's body, adding queue_wait_ms. Every test in the three SQL suites above stays green.
   - Two queues pair players now: casual (oldest first) and rated (worker/src/pairing.ts, a window that widens with the wait). Record the wait for both, from queue entry to pairing. A rematch has no queue wait: store null, not 0.
   - The ticket's cut line holds: queue wait first, ack telemetry second.
2. Build marker: /api/health also returns the deployed build's identity (a commit or the Worker version id), and verify-deploy compares it with what main should be serving. Riskiest assumption: how the Worker learns its identity on Workers Builds (the version metadata binding, or a value set at build time). Check the Cloudflare docs before building. Tests: health returns the field; verify-deploy fails on a mismatch (fake fetch).

DONE WHEN: S7-05's acceptance tests pass under their names; a two-client run in wrangler dev logs real ack samples between 1 and 100 ms and stores a queue wait for both seats; gates green; merged, and the production health endpoint shows the new build's identity.

DO NOT: change pairing rules or the clock, or let any client role read the samples.
```

---

# PHASE 1: HU ladder (what is left of `heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1, and the review→lesson loop)

## 3. Live table keyboard, sounds and quality gates (P1-07)

**Header:** `/10x-Team:sde`.

```
MISSION. The live table still plays only by mouse and in silence: LiveTable passes shortcuts={false} and plays no sounds, while the trainer has both. The ladder spec makes the trainer's bar (keyboard loop, axe, mobile layout, frame time) an acceptance criterion for live tables, casual and rated.

READ: .10x/tickets.md P1-07; src/net/LiveTable.tsx and its tests; src/components/table/ActionBar.tsx (the shortcuts prop and key hints); src/App.tsx (the trainer's keydown handler and its playSound calls; the ticket's line numbers are stale); src/lib/sound.ts; e2e/{live,mobile,motion,app}.spec.ts; worker/test/rated-leak.test.ts.

BUILD as ticketed: extract the trainer's sound triggers and key handler into hooks in src/lib (the ticket calls them useTableSounds and useTableKeys) with no change to the trainer (run e2e/app.spec.ts's keyboard test before and after); wire both into LiveTable for casual and rated tables; keys act only on your turn.

Also, since the ticket was written:
- A rated table stays analysis-free: no new frame field, no lab or equity shortcut, rated-leak tests green.
- The rated match bar, turn clock, end panel and Rematch button are reachable and usable by keyboard (Tab order, Enter), and the axe check covers them.
- Sounds follow the trainer's volume and mute settings.

DONE WHEN: P1-07's acceptance tests pass under their names; you played one live hand in two browsers against wrangler dev without touching the mouse, and say what you heard; gates green; merged and verified.

DO NOT: change the trainer's behaviour, add new sounds, or touch worker code.
```

## 4. Review any finished match (P1-05, P1-06)

**Header:** `/10x-Team:sde`.

```
MISSION. Review is where a rated match turns into learning, and today's only review is the in-match list, gone when the session ends. Build the archive review: any finished match, any time, with "Deck verified", the lab and your grades. The profile (P1-15), reports (P1-17) and lesson links (P1-19) all hang off this page.

READ: .10x/tickets.md P1-05 and P1-06; src/net/{ReviewLive,useDeckCheck,MatchEnd,AccuracyPanel,supabase}.ts(x) and src/net/imports.test.ts; src/components/review/HandReview.tsx; src/components/lab/Lab.tsx; src/engine/project.ts (toHeroGame); src/App.tsx (parseRoute); supabase/migrations/20261010053000_hand_grades.sql and 20261010060000_hand_grades_pot.sql; scripts/check-bundle.mjs.

BUILD:
1. P1-05 as ticketed: #review/<matchId>/<handNo> as a lazy chunk in src/review/ (outside src/net, so the lab can load there), the archive loader, "Deck verified", and review_opened_at with its RPC. Link to it from the end panel (MatchEnd) and the lobby's Rated play panel.
2. P1-06 under Q1 = B: the lab and the grades in review. There is no "compare with opponent on the same deck" view, because no deck repeats; record that under the ticket. Grades show only to the match's two players after it ends (Q6, already enforced by RLS); anyone else sees the hands without grades and a line saying grades are visible to the two players. Grade names Best, Good, Inaccuracy, Mistake, Blunder; the accuracy label exactly "Accuracy vs. a model opponent, not a solver."
3. Q5 is open: the public hand record carries per-action decision times. Review shows none of them except "ran out of time" on clock moves.
4. The lab never mounts for a match that is still playing (test it).

DONE WHEN: P1-05's acceptance tests pass under their names; for P1-06, the lab test passes and the variant A compare test is replaced by tests that no compare view exists and that a non-player sees no grades; imports.test.ts and check-bundle pass with the entry bundle under 150 kB; gates green; merged and verified. Say what you could exercise locally and what needs the real archive (Prompt 1 covers production).

DO NOT: put supabase-js or the lab in the entry chunk, show hole cards that were not shown at showdown, or build the profile.
```

## 5. The ladder (P1-14)

**Header:** `/10x-Team:dba`. The ladder is a query problem first; the prompt switches to `/10x-Team:sde` for the page.

```
MISSION. The ladder is the number people climb and recruiters read. Ratings exist (P1-12), but nothing ranks them. Build a ladder that shows only players whose rating means something, pages correctly at scale, and ranks a simulated season by true skill.

READ: .10x/tickets.md P1-14 and its DBA fold-in; .10x/decisions/dba/phase1-schema.md (the ladder sections and D6); supabase/proposed/phase1.sql (ladder, ladder_month); what shipped: supabase/migrations/20261010080000_ratings.sql (ratings with wins, draws and abandoned; the ratings_ladder index; rating_history_month) and 20261010070000_accuracy.sql (public.accuracy; the format is 'hu-duplicate'); supabase/bench/plans.ts; src/rating/rules.ts (the provisional rule); src/net/{LiveApp,Lobby,AccuracyPanel}.tsx.

BUILD:
1. The migration, from the proposed SQL adjusted to what shipped: abandonment_rate, ladder() reading the counters (no per-candidate aggregates), ladder_month() for "this month" (R-16), keyset pagination. Eligibility exactly as ticketed: not provisional, at least 1 rated match in 30 days, abandonment under 10% (exactly 10% excludes). Rows in rls-matrix.test.ts.
2. EXPLAIN at 10k, 100k and 1M generated rows with supabase/bench/plans.ts; record the plans and timings in your log and flag any that may differ on hosted Postgres 17.
3. The season test: 200 players and 5,000 matches rank by true skill with Spearman > 0.8.
4. Invoke /10x-Team:sde for the page: #ladder inside the Online area, linked from the lobby, with no new top-nav item; rank, player, rating ± RD, accuracy, matches, win rate and trend; all-time and this month; "X matches to go" for a provisional viewer. Names stay plain text until the profile (Prompt 6) links them.

DONE WHEN: P1-14's acceptance tests pass under their names; plans recorded at three sizes; gates green; merged and verified.

DO NOT: add a Quant Score ladder, merge formats, hide RD, or build the profile.
```

## 6. Public profile, share card and Method page (P1-15, P1-16)

**Header:** `/10x-Team:sde`.

```
MISSION. A profile link is what a player shares and what a recruiter opens. Build it, make it preview well on LinkedIn, explain every number on a public Method page, and count views from outside the app so the PM metric is real.

PRE-CHECK: the archive review (Prompt 4) and the ladder (Prompt 5) are merged. If not, stop and say which is missing.

READ: .10x/tickets.md P1-15 and P1-16, and Q3 in §Questions; wrangler.jsonc (run_worker_first, assets); worker/src/index.ts; src/App.tsx; src/net/{players,AccuracyPanel,Ladder}.ts(x); src/review/; src/rating/{glicko2,rules}.ts; src/engine/luck.ts; the ADR's 2026-10-10 amendment (draw band, forfeit and no-show rules); src/info/InfoPages.tsx.

BUILD:
1. Q3 is unanswered: use its recommendation, /u/<username> on the workers.dev host (the path survives a later domain), and record it.
2. P1-15 as ticketed: /u/<username> served by the Worker with escaped OG tags; #u/<username> in the app; rating ± RD over time from rating_history; the provisional badge; the accuracy panel (it moves here from the lobby, which keeps a link); volume; abandonment rate; the last 20 matches linking to the archive review; an empty sanctions field (P1-18 fills it); country and bio with an Edit profile form. Opponent cards only where shown at showdown. Ladder names now link to profiles.
3. P1-16 as ticketed: the share card (a static image with a dynamic title and description is the cut line), the Share button, external-view and share counting, and #method. The Method page states what the code does today: glicko2.v1 and τ; one rated match is one rating period; the provisional rule; fresh decks with all-in pots settled at equity; the ±2 bb draw band, inclusive; forfeit = loss; no-show = void and not rated; ladder eligibility; the accuracy label and model version; and what is not measured.
4. Q5 is open: no per-action decision times on the profile.

DONE WHEN: P1-15's and P1-16's acceptance tests pass under their names; in wrangler dev, curl /u/<name> shows the right OG tags and a hostile username or bio injects no markup; gates green; merged and verified, including a curl of a production /u/<name> (an unknown name returns 404).

DO NOT: add avatar uploads, show grades or hole cards beyond the rules, or count same-origin or bot views.
```

## 7. Reports, sanctions and appeals (P1-17, P1-18)

**Header:** `/10x-Team:sde`. The prompt ends with a switch to `/10x-Team:security-engineer` for an adversarial pass.

```
MISSION. Integrity v1: a cheap, abuse-proof way to report a match, and a logged, manual way to act on a report, with one appeal. Nothing automatic. These make the ladder defensible before any detector exists.

PRE-CHECK: the archive review (Prompt 4), the ladder (Prompt 5) and the profile (Prompt 6) are merged. If not, stop and say which is missing.

READ: .10x/tickets.md P1-17 and P1-18 and their DBA fold-ins; supabase/proposed/phase1.sql (reports, policy reports_file, the per-reporter daily cap with its advisory lock, sanctions, appeal_sanction with invoker rights); supabase/migrations/20261010080000_ratings.sql (rating_history kind 'reset' is reserved for sanctions; the append-only trigger); the integrity-and-trust PM file (v1 column, Sanctions v1); src/info/InfoPages.tsx and src/info/contact.ts.

BUILD:
1. P1-17 as ticketed: the reports table and policy; a Report button in the archive review of a finished rated match, for its two players only; the triage script and the resolve script (the key comes from the environment and is never printed; resolve needs --confirm).
2. P1-18 as ticketed: sanctions; apply_sanction for the service role, where a rating reset appends a rating_history row of kind 'reset' and never updates history; appeal_sanction, own row, once; ladder() v2 from the merged v1, excluding active removals; "Sanctioned · <kind> · <date>" on the profile and the one-time appeal field.
3. Fair Play: replace the interim "how to report" wording with the Report button, and describe sanctions exactly as built.
4. Rows for both tables in rls-matrix.test.ts.

FINISH by invoking /10x-Team:security-engineer for an adversarial pass: two concurrent reports at the daily cap; reporting a match you were not in, one still playing, or yourself; reading reports about yourself; calling apply_sanction or appeal_sanction as another user or as anon; markup injected through a note or an appeal. Record each as EXPLOITED or HELD with the artifact, and fix anything exploited with a red-then-green test.

DONE WHEN: P1-17's and P1-18's acceptance tests pass under their names; the security pass is recorded in the security log; gates green; merged and verified.

DO NOT: auto-sanction anyone, publish report contents or reporter identities, or build v2 detectors.
```

## 8. Mistakes to lessons, and what to review first (P1-19, P1-20)

**Header:** `/10x-Team:sde`. The prompt switches to `/10x-Team:product-manager` for the lesson map, a product judgement about what to teach.

```
MISSION. The loop that brings people back: every graded mistake points at the lesson that fixes it, every lesson ends with "Play a rated match", and the end of a match leads with the three hands most worth reviewing.

PRE-CHECK: the archive review with grades (Prompt 4) is merged. If not, stop.

READ: .10x/tickets.md P1-19 and P1-20; src/lib/{grading,grader,gradeHand,storage}.ts (grade classes, decision types, LESSON_IDS); src/curriculum/core/routes.ts and src/curriculum/Curriculum.tsx; src/components/learn/LearnView.tsx; src/review/; src/net/MatchEnd.tsx; supabase/migrations/20261010053000_hand_grades.sql and 20261010060000_hand_grades_pot.sql; the multiplayer-platform PM file (the review→lesson loop).

BUILD:
1. (Invoke /10x-Team:product-manager for this item.) src/learn/lessonMap.ts as ticketed: every decision type × grade class maps to a lesson or to an explicit "none yet", plus a gap list of what Learn does not teach yet. Choose from what Learn already has; invent no lessons.
2. P1-19 as ticketed: a lesson link on each graded mistake in the archive review; a pre-loaded situation only where a lab already accepts a spot by URL (otherwise the cut line: links only); "Play a rated match" at the end of every unit, linking to the lobby.
3. P1-20 as ticketed: match_swings, the three largest EV losses per player for finished matches, readable only by the match's two players (the same rule as grades, Q6); shown on the end panel ("Grading…" while grades land) and at the top of the review, each with its lesson link.

DONE WHEN: P1-19's and P1-20's acceptance tests pass under their names; the time from a match's last hand to its grades is measured and recorded (the end panel polls for 60 s; if grading takes longer, say so and propose the fix); gates green; merged and verified.

DO NOT: invent lessons, show swings to anyone but the two players, or change how grading works.
```

## 9. Metrics pack and ladder launch (P1-21, P1-22)

**Header:** `/10x-Team:sre`. The prompt switches to `/10x-Team:dba` for the metric queries.

```
MISSION. Close Phase 1 with evidence: every PM success metric as one honest query, and the ladder opened to everyone only after a full rated run proves every part of the pipeline.

PRE-CHECK: every other Phase 1 ticket has a done Status line in tickets.md, and S7-11 is closed (Prompt 1). If not, stop and list what is missing.

READ: .10x/tickets.md P1-21, P1-22 and §Success metrics; the success metrics in all five PM files; scripts/smoke-ws.mjs and scripts/smoke/; src/info/InfoPages.tsx; README.md; the latest launch verification review.

BUILD:
1. (Invoke /10x-Team:dba for this item.) P1-21 as ticketed: supabase/metrics/*.sql, one read-only query per metric, each returning "insufficient data" honestly when it is; a README table; supabase/tests/metrics.test.ts on an empty database and on the simulated season from P1-14. Queue wait and ack latency read S7-05's columns.
2. P1-22 as ticketed: smoke --rated, a 40-hand rated match on wrangler dev with a DO restart in the middle, ending with the right result, archived rows, verified hands, grades and exactly one rating update; a 500-hand smoke with 0 commitment failures; the Fair Play page describes exactly what now exists (fresh decks with the luck adjustment, reports, sanctions, the Method link, and what is still not detected); README.
3. Then ask me for the go-ahead. With it, I play one production rated match between my two accounts and you check it read-only end to end, as in Prompt 1.

DONE WHEN: P1-21's and P1-22's acceptance tests pass; .10x/reviews/<date>-ladder-launch.md has every row VERIFIED or Open with its reason; gates green; merged and verified.

DO NOT: seed fake data into production, run load against production, or claim on the Fair Play page anything a test or a log does not back.
```

---

# PHASE 2: 6-max (`six-max-tables` casual, then rated arenas)

## 10. 6-max engine gate, positions and pairwise results (P2-01, P2-02, P2-12)

**Header:** `/10x-Team:qa-engineer`. QA owns the hard correctness gate; the prompt switches to `/10x-Team:sde` once it is green. Pure code, so it can run any time, beside Phase 1 work.

```
MISSION. 6-max is only as good as its chip math. Before any 6-max table exists, prove the engine at six seats, settle the dead-button rule, and build the pure luck-adjusted pairwise results the 6-max rating will need.

READ: .10x/tickets.md P2-01, P2-02 and P2-12; the six-max-tables PM file; src/engine/{engine.test,testing,pots,positions,types,hand}.ts; src/engine/luck.ts and its test (heads-up only today); src/rating/glicko2.ts; the ADR §Engine N-player generalisation.

HARD GATE FIRST (P2-01): 0 failures over at least 100k random 6-max hands against the reference for chip conservation, side-pot sums, legal action sets, award order and the odd chip, plus the ticket's crafted cases. Count the side-pot share of hands already asserted before adding cases. If anything fails, stop and fix the engine. When the gate is green, invoke /10x-Team:sde for:

1. P2-02 as ticketed: the standard dead-button rule, written into the ADR as an amendment; stacks that carry over; rebuy to 100 bb between hands; a joiner dealt in next hand without posting (R-20).
2. P2-12 as ticketed: extend src/engine/luck.ts to multiway all-ins (bench a 3-way preflop all-in first; if exact enumeration is too slow, use a fixed Monte Carlo budget and say so), and src/rating/pairwise.ts. Heads-up results must not change: the existing luck tests stay green, bit for bit.

DONE WHEN: the three tickets' acceptance tests pass under their names; the soak log (seed, hands, failures) is in your log; gates green; merged and verified.

DO NOT: touch the table service, the UI, or the ratings tables.
```

## 11. Casual 6-max table service (P2-03, P2-04, P2-07)

**Header:** `/10x-Team:sde`.

```
MISSION. A casual 6-max table that never ends: players sit, stand and rebuy, the clock and sit-out rules keep it moving, and labelled Atlas bots keep quiet tables playable. Server only; the six-seat UI is the next prompt.

PRE-CHECK: Prompt 10 is merged and the ladder is launched (P1-22). If not, stop and say which.

READ: .10x/tickets.md P2-03, P2-04 and P2-07; the six-max-tables PM file; worker/src/{table,controller,deadlines,lobby,rated}.ts; src/shared/protocol.ts; src/engine/redact.ts and its test; worker/test/rated-leak.test.ts; the latest record_match and the matches kind check in supabase/migrations.

BUILD as ticketed, in order:
1. P2-03: MatchKind six-casual. In the first hour, decide how a session that never finishes maps onto matches and record_match (the ticket suggests one matches row per table session, closed by the idle deadline) and write it into the ADR. Every new message gets an allowlist and redaction test, including the over-the-wire test that no seat sees another's hole cards at N=6.
2. P2-04: the per-orbit bank, sit-out, removal and the 60 s reconnect. Pin the definition of an orbit in a test first.
3. P2-07: labelled bots on casual tables only, filling to 3 occupied seats and leaving as humans sit; never at rated or arena tables. Bench the bot first: it must decide in under 20 ms of CPU inside the Durable Object, so it cannot call analyzeSpot.

DONE WHEN: the three tickets' acceptance tests pass under their names; six scripted clients play 200 hands in wrangler dev with chips conserved; heads-up casual and rated behaviour unchanged, with their tests green; gates green; merged and verified.

DO NOT: build the six-seat UI, rate anything, or let a bot near a rated table.
```

## 12. Six-seat table UI, side pots and table list (P2-05, P2-06, P2-08)

**Header:** `/10x-Team:sde`.

```
MISSION. The user's bar is "highest quality, especially 6-max". Give six seats the trainer's card art, chips and choreography, readable on a phone and playable by keyboard, with side pots that visibly pay out in order, and a lobby list that finds a table in one click.

PRE-CHECK: Prompt 11 is merged. If not, stop.

READ: .10x/tickets.md P2-05, P2-06 and P2-08; the six-max-tables PM file; src/components/table/*; src/motion.ts; src/net/{LiveTable,Lobby}.tsx; src/engine/project.ts (toHeroGame, retired from the live path here); e2e/{live,mobile,motion}.spec.ts.

BUILD as ticketed:
1. P2-05: spike six seat plates at 320 px (half a day) before choosing between generalising Table.tsx and forking it, and record the choice. A generic seat plate for humans (Atlas's face is for Atlas only; bots read "Atlas (bot)"); keyboard parity with P1-07.
2. P2-06: side pots as separate stacks, paid in award order, and the 3-way all-in frame gate. Run the existing frame-time test at six seats first.
3. P2-08: the table list and Quick sit, with the lobby registry updated at most once per 30 s per table.

QUALITY GATES: no long frames through a 3-way all-in runout; no serious axe violations in light and dark; no horizontal scroll at 320 px; heads-up tables look and behave as before, with their e2e green.

DONE WHEN: the three tickets' acceptance tests pass under their names; you played at a six-seat table in two real browsers against wrangler dev, including a side pot, and say what you saw; gates green; merged and verified.

DO NOT: change the heads-up table's look, or ship rated 6-max.
```

## 13. 6-max review, stats and six-client acceptance (P2-09, P2-10, P2-11)

**Header:** `/10x-Team:sde`. The prompt switches to `/10x-Team:qa-engineer` for the acceptance run, whose job is to break the tables.

```
MISSION. Every 6-max hand reviewable and, where the pot was heads-up at the decision, graded; 6-max stats on the profile; then the evidence that six-player tables are correct and fast enough to open to the public.

PRE-CHECK: Prompt 12 is merged. If not, stop.

READ: .10x/tickets.md P2-09, P2-10 and P2-11; src/engine/project.ts; worker/src/grade.ts; src/review/; supabase/migrations (hand_grades, reports); src/engine/luck.ts and src/rating/pairwise.ts from Prompt 10; src/net/profile/; scripts/smoke-ws.mjs.

BUILD:
1. P2-09 as ticketed: project an N-seat state with exactly two live players to a 2-player Game, folded chips as dead money (hand-compute one case first); grade those decisions and store multiway ones as "not graded" with a count; payout reports for casual 6-max. Q6 still holds: no grade during a live hand, and grades readable only by the hand's players afterwards. Decide whether "afterwards" means the hand or the session, and write it down.
2. P2-10 as ticketed: hand_stats written at grade time; VPIP, PFR, aggression and luck-adjusted bb/100 on the profile.
3. Invoke /10x-Team:qa-engineer for P2-11: six clients (scripted Node plus at least two real browsers) play 200 hands with joins, leaves, timeouts and a reconnect: chips conserved, no console errors, ack-to-render p95 under 150 ms from S7-05's telemetry, Safari background tabs documented.

DONE WHEN: the three tickets' acceptance tests pass under their names; the P2-11 run evidence (hands, failures, leaks, p95) is in the QA log; gates green; merged and verified.

DO NOT: rate 6-max, or grade multiway decisions.
```

## 14. Arenas and the 6-max rating (P2-13, P2-14, P2-15)

**Header:** `/10x-Team:principal-architect`. ArenaDO (seating by band, rebalancing) is new architecture. The prompt asks for a short design note, then switches to `/10x-Team:sde`.

```
MISSION. Give 6-max a rating people can believe: scheduled humans-only arenas, pairwise luck-adjusted results into a separate Glicko-2 rating, provisional until the data supports it.

PRE-CHECK (stop if it fails): Prompt 13 is merged, and production shows 0 invariant failures over the first 1,000 human casual 6-max hands (hands.verified and incidents, read-only). Report the counts.

READ: .10x/tickets.md P2-13, P2-14 and P2-15; the six-max-tables PM file §Format (Arena) and §Gates; the rating-and-leaderboard PM file §6-max; src/rating/{glicko2,pairwise}.ts; worker/src/{rating,lobby,table}.ts; supabase/migrations/20261010080000_ratings.sql (the format '6max' is already allowed); the ladder and profile code.

DESIGN NOTE (at most half a page, appended to the ADR): ArenaDO's ownership of seating, the rating-band rules, the rebalancing algorithm, what happens to a hand in progress during a rebalance, and the failure matrix. Spike the claim and release handover between TableDOs (half a day) before committing to it. Then invoke /10x-Team:sde for BUILD.

BUILD as ticketed:
1. P2-13: code-defined 60-minute windows with a lobby countdown (email or notifications only if that infrastructure exists; otherwise record the gap, R-19); ArenaDO seats humans only, by band, and rebalances at hand boundaries; fewer than 4 humans means played, not rated.
2. P2-14: format '6max' fed from pairwise results per arena session; provisional until 500 rated hands; the ladder lists provisional players separately; the profile shows the HU and 6-max ratings side by side. Formats never mix.
3. P2-15: a scripted 60-minute arena with 12 test-account clients across 2 tables, in a test environment only (never Atlas bots, never production), and the 6-max metric files.

DONE WHEN: the three tickets' acceptance tests pass under their names; the scripted arena rebalances correctly and produces plausible ratings; gates green; merged and verified.

DO NOT: build collusion detection (Prompt 15), or treat a provisional rating as final anywhere in the UI.
```

---

# LATER (triggered)

## 15. Integrity v2 (run only when a trigger fires)

Triggers: 1,000 registered players, the first recruiter or firm inbound, the first credible cheating report, or a sponsored event.

**Header:** `/10x-Team:security-engineer`. The prompt switches to `/data:statistical-analysis` for precision, recall and false-positive estimates.

```
MISSION. Defend the ladder with evidence, not vibes. Build detectors against the real data we now have and apply them retroactively to public rated histories. Humans decide sanctions; the system produces ranked, explainable review packets.

READ: the integrity-and-trust PM file (v2 column); the reports and sanctions tables and the triage log (P1-17, P1-18); per-action decision times in the hand archive and whatever Q5 decided about them; hand_grades, public.accuracy and rating_history; the Fair Play page; the security reviews.

BUILD, each as an offline job first and a review queue second, never an auto-ban:
1. External-RTA screen: accuracy and timing-variance distributions against the population; outliers with a confidence and a review packet (hands, timings, comparison with peers).
2. Collusion and chip dumping (6-max): a seat co-occurrence score, soft play in checked-down pots between linked accounts, large all-in losses with weak holdings to the same account.
3. Win-trade graph for HU: the match-pair graph and decayed gains against repeat opponents.
4. Multi-account soft linkage (device, IP) and verified email-domain badges; phone verification for the ladder only if the data justifies it.
5. A public read-only profile JSON API for firms, with signed hand-history ids (R-6 moved them here).

FOR EVERY DETECTOR (invoke /data:statistical-analysis for the evaluation): evaluate on seeded synthetic cheaters AND on the real population; report precision and recall, the false-positive budget (innocent players per 1,000 flagged), and what it cannot catch. If a detector is noise, say so and do not ship it. Update the Fair Play page to describe exactly what exists.

DONE WHEN: each shipped detector has an evaluation report, a human review workflow and an appeal path; the API respects the profile's privacy rules.

DO NOT: auto-sanction, publish raw suspicion scores, or ship anything whose false-positive rate you did not measure.
```

## 16. Optional: port the AI coach to the Worker

**Header:** `/10x-Team:sde`. The prompt switches to `/10x-Team:security-engineer` for the abuse and prompt-injection tests. The code lives in the tag `archive/context-aware-coach` and `refs/pull/2/head`.

```
MISSION. Bring back the AI coach on the new stack without weakening fairness or exposing keys. It explains finished hands; it must be impossible to use as real-time assistance.

READ: git show archive/context-aware-coach for server/coach.ts, src/lib/coach.ts, coach-stream.ts and their tests; .10x/status.md §Repository; worker/src/index.ts; hand_grades and the archive review (src/review/); the security reviews.

BUILD: a Worker route with streaming; per-account usage limits in Postgres (an additive migration with its RLS test); the model key as a Worker secret, never sent to the client; grounded only in finished-hand data the requester may see (their own hole cards, shown cards, and grades under Q6); refused server-side whenever the requester has a live rated hand, including races where a hand starts mid-request (test them); a lazy chunk that keeps the entry bundle under budget; the ported tests. Then invoke /10x-Team:security-engineer for abuse tests: rate limits; prompt injection through opponent usernames, bios, report notes or hand text cannot widen data access or tool use; output never echoes secrets.

DONE WHEN: the coach works on a finished hand in wrangler dev, is refused during a live rated hand, and all gates are green; merged and verified.

DO NOT: port the 3D terrain frontier, slice or camera (a separate task), or let the coach see hidden cards of any hand.
```
