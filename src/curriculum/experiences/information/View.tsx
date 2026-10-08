import { useState } from 'react'
import { NumericControl } from '../../components/NumericControl'
import { PredictionForm } from '../../components/PredictionForm'
import { DataTable, type DataTableProps } from '../../components/DataTable'
import type { ExperienceViewProps, Prediction } from '../../core/types'
import { decodePrediction } from '../../core/validation'
import { informationManifest } from './manifest'
import {
  defaultInputs,
  type InformationInputs,
  type InformationOutput,
} from './model'
import './styles.css'

const controlDefinitions = [
  {
    name: 'prior',
    label: 'Prior success probability p',
    units: 'probability fraction',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'gain',
    label: 'Success gain G',
    units: 'currency units',
    min: 1,
    max: 500,
    step: 1,
  },
  {
    name: 'loss',
    label: 'Failure loss C',
    units: 'currency units',
    min: 0,
    max: 200,
    step: 1,
  },
  {
    name: 'sensitivity',
    label: 'Sensitivity s = P(positive | success)',
    units: 'probability fraction',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'specificity',
    label: 'Specificity t = P(negative | failure)',
    units: 'probability fraction',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'fee',
    label: 'Research fee k',
    units: 'currency units',
    min: 0,
    max: 100,
    step: 1,
  },
] as const
const hints = [
  'Sensitivity is P(positive | success), not P(success | positive). Combine both success and failure paths to get the probability of a signal.',
  'Choose take or decline independently for each reachable signal branch. Declining contributes zero before fee; a zero-probability posterior is unavailable.',
  'The largest affordable fee is the incremental improvement over the best no-signal action, not the full signal-policy profit or prediction accuracy. Perfect information bounds this improvement.',
  'Vsig=max(0,p×s×G−(1−p)×(1−t)×C)+max(0,p×(1−s)×G−(1−p)×t×C). V0=max(0,p×G−(1−p)×C); EVSI=Vsig−V0; buy when fee<EVSI and be indifferent at equality.',
]
const presets: readonly {
  label: string
  inputs: InformationInputs
  prompt: string
}[] = [
  {
    label: 'Uninformative signal',
    inputs: { ...defaultInputs, sensitivity: 0.35, specificity: 0.65 },
    prompt:
      'Can this signal change a posterior? Predict its incremental value before running.',
  },
  {
    label: 'Perfect information',
    inputs: { ...defaultInputs, sensitivity: 1, specificity: 1 },
    prompt: 'Predict the action policy and compare maximum fee with EVPI.',
  },
  {
    label: 'Perfectly inverted signal',
    inputs: { ...defaultInputs, sensitivity: 0, specificity: 0 },
    prompt:
      'Do the labels need to be interpreted in reverse? Predict which branch is worth taking.',
  },
  {
    label: 'Same action after both signals',
    inputs: { ...defaultInputs, prior: 0.9 },
    prompt:
      'Does a more precise belief necessarily improve the optimal action? Predict the value of the report.',
  },
  {
    label: 'Fee experiment: 9',
    inputs: { ...defaultInputs, fee: 9 },
    prompt:
      'Compare buying the report with the best no-report choice, not with zero profit.',
  },
  {
    label: 'Unreachable negative branch',
    inputs: { ...defaultInputs, sensitivity: 1, specificity: 0 },
    prompt:
      'The test always says positive. Predict how to label the negative posterior.',
  },
]
const display = (value: number | null) =>
  value === null
    ? 'Unavailable'
    : value.toLocaleString('en-US', { maximumSignificantDigits: 8 })

function ResultsTable(props: DataTableProps) {
  return (
    <DataTable
      {...props}
      summary={`${props.summary} Display rounded to eight significant digits; stored model results retain full precision.`}
      rows={props.rows.map((row) =>
        row.map((cell) => (typeof cell === 'number' ? display(cell) : cell)),
      )}
    />
  )
}

