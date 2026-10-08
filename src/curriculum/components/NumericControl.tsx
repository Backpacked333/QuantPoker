import { useId, useState } from 'react'
import type { FieldError } from '../core/types'

export interface NumericControlProps {
  name: string
  label: string
  units: string
  value: number
  min: number
  max: number
  step?: number | 'any'
  onChange: (value: number) => void
  errors?: readonly FieldError[]
  slider?: boolean
  disabled?: boolean
}
export function NumericControl({
  name,
  label,
  units,
  value,
  min,
  max,
  step = 'any',
  onChange,
  errors = [],
  slider = true,
  disabled = false,
}: NumericControlProps) {
  const id = useId()
  const [draft, setDraft] = useState({ source: value, text: String(value) })
  const shown = draft.source === value ? draft.text : String(value)
  const parsed = shown.trim() ? Number(shown) : NaN
  const local = !Number.isFinite(parsed)
    ? 'Enter a finite number.'
    : parsed < min || parsed > max
      ? `Use a value from ${min} to ${max} ${units}.`
      : typeof step === 'number' &&
          Math.abs((parsed - min) / step - Math.round((parsed - min) / step)) >
            1e-8
        ? `Use increments of ${step} ${units}.`
        : ''
  const error =
    local ||
    errors
      .filter((e) => e.field === name)
      .map((e) => e.message)
      .join(' ')
  const hintId = `${id}-limits`,
    errorId = `${id}-error`
  function change(text: string) {
    setDraft({ source: value, text })
    const next = text.trim() ? Number(text) : NaN
    if (
      Number.isFinite(next) &&
      next >= min &&
      next <= max &&
      (step === 'any' ||
        Math.abs((next - min) / step - Math.round((next - min) / step)) <= 1e-8)
    ) {
      onChange(next)
      setDraft({ source: next, text })
    }
  }
  return (
    <div className="qp-numeric">
      <label htmlFor={id}>
        {label} <span>({units})</span>
      </label>
      <input
        id={id}
        name={name}
        type="number"
        value={shown}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
        onChange={(e) => change(e.target.value)}
      />
      {slider ? (
        <>
          <label className="sr-only" htmlFor={`${id}-range`}>
            {label} slider ({units})
          </label>
          <input
            id={`${id}-range`}
            type="range"
            min={min}
            max={max}
            step={step === 'any' ? (max - min) / 1000 : step}
            value={value}
            disabled={disabled}
            aria-describedby={hintId}
            onChange={(e) => change(e.target.value)}
          />
        </>
      ) : null}
      <small id={hintId}>
        {min}–{max} {units}
        {typeof step === 'number' ? `; increment ${step}` : ''}
      </small>
      {error ? (
        <p id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
