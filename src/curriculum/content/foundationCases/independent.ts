import type {
  CaseFragment,
  CaseRecord,
  LessonCopy,
  Question,
} from '../../core/types'
import { retrieval } from './builders'
import { probabilitySource, pricingSource } from '../sources'

function numeric(
  id: string,
  prompt: string,
  expected: number,
  rationale: string,
  critical = false,
  units = 'currency units',
): Question {
  return {
    id,
    kind: 'numeric',
    component: 'calculation',
    points: 10,
    critical,
    prompt,
    expected,
    tolerance: units === 'probability (0–1)' ? 0.000001 : 0.01,
    units,
    rationale,
    hints: [
      'Identify the requested quantity and its units; list only the stated policies.',
      'Construct a state ledger or joint probability before averaging.',
      rationale,
      `Result: ${expected} ${units}.`,
    ],
  }
}
function choice(
  id: string,
  component: Question['component'],
  prompt: string,
  correct: string,
  wrong: string,
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
    expected: 'supported',
    options: [
      { id: 'supported', label: correct, rationale },
      {
        id: 'unsupported',
        label: wrong,
        rationale: `This violates the supplied information, ledger or constraint. ${rationale}`,
      },
    ],
    rationale,
    hints: [
      'Read the information available before the commitment.',
      'Separate expectation, admissibility and actual payment.',
      rationale,
      `Supported conclusion: ${correct}`,
    ],
  }
}
type Copy = Pick<
  CaseRecord,
  | 'title'
  | 'role'
  | 'objective'
  | 'information'
  | 'states'
  | 'actions'
  | 'cashFlows'
  | 'constraints'
  | 'assumptions'
  | 'workedSolution'
  | 'decisionReversal'
  | 'questions'
>
function authored(
  id: string,
  mode: CaseRecord['mode'],
  copy: Copy,
): CaseRecord {
  return {
    id: `f10-independent-${id}`,
    unitId: 'f10',
    contentVersion: 1,
    rubricVersion: 1,
    mode,
    connection: 'separate-finance',
    ...copy,
    responses:
      'The private signal does not change the price. Outcomes settle once; no additional actions or hybrid contracts are offered.',
    reflectionPrompt:
      'Written defense and decision reversal (ungraded): compare your original prediction with the modeled answer, record your changed belief, name evidence you would seek, and specify one changed assumption that reverses your policy. A realized profit is not validation.',
    sources: [probabilitySource, pricingSource],
  }
}

