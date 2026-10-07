import type { Scenario } from './builders'
import { bank } from './builders'
import { kellySource, pricingSource, probabilitySource } from '../sources'

function partial(
  scenario: Scenario,
  scaffold: readonly string[],
  calculation: Partial<Scenario['calculation']> = {},
  overrides: Partial<Scenario> = {},
): Scenario {
  return {
    ...scenario,
    ...overrides,
    scaffold,
    calculation: { ...scenario.calculation, ...calculation },
  }
}

function ledger(
  title: string,
  cost: number,
  gross: number,
  expected: number,
  options: { sunk?: number; salvage?: number; poker?: boolean } = {},
): Scenario {
  const loss = (options.salvage ?? 0) - cost
  return {
    title,
    role: 'Buyer deciding now',
    objective:
      'Construct the incremental success/failure ledger, not a market valuation.',
    information: [
      `Pay ${cost} ${options.poker ? 'chips' : 'currency units'} now; receive gross ${gross} at success settlement and ${options.salvage ?? 0} at failure.`,
      ...(options.sunk
        ? [`A prior, non-refundable ${options.sunk} was paid last week.`]
        : []),
      'The terms are known before action; the success state is not known.',
    ],
    states: ['Success settlement', 'Failure settlement'],
    cashFlows: `Success: gross ${gross} less current payment ${cost}. Failure: recovery ${options.salvage ?? 0} less payment ${cost}. Decline: 0 incremental.`,
    setup: {
      prompt: 'Which ledger counts only cash flows changed by today’s action?',
      correct: `Success ${expected}; failure ${loss}; decline 0. Prior non-refundable payments are excluded.`,
      wrong: `Success ${gross}; failure 0. Treat all previously spent money as a new cost.`,
      rationale:
        'Gross receipts include returned funding. Incremental net outcomes subtract only new costs and include contractual recoveries.',
    },
    calculation: {
      prompt: 'Compute incremental net gain on success.',
      expected,
      units: options.poker ? 'chips' : 'currency units',
      tolerance: 0.001,
      rationale: `Subtract ${cost} from ${gross}; do not add it back or subtract sunk spending again.`,
    },
    interpretation: {
      prompt: 'What was available to the buyer at decision time?',
      correct:
        'Terms, own funds, and supplied public observations—not the eventual settlement state.',
      wrong: 'The realized success state and another party’s private file.',
      rationale:
        'Model the information set before the action; hindsight is not evidence available at purchase.',
    },
    limitation: {
      prompt:
        'What assumption is needed before this ledger can value the choice?',
      correct:
        'A justified success probability and whether promised receipts actually settle are still needed.',
      wrong:
        'Knowing gross receipts proves the choice is profitable in expectation.',
      rationale:
        'A ledger defines payoffs, not state probabilities or enforceability.',
    },
    reversal: {
      prompt: 'Which change alters the incremental success ledger?',
      correct: 'Increase today’s cost or reduce the gross settlement receipt.',
      wrong:
        'Increase last week’s non-refundable sunk expense while keeping all future terms fixed.',
      rationale:
        'Only cash flows affected by the current action enter the incremental comparison.',
    },
    solution: [
      `Success: ${gross} − ${cost} = ${expected}.`,
      `Failure: ${options.salvage ?? 0} − ${cost} = ${loss}. Decline adds zero.`,
      `The final receipt is not profit; sunk costs do not re-enter today’s action ledger.`,
    ],
    assumptions: [
      'One settlement date, amounts in the same units; no hidden liabilities, borrowing, discounting, or taxes.',
      'Success probabilities are not inferred from the outcome.',
    ],
    connection: options.poker ? 'direct' : 'added-contract',
    actions: ['Accept the specified contract', 'Decline'],
  }
}
function event(
  title: string,
  description: string,
  numerator: string,
  denominator: string,
  expected: number,
  formula: string,
  eventName: string,
  boundary: string,
  connection: Scenario['connection'] = 'separate-finance',
): Scenario {
  return {
    title,
    role: 'Forecaster before settlement',
    objective: `Forecast ${eventName} under exactly the supplied conditioning information.`,
    information: [
      description,
      'All stated probabilities/counts are hypothetical model inputs, not estimated market forecasts.',
    ],
    states: [
      'The specified event occurs',
      'The specified event does not occur',
    ],
    cashFlows:
      'Probability alone does not define trade profit; purchase price and payoff terms must be supplied separately.',
    setup: {
      prompt: 'Which event/denominator pair matches the question?',
      correct: `Event: ${eventName}. Eligible denominator: ${denominator}; relevant numerator: ${numerator}.`,
      wrong:
        'Use all originally imagined outcomes regardless of the conditioning information; substitute profit for the named event.',
      rationale:
        'The denominator consists of states compatible with what is known; the numerator is the subset satisfying the stated event.',
    },
    calculation: {
      prompt: `Compute P(${eventName}) as a fraction/decimal, not percent.`,
      expected,
      units: 'probability (0–1)',
      tolerance: 0.000001,
      rationale: formula,
    },
    interpretation: {
      prompt: 'What does this probability establish?',
      correct: `Only the probability of ${eventName} in this model; a different payoff or profitable trade can define a different event.`,
      wrong:
        'It is automatically the probability of earning a net profit or winning.',
      rationale:
        'Asset rise, an option payment, and net profit need not be identical events; ties need their own share accounting.',
    },
    limitation: {
      prompt: 'Which boundary matters?',
      correct: boundary,
      wrong:
        'The denominator arithmetic proves every real process is uniform and independent.',
      rationale:
        'The supplied model defines the calculation; selection and dependence require a new model.',
    },
    reversal: {
      prompt:
        'Which change requires a new forecast rather than keeping this number?',
      correct:
        'Learn a relevant observation that changes the compatible states, weights, or event definition.',
      wrong:
        'Rename the chart while keeping the information set and event unchanged.',
      rationale:
        'Condition on new information explicitly. A label change is not a probabilistic update.',
    },
    solution: [
      formula,
      `The result is ${expected}; never equate event probability with an unspecified profit probability.`,
    ],
    assumptions: [
      'Counts are equally weighted unless weights are explicitly given.',
      'No unseen private state is used to condition the forecast.',
    ],
    connection,
    actions: [
      'Report the named event probability',
      'Withhold an unsupported profit forecast',
    ],
  }
}
function value(
  title: string,
  p: number,
  gross: number,
  cost: number,
  expected: number,
): Scenario {
  const decision =
    expected > 0
      ? 'Buy under the risk-neutral objective.'
      : expected < 0
        ? 'Decline under the risk-neutral objective.'
        : 'Exactly indifferent: either action is acceptable if you explain equal expected profit.'
  return {
    title,
    role: 'Risk-neutral purchaser',
    objective:
      'Maximize incremental expected profit at the supplied physical probability; decline yields zero.',
    information: [
      `Pay ${cost} now. At settlement receive gross ${gross} with physical probability ${p}, otherwise zero.`,
      'No interest, fees, liquidity cost, taxes or default; amounts use the same currency unit.',
    ],
    states: [
      `Receipt ${gross}, probability ${p}`,
      `Receipt 0, probability ${1 - p}`,
    ],
    cashFlows: `Buy net outcomes: ${gross - cost} / ${-cost}. Decline: 0.`,
    setup: {
      prompt:
        'Which expected-profit setup includes the current price exactly once?',
      correct: `${p} × ${gross} − ${cost}`,
      wrong: `${p} × (${gross} + ${cost}) without subtracting the purchase price`,
      rationale:
        'A gross claim differs from a poker existing pot: gross receipt already includes everything received at settlement.',
    },
    calculation: {
      prompt: 'Compute expected incremental profit.',
      expected,
      units: 'currency units',
      tolerance: 0.000001,
      rationale: `E[profit] = p × gross − price = ${p} × ${gross} − ${cost}.`,
    },
    interpretation: {
      prompt: 'Choose the action using the stated objective.',
      correct: decision,
      wrong:
        expected === 0
          ? 'Buying strictly dominates decline.'
          : expected > 0
            ? 'Decline because a single outcome may lose.'
            : 'Buy because the gross winning receipt exceeds the price.',
      rationale:
        'Compare expected profit with the zero incremental payoff of decline; a positive mean does not guarantee a winning outcome.',
    },
    limitation: {
      prompt: 'Does this physical expected payout determine a market price?',
      correct:
        'No. A no-arbitrage price requires a specified replicating market; risk preference and constraints may change the decision.',
      wrong: 'Yes. Every market must quote the physical expected payout.',
      rationale:
        'Expected profit under physical probabilities and pricing by replication are different objectives.',
    },
    reversal: {
      prompt: 'What price makes the risk-neutral buyer indifferent?',
      correct: `Price ${p * gross}; above it decline and below it buy.`,
      wrong: `Price ${gross}; probability does not matter.`,
      rationale:
        'Break-even price equals the supplied expected gross receipt. Added fees count as price.',
    },
    solution: [
      `Profit states: ${gross - cost} and ${-cost}.`,
      `Weighted profit: ${p} × ${gross} − ${cost} = ${expected}.`,
      `Break-even price ${p * gross}. ${decision}`,
    ],
    assumptions: [
      'Supplied physical probability is treated as known.',
      'Risk-neutral, one period, funded claim; no claim that a real market trades at expected payout.',
    ],
    connection: 'added-contract',
    actions: ['Buy', 'Decline', 'Either at exact indifference'],
  }
}
function variation(
  title: string,
  description: string,
  expected: number,
  formula: string,
  units: string,
  interpretation: string,
  connection: Scenario['connection'] = 'separate-finance',
): Scenario {
  return {
    title,
    role: 'Project analyst',
    objective:
      'Distinguish outcome variation, average variation, uncertain parameters, and numerical noise.',
    information: [
      description,
      'Trials are independent and identically distributed only where explicitly stated; the supplied probability is a model assumption.',
    ],
    states: [
      'An individual project may gain',
      'An individual project may lose',
    ],
    cashFlows:
      'Expected total adds means. Independent total variance adds variances; average variance divides by the squared number of projects.',
    setup: {
      prompt: 'Which setup respects the requested quantity?',
      correct: formula,
      wrong:
        'Multiply a per-project standard deviation by the number of projects for an average, and treat the expected value as guaranteed.',
      rationale:
        'Variances, not standard deviations, add under independence. A run of losses has a joint probability.',
    },
    calculation: {
      prompt: `Compute the quantity requested in the information panel, in ${units}.`,
      expected,
      units,
      tolerance: units === 'probability (0–1)' ? 0.000001 : 0.001,
      rationale: formula,
    },
    interpretation: {
      prompt: 'What conclusion is justified?',
      correct: interpretation,
      wrong:
        'More runs guarantee the modeled average in the next real project and verify the model itself.',
      rationale:
        'Independent repetition reduces average sampling variability; no finite repetition removes the possibility of loss or misspecification.',
    },
    limitation: {
      prompt: 'Which error is not fixed merely by increasing simulated trials?',
      correct:
        'A wrong probability, ignored common shock, or misspecified payoff; simulation noise is a separate error.',
      wrong:
        'Every error is just simulation noise and disappears with more runs.',
      rationale: 'A precise simulation of a bad model is still a bad forecast.',
    },
    reversal: {
      prompt: 'Which change invalidates this independence calculation?',
      correct:
        'A shared shock makes project outcomes move together, or the supplied probability changes.',
      wrong:
        'Changing the display from a histogram to a table while leaving the model unchanged.',
      rationale:
        'Dependence changes total variance and joint loss probability. Presentation does not change the model.',
    },
    solution: [
      formula,
      `Requested quantity: ${expected} ${units}.`,
      interpretation,
    ],
    assumptions: [
      'Explicit finite two-outcome distribution; independence is stipulated, not inferred from more simulation.',
    ],
    connection,
    actions: [
      'Report a modeled distribution',
      'Do not promise a guaranteed realized return',
    ],
  }
}
function preference(
  title: string,
  description: string,
  expected: number,
  formula: string,
  units: string,
  decision: string,
  objective: string,
): Scenario {
  return {
    title,
    role: 'Capital owner',
    objective,
    information: [
      description,
      'All amounts settle in one period. No borrowing, fees beyond stated premium, or insurer default.',
    ],
    states: ['Good state wealth', 'Loss state wealth'],
    cashFlows:
      'Insurance subtracts premium in every state and restores exactly the stated loss. A fractional stake is a fraction of current wealth, not initial wealth forever.',
    setup: {
      prompt: 'Which setup matches the stated objective?',
      correct: formula,
      wrong:
        'Choose the largest gross prize and ignore starting wealth, premiums, the capital floor, or preference.',
      rationale:
        'Mean wealth, expected log wealth, and a hard floor are different criteria; use the stated one.',
    },
    calculation: {
      prompt: `Compute the requested quantity in ${units}.`,
      expected,
      units,
      tolerance: 0.001,
      rationale: formula,
    },
    interpretation: {
      prompt: 'Which decision follows for this owner?',
      correct: decision,
      wrong:
        'Buy every protection contract or always stake the largest fraction regardless of the objective.',
      rationale:
        'Paying for protection can lower mean wealth but improve a specified risk-averse objective; a binding floor can rule out the higher mean.',
    },
    limitation: {
      prompt: 'Which claim must be rejected?',
      correct:
        'Nominal Kelly assumes the supplied iid edge and log-growth objective; it is neither a survival guarantee nor robust optimization.',
      wrong:
        'A nominal optimal fraction guarantees no drawdown and remains optimal when its edge is wrong.',
      rationale:
        'Drawdown, ruin, estimation uncertainty, and log-growth optimization are distinct.',
    },
    reversal: {
      prompt: 'Which change could reverse the choice?',
      correct:
        'Change the premium, the loss probability, starting funds/floor, or the explicitly stated preference.',
      wrong:
        'Only the last realized win matters; ignore the supplied objective and updated risk.',
      rationale:
        'The decision is conditional on objective and assumptions, not a lucky realized return.',
    },
    solution: [formula, `Requested quantity: ${expected} ${units}.`, decision],
    assumptions: [
      'Known finite probabilities, positive wealth for log utility; no dynamic robust optimization.',
    ],
    connection: 'added-contract',
    actions: [
      'Fund an exposure consistent with the objective',
      'Reduce exposure or decline',
    ],
  }
}
function replicate(
  title: string,
  s0: number,
  up: number,
  down: number,
  strike: number,
  physical: number,
  expectedCost: number,
  fee = 0,
): Scenario {
  const cu = Math.max(0, up - strike),
    cd = Math.max(0, down - strike),
    delta = (cu - cd) / (up - down),
    debt = delta * down - cd
  return {
    title,
    role: 'Claim purchaser/hedger',
    objective:
      'Find the zero-interest, two-state replication cost and separate it from expected payment.',
    information: [
      `Stock costs ${s0} now; terminal stock is ${up} or ${down}. Call strike ${strike}; physical up probability ${physical}.`,
      `Borrow/lend at zero interest. Trade divisible shares; no short-sale restriction or default. Explicit purchase fee ${fee}.`,
    ],
    states: [`Up call pays ${cu}`, `Down call pays ${cd}`],
    cashFlows: `Call payment = max(S − K, 0). ${delta} shares minus debt ${debt} replicates the two payments. Fee is an extra buyer cost, not terminal payoff.`,
    setup: {
      prompt: 'Which state-by-state hedge matches the promised call payments?',
      correct: `Hold ${delta} shares and owe ${debt} at settlement.`,
      wrong: `Use physical up probability ${physical} as the share quantity; ignore borrowing.`,
      rationale:
        'Solve delta × S_up − debt = call_up and delta × S_down − debt = call_down.',
    },
    calculation: {
      prompt: 'Compute replication cost plus the explicit purchase fee.',
      expected: expectedCost,
      units: 'currency units',
      tolerance: 0.000001,
      rationale: `Cost = delta × current stock − debt + fee = ${delta} × ${s0} − ${debt} + ${fee}.`,
    },
    interpretation: {
      prompt: 'What does the physical forecast change?',
      correct: `Physical expected call payment is ${physical * cu + (1 - physical) * cd}; it changes expected returns, not the two-state replicating cost.`,
      wrong:
        'The market replication cost must change whenever the physical up forecast changes.',
      rationale:
        'Replication matches cash flows in each state independently of physical frequency; supplied market prices determine the cost.',
    },
    limitation: {
      prompt:
        'Which assumption would make a payment identity insufficient for a price?',
      correct:
        'Trading restrictions, funding costs, additional states, or a counterparty that may fail to pay.',
      wrong:
        'A promise of payment proves the payer has capital and the hedge can always be executed.',
      rationale:
        'A contractual payoff and a funded, executable replicating strategy are not the same thing.',
    },
    reversal: {
      prompt:
        'What can change the buyer’s net result even if terminal promised payments are unchanged?',
      correct:
        'A transaction fee, borrowing rate, collateral requirement, or default-sensitive payment.',
      wrong:
        'Changing only the physical forecast necessarily changes the state-by-state hedge equations.',
      rationale:
        'Costs, funding and actual payment matter. Forecasts change physical expectation, not this fixed payoff identity.',
    },
    solution: [
      `Up/down payoffs: ${cu}/${cd}. Delta = (${cu} − ${cd})/(${up} − ${down}) = ${delta}.`,
      `Debt = ${delta} × ${down} − ${cd} = ${debt}. Cost including fee: ${expectedCost}.`,
      `Physical expected payment: ${physical * cu + (1 - physical) * cd}. This is not a market price.`,
    ],
    assumptions: [
      'Frictionless two-state market with zero interest except explicitly stated fee.',
      'Counterparties pay in full; this is not a real CDS pricing model.',
    ],
    connection: 'separate-finance',
    actions: [
      'Replicate the specified claim',
      'Compare physical expected return separately',
    ],
  }
}

