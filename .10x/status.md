# Project status

Last updated: 2026-10-08 by SDE

## Phase

**Phase 0 implementation in progress.** Steps 1 (engine), 2 (accounts) and 3 (table server) of 7 done; next Step 4 (live table in the browser — the two-browser milestone). Hosting is now one Cloudflare Worker for site + game server (Vercel retired); see the ADR amendment.

Supabase project `quantpoker` also carries an earlier, unmerged line of work's schema (`20261007192620_learning_cloud`: `profiles`, `hand_results`, learning tables, AI-coach usage). Multiplayer tables are additive beside it; see `.10x/decisions/sde/multiplayer-platform.md` §Step 2.

Note: `.10x/` was created this session. Discovery of the codebase was done inline by the PM (`[DISCOVERED]` entries in `.10x/decisions/product-manager/_index.md`) and verified by the Architect's design workflow. CTO strategic review has not run; the one build-vs-buy call (Cloudflare Durable Objects vs. a Node server vs. Supabase-only) was made by the user directly.

## Initiative

"Multiplayer QuantPoker": real online play-money poker between humans, chess.com-style rating + accuracy, public ladder/profile for quant talent. Two formats: heads-up duplicate and 6-max. Solo builder, AI-assisted, ship ASAP. Growth bet: curiosity + learning quant thinking through play; recruiters come months later.

## Stack (decided)

Site + game server: one Cloudflare Worker `quantpoker` (Workers Paid, Git-connected): static assets from the Vite build, `/api/*` and `/ws/*` to the Worker; Durable Objects (`TableDO` per match, `LobbyDO` singleton from Step 6), SQLite-backed, WebSocket hibernation, alarms. Auth + archive: Supabase project `quantpoker` in the Pro org "Quant Poker" (us-east-1, Postgres 17), ES256 JWTs verified in the Worker with `jose`. Grading (Phase 1): Cloudflare Queue consumer in the same Worker.

## Roadmap

| Phase             | Feature slugs                                                                                          | Exit criteria                                                                                                                                                                              | Effort                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 0 — Foundation    | `multiplayer-platform`                                                                                 | Two browsers play a full HU match through the deployed Worker and Vercel build (day-10 milestone); engine invariant suite green N=2..6; lobby quick-match; commitment + records; CI/deploy | 15 working days + 3 reserve (see ADR §Migration path) |
| 1 — HU ladder     | `heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1, review→lesson loop | Rated duplicate matches, Glicko-2 ± RD, accuracy, profile, ladder                                                                                                                          | 3–4 weeks                                             |
| 2 — 6-max         | `six-max-tables` casual + rated arenas, 6-max rating                                                   | 6 seats, N-seat `Table`, arenas, provisional rating                                                                                                                                        | 3–4 weeks                                             |
| Later (triggered) | `integrity-and-trust` v2                                                                               | Fires on ≥1,000 players, first recruiter inbound, first credible cheating report, or a sponsored event                                                                                     | —                                                     |

## Tasks

- [x] PM: problem, audience, constraints, success metrics; 5 feature specs; user alignment
- [x] Architect: Phase 0 system design (`.10x/decisions/architect/multiplayer-platform.md`) — engine, DOs, protocol, auth, data model, randomness/commitment, grading placement, client integration, lobby, failure modes, dev/CI, 7-step migration path, verified assumptions
- [ ] User: answer the 5 open questions in the ADR (commitment scheme, invite-link visibility, domain, Vercel Hobby terms, Cloudflare plan)
- [ ] Staff Engineer / EM: turn the 7 migration steps into tickets with acceptance tests; confirm day-10 milestone scope
- [x] SDE: Step 1 — `src/engine/` + invariant, differential, redaction, commitment tests; `src/shared/protocol.ts`; `src/lib/presets.ts` (`.10x/decisions/sde/multiplayer-platform.md`). All gates green.
- [x] SDE: Step 2 — Supabase migrations applied (`players`, matches/hands archive, `record_hand`, FK index) with PGlite RLS tests; `#lobby` sign-in (email link; Google/GitHub when enabled), username, lobby shell; bundle guard; phone header fix. All gates green.
- [x] User: Cloudflare Workers Paid + Git-connected Worker; Supabase Pro org
- [ ] User: set production branch to `main` in Cloudflare (Worker build) and Supabase (GitHub integration); set Supabase Auth Site URL / redirect URLs to the workers.dev address (values in the SDE log §Step 3); optionally enable Google/GitHub
- [ ] SDE: first real sign-in on the deployed site, then decode the access token header and confirm `alg: ES256` (ADR day-5 check)
- [x] SDE: Step 3 — `worker/` + root `wrangler.jsonc`: `TableDO`, ES256 auth, invite-by-link matches, runtime `/api/config`; 9 Workers-runtime tests + a real two-client smoke run. All gates green.
- [ ] SDE: Steps 4–7 per ADR (next: Step 4 live table)
- [ ] Security: light review of auth upgrade path, redaction tests and `hands_private` RLS before Step 7 deploy
- [ ] DBA: post-hoc review of the four applied migrations (`supabase/migrations/202610081*`); RLS behaviour is covered by `supabase/tests/migrations.test.ts`
