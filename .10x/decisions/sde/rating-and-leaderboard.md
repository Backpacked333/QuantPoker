# rating-and-leaderboard — SDE log

## P1-11 · Glicko-2 as a pure, versioned module (2026-10-09)

`src/rating/glicko2.ts`, `src/rating/glicko2.test.ts`; `eslint.config.js` puts `src/rating/**` in the deterministic block (no `Math.random`, timers or `Date.now`; a probe `Date.now()` was flagged).

### What it is

- **Model.** Glickman's 2013 algorithm, versioned `glicko2.v1`.
- **Scale.** Ratings are stored and shown on the display scale (rating, RD, σ, the columns of `ratings` in `supabase/proposed/phase1.sql`). The update runs on μ/φ internally (`SCALE` = 173.7178).
- **Constants.**
  - τ = 0.5 (`TAU`);
  - ε = 1e-6;
  - default 1500 ± 350, σ 0.06; RD is capped at 350.
- **Periods.** One rated match is one rating period: `rateMatch(a, b, scoreA)` rates both from their ratings before the match. Inactivity is `idle(player, periods)` with `idlePeriods(lastMatchAt, now)`: whole 30-day periods, with the clock passed in.
- **`explainPeriod`** returns the intermediates (v, Δ, μ′, φ′) for the Method page (P1-16) and for tests.

### Evidence

`src/rating/glicko2.test.ts`, 5 tests, red first: the module did not exist. Mutation check: π² → π in g() and removing the RD cap each turn a test red.

- **Glickman's worked example.** The unrounded result is 1464.0506705 / 151.5165241 / 0.0599959843, the same digits other implementations of the algorithm produce. The values the paper prints also hold within its own rounding: μ′ −0.2069, φ′ 0.8722, RD 151.52, rating 1464.06 ± 0.01, σ 0.05999.
  - The paper's intermediate v (1.7785) and Δ (−0.4834) are about 5e-4 from the unrounded 1.77898 and −0.48393, because it rounds g and E to 4 decimals before summing. The test documents this instead of matching rounded arithmetic.
- **A draw between equals** leaves both at 1500 and shrinks RD.
- **Properties over 10,000 seeded random sequences** of 5 matches each:
  - a win never lowers the rating, and a loss never raises it;
  - an upset gains more than an expected win against the same RD;
  - RD stays ≤ 350 and every value stays finite;
  - from the default, 20 matches against settled opponents bring RD under 100, the provisional line.

### Deviation from the ticket wording

The ticket says "RD shrinks with play". That is not true of every single match. A settled player (RD ≈ 50) who plays a very uncertain opponent (RD ≈ 350) can end the period with RD slightly higher than before, because the period's volatility is added before the game's information, and an uncertain opponent carries little information. That is Glicko-2 working as designed.

The test asserts what does hold for every sequence: **after playing a period, RD is lower than after sitting the same period out**. It also asserts RD falls under 100 over a run of matches from the default. P1-12's property tests should use the same formulation.
