import type { CSSProperties } from 'react'
import { rankName, SUITS } from '../lib/poker'
import { CardBack, CardFace } from './cards/CardArt'
import type { Card } from '../lib/poker'

const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  deal,
  delay = 0,
  empty = false,
  dim = false,
  highlight = false,
}: {
  card?: Card
  faceDown?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  deal?: 'hero' | 'atlas' | 'board'
  delay?: number
  empty?: boolean
  dim?: boolean
  highlight?: boolean
}) {
  if (empty || !card)
    return (
      <div
        className={`pcard pcard-${size} pcard-empty`}
        role="img"
        aria-label="Card not dealt yet"
      />
    )
  const red = card.suit === 'h' || card.suit === 'd'
  const label = faceDown
    ? 'Face-down card'
    : `${rankName(card.rank)} of ${SUIT_NAMES[card.suit]}`
  const style = { '--deal-delay': `${delay}ms` } as CSSProperties
  return (
    <div
      className={`pcard pcard-${size} ${deal ? `deal-${deal}` : ''} ${dim ? 'pcard-dim' : ''} ${highlight ? 'pcard-highlight' : ''}`}
      style={style}
      role="img"
      aria-label={label}
    >
      <div className={`pcard-inner ${faceDown ? 'face-down' : ''}`}>
        <div className={`pcard-face pcard-front ${red ? 'red' : ''}`}>
          <CardFace card={card} simple={size === 'xs'} />
        </div>
        <div className="pcard-face pcard-back">
          <CardBack />
        </div>
      </div>
    </div>
  )
}

/** Compact inline card label, e.g. in timelines and readouts. */
export function MiniCard({ card }: { card: Card }) {
  const red = card.suit === 'h' || card.suit === 'd'
  return (
    <span className={`mini-card ${red ? 'red' : ''}`}>
      {rankName(card.rank)}
      {SUITS[card.suit]}
    </span>
  )
}
