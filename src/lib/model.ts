// Derivations from a FullSpot that are cheap enough to recompute on every
// slider move. Pure functions shared by the lab, the grader and tests.
import { policy } from './atlas'
import type { AtlasStyle } from './atlas'
import { decisionEV } from './finance'
import { populationPolicy } from './population'
import type { Seat } from './population'
import type { Card, Game, OutcomeProbabilities } from './poker'
import { legalActions } from './poker'
import {
  COMBOS,
  COMBO_A,
  COMBO_B,
  gridCell,
  POLICY_SIGMA,
  preflopPercentiles,
} from './range'
import type { FullSpot } from './range'
import { categoryOf, fromId, score, toId } from './sim'

/**
 * `range`: Atlas's range and responses (the trainer). `uniform`: any two
 * cards. `population`: the human population model (src/lib/population.ts),
 * for grading people; the spot must be analysed with `opponent:
 * 'population'`, so its weights are that model's range.
 */
export type OpponentModel = 'range' | 'uniform' | 'population'
export type Outcome = OutcomeProbabilities

const toOutcome = (win: number, tie: number): Outcome => ({
  win,
  tie,
  loss: Math.max(0, 1 - win - tie),
  equity: win + tie / 2,
})

export function spotOutcome(spot: FullSpot, model: OpponentModel): Outcome {
  let w = 0,
    t = 0,
    total = 0
  for (let k = 0; k < COMBOS; k++) {
    if (Number.isNaN(spot.heroWin[k])) continue
    const weight = model === 'uniform' ? 1 : spot.weights[k]
    if (!weight) continue
    w += weight * spot.heroWin[k]
    t += weight * spot.heroTie[k]
    total += weight
  }
  return total ? toOutcome(w / total, t / total) : toOutcome(0, 0)
}

export type RaiseContext = {
  pot: number
  heroBet: number
  atlasBet: number
  raiseTo: number
  /** The opponent's seat as it faces the raise (population model only). */
  seat?: Seat
}
export type RaiseAnalysis = {
  foldProbability: number
  /** Hero's outcome against the part of the range that continues. */
  called: Outcome
  ev: number
  risk: number
  opponentCall: number
}

/**
 * The opponent's modeled response to a hero raise: Atlas's published policy,
 * or the population model's.
 */
export function raiseAnalysis(
  spot: FullSpot,
  model: OpponentModel,
  context: RaiseContext,
  style: AtlasStyle,
): RaiseAnalysis {
  const risk = Math.max(0, context.raiseTo - context.heroBet)
  const opponentCall = Math.max(0, context.raiseTo - context.atlasBet)
  const atlasContext = {
    toCall: opponentCall,
    pot: context.pot + risk,
    canRaise: true,
  }
  const ranks = model === 'population' ? preflopPercentiles() : null
  const seat = context.seat ?? { preflop: false, bigBlind: false, raises: 1 }
  let total = 0,
    folds = 0,
    continuing = 0,
    win = 0,
    tie = 0
  for (let k = 0; k < COMBOS; k++) {
    if (Number.isNaN(spot.heroWin[k])) continue
    const weight = model === 'uniform' ? 1 : spot.weights[k]
    if (!weight) continue
    const fold = (
      ranks
        ? populationPolicy(
            spot.atlasEquity[k],
            ranks[gridCell(COMBO_A[k], COMBO_B[k])],
            atlasContext,
            seat,
            POLICY_SIGMA,
          )
        : policy(spot.atlasEquity[k], atlasContext, style, POLICY_SIGMA)
    ).fold
    total += weight
    folds += weight * fold
    const stays = weight * (1 - fold)
    continuing += stays
    win += stays * spot.heroWin[k]
    tie += stays * spot.heroTie[k]
  }
  const foldProbability = total ? folds / total : 0
  const called = continuing
    ? toOutcome(win / continuing, tie / continuing)
    : toOutcome(0, 0)
  const ev = decisionEV(
    {
      action: 'raise',
      pot: context.pot,
      risk,
      opponentCall,
      foldProbability,
    },
    called.equity,
  )
  return { foldProbability, called, ev, risk, opponentCall }
}

