import type { ExperienceManifest } from '../../core/types'
import {
  contractModel,
  decodeInputs,
  decodeResult,
  defaults,
  type ContractInputs,
  type ContractOutput,
} from './model'
import { contractFragments } from './cases'
import { contractSources } from './sources'

export const contractManifest: ExperienceManifest<
  ContractInputs,
  ContractOutput
> = {
  id: 'contracts',
  title: 'Contracts, layers and protection',
  version: '1.0',
  inputVersion: 1,
  conceptIds: ['F01', 'F03', 'F04', 'F06', 'H02', 'H05'],
  unitIds: ['f08', 'f09'],
  defaultInputs: defaults.layer,
  decodeInputs,
  model: contractModel,
  encodeInputs: (i) => JSON.parse(JSON.stringify(i)),
  encodeResult: (o) => JSON.parse(JSON.stringify(o)),
  decodeResult,
  loadView: () => import('./View'),
  cases: contractFragments,
  sources: contractSources,
  assumptions: [
    'Fully funded promised payments equal actual payments in all three laboratory modes.',
    'Premium is a supplied nonnegative one-time cost, not derived from the payout profile.',
    'No coinsurance, exclusions, interest, dividends or early exercise. Wording mode applies deductible and limit on the same selected basis.',
  ],
  limitations: [
    'Shape identity is not a market pricing identity. Physical expectations are not risk-neutral prices.',
    'Funding/default, asset replication and real policy wording require separate models.',
    'Poker cashout sells a claim; it is not automatically loss-only insurance.',
  ],
  controls:
    'Mode, loss, deductible, limit, premium, 2–5 physical distribution states, asset initial/terminal prices, optional protection cap, two occurrence losses and aggregation basis.',
  probabilityInterpretation:
    'Loss-layer probabilities are physical probabilities over supplied mutually exclusive loss states, validated to total one without normalization. Asset and wording tables are state scenarios, not distributions; their expectations are unavailable.',
}
