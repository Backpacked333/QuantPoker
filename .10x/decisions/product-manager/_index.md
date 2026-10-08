# Product Manager — index

Last updated: 2026-10-08 (PM session, branch `claude/beautiful-thompson-k0b5bl`)

## The product in one sentence

QuantPoker becomes the chess.com of poker for quants: play-money Texas Hold'em against real people, graded like chess (rating + accuracy), with a public ladder and profile that shows quant decision-making talent to peers and recruiters.

## What exists today `[DISCOVERED]`

Verified against code on 2026-10-08:

- Single-player, client-only React/Vite static site. No backend, accounts, database, or network calls.
- Heads-up-only engine: `src/lib/poker.ts` types `Player = 0 | 1`, bets capped at effective stack, **no side pots**.
- Randomness is `Math.random` (`src/lib/random.ts`); game state is inspectable in devtools. Not safe for multiplayer as-is.
- Grading/EV engine (`src/lib/grading.ts`, `src/lib/model.ts`, `src/lib/range.ts`) models exactly one opponent (Atlas) via a Bayesian range over its published policy. Decision grades: Best/Good/Inaccuracy/Mistake/Blunder; accuracy 0–100; luck vs skill split per hand.
- Storage is localStorage (`quantpoker.progress.v2`) with a `SyncAdapter` seam for future cloud sync.
- Strong UI assets to reuse: table/cards/chips/motion (`src/components/table/`), hand review, progress charts, lab, curriculum.
- Quality gates: strict TS, ESLint, Vitest, Playwright (e2e, axe, mobile, frame-time), bundle budget, CI on push.

## Active features

| Slug | Description | Status | Priority |
| --- | --- | --- | --- |
| `multiplayer-platform` | Accounts, server-authoritative N-player game service, lobby, matchmaking, hand histories | Scoped, awaiting alignment | P0 |
| `heads-up-duplicate-ladder` | Rated 1v1 duplicate matches, the first live product and the cleanest skill signal | Scoped, awaiting alignment | P0 |
| `rating-and-leaderboard` | Hybrid rating (Glicko-2 on luck-adjusted results + decision accuracy), public profile, ladder | Scoped, awaiting alignment | P0 |
| `six-max-tables` | 6-max ring tables and scheduled arenas on the N-player engine; rated once liquidity + integrity exist | Scoped, awaiting alignment | P1 (engine groundwork P0) |
| `integrity-and-trust` | Anti-RTA, anti-collusion, one-person-one-account, verifiable profiles for recruiters | Scoped, awaiting alignment | P0 for rated play |

Recommended order of delivery: platform → HU duplicate ladder (+ rating v1) → 6-max casual → 6-max rated (+ integrity v2). See `.10x/handoff.md`.

## Cross-cutting principles

1. **Play money only, forever in scope.** No real-money, no prizes with cash value, no deposits. This is a skill ladder, not gambling. Say so in the UI and ToS.
2. **Skill over luck in every number we publish.** Any rating or stat shown on a profile must be luck-adjusted (duplicate format, all-in EV adjustment) and carry a confidence indicator. No raw chip counts on the ladder.
3. **No engine during play, full engine after.** The lab (equity, EV, ranges) is **off** during rated hands and **on** in review. Same rule as chess.com. This is both a product and an integrity rule.
4. **Server is the only source of truth.** Shuffle, deal, legality, timers, payouts, ratings are all computed on the server. The client renders.
5. **Build the N-player engine once.** Heads-up is the 2-player case of the 6-max engine. Do not ship a HU-only server and rewrite it later.
6. **Liquidity is a product feature.** With a small player base, scheduled arenas and bots-as-fallback-for-casual beat 24/7 empty tables. Rated games are human-only.
7. **One file per feature; one slug across roles.** Architect, SDE and QA use the slugs above.
8. **Don't build V2 in V1.** No tournaments, clubs, chat beyond presets, friends lists, mobile apps, or multiway grading at launch.
