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

export function decisionOptions(
  game: Game,
  spot: FullSpot,
  style: AtlasStyle,
  model: OpponentModel = 'range',
  actualTo?: number,
): ActionOption[] {
  const { toCall, pot, heroBet, atlasBet, legal } = heroContext(game)
  const outcome = spotOutcome(spot, model)
  const options: ActionOption[] = [
    { kind: 'fold', label: 'Fold', ev: 0 },
    {
      kind: 'continue',
      label: toCall ? `Call ${toCall}` : 'Check',
      ev: outcome.equity * pot - (1 - outcome.equity) * toCall,
    },
  ]
  const verb = Math.max(...game.bets) ? 'Raise to' : 'Bet'
  for (const to of raiseCandidates(game, actualTo)) {
    const analysis = raiseAnalysis(
      spot,
      model,
      { pot, heroBet, atlasBet, raiseTo: to },
      style,
    )
    options.push({
      kind: 'raise',
      label: `${verb} ${to}${to === legal.maxRaiseTo ? ' (all-in)' : ''}`,
      to,
      ev: analysis.ev,
      foldProbability: analysis.foldProbability,
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
  // Folding is only a real alternative when there is something to call.
  const pool = heroContext(game).toCall
    ? options
    : options.filter((o) => o.kind !== 'fold' || chosen.kind === 'fold')
  const best = pool.reduce((a, b) => (b.ev > a.ev ? b : a))
  const evLost = Math.max(0, best.ev - chosen.ev)
  return {
    options,
    chosen,
    best,
    evLost,
    grade: gradeFor(evLost, game.pot),
    accuracy: accuracyFor(evLost, game.pot),
    equity: spotOutcome(spot, model).equity,
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
