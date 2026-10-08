import type {
  CaseFragment,
  CaseRecord,
  Question,
  UnitId,
} from '../../core/types'
import {
  authorCase,
  retrieval,
  type Scenario,
} from '../../content/foundationCases/builders'
import { solvencyReferences } from './sources'

function numeric(
  id: string,
  prompt: string,
  expected: number,
  rationale: string,
  units = 'currency units',
  critical = true,
): Question {
  return {
    id,
    prompt,
    expected,
    rationale,
    units,
    critical,
    component: 'calculation',
    kind: 'numeric',
    points: 20,
    tolerance: 1e-6,
    hints: [
      'Name the state and the cash available at settlement.',
      'Separate external capital, premium revenue and promised obligations.',
      rationale,
      `Computed answer: ${expected} ${units}.`,
    ],
  }
}
interface Book {
  title: string
  role: string
  n: number
  p: number
  s: number
  h: number
  k: number
  realized: number
  context: string
}
function fundedCase(
  unit: UnitId,
  mode: CaseRecord['mode'],
  variant: string,
  b: Book,
): CaseRecord {
  const funds = b.n * b.h + b.k,
    claims = b.s * b.realized
  const unpaid = Math.max(claims - funds, 0),
    actual = Math.min(claims, funds)
  const commonShortfall = Math.max(b.n * b.s - funds, 0)
  const scenario: Scenario = {
    title: b.title,
    role: b.role,
    objective:
      'Choose whether pooled obligations are reliably funded; quantify failure and payment rather than relying on a positive expected promised margin.',
    information: [
      b.context,
      `Original hypothetical one-period book: N=${b.n}, physical event p=${b.p}, fixed promised payment S=${b.s}, premium h=${b.h}, external capital K=${b.k}.`,
      `Compare two books with these identical terms: independent events (rho=0) versus one shared event (rho=1). Both have expected promised claims ${b.n * b.p * b.s} and promised underwriting margin ${b.n * b.h - b.n * b.p * b.s}; the funding decision must consider their different tails.`,
      `In the fully common-event stress family (rho=1), either zero or all ${b.n} policies claim. The separately stipulated realized settlement has ${b.realized} claims; it is a state ledger, not a sampled observation or an estimate of p.`,
    ],
    states: [
      `No common event: claims=0; funds=${funds}.`,
      `Common event: promised claims=${b.n * b.s}; unpaid=${commonShortfall}.`,
      `Stipulated realized claim count=${b.realized}; promised=${claims}, actual=${actual}, unpaid=${unpaid}.`,
    ],
    actions: [
      'Require more capital before relying on full payment',
      'Rely on the promised margin alone',
    ],
    cashFlows: `Premium inflow ${b.n * b.h}, capital ${b.k}, available funds ${funds}. Claims=${b.s}×count. Actual=min(claims,funds); unpaid=max(claims−funds,0); remaining=max(funds−claims,0); shareholder net=remaining−${b.k}. Failure means claims>funds, not equality.`,
    setup: {
      prompt: 'Which settlement and revenue setup is valid?',
      correct: `Funds=${funds}; capital is external funding, not premium revenue; default is strictly claims>funds.`,
      wrong:
        'Capital is underwriting revenue, and equality is already default.',
      rationale:
        'Capital enables payment but must be subtracted from residual funds to measure shareholder net result.',
    },
    calculation: {
      prompt:
        'What is expected unpaid claim size, averaged over both fully common-event states?',
      expected: b.p * commonShortfall,
      units: 'currency units',
      tolerance: 1e-6,
      rationale: `${b.p}×max(${b.n * b.s}−${funds},0)=${b.p * commonShortfall}; do not substitute promised margin or failure frequency.`,
    },
    interpretation: {
      prompt: 'Which pooling conclusion survives a common event?',
      correct:
        'Independent average claim variability shrinks with book size; total exposure grows. Common-event average variability does not shrink with book size.',
      wrong:
        'More customers eliminate both total claims and shared-event risk.',
      rationale:
        'For independent claims, SD of the average is S√(p(1−p)/N), while total SD is S√(Np(1−p)). At rho=1 average SD remains S√(p(1−p)).',
    },
    limitation: {
      prompt: 'What is the strongest defensible interpretation of rho?',
      correct:
        'A mixture weight for one shared Bernoulli event versus independent events; not a universal correlation or tail-risk model, pricing weight, or regulatory rule.',
      wrong:
        'Any real portfolio with this correlation must have this loss tail and this market price.',
      rationale:
        'This fully specified mixture yields pairwise event correlation rho only for N>1 and 0<p<1. Other dependence families or severities can change the tail.',
    },
    reversal: {
      prompt: 'Which assumption would change the funding decision?',
      correct:
        'Evidence of a shared shock or larger severity can overturn an independent-pooling decision; enough additional capital can restore full payment.',
      wrong:
        'A positive expected promised margin guarantees every claim is paid.',
      rationale:
        'Expected profitability does not supply cash in a large-loss state; both dependence and capital alter reliability.',
    },
    solution: [
      `Premium revenue=${b.n * b.h}; expected promised claims=${b.n * b.p * b.s}; promised underwriting margin=${b.n * b.h - b.n * b.p * b.s}, excluding capital and unpaid-claim benefit.`,
      `Realized ledger: promised=${claims}, actual=${actual}, unpaid=${unpaid}, remaining=${Math.max(funds - claims, 0)}; promised=actual+unpaid.`,
      `Common-event failure frequency=${commonShortfall > 0 ? b.p : 0}; conditional shortfall=${commonShortfall > 0 ? commonShortfall : 'unavailable (no default)'}, expected unpaid=${b.p * commonShortfall}.`,
      `All-common full-payment capital=max(N×S−N×h,0)=${Math.max(b.n * (b.s - b.h), 0)}. Total exposure is ${b.n * b.s}, not the expected claim amount.`,
      'This is a separate-finance insurance/warranty exercise, not a private poker cashout or a recommendation about actual insurer capital.',
    ],
    assumptions: [
      'Fixed severity, known physical p, collected premiums available at settlement, no interest, expenses, reinsurance, borrowing, dynamic reserves or legal priority. Dependence controls event occurrence, not severity.',
      'No poker hand, private cards or future deck is used; all business quantities are original hypothetical inputs.',
    ],
    connection: 'separate-finance',
  }
  const c = authorCase(unit, mode, variant, scenario, solvencyReferences)
  return {
    ...c,
    id: `${unit}-solvency-${mode}-${variant}`,
    questions: [
      ...c.questions,
      numeric(
        'actual',
        'Actual payment in the stipulated realized settlement?',
        actual,
        `min(${claims},${funds})=${actual}; a promise is not the same as funded payment.`,
      ),
      numeric(
        'unpaid',
        'Unpaid claims in that realized state?',
        unpaid,
        `max(${claims}−${funds},0)=${unpaid}; promised=actual+unpaid.`,
      ),
      numeric(
        'frequency',
        'Physical default probability in the fully common-event family?',
        commonShortfall > 0 ? b.p : 0,
        `Default occurs only in the common claim event if ${b.n * b.s}>${funds}.`,
        'probability fraction',
      ),
    ],
  }
}
const base: Book = {
  title: 'Insurance portfolio: margin is not payment reliability',
  role: 'Insurer treasury analyst',
  n: 100,
  p: 0.1,
  s: 100,
  h: 12,
  k: 500,
  realized: 20,
  context:
    'The board compares independent accident events with one common regional event before approving a funded promise.',
}
const f07Cases = [
  fundedCase('f07', 'worked', '1', base),
  fundedCase('f07', 'partial', '1', {
    ...base,
    title: 'Supplier protection: complete the funding ledger',
    n: 60,
    p: 0.2,
    s: 80,
    h: 18,
    k: 320,
    realized: 25,
  }),
  fundedCase('f07', 'practice', '1', {
    ...base,
    title: 'Device repair plan: what pooling can and cannot fix',
    n: 40,
    p: 0.15,
    s: 60,
    h: 12,
    k: 240,
    realized: 13,
  }),
  fundedCase('f07', 'transfer', '1', {
    ...base,
    title: 'Regional property insurer: weather dependence',
    role: 'Property insurance risk analyst',
    n: 80,
    p: 0.05,
    s: 500,
    h: 30,
    k: 1600,
    realized: 9,
    context:
      'Storm exposure spans many customers in the same region. Test common weather shock funding separately from independent household losses.',
  }),
  fundedCase('f07', 'transfer', '2', {
    ...base,
    title: 'Crop protection pool: shared drought',
    role: 'Cooperative treasurer',
    n: 50,
    p: 0.2,
    s: 200,
    h: 45,
    k: 750,
    realized: 18,
    context:
      'A cooperative collects crop-protection premiums; a common drought can affect every member. Increasing membership is not equivalent to adding capital.',
  }),
  fundedCase('f07', 'transfer', '3', {
    ...base,
    title: 'Device warranty book: shared manufacturing batch',
    role: 'Warranty provider analyst',
    n: 120,
    p: 0.1,
    s: 50,
    h: 6,
    k: 280,
    realized: 21,
    context:
      'A batch defect creates shared claim exposure; individual wear and tear would be independent. Both models have the same expected promised claims.',
  }),
  fundedCase('f07', 'review', '1', {
    ...base,
    title: 'Changed weather exposure and capital',
    role: 'Property insurance risk analyst',
    n: 90,
    p: 0.08,
    s: 400,
    h: 36,
    k: 760,
    realized: 11,
    context:
      'A fresh changed-number weather portfolio, not a memorized earlier ledger.',
  }),
  fundedCase('f07', 'review', '2', {
    ...base,
    title: 'Changed cooperative drought book',
    role: 'Cooperative treasurer',
    n: 70,
    p: 0.15,
    s: 180,
    h: 32,
    k: 560,
    realized: 17,
    context:
      'Changed membership, claim amount, probability and cash capital require a new calculation.',
  }),
  fundedCase('f07', 'review', '3', {
    ...base,
    title: 'Changed warranty batch exposure',
    role: 'Warranty provider analyst',
    n: 150,
    p: 0.12,
    s: 40,
    h: 6,
    k: 300,
    realized: 31,
    context:
      'A new manufacturing-batch scenario changes funding and event likelihood independently.',
  }),
]
const f09Cases = [
  fundedCase('f09', 'transfer', '1', {
    title: 'Repair guarantee: promised versus actually payable',
    role: 'Buyer assessing warranty-provider reliability',
    n: 30,
    p: 0.1,
    s: 200,
    h: 25,
    k: 250,
    realized: 8,
    context:
      'A repair guarantee is an added contract. A advertised promised repair payment is not a guaranteed actual payment; evaluate the counterparty cash constraint.',
  }),
  fundedCase('f09', 'review', '1', {
    title: 'Changed repair guarantee funding',
    role: 'Buyer assessing warranty-provider reliability',
    n: 40,
    p: 0.15,
    s: 160,
    h: 28,
    k: 480,
    realized: 12,
    context:
      'A changed-number guarantee book increases funds but also changes exposure. Capital is not premium income.',
  }),
]
function warranty(mode: 'transfer' | 'review', review: boolean): CaseRecord {
  const n = review ? 30 : 20,
    loss = review ? 180 : 150,
    deductible = review ? 30 : 20,
    cap = review ? 120 : 100
  const h = review ? 20 : 14,
    k = review ? 200 : 120,
    p = review ? 0.2 : 0.1
  const payment = Math.min(Math.max(loss - deductible, 0), cap),
    funds = n * h + k
  const c = fundedCase('f10', mode, '1', {
    title: review
      ? 'Changed warranty/common-event capital decision'
      : 'Warranty/common-event capstone: fund the actual promise',
    role: 'Warranty buyer and seller funding analyst',
    n,
    p,
    s: payment,
    h,
    k,
    realized: n,
    context: `Each customer faces loss ${loss} with physical probability ${p}; deductible ${deductible}, maximum promised payment ${cap}. For this exercise only, scarce seller funds are shared pro rata across equal claims, not a legal priority rule.`,
  })
  return {
    ...c,
    questions: [
      ...c.questions,
      numeric(
        'promised-per-customer',
        'Promised payment per customer in the loss event?',
        payment,
        `min(max(${loss}−${deductible},0),${cap})=${payment}.`,
      ),
      numeric(
        'retained-paid',
        'Buyer retained loss when the promise is paid in full?',
        loss - payment,
        `${loss}−${payment}=${loss - payment}, excluding premium.`,
      ),
      numeric(
        'retained-default',
        'Buyer retained loss in the common default under stipulated pro-rata payment?',
        loss - funds / n,
        `${funds}/${n}=${funds / n} actual payment; retained=${loss}−${funds / n}=${loss - funds / n}, excluding premium.`,
      ),
      numeric(
        'required-capital',
        'Total external capital required to pay all common-event claims?',
        n * (payment - h),
        `${n}×${payment}−${n}×${h}=${n * (payment - h)}; premium revenue is already available.`,
      ),
      numeric(
        'additional-capital',
        'Additional capital beyond the current K for full common-event payment?',
        n * payment - funds,
        `${n * payment}−${funds}=${n * payment - funds}.`,
      ),
    ],
    workedSolution: [
      ...c.workedSolution,
      `Promised per customer=${payment}; buyer retained loss if paid=${loss - payment}; common-state pro-rata actual=${funds / n}, retained=${loss - funds / n}. Premium is a separate upfront buyer cost, not included in retained event loss.`,
      ...(review
        ? []
        : [
            'Independent events: failure begins at five claims (four exactly exhaust funds); P(Binomial(20,.1)≥5)=0.043174495284463404. Common event: default=.10, loss-state shortfall=1600; required total K=1720, extra K=1600.',
          ]),
    ],
  }
}
export const solvencyFragments: readonly CaseFragment[] = [
  {
    slotId: 'f07-solvency',
    unitId: 'f07',
    cases: f07Cases,
    sources: solvencyReferences,
    lesson: {
      brief: [
        'Positive expected underwriting margin need not fund a bad state. Claims strictly greater than funds cause default; equality exhausts cash but is not default.',
        'Pooling reduces independent average variability, while total exposure and total SD grow. A common event leaves average variability intact.',
      ],
      retrieval: retrieval(
        'Which amount counts as premium revenue?',
        'Collected premiums, not external capital.',
        'Premiums plus shareholder capital.',
        'Capital funds obligations and belongs in shareholder net accounting, not underwriting revenue.',
      ),
      predictionQuestion:
        'With N=100,p=.10,S=100,h=12,K=500, predict how switching rho from0 to1 changes default frequency and unpaid claim size. Name the assumption driving your prediction.',
      worked: [
        'Premiums=1200, capital=500, funds=1700; expected promised claims=1000; promised margin=200, excluding capital.',
        'At 20 claims, promised=2000, actual=1700, unpaid=300, remaining=0, shareholder net=−500. At17 claims, claims equal funds: no default.',
        'Independent P(default)=0.01000727926212509. Fully common event P(default)=.10, loss-state shortfall=8300, expected unpaid=830. These are modeled expectations, not observed frequencies.',
        'For N=100,p=.20,S=100: independent single/average/total SD=40/4/400; rho=.25 gives average20.29778313018444; rho=1 gives average40 and total4000. Marginal expected claims do not change.',
      ],
      practice: [
        'Complete the supplier ledger, then compute the device-plan promised margin and state shortfall without hints. Compare total exposure with average risk.',
        'Explain why E[max(claims−funds,0)] differs from P(default) and from expected promised margin.',
      ],
      experiment: {
        question: 'Can positive expected margin coexist with unpaid claims?',
        instructions: [
          'Commit a prediction before calculating.',
          'Run the default independent book, then create a linked run at rho=1.',
          'Raise capital, keep premiums fixed, and compare frequency with conditional shortfall. Explain how the funding threshold moves.',
          'Use the state table for exact equality, total/average SD and capital ledger; save an ungraded reflection.',
        ],
        experienceId: 'solvency',
      },
      transfer: [
        'Weather insurer, crop cooperative and warranty batch books each require a fresh funding ledger and dependence qualification.',
      ],
      review: [
        'Use changed-number weather, cooperative and warranty variants when due; repeated or assisted cases do not establish unaided retention.',
      ],
      limitation:
        'Common-event/independent mixing is one explicit family, not a universal correlation model. Known physical p is not a market pricing weight; no severity dependence, regulation, dynamic reserves, reinsurance or legal priority is modeled.',
      decisionReversal:
        'If independent risks instead share a shock, pooling may no longer support reliable payment; enough capital or smaller promised severity can reverse the funding decision.',
    },
  },
  {
    slotId: 'f09-solvency',
    unitId: 'f09',
    cases: f09Cases,
    sources: solvencyReferences,
  },
  {
    slotId: 'f10-solvency',
    unitId: 'f10',
    cases: [warranty('transfer', false), warranty('review', true)],
    sources: solvencyReferences,
  },
]