export default function InformationView({
  controller,
  evidence,
}: ExperienceViewProps<InformationInputs, InformationOutput>) {
  const [runError, setRunError] = useState('')
  const r = controller.result?.ok ? controller.result.value : null
  const savedPrediction = decodePrediction(
    controller.protocolState.predictionDraft,
  )
  const hintCount = hints.filter((_, index) =>
    controller.attempt.assistance.hintIds.includes(
      `information-hint-${index + 1}`,
    ),
  ).length
  const exposeHint = () => {
    evidence.recordAttempt(controller.attempt)
    evidence.exposeHint(
      controller.attempt.id,
      `information-hint-${hintCount + 1}`,
    )
    controller.saveProtocolState({ ...controller.protocolState })
  }
  const saveDraft = (p: Prediction) =>
    controller.saveProtocolState({
      ...controller.protocolState,
      predictionDraft: {
        ...(p.actionId ? { actionId: p.actionId } : {}),
        ...(p.direction ? { direction: p.direction } : {}),
        ...(p.numericEstimate !== undefined
          ? { numericEstimate: p.numericEstimate }
          : {}),
        confidencePercent: p.confidencePercent,
        rationale: p.rationale,
      },
    })
  const change = (next: InformationInputs, prompt?: string) => {
    setRunError('')
    controller.requestInputChange(next)
    if (prompt)
      controller.saveProtocolState({
        ...controller.protocolState,
        experimentPrompt: prompt,
      })
  }
  return (
    <section
      className="qp-information-lab qp-lesson-step"
      aria-label="Information value laboratory"
    >
      <h1>Price the next piece of information</h1>
      <p>
        Buy information only when it can change the best decision enough to
        justify its cost. This exact, finite experiment separates a better
        forecast from a better policy.
      </p>
      <p>
        <strong>Connection:</strong> direct decision mathematics; the business
        examples are separate finance models, not poker contracts or market
        pricing.
      </p>
      <details>
        <summary>Information set, timing and assumptions</summary>
        <ol>
          <li>
            Choose whether to pay for a private report before observing its
            signal.
          </li>
          <li>
            After the signal, optionally take an opportunity: success pays +G,
            failure pays −C. Decline pays 0 before the research fee.
          </li>
          <li>
            Payoffs settle later. The purchased report fee is paid on every
            branch, including branches where the opportunity is declined.
          </li>
        </ol>
        <ul>
          {informationManifest.assumptions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </details>
      <h2>1. Specify the public model inputs</h2>
      <p>
        All probabilities are physical model probabilities. Money is
        hypothetical currency units. Sensitivity and specificity are separate
        likelihoods, not posterior beliefs.
      </p>
      <div
        className="qp-information-controls"
        key={`controls-${controller.attempt.id}`}
      >
        {controlDefinitions.map((field) => (
          <NumericControl
            key={field.name}
            {...field}
            value={controller.inputs[field.name]}
            onChange={(value) =>
              change({ ...controller.inputs, [field.name]: value })
            }
          />
        ))}
      </div>
      <p>
        Changing a committed input archives that experiment and opens a linked
        draft. It cannot rewrite the earlier prediction.
      </p>
      <details>
        <summary>Choose a boundary experiment</summary>
        <div className="qp-information-actions">
          {presets.map((preset) => (
            <button
              className="button secondary"
              key={preset.label}
              onClick={() => change(preset.inputs, preset.prompt)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </details>
      {typeof controller.protocolState.experimentPrompt === 'string' ? (
        <p>{controller.protocolState.experimentPrompt}</p>
      ) : null}
      <h2>2. Predict before revealing the policy</h2>
      <p>
        Exploration is practice, not assessment credit. Predictions, confidence
        and reflections are recorded, never keyword-scored; modeled profit is
        not evidence of mastery.
      </p>
      {controller.phase === 'draft' ? (
        <PredictionForm
          key={`prediction-${controller.attempt.id}`}
          initial={savedPrediction.ok ? savedPrediction.value : undefined}
          question="Predict which branches are worth taking and estimate the largest affordable research fee (EVSI, currency units). Explain whether you would buy at the quoted fee in your rationale."
          actions={[
            'Policy undecided',
            'Take only after positive',
            'Take only after negative',
            'Take after both signals',
            'Decline after both signals',
          ]}
          onDraft={saveDraft}
          onCommit={(p) => controller.commitPrediction(p)}
        />
      ) : (
        <div className="qp-information-commitment">
          <p>
            <strong>Prediction committed:</strong>{' '}
            {controller.attempt.prediction?.actionId ?? 'No action selected'};
            maximum fee estimate{' '}
            {controller.attempt.prediction?.numericEstimate === undefined
              ? 'not supplied'
              : `${controller.attempt.prediction.numericEstimate} currency units`}
            .
          </p>
          <p>Rationale: {controller.attempt.prediction?.rationale}</p>
          <p>
            Confidence:{' '}
            {controller.attempt.prediction?.confidencePercent === null
              ? 'not sure'
              : `${controller.attempt.prediction?.confidencePercent}%`}
            ; this is ungraded.
          </p>
        </div>
      )}
      <aside aria-label="Progressive experiment hints">
        <button
          className="button secondary"
          disabled={hintCount === 4 || controller.phase === 'archived'}
          onClick={exposeHint}
        >
          Show next experiment hint ({hintCount}/4)
        </button>
        <ol>
          {hints.slice(0, hintCount).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ol>
        <p>
          {hintCount
            ? 'Assistance recorded for this experiment; it is not unaided evidence.'
            : 'No experiment hints used.'}
        </p>
      </aside>
      <h2>3. Reveal the exact expected-value experiment</h2>
      <div className="qp-information-actions">
        <button
          className="button"
          disabled={controller.phase !== 'prediction_committed'}
          onClick={async () => {
            setRunError('')
            try {
              await controller.run()
            } catch (error) {
              setRunError(
                error instanceof Error
                  ? error.message
                  : 'Unable to run this experiment.',
              )
            }
          }}
        >
          Run information experiment
        </button>
        {controller.phase === 'running' ? (
          <button
            className="button secondary"
            onClick={() => controller.cancel()}
          >
            Cancel experiment
          </button>
        ) : null}
        <button
          className="button secondary"
          onClick={() => {
            setRunError('')
            controller.resetControls()
          }}
        >
          Reset to defaults / new linked experiment
        </button>
      </div>
      <p role="status">
        {controller.status ||
          `Experiment phase: ${controller.phase.replaceAll('_', ' ')}.`}
      </p>
      {runError ? <p role="alert">{runError}</p> : null}
      {controller.result && !controller.result.ok ? (
        <ul role="alert">
          {controller.result.errors.map((error) => (
            <li key={error.field}>{error.message}</li>
          ))}
        </ul>
      ) : null}
      {r ? (
        <>
          <p>
            <strong>Expected model results only.</strong> No project has been
            realized or sampled. This model does not show actual profit; the
            ledger lists hypothetical possible state payoffs.
          </p>
          <ResultsTable
            caption="Research decision values"
            summary="Expected incremental profits in currency units. Signal value before fee, the purchased fee and net purchase value are different quantities."
            columns={['Quantity', 'Value']}
            rows={[
              ['Best no-signal value V0', r.withoutSignal],
              ['Value before fee Vsig', r.withSignalBeforeFee],
              ['Purchase fee k', r.purchaseFee],
              ['Net value of buying', r.purchaseNet],
              ['Maximum affordable fee / EVSI', r.evsi],
              ['Perfect-information value', r.perfectValue],
              ['Perfect-information increment / EVPI', r.evpi],
              ['Optimal total value', r.optimalValue],
              [
                'Purchase decision',
                r.purchaseDecision === 'buy'
                  ? 'Buy the signal'
                  : r.purchaseDecision === 'do-not-buy'
                    ? 'Do not buy the signal'
                    : 'Indifferent: buying and not buying have equal expected value',
              ],
            ]}
          />
          <section aria-label="Accessible signal decision tree">
            <h3>Decision tree: research before an optional action</h3>
            <ol className="qp-information-tree">
              <li>
                <strong>Do not buy research.</strong> Choose {r.noSignalAction}{' '}
                from the prior. Expected profit: {display(r.withoutSignal)}{' '}
                currency units.
              </li>
              <li>
                <strong>
                  Buy research: pay {display(r.purchaseFee)} currency units now.
                </strong>{' '}
                The fee is paid before the signal and cannot be recovered by
                declining.
                <ol>
                  {r.branches.map((branch) => (
                    <li key={branch.signal}>
                      <strong>
                        {branch.signal === 'positive'
                          ? 'Positive signal'
                          : 'Negative signal'}{' '}
                        — {branch.status}.
                      </strong>{' '}
                      Probability {display(branch.probability)}.
                      {branch.status === 'unreachable' ? (
                        <p>
                          Unreachable branch: posterior and conditional action
                          value are unavailable. No optimal action is assigned
                          to an impossible branch.
                        </p>
                      ) : (
                        <p>
                          Posterior success probability{' '}
                          {display(branch.posterior)}; take profit before fee{' '}
                          {display(branch.conditionalTakeProfit)} currency
                          units; optimal action: {branch.action}.
                        </p>
                      )}
                      <p>
                        Branch-weighted contribution before fee{' '}
                        {display(branch.optimalContribution)}; allocated fee{' '}
                        {display(branch.feeContribution)}; net contribution{' '}
                        {display(branch.netContribution)} currency units.
                        Allocation reconciles the ledger; the actual fee is paid
                        once upfront, not only when this branch occurs.
                      </p>
                    </li>
                  ))}
                </ol>
              </li>
            </ol>
          </section>
          <ResultsTable
            caption="Signal branches and conditional actions"
            summary="All probabilities are fractions. Unreachable branch conditionals are unavailable, not zero. Currency contributions already include branch probability."
            columns={[
              'Signal',
              'Status',
              'Probability',
              'Posterior success',
              'Take profit before fee',
              'Optimal action',
              'Weighted contribution before fee',
              'Weighted fee',
              'Weighted net contribution',
            ]}
            rows={r.branches.map((branch) => [
              branch.signal,
              branch.status,
              branch.probability,
              branch.posterior,
              branch.conditionalTakeProfit,
              branch.action,
              branch.optimalContribution,
              branch.feeContribution,
              branch.netContribution,
            ])}
          />
          <ResultsTable
            caption="Purchased-research state ledger"
            summary="Four hypothetical state paths, not observed outcomes. Every path charges the fee, even when declining; zero-probability paths contribute zero. Indifferent actions are displayed as decline for settlement, with the same conditional expectation."
            columns={[
              'Signal / outcome',
              'Joint probability',
              'Action',
              'Action profit before fee',
              'Fee paid',
              'Net state profit',
              'Expected contribution',
            ]}
            rows={r.ledger.map((row) => [
              `${row.signal} / ${row.outcome}`,
              row.probability,
              row.action,
              row.actionProfit,
              row.fee,
              row.netProfit,
              row.expectedContribution,
            ])}
          />
          <ResultsTable
            caption="Observation versus flexibility"
            summary="Recombining the conditional branches leaves a fixed unchanged claim’s expectation unchanged; flexible contingent actions, not observation alone, create EVSI."
            columns={['Quantity', 'Currency units']}
            rows={[
              [
                'Fixed always-take claim expectation',
                r.fixedClaimExpectedProfit,
              ],
              [
                'Recombined fixed-claim branch contributions',
                r.branches.reduce(
                  (sum, b) => sum + b.fixedClaimContribution,
                  0,
                ),
              ],
              ['Flexible signal policy before fee', r.withSignalBeforeFee],
            ]}
          />
          <h2>4. Reflect and test a decision reversal</h2>
          <p>
            Compare your committed prediction with the model. If fee equals
            EVSI, the decision is indifferent; above it, reject research. Try
            the fee9 preset, inverted labels or a prior high enough that both
            branches choose the same action.
          </p>
          {['results_ready', 'reflected'].includes(controller.phase) ? (
            <label>
              Experiment reflection (ungraded)
              <textarea
                maxLength={2000}
                value={controller.attempt.reflection ?? ''}
                onChange={(e) => controller.reflect(e.target.value)}
                placeholder="Which branch changed the action? What fee or payoff change reverses buying? What breaks if the report is public or arrives too late?"
              />
            </label>
          ) : (
            <p>
              Archived reflection:{' '}
              {controller.attempt.reflection ?? 'not supplied'}
            </p>
          )}
          <button
            className="button secondary"
            disabled={
              controller.attempt.assistance.solutionViewed ||
              controller.phase === 'archived'
            }
            onClick={() => {
              evidence.recordAttempt(controller.attempt)
              evidence.exposeSolution(controller.attempt.id)
              controller.saveProtocolState({ ...controller.protocolState })
            }}
          >
            Show worked explanation (assistance recorded)
          </button>
          {controller.attempt.assistance.solutionViewed ? (
            <p>
              Worked explanation: take when posterior success exceeds C/(G+C)=
              {display(r.actionThreshold)}; otherwise decline, or be indifferent
              at equality. Reachable branches can be optimized separately. Vsig=
              {display(r.withSignalBeforeFee)} minus V0=
              {display(r.withoutSignal)} gives EVSI={display(r.evsi)}. Subtract
              the fee once to obtain {display(r.purchaseNet)}, then compare with{' '}
              {display(r.withoutSignal)}. Profit is expected, not realized, and
              this explanation exposure is recorded.
            </p>
          ) : null}
        </>
      ) : null}
      <h2>Where this model stops</h2>
      <ul>
        {informationManifest.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <details>
        <summary>Checked sources and original example provenance</summary>
        <p>
          Bayes inversion:{' '}
          <a href="https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/mit18_05_s22_statistics.pdf">
            MIT 18.05, Class 10 section 3
          </a>
          . The likelihood model is supplied, not estimated from a private game
          history.
        </p>
        {informationManifest.sources.map((source) => (
          <div key={source.id}>
            <a href={source.url}>{source.title}</a>
            <p>
              {source.references[0].claim} ({source.references[0].locator})
            </p>
            <p>{source.originalExamples}</p>
          </div>
        ))}
      </details>
    </section>
  )
}
