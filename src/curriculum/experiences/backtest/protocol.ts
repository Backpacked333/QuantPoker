import { GENERATOR_VERSION, parameterHash } from '../../core/seededRandom'
import type {
  ExperimentController,
  JsonObject,
  ModelResult,
  Prediction,
  RunContext,
} from '../../core/types'
import {
  failure,
  isRecord,
  isSafeJson,
  numberIn,
  safeClone,
  success,
} from '../../core/validation'
import { runWorker } from '../../core/workers'
import {
  datasetKey,
  decodeDevelopment,
  decodeHoldout,
  decodeInputs,
  encodeDevelopment,
  evaluationOutput,
  MODEL_VERSION,
  roleHash,
  SELECTION_RULE,
  type BacktestInputs,
  type BacktestOutput,
  type DevelopmentOutput,
} from './model'
import {
  encodeJob,
  type SimulationJob,
  type SimulationOutput,
} from './simulation'

export type ResearchStage =
  | 'draft_protocol'
  | 'preregistered'
  | 'development_complete'
  | 'candidate_frozen'
  | 'evaluation_revealed'
  | 'research_reflection'
export interface ResearchHistory {
  totalSearches: number
  experimentCount: number
  consumedDatasets: string[]
}
export interface ResearchProtocol {
  stage: ResearchStage
  hypothesis: string
  falsification: string
  selectionRule: string
  seed: number
  inputs: BacktestInputs
  modelVersion: string
  generatorVersion: string
  development: DevelopmentOutput | null
  frozenHash: string | null
  revealRequested: boolean
  history: ResearchHistory
}
export const emptyHistory = (): ResearchHistory => ({
  totalSearches: 0,
  experimentCount: 0,
  consumedDatasets: [],
})
export const encodeProtocol = (p: ResearchProtocol): JsonObject => ({
  ...p,
  inputs: { ...p.inputs },
  development: p.development ? encodeDevelopment(p.development) : null,
  history: { ...p.history, consumedDatasets: [...p.history.consumedDatasets] },
})
export function frozenProtocolHash(p: ResearchProtocol): string {
  if (!p.development) throw new RangeError('Develop before freezing.')
  return parameterHash({
    hypothesis: p.hypothesis,
    falsification: p.falsification,
    selectionRule: p.selectionRule,
    seed: p.seed,
    inputs: { ...p.inputs },
    modelVersion: p.modelVersion,
    generatorVersion: p.generatorVersion,
    selectedId: p.development.selectedId,
    datasetRoles: {
      development: p.development.developmentHash,
      holdout: roleHash(p.inputs, p.seed, 'holdout', p.development.selectedId),
    },
  })
}
export function decodeProtocol(v: unknown): ModelResult<ResearchProtocol> {
  if (
    !isRecord(v) ||
    !isSafeJson(v) ||
    Object.keys(v).some(
      (k) =>
        ![
          'stage',
          'hypothesis',
          'falsification',
          'selectionRule',
          'seed',
          'inputs',
          'modelVersion',
          'generatorVersion',
          'development',
          'frozenHash',
          'revealRequested',
          'history',
        ].includes(k),
    ) ||
    ![
      'draft_protocol',
      'preregistered',
      'development_complete',
      'candidate_frozen',
      'evaluation_revealed',
      'research_reflection',
    ].includes(String(v.stage)) ||
    typeof v.hypothesis !== 'string' ||
    v.hypothesis.length > 2000 ||
    typeof v.falsification !== 'string' ||
    v.falsification.length > 2000 ||
    v.selectionRule !== SELECTION_RULE ||
    !numberIn(v.seed, 0, 0xffffffff, true) ||
    v.modelVersion !== MODEL_VERSION ||
    v.generatorVersion !== GENERATOR_VERSION ||
    typeof v.revealRequested !== 'boolean' ||
    !(
      v.frozenHash === null ||
      (typeof v.frozenHash === 'string' && /^[a-f0-9]{8}$/.test(v.frozenHash))
    ) ||
    !isRecord(v.history)
  )
    return failure(
      'protocol',
      'Unsupported or invalid research protocol; historical summaries remain readable.',
    )
  const i = decodeInputs(v.inputs),
    h = v.history
  if (
    !i.ok ||
    Object.keys(h).some(
      (k) =>
        !['totalSearches', 'experimentCount', 'consumedDatasets'].includes(k),
    ) ||
    !numberIn(h.totalSearches, 0, Number.MAX_SAFE_INTEGER, true) ||
    !numberIn(h.experimentCount, 0, Number.MAX_SAFE_INTEGER, true) ||
    !Array.isArray(h.consumedDatasets) ||
    h.consumedDatasets.length > 2000 ||
    h.consumedDatasets.some((k) => typeof k !== 'string' || k.length > 100) ||
    new Set(h.consumedDatasets).size !== h.consumedDatasets.length
  )
    return failure(
      'history',
      'Invalid append-only search/consumed-test ledger.',
    )
  const development =
    v.development === null ? null : decodeDevelopment(v.development)
  if (development && !development.ok) return development
  const p: ResearchProtocol = {
    stage: v.stage as ResearchStage,
    hypothesis: v.hypothesis,
    falsification: v.falsification,
    selectionRule: SELECTION_RULE,
    seed: v.seed,
    inputs: i.value,
    modelVersion: MODEL_VERSION,
    generatorVersion: GENERATOR_VERSION,
    development: development?.ok ? development.value : null,
    frozenHash: typeof v.frozenHash === 'string' ? v.frozenHash : null,
    revealRequested: v.revealRequested,
    history: {
      totalSearches: h.totalSearches,
      experimentCount: h.experimentCount,
      consumedDatasets: h.consumedDatasets as string[],
    },
  }
  const developed = [
    'development_complete',
    'candidate_frozen',
    'evaluation_revealed',
    'research_reflection',
  ].includes(p.stage)
  const frozen = [
    'candidate_frozen',
    'evaluation_revealed',
    'research_reflection',
  ].includes(p.stage)
  if (
    developed !== !!p.development ||
    (developed &&
      (p.history.totalSearches < p.inputs.candidateCount ||
        p.history.experimentCount < 1)) ||
    (p.development &&
      (p.development.seed !== p.seed ||
        parameterHash(p.development.inputs) !== parameterHash(p.inputs))) ||
    (p.stage !== 'draft_protocol' &&
      (!p.hypothesis.trim() || !p.falsification.trim())) ||
    (frozen ? p.frozenHash !== frozenProtocolHash(p) : p.frozenHash !== null) ||
    (!frozen && p.revealRequested) ||
    (['evaluation_revealed', 'research_reflection'].includes(p.stage) &&
      !p.revealRequested) ||
    (p.revealRequested &&
      !p.history.consumedDatasets.includes(
        datasetKey(p.seed, p.development!.selectedId),
      ))
  )
    return failure(
      'protocol',
      'Inconsistent protocol stage or immutable freeze.',
    )
  return success(p)
}
type Controller = ExperimentController<BacktestInputs, BacktestOutput>
export function protocolFor(c: Controller): ResearchProtocol {
  if (Object.keys(c.protocolState).length) {
    const d = decodeProtocol(c.protocolState)
    if (!d.ok) throw new RangeError(d.errors[0].message)
    if (
      d.value.seed !== c.attempt.seed ||
      parameterHash(d.value.inputs) !== parameterHash(c.inputs)
    )
      throw new RangeError('Saved protocol does not match this frozen run.')
    return d.value
  }
  return {
    stage: 'draft_protocol',
    hypothesis: '',
    falsification: '',
    selectionRule: SELECTION_RULE,
    seed: c.attempt.seed!,
    inputs: { ...c.inputs },
    modelVersion: MODEL_VERSION,
    generatorVersion: GENERATOR_VERSION,
    development: null,
    frozenHash: null,
    revealRequested: false,
    history: emptyHistory(),
  }
}
export function preregister(
  c: Controller,
  hypothesis: string,
  falsification: string,
  prediction: Prediction,
) {
  const p = protocolFor(c)
  if (c.phase !== 'draft' || p.stage !== 'draft_protocol')
    throw new RangeError('Start a fresh protocol before preregistration.')
  if (
    !hypothesis.trim() ||
    !falsification.trim() ||
    hypothesis.length > 2000 ||
    falsification.length > 2000
  )
    throw new RangeError(
      'Record a hypothesis and falsification condition, each up to 2,000 characters; prose is ungraded.',
    )
  c.commitPrediction(prediction)
  c.saveProtocolState(
    encodeProtocol({
      ...p,
      stage: 'preregistered',
      hypothesis: hypothesis.trim(),
      falsification: falsification.trim(),
    }),
  )
  saveSearch(c)
}
export function freezeCandidate(c: Controller) {
  const p = protocolFor(c)
  if (p.stage !== 'development_complete' || !p.development)
    throw new RangeError(
      'Complete development before freezing the selected candidate.',
    )
  c.saveProtocolState(
    encodeProtocol({
      ...p,
      stage: 'candidate_frozen',
      frozenHash: frozenProtocolHash(p),
    }),
  )
  saveSearch(c)
}
export function requestHoldout(c: Controller) {
  const p = protocolFor(c)
  if (p.stage !== 'candidate_frozen' || p.revealRequested)
    throw new RangeError(
      'Freeze the candidate before its single primary evaluation.',
    )
  const key = datasetKey(p.seed, p.development!.selectedId)
  if (p.history.consumedDatasets.includes(key))
    throw new RangeError(
      'This held-out dataset was already consumed by an earlier experiment. Start a fresh seeded experiment.',
    )
  if (p.history.consumedDatasets.length >= 2000)
    throw new RangeError(
      'Consumed-test ledger is full. Export your research before an explicit learning reset; no history is silently dropped.',
    )
  c.saveProtocolState(
    encodeProtocol({
      ...p,
      revealRequested: true,
      history: {
        ...p.history,
        consumedDatasets: [...p.history.consumedDatasets, key],
      },
    }),
  )
  saveSearch(c)
}
export function saveResearchReflection(c: Controller, text: string) {
  const p = protocolFor(c)
  if (!['evaluation_revealed', 'research_reflection'].includes(p.stage))
    throw new RangeError('Reflect after the primary evaluation.')
  c.reflect(text)
  c.saveProtocolState(encodeProtocol({ ...p, stage: 'research_reflection' }))
  saveSearch(c)
}
export function linkedExperiment(c: Controller, next: BacktestInputs) {
  const p = protocolFor(c),
    history = safeClone(p.history)
  const valid = decodeInputs(next)
  if (!valid.ok) throw new RangeError(valid.errors[0].message)
  c.requestInputChange(valid.value)
  c.saveProtocolState(
    encodeProtocol({
      stage: 'draft_protocol',
      hypothesis: '',
      falsification: '',
      selectionRule: SELECTION_RULE,
      seed: c.attempt.seed!,
      inputs: { ...valid.value },
      modelVersion: MODEL_VERSION,
      generatorVersion: GENERATOR_VERSION,
      development: null,
      frozenHash: null,
      revealRequested: false,
      history,
    }),
  )
}
function saveSearch(c: Controller) {
  const p = protocolFor(c)
  c.recordSearchSummary({
    hypothesis: p.hypothesis,
    falsification: p.falsification,
    seed: p.seed,
    inputs: { ...p.inputs },
    modelVersion: p.modelVersion,
    generatorVersion: p.generatorVersion,
    researchStage: p.stage,
    selectedCandidate: p.development?.selectedId ?? null,
    primaryHoldoutStatus: p.revealRequested ? 'consumed' : 'untouched',
    datasetRoles: {
      development: p.development?.developmentHash ?? null,
      holdout:
        p.frozenHash && p.development
          ? roleHash(p.inputs, p.seed, 'holdout', p.development.selectedId)
          : null,
    },
    totalSearchCount: p.development?.totalSearchCount ?? 0,
    cumulativeSearchCount: p.history.totalSearches,
    experimentCount: p.history.experimentCount,
    consumedTestCount: p.history.consumedDatasets.length,
    consumedDatasets: [...p.history.consumedDatasets],
    selectionRule: SELECTION_RULE,
    protocolHash: p.frozenHash,
    developmentHash: p.development?.developmentHash ?? null,
    leaderboard: p.development?.leaderboard.map((r) => ({ ...r })) ?? [],
  })
}
export type SimulationExecutor = (
  job: SimulationJob,
  context: RunContext,
) => Promise<ModelResult<SimulationOutput>>
export const executeWorker: SimulationExecutor = (job, context) =>
  runWorker<ReturnType<typeof encodeJob>, SimulationOutput>(
    new Worker(new URL('./simulation.worker.ts', import.meta.url), {
      type: 'module',
    }),
    {
      type: 'start',
      runId: context.runId,
      parameterHash: context.parameterHash,
      generatorVersion: context.generatorVersion,
      seed: context.seed,
      inputs: encodeJob(job),
    },
    context.signal,
    (value) =>
      job.stage === 'development'
        ? decodeDevelopment(value)
        : decodeHoldout(value, job.inputs, context.seed, job.selectedId),
    context.onProgress,
  )
