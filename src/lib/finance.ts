export const callEV = (equity: number, pot: number, call: number) =>
  equity * pot - (1 - equity) * call
export const breakEvenEquity = (pot: number, call: number) =>
  call === 0 ? 0 : call / (pot + call)
export const optionProfit = (price: number, strike: number, premium: number) =>
  Math.max(price - strike, 0) - premium
export const insuranceProfit = (
  loss: number,
  coverage: number,
  premium: number,
) => -loss + Math.min(loss, coverage) - premium
export const fairPremium = (probability: number, coverage: number) =>
  probability * coverage

export type Lens = 'equity' | 'options' | 'insurance'
export type DecisionAction = 'fold' | 'continue' | 'raise'
export type DecisionModel = {
  action: DecisionAction
  pot: number
  risk: number
  opponentCall: number
  foldProbability: number
}

export function decisionEV(
  model: DecisionModel,
  equity: number,
  foldProbability = model.foldProbability,
) {
  if (model.action === 'fold') return 0
  const fold = model.action === 'raise' ? foldProbability : 0
  const calledEV =
    equity * (model.pot + model.opponentCall) - (1 - equity) * model.risk
  return fold * model.pot + (1 - fold) * calledEV
}

export function decisionBreakEven(
  model: DecisionModel,
  foldProbability = model.foldProbability,
) {
  if (model.action === 'fold') return 0
  const fold = model.action === 'raise' ? foldProbability : 0
  if (fold >= 1) return 0
  if (model.pot + model.opponentCall + model.risk <= 0) return 0
  const threshold =
    (model.risk - (fold * model.pot) / (1 - fold)) /
    (model.pot + model.opponentCall + model.risk)
  return Math.max(0, Math.min(1, threshold))
}

export type SurfaceScenario = DecisionModel & {
  equity: number
  lossProbability: number
  coverageFraction: number
}

export const surfaceRiskRange = (scenario: SurfaceScenario) =>
  Math.max(1, Math.ceil(scenario.risk / Math.max(1, scenario.pot)))

export function decisionOutcomes(
  model: DecisionModel,
  probabilities: { win: number; tie: number; loss: number },
  coverage = 0,
) {
  if (model.action === 'fold') return [{ probability: 1, payoff: 0 }]
  const f = model.action === 'raise' ? model.foldProbability : 0
  const lossProbability = (1 - f) * probabilities.loss
  const premium = lossProbability * coverage
  const winProfit = model.pot + model.opponentCall
  return [
    { probability: f, payoff: model.pot - premium },
    { probability: (1 - f) * probabilities.win, payoff: winProfit - premium },
    {
      probability: (1 - f) * probabilities.tie,
      payoff: (winProfit - model.risk) / 2 - premium,
    },
    { probability: lossProbability, payoff: -model.risk + coverage - premium },
  ]
}

export function payoffStatistics(
  outcomes: { probability: number; payoff: number }[],
) {
  const mean = outcomes.reduce(
    (sum, item) => sum + item.probability * item.payoff,
    0,
  )
  const deviation = Math.sqrt(
    outcomes.reduce(
      (sum, item) => sum + item.probability * (item.payoff - mean) ** 2,
      0,
    ),
  )
  return { mean, deviation }
}

export function liveSurfaceValue(
  lens: Lens,
  x: number,
  z: number,
  scenario: SurfaceScenario,
): number {
  const scale = Math.max(1, scenario.pot)
  const risk = z * scale * surfaceRiskRange(scenario)
  if (lens === 'equity') return decisionEV({ ...scenario, risk }, x) / scale
  if (lens === 'options')
    return Math.max(0, decisionEV({ ...scenario, risk }, x)) / scale
  if (scenario.risk <= 0) return 0
  const exposure = Math.max(1, scenario.risk)
  const coverage = z * exposure
  const premium = fairPremium(x, coverage)
  return (-exposure + coverage - premium) / exposure
}
