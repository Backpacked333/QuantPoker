import { rankName, SUITS } from '../lib/poker'
import type { Card } from '../lib/poker'
import type { CSSProperties } from 'react'

export function PlayingCard({
  card,
  back = false,
  small = false,
  empty = false,
  highlight = false,
  delay = 0,
}: {
  card?: Card
  back?: boolean
  small?: boolean
  empty?: boolean
  highlight?: boolean
  delay?: number
}) {
  if (empty)
    return (
      <div className="playing-card empty-card" aria-label="Card not dealt yet">
        <span>♠</span>
      </div>
    )
  if (back || !card)
    return (
      <div
        className={`playing-card card-back ${small ? 'small-card' : ''}`}
        aria-label="Hidden opponent card"
        style={{ '--deal-delay': `${delay}ms` } as CSSProperties}
      >
        <div>
          <span>♠</span>
          <small>QP</small>
        </div>
      </div>
    )
  const red = card.suit === 'h' || card.suit === 'd'
  return (
    <div
      className={`playing-card ${red ? 'red-card' : ''} ${small ? 'small-card' : ''} ${highlight ? 'winning-card' : ''}`}
      aria-label={`${rankName(card.rank)} of ${{ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[card.suit]}`}
      style={{ '--deal-delay': `${delay}ms` } as CSSProperties}
    >
      <div className="card-corner">
        <b>{rankName(card.rank)}</b>
        <span>{SUITS[card.suit]}</span>
      </div>
      {card.rank > 10 && card.rank < 14 ? (
        <div className="court-art" aria-hidden="true">
          <span>{SUITS[card.suit]}</span>
          <b>{rankName(card.rank)}</b>
          <span>{SUITS[card.suit]}</span>
        </div>
      ) : (
        <span className="card-pip">{SUITS[card.suit]}</span>
      )}
      <div className="card-corner corner-bottom">
        <b>{rankName(card.rank)}</b>
        <span>{SUITS[card.suit]}</span>
      </div>
    </div>
  )
}
