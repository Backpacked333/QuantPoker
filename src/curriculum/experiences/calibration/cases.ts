import type { CaseFragment, CaseRecord, LessonCopy } from '../../core/types'
import {
  authorCase,
  retrieval,
  type ChoiceSpec,
  type Scenario,
} from '../../content/foundationCases/builders'
import { caseSources } from './sources'

const choice = (
  prompt: string,
  correct: string,
  wrong: string,
  rationale: string,
): ChoiceSpec => ({ prompt, correct, wrong, rationale })
const probabilitySetup = choice(
  'Which probabilities may evaluate an action’s modeled payoff?',
  'Use the stipulated physical group probabilities and population weights.',
  'Use the forecast under evaluation as if it were truth.',
  'Forecasts select actions; the stated population model evaluates their consequences. No market-pricing probability is supplied.',
)
const forecastLimit = choice(
  'What would a finite reliability plot establish?',
  'It describes the plotted sample or stipulated population, not universal real-world calibration.',
  'A tidy plot proves that this forecast remains calibrated in every future population.',
  'A population assumption is not measured validation; small samples fluctuate and future conditions may shift.',
)
const fixedAssumptions = [
  'Original hypothetical one-period exercise; group membership is observed before the action.',
  'Group probabilities and mix are stipulated physical probabilities, not empirically estimated rates or market-pricing probabilities.',
  'No fees, discounting, funding constraint, prediction acquisition cost, or risk aversion; decline pays zero.',
]

