import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  History,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  Spade,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { cardKey, evaluate, legalActions } from '../lib/poker'
import type { Action, Game, Player } from '../lib/poker'
import { bestFiveKeys } from '../lib/table-presentation'
import type { TableFrame } from '../lib/table-presentation'
import { PlayingCard } from './PlayingCard'

const chips = (n: number) => n.toLocaleString('en-US')

function ChipStacks({
  amount,
  className = '',
}: {
  amount: number
  className?: string
}) {
  let remainder = amount
  const piles = [100, 25, 5, 1].flatMap((value) => {
    const count = Math.floor(remainder / value)
    remainder %= value
    return count ? [{ value, count }] : []
  })
  return (
    <div className={`physical-chips ${className}`} aria-hidden="true">
      {piles.map(({ value, count }) => (
        <div className={`chip-pile denomination-${value}`} key={value}>
          {Array.from({ length: Math.min(5, count) }, (_, i) => (
            <i key={i} style={{ '--chip-level': i } as CSSProperties}>
              <span>{value}</span>
            </i>
          ))}
        </div>
      ))}
    </div>
  )
}

export function PokerTable({
  game,
  frame,
  busy,
  paused,
  yourTurn,
  betAmount,
  onRaise,
  onAction,
  onDeal,
  onPause,
  onSettings,
  onHistory,
  sound,
  onSound,
  focus,
  onFocus,
  onUnlock,
  shortcuts,
  dialogOpen,
}: {
  game: Game
  frame: TableFrame
  busy: boolean
  paused: boolean
  yourTurn: boolean
  betAmount: number
  onRaise: (amount: number) => void
  onAction: (action: Action) => void
  onDeal: () => void
  onPause: () => void
  onSettings: () => void
  onHistory: () => void
  sound: boolean
  onSound: () => void
  focus: boolean
  onFocus: () => void
  onUnlock: () => void
  shortcuts: boolean
  dialogOpen: boolean
}) {
  const legal = legalActions(game)
  const [confirmation, setConfirmation] = useState('')
  const [draft, setDraft] = useState<{ key: string; value: string } | null>(
    null,
  )
  const confirmationKey = `${game.id}:${game.log.length}:${betAmount}`
  const confirm = confirmation === confirmationKey && yourTurn && legal.canRaise
  const isAllIn = betAmount - game.bets[0] === game.stacks[0]
  const isMaximum = betAmount === legal.maxRaiseTo
  const raiseLabel = Math.max(...game.bets) === 0 ? 'Bet' : 'Raise to'
  const handName =
    game.board.length >= 3
      ? evaluate([...game.cards[0], ...game.board]).name
      : game.cards[0][0].rank === game.cards[0][1].rank
        ? 'Pocket pair'
        : 'Your hole cards'
  const winner = game.result?.winner
  const best = game.result?.showdown
    ? bestFiveKeys([...game.cards[winner === 1 ? 1 : 0], ...game.board])
    : new Set<string>()
  const latest = game.log.at(-1) ?? ''
  const buttonLabel = isAllIn ? 'All-in' : `${raiseLabel} ${chips(betAmount)}`
  function raise() {
    if (!yourTurn || !legal.canRaise) return
    if (isMaximum) setConfirmation(confirmationKey)
    else onAction({ type: 'raise', to: betAmount })
  }
  useEffect(() => {
    if (!shortcuts || dialogOpen) return
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]',
          ))
      )
        return
      if (!yourTurn || confirm) return
      const key = event.key.toLowerCase()
      if (!['f', 'c', 'r'].includes(key)) return
      event.preventDefault()
      onUnlock()
      if (key === 'f') onAction({ type: 'fold' })
      if (key === 'c') onAction({ type: legal.canCheck ? 'check' : 'call' })
      if (key === 'r') raise()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  function seat(player: Player) {
    const hero = player === 0
    const active = !game.result && !paused && !busy && game.turn === player
    const action = frame.actor === player && frame.phase === 'bet'
    return (
      <div
        className={`room-seat ${hero ? 'room-hero' : 'room-opponent'} ${active ? 'seat-is-active' : ''} ${winner === player ? 'seat-winner' : ''}`}
      >
        {!hero && (
          <div className="room-hole-cards opponent-hole-cards">
            {game.cards[1].map((card, i) => (
              <div className="card-deal-slot" key={`${game.id}-${i}`}>
                <PlayingCard
                  key={
                    game.result?.showdown || frame.revealOpponent
                      ? 'face'
                      : 'back'
                  }
                  card={card}
                  back={!game.result?.showdown && !frame.revealOpponent}
                  small
                  delay={i * 110}
                  highlight={winner === 1 && best.has(cardKey(card))}
                />
              </div>
            ))}
          </div>
        )}
        <div className="room-player">
          <span className={`room-avatar ${hero ? 'room-avatar-hero' : ''}`}>
            {hero ? <Spade size={21} fill="currentColor" /> : <span>A</span>}
          </span>
          <div>
            <strong>
              {hero ? 'You' : 'Atlas'}{' '}
              <small>{hero ? 'PLAYER 01' : 'PRACTICE BOT'}</small>
            </strong>
            <span key={game.stacks[player]} className="stack-value">
              {chips(game.stacks[player])} <small>chips</small>
            </span>
          </div>
          {game.dealer === player && (
            <span className="room-dealer" aria-label="Dealer">
              D
            </span>
          )}
        </div>
        {hero && (
          <div className="room-hole-cards hero-hole-cards">
            {game.cards[0].map((card, i) => (
              <div
                className="card-deal-slot"
                key={`${game.id}-${cardKey(card)}`}
              >
                <PlayingCard
                  card={card}
                  delay={220 + i * 110}
                  highlight={winner !== 1 && best.has(cardKey(card))}
                />
              </div>
            ))}
          </div>
        )}
        <div className="room-seat-status">
          {game.result ? (
            winner === player ? (
              <>
                <Check size={12} /> Winner
              </>
            ) : winner === 'tie' ? (
              'Split pot'
            ) : (
              'Hand complete'
            )
          ) : action ? (
            latest
          ) : active ? (
            hero ? (
              'Your decision'
            ) : (
              <>
                <i />
                <i />
                <i /> Considering the odds
              </>
            )
          ) : paused ? (
            'Table paused'
          ) : (
            'At the table'
          )}
        </div>
      </div>
    )
  }

  const status = game.result
    ? game.result.text
    : paused
      ? 'Take your time.'
      : busy
        ? frame.phase === 'deal'
          ? 'Dealing a new hand'
          : frame.phase === 'reveal'
            ? 'Showdown'
            : frame.phase === 'street'
              ? `The ${game.street}`
              : 'Action on the table'
        : yourTurn
          ? 'The decision is yours.'
          : 'Atlas is thinking.'
  const progress = Math.round(
    ((betAmount - legal.minRaiseTo) /
      Math.max(1, legal.maxRaiseTo - legal.minRaiseTo)) *
      100,
  )

  return (
    <div
      className={`poker-room ${paused ? 'room-paused' : ''} phase-${frame.phase}`}
      onPointerDown={onUnlock}
    >
      <div className="room-toolbar">
        <div className="room-table-id">
          <i />
          <strong>
            {game.guided ? 'GUIDED OPENING' : 'THE PRACTICE ROOM'}
          </strong>
          <span>
            Heads-up <b>·</b> 10 / 20
          </span>
        </div>
        <div className="room-tools">
          <button
            aria-label={sound ? 'Mute table sounds' : 'Enable table sounds'}
            aria-pressed={sound}
            title={sound ? 'Mute sounds' : 'Enable sounds'}
            onClick={onSound}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            aria-label={paused ? 'Resume hand' : 'Pause hand'}
            aria-pressed={paused}
            onClick={onPause}
          >
            {paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button aria-label="Table settings" onClick={onSettings}>
            <Settings2 size={17} />
          </button>
          <span className="tool-divider" />
          <button
            className="room-focus-button"
            aria-pressed={focus}
            onClick={onFocus}
          >
            {focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{focus ? 'Show analysis' : 'Focus mode'}</span>
          </button>
        </div>
      </div>
      <div
        className="room-stage"
        aria-label={`Hand ${game.id}, ${game.street}`}
      >
        <div className="room-spotlight" />
        <div className="room-rail">
          <div className="room-felt">
            <div className="room-stitch" />
            <div className="room-felt-signature">
              <Spade size={19} fill="currentColor" />
              <span>QUANTPOKER</span>
              <small>THE DECISION ROOM</small>
            </div>
          </div>
        </div>
        <div className="room-edge-mark">NO-LIMIT HOLD’EM</div>
        <div className="room-hand-number">
          HAND <strong>{String(game.id).padStart(3, '0')}</strong>
        </div>
        {seat(1)}
        <div className="room-board">
          <div className="room-pot" key={`${game.id}-${game.pot}`}>
            <ChipStacks
              amount={
                game.result ? game.invested[0] + game.invested[1] : game.pot
              }
            />
            <div>
              <span>{game.result ? 'FINAL POT' : 'IN THE POT'}</span>
              <strong>
                {chips(
                  game.result ? game.invested[0] + game.invested[1] : game.pot,
                )}
              </strong>
            </div>
          </div>
          <div className="room-community" aria-label="Community cards">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                className={`board-slot ${i === 3 ? 'turn-slot' : ''} ${i === 4 ? 'river-slot' : ''}`}
                key={i}
              >
                <PlayingCard
                  key={
                    game.board[i]
                      ? `${game.id}-${cardKey(game.board[i])}`
                      : `empty-${game.id}`
                  }
                  card={game.board[i]}
                  empty={!game.board[i]}
                  highlight={
                    !!game.board[i] && best.has(cardKey(game.board[i]))
                  }
                  delay={i < 3 ? i * 90 : 0}
                />
                {!game.board[i] && (
                  <small>{i < 3 ? 'FLOP' : i === 3 ? 'TURN' : 'RIVER'}</small>
                )}
              </div>
            ))}
          </div>
          <div className="room-streets" aria-label="Hand progress">
            {['preflop', 'flop', 'turn', 'river'].map((street, i) => (
              <span
                key={street}
                className={
                  game.street === street ||
                  (game.result && i === Math.max(0, game.board.length - 2))
                    ? 'street-active'
                    : game.board.length >= [0, 3, 4, 5][i]
                      ? 'street-past'
                      : ''
                }
              >
                <i />
                {street === 'preflop' ? 'Pre-flop' : street}
              </span>
            ))}
          </div>
        </div>
        {([0, 1] as const).map((player) =>
          game.bets[player] > 0 && !game.result ? (
            <div
              className={`room-wager wager-${player}`}
              key={`${game.id}-${player}-${game.bets[player]}`}
            >
              <ChipStacks amount={game.bets[player]} />
              <span>{chips(game.bets[player])}</span>
            </div>
          ) : null,
        )}
        {frame.phase === 'bet' && !!frame.amount && (
          <div
            className={`flying-chips from-${frame.actor}`}
            key={`${game.id}-${game.log.length}`}
            aria-hidden="true"
          >
            <ChipStacks amount={frame.amount} />
          </div>
        )}
        <div className="room-deck" aria-hidden="true">
          <i />
          <i />
          <span>♠</span>
        </div>
        {seat(0)}
        <div className="room-hand-strength">
          <Spade size={12} />
          <span>{handName}</span>
        </div>
        {game.result && (
          <div
            className={`room-result ${winner === 0 ? 'result-win' : ''}`}
            key={game.log.length}
          >
            <span>
              {winner === 'tie'
                ? 'HONORS SHARED'
                : winner === 0
                  ? 'NICE HAND'
                  : 'NEXT HAND, NEW POSSIBILITIES'}
            </span>
            <strong>
              {winner === 'tie'
                ? 'Split pot.'
                : winner === 0
                  ? 'The pot is yours.'
                  : 'Atlas takes the pot.'}
            </strong>
            <small>
              {game.result.text.split(' · ')[1] ?? 'Hand settled'}{' '}
              <b>
                {game.result.net >= 0 ? '+' : '−'}
                {chips(Math.abs(game.result.net))}
              </b>
            </small>
          </div>
        )}
        {paused && !game.result && (
          <div className="room-pause-overlay">
            <Pause size={25} />
            <h3>Take your time.</h3>
            <p>Your hand is right where you left it.</p>
            <button onClick={onPause}>
              <Play size={15} /> Back to the table
            </button>
          </div>
        )}
      </div>
      <div className="room-action-dock">
        <div className="room-action-status" role="status">
          <div>
            <i className={yourTurn ? 'status-live' : ''} />
            <strong>{status}</strong>
          </div>
          <span>
            {game.result
              ? 'A result is not a verdict on your decision.'
              : yourTurn
                ? legal.toCall
                  ? `${chips(legal.toCall)} to call · pot ${chips(game.pot)}`
                  : 'No bet to match. Check or take the lead.'
                : paused
                  ? 'Resume whenever you’re ready.'
                  : busy
                    ? 'Following the action…'
                    : 'No timer. Think it through.'}
          </span>
        </div>
        {game.result ? (
          <div className="room-next-hand">
            <div>
              <span>YOUR NET THIS HAND</span>
              <strong className={game.result.net < 0 ? 'net-negative' : ''}>
                {game.result.net >= 0 ? '+' : '−'}
                {chips(Math.abs(game.result.net))} <small>chips</small>
              </strong>
            </div>
            <button disabled={busy} onClick={onDeal}>
              {game.stacks.some((s) => s === 0)
                ? 'Refill & deal next hand'
                : 'Deal next hand'}
              <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="room-sizing">
              <label htmlFor="raise-size">
                {raiseLabel === 'Bet' ? 'Bet size' : 'Raise total'}{' '}
                <span>
                  {raiseLabel === 'Bet'
                    ? 'Additional chips'
                    : 'Includes your street bet'}
                </span>
              </label>
              <div className="room-size-input">
                <input
                  aria-label="Bet or raise total in chips"
                  type="number"
                  inputMode="numeric"
                  min={legal.minRaiseTo}
                  max={legal.maxRaiseTo}
                  step="1"
                  value={
                    draft?.key === confirmationKey ? draft.value : betAmount
                  }
                  disabled={!yourTurn || !legal.canRaise}
                  onChange={(e) =>
                    setDraft({ key: confirmationKey, value: e.target.value })
                  }
                  onBlur={(e) => {
                    const value = Number(e.target.value)
                    onRaise(
                      Math.min(
                        legal.maxRaiseTo,
                        Math.max(
                          legal.minRaiseTo,
                          Number.isFinite(value)
                            ? Math.round(value)
                            : legal.minRaiseTo,
                        ),
                      ),
                    )
                    setDraft(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
                <span>chips</span>
              </div>
              <div className="room-presets">
                {[
                  { label: 'Min', amount: legal.minRaiseTo },
                  {
                    label: '½ pot',
                    amount:
                      Math.max(...game.bets) +
                      Math.round((game.pot + legal.toCall) / 2),
                  },
                  {
                    label: '¾ pot',
                    amount:
                      Math.max(...game.bets) +
                      Math.round((game.pot + legal.toCall) * 0.75),
                  },
                  {
                    label: 'Pot',
                    amount: Math.max(...game.bets) + game.pot + legal.toCall,
                  },
                  {
                    label:
                      legal.maxRaiseTo - game.bets[0] === game.stacks[0]
                        ? 'All-in'
                        : 'Max',
                    amount: legal.maxRaiseTo,
                  },
                ].map((preset) => {
                  const amount = Math.min(
                    legal.maxRaiseTo,
                    Math.max(legal.minRaiseTo, preset.amount),
                  )
                  return (
                    <button
                      key={preset.label}
                      disabled={!yourTurn || !legal.canRaise}
                      aria-pressed={amount === betAmount}
                      onClick={() => onRaise(amount)}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
              <div className="room-size-slider">
                <input
                  id="raise-size"
                  aria-label="Raise total"
                  type="range"
                  min={legal.minRaiseTo}
                  max={Math.max(legal.minRaiseTo, legal.maxRaiseTo)}
                  step="1"
                  value={betAmount}
                  disabled={!yourTurn || !legal.canRaise}
                  onChange={(e) => onRaise(Number(e.target.value))}
                  style={
                    { '--range-progress': `${progress}%` } as CSSProperties
                  }
                />
                <div>
                  <span>{chips(legal.minRaiseTo)}</span>
                  <span>Effective max {chips(legal.maxRaiseTo)}</span>
                </div>
              </div>
            </div>
            {confirm ? (
              <div
                className="room-confirm"
                role="group"
                aria-label="Confirm maximum bet"
              >
                <div>
                  <ShieldCheck size={21} />
                  <span>
                    <strong>
                      {isAllIn
                        ? 'Commit your entire stack?'
                        : 'Commit the effective maximum?'}
                    </strong>
                    <small>
                      {chips(betAmount - game.bets[0])} additional chips. This
                      cannot be undone.
                    </small>
                  </span>
                </div>
                <button onClick={() => setConfirmation('')}>Cancel</button>
                <button
                  className="confirm-commit"
                  onClick={() => {
                    setConfirmation('')
                    onAction({ type: 'raise', to: betAmount })
                  }}
                >
                  Confirm {isAllIn ? 'all-in' : 'bet'}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ) : (
              <div className="room-actions">
                <button
                  disabled={!yourTurn}
                  className="room-fold"
                  onClick={() => onAction({ type: 'fold' })}
                >
                  <span>Fold{shortcuts && <kbd>F</kbd>}</span>
                  <small>Leave this hand</small>
                </button>
                <button
                  disabled={!yourTurn}
                  className="room-call"
                  onClick={() =>
                    onAction({ type: legal.canCheck ? 'check' : 'call' })
                  }
                >
                  <span>
                    {legal.canCheck ? 'Check' : `Call ${chips(legal.toCall)}`}
                    {shortcuts && <kbd>C</kbd>}
                  </span>
                  <small>
                    {legal.canCheck ? 'See what comes next' : 'Match the bet'}
                  </small>
                </button>
                <button
                  disabled={!yourTurn || !legal.canRaise}
                  className="room-raise"
                  onClick={raise}
                >
                  <span>
                    {buttonLabel}
                    {shortcuts ? <kbd>R</kbd> : <ArrowUpRight size={17} />}
                  </span>
                  <small>
                    {isMaximum
                      ? 'Confirmation required'
                      : `${chips(betAmount - game.bets[0])} additional chips`}
                  </small>
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="room-bottom">
        <span>
          <ShieldCheck size={12} /> Play money. Real decisions.
        </span>
        <button onClick={onHistory}>
          <History size={13} />
          <span className="room-last-action">{latest}</span>
          <span className="history-label">Hand history</span>
          <ChevronDown size={13} />
        </button>
      </div>
    </div>
  )
}
