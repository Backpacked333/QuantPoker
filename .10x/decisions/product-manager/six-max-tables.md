# six-max-tables

Status: Scoped, awaiting user alignment · Priority: **P1** for tables; the N-player engine it needs is **P0** inside `multiplayer-platform`

## Problem statement

Heads-up is the cleanest skill measure, but most people's idea of "real poker" is a 6-max table, and the user has set the bar at "highest quality, especially 6-max". A 6-max table is also where hand reading, position and multiway pot math show up — things HU can't test. The constraints are liquidity (six humans at once) and integrity (collusion and chip dumping are only possible multiway).

## Positioning

Two tiers, same table, same quality bar:

1. **Casual 6-max** (ships first): no rating, stats only. Tables can be back-filled by **Atlas bots** (clearly labelled) so a table never sits empty. This is how we get the table UX, engine and timers battle-tested before any rating depends on them.
2. **Rated 6-max** (ships when the gates below are met): humans only, scheduled **arenas**, luck-adjusted rating per `rating-and-leaderboard`.

## Format

- 6 seats, 100 bb fixed buy-in (play money), blinds 1/2. Rebuy to 100 bb at any time when below; no deep stacks (keeps the rating comparable and removes bankroll games).
- Positions: BTN, SB, BB, UTG, HJ, CO; dealer button rotates; dead-button rule on departures (architect to decide between standard rules; must be documented).
- Full side-pot handling, multiway showdown with proper award order and odd-chip rule.
- Clock: 20 s per decision, 30 s time-bank per orbit; sit-out after 2 consecutive timeouts; auto-removal after 3 orbits sitting out.
- Table list shows seats, average pot, players/hour; join = sit immediately in the next hand.
- **Arena** (for rated): fixed 60-minute window announced in the lobby and by email/notification; everyone who joins is seated by rating band; tables rebalance as people leave (like Lichess arenas / PokerStars "zoom" without the pooling). Rating uses the luck-adjusted bb/100 pairwise model.

## Quality bar (the "highest quality" the user asked for)

- Same card art, chips, motion and keyboard handling as the trainer; six seats rendered with the same spring choreography; chip animation for side pots; turn indicator and timers readable on a phone.
- Action-to-render p95 < 150 ms; no dropped frames through a 3-way all-in runout (extend the existing frame-time Playwright test).
- Zero engine invariant failures over 100k simulated random 6-max hands (chip conservation, side-pot sums, legal action sets, showdown award correctness vs. a reference implementation).
- Post-hand review with the lab for every seat you played; opponents' cards revealed only where shown.
- Disconnect/reconnect without losing the seat for 60 s; mobile Safari background-tab behaviour handled.

## User stories

- As a player, I want to sit at a 6-max table that is actually running so that I never stare at an empty felt.
- As a player, I want multiway pots to be dealt, bet and paid out exactly right so that I trust the game.
- As a player, I want a scheduled rated arena at a known time so that I can plan to play against real people.
- As a player, I want my 6-max stats (VPIP/PFR/aggression, bb/100 adjusted) on my profile so that I can see how I play.
- As a recruiter, I want to see a 6-max rating only when it is backed by enough human hands so that I'm not misled.

## Gates for turning on rated 6-max

All must hold:

1. Casual 6-max has run ≥ 10,000 human hands with 0 invariant failures and ≥ 95% hands completing without a server-side timeout bug.
2. Arena pilot fills ≥ 2 tables (≥ 10 humans) in ≥ 3 consecutive scheduled windows.
3. Collusion controls from `integrity-and-trust` v2 are live (seat co-occurrence, chip-dump detection, account linkage).
4. Luck-adjusted 6-max rating has been computed offline on the casual data and looks stable (median per-session change < 20 points after 10 sessions).

## Success criteria (90 days after casual 6-max launch)

| Metric | Target |
| --- | --- |
| Human seats at casual tables during peak windows | ≥ 60% of seated players are human |
| Arena pilot attendance | ≥ 10 humans per window |
| 6-max hands per weekly active player | ≥ 50 |
| Engine invariant failures in production | 0 |
| Player-reported "wrong payout/side pot" tickets | 0 confirmed |

## Out of scope

- 9-max, short-deck, PLO, mixed games.
- Tournaments with escalating blinds.
- Multiway decision grading (hands show "not graded" for multiway decisions until P2).
- Straddles, run-it-twice, bomb pots.

## Risks

- **Empty tables kill 6-max faster than bugs do.** Bots-as-fill for casual and arenas for rated are the answer; don't launch 24/7 rated tables.
- **Collusion once rating exists.** Rated 6-max is gated; see `integrity-and-trust`.
- **Engine rewrite.** Generalising `poker.ts` to N players is the riskiest technical change in the plan. Do it first, test it hardest, and make HU run on it so it gets exercised from day one.
- **Scope pressure to ship rated 6-max early.** The gates above are the agreed line; if numbers say we're not there, we aren't.
