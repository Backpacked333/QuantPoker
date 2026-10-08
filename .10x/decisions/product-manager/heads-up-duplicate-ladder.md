# heads-up-duplicate-ladder

Status: Aligned with user 2026-10-08 · Priority: **P0** · First live product

## Problem statement

Poker results over a few hundred hands are mostly luck, so a ladder built on raw results would reward heaters, not skill, and recruiters would (rightly) ignore it. We need a match format whose outcome is dominated by decisions.

## Why duplicate heads-up first

- **Duplicate** (both players play the same shuffled deck twice with seats swapped) cancels the card luck of the deal. What remains is who played each identical situation better. This is the format bridge, backgammon and poker AI research (e.g. Libratus/Pluribus evaluations) use to measure skill with small samples.
- **Heads-up** is the smallest liquidity unit: two humans online is a match. 6-max needs six.
- The existing engine, table UI, hand review and grading engine all already assume heads-up, so this is the fastest path to a credible rated product.
- It maps onto a chess-style match rating cleanly: one match, one result.

## Format (P0)

- **Match** = 2 segments × N hands (default N=20; 40 hands total). Segment 2 replays segment 1's decks with seats swapped. Stacks reset to 100 bb at the start of each hand (no bust-out; this keeps duplicate exact and removes stack-size gamesmanship).
- Blinds fixed (1/2 chips, 100 bb deep). Play money; stacks are not a currency.
- **Result** = net chips in big blinds over both segments: player A's segment-1 result + segment-2 result. Positive wins, within ±2 bb is a draw (noise band; tune after data).
- **Clock:** 20 s per decision, 60 s time-bank per segment, auto-fold (or auto-check when free) on expiry. Shot clock visible to both.
- **No lab during the match.** Equity/EV/ranges are hidden until the match ends. Read-guess prompts are also off (they would be slow and leak nothing but add friction). The full lab and grades unlock in review afterwards.
- **Disconnect:** 60 s grace to reconnect, then auto-fold each hand; three consecutive timeouts = forfeit at the segment end. Abandonment counts as a loss and feeds an abandonment score.
- **Match length options (P1):** 10/20/40 hands per segment. Rated pool stays on one length at launch to keep the rating comparable.

## User stories

- As a player, I want to queue for a rated 1v1 and be matched with someone near my rating so that matches are competitive.
- As a player, I want to know the match is duplicate so that I understand losing a cooler isn't the end of the match.
- As a player, I want a clear end-of-match screen with result in bb, rating change, accuracy, and the biggest EV swing hands so that I know what to review.
- As a player, I want to replay every hand of the match with the lab on, side-by-side with how my opponent played the same deck, so that I can learn from the comparison.
- As a player, I want a rematch button so that good matches continue.

## Acceptance criteria

1. Segment 2 deals exactly segment 1's decks with seats swapped; a test asserts card-for-card equality.
2. The server rejects any client action that is not in `legalActions` for the current state; the client UI never shows an illegal action.
3. Neither client ever receives the opponent's hole cards before showdown or the deck; verified by a network-level test.
4. A completed match produces: result in bb, winner/draw, per-hand records, per-decision grades for both players, and a rating update (see `rating-and-leaderboard`).
5. Hand review for a match offers "compare with opponent on the same deck".
6. Lab, equity ring and EV labels are not rendered (and not shipped to the client as data) while a rated hand is live.
7. All Playwright gates (keyboard loop, axe, mobile layout, frame time) pass on the live table with two simulated clients.

## Success criteria

| Metric                                    | Target                             |
| ----------------------------------------- | ---------------------------------- |
| Rated HU matches per weekly active player | ≥ 3                                |
| Match completion (no forfeit/abandon)     | ≥ 90%                              |
| Rematch rate                              | ≥ 25%                              |
| Post-match review opened                  | ≥ 50% of matches                   |
| Draw share within noise band              | 5–15% (sanity check on band width) |

## Out of scope

- Bust-out / escalating-blind HU SNGs.
- Best-of-three series, seasons, titles (P2 once ladder is alive).
- Multiple stakes; stacks are fixed 100 bb.

## Risks

- **Boring repetition in segment 2?** Players already know the decks? No: a player sees segment-2 hands as new cards; they only know their _opponent_ saw them from the other side. Duplicate is standard in competitive bridge for this reason. Watch for complaints and add a "shuffled seat order" variant later.
- **Decision accuracy leakage:** if any EV/equity signal reaches the client mid-hand it is RTA. The server must not send analysis data until the hand is done.
- **Noise band tuning:** ±2 bb over 40 hands is a guess; collect data and revisit after 500 matches.
