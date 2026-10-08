// A live heads-up table. Everything shown comes from the server's snapshot
// for this seat, projected into the trainer's Game so the same Table and
// ActionBar render it. No analysis runs here: the lab stays off in play.
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { ActionBar } from '../components/table/ActionBar'
import { Table } from '../components/table/Table'
import { toHeroGame } from '../engine/project'
import type { SeatId } from '../engine/types'
import { legalActions } from '../lib/poker'
import { buildPresets } from '../lib/presets'
import type { MatchInfo, SeatView } from '../shared/protocol'
import { useRunout } from '../state/runout'
import { inviteLink } from './api'
import type { Identity } from './api'
import type { TableState } from './client'
import { ReviewLive } from './ReviewLive'
import { TurnClock } from './TurnClock'
import { useTable } from './useTable'

const noop = () => {}
const chips = (n: number) => Math.round(n).toLocaleString('en-US')

export function LiveTable({
  matchId,
  identity,
}: {
  matchId: string
  identity: Identity
}) {
  const { state, act } = useTable(matchId, identity.getToken)
  const { status, table, view, seat } = state

  if (status === 'failed' || status === 'replaced')
    return (
      <div className="empty live-empty" role="alert">
        <h3>
          {status === 'replaced'
            ? 'This table is open in another tab.'
            : 'Could not join this table.'}
        </h3>
        <p>
          {status === 'replaced'
            ? 'Keep playing there, or reload this page to play here instead.'
            : (state.error?.message ??
              'The table may be full or the link may be wrong.')}
        </p>
        <a className="btn btn-outline" href="#lobby">
          Back to the lobby
        </a>
      </div>
    )
  if (!table || seat === null)
    return (
      <p className="live-status" role="status">
        Joining the table…
      </p>
    )

  const opponent = table.players.find((p) => p.seat !== seat)
  return (
    <div className="play-column live-table">
      <MatchBar table={table} seat={seat} view={view} state={state} />
      {view ? (
        <LiveHand
          view={view}
          opponent={opponent?.username ?? 'Opponent'}
          state={state}
          act={act}
        />
      ) : (
        <WaitingRoom matchId={matchId} table={table} seat={seat} />
      )}
    </div>
  )
}

function MatchBar({
  table,
  seat,
  view,
  state,
}: {
  table: MatchInfo
  seat: SeatId
  view: SeatView | null
  state: TableState
}) {
  const opponent = table.players.find((p) => p.seat !== seat)
  return (
    <div className="live-matchbar" role="status" aria-live="polite">
      <span>
        {view ? `Hand ${view.handNo} of ${table.handsTotal}` : 'Waiting room'}
      </span>
      {opponent && (
        <span className={opponent.connected ? '' : 'live-warn'}>
          vs <b>{opponent.username}</b>
          {!opponent.connected && ' · disconnected'}
        </span>
      )}
      {view?.clock && !view.result && view.toAct !== null && (
        <TurnClock
          clock={view.clock}
          offset={state.clockOffset}
          who={
            view.toAct === seat
              ? 'Your clock'
              : (opponent?.username ?? 'Opponent')
          }
        />
      )}
      {state.status === 'reconnecting' && (
        <span className="live-warn">Reconnecting…</span>
      )}
    </div>
  )
}