export type NextScenario = Outcome & { card: Card }
export function nextScenarios(spot: FullSpot, model: OpponentModel) {
  const all: NextScenario[] = spot.next.map((item) => ({
    card: fromId(item.id),
    ...toOutcome(...(model === 'uniform' ? item.uniform : item.range)),
  }))
  if (!all.length)
    return { all, best: [], worst: [], volatility: null as number | null }
  const mean = all.reduce((sum, item) => sum + item.equity, 0) / all.length
  const volatility = Math.sqrt(
    all.reduce((sum, item) => sum + (item.equity - mean) ** 2, 0) / all.length,
  )
  const sorted = [...all].sort((a, b) => b.equity - a.equity)
  return {
    all,
    best: sorted.slice(0, 4),
    worst: sorted.slice(-4).reverse(),
    volatility,
  }
}

const RANKS = 'AKQJT98765432'
export const gridLabel = (cell: number) => {
  const row = Math.floor(cell / 13),
    col = cell % 13
  if (row === col) return `${RANKS[row]}${RANKS[col]}`
  return row < col
    ? `${RANKS[row]}${RANKS[col]}s`
    : `${RANKS[col]}${RANKS[row]}o`
}

/**
 * Relative likelihood of each of the 169 starting-hand classes in Atlas's
 * range (1 = most likely class), plus each class's share of the range.
 */
export function rangeGrid(spot: FullSpot, model: OpponentModel) {
  const mass = new Float64Array(169)
  const live = new Float64Array(169)
  for (let k = 0; k < COMBOS; k++) {
    if (Number.isNaN(spot.heroWin[k])) continue
    const cell = gridCell(COMBO_A[k], COMBO_B[k])
    live[cell]++
    mass[cell] += model === 'uniform' ? 1 : spot.weights[k]
  }
  let totalMass = 0
  for (let c = 0; c < 169; c++) totalMass += mass[c]
  const density = Array.from(mass, (m, c) => (live[c] ? m / live[c] : 0))
  const peak = Math.max(...density) || 1
  return Array.from({ length: 169 }, (_, c) => ({
    label: gridLabel(c),
    likelihood: density[c] / peak,
    share: totalMass ? mass[c] / totalMass : 0,
    possible: live[c] > 0,
  }))
}

export type HandClass =
  | 'Pocket pair'
  | 'Two high cards'
  | 'Suited or connected'
  | 'Weak starting hand'
  | 'Strong made hand'
  | 'One pair'
  | 'Flush draw'
  | 'Straight draw'
  | 'High card'

/** Coarse situation label used to find calibration blind spots. */
export function handClass(hole: Card[], board: Card[]): HandClass {
  const [a, b] = hole
  if (!board.length) {
    if (a.rank === b.rank) return 'Pocket pair'
    if (Math.min(a.rank, b.rank) >= 10) return 'Two high cards'
    if (a.suit === b.suit || Math.abs(a.rank - b.rank) === 1)
      return 'Suited or connected'
    return 'Weak starting hand'
  }
  const all = [...hole, ...board]
  const category = categoryOf(score(all.map(toId)))
  if (category >= 2) return 'Strong made hand'
  if (board.length < 5) {
    const suits = new Map<string, number>()
    all.forEach((c) => suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1))
    if ([...suits.values()].some((n) => n === 4)) return 'Flush draw'
    const ranks = new Set(all.map((c) => c.rank))
    if (ranks.has(14)) ranks.add(1)
    for (let low = 1; low <= 10; low++) {
      let hits = 0
      for (let r = low; r < low + 5; r++) if (ranks.has(r)) hits++
      if (hits === 4) return category === 1 ? 'One pair' : 'Straight draw'
    }
  }
  return category === 1 ? 'One pair' : 'High card'
}

/** The hero-perspective decision context for a game state at hero's turn. */
export function heroContext(game: Game) {
  const heroLegal =
    game.turn === 0 ? legalActions(game) : legalActions({ ...game, turn: 0 })
  return {
    pot: game.pot,
    heroBet: game.bets[0],
    atlasBet: game.bets[1],
    toCall: heroLegal.toCall,
    legal: heroLegal,
  }
}
