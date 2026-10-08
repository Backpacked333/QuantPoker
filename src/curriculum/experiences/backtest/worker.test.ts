import { describe, expect, it, vi } from 'vitest'
import { GENERATOR_VERSION } from '../../core/seededRandom'
import { runWorker } from '../../core/workers'
import { decodeDevelopment, defaultInputs } from './model'
import { encodeJob } from './simulation'
import { LoopbackWorker } from './testing'

const identity = {
  runId: 'attempt-a',
  parameterHash: '1234abcd',
  generatorVersion: GENERATOR_VERSION,
}
const request = {
  ...identity,
  type: 'start' as const,
  seed: 42,
  inputs: encodeJob({ stage: 'development', inputs: defaultInputs }),
}
describe('real worker handler/kernel with deterministic WorkerPort transport (not browser proof)', () => {
  it('emits finite bounded progress/results with identity and terminates on completion', async () => {
    const worker = new LoopbackWorker(),
      abort = new AbortController(),
      progress = vi.fn()
    const r = await runWorker(
      worker,
      request,
      abort.signal,
      decodeDevelopment,
      progress,
    )
    expect(r.ok).toBe(true)
    expect(worker.terminated).toBe(1)
    expect(worker.messages[0]).toEqual(request)
    expect(progress).toHaveBeenLastCalledWith(2000, 2000)
    for (const message of worker.responses)
      expect(message).toMatchObject(identity)
    expect(worker.responses.at(-1)).toMatchObject({
      type: 'result',
      result: { ok: true },
    })
  })
  it('maximum 400,000-draw development uses multiple bounded batches and monotone progress', async () => {
    const worker = new LoopbackWorker(),
      abort = new AbortController(),
      progress = vi.fn()
    const r = await runWorker(
      worker,
      {
        ...request,
        inputs: encodeJob({
          stage: 'development',
          inputs: {
            ...defaultInputs,
            candidateCount: 200,
            developmentTrials: 2000,
          },
        }),
      },
      abort.signal,
      decodeDevelopment,
      progress,
    )
    expect(r.ok).toBe(true)
    expect(progress.mock.calls.length).toBe(196)
    expect(progress.mock.calls.at(-1)).toEqual([400000, 400000])
    expect(
      progress.mock.calls.every(
        ([done, total], k) =>
          total === 400000 &&
          done <= (k + 1) * 2048 &&
          done > (k === 0 ? 0 : progress.mock.calls[k - 1][0]),
      ),
    ).toBe(true)
  })
  it('cancel interrupts queued batches with matching canceled identity and termination; stale cancel is ignored', async () => {
    const queued: (() => void)[] = [],
      worker = new LoopbackWorker((fn) => queued.push(fn)),
      abort = new AbortController()
    const run = runWorker(
      worker,
      {
        ...request,
        inputs: encodeJob({
          stage: 'development',
          inputs: {
            ...defaultInputs,
            candidateCount: 200,
            developmentTrials: 2000,
          },
        }),
      },
      abort.signal,
      decodeDevelopment,
      () => {},
    )
    worker.postMessage({ ...identity, type: 'cancel', runId: 'stale' })
    queued.shift()!()
    expect(
      worker.responses.some((m) => (m as { type: string }).type === 'canceled'),
    ).toBe(false)
    abort.abort()
    await expect(run).rejects.toThrow('Canceled')
    expect(worker.messages.at(-1)).toEqual({ ...identity, type: 'cancel' })
    expect(worker.responses.at(-1)).toEqual({ ...identity, type: 'canceled' })
    expect(worker.terminated).toBe(1)
    const count = worker.responses.length
    queued.splice(0).forEach((fn) => fn())
    expect(worker.responses).toHaveLength(count)
  })
  it('ignores stale run, parameter hash and generator messages rather than replacing results', async () => {
    const queued: (() => void)[] = [],
      worker = new LoopbackWorker((fn) => queued.push(fn)),
      abort = new AbortController(),
      progress = vi.fn()
    const run = runWorker(
      worker,
      request,
      abort.signal,
      decodeDevelopment,
      progress,
    )
    worker.emit({ ...identity, type: 'error', runId: 'other', message: 'bad' })
    worker.emit({
      ...identity,
      type: 'progress',
      parameterHash: 'other',
      completed: 1000,
      total: 2000,
    })
    worker.emit({ ...identity, type: 'canceled', generatorVersion: 'other' })
    expect(worker.terminated).toBe(0)
    expect(progress).not.toHaveBeenCalled()
    while (queued.length) queued.shift()!()
    expect((await run).ok).toBe(true)
    expect(worker.terminated).toBe(1)
  })
  it('returns tagged worker errors for invalid seeds/jobs and terminates on startup/worker errors', async () => {
    for (const seed of [NaN, -1, 0.5, 2 ** 32]) {
      const worker = new LoopbackWorker()
      const promise = runWorker(
        worker,
        { ...request, seed },
        new AbortController().signal,
        decodeDevelopment,
        () => {},
      )
      await expect(promise).rejects.toThrow()
      expect(worker.terminated).toBe(1)
      expect(worker.responses.at(-1)).toMatchObject({
        ...identity,
        type: 'error',
      })
    }
    const worker = new LoopbackWorker(() => {})
    const run = runWorker(
      worker,
      request,
      new AbortController().signal,
      decodeDevelopment,
      () => {},
    )
    worker.emitError()
    await expect(run).rejects.toThrow('Worker failed')
    expect(worker.terminated).toBe(1)
    const startup = new LoopbackWorker(() => {})
    startup.postMessage = () => {
      throw Error('Startup failed')
    }
    await expect(
      runWorker(
        startup,
        request,
        new AbortController().signal,
        decodeDevelopment,
        () => {},
      ),
    ).rejects.toThrow('Worker could not start')
    expect(startup.terminated).toBe(1)
  })
  it('rejects malformed matching responses and ignores old scheduled batches after replacement start', async () => {
    const queued: (() => void)[] = [],
      worker = new LoopbackWorker((fn) => queued.push(fn))
    const run = runWorker(
      worker,
      request,
      new AbortController().signal,
      decodeDevelopment,
      () => {},
    )
    worker.emit({
      ...identity,
      type: 'result',
      result: { ok: true, value: { bad: Infinity }, warnings: [] },
    })
    await expect(run).rejects.toThrow('Non-finite or unsafe worker result')
    expect(worker.terminated).toBe(1)
    const scopeWorker = new LoopbackWorker((fn) => queued.push(fn))
    scopeWorker.postMessage(request)
    scopeWorker.postMessage({ ...request, runId: 'new-attempt' })
    while (queued.length) queued.shift()!()
    expect(
      scopeWorker.responses.every(
        (m) => (m as { runId: string }).runId === 'new-attempt',
      ),
    ).toBe(true)
  })
})
