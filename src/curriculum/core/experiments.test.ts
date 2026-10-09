import { describe, expect, it, vi } from 'vitest'
import { createExperimentController, RunController } from './experiments'
import { LearningSession } from './session'
import {
  referenceCase,
  referenceManifest,
  decodeReferenceOutput,
  type ReferenceOutput,
} from './__fixtures__/reference'
import { fixedClock, MemoryStorage } from './__fixtures__/testing'
import { GENERATOR_VERSION } from './seededRandom'
import { success } from './validation'
import { runWorker, type WorkerPort } from './workers'
import type { ModelResult } from './types'

function controller(
  mode: 'assess' | 'explore' = 'assess',
  session = new LearningSession(new MemoryStorage(), fixedClock),
) {
  return new RunController({
    manifest: referenceManifest,
    session,
    mode,
    caseId: 'reference-1',
    unitId: 'f03',
    seed: 42,
    clock: fixedClock,
  })
}
const prediction = {
  actionId: 'Call',
  direction: 'increase' as const,
  numericEstimate: 12.5,
  confidencePercent: 70,
  rationale: 'The weighted ledger is positive.',
}
class FakeWorker implements WorkerPort {
  messages: unknown[] = []
  terminated = 0
  throws = false
  listeners = {
    message: new Set<(e: MessageEvent | ErrorEvent) => void>(),
    error: new Set<(e: MessageEvent | ErrorEvent) => void>(),
  }
  postMessage(m: unknown) {
    if (this.throws) throw Error('post failed')
    this.messages.push(m)
  }
  addEventListener(
    type: 'message' | 'error',
    listener: (e: MessageEvent | ErrorEvent) => void,
  ) {
    this.listeners[type].add(listener)
  }
  removeEventListener(
    type: 'message' | 'error',
    listener: (e: MessageEvent | ErrorEvent) => void,
  ) {
    this.listeners[type].delete(listener)
  }
  terminate() {
    this.terminated++
  }
  emit(data: unknown) {
    this.listeners.message.forEach((l) => l({ data } as MessageEvent))
  }
}
describe('immutable prediction experiment lifecycle', () => {
  it('publishes and saves the attempt and resumable protocol together once per transition', () => {
    const storage = new MemoryStorage()
    const session = new LearningSession(storage, fixedClock)
    const c = controller('assess', session)
    const listener = vi.fn(() => {
      expect(session.store.drafts[c.key].attempt).toEqual(
        session.store.attempts.find((a) => a.id === c.attempt.id),
      )
    })
    session.subscribe(listener)
    const before = storage.writes.length
    c.saveProtocolState({ stage: 'registered' }, { totalSearchCount: 20 })
    expect(storage.writes.length - before).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(session.store.drafts[c.key].protocol).toEqual({
      stage: 'registered',
    })
    expect(c.attempt.searchSummary).toEqual({ totalSearchCount: 20 })
    const a = c.attempt
    const p = c.protocolState
    expect(c.attempt).toBe(a)
    expect(c.protocolState).toBe(p)
    expect(Object.isFrozen(p)).toBe(true)
    c.saveProtocolState({ stage: 'frozen' })
    expect(c.attempt).not.toBe(a)
    expect(c.protocolState).not.toBe(p)
    expect(p).toEqual({ stage: 'registered' })
    expect(
      new LearningSession(storage, fixedClock).store.drafts[c.key].protocol,
    ).toEqual({ stage: 'frozen' })
  })
  it('runs the compiled manifest only after assessment commitment and preserves its snapshot', async () => {
    const c = controller()
    await expect(c.run()).rejects.toThrow('Commit')
    c.commitPrediction(prediction)
    const before = c.attempt
    await c.run()
    expect(c.phase).toBe('results_ready')
    expect(c.result).toEqual(
      success({ expectedProfit: 12.5, breakEvenProbability: 0.2 }),
    )
    expect(c.attempt.prediction).toEqual(before.prediction)
    expect(() =>
      c.commitPrediction({ ...prediction, numericEstimate: 99 }),
    ).toThrow('already committed')
    expect(Object.isFrozen(c.attempt.prediction)).toBe(true)
    expect(Object.isFrozen(c.inputs)).toBe(true)
    c.reflect(
      'My prediction used the modeled expectation, not a lucky outcome.',
    )
    expect(c.phase).toBe('reflected')
    c.archive()
    expect(c.phase).toBe('archived')
    expect(c.attempt.evaluation).toBeUndefined()
  })
  it('links parameter changes to a fresh draft without rewriting committed prediction or seed', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock),
      c = controller('assess', session)
    c.commitPrediction(prediction)
    await c.run()
    const original = c.attempt
    c.requestInputChange({ ...c.inputs, callCost: 40 })
    expect(c.phase).toBe('draft')
    expect(c.result).toBeNull()
    expect(c.attempt.id).not.toBe(original.id)
    expect(c.attempt.parentAttemptId).toBe(original.id)
    expect(c.attempt.prediction).toBeUndefined()
    expect(
      session.store.attempts.find((a) => a.id === original.id)?.prediction,
    ).toEqual(prediction)
    expect(
      session.store.attempts.find((a) => a.id === original.id)?.inputs,
    ).toEqual(original.inputs)
    expect(c.attempt.seed).toBe(42)
    c.requestInputChange({ ...c.inputs, probability: NaN })
    expect(c.inputs.probability).toBe(0.3)
    expect(c.status).toMatch(/probability/)
  })
  it('can reveal a population exactly once with no exploration result becoming correctness evidence', async () => {
    const c = controller('explore')
    await c.runWith(() =>
      success({ expectedProfit: 18.75, breakEvenProbability: 0.2 }),
    )
    expect(c.phase).toBe('results_ready')
    expect(c.result).toEqual(
      success({ expectedProfit: 18.75, breakEvenProbability: 0.2 }),
    )
    expect(c.attempt.evaluation).toBeUndefined()
    await expect(
      c.runWith(() =>
        success({ expectedProfit: 99, breakEvenProbability: 0.2 }),
      ),
    ).rejects.toThrow('new draft')
  })
  it('supports frozen stateful protocols, append-only search summaries and progress without snapshot edits', async () => {
    const c = controller()
    c.saveProtocolState({
      phase: 'development',
      candidateHistory: ['candidate-a'],
      lockedHoldout: false,
    })
    c.recordSearchSummary({ totalSearchCount: 1, holdoutCount: 0 })
    c.commitPrediction(prediction)
    const run = c.runWith(async (inputs, context) => {
      expect(context.seed).toBe(42)
      expect(context.generatorVersion).toBe(GENERATOR_VERSION)
      context.onProgress(1, 2)
      return referenceManifest.model(inputs)
    })
    await run
    expect(c.protocolState.candidateHistory).toEqual(['candidate-a'])
    expect(c.attempt.searchSummary).toEqual({
      totalSearchCount: 1,
      holdoutCount: 0,
    })
    expect(() => c.saveProtocolState({ futureDeck: [] })).toThrow(
      'information-safe',
    )
  })
  it('cancels async runs and ignores late results from a superseded parameter snapshot', async () => {
    const c = controller()
    c.commitPrediction(prediction)
    let resolve!: (v: ModelResult<ReferenceOutput>) => void
    const run = c.runWith(
      (_inputs, ctx) =>
        new Promise((r) => {
          resolve = r
          expect(ctx.signal.aborted).toBe(false)
        }),
    )
    expect(c.phase).toBe('running')
    c.requestInputChange({ ...c.inputs, callCost: 30 })
    expect(c.phase).toBe('draft')
    resolve(success({ expectedProfit: 999, breakEvenProbability: 0.2 }))
    await run
    expect(c.result).toBeNull()
    expect(c.inputs.callCost).toBe(30)
  })
  it('preserves committed inputs on model failure and rejects successful invalid output', async () => {
    const c = controller()
    c.commitPrediction(prediction)
    await c.runWith(() => ({
      ok: false,
      errors: [{ field: 'run', code: 'domain', message: 'Unavailable' }],
    }))
    expect(c.phase).toBe('prediction_committed')
    expect(c.status).toBe('Unavailable')
    await c.runWith(() =>
      success({ expectedProfit: Infinity, breakEvenProbability: 0.2 }),
    )
    expect(c.phase).toBe('prediction_committed')
    expect(c.status).toMatch(/finite/)
    expect(c.attempt.prediction).toEqual(prediction)
  })
  it('restores drafts after reload, shares root runtime on navigation and prevents unsupported replays', async () => {
    const port = new MemoryStorage(),
      session = new LearningSession(port, fixedClock),
      c = controller('assess', session)
    c.commitPrediction(prediction)
    c.saveProtocolState({ locked: true })
    const reloaded = controller('assess', new LearningSession(port, fixedClock))
    expect(reloaded.attempt.prediction).toEqual(prediction)
    expect(reloaded.protocolState).toEqual({ locked: true })
    const options = {
      manifest: referenceManifest,
      session,
      mode: 'assess' as const,
      caseId: 'root',
      seed: 42,
    }
    expect(createExperimentController(options)).toBe(
      createExperimentController(options),
    )
    const unsupported = new RunController({
      ...options,
      key: c.key,
      manifest: { ...referenceManifest, version: 'reference-2' },
    })
    expect(unsupported.status).toMatch(/unsupported/)
    await expect(unsupported.run()).rejects.toThrow('Unsupported')
  })
  it('honors evidence callback assistance through later runs, rejects snapshot edits, and submits immutable evidence', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    const c = new RunController({
      manifest: referenceManifest,
      session,
      mode: 'assess',
      assessmentMode: 'transfer',
      caseId: 'reference-1',
      unitId: 'f03',
      seed: 42,
    })
    c.commitPrediction(prediction)
    session.exposeHint(c.attempt.id, 'setup:0')
    expect(() =>
      session.recordAttempt({ ...c.attempt, inputs: { callCost: 0 } }),
    ).toThrow('immutable')
    await c.run()
    expect(c.attempt.assistance.hintIds).toEqual(['setup:0'])
    c.reflect('Ungraded explanation')
    const answers = Object.fromEntries(
      referenceCase.questions.map((q) => [
        q.id,
        typeof q.expected === 'string' || typeof q.expected === 'number'
          ? q.expected
          : [...q.expected],
      ]),
    )
    const grade = c.submitAssessment(referenceCase, answers)
    expect(grade).toMatchObject({
      earned: 100,
      unaided: false,
      eligible: false,
    })
    expect(c.phase).toBe('archived')
    expect(() =>
      session.recordAttempt({ ...c.attempt, reflection: 'rewritten' }),
    ).toThrow('immutable')
    expect(() => c.submitAssessment(referenceCase, answers)).toThrow('Complete')
  })
})
describe('cancelable worker run protocol', () => {
  const request = {
    type: 'start' as const,
    runId: 'run-1',
    parameterHash: 'abc123',
    generatorVersion: GENERATOR_VERSION,
    seed: 42,
    inputs: { p: 0.3 },
  }
  it('rejects stale identity/hash/version, accepts progress and decodes the current result', async () => {
    const worker = new FakeWorker(),
      abort = new AbortController(),
      progress = vi.fn()
    const run = runWorker(
      worker,
      request,
      abort.signal,
      decodeReferenceOutput,
      progress,
    )
    for (const mismatch of [
      { runId: 'old' },
      { parameterHash: 'old' },
      { generatorVersion: 'old' },
    ])
      worker.emit({
        ...request,
        ...mismatch,
        type: 'result',
        result: success({ expectedProfit: 999, breakEvenProbability: 0.2 }),
      })
    worker.emit({ ...request, type: 'progress', completed: 1, total: 2 })
    worker.emit({ ...request, type: 'progress', completed: 3, total: 2 })
    worker.emit({
      ...request,
      type: 'result',
      result: success({ expectedProfit: 12.5, breakEvenProbability: 0.2 }),
    })
    expect(await run).toEqual(
      success({ expectedProfit: 12.5, breakEvenProbability: 0.2 }),
    )
    expect(progress).toHaveBeenCalledExactlyOnceWith(1, 2)
    expect(worker.terminated).toBe(1)
    expect(worker.listeners.message.size).toBe(0)
  })
  it('sends only run identity on cancellation and always terminates listeners', async () => {
    const worker = new FakeWorker(),
      abort = new AbortController(),
      run = runWorker(
        worker,
        request,
        abort.signal,
        decodeReferenceOutput,
        vi.fn(),
      )
    const result = expect(run).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await result
    expect(worker.messages.at(-1)).toEqual({
      type: 'cancel',
      runId: 'run-1',
      parameterHash: 'abc123',
      generatorVersion: GENERATOR_VERSION,
    })
    expect(worker.terminated).toBe(1)
    expect(worker.listeners.error.size).toBe(0)
  })
  it('handles pre-aborted runs, start failure, worker failure and invalid output cleanly', async () => {
    const abort = new AbortController()
    abort.abort()
    const first = new FakeWorker()
    await expect(
      runWorker(first, request, abort.signal, decodeReferenceOutput, vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(first.terminated).toBe(1)
    const failed = new FakeWorker()
    failed.throws = true
    await expect(
      runWorker(
        failed,
        request,
        new AbortController().signal,
        decodeReferenceOutput,
        vi.fn(),
      ),
    ).rejects.toThrow('start')
    expect(failed.terminated).toBe(1)
    const bad = new FakeWorker(),
      run = runWorker(
        bad,
        request,
        new AbortController().signal,
        decodeReferenceOutput,
        vi.fn(),
      )
    bad.emit({
      ...request,
      type: 'result',
      result: success({ expectedProfit: NaN, breakEvenProbability: 0.2 }),
    })
    await expect(run).rejects.toThrow('Non-finite')
    expect(bad.terminated).toBe(1)
    const errored = new FakeWorker(),
      errorRun = runWorker(
        errored,
        request,
        new AbortController().signal,
        decodeReferenceOutput,
        vi.fn(),
      )
    errored.listeners.error.forEach((l) => l({} as ErrorEvent))
    await expect(errorRun).rejects.toThrow('failed')
    expect(errored.terminated).toBe(1)
  })
})