const f01Transfer = [
  ledger('License purchased today', 18, 80, 62),
  ledger('Testing permit with a recovery clause', 24, 70, 46, { salvage: 15 }),
  ledger('Expansion after sunk feasibility work', 12, 90, 78, { sunk: 40 }),
]
const f01Review = [
  ledger('Sale with an unavoidable fulfilment charge', 70, 60, -10),
  ledger('Refundable equipment reservation', 30, 55, 25, { salvage: 20 }),
  ledger('Renewal after a prepaid trial', 8, 45, 37, { sunk: 120 }),
]
const f02Transfer = [
  event(
    'Option payment versus trade profit',
    'Four equally likely terminal prices: 60, 90, 100, 120. Call strike 90; premium 10. Forecast strictly positive net call profit.',
    '1 qualifying state',
    '4 states',
    0.25,
    'Only 120 satisfies max(S−90,0)−10 > 0; 1/4 = .25. At 100 the profit is exactly zero.',
    'strictly positive call profit',
    'A real asset distribution need not be equally weighted; option payment and profit differ.',
  ),
  event(
    'Bond default among reviewed borrowers',
    'A portfolio has 100 borrowers: 20 missed payments, including 8 reviewed borrowers; 40 borrowers were reviewed. Forecast missed payment conditional on review.',
    '8 missed and reviewed',
    '40 reviewed',
    0.2,
    'P(missed | reviewed) = 8/40 = .20, not 20/100 by assumption.',
    'missed payment given review',
    'Review selection can change observed frequencies; reviewed borrowers may not represent the full book.',
  ),
  event(
    'Two service failures without replacement',
    'Five machines include two failed machines. Two distinct machines are sampled uniformly without replacement. Forecast at least one failed machine.',
    'complement of drawing two good machines',
    '5 then 4 remaining machines',
    0.7,
    '1 − (3/5)(2/4) = .70.',
    'at least one failed sampled machine',
    'Without replacement the second draw is conditional; independent draws give a different answer.',
  ),
]
const f02Review = [
  event(
    'Weighted price states',
    'Terminal prices 80, 100, 140 have probabilities .2, .5, .3. Strike 100, premium 20. Forecast strictly positive call profit.',
    'probability weight .3 at price 140',
    'probability mass 1',
    0.3,
    'Only 140 gives payment 40 > premium 20; sum qualifying probability weights = .3.',
    'strictly positive call profit',
    'Weighted states must not be counted as equally likely merely because there are three rows.',
  ),
  event(
    'Failed shipment after one safe inspection',
    'Seven crates contain three damaged crates. One sampled crate was inspected and found undamaged, then removed. Forecast damage in the next uniform sample.',
    '3 damaged remaining',
    '6 remaining crates',
    0.5,
    'After the observed safe removal: 3/6 = .5, not 3/7.',
    'damage after safe removal',
    'Condition only on known inspection information, not an unseen remaining crate.',
  ),
  event(
    'Joint warranty event',
    '100 warranties: 30 early failures, 20 late failures, and 6 with both. Forecast a late failure given an early failure.',
    '6 both failures',
    '30 early failures',
    0.2,
    'P(late | early) = 6/30 = .20. The joint probability is .06 and the marginal late probability .20; the equal numerical values here do not identify the events.',
    'late failure given early failure',
    'Equal numerical probabilities can describe distinct events; the conditioning denominator remains essential.',
  ),
]
const f03Transfer = [
  value('Gross receivable at a quoted price', 0.4, 80, 25, 7),
  value('Unfavorable service claim', 0.2, 50, 15, -5),
  value('Exactly indifferent inventory receipt', 0.6, 40, 24, 0),
]
const f03Review = [
  value('Higher-frequency small receipt', 0.75, 24, 14, 4),
  value('Rare large receivable', 0.1, 100, 13, -3),
  value('Threshold procurement quote', 0.3, 40, 12, 0),
]
const f04Transfer = [
  variation(
    'Ten independent service jobs',
    'One job pays +30 or −10, equally likely. Compute standard deviation of the TOTAL of ten iid jobs.',
    63.245553203367585,
    'Per-job mean 10, SD 20. SD(total) = sqrt(10) × 20.',
    'currency units',
    'Total SD increases as sqrt(n); average SD decreases. Total expectation 100 is not guaranteed.',
  ),
  variation(
    'Sixteen independent project averages',
    'One project pays +100 or −25 with p=.30 for +100. Compute SD of the AVERAGE of sixteen iid projects.',
    14.320549046737,
    'Per-project variance .3×(100−12.5)^2 + .7×(−25−12.5)^2 = 3281.25. SD(average) = sqrt(3281.25/16).',
    'currency units',
    'An average is less variable under independence, but the probability and payoff model remain assumptions.',
  ),
  variation(
    'Four consecutive failed projects',
    'A funded project succeeds with probability .40. Compute probability that the next four iid projects all fail.',
    0.1296,
    'P(four failures) = (1−.4)^4 = .1296.',
    'probability (0–1)',
    'A positive expected project profit is compatible with a substantial run of losses.',
  ),
]
const f04Review = [
  variation(
    'Nine independent claim totals',
    'A claim pays 80 with probability .25, otherwise zero. Compute SD of TOTAL claims across nine iid contracts.',
    103.92304845413264,
    'Per-claim mean 20, variance .25×60^2 + .75×20^2 = 1200. SD(total) = sqrt(9×1200).',
    'currency units',
    'Total expected claims 180 does not specify funds required for each realized settlement.',
  ),
  variation(
    'Twenty-five operating-margin averages',
    'A job gives +8 or −2, equally likely. Compute SD of the AVERAGE of twenty-five iid jobs.',
    1,
    'Per-job mean 3 and SD 5. SD(average) = 5/sqrt(25) = 1.',
    'currency units',
    'Lower average SD does not remove common-risk or uncertain-edge errors.',
  ),
  variation(
    'Three warranty years without a claim',
    'Annual claims occur with probability .25 in an iid teaching model. Compute probability of no claims for the next three years.',
    0.421875,
    'P(no claims in 3 years) = .75^3 = .421875.',
    'probability (0–1)',
    'No observed claims in a short run is not proof the annual claim probability is zero.',
  ),
]
const f06Transfer = [
  preference(
    'Risk-neutral equipment owner',
    'Initial wealth 200, loss 100 with probability .20; full insurance premium 22. Compute expected uninsured terminal wealth. Objective: maximize expected wealth.',
    180,
    '.8 × 200 + .2 × 100 = 180; insured terminal wealth 200−22 =178.',
    'currency units',
    'Decline protection: 180 expected wealth exceeds 178 certain wealth.',
    'Maximize expected terminal wealth.',
  ),
  preference(
    'Log-utility equipment owner',
    'Initial wealth 200, loss 100 with probability .20; full insurance premium 22. Compute the uninsured certainty equivalent under log utility.',
    174.1101126592249,
    'CE = exp(.8 ln 200 + .2 ln 100). Compare with insured wealth 178.',
    'currency units',
    'Buy protection under log utility: 178 exceeds the uninsured CE 174.1101, despite lower mean wealth.',
    'Maximize expected log terminal wealth.',
  ),
  preference(
    'A binding funding floor',
    'Wealth 100; possible loss 20. Full protection premium 9. The owner requires terminal wealth at least 90 in every state. Compute insured terminal wealth.',
    91,
    'Insured wealth =100−9 =91; uninsured worst wealth =80 < required floor 90.',
    'currency units',
    'Buy the funded protection to meet the hard floor; uninsured exposure is infeasible.',
    'Satisfy terminal capital floor 90 in every modeled state.',
  ),
]
const f06Review = [
  preference(
    'Risk-neutral freight cover',
    'Wealth 120; loss 60 with probability .25; full cover premium 10. Compute insured terminal wealth. Owner maximizes expected wealth.',
    110,
    'Insured wealth 120−10 =110; uninsured mean .75×120+.25×60 =105.',
    'currency units',
    'Buy cover under the mean-wealth objective: 110 > 105.',
    'Maximize expected terminal wealth.',
  ),
  preference(
    'Log preference at an expensive quote',
    'Wealth 100; equal probabilities of wealth 100/25 without cover. Full cover premium 60. Compute uninsured log certainty equivalent.',
    50,
    'CE = exp(.5 ln 100 + .5 ln 25) =50. Insured wealth =40.',
    'currency units',
    'Decline protection: CE 50 exceeds certain wealth 40 under this stated log objective.',
    'Maximize expected log terminal wealth.',
  ),
  preference(
    'Fractional nominal sizing',
    'A known iid even-money opportunity wins with p=.60. Objective: use HALF of the nominal log-growth Kelly fraction of CURRENT wealth. Compute that fraction.',
    0.1,
    'Full Kelly =2×.60−1 =.20; half Kelly =.10 of current wealth.',
    'fraction of current wealth',
    'Risk 10% of current wealth in this model, not a fixed original-wealth amount or a poker raise recommendation.',
    'Use half of the nominal even-money Kelly fraction.',
  ),
]
const f09Transfer = [
  replicate(
    'Two-state call with optimistic physical forecast',
    100,
    120,
    80,
    100,
    0.7,
    10,
  ),
  replicate('Deep in-the-money financed claim', 50, 70, 30, 20, 0.2, 30),
  replicate('Call price with a separate fee', 60, 90, 30, 60, 0.3, 17, 2),
]
const f09Review = [
  replicate(
    'Different physical outlook, same market hedge',
    100,
    120,
    80,
    100,
    0.1,
    10,
  ),
  replicate(
    'Out-of-the-money claim and uneven stock moves',
    80,
    120,
    60,
    90,
    0.6,
    10,
  ),
  replicate(
    'Always-paying claim with buyer friction',
    40,
    60,
    20,
    10,
    0.9,
    33,
    3,
  ),
]

