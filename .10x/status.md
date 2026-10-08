# Project status

Last updated: 2026-10-08 by Product Manager

## Phase

**Discovery → Product definition (done, pending user alignment).** Next: Architecture.

Note: `.10x/` did not exist before this session. Discovery of the existing codebase was done inline by the PM and is recorded in `.10x/decisions/product-manager/_index.md` under `[DISCOVERED]`. CTO strategic review has not run; the Architect should flag anything that needs a build-vs-buy call back to CTO.

## Initiative

"Multiplayer QuantPoker": real online play-money poker between humans, chess.com-style rating + accuracy, public ladder/profile for quant talent. Two formats: heads-up duplicate and 6-max. Solo builder, AI-assisted, ship ASAP.

## Roadmap (proposed, pending alignment)

| Phase | Feature slugs | Exit criteria | Rough effort (solo + AI) |
| --- | --- | --- | --- |
| 0 — Foundation | `multiplayer-platform` (N-player engine, auth, server, lobby, HU casual) | Two browsers can play a full HU hand through the server; engine invariant suite green on N=2..6 | 2–3 weeks |
| 1 — HU ladder | `heads-up-duplicate-ladder`, `rating-and-leaderboard` v1, `integrity-and-trust` v1 | Rated duplicate matches, Glicko-2, accuracy, profile, ladder, lab-off-during-play enforced, deck commitment | 3–4 weeks |
| 2 — 6-max casual | `six-max-tables` (casual, bot back-fill, stats) | 6 seats, side pots, arenas pilot in casual mode, 10k human hands clean | 3–4 weeks |
| 3 — 6-max rated | `six-max-tables` rated gates, `integrity-and-trust` v2, `rating-and-leaderboard` 6-max rating | Gates in `six-max-tables.md` met | 2–3 weeks + waiting on data |

## Tasks

- [x] PM: understand problem, audience, constraints, success metrics
- [x] PM: per-feature specs written (5 files)
- [ ] PM: user alignment on recommendation (this turn)
- [ ] Architect: system design for `multiplayer-platform` (N-player engine API, server/transport, data model, hosting)
- [ ] Architect: rating pipeline design (`rating-and-leaderboard`)
- [ ] Security: review `integrity-and-trust` threat table before Phase 1 ships
- [ ] SDE: Phase 0
