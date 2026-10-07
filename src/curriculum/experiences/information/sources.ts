import type { EvidenceReference, SourceRecord } from '../../core/types'

export const sourceReferences: readonly EvidenceReference[] = [
  {
    sourceId: 'mit-probability',
    claim:
      'Bayes inversion combines a prior with the likelihood of observed data; it does not identify a posterior with sensitivity.',
    locator:
      'MIT 18.05, Class 10 Introduction to Statistics, section 3 Review of Bayes’ theorem, pages 3–4, screening example 6',
    verification: 'checked',
    checkedAt: '2026-10-07T08:02:00.000Z',
  },
  {
    sourceId: 'mit-real-options-information',
    claim:
      'Managerial flexibility can have value because new information permits a different investment decision; useful real-option opportunities require arriving news that may affect decisions.',
    locator:
      'MIT 15.402 lecture 19A, slide 3 Real Options: Valuing Flexibility, and slide 8 Is There An Option? (arriving news may affect decisions)',
    verification: 'checked',
    checkedAt: '2026-10-07T08:02:00.000Z',
  },
]
export const informationSources: readonly SourceRecord[] = [
  {
    id: 'mit-real-options-information',
    title: 'MIT Finance Theory II — Real Options',
    url: 'https://ocw.mit.edu/courses/15-402-finance-theory-ii-spring-2003/a457b5bed88526ea5153fcaab30ef773_lec19arealoptions.pdf',
    references: [sourceReferences[1]],
    originalExamples:
      'All signal likelihoods, project terms, fees and business cases are original hypothetical exercises. The one-period EVSI formulas are derived from the displayed finite ledger, not attributed to this lecture or calibrated to an industry.',
  },
]
export const assumptions = [
  'A single binary success/failure state and a known prior and likelihood model; quantities are hypothetical, not fitted historical estimates.',
  'Risk-neutral expected incremental profit; taking yields +G or −C, declining yields zero before fees. G and C already include all non-research costs.',
  'Research is private and optional, paid before observing the signal. Its fee is paid even after declining; the signal arrives before the action becomes irreversible.',
  'Payoffs, prior and likelihoods do not change when research is purchased. The decision maker may ignore the signal and can fund either action.',
  'One settlement date, no interest, taxes, liquidity constraints, financing, counterparty default or subsequent signals.',
]
export const limitations = [
  'Physical probabilities describe the stipulated outcomes, not risk-neutral pricing weights or a quoted market price.',
  'A public signal could change an offered price, rivals’ behavior or contract terms; this model does not calculate endogenous market responses. Recompute using changed terms rather than asserting free informational profit.',
  'A signal after an irreversible commitment cannot create this action-contingent value. The unconditional expected profit of a fixed unchanged claim remains the same when branch contributions are recombined.',
  'Risk aversion, uncertain likelihoods, wealth constraints and multiperiod research require a different objective or model. No realized profits or mastery are inferred from these expected values.',
]
