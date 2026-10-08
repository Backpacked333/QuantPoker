# rating-and-leaderboard

Status: Scoped, awaiting user alignment · Priority: **P0** (ships with the HU ladder)

## Problem statement

Players want a number to climb; recruiters want a number to trust. Those are different requirements: a climbable number must move noticeably after each match, a trustworthy number must not reward luck or be gameable. Chess.com solves this with a rating (results) plus accuracy (decision quality). We do the same, plus explicit uncertainty, because poker is noisier than chess.

## The three numbers on a profile

### 1. Rating (results, luck-adjusted) — "how good are you at beating people"

- **Algorithm:** Glicko-2 per format. Separate ratings for `hu-duplicate` and `6-max` (never merged; they measure different skills and have different noise).
- **Input (HU duplicate):** match outcome win/draw/loss from the duplicate net-bb result. Optional P1 refinement: scaled score by margin (e.g. logistic on bb/hand) to use more information per match.
- **Input (6-max):** per-session "luck-adjusted bb/100" where all-in pots are settled at equity (the usual all-in EV adjustment), converted to a pairwise result against each opponent at the table weighted by hands shared. Rated 6-max is gated behind liquidity and integrity (see `six-max-tables`); until then 6-max shows stats but not a rating.
- **Display:** rating ± rating deviation (RD) as a visible confidence band; "provisional" badge until RD < 100 (Glicko scale) or ≥ 20 matches, whichever is later.
- **Ladder eligibility:** not provisional, ≥ 1 match in the last 30 days, abandonment rate < 10%.

### 2. Accuracy (decision quality) — "how close to the model's best play"

- Reuses `src/lib/grading.ts` / `model.ts`: per-decision EV lost as a share of pot → Best/Good/Inaccuracy/Mistake/Blunder and a 0–100 accuracy. Computed server-side after the hand ends (the range model needs the opponent's public actions only, which the server has).
- **Opponent model for humans:** Atlas's policy is not a human. P0 uses the existing `uniform` (any-hand) model plus a **generic population range model** (position-aware preflop ranges and a simple postflop continuation policy; the architect decides the exact form). Label it honestly in the UI: "Accuracy vs. a model opponent, not a solver."
- **Coverage:** HU hands are fully graded. 6-max hands are graded only on decisions in pots that are heads-up by the time of the decision (the majority of postflop decisions); multiway decisions are shown as "not graded" with a count. Multiway grading is a P2/research item.
- **Display:** rolling accuracy over the last 500 graded decisions, grade distribution, calibration (if read-guesses are enabled in practice), and the "luck vs skill" cumulative chart already built for Atlas play, now across rated matches.

### 3. Quant Score — the one number for a résumé (P1)

- A composite shown on the public profile: rating percentile within the format × accuracy percentile, with volume and recency gates. Published formula, versioned (`qs.v1`) so recruiters can read how it's computed.
- Only on non-provisional profiles. Never on the ladder sort by itself at launch; the ladder sorts by rating and shows accuracy next to it. Promote Quant Score to its own ladder only after we see the two numbers correlate in real data (success metric below).

## Leaderboard

- Per format, per period (all-time, this month). Columns: rank, player, rating ± RD, accuracy, matches, win rate, trend.
- Minimum 20 rated matches to appear; provisional players see "X matches to go".
- Filters (P1): country, "student" / "professional" self-tag, school (self-reported, flagged as unverified).

## Public profile

- `quantpoker.app/u/<username>`: numbers above, graph of rating over time, last 20 matches with links to reviews (opponent consent: hand histories of rated matches are public by default; ToS states it. Hole cards shown only where shown at showdown).
- Share card (OG image) for LinkedIn/Twitter.
- Verification badges live in `integrity-and-trust`.

## User stories

- As a player, I want my rating to move after every match and to see why so that climbing feels responsive.
- As a player, I want my accuracy shown separately so that a losing streak doesn't erase the fact that I played well.
- As a recruiter, I want to see uncertainty and volume next to the rating so that I can discount a 15-match profile.
- As a recruiter, I want a link to the method so that I can judge whether the numbers mean anything.
- As a player, I want a shareable profile card so that I can put it on LinkedIn.

## Success criteria

| Metric | Target at launch + 90 days |
| --- | --- |
| Players with non-provisional HU rating | ≥ 100 |
| Rating predictive validity: higher-rated player wins the match | ≥ 60% when rating gap ≥ 150 |
| Spearman correlation between rating and accuracy across non-provisional players | > 0.4 (if it is ~0, the accuracy model is wrong or people are gaming it) |
| Rating stability: median absolute rating change per match for non-provisional players | < 15 points |
| Public profile views from outside the app | ≥ 100; ≥ 10 players report sharing it |

## Out of scope

- Multiway EV grading, GTO-solver comparisons, leak finders.
- Seasons, titles (GM/IM-style), rewards.
- Merging formats into one rating.
- Any rating on casual (vs Atlas, or casual 6-max) play. Those show stats only.

## Risks

- **Accuracy is gameable** (play like the model): mitigated by the rating being results-based and by keeping the opponent model simple and *not* exposing it during play. If accuracy correlates with rating, it's measuring something real.
- **Small samples make ladders volatile:** the RD band and eligibility gates are the mitigation; resist pressure to drop the 20-match floor.
- **Model opponent ≠ real opponent:** accuracy vs a population model can mark correct exploitative plays as mistakes. Label it, keep thresholds forgiving (existing ≤3% of pot = Best), and revisit once we have data.
