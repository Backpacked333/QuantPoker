# Project status

Last updated: 2026-10-09 by DevOps/SRE (deploy verification)

## Phase

**Phase 0 milestone reached: two browsers play each other through the Worker.** Steps 1–6 of 7 done: quick-match lobby, shot clock with time bank and forfeit, provably fair deals ("Deck verified" in the browser), every hand archived to Postgres. Next Step 7 (hardening, CI, launch). Hosting is one Cloudflare Worker for site + game server; see the ADR amendment.

Deploy verification 2026-10-09 (`.10x/reviews/2026-10-09-deploy-verification.md`): production serves exactly `main` (`22ccf8a`; 30/30 built assets byte-identical), migrations match, `/api/config` exposes only the URL and publishable key, JWKS has one ES256 key. **Open:** no account has signed in to production yet (0 users), so the day-5 token check and the archive/RLS proof wait on the user's two sign-ins and one match.

Supabase project `quantpoker` also carries an earlier line of work's schema (`20261007192620_learning_cloud`: `profiles`, `hand_results`, learning tables, AI-coach usage; all tables empty). Its migration file is now in the repo, byte-identical to production, so the repo and the live database have the same 7 migrations. Multiplayer tables are additive beside it.

## Repository (cleanup 2026-10-09)

- Default branch becomes **`main`** (the old default `devin/1791351254-quantpoker-learning-table` is renamed in GitHub settings, keeping its history). Cloudflare Workers Builds and the Supabase GitHub integration deploy from `main`. Vercel is retired.
- PR #8 (multiplayer Phase 0) lands as **one squash commit**; its 20 step commits stay readable on the PR page (`refs/pull/8/head`).
- PR #2 (Devin's earlier app line: AI coach, older learning studio, Vercel cloud saves) is **closed, not merged**; superseded by PR #7 and #8. Kept as `archive/context-aware-coach`, `archive/cinematic-poker`, `archive/supabase-vercel` and `refs/pull/{2,3,6}/head`. Pieces that exist only there, for a possible later port to the Worker: the AI coach (`server/coach.ts`, `src/lib/coach.ts`, `coach-stream.ts`) and the 3D terrain frontier/slice/camera (`Surface.tsx`, `terrain-camera.ts`).
- PR #5 (curriculum focus, atomic-save and memo fixes) is merged into `main`.
- All other branches had their content in the default branch already (checked by ancestry, patch equivalence and file content) and are deleted; tips archived as `archive/*` tags. A full mirror bundle of the repo before the cleanup was given to the user.
- Devin stays installed with PR monitoring turned off.

Note: `.10x/` was created this session. Discovery of the codebase was done inline by the PM (`[DISCOVERED]` entries in `.10x/decisions/product-manager/_index.md`) and verified by the Architect's design workflow. CTO strategic review has not run; the one build-vs-buy call (Cloudflare Durable Objects vs. a Node server vs. Supabase-only) was made by the user directly.

## Initiative

"Multiplayer QuantPoker": real online play-money poker between humans, chess.com-style rating + accuracy, public ladder/profile for quant talent. Two formats: heads-up duplicate and 6-max. Solo builder, AI-assisted, ship ASAP. Growth bet: curiosity + learning quant thinking through play; recruiters come months later.

## Stack (decided)

Site + game server: one Cloudflare Worker `quantpoker` (Workers Paid, Git-connected): static assets from the Vite build, `/api/*` and `/ws/*` to the Worker; Durable Objects (`TableDO` per match, `LobbyDO` singleton from Step 6), SQLite-backed, WebSocket hibernation, alarms. Auth + archive: Supabase project `quantpoker` in the Pro org "Quant Poker" (us-east-1, Postgres 17), ES256 JWTs verified in the Worker with `jose`. Grading (Phase 1): Cloudflare Queue consumer in the same Worker.

## Roadmap

