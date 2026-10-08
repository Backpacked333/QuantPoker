import { useState } from 'react'
import type {
  Answer,
  CaseRecord,
  EvidenceCallbacks,
  ExperimentController,
  Question,
} from '../../core/types'
import type { BacktestInputs, BacktestOutput } from './model'

function QuestionField({
  q,
  value,
  onChange,
  disabled,
}: {
  q: Question
  value: Answer | undefined
  onChange: (answer: Answer | undefined) => void
  disabled: boolean
}) {
  if (q.kind === 'numeric')
    return (
      <label>
        {q.prompt} ({q.units}; tolerance ±{q.tolerance})
        <input
          type="number"
          step="any"
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value.trim() && Number.isFinite(Number(e.target.value))
                ? Number(e.target.value)
                : undefined,
            )
          }
        />
      </label>
    )
  if (q.kind === 'choice')
    return (
      <label>
        {q.prompt}
        <select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose</option>
          {q.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  const entries =
    q.kind === 'ordering'
      ? q.options.map((_, i) => ({ id: String(i), label: `Position ${i + 1}` }))
      : q.entries
  const options = q.kind === 'ordering' ? q.options : q.categories
  return (
    <fieldset disabled={disabled}>
      <legend>{q.prompt}</legend>
      {entries.map((entry, i) => (
        <label key={entry.id}>
          {entry.label}
          <select
            value={Array.isArray(value) ? (value[i] ?? '') : ''}
            onChange={(e) => {
              const next = Array.isArray(value)
                ? [...value]
                : entries.map(() => '')
              next[i] = e.target.value
              onChange(next)
            }}
          >
            <option value="">Choose</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  )
}
export function ResearchAssessment({
  caseRecord: c,
  controller,
  evidence,
}: {
  caseRecord: CaseRecord
  controller: ExperimentController<BacktestInputs, BacktestOutput>
  evidence: EvidenceCallbacks
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [hints, setHints] = useState<Record<string, number>>({})
  const [solution, setSolution] = useState(false)
  const [error, setError] = useState('')
  const submitted = !!controller.attempt.evaluation
  return (
    <section>
      <h2>Structured finance transfer: {c.title}</h2>
      <p>
        Simulation profit does not enter this rubric. All four reasoning
        components and critical protocol/ledger items matter; assistance
        prevents unaided demonstration.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          try {
            controller.submitAssessment(c, answers)
            setError('')
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Submission failed')
          }
        }}
      >
        {c.questions.map((q) => (
          <div key={q.id}>
            <QuestionField
              q={q}
              value={answers[q.id]}
              disabled={submitted}
              onChange={(value) => {
                const next = { ...answers }
                if (value === undefined) delete next[q.id]
                else next[q.id] = value
                setAnswers(next)
              }}
            />
            {!submitted && (hints[q.id] ?? 0) < 4 ? (
              <button
                type="button"
                onClick={() => {
                  const next = (hints[q.id] ?? 0) + 1
                  evidence.exposeHint(
                    controller.attempt.id,
                    `${c.id}:${q.id}:${next}`,
                  )
                  setHints({ ...hints, [q.id]: next })
                }}
              >
                Reveal hint {Math.min(4, (hints[q.id] ?? 0) + 1)}: {q.id}
              </button>
            ) : null}
            {q.hints.slice(0, hints[q.id] ?? 0).map((h, i) => (
              <p key={i}>
                Hint {i + 1}: {h}
              </p>
            ))}
          </div>
        ))}
        <button disabled={submitted}>Submit structured reasoning</button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      <button
        disabled={solution}
        onClick={() => {
          evidence.exposeSolution(controller.attempt.id)
          setSolution(true)
        }}
      >
        Reveal worked finance solution (assisted)
      </button>
      {solution ? (
        <ol>
          {c.workedSolution.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
      {controller.attempt.evaluation ? (
        <p role="status">
          Evidence: {controller.attempt.evaluation.earned}/
          {controller.attempt.evaluation.max};{' '}
          {controller.attempt.evaluation.eligible
            ? 'eligible unaided evidence'
            : 'practice/assisted or not yet eligible'}
          . {controller.attempt.evaluation.reasons.join(' ')}
        </p>
      ) : null}
    </section>
  )
}
