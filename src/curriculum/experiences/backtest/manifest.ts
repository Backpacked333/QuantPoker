import type { ExperienceManifest } from '../../core/types'
import {
  backtestModel,
  defaultInputs,
  decodeInputs,
  decodeResult,
  encodeResult,
  MODEL_VERSION,
  type BacktestInputs,
  type BacktestOutput,
} from './model'
import { backtestFragment } from './cases'
import { sources } from './sources'

export const backtestManifest: ExperienceManifest<
  BacktestInputs,
  BacktestOutput
> = {
  id: 'backtest',
  title: 'Backtest selection and held-out evaluation',
  version: MODEL_VERSION,
  inputVersion: 1,
  conceptIds: ['B01', 'L01', 'L05', 'L06', 'L07', 'L08'],
  unitIds: ['f10'],
  defaultInputs,
  decodeInputs,
  model: backtestModel,
  encodeInputs: (i) => ({ ...i }),
  encodeResult,
  decodeResult,
  loadView: () => import('./View'),
  cases: [backtestFragment],
  sources,
  assumptions: [
    'Synthetic candidate observations are independent ±1 with physical p=0.5; all candidates have zero true gross edge.',
    'Cost is subtracted once per observation in both data roles.',
    'Wilson 95% intervals assume independent identically distributed Bernoulli outcomes; the transformed interval describes the fixed selected policy, not its selected development mean.',
  ],
  limitations: [
    'This is not historical market data, PBO/CSCV, a significance test, or a professional alpha claim.',
    '1−(1−α)^M is an illustration for M independent exact-size null tests, not the significance level of selecting the largest raw development mean.',
    'Named pseudorandom streams and local protocol hashes support replay, not cryptographic secrecy, guaranteed disjoint PRNG cycles, secure certification, or tamper prevention.',
    'Holdout reuse consumes evaluation independence. Real financial dependence and nonstationarity need additional validation.',
  ],
  controls:
    'Candidates 1–200; development 20–2,000 and holdout 100–5,000 observations; cost 0–0.10 outcome units per observation. Fresh uint32 seed comes from the shared experiment controller.',
  probabilityInterpretation:
    'Stipulated physical probability 0.5 for synthetic ±1 outcomes; not a market pricing probability.',
}
export default backtestManifest