| Phase             | Feature slugs                                                                                          | Exit criteria                                                                                                                                                                                            | Effort                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0 — Foundation    | `multiplayer-platform`                                                                                 | Two browsers play a full HU match through the deployed Cloudflare Worker (site + game server; day-10 milestone); engine invariant suite green N=2..6; lobby quick-match; commitment + records; CI/deploy | 15 working days + 3 reserve (see ADR §Migration path) |
| 1 — HU ladder     | `heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1, review→lesson loop | Rated duplicate matches, Glicko-2 ± RD, accuracy, profile, ladder                                                                                                                                        | 3–4 weeks                                             |
| 2 — 6-max         | `six-max-tables` casual + rated arenas, 6-max rating                                                   | 6 seats, N-seat `Table`, arenas, provisional rating                                                                                                                                                      | 3–4 weeks                                             |
| Later (triggered) | `integrity-and-trust` v2                                                                               | Fires on ≥1,000 players, first recruiter inbound, first credible cheating report, or a sponsored event                                                                                                   | —                                                     |

## Tasks

- [x] PM: problem, audience, constraints, success metrics; 5 feature specs; user alignment
- [x] Architect: Phase 0 system design (`.10x/decisions/architect/multiplayer-platform.md`) — engine, DOs, protocol, auth, data model, randomness/commitment, grading placement, client integration, lobby, failure modes, dev/CI, 7-step migration path, verified assumptions
- [ ] User: answer the 5 open questions in the ADR (commitment scheme, invite-link visibility, domain; the Vercel and Cloudflare-plan questions are settled: Cloudflare hosts everything)
- [ ] Staff Engineer / EM: turn the 7 migration steps into tickets with acceptance tests; confirm day-10 milestone scope
- [x] SDE: Step 1 — `src/engine/` + invariant, differential, redaction, commitment tests; `src/shared/protocol.ts`; `src/lib/presets.ts` (`.10x/decisions/sde/multiplayer-platform.md`). All gates green.
- [x] SDE: Step 2 — Supabase migrations applied (`players`, matches/hands archive, `record_hand`, FK index) with PGlite RLS tests; `#lobby` sign-in (email link; Google/GitHub when enabled), username, lobby shell; bundle guard; phone header fix. All gates green.
- [x] User: Cloudflare Workers Paid + Git-connected Worker; Supabase Pro org
- [ ] User: repo cleanup dashboard steps (rename default branch to `main`; Cloudflare and Supabase production branch → `main`; Cloudflare preview builds off; delete the Vercel project; Supabase Auth Site URL → workers.dev; optionally enable Google/GitHub) — see `.10x/handoff.md`
  - [x] Default branch is `main` (verified 2026-10-09); production serves the `main` build (verified by artifact; Cloudflare branch-control setting not readable via MCP)
  - [ ] Cleanup script (step 7): 14 non-`main` branches still on `origin`, including `claude/amazing-ride-4vip4x`, which is not in the branch-fates table
- [ ] SDE: first real sign-in on the deployed site, then decode the access token header and confirm `alg: ES256` (ADR day-5 check)
  - [x] JWKS: exactly one ES256 key, `kid 146bb67a-3a94-457d-b882-dc53d6154404` (2026-10-09)
  - [ ] Real token header: blocked, 0 users in production; waiting on the user's sign-in
- [x] SDE: Step 3 — `worker/` + root `wrangler.jsonc`: `TableDO`, ES256 auth, invite-by-link matches, runtime `/api/config`; 9 Workers-runtime tests + a real two-client smoke run. All gates green.
- [x] SDE: Step 4 — live table in the browser (`src/net/client.ts`, `LiveTable`, `#play/<id>`, Play a friend by link); two-browser e2e against `wrangler dev`; full 20-hand match verified. All gates green.
- [x] SDE: Step 5 — turn clock + bank + auto check/fold + 3-timeout forfeit via one DO alarm; `hand_start` commitment, `hand_end` + `reveal`, in-browser "Deck verified" review; outbox → `record_match`/`record_hand` (new migration applied live, dry-run verified). 592 unit, 38 worker, 17 e2e; 20-hand smoke with a real 80 s timeout. (`.10x/decisions/sde/multiplayer-platform.md` §Step 5)
- [ ] User: create a Supabase secret key and add it to the Worker as `SUPABASE_SECRET_KEY` (until then nothing is archived)
  - [ ] Proof by one two-account production match + role-scoped `hand_holes` queries (queries dry-run on production 2026-10-09; archive tables still empty)
- [x] DevOps: deploy verification steps 1–3 (default branch, migrations, `/api/config`, JWKS, live assets = `main`) — `.10x/reviews/2026-10-09-deploy-verification.md`
- [x] SDE: Step 6 — `LobbyDO` quick-match (persisted queue, oldest-first pairing, ≤ 2 pairings per pair per day), one active table per account (queue resumes, invite 409/4409, self-healing), 30 s no-show (void match + abandonment; migration applied live), Find a match enabled with wait timer and 60 s bail-out. 605 unit, 52 worker, 18 e2e; real-time no-show smoke. (`.10x/decisions/sde/multiplayer-platform.md` §Step 6)
- [ ] SDE: Step 7 per ADR (hardening, verify consumer, CI deploy, rate limits, Fair Play page)
- [x] QA: gap review of Steps 1–4 (`.10x/decisions/qa/multiplayer-platform.md`, `.10x/reviews/2026-10-08-qa-report.md`): 27 tests added (real ES256 auth, engine side pots at N=3–4, rejoin presence, live captions and offline states); 1 bug fixed (opponent shown disconnected after a rejoin). Gates: 577 unit, 25 worker, 17 e2e, all green. Release-ready for the invite-link beta; no blocking bugs.
- [ ] Security: light review of auth upgrade path, redaction tests and `hands_private` RLS before Step 7 deploy
- [ ] DBA: post-hoc review of the four applied migrations (`supabase/migrations/202610081*`); RLS behaviour is covered by `supabase/tests/migrations.test.ts`
