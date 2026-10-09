# Handoff

## Current handoff: SDE → User (Step 7 built; the launch gate is yours)

Date: 2026-10-09 · Status: **Step 7 is built and tested on PR #9 and not deployed.** All gates are green: 668 unit, 120 worker, 19 e2e; entry 141.5 kB. The smoke ran 20 clients for 500 hands: p95 17 ms, 0 invariant failures, 0 leaks, 500/500 commitments verified. The chaos pass is 5/5 VERIFIED.

### Read first

- `.10x/decisions/sde/multiplayer-platform.md` §Step 7: what was built, verification, the chaos table, smoke numbers, deviations, seams.
- `README.md` §Operations: log events, saved queries, how to find a failed hand, close codes, deploy order.
- `.10x/tickets.md` §Step 7: status per ticket.
- `.10x/reviews/2026-10-09-security-review.md` §Status after Step 7.

### User actions (in this order, before the deploy)

1. **Create the queues** (Cloudflare → Queues, or `npx wrangler queues create quantpoker-hands` and `npx wrangler queues create quantpoker-hands-dlq`). Without them the Workers Build of `main` fails.
2. **Apply the migration** `supabase/migrations/20261009090000_verify_hand.sql`, or confirm the Supabase GitHub integration applies migrations on merge to `main`. Until it exists, verify messages retry and then dead-letter.
3. **Report contact (U-6):** give an address for the Fair play page (`src/info/contact.ts`), or keep the interim wording ("keep them for the report form that comes with rated play").
4. **DBA review (Prompt 4) has not run.** `.10x/prompts.md` makes it a gate before this deploy. Run it, or tell me to deploy without it.
5. **U-8** (unchanged): the redirect allowlist; no `DEV_AUTH_SECRET` on the Worker; leaked-password protection. Optionally, a WAF rate-limit rule on `/ws/*` and `/api/*`.
6. Still open from Prompt 1: `SUPABASE_SECRET_KEY` on the Worker, one real sign-in, one two-account match (U-4).
7. **Say go.** I then merge PR #9 (production deploys from `main`), watch `deploy-check.yml`, and run S7-11's evidence rows. Merging also runs the scheduled soak from `main` from then on.

### What to test

- **Locally, two browsers:** `npm run worker:dev -- --var DEV_AUTH_SECRET:<16+ chars>`, then two profiles with `sessionStorage['qp.devToken']`. Play a hand where you fold pre-flop, open "Review hand n", and hover "Deck verified": it now covers your own two cards.
- **Limits:** paste a 5,000-character message into a socket (DevTools) and get `too_large`, then close 4400 and a reconnect. Refresh a table rapidly: after ~20 refreshes in 5 s the page says "Too many messages, reconnecting…" and comes back.
- **Pages:** `#fair-play` and `#terms` from the Online tab header. Read the copy: it is plain statements, not a lawyer's text.
- **Smoke:** `npm run worker:dev -- --var DEV_AUTH_SECRET:smoke-local-secret-0001`, then `npm run smoke`.

### What to review

- `worker/src/verify.ts` `problemsWith`: the list of checks is the definition of a "verified" hand.
- `worker/src/table.ts` `flushOutbox`: archive calls stop the flush at the first failure; queue sends and incident reports do not.
- `worker/src/limits.ts` and the two `budget.spend(userId)` call sites, connects included.
- `.github/workflows/deploy-check.yml`: it trusts the Workers Builds check run when present, else compares the site file by file for 15 minutes.
- `src/info/InfoPages.tsx`: every claim on the Fair play page has a test or a log behind it; check you agree with the wording.

### Noticed, not done

- **S7-05** (queue-wait and ack-latency telemetry, two PM metrics) is not started. It was not in this step's build list.
- **Lobby presence** is still one broadcast per accepted frame or connect, at most 4 per second per account under the budget. Coalescing would remove it.
- **A replaced tab** learns it was replaced after about 2 s in Chromium (the close-handshake timeout); clicks in that window are dropped, never applied.
- **SR-10** (UUID-shaped dev ids) stays open; the local chaos pass relies on it.
- **CI actions** run Node 20 under GitHub's forced Node 24 (deprecation warning). Bump the pinned majors in a separate change.
- **`hands.created_at` has no index;** `/api/stats` makes 14 head counts per 5 minutes per isolate. That is for the DBA review.
- **Evidence:** PR #9 CI on `b1f14d4` is green: `check`; `e2e` with the live guard reporting `live: 3 passed, 0 skipped`; `soak` with seed 37906875949, 100k hands at each table size 2–6. `deploy-check` can only run after a push to `main`.

### Next step

You: the user actions above. Then me: merge on your go, `deploy-check` green, S7-11 launch verification. After that, Phase 1 from P1-00 once Q1 is answered.

---

## Handoff history

### 2026-10-09 — Security Engineer → User, DBA, SDE (Phase 0 security review)

Date: 2026-10-09 · Status: **no Critical or High open.** Fixed with red-then-green tests:

- SR-01 (High): lobby frame flood; SR-02 (Medium): table frame flood;
- SR-03, SR-04 (Medium): deck reveals that could hide a re-dealt card; dev tokens accepted with a short secret;
- SR-05 (Low): the same-account join race.

