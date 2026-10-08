import { useEffect, useMemo, useRef, useState } from 'react'
import { History, Pause, Play, Settings2, Spade } from 'lucide-react'
import { STYLES } from '../../lib/atlas'
import type { AtlasStyle } from '../../lib/atlas'
import { cardKey, evaluate } from '../../lib/poker'
import type { Card, Game } from '../../lib/poker'
import { guidedIntro } from '../../lib/scripted'
import type { GuidedStep } from '../../lib/scripted'
import { score, toId } from '../../lib/sim'
import { useCountUp } from '../../hooks'
import { PlayingCard } from '../PlayingCard'
import type { Bubble } from '../../state/trainer'

const chips = (n: number) => Math.round(n).toLocaleString('en-US')

type Spot = 'hero-bet' | 'atlas-bet' | 'pot' | 'hero' | 'atlas'
type Flight = { id: number; from: Spot; to: Spot; delay: number }

/** The five cards that make the best hand, for showdown highlighting. */
function bestFive(cards: Card[]) {
  const target = score(cards.map(toId))
  for (let a = 0; a < cards.length; a++)
    for (let b = a + 1; b < cards.length; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b)
      if (five.length === 5 && score(five.map(toId)) === target)
        return new Set(five.map(cardKey))
    }
  return new Set(cards.map(cardKey))
}

function BetChips({ who, amount }: { who: 'hero' | 'atlas'; amount: number }) {
  if (!amount) return null
  return (
    <div className={`bet-chips bet-${who}`} key={amount}>
      <span className="chip-pile" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span>{chips(amount)}</span>
    </div>
  )
}