function waitFor(
  c: Controller,
  context: RunContext,
  ready: (p: ResearchProtocol) => boolean,
): Promise<ResearchProtocol> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {}
    const clean = () => {
      unsubscribe()
      context.signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      clean()
      reject(new DOMException('Canceled', 'AbortError'))
    }
    const check = () => {
      if (context.signal.aborted || c.attempt.id !== context.runId)
        return abort()
      try {
        const p = protocolFor(c)
        if (ready(p)) {
          clean()
          resolve(p)
        }
      } catch (error) {
        clean()
        reject(error)
      }
    }
    unsubscribe = c.subscribe(check)
    context.signal.addEventListener('abort', abort, { once: true })
    check()
  })
}
export async function runResearch(
  c: Controller,
  execute: SimulationExecutor = executeWorker,
) {
  const start = protocolFor(c)
  if (
    !['preregistered', 'development_complete', 'candidate_frozen'].includes(
      start.stage,
    ) ||
    c.phase !== 'prediction_committed'
  )
    throw new RangeError(
      'Preregister first, or resume the preserved interrupted protocol.',
    )
  await c.runWith(async (inputs, context) => {
    let p = protocolFor(c)
    if (p.stage === 'preregistered') {
      const d = await execute(
        { stage: 'development', inputs: { ...inputs } },
        context,
      )
      if (context.signal.aborted || c.attempt.id !== context.runId)
        throw new DOMException('Canceled', 'AbortError')
      if (!d.ok) return d
      const valid = decodeDevelopment(d.value)
      if (
        !valid.ok ||
        valid.value.seed !== context.seed ||
        parameterHash(valid.value.inputs) !== parameterHash(inputs)
      )
        return failure(
          'development',
          'Worker output does not match the preregistered seed/inputs.',
        )
      if (
        p.history.totalSearches >
          Number.MAX_SAFE_INTEGER - inputs.candidateCount ||
        p.history.experimentCount === Number.MAX_SAFE_INTEGER
      )
        return failure(
          'history',
          'Research counters are full; export before an explicit reset.',
        )
      p = {
        ...p,
        stage: 'development_complete',
        development: valid.value,
        history: {
          ...p.history,
          totalSearches: p.history.totalSearches + inputs.candidateCount,
          experimentCount: p.history.experimentCount + 1,
        },
      }
      c.saveProtocolState(encodeProtocol(p))
      saveSearch(c)
    }
    p = await waitFor(
      c,
      context,
      (state) => state.stage === 'candidate_frozen' && state.revealRequested,
    )
    const h = await execute(
      {
        stage: 'holdout',
        inputs: { ...inputs },
        selectedId: p.development!.selectedId,
      },
      context,
    )
    if (context.signal.aborted || c.attempt.id !== context.runId)
      throw new DOMException('Canceled', 'AbortError')
    if (!h.ok) return h
    const valid = decodeHoldout(
      h.value,
      inputs,
      context.seed,
      p.development!.selectedId,
    )
    if (!valid.ok) return valid
    c.saveProtocolState(encodeProtocol({ ...p, stage: 'evaluation_revealed' }))
    saveSearch(c)
    return success(evaluationOutput(p.development!, valid.value, p.frozenHash!))
  })
}