Three Mediums (SR-06 to SR-08) are Step 7 tickets with file:line. All gates green.

#### Read first

- `.10x/reviews/2026-10-09-security-review.md` (summary, findings table, a verdict per item 1–7, what was not tested)
- `.10x/decisions/security/multiplayer-platform.md` (commits, numbers, deviations)
- `.10x/tickets.md` §Review fold-in → "Security review results" (what changed in S7-01/02/03/04/07/10, plus new S7-12)

#### User actions

1. **U-8 dashboard checks** (none are readable from here):
   - **(a)** Supabase → Authentication → URL Configuration: only `https://quantpoker.bbcroysalman.workers.dev/**` and localhost entries, with no wildcard to a foreign host.
   - **(b)** Cloudflare → Worker `quantpoker` → Variables and Secrets: no `DEV_AUTH_SECRET`.
   - **(c)** Supabase → Authentication: enable leaked-password protection, or turn off password sign-in (SR-13).
   - **(d)** Optional: a WAF rate-limiting rule on `/ws/*` and `/api/*` (SR-07).
2. Unchanged: answer Q1–Q5; create the two queues before S7-03; secret key, sign-in and a two-account match (U-3, U-4).

#### What to test

- **Two browsers (local):** `npm run worker:dev -- --var DEV_AUTH_SECRET:<16+ chars>`. Play a hand; refresh one tab repeatedly. Nothing changes for honest play; e2e `live` 3/3 confirms it.
- **Flood (local, scripted):** a Node script floods the lobby. Verified this session: the flooder closes with `4429 Too many messages`, the bystander sees 22 frames (was 200), and the reconnect is clean.
- **The dev secret rule:** a secret under 16 characters now leaves dev tokens off. Update any local `.dev.vars` you keep.

#### What to review

- `worker/src/limits.ts` and its two call sites: applied moves are refunded, and a reconnect gets a fresh budget (residual SR-07, ticketed).
- `src/engine/deck.ts` `verifyDeal`: every public slot is opened exactly once.
- `worker/src/table.ts` `join()`: after the awaited claim it looks for the same account before releasing.
- `supabase/tests/rls-matrix.test.ts`: the expected matrix is data at the top of the file. Read it as the access policy.

#### Noticed, not done

- **SR-06:** one account created 50/50 invite tables with no limit, and unjoined invites never expire (S7-01, S7-02).
- **SR-07:** each upgrade does an uncached username lookup, and there is no per-account or per-IP cap (S7-02, U-8d).
- **SR-08:** a folded player's own cards are never opened in the reveal, so they cannot be verified (new S7-12). Until it ships, the Fair Play copy must say "board and shown hands".
- **SR-09:** `worker/src/table.ts:674` logs the full state, deck included, on an engine fault (S7-03/S7-04).
- **SR-10:** dev ids may be UUID-shaped (S7-02).
- **SR-11:** actions are not pinned by SHA (S7-07).
- **SR-12:** `npm audit` reports 4 dev-only highs (`sharp` via `miniflare`); none are in the bundle.
- **Docs:** `.10x/prompts.md` (Prompt 5) still lists an Origin allowlist; R-2 in `.10x/tickets.md` explains why not.

#### Next step

Prompt 4 (DBA review), then Step 7 from S7-01. The S7-02 scope is smaller now: the budget ships here, so what remains is invite and connection limits, the illegal-move counter and the client message.

### 2026-10-09 — Staff Engineer / EM → User, Security, DBA (tickets for Step 7 and Phases 1–2)

Date: 2026-10-09 · Status: **the remaining plan is ticketed.** 49 tickets; 29.7 session-hours on the ladder's critical path; earliest ladder date 2026-10-13, planning date 2026-10-19. One product decision (Q1, the duplicate format) is needed before Phase 1's deck work. No product code changed.

#### Read first

- `.10x/tickets.md` §Summary, §Questions for you, §Critical path and parallel lanes
- `.10x/decisions/engineering-manager/multiplayer-platform.md` (log, calibration, method)

#### User actions

1. Answer Q1–Q5 in `.10x/tickets.md`; each has a recommendation. Only Q1 blocks anything (P1-00 and P1-02).
2. Run Prompt 3 (security) and Prompt 4 (DBA). They can run as two parallel sessions. Their findings land on the ticket ids named in §Review fold-in.
3. Before S7-03 merges to `main`: create Cloudflare queues `quantpoker-hands` and `quantpoker-hands-dlq` (dashboard → Queues, or `npx wrangler queues create <name>`).
4. Still open from the deploy verification: set `SUPABASE_SECRET_KEY`; sign in once and paste only the token header; play one two-account match.
5. Choose a contact address for "how to report" on the Fair Play page (S7-10).
6. Merge `claude/zen-darwin-0t5q1p` (deploy verification) and `claude/amazing-ride-4vip4x` (prompts) before this branch. All three edit `.10x/status.md` and `.10x/handoff.md`.

#### What to test

Nothing executable changed. The Q1 finding takes two minutes to see yourself:

