import type { ModelResult } from '../../core/types'
import {
  failure,
  isRecord,
  numberIn,
  success,
  validatedModel,
} from '../../core/validation'

export interface InformationInputs {
  prior: number
  gain: number
  loss: number
  sensitivity: number
  specificity: number
  fee: number
}
export type Action = 'take' | 'decline' | 'indifferent' | 'unreachable'
export interface SignalBranch {
  signal: 'positive' | 'negative'
  probability: number
  status: 'reachable' | 'unreachable'
  posterior: number | null
  conditionalTakeProfit: number | null
  action: Action
  fixedClaimContribution: number
  optimalContribution: number
  feeContribution: number
  netContribution: number
}
export interface LedgerRow {
  signal: 'positive' | 'negative'
  outcome: 'success' | 'failure'
  probability: number
  action: Action
  actionProfit: number
  fee: number
  netProfit: number
  expectedContribution: number
}
export interface InformationOutput {
  fixedClaimExpectedProfit: number
  actionThreshold: number
  noSignalAction: Action
  withoutSignal: number
  withSignalBeforeFee: number
  evsi: number
  perfectValue: number
  evpi: number
  purchaseFee: number
  purchaseNet: number
  optimalValue: number
  purchaseDecision: 'buy' | 'do-not-buy' | 'indifferent'
  branches: readonly SignalBranch[]
  ledger: readonly LedgerRow[]
}
export const defaultInputs: Readonly<InformationInputs> = {
  prior: 0.3,
  gain: 100,
  loss: 25,
  sensitivity: 0.8,
  specificity: 0.8,
  fee: 0,
}
const fields = [
  'prior',
  'gain',
  'loss',
  'sensitivity',
  'specificity',
  'fee',
] as const
export function decodeInputs(value: unknown): ModelResult<InformationInputs> {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !fields.includes(key as (typeof fields)[number]),
    )
  )
    return failure('inputs', 'Supply only the six public signal-model inputs.')
  const ranges = {
    prior: [0, 1],
    gain: [1, 500],
    loss: [0, 200],
    sensitivity: [0, 1],
    specificity: [0, 1],
    fee: [0, 100],
  } as const
  const errors = fields.flatMap((field) =>
    numberIn(value[field], ranges[field][0], ranges[field][1])
      ? []
      : [
          {
            field,
            code: 'domain',
            message: `${field} must be a finite number from ${ranges[field][0]} to ${ranges[field][1]}.`,
          },
        ],
  )
  if (errors.length) return { ok: false, errors }
  return success(
    Object.fromEntries(
      fields.map((field) => [field, value[field]]),
    ) as unknown as InformationInputs,
  )
}
const actionFor = (profit: number): Action =>
  profit > 0 ? 'take' : profit < 0 ? 'decline' : 'indifferent'
