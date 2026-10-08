# Handoff

## Current handoff: Product Manager → Principal Architect

Date: 2026-10-08 · Status: **aligned with user.** Revision after feedback: rated 6-max ships with casual 6-max (Phase 2); collusion/RTA detection deferred to a growth-triggered v2; the review→curriculum lesson loop is P0 in Phase 1 because learning-through-play is the growth bet.

### Read these first

- `.10x/decisions/product-manager/_index.md` — principles and the `[DISCOVERED]` state of the code
- `.10x/decisions/product-manager/multiplayer-platform.md` — Phase 0 requirements
- `.10x/decisions/product-manager/heads-up-duplicate-ladder.md` — Phase 1 format and acceptance criteria
- `.10x/decisions/product-manager/rating-and-leaderboard.md` — rating/accuracy/profile requirements
- `.10x/decisions/product-manager/integrity-and-trust.md` — threat table; v1 is in Phase 1 scope
- `.10x/decisions/product-manager/six-max-tables.md` — Phase 2/3; the engine requirement applies to Phase 0

### Priority order

1. `multiplayer-platform` (P0) — N-player server-authoritative engine, auth, transport, lobby, HU casual play
2. `heads-up-duplicate-ladder` (P0) + `rating-and-leaderboard` v1 (P0) + `integrity-and-trust` v1 (P0, near-free items only) + review→lesson loop (P0)
3. `six-max-tables` casual **and** rated arenas together (P1), 6-max provisional rating
4. `integrity-and-trust` v2 (P2) — only when a growth trigger fires; design the data model now (public hand histories, per-action timings, seat co-occurrence is derivable) so it can be applied retroactively

### Decisions the Architect must make (PM has an opinion, Architect decides)

1. **N-player engine shape.** Generalise `src/lib/poker.ts` (immutable transitions, public history) to N seats with side pots, or write a new `engine/` package and keep the old one for Atlas practice. PM preference: one engine, shared between server and client (client uses it only for rendering/legal-action hints), with the existing Vitest invariants ported and extended to N=2..6. Keep `Player` as a seat index.
2. **Server stack.** Single Node/TS process, WebSockets. Colyseus vs. plain `ws` + tiny protocol. PM preference: whatever gets Phase 0 done in 2–3 weeks by one person; avoid anything needing Kubernetes.
3. **Auth + DB.** Supabase Auth + Postgres is the default (MCP tooling exists in this environment). Decide what lives in Postgres (accounts, matches, hands, ratings, reports) vs. in-memory on the game server (live tables).
4. **Hosting.** One region, one small machine for the game server (Fly.io / Railway / a VM), static client on Vercel/Netlify (Vercel MCP exists here). Latency target p95 < 150 ms in-region.
5. **Rating pipeline.** Where Glicko-2 and accuracy grading run (server job after match end), how the range worker (`src/lib/range.ts`) runs server-side (Node worker threads), and how the "generic population opponent model" for accuracy is represented.
6. **Deck commitment.** Hash-commit per hand, reveal after; choose the scheme and where it's stored/displayed.
7. **Lab-off-during-play enforcement.** The server must not emit analysis data mid-hand; the client must not be able to compute it from what it has (it has only its own cards + board + public actions — note it *could* compute equity vs. uniform locally; decide whether to accept that or strip the local lab code path on rated tables; PM: hide the UI and accept that a determined user can compute uniform equity client-side — that is weaker than any external tool anyway, and the external-RTA telemetry covers it).

### Acceptance criteria to carry into design

- Chip conservation, side-pot sums and legal-action sets property-tested over ≥ 10k random hands for N=2..6 before any UI.
- No client ever receives another seat's hole cards before showdown, nor the deck; covered by an automated network test.
- Duplicate: segment 2 replays segment 1's decks with seats swapped, asserted card-for-card.
- All existing Playwright gates (keyboard, axe, mobile, frame time, bundle budget) continue to pass; the trainer (`#table` vs Atlas) keeps working unchanged.

### Open questions for the user (PM will ask; Architect may proceed on PM defaults)

- Domain/name for public profiles; whether rated hand histories public-by-default is acceptable (PM default: yes, with ToS).
- Launch cohort source (uni quant clubs / Discord / HN) — affects whether scheduled arenas are needed in Phase 1 or only Phase 2.

### Not in scope — don't design for it

Real money, tournaments, native apps, free-text chat, friends/clubs, multiway EV grading, KYC, auto-bans, multi-region.

---

## Handoff history

_(none before this session; `.10x/` created 2026-10-08)_
