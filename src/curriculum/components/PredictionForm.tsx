import { useId, useState } from 'react'
import type { Prediction } from '../core/types'
import { decodePrediction } from '../core/validation'
export interface PredictionFormProps {
  question: string
  actions: readonly string[]
  initial?: Prediction
  onCommit: (prediction: Prediction) => void
  onDraft?: (prediction: Prediction) => void
}
export function PredictionForm({
  question,
  actions,
  initial,
  onCommit,
  onDraft,
}: PredictionFormProps) {
  const id = useId()
  const [prediction, setPrediction] = useState<Prediction>(
    initial ?? {
      actionId: actions[0] ?? 'not-sure',
      direction: 'not-sure',
      confidencePercent: null,
      rationale: '',
    },
  )
  const [estimate, setEstimate] = useState(
    initial?.numericEstimate === undefined
      ? ''
      : String(initial.numericEstimate),
  )
  const [confidence, setConfidence] = useState(
    initial?.confidencePercent === null ||
      initial?.confidencePercent === undefined
      ? ''
      : String(initial.confidencePercent),
  )
  const [error, setError] = useState('')
  const update = (next: Prediction) => {
    setPrediction(next)
    onDraft?.(next)
  }
  return (
    <form
      className="qp-prediction"
      onSubmit={(e) => {
        e.preventDefault()
        if (
          (estimate !== '' && !Number.isFinite(Number(estimate))) ||
          (confidence !== '' &&
            (!Number.isFinite(Number(confidence)) ||
              Number(confidence) < 0 ||
              Number(confidence) > 100))
        ) {
          setError(
            'Use a finite estimate and confidence from0–100, or leave confidence blank for not sure.',
          )
          return
        }
        const next = {
          ...prediction,
          ...(estimate.trim() ? { numericEstimate: Number(estimate) } : {}),
          confidencePercent: confidence.trim() ? Number(confidence) : null,
        }
        const decoded = decodePrediction(next)
        if (!decoded.ok || !next.rationale.trim()) {
          setError(
            'Add a prediction rationale (ungraded), finite estimate if supplied, and valid confidence.',
          )
          return
        }
        onCommit(next)
        setError('')
      }}
    >
      <h3>Commit a pre-outcome prediction</h3>
      <p>{question}</p>
      <label htmlFor={`${id}-action`}>Predicted action</label>
      <select
        id={`${id}-action`}
        value={prediction.actionId}
        onChange={(e) => update({ ...prediction, actionId: e.target.value })}
      >
        {actions.map((a) => (
          <option key={a}>{a}</option>
        ))}
        <option value="not-sure">Not sure</option>
      </select>
      <label htmlFor={`${id}-direction`}>Predicted direction</label>
      <select
        id={`${id}-direction`}
        value={prediction.direction}
        onChange={(e) =>
          update({
            ...prediction,
            direction: e.target.value as Prediction['direction'],
          })
        }
      >
        <option value="not-sure">Not sure</option>
        <option value="increase">Increase</option>
        <option value="decrease">Decrease</option>
        <option value="unchanged">Unchanged</option>
      </select>
      <label htmlFor={`${id}-estimate`}>
        Numeric estimate (in the case’s stated units; optional)
      </label>
      <input
        id={`${id}-estimate`}
        type="number"
        step="any"
        value={estimate}
        onChange={(e) => {
          setEstimate(e.target.value)
          if (e.target.value.trim() && Number.isFinite(Number(e.target.value)))
            update({ ...prediction, numericEstimate: Number(e.target.value) })
        }}
      />
      <label htmlFor={`${id}-confidence`}>
        Confidence (percent,0–100; blank means not sure)
      </label>
      <input
        id={`${id}-confidence`}
        type="number"
        min={0}
        max={100}
        step="any"
        value={confidence}
        onChange={(e) => {
          setConfidence(e.target.value)
          const n = e.target.value.trim() ? Number(e.target.value) : null
          if (n === null || (Number.isFinite(n) && n >= 0 && n <= 100))
            update({ ...prediction, confidencePercent: n })
        }}
      />
      <label htmlFor={`${id}-rationale`}>
        Prediction rationale (ungraded, up to2,000 characters)
      </label>
      <textarea
        id={`${id}-rationale`}
        value={prediction.rationale}
        maxLength={2000}
        onChange={(e) => update({ ...prediction, rationale: e.target.value })}
      />
      {error ? <p role="alert">{error}</p> : null}
      <button className="button" type="submit">
        Commit prediction
      </button>
      <p>
        Committed inputs and prediction cannot be edited after reveal.
        Confidence and prose are not automatically graded.
      </p>
    </form>
  )
}