export const baseCases = [
  ...bank(
    'f01',
    f01Transfer,
    f01Review,
    ledger('Terminal call ledger', 25, 125, 100, { poker: true }),
    partial(
      ledger('License ledger: complete the failure row', 10, 45, 35),
      [
        'Supplied purchase row: pay 10 currency units now (cash flow −10).',
        'Supplied success row: receive 45 at settlement; net success profit = 45 − 10 = 35.',
        'Missing failure row: receive 0 at settlement. Combine that receipt with the purchase row to find net failure profit.',
      ],
      {
        prompt:
          'Complete the failure row: compute incremental net profit on failure.',
        expected: -10,
        rationale:
          'Failure receives zero but the purchase payment is still incurred: 0 − 10 = −10.',
      },
      {
        setup: {
          prompt:
            'Which ledger counts only cash flows changed by today’s action?',
          correct:
            'Subtract today’s purchase cost from each settlement receipt; decline adds zero.',
          wrong:
            'Count gross success receipts as profit and omit the purchase cost on failure.',
          rationale:
            'The current payment occurs in both settlement states; it is not a sunk cost at decision time.',
        },
      },
    ),
    ledger('Storage permit with a known salvage payment', 15, 40, 25, {
      salvage: 4,
    }),
    [probabilitySource],
  ),
  ...bank(
    'f02',
    f02Transfer,
    f02Review,
    event(
      'Next-card flush event',
      'Five visible cards contain four spades. The unseen deck has 47 cards, including nine spades. Forecast the next card being a spade.',
      '9 spades',
      '47 unseen cards',
      9 / 47,
      'P(next spade) =9/47. Across two cards: 1−(38/47)(37/46)=.3496762257169288; after a missed turn:9/46.',
      'a spade on the next card',
      'A spade improving a flush is not the same event as winning; opponent ranges conditioned on actions need another model.',
      'direct',
    ),
    partial(
      event(
        'Missed-turn denominator',
        'There were 47 unseen cards including nine spades. A non-spade turn has now been observed; no spade was removed.',
        '9 spades',
        '46 unseen cards',
        9 / 46,
        '9/46; the miss removed a non-spade, not an out.',
        'river spade',
        'Uniform deck arithmetic is not a model of strategic selection.',
        'direct',
      ),
      [
        'Supplied numerator: nine spades remain because the observed turn was a non-spade.',
        'Supplied update: remove one observed card from the original 47 unseen cards.',
        'Missing denominator: complete 9 / ___ for the river-spade probability.',
      ],
      {
        prompt:
          'Complete 9 / ___: how many unseen cards remain after the observed turn?',
        expected: 46,
        units: 'unseen cards',
        tolerance: 0,
        rationale:
          '47 − 1 = 46 unseen cards. The numerator remains nine; the river-spade probability is 9/46.',
      },
    ),
    event(
      'Paid option event',
      'Four equally weighted asset values 80/90/100/120. Strike90. Forecast strictly positive call payment.',
      '2 values above90',
      '4 states',
      0.5,
      'Payments are0/0/10/30; positive payment in2/4 states.',
      'positive call payment',
      'A paid premium can make profit probability smaller than payment probability.',
    ),
    [probabilitySource],
  ),
  ...bank(
    'f03',
    f03Transfer,
    f03Review,
    value('Call-equivalent receipt', 0.3, 125, 25, 12.5),
    partial(
      value('Complete the EV ledger', 0.5, 60, 20, 10),
      [
        'Supplied states: gross receipt 60 with probability .5, otherwise gross receipt 0.',
        'Supplied purchase row: pay 20 once, regardless of settlement.',
        'Missing expected-receipt row: .5 × 60 + .5 × 0 = ___. Then subtract 20 to obtain expected profit.',
      ],
      {
        prompt:
          'Complete the expected gross receipt before subtracting purchase price.',
        expected: 30,
        rationale:
          'Expected gross receipt = .5 × 60 + .5 × 0 = 30. Expected profit is a different quantity: 30 − 20 = 10.',
      },
    ),
    value('An overpriced receipt', 0.3, 50, 20, -5),
    [probabilitySource, pricingSource],
  ),
  ...bank(
    'f04',
    f04Transfer,
    f04Review,
    variation(
      'Asymmetric terminal call variability',
      'Payoffs +100/−25 at p=.30. Compute one-trial standard deviation.',
      57.282196186948,
      'Mean =12.5; variance=.3×87.5^2+.7×(−37.5)^2=3281.25; SD=sqrt(3281.25).',
      'currency units',
      'Five independent losses have probability .7^5=.16807; a positive mean is not a short-run promise.',
      'direct',
    ),
    partial(
      variation(
        'Finish the total-variance row',
        'Four iid payoffs +10/−10 equally likely. Compute total variance.',
        400,
        'One SD10, variance100; total variance4×100=400 currency units squared; total SD20 currency units.',
        'currency units squared',
        'Total risk and average risk are different quantities.',
      ),
      [
        'Supplied one-trial mean: 0. One-trial variance: .5 × 10² + .5 × (−10)² = 100.',
        'Independence allows variances to add: total variance = 4 × 100 = ___.',
        'Total SD is the square root of total variance; do not enter SD in the variance row.',
      ],
      {
        expected: 400,
        units: 'currency units squared',
        rationale:
          'Four independent trials have total variance 4 × 100 = 400 currency units squared; total SD is 20 currency units.',
      },
    ),
    variation(
      'Average of nine independent outcomes',
      'Nine iid outcomes +12/−12 equally likely. Compute average standard deviation.',
      4,
      'Per-trial SD12; average SD12/sqrt(9)=4.',
      'currency units',
      'Model uncertainty persists even when simulation estimates become precise.',
    ),
    [probabilitySource],
  ),
  ...bank(
    'f06',
    f06Transfer,
    f06Review,
    preference(
      'Known edge nominal sizing',
      'Known iid even-money p=.55. Compute the full Kelly fraction; then compare half Kelly and the preference examples below.',
      0.1,
      'Full Kelly =2p−1 =.10; half Kelly=.05. Wealth200 with .2 risk of loss100: mean180, insured at22 gives178, log CE174.1101126592249.',
      'fraction of current wealth',
      'Full nominal Kelly risks10% for the log-growth objective; half Kelly risks5%. Neither is a legal-action prescription.',
      'Understand nominal sizing versus protection preferences.',
    ),
    partial(
      preference(
        'Complete current-wealth stake sizing',
        'Known iid even-money p=.56. Compute HALF Kelly as a fraction of current wealth.',
        0.06,
        'Full =2×.56−1=.12; half=.06.',
        'fraction of current wealth',
        'Use6% of current wealth under the specified half-Kelly rule.',
        'Apply a supplied fractional sizing rule.',
      ),
      [
        'Supplied full-Kelly fraction for known iid even-money p=.56: 2 × .56 − 1 = .12.',
        'Missing half-Kelly row: divide the full fraction .12 by two.',
        'Apply the resulting fraction to current wealth, not the initial bankroll; this is not a legal poker raise.',
      ],
    ),
    preference(
      'Preference and affordability',
      'Wealth80; full cover premium5; worst uninsured wealth60. Required floor70. Compute insured wealth.',
      75,
      '80−5 =75; worst uninsured60 violates70.',
      'currency units',
      'Buy protection to satisfy the supplied capital floor in both modeled states.',
      'Satisfy a hard capital floor.',
    ),
    [kellySource, probabilitySource],
  ),
  ...bank(
    'f09',
    f09Transfer,
    f09Review,
    replicate('Stock100 and call100', 100, 120, 80, 100, 0.7, 10),
    partial(
      replicate('Complete the borrowing ledger', 50, 60, 40, 50, 0.6, 5),
      [
        'Supplied call-payment rows: up pays 10; down pays 0.',
        'Supplied share row: delta = (10 − 0)/(60 − 40) = .5 shares. These shares settle at 30 up and 20 down.',
        'Missing borrowing row: choose debt so .5 × 40 − debt = 0. Check the same debt in the up state.',
      ],
      {
        prompt:
          'Complete the borrowing row: how much debt is owed at settlement?',
        expected: 20,
        rationale:
          'Debt = .5 × 40 − 0 = 20. Up: 30 − 20 = 10; down: 20 − 20 = 0. Today’s hedge cost is 25 − 20 = 5.',
      },
      {
        cashFlows:
          'Hold .5 shares and subtract the same debt from their value in each terminal state. Compute the debt that reproduces the call payments.',
        setup: {
          prompt: 'Which equation determines the missing borrowing row?',
          correct: '.5 × 40 − debt = 0, then check .5 × 60 − debt = 10.',
          wrong:
            'Use the physical up probability .6 as the share quantity and omit debt.',
          rationale:
            'The hedge must match both state payments, not just their physical expected value.',
        },
      },
    ),
    replicate('Priced hedge versus physical claim', 60, 80, 40, 60, 0.8, 10),
    [pricingSource, probabilitySource],
  ),
]
