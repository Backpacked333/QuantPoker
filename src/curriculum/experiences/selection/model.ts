import type { JsonValue, ModelResult } from '../../core/types'
import {
  failure,
  isRecord,
  numberIn,
  success,
  validatedModel,
} from '../../core/validation'

export interface SelectionParameters {
  populationSize: number
  bluffPrevalence: number
  bluffRecordingRate: number
  valueRecordingRate: number
  observationRatesKnown: boolean
}
export const defaultParameters: Readonly<SelectionParameters> = Object.freeze({
  populationSize: 1000,
  bluffPrevalence: 0.3,
  bluffRecordingRate: 0.1,
  valueRecordingRate: 0.6,
  observationRatesKnown: false,
})
export interface ObservedSample {
  observedBluffs: number
  observedValues: number
}
export type CorrectionStatus =
  | 'available'
  | 'rates-unknown'
  | 'not-identifiable'
  | 'no-observations'
export interface Correction {
  share: number | null
  status: CorrectionStatus
}
export interface SelectionOutput {
  parameters: SelectionParameters
  populationBluffs: number
  populationValues: number
  observedBluffs: number
  observedValues: number
  omittedBluffs: number
  omittedValues: number
  observedTotal: number
  observedShare: number | null
  observedStatus: 'available' | 'no-observations'
  correctedShare: number | null
  correctionStatus: CorrectionStatus
}

function keysMatch(v: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(v).length === keys.length && keys.every((k) => k in v)
}
export function decodeSelectionParameters(
  v: unknown,
): ModelResult<SelectionParameters> {
  if (
    !isRecord(v) ||
    !keysMatch(v, [
      'populationSize',
      'bluffPrevalence',
      'bluffRecordingRate',
      'valueRecordingRate',
      'observationRatesKnown',
    ])
  )
    return failure(
      'inputs',
      'Use only the declared synthetic population parameters.',
    )
  if (!numberIn(v.populationSize, 100, 10000, true))
    return failure(
      'populationSize',
      'Population size must be an integer from 100 to 10,000 units.',
    )
  for (const field of [
    'bluffPrevalence',
    'bluffRecordingRate',
    'valueRecordingRate',
  ] as const)
    if (!numberIn(v[field], 0, 1))
      return failure(field, 'Use a finite probability fraction from 0 to 1.')
  if (typeof v.observationRatesKnown !== 'boolean')
    return failure(
      'observationRatesKnown',
      'State whether the observation rates are known.',
    )
  return success({
    populationSize: v.populationSize,
    bluffPrevalence: v.bluffPrevalence as number,
    bluffRecordingRate: v.bluffRecordingRate as number,
    valueRecordingRate: v.valueRecordingRate as number,
    observationRatesKnown: v.observationRatesKnown,
  })
}

export function correctObservedCounts(
  sample: unknown,
  rates: unknown,
): ModelResult<Correction> {
  if (
    !isRecord(sample) ||
    !keysMatch(sample, ['observedBluffs', 'observedValues']) ||
    !numberIn(sample.observedBluffs, 0, 10000) ||
    !numberIn(sample.observedValues, 0, 10000)
  )
    return failure(
      'observedCounts',
      'Expected recorded counts must be finite and between 0 and 10,000.',
    )
  if (rates === null) return success({ share: null, status: 'rates-unknown' })
  if (
    !isRecord(rates) ||
    !keysMatch(rates, ['bluffRecordingRate', 'valueRecordingRate']) ||
    !numberIn(rates.bluffRecordingRate, 0, 1) ||
    !numberIn(rates.valueRecordingRate, 0, 1)
  )
    return failure(
      'recordingRates',
      'Known recording rates must be finite fractions from 0 to 1.',
    )
  if (rates.bluffRecordingRate === 0 || rates.valueRecordingRate === 0)
    return success({ share: null, status: 'not-identifiable' })
  if (sample.observedBluffs + sample.observedValues === 0)
    return success({ share: null, status: 'no-observations' })
  const a = sample.observedBluffs / rates.bluffRecordingRate
  const b = sample.observedValues / rates.valueRecordingRate
  if (Number.isFinite(a + b))
    return success({ share: a / (a + b), status: 'available' })
  // Normalize on the log scale when tiny positive rates overflow inverse weights.
  const logA =
    sample.observedBluffs === 0
      ? -Infinity
      : Math.log(sample.observedBluffs) - Math.log(rates.bluffRecordingRate)
  const logB =
    sample.observedValues === 0
      ? -Infinity
      : Math.log(sample.observedValues) - Math.log(rates.valueRecordingRate)
  const scale = Math.max(logA, logB)
  const weightA = Math.exp(logA - scale)
  const weightB = Math.exp(logB - scale)
  return success({ share: weightA / (weightA + weightB), status: 'available' })
}

