import { useId } from 'react'
import { DataTable } from '../../components/DataTable'
import { NumericControl } from '../../components/NumericControl'
import { PredictionForm } from '../../components/PredictionForm'
import type { ExperienceViewProps } from '../../core/types'
import type {
  SelectionInputs,
  SelectionOutput,
  SelectionParameters,
} from './model'
import { selectionSources } from './sources'
import './selection.css'

const hints = [
  'Define the target as all bets, including those not recorded. The observed sample is a different denominator.',
  'Ask whether bluffs and value bets are equally likely to be recorded. That information has not been supplied in the initial sample.',
  'You can compute a selected-sample share from recorded bluffs divided by all recorded bets, but that need not be the target share.',
  'For the initial sample, 30 / (30 + 420) = 6.6667% is the observed bluff share only. The target share is not identified without more information.',
] as const
function percent(value: number | null): string | null {
  return value === null ? null : `${(value * 100).toFixed(4)}%`
}
const correctionMessages = {
  available:
    'Available under both known positive recording probabilities. Inverse weighting recovers the target share of this exact expected-count model, not a causal effect.',
  'rates-unknown':
    'Unavailable: recording probabilities are not being treated as known. A selected sample alone does not identify the omitted class share.',
  'not-identifiable':
    'Unavailable / not identifiable: at least one class has zero recording probability. No inverse weight can recover an unobserved class from these counts alone.',
  'no-observations':
    'Unavailable: there are no recorded observations, so the inverse-weight denominator is zero.',
}
export default function SelectionView({
  controller,
  evidence,
}: ExperienceViewProps<SelectionInputs, SelectionOutput>) {
  const id = useId()
  const disclosed = controller.inputs.kind === 'disclosed'
  const parameters = disclosed ? controller.inputs.parameters : null
  const result = controller.result?.ok ? controller.result.value : null
  const ready = ['results_ready', 'reflected'].includes(controller.phase)
  const shownHints = hints.filter((_, i) =>
    controller.attempt.assistance.hintIds.includes(
      `selection:observation:${i}`,
    ),
  )
  function nextParameters(p: SelectionParameters) {
    controller.requestInputChange({ kind: 'disclosed', parameters: p })
  }
  function hint() {
    evidence.recordAttempt(controller.attempt)
    evidence.exposeHint(
      controller.attempt.id,
      `selection:observation:${shownHints.length}`,
    )
    if (shownHints.length === 3) evidence.exposeSolution(controller.attempt.id)
    controller.saveProtocolState({
      ...controller.protocolState,
      observationHints: shownHints.length + 1,
    })
  }
  async function run() {
    try {
      await controller.run()
    } catch {
      controller.saveProtocolState({
        ...controller.protocolState,
        runNotice:
          'This historical run cannot be replayed. Start a new experiment.',
      })
    }
  }
  return (
    <section
      className="qp-selection-lab qp-lesson-step"
      aria-labelledby={`${id}-title`}
    >
      <p className="outline-badge">
        Synthetic model · physical probabilities · exploratory practice
      </p>
      <h1 id={`${id}-title`}>Who made it into the sample?</h1>
      <p>
        The question is the bluff share among <strong>all bets</strong>, not
        merely the recorded bets. No live hand, opponent private card or future
        deck information is used.
      </p>
      <ol className="qp-selection-steps" aria-label="Experiment lifecycle">
        <li>Observe and predict</li>
        <li>Reveal the population</li>
        <li>Test the observation rule</li>
        <li>Reflect and transfer</li>
      </ol>
      {!disclosed ? (
        <section aria-labelledby={`${id}-observed`}>
          <h2 id={`${id}-observed`}>Observed-only decision snapshot</h2>
          <DataTable
            caption="Recorded sample before population reveal"
            summary="Only expected recorded counts are available. Target counts and observation rates are withheld until the explicit reveal. These expected counts are not a realized random sample."
            columns={['Recorded class', 'Expected recorded bets']}
            rows={[
              ['Bluffs', 30],
              ['Value bets', 420],
              ['Total recorded', 450],
            ]}
          />
          <p>
            Observed bluff share: 30 / 450 = 6.6667%.{' '}
            <strong>The target bluff share is not yet identifiable.</strong> The
            simulator will disclose its population, not estimate missing truth
            from this sample.
          </p>
        </section>
      ) : (
        <p role="note">
          Disclosed exploration: these simulator parameters are now known to
          you. A new prediction can test sensitivity but is not an unseen
          population test. Changing a committed parameter creates a linked
          draft; prior evidence is preserved.
        </p>
      )}
      {parameters ? (
        <fieldset
          className="qp-selection-controls"
          disabled={controller.phase === 'running'}
        >
          <legend>Disclosed synthetic population and observation rule</legend>
          <NumericControl
            name="populationSize"
            label="Population size"
            units="bets"
            min={100}
            max={10000}
            step={1}
            value={parameters.populationSize}
            onChange={(populationSize) =>
              nextParameters({ ...parameters, populationSize })
            }
          />
          <NumericControl
            name="bluffPrevalence"
            label="Target bluff prevalence"
            units="probability fraction"
            min={0}
            max={1}
            step="any"
            value={parameters.bluffPrevalence}
            onChange={(bluffPrevalence) =>
              nextParameters({ ...parameters, bluffPrevalence })
            }
          />
          <NumericControl
            name="bluffRecordingRate"
            label="Bluff recording probability"
            units="probability fraction"
            min={0}
            max={1}
            step="any"
            value={parameters.bluffRecordingRate}
            onChange={(bluffRecordingRate) =>
              nextParameters({ ...parameters, bluffRecordingRate })
            }
          />
          <NumericControl
            name="valueRecordingRate"
            label="Value-bet recording probability"
            units="probability fraction"
            min={0}
            max={1}
            step="any"
            value={parameters.valueRecordingRate}
            onChange={(valueRecordingRate) =>
              nextParameters({ ...parameters, valueRecordingRate })
            }
          />
          <label className="qp-selection-checkbox">
            <input
              type="checkbox"
              checked={parameters.observationRatesKnown}
              onChange={(e) =>
                nextParameters({
                  ...parameters,
                  observationRatesKnown: e.target.checked,
                })
              }
            />
            Use these observation rates as known assumptions for correction
          </label>
          <p>
            Fractions are physical probabilities; e.g. 0.1 means 10%. A model
            slider does not prove a real recording probability is known. Setting
            either rate to zero tests the positivity boundary.
          </p>
        </fieldset>
      ) : null}
      {controller.phase === 'draft' ? (
        <PredictionForm
          key={controller.attempt.id}
          actions={[
            'Report sample only',
            'Population share unavailable',
            'Correct with known positive rates',
          ]}
          question={
            disclosed
              ? 'Predict the next expected recorded bluff share in percent and the effect of the observation rule. State a decision-changing assumption.'
              : 'Predict the target population bluff share in percent, or choose unavailable/not sure. Explain which observation assumption could change your answer before the population is revealed.'
          }
          onCommit={(prediction) => controller.commitPrediction(prediction)}
        />
      ) : (
        <p>
          Committed prediction:{' '}
          {controller.attempt.prediction?.actionId ?? 'not supplied'}; estimate{' '}
          {controller.attempt.prediction?.numericEstimate ?? 'not supplied'}%;
          direction {controller.attempt.prediction?.direction ?? 'not sure'};
          confidence{' '}
          {controller.attempt.prediction?.confidencePercent ?? 'not sure'}.{' '}
          {controller.attempt.prediction?.rationale}
        </p>
      )}
      <div className="qp-selection-actions">
        <button
          className="button"
          disabled={controller.phase !== 'prediction_committed'}
          onClick={() => void run()}
        >
          {disclosed
            ? 'Run disclosed experiment'
            : 'Reveal synthetic population'}
        </button>
        {controller.phase === 'running' ? (
          <button onClick={() => controller.cancel()}>Cancel run</button>
        ) : null}
        <button
          onClick={hint}
          disabled={
            shownHints.length === 4 ||
            controller.phase === 'running' ||
            controller.phase === 'archived'
          }
        >
          Next observation hint ({shownHints.length}/4)
        </button>
      </div>
      <p role="status">
        {controller.status ||
          (controller.phase === 'draft'
            ? 'Commit a prediction before reveal or run.'
            : '')}{' '}
        {typeof controller.protocolState.runNotice === 'string'
          ? controller.protocolState.runNotice
          : ''}
      </p>
      {controller.result && !controller.result.ok ? (
        <p role="alert">
          {controller.result.errors.map((e) => e.message).join(' ')}
        </p>
      ) : null}
      {shownHints.length ? (
        <aside aria-label="Recorded observation hints">
          <ol>
            {shownHints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          <p>
            Assistance recorded. Hints or solution exposure cannot establish
            unaided mastery.
          </p>
        </aside>
      ) : null}
      {result ? (
        <section aria-labelledby={`${id}-result`}>
          <h2 id={`${id}-result`}>
            Revealed population and missing-observation flow
          </h2>
          <p>
            The synthetic population has {result.parameters.populationSize}{' '}
            bets. Its target bluff share is{' '}
            {percent(result.parameters.bluffPrevalence)}. Recording
            probabilities: bluffs{' '}
            {percent(result.parameters.bluffRecordingRate)}, value bets{' '}
            {percent(result.parameters.valueRecordingRate)}.
          </p>
          <DataTable
            caption="Expected recording flow by class"
            summary="Every population class splits into expected recorded and omitted masses. Fractional counts remain expected quantities, not rounded literal observations."
            columns={[
              'Class',
              'Population bets',
              'Recording probability',
              'Expected recorded bets',
              'Expected omitted bets',
            ]}
            rows={[
              [
                'Bluffs',
                result.populationBluffs,
                result.parameters.bluffRecordingRate,
                result.observedBluffs,
                result.omittedBluffs,
              ],
              [
                'Value bets',
                result.populationValues,
                result.parameters.valueRecordingRate,
                result.observedValues,
                result.omittedValues,
              ],
              [
                'Total',
                result.parameters.populationSize,
                null,
                result.observedTotal,
                result.omittedBluffs + result.omittedValues,
              ],
            ]}
          />
          <DataTable
            caption="Target versus recorded versus corrected shares"
            summary="Shares are model fractions displayed in percent. Unavailable is not a zero probability. Revealed simulator truth is separate from inference using the sample."
            columns={['Quantity', 'Bluff share (percent)']}
            rows={[
              [
                'Revealed target population',
                percent(result.parameters.bluffPrevalence),
              ],
              ['Expected recorded sample', percent(result.observedShare)],
              [
                'Known-rate inverse-probability correction',
                percent(result.correctedShare),
              ],
            ]}
          />
          <figure className="qp-selection-bars">
            <figcaption>
              Bluff-share rate bars (percent): the revealed target and the
              expected recorded sample use different denominators. Exact values
              are in the equivalent shares table.
            </figcaption>
            <label htmlFor={`${id}-target-bar`}>
              Revealed target: {percent(result.parameters.bluffPrevalence)}
            </label>
            <meter
              id={`${id}-target-bar`}
              min={0}
              max={100}
              value={result.parameters.bluffPrevalence * 100}
              aria-valuetext={`${percent(result.parameters.bluffPrevalence)} of the population`}
            />
            {result.observedShare === null ? (
              <p>Recorded rate bar: Unavailable — No observed outcomes.</p>
            ) : (
              <>
                <label htmlFor={`${id}-observed-bar`}>
                  Expected recorded sample: {percent(result.observedShare)}
                </label>
                <meter
                  id={`${id}-observed-bar`}
                  min={0}
                  max={100}
                  value={result.observedShare * 100}
                  aria-valuetext={`${percent(result.observedShare)} of recorded bets`}
                />
              </>
            )}
          </figure>
          {result.observedStatus === 'no-observations' ? (
            <p>
              No observed bets: observed share is Unavailable because its
              denominator is zero.
            </p>
          ) : null}
          <p>{correctionMessages[result.correctionStatus]}</p>
          {!disclosed ? (
            <button
              className="button"
              onClick={() => nextParameters({ ...result.parameters })}
            >
              Explore with disclosed controls
            </button>
          ) : null}
          <h3>What could be learned—and what could not</h3>
          <dl>
            <dt>Selection bias</dt>
            <dd>
              Unequal recording rates change the expected composition of the
              observed sample. More observations under the same unequal filter
              do not remove that distortion.
            </dd>
            <dt>Sampling noise</dt>
            <dd>
              Random realized samples fluctuate around their recording model.
              This lab uses exact expected counts to isolate selection; it
              simulates no draws and estimates no uncertainty interval.
            </dd>
            <dt>Causal identification</dt>
            <dd>
              Correcting composition does not tell us what a new lending,
              funding or opponent policy would cause. Missing outcomes under
              alternative decisions need additional assumptions and independent
              evidence.
            </dd>
          </dl>
          <p>
            Under known positive rates: corrected share = (recorded bluffs /
            bluff recording probability) divided by the sum of both
            inverse-weighted class counts. With unknown rates this computation
            is not justified; with a zero rate it is not defined.
          </p>
          {ready ? (
            <>
              <label htmlFor={`${id}-reflection`}>
                Reflection (ungraded): compare your prediction with the reveal.
                Which observation rule changed your inference, and what could
                you not infer?
              </label>
              <textarea
                id={`${id}-reflection`}
                maxLength={2000}
                value={controller.attempt.reflection ?? ''}
                onChange={(e) => controller.reflect(e.target.value)}
              />
              <button onClick={() => controller.archive()}>
                Archive this experiment
              </button>
            </>
          ) : null}
        </section>
      ) : null}
      {disclosed ? (
        <button
          onClick={() =>
            nextParameters({
              ...parameters!,
              populationSize: 1000,
              bluffPrevalence: 0.3,
              bluffRecordingRate: 0.1,
              valueRecordingRate: 0.6,
              observationRatesKnown: false,
            })
          }
        >
          Reset disclosed controls (history preserved)
        </button>
      ) : null}
      <p>
        Exploration and ungraded reflection do not establish mastery. Finance
        transfer and changed-number reviews below use shared structured
        evidence, with assistance and repeated variants excluded from unaided
        mastery.
      </p>
      <details>
        <summary>Source, assumptions and scope</summary>
        <p>
          Original hypothetical arithmetic. The checked source supports the
          selected-label problem, not empirical validation of this curriculum, a
          causal lending evaluation, or reconstruction of an opponent’s range.
        </p>
        {selectionSources.map((source) => (
          <p key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>{' '}
            — {source.references[0].locator}; checked{' '}
            {source.references[0].checkedAt}. {source.originalExamples}
          </p>
        ))}
      </details>
    </section>
  )
}