function calculate({
  prior: p,
  gain: G,
  loss: C,
  sensitivity: s,
  specificity: t,
  fee: k,
}: InformationInputs): InformationOutput {
  const joint = [
    [p * s, (1 - p) * (1 - t)],
    [p * (1 - s), (1 - p) * t],
  ] as const
  const branches: SignalBranch[] = joint.map(([win, lose], index) => {
    const probability = win + lose
    const fixedClaimContribution = win * G - lose * C
    const optimalContribution = Math.max(0, fixedClaimContribution)
    return {
      signal: index === 0 ? 'positive' : 'negative',
      probability,
      status: probability === 0 ? 'unreachable' : 'reachable',
      posterior: probability === 0 ? null : win / probability,
      conditionalTakeProfit:
        probability === 0 ? null : fixedClaimContribution / probability,
      action:
        probability === 0 ? 'unreachable' : actionFor(fixedClaimContribution),
      fixedClaimContribution,
      optimalContribution,
      feeContribution: probability * k,
      netContribution: optimalContribution - probability * k,
    }
  })
  const fixedClaimExpectedProfit = p * G - (1 - p) * C
  const withoutSignal = Math.max(0, fixedClaimExpectedProfit)
  const branchValue = branches.reduce(
    (total, branch) => total + branch.optimalContribution,
    0,
  )
  const changesAction =
    branches.some((b) => b.action === 'take') &&
    branches.some((b) => b.action === 'decline')
  // Reusing one action cannot create value through floating-point summation.
  const withSignalBeforeFee = changesAction ? branchValue : withoutSignal
  const evsi = Math.max(0, withSignalBeforeFee - withoutSignal)
  const perfectValue = p * G
  const purchaseNet = withSignalBeforeFee - k
  const ledger: LedgerRow[] = branches.flatMap((branch, index) =>
    joint[index].map((probability, outcome) => {
      const actionProfit =
        branch.action === 'take' ? (outcome === 0 ? G : -C) : 0
      return {
        signal: branch.signal,
        outcome: outcome === 0 ? 'success' : 'failure',
        probability,
        action: branch.action,
        actionProfit,
        fee: k,
        netProfit: actionProfit - k,
        expectedContribution: probability * (actionProfit - k),
      }
    }),
  )
  return {
    fixedClaimExpectedProfit,
    actionThreshold: C / (G + C),
    noSignalAction: actionFor(fixedClaimExpectedProfit),
    withoutSignal,
    withSignalBeforeFee,
    evsi,
    perfectValue,
    evpi: Math.max(0, perfectValue - withoutSignal),
    purchaseFee: k,
    purchaseNet,
    optimalValue: Math.max(withoutSignal, purchaseNet),
    purchaseDecision:
      k < evsi ? 'buy' : k > evsi ? 'do-not-buy' : 'indifferent',
    branches,
    ledger,
  }
}
export const informationModel = validatedModel(decodeInputs, calculate)
export const encodeInputs = (value: Readonly<InformationInputs>) => ({
  prior: value.prior,
  gain: value.gain,
  loss: value.loss,
  sensitivity: value.sensitivity,
  specificity: value.specificity,
  fee: value.fee,
})
export const encodeResult = (value: InformationOutput) => ({
  ...value,
  branches: value.branches.map((branch) => ({ ...branch })),
  ledger: value.ledger.map((row) => ({ ...row })),
})

const actions = ['take', 'decline', 'indifferent', 'unreachable']
const exactKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length &&
  Object.keys(v).every((key) => keys.includes(key))
