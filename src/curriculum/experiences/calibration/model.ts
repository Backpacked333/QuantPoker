import type { JsonValue, ModelResult } from '../../core/types'
import {
  failure,
  isRecord,
  isSafeJson,
  numberIn,
  success,
  validatedModel,
} from '../../core/validation'

export interface CalibrationInputs {
  group1Weight: number
  group1Probability: number
  group2Probability: number
  gain: number
  loss: number
}
export type Decision = 'continue' | 'decline' | 'indifferent'
export interface ForecastEvaluation {
  forecast: number
  action: Decision
  expectedBrierLoss: number
  truePolicyContribution: number
}
export interface GroupEvaluation {
  id: 'group-1' | 'group-2'
  weight: number
  trueProbability: number
  modeledFrequency: number | null
  frequencyStatus: 'available' | 'zero-weight'
  trueActionEV: number
  baseline: ForecastEvaluation
  informed: ForecastEvaluation
}
export interface CalibrationOutput {
  inputs: CalibrationInputs
  populationProbability: number
  breakEvenProbability: number
  groups: [GroupEvaluation, GroupEvaluation]
  baselineBrier: number
  informedBrier: number
  baselinePolicyValue: number
  informedPolicyValue: number
  informationGain: number
  resolutionGain: number
}
export const defaultInputs: Readonly<CalibrationInputs> = Object.freeze({
  group1Weight: 0.5,
  group1Probability: 0.1,
  group2Probability: 0.6,
  gain: 100,
  loss: 25,
})
const domains = {
  group1Weight: [0, 1],
  group1Probability: [0, 1],
  group2Probability: [0, 1],
  gain: [1, 500],
  loss: [0, 200],
} as const
export function decodeInputs(value: unknown): ModelResult<CalibrationInputs> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 5 ||
    Object.keys(value).some((k) => !(k in domains))
  )
    return failure('inputs', 'Supply only the five public two-group inputs.')
  for (const [field, [min, max]] of Object.entries(domains))
    if (!numberIn(value[field], min, max))
      return failure(field, `Use a finite number from ${min} to ${max}.`)
  return success({
    group1Weight: value.group1Weight as number,
    group1Probability: value.group1Probability as number,
    group2Probability: value.group2Probability as number,
    gain: value.gain as number,
    loss: value.loss as number,
  })
}
function calculate(inputs: CalibrationInputs): CalibrationOutput {
  const {
    group1Weight: w,
    group1Probability: p1,
    group2Probability: p2,
    gain: P,
    loss: C,
  } = inputs
  const populationProbability = w * p1 + (1 - w) * p2
  const breakEvenProbability = C / (P + C)
  const actionEV = (p: number) =>
    p === breakEvenProbability ? 0 : p * P - (1 - p) * C
  const decide = (q: number): Decision =>
    q === breakEvenProbability
      ? 'indifferent'
      : actionEV(q) > 0
        ? 'continue'
        : 'decline'
  const group = (
    id: GroupEvaluation['id'],
    weight: number,
    p: number,
  ): GroupEvaluation => {
    const trueActionEV = actionEV(p)
    const evaluate = (q: number): ForecastEvaluation => ({
      forecast: q,
      action: decide(q),
      expectedBrierLoss: p * (1 - q) ** 2 + (1 - p) * q ** 2,
      truePolicyContribution:
        weight === 0 || decide(q) !== 'continue' ? 0 : weight * trueActionEV,
    })
    return {
      id,
      weight,
      trueProbability: p,
      modeledFrequency: weight === 0 ? null : p,
      frequencyStatus: weight === 0 ? 'zero-weight' : 'available',
      trueActionEV,
      baseline: evaluate(populationProbability),
      informed: evaluate(p),
    }
  }
  const groups: CalibrationOutput['groups'] = [
    group('group-1', w, p1),
    group('group-2', 1 - w, p2),
  ]
  const baselineBrier = groups.reduce(
    (s, g) => s + g.weight * g.baseline.expectedBrierLoss,
    0,
  )
  const informedBrier = groups.reduce(
    (s, g) => s + g.weight * g.informed.expectedBrierLoss,
    0,
  )
  const baselinePolicyValue = groups.reduce(
    (s, g) => s + g.baseline.truePolicyContribution,
    0,
  )
  const informedPolicyValue = groups.reduce(
    (s, g) => s + g.informed.truePolicyContribution,
    0,
  )
  return {
    inputs: { ...inputs },
    populationProbability,
    breakEvenProbability,
    groups,
    baselineBrier,
    informedBrier,
    baselinePolicyValue,
    informedPolicyValue,
    informationGain: informedPolicyValue - baselinePolicyValue,
    resolutionGain: w * (1 - w) * (p1 - p2) ** 2,
  }
}
export const calibrationModel = validatedModel(decodeInputs, calculate)
export const encodeInputs = (
  inputs: Readonly<CalibrationInputs>,
): JsonValue => ({ ...inputs })
export const encodeResult = (output: CalibrationOutput): JsonValue => ({
  ...output,
  inputs: { ...output.inputs },
  groups: output.groups.map((g) => ({
    ...g,
    baseline: { ...g.baseline },
    informed: { ...g.informed },
  })),
})
function matches(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number')
    return (
      typeof actual === 'number' &&
      Number.isFinite(actual) &&
      Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected))
    )
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((v, i) => matches(actual[i], v))
    )
  if (isRecord(expected))
    return (
      isRecord(actual) &&
      Object.keys(actual).length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([k, v]) => Object.hasOwn(actual, k) && matches(actual[k], v),
      )
    )
  return actual === expected
}
export function decodeResult(value: unknown): ModelResult<CalibrationOutput> {
  if (!isRecord(value) || !isSafeJson(value))
    return failure(
      'result',
      'Only finite, bounded public model results are supported.',
    )
  const decoded = decodeInputs(value.inputs)
  if (!decoded.ok) return decoded
  const expected = calculate(decoded.value)
  return matches(value, expected)
    ? success(expected)
    : failure(
        'result',
        'Result does not match this version’s exact two-group model.',
      )
}

