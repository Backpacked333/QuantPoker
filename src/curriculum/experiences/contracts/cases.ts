import type { CaseFragment, CaseRecord, Question } from '../../core/types'
import { contractReferences } from './sources'

const numeric = (
  id: string,
  prompt: string,
  expected: number,
  steps: readonly [string, string, string, string],
): Question => ({
  id,
  prompt,
  kind: 'numeric',
  component: 'calculation',
  expected,
  tolerance: 1e-8,
  units: 'currency units',
  points: 2,
  critical: true,
  rationale: steps[3],
  hints: steps,
})
const choice = (
  id: string,
  component: 'setup' | 'interpretation' | 'limitation',
  prompt: string,
  right: string,
  wrong: string,
  steps: readonly [string, string, string, string],
): Question => ({
  id,
  prompt,
  kind: 'choice',
  component,
  options: [
    { id: 'valid', label: right, rationale: steps[3] },
    {
      id: 'invalid',
      label: wrong,
      rationale: 'This changes the promise, timing or probability model.',
    },
  ],
  expected: 'valid',
  points: 1,
  critical: true,
  rationale: steps[3],
  hints: steps,
})
function authored(
  unitId: 'f08' | 'f09',
  suffix: string,
  mode: CaseRecord['mode'],
  title: string,
  information: string[],
  questions: Question[],
  workedSolution: string[],
  connection: CaseRecord['connection'] = 'added-contract',
): CaseRecord {
  return {
    id: `${unitId}-contracts-${suffix}`,
    unitId,
    contentVersion: 1,
    rubricVersion: 1,
    title,
    role: 'Buyer and contract analyst',
    objective:
      'Read the exact contingent obligation, settle both ledgers, and distinguish payoff from price and funding.',
    information,
    states: [
      'The stated mutually exclusive settlement outcomes; losses are nonnegative, not signed profits.',
    ],
    actions: [
      'Accept the stated contract',
      'Keep exposure unprotected',
      'Change terms and make a new prediction',
    ],
    responses:
      'Settle only on the disclosed basis; never infer a counterparty guarantee from the shape.',
    cashFlows:
      'Premium/fee is paid once before settlement; loss, claim payment and asset payoff settle at the end. No interest or dividends.',
    constraints:
      'All quantities are original hypothetical teaching values in currency units, not quotations or regulatory advice.',
    assumptions: [
      'One period; fixed supplied premium; no early exercise.',
      'Funding is fully available only where explicitly assumed; any actual default payment is separately stated.',
    ],
    connection,
    mode,
    questions,
    workedSolution,
    reflectionPrompt:
      'Which part of your prediction changed after the ledger? Explain the changed assumption without relying on whether one state happened.',
    decisionReversal:
      'Name a precise premium, cap, deductible, basis or funding change that reverses your choice, then compare the new settlement.',
    sources: contractReferences,
  }
}
function layer(
  suffix: string,
  mode: CaseRecord['mode'],
  title: string,
  l: number,
  d: number,
  m: number,
  premium: number,
  pay: number,
  expectedPay: number,
  distribution: string,
) {
  const retained = l - pay
  return authored(
    'f08',
    suffix,
    mode,
    title,
    [
      `Loss layer: loss ${l}, deductible ${d}, maximum indemnity ${m}, premium ${premium}. Fully funded.`,
      distribution.split(';')[0],
      'Model I(L)=min(max(L−d,0),M). Loss is not asset terminal price.',
    ],
    [
      choice(
        'setup',
        'setup',
        'Which payment rule follows the stated layer?',
        'Subtract the deductible, floor at zero, then cap indemnity.',
        'Cap the buyer’s total loss at the deductible.',
        [
          'Identify the loss variable.',
          'The deductible is the attachment, not the final retained loss in every state.',
          `The promise saturates at loss ${d + m}.`,
          'Apply min(max(L−d,0),M).',
        ],
      ),
      numeric('payment', `Payment when loss is ${l}?`, pay, [
        'Start with the excess loss.',
        `Compute max(${l}−${d},0).`,
        `Cap that value at ${m}.`,
        `The promised and funded actual payment is ${pay}.`,
      ]),
      numeric('retained', 'Retained loss before premium?', retained, [
        'Identify original loss and actual funded payment.',
        'The deductible is not always equal to retained loss.',
        `Subtract ${pay} from loss ${l}.`,
        `Retained loss=${retained}; premium belongs in total cost, not retained loss.`,
      ]),
      numeric(
        'cost',
        'Buyer total loss plus premium at that loss?',
        retained + premium,
        [
          'Separate payment from total cost.',
          `Retain ${l}−${pay}=${retained}.`,
          `Add the premium ${premium} once.`,
          `Buyer total cost is ${retained + premium}; buyer profit is ${-retained - premium}.`,
        ],
      ),
      numeric(
        'expectation',
        'Physical expected payment from the disclosed distribution?',
        expectedPay,
        [
          'Use all mutually exclusive states, including zero payment.',
          'Evaluate the layer in each state, then multiply by its probability.',
          distribution,
          `The probability-weighted payment is ${expectedPay}, not a market price.`,
        ],
      ),
      numeric(
        'seller',
        'Seller underwriting profit at the selected loss?',
        premium - pay,
        [
          'Use the seller ledger, not buyer retained loss.',
          'Premium is seller income and indemnity is seller expense.',
          `${premium}−${pay}.`,
          `Seller profit is ${premium - pay}; together buyer and seller profits sum to ${-l}.`,
        ],
      ),
      choice(
        'meaning',
        'interpretation',
        'What do attachment and exhaustion mean?',
        `Payment starts above ${d} and saturates at loss ${d + m}; losses above that remain with the buyer.`,
        'After exhaustion, all further losses are paid by the seller.',
        [
          'Draw the two kinks.',
          'Below attachment the slope is zero.',
          'Inside the layer payment slope is one; beyond exhaustion it is zero.',
          'A limit caps indemnity, not total loss.',
        ],
      ),
      choice(
        'boundary',
        'limitation',
        'What does the call-spread-shaped payoff identity establish?',
        'State-by-state payment only; neither a market premium nor default protection.',
        'A guaranteed fair market price equal to expected payment.',
        [
          'Separate identity from valuation.',
          'Physical probabilities weight actual loss states.',
          'Replication pricing needs a separately specified market model; funding needs separate terms.',
          'Shape alone determines neither price nor ability to pay.',
        ],
      ),
    ],
    [
      `Payment ${pay}; retained loss ${retained}; buyer cost ${retained + premium}; seller profit ${premium - pay}.`,
      `Physical expected payout ${expectedPay}; premium ${premium} is supplied, not derived.`,
      `I(L)=max(L−${d},0)−max(L−${d + m},0); this is a payoff identity, not a pricing equation.`,
    ],
  )
}
function asset(
  suffix: string,
  mode: CaseRecord['mode'],
  initial: number,
  d: number,
  premium: number,
  terminal: number,
  pay: number,
) {
  const k = initial - d,
    profit = terminal - initial + pay - premium
  const retained = Math.max(initial - terminal, 0) - pay
  return authored(
    'f08',
    suffix,
    mode,
    `Protective put on a share purchased at ${initial}`,
    [
      `S0=${initial}, deductible=${d}, strike K=${k}, premium=${premium}, terminal price=${terminal}. Uncapped, fully funded.`,
      'One share plus a European put; no interest, dividends or early exercise. Premium is an input.',
    ],
    [
      choice(
        'setup',
        'setup',
        'Which variable triggers genuine asset protection?',
        `Terminal asset price below strike ${k}.`,
        'Any positive asset profit.',
        [
          'Define the asset, not a generic loss layer.',
          `Strike is S0−d=${k}.`,
          'The put exercises only when terminal price is lower than strike.',
          'Put payment=max(K−St,0).',
        ],
      ),
      numeric('payment', 'Put payment in the stated state?', pay, [
        'Locate terminal price relative to strike.',
        `Strike ${k}; terminal ${terminal}.`,
        'Take the positive difference only.',
        `Put payment=${pay}.`,
      ]),
      numeric('retained', 'Retained downside loss before premium?', retained, [
        'Measure only the decline from purchase price; gains are not losses.',
        `Original downside=max(${initial}−${terminal},0).`,
        `Subtract put payment ${pay}.`,
        `Retained downside=${retained}.`,
      ]),
      numeric(
        'cost',
        'Retained downside plus protection cost?',
        retained + premium,
        [
          'Keep this nonnegative cost measure separate from signed asset profit.',
          `Retained downside=${retained}.`,
          `Add one supplied premium ${premium}.`,
          `Downside loss plus protection cost=${retained + premium}.`,
        ],
      ),
      numeric(
        'profit',
        'Combined stock plus put profit after premium?',
        profit,
        [
          'Stock payoff alone is not profit.',
          `Stock profit=${terminal}−${initial}.`,
          `Add put ${pay} and subtract premium ${premium} once.`,
          `Combined profit=${profit}.`,
        ],
      ),
      choice(
        'meaning',
        'interpretation',
        'If protection is capped below strike, what changes?',
        'A lower-strike put is subtracted; sufficiently deep losses exceed the protection.',
        'The cap eliminates all downside while leaving the premium unchanged.',
        [
          'Identify the cap on payment.',
          'Use long put at K minus put at max(K−cap,0).',
          'Below the lower strike, payment cannot grow further.',
          'Capped protection is not an unlimited profit floor.',
        ],
      ),
      choice(
        'boundary',
        'limitation',
        'What cannot be inferred from this table?',
        'A market option premium or counterparty guarantee.',
        'The conditional payoff at each listed terminal price.',
        [
          'The table fixes state payments only.',
          'No traded replication or market discount data were supplied.',
          'The supplied premium enters profit; it was not calculated from this table.',
          'This separate-finance payoff example is not poker insurance or a pricing engine.',
        ],
      ),
    ],
    [
      `K=${k}, put=${pay}, stock profit=${terminal - initial}, combined profit=${profit}.`,
      'Default reference: S0=100, K=90, premium=3 gives payments 30/0/0/0 and profits −13/−13/−3/+17 at St=60/90/100/120.',
    ],
    'separate-finance',
  )
}
function wording(
  suffix: string,
  mode: CaseRecord['mode'],
  a: number,
  b: number,
  d: number,
  m: number,
  premium: number,
  per: number,
  aggregate: number,
) {
  return authored(
    'f08',
    suffix,
    mode,
    `Occurrence versus aggregate on losses ${a} and ${b}`,
    [
      `Two losses ${a} and ${b}; deductible ${d}, indemnity limit ${m}, one premium ${premium}. Fully funded.`,
      'Per-occurrence applies both deductible and limit separately to each event. Aggregate applies both once to the period total.',
    ],
    [
      choice(
        'setup',
        'setup',
        'What must be specified before applying the deductible?',
        'Whether deductible and limit apply per event or to the period aggregate.',
        'Only the numeric deductible; the basis does not matter.',
        [
          'Read the timing words.',
          'Two events are not one event.',
          'Aggregate combines losses before the layer is applied.',
          'Wording changes the promise even when nominal numbers are unchanged.',
        ],
      ),
      numeric('per', 'Total payment on per-occurrence basis?', per, [
        'Apply the layer to each loss independently.',
        `First loss ${a}, second ${b}; deductible ${d} each.`,
        `Each payment is capped at ${m}; then add.`,
        `Per-occurrence pays ${per}.`,
      ]),
      numeric('aggregate', 'Total payment on aggregate basis?', aggregate, [
        'Add losses before applying the contract.',
        `Total loss=${a + b}.`,
        `Apply deductible ${d} and cap ${m} once.`,
        `Aggregate pays ${aggregate}.`,
      ]),
      numeric(
        'retained',
        'Aggregate retained loss before premium?',
        a + b - aggregate,
        [
          'Combine the two original losses.',
          `Total loss=${a + b}.`,
          `Subtract aggregate payment ${aggregate}.`,
          `Retained loss=${a + b - aggregate}.`,
        ],
      ),
      numeric(
        'cost',
        'Aggregate buyer total cost including premium?',
        a + b - aggregate + premium,
        [
          'Buyer cost includes retained loss.',
          `Subtract aggregate payment ${aggregate} from losses ${a + b}.`,
          `Add one premium ${premium}, not one per event.`,
          `Total cost=${a + b - aggregate + premium}.`,
        ],
      ),
      choice(
        'meaning',
        'interpretation',
        'Is aggregate always more protective?',
        'No: deductible aggregation can help, but a shared limit can reduce payment.',
        'Yes, aggregating always increases payment regardless of limit.',
        [
          'Compare both deductible and limit.',
          'An aggregate deductible attaches sooner after combined small losses.',
          'A per-event limit can replenish for a second large event.',
          'Both terms and loss pattern determine the ordering.',
        ],
      ),
      choice(
        'boundary',
        'limitation',
        'What real-policy details are excluded?',
        'Coverage exclusions, coinsurance, reinstatement terms and default; none are implied.',
        'All real policies have the same basis and full funding.',
        [
          'We authored a simplified contract.',
          'No coinsurance percentage is present.',
          'Funding was assumed explicitly; not inferred from the deductible.',
          'Read actual policy wording; this example is not legal or pricing advice.',
        ],
      ),
    ],
    [
      `Per-occurrence payment ${per}, aggregate payment ${aggregate}.`,
      `Aggregate retained loss ${a + b - aggregate}, total buyer cost ${a + b - aggregate + premium}, seller profit ${premium - aggregate}.`,
    ],
  )
}
const f08Cases = [
  layer(
    'worked',
    'worked',
    'Read a capped loss contract',
    90,
    50,
    100,
    15,
    40,
    32,
    'Losses 0/90/250 have physical probabilities .5/.3/.2; payment contributions 0/12/20.',
  ),
  layer(
    'partial',
    'partial',
    'Complete the machinery loss ledger',
    100,
    20,
    60,
    12,
    60,
    30,
    'Losses 0/50/100 have probabilities .25/.5/.25; payment contributions 0/15/15.',
  ),
  layer(
    'practice',
    'practice',
    'Warehouse protection, not a loss cap',
    180,
    40,
    90,
    20,
    90,
    30,
    'Losses 0/80/180 have probabilities .5/.3/.2; payment contributions 0/12/18.',
  ),
  layer(
    'transfer-1',
    'transfer',
    'Equipment repair layer',
    220,
    40,
    80,
    16,
    80,
    17,
    'Losses 0/70/220 have probabilities .6/.3/.1; payment contributions 0/9/8.',
  ),
  asset('transfer-2', 'transfer', 100, 10, 3, 60, 30),
  wording('transfer-3', 'transfer', 80, 80, 100, 1000, 7, 0, 60),
  layer(
    'review-1',
    'review',
    'Changed machinery layer',
    240,
    60,
    130,
    18,
    130,
    47,
    'Losses 0/100/240 have probabilities .5/.2/.3; payment contributions 0/8/39.',
  ),
  asset('review-2', 'review', 80, 20, 6, 40, 20),
  wording('review-3', 'review', 90, 110, 70, 50, 10, 90, 50),
]
function cashout(
  suffix: string,
  mode: 'transfer' | 'review',
  gross: number,
  p: number,
  quote: number,
  fee: number,
  indemnity: number,
  premium: number,
) {
  return authored(
    'f09',
    suffix,
    mode,
    'Sell a contingent receivable or buy a loss-only layer?',
    [
      `Receivable pays ${gross} with physical probability ${p}, otherwise zero. All contracts fully funded.`,
      `Sell the whole claim now for quote ${quote} minus one fee ${fee}: no future payoff retained.`,
      `Alternatively keep it and buy loss-only indemnity ${indemnity} when the receivable fails, premium ${premium}; indemnity pays zero on success.`,
    ],
    [
      choice(
        'setup',
        'setup',
        'Which contract retains the upside?',
        'Loss-only insurance retains the claim; cashout transfers it.',
        'Cashout is identical to loss-only insurance.',
        [
          'Trace who owns the claim after each action.',
          'The cashout buyer receives its future payoff.',
          'Insurance pays only on failure; the original claim remains owned.',
          'Selling a claim and adding a loss-contingent contract are different cashflows.',
        ],
      ),
      numeric('cashout', 'Certain net cashout?', quote - fee, [
        'Use the quoted gross price.',
        `Quote ${quote}.`,
        `Subtract fee ${fee} once.`,
        `Net cashout=${quote - fee}.`,
      ]),
      numeric(
        'protected',
        'Physical expected protected net receipts?',
        p * gross + (1 - p) * indemnity - premium,
        [
          'Consider success and failure separately.',
          `Success pays ${gross}−${premium}; failure pays ${indemnity}−${premium}.`,
          `Weight by ${p} and ${1 - p}.`,
          `Physical expectation=${p * gross + (1 - p) * indemnity - premium}; it is not a market price.`,
        ],
      ),
      choice(
        'meaning',
        'interpretation',
        'Can identical expected receipts establish equivalent protection?',
        'No: state-by-state payments and retained upside may differ.',
        'Yes: only a mean matters to the contract.',
        [
          'Compare the two settlement states.',
          'A fixed sale receipt is state-independent.',
          'Insurance keeps upside and modifies only the loss state.',
          'Equal means do not imply equal payoff vectors.',
        ],
      ),
      choice(
        'boundary',
        'limitation',
        'When may actual indemnity equal its promise?',
        'Only under the explicitly funded/enforceable settlement assumption.',
        'Always, because the payout formula is known.',
        [
          'A formula describes an obligation.',
          'A promise does not fund itself.',
          'Default and settlement terms need separate analysis.',
          'This case assumes full funding; it does not prove general counterparty solvency.',
        ],
      ),
    ],
    [
      `Cashout=${quote - fee}; protected physical expectation=${p * gross + (1 - p) * indemnity - premium}.`,
      'This is a hypothetical added contract, not a claim that ordinary poker cashout is insurance.',
    ],
  )
}
function funding(
  suffix: string,
  mode: 'transfer' | 'review',
  loss: number,
  promise: number,
  actual: number,
  premium: number,
) {
  return authored(
    'f09',
    suffix,
    mode,
    'A promise is not a payment',
    [
      `Loss ${loss}; contractual indemnity promise ${promise}; stated realized actual payment ${actual} due to an external funding shortfall; premium ${premium}.`,
      'Actual payment is supplied as a scenario fact. This laboratory does not estimate default probability or allocate a pool.',
    ],
    [
      choice(
        'setup',
        'setup',
        'Which ledger may subtract the whole promise?',
        'The contractual promise ledger only; the cash settlement uses actual payment.',
        'The buyer’s actual retained loss always subtracts the promise.',
        [
          'Separate obligation from transfer.',
          'Default changes the funded amount.',
          'Use the supplied actual payment for cash.',
          'Promise and actual are distinct fields.',
        ],
      ),
      numeric('unpaid', 'Unpaid obligation?', promise - actual, [
        'Start with the promised amount.',
        `Promise ${promise}, paid ${actual}.`,
        'Unpaid=promise−actual.',
        `Unpaid=${promise - actual}; promise=actual+unpaid.`,
      ]),
      numeric(
        'cost',
        'Buyer actual loss plus premium cost?',
        loss - actual + premium,
        [
          'Use actual funded cash, not nominal indemnity.',
          `Retained loss=${loss}−${actual}.`,
          `Add premium ${premium} once.`,
          `Actual buyer cost=${loss - actual + premium}.`,
        ],
      ),
      choice(
        'meaning',
        'interpretation',
        'Does a higher deductible repair counterparty default?',
        'No; it changes the promise but does not establish funding.',
        'Yes; deductible wording guarantees cash payment.',
        [
          'Identify the cause of shortfall.',
          'Coverage terms and capital are separate.',
          'Changing an obligation can reduce it, but provides no solvency proof.',
          'Funding must be modeled or stipulated separately.',
        ],
      ),
      choice(
        'boundary',
        'limitation',
        'Can this stated shortfall determine a default probability?',
        'No; one supplied settlement is not a probability distribution.',
        'Yes; use unpaid divided by promised as a default probability.',
        [
          'A fraction of unpaid cash is not an event frequency.',
          'This is a realized scenario, not repeated observations.',
          'No probability law for funding was supplied.',
          'Do not invent a probability or fair premium from this scenario.',
        ],
      ),
    ],
    [
      `Unpaid ${promise - actual}; actual retained loss ${loss - actual}; actual buyer cost ${loss - actual + premium}.`,
    ],
  )
}
function pricing(
  suffix: string,
  mode: 'transfer' | 'review',
  p: number,
  fee: number,
) {
  return authored(
    'f09',
    suffix,
    mode,
    'Physical expectation versus replicating cost',
    [
      `Separate finance model: stock today 100, terminal 120 or 80, call strike 100, no interest/dividends. Physical up probability ${p}.`,
      `A half share plus a bond liability of 40 replicates call payments 20/0; replication cost 10, additional fee ${fee}.`,
    ],
    [
      choice(
        'setup',
        'setup',
        'Which weight prices the replicated call in this complete two-state model?',
        'q=.5 from traded stock and bond prices.',
        `The physical forecast p=${p}.`,
        [
          'Match both state payments.',
          'Half a share gives 60/40; subtract 40 in each state.',
          'Cost 50−40=10; q solves 120q+80(1−q)=100.',
          'Pricing q=.5 differs from physical p.',
        ],
      ),
      numeric('expectation', 'Physical expected call payment?', 20 * p, [
        'Call pays only in the up state.',
        'Payments are 20 and 0.',
        `Weight by ${p} and ${1 - p}.`,
        `Expected payment=${20 * p}.`,
      ]),
      numeric(
        'net',
        'Physical expected buyer profit after cost and fee?',
        20 * p - 10 - fee,
        [
          'Payment is not profit.',
          'Subtract replication cost 10.',
          `Subtract fee ${fee} once, in all states.`,
          `Expected profit=${20 * p - 10 - fee}.`,
        ],
      ),
      choice(
        'meaning',
        'interpretation',
        'If the physical forecast changes without traded prices changing, what changes here?',
        'Physical expected profit, not the stated replicating cost.',
        'The replicating cost must equal the new physical expectation.',
        [
          'Separate scenario weights from replication.',
          'The hedge still matches 20/0.',
          'Its stock/bond costs are unchanged.',
          'p changes belief, not this no-arbitrage replication equation.',
        ],
      ),
      choice(
        'boundary',
        'limitation',
        'Can this price be transferred to an arbitrary insurance promise?',
        'No: different underlying, traded replication and funding assumptions require another model.',
        'Yes: every layer with a similar graph costs 10.',
        [
          'Payoff shape alone is insufficient.',
          'The claim is specifically replicable by the given assets.',
          'Insurance losses and default need their own model.',
          'Keep this separate-finance pricing boundary explicit.',
        ],
      ),
    ],
    [
      `Replicating cost 10; physical expected payoff ${20 * p}; expected profit after fee ${20 * p - 10 - fee}.`,
    ],
    'separate-finance',
  )
}
export const contractFragments: readonly CaseFragment[] = [
  {
    slotId: 'f08-contracts',
    unitId: 'f08',
    cases: f08Cases,
    sources: contractReferences,
    lesson: {
      brief: [
        'Build a contract from its state-contingent payment before discussing a premium.',
        'A deductible attaches coverage; a limit caps payment, not loss. Buyer and seller ledgers must reconcile.',
      ],
      retrieval: choice(
        'retrieval',
        'setup',
        'Is an indemnity payment the same quantity as total buyer cost?',
        'No: total cost is loss minus payment plus premium.',
        'Yes: the largest payment is the largest total cost.',
        [
          'Name loss and transfer separately.',
          'The buyer retains unpaid loss.',
          'Premium is paid even when indemnity is zero.',
          'Total cost=L−I(L)+premium.',
        ],
      ),
      predictionQuestion:
        'Before revealing: what will happen to payment, buyer cost and seller profit across the two kinks?',
      worked: [
        'With d=50 and M=100, losses 30/90/250 pay 0/40/100, retaining 30/50/150.',
        'With premium 15, buyer costs are 45/65/165 and seller profits 15/−25/−85.',
        'Losses 0/90/250 weighted .5/.3/.2 give expected loss 77, payment 32, buyer cost 60 and seller profit −17.',
      ],
      practice: [
        'Complete the partial machinery ledger before revealing its solution.',
        'Then solve the warehouse case without assistance, including expected payment and seller profit.',
      ],
      experiment: {
        experienceId: 'contracts',
        question:
          'Which term changes attachment, exhaustion, retained downside and the protection floor?',
        instructions: [
          'Commit a numerical prediction and rationale before running.',
          'Explore loss-layer, asset-protection and wording modes; inspect both chart and settlement table.',
          'Change one term after commitment to create a linked experiment; keep the original prediction.',
          'Reflect on the difference between the promise, actual funded cash and your supplied premium.',
        ],
      },
      transfer: [
        'Equipment repair layer with explicit loss probabilities.',
        'Genuine stock plus protective put.',
        'Two occurrence losses with alternate aggregate wording.',
      ],
      review: [
        'Changed layer, premium and physical distribution.',
        'Changed stock price, strike and premium.',
        'Changed two-loss pattern where the shared aggregate limit reduces payment.',
      ],
      limitation:
        'I(L)=max(L−d,0)−max(L−d−M,0) is a payoff identity, not a pricing identity. Full funding, no coinsurance and supplied premiums are explicit assumptions. Market replication is a separate model.',
      decisionReversal:
        'How high can the premium rise before expected buyer total cost exceeds uninsured expected loss? Then explain why risk preferences could still favor protection.',
    },
  },
  {
    slotId: 'f09-contracts',
    unitId: 'f09',
    sources: contractReferences,
    cases: [
      cashout('transfer-1', 'transfer', 200, 0.4, 74, 2, 100, 45),
      funding('transfer-2', 'transfer', 120, 80, 30, 14),
      pricing('transfer-3', 'transfer', 0.7, 2),
      cashout('review-1', 'review', 160, 0.6, 94, 3, 80, 36),
      funding('review-2', 'review', 150, 100, 75, 18),
      pricing('review-3', 'review', 0.35, 1),
    ],
  },
]