function calculate(parameters: SelectionParameters): SelectionOutput {
  const populationBluffs =
    parameters.populationSize * parameters.bluffPrevalence
  const populationValues =
    parameters.populationSize * (1 - parameters.bluffPrevalence)
  const observedBluffs = populationBluffs * parameters.bluffRecordingRate
  const observedValues = populationValues * parameters.valueRecordingRate
  const observedTotal = observedBluffs + observedValues
  const corrected = correctObservedCounts(
    { observedBluffs, observedValues },
    parameters.observationRatesKnown
      ? {
          bluffRecordingRate: parameters.bluffRecordingRate,
          valueRecordingRate: parameters.valueRecordingRate,
        }
      : null,
  )
  if (!corrected.ok) throw new RangeError(corrected.errors[0].message)
  return {
    parameters: { ...parameters },
    populationBluffs,
    populationValues,
    observedBluffs,
    observedValues,
    omittedBluffs: populationBluffs - observedBluffs,
    omittedValues: populationValues - observedValues,
    observedTotal,
    observedShare: observedTotal > 0 ? observedBluffs / observedTotal : null,
    observedStatus: observedTotal > 0 ? 'available' : 'no-observations',
    correctedShare: corrected.value.share,
    correctionStatus: corrected.value.status,
  }
}
export const selectionModel = validatedModel(
  decodeSelectionParameters,
  calculate,
)

export type SelectionInputs =
  | ({
      kind: 'observed-only'
      datasetId: 'selection-default-v1'
    } & ObservedSample)
  | { kind: 'disclosed'; parameters: SelectionParameters }
export const defaultInputs: Readonly<SelectionInputs> = Object.freeze({
  kind: 'observed-only',
  datasetId: 'selection-default-v1',
  observedBluffs: 30,
  observedValues: 420,
})
export function decodeSelectionInputs(
  v: unknown,
): ModelResult<SelectionInputs> {
  if (!isRecord(v)) return failure('inputs', 'Invalid public selection input.')
  if (
    v.kind === 'observed-only' &&
    keysMatch(v, ['kind', 'datasetId', 'observedBluffs', 'observedValues']) &&
    v.datasetId === 'selection-default-v1' &&
    v.observedBluffs === 30 &&
    v.observedValues === 420
  )
    return success({ ...defaultInputs } as SelectionInputs)
  if (v.kind === 'disclosed' && keysMatch(v, ['kind', 'parameters'])) {
    const parameters = decodeSelectionParameters(v.parameters)
    if (!parameters.ok) return parameters
    return success({ kind: 'disclosed', parameters: parameters.value })
  }
  return failure(
    'inputs',
    'Use the fixed observed-only dataset or explicitly disclosed exploration parameters.',
  )
}
export const selectionExperimentModel = validatedModel(
  decodeSelectionInputs,
  (inputs) =>
    calculate(
      inputs.kind === 'observed-only'
        ? { ...defaultParameters }
        : inputs.parameters,
    ),
)
export function encodeSelectionInputs(
  inputs: Readonly<SelectionInputs>,
): JsonValue {
  if (inputs.kind === 'observed-only')
    return {
      kind: inputs.kind,
      datasetId: inputs.datasetId,
      observedBluffs: inputs.observedBluffs,
      observedValues: inputs.observedValues,
    }
  return { kind: inputs.kind, parameters: { ...inputs.parameters } }
}
export function encodeSelectionResult(output: SelectionOutput): JsonValue {
  return { ...output, parameters: { ...output.parameters } }
}
export function decodeSelectionResult(
  v: unknown,
): ModelResult<SelectionOutput> {
  if (!isRecord(v)) return failure('result', 'Invalid selection result.')
  const p = decodeSelectionParameters(v.parameters)
  if (!p.ok) return p
  const expected = calculate(p.value)
  if (
    !keysMatch(v, Object.keys(expected)) ||
    Object.entries(expected).some(
      ([key, value]) => key !== 'parameters' && v[key] !== value,
    )
  )
    return failure(
      'result',
      'Selection summary does not reconcile with its declared finite model.',
    )
  return success(expected)
}
