import type { EvidenceReference, SourceRecord } from '../../core/types'

export const selectionReference: EvidenceReference = {
  sourceId: 'selective-labels-kdd17',
  claim:
    'Labels observed after prior human decisions may form a selected rather than representative population sample. This motivates inspecting the observation mechanism; it does not identify unobserved counterfactual outcomes.',
  locator: 'Abstract and §1 Introduction, PDF pp. 1–2',
  verification: 'checked',
  checkedAt: '2026-10-07',
}
export const selectionSources: readonly SourceRecord[] = [
  {
    id: selectionReference.sourceId,
    title:
      'The Selective Labels Problem: Evaluating Algorithmic Predictions in the Presence of Unobservables',
    url: 'https://www.cs.cornell.edu/home/kleinber/kdd17-selective.pdf',
    references: [selectionReference],
    originalExamples:
      'All bet, loan, investment and claims counts and recording probabilities here are original hypothetical finite models, not empirical data. Inverse-probability arithmetic is checked directly against the supplied model, not claimed as validation of this curriculum or implementation of the paper’s research method.',
  },
]
