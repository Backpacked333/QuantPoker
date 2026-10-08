import { Gauge, Layers3, Sparkles, TimerReset, Waves } from 'lucide-react'
import type { DecisionAction } from '../../lib/finance'
import type { NextScenario } from '../../lib/model'
import type { RangeStep } from '../../lib/range'
import { pct, pct0, signed } from '../format'
import { MiniCard } from '../PlayingCard'
import type { LabModel } from './labModel'

export function EquityMeter({ lab, guess }: { lab: LabModel; guess?: number }) {
  const equity = lab.outcome.equity
  const need = lab.action === 'raise' ? lab.breakEven : lab.callBreakEven
  const good = equity >= need
  return (
    <div className="meter">
      <div className="meter-head">
        <div>
          <span className="label">Your equity</span>
          <strong className={good ? 'positive' : 'negative'}>
            {lab.ready ? pct(equity) : '…'}
          </strong>
        </div>
        <div className="meter-need">
          <span className="label">
            {lab.action === 'raise' ? 'Raise needs' : 'Price needs'}
          </span>
          <strong>{need ? pct(need) : 'nothing'}</strong>
        </div>
      </div>
      <div className="meter-track" aria-hidden>
        <span
          className={`meter-fill ${good ? 'good' : 'bad'}`}
          style={{ width: `${equity * 100}%` }}
        />
        {need > 0 && (
          <span
            className="meter-need-mark"
            style={{ left: `${need * 100}%` }}
          />
        )}
        {guess !== undefined && (
          <span className="meter-guess" style={{ left: `${guess * 100}%` }} />
        )}
        {lab.anyHand && (
          <span
            className="meter-any"
            style={{ left: `${lab.anyHand.equity * 100}%` }}
          />
        )}
      </div>
      <div className="meter-keys">
        {need > 0 && (
          <span>
            <i className="key-need" /> break-even
          </span>
        )}
        {guess !== undefined && (
          <span>
            <i className="key-guess" /> your read {pct0(guess)}
          </span>
        )}
        {lab.anyHand && (
          <span>
            <i className="key-any" /> vs any hand {pct0(lab.anyHand.equity)}
          </span>
        )}
      </div>
    </div>
  )
}

export function OutcomeBar({ lab }: { lab: LabModel }) {
  const o = lab.outcome
  return (
    <div className="outcomes">
      <div className="outcome-bar" aria-hidden>
        <span className="win" style={{ width: `${o.win * 100}%` }} />
        <span className="tie" style={{ width: `${o.tie * 100}%` }} />
        <span className="loss" style={{ width: `${o.loss * 100}%` }} />
      </div>
      <div className="outcome-keys">
        <span>
          <i className="win" /> Win {pct(o.win)}
        </span>
        <span>
          <i className="tie" /> Tie {pct(o.tie)}
        </span>
        <span>
          <i className="loss" /> Lose {pct(o.loss)}
        </span>
      </div>
    </div>
  )
}

export function Verdict({ lab }: { lab: LabModel }) {
  if (!lab.ready) return null
  const best = lab.best
  const selected = lab.action
  const label = (a: DecisionAction) =>
    a === 'fold'
      ? 'folding'
      : a === 'continue'
        ? lab.call
          ? `calling ${lab.call}`
          : 'checking'
        : `${lab.context.atlasBet || lab.context.heroBet ? 'raising to' : 'betting'} ${lab.raiseTo}`
  const gap = lab.ev[best] - lab.ev[selected]
  return (
    <p className="verdict">
      {selected === best ? (
        <>
          <b>{label(selected)[0].toUpperCase() + label(selected).slice(1)}</b>{' '}
          is the model&apos;s best option here, worth{' '}
          <b className={lab.selectedEV >= 0 ? 'positive' : 'negative'}>
            {signed(lab.selectedEV)} chips
          </b>{' '}
          on average.
        </>
      ) : (
        <>
          <b>{label(best)[0].toUpperCase() + label(best).slice(1)}</b> beats{' '}
          {label(selected)} by <b>{gap.toFixed(1)} chips</b> on average.
        </>
      )}
    </p>
  )
}

