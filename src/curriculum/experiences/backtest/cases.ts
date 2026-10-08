import type { CaseFragment, CaseRecord, Question } from '../../core/types'
import { backtestReference } from './sources'

type FinanceTerms = {
  title: string
  role: string
  opportunity: string
  gain: number
  loss: number
  payment: number
  premium: number
  cost: number
  probability: number
  candidates: number
  development: number
  holdout: number
  expected: number
  reversal: string
  warranty?: { capital: number; claims: number; ownClaim: number }
}
const terms: readonly FinanceTerms[] = [
  {
    title: 'Equipment service: selected diagnostic policy',
    role: 'Equipment service buyer',
    opportunity:
      'A diagnostic signal identifies a service opportunity; loss-only protection pays only on downtime.',
    gain: 90,
    loss: 150,
    payment: 100,
    premium: 12,
    cost: 3,
    probability: 0.65,
    candidates: 20,
    development: 100,
    holdout: 1000,
    expected: 26,
    reversal:
      'Lower conditional success probability or an unfunded protector could reverse a positive modeled service decision.',
  },
  {
    title: 'Seasonal inventory: paid demand research',
    role: 'Seasonal inventory buyer',
    opportunity:
      'A paid demand report chooses an inventory policy; protection reimburses only part of a weak-demand loss.',
    gain: 120,
    loss: 80,
    payment: 40,
    premium: 10,
    cost: 5,
    probability: 0.55,
    candidates: 12,
    development: 80,
    holdout: 600,
    expected: 33,
    reversal:
      'If the report is selected using final-season demand, the claimed evidence is invalid; lower physical demand probability can reverse the purchase.',
  },
  {
    title: 'Warranty book: common event and limited capital',
    role: 'Warranty buyer reviewing a selected pricing policy',
    opportunity:
      'A common event triggers simultaneous covered losses. Seller capital settles all valid claims pro rata, not at the promised face value.',
    gain: 40,
    loss: 50,
    payment: 25,
    premium: 4,
    cost: 2,
    probability: 0.75,
    candidates: 30,
    development: 60,
    holdout: 800,
    expected: 17.75,
    reversal:
      'Less seller capital or higher common-event probability can reverse the decision; more contracts do not diversify away a common shock.',
    warranty: { capital: 100, claims: 200, ownClaim: 50 },
  },
  {
    title: 'Review: new service and diagnostic numbers',
    role: 'Equipment service buyer',
    opportunity:
      'A new diagnostic policy and loss-only downtime protection are proposed; none of the old test data is fresh evidence.',
    gain: 100,
    loss: 180,
    payment: 110,
    premium: 16,
    cost: 4,
    probability: 0.6,
    candidates: 16,
    development: 120,
    holdout: 1200,
    expected: 12,
    reversal:
      'At success probability 0.4 the protected expectation is negative; operational decisions must use justified physical probabilities, not the selected score.',
  },
  {
    title: 'Review: a new seasonal order',
    role: 'Seasonal inventory buyer',
    opportunity:
      'A paid forecast and a loss-only inventory contract support a new order; the consumed season is retained in the search ledger.',
    gain: 90,
    loss: 100,
    payment: 30,
    premium: 9,
    cost: 6,
    probability: 0.5,
    candidates: 25,
    development: 90,
    holdout: 900,
    expected: -5,
    reversal:
      'A success probability of 0.6 makes the stipulated ledger positive, but does not fix a leaked evaluation protocol.',
  },
  {
    title: 'Review: capital changes the warranty ledger',
    role: 'Warranty buyer',
    opportunity:
      'A common event triggers all valid claims. Revised capital funds pro-rata payments; prior profitable selected results cannot prove the seller is funded.',
    gain: 60,
    loss: 80,
    payment: 48,
    premium: 6,
    cost: 3,
    probability: 0.7,
    candidates: 40,
    development: 70,
    holdout: 1100,
    expected: 23.4,
    reversal:
      'Halving capital to 120 halves the common-event payment to 24; a larger common-event probability may make the net expectation negative.',
    warranty: { capital: 240, claims: 400, ownClaim: 80 },
  },
]
function choice(
  id: string,
  component: Question['component'],
  prompt: string,
  options: [string, string, string],
  answer: number,
  rationale: string,
  critical = false,
): Question {
  return {
    id,
    kind: 'choice',
    component,
    points: 10,
    critical,
    prompt,
    expected: `${id}-${answer}`,
    options: options.map((label, k) => ({
      id: `${id}-${k}`,
      label,
      rationale:
        k === answer
          ? rationale
          : `This does not respect the supplied decision time or ledger. ${rationale}`,
    })),
    rationale,
    hints: [
      'Name what was fixed before observing the evaluation.',
      'Separate selection, independent evidence and the cash ledger.',
      rationale,
      `Supported answer: ${options[answer]}`,
    ],
  }
}
function numeric(
  id: string,
  prompt: string,
  expected: number,
  units: string,
  rationale: string,
  critical = false,
): Question {
  return {
    id,
    kind: 'numeric',
    component: 'calculation',
    points: 10,
    critical,
    prompt,
    expected,
    tolerance: 1e-8,
    units,
    rationale,
    hints: [
      'Write the supplied quantities without rounding.',
      'Use the full denominator or both states; subtract every stated cost.',
      rationale,
      `The value is ${expected} ${units}.`,
    ],
  }
}
function makeCase(t: FinanceTerms, k: number): CaseRecord {
  const mode = k < 3 ? 'transfer' : 'review',
    n = (k % 3) + 1
  const hints = [
    'Arrange actions by their decision time.',
    'Development may select; primary evaluation must not tune.',
    'Commit protocol, search development, freeze, then reveal holdout.',
    'Order: register → develop → freeze → reveal.',
  ] as const
  const ledger = `${t.probability}×${t.gain} + ${1 - t.probability}×(−${t.loss}+${t.payment}) − ${t.premium} − ${t.cost} = ${t.expected}.`
  const payment = t.warranty
    ? `${t.warranty.capital}/${t.warranty.claims}×${t.warranty.ownClaim} = ${t.payment}; the unfunded remainder is not paid.`
    : `Loss-only contract pays ${t.payment} on failure and zero on success; premium ${t.premium} is paid in either state.`
  return {
    id: `f10-backtest-${mode}-${n}`,
    unitId: 'f10',
    contentVersion: 1,
    rubricVersion: 1,
    title: t.title,
    role: t.role,
    objective:
      'Decide whether a selected policy has credible independent evidence, and calculate its stipulated physical expected net cash flow without mistaking it for market pricing.',
    information: [
      t.opportunity,
      `Search ${t.candidates} candidate policies on ${t.development} observations each, then freeze one candidate before ${t.holdout} untouched observations. Selection maximizes development net mean; ties use ascending stable ID.`,
      `Conditional physical success probability ${t.probability}; success gain ${t.gain}, failure loss ${t.loss}. Premium ${t.premium} and research/processing cost ${t.cost} are paid per opportunity in either state.`,
      payment,
      'These are original hypothetical terms. The supplied conditional probability is a modeling assumption, not an estimate made certain by the selected backtest.',
    ],
    states: ['Success', 'Failure/common event'],
    actions: [
      'Reject the policy',
      'Investigate using a frozen protocol',
      'Accept only under the stipulated objective/assumptions',
    ],
    responses:
      'All candidate and contract terms are public before decision; final outcomes occur afterward. Diagnostic information is only what existed at the decision time.',
    cashFlows: `Success: +${t.gain}−${t.premium}−${t.cost}. Failure: −${t.loss}+${t.payment}−${t.premium}−${t.cost}. ${payment}`,
    constraints:
      'No borrowing, future-information features, reusing consumed tests as fresh evidence, or hidden omitted searches. Null ±1 simulation does not estimate the physical probability in this finance case.',
    assumptions: [
      'One-period physical probability supplied conditional on the stated report/signal; not a pricing weight.',
      t.warranty
        ? 'Claims share a common event; capital is dedicated and distributed pro rata.'
        : 'Protection is loss-only and fully funded under this example.',
      'Wilson intervals require Bernoulli/iid assumptions; real financial dependence/nonstationarity needs a different evaluation design.',
    ],
    connection: 'separate-finance',
    mode,
    questions: [
      {
        id: 'freeze-order',
        kind: 'ordering',
        component: 'setup',
        points: 10,
        critical: true,
        prompt: 'Order the primary research protocol.',
        options: [
          {
            id: 'register',
            label: 'Preregister hypothesis, costs, metric and falsification',
          },
          {
            id: 'develop',
            label: 'Search development candidates and keep all scores',
          },
          {
            id: 'freeze',
            label: 'Freeze chosen candidate, seed, versions and dataset roles',
          },
          { id: 'reveal', label: 'Reveal the untouched held-out evaluation' },
        ],
        expected: ['register', 'develop', 'freeze', 'reveal'],
        rationale:
          'Freeze both the candidate and full protocol before looking at evaluation outcomes.',
        hints,
      },
      numeric(
        'search-count',
        'How many candidate searches belong in the public research ledger?',
        t.candidates,
        'candidate policies',
        'Retain every tried candidate, not only the winner.',
        true,
      ),
      numeric(
        'cost-ledger',
        'What is the stipulated protected expected net cash flow per opportunity?',
        t.expected,
        'currency units',
        ledger,
        true,
      ),
      numeric(
        'actual-payment',
        'What is the actual failure-state contract payment (not the premium or promised unpaid amount)?',
        t.payment,
        'currency units',
        payment,
        true,
      ),
      choice(
        'holdout-role',
        'interpretation',
        'Which evidence can evaluate the frozen selected policy?',
        [
          'Its largest development score',
          'All previous profitable runs only',
          'Its independent untouched primary evaluation',
        ],
        2,
        'Selection used the development data. An untouched test evaluates the policy without selecting again.',
        true,
      ),
      {
        id: 'leakage',
        kind: 'classification',
        component: 'limitation',
        points: 10,
        critical: true,
        prompt: 'Classify information by decision-time availability.',
        entries: [
          {
            id: 'report',
            label: 'Diagnostic/report available before the action',
          },
          {
            id: 'future',
            label: 'Feature computed from final season/future losses',
          },
          {
            id: 'cost',
            label: 'Contract premium and processing cost fixed before action',
          },
        ],
        categories: [
          { id: 'available', label: 'Available at decision time' },
          { id: 'leak', label: 'Future-information leakage' },
        ],
        expected: ['available', 'leak', 'available'],
        rationale:
          'Final outcomes cannot be input features at an earlier decision time.',
        hints: [
          'Name the time the policy acts.',
          'Check when each field first becomes observable.',
          'The diagnostic and fixed costs precede action; final outcomes follow it.',
          'Categories: available, leakage, available.',
        ],
      },
      choice(
        'falsification',
        'interpretation',
        'The preregistered edge claim requires the lower 95% net-mean bound to exceed zero. The evaluation interval crosses zero. What follows?',
        [
          'The primary criterion was not met; retain this outcome',
          'The best development score rescues the claim',
          'Drop costs until the claim passes',
        ],
        0,
        'A failed primary criterion is retained; it does not prove zero edge, and post-test tuning needs a new linked experiment.',
        true,
      ),
      choice(
        'limitation',
        'limitation',
        'Does a profitable sampled holdout establish mastery or professional alpha?',
        [
          'Yes, profit certifies skill',
          'No; structured reasoning and protocol integrity are graded, not profit',
          'Only if the winner is the first candidate',
        ],
        1,
        'Local synthetic draws are educational. They do not certify profitability, security, or real-world stationarity.',
      ),
      choice(
        'reversal',
        'interpretation',
        'Which change can reverse the real decision under these terms?',
        [
          t.reversal,
          'A different chart color',
          'Renaming the selected winner without changing any quantities',
        ],
        0,
        'Recompute the physical cash ledger or evidence validity when a material assumption changes.',
      ),
    ],
    workedSolution: [
      'Preregister the economic claim and falsification condition; retain all searches.',
      `Freeze the ${t.candidates}-candidate search and chosen policy before revealing the independent ${t.holdout}-observation test.`,
      payment,
      ledger,
      'An inconclusive/negative test remains in the record. Subsequent tuning is a linked exploratory search, never a fresh result on the same test.',
    ],
    reflectionPrompt:
      'What would change your decision, and which assumption would you check first? Reflection is saved and ungraded.',
    decisionReversal: t.reversal,
    sources: [backtestReference],
  }
}
export const backtestCases = terms.map(makeCase)
export const backtestFragment: CaseFragment = {
  slotId: 'f10-backtest',
  unitId: 'f10',
  cases: backtestCases,
  sources: [backtestReference],
}
