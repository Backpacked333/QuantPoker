# multiplayer-platform

Status: Aligned with user 2026-10-08 · Priority: **P0** · Owner: PM → Architect

## Problem statement

People who want to prove and sharpen their poker decision-making have nowhere to play **real opponents** in a skill-first, play-money setting with chess-style feedback. QuantPoker today is a solo trainer against a bot; a leaderboard means nothing until two humans can sit at the same table.

## Target user

- **Primary:** students and early-career quants (18–30) who already like puzzles, know basic poker, and want a rated arena to climb and share.
- **Secondary:** recruiters and trading-firm people who want to look up a candidate's profile. They never play; they read.
- **Not for:** real-money players, casual social poker (home-game apps), MTT grinders.

## How they solve it today

Play-money poker on PokerStars/GGPoker (no skill signal, noisy, ads for real money), private Discord games with hand-history uploads to solvers (manual, fragmented), or LeetCode-style quant puzzles that don't involve opponents at all. None gives a luck-adjusted rating + accuracy that a recruiter can read.

## Business context

- Solo builder, AI-assisted, ship ASAP. Managed services everywhere possible.
- Opportunity cost: every week on multiplayer is a week not spent on the curriculum. The curriculum stays as-is; it becomes the "learn" tab beside "play".
- No competitive deadline, but the "quant talent ladder" positioning is defensible only if we are first with a credible rating. Speed to a trustworthy HU ladder matters more than seat count.
- If we don't build it: QuantPoker remains a nice trainer with no network effects and no reason to come back.

## Scope (what's in)

### P0 — can't play without it

1. **Accounts** — email + OAuth (Google/GitHub) via Supabase Auth. Username, avatar, country (optional), "what are you studying / where do you work" (optional, free text, shown on profile).
2. **Server-authoritative game service** — one Node process (TypeScript) running an **N-player** generalisation of `src/lib/poker.ts`: positions (BTN/SB/BB/UTG/HJ/CO), side pots, multiway showdown, min-raise rules, timers, disconnect handling, sit-out. Heads-up = N=2. Cryptographically secure shuffle. The client never sees other players' hole cards or the deck.
3. **Realtime transport** — WebSockets, room per table, reconnection with state resync, per-action acknowledgement. Target: action-to-render under 150 ms p95 within a region.
4. **Lobby** — "Play rated 1v1" (quick match), "6-max tables" (list / scheduled arenas, see `six-max-tables`), "Practice vs Atlas" (existing single-player).
5. **Matchmaking (HU)** — rating-window queue that widens over time; bail to "no match yet, keep waiting / play Atlas". Target median wait < 60 s at peak.
6. **Table UI reuse** — the existing table, cards, chips, motion and action bar, with seats generalised to N, opponent avatars instead of Atlas, a turn timer, and time-bank.
7. **Hand histories** — every hand persisted server-side (actions, cards at showdown, timestamps). Replayable in the existing Hand Review with the lab unlocked **after** the hand.
8. **Persistence** — Postgres (Supabase). Existing local progress keeps working for Atlas practice; cloud profile is the source of truth for rated play. Use the `SyncAdapter` seam only for Atlas practice sync (P2).
9. **Basics of fair play** — rate limits, one active table per account at launch, action timers, auto-fold on timeout, abandonment penalties (see `integrity-and-trust`).
10. **Review → lesson loop** — the post-match review's worst-graded decisions link to the matching curriculum unit (pot odds, fold equity, variance, ranges, etc., already in `src/curriculum/`), and each unit ends with "Play a rated match". This is the growth and retention mechanism the user is betting on; it must ship with the HU ladder, not later.

### P1

- Spectating finished/live matches of top players (live with delay).
- Preset chat ("gg", "nh", "ty") only. No free text at launch.
- Regional server selection (one region at launch: US-East).

### Out of scope (explicit)

- Real money, prizes, deposits, store, cosmetics.
- Tournaments / MTT / SNG with blind schedules (ring + fixed-length matches only).
- Native mobile apps. The responsive web app must work on phones (it already does).
- Friends, clubs, private tables, free-text chat, voice.
- Multi-tabling.
- Replacing Atlas practice; it stays.

## User stories

- As a player, I want to sign in once and have my rating follow me so that my ladder position is mine.
- As a player, I want to click "Play rated" and be at a table with a real human in under a minute so that I don't bounce.
- As a player, I want the table to feel exactly as good as the trainer (cards, chips, motion, keyboard) so that the live game isn't a downgrade.
- As a player, I want to reconnect after a dropped connection and still be in my seat so that I don't lose a match to Wi-Fi.
- As a player, I want every hand saved and reviewable with the full lab afterwards so that I learn from live play the way I learn from Atlas.
- As a recruiter, I want to open a profile link and see a verified-looking record so that I can trust it.

## Success criteria (leading indicators, measured from day 1)

| Metric                                                                      | Target at launch + 90 days |
| --------------------------------------------------------------------------- | -------------------------- |
| Registered players                                                          | ≥ 300                      |
| Week-4 retention (played ≥1 rated match in week 4 after signup)             | ≥ 20%                      |
| Median HU matchmaking wait at peak (defined weekly windows)                 | < 60 s                     |
| Match completion rate (both players finish)                                 | ≥ 90%                      |
| Action latency p95 (server ack → render)                                    | < 150 ms                   |
| Server-side invariant failures (chip conservation, illegal action accepted) | 0                          |
| Profile link views from outside the app                                     | tracked; ≥ 100             |

## Risks and early signals

| Risk                                      | Early signal                            | Mitigation                                                                                                                         |
| ----------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Cold start: nobody online                 | wait > 3 min; empty lobby               | Scheduled arenas, "notify me when someone queues", Atlas fallback for casual, seed with a launch cohort (Discord, uni quant clubs) |
| N-player engine regressions               | Vitest invariant tests fail; chip leaks | Port existing engine tests; property-test chip conservation and side pots over 10k random hands before any UI                      |
| Realtime complexity eats the solo builder | Phase 0 slips past 3 weeks              | Use a room framework (e.g. Colyseus) or plain `ws` with a tiny protocol; no custom infra; one region                               |
| Hosting cost / ops                        | first bill                              | One small VM/Fly machine + Supabase free/pro tier; no Kubernetes                                                                   |
| Legal perception as gambling              | user/app-store questions                | Play money only, no prizes, clear ToS and 18+ language; no "cash" wording anywhere                                                 |

## Dependencies

- `rating-and-leaderboard` needs hand histories and match results from this service.
- `six-max-tables` needs the N-player engine from day one (do not defer).
- `integrity-and-trust` needs server-side logs with timestamps and client telemetry hooks.