const bayes: Scenario = {
  title: 'Worked: a bet is evidence, not a revealed hand',
  role: 'Analyst in an explicitly simplified teaching model',
  objective:
    'Condition on an observed bet using a prior and both likelihoods before comparing the posterior to a decision threshold.',
  information: [
    'Prior strong-hand probability .25.',
    'Bet probability given strong .80; given weak .20.',
    'A bet is observed. No actual private cards or deck data are used.',
    'For this toy cash-flow exercise only, strong always wins and weak always loses.',
  ],
  states: ['Strong hand in the toy model', 'Weak hand in the toy model'],
  actions: ['Continue', 'Decline'],
  cashFlows:
    'Decision now; one terminal settlement: continue gives +100 if strong and −25 if weak; decline gives 0. No fees.',
  setup: choice(
    'What is the evidence denominator?',
    '.25×.80 + .75×.20 = .35',
    '.80, because a strong hand bets with that probability',
    'The observed bet can arise under either state; its probability is the sum of both joint masses.',
  ),
  calculation: {
    prompt: 'Compute P(strong | bet). Enter a fraction in [0,1].',
    expected: 4 / 7,
    tolerance: 1e-6,
    units: 'probability fraction',
    rationale:
      'Strong-and-bet mass is .25×.80=.20; divide by .20+.15=.35 to obtain 4/7.',
  },
  interpretation: choice(
    'Under the stated strong-always-wins simplification, what action has positive expected net value?',
    'Continue: 4/7 exceeds .20.',
    'Decline: the posterior must exceed .80 to justify any action.',
    'Break-even is 25/(100+25)=.20. Conditional EV=(4/7)100−(3/7)25=325/7.',
  ),
  limitation: choice(
    'Can the same 4/7 be treated as win probability in an actual poker hand?',
    'Not without a justified mapping from hand type to win outcomes.',
    'Yes; a posterior over strong hand type automatically gives exact showdown win probability.',
    'Real win outcomes also depend on runouts and opponent ranges; the deterministic hand-type-to-win mapping is a stated toy assumption.',
  ),
  reversal: choice(
    'If the prior becomes .01 while both betting likelihoods stay fixed, what changes?',
    'Posterior becomes 4/103 ≈ .0388, so decline at the .20 threshold.',
    'Continue remains correct because the likelihood .80 did not change.',
    'Joint masses .008 and .198 yield .008/.206=4/103; prior odds matter.',
  ),
  solution: [
    'Name states strong/weak and evidence bet.',
    'Joint masses: .25×.80=.20 and .75×.20=.15.',
    'P(bet)=.35; posterior=.20/.35=4/7. The likelihood .80 is not this posterior.',
    'In the declared toy mapping only, compare 4/7 to .20 and continue; expected profit 325/7, not a realized win.',
    'With a .01 prior the posterior is 4/103 and the action reverses.',
  ],
  assumptions: [
    'The prior and both likelihoods are stipulated, stationary and exhaustive.',
    'Strong deterministically wins only in this explicit toy payoff model; this is not an inference about any live hand.',
  ],
  connection: 'direct',
}
const credibility: Scenario = {
  title: 'Partial: five observations do not erase a prior',
  role: 'Probability analyst',
  objective:
    'Complete the Beta posterior and distinguish raw sample rate from modeled prediction.',
  information: [
    'Prior Beta(2,8). Observe four successes and one failure.',
    'Conditional on a fixed unknown success parameter, trials have a Bernoulli likelihood.',
    'For the next one-period action, success pays +100 and failure −25; decline pays 0.',
  ],
  states: ['Next observation succeeds', 'Next observation fails'],
  actions: ['Continue', 'Decline'],
  cashFlows:
    'Action is chosen after the five observations; next terminal success +100 or failure −25. Past trials are sunk and not included in the next-action ledger.',
  setup: choice(
    'Which posterior update is consistent with the declared likelihood?',
    'Beta(2+4,8+1) = Beta(6,9)',
    'Beta(4,1), discarding the prior',
    'Successes add to alpha; failures add to beta. Prior assumptions are retained, not secretly removed.',
  ),
  calculation: {
    prompt:
      'The posterior is Beta(6,9). Complete its predictive mean for a next Bernoulli outcome.',
    expected: 0.4,
    tolerance: 1e-6,
    units: 'probability fraction',
    rationale:
      'For Beta(a,b), the next-trial mean is a/(a+b): 6/15=.40. The observed frequency is 4/5=.80.',
  },
  interpretation: choice(
    'Which statement keeps sample and model distinct?',
    'Raw rate .80; posterior mean .40; the posterior-mean policy continues at threshold .20.',
    'The true population probability is proven to be .80.',
    'A five-trial statistic is noisy; .40 is a model-based posterior prediction, conditional on this prior and likelihood.',
  ),
  limitation: choice(
    'What must be investigated before carrying this update to new data?',
    'Whether the prior and fixed-parameter independent-trial likelihood remain appropriate.',
    'Whether the last trial was profitable; a win alone validates the prior.',
    'Changing populations, selected observations and dependence can invalidate the likelihood. Mean shrinkage does not prove calibration.',
  ),
  reversal: choice(
    'If next-action failure cost rises to 200 and success gain stays 100, what reverses?',
    'Decline under .40; threshold becomes 2/3, while the posterior stays Beta(6,9).',
    'The posterior must change to .80 because the cost changed.',
    'Costs change the action threshold, not evidence or probability. EV=.4×100−.6×200=−80.',
  ),
  solution: [
    'Complete the two missing count additions: alpha=2+4=6, beta=8+1=9.',
    'Posterior mean=6/(6+9)=.40; raw observed rate=4/5=.80.',
    'At +100/−25, threshold .20 selects continue with posterior predictive EV25, not guaranteed profit.',
    'At loss200, threshold2/3 selects decline without changing either forecast or Brier quality.',
  ],
  assumptions: [
    'Original hypothetical counts, positive prior parameters, fixed latent Bernoulli parameter and conditionally independent trials.',
    'The next outcome follows the same declared likelihood; no unseen outcomes enter the update.',
  ],
  connection: 'direct',
}
function population(
  s: Omit<
    Scenario,
    'setup' | 'limitation' | 'assumptions' | 'connection' | 'states'
  > & { states?: readonly string[] },
): Scenario {
  return {
    ...s,
    states: s.states ?? ['Success at settlement', 'Failure at settlement'],
    setup: probabilitySetup,
    limitation: forecastLimit,
    assumptions: fixedAssumptions,
    connection: 'separate-finance',
  }
}
const practice = population({
  title:
    'Practice: a calibrated constant can still make poor subgroup decisions',
  role: 'Forecast evaluator',
  objective:
    'Separate pooled calibration, resolution and threshold-dependent policy value.',
  information: [
    'Two public groups, equal weights; true probabilities .10 and .60.',
    'Baseline reports .35 for both; informed reports .10 and .60.',
    'Continue pays +100 on success and −25 on failure.',
  ],
  actions: [
    'Use baseline forecast policy',
    'Use informed forecast policy',
    'Decline',
  ],
  cashFlows:
    'Choose a policy before one outcome; success +100, failure −25 for a continued group; declined groups settle 0.',
  calculation: {
    prompt:
      'Compute the informed policy’s expected value minus the baseline policy’s value per population opportunity.',
    expected: 6.25,
    tolerance: 1e-6,
    units: 'currency units',
    rationale:
      'Baseline continues both: .5(−12.5)+.5(50)=18.75. Informed declines group1 and continues group2:25. Difference6.25.',
  },
  interpretation: choice(
    'Why can the constant .35 be calibrated yet economically less useful?',
    'All .35 forecasts pool to true frequency .35, but conceal the .10 group below threshold .20.',
    'Calibration forces both groups to have identical true success probabilities.',
    'Calibration conditions on the reported forecast, not an unreported group; informed forecasts separate risks. Brier .2275 vs .165 is not a money score.',
  ),
  reversal: choice(
    'If loss falls from25 to5 with gain100, does the informed forecast gain policy value?',
    'No; threshold1/21 is below both groups, so both policies continue and the gain is0.',
    'Yes; the .0625 Brier improvement must become a .0625 monetary gain.',
    'The improved forecast still scores better, but it no longer changes actions. Forecast quality is not decision value.',
  ),
  solution: [
    'Threshold=.20; true group EVs−12.5 and50.',
    'Constant forecast .35 is calibrated in the pooled stipulated population, not within each hidden subdivision.',
    'Expected baseline Brier=.2275; informed=.165. These are loss units, not money.',
    'Baseline value18.75; informed25; information gain6.25 before any acquisition cost.',
    'At loss5 both groups continue; forecast-quality improvement persists but economic gain vanishes.',
  ],
})
const transfers: Scenario[] = [
  population({
    title: 'Transfer: distressed receivables recovery budget',
    role: 'Recovery-budget manager',
    objective:
      'Allocate optional recovery effort rather than mistake forecast improvement for repayment evidence.',
    information: [
      '70% of dossiers are type A, 30% type B; recovery-success probabilities .05 and .45.',
      'Baseline forecast .17 for all; informed forecast uses the dossier type.',
      'Successful effort nets150; failed effort loses100. No-action return0.',
    ],
    actions: ['Fund recovery effort', 'Do not fund'],
    cashFlows:
      'Choose recovery effort now. At terminal recovery settlement +150 or−100; no effort pays0. Existing receivable value is sunk and excluded.',
    calculation: {
      prompt:
        'What is the informed recovery policy’s expected incremental value per dossier over the baseline policy?',
      expected: 3.75,
      tolerance: 1e-6,
      units: 'currency units',
      rationale:
        'Threshold=.40. Baseline .17 declines all. Type B EV=.45×150−.55×100=12.5; type A declines. Weight .30 gives3.75.',
    },
    interpretation: choice(
      'Which recovery policy is selected?',
      'Only fund type B under informed forecasts; baseline funds neither.',
      'Fund every dossier because informed Brier is lower.',
      'A quality score is not a funding mandate; only the .45 subgroup clears the .40 cash-flow threshold.',
    ),
    reversal: choice(
      'If failed effort loses20 instead of100, which earlier policy changes?',
      'Baseline now funds all; informed still declines A and funds B.',
      'Informed funds A merely because it has a public label.',
      'Threshold20/170≈.1176; .17 clears it, .05 does not. Base value8.9, informed16.95, gain8.05.',
    ),
    solution: [
      'Write the one-period recovery ledger, excluding sunk receivable book value.',
      'Baseline average=.7(.05)+.3(.45)=.17; threshold100/250=.40.',
      'Type A EV−87.5; type B EV12.5. Baseline declines both, informed continues only B.',
      'Value gain=.3×12.5=3.75; baseline Brier.1411 versus informed.1075.',
    ],
  }),
  population({
    title: 'Transfer: two engineering warranty pools',
    role: 'Underwriting analyst',
    objective:
      'Distinguish loss-free probability forecasts from the economics of accepting a warranty.',
    information: [
      '40% standard jobs, 60% specialist jobs; loss-free probabilities .80 and .95.',
      'Baseline forecasts .89 loss-free for both.',
      'Acceptance earns net40 on a loss-free warranty, or net−200 when a covered loss occurs. Decline pays0.',
    ],
    states: ['Warranty is loss-free', 'Covered loss occurs'],
    actions: ['Accept warranty', 'Decline warranty'],
    cashFlows:
      'Accept now; one terminal warranty settlement +40 if loss-free or−200 if a covered loss occurs. Net amounts already include premium and claim expenses; no repeated premium subtraction.',
    calculation: {
      prompt:
        'Compute the informed policy’s expected value advantage per offered warranty.',
      expected: 3.2,
      tolerance: 1e-6,
      units: 'currency units',
      rationale:
        'Threshold200/240=5/6. Standard EV−8; specialist28. Baseline accepts both, value13.6; informed specialists only,16.8; gain3.2.',
    },
    interpretation: choice(
      'Does a .80 loss-free forecast justify accepting the standard warranty?',
      'No; .80 is below5/6 even though loss-free is likely.',
      'Yes; any probability above one-half makes every contract profitable.',
      'Asymmetric settlement amounts determine the threshold, not a generic50% cutoff. Forecast labels alone do not promise payment.',
    ),
    reversal: choice(
      'If a covered loss instead costs100, what happens to decision value from the type label?',
      'Both policies accept both types; economic gain0, although Brier quality is unchanged.',
      'The forecasts become less accurate because the payout changed.',
      'New threshold100/140=5/7; both .80 and .95 exceed it. Both values24.6, information gain0.',
    ),
    solution: [
      'Map success to loss-free, not a covered loss; use net settlement amounts.',
      'Threshold5/6; standard EV−8, specialist28.',
      'Baseline value=.4(−8)+.6(28)=13.6; informed=.6(28)=16.8; difference3.2.',
      'Brier.0979 vs .0925 measures forecast loss, not underwriting profit or capital adequacy.',
    ],
  }),
  population({
    title: 'Transfer: forecast refinement that cannot change a project gate',
    role: 'Capital-project analyst',
    objective:
      'Recognize a strictly better forecast with no added action value at this cost threshold.',
    information: [
      '25% pilot sites and 75% mature sites; success probabilities .15 and .35.',
      'Baseline forecast .30 for all; informed uses the site class.',
      'Optional project pays net80 on success and−10 on failure; skipping pays0.',
    ],
    actions: ['Approve project', 'Skip project'],
    cashFlows:
      'Approve now; one terminal net payoff +80 or−10, no intermediate cash flows or discounting. Skipping yields0.',
    calculation: {
      prompt:
        'How much extra expected policy value does the informed forecast provide per project opportunity?',
      expected: 0,
      tolerance: 1e-6,
      units: 'currency units',
      rationale:
        'Threshold10/90=1/9 lies below both .15 and .35. Both policies approve both, giving .30×80−.70×10=17. Gain0.',
    },
    interpretation: choice(
      'Which conclusion is justified?',
      'Brier improves from.21 to.2025, but the type label adds no action value under these terms.',
      'A strictly lower Brier loss necessarily creates positive project profit improvement.',
      'Forecast discrimination improves without crossing a decision threshold; a positive-priced refinement has negative net acquisition value here.',
    ),
    reversal: choice(
      'If failure cost rises to30 with gain80 unchanged, what changes?',
      'Only mature sites pass under informed forecasts; baseline still approves both, adding3.375 of label value.',
      'Both informed sites still pass because the probabilities did not change.',
      'Threshold30/110=3/11; pilot EV−13.5, mature8.5; baseline3, informed6.375, gain3.375.',
    ),
    solution: [
      'Pooled p=.25(.15)+.75(.35)=.30; threshold1/9.',
      'Pilot EV3.5 and mature21.5: both positive, so both policies approve all.',
      'Both expected policy values17; Brier.21 versus.2025; lower score alone does not pay for data.',
      'At cost30, threshold3/11 crosses the pilot group; compare actions again rather than assuming calibration changes.',
    ],
  }),
]
const reviews: Scenario[] = [
  population({
    title: 'Review: relaunch tranche versus legacy tranche',
    role: 'Credit-renewal analyst',
    objective:
      'Recompute a changed policy without memorizing the default continue-all baseline.',
    information: [
      '30% relaunch tranches and70% legacy tranches; physical success probabilities .55 and .10.',
      'Baseline forecast .235; label-aware forecast .55 or .10.',
      'Renewal settles net+90 on success or−30 on failure; decline0.',
    ],
    actions: ['Renew tranche', 'Decline tranche'],
    cashFlows:
      'Renew at decision time; terminal net90 or−30. Decline settles0; no collateral or funding effects beyond this ledger.',
    calculation: {
      prompt: 'Find the informed policy value per renewal opportunity.',
      expected: 10.8,
      tolerance: 1e-6,
      units: 'currency units',
      rationale:
        'Threshold.25. Relaunch EV36; legacy−18. Only relaunch renews; .30×36=10.8. Baseline .235 declines all, value0.',
    },
    interpretation: choice(
      'Which policy does the constant forecast select here?',
      'Decline every tranche; the informed policy renews only relaunch.',
      'Continue every tranche as in the default laboratory.',
      'The changed mix makes .235 below threshold .25; carrying over the old baseline action is invalid.',
    ),
    reversal: choice(
      'If renewal loss drops to5, what changes?',
      'Both policies renew both groups, so the label’s decision value drops to0.',
      'The Brier score must worsen because more tranches are renewed.',
      'Threshold5/95≈.0526 is below both probabilities. Physical probabilities and forecast-quality scores are unchanged.',
    ),
    solution: [
      'Weighted probability=.3(.55)+.7(.10)=.235.',
      'Threshold=.25; baseline declines, informed renews relaunch only.',
      'Relaunch36; legacy−18; informed10.8 versus baseline0.',
      'Cost5 moves threshold below both groups and removes incremental label value.',
    ],
  }),
  population({
    title: 'Review: the warranty threshold lands on a group',
    role: 'Warranty pricing analyst',
    objective:
      'Report a boundary as indifference rather than a uniquely preferred action.',
    information: [
      'Equal pool weights; loss-free probabilities .75 and .90.',
      'Acceptance pays+60 loss-free,−180 on covered loss; decline0.',
      'Baseline loss-free forecast .825.',
    ],
    states: ['Loss-free settlement', 'Covered-loss settlement'],
    actions: ['Accept', 'Decline', 'Indifferent at zero EV'],
    cashFlows:
      'Net terminal60 or−180 for accepted warranties; declined0. No additional premium, fees or cash-flow periods.',
    calculation: {
      prompt: 'Compute the break-even probability.',
      expected: 0.75,
      tolerance: 1e-6,
      units: 'probability fraction',
      rationale:
        '180/(60+180)=.75. At exactly .75, EV is0; either action yields equal modeled expected value.',
    },
    interpretation: choice(
      'What is the informed action in the first pool?',
      'Indifferent; accepting and declining both have zero modeled expected value.',
      'Uniquely accept, because .75 is larger than one-half.',
      'Cost asymmetry places the threshold precisely at .75; the model does not invent a strict preference at a tie.',
    ),
    reversal: choice(
      'If covered-loss cost rises to200, how does the first pool change?',
      'It declines: threshold10/13≈.7692 now exceeds .75.',
      'It remains an exact tie because forecast accuracy is fixed.',
      'The first-pool EV becomes45−50=−5. Costs affect the action, not the probability.',
    ),
    solution: [
      'Threshold=.75; pool1 true EV0, pool2 EV36.',
      'Baseline accepts both; informed is indifferent in pool1 and accepts pool2.',
      'Both expected values18, despite a Brier improvement .005625. Indifference is not a zero-probability event.',
      'At loss200, pool1 declines and the informed label adds2.5 of expected policy value.',
    ],
  }),
  population({
    title: 'Review: better forecasts when every procurement bid is uneconomic',
    role: 'Procurement bid analyst',
    objective:
      'Distinguish a forecast-loss improvement from an opportunity that should still be declined.',
    information: [
      '80% complex bids and20% repeat bids; success probabilities .10 and .30.',
      'Baseline forecast .14; informed .10 or .30.',
      'Attempted bid settles net+80 on success,−40 on failure; abstain0.',
    ],
    actions: ['Attempt bid', 'Abstain'],
    cashFlows:
      'One bid decision now; terminal net80 or−40; abstention0. Unstated strategic benefits are excluded.',
    calculation: {
      prompt:
        'Compute the informed expected Brier loss using population weights.',
      expected: 0.114,
      tolerance: 1e-6,
      units: 'Brier loss units',
      rationale:
        '.80×(.10×.90)+.20×(.30×.70)=.072+.042=.114; baseline .14×.86=.1204.',
    },
    interpretation: choice(
      'How much expected decision value is added by the label?',
      'Zero: baseline and informed both abstain, since every probability is below1/3.',
      'The .0064 score reduction is automatically a .0064 cash gain.',
      'Threshold40/120=1/3; no forecast crosses it. Expected policy values both0; better forecasting need not justify acquiring the label.',
    ),
    reversal: choice(
      'If failure cost drops to20, which label-aware action changes?',
      'Repeat bids become profitable and are attempted; complex bids still abstain.',
      'All bids become profitable because Brier is lower.',
      'Threshold20/100=.20; repeat EV10, complex−10. Informed value2, baseline0.',
    ),
    solution: [
      'Weight scores by opportunities, not unweighted subgroup averages.',
      'Informed Brier=.114; baseline=.1204; improvement=.0064.',
      'Threshold1/3 exceeds .30 and .10; both policies abstain and have value0.',
      'At loss20 only repeat bids are attempted, adding population value.2×10=2.',
    ],
  }),
]

