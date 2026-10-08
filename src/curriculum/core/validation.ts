import type { JsonValue, ModelResult, Prediction } from './types'

export const success = <T>(value: T): ModelResult<T> => ({
  ok: true,
  value,
  warnings: [],
})
export const failure = (
  field: string,
  message: string,
  code = 'invalid',
): ModelResult<never> => ({ ok: false, errors: [{ field, code, message }] })
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function numberIn(
  value: unknown,
  min: number,
  max: number,
  integer = false,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
  )
}
const forbidden = new Set([
  'game',
  'deck',
  'futureDeck',
  'opponentCards',
  'atlasCards',
  'privateCards',
  'secret',
  'credentials',
  '__proto__',
  'constructor',
  'prototype',
])
export function isSafeJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 12) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= 10000
  if (Array.isArray(value))
    return value.length <= 2000 && value.every((v) => isSafeJson(v, depth + 1))
  return (
    isRecord(value) &&
    Object.keys(value).length <= 300 &&
    Object.entries(value).every(
      ([key, v]) => !forbidden.has(key) && isSafeJson(v, depth + 1),
    )
  )
}
export function safeClone<T>(value: T): T {
  if (!isSafeJson(value))
    throw new RangeError(
      'Only bounded, information-safe finite JSON may be recorded.',
    )
  return JSON.parse(JSON.stringify(value)) as T
}
export function immutable<T>(value: T): Readonly<T> {
  const clone = safeClone(value)
  function freeze(v: unknown) {
    if (v && typeof v === 'object') {
      Object.values(v).forEach(freeze)
      Object.freeze(v)
    }
  }
  freeze(clone)
  return clone
}
export function decodePrediction(value: unknown): ModelResult<Prediction> {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          'actionId',
          'numericEstimate',
          'direction',
          'confidencePercent',
          'rationale',
        ].includes(k),
    )
  )
    return failure('prediction', 'Invalid prediction.')
  if (
    !(
      value.confidencePercent === null ||
      numberIn(value.confidencePercent, 0, 100)
    ) ||
    typeof value.rationale !== 'string' ||
    value.rationale.length > 2000
  )
    return failure(
      'prediction',
      'Use confidence 0–100 or not sure, and rationale up to 2,000 characters.',
    )
  if (
    value.numericEstimate !== undefined &&
    (typeof value.numericEstimate !== 'number' ||
      !Number.isFinite(value.numericEstimate))
  )
    return failure('numericEstimate', 'Estimate must be finite.')
  if (
    value.direction !== undefined &&
    !['increase', 'decrease', 'unchanged', 'not-sure'].includes(
      String(value.direction),
    )
  )
    return failure('direction', 'Unknown direction.')
  if (
    value.actionId !== undefined &&
    (typeof value.actionId !== 'string' || value.actionId.length > 100)
  )
    return failure('actionId', 'Invalid action.')
  return success({
    confidencePercent: value.confidencePercent as number | null,
    rationale: value.rationale,
    ...(value.actionId === undefined
      ? {}
      : { actionId: value.actionId as string }),
    ...(value.direction === undefined
      ? {}
      : { direction: value.direction as Prediction['direction'] }),
    ...(value.numericEstimate === undefined
      ? {}
      : { numericEstimate: value.numericEstimate as number }),
  })
}
export function validatedModel<I, O>(
  decode: (input: unknown) => ModelResult<I>,
  calculate: (input: I) => O,
): (input: unknown) => ModelResult<O> {
  return (input) => {
    const decoded = decode(input)
    if (!decoded.ok) return decoded
    try {
      const value = calculate(decoded.value)
      return isSafeJson(value)
        ? success(value)
        : failure(
            'result',
            'Model produced invalid or oversized output.',
            'non-finite',
          )
    } catch (error) {
      if (error instanceof RangeError) return failure('inputs', error.message)
      throw error
    }
  }
}
