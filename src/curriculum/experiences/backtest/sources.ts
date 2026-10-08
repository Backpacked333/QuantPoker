import type { EvidenceReference, SourceRecord } from '../../core/types'

export const backtestReference: EvidenceReference = {
  sourceId: 'bailey-backtest',
  claim:
    'Searching many strategy configurations can fit past noise and create false positives. Out-of-sample evidence and disclosure of search trials are distinct from a selected in-sample result.',
  locator:
    'The Probability of Backtest Overfitting (February 2015), Introduction pp.3–5; abstract cautions against assuming holdout solves all financial backtest problems.',
  verification: 'checked',
  checkedAt: '2026-10-07T08:29:04.000Z',
}
export const sources: readonly SourceRecord[] = [
  {
    id: 'bailey-backtest',
    title:
      'Bailey, Borwein, López de Prado and Zhu — The Probability of Backtest Overfitting',
    url: 'https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf',
    references: [backtestReference],
    originalExamples:
      'The independent ±1 simulator, independent exact-size-test formula, Wilson calculations and business contracts are original stipulated mathematical examples, not market data or an implementation of CSCV/PBO.',
  },
]
