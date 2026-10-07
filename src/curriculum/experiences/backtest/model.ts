import type { ModelResult } from '../../core/types'
import {
  failure,
  isRecord,
  isSafeJson,
  numberIn,
  success,
  validatedModel,
} from '../../core/validation'
import {
  deriveSeed,
  GENERATOR_VERSION,
  parameterHash,
} from '../../core/seededRandom'

export const MODEL_VERSION = 'bkt-1'
export const SELECTION_RULE = 'maximum-development-net-mean;ascending-stable-id'
export interface BacktestInputs {
  candidateCount: number
  developmentTrials: number
  holdoutTrials: number
  cost: number
}
export const defaultInputs: BacktestInputs = {
  candidateCount: 20,
  developmentTrials: 100,
  holdoutTrials: 1000,
  cost: 0,
}
const keys = ['candidateCount', 'developmentTrials', 'holdoutTrials', 'cost']
export function decodeInputs(v: unknown): ModelResult<BacktestInputs> {
  if (
    !isRecord(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    !numberIn(v.candidateCount, 1, 200, true) ||
    !numberIn(v.developmentTrials, 20, 2000, true) ||
    !numberIn(v.holdoutTrials, 100, 5000, true) ||
    !numberIn(v.cost, 0, 0.1)
  )
    return failure(
      'inputs',
      'Use 1–200 candidates, 20–2,000 development trials, 100–5,000 held-out trials and cost 0–0.10 per observation.',
    )
  return success({
    candidateCount: v.candidateCount,
    developmentTrials: v.developmentTrials,
    holdoutTrials: v.holdoutTrials,
    cost: v.cost,
  })
}
export interface Interval {
  low: number
  high: number
}
export const WILSON_Z = 1.959963984540054
export function wilsonInterval(
  wins: number,
  trials: number,
): ModelResult<Interval> {
  if (!numberIn(trials, 1, 1000000, true) || !numberIn(wins, 0, trials, true))
    return failure(
      'wins',
      'Use integer wins from zero to the positive trial count.',
    )
  const p = wins / trials,
    z2 = WILSON_Z ** 2,
    denominator = 1 + z2 / trials
  const center = (p + z2 / (2 * trials)) / denominator
  const radius =
    (WILSON_Z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials ** 2))) /
    denominator
  return success({
    low: wins === 0 ? 0 : Math.max(0, center - radius),
    high: wins === trials ? 1 : Math.min(1, center + radius),
  })
}
export function independentFalsePositive(
  candidateCount: number,
  alpha: number,
): ModelResult<number> {
  if (!numberIn(candidateCount, 1, 200, true) || !numberIn(alpha, 0, 1))
    return failure('tests', 'Use 1–200 independent tests and size 0–1.')
  return success(
    alpha === 1 ? 1 : -Math.expm1(candidateCount * Math.log1p(-alpha)),
  )
}
export interface AnalyticOutput {
  kind: 'analytic'
  expectedGrossMean: number
  expectedNetMean: number
  independentFalsePositive: number
}
export const backtestModel = validatedModel(
  decodeInputs,
  (i): AnalyticOutput => {
    const f = independentFalsePositive(i.candidateCount, 0.05)
    if (!f.ok) throw new RangeError('Invalid independent-test illustration.')
    return {
      kind: 'analytic',
      expectedGrossMean: 0,
      expectedNetMean: -i.cost,
      independentFalsePositive: f.value,
    }
  },
)
export interface CandidateScore {
  candidateId: string
  trials: number
  wins: number
  grossMean: number
  netMean: number
}
export interface DevelopmentOutput {
  kind: 'development'
  seed: number
  inputs: BacktestInputs
  leaderboard: CandidateScore[]
  selectedId: string
  developmentHash: string
  totalSearchCount: number
}
export interface HoldoutOutput {
  kind: 'holdout'
  candidateId: string
  trials: number
  wins: number
  grossMean: number
  netMean: number
  winProportion: number
  probabilityInterval: Interval
  netMeanInterval: Interval
  holdoutHash: string
  datasetKey: string
}
export interface EvaluationOutput {
  kind: 'evaluation'
  development: DevelopmentOutput
  holdout: HoldoutOutput
  protocolHash: string
  modelVersion: string
  generatorVersion: string
  expectedGrossMean: number
  expectedNetMean: number
  independentFalsePositive: number
}
export type BacktestOutput = AnalyticOutput | EvaluationOutput
export const candidateId = (index: number) =>
  `candidate-${String(index + 1).padStart(3, '0')}`
