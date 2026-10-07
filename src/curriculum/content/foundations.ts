export const connectionLabels = {
  direct: 'Same decision mathematics',
  'added-contract': 'Added teaching contract',
  'separate-finance': 'Separate finance model',
} as const
import kit from './units-kit.json'
import { baseCases } from './foundationCases/baseBanks'
import { retrieval } from './foundationCases/builders'
import { kellySource, pricingSource, probabilitySource } from './sources'
import {
  unitSteps,
  type FoundationUnit,
  type FragmentSlot,
  type LessonCopy,
  type UnitId,
} from '../core/types'

export const fragmentSlots: readonly FragmentSlot[] = [
  {
    id: 'f05-calibration',
    unitId: 'f05',
    owner: 'A01',
    purpose:
      'Base F05 lesson and Bayes/Beta worked/partial/practice plus calibration finance transfer/review banks.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'Bayes .25/.8/.2 → 4/7',
      'Beta(2,8)+4/5 → Beta(6,9), mean .40',
      'calibrated but unhelpful forecast',
      'Brier versus economic value',
      'all seven steps',
    ],
  },
  {
    id: 'f05-selection',
    unitId: 'f05',
    owner: 'A02',
    purpose:
      'Selection/positivity finance cases supplement F05; not a replacement for the calibration lesson.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'population versus observed sample',
      'known observation rates',
      'positivity and unavailable conditionals',
      'prediction before population reveal',
    ],
  },
  {
    id: 'f03-information',
    unitId: 'f03',
    owner: 'A03',
    purpose: 'Optional signal-value extension to the complete base F03 bank.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'EVSI and EVPI',
      'fee and abstention',
      'unreachable branches',
    ],
  },
  {
    id: 'f05-information',
    unitId: 'f05',
    owner: 'A03',
    purpose:
      'Signal/Bayes bridge supplements F05 without replacing A01/A02 requirements.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'prior and likelihood',
      'posterior action thresholds',
      'physical probability',
    ],
  },
  {
    id: 'f07-solvency',
    unitId: 'f07',
    owner: 'A05',
    purpose:
      'Complete F07 lesson, worked/partial/practice, three transfer and three review variants.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      '100 policies SD average 4/20.2978/40',
      'dependence with equal expected claims',
      'total versus average',
      'strict default',
      'funding and shortfall size',
      'all seven steps',
    ],
  },
  {
    id: 'f08-contracts',
    unitId: 'f08',
    owner: 'A04',
    purpose:
      'Complete F08 lesson, worked/partial/practice, three transfer and three review variants.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'deductible50 limit100 payments0/40/100',
      'put90 premium3 profits−13/−13/−3/+17',
      'attachment/exhaustion',
      'payment versus buyer cost',
      'ledger conservation',
      'all seven steps',
    ],
  },
  {
    id: 'f09-contracts',
    unitId: 'f09',
    owner: 'A04',
    purpose:
      'Optional protection/obligation extension; base F09 is already complete.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'cashout versus loss-only insurance',
      'fees',
      'promise versus actual payment',
    ],
  },
  {
    id: 'f10-information',
    unitId: 'f10',
    owner: 'A03',
    purpose:
      'Priced-information finance fragments for the independent F10 inventory/research scenario.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'research fee',
      'information set',
      'policy contingent on signal',
    ],
  },
  {
    id: 'f10-backtest',
    unitId: 'f10',
    owner: 'A06',
    purpose:
      'Research-credibility component only; not the complete independent F10 assessment.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'freeze before holdout',
      'development search counts',
      'holdout independence',
      'costs and uncertainty',
    ],
  },
  {
    id: 'f10-independent',
    unitId: 'f10',
    owner: 'A07',
    purpose:
      'Complete F10 shell with unfamiliar equipment, inventory, and warranty exposures; combine specialist fragments without inherited poker data.',
    minTransfer: 3,
    minReview: 3,
    requiredTopics: [
      'equipment downtime/protection',
      'seasonal inventory/paid demand research',
      'warranty/common event',
      'incremental ledger',
      'retained loss/cost',
      'funding',
      'decision-changing assumption',
      'all seven steps',
    ],
  },
]