export function ActionCompare({
  lab,
  onSelect,
  onFoldOverride,
  showOverride,
}: {
  lab: LabModel
  onSelect: (a: DecisionAction) => void
  onFoldOverride: (value: number | null) => void
  showOverride: boolean
}) {
  const rows: { key: DecisionAction; label: string; sub: string }[] = [
    {
      key: 'fold',
      label: 'Fold',
      sub: lab.call
        ? 'Give up the pot, risk nothing more'
        : 'Never needed when checking is free',
    },
    {
      key: 'continue',
      label: lab.call ? `Call ${lab.call}` : 'Check',
      sub: lab.call
        ? `Needs ${pct0(lab.callBreakEven)} equity`
        : 'Free look at the next card',
    },
  ]
  if (lab.canRaise)
    rows.push({
      key: 'raise',
      label: `${lab.context.atlasBet || lab.context.heroBet ? 'Raise to' : 'Bet'} ${lab.raiseTo}`,
      sub: `Atlas folds ~${pct0(lab.foldProbability)}${lab.foldProbability !== lab.modelFold ? ' (your assumption)' : ''}`,
    })
  const scale = Math.max(
    1,
    ...rows.map((r) =>
      Math.abs(Number.isFinite(lab.ev[r.key]) ? lab.ev[r.key] : 0),
    ),
  )
  return (
    <div className="compare" role="radiogroup" aria-label="Compare actions">
      {rows.map((row) => {
        const ev = lab.ev[row.key]
        const width = (Math.abs(ev) / scale) * 50
        return (
          <button
            key={row.key}
            role="radio"
            aria-checked={lab.action === row.key}
            className={`compare-row ${lab.action === row.key ? 'on' : ''}`}
            onClick={() => onSelect(row.key)}
          >
            <span className="compare-name">
              <strong>
                {row.label}
                {lab.ready && lab.best === row.key && (
                  <em className="best-tag">Best</em>
                )}
              </strong>
              <small>{row.sub}</small>
            </span>
            <span className="compare-bar" aria-hidden>
              <span className="zero" />
              {lab.ready && (
                <span
                  className={`bar ${ev >= 0 ? 'pos' : 'neg'}`}
                  style={
                    ev >= 0
                      ? { left: '50%', width: `${width}%` }
                      : { right: '50%', width: `${width}%` }
                  }
                />
              )}
            </span>
            <span className={`compare-ev ${ev >= 0 ? 'positive' : 'negative'}`}>
              {lab.ready ? signed(ev) : '…'}
            </span>
          </button>
        )
      })}
      {showOverride && lab.action === 'raise' && (
        <div className="override">
          <label htmlFor="fold-override">
            Chance Atlas folds <strong>{pct0(lab.foldProbability)}</strong>
            {lab.foldProbability !== lab.modelFold && (
              <button className="link-btn" onClick={() => onFoldOverride(null)}>
                Reset to Atlas model ({pct0(lab.modelFold)})
              </button>
            )}
          </label>
          <input
            id="fold-override"
            type="range"
            min="0"
            max="0.9"
            step="0.01"
            value={lab.foldProbability}
            onChange={(e) => onFoldOverride(Number(e.target.value))}
          />
          <small>
            Default comes from Atlas&apos;s published strategy applied to its
            likely hands. Moving it makes the number your assumption.
          </small>
        </div>
      )}
    </div>
  )
}

export function RangeShift({ steps }: { steps: RangeStep[] }) {
  if (steps.length < 2) return null
  const first = steps[0].buckets[0],
    last = steps[steps.length - 1].buckets[0]
  return (
    <div className="range-shift">
      <p>
        Atlas&apos;s actions are evidence. Its strong hands went from{' '}
        <b>{pct0(first)}</b> to <b>{pct0(last)}</b> of its likely range.
      </p>
      {steps.map((step, i) => (
        <div className="shift-row" key={i}>
          <span>{step.label}</span>
          <span
            className="shift-bar"
            role="img"
            aria-label={`${pct0(step.buckets[0])} strong, ${pct0(step.buckets[1])} medium, ${pct0(step.buckets[2])} weak`}
          >
            <i className="s" style={{ width: `${step.buckets[0] * 100}%` }} />
            <i className="m" style={{ width: `${step.buckets[1] * 100}%` }} />
            <i className="w" style={{ width: `${step.buckets[2] * 100}%` }} />
          </span>
        </div>
      ))}
      <div className="outcome-keys">
        <span>
          <i className="s" /> strong
        </span>
        <span>
          <i className="m" /> medium
        </span>
        <span>
          <i className="w" /> weak / drawing
        </span>
      </div>
    </div>
  )
}

export function NextCards({
  lab,
  selected,
  onSelect,
}: {
  lab: LabModel
  selected: NextScenario | null
  onSelect: (s: NextScenario | null) => void
}) {
  const next = lab.next
  if (!next?.all.length) return null
  const row = (label: string, list: NextScenario[]) => (
    <div className="next-row">
      <span>{label}</span>
      {list.map((item) => {
        const on =
          selected?.card.rank === item.card.rank &&
          selected.card.suit === item.card.suit
        return (
          <button
            key={`${item.card.rank}${item.card.suit}`}
            className={on ? 'on' : ''}
            onClick={() => onSelect(on ? null : item)}
            aria-pressed={on}
          >
            <MiniCard card={item.card} /> <em>{pct0(item.equity)}</em>
          </button>
        )
      })}
    </div>
  )
  return (
    <div className="next-cards">
      <div className="section-head">
        <span className="label">Next card what-ifs</span>
        <small>Pick a card to reprice the whole lab</small>
      </div>
      {row('Best', next.best)}
      {row('Worst', next.worst)}
    </div>
  )
}

export function QuantGrid({ lab }: { lab: LabModel }) {
  const vol = lab.next?.volatility
  return (
    <div className="quant-grid">
      <div>
        <Gauge size={15} />
        <span>
          Price of 1% equity<small>EV sensitivity</small>
        </span>
        <strong>{lab.deltaPerPoint.toFixed(1)} chips</strong>
      </div>
      <div>
        <Waves size={15} />
        <span>
          Next-card swing<small>spread of equity</small>
        </span>
        <strong>
          {vol == null
            ? lab.cardsToCome
              ? 'after flop'
              : 'settled'
            : pct(vol)}
        </strong>
      </div>
      <div>
        <TimerReset size={15} />
        <span>
          Information clock<small>public cards left</small>
        </span>
        <strong>{lab.cardsToCome}</strong>
      </div>
      <div>
        <Layers3 size={15} />
        <span>
          Stack at risk<small>position sizing</small>
        </span>
        <strong>{lab.exposure ? pct(lab.bankrollExposure) : 'none'}</strong>
      </div>
    </div>
  )
}

export function WhatIfBanner({
  scenario,
  onClear,
}: {
  scenario: NextScenario
  onClear: () => void
}) {
  return (
    <div className="what-if">
      <span>
        <Sparkles size={14} /> What if <MiniCard card={scenario.card} /> comes
        next? <strong>{pct(scenario.equity)}</strong> equity
      </span>
      <button className="link-btn" onClick={onClear}>
        Back to the live hand
      </button>
    </div>
  )
}
