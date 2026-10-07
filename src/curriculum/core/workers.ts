import type { JsonValue, ModelResult, RunIdentity } from './types'
import { isRecord, isSafeJson, numberIn } from './validation'

export type WorkerRequest<I> =
  | (RunIdentity & { type: 'start'; inputs: I; seed: number })
  | (RunIdentity & { type: 'cancel' })
export type WorkerResponse<O> = RunIdentity &
  (
    | { type: 'progress'; completed: number; total: number }
    | { type: 'result'; result: ModelResult<O> }
    | { type: 'error'; message: string }
    | { type: 'canceled' }
  )
export function matchesRun(message: unknown, identity: RunIdentity): boolean {
  return (
    isRecord(message) &&
    message.runId === identity.runId &&
    message.parameterHash === identity.parameterHash &&
    message.generatorVersion === identity.generatorVersion
  )
}
export interface WorkerPort {
  postMessage(message: unknown): void
  addEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void
  removeEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void
  terminate(): void
}
export function runWorker<I extends JsonValue, O>(
  worker: WorkerPort,
  request: WorkerRequest<I> & { type: 'start' },
  signal: AbortSignal,
  decodeResult: (value: unknown) => ModelResult<O>,
  onProgress: (completed: number, total: number) => void,
): Promise<ModelResult<O>> {
  if (!isSafeJson(request.inputs)) {
    worker.terminate()
    return Promise.reject(new RangeError('Invalid worker input.'))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    function clean() {
      worker.removeEventListener('message', receive)
      worker.removeEventListener('error', errored)
      signal.removeEventListener('abort', abort)
      worker.terminate()
    }
    function finish(result?: ModelResult<O>, error?: Error) {
      if (settled) return
      settled = true
      clean()
      if (error) reject(error)
      else resolve(result!)
    }
    function abort() {
      try {
        worker.postMessage({
          runId: request.runId,
          parameterHash: request.parameterHash,
          generatorVersion: request.generatorVersion,
          type: 'cancel',
        })
      } catch {
        /* A closed worker still needs cleanup. */
      }
      finish(undefined, new DOMException('Canceled', 'AbortError'))
    }
    function errored() {
      finish(
        undefined,
        new Error('Worker failed; committed inputs are preserved.'),
      )
    }
    function receive(event: MessageEvent | ErrorEvent) {
      if (
        !('data' in event) ||
        !matchesRun(event.data, request) ||
        !isRecord(event.data)
      )
        return
      const message = event.data
      if (
        message.type === 'progress' &&
        numberIn(message.completed, 0, Number.MAX_SAFE_INTEGER, true) &&
        numberIn(message.total, 1, Number.MAX_SAFE_INTEGER, true) &&
        message.completed <= message.total
      )
        onProgress(message.completed, message.total)
      if (message.type === 'canceled')
        finish(undefined, new DOMException('Canceled', 'AbortError'))
      if (message.type === 'error' && typeof message.message === 'string')
        finish(undefined, new Error(message.message.slice(0, 2000)))
      if (message.type === 'result' && isRecord(message.result)) {
        if (message.result.ok === true) {
          if (!isSafeJson(message.result.value))
            finish(
              undefined,
              new RangeError('Non-finite or unsafe worker result.'),
            )
          else {
            try {
              const decoded = decodeResult(message.result.value),
                warnings = message.result.warnings
              if (
                warnings !== undefined &&
                (!Array.isArray(warnings) ||
                  warnings.some(
                    (w) =>
                      !isRecord(w) ||
                      typeof w.code !== 'string' ||
                      w.code.length > 100 ||
                      typeof w.message !== 'string' ||
                      w.message.length > 2000,
                  ))
              )
                throw new RangeError('Invalid worker warnings.')
              finish(
                decoded.ok
                  ? {
                      ...decoded,
                      warnings: [
                        ...decoded.warnings,
                        ...(warnings ?? []).map((w) => ({
                          code: String(w.code),
                          message: String(w.message),
                        })),
                      ],
                    }
                  : decoded,
              )
            } catch {
              finish(undefined, new RangeError('Invalid worker result.'))
            }
          }
        } else
          finish({
            ok: false,
            errors: [
              {
                field: 'run',
                code: 'worker',
                message: 'Worker could not compute this run.',
              },
            ],
          })
      }
    }
    worker.addEventListener('message', receive)
    worker.addEventListener('error', errored)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else {
      try {
        worker.postMessage(request)
      } catch {
        finish(
          undefined,
          new Error('Worker could not start; committed inputs are preserved.'),
        )
      }
    }
  })
}