function equipment(review: boolean): CaseRecord {
  const s = review ? 0.9 : 0.75,
    t = review ? 0.85 : 0.8,
    fee = review ? 3 : 4,
    premium = review ? 6 : 10
  const positive = review ? 0.45 : 0.42,
    contingent = review ? 40.5 : 32.4,
    insured = review ? 33 : 29
  const explanation = review
    ? 'Positive branch: .4×.9×120−.6×.15×30=40.5; negative branch is declined. Fee3 leaves37.5>30, so buy research.'
    : 'Positive branch: .4×.75×120−.6×.2×30=32.4; negative branch is declined. Fee4 leaves28.4<30, so do not buy research.'
  return authored(
    review ? 'review-a' : 'transfer-a',
    review ? 'review' : 'transfer',
    {
      title: review
        ? 'Review A — Revised equipment diagnostic and protection quote'
        : 'F10-A — Equipment service opportunity',
      role: 'Equipment service owner',
      objective:
        'Compare research separately from protection, then impose a hard terminal wealth floor.',
      information: [
        `Job net outcomes before additional offers: +120 on success, −30 on failure; physical success probability .40. Decline pays0.`,
        `Private diagnostic sensitivity ${s}, specificity ${t}; fee${fee} is paid whether the job is accepted or declined. Compare only no-signal unprotected job versus optimally signal-contingent unprotected action.`,
        `Separately compare unconditional unprotected job versus unconditional insured job. Fully funded loss-only protection: loss30, deductible10, limit15, premium${premium} whenever the job is undertaken. Do not combine diagnostic and insurance.`,
        'Starting wealth45; hard terminal floor20 in every possible state. All offers and probabilities are known; the eventual success and diagnostic are not.',
      ],
      states: [
        'Success with positive or negative signal',
        'Failure with positive or negative signal',
      ],
      actions: [
        'Unconditional job',
        'Decline',
        'Buy diagnostic and act optimally (uninsured comparison)',
        'Unconditional insured job (separate floor comparison)',
      ],
      cashFlows: `Diagnostic fee${fee} on every purchased-signal path, including decline. Policy pays15 only on failure; premium${premium} on both insured job outcomes.`,
      constraints:
        'The research comparison has no wealth constraint; the separate floor comparison offers decline, unprotected job and insured job only. Hybrids are not optimized.',
      assumptions: [
        'Physical probabilities are stipulated, not market pricing weights.',
        'Zero interest, one terminal date; no repricing or hidden liability.',
        'Protection payment is fully guaranteed and timely.',
      ],
      questions: [
        choice(
          'information',
          'setup',
          'Which information can inform the original decision?',
          'Offer terms, probability model and wealth—not the later diagnostic or realized job outcome.',
          'The later success and diagnostic can be inserted into the original prediction.',
          'The signal is purchased before action and cannot be treated as already known.',
          true,
        ),
        choice(
          'ledger',
          'setup',
          'Which ledger includes the insured premium exactly once?',
          `Success ${120 - premium}; failure ${-30 + 15 - premium}; decline0 without buying a diagnostic.`,
          'Success120; failure−15; premium only when a claim occurs.',
          'Payment=min(max(30−10,0),15)=15. Subtract premium in both insured states.',
          true,
        ),
        numeric(
          'baseline',
          'Expected unprotected job profit without research?',
          30,
          '.4×120−.6×30=30.',
          true,
        ),
        numeric(
          'positive',
          'Probability of a positive diagnostic (decimal)?',
          positive,
          `.4×${s}+.6×${1 - t}=${positive}.`,
          true,
          'probability (0–1)',
        ),
        numeric(
          'contingent',
          'Optimal signal-contingent expected job value BEFORE the diagnostic fee?',
          contingent,
          explanation,
        ),
        numeric(
          'evsi',
          'Value of sample information BEFORE its fee relative to the best no-signal choice?',
          review ? 10.5 : 2.4,
          `${contingent}−30=${review ? 10.5 : 2.4}. Signal accuracy alone is not economic value.`,
        ),
        numeric(
          'research-net',
          'Expected value AFTER paying the diagnostic fee?',
          review ? 37.5 : 28.4,
          explanation,
        ),
        choice(
          'research-choice',
          'interpretation',
          'In the separate unconstrained research comparison, which policy is preferred?',
          review
            ? 'Buy the diagnostic, take only after positive, with value37.5 versus30.'
            : 'Do not buy the diagnostic: unconditional30 exceeds28.4.',
          review
            ? 'Always reject paid research because the original quote was unattractive.'
            : 'Buy the signal because a more accurate forecast always pays for itself.',
          explanation,
        ),
        numeric(
          'insured-ev',
          'Expected unconditional insured job profit?',
          insured,
          `.4×${120 - premium}+.6×${-30 + 15 - premium}=${insured}.`,
        ),
        numeric(
          'payout',
          'Expected protection payout BEFORE its premium?',
          9,
          '.6×15=9; compare separately with the supplied premium.',
        ),
        numeric(
          'insured-floor',
          'Worst terminal wealth of the unconditional insured job?',
          review ? 24 : 20,
          `45−30+15−${premium}=${review ? 24 : 20}.`,
        ),
        choice(
          'admissible',
          'interpretation',
          'Under the separate floor20 comparison, which job policy is admissible?',
          'The insured job is admissible; the unprotected job reaches15 and fails the floor.',
          'The unprotected job is admissible because its mean profit is positive.',
          'Hard constraints must hold in every possible state, not only on average.',
        ),
        choice(
          'guarantee',
          'limitation',
          'Which assumption invalidates the insured-floor guarantee if removed?',
          'The seller may fail to pay the promised15 on time.',
          'The owner experiences a success rather than a failure.',
          'Default-sensitive actual payment can be lower than the contractual promise.',
          true,
        ),
        choice(
          'evidence',
          'interpretation',
          'What would one profitable realized job establish?',
          'Only that realized outcome, not the truth of the probability or optimality claim.',
          'It proves the research and protection policy was correct.',
          'Structured reasoning and assumptions, not realized profits, determine assessment.',
        ),
      ],
      workedSolution: [
        'Baseline30; signal branch ledger separates conditional action from upfront fee.',
        explanation,
        `Insured outcomes${120 - premium}/${-30 + 15 - premium}; EV${insured}. Expected payout9 versus premium${premium}.`,
        `Unprotected worst wealth15; protected worst wealth${review ? 24 : 20}. Funded payment, not merely a positive seller margin, backs the floor.`,
      ],
      decisionReversal:
        'Which diagnostic fee reverses research purchase, and which actual-payment/default assumption defeats the floor?',
    },
  )
}
function inventory(review: boolean): CaseRecord {
  const cost = review ? 40 : 50,
    gross = review ? 160 : 180,
    p = review ? 0.3 : 0.35,
    s = review ? 0.8 : 0.9,
    t = review ? 0.8 : 0.75,
    fee = review ? 5 : 8,
    premium = review ? 12 : 16,
    wealth = review ? 65 : 66
  const gain = gross - cost,
    base = review ? 8 : 13,
    pos = review ? 0.38 : 0.4775,
    contingent = review ? 23.2 : 32.825,
    net = review ? 18.2 : 24.825,
    protectedEV = review ? 10 : 10
  return authored(
    review ? 'review-b' : 'transfer-b',
    review ? 'review' : 'transfer',
    {
      title: review
        ? 'Review B — Smaller inventory order with revised research'
        : 'F10-B — Seasonal inventory',
      role: 'Seasonal inventory buyer',
      objective:
        'Maximize expected profit only among policies satisfying the hard floor.',
      information: [
        `Pay${cost} now for gross${gross} on high demand and0 otherwise; physical high-demand probability${p}.`,
        `Private demand signal sensitivity${s}, specificity${t}, upfront fee${fee} paid even when declining.`,
        `Alternative fully funded loss-only policy on loss${cost}: deductible${review ? 10 : 20}, limit20, premium${premium}. Payment20 on low demand,0 on high.`,
        `Starting wealth${wealth}; hard terminal floor20. Menu: decline; unprotected unconditional order; signal-contingent unprotected order; protected unconditional order. No hybrid or borrowing. Signal-positive failure is possible.`,
      ],
      states: [
        'High demand, positive or negative signal',
        'Low demand, positive or negative signal',
      ],
      actions: [
        'Decline',
        'Unprotected unconditional order',
        'Signal-contingent unprotected order',
        'Protected unconditional order',
      ],
      cashFlows: `Unprotected net+${gain}/−${cost}; insured+${gain - premium}/${-cost + 20 - premium}; paid-signal decline−${fee}. Signal-positive low demand loses${cost + fee}.`,
      constraints:
        'Every possible terminal state must meet floor20, including signal-positive failure. Only the four supplied actions are compared.',
      assumptions: [
        'Physical input probabilities, fixed private offers and zero interest.',
        'Payer is funded and pays20 at settlement; no hybrid contracts.',
        'No dependence or legal priority beyond these stated states.',
      ],
      questions: [
        choice(
          'menu',
          'setup',
          'Which actions are permitted before demand is known?',
          'Only the four supplied policies; no hybrid protection/research or advance knowledge of demand.',
          'Invent free research plus protection and choose after learning demand.',
          'Optimization is within the offered menu, not all imaginable contracts.',
          true,
        ),
        choice(
          'ledger',
          'setup',
          'Which net ledger includes purchase, research and protection costs correctly?',
          `Unprotected+${gain}/−${cost}; protected+${gain - premium}/${-cost + 20 - premium}; purchased-signal decline−${fee}.`,
          `Unprotected+${gross}/0; insurance costs nothing if no claim; research is free after declining.`,
          'Subtract purchase once, premium in both covered states and research fee on all purchased-signal paths.',
          true,
        ),
        numeric(
          'baseline',
          'Unprotected unconditional expected profit?',
          base,
          `${p}×${gross}−${cost}=${base}.`,
          true,
        ),
        numeric(
          'positive',
          'Positive signal probability (decimal)?',
          pos,
          `${p}×${s}+(1−${p})×(1−${t})=${pos}.`,
          true,
          'probability (0–1)',
        ),
        numeric(
          'contingent',
          'Optimal signal-contingent value BEFORE fee?',
          contingent,
          `Positive joint branch: ${p}×${s}×${gain}−(1−${p})×(1−${t})×${cost}=${contingent}; negative branch declines.`,
        ),
        numeric(
          'evsi',
          'Value of sample information BEFORE fee relative to the best no-signal order?',
          review ? 15.2 : 19.825,
          `${contingent}−${base}=${review ? 15.2 : 19.825}.`,
        ),
        numeric(
          'signal-net',
          'Signal-contingent value AFTER fee?',
          net,
          `${contingent}−${fee}=${net}.`,
        ),
        numeric(
          'protected-ev',
          'Expected unconditional protected profit?',
          protectedEV,
          `Expected payment${review ? 14 : 13} minus premium${premium} changes baseline${base} to10.`,
        ),
        numeric(
          'payout',
          'Expected protection payment BEFORE premium?',
          review ? 14 : 13,
          `(1−${p})×20=${review ? 14 : 13}. Compare it separately with premium${premium}.`,
        ),
        numeric(
          'signal-floor',
          'Worst terminal wealth on the signal-positive failure path?',
          review ? 20 : 8,
          `${wealth}−${cost}−${fee}=${review ? 20 : 8}.`,
          true,
        ),
        numeric(
          'protected-floor',
          'Worst terminal wealth with unconditional protection?',
          review ? 33 : 20,
          `${wealth}−${cost}+20−${premium}=${review ? 33 : 20}.`,
        ),
        choice(
          'policy',
          'interpretation',
          'Which policy has the highest EV among floor-admissible choices?',
          review
            ? 'Signal-contingent unprotected order: all paths meet20 and EV18.2 exceeds10 and8.'
            : 'Protected unconditional order: worst wealth20 and EV10; higher-mean alternatives violate the floor.',
          review
            ? 'Repeat the protected policy from the previous problem regardless of changed wealth.'
            : 'Signal-contingent order because24.825 is the largest mean.',
          'A larger mean does not override a binding hard floor. Recheck feasibility after terms change.',
          true,
        ),
        choice(
          'funding',
          'limitation',
          'Which omitted condition could defeat the recommendation?',
          'Failure to pay protection on time, repricing public information, or an additional feasible offered policy.',
          'A single realized sale validates every modeled probability.',
          'The optimum is conditional on the offered menu, fixed terms and payment guarantee.',
        ),
        choice(
          'evidence',
          'interpretation',
          'How should realized demand enter your conclusion?',
          'Report it separately; it cannot retroactively change the information set or validate the forecast.',
          'Replace the prior with the realized high/low event and regrade the choice.',
          'Expected and realized outcomes answer different questions.',
        ),
      ],
      workedSolution: [
        `Unprotected+${gain}/−${cost}, EV${base}; P(+)${pos}. Positive branch value${contingent}, less fee${fee} gives${net}.`,
        `Protected pays20 only on low demand; premium${premium} paid always, EV10.`,
        `Worst wealth: unprotected${wealth - cost}; signal-positive failure${wealth - cost - fee}; protected${wealth - cost + 20 - premium}.`,
        review
          ? 'All four policies now satisfy floor20; signal-contingent18.2 is best in this menu.'
          : 'Only decline and protection satisfy floor20; protection10 is preferred to decline0.',
      ],
      decisionReversal:
        'How much additional starting wealth makes the signal-contingent action feasible? What if the signal changes the offered price?',
    },
  )
}
function warranty(review: boolean): CaseRecord {
  const n = review ? 12 : 20,
    p = review ? 0.25 : 0.1,
    loss = review ? 120 : 150,
    d = review ? 30 : 20,
    payment = review ? 60 : 100,
    h = review ? 18 : 14,
    k = review ? 504 : 120
  const funds = review ? 720 : 400,
    expected = review ? 180 : 200,
    margin = review ? 36 : 80,
    actual = review ? 60 : 20,
    unpaid = review ? 0 : 1600,
    required = review ? 504 : 1720
  return authored(
    review ? 'review-c' : 'transfer-c',
    review ? 'review' : 'transfer',
    {
      title: review
        ? 'Review C — Fully funded smaller warranty book'
        : 'F10-C — Warranty book',
      role: 'Warranty capital manager and buyer',
      objective:
        'Separate promised margin from actual payment and quantify common-event funding.',
      information: [
        `${n} customers each face loss${loss} with physical probability${p}. Warranty deductible${d}, maximum payment${payment}, premium${h} per customer.`,
        `Seller capital${k}; premiums and capital are available at the single settlement. Funds are not borrowed.`,
        'Compare independent covered events with one fully shared Bernoulli event. Failure means aggregate promises strictly exceed funds; equality pays fully. In default, available funds are prorated evenly across claimants.',
      ],
      states: [
        'No covered events',
        'Independent count of covered events',
        'All customers claim in the common-event state',
      ],
      actions: [
        'Assess the current book',
        'Add enough capital to guarantee all promises',
        'Distinguish actual from promised buyer protection',
      ],
      cashFlows: `Promise per loss=min(max(${loss}−${d},0),${payment})=${payment}; premium charged regardless of loss. Actual payments=min(total promises,funds). Capital is funding, not premium revenue.`,
      constraints:
        'No expenses, interest, reinsurance, interim cash demands or legal priority. Pro-rata is this exercise’s stipulated settlement rule, not a legal assertion.',
      assumptions: [
        'Common-event probability is stipulated, not estimated.',
        'All promised losses are fixed and premiums available at settlement.',
        'A positive expected margin need not imply ability to settle all states.',
      ],
      questions: [
        choice(
          'information',
          'setup',
          'Which inputs define the original funding decision?',
          'Public contract terms, capital, stipulated loss probability and dependence model—not realized claim counts.',
          'Only the eventual profitable settlement determines whether funding was adequate.',
          'A realized count is unavailable when capital is chosen.',
          true,
        ),
        numeric(
          'payment',
          'Promised payment on one covered loss?',
          payment,
          `min(max(${loss}−${d},0),${payment})=${payment}.`,
          true,
        ),
        numeric(
          'funds',
          'Aggregate settlement funds?',
          funds,
          `${n}×${h}+${k}=${funds}.`,
          true,
        ),
        numeric(
          'expected',
          'Expected aggregate PROMISED claims?',
          expected,
          `${n}×${p}×${payment}=${expected}.`,
        ),
        numeric(
          'margin',
          'Promised underwriting margin EXCLUDING capital?',
          margin,
          `${n}×${h}−${expected}=${margin}; initial capital is not revenue.`,
          true,
        ),
        numeric(
          'threshold',
          'Smallest integer claim count that would strictly exceed funds (even if above book size)?',
          review ? 13 : 5,
          `${funds}/${payment}=${review ? 12 : 4}; equality is not default, so threshold${review ? 13 : 5}.`,
          false,
          'claims',
        ),
        numeric(
          'default',
          'Default probability in the fully shared event model (decimal)?',
          review ? 0 : 0.1,
          review
            ? 'All12 promises total720, exactly equal funds720; no default state.'
            : 'All20 promises total2000>400 on the .10 common event.',
          true,
          'probability (0–1)',
        ),
        numeric(
          'unpaid',
          'Aggregate unpaid amount in the all-customer loss state?',
          unpaid,
          `max(${n * payment}−${funds},0)=${unpaid}.`,
        ),
        numeric(
          'actual',
          'Actual payment per claiming customer in that common loss state?',
          actual,
          `min(${n * payment},${funds})/${n}=${actual}.`,
        ),
        numeric(
          'retained',
          'Buyer retained loss BEFORE premium when paid as promised?',
          loss - payment,
          `${loss}−${payment}=${loss - payment}.`,
        ),
        numeric(
          'actual-retained',
          'Actual retained loss BEFORE premium in common-event settlement?',
          loss - actual,
          `${loss}−${actual}=${loss - actual}.`,
        ),
        numeric(
          'capital',
          'Total external capital required to guarantee all promises?',
          required,
          `${n * payment}−${n * h}=${required}.`,
        ),
        numeric(
          'additional',
          'Additional capital beyond current funding required?',
          review ? 0 : 1600,
          `${required}−${k}=${review ? 0 : 1600}.`,
        ),
        choice(
          'reliability',
          'interpretation',
          'What does positive promised underwriting margin establish?',
          review
            ? 'Only expectation; this book’s all-state funding is separately proven by promises≤funds, including equality.'
            : 'Only expectation; the common loss state still fails and buyers receive20 instead of100.',
          'Positive expected margin alone guarantees every buyer receives the promised amount.',
          'Reliability depends on the state-by-state balance sheet, not just the mean.',
        ),
        choice(
          'limitation',
          'limitation',
          'Which qualification is material to this funding result?',
          'Payment timing, expenses or a different dependence/severity/priority rule require a new ledger.',
          'These numbers establish real regulatory capital or a legal pro-rata entitlement.',
          'This is an original hypothetical one-date fixed-severity model, not a legal solvency rule.',
        ),
      ],
      workedSolution: [
        `Funds${funds}; expected promises${expected}; promised margin${margin}, excluding capital.`,
        `Failure is strictly beyond${funds}; threshold${review ? 13 : 5} claims.`,
        `Shared event: default${review ? 0 : 0.1}; unpaid${unpaid}; actual per buyer${actual}, retained${loss - actual} before premium.`,
        `All-state required capital${required}; add${review ? 0 : 1600}. Means alone do not establish funding.`,
      ],
      decisionReversal:
        'Would expenses, an interim liquidity demand or a less reliable capital/premium receipt break the funding guarantee?',
    },
  )
}

