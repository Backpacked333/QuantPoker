# Handoff

## Current handoff: SDE → QA Engineer + Security Engineer (+ user actions)

Date: 2026-10-08 · Status: **Phase 0 Steps 1–2 done.** Step 2 code is merged into the branch and the database is migrated; production sign-in waits on two user actions. PR: https://github.com/Backpacked333/QuantPoker/pull/8

### Read first

- `.10x/decisions/sde/multiplayer-platform.md` §Step 2: what was built, live verification, six deviations, tech debt, the exact user actions
- The Step 1 items below (history) are still open for QA and Security

### User actions (blocking production sign-in)

1. Vercel project `quantpoker` → Settings → Environment Variables (Production, Preview, Development): `VITE_SUPABASE_URL=https://dbkfuxczfkawxqmaieii.supabase.co`, `VITE_SUPABASE_ANON_KEY=sb_publishable_DKfxJ0I2bbnrMHMyxiK4eg_tqsrKoI7`; redeploy.
2. Supabase → Authentication → URL Configuration: Site URL `https://quantpoker.vercel.app`; redirect URLs `https://quantpoker.vercel.app/**`, `https://*-backpacked333s-projects.vercel.app/**`, `http://localhost:5173/**`. Optional: enable Google/GitHub providers.

### What to test (QA)

- With env set locally (`.env.local`): email magic link round trip (request → open link in the same browser → lands on `#lobby` → choose a name → lobby). Taken name, reserved name, bad characters. Sign out and back in skips the name step.
- Without env: `#lobby` says online play is not set up; the trainer is untouched (e2e covers both).
- Phone header at 320–600 px (swept in this step) and on a real device, especially iOS Safari.

### What to review (Security)

- `supabase/migrations/202610081*`: grants and RLS (players public-read, own-row column updates; `hands_private`/`incidents` service-role only; `record_hand` service-role only, `security definer`, `search_path=''`). Live PostgREST probes as anon are recorded in the SDE log.
- `src/lib/authReturn.ts`: restores only a `#[\w/-]+` target from sessionStorage, one-shot.
- `src/net/auth.ts`: PKCE; redirect is the bare origin + path; no tokens in URLs or logs.

### Next implementation step (SDE)

Step 3 — Table service (ADR §Migration path, days 6–8): `worker/` with `wrangler.jsonc`, `auth.ts` (ES256 JWKS), `TableDO` (hibernating sockets, `welcome`/`state`, `act` through `src/engine`, atomic persistence, `LocalController`), `POST /api/matches`, worker tests with `@cloudflare/vitest-plugin`. Needs from the user: a Cloudflare account on Workers Paid and an API token for deploys (ADR open question 5).

---

## Handoff history

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
