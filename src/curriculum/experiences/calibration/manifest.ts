import type { ExperienceManifest } from '../../core/types'
import { immutable } from '../../core/validation'
import { calibrationFragment } from './cases'
import { sourceRecords } from './sources'
import {
  calibrationModel,
  decodeInputs,
  decodeResult,
  defaultInputs,
  encodeInputs,
  encodeResult,
  type CalibrationInputs,
  type CalibrationOutput,
} from './model'

export const calibrationManifest: ExperienceManifest<
  CalibrationInputs,
  CalibrationOutput
> = Object.freeze({
  id: 'calibration',
  title: 'Forecast quality and decision value',
  version: 'calibration-model-v1',
  inputVersion: 1,
  conceptIds: Object.freeze(['B02', 'B03', 'B04']),
  unitIds: Object.freeze(['f05'] as const),
  defaultInputs,
  decodeInputs,
  model: calibrationModel,
  encodeInputs,
  encodeResult,
  decodeResult,
  loadView: () => import('./View'),
  cases: immutable([calibrationFragment]),
  sources: immutable(sourceRecords),
  assumptions: Object.freeze([
    'Two public groups form an exhaustive population; the second group weight is one minus the first.',
    'True success probabilities are stipulated physical probabilities, not observed estimates, private poker cards or pricing probabilities.',
    'One decision precedes one terminal net payoff: continue pays +gain on success and −loss on failure; decline pays zero.',
    'The informed forecast knows the stipulated public group risk. Exact expected Brier loss and expected action values use that same population.',
  ]),
  limitations: Object.freeze([
    'No sample has been drawn: reliability points are population-model expectations, not empirical proof of calibration.',
    'The forecast is not a promise of settlement; forecast quality alone cannot show decision value or future profit.',
    'No data-acquisition costs, fees, discounting, funding constraints, uncertainty about the true parameters or risk aversion are modeled.',
    'Business scenarios are hypothetical; no regulatory advice or empirical educational effectiveness is claimed.',
  ]),
  controls:
    'Group-1 weight and both success probabilities 0–1 (fraction), positive net gain 1–500 and loss 0–200 (currency units). Group 2 weight = 1−group 1 weight. Forecasts are not editable: baseline is the population mean; informed uses group probability.',
  probabilityInterpretation:
    'Stipulated physical success probabilities. Baseline selects one pooled action, informed selects by public group; both are evaluated using true group probabilities. Lower Brier loss is better; greater policy value is better. Indifferent means exactly zero expected net action value.',
})
