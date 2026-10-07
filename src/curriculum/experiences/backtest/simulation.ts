import { namedStream, GENERATOR_VERSION, uint32 } from '../../core/seededRandom'
import type { ModelResult } from '../../core/types'
import { failure, isRecord, isSafeJson, success } from '../../core/validation'
import {
  candidateId,
  decodeInputs,
  encodeDevelopment,
  encodeHoldout,
  makeHoldout,
  roleHash,
  score,
  selectCandidate,
  type BacktestInputs,
  type DevelopmentOutput,
  type HoldoutOutput,
} from './model'

export type SimulationJob =
  | { stage: 'development'; inputs: BacktestInputs }
  | { stage: 'holdout'; inputs: BacktestInputs; selectedId: string }
export type SimulationOutput = DevelopmentOutput | HoldoutOutput
export function decodeJob(v: unknown): ModelResult<SimulationJob> {
  if (!isRecord(v) || !isSafeJson(v))
    return failure('job', 'Invalid worker input.')
  const i = decodeInputs(v.inputs)
  if (!i.ok) return i
  if (v.stage === 'development' && Object.keys(v).length === 2)
    return success({ stage: 'development', inputs: i.value })
  if (
    v.stage === 'holdout' &&
    typeof v.selectedId === 'string' &&
    Array.from({ length: i.value.candidateCount }, (_, k) =>
      candidateId(k),
    ).includes(v.selectedId) &&
    Object.keys(v).length === 3
  )
    return success({
      stage: 'holdout',
      inputs: i.value,
      selectedId: v.selectedId,
    })
  return failure('job', 'Unknown stage or candidate.')
}
export function encodeJob(job: SimulationJob) {
  return { ...job, inputs: { ...job.inputs } }
}
export function encodeSimulation(o: SimulationOutput) {
  return o.kind === 'development' ? encodeDevelopment(o) : encodeHoldout(o)
}

export class SimulationBatch {
  readonly total: number
  completed = 0
  private index = 0
  private draws = 0
  private wins = 0
  private rows: DevelopmentOutput['leaderboard'] = []
  private random: () => number
  constructor(
    readonly job: SimulationJob,
    readonly seed: number,
  ) {
    uint32(seed)
    const valid = decodeJob(job)
    if (!valid.ok) throw new RangeError(valid.errors[0].message)
    this.total =
      job.stage === 'development'
        ? job.inputs.candidateCount * job.inputs.developmentTrials
        : job.inputs.holdoutTrials
    this.random = namedStream(
      seed,
      job.stage === 'development' ? 'development' : 'holdout',
      job.stage === 'development' ? candidateId(0) : job.selectedId,
    )
  }
  step(budget = 2048): SimulationOutput | null {
    if (!Number.isInteger(budget) || budget < 1 || budget > 8192)
      throw new RangeError('Use a bounded batch of 1–8,192 draws.')
    const n =
      this.job.stage === 'development'
        ? this.job.inputs.developmentTrials
        : this.job.inputs.holdoutTrials
    const stop = Math.min(this.total, this.completed + budget)
    while (this.completed < stop) {
      if (this.random() < 0.5) this.wins++
      this.completed++
      this.draws++
      if (this.draws === n && this.job.stage === 'development') {
        this.rows.push(
          score(candidateId(this.index), this.wins, n, this.job.inputs.cost),
        )
        this.index++
        this.draws = 0
        this.wins = 0
        if (this.index < this.job.inputs.candidateCount)
          this.random = namedStream(
            this.seed,
            'development',
            candidateId(this.index),
          )
      }
    }
    if (this.completed < this.total) return null
    return this.job.stage === 'holdout'
      ? makeHoldout(this.job.inputs, this.seed, this.job.selectedId, this.wins)
      : {
          kind: 'development',
          seed: this.seed,
          inputs: { ...this.job.inputs },
          leaderboard: this.rows.map((r) => ({ ...r })),
          selectedId: selectCandidate(this.rows),
          developmentHash: roleHash(this.job.inputs, this.seed, 'development'),
          totalSearchCount: this.rows.length,
        }
  }
}
export interface WorkerScope {
  postMessage(message: unknown): void
  addEventListener(
    type: 'message',
    callback: (event: MessageEvent) => void,
  ): void
}
export function installSimulationWorker(
  scope: WorkerScope,
  schedule: (callback: () => void) => void = (callback) => {
    setTimeout(callback, 0)
  },
) {
  let active: {
    identity: { runId: string; parameterHash: string; generatorVersion: string }
    batch: SimulationBatch
  } | null = null
  scope.addEventListener('message', ({ data }) => {
    if (
      !isRecord(data) ||
      typeof data.runId !== 'string' ||
      typeof data.parameterHash !== 'string' ||
      data.generatorVersion !== GENERATOR_VERSION
    )
      return
    const identity = {
      runId: data.runId,
      parameterHash: data.parameterHash,
      generatorVersion: GENERATOR_VERSION,
    }
    if (data.type === 'cancel') {
      if (
        active &&
        Object.keys(identity).every(
          (k) =>
            identity[k as keyof typeof identity] ===
            active!.identity[k as keyof typeof identity],
        )
      ) {
        active = null
        scope.postMessage({ ...identity, type: 'canceled' })
      }
      return
    }
    if (data.type !== 'start') return
    try {
      const decoded = decodeJob(data.inputs)
      if (!decoded.ok || typeof data.seed !== 'number')
        throw new RangeError('Invalid simulation job or seed.')
      const token = {
        identity,
        batch: new SimulationBatch(decoded.value, data.seed),
      }
      active = token
      const tick = () => {
        if (active !== token) return
        try {
          const output = token.batch.step()
          scope.postMessage({
            ...identity,
            type: 'progress',
            completed: token.batch.completed,
            total: token.batch.total,
          })
          if (output) {
            active = null
            scope.postMessage({
              ...identity,
              type: 'result',
              result: success(encodeSimulation(output)),
            })
          } else schedule(tick)
        } catch (error) {
          active = null
          scope.postMessage({
            ...identity,
            type: 'error',
            message:
              error instanceof Error ? error.message : 'Simulation failed.',
          })
        }
      }
      schedule(tick)
    } catch (error) {
      scope.postMessage({
        ...identity,
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Invalid worker request.',
      })
    }
  })
}
