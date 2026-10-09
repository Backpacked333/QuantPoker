# Project status

Last updated: 2026-10-09 by SDE (Step 7 built; not deployed)

## Phase

**Phase 0 milestone reached: two browsers play each other through the Worker.** Steps 1–6 of 7 done: quick-match lobby, shot clock with time bank and forfeit, provably fair deals ("Deck verified" in the browser), every hand archived to Postgres. Hosting is one Cloudflare Worker for site + game server; see the ADR amendment.

**Step 7 built, tested, not deployed (2026-10-09, PR #9).** The server now survives strangers and shows its failures:

- per-account frame and connect limits, oversize and illegal-frame closes with documented codes, invite caps and expiry, an address rate limit, and an Origin allowlist;
- every archived hand re-verified off the game path by a queue consumer, with incidents for anything that fails;
- card-free JSON logs with a sink test, hands/day at `/api/stats`, and a runbook;
- a CPU bench, pinned and least-privilege CI, a nightly seeded engine soak, a live-e2e guard and a deploy check;
- a 20-client smoke: 500 hands, p95 17 ms, 0 breaks;
- a chaos pass with 5/5 rows VERIFIED;
- players can verify their own folded cards;
- Fair play and Terms pages.

Deploy waits for you: two queues, the new migration, the report contact, the DBA-review decision, U-8, and your go (see `.10x/handoff.md`).

**Tickets 2026-10-09 (`.10x/tickets.md`):** the remaining plan is 49 tickets: Step 7 is 11, Phase 1 is 23, Phase 2 is 15. That is 134 half-days, about 90 session-hours at the measured Phase 0 pace. The ladder's critical path is 29.7 h; earliest ladder date 2026-10-13, planning date 2026-10-19. **Open finding (Q1 in tickets):** the PM's same-pair duplicate format lets a player see the opponent's segment-2 cards by recalling or reviewing their own segment-1 hands. The user decides the format before P1-02. Step 7 is not blocked.

**Security review 2026-10-09 (`.10x/reviews/2026-10-09-security-review.md`):** one High, three Medium and one Low fixed with red-then-green tests:

- lobby frame flood (High) and table frame flood (Medium);
- deck reveals that could hide a re-dealt card (Medium);
- dev tokens accepted with a short secret (Medium);
- the same-account join race (Low).

No Critical or High is open. Three Mediums are now Step 7 tickets: invite spam and storage growth, connection floods, and own folded cards being unverifiable (new S7-12). Held, with tests: auth, seat integrity, every frame type, a byte-equality side-channel test, and the full database access matrix. Four dashboard checks are yours (U-8 in tickets).

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

| Phase             | Feature slugs                                                                                          | Exit criteria                                                                                                                                                                                            | Effort                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0 — Foundation    | `multiplayer-platform`                                                                                 | Two browsers play a full HU match through the deployed Cloudflare Worker (site + game server; day-10 milestone); engine invariant suite green N=2..6; lobby quick-match; commitment + records; CI/deploy | 15 working days + 3 reserve (see ADR §Migration path); Step 7 re-estimated at 11.5 builder-days (≈ 14 h) in `.10x/tickets.md` |
| 1 — HU ladder     | `heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1, review→lesson loop | Rated duplicate matches, Glicko-2 ± RD, accuracy, profile, ladder                                                                                                                                        | 3–4 weeks (tickets: 34 builder-days, ≈ 45 h)                                                                                  |
| 2 — 6-max         | `six-max-tables` casual + rated arenas, 6-max rating                                                   | 6 seats, N-seat `Table`, arenas, provisional rating                                                                                                                                                      | 3–4 weeks (tickets: 21.5 builder-days, ≈ 30 h)                                                                                |
| Later (triggered) | `integrity-and-trust` v2                                                                               | Fires on ≥1,000 players, first recruiter inbound, first credible cheating report, or a sponsored event                                                                                                   | —                                                                                                                             |

## Tasks

- [x] PM: problem, audience, constraints, success metrics; 5 feature specs; user alignment
- [x] Architect: Phase 0 system design (`.10x/decisions/architect/multiplayer-platform.md`) — engine, DOs, protocol, auth, data model, randomness/commitment, grading placement, client integration, lobby, failure modes, dev/CI, 7-step migration path, verified assumptions
- [ ] User: answer the 5 open questions in the ADR (commitment scheme, invite-link visibility, domain; the Vercel and Cloudflare-plan questions are settled: Cloudflare hosts everything) — `.10x/tickets.md` Q3 proposes closing the first three as built (per-slot commitment, link visible, `workers.dev` until a domain)
- [x] Staff Engineer / EM: tickets for Step 7, Phase 1 and Phase 2 with acceptance tests, critical path, lanes and metrics sources (`.10x/tickets.md`, 2026-10-09). Day-10 milestone was already reached in Step 4.
- [ ] User: answer the 5 questions in `.10x/tickets.md` (Q1 blocks P1-00/P1-02; nothing else is blocked)
- [x] SDE: Step 1 — `src/engine/` + invariant, differential, redaction, commitment tests; `src/shared/protocol.ts`; `src/lib/presets.ts` (`.10x/decisions/sde/multiplayer-platform.md`). All gates green.
- [x] SDE: Step 2 — Supabase migrations applied (`players`, matches/hands archive, `record_hand`, FK index) with PGlite RLS tests; `#lobby` sign-in (email link; Google/GitHub when enabled), username, lobby shell; bundle guard; phone header fix. All gates green.
- [x] User: Cloudflare Workers Paid + Git-connected Worker; Supabase Pro org
- [ ] User: repo cleanup dashboard steps (rename default branch to `main`; Cloudflare and Supabase production branch → `main`; Cloudflare preview builds off; delete the Vercel project; Supabase Auth Site URL → workers.dev; optionally enable Google/GitHub) — see `.10x/handoff.md`
- [ ] SDE: first real sign-in on the deployed site, then decode the access token header and confirm `alg: ES256` (ADR day-5 check)
- [x] SDE: Step 3 — `worker/` + root `wrangler.jsonc`: `TableDO`, ES256 auth, invite-by-link matches, runtime `/api/config`; 9 Workers-runtime tests + a real two-client smoke run. All gates green.
- [x] SDE: Step 4 — live table in the browser (`src/net/client.ts`, `LiveTable`, `#play/<id>`, Play a friend by link); two-browser e2e against `wrangler dev`; full 20-hand match verified. All gates green.
- [x] SDE: Step 5 — turn clock + bank + auto check/fold + 3-timeout forfeit via one DO alarm; `hand_start` commitment, `hand_end` + `reveal`, in-browser "Deck verified" review; outbox → `record_match`/`record_hand` (new migration applied live, dry-run verified). 592 unit, 38 worker, 17 e2e; 20-hand smoke with a real 80 s timeout. (`.10x/decisions/sde/multiplayer-platform.md` §Step 5)
- [ ] User: create a Supabase secret key and add it to the Worker as `SUPABASE_SECRET_KEY` (until then nothing is archived)
- [x] SDE: Step 6 — `LobbyDO` quick-match (persisted queue, oldest-first pairing, ≤ 2 pairings per pair per day), one active table per account (queue resumes, invite 409/4409, self-healing), 30 s no-show (void match + abandonment; migration applied live), Find a match enabled with wait timer and 60 s bail-out. 605 unit, 52 worker, 18 e2e; real-time no-show smoke. (`.10x/decisions/sde/multiplayer-platform.md` §Step 6)
- [x] SDE: Step 7 build: limits, Origin allowlist, verify queue + DLQ, logs + sink test, bench, CI (pins, permissions, soak, live guard, deploy check), `/api/stats`, smoke, chaos pass, own-card verification, Fair play and Terms (`.10x/decisions/sde/multiplayer-platform.md` §Step 7). Not deployed
- [ ] User: before the Step 7 deploy: create queues `quantpoker-hands` and `quantpoker-hands-dlq`; apply `20261009090000_verify_hand.sql` (or let the Supabase integration do it on merge); choose the report contact (U-6); decide on the DBA review; then say go to merge PR #9
- [ ] SDE: S7-05 (queue-wait and ack-latency telemetry) and S7-11 (launch gate, after your go)
- [x] QA: gap review of Steps 1–4 (`.10x/decisions/qa/multiplayer-platform.md`, `.10x/reviews/2026-10-08-qa-report.md`): 27 tests added (real ES256 auth, engine side pots at N=3–4, rejoin presence, live captions and offline states); 1 bug fixed (opponent shown disconnected after a rejoin). Gates: 577 unit, 25 worker, 17 e2e, all green. Release-ready for the invite-link beta; no blocking bugs.
- [x] Security: Phase 0 review, items 1–7 (`.10x/reviews/2026-10-09-security-review.md`, `.10x/decisions/security/multiplayer-platform.md`). Fixed SR-01 to SR-05; SR-06 to SR-13 are tickets or user actions with file:line.
- [ ] User: security dashboard checks U-8 in `.10x/tickets.md` (redirect allowlist, no `DEV_AUTH_SECRET` on the Worker, leaked-password protection, WAF rate limit)
- [ ] DBA: post-hoc review of the four applied migrations (`supabase/migrations/202610081*`); RLS behaviour is covered by `supabase/tests/migrations.test.ts`
