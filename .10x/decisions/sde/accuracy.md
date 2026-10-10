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

## P1-09 · Grades written after each rated hand (2026-10-10)

### Storage (PR #21, migration `20261010053000_hand_grades.sql`)

- **`hand_grades`.** One row per graded decision, keyed `(hand_id, seat, idx)`. `idx` is the index into `hands.record.actions`, so each grade joins to that action's `decisionMs`, `atMs` and `source`.
- **Who reads a grade (Q6, set by the mission).** Nobody while the match is playing, not even its own player: a grade mid-match is analysis data (the lab-off rule). After the match, its two players read both seats; nobody else does, anon included.
- **`record_grades(p)`.** Callable by `service_role` only, and idempotent: `on conflict do nothing`. Each grade's player comes from `match_players` by seat, never from the payload. It refuses:
  - a hand not archived (`P0002`, so the consumer retries);
  - a hand that is not verified;
  - a hand that is not from a `hu-rated` match. This came from a review finding: defence in depth, since the consumer already grades only verified rated hands.
- **The proposal's `player_accuracy`** becomes `private.player_accuracy`, also from a review finding. Under invoker rights the participant policy would filter it, and a browser-callable security definer breaks the RLS-matrix rule. The public number is a stored aggregate (P1-10).

### The consumer (`worker/src/grade.ts`, `worker/src/verify.ts`)

- **The trigger.** The table marks a rated hand's queue message `rated: true`. After `verify_hand` succeeds, or on a redelivery of an already verified hand, the consumer runs `gradeHand(record, deck)` and calls `record_grades`. Casual hands and unmarked messages are verified, never graded.
- **`src/lib/gradeHand.ts`.** Replays the hand in the live engine and takes each decision's redacted seat view (`seatView`, then `toHeroGame`). The grade therefore sees exactly what that player saw. Then `gradeVsPopulation` grades it.
  - Heads-up only: a multiway hand returns no grades (Phase 2).
  - Every move is graded, including one the clock made for a player out of time. Excluding them was exploitable (QA review below).
- **Failure.** A grading or write failure throws, and the message is retried; verification is not repeated. After the last try it is dead-lettered as a `dlq` incident. The table never waits on the queue, so the next hand, the match result and `record_match` (which settles the rating) go ahead. Until grades land, the hand is simply "not graded yet".
- **Decision time per action** (mission item 5) was already archived as `actions[].decisionMs` and `atMs`; it is now tested. No detection.

### Tests

- **`src/lib/grading-golden.test.ts`: the golden set.** 50 hands, Atlas in both chairs, 150+ decisions on all four streets.
  - Every consumer grade equals the trainer's grade of the same decision, field for field.
  - Mutation-checked: grading from the wrong seat fails it.
  - Also: replay determinism, and a clock move graded from the same view as the trainer's.
- **`worker/test/grade.test.ts`**, through the real queue with a fake PostgREST:
  - **End to end:** a rated hand's 8 decisions are graded, both seats, with `GRADE_VERSION` and format `hu-duplicate`, and no frame carries a grade.
  - **Redelivery:** no duplicate, no grade changes, the same payload bit for bit, verified once.
  - **Timeouts:** a clock move is graded like any other.
  - **Failure:** with `record_grades` down for a whole forfeited match, verification, every hand, the result and the rating call go ahead. The message is retried without re-verifying, and grades land once the write works.
  - **Marking:** the table marks only rated hands; an unmarked message, or one with `rated: 'yes'` or `1`, is not graded.
  - **Decision time:** kept per action (4.5 s client; 80 s timeout).
  - Mutation-checked: dropping the `rated` gate, or swallowing grading errors, fails a test.
- **"Grades appear after real rated hands in wrangler dev."** The Worker test runs the real TableDO, the real queue and the real consumer in workerd, the same runtime as `wrangler dev`. Only PostgREST is faked: no local Supabase exists here, and production must not be written to. The SQL side is proved separately in PGlite (`supabase/tests/grades.test.ts`).

### QA review (2026-10-10; details in `.10x/decisions/qa/accuracy.md`)

- **Clock moves were an exploit; now graded.** With clock moves excluded:
  - a tight-aggressive script that left its folds to the clock scored 87.0 instead of 79.4, with identical play and results;
  - an always-fold script scored 71.1 instead of 55.1.
- **Per-decision averaging and stakes.** Over 300 decisions each, the EV the model says each player lost ranks the players exactly as a poker player would:
  - tight-aggressive 0.40 bb per decision;
  - Atlas 0.82;
  - min-raise every street 3.42;
  - pot-raise every street 4.92.

  But the plain mean of per-decision accuracies (each clipped at 0, as a share of that decision's pot) puts the two raisers at 72.0 and 70.6. That is just below the calling station (72.7) and Atlas (74.9), with overlapping intervals. Big-pot blunders count no more than cheap preflop choices.

- **What changed.** `hand_grades.pot` is now stored (migration `20261010060000`).
  - Pot-weighted aggregates were tried: pot-weighted, √pot-weighted, and the ratio of summed EV lost to summed pots. Each pushes the raisers down, but breaks the required order (Atlas falls below the station) and is far noisier (interval ±10 vs ±4).
  - P1-10 shows the plain mean. The real-data analysis below compares the variants.
- **Locked in CI.** `src/lib/sanity.test.ts` gains: tight-aggressive > half-random > random, each by 5 or more; tight-aggressive > pot-raiser by 3 or more; all-in-every-time < always-fold.

### More misjudgments found by the QA attack

- **Indiscriminate aggression scores like a mediocre thinking player.** See above. The rating, which is results-based, is what catches it.
- **Atlas scores lower than a simple tight-aggressive script** (74.9 vs 78.9). Atlas's big river raises facing a bet are graded harshly: the population calls down more than Atlas's own model assumes. That is plausible for human pools, but unverified.
- **The calling station's EV loss per decision equals the tight-aggressive script's** (0.33 vs 0.40 bb): it plays small pots. Only the per-decision accuracy separates them (72.7 vs 78.9).

### Addition to the real-data analysis

- Compute Spearman ρ against rating for three variants: the plain mean (shown), the pot-weighted mean, and 100 − 200·ΣEV lost/Σpot, all over the same 500 decisions. Bootstrap the intervals over players.
- Switch the shown number only if a variant's ρ is higher with intervals that do not overlap. A switch bumps the aggregate's version and gets a changelog line on the Method page.
- Synthetic stand-in, today: ρ of each variant with results against Atlas across 11 scripted players is 0.35 for the plain mean, 0.25 pot-weighted, 0.46 ratio of sums. Results against one bot are a weak proxy, because Atlas barely punishes folding or shoving.
