import { useId, useState } from 'react'
import type { ExperienceViewProps } from '../../core/types'
import { GENERATOR_VERSION } from '../../core/seededRandom'
import { NumericControl } from '../../components/NumericControl'
import { PredictionForm } from '../../components/PredictionForm'
import { DataTable } from '../../components/DataTable'
import { SeriesChart } from '../../components/SeriesChart'
import { calibrationManifest } from './manifest'
import type { CalibrationInputs, CalibrationOutput } from './model'
import './styles.css'

type Props = ExperienceViewProps<CalibrationInputs, CalibrationOutput>
const hints = [
  'Separate the outcome probability, the forecast selecting an action, and the cash-flow ledger. Decline pays zero.',
  'Pool with p̄ = w p₁ + (1−w) p₂. An informed forecast instead reports each public group probability.',
  'Threshold = loss / (gain+loss). Expected Brier = p(1−q)²+(1−p)q². Evaluate selected actions with true p, not the forecast q.',
  'For each group, the continued action’s true expected net payoff is p×gain−(1−p)×loss; multiply by group weight only when selected. Compare the two weighted totals, not the Brier difference.',
] as const
const controls = [
  {
    name: 'group1Weight',
    label: 'Group 1 population weight',
    units: 'fraction of population',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'group1Probability',
    label: 'Group 1 true success probability',
    units: 'probability fraction',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'group2Probability',
    label: 'Group 2 true success probability',
    units: 'probability fraction',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'gain',
    label: 'Net gain on success',
    units: 'currency units',
    min: 1,
    max: 500,
    step: 1,
  },
  {
    name: 'loss',
    label: 'Net loss on failure',
    units: 'currency units',
    min: 0,
    max: 200,
    step: 1,
  },
] as const
const display = (n: number) =>
  Number(n.toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 })
