import type {
  CaseFragment,
  CaseRecord,
  Question,
  UnitId,
} from '../../core/types'
import type { Action, InformationInputs } from './model'
import { assumptions, sourceReferences } from './sources'

interface AuthoredScenario {
  unit: 'f03' | 'f05' | 'f10'
  mode: 'transfer' | 'review'
  variant: number
  title: string
  role: string
  context: string
  inputs: InformationInputs
  positive: number
  posterior: number | null
  negativePosterior: number | null
  baseline: number
  signalValue: number
  maxFee: number
  perfectIncrement: number
  net: number
  positiveFailureNet: number
  policy: readonly [Action, Action]
  reversal?: { prompt: string; answer: string; rationale: string }
}
const inputs = (
  prior: number,
  gain: number,
  loss: number,
  sensitivity: number,
  specificity: number,
  fee: number,
): InformationInputs => ({ prior, gain, loss, sensitivity, specificity, fee })

// Authored answers checked with rational arithmetic independently of the model.
export const authoredScenarios: readonly AuthoredScenario[] = [
  {
    unit: 'f03',
    mode: 'transfer',
    variant: 1,
    title: 'Equipment lease diligence',
    role: 'Small manufacturer',
    context:
      'A private engineering report arrives before signing a cancellable equipment lease. Success means the new line can serve the order; failure means it cannot. The specified cash flows are net profits, not gross revenue.',
    inputs: inputs(0.35, 140, 50, 0.8, 0.85, 10),
    positive: 0.3775,
    posterior: 140 / 188.75,
    negativePosterior: 28 / 249,
    baseline: 16.5,
    signalValue: 34.325,
    maxFee: 17.825,
    perfectIncrement: 32.5,
    net: 24.325,
    positiveFailureNet: -60,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f03',
    mode: 'transfer',
    variant: 2,
    title: 'Route permit scout',
    role: 'Delivery cooperative',
    context:
      'A scout checks whether a proposed route is viable before the cooperative commits to a launch. The scout can miss viable routes or recommend unviable ones; the permit and launch terms remain fixed.',
    inputs: inputs(0.2, 90, 30, 0.85, 0.75, 6),
    positive: 0.37,
    posterior: 17 / 37,
    negativePosterior: 1 / 21,
    baseline: 0,
    signalValue: 9.3,
    maxFee: 9.3,
    perfectIncrement: 18,
    net: 3.3,
    positiveFailureNet: -36,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f03',
    mode: 'transfer',
    variant: 3,
    title: 'A report that always endorses',
    role: 'Warehouse tenant',
    context:
      'A screening vendor always returns positive on a vacancy project: sensitivity 1, specificity 0. There is no negative branch. Paying for an endorsement cannot change the supplied prior.',
    inputs: inputs(0.8, 100, 20, 1, 0, 3),
    positive: 1,
    posterior: 0.8,
    negativePosterior: null,
    baseline: 76,
    signalValue: 76,
    maxFee: 0,
    perfectIncrement: 4,
    net: 73,
    positiveFailureNet: -23,
    policy: ['take', 'unreachable'],
    reversal: {
      prompt:
        'Replace the always-positive report with perfect private information (s=t=1), retaining the fee 3. Which purchase decision reverses?',
      answer: 'Buy: perfect information adds 4, which exceeds the fee 3.',
      rationale:
        'Perfect information avoids the failure loss. EVPI=80−76=4; 4−3>0.',
    },
  },
  {
    unit: 'f03',
    mode: 'review',
    variant: 1,
    title: 'Changed lease terms',
    role: 'Small manufacturer',
    context:
      'A fresh equipment order has changed net profits and a changed report fee. Recompute; the earlier lease answer is not transferable by memorizing its number.',
    inputs: inputs(0.4, 125, 45, 0.8, 0.85, 12),
    positive: 0.41,
    posterior: 32 / 41,
    negativePosterior: 8 / 59,
    baseline: 23,
    signalValue: 35.95,
    maxFee: 12.95,
    perfectIncrement: 27,
    net: 23.95,
    positiveFailureNet: -57,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f03',
    mode: 'review',
    variant: 2,
    title: 'A new delivery district',
    role: 'Delivery cooperative',
    context:
      'For another district the viable-route prior, net profits and research fee differ. Success and failure net profits settle only after the route is launched.',
    inputs: inputs(0.25, 95, 35, 0.85, 0.75, 8),
    positive: 0.4,
    posterior: 0.53125,
    negativePosterior: 0.0625,
    baseline: 0,
    signalValue: 13.625,
    maxFee: 13.625,
    perfectIncrement: 23.75,
    net: 5.625,
    positiveFailureNet: -43,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f03',
    mode: 'review',
    variant: 3,
    title: 'Known unviable site',
    role: 'Warehouse tenant',
    context:
      'In this hypothetical variant the site is certainly unviable (prior 0). Even a perfect diagnostic has an unreachable positive branch. Do not fabricate a posterior for that branch.',
    inputs: inputs(0, 105, 30, 1, 1, 3),
    positive: 0,
    posterior: null,
    negativePosterior: 0,
    baseline: 0,
    signalValue: 0,
    maxFee: 0,
    perfectIncrement: 0,
    net: -3,
    positiveFailureNet: -3,
    policy: ['unreachable', 'decline'],
    reversal: {
      prompt:
        'A different site has prior .30 with G105/C30 and the same perfect diagnostic and fee3. Does the purchase decision reverse?',
      answer: 'Buy the diagnostic for the different site.',
      rationale:
        'At the new site V0=.3×105−.7×30=10.5, Vperfect=31.5, and EVPI=21>3. The changed prior, not observation of a fixed impossible event, creates the opportunity.',
    },
  },
  {
    unit: 'f05',
    mode: 'transfer',
    variant: 1,
    title: 'Freight quality assay',
    role: 'Importer',
    context:
      'A lab flags batches before an optional purchase. A positive result has probability .90 among good batches but also occurs among bad batches. The supplied prior is the fraction of good batches, not the test sensitivity.',
    inputs: inputs(0.15, 180, 40, 0.9, 0.85, 4),
    positive: 0.2625,
    posterior: 18 / 35,
    negativePosterior: 6 / 295,
    baseline: 0,
    signalValue: 19.2,
    maxFee: 19.2,
    perfectIncrement: 27,
    net: 15.2,
    positiveFailureNet: -44,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f05',
    mode: 'transfer',
    variant: 2,
    title: 'An inverted device diagnostic',
    role: 'Refurbisher',
    context:
      'A mislabeled diagnostic is anti-informative: sensitivity .20 and specificity .30. The labels are known and can be interpreted correctly before buying a repairable device. Positive is not necessarily good news.',
    inputs: inputs(0.45, 75, 60, 0.2, 0.3, 2),
    positive: 0.475,
    posterior: 18 / 95,
    negativePosterior: 24 / 35,
    baseline: 0.75,
    signalValue: 17.1,
    maxFee: 16.35,
    perfectIncrement: 33,
    net: 15.1,
    positiveFailureNet: -2,
    policy: ['decline', 'take'],
  },
  {
    unit: 'f05',
    mode: 'transfer',
    variant: 3,
    title: 'Survey that cannot change the launch',
    role: 'Regional distributor',
    context:
      'A private demand survey changes beliefs, but this region already has a high success prior. Compare both posterior probabilities with the payoff threshold rather than buying solely for accurate prediction.',
    inputs: inputs(0.85, 90, 25, 0.8, 0.8, 5),
    positive: 0.71,
    posterior: 68 / 71,
    negativePosterior: 17 / 29,
    baseline: 72.75,
    signalValue: 72.75,
    maxFee: 0,
    perfectIncrement: 3.75,
    net: 67.75,
    positiveFailureNet: -30,
    policy: ['take', 'take'],
    reversal: {
      prompt:
        'Keep the prior and survey but raise the failure loss to200. Does the optimal purchase decision reverse?',
      answer:
        'Buy: the negative-signal branch now favors declining and EVSI8.7 exceeds fee5.',
      rationale:
        'The new threshold is200/290. V0=46.5 and Vsig=.68×90−.03×200=55.2; EVSI8.7>5.',
    },
  },
  {
    unit: 'f05',
    mode: 'review',
    variant: 1,
    title: 'Another freight batch',
    role: 'Importer',
    context:
      'The new batch has prior .20 and changed commercial terms. Use both good and bad contributions to the positive sample; no observed market price is supplied.',
    inputs: inputs(0.2, 150, 50, 0.9, 0.85, 7),
    positive: 0.3,
    posterior: 0.6,
    negativePosterior: 1 / 35,
    baseline: 0,
    signalValue: 21,
    maxFee: 21,
    perfectIncrement: 30,
    net: 14,
    positiveFailureNet: -57,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f05',
    mode: 'review',
    variant: 2,
    title: 'Changed diagnostic labels',
    role: 'Refurbisher',
    context:
      'For another device lot the negative label is again favorable, but the prior, sensitivity, specificity, fee and repair profits have changed. Neither the earlier posterior nor its payoff threshold carries over.',
    inputs: inputs(0.4, 80, 55, 0.15, 0.25, 3),
    positive: 0.51,
    posterior: 2 / 17,
    negativePosterior: 34 / 49,
    baseline: 0,
    signalValue: 18.95,
    maxFee: 18.95,
    perfectIncrement: 32,
    net: 15.95,
    positiveFailureNet: -3,
    policy: ['decline', 'take'],
  },
  {
    unit: 'f05',
    mode: 'review',
    variant: 3,
    title: 'A different regional survey',
    role: 'Regional distributor',
    context:
      'A lower prior and higher failure loss still leave both survey posteriors above the action threshold. Information changes confidence without changing this expected-profit policy.',
    inputs: inputs(0.7, 100, 35, 0.8, 0.8, 5),
    positive: 0.62,
    posterior: 28 / 31,
    negativePosterior: 7 / 19,
    baseline: 59.5,
    signalValue: 59.5,
    maxFee: 0,
    perfectIncrement: 10.5,
    net: 54.5,
    positiveFailureNet: -40,
    policy: ['take', 'take'],
    reversal: {
      prompt:
        'Keep the survey but increase failure loss to200. Does purchasing become worthwhile?',
      answer:
        'Buy: EVSI34 exceeds fee5 after the negative branch switches to decline.',
      rationale:
        'V0=.7×100−.3×200=10. Vsig=.56×100−.06×200=44. The new threshold200/300 is above the negative posterior7/19.',
    },
  },
  {
    unit: 'f10',
    mode: 'transfer',
    variant: 1,
    title: 'Seasonal inventory research',
    role: 'Shop owner',
    context:
      'A private demand study arrives before a seasonal order. High demand makes the order profitable; low demand creates the stated net loss after salvage. The supplier price is fixed before research.',
    inputs: inputs(0.3, 160, 55, 0.85, 0.9, 10),
    positive: 0.325,
    posterior: 51 / 65,
    negativePosterior: 1 / 15,
    baseline: 9.5,
    signalValue: 36.95,
    maxFee: 27.45,
    perfectIncrement: 38.5,
    net: 26.95,
    positiveFailureNet: -65,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f10',
    mode: 'transfer',
    variant: 2,
    title: 'Acquisition diligence is too expensive',
    role: 'Business buyer',
    context:
      'A private report on an acquisition can separate favorable and unfavorable projects before signing. The report’s gross decision value is positive, but compare the fee against its incremental value rather than gross signal-policy profit.',
    inputs: inputs(0.55, 150, 80, 0.8, 0.75, 15),
    positive: 0.5525,
    posterior: 176 / 221,
    negativePosterior: 44 / 179,
    baseline: 46.5,
    signalValue: 57,
    maxFee: 10.5,
    perfectIncrement: 36,
    net: 42,
    positiveFailureNet: -95,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f10',
    mode: 'transfer',
    variant: 3,
    title: 'Export approval study',
    role: 'Export venture sponsor',
    context:
      'A feasibility study arrives before an export venture is launched. Approval success and failure govern the supplied net profits. All model probabilities are physical assessments, and the fee is due even if the venture is abandoned.',
    inputs: inputs(0.25, 200, 70, 0.75, 0.9, 15),
    positive: 0.2625,
    posterior: 5 / 7,
    negativePosterior: 5 / 59,
    baseline: 0,
    signalValue: 32.25,
    maxFee: 32.25,
    perfectIncrement: 50,
    net: 17.25,
    positiveFailureNet: -85,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f10',
    mode: 'review',
    variant: 1,
    title: 'A fresh seasonal order',
    role: 'Shop owner',
    context:
      'Next season brings a changed prior, margins, likelihoods and study fee. The decision is still reversible before the order, and the study remains private; previous expected profits are not evidence for this variant.',
    inputs: inputs(0.35, 175, 65, 0.8, 0.85, 13),
    positive: 0.3775,
    posterior: 140 / 188.75,
    negativePosterior: 28 / 249,
    baseline: 19,
    signalValue: 42.6625,
    maxFee: 23.6625,
    perfectIncrement: 42.25,
    net: 29.6625,
    positiveFailureNet: -78,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f10',
    mode: 'review',
    variant: 2,
    title: 'A more informative acquisition report',
    role: 'Business buyer',
    context:
      'A different acquisition and improved report change the economics. A higher nominal research fee can be justified by a larger policy improvement; gross accuracy alone does not determine the answer.',
    inputs: inputs(0.5, 165, 85, 0.85, 0.8, 18),
    positive: 0.525,
    posterior: 17 / 21,
    negativePosterior: 3 / 19,
    baseline: 40,
    signalValue: 61.625,
    maxFee: 21.625,
    perfectIncrement: 42.5,
    net: 43.625,
    positiveFailureNet: -103,
    policy: ['take', 'decline'],
  },
  {
    unit: 'f10',
    mode: 'review',
    variant: 3,
    title: 'Another export market',
    role: 'Export venture sponsor',
    context:
      'A different market has a changed approval prior and different study sensitivity. Maintain the distinction between a predicted profitable policy, the one eventual realized outcome and any market price response.',
    inputs: inputs(0.3, 210, 75, 0.7, 0.9, 17),
    positive: 0.28,
    posterior: 0.75,
    negativePosterior: 0.125,
    baseline: 10.5,
    signalValue: 38.85,
    maxFee: 28.35,
    perfectIncrement: 52.5,
    net: 21.85,
    positiveFailureNet: -92,
    policy: ['take', 'decline'],
  },
]
function numeric(
  id: string,
  component: Question['component'],
  prompt: string,
  expected: number,
  units: string,
  rationale: string,
  critical = true,
): Question {
  return {
    id,
    component,
    kind: 'numeric',
    points: 10,
    critical,
    prompt,
    expected,
    units,
    tolerance: units === 'probability fraction' ? 1e-6 : 0.001,
    rationale,
    hints: [
      'Identify what is known before the action and distinguish the joint probability from a conditional.',
      'Write state probabilities and incremental cash flows without rounding intermediate terms.',
      rationale,
      `The value is ${expected} ${units}.`,
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
  const supported = { id: `${id}-supported`, label: correct, rationale }
  const unsupported = {
    id: `${id}-unsupported`,
    label: wrong,
    rationale: `This does not follow from the supplied information. ${rationale}`,
  }
  return {
    id,
    component,
    kind: 'choice',
    points: 10,
    critical,
    prompt,
    expected: supported.id,
    options:
      id === 'policy' || id === 'posterior-unavailable'
        ? [unsupported, supported]
        : [supported, unsupported],
    rationale,
    hints: [
      'Name the decision time, the objective and the available information.',
      'Compare branch action values, then charge the research fee on every path.',
      rationale,
      `Supported answer: ${correct}`,
    ],
  }
}
function author(s: AuthoredScenario): CaseRecord {
  const i = s.inputs
  const policy = `Positive: ${s.policy[0]}; negative: ${s.policy[1]}.`
  const buying =
    i.fee < s.maxFee ? 'Buy' : i.fee > s.maxFee ? 'Do not buy' : 'Indifferent'
  const reversal =
    s.reversal ??
    (i.fee < s.maxFee
      ? {
          prompt: `With all other terms fixed, raise the research fee to ${s.maxFee + 1}. Does the purchase decision reverse?`,
          answer:
            'Do not buy: the new fee exceeds the maximum incremental value.',
          rationale: `EVSI remains ${s.maxFee}; the new fee is one unit above it. Compare with the no-signal alternative, not zero.`,
        }
      : {
          prompt: `With all other terms fixed, cut the research fee to ${s.maxFee / 2}. Does the purchase decision reverse?`,
          answer: 'Buy: the new fee is below the maximum incremental value.',
          rationale: `EVSI remains ${s.maxFee}; the cut fee is ${s.maxFee / 2}. Net policy improvement is positive.`,
        })
  const posterior: Question =
    s.posterior === null
      ? choice(
          'posterior-unavailable',
          'setup',
          'What is P(success | positive) on this zero-probability positive branch?',
          'Unavailable: conditioning on a zero-probability branch is undefined.',
          'Zero: all unavailable posteriors should be entered as zero.',
          'The positive joint probability and positive branch probability are both zero; do not divide or substitute a fabricated probability.',
          true,
        )
      : numeric(
          'posterior',
          'setup',
          'Compute P(success | positive), not P(positive | success).',
          s.posterior,
          'probability fraction',
          `Bayes: p×s / [p×s+(1−p)×(1−t)] = ${s.posterior}. Sensitivity is ${i.sensitivity}, not the posterior.`,
        )
  const focus =
    s.unit === 'f03'
      ? numeric(
          'perfect-value',
          'calculation',
          'Compute EVPI: incremental value of free perfect information above the best no-signal action.',
          s.perfectIncrement,
          'currency units',
          `EVPI=p×G−V0=${i.prior}×${i.gain}−${s.baseline}=${s.perfectIncrement}. EVSI cannot exceed this bound.`,
        )
      : s.unit === 'f05'
        ? numeric(
            'threshold',
            'calculation',
            'Compute the posterior success threshold for taking the opportunity.',
            i.loss / (i.gain + i.loss),
            'probability fraction',
            `qG−(1−q)C>0 when q>C/(G+C)=${i.loss}/${i.gain + i.loss}; equality makes both actions indifferent.`,
          )
        : numeric(
            'failure-ledger',
            'calculation',
            'If research was purchased, a positive signal occurred and the project failed, what is total net profit under the optimal signal policy?',
            s.positiveFailureNet,
            'currency units',
            `The ${s.policy[0]} policy on positive contributes ${s.policy[0] === 'take' ? -i.loss : 0} before research. The fee ${i.fee} remains paid, giving ${s.positiveFailureNet}. This is a state payoff, not its expected contribution.`,
          )
  return {
    id: `${s.unit}-information-${s.mode}-${s.variant}`,
    unitId: s.unit,
    contentVersion: 1,
    rubricVersion: 1,
    title: s.title,
    role: s.role,
    mode: s.mode,
    objective:
      s.unit === 'f05'
        ? 'Update a physical prior with likelihoods and use the payoff threshold to decide whether information changes an action.'
        : 'Choose whether to purchase private information by comparing optimal contingent expected profit against the best no-research alternative.',
    information: [
      s.context,
      `Before research: P(success)=${i.prior}; G=${i.gain}; C=${i.loss}; sensitivity P(+|success)=${i.sensitivity}; specificity P(−|failure)=${i.specificity}; fee=${i.fee}. All money is in hypothetical currency units.`,
      'The report is private and arrives before commitment. No realized project outcome or counterparty repricing is known.',
    ],
    states: [
      'Positive signal / success',
      'Positive signal / failure',
      'Negative signal / success',
      'Negative signal / failure',
    ],
    actions: [
      'Do not research; take or decline using the prior.',
      'Pay for research, then take or decline separately for each signal.',
    ],
    responses:
      'The vendor charges the fee on purchase before returning a private report. Success/failure is realized after the action and cannot be used to choose that action.',
    cashFlows: `Take: +${i.gain} on success or −${i.loss} on failure, net of all non-research costs. Decline: 0 before research. If research is purchased, subtract ${i.fee} in every state, including declined states.`,
    constraints:
      'One decision and one settlement date. No borrowing, leverage, wealth constraint, repeated searches or unstated observations. Use full-precision calculations and supplied probabilities.',
    assumptions,
    connection: 'separate-finance',
    questions: [
      numeric(
        'branch-probability',
        'setup',
        'Compute the unconditional probability of a positive report.',
        s.positive,
        'probability fraction',
        `P(+)=p×s+(1−p)×(1−t)=${s.positive}; include false positives among failures.`,
      ),
      posterior,
      numeric(
        'max-fee',
        'calculation',
        'What is the maximum research fee (EVSI) at which buying is at least as good as the best no-research action?',
        s.maxFee,
        'currency units',
        `V0=${s.baseline}. Add the positive parts of both branch-weighted action profits to obtain Vsig=${s.signalValue}. EVSI=Vsig−V0=${s.maxFee}. At this fee the learner is indifferent.`,
      ),
      numeric(
        'net-buy',
        'calculation',
        'Compute expected net profit if the report is purchased and its optimal policy is followed, even if buying is not recommended.',
        s.net,
        'currency units',
        `Research value before fee ${s.signalValue} minus fee ${i.fee} equals ${s.net}. Do not silently replace the value of buying by the no-signal alternative.`,
      ),
      focus,
      choice(
        'policy',
        'interpretation',
        'Which signal-contingent action policy and purchase recommendation follow from the given terms?',
        `${policy} ${buying} research at the quoted fee.`,
        'Always take after positive, decline after negative, and buy whenever sensitivity exceeds .50.',
        `Branch posteriors are ${s.posterior ?? 'unavailable'} and ${s.negativePosterior ?? 'unavailable'}. Compare each reachable posterior with ${i.loss / (i.gain + i.loss)}. ${policy} EVSI=${s.maxFee} versus fee=${i.fee}.`,
        true,
      ),
      choice(
        'pricing-limit',
        'limitation',
        'If this report becomes public and a supplier changes the offered price, what does this fixed-payoff model establish?',
        'Nothing quantitative about the new price; these are physical expectations under fixed terms, and repricing requires additional assumptions.',
        'The computed posterior is a risk-neutral pricing weight, so EVSI proves an equal market-price increase.',
        'Observation does not increase the unconditional expectation of a fixed claim. Flexibility changes the chosen policy; endogenous public-signal pricing is not modeled.',
        true,
      ),
      choice(
        'reversal',
        'interpretation',
        reversal.prompt,
        reversal.answer,
        'No parameter change can reverse a decision once the initial report accuracy is known.',
        reversal.rationale,
      ),
    ],
    workedSolution: [
      `P(+)=${s.positive}. Positive posterior=${s.posterior ?? 'unavailable (zero-probability branch)'}; negative posterior=${s.negativePosterior ?? 'unavailable (zero-probability branch)'}.`,
      `Taking threshold C/(G+C)=${i.loss / (i.gain + i.loss)}. ${policy}`,
      `Without research: V0=${s.baseline}. Vsig=${s.signalValue} before fee. EVSI=${s.maxFee}, EVPI=${s.perfectIncrement}.`,
      `If purchased: ${s.signalValue}−${i.fee}=${s.net}; compare against ${s.baseline}, not against zero. Recommendation: ${buying.toLowerCase()}.`,
      'A declined action still incurs a purchased report fee. These are expectations and state payoffs, not observed profits or a traded price.',
    ],
    reflectionPrompt:
      'Defend the purchase decision and explain which branch could change your action. Name the information set at commitment, one missing assumption, and why a public report might change the terms. Reflection is retained but ungraded.',
    decisionReversal: reversal.prompt,
    sources: sourceReferences,
  }
}
export const informationFragments: readonly CaseFragment[] = (
  ['f03', 'f05', 'f10'] as const
).map((unitId: UnitId) => ({
  slotId: `${unitId}-information`,
  unitId,
  cases: authoredScenarios.filter((s) => s.unit === unitId).map(author),
  sources: sourceReferences,
}))
