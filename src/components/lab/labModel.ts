import { useMemo } from 'react'
import type { AtlasStyle } from '../../lib/atlas'
import {
  decisionBreakEven,
  decisionEV,
  decisionOutcomes,
  fairPremium,
  payoffStatistics,
} from '../../lib/finance'
import type {
  DecisionAction,
  DecisionModel,
  SurfaceScenario,
} from '../../lib/finance'
import {
  heroContext,
  nextScenarios,
  raiseAnalysis,
  spotOutcome,
} from '../../lib/model'
import type { NextScenario, OpponentModel, Outcome } from '../../lib/model'
import type { Game } from '../../lib/poker'
import type { SpotAnalysis } from '../../lib/range'

export type LabInputs = {
  game: Game
  spot: SpotAnalysis | undefined
  style: AtlasStyle
  model: OpponentModel
  raiseTo: number
  action: DecisionAction
  foldOverride: number | null
  coverageFraction: number
  whatIf: NextScenario | null
}

const emptyOutcome: Outcome = { equity: 0, win: 0, tie: 0, loss: 1 }

export function useLabModel(inputs: LabInputs) {
  const {
    game,
    spot,
    style,
    model,
    raiseTo,
    action: requested,
    foldOverride,
    coverageFraction,
    whatIf,
  } = inputs
  const full = spot?.stage === 'full' ? spot : null
  const base = useMemo(() => {
    const context = heroContext(game)
    const live = full ? spotOutcome(full, model) : null
    const anyHand = full ? spotOutcome(full, 'uniform') : null
    const quickEquity = spot ? spot.quick.win + spot.quick.tie / 2 : undefined
    const next = full ? nextScenarios(full, model) : null
    const canRaise = context.legal.canRaise
    const clampedRaise = Math.min(
      context.legal.maxRaiseTo,
      Math.max(context.legal.minRaiseTo, raiseTo),
    )
    const raise =
      full && canRaise
        ? raiseAnalysis(
            full,
            model,
            {
              pot: context.pot,
              heroBet: context.heroBet,
              atlasBet: context.atlasBet,
              raiseTo: clampedRaise,
            },
            style,
          )
        : null
    return {
      context,
      live,
      anyHand,
      quickEquity,
      next,
      raise,
      canRaise,
      clampedRaise,
    }
  }, [game, full, spot, model, raiseTo, style])

  const { context, live, raise, canRaise, clampedRaise } = base
  const outcome = whatIf ?? live ?? emptyOutcome
  const action: DecisionAction =
    requested === 'raise' && !canRaise ? 'continue' : requested
  const pot = context.pot
  const call = context.toCall
  const modelFold = raise?.foldProbability ?? 0.25
  const foldProbability = foldOverride ?? modelFold
  // With the Atlas model, the called branch uses only the hands that continue;
  // a manual fold assumption falls back to the whole range.
  const calledOutcome =
    raise && foldOverride === null && !whatIf ? raise.called : outcome
  const models: Record<DecisionAction, DecisionModel> = {
    fold: { action: 'fold', pot, risk: 0, opponentCall: 0, foldProbability: 0 },
    continue: {
      action: 'continue',
      pot,
      risk: call,
      opponentCall: 0,
      foldProbability: 0,
    },
    raise: {
      action: 'raise',
      pot,
      risk: raise?.risk ?? Math.max(0, clampedRaise - context.heroBet),
      opponentCall:
        raise?.opponentCall ?? Math.max(0, clampedRaise - context.atlasBet),
      foldProbability,
    },
  }
  const decision = models[action]
  const probabilities = action === 'raise' ? calledOutcome : outcome
  const ev = {
    fold: 0,
    continue: decisionEV(models.continue, outcome.equity),
    raise: canRaise
      ? decisionEV(models.raise, calledOutcome.equity)
      : Number.NEGATIVE_INFINITY,
  }
  const selectedEV = ev[action]
  const best = (Object.keys(ev) as DecisionAction[])
    .filter((k) => k !== 'fold' || call > 0)
    .reduce((a, b) => (ev[b] > ev[a] ? b : a), call > 0 ? 'fold' : 'continue')
  const exposure = decision.risk
  const lossProbability =
    action === 'fold'
      ? 0
      : probabilities.loss * (action === 'raise' ? 1 - foldProbability : 1)
  const coverage = exposure * coverageFraction
  const premium = fairPremium(lossProbability, coverage)
  const unhedged = payoffStatistics(decisionOutcomes(decision, probabilities))
  const hedged = payoffStatistics(
    decisionOutcomes(decision, probabilities, coverage),
  )
  const scenario: SurfaceScenario = {
    ...decision,
    equity: probabilities.equity,
    lossProbability,
    coverageFraction,
  }
  const deltaPerPoint =
    action === 'fold'
      ? 0
      : ((pot + decision.opponentCall + exposure) *
          (action === 'raise' ? 1 - foldProbability : 1)) /
        100
  return {
    ready: !!full,
    quickEquity: base.quickEquity,
    anyHand: base.anyHand,
    next: base.next,
    steps: full?.steps ?? [],
    full,
    context,
    outcome,
    calledOutcome,
    pot,
    call,
    raiseTo: clampedRaise,
    canRaise,
    action,
    models,
    decision,
    ev,
    selectedEV,
    best,
    breakEven: decisionBreakEven(decision),
    callBreakEven: call ? call / (pot + call) : 0,
    modelFold,
    foldProbability,
    exposure,
    lossProbability,
    coverage,
    premium,
    unhedged: unhedged.deviation,
    hedged: hedged.deviation,
    scenario,
    deltaPerPoint,
    bankrollExposure: exposure / Math.max(1, game.stacks[0] + game.bets[0]),
    cardsToCome: Math.max(0, 5 - game.board.length),
  }
}
export type LabModel = ReturnType<typeof useLabModel>
