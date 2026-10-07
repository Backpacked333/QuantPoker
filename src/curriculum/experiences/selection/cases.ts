import {
  authorCase,
  type Scenario,
} from '../../content/foundationCases/builders'
import type { CaseFragment, CaseRecord, Question } from '../../core/types'
import { selectionReference } from './sources'

interface FinanceScenario {
  title: string
  role: string
  event: string
  other: string
  population: string
  mechanism: string
  observed: readonly [number, number]
  rates: readonly [number, number]
  correctedPercent: number | null
  reversal: string
  reversalAnswer: string
}
function finance(s: FinanceScenario): Scenario {
  const total = s.observed[0] + s.observed[1]
  const observedPercent = total > 0 ? (s.observed[0] / total) * 100 : null
  const defined = s.correctedPercent !== null
  return {
    title: s.title,
    role: s.role,
    objective: `Audit whether recorded ${s.event} labels describe ${s.population}; choose a defensible inference, not a trading or lending recommendation.`,
    information: [
      `Target population: ${s.population}. Outcome categories: ${s.event} versus ${s.other}.`,
      `Observation mechanism: ${s.mechanism}`,
      `Expected recorded counts: ${s.observed[0]} ${s.event}, ${s.observed[1]} ${s.other}. Counts are deterministic expected masses, not realized observations.`,
      `Known probabilities of recording a label: ${s.rates[0]} for ${s.event}; ${s.rates[1]} for ${s.other}. The target class share is not supplied.`,
      'Commit a population-share prediction and a decision-changing assumption before viewing answers. Unknown rates in an actual application would not authorize this correction.',
    ],
    states: [
      s.event,
      s.other,
      'Outcome label unobserved under the observation rule',
    ],
    cashFlows:
      'One-period outcome labels only; no dollars, fees, borrowing or investment returns are supplied. Rejected or unrecorded units do not have measured cash flows in this dataset. No expected-profit decision can be inferred from these labels alone.',
    setup: {
      prompt: 'Which is the denominator for the target prevalence?',
      correct: `${s.population}, including units without an observed label.`,
      wrong: `Only the ${total} recorded units.`,
      rationale:
        'The target and the selected observed sample are different populations. A missing label is not a negative outcome.',
    },
    calculation: defined
      ? {
          prompt: `Using both known positive observation rates, calculate the corrected target ${s.event} share in percent.`,
          expected: s.correctedPercent!,
          units: 'percent',
          tolerance: 0.01,
          rationale: `Inverse-weight counts, then normalize: (${s.observed[0]}/${s.rates[0]}) / [(${s.observed[0]}/${s.rates[0]}) + (${s.observed[1]}/${s.rates[1]})] × 100. Do not use the selected share ${observedPercent?.toFixed(4)}% as the target share.`,
        }
      : {
          prompt:
            'Calculate the total expected recorded count (not a target prevalence).',
          expected: total,
          units: 'expected recorded units',
          tolerance: 0.001,
          rationale: `Add ${s.observed[0]} + ${s.observed[1]}. A recorded total of zero makes the observed conditional share unavailable, not zero.`,
        },
    interpretation: {
      prompt: defined
        ? 'What does this inverse-probability result establish?'
        : 'What target share is identifiable from these recorded counts?',
      correct: defined
        ? 'A target class share in this exact synthetic model, conditional on the supplied known positive class-specific recording probabilities.'
        : 'Unavailable: a class with zero observation probability cannot be recovered from observed counts alone.',
      wrong: defined
        ? 'The causal effect of changing which applications or claims are selected.'
        : 'Exactly zero, because no labels were recorded for that class.',
      rationale: defined
        ? 'Weighting reverses the stated observation filter; it does not establish a causal effect or validate the rates in a real decision system.'
        : 'Positivity fails. Knowing the zero rate does not supply the missing class count; independent population information is required.',
    },
    limitation: {
      prompt:
        'Would model-imputed missing outcomes or a larger sample independently validate this inference?',
      correct:
        'No. Imputed labels recycle model assumptions; sample size reduces sampling noise but does not repair selection bias or identify a causal policy effect.',
      wrong:
        'Yes. A large or imputed labeled dataset automatically represents the target and identifies the effect of selection.',
      rationale:
        'Selection bias comes from who gets recorded; sampling noise is random variation around that recording model; causal identification requires a separate intervention model and assumptions.',
    },
    reversal: {
      prompt: s.reversal,
      correct: s.reversalAnswer,
      wrong:
        'The previous observed share remains the target prevalence regardless of the new observation rule.',
      rationale:
        'The observation rule and known rates can change the inference. Equal positive class rates preserve the target share; zero rates destroy recoverability.',
    },
    solution: [
      `Observed share: ${observedPercent === null ? 'Unavailable (0/0)' : `${s.observed[0]}/${total} = ${observedPercent.toFixed(4)}%`}.`,
      defined
        ? `Corrected share: ${s.correctedPercent?.toFixed(4)}%, using both inverse weights and a positive denominator.`
        : 'Corrected share: Unavailable. At least one zero observation rate violates positivity; do not divide by zero or infer absence.',
      'In a realized random sample, inverse weighting would still have estimation noise. Here the exact expected-count construction isolates the selection mechanism.',
      'Real loan decisions also raise unobserved potential outcomes under different loan terms. This exercise assumes one fixed outcome definition; no causal lending policy is evaluated.',
    ],
    assumptions: [
      'Original hypothetical one-period model; class labels are defined for the target under fixed comparable terms, whether or not recorded.',
      'Supplied class-specific recording probabilities apply throughout the target. They are assumptions, not estimates from selected labels.',
      'No model-imputed outcome counts as an independent observation. No market price, security value or causal effect is calculated.',
    ],
    connection: 'separate-finance',
    actions: [
      'Report selected-sample statistic only',
      'Report conditional known-rate correction',
      'Report target prevalence unavailable',
    ],
  }
}
const scenarios: readonly FinanceScenario[] = [
  {
    title: 'Approved loans are not all applications',
    role: 'Credit model auditor',
    event: 'would default under the stated loan terms',
    other: 'would repay under those same terms',
    population: 'all applicants, including rejected applications',
    mechanism:
      'Only approved loans receive repayment labels. Rejected applications have no repayment label. Approval rates differ by the synthetic fixed-term outcome class.',
    observed: [12, 228],
    rates: [0.2, 0.8],
    correctedPercent: (60 / 345) * 100,
    reversal:
      'If both outcome classes instead had known approval probability 0.5, what relation would expected recorded and target shares have?',
    reversalAnswer:
      'They would be equal; equal positive observation probabilities remove this class-selection distortion in expectation.',
  },
  {
    title: 'Funded investments overrepresent successes',
    role: 'Investment committee analyst',
    event: 'would succeed under the specified funding plan',
    other: 'would fail under that same plan',
    population: 'all candidate projects evaluated under one fixed funding plan',
    mechanism:
      'Only funded projects produce recorded outcome labels. In the hypothetical model, likely-success projects are more often funded than likely-failure projects.',
    observed: [63, 72],
    rates: [0.7, 0.2],
    correctedPercent: 20,
    reversal:
      'If project labels were collected independently of the funding decision with equal positive recording rates, what would change?',
    reversalAnswer:
      'Expected observed prevalence would match the fixed-plan population prevalence; this alone would still not identify the causal effect of funding.',
  },
  {
    title: 'A claims database cannot see unreported losses',
    role: 'Insurance data auditor',
    event: 'loss',
    other: 'no loss',
    population: 'all covered exposures, including unreported losses',
    mechanism:
      'The faulty audit feed records some no-loss exposures but never records a loss label. Absence from the feed is not proof of no loss.',
    observed: [0, 150],
    rates: [0, 0.5],
    correctedPercent: null,
    reversal: 'What evidence could make the missing loss class observable?',
    reversalAnswer:
      'An independent audit with a known positive probability of recording both outcome classes, plus labels from that audit.',
  },
  {
    title: 'Review: an approval rule enriched for risk',
    role: 'Credit review analyst',
    event: 'default',
    other: 'repayment',
    population: 'all applicants under fixed comparable loan terms',
    mechanism:
      'A high-risk pilot approves the default class more often. Labels exist only for approvals, not rejected applications.',
    observed: [30, 170],
    rates: [0.75, 0.25],
    correctedPercent: (40 / 720) * 100,
    reversal:
      'If approval rates became unknown after the pilot, could the same correction be used?',
    reversalAnswer:
      'No. The selected default share could still be reported, but target correction would be unavailable without defensible positive rates.',
  },
  {
    title: 'Review: cautious funding misses successes',
    role: 'Portfolio research reviewer',
    event: 'success',
    other: 'failure',
    population: 'all prospective projects under the same modeled funding plan',
    mechanism:
      'A conservative screen funds more eventual failures than successes in this synthetic variant; unfunded outcomes are not independently labeled.',
    observed: [24, 216],
    rates: [0.2, 0.6],
    correctedPercent: 25,
    reversal:
      'Could repeatedly imputing the unfunded labels validate the corrected success prevalence?',
    reversalAnswer:
      'No. Imputed labels depend on the model; independent labels and a defensible observation mechanism would be needed for validation.',
  },
  {
    title: 'Review: the audit feed records nothing',
    role: 'Claims research reviewer',
    event: 'loss',
    other: 'no loss',
    population: 'all covered exposures',
    mechanism:
      'Both recording rates are zero after an audit-feed outage; there are no observed labels of either class.',
    observed: [0, 0],
    rates: [0, 0],
    correctedPercent: null,
    reversal:
      'Would restoring only no-loss recording to a positive rate identify the population loss prevalence?',
    reversalAnswer:
      'No. Loss recording would still be zero; restoring both classes with positive known rates and obtaining data is required.',
  },
]
function authored(index: number, mode: 'transfer' | 'review'): CaseRecord {
  const c = authorCase(
    'f05',
    mode,
    String((index % 3) + 1),
    finance(scenarios[index]),
    [selectionReference],
  )
  return {
    ...c,
    id: `f05-selection-${mode}-${(index % 3) + 1}`,
    questions: c.questions.map(
      (q): Question => ({
        ...q,
        critical: q.critical || q.component === 'calculation',
      }),
    ),
  }
}
export const selectionCases: readonly CaseRecord[] = [
  ...[0, 1, 2].map((i) => authored(i, 'transfer')),
  ...[3, 4, 5].map((i) => authored(i, 'review')),
]
export const selectionFragment: CaseFragment = {
  slotId: 'f05-selection',
  unitId: 'f05',
  cases: selectionCases,
  sources: [selectionReference],
}
