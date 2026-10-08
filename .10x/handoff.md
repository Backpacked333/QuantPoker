# Handoff

## Current handoff: Principal Architect → Staff Engineer + Engineering Manager (then SDE)

Date: 2026-10-08 · Status: **design decided**; five user questions open (listed below), none of which changes the system shape.

### Read these first

- `.10x/decisions/architect/multiplayer-platform.md` — the Phase 0 ADR (everything below is a pointer into it)
- `.10x/decisions/architect/_index.md` — cross-cutting principles every PR must respect
- `.10x/decisions/product-manager/multiplayer-platform.md` — requirements and success metrics
- `.10x/decisions/product-manager/_index.md` — product principles

### Architecture in one paragraph

A new pure N-player engine (`src/engine/`, deck injected, `score()` from `src/lib/sim.ts`) replaces nothing: `src/lib/poker.ts` keeps driving the Atlas trainer and serves as the N=2 oracle in a differential test. A Cloudflare Worker (`worker/`, same repo, no workspace) hosts two SQLite-backed Durable Objects: `TableDO` (one per match: live hand + deck + secret, hibernating WebSockets, one alarm driven by a `deadlines` list, write-then-send with one atomic `ctx.storage.put`, outbox to Supabase) and `LobbyDO` (singleton: persisted queue, one-active-table map, pair limiter). Clients open `wss://…/ws/table/<matchId>` with `Sec-WebSocket-Protocol: qp.v1, bearer.<supabase-jwt>`; the Worker verifies ES256 with `jose` + JWKS and binds `{userId, seat}` into the socket attachment. Every frame to a client is a full redacted `SeatView` with a `seq`; `act` carries `reqId`/`handNo`/`actionIndex`. Each hand publishes a per-slot HMAC-salted deck commitment at `hand_start` and reveals only board + shown slots afterwards. Postgres (Supabase) receives `hands`/`hands_private`/`hand_holes` after settlement via an idempotent `record_hand(jsonb)`; a Cloudflare Queue consumer verifies each record (and will grade in Phase 1). The React client gets a lazy `src/net/` chunk that projects `SeatView` into the existing `Game` shape (`toHeroGame`) to reuse `Table`/`ActionBar` with four additive props.

### Component list (what to build, where)

| Component | Path | ADR section |
| --- | --- | --- |
| Engine types, hand state machine, pots, positions, deck/commitment, redaction, projection | `src/engine/{types,hand,pots,positions,deck,redact,project}.ts` | §Engine, §Randomness |
| Engine tests: invariants N=2..6, differential vs `poker.ts`, redaction permutation, bench | `src/engine/*.test.ts` | §Engine (test plan 1–8) |
| Wire protocol + validator | `src/shared/protocol.ts` | §Wire protocol |
| Presets extraction (pure part of `App.tsx:391`) | `src/lib/presets.ts` | §Client integration |
| Worker router, auth, DOs, deadlines, shuffle, Supabase outbox, queue consumer | `worker/src/{index,auth,table,lobby,controller,deadlines,shuffle,supabase}.ts` | §Durable Objects, §Auth, §Data model |
| Worker tests (init, two-socket hand, leak, alarm, restore, outbox, fuzz, lobby) | `worker/test/*.test.ts` | §Local dev/testing |
| Client chunk: auth gate, lobby, live table, turn clock, review, store, ws client | `src/net/*` | §Client integration, §Lobby |
| Migrations | `supabase/migrations/0001–0003` | §Data model |
| CI/deploy | `.github/workflows/{ci,deploy-worker,engine-soak}.yml`, `scripts/check-bundle.mjs` guard, `scripts/smoke-ws.mjs` | §Local dev/testing |

### Integration points (the seams other roles touch)

- `App.tsx`: `parseRoute` gains `#lobby`, `#play/<uuid>`, `#review/<matchId>/<handNo>`; `const LiveApp = lazy(() => import('./net/LiveApp'))`; `buildPresets` moves out; `useTableSounds` extracted. Nothing else in the trainer changes.
- `Table.tsx`: additive, defaulted props `seatNames`, `folded`, `clock`. `ActionBar.tsx`: `opponentName`, `showDeal`.
- `package.json`: deps `@supabase/supabase-js`, `jose`; dev `wrangler`, `@cloudflare/vitest-plugin`; scripts `worker:dev|test|deploy|types`, `typecheck:worker`, `engine:soak`. `vite.config.ts` test `exclude: ['worker/**']`. ESLint ignores + restricted-globals block. `.gitignore` additions.
- Supabase project `quantpoker`: OAuth providers (Google, GitHub) + magic link with redirect URLs; migrations pushed manually (never from CI); service-role key only in Workers secrets.
- Vercel project `quantpoker`: env `VITE_API_ORIGIN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`.
- Cloudflare: Workers Paid; `wrangler.jsonc` with DO bindings `TABLE`/`LOBBY`, `new_sqlite_classes` migration `v1`, queues `quantpoker-hands` + DLQ; secrets `SUPABASE_SERVICE_ROLE_KEY`; CI deploy via `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`.