function bridge(
  mode: 'worked' | 'partial' | 'practice',
  id: string,
  cost: number,
  receipt: number,
  p: number,
): CaseRecord {
  const ev = p * receipt - cost
  const c = authored(id, mode, {
    title: `${mode === 'worked' ? 'Worked' : mode === 'partial' ? 'Partial' : 'Practice'} bridge — Single service permit`,
    role: 'Permit purchaser',
    objective:
      'Practice ledger construction and information integrity, not solve any final business case.',
    information: [
      `Pay${cost} now; gross receipt${receipt} on acceptance with stipulated physical probability${p}, otherwise0. Decline0. Prior non-refundable application expense7 is sunk.`,
      'No signal, insurance, portfolio or wealth floor is offered. This deliberately incomplete mechanism cannot solve the final bank.',
    ],
    states: ['Acceptance', 'Rejection'],
    actions: ['Buy permit', 'Decline'],
    cashFlows: `Success${receipt - cost}, failure−${cost}; decline0.`,
    constraints: 'Only two supplied actions; zero interest and no default.',
    assumptions: [
      'Fixed known terms and physical probability.',
      'The receipt is timely and guaranteed if accepted.',
    ],
    questions: [
      choice(
        'setup',
        'setup',
        'Which cash flows change today?',
        'Purchase and future receipt; the prior7 is sunk.',
        'Include the prior7 again as a new expense.',
        'Incremental accounting excludes sunk costs.',
        true,
      ),
      numeric(
        'net',
        'Net success profit?',
        receipt - cost,
        `${receipt}−${cost}=${receipt - cost}.`,
        true,
      ),
      numeric(
        'ev',
        mode === 'partial'
          ? 'Expected gross receipt before subtracting cost?'
          : 'Expected incremental profit?',
        mode === 'partial' ? p * receipt : ev,
        mode === 'partial'
          ? `Expected gross receipt=${p}×${receipt}=${p * receipt}. Expected profit then subtracts the purchase cost once: ${p * receipt}−${cost}=${ev}.`
          : `${p}×${receipt}−${cost}=${ev}.`,
        true,
      ),
      choice(
        'action',
        'interpretation',
        'Under expected-profit maximization, what action is supported?',
        ev > 0
          ? 'Buy under these assumptions.'
          : 'Decline under these assumptions.',
        ev > 0
          ? 'Decline merely because failure is possible.'
          : 'Buy merely because gross receipt exceeds cost.',
        'Weight all state profits, then compare with decline0.',
      ),
      choice(
        'evidence',
        'interpretation',
        'What can one accepted permit validate?',
        'Only a realized acceptance, not the probability model.',
        'The probability estimate and all future permits.',
        'One favorable outcome does not establish a general edge.',
      ),
      choice(
        'limit',
        'limitation',
        'Which changed assumption reverses or qualifies the calculation?',
        'Change price, physical probability or actual receipt enforceability.',
        'Rename the permit without changing terms.',
        'The model depends on supplied inputs and payment promises.',
      ),
    ],
    workedSolution: [
      `Success${receipt - cost}, failure−${cost}; EV${ev}.`,
      'This parallel bridge practices accounting only; reconstruct each independent final mechanism from its offered terms.',
    ],
    decisionReversal:
      'At which price or probability does buying become unattractive? What if payment is not guaranteed?',
  })
  return mode === 'partial'
    ? {
        ...c,
        contentVersion: 2,
        rubricVersion: 2,
        scaffold: [
          `Supplied purchase row: pay ${cost} now; the prior application expense 7 is sunk.`,
          `Supplied receipt states: ${receipt} on acceptance with probability ${p}, otherwise 0.`,
          `Missing expected gross receipt: ${p} × ${receipt} + ${1 - p} × 0 = ___. Subtract the purchase cost only afterward.`,
        ],
      }
    : c
}
export const independentCases = [
  bridge('worked', 'worked', 12, 50, 0.4),
  bridge('partial', 'partial', 9, 30, 0.2),
  bridge('practice', 'practice', 17, 70, 0.3),
  equipment(false),
  inventory(false),
  warranty(false),
  equipment(true),
  inventory(true),
  warranty(true),
]
export const independentLesson: LessonCopy = {
  brief: [
    'Act as a finance decision maker with only the supplied information. Choose an objective, state allowed actions, write cash flows by state and check funding before optimizing.',
    'All business exposures are original hypothetical exercises. Probabilities are physical, interest is zero, and contract promises are not market price estimates.',
    'The final bank mixes equipment service, inventory research and warranty funding. Do not combine offers when the menu forbids hybrids.',
  ],
  retrieval: retrieval(
    'Does the largest modeled mean establish a feasible funded choice?',
    'No: information timing, payment reliability and hard constraints must be checked separately.',
    'Yes: a positive mean overrides every loss state.',
    'Expected value is not a guarantee or a feasibility test.',
  ),
  predictionQuestion:
    'Before seeing results, commit your action, a quantitative estimate where meaningful, confidence/not-sure and the assumption most likely to reverse your choice.',
  worked: [
    'The parallel permit bridge practices incremental ledger construction only. It does not solve the independent final tasks. Skip it if ready for unaided transfer.',
    'Research reliability is separate from selecting a favorable outcome; make conclusions conditional on the model and allowed actions.',
  ],
  practice: [
    'Complete the expected receipt before subtracting cost in the partial bridge. Then reconstruct a differently priced independent permit.',
    'Hints are recorded as assistance. Move to a fresh final case for unaided evidence.',
  ],
  experiment: {
    question: 'Can a wide search manufacture apparent evidence of an edge?',
    instructions: [
      'Preregister a hypothesis and falsification condition in the backtest lab.',
      'Run development, freeze the candidate and reveal the independent primary holdout only afterward.',
      'Include costs and Wilson uncertainty; tuning after reveal consumes the test. Profitable outcomes never award mastery.',
    ],
    experienceId: 'backtest',
  },
  transfer: [
    'Choose a fresh F10-A/B/C independent case first; the supplementary information/funding/research banks extend it, not replace it.',
    'Record an ungraded defense and reversal condition. At least80% and every critical item must pass on a fresh unaided case.',
  ],
  review: [
    'Three changed regimes reverse research ranking, inventory feasibility or common-event default. Reconstruct the ledger rather than repeating an action.',
    'Eligible review starts only after the device-clock due date; early attempts are practice.',
  ],
  limitation:
    'Results are conditional on fixed hypothetical probabilities, offered contracts, payment timing and dependence. This is not investment advice, legal/regulatory solvency or professional certification.',
  decisionReversal:
    'Which price, information mechanism, capital floor or payment assumption changes the admissible preferred policy?',
}
export const independentFragment: CaseFragment = {
  slotId: 'f10-independent',
  unitId: 'f10',
  cases: independentCases,
  lesson: independentLesson,
  sources: [probabilitySource, pricingSource],
}
