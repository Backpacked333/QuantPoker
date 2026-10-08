import { RunController } from '../../core/experiments'
import { LearningSession } from '../../core/session'
import { fixedClock, MemoryStorage } from '../../core/__fixtures__/testing'
import type { RunContext } from '../../core/types'
import type { WorkerPort } from '../../core/workers'
import { success } from '../../core/validation'
import { backtestManifest } from './manifest'
import { backtestCases } from './cases'
import {
  installSimulationWorker,
  SimulationBatch,
  type SimulationJob,
  type SimulationOutput,
} from './simulation'

export const prediction = {
  actionId: 'Freeze and evaluate one selected candidate',
  direction: 'unchanged' as const,
  numericEstimate: 0,
  confidencePercent: 70,
  rationale:
    'Selection fits development noise; the independent null mean is zero before costs.',
}
export function testController(
  assess = false,
  seed: number | null = 42,
  session = new LearningSession(new MemoryStorage(), fixedClock),
) {
  return {
    session,
    c: new RunController({
      manifest: backtestManifest,
      session,
      mode: assess ? 'assess' : 'explore',
      assessmentMode: 'transfer',
      caseId: assess ? backtestCases[0].id : 'backtest-explore',
      unitId: assess ? 'f10' : undefined,
      seed: seed ?? undefined,
      clock: fixedClock,
    }),
  }
}
export function simulate(job: SimulationJob, seed = 42): SimulationOutput {
  const batch = new SimulationBatch(job, seed)
  let output: SimulationOutput | null = null
  while (!output) output = batch.step()
  return output
}
export const inlineExecutor = async (job: SimulationJob, context: RunContext) =>
  success(simulate(job, context.seed))
export class LoopbackWorker implements WorkerPort {
  messages: unknown[] = []
  responses: unknown[] = []
  terminated = 0
  private workerListener: ((event: MessageEvent) => void) | null = null
  private listeners = {
    message: new Set<(e: MessageEvent | ErrorEvent) => void>(),
    error: new Set<(e: MessageEvent | ErrorEvent) => void>(),
  }
  constructor(schedule: (fn: () => void) => void = queueMicrotask) {
    installSimulationWorker(
      {
        postMessage: (m) => {
          this.responses.push(m)
          this.emit(m)
        },
        addEventListener: (_, callback) => {
          this.workerListener = callback
        },
      },
      schedule,
    )
  }
  postMessage(m: unknown) {
    this.messages.push(m)
    if (!this.terminated) this.workerListener?.({ data: m } as MessageEvent)
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
    if (!this.terminated)
      this.listeners.message.forEach((l) => l({ data } as MessageEvent))
  }
  emitError() {
    this.listeners.error.forEach((l) =>
      l(new ErrorEvent('error', { message: 'Worker crashed' })),
    )
  }
}
