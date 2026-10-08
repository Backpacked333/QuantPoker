import type { ExperienceManifest } from '../../core/types'
import { informationFragments } from './cases'
import { assumptions, informationSources, limitations } from './sources'
import {
  decodeInputs,
  decodeResult,
  defaultInputs,
  encodeInputs,
  encodeResult,
  informationModel,
  type InformationInputs,
  type InformationOutput,
} from './model'

export const informationManifest: ExperienceManifest<
  InformationInputs,
  InformationOutput
> = {
  id: 'information',
  title: 'Price the next piece of information',
  version: '1.0.0',
  inputVersion: 1,
  conceptIds: ['A06', 'C04', 'C06'],
  unitIds: ['f03', 'f05', 'f10'],
  defaultInputs,
  decodeInputs,
  decodeResult,
  encodeInputs,
  encodeResult,
  model: informationModel,
  loadView: () => import('./View'),
  cases: informationFragments,
  sources: informationSources,
  assumptions,
  limitations,
  controls:
    'Prior p, sensitivity s and specificity t:0–1 (step .01); success gain G:1–500; failure loss C:0–200; research fee k:0–100 (money step1). Typed finite in-range fractions remain valid. Research fee is charged before the optional action.',
  probabilityInterpretation:
    'Physical probabilities under a specified one-period binary signal model, never market pricing weights. Results are exact modeled expectations, not realized profits or mastery evidence.',
}