export interface BayesInputs {
  prior: number
  likelihoodStrong: number
  likelihoodWeak: number
}
export const bayesModel = validatedModel(
  (v: unknown): ModelResult<BayesInputs> => {
    if (
      !isRecord(v) ||
      Object.keys(v).length !== 3 ||
      !numberIn(v.prior, 0, 1) ||
      !numberIn(v.likelihoodStrong, 0, 1) ||
      !numberIn(v.likelihoodWeak, 0, 1)
    )
      return failure(
        'inputs',
        'Supply prior and the two likelihoods as finite fractions from 0 to 1.',
      )
    return success({
      prior: v.prior,
      likelihoodStrong: v.likelihoodStrong,
      likelihoodWeak: v.likelihoodWeak,
    })
  },
  (v) => {
    const evidenceProbability =
      v.prior * v.likelihoodStrong + (1 - v.prior) * v.likelihoodWeak
    return {
      evidenceProbability,
      posterior:
        evidenceProbability === 0
          ? null
          : (v.prior * v.likelihoodStrong) / evidenceProbability,
      status: evidenceProbability === 0 ? 'unreachable' : 'available',
    }
  },
)
export interface BetaInputs {
  alpha: number
  beta: number
  successes: number
  failures: number
}
export const betaModel = validatedModel(
  (v: unknown): ModelResult<BetaInputs> => {
    if (
      !isRecord(v) ||
      Object.keys(v).length !== 4 ||
      !numberIn(v.alpha, Number.MIN_VALUE, 1e6) ||
      !numberIn(v.beta, Number.MIN_VALUE, 1e6) ||
      !numberIn(v.successes, 0, 1e6, true) ||
      !numberIn(v.failures, 0, 1e6, true)
    )
      return failure(
        'inputs',
        'Use positive finite prior parameters ≤1,000,000 and integer counts from 0 to 1,000,000.',
      )
    return success({
      alpha: v.alpha,
      beta: v.beta,
      successes: v.successes,
      failures: v.failures,
    })
  },
  (v) => ({
    alpha: v.alpha + v.successes,
    beta: v.beta + v.failures,
    posteriorMean:
      (v.alpha + v.successes) / (v.alpha + v.beta + v.successes + v.failures),
    rawRate:
      v.successes + v.failures === 0
        ? null
        : v.successes / (v.successes + v.failures),
    rawRateStatus:
      v.successes + v.failures === 0 ? 'no-observations' : 'available',
  }),
)
