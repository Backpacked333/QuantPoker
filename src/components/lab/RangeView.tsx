import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { rangeGrid } from '../../lib/model'
import type { OpponentModel } from '../../lib/model'
import type { FullSpot } from '../../lib/range'
import { pct } from '../format'
import { RangeShift } from './DecisionView'
import { Term } from '../Term'

export function RangeView({
  spot,
  model,
}: {
  spot: FullSpot | null
  model: OpponentModel
}) {
  const grid = useMemo(
    () => (spot ? rangeGrid(spot, model) : null),
    [spot, model],
  )
  const [focus, setFocus] = useState<number | null>(null)
  if (!spot || !grid)
    return <div className="lab-loading">Reading Atlas&apos;s actions…</div>
  const focused = focus === null ? null : grid[focus]
  return (
    <div className="range-view">
      <p className="lab-copy">
        {model === 'range' ? (
          'Each cell is a starting hand. Darker cells are hands Atlas is more likely to hold, given everything it has done this hand and its published strategy. Its actual cards are never used.'
        ) : (
          <>
            Under the “any hand” model, every unseen starting hand is equally
            likely. Switch to Atlas’s <Term k="range">range</Term> to see how
            its actions reshape this.
          </>
        )}
      </p>
      <div
        className="range-grid"
        role="group"
        aria-label="Atlas's likely starting hands"
        onMouseLeave={() => setFocus(null)}
      >
        {grid.map((cell, i) => (
          <button
            key={cell.label}
            className={`range-cell ${cell.possible ? '' : 'impossible'} ${i % 14 === 0 ? 'pair' : ''}`}
            style={{ '--w': cell.likelihood.toFixed(3) } as CSSProperties}
            onMouseEnter={() => setFocus(i)}
            onFocus={() => setFocus(i)}
            aria-label={`${cell.label}: ${pct(cell.share)} of range`}
          >
            {cell.label}
          </button>
        ))}
      </div>
      <div className="range-focus" aria-live="polite">
        {focused ? (
          <>
            <strong>{focused.label}</strong>
            <span>
              {focused.possible
                ? `${pct(focused.share)} of Atlas’s likely range · relative likelihood ${Math.round(focused.likelihood * 100)}`
                : 'Impossible: these cards are visible to you'}
            </span>
          </>
        ) : (
          <span>
            Point at a cell to read it. Suited hands sit above the diagonal of
            pairs.
          </span>
        )}
      </div>
      <RangeShift steps={spot.steps} />
    </div>
  )
}
