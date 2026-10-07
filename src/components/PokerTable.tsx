import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowRight,
  ChartNoAxesCombined,
  History,
  Lightbulb,
  Minus,
  Pause,
  Play,
  Plus,
  Settings2,
  ShieldCheck,
  Spade,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { cardKey, evaluate, legalActions } from '../lib/poker'
import type { Action, EquityAnalysis, Game, Player } from '../lib/poker'
import { bestFiveKeys } from '../lib/table-presentation'
import type { TableFrame } from '../lib/table-presentation'
import { PlayingCard } from './PlayingCard'

const chips = (n: number) => n.toLocaleString('en-US')
const percent = (n: number) => `${Math.round(n * 100)}%`
const signed = (n: number) =>
  `${n >= 0 ? '+' : '−'}${chips(Math.round(Math.abs(n)))}`
const BIG_BLIND = 20
const DENOMINATIONS = [500, 100, 25, 5, 1]
const ACTION_ENTRY =
  /^(You|Atlas) (fold|check|call|bet|raise)s?(?: to)?(?: (\d+))?/
const ROUND_START = /^(Flop|Turn|River) ·|^A new hand|^Guided hand/
const VERBS: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
}

function Chips({ amount }: { amount: number }) {
  let rest = amount
  const stacks = DENOMINATIONS.flatMap((value) => {
    const count = Math.floor(rest / value)
    rest %= value
    return count ? [{ value, count: Math.min(count, 6) }] : []
  }).slice(0, 4)
  return (
    <span className="chips" aria-hidden="true">
      {stacks.map(({ value, count }) => (
        <span
          className={`chip-stack chip-${value}`}
          key={value}
          style={{ '--n': count } as CSSProperties}
        >
          {Array.from({ length: count }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      ))}
    </span>
  )
}

function roundActions(log: string[]) {
  const found: [string?, string?] = []
  for (let i = log.length - 1; i >= 0; i--) {
    if (ROUND_START.test(log[i])) break
    const match = ACTION_ENTRY.exec(log[i])
    if (!match) continue
    const player = match[1] === 'You' ? 0 : 1
    if (found[player]) continue
    const verb = VERBS[match[2]]
    found[player] = match[3] ? `${verb} ${chips(Number(match[3]))}` : verb
  }
  return found
}

export function PokerTable({
  game,
  frame,
  busy,
  paused,
  yourTurn,
  betAmount,
  analysis,
  onRaise,
  onAction,
  onDeal,
  onPause,
  onSettings,
  onHistory,
  sound,
  onSound,
  analysisOpen,
  onToggleAnalysis,
  onUnlock,
  shortcuts,
  dialogOpen,
  tip,
  onDismissTip,
  notice,
}: {
  game: Game
  frame: TableFrame
  busy: boolean
  paused: boolean
  yourTurn: boolean
  betAmount: number
  analysis: EquityAnalysis | null
  onRaise: (amount: number) => void
  onAction: (action: Action) => void
  onDeal: () => void
  onPause: () => void
  onSettings: () => void
  onHistory: () => void
  sound: boolean
  onSound: () => void
  analysisOpen: boolean
  onToggleAnalysis: () => void
  onUnlock: () => void
  shortcuts: boolean
  dialogOpen: boolean
  tip?: string
  onDismissTip?: () => void
  notice?: string
}) {
  const legal = legalActions(game)
  const [confirmation, setConfirmation] = useState('')
  const [draft, setDraft] = useState<{ key: string; value: string } | null>(
    null,
  )
  const decisionKey = `${game.id}:${game.log.length}`
  const confirmationKey = `${decisionKey}:${betAmount}`
  const confirm = confirmation === confirmationKey && yourTurn && legal.canRaise
  const isAllIn = betAmount - game.bets[0] === game.stacks[0]
  const isMaximum = betAmount === legal.maxRaiseTo
  const facingBet = Math.max(...game.bets) > 0
  const raiseVerb = facingBet ? 'Raise to' : 'Bet'
  const result = game.result
  const winner = result?.winner
  const showdown = !!result?.showdown
  const best = showdown
    ? bestFiveKeys([...game.cards[winner === 1 ? 1 : 0], ...game.board])
    : new Set<string>()
  const actions = roundActions(game.log)
  const heroHand =
    game.board.length >= 3
      ? evaluate([...game.cards[0], ...game.board]).name
      : game.cards[0][0].rank === game.cards[0][1].rank
        ? 'Pocket pair'
        : game.cards[0][0].suit === game.cards[0][1].suit
          ? 'Suited'
          : 'Hole cards'
  const equity = analysis?.equity
  const price = legal.toCall / (game.pot + legal.toCall)
  const callEV =
    equity === undefined
      ? null
      : equity * (game.pot + legal.toCall) - legal.toCall
  const sizingDisabled = !yourTurn || !legal.canRaise
  const clampBet = (value: number) =>
    Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(value)))
  const presets = [
    { label: 'Min', amount: legal.minRaiseTo },
    {
      label: '½ pot',
      amount: Math.max(...game.bets) + (game.pot + legal.toCall) / 2,
    },
    {
      label: '¾ pot',
      amount: Math.max(...game.bets) + (game.pot + legal.toCall) * 0.75,
    },
    { label: 'Pot', amount: Math.max(...game.bets) + game.pot + legal.toCall },
    {
      label:
        legal.maxRaiseTo - game.bets[0] === game.stacks[0] ? 'All-in' : 'Max',
      amount: legal.maxRaiseTo,
    },
  ]
  const progress =
    ((betAmount - legal.minRaiseTo) /
      Math.max(1, legal.maxRaiseTo - legal.minRaiseTo)) *
    100

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
      const key = event.key.toLowerCase()
      if (key === 'n' && result && !busy) {
        event.preventDefault()
        onUnlock()
        onDeal()
        return
      }
      if (!yourTurn || confirm || !['f', 'c', 'r'].includes(key)) return
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
    const active = !result && !busy && !paused && game.turn === player
    const revealed = hero || showdown || !!frame.revealOpponent
    const opponentHand =
      !hero && revealed && game.board.length >= 3
        ? evaluate([...game.cards[1], ...game.board]).name
        : null
    const tag =
      !hero && opponentHand
        ? opponentHand
        : active && !hero
          ? 'Thinking'
          : showdown
            ? ''
            : (actions[player] ?? '')
    const tagKind = tag.startsWith('Fold')
      ? 'pt-tag-fold'
      : tag === 'Thinking'
        ? 'pt-tag-thinking'
        : opponentHand
          ? 'pt-tag-hand'
          : ''
    return (
      <div
        className={`pt-seat ${hero ? 'pt-seat-hero' : 'pt-seat-opp'} ${active ? 'pt-active' : ''} ${winner === player ? 'pt-winner' : ''}`}
      >
        <div className="pt-hole">
          {game.cards[player].map((card, i) => (
            <PlayingCard
              key={`${game.id}-${i}-${revealed ? 'face' : 'back'}`}
              card={card}
              back={!revealed}
              delay={i * 220 + (hero ? 110 : 0)}
              highlight={winner === player && best.has(cardKey(card))}
            />
          ))}
        </div>
        <div className="pt-plate">
          <span className="pt-avatar" aria-hidden="true">
            {hero ? <Spade size={17} fill="currentColor" /> : 'A'}
          </span>
          <span className="pt-identity">
            <span className="pt-name">{hero ? 'You' : 'Atlas'}</span>
            <strong key={game.stacks[player]} className="pt-stack">
              {chips(game.stacks[player])}
            </strong>
          </span>
          {hero && <span className="pt-strength">{heroHand}</span>}
          {game.dealer === player && (
            <span className="pt-dealer" aria-label="Dealer">
              D
            </span>
          )}
        </div>
        {game.bets[player] > 0 && !result && (
          <div
            className="pt-bet"
            key={`${game.id}-${player}-${game.bets[player]}`}
          >
            <Chips amount={game.bets[player]} />
            <span>{chips(game.bets[player])}</span>
          </div>
        )}
        <span
          className={`pt-tag ${tagKind} ${tag ? '' : 'pt-tag-empty'}`}
          aria-hidden={!tag}
        >
          {tag === 'Thinking' ? (
            <>
              Thinking
              <i />
              <i />
              <i />
            </>
          ) : (
            tag || '·'
          )}
        </span>
      </div>
    )
  }

  const status =
    notice ||
    (result
      ? result.text
      : paused
        ? 'Table paused'
        : busy
          ? frame.phase === 'deal'
            ? 'Dealing…'
            : frame.phase === 'reveal'
              ? 'Showdown'
              : frame.phase === 'street'
                ? `Dealing the ${game.street}`
                : `${frame.actor === 0 ? 'You' : 'Atlas'} · ${actions[frame.actor ?? 0] ?? 'act'}`
          : yourTurn
            ? 'Your move'
            : game.turn === 1
              ? 'Atlas is thinking…'
              : 'Waiting')

  return (
    <div
      className={`pt ${paused ? 'pt-paused' : ''} ${showdown ? 'pt-showdown' : ''} pt-phase-${frame.phase}`}
      onPointerDown={onUnlock}
    >
      <div className="pt-bar">
        <div className="pt-hand-info">
          <span className="pt-live" />
          <strong>{game.guided ? 'Guided hand' : `Hand #${game.id}`}</strong>
          <span>NLH · 10/20</span>
          <span className="pt-street-chip">
            {result
              ? 'Settled'
              : game.street === 'preflop'
                ? 'Pre-flop'
                : game.street}
          </span>
        </div>
        <div className="pt-tools">
          <button
            aria-label="Hand history"
            title="Hand history"
            onClick={onHistory}
          >
            <History size={17} />
          </button>
          <button
            aria-label={sound ? 'Mute table sounds' : 'Enable table sounds'}
            title={sound ? 'Mute sounds' : 'Enable sounds'}
            aria-pressed={sound}
            onClick={onSound}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            aria-label={paused ? 'Resume hand' : 'Pause hand'}
            title={paused ? 'Resume' : 'Pause'}
            aria-pressed={paused}
            onClick={onPause}
          >
            {paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            aria-label="Table settings"
            title="Settings"
            onClick={onSettings}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="pt-analysis-toggle"
            aria-pressed={analysisOpen}
            aria-label={analysisOpen ? 'Hide analysis' : 'Show analysis'}
            onClick={onToggleAnalysis}
          >
            <ChartNoAxesCombined size={16} />
            <span>{analysisOpen ? 'Hide analysis' : 'Analysis'}</span>
          </button>
        </div>
      </div>

      <div className="pt-stage" aria-label={`Hand ${game.id}, ${game.street}`}>
        <div className="pt-felt" aria-hidden="true" />
        {seat(1)}
        <div className="pt-center">
          <div className="pt-pot" key={`${game.id}-${game.pot}`}>
            <Chips
              amount={result ? game.invested[0] + game.invested[1] : game.pot}
            />
            <span>{result ? 'Final pot' : 'Pot'}</span>
            <strong>
              {chips(result ? game.invested[0] + game.invested[1] : game.pot)}
            </strong>
          </div>
          <div className="pt-board" aria-label="Community cards">
            {Array.from({ length: 5 }, (_, i) =>
              game.board[i] ? (
                <PlayingCard
                  key={`${game.id}-${cardKey(game.board[i])}`}
                  card={game.board[i]}
                  highlight={best.has(cardKey(game.board[i]))}
                  delay={i < 3 ? i * 110 : 0}
                />
              ) : (
                <PlayingCard
                  key={`empty-${i}`}
                  empty
                  label={i < 3 ? 'Flop' : i === 3 ? 'Turn' : 'River'}
                />
              ),
            )}
          </div>
        </div>
        {frame.phase === 'bet' && !!frame.amount && (
          <div
            className={`pt-fly pt-fly-${frame.actor}`}
            key={`fly-${game.id}-${game.log.length}`}
            aria-hidden="true"
          >
            <Chips amount={frame.amount} />
          </div>
        )}
        {frame.phase === 'settle' && result && winner !== 'tie' && (
          <div className={`pt-sweep pt-sweep-${winner}`} aria-hidden="true">
            <Chips amount={game.invested[0] + game.invested[1]} />
          </div>
        )}
        {seat(0)}
        {tip && (
          <div className="pt-toast">
            <Lightbulb size={15} />
            <span>{tip}</span>
            {onDismissTip && (
              <button aria-label="Dismiss table tip" onClick={onDismissTip}>
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {paused && !result && (
          <div className="pt-pause">
            <Pause size={26} />
            <h3>Table paused</h3>
            <p>Nothing moves until you’re ready.</p>
            <button onClick={onPause}>
              <Play size={15} /> Resume
            </button>
          </div>
        )}
      </div>

      <div className="pt-dock">
        <div className={`pt-insight ${result ? 'pt-insight-result' : ''}`}>
          <div className="pt-status" role="status">
            <i className={yourTurn ? 'live' : ''} />
            <span>{status}</span>
          </div>
          {!result && (
            <div className="pt-metrics">
              {equity === undefined ? (
                <span className="pt-metric">Estimating equity…</span>
              ) : (
                <>
                  {legal.toCall > 0 && (
                    <span
                      className="pt-metric"
                      title="Share of the final pot you must pay to call"
                    >
                      Price <strong>{percent(price)}</strong>
                    </span>
                  )}
                  <span
                    className="pt-metric"
                    title="Estimated share of the pot you win at showdown"
                  >
                    Equity <strong>{percent(equity)}</strong>
                  </span>
                  {legal.toCall > 0 && callEV !== null && (
                    <span
                      className={`pt-metric ${callEV >= 0 ? 'good' : 'bad'}`}
                      title="Modeled average result of calling, in chips"
                    >
                      Call EV <strong>{signed(callEV)}</strong>
                    </span>
                  )}
                </>
              )}
              <button className="pt-why" onClick={onToggleAnalysis}>
                {analysisOpen ? 'Hide' : 'Why?'}
              </button>
            </div>
          )}
        </div>

        {result ? (
          <div className="pt-next">
            <div className="pt-outcome">
              <strong>
                {winner === 'tie'
                  ? 'Split pot'
                  : winner === 0
                    ? 'You win the pot'
                    : 'Atlas wins the pot'}
                <b className={result.net < 0 ? 'neg' : 'pos'}>
                  {signed(result.net)}
                </b>
              </strong>
              <span>{result.text}</span>
            </div>
            <button disabled={busy} onClick={onDeal}>
              {game.stacks.some((s) => s === 0)
                ? 'Refill & deal next hand'
                : 'Deal next hand'}
              {shortcuts ? <kbd>N</kbd> : <ArrowRight size={18} />}
            </button>
          </div>
        ) : (
          <>
            {legal.canRaise && (
              <div className="pt-sizing">
                <div
                  className="pt-presets"
                  role="group"
                  aria-label="Bet size presets"
                >
                  {presets.map((preset) => {
                    const amount = clampBet(preset.amount)
                    return (
                      <button
                        key={preset.label}
                        disabled={sizingDisabled}
                        aria-pressed={amount === betAmount}
                        onClick={() => onRaise(amount)}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  className="pt-slider"
                  aria-label="Raise size"
                  type="range"
                  min={legal.minRaiseTo}
                  max={Math.max(legal.minRaiseTo, legal.maxRaiseTo)}
                  step="1"
                  value={betAmount}
                  disabled={sizingDisabled}
                  onChange={(e) => onRaise(Number(e.target.value))}
                  style={{ '--progress': `${progress}%` } as CSSProperties}
                />
                <div className="pt-amount">
                  <button
                    aria-label="Decrease bet by one big blind"
                    disabled={sizingDisabled || betAmount <= legal.minRaiseTo}
                    onClick={() => onRaise(clampBet(betAmount - BIG_BLIND))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    aria-label="Bet or raise total in chips"
                    type="number"
                    inputMode="numeric"
                    min={legal.minRaiseTo}
                    max={legal.maxRaiseTo}
                    step="1"
                    value={draft?.key === decisionKey ? draft.value : betAmount}
                    disabled={sizingDisabled}
                    onChange={(e) =>
                      setDraft({ key: decisionKey, value: e.target.value })
                    }
                    onBlur={(e) => {
                      const value = Number(e.target.value)
                      onRaise(
                        clampBet(
                          Number.isFinite(value) ? value : legal.minRaiseTo,
                        ),
                      )
                      setDraft(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                  <button
                    aria-label="Increase bet by one big blind"
                    disabled={sizingDisabled || betAmount >= legal.maxRaiseTo}
                    onClick={() => onRaise(clampBet(betAmount + BIG_BLIND))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}
            {confirm ? (
              <div
                className="pt-confirm"
                role="group"
                aria-label="Confirm maximum bet"
              >
                <ShieldCheck size={22} />
                <span>
                  <strong>
                    {isAllIn ? 'Go all-in?' : 'Bet the effective maximum?'}
                  </strong>
                  <small>
                    {chips(betAmount - game.bets[0])} chips from your stack.
                  </small>
                </span>
                <button onClick={() => setConfirmation('')}>Cancel</button>
                <button
                  className="pt-confirm-go"
                  onClick={() => {
                    setConfirmation('')
                    onAction({ type: 'raise', to: betAmount })
                  }}
                >
                  Confirm {isAllIn ? 'all-in' : 'bet'}
                </button>
              </div>
            ) : (
              <div className="pt-actions">
                <button
                  className="pt-fold"
                  disabled={!yourTurn}
                  onClick={() => onAction({ type: 'fold' })}
                >
                  <span>Fold{shortcuts && <kbd>F</kbd>}</span>
                </button>
                <button
                  className="pt-call"
                  disabled={!yourTurn}
                  onClick={() =>
                    onAction({ type: legal.canCheck ? 'check' : 'call' })
                  }
                >
                  <span>
                    {legal.canCheck ? 'Check' : `Call ${chips(legal.toCall)}`}
                    {shortcuts && <kbd>C</kbd>}
                  </span>
                </button>
                <button
                  className="pt-raise"
                  disabled={!yourTurn || !legal.canRaise}
                  onClick={raise}
                >
                  <span>
                    {isAllIn
                      ? `All-in ${chips(betAmount)}`
                      : `${raiseVerb} ${chips(betAmount)}`}
                    {shortcuts && <kbd>R</kbd>}
                  </span>
                  <small>
                    {legal.canRaise
                      ? `${chips(betAmount - game.bets[0])} from your stack`
                      : 'Not available'}
                  </small>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
