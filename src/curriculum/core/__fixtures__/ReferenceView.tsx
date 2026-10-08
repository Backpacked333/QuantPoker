import type { ExperienceViewProps } from '../types'
import {
  referenceCase,
  type ReferenceInputs,
  type ReferenceOutput,
} from './reference'
import { useState } from 'react'
import type { Answer } from '../types'
import { NumericControl } from '../../components/NumericControl'
import { PredictionForm } from '../../components/PredictionForm'
import { DataTable } from '../../components/DataTable'
export default function ReferenceView({
  controller,
}: ExperienceViewProps<ReferenceInputs, ReferenceOutput>) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  return (
    <section>
      <h1>Runnable contract reference</h1>
      <NumericControl
        name="callCost"
        label="Call cost"
        units="currency units"
        min={0}
        max={10000}
        step={1}
        value={controller.inputs.callCost}
        onChange={(callCost) =>
          controller.requestInputChange({ ...controller.inputs, callCost })
        }
      />
      {controller.mode === 'assess' && controller.phase === 'draft' ? (
        <PredictionForm
          actions={['Call', 'Fold']}
          question="Predict EV before the result."
          onCommit={(p) => controller.commitPrediction(p)}
        />
      ) : null}
      <button
        onClick={() => void controller.run()}
        disabled={
          !['draft', 'prediction_committed'].includes(controller.phase) ||
          (controller.mode === 'assess' && controller.phase === 'draft')
        }
      >
        Run reference
      </button>
      <button onClick={() => controller.cancel()}>Cancel reference</button>
      <p role="status">{controller.status}</p>
      {controller.result?.ok ? (
        <DataTable
          caption="Reference exact values"
          summary="Modeled expectation, not realized winnings or assessment correctness."
          columns={['Quantity', 'Value']}
          rows={[
            ['Expected profit', controller.result.value.expectedProfit],
            [
              'Break-even probability',
              controller.result.value.breakEvenProbability,
            ],
          ]}
        />
      ) : null}
      {['results_ready', 'reflected'].includes(controller.phase) ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            controller.submitAssessment(referenceCase, answers)
          }}
        >
          <label>
            Reference reflection (ungraded)
            <textarea
              value={controller.attempt.reflection ?? ''}
              onChange={(e) => controller.reflect(e.target.value)}
            />
          </label>
          {referenceCase.questions.map((q) =>
            q.kind === 'numeric' ? (
              <label key={q.id}>
                {q.prompt} ({q.units})
                <input
                  type="number"
                  step="any"
                  value={answers[q.id] ?? ''}
                  onChange={(e) => {
                    const next = { ...answers }
                    if (
                      e.target.value.trim() &&
                      Number.isFinite(Number(e.target.value))
                    )
                      next[q.id] = Number(e.target.value)
                    else delete next[q.id]
                    setAnswers(next)
                  }}
                />
              </label>
            ) : q.kind === 'choice' ? (
              <label key={q.id}>
                {q.prompt}
                <select
                  value={answers[q.id] ?? ''}
                  onChange={(e) =>
                    setAnswers({ ...answers, [q.id]: e.target.value })
                  }
                >
                  <option value="">Choose</option>
                  {q.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null,
          )}
          <button>Submit reference assessment</button>
        </form>
      ) : null}
      {controller.attempt.evaluation ? (
        <p>
          Reference evidence: {controller.attempt.evaluation.earned}/
          {controller.attempt.evaluation.max};{' '}
          {controller.attempt.evaluation.eligible
            ? 'eligible'
            : 'practice only'}
          .
        </p>
      ) : null}
    </section>
  )
}