export function score(
  candidate: string,
  wins: number,
  trials: number,
  cost: number,
): CandidateScore {
  if (
    !/^candidate-\d{3}$/.test(candidate) ||
    !numberIn(trials, 1, 5000, true) ||
    !numberIn(wins, 0, trials, true) ||
    !numberIn(cost, 0, 0.1)
  )
    throw new RangeError('Invalid finite candidate score.')
  const grossMean = (2 * wins) / trials - 1
  return {
    candidateId: candidate,
    trials,
    wins,
    grossMean,
    netMean: grossMean - cost,
  }
}
export function selectCandidate(scores: readonly CandidateScore[]): string {
  if (!scores.length) throw new RangeError('No candidates to select.')
  if (
    scores.length > 200 ||
    new Set(scores.map((s) => s.candidateId)).size !== scores.length ||
    scores.some(
      (s) =>
        !/^candidate-\d{3}$/.test(s.candidateId) ||
        !numberIn(s.trials, 1, 5000, true) ||
        !numberIn(s.wins, 0, s.trials, true) ||
        !numberIn(s.grossMean, -1, 1) ||
        !numberIn(s.netMean, -1.1, 1) ||
        s.grossMean !== (2 * s.wins) / s.trials - 1 ||
        s.netMean > s.grossMean ||
        s.grossMean - s.netMean > 0.1 + Number.EPSILON,
    )
  )
    throw new RangeError(
      'Invalid finite candidate scores or duplicate stable IDs.',
    )
  return [...scores].sort(
    (a, b) =>
      b.netMean - a.netMean || a.candidateId.localeCompare(b.candidateId),
  )[0].candidateId
}
export function datasetKey(seed: number, selectedId: string): string {
  return `${GENERATOR_VERSION}:${MODEL_VERSION}:${seed}:holdout:${selectedId}`
}
export function roleHash(
  inputs: BacktestInputs,
  seed: number,
  purpose: 'development' | 'holdout',
  selectedId?: string,
): string {
  const ids =
    purpose === 'development'
      ? Array.from({ length: inputs.candidateCount }, (_, k) => candidateId(k))
      : [selectedId!]
  return parameterHash({
    modelVersion: MODEL_VERSION,
    generatorVersion: GENERATOR_VERSION,
    purpose,
    seed,
    trials:
      purpose === 'development'
        ? inputs.developmentTrials
        : inputs.holdoutTrials,
    streams: ids.map((id) => ({
      candidateId: id,
      streamSeed: deriveSeed(seed, purpose, id),
    })),
  })
}
export function encodeDevelopment(d: DevelopmentOutput) {
  return {
    ...d,
    inputs: { ...d.inputs },
    leaderboard: d.leaderboard.map((r) => ({ ...r })),
  }
}
export function encodeHoldout(h: HoldoutOutput) {
  return {
    ...h,
    probabilityInterval: { ...h.probabilityInterval },
    netMeanInterval: { ...h.netMeanInterval },
  }
}
export function encodeResult(o: BacktestOutput) {
  return o.kind === 'analytic'
    ? { ...o }
    : {
        ...o,
        development: encodeDevelopment(o.development),
        holdout: encodeHoldout(o.holdout),
      }
}
function equal(a: unknown, b: unknown): boolean {
  if (!isSafeJson(a) || !isSafeJson(b)) return false
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, k) => equal(v, b[k]))
    )
  if (isRecord(a) || isRecord(b))
    return (
      isRecord(a) &&
      isRecord(b) &&
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
    )
  return a === b
}
export function decodeDevelopment(v: unknown): ModelResult<DevelopmentOutput> {
  if (
    !isRecord(v) ||
    !isSafeJson(v) ||
    v.kind !== 'development' ||
    !numberIn(v.seed, 0, 0xffffffff, true)
  )
    return failure('development', 'Invalid development summary.')
  const i = decodeInputs(v.inputs)
  if (
    !i.ok ||
    !Array.isArray(v.leaderboard) ||
    v.leaderboard.length !== i.value.candidateCount
  )
    return failure('leaderboard', 'Every candidate score must be retained.')
  const rows: CandidateScore[] = []
  for (let k = 0; k < v.leaderboard.length; k++) {
    const r = v.leaderboard[k]
    if (
      !isRecord(r) ||
      r.candidateId !== candidateId(k) ||
      r.trials !== i.value.developmentTrials ||
      !numberIn(r.wins, 0, i.value.developmentTrials, true)
    )
      return failure('leaderboard', 'Invalid stable candidate/trial count.')
    const s = score(
      candidateId(k),
      r.wins,
      i.value.developmentTrials,
      i.value.cost,
    )
    if (!equal(r, s)) return failure('leaderboard', 'Invalid gross/net ledger.')
    rows.push(s)
  }
  const d: DevelopmentOutput = {
    kind: 'development',
    seed: v.seed,
    inputs: i.value,
    leaderboard: rows,
    selectedId: selectCandidate(rows),
    developmentHash: roleHash(i.value, v.seed, 'development'),
    totalSearchCount: rows.length,
  }
  return equal(v, encodeDevelopment(d))
    ? success(d)
    : failure(
        'development',
        'Selection, role hash or search count is inconsistent.',
      )
}
export function makeHoldout(
  i: BacktestInputs,
  seed: number,
  selectedId: string,
  wins: number,
): HoldoutOutput {
  const s = score(selectedId, wins, i.holdoutTrials, i.cost),
    interval = wilsonInterval(wins, i.holdoutTrials)
  if (!interval.ok) throw new RangeError('Invalid held-out count.')
  return {
    kind: 'holdout',
    ...s,
    winProportion: wins / i.holdoutTrials,
    probabilityInterval: interval.value,
    netMeanInterval: {
      low: 2 * interval.value.low - 1 - i.cost,
      high: 2 * interval.value.high - 1 - i.cost,
    },
    holdoutHash: roleHash(i, seed, 'holdout', selectedId),
    datasetKey: datasetKey(seed, selectedId),
  }
}
export function decodeHoldout(
  v: unknown,
  i: BacktestInputs,
  seed: number,
  selectedId: string,
): ModelResult<HoldoutOutput> {
  if (!isRecord(v) || !numberIn(v.wins, 0, i.holdoutTrials, true))
    return failure('holdout', 'Invalid held-out summary.')
  const h = makeHoldout(i, seed, selectedId, v.wins)
  return equal(v, encodeHoldout(h))
    ? success(h)
    : failure('holdout', 'Invalid interval, cost or dataset identity.')
}
export function evaluationOutput(
  d: DevelopmentOutput,
  h: HoldoutOutput,
  protocolHash: string,
): EvaluationOutput {
  const a = backtestModel(d.inputs)
  if (!a.ok) throw new RangeError('Invalid analytic inputs.')
  return {
    ...a.value,
    kind: 'evaluation',
    development: d,
    holdout: h,
    protocolHash,
    modelVersion: MODEL_VERSION,
    generatorVersion: GENERATOR_VERSION,
  }
}
export function decodeResult(v: unknown): ModelResult<BacktestOutput> {
  if (!isRecord(v) || !isSafeJson(v))
    return failure('result', 'Only finite public summaries are accepted.')
  if (
    v.kind === 'analytic' &&
    v.expectedGrossMean === 0 &&
    numberIn(v.expectedNetMean, -0.1, 0) &&
    numberIn(v.independentFalsePositive, 0, 1) &&
    Object.keys(v).length === 4
  )
    return success(v as unknown as AnalyticOutput)
  const d = decodeDevelopment(v.development)
  if (
    !d.ok ||
    typeof v.protocolHash !== 'string' ||
    !/^[a-f0-9]{8}$/.test(v.protocolHash)
  )
    return failure('result', 'Invalid development or frozen protocol hash.')
  const h = decodeHoldout(
    v.holdout,
    d.value.inputs,
    d.value.seed,
    d.value.selectedId,
  )
  if (!h.ok) return h
  const o = evaluationOutput(d.value, h.value, v.protocolHash)
  return equal(v, encodeResult(o))
    ? success(o)
    : failure('result', 'Unsupported model/generator or inconsistent result.')
}
