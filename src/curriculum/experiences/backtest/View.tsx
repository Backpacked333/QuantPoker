import { useState } from 'react'
import type { ExperienceViewProps } from '../../core/types'
import { NumericControl } from '../../components/NumericControl'
import { PredictionForm } from '../../components/PredictionForm'
import { DataTable } from '../../components/DataTable'
import { backtestManifest } from './manifest'
import { backtestCases } from './cases'
import { ResearchAssessment } from './Assessment'
import {
  linkedExperiment,
  preregister,
  protocolFor,
  freezeCandidate,
  requestHoldout,
  runResearch,
  saveResearchReflection,
} from './protocol'
import {
  backtestModel,
  type BacktestInputs,
  type BacktestOutput,
} from './model'

const protocolHints = [
  'Separate selecting a policy from evaluating one.',
  'Every candidate is a null policy; more tries can make the development winner look impressive.',
  'Preregister and retain the full leaderboard, then freeze the candidate before looking at untouched data.',
  'Costs apply to every observation; the held-out interval concerns the frozen policy, not its selected development mean.',
]
const fmt = (n: number) => n.toFixed(6)
export default function View({
  controller: c,
  evidence,
}: ExperienceViewProps<BacktestInputs, BacktestOutput>) {
  const [hypothesis, setHypothesis] = useState('')
  const [falsification, setFalsification] = useState('')
  const [error, setError] = useState('')
  const [hintCount, setHintCount] = useState(
    () =>
      c.attempt.assistance.hintIds.filter((id) =>
        id.startsWith('backtest-protocol-hint-'),
      ).length,
  )
  const parsed = (() => {
    try {
      return { protocol: protocolFor(c), error: '' }
    } catch (err) {
      return {
        protocol: null,
        error: err instanceof Error ? err.message : 'Invalid saved protocol',
      }
    }
  })()
  const p = parsed.protocol
  const record = backtestCases.find((item) => item.id === c.attempt.caseId)
  const editable = c.phase === 'draft' && p?.stage === 'draft_protocol'
  const analytic = backtestModel(c.inputs)
  const result =
    c.result?.ok && c.result.value.kind === 'evaluation' ? c.result.value : null
  const action = (fn: () => void | Promise<void>) => {
    setError('')
    try {
      const r = fn()
      if (r)
        void r.catch((err) =>
          setError(
            err instanceof Error ? err.message : 'Research operation failed',
          ),
        )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research operation failed')
    }
  }
  const change = (next: BacktestInputs) =>
    action(() => linkedExperiment(c, next))
  return (
    <section className="qp-backtest-lab">
      <h1>Backtest selection and held-out evaluation</h1>
      <p>
        <strong>Role:</strong> Research reviewer. <strong>Objective:</strong>{' '}
        Separate an impressive selected development result from defensible
        independent evidence. Every synthetic candidate has true gross edge
        zero; success is reasoning, not sampled profit.
      </p>
      <p>
        Protocol stage:{' '}
        <strong>{p?.stage ?? 'unsupported saved protocol'}</strong>. Seed:{' '}
        {c.attempt.seed}; model {c.attempt.modelVersion}; generator{' '}
        {c.attempt.generatorVersion}.
      </p>
      <p>
        No poker cards, future deck, market feeds or game state enter this
        experiment. Local hashes and seeded workers support replay, not secrecy
        or tamper-proof research.
      </p>
      <p>
        Evidence mode:{' '}
        {c.mode === 'explore'
          ? 'exploration; no mastery credit'
          : c.attempt.mode}
        .{' '}
        {c.attempt.assistance.hintIds.length ||
        hintCount ||
        c.attempt.assistance.solutionViewed
          ? 'Assisted/revealed work is practice, not unaided demonstration.'
          : 'No assistance recorded for this attempt.'}
      </p>
      {record && c.mode === 'assess' ? (
        <section>
          <h2>{record.title}</h2>
          <p>
            {record.role}: {record.objective}
          </p>
          <ul>
            {record.information.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p>Cash flows: {record.cashFlows}</p>
          <p>Assumptions: {record.assumptions.join(' ')}</p>
          <p>
            The simulation below is a separate synthetic null demonstration.
            Structured finance answers use this case’s supplied terms, not the
            current simulation controls or sampled profit.
          </p>
        </section>
      ) : null}
      <fieldset disabled={!editable}>
        <legend>Public protocol controls (fixed after registration)</legend>
        <NumericControl
          name="candidateCount"
          label="Candidate policies"
          units="candidates"
          min={1}
          max={200}
          step={1}
          value={c.inputs.candidateCount}
          onChange={(candidateCount) => change({ ...c.inputs, candidateCount })}
        />
        <NumericControl
          name="developmentTrials"
          label="Development observations per candidate"
          units="observations"
          min={20}
          max={2000}
          step={1}
          value={c.inputs.developmentTrials}
          onChange={(developmentTrials) =>
            change({ ...c.inputs, developmentTrials })
          }
        />
        <NumericControl
          name="holdoutTrials"
          label="Held-out observations"
          units="observations"
          min={100}
          max={5000}
          step={1}
          value={c.inputs.holdoutTrials}
          onChange={(holdoutTrials) => change({ ...c.inputs, holdoutTrials })}
        />
        <NumericControl
          name="cost"
          label="Cost per observation"
          units="outcome units"
          min={0}
          max={0.1}
          step="any"
          value={c.inputs.cost}
          onChange={(cost) => change({ ...c.inputs, cost })}
        />
        <label>
          Preregistered hypothesis (ungraded)
          <textarea
            maxLength={2000}
            value={editable ? hypothesis : (p?.hypothesis ?? '')}
            onChange={(e) => setHypothesis(e.target.value)}
          />
        </label>
        <label>
          Falsification condition (ungraded)
          <textarea
            maxLength={2000}
            value={editable ? falsification : (p?.falsification ?? '')}
            onChange={(e) => setFalsification(e.target.value)}
          />
        </label>
      </fieldset>
      <p>
        Fixed selection metric: maximum development net mean; ties use ascending
        stable candidate ID. Holdout selects nothing.
      </p>
      {editable ? (
        <PredictionForm
          key={c.attempt.id}
          actions={[
            'Freeze and evaluate one selected candidate',
            'Decline the edge claim',
          ]}
          question="Before any sampled results, predict the held-out net mean (outcome units per observation) and explain why it may differ from the selected development mean. Committing also registers the hypothesis and falsification condition above."
          onCommit={(prediction) =>
            action(() => preregister(c, hypothesis, falsification, prediction))
          }
        />
      ) : null}
      {c.attempt.prediction ? (
        <p>
          Immutable prediction: {c.attempt.prediction.actionId}; estimate{' '}
          {c.attempt.prediction.numericEstimate ?? 'not supplied'}; rationale:{' '}
          {c.attempt.prediction.rationale}
        </p>
      ) : null}
      <button
        disabled={
          c.phase !== 'prediction_committed' ||
          !p ||
          ![
            'preregistered',
            'development_complete',
            'candidate_frozen',
          ].includes(p.stage)
        }
        onClick={() => action(() => runResearch(c))}
      >
        {p?.stage === 'preregistered'
          ? 'Run development search'
          : 'Resume preserved research'}
      </button>
      <button disabled={c.phase !== 'running'} onClick={() => c.cancel()}>
        Cancel research
      </button>
      <p role="status" aria-live="polite">
        {c.status}{' '}
        {c.phase === 'running'
          ? p?.stage === 'development_complete'
            ? 'Development complete. Waiting for candidate freeze and your holdout reveal.'
            : p?.stage === 'candidate_frozen' && !p.revealRequested
              ? 'Candidate frozen. Held-out data remain untouched.'
              : `Worker running: ${Math.round((c.progress ?? 0) * 100)}%.`
          : ''}
      </p>
      {parsed.error || error ? (
        <p role="alert">{parsed.error || error}</p>
      ) : null}
      {p?.development ? (
        <>
          <DataTable
            caption="Complete development leaderboard"
            summary="All searched candidate policies; development scores are selection-biased. Costs are paid for every observation. No held-out observations have informed selection."
            columns={[
              'Stable candidate ID',
              'Wins',
              'Observations',
              'Gross mean (units/observation)',
              'Net mean (units/observation)',
              'Selection',
            ]}
            rows={p.development.leaderboard.map((r) => [
              r.candidateId,
              r.wins,
              r.trials,
              fmt(r.grossMean),
              fmt(r.netMean),
              r.candidateId === p.development!.selectedId
                ? 'Selected by fixed rule'
                : 'Retained search',
            ])}
          />
          <p>
            Candidate searches this experiment: {p.development.totalSearchCount}
            . Cumulative searched candidates: {p.history.totalSearches};
            completed development searches: {p.history.experimentCount}.
            Development role hash: {p.development.developmentHash}.
          </p>
          <button
            disabled={p.stage !== 'development_complete'}
            onClick={() => action(() => freezeCandidate(c))}
          >
            Freeze selected candidate and full protocol
          </button>
        </>
      ) : null}
      {p?.frozenHash ? (
        <p>
          Frozen candidate: {p.development?.selectedId}. Protocol hash:{' '}
          {p.frozenHash}. Primary held-out dataset:{' '}
          {p.revealRequested
            ? 'consumed (cancel/resume is the same evaluation, not fresh evidence)'
            : 'untouched'}
          . Historical consumed tests: {p.history.consumedDatasets.length}.
        </p>
      ) : null}
      <button
        disabled={
          p?.stage !== 'candidate_frozen' ||
          p.revealRequested ||
          c.phase !== 'running'
        }
        onClick={() => action(() => requestHoldout(c))}
      >
        Reveal primary held-out evaluation
      </button>
      {result ? (
        <>
          <DataTable
            caption="Primary held-out evaluation"
            summary="Realized outcomes of the single frozen policy, not selected again; 95% Wilson uncertainty assumes iid Bernoulli observations. Analytic expectations are distinct from this realization."
            columns={['Quantity', 'Value']}
            rows={[
              ['Frozen candidate', result.holdout.candidateId],
              ['Held-out wins', result.holdout.wins],
              ['Held-out observations', result.holdout.trials],
              ['Gross mean (units/observation)', fmt(result.holdout.grossMean)],
              [
                'Net mean after every cost (units/observation)',
                fmt(result.holdout.netMean),
              ],
              ['Win proportion', fmt(result.holdout.winProportion)],
              [
                '95% Wilson win-proportion interval',
                `${fmt(result.holdout.probabilityInterval.low)} to ${fmt(result.holdout.probabilityInterval.high)}`,
              ],
              [
                'Transformed 95% net-mean interval (units/observation)',
                `${fmt(result.holdout.netMeanInterval.low)} to ${fmt(result.holdout.netMeanInterval.high)}`,
              ],
              ['Analytic expected gross edge', result.expectedGrossMean],
              ['Analytic expected net edge', fmt(result.expectedNetMean)],
              ['Held-out role hash', result.holdout.holdoutHash],
              ['Dataset identity', result.holdout.datasetKey],
            ]}
          />
          <p>
            Further tuning after this reveal is a new linked experiment. This
            test is consumed; its negative or positive result is retained. Never
            call its reuse an untouched test.
          </p>
        </>
      ) : null}
      {analytic.ok ? (
        <p>
          Analytic null expectation: gross edge 0; net edge{' '}
          {fmt(analytic.value.expectedNetMean)} outcome units per observation.
          These are model expectations, not realized results.
        </p>
      ) : null}
      {analytic.ok ? (
        <p>
          Analytic independent-null illustration: 1 − (1 − 0.05)^
          {c.inputs.candidateCount} ={' '}
          {fmt(analytic.value.independentFalsePositive)}. This is the
          probability of at least one false positive among independent
          exact-size null tests. It is not the raw simulator’s significance
          level, a universal backtest correction, or PBO.
        </p>
      ) : null}
      {result && ['results_ready', 'reflected'].includes(c.phase) ? (
        <label>
          Research reflection (ungraded, up to 2,000 characters)
          <textarea
            maxLength={2000}
            value={c.attempt.reflection ?? ''}
            onChange={(e) =>
              action(() => saveResearchReflection(c, e.target.value))
            }
          />
        </label>
      ) : null}
      <button
        disabled={c.phase === 'draft' || c.phase === 'running' || !p}
        onClick={() => change({ ...c.inputs })}
      >
        Start a linked new experiment (retain research history)
      </button>
      <button
        disabled={hintCount >= 4 || !c.attempt.prediction}
        onClick={() => {
          const next = hintCount + 1
          evidence.exposeHint(c.attempt.id, `backtest-protocol-hint-${next}`)
          setHintCount(next)
        }}
      >
        Reveal protocol hint {Math.min(4, hintCount + 1)} (assisted)
      </button>
      {protocolHints.slice(0, hintCount).map((h) => (
        <p key={h}>{h}</p>
      ))}
      {result && record && c.mode === 'assess' ? (
        <ResearchAssessment
          key={c.attempt.id}
          caseRecord={record}
          controller={c}
          evidence={evidence}
        />
      ) : null}
      <h2>Assumptions and limitations</h2>
      <ul>
        {[...backtestManifest.assumptions, ...backtestManifest.limitations].map(
          (s) => (
            <li key={s}>{s}</li>
          ),
        )}
      </ul>
      <p>
        This component supplies the F10 research-credibility bank, not the
        entire independent finance assessment. F10 also requires information,
        solvency and the independent foundation bank.
      </p>
      <h2>Source and original model</h2>
      {backtestManifest.sources.map((source) => (
        <p key={source.id}>
          <a href={source.url}>{source.title}</a>.{' '}
          {source.references
            .map((r) => `${r.claim} (${r.locator}; ${r.verification}).`)
            .join(' ')}{' '}
          {source.originalExamples}
        </p>
      ))}
    </section>
  )
}
