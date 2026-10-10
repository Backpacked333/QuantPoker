// One decision's grade against the human population model, exactly as the
// grading consumer computes it (worker/src/grade.ts) and the trainer's own
// analysis worker would (src/lib/equity.worker.ts seeds the same way). Pure
// and deterministic: the same decision always gets the same grade.
import { gradeDecision } from './grading'
import type { DecisionGrade } from './grading'
import { POPULATION_VERSION } from './population'
import type { Action, Game } from './poker'
import { hashString } from './random'
import { analyzeSpot } from './range'
import { lcg } from './sim'
import { spotKey } from './spotKey'

/** Grades are on the trainer's scale (src/lib/grading.ts). */
export const GRADE_VERSION = `grade.v1+${POPULATION_VERSION}`

/** The equity worker's seed for a spot key (src/lib/equity.worker.ts). */
export const spotSeed = (key: string) => hashString(key) ^ 0x9e3779b9

/** `game` is the hero's view at the decision; the hero is player 0. */
export function gradeVsPopulation(game: Game, action: Action): DecisionGrade {
  const key = `population|${spotKey(game, 'balanced')}`
  const spot = analyzeSpot(
    {
      key,
      hole: game.cards[0],
      board: game.board,
      history: game.history,
      style: 'balanced',
      opponent: 'population',
    },
    lcg(spotSeed(key)),
  )
  return gradeDecision(game, action, spot, 'balanced', 'population')
}