function Results({ r }: { r: CalibrationOutput }) {
  return (
    <section
      className="qp-calibration-results"
      aria-label="Exact expected population results"
    >
      <h2>Expected model results, not realized outcomes</h2>
      <p>
        No sample was drawn. All values use the stipulated population. Displayed
        summaries are rounded; the equivalent tables and saved results retain
        numeric precision.
      </p>
      <p>
        Break-even probability:{' '}
        <strong>{display(r.breakEvenProbability)}</strong>. Continue only above
        it; below it decline; exactly on it report <strong>indifferent</strong>.
        Either action at a tie has equal expected value.
      </p>
      <DataTable
        caption="Forecast quality versus policy value"
        summary="Brier is forecast loss (lower is better); policy value is expected net money (higher is better). These have different units."
        columns={['Quantity and units', 'Baseline', 'Informed', 'Improvement']}
        rows={[
          [
            'Expected Brier loss (loss units; improvement = baseline − informed)',
            r.baselineBrier,
            r.informedBrier,
            r.resolutionGain,
          ],
          [
            'Expected policy value (currency units; improvement = informed − baseline)',
            r.baselinePolicyValue,
            r.informedPolicyValue,
            r.informationGain,
          ],
        ]}
      />
      <DataTable
        caption="Population probability and decision threshold"
        summary="Exact unrounded model probabilities. These are physical population assumptions and a cash-flow threshold, not market-pricing probabilities."
        columns={['Quantity', 'Probability fraction']}
        rows={[
          ['Pooled population success probability', r.populationProbability],
          ['Break-even success probability', r.breakEvenProbability],
        ]}
      />
      <DataTable
        caption="Public subgroup forecasts, decisions and true cash flows"
        summary="Group 2 weight is 1−group 1 weight. A zero-weight group has no population conditional frequency, shown unavailable; its specified probability remains a hypothetical input. Cash-flow columns evaluate forecast-selected actions using true probabilities."
        columns={[
          'Public group',
          'Population weight',
          'Stipulated true p',
          'Modeled frequency',
          'Frequency status',
          'Baseline q',
          'Informed q',
          'Baseline action',
          'Informed action',
          'True EV if continued (currency units)',
          'Baseline weighted policy contribution (currency units)',
          'Informed weighted policy contribution (currency units)',
          'Baseline expected Brier',
          'Informed expected Brier',
        ]}
        rows={r.groups.map((g, i) => [
          `Group ${i + 1}`,
          g.weight,
          g.trueProbability,
          g.modeledFrequency,
          g.frequencyStatus,
          g.baseline.forecast,
          g.informed.forecast,
          g.baseline.action,
          g.informed.action,
          g.trueActionEV,
          g.baseline.truePolicyContribution,
          g.informed.truePolicyContribution,
          g.baseline.expectedBrierLoss,
          g.informed.expectedBrierLoss,
        ])}
      />
      <div className="qp-calibration-charts">
        <SeriesChart
          title="Population reliability, not sample validation"
          summary="The pooled baseline reports one forecast whose expected frequency equals the weighted mean. Informed points are separate public forecast buckets; zero-weight buckets are unavailable. These stipulated points do not prove empirical calibration."
          xLabel="Reported forecast"
          xUnits="probability fraction"
          yLabel="Stipulated population frequency"
          yUnits="probability fraction"
          series={[
            {
              name: 'Calibration reference y=q',
              points: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
            },
            {
              name: 'Baseline pooled population',
              points: [
                { x: r.populationProbability, y: r.populationProbability },
              ],
            },
            ...r.groups.map((g, i) => ({
              name: `Informed Group ${i + 1}`,
              points: [{ x: g.informed.forecast, y: g.modeledFrequency }],
            })),
          ]}
        />
        <SeriesChart
          title="Subgroup expected policy contributions"
          summary="Groups 1 and 2 on the horizontal axis; weighted expected money per population opportunity on the vertical axis. Negative baseline contributions show loss-making selected actions, not realized sample losses."
          xLabel="Public group number"
          xUnits="group 1 or 2"
          yLabel="Weighted expected net payoff"
          yUnits="currency units per opportunity"
          series={[
            {
              name: 'Baseline policy',
              points: r.groups.map((g, i) => ({
                x: i + 1,
                y: g.baseline.truePolicyContribution,
              })),
            },
            {
              name: 'Informed policy',
              points: r.groups.map((g, i) => ({
                x: i + 1,
                y: g.informed.truePolicyContribution,
              })),
            },
          ]}
        />
      </div>
      <h3>Calibration is not the same as usefulness</h3>
      <p>
        The constant forecast is calibrated in this pooled model because all its
        forecasts refer to a population with frequency{' '}
        {display(r.populationProbability)}. It cannot distinguish groups. Brier
        rewards the informed model’s resolution, but economic value appears only
        when information changes a payoff-relevant action.
      </p>
      <p>
        Change only the failure cost, or make group probabilities equal. Does
        the label still change decisions? Information value here is gross value
        before any acquisition cost.
      </p>
    </section>
  )
}
function AttemptView({ controller, evidence }: Props) {
  const controlsId = useId()
  const [shownHints, setShownHints] = useState(
    () =>
      hints.filter((_, i) =>
        controller.attempt.assistance.hintIds.includes(
          `calibration-hint-${i + 1}`,
        ),
      ).length,
  )
  const [solutionShown, setSolutionShown] = useState(
    controller.attempt.assistance.solutionViewed,
  )
  const [callbackError, setCallbackError] = useState('')
  const { inputs, attempt, phase } = controller
  const r = controller.result?.ok ? controller.result.value : null
  const supported =
    attempt.modelVersion === calibrationManifest.version &&
    attempt.inputVersion === calibrationManifest.inputVersion &&
    attempt.generatorVersion === GENERATOR_VERSION
  const runAllowed = phase === 'prediction_committed' && supported
  const completed = ['results_ready', 'reflected'].includes(phase)
  function showHint() {
    try {
      evidence.exposeHint(attempt.id, `calibration-hint-${shownHints + 1}`)
      setShownHints((n) => n + 1)
      setCallbackError('')
    } catch {
      setCallbackError(
        'Assistance could not be recorded; the hint was not revealed.',
      )
    }
  }
  function showSolution() {
    try {
      evidence.exposeSolution(attempt.id)
      setSolutionShown(true)
      setCallbackError('')
    } catch {
      setCallbackError(
        'Assistance could not be recorded; the solution was not revealed.',
      )
    }
  }
  return (
    <section className="qp-calibration-lab" aria-label="Calibration laboratory">
      <header>
        <p className="qp-calibration-kicker">
          Two public groups · exact population model
        </p>
        <h1>Forecast quality and decision value</h1>
        <p>
          Can a calibrated forecast still choose a poor action? Commit your
          prediction, compare forecast loss with expected cash-flow value, then
          change one assumption.
        </p>
        <p>
          This is an isolated teaching population, not your live poker hand.
          Exploration saves a replayable attempt, not mastery; structured F05
          transfer and delayed-review cases supply assessment evidence.
        </p>
      </header>
      <form
        id={controlsId}
        aria-label="Calibration input controls"
        onSubmit={(e) => {
          e.preventDefault()
          if (e.currentTarget.querySelector('[aria-invalid="true"]')) {
            setCallbackError(
              'Correct invalid control text before running the committed model.',
            )
            return
          }
          if (runAllowed) {
            setCallbackError('')
            void controller.run()
          }
        }}
      >
        <fieldset disabled={phase === 'running'}>
          <legend>1. Set the public population and net terminal payoffs</legend>
          <div className="qp-calibration-controls">
            {controls.map((c) => (
              <NumericControl
                key={c.name}
                {...c}
                value={inputs[c.name]}
                onChange={(n) => {
                  if (n !== inputs[c.name])
                    controller.requestInputChange({ ...inputs, [c.name]: n })
                }}
              />
            ))}
          </div>
        </fieldset>
      </form>
      <p>
        Group 2 weight: {display(1 - inputs.group1Weight)}. Continue settles +
        {inputs.gain} on success or −{inputs.loss} on failure; decline settles
        0. Probabilities are physical assumptions, not market prices.
      </p>
      <p>
        Only valid control changes replace the model inputs. After commitment, a
        valid change starts a linked draft instead of editing the old prediction
        or results.
      </p>
      {phase === 'draft' ? (
        <PredictionForm
          question="Predict which public groups the informed policy will continue, and whether it adds economic value over the pooled baseline. Optional numeric estimate: value gain in currency units per population opportunity. Direction refers to informed policy value relative to baseline."
          actions={[
            'Continue both groups',
            'Decline both groups',
            'Continue group 1 only',
            'Continue group 2 only',
            'At least one group is indifferent',
          ]}
          onCommit={(p) => controller.commitPrediction(p)}
        />
      ) : null}
      {attempt.prediction ? (
        <section aria-label="Immutable committed prediction">
          <h2>2. Prediction locked</h2>
          <p>
            {attempt.prediction.actionId}; direction{' '}
            {attempt.prediction.direction ?? 'not-sure'}; confidence{' '}
            {attempt.prediction.confidencePercent === null
              ? 'not sure'
              : `${attempt.prediction.confidencePercent}%`}
            .
          </p>
          <p>
            Value-gain estimate:{' '}
            {attempt.prediction.numericEstimate === undefined
              ? 'not supplied'
              : `${attempt.prediction.numericEstimate} currency units`}
            .
          </p>
          <p>Ungraded rationale: {attempt.prediction.rationale}</p>
          <DataTable
            caption="Committed model inputs"
            summary="These immutable inputs, not invalid pending text, determine this run. Changing a valid control creates a new linked attempt."
            columns={['Input', 'Committed value']}
            rows={controls.map((c) => [c.label, inputs[c.name]])}
          />
        </section>
      ) : null}
      <div className="qp-calibration-actions">
        <button
          className="button"
          type="submit"
          form={controlsId}
          disabled={!runAllowed}
        >
          3. Run exact population model
        </button>
        {phase === 'running' ? (
          <button className="button" onClick={() => controller.cancel()}>
            Cancel run
          </button>
        ) : null}
        <button
          className="button button-quiet"
          onClick={() => controller.resetControls()}
        >
          Reset controls to defaults
        </button>
      </div>
      {phase === 'draft' ? (
        <p>Commit a prediction before revealing any computed results.</p>
      ) : null}
      <p role="status">
        {controller.status} Phase: {phase.replaceAll('_', ' ')}.
      </p>
      {!supported ? (
        <p>
          Historical model, input or generator version is unsupported. Rerunning
          is disabled; reset controls or change a valid input to create a linked
          current-version draft.
        </p>
      ) : null}
      {attempt.parentAttemptId ? (
        <p>
          Linked draft preserves the previous immutable attempt; historical
          evidence is not overwritten.
        </p>
      ) : null}
      {controller.result && !controller.result.ok ? (
        <div role="alert">
          {controller.result.errors.map((e) => (
            <p key={e.field}>{e.message}</p>
          ))}
        </div>
      ) : null}
      <aside aria-label="Progressive assistance">
        <h2>Hints (assistance recorded)</h2>
        <p>
          Hints and full solutions are tracked before display. They cannot
          establish unaided mastery.
        </p>
        <button
          className="button button-quiet"
          disabled={!attempt.prediction || shownHints === hints.length}
          onClick={showHint}
        >
          Show next hint ({shownHints}/4)
        </button>
        <ol>
          {hints.slice(0, shownHints).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
        {callbackError ? <p role="alert">{callbackError}</p> : null}
      </aside>
      {r ? <Results r={r} /> : null}
      {completed && r ? (
        <section aria-label="Reflection and explanation">
          <h2>4. Reflect on the result</h2>
          <label>
            Reflection (ungraded, up to 2,000 characters)
            <textarea
              maxLength={2000}
              value={attempt.reflection ?? ''}
              onChange={(e) => controller.reflect(e.target.value)}
              placeholder="Did lower Brier loss change the action? Which assumption would you challenge, and at what cost would a group’s action reverse?"
            />
          </label>
          <p>
            Explain why the pooled forecast may be calibrated but unhelpful.
            Name a decision reversal and what an actual sample would not
            establish. Prose is never keyword-scored.
          </p>
          <button
            className="button button-quiet"
            disabled={solutionShown}
            onClick={showSolution}
          >
            Show model explanation (solution assistance)
          </button>
          {solutionShown ? (
            <div aria-label="Recorded full model explanation">
              <p>
                Population probability = {inputs.group1Weight}×
                {inputs.group1Probability} + {1 - inputs.group1Weight}×
                {inputs.group2Probability} = {display(r.populationProbability)}.
              </p>
              <p>
                Break-even = {inputs.loss}/({inputs.gain}+{inputs.loss}) ={' '}
                {display(r.breakEvenProbability)}. Baseline uses p̄ in both
                groups; informed uses each stipulated p.
              </p>
              <p>
                Compute each forecast’s expected loss as p(1−q)²+(1−p)q².
                Weighted losses are {display(r.baselineBrier)} and{' '}
                {display(r.informedBrier)}.
              </p>
              <p>
                For selected continued groups, evaluate p×gain−(1−p)×loss, then
                weight by population shares. Declined or indifferent groups
                contribute zero. Baseline {display(r.baselinePolicyValue)};
                informed {display(r.informedPolicyValue)}; gross information
                value {display(r.informationGain)} currency units.
              </p>
              <p>
                Equal p collapses the extra label; changed costs can remove
                decision value while leaving forecast quality fixed. None of
                these exact modeled values proves real-world calibration or a
                realized profit.
              </p>
            </div>
          ) : null}
          <button className="button" onClick={() => controller.archive()}>
            Archive this experiment
          </button>
        </section>
      ) : null}
      <footer>
        <h2>Assumptions and limitations</h2>
        <ul>
          {[
            ...calibrationManifest.assumptions,
            ...calibrationManifest.limitations,
          ].map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <h3>Source notes</h3>
        <ul>
          {calibrationManifest.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>{' '}
              — {s.references[0].locator} {s.originalExamples}
            </li>
          ))}
        </ul>
      </footer>
    </section>
  )
}
export default function CalibrationView(props: Props) {
  return <AttemptView key={props.controller.attempt.id} {...props} />
}
