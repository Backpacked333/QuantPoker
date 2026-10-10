// Prices every decision the hero can reach in a challenge hand, once, offline
// (architect: landing-and-onboarding §1). The output is
// trees.generated.json; generate.test.ts rebuilds it and fails on any
// difference, so the trees can never drift from the trainer's grader.
//
// Grades are the trainer's: Atlas's modeled range ('range'), the balanced
// style, and the same seeded analysis as the trainer's equity worker. Atlas's
// replies come from its published policy, seeded by the hand and the line.
import { atlasDecision } from '../lib/atlas'
import { spotSeed } from '../lib/grader'
import { decisionOptions, gradeChoice } from '../lib/grading'
import type { ActionOption } from '../lib/grading'
import { spotOutcome } from '../lib/model'
import { act, legalActions } from '../lib/poker'
import type { Action, Game } from '../lib/poker'
import { hashString } from '../lib/random'
import { analyzeSpot, COMBO_A, COMBO_B, COMBOS } from '../lib/range'
import type { FullSpot } from '../lib/range'
import { fromId, lcg } from '../lib/sim'
import { spotKey } from '../lib/spotKey'
import { actionOf, codeOf } from './actions'
import { CHALLENGE_HANDS, STYLE, startGame } from './hands'
import type { ChallengeSpec } from './hands'
import type {
  ActionCode,
  AtlasStep,
  ChallengeNode,
  ChallengeTree,
  ChallengeTrees,
  RangeEntry,
} from './score'

/** How many of Atlas's likeliest hands the range cloud shows. */
export const RANGE_CARDS = 36

const RANKS = '23456789TJQKA'
const label = (id: number) => {
  const card = fromId(id)
  return `${RANKS[card.rank - 2]}${card.suit}`
}

/** Atlas's likeliest hands, heaviest first, with the hero's equity vs each. */
export function topRange(spot: FullSpot): RangeEntry[] {
  const order: number[] = []
  for (let k = 0; k < COMBOS; k++)
    if (spot.weights[k] > 0 && !Number.isNaN(spot.heroWin[k])) order.push(k)
  order.sort((a, b) => spot.weights[b] - spot.weights[a] || a - b)
  return order
    .slice(0, RANGE_CARDS)
    .map((k) => [
      label(COMBO_A[k]) + label(COMBO_B[k]),
      round(spot.weights[k], 4),
      round(spot.heroWin[k] + spot.heroTie[k] / 2, 2),
    ])
}

const round = (value: number, places: number) =>
  Math.round(value * 10 ** places) / 10 ** places

const actionFor = (option: ActionOption, game: Game): Action =>
  option.kind === 'fold'
    ? { type: 'fold' }
    : option.kind === 'raise'
      ? { type: 'raise', to: option.to! }
      : actionOf(game, 'c')

export function buildTree(spec: ChallengeSpec): ChallengeTree {
  const nodes: ChallengeNode[] = []

  const visit = (game: Game, line: ActionCode[]): number => {
    const key = spotKey(game, STYLE)
    const spot = analyzeSpot(
      {
        key,
        hole: game.cards[0],
        board: game.board,
        history: game.history,
        style: STYLE,
      },
      lcg(spotSeed(key)),
    )
    const options = decisionOptions(game, spot, STYLE)
    const equity = spotOutcome(spot, 'range').equity
    const { toCall } = legalActions(game)
    const index = nodes.length
    const node: ChallengeNode = {
      street: game.street as ChallengeNode['street'],
      pot: game.pot,
      toCall,
      equity: round(equity, 3),
      options: [],
      ...(nodes.length === 0 ? { range: topRange(spot) } : {}),
    }
    nodes.push(node)
    // Folding with nothing to call is never offered.
    const choices = options.filter((o) => o.kind !== 'fold' || toCall > 0)
    const graded = choices.map((choice) =>
      gradeChoice(game, options, choice, equity),
    )
    // The node's best option, as grading a check or call sees it (an ungraded
    // overbet only becomes "best" when it is the choice being graded).
    const best = gradeChoice(game, options, options[1], equity).best
    for (const [i, choice] of choices.entries()) {
      const action = actionFor(choice, game)
      const code = codeOf(action)
      const after = [...line, code]
      let next = act(game, action)
      const atlas: AtlasStep[] = []
      while (!next.result && next.turn === 1) {
        const decision = atlasDecision(
          next,
          STYLE,
          lcg(hashString(`${spec.id}|${after.join(' ')}|${atlas.length}`)),
        )
        atlas.push({
          code: codeOf(decision.action),
          note: decision.explanation,
        })
        next = act(next, decision.action, decision.explanation)
      }
      node.options.push({
        code,
        label: choice.label,
        ev: round(choice.ev, 1),
        grade: graded[i].grade,
        accuracy: round(graded[i].accuracy, 1),
        best: choice === best,
        atlas,
        next: next.result ? null : visit(next, after),
      })
    }
    return index
  }

  visit(startGame(spec), [])
  return { id: spec.id, ver: spec.ver, nodes }
}

export const buildTrees = (grader: string): ChallengeTrees => ({
  grader,
  hands: CHALLENGE_HANDS.map(buildTree),
})