const lessons: Partial<Record<UnitId, LessonCopy>> = {
  f01: {
    brief: [
      'You decide now, not at the start of the hand. Name what is public, what belongs to you, and what remains unknown. Opponent cards and the future deck are not legitimate learning inputs.',
      'A terminal call into an existing100-chip pot costs25. Folding changes wealth by0; calling changes it by+100 on a win or−25 on a loss. Receiving the final125-chip pot is not a125-chip profit. Prior committed chips are sunk.',
      'Finance bridge: a license costs18 now and pays gross80 on success: success+62, failure−18. The invented contract specifies a receipt but does not reveal its success probability.',
    ],
    retrieval: retrieval(
      'Which cost belongs in a decision taken now?',
      'A new payment caused by today’s action.',
      'Every historical expense, even if unchanged by today’s action.',
      'Incremental accounting compares future cash flows changed by the choice.',
    ),
    predictionQuestion:
      'Before revealing a ledger, predict net gain on success, choose accept/decline if possible, and name the probability or enforceability information still needed.',
    worked: [
      'Write fold/decline as0 incremental.',
      'List payments at purchase and receipts at settlement separately.',
      'Subtract today’s payment exactly once in each state; exclude sunk chips.',
    ],
    practice: [
      'First complete the missing failure row in the partially worked license case; the purchase row is supplied.',
      'Then solve the independent storage permit case, including its failure recovery. Do not reuse the worked answer.',
    ],
    experiment: {
      question:
        'If the call cost rises while the existing pot stays100, which state ledger entries change and where is zero EV?',
      instructions: [
        'Commit a direction and numeric prediction before moving controls.',
        'Use core Odds as a synthetic what-if; slider values are not necessarily legal actions in the paused hand.',
        'Compare the modeled answer to your prediction, not the table’s realized winner.',
      ],
      legacyId: 'odds',
    },
    transfer: [
      'Choose one fresh business variant. Construct both settlement outcomes and classify what was knowable before purchase.',
      'An unaided prediction plus correct critical setup/information/limitation items and at least80% structured score can demonstrate transfer.',
    ],
    review: [
      'Return after the device-time due date and choose a materially changed unseen review case.',
      'Hinted or repeated cases are useful practice but cannot establish unaided retention.',
    ],
    limitation:
      'A correct ledger does not identify the success probability, strategic response, or whether a payer has funding.',
    decisionReversal:
      'Would a higher current cost change the ledger? Would a larger prior sunk cost change it? Explain the distinction.',
  },
  f02: {
    brief: [
      'A probability answers one event under one information set. State the event in words before counting. “Improve,” “win,” “receive a payment,” and “earn profit” may select different states.',
      'Four visible spades among five visible cards leave9 spades among47 unseen cards. Next-card chance is9/47; by the river it is1−(38/47)(37/46). After a non-spade turn, the next denominator is46.',
      'Uniform deck arithmetic is not a model of an opponent’s action-conditioned range. Ties in equity require pot-share accounting rather than counting every improvement as a win.',
    ],
    retrieval: retrieval(
      'Which information may condition the next-card count?',
      'Known visible cards and the stated sampling rule.',
      'Unseen opponent cards or a future-card answer from the simulator.',
      'Conditioning is restricted to information available to the forecaster.',
    ),
    predictionQuestion:
      'Predict whether a missed non-spade turn increases, decreases, or leaves the next-spade chance unchanged; give an estimate and rationale before seeing the denominator.',
    worked: [
      'Count the eligible unseen cards.',
      'For two draws without replacement, compute the complement of two non-spades.',
      'Keep the event “spade” separate from winning or profitable trade.',
    ],
    practice: [
      'Complete9/___ after observing a non-spade turn; no out was removed.',
      'Solve an asset table with a positive-payment event, then note how a premium would change the profit event.',
    ],
    experiment: {
      question:
        'Does making a flush have the same probability as winning and the same expected pot share?',
      instructions: [
        'Predict before comparing Outs with Equity.',
        'Use synthetic/public inputs only; do not expose hidden cards.',
        'Record which event each number forecasts and how ties affect share.',
      ],
      legacyId: 'outs',
    },
    transfer: [
      'Select a fresh finite finance event: profit versus payment, a reviewed borrower, or dependent sampling.',
      'Write the conditioning denominator explicitly. Weighted states require weights, not a raw row count.',
    ],
    review: [
      'Use a new review table after the due date. Prices, conditioning observations, and sampling regimes change.',
      'A repeated identical event answer is not delayed retention evidence.',
    ],
    limitation:
      'A finite uniform example gives no evidence that a real asset, selected sample, or strategic opponent is uniform or independent.',
    decisionReversal:
      'What new observation or payoff definition changes the denominator or numerator?',
  },
  f03: {
    brief: [
      'Price can reverse a good-looking claim. Under a stated risk-neutral objective, compare incremental expected profit with the zero profit of decline.',
      'Terminal call: p=.30, existing pot100, call cost25. Net states+100/−25; EV=.3×100−.7×25=12.5. Break-even p=25/(100+25)=.20. Most single trials still lose.',
      'A finance claim paying gross80 with probability.40 and costing25 has expected profit7 and break-even price32. Physical expected payout is not automatically a market price.',
    ],
    retrieval: retrieval(
      'What is the difference between gross receipt and profit?',
      'Profit subtracts the purchase payment and any fees.',
      'Gross receipt is always the net gain.',
      'Construct the incremental ledger before taking expectation.',
    ),
    predictionQuestion:
      'Predict the sign of EV and zero-crossing price before computing; select buy/decline/either and state confidence.',
    worked: [
      'List net payoff in both states.',
      'Weight each by physical probability or use p×gross−price for a gross claim.',
      'Compare EV with0; at exact equality either choice may be justified as indifferent.',
    ],
    practice: [
      'Complete the expected receipt before subtracting price in the partial case.',
      'Solve the independent overpriced receipt. A large prize can still have negative EV.',
    ],
    experiment: {
      question: 'At what cost does the modeled decision reverse?',
      instructions: [
        'Predict the threshold before using the core Odds control.',
        'For a gross claim threshold price is p×gross; for existing-pot calls threshold probability is cost/(pot+cost).',
        'Do not grade a prediction by whether the single realized hand won.',
      ],
      legacyId: 'odds',
    },
    transfer: [
      'Three finance regimes require buying, declining, and exact indifference.',
      'Include prices and all supplied fees; use authored numeric tolerance, not displayed rounding.',
    ],
    review: [
      'Fresh quotes and probabilities require fresh ledgers after the due date.',
      'Positive simulated profit does not count as correct reasoning.',
    ],
    limitation:
      'Risk-neutral physical expectation ignores risk preference, capital constraints and unmodeled default; market replication prices require market assumptions.',
    decisionReversal:
      'Which price or physical probability puts expected profit exactly at zero?',
  },
  f04: {
    brief: [
      'An expected payoff is a weighted average, not a guarantee. Outcome variability, uncertain parameters, a wrong model, and finite simulation noise are different problems.',
      'The asymmetric+100/−25 case at p=.30 has mean12.5 and variance3281.25, hence SD57.282196. Five independent losses occur with probability.7^5=.16807.',
      'For n iid trials, expected total scales by n, total SD by sqrt(n), and average SD by1/sqrt(n). These statements require independence and a fixed finite variance.',
    ],
    retrieval: retrieval(
      'Can positive expected profit coexist with losing most trials?',
      'Yes: an infrequent large gain can outweigh frequent small losses.',
      'No: a positive mean guarantees a majority of wins.',
      'Frequency and payoff size both determine expectation.',
    ),
    predictionQuestion:
      'Before running repetition, predict the direction of total SD and average SD as independent trial count rises.',
    worked: [
      'Compute the mean before squared deviations.',
      'Weight squared deviations to obtain variance; take its square root for SD.',
      'Keep the asymmetric worked case separate from the legacy Variance lab’s symmetric±100 example.',
    ],
    practice: [
      'Complete the total-variance row for four independent±10 outcomes.',
      'Compute a nine-trial average SD and explain why a common shock invalidates the independent formula.',
    ],
    experiment: {
      question:
        'Does increasing independent trial count reduce total risk, average risk, or model error?',
      instructions: [
        'Commit distinct predictions for total and average.',
        'Core Variance uses its displayed symmetric payoffs; do not transplant asymmetric answers.',
        'Compare the distribution/table, not one sampled path.',
      ],
      legacyId: 'variance',
    },
    transfer: [
      'Use project totals, project averages, and consecutive failures in different business contexts.',
      'Name whether your numeric answer is a probability or a currency SD.',
    ],
    review: [
      'Use new counts/payoffs and the changed requested quantity after the due date.',
      'More simulation cannot repair an incorrect probability or ignored shared shock.',
    ],
    limitation:
      'Independence and stable probabilities are hypotheses, not facts proved by a long simulation.',
    decisionReversal:
      'How would a shared shock or a revised payoff distribution change the repetition argument?',
  },
  f06: {
    brief: [
      'A funded position must fit both an objective and a capital constraint. Maximum expected profit, log growth, and a hard wealth floor are not interchangeable.',
      'Known iid even-money p=.55 gives nominal full Kelly10% and half Kelly5% of current wealth. This is a hypothetical allocation, never a legal poker raise or robust-edge recommendation.',
      'Wealth200 with20% chance of losing100: uninsured mean180; full protection at premium22 gives178 certainly. Risk neutral declines; under log utility uninsured CE=exp(.8 ln200+.2 ln100)=174.110113, so the log owner buys.',
    ],
    retrieval: retrieval(
      'Does maximum expected wealth specify every owner’s objective?',
      'No: a specified preference or binding funding floor can change the choice.',
      'Yes: a larger mean always dominates every feasible alternative.',
      'Specify the objective before evaluating actions.',
    ),
    predictionQuestion:
      'Predict whether a risk-neutral and a log-utility owner choose the same protection quote. Give a numeric wealth estimate and rationale before revealing CE.',
    worked: [
      'Account for premium in every state and use positive terminal wealth for logs.',
      'For even money, nominal fraction=2p−1 when positive; fractional Kelly reduces that fraction.',
      'Recompute stake as a fraction of current wealth after each modeled round.',
    ],
    practice: [
      'Finish the half-Kelly row for p=.56.',
      'Solve an independently changed capital-floor protection case before comparing means.',
    ],
    experiment: {
      question:
        'How do protection fees change mean wealth and floor-crossing risk?',
      instructions: [
        'Commit a direction prediction before changing the synthetic core Risk controls.',
        'Separate first-passage drawdown probability from terminal wealth percentiles.',
        'Nominal sizing assumes the supplied edge; robust uncertain-edge optimization is planned, not implemented.',
      ],
      legacyId: 'risk',
    },
    transfer: [
      'The same200-unit risk supports two different choices under mean versus log objectives. A third variant imposes a hard floor.',
      'Do not choose solely the highest modeled mean when a constraint makes it infeasible.',
    ],
    review: [
      'The review bank includes a cheaper protection quote, an expensive log-preference quote, and a new fractional-sizing regime.',
      'Use a fresh due-date case; neither realized profit nor a remembered action establishes retention.',
    ],
    limitation:
      'Known-edge Kelly is not robust Kelly and does not guarantee drawdown control. Contract protection additionally assumes a solvent payer.',
    decisionReversal:
      'Which premium, objective, capital floor or revised edge changes the funded choice?',
  },
  f09: {
    brief: [
      'A physical expected payment and a no-arbitrage replication cost answer different questions. An invented insurance promise additionally depends on a solvent payer.',
      'Stock100→120/80, rate0, strike100 call pays20/0. Half a share minus debt40 replicates it and costs10. Physical up probability.70 gives expected payment14, not a new replication price.',
      'A cashout sells a pot claim; loss-only insurance pays in a defined losing state. Premiums and fees change buyer profit. Neither is a real CDS: reference obligations, default definitions, recovery, timing, collateral and counterparty risk are not modeled here.',
    ],
    retrieval: retrieval(
      'What must be added to a payment promise before claiming funded protection?',
      'Who pays, when, and what capital backs the obligation.',
      'Only a positive expected margin.',
      'Expected profitability does not prove the payer can meet every realized claim.',
    ),
    predictionQuestion:
      'If the physical up forecast changes while market prices/states stay fixed, predict what happens to expected payment and replicating cost separately.',
    worked: [
      'Derive call payments from max(S−K,0).',
      'Solve the two state hedge equations and price shares plus borrowing.',
      'Add explicit buyer fees separately; distinguish promised from actual payment under default.',
    ],
    practice: [
      'Complete the borrowing row for a new stock/strike example.',
      'Independently compute a hedge cost and compare its physical expected payment.',
    ],
    experiment: {
      question:
        'Which controls change physical expectation, market hedge cost, or protection preferences?',
      instructions: [
        'Use core Pricing, Replication and Risk as separate guided comparisons, not one merged probability slider.',
        'Commit a prediction about physical p before inspecting a hedge table.',
        'A state-by-state identity prices only under the stated executable-market/funding assumptions.',
      ],
      legacyId: 'replication',
    },
    transfer: [
      'Three market regimes include different strikes, forecasts and an explicit fee.',
      'Name the measure/objective, payer, and capital/funding assumption; no market CDS value is calculated.',
    ],
    review: [
      'Use unfamiliar market states, forecasts and fees after the due date.',
      'A repeated physical number is not an answer to a pricing question.',
    ],
    limitation:
      'Additional states, default, funding frictions, restrictions and collateral can break simple replication or alter actual payments.',
    decisionReversal:
      'What fee, funding constraint or default clause changes buyer profit even if a promised-payoff diagram is unchanged?',
  },
}
const questions: Record<UnitId, string> = {
  f01: 'What can I know and choose at this moment?',
  f02: 'What event am I forecasting, and what is its denominator?',
  f03: 'When does price reverse the decision?',
  f04: 'How can a positive average still produce loss?',
  f05: 'What should new observations change about a forecast?',
  f06: 'Which objective and capital constraint govern exposure?',
  f07: 'Does pooling remove the risk that matters?',
  f08: 'Which words determine the contingent payment?',
  f09: 'What determines price, and who pays?',
  f10: 'Can I defend a decision in an unfamiliar finance setting?',
}
const experiences: Partial<Record<UnitId, FoundationUnit['experiences']>> = {
  f03: ['information'],
  f05: ['calibration', 'selection', 'information'],
  f07: ['solvency'],
  f08: ['contracts'],
  f09: ['contracts', 'solvency'],
  f10: ['information', 'backtest'],
}
export const foundations: readonly FoundationUnit[] = kit.map((row) => {
  const id = row.id as UnitId
  const cases = baseCases.filter((c) => c.unitId === id)
  return {
    id,
    contentVersion: 1,
    rubricVersion: 1,
    title: row.title,
    question: questions[id],
    objectives: [
      questions[id],
      'Construct a defensible decision under stated information, objective and limitations; do not grade by realized profit.',
    ],
    prerequisites: row.prerequisites as UnitId[],
    conceptIds: row.concepts,
    steps: unitSteps,
    legacyResources: row.legacy_resources as FoundationUnit['legacyResources'],
    experiences: experiences[id] ?? [],
    workedCaseIds: cases.filter((c) => c.mode === 'worked').map((c) => c.id),
    practiceCaseIds: cases
      .filter((c) => c.mode === 'partial' || c.mode === 'practice')
      .map((c) => c.id),
    transferCaseIds: cases
      .filter((c) => c.mode === 'transfer')
      .map((c) => c.id),
    reviewCaseIds: cases.filter((c) => c.mode === 'review').map((c) => c.id),
    sources:
      id === 'f06'
        ? [kellySource, probabilitySource]
        : id === 'f09'
          ? [pricingSource, probabilitySource]
          : [probabilitySource],
    availability: lessons[id] ? 'available' : 'partial',
    lesson: lessons[id] ?? null,
    fragmentSlots: fragmentSlots.filter((s) => s.unitId === id),
  }
})