1. Play a casual match for a few hands.
2. Open "Review hand 1".
3. Your hand-1 hole cards and board are listed. Under the ADR's duplicate rule (segment 2 reuses deck _n_ with the button flipped), they are exactly your opponent's cards and the board of hand 21.

#### What to review

- **Q1 / R-1 (is the leak real?)** `worker/src/controller.ts`; `src/engine/deck.ts:37` (`dealSlots`: HU deal order is relative to the button, so flipping the button swaps the hole cards); `src/net/LiveTable.tsx:348` and `src/net/client.ts` (`hands[n].mine` is kept for the whole match); ADR §Randomness "Duplicate (Phase 1)".
- **Calibration** (`.10x/tickets.md` §Calibration): commit timestamps as the pace measure, ±50%.
- **Reconciliation R-2** (no Origin allowlist, per the ADR amendment) **and R-6** (signed hand-history ids interpreted as service-role-only writes plus commitments).

#### Noticed, not done

- `worker/src/table.ts:659` logs `JSON.stringify(state)` on an engine invariant failure, and that state includes the deck and every hole card. Ticketed in S7-03 and S7-04: the full state goes to `incidents` and logs carry ids only. The security review should confirm.
- The `incidents` table exists, but nothing writes to it (S7-03).
- The ADR's `idle` deadline was never built, so finished tables keep their Durable Object storage forever (S7-01).
- `POST /api/telemetry` (ADR §Client integration) does not exist, so the ack→render p95 metric is unmeasured (S7-05). Queue wait is not recorded either (S7-05).
- `TableController` in code (synchronous `nextHandPlan` only) is narrower than the ADR's version; P1-00 corrects the ADR.
- The live table still has no keyboard shortcuts or sounds (deferred in Steps 4 and 5). That is a Phase 1 acceptance criterion (P1-07).
- `.10x/prompts.md` and the deploy verification exist only on unmerged branches; `.10x/tickets.md` cites them by commit.

#### Next step

Prompts 3 and 4 in parallel. Then three sessions:

- S7-01, lane W (worker core);
- S7-06 and S7-07, lane T (tooling);
- P1-07, lane C (client), which must finish before P1-01.

### 2026-10-09 — SDE → User (repo cleanup: one `main` branch)

Date: 2026-10-09 · Decisions (user): squash PR #8; close and archive PR #2; merge PR #5; keep Devin with PR monitoring off. Summary in `.10x/status.md` §Repository.

Done by Claude: full mirror backup bundle sent to the user; PR #2 closed (no comment, so Devin's monitor has nothing to react to); PR #8 gains the live `learning_cloud` migration file (byte-identical, md5 `170f50fbda835ec89c4148d8fce80b9b`) and the matching test-filter fix. Claude's session can only push its own branch, so tags and branch deletions run from the user's machine (script below).

#### User steps, in this order

1. **Devin:** in Devin's first comment on PR #5 (and #2), tick "Disable automatic comment, CI, and merge conflict monitoring".
2. **Vercel:** project `quantpoker` → Settings → Environment Variables: note the variable names (only matter if the AI coach is ever ported) → Settings → Advanced → Delete Project. Do not uninstall the Vercel GitHub app: other Vercel projects use it.
3. **Cloudflare** (Workers & Pages → `quantpoker` → Settings): Build → Branch control → turn off "Enable Preview Builds"; confirm build `npm run build`, deploy `npx wrangler deploy`, root `/`. Variables and Secrets → add secret `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → create a secret key).
4. **GitHub** (repo Settings → General): Pull Requests → tick "Automatically delete head branches". Default branch → rename `devin/1791351254-quantpoker-learning-table` to `main`.
5. **Right after the rename:** Cloudflare Branch control → Production branch = `main`. Supabase → Project Settings → Integrations → GitHub → Production branch = `main`. Supabase → Authentication → URL Configuration → Site URL `https://quantpoker.bbcroysalman.workers.dev`, redirect URL `https://quantpoker.bbcroysalman.workers.dev/**`; remove any `vercel.app` entries.
6. **Tell Claude "done".** Claude then squash-merges PR #8 (this deploys production), checks the live site, retargets PR #5 to `main`, updates its branch so CI runs on it, and squash-merges it.
7. **Paste the cleanup script** (Claude posts it after step 6) on your computer: it pushes the `archive/*` tags and deletes every branch except `main`, refusing any branch whose work is neither in `main` nor tagged.
8. Optional: Settings → Rules → protect `main` (require `check` and `e2e`, block force-push and deletion).

#### Branch fates