### Build order and milestone (EM)

Seven steps, 15 working days, 3 reserve — ADR §Migration path. **Day-10 milestone: two browsers play a full 20-hand HU match through the deployed Worker and the Vercel build**, reached via the invite-by-link harness before the lobby, clocks or commitment exist, so slips in those do not move it. Step 1 (engine, days 1–4) is user-invisible and is the critical path: no UI work starts until `engine.test.ts`, `differential.test.ts` and `redact.test.ts` are green.

### Acceptance criteria to carry into tickets (Staff Engineer)

- Chip conservation, pot sums, legality, termination and replay equality over 10k seeded hands per N (100k under `ENGINE_SOAK=1`); `buildPots === referencePots`; crafted cases list in ADR §Engine item 8.
- N=2 differential oracle: equal `stacks`, `bets`, pot, board, winner, hero net and full `legalActions` after every step vs `src/lib/poker.ts`.
- Redaction: `SeatView` key allowlist; permuting other seats' hole cards leaves the serialized view byte-identical; two-socket leak test over the wire.
- Idempotency: repeated `reqId` re-acks without state change; stale `actionIndex` → `error stale` + snapshot; second socket per user → `4001`.
- Restore: evict + recreate `TableDO` between two actions → identical per-seat views; alarm auto-fold and 3-timeout forfeit via `runDurableObjectAlarm`.
- Commitment: `verifyReveal` passes for every recorded hand; segment reuse (Phase 1) yields a different commitment.
- Existing gates untouched: `npm run typecheck|lint|test|build|e2e` green; entry chunk ≤ 150 kB gzip and free of `supabase|src/net/`; `src/net/imports.test.ts` forbids analysis modules.
- Live e2e: two contexts with dev tokens play a hand through the real DOM; `page.on('websocket')` asserts no opponent card ids before `shown`.

### Open questions for the user (do not block Steps 1–4)

1. Per-slot commitment with partial reveal (architect's choice; keeps "never ship unshown cards") vs simpler full-deck reveal (requires the PM to amend `integrity-and-trust.md`). Needed by day 11.
2. Show "Play a friend by link" in the lobby (default: yes, secondary) or hide it.
3. Domain name for `api.<domain>` and the Vercel custom domain; until then `*.workers.dev` + `quantpoker.vercel.app`.
4. Vercel Hobby is non-commercial-use only; confirm or budget Pro.
5. Confirm the Cloudflare account is on Workers Paid before day 6.

### Not in scope — don't design or build for it

Rating/grading/Glicko-2 (Phase 1; seams: queue consumer, `project.ts`, `bench.test.ts`), duplicate segments (Phase 1; seams: `TableController`, `deck:<n>` retention, fresh secret per hand), 6-max/arenas/bots/dead-button (Phase 2; same `TableDO`), spectating, chat, regions, muck, delta protocol, anonymous sign-in, Supabase local stack, real money, tournaments, native apps, KYC, auto-bans.

---

## Handoff history

### 2026-10-08 — Product Manager → Principal Architect (completed)

Scoped five features (`multiplayer-platform`, `heads-up-duplicate-ladder`, `rating-and-leaderboard`, `six-max-tables`, `integrity-and-trust`); user aligned with revisions (rated 6-max ships with casual; integrity v2 growth-triggered; review→lesson loop P0). Asked the Architect to decide: engine shape, server stack, auth/DB, hosting, rating pipeline placement, deck commitment, lab-off enforcement. All seven are answered in `.10x/decisions/architect/multiplayer-platform.md` (§Decision summary): new injected engine with `poker.ts` as oracle; Cloudflare DOs (user's call); Supabase Auth + Postgres archive; Vercel static + Workers; grading in a Queue consumer (CPU measured 80–200 ms per flop decision); per-slot HMAC-salted commitment; hide the lab UI on live tables, make the protocol unable to carry analysis, log `decisionMs`.

_(`.10x/` created 2026-10-08; no earlier history.)_