function WaitingRoom({
  matchId,
  table,
  seat,
}: {
  matchId: string
  table: MatchInfo
  seat: SeatId
}) {
  const link = inviteLink(matchId)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const full = table.players.length === 2
  return (
    <section className="panel live-signin" aria-labelledby="waiting-title">
      <h2 id="waiting-title">
        {full ? 'Both players are here' : 'Waiting for your opponent'}
      </h2>
      {seat === 0 && !full ? (
        <>
          <p className="live-muted">
            Send this link. The first person to open it takes the other seat,
            and the first hand deals as soon as you are both here.
          </p>
          <div className="live-row">
            <input
              aria-label="Invite link"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
            />
            <button className="btn btn-primary" onClick={() => void copy()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </>
      ) : (
        <p className="live-muted">The first hand deals in a moment.</p>
      )}
    </section>
  )
}

function LiveHand({
  view,
  opponent,
  state,
  act,
}: {
  view: SeatView
  opponent: string
  state: TableState
  act: ReturnType<typeof useTable>['act']
}) {
  const game = useMemo(() => toHeroGame(view, opponent), [view, opponent])
  const runout = useRunout(game)
  const yourTurn =
    !game.result && view.toAct === view.you && state.status === 'open'
  // The server's legal moves when it is our turn; otherwise what we would
  // face, so the bar can show it greyed out.
  const legal = view.legal ?? legalActions({ ...game, turn: 0 })
  const presets = buildPresets(legal, game.pot, legal.toCall, game.bets)
  const decision = `${view.handNo}:${view.actions.length}`
  const [sizing, setSizing] = useState<{ id: string; to: number } | null>(null)
  const raiseTo = Math.min(
    legal.maxRaiseTo,
    Math.max(
      legal.minRaiseTo,
      sizing?.id === decision
        ? sizing.to
        : (presets[0]?.to ?? legal.minRaiseTo),
    ),
  )
  const [flash, setFlash] = useState<string | null>(null)
  useEffect(() => {
    if (!state.error || state.error.code === 'unauthorized') return
    setFlash(state.error.message)
    const timer = window.setTimeout(() => setFlash(null), 3000)
    return () => window.clearTimeout(timer)
  }, [state.error])

  const onAct = (kind: 'fold' | 'continue' | 'raise') => {
    if (!yourTurn) return
    if (kind === 'fold') act({ type: 'fold' })
    else if (kind === 'continue')
      act({ type: legal.canCheck ? 'check' : 'call' })
    else if (legal.canRaise) act({ type: 'raise', to: raiseTo })
  }

  const ended = state.ended
  const next = ended
    ? `Match over: ${ended.netBySeat[view.you] >= 0 ? 'you won' : 'you lost'} ${chips(Math.abs(ended.netBySeat[view.you] ?? 0))} chips.`
    : view.handNo >= (state.table?.handsTotal ?? Infinity)
      ? 'That was the last hand.'
      : 'Next hand in a few seconds.'

  return (
    <>
      <Table
        game={game}
        style="balanced"
        bubble={null}
        paused={false}
        yourTurn={yourTurn}
        guidedStep={null}
        showBubbles={false}
        onTogglePause={noop}
        onHistory={noop}
        onSettings={noop}
        onSkipGuided={noop}
        runout={runout}
        versus={{ opponent }}
      />
      <ActionBar
        game={game}
        legal={legal}
        yourTurn={yourTurn && !state.pending}
        heroTurn={yourTurn}
        paused={false}
        raiseTo={raiseTo}
        presets={presets}
        math={{
          revealed: false,
          ready: false,
          breakEven: legal.toCall / (game.pot + legal.toCall || 1),
        }}
        guess={{
          show: false,
          value: 0.5,
          locked: null,
          onChange: noop,
          onLock: noop,
          onSkip: noop,
        }}
        shortcuts={false}
        onRaiseTo={(to) => setSizing({ id: decision, to })}
        onAct={onAct}
        onDeal={noop}
        onReview={noop}
        revealing={runout.revealing}
        versus={{ opponent, next }}
      />
      {ended && (
        <div className="live-ended" role="status">
          <strong>
            {ended.reason === 'forfeit'
              ? ended.forfeit === view.you
                ? 'Match over: you ran out of time three times in a row.'
                : `Match over: ${opponent} ran out of time three times in a row.`
              : 'Match over.'}
          </strong>{' '}
          <a href="#lobby">Back to the lobby</a>
        </div>
      )}
      <HandReviews state={state} you={view.you} />
      {flash && (
        <p className="live-error" role="alert">
          {flash}
        </p>
      )}
    </>
  )
}

/** Finished hands of this match, newest first, one open at a time. */
function HandReviews({ state, you }: { state: TableState; you: SeatId }) {
  const done = Object.keys(state.hands)
    .map(Number)
    .filter((n) => state.hands[n].record)
    .sort((a, b) => b - a)
  const [open, setOpen] = useState<number | null>(null)
  if (!done.length) return null
  const latest = done[0]
  const at = open !== null && state.hands[open]?.record ? open : null
  const index = at === null ? -1 : done.indexOf(at)
  return (
    <div className="live-reviews">
      {at === null ? (
        <button className="btn btn-outline" onClick={() => setOpen(latest)}>
          Review hand {latest}
        </button>
      ) : (
        <>
          <div className="live-row live-review-nav">
            <button
              className="btn btn-outline"
              disabled={index >= done.length - 1}
              onClick={() => setOpen(done[index + 1])}
            >
              Earlier hand
            </button>
            <button
              className="btn btn-outline"
              disabled={index <= 0}
              onClick={() => setOpen(done[index - 1])}
            >
              Later hand
            </button>
            <button className="btn" onClick={() => setOpen(null)}>
              Close review
            </button>
          </div>
          <ReviewLive seen={state.hands[at]} you={you} />
        </>
      )}
    </div>
  )
}
