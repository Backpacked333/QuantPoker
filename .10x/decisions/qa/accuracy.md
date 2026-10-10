# accuracy — QA: break the population-model grading (P1-08, P1-09)

Last updated: 2026-10-10. Mission VALIDATE block. The SDE side is in `.10x/decisions/sde/accuracy.md`.

## Risk profile

- **What breaks if it is wrong.** The second number on every profile misranks players. Recruiters read it, so it must not reward luck, passivity or gaming (rating-and-leaderboard.md §Accuracy, §Risks).
- **The leak risk is the worst one.** A grade mid-match is analysis data. Covered by the RLS tests and the frame-key test; see below.
- **Repeatability.** The consumer must write the same grade on every redelivery, and the same grade the trainer would show.

## Coverage (what exists, what it proves)

| Claim                                                    | Test                                                                                                               | Status                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Consumer = trainer, decision for decision                | `src/lib/grading-golden.test.ts` (50 hands, 150+ decisions, 4 streets)                                             | Pass; mutation-checked (wrong seat view fails it)           |
| Same input → same grades                                 | golden set, `sanity.test.ts`, `determinism.test.ts` (cold vs warm caches)                                          | Pass                                                        |
| CPU on cold boards                                       | `src/engine/bench.test.ts`: worst 148 ms per decision against a 500 ms budget                                      | Pass                                                        |
| The named sanity order                                   | `sanity.test.ts`: TAG 79.4 > Atlas 72.9 > station 70.3 > folder 55.1                                               | Pass                                                        |
| Worse moves → lower accuracy; no reward for raising      | `sanity.test.ts` (new): TAG 79.4 > half-random 69.4 > random 59.7; pot-raiser 72.3 < TAG − 3; maniac 46.4 < folder | Pass                                                        |
| Grades written after verification; redelivery idempotent | `worker/test/grade.test.ts` (real queue, workerd), `supabase/tests/grades.test.ts`                                 | Pass; mutation-checked (the `rated` gate, swallowed errors) |
| Grading failure blocks nothing                           | `worker/test/grade.test.ts`: `record_grades` down for a whole forfeited match                                      | Pass                                                        |
| No grade reaches a client mid-match                      | `grades.test.ts` (nobody reads while playing, own grades included); `grade.test.ts` (no frame carries a grade key) | Pass                                                        |
| Only verified rated hands can be graded                  | `grades.test.ts` (refuses unverified and casual hands); found by review                                            | Pass                                                        |

## The attack: 13 scripted players

**Method.**

- Each player plays heads-up against Atlas.
- Every one of its decisions is graded against the population model, the way rated play is.
- First pass: seeds 23, 37 and 51, 60 decisions each.
- Second pass: seeds 23, 37, 51, 67 and 79, 300 decisions each, dumped per decision. Intervals are bootstrapped over decisions.
- Results against Atlas: 600 ungraded hands, in bb per hand.

### First pass: clock moves not graded (the behaviour as built)

| Player                                  | Accuracy | vs Atlas (bb/hand) |
| --------------------------------------- | -------: | -----------------: |
| TAG, letting the clock make its folds   | **87.0** |              +2.49 |
| TAG                                     |     79.4 |              +2.49 |
| Atlas                                   |     72.9 |              −0.21 |
| Pot-raise every street                  | **72.3** |         **−11.58** |
| Check, and let the clock fold every bet | **71.1** |              −0.45 |
| Always call                             |     70.3 |              −0.82 |
| Min-raise every street                  |     69.7 |             −13.77 |
| TAG with half its moves random          |     69.4 |              −5.59 |
| Random legal moves                      |     59.7 |              −7.08 |
| Always fold                             |     55.1 |              −0.45 |
| All in every time                       |     46.4 |              −3.86 |

### Finding 1 (fixed): clock moves were an exploit

- Leaving a spot to the clock hid it from the grade. Same play and same chips: TAG 79.4 → 87.0, folder 55.1 → 71.1.
- **Fix:** every move is graded (`src/lib/gradeHand.ts`). The golden set and the Worker test assert it.
- **Accepted cost:** a disconnected player's auto-folds are graded too. Abandonment is already a loss, and those folds are usually cheap.

### Finding 2 (mitigated, documented): averaging per decision ignores stakes

Second pass, with clock moves graded and 300 decisions each:

| Player      | Plain mean (shown) | Pot-weighted      | EV lost (bb/decision) |
| ----------- | ------------------ | ----------------- | --------------------: |
| TAG         | 78.9 [76.0, 81.9]  | 83.3 [78.0, 87.5] |                  0.40 |
| Atlas       | 74.9 [71.8, 78.0]  | 70.8 [59.6, 79.9] |                  0.82 |
| Always call | 72.7 [68.9, 76.1]  | 76.0 [72.2, 79.6] |                  0.33 |
| Pot-raiser  | 72.0 [67.7, 76.1]  | 71.4 [64.2, 77.7] |                  4.92 |
| Min-raiser  | 70.6 [67.0, 74.1]  | 67.2 [58.4, 76.2] |                  3.42 |
| Always fold | 57.7 [53.6, 62.1]  | 60.1 [56.0, 64.5] |                  0.52 |
| All in      | 47.0 [41.4, 52.8]  | 48.9 [43.5, 54.9] |                  5.83 |

- **The model's EV is right.** The raisers give up 4 to 12 times the EV per decision that TAG or Atlas does.
- **The plain mean is the problem.** Each decision is capped at 0 as a share of its own pot, so catastrophic big-pot decisions count no more than cheap ones. The raisers land just under the station and Atlas, with overlapping intervals.
- **The alternatives were worse.** Pot-weighted, √pot-weighted and the ratio of sums all break the named order (Atlas falls below the station) and are 2–3× noisier.
- **Decision.**
  - Keep the plain mean, which is spec-literal: its random-move ladder is perfectly ordered (ρ = 1.00) and the named order holds.
  - Store each decision's pot (`hand_grades.pot`), so the real-data Spearman analysis can compare variants.
  - Lock the attack's ordering into CI.
- **Proxy check.** Spearman ρ of accuracy with results against Atlas across 11 players: plain 0.35, pot-weighted 0.25, ratio of sums 0.46. Results against one bot are a weak stand-in for rating: Atlas barely punishes folding or shoving.

### Verdict on the mission's sanity rule

- **The model ranks the four named players in the expected order.** It does on both passes, so there is no "the model is wrong" stop.
- **Before shipping, the user hears that the attack found** an exploit, now fixed, and a weakness of per-decision averaging, now documented, measured, and ready to be decided on real data.

## Quality gates for this feature

- Golden set, determinism, bench, sanity (named order and attack order), and the Worker grading test: all green in CI.
- SQL: `grades.test.ts` and `rls-matrix.test.ts` green; `plans.ts` 12/12.
- Before any change to the aggregate shown on profiles: rerun the attack and the real-data Spearman comparison (SDE log, "Addition to the real-data analysis").

## Bugs found in this pass

1. Clock moves ungraded (exploit). Fixed in commit 2f88665.
2. `record_grades` accepted unverified or casual hands (review finding). Fixed in dfc7507.
3. The test helper `routeQueue` was called without `await`, so it could race the first hand. Fixed before commit.
