import { useLayoutEffect, useRef } from 'react'
import { animate, useReducedMotionConfig } from 'motion/react'
import { rankName, SUITS } from '../lib/poker'
import type { Card } from '../lib/poker'
import { spring } from '../motion'
import { CardBack, CardFace } from './cards/CardArt'

const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
type Size = 'xs' | 'sm' | 'md' | 'lg'

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
  size?: Size
  /** Fly in from the deck on mount, after `delay` ms. */
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
  return (
    <DealtCard
      card={card}
      faceDown={faceDown}
      size={size}
      deal={deal}
      delay={delay}
      dim={dim}
      highlight={highlight}
    />
  )
}

function DealtCard({
  card,
  faceDown,
  size,
  deal,
  delay,
  dim,
  highlight,
}: {
  card: Card
  faceDown: boolean
  size: Size
  deal?: 'hero' | 'atlas' | 'board'
  delay: number
  dim: boolean
  highlight: boolean
}) {
  const motionRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotionConfig()
  const wasFaceDown = useRef(faceDown)

  // Deal: measure the deck and this slot, then fly the card between them.
  useLayoutEffect(() => {
    const el = motionRef.current
    if (!deal || !el || reduced) return
    const deck = el.closest('.stage')?.querySelector('.deck-stack')
    if (!deck) return
    const from = deck.getBoundingClientRect()
    const to = el.getBoundingClientRect()
    const dx = from.left + from.width / 2 - (to.left + to.width / 2)
    const dy = from.top + from.height / 2 - (to.top + to.height / 2)
    el.style.opacity = '0'
    const controls = animate(
      el,
      {
        x: [dx, 0],
        y: [dy, 0],
        rotate: [deal === 'atlas' ? -18 : 18, 0],
        scale: [0.62, 1],
        opacity: [0, 1],
      },
      { ...spring.heavy, delay: delay / 1000 },
    )
    return () => controls.stop()
    // Runs once per mounted card; later prop changes never re-deal it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reveal: lift the card as it turns face up.
  useLayoutEffect(() => {
    const el = motionRef.current
    const revealed = wasFaceDown.current && !faceDown
    wasFaceDown.current = faceDown
    if (!revealed || !el || reduced) return
    const controls = animate(
      el,
      { y: [0, -16, 0], scale: [1, 1.07, 1] },
      { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
    )
    return () => controls.stop()
  }, [faceDown, reduced])

  const red = card.suit === 'h' || card.suit === 'd'
  const label = faceDown
    ? 'Face-down card'
    : `${rankName(card.rank)} of ${SUIT_NAMES[card.suit]}`
  return (
    <div
      className={`pcard pcard-${size} ${dim ? 'pcard-dim' : ''} ${highlight ? 'pcard-highlight' : ''}`}
      role="img"
      aria-label={label}
    >
      <div className="pcard-motion" ref={motionRef}>
        <div className={`pcard-inner ${faceDown ? 'face-down' : ''}`}>
          <div className={`pcard-face pcard-front ${red ? 'red' : ''}`}>
            <CardFace card={card} simple={size === 'xs'} />
          </div>
          <div className="pcard-face pcard-back">
            <CardBack />
          </div>
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
