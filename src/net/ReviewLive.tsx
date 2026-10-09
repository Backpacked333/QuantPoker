// Review of a finished live hand: what happened street by street, from the
// server's public record, and whether the deal matches the deck the server
// committed to before the first card. The check runs here, in the browser.
import { MiniCard } from '../components/PlayingCard'
import type { SeatId } from '../engine/types'
import { fromId } from '../lib/sim'
import type { HandRecordV1 } from '../shared/protocol'
import type { HandSeen } from './client'
import { useDeckCheck } from './useDeckCheck'
import type { DeckCheck } from './useDeckCheck'

const STREETS = ['preflop', 'flop', 'turn', 'river'] as const
const streetName = (s: string) =>
  s === 'preflop' ? 'Pre-flop' : s[0].toUpperCase() + s.slice(1)
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** "folds" for others, "fold" for you. */
function describeAction(a: HandRecordV1['actions'][number], you: boolean) {
  const verb = (word: string) => (you ? word : `${word}s`)
  switch (a.action.type) {
    case 'fold':
      return verb('fold')
    case 'check':
      return verb('check')
    case 'call':
      return `${verb('call')} ${a.amount}`
    case 'raise':
      return a.toCall > 0 || a.street === 'preflop'
        ? `${verb('raise')} to ${a.amount}`
        : `${verb('bet')} ${a.amount}`
  }
}

const Cards = ({ ids }: { ids: number[] }) => (
  <>
    {ids.map((id) => (
      <MiniCard key={id} card={fromId(id)} />
    ))}
  </>
)

export function ReviewLive({ seen, you }: { seen: HandSeen; you: SeatId }) {
  const check = useDeckCheck(seen)
  const record = seen.record
  if (!record) return null
  const name = (seat: SeatId) =>
    seat === you
      ? 'You'
      : (record.seats.find((s) => s.seat === seat)?.username ?? 'Opponent')
  const net = record.netBySeat[you] ?? 0
  const them = record.shown.filter((s) => s.seat !== you)
  return (
    <section className="panel live-review" aria-label="Hand review">
      <header className="live-review-head">
        <h3>Hand {record.handNo}</h3>
        <DeckBadge check={check} late={!!seen.late} />
      </header>
      <dl className="live-review-cards">
        {seen.mine && (
          <div>
            <dt>Your cards</dt>
            <dd>
              <Cards ids={seen.mine} />
            </dd>
          </div>
        )}
        {them.map((s) => (
          <div key={s.seat}>
            <dt>{name(s.seat)} showed</dt>
            <dd>
              <Cards ids={s.cards} />
            </dd>
          </div>
        ))}
        {record.board.length > 0 && (
          <div>
            <dt>Board</dt>
            <dd>
              <Cards ids={record.board} />
            </dd>
          </div>
        )}
      </dl>
      <ol className="live-review-streets">
        {STREETS.map((street) => {
          const actions = record.actions.filter((a) => a.street === street)
          if (!actions.length) return null
          return (
            <li key={street}>
              <strong>{streetName(street)}</strong>
              <ul>
                {actions.map((a, i) => (
                  <li key={i}>
                    {name(a.seat)} {describeAction(a, a.seat === you)}
                    <small>
                      {a.source === 'timeout'
                        ? ' · ran out of time'
                        : ` · ${seconds(a.decisionMs)}`}
                    </small>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>
      <p className={net >= 0 ? 'live-good' : 'live-error'}>
        {net > 0
          ? `You won ${net} chips.`
          : net < 0
            ? `You lost ${-net} chips.`
            : 'Split pot.'}
      </p>
    </section>
  )
}

function DeckBadge({ check, late }: { check: DeckCheck; late: boolean }) {
  if (check === 'verified')
    return (
      <span
        className="live-deck live-deck-ok"
        title="Before dealing, the server committed to every card of this deck. The board and the shown hands match that commitment, so nothing was re-dealt. Folded hands stay private."
      >
        Deck verified{late ? ' (you joined mid-hand)' : ''}
      </span>
    )
  if (check === 'failed')
    return (
      <span className="live-deck live-deck-bad" role="alert">
        Deck check failed
      </span>
    )
  return (
    <span className="live-deck">
      {check === 'checking' ? 'Checking the deck…' : 'Waiting for the reveal…'}
    </span>
  )
}