function authored(
  mode: CaseRecord['mode'],
  index: number,
  scenario: Scenario,
): CaseRecord {
  const c = authorCase('f05', mode, String(index), scenario, caseSources)
  return {
    ...c,
    id: `f05-calibration-${mode}-${index}`,
    questions: c.questions.map((q, i) =>
      q.kind === 'choice'
        ? {
            ...q,
            options: (index + i) % 2 ? [...q.options].reverse() : q.options,
          }
        : { ...q, critical: true },
    ),
    reflectionPrompt:
      'Defend the action without using the realized outcome as proof. Which prior, likelihood, population assumption or contract term would you check next? Written reflection is saved and ungraded.',
  }
}
export const calibrationCases: readonly CaseRecord[] = [
  authored('worked', 1, bayes),
  authored('partial', 1, credibility),
  authored('practice', 1, practice),
  ...transfers.map((s, i) => authored('transfer', i + 1, s)),
  ...reviews.map((s, i) => authored('review', i + 1, s)),
]
export const calibrationLesson: LessonCopy = {
  brief: [
    'A forecast is a probability statement, not a decision. First identify the population, available information and outcome.',
    'Prior odds combine with evidence likelihoods through Bayes. A short streak alone does not establish a population parameter.',
    'Calibration asks whether outcomes match forecasts at reported levels. Resolution separates groups; action value depends on payoff thresholds.',
  ],
  retrieval: retrieval(
    'Before observing a bet, what does P(bet | strong) describe?',
    'A likelihood conditional on a hand type.',
    'The posterior P(strong | bet).',
    'Conditioning direction matters; a prior and both likelihoods are needed to invert the conditional.',
  ),
  predictionQuestion:
    'With a .25 strong-hand prior and betting likelihoods .80/.20, predict whether a bet raises the probability of a strong hand; commit a confidence and rationale before revealing the calculation.',
  worked: bayes.solution,
  practice: [
    'Complete Beta(2,8)+4 successes/1 failure: identify both posterior parameters and its predictive mean.',
    'Then compare a calibrated constant .35 forecast with .10/.60 public-group forecasts. Compute expected scores and expected policy values separately.',
  ],
  experiment: {
    experienceId: 'calibration',
    question:
      'When does better subgroup forecasting improve decisions, and when does it not?',
    instructions: [
      'Commit a predicted policy, expected direction of information value, optional value-gain estimate in currency units, confidence and rationale.',
      'Run the exact stipulated population model; inspect expected Brier and subgroup cash flows, not realized winnings.',
      'Change only the failure cost to5; commit a new linked prediction and rerun. Forecast-quality improvement remains, decision-value gain vanishes.',
      'Try equal group probabilities, weights0/1 and an exact break-even tie. Reflect on what would invalidate this population assumption.',
    ],
  },
  transfer: [
    'Apply the calculation to recovery budgets, warranty underwriting and project approval. These are separate finance models with original terms.',
    'Select actions from forecasts; evaluate their cash flows using physical group probabilities. No profit or prose score grants learning credit.',
  ],
  review: [
    'Return to three changed-number variants after the shared review schedule is due; early practice does not count as a delayed review.',
    'Recompute the threshold and score from scratch. One variant reverses the baseline policy, another is a tie, and another declines every opportunity.',
  ],
  limitation:
    'Exact plotted frequencies are stipulated model quantities, not observed sample calibration. A finite observed plot would not establish universal calibration. Prior/likelihood misspecification, selected evidence, data costs, risk preferences and changing populations can alter conclusions.',
  decisionReversal:
    'At +100/−25 the .10 group declines under informed forecasts; at loss5 it continues. Brier quality is unchanged, while economic information gain disappears.',
}
export const calibrationFragment: CaseFragment = {
  slotId: 'f05-calibration',
  unitId: 'f05',
  cases: calibrationCases,
  lesson: calibrationLesson,
  sources: caseSources,
}
