import type { ModelResult } from '../../core/types'
import {
  failure,
  isRecord,
  isSafeJson,
  numberIn,
  success,
  validatedModel,
} from '../../core/validation'

export interface SolvencyInputs {
  n: number
  p: number
  severity: number
  premium: number
  capital: number
  rho: number
}
export interface SettlementState {
  claimCount: number
  probability: number
  logProbability: number | null
  promisedClaims: number
  actualPayments: number
  unpaidClaims: number
  remainingFunds: number
  shareholderNetResult: number
  isDefault: boolean
}
export interface SolvencyOutput {
  funds: number
  premiumInflow: number
  initialCapital: number
  totalExposure: number
  expectedPromisedClaims: number
  promisedUnderwritingMargin: number
  defaultProbability: number
  logDefaultProbability: number | null
  defaultProbabilityStatus: 'exact-zero' | 'represented' | 'below-number-range'
  expectedShortfall: number
  shortfallStatus: 'exact-zero' | 'represented' | 'below-number-range'
  conditionalShortfall: number | null
  expectedActualPayments: number
  expectedRemainingFunds: number
  expectedShareholderNetResult: number
  capitalAtRisk: number
  claimCountVariance: number
  singleClaimSD: number
  totalClaimsSD: number
  averageClaimsSD: number
  pairwiseCorrelation: number | null
  firstDefaultCount: number | null
  states: SettlementState[]
}
export const defaultInputs: Readonly<SolvencyInputs> = Object.freeze({
  n: 100,
  p: 0.1,
  severity: 100,
  premium: 12,
  capital: 500,
  rho: 0,
})
export const inputRanges = {
  n: [1, 500],
  p: [0, 1],
  severity: [1, 1000],
  premium: [0, 200],
  capital: [0, 100000],
  rho: [0, 1],
} as const
export function decodeInputs(value: unknown): ModelResult<SolvencyInputs> {
  if (
    !isRecord(value) ||
    Object.keys(value).some((k) => !Object.keys(inputRanges).includes(k))
  )
    return failure('inputs', 'Use only the six public policy-book inputs.')
  for (const key of Object.keys(inputRanges) as (keyof SolvencyInputs)[]) {
    const [min, max] = inputRanges[key]
    if (!numberIn(value[key], min, max, key === 'n'))
      return failure(
        key,
        `Use ${key === 'n' ? 'an integer' : 'a finite value'} from ${min} to ${max}.`,
      )
  }
  return success({
    n: value.n as number,
    p: value.p as number,
    severity: value.severity as number,
    premium: value.premium as number,
    capital: value.capital as number,
    rho: value.rho as number,
  })
}
function sum(values: readonly number[]): number {
  let total = 0,
    correction = 0
  for (const value of values) {
    const next = value - correction,
      updated = total + next
    correction = updated - total - next
    total = updated
  }
  return total
}
function logSum(logs: readonly number[]): number | null {
  if (!logs.length) return null
  const max = Math.max(...logs)
  return max + Math.log(sum(logs.map((x) => Math.exp(x - max))))
}
function binomialLogs(n: number, p: number): (number | null)[] {
  if (p === 0 || p === 1)
    return Array.from({ length: n + 1 }, (_, k) =>
      k === (p === 0 ? 0 : n) ? 0 : null,
    )
  const mode = Math.floor((n + 1) * p),
    logs = Array<number>(n + 1).fill(0)
  const ratio = Math.log(p) - Math.log1p(-p)
  for (let k = mode; k < n; k++)
    logs[k + 1] = logs[k] + Math.log(n - k) - Math.log(k + 1) + ratio
  for (let k = mode; k > 0; k--)
    logs[k - 1] = logs[k] + Math.log(k) - Math.log(n - k + 1) - ratio
  const normalization = logSum(logs)!
  return logs.map((x) => x - normalization)
}
export const solvencyModel = validatedModel(
  decodeInputs,
  ({ n, p, severity, premium, capital, rho }): SolvencyOutput => {
    const funds = n * premium + capital
    const independent = binomialLogs(n, p)
    const states = independent.map((log, claimCount): SettlementState => {
      const terms: number[] = []
      if (rho < 1 && log !== null) terms.push(Math.log1p(-rho) + log)
      if (rho > 0 && claimCount === 0 && p < 1)
        terms.push(Math.log(rho) + Math.log1p(-p))
      if (rho > 0 && claimCount === n && p > 0)
        terms.push(Math.log(rho) + Math.log(p))
      const logProbability = logSum(terms)
      const promisedClaims = severity * claimCount
      const remainingFunds = Math.max(funds - promisedClaims, 0)
      return {
        claimCount,
        probability: logProbability === null ? 0 : Math.exp(logProbability),
        logProbability,
        promisedClaims,
        actualPayments: Math.min(promisedClaims, funds),
        unpaidClaims: Math.max(promisedClaims - funds, 0),
        remainingFunds,
        shareholderNetResult: remainingFunds - capital,
        isDefault: promisedClaims > funds,
      }
    })
    const defaults = states.filter(
      (s) => s.isDefault && s.logProbability !== null,
    )
    const logDefaultProbability = logSum(defaults.map((s) => s.logProbability!))
    const logShortfall = logSum(
      defaults.map((s) => s.logProbability! + Math.log(s.unpaidClaims)),
    )
    const defaultProbability =
      logDefaultProbability === null ? 0 : Math.exp(logDefaultProbability)
    const expectedShortfall = logShortfall === null ? 0 : Math.exp(logShortfall)
    const expectedPromisedClaims = n * p * severity
    const claimCountVariance = n * p * (1 - p) * (1 + (n - 1) * rho)
    return {
      funds,
      premiumInflow: n * premium,
      initialCapital: capital,
      totalExposure: n * severity,
      expectedPromisedClaims,
      promisedUnderwritingMargin: n * premium - expectedPromisedClaims,
      defaultProbability,
      logDefaultProbability,
      defaultProbabilityStatus:
        logDefaultProbability === null
          ? 'exact-zero'
          : defaultProbability === 0
            ? 'below-number-range'
            : 'represented',
      expectedShortfall,
      shortfallStatus:
        logShortfall === null
          ? 'exact-zero'
          : expectedShortfall === 0
            ? 'below-number-range'
            : 'represented',
      conditionalShortfall:
        logDefaultProbability === null
          ? null
          : Math.exp(logShortfall! - logDefaultProbability),
      expectedActualPayments: sum(
        states.map((s) => s.probability * s.actualPayments),
      ),
      expectedRemainingFunds: sum(
        states.map((s) => s.probability * s.remainingFunds),
      ),
      expectedShareholderNetResult: sum(
        states.map((s) => s.probability * s.shareholderNetResult),
      ),
      capitalAtRisk: capital,
      claimCountVariance,
      singleClaimSD: severity * Math.sqrt(p * (1 - p)),
      totalClaimsSD: severity * Math.sqrt(claimCountVariance),
      averageClaimsSD: (severity * Math.sqrt(claimCountVariance)) / n,
      pairwiseCorrelation: n > 1 && p > 0 && p < 1 ? rho : null,
      firstDefaultCount: states.find((s) => s.isDefault)?.claimCount ?? null,
      states,
    }
  },
)
const numericKeys = [
  'funds',
  'premiumInflow',
  'initialCapital',
  'totalExposure',
  'expectedPromisedClaims',
  'promisedUnderwritingMargin',
  'defaultProbability',
  'expectedShortfall',
  'expectedActualPayments',
  'expectedRemainingFunds',
  'expectedShareholderNetResult',
  'capitalAtRisk',
  'claimCountVariance',
  'singleClaimSD',
  'totalClaimsSD',
  'averageClaimsSD',
] as const
const nullableKeys = [
  'logDefaultProbability',
  'conditionalShortfall',
  'pairwiseCorrelation',
  'firstDefaultCount',
] as const
const stateKeys = [
  'claimCount',
  'probability',
  'logProbability',
  'promisedClaims',
  'actualPayments',
  'unpaidClaims',
  'remainingFunds',
  'shareholderNetResult',
  'isDefault',
]
export function decodeResult(value: unknown): ModelResult<SolvencyOutput> {
  if (
    !isRecord(value) ||
    !isSafeJson(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          ...numericKeys,
          ...nullableKeys,
          'defaultProbabilityStatus',
          'shortfallStatus',
          'states',
        ].includes(k),
    ) ||
    numericKeys.some(
      (k) => typeof value[k] !== 'number' || !Number.isFinite(value[k]),
    ) ||
    nullableKeys.some(
      (k) =>
        value[k] !== null &&
        (typeof value[k] !== 'number' || !Number.isFinite(value[k])),
    )
  )
    return failure('result', 'Invalid finite solvency summary.')
  if (
    !numberIn(value.defaultProbability, 0, 1 + 1e-12) ||
    !['exact-zero', 'represented', 'below-number-range'].includes(
      String(value.defaultProbabilityStatus),
    ) ||
    !['exact-zero', 'represented', 'below-number-range'].includes(
      String(value.shortfallStatus),
    ) ||
    !Array.isArray(value.states) ||
    value.states.length < 2 ||
    value.states.length > 501
  )
    return failure('result', 'Invalid distribution or unavailable-state label.')
  for (let k = 0; k < value.states.length; k++) {
    const row = value.states[k]
    if (
      !isRecord(row) ||
      Object.keys(row).length !== stateKeys.length ||
      Object.keys(row).some((key) => !stateKeys.includes(key)) ||
      row.claimCount !== k ||
      !numberIn(row.probability, 0, 1 + 1e-12) ||
      !(
        row.logProbability === null ||
        numberIn(row.logProbability, -1000000, 1e-12)
      ) ||
      typeof row.isDefault !== 'boolean' ||
      stateKeys
        .filter((key) => !['logProbability', 'isDefault'].includes(key))
        .some(
          (key) => typeof row[key] !== 'number' || !Number.isFinite(row[key]),
        )
    )
      return failure('states', 'Invalid finite settlement state.')
  }
  if (
    Math.abs(
      sum(
        value.states.map((row) => (row as Record<string, number>).probability),
      ) - 1,
    ) > 1e-10
  )
    return failure('states', 'Probability mass must sum to one.')
  const output = value as unknown as SolvencyOutput
  if (
    numericKeys.some(
      (key) =>
        ![
          'promisedUnderwritingMargin',
          'expectedShareholderNetResult',
        ].includes(key) && output[key] < 0,
    ) ||
    (output.pairwiseCorrelation !== null &&
      !numberIn(output.pairwiseCorrelation, 0, 1)) ||
    (output.conditionalShortfall !== null &&
      output.conditionalShortfall <= 0) ||
    (output.logDefaultProbability !== null &&
      output.logDefaultProbability > 1e-12) ||
    (output.firstDefaultCount !== null &&
      !numberIn(output.firstDefaultCount, 1, output.states.length - 1, true))
  )
    return failure('result', 'Invalid risk metric domain.')
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
  if (
    !close(output.funds, output.premiumInflow + output.initialCapital) ||
    !close(output.capitalAtRisk, output.initialCapital) ||
    !close(
      output.promisedUnderwritingMargin,
      output.premiumInflow - output.expectedPromisedClaims,
    ) ||
    !close(
      output.expectedPromisedClaims,
      output.expectedActualPayments + output.expectedShortfall,
    ) ||
    !close(
      output.expectedShareholderNetResult,
      output.expectedRemainingFunds - output.initialCapital,
    ) ||
    output.states.some(
      (state) =>
        state.promisedClaims < 0 ||
        state.actualPayments < 0 ||
        state.unpaidClaims < 0 ||
        state.remainingFunds < 0 ||
        !close(
          state.promisedClaims,
          state.actualPayments + state.unpaidClaims,
        ) ||
        !close(
          state.actualPayments,
          Math.min(state.promisedClaims, output.funds),
        ) ||
        !close(
          state.remainingFunds,
          Math.max(output.funds - state.promisedClaims, 0),
        ) ||
        !close(
          state.shareholderNetResult,
          state.remainingFunds - output.initialCapital,
        ) ||
        state.isDefault !== state.promisedClaims > output.funds ||
        (state.logProbability === null && state.probability !== 0),
    )
  )
    return failure('result', 'Settlement does not conserve the funded promise.')
  const impossible = output.logDefaultProbability === null
  if (
    impossible !== (output.conditionalShortfall === null) ||
    output.defaultProbabilityStatus !==
      (impossible
        ? 'exact-zero'
        : output.defaultProbability === 0
          ? 'below-number-range'
          : 'represented') ||
    output.shortfallStatus !==
      (impossible
        ? 'exact-zero'
        : output.expectedShortfall === 0
          ? 'below-number-range'
          : 'represented') ||
    (impossible &&
      (output.defaultProbability !== 0 || output.expectedShortfall !== 0))
  )
    return failure('result', 'Undefined or underflow status is inconsistent.')
  return success(output)
}
