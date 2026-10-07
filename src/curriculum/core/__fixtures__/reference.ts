import type { CaseRecord, ExperienceManifest } from '../types'
import { baseCases } from '../../content/foundationCases/baseBanks'
export const referenceCase: CaseRecord = {
  ...baseCases.find((c) => c.unitId === 'f03' && c.mode === 'practice')!,
  id: 'reference-1',
  mode: 'transfer',
}
import {
  failure,
  isRecord,
  numberIn,
  success,
  validatedModel,
} from '../validation'
export interface ReferenceInputs {
  probability: number
  existingPot: number
  callCost: number
}
export interface ReferenceOutput {
  expectedProfit: number
  breakEvenProbability: number | null
}
export function decodeReferenceInputs(v: unknown) {
  if (
    !isRecord(v) ||
    Object.keys(v).some(
      (k) => !['probability', 'existingPot', 'callCost'].includes(k),
    ) ||
    !numberIn(v.probability, 0, 1) ||
    !numberIn(v.existingPot, 0, 10000) ||
    !numberIn(v.callCost, 0, 10000)
  )
    return failure('inputs', 'Use probability0–1 and currency0–10,000.')
  return success({
    probability: v.probability,
    existingPot: v.existingPot,
    callCost: v.callCost,
  })
}
export const referenceModel = validatedModel(
  decodeReferenceInputs,
  ({ probability: p, existingPot: pot, callCost: cost }) => ({
    expectedProfit: p * pot - (1 - p) * cost,
    breakEvenProbability: pot + cost === 0 ? null : cost / (pot + cost),
  }),
)
export function decodeReferenceOutput(v: unknown) {
  if (
    !isRecord(v) ||
    Object.keys(v).some(
      (k) => !['expectedProfit', 'breakEvenProbability'].includes(k),
    ) ||
    !numberIn(v.expectedProfit, -10000, 10000) ||
    !(v.breakEvenProbability === null || numberIn(v.breakEvenProbability, 0, 1))
  )
    return failure('result', 'Invalid finite model output.')
  return success({
    expectedProfit: v.expectedProfit,
    breakEvenProbability: v.breakEvenProbability as number | null,
  })
}
export const referenceManifest: ExperienceManifest<
  ReferenceInputs,
  ReferenceOutput
> = {
  id: 'information',
  title: 'Contract reference fixture — not a production lab',
  version: 'reference-1',
  inputVersion: 1,
  conceptIds: ['C01'],
  unitIds: ['f03'],
  defaultInputs: { probability: 0.3, existingPot: 100, callCost: 25 },
  decodeInputs: decodeReferenceInputs,
  model: referenceModel,
  encodeInputs: (inputs) => ({ ...inputs }),
  encodeResult: (result) => ({ ...result }),
  decodeResult: decodeReferenceOutput,
  loadView: () => import('./ReferenceView'),
  cases: [],
  sources: [],
  assumptions: [
    'Terminal call; physical probability treated as known; no fees, ties or default.',
  ],
  limitations: [
    'This fixture teaches integration, not a shipped specialist experience.',
  ],
  controls:
    'Probability fraction0–1; existing pot and call cost in currency0–10,000.',
  probabilityInterpretation:
    'Physical terminal win probability, not a pricing weight.',
}