const finite = (v: unknown) => numberIn(v, -300, 600)
export function decodeResult(value: unknown): ModelResult<InformationOutput> {
  const keys = [
    'fixedClaimExpectedProfit',
    'actionThreshold',
    'noSignalAction',
    'withoutSignal',
    'withSignalBeforeFee',
    'evsi',
    'perfectValue',
    'evpi',
    'purchaseFee',
    'purchaseNet',
    'optimalValue',
    'purchaseDecision',
    'branches',
    'ledger',
  ]
  if (
    !isRecord(value) ||
    !exactKeys(value, keys) ||
    !keys
      .slice(0, 11)
      .filter((key) => key !== 'noSignalAction')
      .every((key) => finite(value[key])) ||
    !numberIn(value.actionThreshold, 0, 1) ||
    !actions.slice(0, 3).includes(String(value.noSignalAction)) ||
    !['buy', 'do-not-buy', 'indifferent'].includes(
      String(value.purchaseDecision),
    ) ||
    !Array.isArray(value.branches) ||
    value.branches.length !== 2 ||
    !Array.isArray(value.ledger) ||
    value.ledger.length !== 4
  )
    return failure('result', 'Invalid finite information-model summary.')
  const branchKeys = [
    'signal',
    'probability',
    'status',
    'posterior',
    'conditionalTakeProfit',
    'action',
    'fixedClaimContribution',
    'optimalContribution',
    'feeContribution',
    'netContribution',
  ]
  for (const [index, b] of value.branches.entries()) {
    if (
      !isRecord(b) ||
      !exactKeys(b, branchKeys) ||
      b.signal !== (index === 0 ? 'positive' : 'negative') ||
      !numberIn(b.probability, 0, 1) ||
      !actions.includes(String(b.action)) ||
      ![
        'fixedClaimContribution',
        'optimalContribution',
        'feeContribution',
        'netContribution',
      ].every((key) => finite(b[key]))
    )
      return failure('branches', 'Invalid branch summary.')
    if (
      b.probability === 0
        ? b.status !== 'unreachable' ||
          b.action !== 'unreachable' ||
          b.posterior !== null ||
          b.conditionalTakeProfit !== null
        : b.status !== 'reachable' ||
          b.action === 'unreachable' ||
          !numberIn(b.posterior, 0, 1) ||
          !finite(b.conditionalTakeProfit)
    )
      return failure(
        'branches',
        'Unreachable conditionals must be null with an explicit status.',
      )
  }
  const ledgerKeys = [
    'signal',
    'outcome',
    'probability',
    'action',
    'actionProfit',
    'fee',
    'netProfit',
    'expectedContribution',
  ]
  for (const [index, row] of value.ledger.entries()) {
    if (
      !isRecord(row) ||
      !exactKeys(row, ledgerKeys) ||
      row.signal !== (index < 2 ? 'positive' : 'negative') ||
      row.outcome !== (index % 2 === 0 ? 'success' : 'failure') ||
      !numberIn(row.probability, 0, 1) ||
      !actions.includes(String(row.action)) ||
      !['actionProfit', 'fee', 'netProfit', 'expectedContribution'].every(
        (key) => finite(row[key]),
      )
    )
      return failure('ledger', 'Invalid finite settlement ledger.')
  }
  const r = value as unknown as InformationOutput
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b))
  if (
    !numberIn(r.purchaseFee, 0, 100) ||
    !numberIn(r.evsi, 0, 500) ||
    !numberIn(r.evpi, 0, 500) ||
    r.evsi > r.evpi + 1e-10 ||
    !close(
      r.branches.reduce((sum, b) => sum + b.probability, 0),
      1,
    ) ||
    !close(r.withoutSignal, Math.max(0, r.fixedClaimExpectedProfit)) ||
    !close(r.evsi, r.withSignalBeforeFee - r.withoutSignal) ||
    !close(r.evpi, r.perfectValue - r.withoutSignal) ||
    !close(r.purchaseNet, r.withSignalBeforeFee - r.purchaseFee) ||
    !close(r.optimalValue, Math.max(r.withoutSignal, r.purchaseNet)) ||
    !close(
      r.ledger.reduce((sum, row) => sum + row.expectedContribution, 0),
      r.purchaseNet,
    ) ||
    !close(
      r.branches.reduce((sum, b) => sum + b.fixedClaimContribution, 0),
      r.fixedClaimExpectedProfit,
    )
  )
    return failure(
      'result',
      'Inconsistent expected-value or probability identities.',
    )
  for (const [index, b] of r.branches.entries()) {
    const rows = r.ledger.slice(index * 2, index * 2 + 2)
    if (
      !close(
        b.probability,
        rows.reduce((sum, row) => sum + row.probability, 0),
      ) ||
      !close(b.optimalContribution, Math.max(0, b.fixedClaimContribution)) ||
      !close(b.feeContribution, b.probability * r.purchaseFee) ||
      !close(b.netContribution, b.optimalContribution - b.feeContribution) ||
      rows.some(
        (row) =>
          row.action !== b.action ||
          !close(row.fee, r.purchaseFee) ||
          !close(row.netProfit, row.actionProfit - row.fee) ||
          !close(row.expectedContribution, row.probability * row.netProfit),
      )
    )
      return failure(
        'ledger',
        'Branch contributions and upfront fee do not reconcile.',
      )
  }
  return success(r)
}
