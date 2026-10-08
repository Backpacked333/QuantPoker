# Project status

Last updated: 2026-10-08 by Product Manager

## Phase

**Product definition: done and aligned with the user.** Next: Architecture (`/10x-Team:principal-architect`).

Note: `.10x/` did not exist before this session. Discovery of the existing codebase was done inline by the PM and is recorded in `.10x/decisions/product-manager/_index.md` under `[DISCOVERED]`. CTO strategic review has not run; the Architect should flag anything that needs a build-vs-buy call back to CTO.

## Initiative

"Multiplayer QuantPoker": real online play-money poker between humans, chess.com-style rating + accuracy, public ladder/profile for quant talent. Two formats: heads-up duplicate and 6-max. Solo builder, AI-assisted, ship ASAP. Growth bet: curiosity + learning quant thinking through play; recruiters come months later, so early integrity is minimal by design.

## Roadmap (aligned 2026-10-08)

| Phase | Feature slugs | Exit criteria | Rough effort (solo + AI) |
| --- | --- | --- | --- |
| 0 — Foundation | `multiplayer-platform` (N-player engine, auth, server, lobby, HU casual) | Two browsers play a full HU hand through the server; engine invariant suite green on N=2..6 | 2–3 weeks |
| 1 — HU ladder | `heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1, review→lesson loop | Rated duplicate matches, Glicko-2 ± RD, accuracy, profile, ladder, lab-off-during-play, deck commitment, blunders link to curriculum | 3–4 weeks |
| 2 — 6-max | `six-max-tables` casual (bot back-fill) + rated scheduled arenas, 6-max rating | 6 seats, side pots, 100k-hand invariant suite clean, arenas run on schedule, provisional 6-max rating | 3–4 weeks |
| Later (triggered) | `integrity-and-trust` v2 | Fires on ≥1,000 players, first recruiter inbound, first credible cheating report, or a sponsored event | — |

## Tasks

- [x] PM: understand problem, audience, constraints, success metrics
- [x] PM: per-feature specs written (5 files)
- [x] PM: user alignment (revised: rated 6-max ships with casual; collusion controls deferred; learning loop made P0)
- [ ] Architect: system design for `multiplayer-platform` (N-player engine API, server/transport, data model, hosting)
- [ ] Architect: rating pipeline design (`rating-and-leaderboard`)
- [ ] SDE: Phase 0
- [ ] Security: light review of `integrity-and-trust` v1 before Phase 1 ships (lab-off enforcement, card leakage)
