import type { EvidenceReference, SourceRecord } from '../../core/types'

export const solvencyReferences: readonly EvidenceReference[] = [
  {
    sourceId: 'solvency-mit-covariance',
    claim:
      'Variance of a sum includes pairwise covariance terms; independent variables have zero covariance. The specified common-event mixture is an original exercise, not a general dependence law.',
    locator:
      'RES.6-012, L12-07 transcript (MITRES6_012S18_L12-07_300k): variance of sums',
    verification: 'checked',
    checkedAt: '2026-10-07',
  },
  {
    sourceId: 'solvency-soa-risk-measures',
    claim:
      'Loss distributions support risk measurement; distributions sharing means and variances can have different tails. Our unpaid-claim expectation is E[max(claims − funds,0)], not a regulatory capital ratio or a VaR/TVaR calibration.',
    locator:
      'Hardy, An Introduction to Risk Measures for Actuarial Applications (2006), §§1 and 2.1, pp.1–4',
    verification: 'checked',
    checkedAt: '2026-10-07',
  },
]
export const solvencySources: readonly SourceRecord[] = [
  {
    id: 'solvency-mit-covariance',
    title: 'MIT RES.6-012 — Covariance and Correlation',
    url: 'https://ocw.mit.edu/courses/res-6-012-introduction-to-probability-spring-2018/4db7bc1d0e94ba77338301aa22f08900_GH7dwoXSD0s.pdf',
    references: [solvencyReferences[0]],
    originalExamples:
      'All business quantities and the Bernoulli common-event mixture are original hypothetical exercises.',
  },
  {
    id: 'solvency-soa-risk-measures',
    title:
      'Mary Hardy — An Introduction to Risk Measures for Actuarial Applications',
    url: 'https://www.soa.org/globalassets/assets/Files/Edu/C-25-07.pdf',
    references: [solvencyReferences[1]],
    originalExamples:
      'All warranty and insurance terms are hypothetical; no legal priority or regulatory calculation is claimed.',
  },
]
