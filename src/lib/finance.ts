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

function requireProbability(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError(`${label} must be between zero and one.`)
}

function requirePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${label} must be positive.`)
}

export function allInCashout(
  equity: number,
  amountAtRisk: number,
  profitOnWin: number,
  feeRate: number,
) {
  requireProbability(equity, 'Equity')
  requireProbability(feeRate, 'Fee rate')
  requirePositive(amountAtRisk, 'Amount at risk')
  if (!Number.isFinite(profitOnWin) || profitOnWin < 0)
    throw new RangeError('Profit on a win must be nonnegative.')
  const eligiblePot = amountAtRisk + profitOnWin
  const fairPayout = equity * eligiblePot
  const fee = fairPayout * feeRate
  const cashoutPayout = fairPayout - fee
  const showdownEV = fairPayout - amountAtRisk
  const cashoutEV = cashoutPayout - amountAtRisk
  const runOnceDeviation = Math.sqrt(
    equity * (profitOnWin - showdownEV) ** 2 +
      (1 - equity) * (-amountAtRisk - showdownEV) ** 2,
  )
  return {
    eligiblePot,
    fairPayout,
    fee,
    cashoutPayout,
    showdownEV,
    cashoutEV,
    runOnceDeviation,
    runTwiceDeviation: runOnceDeviation / Math.sqrt(2),
    runTwiceOutcomes: [
      { probability: equity ** 2, payoff: profitOnWin },
      {
        probability: 2 * equity * (1 - equity),
        payoff: (profitOnWin - amountAtRisk) / 2,
      },
      { probability: (1 - equity) ** 2, payoff: -amountAtRisk },
    ],
  }
}

export function kellyFraction(
  equity: number,
  amountAtRisk: number,
  profitOnWin: number,
) {
  requireProbability(equity, 'Equity')
  requirePositive(amountAtRisk, 'Amount at risk')
  requirePositive(profitOnWin, 'Profit on a win')
  const netOdds = profitOnWin / amountAtRisk
  return Math.max(0, Math.min(1, equity - (1 - equity) / netOdds))
}

export function bankrollRisk({
  bankroll,
  equity,
  amountAtRisk,
  profitOnWin,
  kellyScale,
  horizon,
  ruinFloor,
}: {
  bankroll: number
  equity: number
  amountAtRisk: number
  profitOnWin: number
  kellyScale: number
  horizon: number
  ruinFloor: number
}) {
  requirePositive(bankroll, 'Bankroll')
  requireProbability(equity, 'Equity')
  requireProbability(kellyScale, 'Kelly scale')
  requireProbability(ruinFloor, 'Ruin floor')
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 1000)
    throw new RangeError('Horizon must be an integer from 1 to 1,000.')
  const fullKelly = kellyFraction(equity, amountAtRisk, profitOnWin)
  const fraction = fullKelly * kellyScale
  const netOdds = profitOnWin / amountAtRisk
  const up = 1 + fraction * netOdds
  const down = 1 - fraction
  const logBankroll = Math.log(bankroll)
  const logUp = Math.log(up)
  const logDown = Math.log(down)
  const logFloor = logBankroll + Math.log(ruinFloor)
  const logWealth = (wins: number, losses: number) =>
    logBankroll + (wins ? wins * logUp : 0) + (losses ? losses * logDown : 0)
  let surviving = new Map<number, number>(ruinFloor === 1 ? [] : [[0, 1]])
  let ruinProbability = ruinFloor === 1 ? 1 : 0
  for (let round = 0; round < horizon; round++) {
    const next = new Map<number, number>()
    for (const [wins, probability] of surviving) {
      const upLogWealth = logWealth(wins + 1, round - wins)
      const upProbability = probability * equity
      if (upLogWealth <= logFloor) ruinProbability += upProbability
      else next.set(wins + 1, (next.get(wins + 1) ?? 0) + upProbability)
      const downLogWealth = logWealth(wins, round - wins + 1)
      const downProbability = probability * (1 - equity)
      if (downLogWealth <= logFloor) ruinProbability += downProbability
      else next.set(wins, (next.get(wins) ?? 0) + downProbability)
    }
    surviving = next
  }
  const expectedFactor = equity * up + (1 - equity) * down
  const secondMomentFactor = equity * up ** 2 + (1 - equity) * down ** 2
  const logExpected = Math.log(bankroll) + horizon * Math.log(expectedFactor)
  const logSecondMoment =
    2 * Math.log(bankroll) + horizon * Math.log(secondMomentFactor)
  const expectedBankroll = fraction === 0 ? bankroll : Math.exp(logExpected)
  const relativeVariance = Math.max(
    0,
    -Math.expm1(2 * logExpected - logSecondMoment),
  )
  const finalDeviation =
    fraction === 0 || equity === 1 || relativeVariance === 0
      ? 0
      : Math.exp(logSecondMoment / 2) * Math.sqrt(relativeVariance)
  let distribution = new Map<number, number>([[0, 1]])
  for (let round = 0; round < horizon; round++) {
    const next = new Map<number, number>()
    for (const [wins, probability] of distribution) {
      next.set(wins + 1, (next.get(wins + 1) ?? 0) + probability * equity)
      next.set(wins, (next.get(wins) ?? 0) + probability * (1 - equity))
    }
    distribution = next
  }
  const outcomes = [...distribution]
    .map(([wins, probability]) => ({
      wealth:
        fraction === 0 ? bankroll : Math.exp(logWealth(wins, horizon - wins)),
      probability,
    }))
    .sort((left, right) => left.wealth - right.wealth)
  const quantile = (target: number) => {
    let cumulative = 0
    for (const outcome of outcomes) {
      cumulative += outcome.probability
      if (cumulative >= target) return outcome.wealth
    }
    return outcomes.at(-1)?.wealth ?? bankroll
  }
  return {
    fullKelly,
    fraction,
    stake: bankroll * fraction,
    ruinProbability: Math.min(1, ruinProbability),
    expectedBankroll,
    finalDeviation,
    fifthPercentile: quantile(0.05),
    median: quantile(0.5),
    ninetyFifthPercentile: quantile(0.95),
    logGrowth:
      fraction === 1 && equity === 1
        ? Math.log(up)
        : fraction === 1
          ? Number.NEGATIVE_INFINITY
          : equity * Math.log(up) + (1 - equity) * Math.log(down),
  }
}

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
