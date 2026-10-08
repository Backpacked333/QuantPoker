# Project status

Last updated: 2026-10-08 by Principal Architect

## Phase

**Design complete for Phase 0 (`multiplayer-platform`).** Next: Staff Engineer / EM sequencing, then SDE implementation starting with the engine (no UI).

Note: `.10x/` was created this session. Discovery of the codebase was done inline by the PM (`[DISCOVERED]` entries in `.10x/decisions/product-manager/_index.md`) and verified by the Architect's design workflow. CTO strategic review has not run; the one build-vs-buy call (Cloudflare Durable Objects vs. a Node server vs. Supabase-only) was made by the user directly.

## Initiative

"Multiplayer QuantPoker": real online play-money poker between humans, chess.com-style rating + accuracy, public ladder/profile for quant talent. Two formats: heads-up duplicate and 6-max. Solo builder, AI-assisted, ship ASAP. Growth bet: curiosity + learning quant thinking through play; recruiters come months later.

## Stack (decided)

Client: this repo's Vite build on Vercel project `quantpoker` (hash routes). Game server: Cloudflare Workers + Durable Objects (`TableDO` per match, `LobbyDO` singleton), SQLite-backed, WebSocket hibernation, alarms; Workers Paid plan. Auth + archive: Supabase project `quantpoker` (us-east-1, Postgres 17), ES256 JWTs verified in the Worker with `jose`. Grading (Phase 1): Cloudflare Queue consumer in the same Worker.

## Roadmap

| Phase | Feature slugs | Exit criteria | Effort |
| --- | --- | --- | --- |
| 0 — Foundation | `multiplayer-platform` | Two browsers play a full HU match through the deployed Worker and Vercel build (day-10 milestone); engine invariant suite green N=2..6; lobby quick-match; commitment + records; CI/deploy | 15 working days + 3 reserve (see ADR §Migration path) |
| 1 — HU ladder | `heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1, review→lesson loop | Rated duplicate matches, Glicko-2 ± RD, accuracy, profile, ladder | 3–4 weeks |
| 2 — 6-max | `six-max-tables` casual + rated arenas, 6-max rating | 6 seats, N-seat `Table`, arenas, provisional rating | 3–4 weeks |
| Later (triggered) | `integrity-and-trust` v2 | Fires on ≥1,000 players, first recruiter inbound, first credible cheating report, or a sponsored event | — |

## Tasks

- [x] PM: problem, audience, constraints, success metrics; 5 feature specs; user alignment
- [x] Architect: Phase 0 system design (`.10x/decisions/architect/multiplayer-platform.md`) — engine, DOs, protocol, auth, data model, randomness/commitment, grading placement, client integration, lobby, failure modes, dev/CI, 7-step migration path, verified assumptions
- [ ] User: answer the 5 open questions in the ADR (commitment scheme, invite-link visibility, domain, Vercel Hobby terms, Cloudflare plan)
- [ ] Staff Engineer / EM: turn the 7 migration steps into tickets with acceptance tests; confirm day-10 milestone scope
- [ ] SDE: Step 1 — `src/engine/` + invariant, differential, redaction tests (days 1–4)
- [ ] SDE: Steps 2–7 per ADR
- [ ] Security: light review of auth upgrade path, redaction tests and `hands_private` RLS before Step 7 deploy
- [ ] DBA: review `0001`–`0003` migrations before `db push` (day 5)