| Branch                                                                                                                      | Fate                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `devin/1791351254-quantpoker-learning-table`                                                                                | renamed to `main`                                    |
| `claude/beautiful-thompson-k0b5bl` (PR #8)                                                                                  | squash-merged, auto-deleted                          |
| `devin/1791401023-r1-acceptance-fixes` (PR #5)                                                                              | squash-merged, auto-deleted                          |
| `devin/1791354563-context-aware-coach`, `devin/1791358830-cinematic-poker`, `devin/1791400999-supabase-vercel` (PR #2 line) | tagged `archive/*`, deleted                          |
| `devin/1791351737-interactive-curriculum`, six `devin/quantpoker-r1-*-4673c0d0`                                             | content already in main; tagged `archive/*`, deleted |
| `claude/blissful-planck-wrb5my`, `devin/1791353078-integrate-curriculum`, `devin/1791357371-quantpoker-r1`                  | fully merged; deleted                                |

### 2026-10-08 — SDE (Step 6) → QA Engineer + Security Engineer

Date: 2026-10-08 · Status: **Phase 0 Steps 1–6 done.** "Find a match" pairs two waiting players at a new heads-up table; each account plays one table at a time; the same two accounts meet at most twice a day; a paired player who does not open the table within 30 s is a no-show. Live with PR https://github.com/Backpacked333/QuantPoker/pull/8.

#### Read first

- `.10x/decisions/sde/multiplayer-platform.md` §Step 6

#### User actions (unchanged)

1. Add the Supabase secret key as Worker secret `SUPABASE_SECRET_KEY` (archive).
2. Supabase Auth Site URL `https://quantpoker.bbcroysalman.workers.dev`; merge PR #8.

#### What to test (QA)

- Two accounts (two browsers or a private window): both Find a match → same table. Cancel; close the tab while waiting (the other sees the count drop). Wait alone for 60 s → the Atlas offer.
- Open a second tab on the lobby while queued (the first stops: replaced). Queue while at a table → you are sent back to it. Open someone's invite link while playing → "already playing" with a link to your table.
- Pair, then do not open the table in one browser → after 30 s the other sees "did not show up" and can find another match.
- Not covered: many players queuing at once (pairing is sequential in one object; fine at launch scale), the UTC-midnight edge of the pair limit.

#### What to review (Security)

- `worker/src/lobby.ts`: identity only from the Worker's verified headers; one socket per account; queue rows only for connected sockets.
- `worker/src/table.ts` `join`: invite seat claim order (full check → claim → recheck → release on a lost race); the `4409` reason carries only the caller's own match id.
- No lobby frame rate limit yet (Step 7).

#### Next implementation step (SDE)

Step 7 — Hardening, CI, launch (ADR day 15): `HAND_QUEUE` verify consumer + DLQ, `bench.test.ts`, deploy workflow, engine-soak workflow, Origin allowlist, frame rate limits (table and lobby), Workers Logs, 20-client smoke against production, Fair Play stub page, play-money ToS copy, README, Phase 1 hand-off notes.

### 2026-10-08 — SDE (Step 5) → QA Engineer + Security Engineer (+ user action)

Date: 2026-10-08 · Status: **Phase 0 Steps 1–5 done.** Live tables now have a shot clock with a time bank and forfeit, every deal is committed before the first card and checked in the browser ("Deck verified"), and finished hands are archived to Postgres. Goes live with PR https://github.com/Backpacked333/QuantPoker/pull/8.

#### Read first

- `.10x/decisions/sde/multiplayer-platform.md` §Step 5 (what was built, verification, deviations)
- `.10x/decisions/qa/multiplayer-platform.md` (quality gates; the Step 5 test list there is covered — see the SDE log)

#### User action (new)

1. Supabase → Project Settings → API Keys → create a **secret key**. Cloudflare → Worker `quantpoker` → Settings → Variables and Secrets → add it as secret `SUPABASE_SECRET_KEY`. Without it play works and nothing is archived.
2. Still pending from before: Supabase Auth Site URL `https://quantpoker.bbcroysalman.workers.dev`; merge PR #8.

#### What to test (QA)

- Walk away from a live table: after 20 s the clock moves into the bank, at 80 s the server folds (or checks) for you; three in a row ends the match as a forfeit with a clear message to both players.
- After each hand: "Review hand n" → "Deck verified". Earlier/Later between hands of the match.
- With the secret set (after deploy): play a match with two real accounts and confirm `matches`, `match_players`, `hands`, `hand_holes` rows; each player sees only their own `hand_holes`.
- Not covered: iOS Safari background tabs during a running clock; clock skew on a device with a wrong system time (the countdown uses the server offset, the server enforces).

#### What to review (Security)

- `worker/src/table.ts` `endOfHand`: the reveal opens only `publicSlots` (board + shown hands); the full deck and secret go only to the service-role `record_hand`.
- `worker/src/supabase.ts`: the secret key is sent only to `${SUPABASE_URL}/rest/v1/rpc/*`.
- `supabase/migrations/20261008173914_record_match.sql`: security definer, `search_path = ''`, execute revoked from anon/authenticated (verified on the live project).

#### Next implementation step (SDE)

Step 6 — Lobby (ADR days 13–14): `LobbyDO` (persisted queue, pairing, limiter, active map, presence, release, no-show via `start` deadline), lobby UI with the wait/bail-out flow, `/api/me`, `lobby.test.ts`.

### 2026-10-08 — QA Engineer → SDE (Step 5) + Security Engineer + DevOps

Date: 2026-10-08 · Status: **Steps 1–4 reviewed. Release-ready for the invite-link beta; no blocking bugs.** Live once PR https://github.com/Backpacked333/QuantPoker/pull/8 merges and the Supabase Site URL is set (user actions below, unchanged).

#### Read first

- `.10x/decisions/qa/multiplayer-platform.md` (risk profile, gaps closed, quality gates)
- `.10x/reviews/2026-10-08-qa-report.md`

#### What changed

- 27 tests: `worker/test/auth.test.ts` (new, real ES256 tokens), table rejoin presence, 4 engine crafted cases, `src/engine/project.test.ts` (new), live-table offline states, `#play` sign-in return.
- Bug fix in `worker/src/table.ts`: after a rejoin the opponent no longer sees "disconnected" (`broadcast({ gone, skip })`).

#### For the SDE (Step 5)

Quality gates in the QA file apply. Step 5 must add tests for: turn-clock timeout → auto check/fold; time bank use; 3 timeouts → forfeit; alarm ordering when a deadline and the next-hand alarm coincide; `record_hand` outbox retry after a Supabase failure (no duplicate hands); `reveal` matches `hand_start` commitment.

#### For Security

`worker/src/auth.ts` is now covered by real-token tests (see the QA file for the mutation results). Still yours: `hands_private` RLS and the upgrade path before Step 7.

#### User actions (unchanged)

1. Supabase → Authentication → URL Configuration: Site URL `https://quantpoker.bbcroysalman.workers.dev` (redirect URLs already done).
2. Confirm Cloudflare build `npm run build`, deploy `npx wrangler deploy`; merge PR #8.

### 2026-10-08 — SDE → QA Engineer + Security Engineer (+ user actions)

Date: 2026-10-08 · Status: **Phase 0 Steps 1–4 done — the two-browser milestone is reached locally.** It goes live when PR https://github.com/Backpacked333/QuantPoker/pull/8 is merged (it merges into the default branch, which Cloudflare deploys).

#### Read first

- `.10x/decisions/sde/multiplayer-platform.md` §Step 4

#### User actions (unchanged from Step 3, still pending)

1. Cloudflare Worker `quantpoker` → Settings → Build: production branch = the repo's default branch `devin/1791351254-quantpoker-learning-table` (there is no `main`; PR #8 merges into it, so it is already correct); build `npm run build`; deploy `npx wrangler deploy`.
2. Supabase → Integrations → GitHub: production branch = the repo's default branch `devin/1791351254-quantpoker-learning-table` (there is no `main`; PR #8 merges into it, so it is already correct).
3. Supabase → Authentication → URL Configuration: Site URL `https://quantpoker.bbcroysalman.workers.dev`; redirect URLs `https://quantpoker.bbcroysalman.workers.dev/**`, `http://localhost:8787/**`, `http://localhost:5173/**`.

#### What to test (QA)

- Locally: `npm run worker:dev`, two browsers (or one normal + one private window); in each, `sessionStorage.setItem('qp.devToken', 'dev.<name>.<secret>')` with the secret passed as `--var DEV_AUTH_SECRET:<secret>`, then `#lobby` → Play a friend by link.
- After deploy: two real accounts, email link sign-in, invite link opened by a signed-out friend (sign-in should return to the table).
- Not covered yet: someone who never acts (no clock until Step 5), long disconnects, iOS Safari background tabs.

#### What to review (Security)

- `src/net/api.ts` `devIdentity`: client-side only; the server is the gate (`DEV_AUTH_SECRET` absent in production).
- `src/net/client.ts`: token only in the subprotocol; one in-flight move; a stale snapshot never overwrites a newer one.
- Invite links: anyone signed in with the link takes the empty seat (intended for Phase 0).

#### Next implementation step (SDE)

Step 5 — Clocks, commitment, records (ADR days 11–12): `worker/src/deadlines.ts` (turn clock + time bank + auto check/fold + 3-timeout forfeit, one alarm over a deadlines list), `commitDeck` at `hand_start` and `reveal` after the hand, the Supabase outbox calling `record_hand` (service-role secret via `wrangler secret put`), `ReviewLive` with "Deck verified", `TurnClock` on the live table, keyboard shortcuts and sounds on the live table.

### 2026-10-08 — SDE → QA + Security (Step 3)

Date: 2026-10-08 · Status: **Phase 0 Steps 1–3 done.** The table server runs on Cloudflare's runtime locally and in tests; it deploys to production once PR https://github.com/Backpacked333/QuantPoker/pull/8 is merged.

#### Read first

- `.10x/decisions/sde/multiplayer-platform.md` §Step 3 (built, verified, deviations, user actions)
- `.10x/decisions/architect/multiplayer-platform.md` §Amendment 2026-10-08 (one Worker hosts everything)

#### User actions

1. Cloudflare Worker `quantpoker` → Settings → Build: production branch = the repo's default branch `devin/1791351254-quantpoker-learning-table` (there is no `main`; PR #8 merges into it, so it is already correct); build `npm run build`; deploy `npx wrangler deploy`.
2. Supabase → Integrations → GitHub: production branch = the repo's default branch `devin/1791351254-quantpoker-learning-table` (there is no `main`; PR #8 merges into it, so it is already correct).
3. Supabase → Authentication → URL Configuration: Site URL `https://quantpoker.bbcroysalman.workers.dev`; redirect URLs `https://quantpoker.bbcroysalman.workers.dev/**`, `http://localhost:8787/**`, `http://localhost:5173/**`.

#### What to test (QA)

- `npm run worker:dev` (builds, then serves site + API on :8787 with Cloudflare's local runtime). Pass `--var DEV_AUTH_SECRET:<s>` to enable `dev.<user>.<s>` tokens for scripted clients.
- Edge cases not yet covered: a player who never acts (no clock until Step 5), both players disconnecting mid-hand for a long time, many tables at once.

#### What to review (Security)

- `worker/src/auth.ts`: ES256-pinned verification; dev tokens only when `DEV_AUTH_SECRET` is set (never in `wrangler.jsonc`); token only in the subprotocol, never a URL.
- `worker/src/table.ts`: every frame from `seatView`; write-then-send; `reqId`/`actionIndex` idempotency; invite-link seat assignment (anyone with the link and an account can take seat 1 while the table waits — intended for Phase 0).
- `/api/config` returns only the URL and publishable key (test asserts no secret-like fields).

#### Next implementation step (SDE)

Step 4 — Live table (ADR days 9–10): `src/net/client.ts` (socket, backoff, `seq`), `store.ts`, `LiveTable.tsx` reusing `Table`/`ActionBar` via `toHeroGame`, the four additive props, `#play/<id>` route, "Play a friend by link" in the lobby; Playwright two-context e2e against `wrangler dev`. Milestone: two browsers play a full match.

### 2026-10-08 — SDE → QA + Security (Step 2)

Date: 2026-10-08 · Status: **Phase 0 Steps 1–2 done.** Step 2 code is merged into the branch and the database is migrated; production sign-in waits on two user actions. PR: https://github.com/Backpacked333/QuantPoker/pull/8

#### Read first

- `.10x/decisions/sde/multiplayer-platform.md` §Step 2: what was built, live verification, six deviations, tech debt, the exact user actions
- The Step 1 items below (history) are still open for QA and Security

#### User actions (blocking production sign-in)

1. Vercel project `quantpoker` → Settings → Environment Variables (Production, Preview, Development): `VITE_SUPABASE_URL=https://dbkfuxczfkawxqmaieii.supabase.co`, `VITE_SUPABASE_ANON_KEY=sb_publishable_DKfxJ0I2bbnrMHMyxiK4eg_tqsrKoI7`; redeploy.
2. Supabase → Authentication → URL Configuration: Site URL `https://quantpoker.vercel.app`; redirect URLs `https://quantpoker.vercel.app/**`, `https://*-backpacked333s-projects.vercel.app/**`, `http://localhost:5173/**`. Optional: enable Google/GitHub providers.

#### What to test (QA)

- With env set locally (`.env.local`): email magic link round trip (request → open link in the same browser → lands on `#lobby` → choose a name → lobby). Taken name, reserved name, bad characters. Sign out and back in skips the name step.
- Without env: `#lobby` says online play is not set up; the trainer is untouched (e2e covers both).
- Phone header at 320–600 px (swept in this step) and on a real device, especially iOS Safari.

#### What to review (Security)

- `supabase/migrations/202610081*`: grants and RLS (players public-read, own-row column updates; `hands_private`/`incidents` service-role only; `record_hand` service-role only, `security definer`, `search_path=''`). Live PostgREST probes as anon are recorded in the SDE log.
- `src/lib/authReturn.ts`: restores only a `#[\w/-]+` target from sessionStorage, one-shot.
- `src/net/auth.ts`: PKCE; redirect is the bare origin + path; no tokens in URLs or logs.

#### Next implementation step (SDE)

Step 3 — Table service (ADR §Migration path, days 6–8): `worker/` with `wrangler.jsonc`, `auth.ts` (ES256 JWKS), `TableDO` (hibernating sockets, `welcome`/`state`, `act` through `src/engine`, atomic persistence, `LocalController`), `POST /api/matches`, worker tests with `@cloudflare/vitest-plugin`. Needs from the user: a Cloudflare account on Workers Paid and an API token for deploys (ADR open question 5).

### 2026-10-08 — SDE → QA + Security (Step 1; open items carried forward)

Date: 2026-10-08 · Status: **Phase 0 Step 1 done** (engine, protocol, presets). Steps 2–7 not started.

#### Read first

- `.10x/decisions/sde/multiplayer-platform.md` — what was built, every test, the 8 deliberate deviations from the ADR, tech debt
- `.10x/decisions/architect/multiplayer-platform.md` — §Engine, §Wire protocol, §Randomness (the spec this implements)

#### What to test (QA)

- The engine is user-invisible this step; the trainer must be unchanged. Gates run: typecheck, lint, 517 unit tests, build (entry 140.9 kB, unchanged), 12/12 Playwright. Re-run `npm run engine:soak` (100k hands per N; expect ~4–5 min) once to confirm the long tail.
- Review the crafted cases in `src/engine/engine.test.ts` against TDA rules and suggest missing ones (e.g. multi-way all-ins across streets, button seat folding pre-flop at N = 3, all players all-in from the blinds at N ≥ 3).
- `presets` moved out of `App.tsx`: bet-size buttons in the trainer should behave exactly as before (covered by e2e; worth a manual pass on mobile).

#### What to review (Security)

- `src/engine/redact.ts` + `redact.test.ts`: the only serializer. The permutation property (10k states, swap every unseen card and the whole deck → identical JSON) and the key allowlists are the guarantee that no client sees another seat's cards or the deck.
- `src/engine/deck.ts`: per-slot commitment (`HMAC-SHA256(secret, i)[0..16]` salts, SHA-256 leaves, SHA-256 over leaves). Check the construction and that `verifyReveal` rejects every tampering we test; note the deliberate non-goal: it proves no re-deal after commitment, not that the shuffle was unbiased.
- `src/shared/protocol.ts` `parseClientMsg`: allowlist validator (4 KB cap, exact keys, safe integers, `reqId` charset). Fuzzed 20k frames.
- `SeatView` now also carries `actions` and `lastRaise` (public betting info). Confirm you agree they cannot leak private state.

#### Next implementation step (SDE)

Step 2 — Accounts (ADR §Migration path, day 5): Supabase migrations `0001`–`0003` (DBA review first), OAuth + magic link, `src/net/supabase.ts` + `AuthGate` + `#lobby` route as a lazy chunk, `check-bundle.mjs` grep guard, Vercel env vars, verify the access-token `alg` is ES256. Requires from the user: Supabase dashboard access to enable providers, and answers to ADR open questions 2–4 before the lobby ships.

### 2026-10-08 — Principal Architect → Staff Engineer + Engineering Manager (then SDE)

Date: 2026-10-08 · Status: **design decided** (completed; Step 1 implemented by SDE); five user questions open (listed below), none of which changes the system shape.

#### Read these first

- `.10x/decisions/architect/multiplayer-platform.md` — the Phase 0 ADR (everything below is a pointer into it)
- `.10x/decisions/architect/_index.md` — cross-cutting principles every PR must respect
- `.10x/decisions/product-manager/multiplayer-platform.md` — requirements and success metrics
- `.10x/decisions/product-manager/_index.md` — product principles

#### Architecture in one paragraph

A new pure N-player engine (`src/engine/`, deck injected, `score()` from `src/lib/sim.ts`) replaces nothing: `src/lib/poker.ts` keeps driving the Atlas trainer and serves as the N=2 oracle in a differential test. A Cloudflare Worker (`worker/`, same repo, no workspace) hosts two SQLite-backed Durable Objects: `TableDO` (one per match: live hand + deck + secret, hibernating WebSockets, one alarm driven by a `deadlines` list, write-then-send with one atomic `ctx.storage.put`, outbox to Supabase) and `LobbyDO` (singleton: persisted queue, one-active-table map, pair limiter). Clients open `wss://…/ws/table/<matchId>` with `Sec-WebSocket-Protocol: qp.v1, bearer.<supabase-jwt>`; the Worker verifies ES256 with `jose` + JWKS and binds `{userId, seat}` into the socket attachment. Every frame to a client is a full redacted `SeatView` with a `seq`; `act` carries `reqId`/`handNo`/`actionIndex`. Each hand publishes a per-slot HMAC-salted deck commitment at `hand_start` and reveals only board + shown slots afterwards. Postgres (Supabase) receives `hands`/`hands_private`/`hand_holes` after settlement via an idempotent `record_hand(jsonb)`; a Cloudflare Queue consumer verifies each record (and will grade in Phase 1). The React client gets a lazy `src/net/` chunk that projects `SeatView` into the existing `Game` shape (`toHeroGame`) to reuse `Table`/`ActionBar` with four additive props.

#### Component list (what to build, where)

| Component                                                                                 | Path                                                                                                             | ADR section                          |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Engine types, hand state machine, pots, positions, deck/commitment, redaction, projection | `src/engine/{types,hand,pots,positions,deck,redact,project}.ts`                                                  | §Engine, §Randomness                 |
| Engine tests: invariants N=2..6, differential vs `poker.ts`, redaction permutation, bench | `src/engine/*.test.ts`                                                                                           | §Engine (test plan 1–8)              |
| Wire protocol + validator                                                                 | `src/shared/protocol.ts`                                                                                         | §Wire protocol                       |
| Presets extraction (pure part of `App.tsx:391`)                                           | `src/lib/presets.ts`                                                                                             | §Client integration                  |
| Worker router, auth, DOs, deadlines, shuffle, Supabase outbox, queue consumer             | `worker/src/{index,auth,table,lobby,controller,deadlines,shuffle,supabase}.ts`                                   | §Durable Objects, §Auth, §Data model |
| Worker tests (init, two-socket hand, leak, alarm, restore, outbox, fuzz, lobby)           | `worker/test/*.test.ts`                                                                                          | §Local dev/testing                   |
| Client chunk: auth gate, lobby, live table, turn clock, review, store, ws client          | `src/net/*`                                                                                                      | §Client integration, §Lobby          |
| Migrations                                                                                | `supabase/migrations/0001–0003`                                                                                  | §Data model                          |
| CI/deploy                                                                                 | `.github/workflows/{ci,deploy-worker,engine-soak}.yml`, `scripts/check-bundle.mjs` guard, `scripts/smoke-ws.mjs` | §Local dev/testing                   |

#### Integration points (the seams other roles touch)

- `App.tsx`: `parseRoute` gains `#lobby`, `#play/<uuid>`, `#review/<matchId>/<handNo>`; `const LiveApp = lazy(() => import('./net/LiveApp'))`; `buildPresets` moves out; `useTableSounds` extracted. Nothing else in the trainer changes.
- `Table.tsx`: additive, defaulted props `seatNames`, `folded`, `clock`. `ActionBar.tsx`: `opponentName`, `showDeal`.
- `package.json`: deps `@supabase/supabase-js`, `jose`; dev `wrangler`, `@cloudflare/vitest-plugin`; scripts `worker:dev|test|deploy|types`, `typecheck:worker`, `engine:soak`. `vite.config.ts` test `exclude: ['worker/**']`. ESLint ignores + restricted-globals block. `.gitignore` additions.
- Supabase project `quantpoker`: OAuth providers (Google, GitHub) + magic link with redirect URLs; migrations pushed manually (never from CI); service-role key only in Workers secrets.
- Vercel project `quantpoker`: env `VITE_API_ORIGIN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`.
- Cloudflare: Workers Paid; `wrangler.jsonc` with DO bindings `TABLE`/`LOBBY`, `new_sqlite_classes` migration `v1`, queues `quantpoker-hands` + DLQ; secrets `SUPABASE_SERVICE_ROLE_KEY`; CI deploy via `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`.

#### Build order and milestone (EM)

Seven steps, 15 working days, 3 reserve — ADR §Migration path. **Day-10 milestone: two browsers play a full 20-hand HU match through the deployed Worker and the Vercel build**, reached via the invite-by-link harness before the lobby, clocks or commitment exist, so slips in those do not move it. Step 1 (engine, days 1–4) is user-invisible and is the critical path: no UI work starts until `engine.test.ts`, `differential.test.ts` and `redact.test.ts` are green.

#### Acceptance criteria to carry into tickets (Staff Engineer)

- Chip conservation, pot sums, legality, termination and replay equality over 10k seeded hands per N (100k under `ENGINE_SOAK=1`); `buildPots === referencePots`; crafted cases list in ADR §Engine item 8.
- N=2 differential oracle: equal `stacks`, `bets`, pot, board, winner, hero net and full `legalActions` after every step vs `src/lib/poker.ts`.
- Redaction: `SeatView` key allowlist; permuting other seats' hole cards leaves the serialized view byte-identical; two-socket leak test over the wire.
- Idempotency: repeated `reqId` re-acks without state change; stale `actionIndex` → `error stale` + snapshot; second socket per user → `4001`.
- Restore: evict + recreate `TableDO` between two actions → identical per-seat views; alarm auto-fold and 3-timeout forfeit via `runDurableObjectAlarm`.
- Commitment: `verifyReveal` passes for every recorded hand; segment reuse (Phase 1) yields a different commitment.
- Existing gates untouched: `npm run typecheck|lint|test|build|e2e` green; entry chunk ≤ 150 kB gzip and free of `supabase|src/net/`; `src/net/imports.test.ts` forbids analysis modules.
- Live e2e: two contexts with dev tokens play a hand through the real DOM; `page.on('websocket')` asserts no opponent card ids before `shown`.

#### Open questions for the user (do not block Steps 1–4)

1. Per-slot commitment with partial reveal (architect's choice; keeps "never ship unshown cards") vs simpler full-deck reveal (requires the PM to amend `integrity-and-trust.md`). Needed by day 11.
2. Show "Play a friend by link" in the lobby (default: yes, secondary) or hide it.
3. Domain name for `api.<domain>` and the Vercel custom domain; until then `*.workers.dev` + `quantpoker.vercel.app`.
4. Vercel Hobby is non-commercial-use only; confirm or budget Pro.
5. Confirm the Cloudflare account is on Workers Paid before day 6.

#### Not in scope — don't design or build for it

Rating/grading/Glicko-2 (Phase 1; seams: queue consumer, `project.ts`, `bench.test.ts`), duplicate segments (Phase 1; seams: `TableController`, `deck:<n>` retention, fresh secret per hand), 6-max/arenas/bots/dead-button (Phase 2; same `TableDO`), spectating, chat, regions, muck, delta protocol, anonymous sign-in, Supabase local stack, real money, tournaments, native apps, KYC, auto-bans.

---

### 2026-10-08 — Product Manager → Principal Architect (completed)

Scoped five features (`multiplayer-platform`, `heads-up-duplicate-ladder`, `rating-and-leaderboard`, `six-max-tables`, `integrity-and-trust`); user aligned with revisions (rated 6-max ships with casual; integrity v2 growth-triggered; review→lesson loop P0). Asked the Architect to decide: engine shape, server stack, auth/DB, hosting, rating pipeline placement, deck commitment, lab-off enforcement. All seven are answered in `.10x/decisions/architect/multiplayer-platform.md` (§Decision summary): new injected engine with `poker.ts` as oracle; Cloudflare DOs (user's call); Supabase Auth + Postgres archive; Vercel static + Workers; grading in a Queue consumer (CPU measured 80–200 ms per flop decision); per-slot HMAC-salted commitment; hide the lab UI on live tables, make the protocol unable to carry analysis, log `decisionMs`.

_(`.10x/` created 2026-10-08; no earlier history.)_
