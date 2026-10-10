# accuracy: decision grades against a model opponent

Spec: `.10x/decisions/product-manager/rating-and-leaderboard.md` §2 Accuracy. Tickets: P1-08 (the population model), P1-09 (the grading consumer and `hand_grades`), P1-10 (accuracy shown). The label everywhere is exactly **"Accuracy vs. a model opponent, not a solver."**

## P1-08 · The population opponent model (2026-10-10)

### What it is

- **`src/lib/population.ts`** models how a typical heads-up human plays. Every number has a comment with its reasoning; all are assumptions until real hands exist. It is versioned as `POPULATION_VERSION = 'population.v1'`, and grades carry `GRADE_VERSION = 'grade.v1+population.v1'`.
  - **Pre-flop, position-aware**, as shares of starting hands ranked by equity against a random hand, weighted by combos (`preflopPercentiles` in `src/lib/range.ts`):
    - the button opens 50% as raises and limps 30%, folding 20%;
    - the big blind raises 25% of limps and checks the rest;
    - against an open, the big blind 3-bets 10%, calls 45% and folds 45%.

    Range edges are smoothed (σ = 3% of hands), so no combo ever becomes impossible.

  - **After the flop, and in re-raised pots pre-flop:** Atlas's policy shape, made reusable as `policyWith` in `src/lib/atlas.ts` with Atlas's own behaviour unchanged. It uses human-typical parameters: calls at the price with no margin, defends 20% of weak hands against small bets, value-bets from 70% equity 60% of the time, and bluffs 5%.

- **Behind the existing interface.**
  - `OpponentModel` gains `'population'`, and `SpotRequest.opponent = 'population'` reads the opponent's actions with that model (`rangeWeights`).
  - `raiseAnalysis` prices the opponent's response to a raise with it. The opponent's seat comes from public information only (`opponentSeat`, `opponentFacingRaise`).
  - The trainer still uses Atlas's model; nothing it shows changed.
- **`src/lib/grader.ts`**, `gradeVsPopulation(game, action)`, is the one grading call. The consumer will use it, and it seeds the analysis exactly as the trainer's worker does (`spotSeed`). `spotKey` moved to `src/lib/spotKey.ts`, re-exported from `src/state/spots.ts`, so the Worker does not import React.

### Repeatability (prerequisite)

- **The bug.** The analysis tables (pre-flop classes, the opponent's equity per board, the hero's showdown per hole and board) were sampled from the caller's random stream and then cached. So a spot read differently depending on which spots an isolate had analysed first. The consumer must write identical grades on every redelivery, and match the trainer.
- **The fix.** Each table now uses its own stream, seeded by its key.
- **The test.** `src/lib/determinism.test.ts` analyses a spot cold and after warming the caches in another order; the two are bit-identical. It was red before the fix: the opponent's equity table differed.
- **Effect on the trainer.** Its numbers shift by sampling noise only; every existing test passes.

### Validation so far

- **Sanity ordering (`src/lib/sanity.test.ts`).** Four scripts play Atlas, and every decision is graded against the population model.
  - CI sample (3 seeds × 60 decisions each): folder **55.1**, calling station **70.3**, Atlas's policy **72.9**, tight-aggressive **79.4**. That is the order a poker player expects.
  - **Asserted:** tight-aggressive beats the station by more than 5 points and beats Atlas; Atlas beats the station; the station beats the folder by more than 5.
  - **Atlas over the station is the thin margin:** 2.6 points in CI, so only its order is asserted. On 600 decisions from five other seeds it was **76.0 ± 1.2 vs 71.1 ± 1.3**, about 2.7 standard errors apart.
  - **A first single-seed sample (150 decisions) was misleading.** It had the folder at 67.9, within a point of the station at 68.7.
    - Breaking it down: the folder's free checks score well; it blunders only when facing a bet pre-flop (accuracy 13), and that sample faced few.
    - Four other seeds at 200 decisions put the folder at 52–59 and the station at 70–72. That is why the test averages seeds.
    - In EV the station lost more per hand (1.84 bb vs 0.74 bb) in that sample. Atlas does not exploit a folder by betting every hand.
- **Determinism:** "grades the same decisions identically every time", plus the cross-isolate test above.
- **CPU (`src/engine/bench.test.ts`).** Population analysis plus the grade over every raise size, per cold decision, median and max:
  - pre-flop 18 / 30 ms;
  - flop 93 / 115 ms;
  - turn 97 / 148 ms;
  - river 111 / 130 ms.

  The budget is 500 ms per decision. A typical rated hand has about 16 graded decisions (both seats), so about 1.6 s of CPU per queue invocation.

### What the model misjudges (known, accepted for v1)

- **No individual reads.** Every opponent is the same average human: a maniac's bets are read as value-heavy, a nit's as normal. A player exploiting a specific opponent correctly can be graded down.
- **Equity against a random hand drives post-flop behaviour**, as in Atlas. Real players condition on their own hand class, the board texture and draws. Hands with draws are under-valued, and pairs on wet boards over-valued.
- **No sizing tells.** Big bets and small bets come from the same range. Humans polarise big bets and play small bets with medium hands.
- **No multi-street plans.** No check-raise plans, no delayed c-bets, no turn barrels after a flop bet; each action is read on its own.
- **Pre-flop sizes are ignored.** A 2x and a 4x open are the same range.
- **No stack-depth effects.** Stacks reset to 100 bb every hand, so this is acceptable for HU rated play.
- **Calls have no implied odds**, from the trainer's grading (`gradingCap` already caps raise sizes for the same reason). Speculative calls are graded down.
- **Per-decision averaging.** Easy decisions (free checks) count as much as hard ones, so accuracy rewards passivity somewhat. The folder above scores 55, not near 0.

### The analysis to run on real data (when 100 players are non-provisional)

1. **Validity: Spearman correlation of rating and accuracy** across non-provisional HU players, with `ratings.rating` against rolling accuracy over the last 500 decisions. Target > 0.4. Bootstrap a 95% interval over players. If ρ ≈ 0, the model is wrong or being gamed.
2. **Refit the pre-flop shares.** From archived rated hands (`hands.record`, positions from `config.button`), measure each spot's frequencies: the button's open and limp rates, the big blind's iso-raise rate, 3-bet and defend rates. Replace the five shares and bump `POPULATION_VERSION`.
3. **Refit the post-flop parameters.** For hands that reached showdown, regress actions on equity against a random hand per street and facing-bet status. Fit `foldMargin`, `stickiness`, `valueThreshold`, `valueFrequency` and `bluffFrequency` by maximum likelihood on the policy's own form. Only shown hands are usable, so weight for the selection: folded hands are never seen.
4. **Calibration of the range model.** For shown hands, compare the model's predicted probability of each shown combo class with the observed frequency (reliability curve). Systematic misses name the parameter to change.
5. **Stability.** Re-grade a fixed sample after each refit and report how many grades change class. A refit that moves more than 10% of grades gets a changelog line on the Method page.
