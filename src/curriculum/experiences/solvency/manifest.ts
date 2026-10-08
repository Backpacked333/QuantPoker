import type { ExperienceManifest } from '../../core/types'
import {
  defaultInputs,
  decodeInputs,
  decodeResult,
  solvencyModel,
  type SolvencyInputs,
  type SolvencyOutput,
} from './model'
import { solvencyFragments } from './cases'
import { solvencySources } from './sources'

export const solvencyManifest: ExperienceManifest<
  SolvencyInputs,
  SolvencyOutput
> = {
  id: 'solvency',
  title: 'Solvency: can a profitable promise be paid?',
  version: 'solvency-v1',
  inputVersion: 1,
  conceptIds: ['E06', 'E08', 'H02', 'H03', 'I01'],
  unitIds: ['f07', 'f09', 'f10'],
  defaultInputs,
  decodeInputs,
  model: solvencyModel,
  decodeResult,
  encodeInputs: (input) => ({ ...input }),
  encodeResult: (output) => ({
    ...output,
    states: output.states.map((state) => ({ ...state })),
  }),
  loadView: () => import('./View'),
  cases: solvencyFragments,
  sources: solvencySources,
  assumptions: [
    'One period; fixed nonnegative claim severity; collected premiums plus external capital available at settlement; no expenses, interest, borrowing or reinsurance.',
    'With probability rho one common Bernoulli(p) event drives all policies; otherwise the events are independent Bernoulli(p). Both branches have identical marginal physical p.',
    'Settlement pays min(promised claims,funds); shareholders keep remaining funds and subtract initially contributed capital to measure their net result.',
  ],
  limitations: [
    'This dependence family is not a universal correlation/tail model. Pairwise event correlation equals rho only for N>1 and 0<p<1; it is unavailable otherwise.',
    'No correlated severity, dynamic reserving, regulatory ratio, legal priority, market price or seller-specific credit curve. Original hypothetical business terms, not industry data.',
    'Expected unpaid claims means E[max(claims−funds,0)], not VaR or TVaR. Exact distribution enumeration uses finite floating point; underflow is explicitly labeled and log probabilities retained.',
  ],
  controls:
    'N integer1–500; physical p fraction0–1; S currency1–1000; h currency0–200; K currency0–100000; mixture rho fraction0–1.',
  probabilityInterpretation:
    'Physical claim probability p, not a risk-neutral pricing weight; enumerated model expectations and inspected state ledgers, not empirically observed claim frequencies.',
}
