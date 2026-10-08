import type { ExperienceManifest } from '../../core/types'
import { selectionFragment } from './cases'
import { selectionSources } from './sources'
import {
  decodeSelectionInputs,
  decodeSelectionResult,
  defaultInputs,
  encodeSelectionInputs,
  encodeSelectionResult,
  selectionExperimentModel,
  type SelectionInputs,
  type SelectionOutput,
} from './model'

export const selectionManifest: ExperienceManifest<
  SelectionInputs,
  SelectionOutput
> = {
  id: 'selection',
  title: 'Selection, observation and missing outcomes',
  version: 'selection-v1',
  inputVersion: 1,
  conceptIds: ['A03', 'B05'],
  unitIds: ['f05'],
  defaultInputs,
  decodeInputs: decodeSelectionInputs,
  model: selectionExperimentModel,
  encodeInputs: encodeSelectionInputs,
  encodeResult: encodeSelectionResult,
  decodeResult: decodeSelectionResult,
  loadView: () => import('./View'),
  cases: [selectionFragment],
  sources: selectionSources,
  assumptions: [
    'Two-class synthetic population; expected masses under independent class-specific recording probabilities, not current live hand records.',
    'Correction requires the observation mechanism to be known and both class-specific observation probabilities strictly positive.',
    'A population reveal is simulator knowledge, not knowledge inferred from the selected sample.',
  ],
  limitations: [
    'No causal policy evaluation, missing-hand imputation, opponent-range reconstruction or hidden cards.',
    'Unknown or zero recording rates do not identify omitted class prevalence. Repeated or imputed labels do not independently validate assumptions.',
    'Deterministic expected counts isolate selection bias; finite realized samples would introduce sampling noise. No confidence interval or causal identification is claimed.',
  ],
  controls:
    'Observed-only first commitment; after reveal, disclosed population size 100–10,000 (integer), target prevalence and recording rates 0–1, with a known-rate assumption toggle. All counts labeled expected; fractional masses retained.',
  probabilityInterpretation:
    'Physical class and recording probabilities in an authored hypothetical population, not market pricing, a learned opponent range, or empirical loan approval/default rates.',
}
