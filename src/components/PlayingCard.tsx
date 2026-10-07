import { rankName, SUITS } from '../lib/poker'
import type { Card } from '../lib/poker'
import type { CSSProperties } from 'react'

const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

export function PlayingCard({
  card,
  back = false,
  empty = false,
  highlight = false,
  delay = 0,
  label,
}: {
  card?: Card
  back?: boolean
  empty?: boolean
  highlight?: boolean
  delay?: number
  label?: string
}) {
  const style = { '--deal-delay': `${delay}ms` } as CSSProperties
  if (empty)
    return (
      <div className="pc pc-empty" aria-label="Card not dealt yet">
        {label && <span>{label}</span>}
      </div>
    )
  if (back || !card)
    return (
      <div
        className="pc pc-back"
        role="img"
        aria-label="Hidden opponent card"
        style={style}
      >
        <span aria-hidden="true">♠</span>
      </div>
    )
  const red = card.suit === 'h' || card.suit === 'd'
  const rank = card.rank === 10 ? '10' : rankName(card.rank)
  return (
    <div
      className={`pc pc-face ${red ? 'pc-red' : ''} ${highlight ? 'pc-win' : ''}`}
      role="img"
      aria-label={`${rankName(card.rank)} of ${SUIT_NAMES[card.suit]}`}
      style={style}
    >
      <span className="pc-index" aria-hidden="true">
        <span className="pc-rank">{rank}</span>
        <span className="pc-suit-sm">{SUITS[card.suit]}</span>
      </span>
      <span className="pc-suit" aria-hidden="true">
        {SUITS[card.suit]}
      </span>
    </div>
  )
}
