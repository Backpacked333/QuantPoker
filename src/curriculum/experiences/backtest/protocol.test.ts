import { describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { RunController } from '../../core/experiments'
import { LearningSession } from '../../core/session'
import { LEARNING_KEY } from '../../core/persistence'
import {
  MemoryStorage,
  fixedClock,
  attemptFor,
} from '../../core/__fixtures__/testing'
import { evaluateCase, validateCase } from '../../core/assessment'
import { CurriculumRegistry } from '../../core/registry'
import { success } from '../../core/validation'
import { backtestCases, backtestFragment } from './cases'
import { backtestManifest } from './manifest'
import {
  datasetKey,
  defaultInputs,
  MODEL_VERSION,
  type BacktestInputs,
  type BacktestOutput,
} from './model'
import {
  decodeProtocol,
  encodeProtocol,
  freezeCandidate,
  frozenProtocolHash,
  linkedExperiment,
  preregister,
  protocolFor,
  requestHoldout,
  runResearch,
  saveResearchReflection,
  type SimulationExecutor,
} from './protocol'
import { inlineExecutor, prediction, simulate, testController } from './testing'
import type { SimulationOutput } from './simulation'

async function complete(
  c: RunController<BacktestInputs, BacktestOutput>,
  executor = inlineExecutor,
) {
  preregister(
    c,
    'The selected development winner will not have true gross edge.',
    'A lower net confidence bound not above zero fails my positive-edge criterion.',
    prediction,
  )
  const run = runResearch(c, executor)
  await waitFor(() => expect(protocolFor(c).stage).toBe('development_complete'))
  freezeCandidate(c)
  requestHoldout(c)
  await run
  expect(c.phase).toBe('results_ready')
}
describe('preregistered/frozen protocol and shared evidence lifecycle', () => {
  it('keeps holdout ungenerated until candidate AND full protocol freeze and explicit reveal', async () => {
    const { c } = testController(),
      executor = vi.fn(inlineExecutor)
    expect(() => requestHoldout(c)).toThrow('Freeze')
    expect(() => freezeCandidate(c)).toThrow('Complete')
    expect(() => preregister(c, '', 'condition', prediction)).toThrow(
      'hypothesis',
    )
    preregister(
      c,
      'A null winner will regress.',
      'Fail if net lower bound is not positive.',
      prediction,
    )
    const original = c.attempt
    expect(original.resultSummary).toBeUndefined()
    expect(c.protocolState).not.toHaveProperty('holdout')
    const run = runResearch(c, executor)
    await waitFor(() =>
      expect(protocolFor(c).stage).toBe('development_complete'),
    )
    expect(executor).toHaveBeenCalledTimes(1)
    expect(c.result).toBeNull()
    expect(() => requestHoldout(c)).toThrow('Freeze')
    freezeCandidate(c)
    const frozen = protocolFor(c)
    expect(frozen.frozenHash).toBe(frozenProtocolHash(frozen))
    expect(frozen.seed).toBe(42)
    expect(frozen.modelVersion).toBe(MODEL_VERSION)
    expect(frozen.history.consumedDatasets).toEqual([])
    expect(executor).toHaveBeenCalledTimes(1)
    requestHoldout(c)
    expect(protocolFor(c).history.consumedDatasets).toEqual([
      datasetKey(42, frozen.development!.selectedId),
    ])
    expect(() => requestHoldout(c)).toThrow('single primary')
    await run
    expect(executor.mock.calls.map(([job]) => job.stage)).toEqual([
      'development',
      'holdout',
    ])
    expect(protocolFor(c).stage).toBe('evaluation_revealed')
    expect(c.result?.ok).toBe(true)
    expect(c.attempt.prediction).toEqual(original.prediction)
    expect(c.attempt.inputs).toEqual(original.inputs)
    expect(() =>
      c.commitPrediction({ ...prediction, numericEstimate: 99 }),
    ).toThrow('already committed')
    saveResearchReflection(c, 'A profitable draw cannot establish an edge.')
    expect(protocolFor(c).stage).toBe('research_reflection')
    expect(c.attempt.evaluation).toBeUndefined()
    expect(c.attempt.searchSummary?.totalSearchCount).toBe(20)
    expect(c.attempt.searchSummary?.leaderboard).toHaveLength(20)
  })
  it('freezes all protocol fields including role mapping, seed, costs and falsification', async () => {
    const { c } = testController()
    await complete(c)
    const p = protocolFor(c)
    for (const changed of [
      { ...p, hypothesis: 'Edited' },
      { ...p, falsification: 'Edited' },
      { ...p, inputs: { ...p.inputs, cost: 0.05 } },
      { ...p, seed: 43 },
      { ...p, modelVersion: 'bkt-2' },
      { ...p, stage: 'preregistered', development: null },
      { ...p, revealRequested: false },
    ])
      expect(decodeProtocol(changed).ok).toBe(false)
    expect(
      decodeProtocol({ ...p, history: { ...p.history, consumedDatasets: [] } })
        .ok,
    ).toBe(false)
    expect(Object.isFrozen(c.protocolState)).toBe(true)
    expect(() => {
      ;(c.inputs as BacktestInputs).cost = 0.1
    }).toThrow()
  })
  it('post-test tuning links fresh seed/attempt while retaining old result, full searches and consumed tests', async () => {
    let seed = 100
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint32Array)[0] = seed++
      return array
    })
    const { c, session } = testController(false, null)
    await complete(c)
    const old = c.attempt,
      previous = protocolFor(c)
    linkedExperiment(c, { ...c.inputs, cost: 0.05 })
    expect(c.phase).toBe('draft')
    expect(c.attempt.parentAttemptId).toBe(old.id)
    expect(c.attempt.seed).toBe(101)
    expect(c.attempt.prediction).toBeUndefined()
    expect(protocolFor(c).history).toEqual(previous.history)
    expect(
      session.store.attempts.find((a) => a.id === old.id)?.resultSummary,
    ).toEqual(old.resultSummary)
    expect(
      session.store.attempts.find((a) => a.id === old.id)?.prediction,
    ).toEqual(old.prediction)
    expect(
      session.store.attempts.find((a) => a.id === old.id)?.searchSummary
        ?.hypothesis,
    ).toBe(previous.hypothesis)
    expect(
      session.store.attempts.find((a) => a.id === old.id)?.searchSummary
        ?.falsification,
    ).toBe(previous.falsification)
    await complete(c)
    expect(protocolFor(c).history.totalSearches).toBe(40)
    expect(protocolFor(c).history.experimentCount).toBe(2)
    expect(protocolFor(c).history.consumedDatasets).toHaveLength(2)
    expect(c.attempt.searchSummary?.totalSearchCount).toBe(20)
  })
  it('blocks same-seed consumed holdout reuse even if costs or sample size are changed', async () => {
    const { c } = testController()
    await complete(c)
    linkedExperiment(c, { ...defaultInputs, cost: 0.05, holdoutTrials: 2000 })
    preregister(
      c,
      'New parameters on the same seed.',
      'Zero bound.',
      prediction,
    )
    const run = runResearch(c, inlineExecutor)
    await waitFor(() =>
      expect(protocolFor(c).stage).toBe('development_complete'),
    )
    freezeCandidate(c)
    expect(() => requestHoldout(c)).toThrow('already consumed')
    c.cancel()
    await run
    expect(protocolFor(c).history.totalSearches).toBe(40)
    expect(protocolFor(c).history.consumedDatasets).toHaveLength(1)
  })
  it('canceling while waiting or revealing preserves prediction and resumes only the same evaluation', async () => {
    const { c } = testController()
    preregister(c, 'Null edge.', 'Positive bound required.', prediction)
    const first = runResearch(c, inlineExecutor)
    await waitFor(() =>
      expect(protocolFor(c).stage).toBe('development_complete'),
    )
    c.cancel()
    await first
    expect(c.phase).toBe('prediction_committed')
    expect(c.attempt.searchSummary?.totalSearchCount).toBe(20)
    const delayed: SimulationExecutor = async (job, context) =>
      job.stage === 'holdout'
        ? new Promise((_, reject) =>
            context.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Canceled', 'AbortError')),
              { once: true },
            ),
          )
        : inlineExecutor(job, context)
    const second = runResearch(c, delayed)
    freezeCandidate(c)
    requestHoldout(c)
    await waitFor(() => expect(protocolFor(c).revealRequested).toBe(true))
    await Promise.resolve()
    c.cancel()
    await second
    const p = protocolFor(c)
    expect(p.history.consumedDatasets).toHaveLength(1)
    expect(p.history.totalSearches).toBe(20)
    const executor = vi.fn(inlineExecutor)
    await runResearch(c, executor)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor.mock.calls[0][0].stage).toBe('holdout')
    expect(c.attempt.prediction).toEqual(prediction)
    expect(protocolFor(c).history.consumedDatasets).toHaveLength(1)
  })
  it('late async outputs after cancel or parameter changes cannot publish a stale development', async () => {
    const { c } = testController()
    preregister(c, 'Null edge.', 'Zero bound.', prediction)
    let finish!: (value: ReturnType<typeof success<SimulationOutput>>) => void
    const run = runResearch(
      c,
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const old = c.attempt.id
    linkedExperiment(c, { ...c.inputs, cost: 0.1 })
    finish(success(simulate({ stage: 'development', inputs: defaultInputs })))
    await run
    expect(c.attempt.id).not.toBe(old)
    expect(c.result).toBeNull()
    expect(protocolFor(c).stage).toBe('draft_protocol')
    expect(protocolFor(c).history.totalSearches).toBe(0)
  })
  it('persists public protocol, all candidate scores, counts and resumes interrupted stages without re-searching', async () => {
    const storage = new MemoryStorage(),
      session = new LearningSession(storage, fixedClock)
    const { c } = testController(false, 42, session)
    preregister(c, 'Null edge.', 'Zero bound.', prediction)
    const run = runResearch(c, inlineExecutor)
    await waitFor(() =>
      expect(protocolFor(c).stage).toBe('development_complete'),
    )
    c.cancel()
    await run
    const recovered = new LearningSession(storage, fixedClock)
    const { c: next } = testController(false, 42, recovered)
    expect(protocolFor(next).development?.leaderboard).toHaveLength(20)
    const executor = vi.fn(inlineExecutor),
      resume = runResearch(next, executor)
    freezeCandidate(next)
    requestHoldout(next)
    await resume
    expect(executor).toHaveBeenCalledTimes(1)
    expect(protocolFor(next).history.totalSearches).toBe(20)
    const raw = storage.getItem(LEARNING_KEY)!
    expect(raw).toContain('leaderboard')
    expect(raw).toContain('consumedDatasets')
    for (const key of [
      'privateCards',
      'futureDeck',
      'opponentCards',
      'credentials',
    ])
      expect(raw).not.toContain(key)
    expect(
      new LearningSession(storage, fixedClock).store.attempts.find(
        (a) => a.id === next.attempt.id,
      )?.searchSummary?.totalSearchCount,
    ).toBe(20)
  })
  it('draft edits retain the last valid inputs and public history; invalid inputs never commit', () => {
    const { c } = testController()
    linkedExperiment(c, { ...c.inputs, cost: 0.02 })
    expect(protocolFor(c).inputs.cost).toBe(0.02)
    expect(() => linkedExperiment(c, { ...c.inputs, cost: Infinity })).toThrow(
      'Use',
    )
    expect(c.inputs.cost).toBe(0.02)
    expect(
      decodeProtocol({ ...encodeProtocol(protocolFor(c)), seed: NaN }).ok,
    ).toBe(false)
  })
})
describe('F10 research reliability bank and rubric, never profit grading', () => {
  it('registerable fragment supplies three transfer and three changed-number review finance cases with nine structured items', () => {
    expect(backtestFragment.slotId).toBe('f10-backtest')
    const registry = new CurriculumRegistry()
    registry.registerSources(backtestManifest.sources)
    registry.installFragment(backtestFragment)
    registry.assertIntegrity()
    expect(registry.cases.has('f10-backtest-transfer-1')).toBe(true)
    expect(backtestCases.filter((c) => c.mode === 'transfer')).toHaveLength(3)
    expect(backtestCases.filter((c) => c.mode === 'review')).toHaveLength(3)
    for (const c of backtestCases) {
      expect(validateCase(c)).toEqual([])
      expect(c.questions).toHaveLength(9)
      expect(new Set(c.questions.map((q) => q.component)).size).toBe(4)
      expect(
        c.questions.filter((q) => q.critical).length,
      ).toBeGreaterThanOrEqual(2)
      expect(c.questions.every((q) => q.hints.length === 4)).toBe(true)
      expect(c.questions.some((q) => q.kind === 'classification')).toBe(true)
      const a = attemptFor(c)
      const e = evaluateCase(c, a, [], [], undefined, fixedClock)
      expect(e.passed).toBe(true)
      const wrong = {
        ...a,
        answers: {
          ...a.answers,
          'freeze-order': ['register', 'develop', 'reveal', 'freeze'],
        },
      }
      expect(evaluateCase(c, wrong, [], [], undefined, fixedClock).passed).toBe(
        false,
      )
    }
    const expected = [26, 33, 17.75, 12, -5, 23.4]
    expect(
      backtestCases.map(
        (c) => c.questions.find((q) => q.id === 'cost-ledger')!.expected,
      ),
    ).toEqual(expected)
  })
  it('grades protocol/cash reasoning through shared submitAssessment and keeps prose ungraded', async () => {
    const { c } = testController(true)
    await complete(c)
    saveResearchReflection(
      c,
      'Anything, including an empty economic explanation, is ungraded reflection.',
    )
    const record = backtestCases[0]
    const answers = attemptFor(record).answers
    const e = c.submitAssessment(record, answers)
    expect(e.passed).toBe(true)
    expect(e.eligible).toBe(true)
    expect(c.phase).toBe('archived')
    expect(c.attempt.answers).toEqual(answers)
    expect(c.attempt.evaluation?.earned).toBe(90)
  })
})
