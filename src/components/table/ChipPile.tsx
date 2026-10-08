import type { CSSProperties } from 'react'
import { chipStacks } from '../../lib/chips'

/** Physical-looking chip stacks for an amount (bets, pot, flights). */
export function ChipPile({
  amount,
  maxStacks = 4,
  maxPerStack = 7,
  className = '',
}: {
  amount: number
  maxStacks?: number
  maxPerStack?: number
  className?: string
}) {
  const { stacks } = chipStacks(amount, { maxStacks, maxPerStack })
  if (!stacks.length) return null
  return (
    <span className={`chip-pile ${className}`} aria-hidden="true">
      {stacks.map(({ denomination, count }) => (
        <span key={denomination.value} className="chip-stack">
          {Array.from({ length: count }, (_, i) => (
            <i
              key={i}
              className="chip"
              style={
                {
                  '--c': denomination.color,
                  '--s': denomination.stripe,
                } as CSSProperties
              }
            />
          ))}
        </span>
      ))}
    </span>
  )
}
