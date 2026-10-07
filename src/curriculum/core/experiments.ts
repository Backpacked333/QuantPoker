import { useEffect, useSyncExternalStore } from 'react'
import { deviceClock, evaluateCase } from './assessment'
import {
  freshSeed,
  GENERATOR_VERSION,
  parameterHash,
  uint32,
} from './seededRandom'
import { LearningSession } from './session'
import type {
  Answer,
  AttemptSnapshot,
  CaseRecord,
  Clock,
  ExperimentController,
  ExperienceManifest,
  JsonObject,
  ModelResult,
  Prediction,
  RunExecutor,
  UnitId,
} from './types'
import { decodePrediction, immutable, safeClone } from './validation'

export interface ControllerOptions<I, O> {
  manifest: ExperienceManifest<I, O>
  session: LearningSession
  mode?: 'explore' | 'assess'
  assessmentMode?: 'practice' | 'transfer' | 'review'
  unitId?: UnitId
  caseId: string
  contentVersion?: number
  rubricVersion?: number
  seed?: number
  clock?: Clock
  key?: string
}
export class RunController<I, O> implements ExperimentController<I, O> {
  readonly mode: 'explore' | 'assess'
  private current: AttemptSnapshot
  private input: Readonly<I>
  private output: ModelResult<O> | null = null
  private protocol: JsonObject = {}
  private abort: AbortController | null = null
  private listeners = new Set<() => void>()
  private revision = 0
  private message = ''
  private fraction: number | null = null
  private readonly clock: Clock
  readonly key: string
  constructor(private readonly options: ControllerOptions<I, O>) {
    this.mode = options.mode ?? 'explore'
    this.clock = options.clock ?? options.session.clock ?? deviceClock
    this.key =
      options.key ??
      `${options.manifest.id}:${this.mode}:${options.assessmentMode ?? 'practice'}:${options.unitId ?? 'none'}:${options.caseId}`
    const draft = options.session.store.drafts[this.key]
    const unsupported =
      draft &&
      (draft.attempt.modelVersion !== options.manifest.version ||
        draft.attempt.inputVersion !== options.manifest.inputVersion ||
        draft.attempt.generatorVersion !== GENERATOR_VERSION)
    let decoded = options.manifest.decodeInputs(
      draft?.attempt.inputs ?? options.manifest.defaultInputs,
    )
    if (!decoded.ok && unsupported)
      decoded = options.manifest.decodeInputs(options.manifest.defaultInputs)
    if (!decoded.ok)
      throw new RangeError(decoded.errors.map((e) => e.message).join(' '))
    this.input = immutable(decoded.value)
    this.current = draft ? safeClone(draft.attempt) : this.makeDraft(this.input)
    this.protocol = draft ? safeClone(draft.protocol) : {}
    if (this.current.phase === 'running') {
      this.current.phase = 'prediction_committed'
      this.message =
        'Interrupted run. Committed inputs preserved; retry when ready.'
    }
    if (
      this.current.modelVersion !== options.manifest.version ||
      this.current.inputVersion !== options.manifest.inputVersion ||
      this.current.generatorVersion !== GENERATOR_VERSION
    )
      this.message =
        'Historical model/generator is unsupported; summary is available but this run cannot be replayed.'
    else if (this.current.resultSummary !== undefined)
      this.output = options.manifest.decodeResult(this.current.resultSummary)
  }
  private makeDraft(
    inputs: Readonly<I>,
    parentAttemptId?: string,
  ): AttemptSnapshot {
    const {
      manifest,
      unitId,
      caseId,
      contentVersion = 1,
      rubricVersion = 1,
    } = this.options
    return {
      id: crypto.randomUUID(),
      ...(unitId ? { unitId } : {}),
      experienceId: manifest.id,
      caseId,
      contentVersion,
      rubricVersion,
      modelVersion: manifest.version,
      inputVersion: manifest.inputVersion,
      generatorVersion: GENERATOR_VERSION,
      seed: uint32(this.options.seed ?? freshSeed()),
      mode:
        this.mode === 'assess'
          ? (this.options.assessmentMode ?? 'practice')
          : 'explore',
      createdAt: this.clock().toISOString(),
      inputs: safeClone(manifest.encodeInputs(inputs)),
      answers: {},
      assistance: { hintIds: [], solutionViewed: false },
      phase: 'draft',
      ...(parentAttemptId ? { parentAttemptId } : {}),
    }
  }
  get phase() {
    return this.current.phase
  }
  get inputs() {
    return this.input
  }
  get result() {
    return this.output
  }
  get attempt() {
    return immutable(this.current)
  }
  get protocolState() {
    return immutable(this.protocol)
  }
  get status() {
    return this.message
  }
  get progress() {
    return this.fraction
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getRevision = () => this.revision
  private notify() {
    this.revision++
    this.listeners.forEach((l) => l())
  }
  private persist() {
    this.syncAssistance()
    this.options.session.recordAttempt(this.current)
    this.options.session.update((store) => ({
      ...store,
      drafts: {
        ...store.drafts,
        [this.key]: {
          attempt: safeClone(this.current),
          protocol: safeClone(this.protocol),
        },
      },
    }))
    this.notify()
  }
  private syncAssistance() {
    const saved = this.options.session.store.attempts.find(
      (a) => a.id === this.current.id,
    )
    if (saved)
      this.current.assistance = {
        hintIds: [
          ...new Set([
            ...saved.assistance.hintIds,
            ...this.current.assistance.hintIds,
          ]),
        ],
        solutionViewed:
          saved.assistance.solutionViewed ||
          this.current.assistance.solutionViewed,
      }
  }
  submitAssessment(caseRecord: CaseRecord, answers: Record<string, Answer>) {
    if (
      this.mode !== 'assess' ||
      !['results_ready', 'reflected'].includes(this.phase)
    )
      throw new RangeError(
        'Complete an assessment run before submitting structured answers.',
      )
    if (
      caseRecord.id !== this.current.caseId ||
      caseRecord.unitId !== this.current.unitId ||
      caseRecord.contentVersion !== this.current.contentVersion ||
      caseRecord.rubricVersion !== this.current.rubricVersion
    )
      throw new RangeError(
        'Case identity/version does not match the committed run.',
      )
    this.syncAssistance()
    const candidate = { ...this.current, answers: safeClone(answers) },
      store = this.options.session.store
    const evaluation = evaluateCase(
      caseRecord,
      candidate,
      store.attempts,
      store.receipts,
      store.reviewSchedule[caseRecord.unitId],
      this.clock,
      store.exposedVariants,
    )
    this.current = {
      ...candidate,
      evaluation,
      submittedAt: this.clock().toISOString(),
      phase: 'archived',
    }
    this.options.session.recordAttempt(this.current)
    this.options.session.update((s) => {
      const drafts = { ...s.drafts }
      delete drafts[this.key]
      return { ...s, drafts }
    })
    this.notify()
    return evaluation
  }
  requestInputChange(next: I) {
    this.syncAssistance()
    const decoded = this.options.manifest.decodeInputs(next)
    if (!decoded.ok) {
      this.message = decoded.errors.map((e) => e.message).join(' ')
      this.notify()
      return
    }
    this.cancel()
    if (this.current.phase !== 'draft') {
      const prior = this.current.id
      this.current.phase = 'archived'
      this.options.session.recordAttempt(this.current)
      this.current = this.makeDraft(decoded.value, prior)
      this.protocol = {}
    }
    this.input = immutable(decoded.value)
    this.current.inputs = safeClone(
      this.options.manifest.encodeInputs(this.input),
    )
    this.output = null
    this.message = ''
    this.persist()
  }
  commitPrediction(prediction: Prediction) {
    if (this.phase !== 'draft')
      throw new RangeError(
        'Prediction is already committed; change inputs to start a linked draft.',
      )
    const decoded = decodePrediction(prediction)
    if (!decoded.ok) throw new RangeError(decoded.errors[0].message)
    this.current.prediction = safeClone(decoded.value)
    this.current.committedAt = this.clock().toISOString()
    this.current.phase = 'prediction_committed'
    this.current.parameterHash = parameterHash({
      inputs: this.current.inputs,
      modelVersion: this.current.modelVersion,
      inputVersion: this.current.inputVersion ?? 1,
      seed: this.current.seed,
      generatorVersion: GENERATOR_VERSION,
    })
    this.persist()
  }
  run() {
    return this.runWith((inputs) => this.options.manifest.model(inputs))
  }
  async runWith(executor: RunExecutor<I, O>): Promise<void> {
    if (
      this.current.modelVersion !== this.options.manifest.version ||
      this.current.inputVersion !== this.options.manifest.inputVersion ||
      this.current.generatorVersion !== GENERATOR_VERSION
    )
      throw new RangeError(
        'Unsupported historical version; create a new experiment.',
      )
    if (this.mode === 'assess' && this.phase !== 'prediction_committed')
      throw new RangeError(
        'Commit a prediction before the assessed reveal/run.',
      )
    if (
      this.mode === 'explore' &&
      !['draft', 'prediction_committed'].includes(this.phase)
    )
      throw new RangeError('Start a new draft before rerunning.')
    if (!this.current.parameterHash)
      this.current.parameterHash = parameterHash({
        inputs: this.current.inputs,
        modelVersion: this.current.modelVersion,
        inputVersion: this.current.inputVersion ?? 1,
        seed: this.current.seed,
        generatorVersion: GENERATOR_VERSION,
      })
    const runId = this.current.id,
      hash = this.current.parameterHash
    this.abort = new AbortController()
    const token = this.abort
    this.current.phase = 'running'
    this.message = ''
    this.fraction = 0
    this.persist()
    try {
      const result = await executor(this.input, {
        runId,
        parameterHash: hash,
        generatorVersion: GENERATOR_VERSION,
        seed: this.current.seed!,
        signal: token.signal,
        onProgress: (completed, total) => {
          if (
            !token.signal.aborted &&
            this.current.id === runId &&
            Number.isFinite(completed) &&
            Number.isFinite(total) &&
            total > 0
          ) {
            this.fraction = Math.min(1, Math.max(0, completed / total))
            this.notify()
          }
        },
      })
      if (
        token.signal.aborted ||
        this.current.id !== runId ||
        this.current.parameterHash !== hash
      )
        return
      if (result.ok) {
        const encoded = safeClone(
          this.options.manifest.encodeResult(result.value),
        )
        const decoded = this.options.manifest.decodeResult(encoded)
        if (!decoded.ok)
          throw new RangeError('Result failed its declared decoder.')
        this.output = { ...decoded, warnings: result.warnings }
        this.current.resultSummary = encoded
        this.current.phase = 'results_ready'
        this.message =
          'Run complete. Modeled result is separate from assessment evidence.'
      } else {
        this.output = result
        this.current.phase = 'prediction_committed'
        this.message = result.errors.map((e) => e.message).join(' ')
      }
      this.fraction = null
      this.abort = null
      this.persist()
    } catch (error) {
      if (token.signal.aborted || this.current.id !== runId) return
      this.current.phase = 'prediction_committed'
      this.abort = null
      this.fraction = null
      this.message =
        error instanceof Error
          ? error.message.slice(0, 2000)
          : 'Run failed; committed inputs retained.'
      this.persist()
    }
  }
  cancel() {
    if (!this.abort) return
    this.abort.abort()
    this.abort = null
    this.fraction = null
    if (this.current.phase === 'running') {
      this.current.phase = 'prediction_committed'
      this.message =
        'Canceled. Prediction and committed inputs are preserved; retry when ready.'
      this.persist()
    }
  }
  reflect(text: string) {
    if (this.phase !== 'results_ready' && this.phase !== 'reflected')
      throw new RangeError('Reflect after results.')
    this.current.reflection = text.slice(0, 2000)
    this.current.phase = 'reflected'
    this.persist()
  }
  archive() {
    this.syncAssistance()
    if (!['results_ready', 'reflected'].includes(this.phase))
      throw new RangeError('Archive a completed run, not an active draft.')
    this.current.phase = 'archived'
    this.options.session.recordAttempt(this.current)
    this.options.session.update((store) => {
      delete store.drafts[this.key]
      return store
    })
    this.notify()
  }
  resetControls() {
    this.requestInputChange(this.options.manifest.defaultInputs as I)
  }
  saveProtocolState(next: JsonObject) {
    this.protocol = safeClone(next)
    this.persist()
  }
  recordSearchSummary(summary: JsonObject) {
    this.current.searchSummary = safeClone(summary)
    this.persist()
  }
}
export function createExperimentController<I, O>(
  options: ControllerOptions<I, O>,
): RunController<I, O> {
  const key =
    options.key ??
    `${options.manifest.id}:${options.mode ?? 'explore'}:${options.assessmentMode ?? 'practice'}:${options.unitId ?? 'none'}:${options.caseId}`
  const existing = options.session.runtimes.get(key)
  if (existing) return existing as RunController<I, O>
  const controller = new RunController(options)
  options.session.runtimes.set(key, controller)
  return controller
}
export function useExperimentController<I, O>(
  options: ControllerOptions<I, O>,
): RunController<I, O> {
  const controller = createExperimentController(options)
  useSyncExternalStore(controller.subscribe, controller.getRevision)
  useEffect(() => () => controller.cancel(), [controller])
  return controller
}
