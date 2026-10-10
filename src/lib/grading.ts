// Decision grading: compare the chosen action with the best modeled action at
// the moment of decision. Grades measure EV given up under QuantPoker's
// model, never the realized result.
import type { AtlasStyle } from './atlas'
import { heroContext, raiseAnalysis, spotOutcome } from './model'
import type { OpponentModel } from './model'
import type { Action, Game } from './poker'
import type { FullSpot } from './range'

export type Grade = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder'
export const GRADES: Grade[] = [
  'Best',
  'Good',
  'Inaccuracy',
  'Mistake',
  'Blunder',
]

/** Thresholds on EV given up as a share of the pot. */
export const GRADE_LIMITS: [Grade, number][] = [
  ['Best', 0.03],
  ['Good', 0.08],
  ['Inaccuracy', 0.18],
  ['Mistake', 0.35],
  ['Blunder', Infinity],
]

export function gradeFor(evLost: number, pot: number): Grade {
  const share = Math.max(0, evLost) / Math.max(1, pot)
  return GRADE_LIMITS.find(([, limit]) => share <= limit)![0]
}

/** 100 for a best-EV choice, falling linearly to 0 at half a pot given up. */
export const accuracyFor = (evLost: number, pot: number) =>
  Math.max(0, 100 - (200 * Math.max(0, evLost)) / Math.max(1, pot))

export type ActionOption = {
  kind: 'fold' | 'continue' | 'raise'
  label: string
  to?: number
  ev: number
  foldProbability?: number
  /**
   * Whether the option sets the bar for grading. Overbets beyond 1.5× pot are
   * shown but not graded against: the model prices a call as a check-down
   * (no implied odds) while a shove has no later betting, which biases the
   * comparison toward huge bets.
   */
  graded: boolean
}

/** Largest raise target used as a grading benchmark. */
export const gradingCap = (game: Game) => {
  const { pot, toCall } = heroContext(game)
  return Math.max(...game.bets) + 1.5 * (pot + toCall)
}

export type DecisionGrade = {
  options: ActionOption[]
  chosen: ActionOption
  best: ActionOption
  evLost: number
  grade: Grade
  accuracy: number
  equity: number
}

/** Raise targets worth comparing: common pot fractions plus the actual size. */
export function raiseCandidates(game: Game, actualTo?: number) {
  const { legal, toCall, pot } = heroContext(game)
  if (!legal.canRaise) return []
  const current = Math.max(...game.bets)
  const sizes = [0.5, 0.75, 1].map((f) =>
    Math.round(current + f * (pot + toCall)),
  )
  sizes.push(legal.maxRaiseTo)
  if (actualTo !== undefined) sizes.push(actualTo)
  return [
    ...new Set(
      sizes.map((s) =>
        Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, s)),
      ),
    ),
  ].sort((a, b) => a - b)
}

/**
 * The opponent's seat as it faces a hero raise now: its position, and the
 * raises on this street including the hero's.
 */
export function opponentFacingRaise(game: Game) {
  const street = game.street
  return {
    preflop: street === 'preflop',
    // The dealer posts the small blind; the hero is player 0.
    bigBlind: game.dealer === 0,
    raises:
      game.history.filter((h) => h.street === street && h.action === 'raise')
        .length + 1,
  }
}

export function decisionOptions(
  game: Game,
  spot: FullSpot,
  style: AtlasStyle,
  model: OpponentModel = 'range',
  actualTo?: number,
): ActionOption[] {
  const { toCall, pot, heroBet, atlasBet, legal } = heroContext(game)
  const seat = model === 'population' ? opponentFacingRaise(game) : undefined
  const outcome = spotOutcome(spot, model)
  const cap = gradingCap(game)
  const options: ActionOption[] = [
    { kind: 'fold', label: 'Fold', ev: 0, graded: true },
    {
      kind: 'continue',
      label: toCall ? `Call ${toCall}` : 'Check',
      ev: outcome.equity * pot - (1 - outcome.equity) * toCall,
      graded: true,
    },
  ]
  const verb = Math.max(...game.bets) ? 'Raise to' : 'Bet'
  for (const to of raiseCandidates(game, actualTo)) {
    const analysis = raiseAnalysis(
      spot,
      model,
      { pot, heroBet, atlasBet, raiseTo: to, seat },
      style,
    )
    options.push({
      kind: 'raise',
      label: `${verb} ${to}${to === legal.maxRaiseTo ? ' (all-in)' : ''}`,
      to,
      ev: analysis.ev,
      foldProbability: analysis.foldProbability,
      graded: to <= cap || to === actualTo,
    })
  }
  return options
}

export function gradeDecision(
  game: Game,
  action: Action,
  spot: FullSpot,
  style: AtlasStyle,
  model: OpponentModel = 'range',
): DecisionGrade {
  const options = decisionOptions(
    game,
    spot,
    style,
    model,
    action.type === 'raise' ? action.to : undefined,
  )
  const chosen =
    action.type === 'fold'
      ? options[0]
      : action.type === 'raise'
        ? options.find((o) => o.to === action.to)!
        : options[1]
  return gradeChoice(game, options, chosen, spotOutcome(spot, model).equity)
}

/**
 * Grades one of `options` (from `decisionOptions`) as the choice. Split from
 * `gradeDecision` so a spot priced once can grade every action
 * (src/challenge/build.ts).
 */
export function gradeChoice(
  game: Game,
  options: ActionOption[],
  chosen: ActionOption,
  equity: number,
): DecisionGrade {
  // Folding is only a real alternative when there is something to call.
  const pool = options.filter(
    (o) =>
      (o.graded || o === chosen) &&
      (heroContext(game).toCall || o.kind !== 'fold' || chosen.kind === 'fold'),
  )
  const best = pool.reduce((a, b) => (b.ev > a.ev ? b : a))
  const evLost = Math.max(0, best.ev - chosen.ev)
  return {
    options,
    chosen,
    best,
    evLost,
    grade: gradeFor(evLost, game.pot),
    accuracy: accuracyFor(evLost, game.pot),
    equity,
  }
}

export type CalibrationPoint = { guess: number; actual: number; label: string }

export function calibrationSummary(points: CalibrationPoint[]) {
  if (!points.length) return null
  const errors = points.map((p) => p.guess - p.actual)
  const meanAbsError =
    errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length
  const bias = errors.reduce((sum, e) => sum + e, 0) / errors.length
  const byLabel = new Map<string, number[]>()
  points.forEach((p) =>
    byLabel.set(p.label, [...(byLabel.get(p.label) ?? []), p.guess - p.actual]),
  )
  const groups = [...byLabel.entries()]
    .map(([label, list]) => ({
      label,
      count: list.length,
      bias: list.reduce((s, e) => s + e, 0) / list.length,
      meanAbsError: list.reduce((s, e) => s + Math.abs(e), 0) / list.length,
    }))
    .sort((a, b) => b.meanAbsError - a.meanAbsError)
  return { meanAbsError, bias, groups, count: points.length }
}
