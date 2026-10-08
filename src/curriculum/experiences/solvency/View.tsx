import { memo, useId, useState } from 'react'
import type {
  EvidenceCallbacks,
  ExperienceViewProps,
  AttemptSnapshot,
} from '../../core/types'
import { NumericControl } from '../../components/NumericControl'
import { PredictionForm } from '../../components/PredictionForm'
import { DataTable } from '../../components/DataTable'
import { SeriesChart } from '../../components/SeriesChart'
import { inputRanges, type SolvencyInputs, type SolvencyOutput } from './model'
import { solvencyManifest } from './manifest'

const controls: readonly {
  key: keyof SolvencyInputs
  label: string
  units: string
  step: number | 'any'
}[] = [
  { key: 'n', label: 'Policy count N', units: 'policies', step: 1 },
  {
    key: 'p',
    label: 'Physical claim probability p',
    units: 'probability fraction',
    step: 'any',
  },
  {
    key: 'severity',
    label: 'Fixed promised claim S',
    units: 'currency per claim',
    step: 'any',
  },
  {
    key: 'premium',
    label: 'Premium per policy h',
    units: 'currency per policy',
    step: 'any',
  },
  {
    key: 'capital',
    label: 'External capital K',
    units: 'currency',
    step: 'any',
  },
  {
    key: 'rho',
    label: 'Common-event mixture weight rho',
    units: 'fraction',
    step: 'any',
  },
]
const hints = [
  'Name what arrives before settlement and what is owed afterward. Separate a probability from a currency amount.',
  'Write funds=N×h+K and claims=S×count. Pooling and capital are different mechanisms.',
  'Default is strictly claims>funds. Enumerate the independent/common-event mixture; sum probability×unpaid claims, not probability alone.',
  'Worked method: actual=min(claims,funds), unpaid=max(claims−funds,0), remaining=max(funds−claims,0), shareholder net=remaining−K. Expected promised margin=N×h−N×p×S excludes capital.',
]
function Assistance({
  attempt,
  evidence,
  disabled,
}: {
  attempt: AttemptSnapshot
  evidence: EvidenceCallbacks
  disabled: boolean
}) {
  const [count, setCount] = useState(0)
  return (
    <section aria-label="Progressive assistance">
      <button
        className="text-button"
        disabled={disabled || count === 4}
        onClick={() => {
          evidence.exposeHint(attempt.id, `solvency-method-${count + 1}`)
          if (count === 3) evidence.exposeSolution(attempt.id)
          setCount(count + 1)
        }}
      >
        Show next solvency hint ({count}/4; marks assisted)
      </button>
      <p>
        {count
          ? 'Assisted exploration; no unaided mastery awarded.'
          : 'No hint requested in this view. Persisted assistance remains on the attempt.'}
      </p>
      {hints.slice(0, count).map((hint) => (
        <p key={hint}>{hint}</p>
      ))}
    </section>
  )
}
function Distribution({ output: r }: { output: SolvencyOutput }) {
  const id = useId()
  const ymax = Math.max(...r.states.map((s) => s.probability)) || 1
  const xmax = Math.max(r.totalExposure, r.funds)
  const x = (claims: number) => 40 + (420 * claims) / xmax
  const y = (probability: number) => 210 - (160 * probability) / ymax
  const end = r.states[r.states.length - 1]
  return (
    <figure>
      <figcaption id={id}>
        <strong>Aggregate promised claims distribution</strong> — physical model
        probability, not a market price or sampled frequency.
      </figcaption>
      <p id={`${id}-summary`}>
        Vertical bars represent probability mass. Dashed vertical line marks
        settlement funds {r.funds}; strictly to its right is default. Highest
        loss {r.totalExposure} has probability{' '}
        {end.logProbability === null
          ? '0 (impossible)'
          : end.probability === 0
            ? `positive, below numeric range; log=${end.logProbability}`
            : end.probability.toExponential(8)}
        . See the complete equivalent state table below; very small bars are
        labeled in text rather than treated as impossible.
      </p>
      <svg
        viewBox="0 0 500 280"
        role="img"
        aria-labelledby={id}
        aria-describedby={`${id}-summary`}
      >
        <path d="M40,40V210H460" fill="none" stroke="currentColor" />
        {r.states.map((s) => (
          <g key={s.claimCount}>
            <path
              d={`M${x(s.promisedClaims)},210V${y(s.probability)}`}
              stroke="currentColor"
              strokeWidth={2}
            >
              <title>{`Promised ${s.promisedClaims}; probability ${s.probability}; ${s.isDefault ? 'default' : 'funded'}`}</title>
            </path>
            {s.probability > 0 ? (
              <circle
                cx={x(s.promisedClaims)}
                cy={y(s.probability)}
                r={2}
                fill="currentColor"
              />
            ) : null}
          </g>
        ))}
        <path
          d={`M${x(r.funds)},40V210`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="5 4"
        >
          <title>Available settlement funds threshold</title>
        </path>
        <text x={40} y={25}>
          Probability (fraction): 0–{ymax.toPrecision(5)}
        </text>
        <text x={40} y={240}>
          Aggregate promised claims (currency): 0–{xmax}
        </text>
        <text x={40} y={265}>
          Dashed marker: funds {r.funds}; exposure {r.totalExposure}
        </text>
      </svg>
    </figure>
  )
}
const Results = memo(function Results({
  output: r,
}: {
  output: SolvencyOutput
}) {
  const [count, setCount] = useState(0)
  const state = r.states[count] ?? r.states[0]
  const probability = (value: number, log: number | null) =>
    log === null
      ? '0 (impossible)'
      : value === 0
        ? `Below numeric range; log probability ${log}`
        : value.toExponential(8)
  return (
    <section>
      <h2>Exact modeled outcomes</h2>
      <p>
        No claim path was sampled. The probabilities and expectations below
        describe the supplied model; the inspected settlement is a hypothetical
        realized state, not observed data or graded profit.
      </p>
      <DataTable
        caption="Funding and risk metrics"
        summary="Currency values unless explicitly labeled probability or count. Capital is external funding, not underwriting revenue."
        columns={['Metric', 'Value']}
        rows={[
          ['Premium inflow', r.premiumInflow],
          ['Initial external capital', r.initialCapital],
          ['Available funds threshold', r.funds],
          ['Total promised exposure', r.totalExposure],
          ['Expected promised claims', r.expectedPromisedClaims],
          [
            'Expected promised underwriting margin (before capital/default)',
            r.promisedUnderwritingMargin,
          ],
          [
            'Default probability (physical fraction)',
            probability(r.defaultProbability, r.logDefaultProbability),
          ],
          [
            'Expected unpaid claims E[(claims−funds)+]',
            r.shortfallStatus === 'below-number-range'
              ? 'Positive, below numeric range'
              : r.expectedShortfall,
          ],
          ['Conditional shortfall given default', r.conditionalShortfall],
          ['Expected actual payments', r.expectedActualPayments],
          ['Expected remaining funds', r.expectedRemainingFunds],
          [
            'Expected shareholder net (remaining minus K)',
            r.expectedShareholderNetResult,
          ],
          [
            'Contributed capital at risk (not a regulatory requirement)',
            r.capitalAtRisk,
          ],
          ['Single-policy claims SD', r.singleClaimSD],
          ['Total claims SD', r.totalClaimsSD],
          ['Average per-policy claims SD', r.averageClaimsSD],
          ['Claim-count variance', r.claimCountVariance],
          [
            'Pairwise event correlation (undefined at endpoints or N=1)',
            r.pairwiseCorrelation,
          ],
        ]}
      />
      <p>
        Default begins at{' '}
        {r.firstDefaultCount === null
          ? 'no possible claim count: funds cover all promises'
          : `${r.firstDefaultCount} claims`}
        . Claims equal to {r.funds} currency exhaust funds but are not default.
        Conditional shortfall is unavailable only when default is impossible.
      </p>
      <NumericControl
        name="inspectCount"
        label="Inspect stipulated realized claim count"
        units="claims"
        value={state.claimCount}
        min={0}
        max={r.states.length - 1}
        step={1}
        onChange={setCount}
      />
      <DataTable
        caption="Inspected realized-state ledger"
        summary={`Hypothetical count ${state.claimCount}; model probability ${probability(state.probability, state.logProbability)}. This state is ${state.isDefault ? 'a default' : 'not a default'}; selection does not sample from the distribution.`}
        columns={['Ledger item', 'Currency']}
        rows={[
          ['Premium inflow', r.premiumInflow],
          ['Initial capital', r.initialCapital],
          ['Available funds', r.funds],
          ['Promised claims', state.promisedClaims],
          ['Actual payments', state.actualPayments],
          ['Unpaid claims', state.unpaidClaims],
          ['Remaining funds', state.remainingFunds],
          ['Shareholder net result', state.shareholderNetResult],
        ]}
      />
      <Distribution output={r} />
      <SeriesChart
        title="Claims versus available funding"
        summary="Above the funding line is default; on the line is equality, not default. Funds do not grow when more claims arrive."
        xLabel="Claim count"
        xUnits="claims"
        yLabel="Currency"
        yUnits="currency"
        series={[
          {
            name: 'Promised claims',
            points: r.states.map((s) => ({
              x: s.claimCount,
              y: s.promisedClaims,
            })),
          },
          {
            name: 'Available funds threshold',
            points: r.states.map((s) => ({ x: s.claimCount, y: r.funds })),
          },
        ]}
      />
      <details>
        <summary>
          Complete exact distribution and settlement table ({r.states.length}{' '}
          states)
        </summary>
        <DataTable
          caption="Every possible claim count"
          summary="Promises = actual + unpaid. Log probability is natural log; Unavailable means impossible, while tiny positive probabilities are explicitly labeled. Default follows claims>funds even for impossible states."
          columns={[
            'Count',
            'Probability',
            'Log probability',
            'Promised',
            'Actual',
            'Unpaid',
            'Remaining',
            'Shareholder net',
            'Default',
          ]}
          rows={r.states.map((s) => [
            s.claimCount,
            probability(s.probability, s.logProbability),
            s.logProbability,
            s.promisedClaims,
            s.actualPayments,
            s.unpaidClaims,
            s.remainingFunds,
            s.shareholderNetResult,
            s.isDefault ? 'Yes' : 'No',
          ])}
        />
      </details>
    </section>
  )
})
export default function View({
  controller,
  evidence,
}: ExperienceViewProps<SolvencyInputs, SolvencyOutput>) {
  const ready = ['results_ready', 'reflected'].includes(controller.phase)
  return (
    <section className="qp-solvency-view">
      <h1>Can a profitable promise be paid?</h1>
      <p>
        Predict payment reliability, test dependence and funding, then explain
        what would change your decision. This synthetic insurance laboratory is
        separate finance, not an ordinary poker insurance contract.
      </p>
      <p>
        <strong>Dependence family:</strong> with probability rho, one common
        Bernoulli(p) event drives all policies; otherwise independent
        Bernoulli(p) events. Both branches keep the same marginal p. Rho is not
        a universal tail/correlation model.
      </p>
      <div className="qp-controls">
        {controls.map(({ key, label, units, step }) => (
          <div key={key}>
            <NumericControl
              name={key}
              label={label}
              units={units}
              min={inputRanges[key][0]}
              max={inputRanges[key][1]}
              step={step}
              value={controller.inputs[key]}
              onChange={(value) =>
                controller.requestInputChange({
                  ...controller.inputs,
                  [key]: value,
                })
              }
            />
            {key === 'rho' ? (
              <p>
                Family: independent Bernoulli book at rho=0; one shared
                all-or-none Bernoulli event at rho=1. Intermediate rho mixes
                those families, not claim severity. Pairwise event correlation
                is undefined for N=1 or p at0/1.
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <p>
        Changing a committed control creates a linked draft; it never rewrites
        the prior input or prediction. Invalid entries keep the last validated
        input. Physical probability is not a market pricing weight. Increasing
        capital funds obligations but does not increase premium revenue.
      </p>
      {controller.phase === 'draft' ? (
        <PredictionForm
          key={`prediction:${controller.attempt.id}`}
          actions={[
            'Increase capital before relying on payment',
            'Keep this funding under the stated model',
            'Investigate dependence first',
          ]}
          question="Predict default probability (fraction) for this book. Would adding policies reduce average risk, total dollar exposure, default frequency, or all three? Specify whether capital K and premium per policy h remain fixed or scale with N, and name a decision-changing dependence assumption."
          onCommit={(p) => controller.commitPrediction(p)}
        />
      ) : (
        <p>
          Committed prediction: {controller.attempt.prediction?.actionId};
          direction {controller.attempt.prediction?.direction}; estimate{' '}
          {controller.attempt.prediction?.numericEstimate ?? 'not supplied'};
          confidence{' '}
          {controller.attempt.prediction?.confidencePercent ?? 'not sure'}.{' '}
          {controller.attempt.prediction?.rationale}
        </p>
      )}
      <button
        className="button"
        disabled={controller.phase !== 'prediction_committed'}
        onClick={() => void controller.run()}
      >
        Calculate exact funded distribution
      </button>
      <button
        className="text-button"
        disabled={controller.phase !== 'running'}
        onClick={() => controller.cancel()}
      >
        Cancel calculation
      </button>
      <button
        className="text-button"
        onClick={() => controller.resetControls()}
      >
        Reset controls / linked experiment
      </button>
      <p role="status">
        {controller.status || `Experiment phase: ${controller.phase}.`}{' '}
        {controller.mode === 'explore'
          ? 'Exploration: not evidence of unaided mastery. Use the foundation transfer/review cases for structured evidence.'
          : 'Assessment context; use the matching authored case for structured submission.'}
      </p>
      <Assistance
        key={`hints:${controller.attempt.id}`}
        attempt={controller.attempt}
        evidence={evidence}
        disabled={
          controller.phase === 'draft' || controller.phase === 'archived'
        }
      />
      {controller.result && !controller.result.ok ? (
        <p role="alert">
          {controller.result.errors.map((e) => e.message).join(' ')}
        </p>
      ) : null}
      {controller.result?.ok ? (
        <Results
          key={`results:${controller.attempt.id}`}
          output={controller.result.value}
        />
      ) : null}
      {ready ? (
        <section>
          <h2>Reflect and carry the decision forward</h2>
          <label>
            Reflection (ungraded, up to2,000 characters)
            <textarea
              maxLength={2000}
              value={controller.attempt.reflection ?? ''}
              onChange={(e) => controller.reflect(e.target.value)}
            />
          </label>
          <p>
            Compare default frequency with shortfall size. Did more customers
            reduce average risk or merely increase total exposure? Which capital
            or shared-event assumption would reverse your action? Save a linked
            experiment by changing a control; reflection is never
            keyword-scored.
          </p>
          <button className="button" onClick={() => controller.archive()}>
            Archive this exploration
          </button>
        </section>
      ) : null}
      <details>
        <summary>Assumptions, limitations and checked sources</summary>
        <ul>
          {[
            ...solvencyManifest.assumptions,
            ...solvencyManifest.limitations,
          ].map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        {solvencyManifest.sources.map((source) => (
          <p key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>{' '}
            —{' '}
            {source.references
              .map(
                (ref) =>
                  `${ref.claim} Checked ${ref.checkedAt}; ${ref.locator}.`,
              )
              .join(' ')}
          </p>
        ))}
      </details>
    </section>
  )
}
