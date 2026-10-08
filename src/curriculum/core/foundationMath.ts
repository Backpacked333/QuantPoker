import { failure, isRecord, numberIn, validatedModel } from './validation'
import type { ModelResult } from './types'
function fields<T extends Record<string, number>>(
  names: readonly (keyof T & string)[],
  ranges: Partial<Record<keyof T, [number, number]>> = {},
) {
  return (v: unknown): ModelResult<T> => {
    if (!isRecord(v) || Object.keys(v).some((k) => !names.includes(k)))
      return failure('inputs', 'Unknown or missing numeric fields.')
    for (const name of names) {
      const [min, max] = ranges[name] ?? [-1e9, 1e9]
      if (!numberIn(v[name], min, max))
        return failure(name, `Use a finite value between ${min} and ${max}.`)
    }
    return { ok: true, value: v as T, warnings: [] }
  }
}
export const terminalCall = validatedModel(
  fields<{ probability: number; existingPot: number; callCost: number }>(
    ['probability', 'existingPot', 'callCost'],
    { probability: [0, 1], existingPot: [0, 1e9], callCost: [0, 1e9] },
  ),
  (i) => ({
    winProfit: i.existingPot,
    loseProfit: -i.callCost,
    expectedProfit:
      i.probability * i.existingPot - (1 - i.probability) * i.callCost,
    breakEvenProbability:
      i.existingPot + i.callCost === 0
        ? null
        : i.callCost / (i.existingPot + i.callCost),
  }),
)
export const licenseLedger = validatedModel(
  fields<{ cost: number; grossReceipt: number; failureRecovery: number }>(
    ['cost', 'grossReceipt', 'failureRecovery'],
    { cost: [0, 1e9], grossReceipt: [0, 1e9], failureRecovery: [0, 1e9] },
  ),
  (i) => ({
    successProfit: i.grossReceipt - i.cost,
    failureProfit: i.failureRecovery - i.cost,
    declineProfit: 0,
  }),
)
export const conditionalCount = validatedModel(
  fields<{ eventAndCondition: number; conditionCount: number }>(
    ['eventAndCondition', 'conditionCount'],
    { eventAndCondition: [0, 1e9], conditionCount: [0, 1e9] },
  ),
  (i) => {
    if (
      !Number.isInteger(i.eventAndCondition) ||
      !Number.isInteger(i.conditionCount) ||
      i.eventAndCondition > i.conditionCount
    )
      throw new RangeError(
        'Use integer joint count no larger than the conditioning count.',
      )
    return {
      probability:
        i.conditionCount === 0 ? null : i.eventAndCondition / i.conditionCount,
      status: i.conditionCount === 0 ? 'unavailable' : 'available',
    }
  },
)
export const binaryMoments = validatedModel(
  fields<{ probability: number; gain: number; loss: number; trials: number }>(
    ['probability', 'gain', 'loss', 'trials'],
    {
      probability: [0, 1],
      gain: [0, 1e9],
      loss: [0, 1e9],
      trials: [1, 1000000],
    },
  ),
  (i) => {
    if (!Number.isInteger(i.trials))
      throw new RangeError('Trial count must be integer.')
    const mean = i.probability * i.gain - (1 - i.probability) * i.loss
    const variance =
      i.probability * (1 - i.probability) * (i.gain + i.loss) ** 2
    return {
      mean,
      variance,
      sd: Math.sqrt(variance),
      expectedTotal: i.trials * mean,
      totalSd: Math.sqrt(i.trials * variance),
      averageSd: Math.sqrt(variance / i.trials),
      allLossProbability: (1 - i.probability) ** i.trials,
    }
  },
)
export const nominalKelly = validatedModel(
  fields<{ probability: number; fraction: number }>(
    ['probability', 'fraction'],
    { probability: [0, 1], fraction: [0, 1] },
  ),
  (i) => ({
    fullFraction: Math.max(0, 2 * i.probability - 1),
    chosenFraction: i.fraction * Math.max(0, 2 * i.probability - 1),
  }),
)
export const insurancePreference = validatedModel(
  fields<{
    wealth: number
    loss: number
    lossProbability: number
    premium: number
  }>(['wealth', 'loss', 'lossProbability', 'premium'], {
    wealth: [0, 1e9],
    loss: [0, 1e9],
    lossProbability: [0, 1],
    premium: [0, 1e9],
  }),
  (i) => {
    if (i.loss >= i.wealth || i.premium >= i.wealth || i.wealth <= 0)
      throw new RangeError(
        'Use strictly positive wealth in every state for log utility; loss and premium must be below wealth.',
      )
    return {
      uninsuredExpectedWealth: i.wealth - i.lossProbability * i.loss,
      insuredWealth: i.wealth - i.premium,
      uninsuredCertaintyEquivalent: Math.exp(
        (1 - i.lossProbability) * Math.log(i.wealth) +
          i.lossProbability * Math.log(i.wealth - i.loss),
      ),
      insuredCertaintyEquivalent: i.wealth - i.premium,
    }
  },
)
export const twoStateCall = validatedModel(
  fields<{
    stockNow: number
    stockUp: number
    stockDown: number
    strike: number
    physicalUpProbability: number
    fee: number
  }>(
    [
      'stockNow',
      'stockUp',
      'stockDown',
      'strike',
      'physicalUpProbability',
      'fee',
    ],
    {
      stockNow: [0, 1e9],
      stockUp: [0, 1e9],
      stockDown: [0, 1e9],
      strike: [0, 1e9],
      physicalUpProbability: [0, 1],
      fee: [0, 1e9],
    },
  ),
  (i) => {
    if (!(i.stockDown < i.stockNow && i.stockNow < i.stockUp))
      throw new RangeError(
        'Zero-interest no-arbitrage example needs stockDown < stockNow < stockUp.',
      )
    const upPayment = Math.max(0, i.stockUp - i.strike),
      downPayment = Math.max(0, i.stockDown - i.strike)
    const shares = (upPayment - downPayment) / (i.stockUp - i.stockDown),
      debt = shares * i.stockDown - downPayment
    const replicationCost = shares * i.stockNow - debt
    return {
      upPayment,
      downPayment,
      shares,
      debt,
      replicationCost,
      buyerCost: replicationCost + i.fee,
      pricingUpWeight: (i.stockNow - i.stockDown) / (i.stockUp - i.stockDown),
      physicalExpectedPayment:
        i.physicalUpProbability * upPayment +
        (1 - i.physicalUpProbability) * downPayment,
    }
  },
)
