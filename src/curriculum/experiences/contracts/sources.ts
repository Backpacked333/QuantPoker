import type { EvidenceReference, SourceRecord } from '../../core/types'
import { pricingSource } from '../../content/sources'

export const deductibleSource: EvidenceReference = {
  sourceId: 'soa-deductible-ratemaking',
  claim:
    'A per-loss deductible reimburses the positive part of loss minus deductible; deductibles can censor and truncate observed insurance claims.',
  locator:
    'Lee and Frees (2016), section 1, risk-sharing function g(Yj; d) and observed/censored/truncated definitions',
  verification: 'checked',
  checkedAt: '2026-10-07T08:17:00.000Z',
}
export const contractReferences: readonly EvidenceReference[] = [
  deductibleSource,
  pricingSource,
  {
    sourceId: pricingSource.sourceId,
    claim:
      'Long puts pay the positive strike-minus-terminal-price amount; option portfolios add their state payments, and stock plus put has a protected downside payoff.',
    locator:
      'Recitation 5, slides 3–5, long-put payoff profile, sum of option payoffs and stock-plus-put portfolio',
    verification: 'checked',
    checkedAt: '2026-10-07T08:23:00.000Z',
  },
]
export const contractSources: readonly SourceRecord[] = [
  {
    id: deductibleSource.sourceId,
    title: 'SOA — General Insurance Deductible Ratemaking (Lee and Frees)',
    url: 'https://www.soa.org/globalassets/assets/files/research/projects/research-2016-gi-deductible-ratemaking.pdf',
    references: [deductibleSource],
    originalExamples:
      'All capped layers, distribution probabilities, occurrence/aggregate wording, premiums and funding examples are original hypothetical contracts. The cap identity is elementary algebra, not a market quotation or a statement of real policy wording.',
  },
]