export function Table({
  game,
  style,
  bubble,
  paused,
  yourTurn,
  guidedStep,
  showBubbles,
  onTogglePause,
  onHistory,
  onSettings,
  onSkipGuided,
}: {
  game: Game
  style: AtlasStyle
  bubble: Bubble | null
  paused: boolean
  yourTurn: boolean
  guidedStep: GuidedStep | null
  showBubbles: boolean
  onTogglePause: () => void
  onHistory: () => void
  onSettings: () => void
  onSkipGuided: () => void
}) {
  const [flights, setFlights] = useState<Flight[]>([])
  const previous = useRef(game)
  const flightId = useRef(0)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  useEffect(() => {
    const before = previous.current
    previous.current = game
    if (before === game || before.id !== game.id) return
    const next: Flight[] = []
    const add = (from: Spot, to: Spot, delay = 0) =>
      next.push({ id: ++flightId.current, from, to, delay })
    const closed =
      game.board.length > before.board.length ||
      (!!game.result && !before.result)
    if (closed)
      ([0, 1] as const).forEach((p) => {
        const collected = before.bets[p] + game.invested[p] - before.invested[p]
        if (collected > 0) add(p === 0 ? 'hero-bet' : 'atlas-bet', 'pot')
      })
    if (game.result && !before.result) {
      const { winner } = game.result
      if (winner === 'tie') {
        add('pot', 'hero', 420)
        add('pot', 'atlas', 420)
      } else add('pot', winner === 0 ? 'hero' : 'atlas', 420)
    }
    if (!next.length) return
    setFlights((list) => [...list, ...next])
    const ids = new Set(next.map((f) => f.id))
    timers.current.push(
      window.setTimeout(
        () => setFlights((list) => list.filter((f) => !ids.has(f.id))),
        1300,
      ),
    )
  }, [game])

  const result = game.result
  const showdown = !!result?.showdown
  const pot = useCountUp(result ? 0 : game.pot)
  const heroStack = useCountUp(game.stacks[0])
  const atlasStack = useCountUp(game.stacks[1])
  const winning = useMemo(() => {
    if (!showdown || !result || result.winner === 'tie') return null
    return bestFive([...game.cards[result.winner], ...game.board])
  }, [showdown, result, game.cards, game.board])
  const handName =
    game.board.length >= 3
      ? evaluate([...game.cards[0], ...game.board]).name
      : game.cards[0][0].rank === game.cards[0][1].rank
        ? 'Pocket pair'
        : `${game.cards[0][0].suit === game.cards[0][1].suit ? 'Suited' : 'Offsuit'} hole cards`
  const atlasName =
    showdown && game.board.length === 5
      ? evaluate([...game.cards[1], ...game.board]).name
      : null
  const thinking = game.turn === 1 && !result && !paused
  const guided = guidedStep ? guidedIntro[guidedStep] : null

  return (
    <section className="table" aria-label="Poker table" data-tour="table">
      <div className="table-top">
        <span className="table-title">
          <span className="live-dot" />
          {guided ? 'Guided path' : 'Practice table'}
          <span className="table-sep">/</span>
          <span className="table-sub">
            Heads-up · 10/20 · Atlas plays {STYLES[style].label.toLowerCase()}
          </span>
        </span>
        <span className="table-tools">
          <button
            className="icon-btn on-dark"
            onClick={onTogglePause}
            aria-label={paused ? 'Resume table (P)' : 'Pause table (P)'}
            title={paused ? 'Resume (P)' : 'Pause (P)'}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button
            className="icon-btn on-dark"
            onClick={onHistory}
            aria-label="Hand history"
            title="Hand history"
          >
            <History size={15} />
          </button>
          <button
            className="icon-btn on-dark"
            onClick={onSettings}
            aria-label="Table settings"
            title="Settings"
          >
            <Settings2 size={15} />
          </button>
        </span>
      </div>
      {guided && (
        <div className="guided-banner">
          <div>
            <strong>{guided.title}</strong>
            <span>{guided.body}</span>
          </div>
          <button onClick={onSkipGuided}>Skip to shuffled hands</button>
        </div>
      )}
      <div className={`stage ${result ? 'stage-done' : ''}`}>
        <div className="felt" aria-hidden>
          <div className="felt-ring" />
          <span className="felt-mark">
            <Spade size={12} fill="currentColor" /> QUANTPOKER
          </span>
          <span className="felt-motto">THINK IN PROBABILITIES</span>
        </div>
        <div className="deck-stack" aria-hidden />

        <div
          className={`seat seat-atlas ${thinking ? 'seat-active' : ''} ${result && result.winner === 1 ? 'seat-won' : ''} ${result?.text.startsWith('Atlas fold') ? 'seat-folded' : ''}`}
        >
          <div className="seat-cards">
            {game.cards[1].map((card, i) => (
              <PlayingCard
                key={`${game.id}-a${i}`}
                card={card}
                faceDown={!showdown}
                size="sm"
                deal="atlas"
                delay={80 + i * 160}
                highlight={
                  !!winning?.has(cardKey(card)) && result?.winner === 1
                }
              />
            ))}
          </div>
          <div className="seat-plate">
            <span className="avatar avatar-atlas">A</span>
            <span className="seat-text">
              <strong>
                Atlas <em className="seat-badge">{STYLES[style].label}</em>
              </strong>
              <span>{chips(atlasStack)} chips</span>
            </span>
            {game.dealer === 1 && <span className="dealer-btn">D</span>}
          </div>
          {atlasName && <span className="seat-hand">{atlasName}</span>}
          {(thinking || (bubble && showBubbles)) && (
            <div
              className="bubble"
              key={thinking ? 'thinking' : bubble!.id}
              role="status"
            >
              {thinking ? (
                <span
                  className="thinking-dots"
                  role="img"
                  aria-label="Atlas is thinking"
                >
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                bubble!.text
              )}
            </div>
          )}
        </div>

        <BetChips who="atlas" amount={result ? 0 : game.bets[1]} />

        <div className="pot">
          <span className="chip-pile" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="pot-label">{result ? 'Hand complete' : 'Pot'}</span>
          <strong>
            {result ? chips(game.invested[0] + game.invested[1]) : chips(pot)}
          </strong>
        </div>

        <div className="board" role="group" aria-label="Community cards">
          {Array.from({ length: 5 }, (_, i) =>
            game.board[i] ? (
              <PlayingCard
                key={`${game.id}-b${i}-${cardKey(game.board[i])}`}
                card={game.board[i]}
                deal="board"
                delay={i < 3 ? i * 110 : 0}
                dim={!!winning && !winning.has(cardKey(game.board[i]))}
                highlight={!!winning?.has(cardKey(game.board[i]))}
              />
            ) : (
              <PlayingCard key={`empty-${i}`} empty />
            ),
          )}
        </div>
        <div className="streets" aria-hidden>
          {(['preflop', 'flop', 'turn', 'river'] as const).map((street) => (
            <span key={street} className={game.street === street ? 'on' : ''}>
              {street === 'preflop' ? 'Pre-flop' : street}
            </span>
          ))}
        </div>

        <BetChips who="hero" amount={result ? 0 : game.bets[0]} />

        <div
          className={`seat seat-hero ${yourTurn ? 'seat-active' : ''} ${result && result.winner === 0 ? 'seat-won' : ''}`}
        >
          <div className="seat-cards">
            {game.cards[0].map((card, i) => (
              <PlayingCard
                key={`${game.id}-h${i}`}
                card={card}
                size="lg"
                deal="hero"
                delay={i * 160}
                dim={!!winning && result?.winner === 1}
                highlight={
                  !!winning?.has(cardKey(card)) && result?.winner === 0
                }
              />
            ))}
          </div>
          <div className="seat-plate">
            <span className="avatar avatar-hero">You</span>
            <span className="seat-text">
              <strong>
                You {yourTurn && <em className="seat-badge turn">Your turn</em>}
              </strong>
              <span>{chips(heroStack)} chips</span>
            </span>
            {game.dealer === 0 && <span className="dealer-btn">D</span>}
          </div>
          <span className="seat-hand">{handName}</span>
          {result && result.net !== 0 && (
            <span
              key={`net-${game.id}`}
              className={`net-pop ${result.net > 0 ? 'up' : 'down'}`}
            >
              {result.net > 0 ? '+' : '−'}
              {chips(Math.abs(result.net))}
            </span>
          )}
        </div>

        {flights.map((flight) => (
          <span
            key={flight.id}
            className={`flight from-${flight.from} to-${flight.to}`}
            style={{ animationDelay: `${flight.delay}ms` }}
            aria-hidden
          >
            <i />
            <i />
          </span>
        ))}

        {paused && !result && (
          <div className="paused">
            <Pause size={22} />
            <strong>Table paused</strong>
            <span>Take your time with the lab. Atlas will wait.</span>
            <button className="btn btn-accent" onClick={onTogglePause}>
              <Play size={14} /> Resume
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
