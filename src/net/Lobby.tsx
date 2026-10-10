import { useEffect, useState } from 'react'
import { BookOpen, Link2, Swords, Trophy, Users } from 'lucide-react'
import type { MatchKind } from '../shared/protocol'
import { createMatch, fetchActiveMatch } from './api'
import type { Identity } from './api'
import type { LobbyState } from './lobbyClient'
import { useLobby } from './useLobby'

/** With nobody else queued this long, offer a way out. */
export const BAIL_OUT_MS = 60_000

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The online home: quick match, a table by link, and the trainer. */
export function Lobby({
  identity,
  fetcher,
  autoFind = false,
}: {
  identity: Identity
  fetcher?: typeof fetch
  /** Start looking for a match on arrival (from "Find another match"). */
  autoFind?: boolean
}) {
  const { state, connection } = useLobby(identity.getToken)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void fetchActiveMatch(identity.getToken, fetcher).then(
      (found) => live && setActive(found),
    )
    return () => {
      live = false
    }
  }, [identity.getToken, fetcher])

  useEffect(() => {
    if (autoFind && connection) connection.find()
  }, [autoFind, connection])

  // Paired (or sent back to a table in play): go there.
  const matched = state.matched?.matchId
  useEffect(() => {
    if (matched) window.location.hash = `#play/${matched}`
  }, [matched])

  const playFriend = async () => {
    setBusy(true)
    setError(null)
    const result = await createMatch(identity.getToken, fetcher)
    setBusy(false)
    if (result.ok) window.location.hash = `#play/${result.matchId}`
    else {
      setError(result.reason)
      if (result.activeMatch) setActive(result.activeMatch)
    }
  }

  return (
    <>
      <div className="live-account">
        <span>
          Signed in as <b>{identity.player.username}</b>
        </span>
        <button className="btn btn-quiet" onClick={identity.signOut}>
          Sign out
        </button>
      </div>
      {active && (
        <p className="panel live-active" role="status">
          You have a match in progress.{' '}
          <a href={`#play/${active}`}>Return to your table</a>
        </p>
      )}
      <div className="live-cards">
        <article className="panel live-card">
          <Swords size={22} />
          <h2>Play 1v1</h2>
          <p>Heads-up against the next player looking. 20 hands, casual.</p>
          <QuickMatch
            state={state}
            kind="hu-casual"
            label="Find a match"
            onFind={() => connection?.find()}
            onCancel={() => connection?.cancel()}
          />
        </article>
        <article className="panel live-card">
          <Trophy size={22} />
          <h2>Play rated 1v1</h2>
          <p>
            40 hands. All-in luck is taken out by settling those pots at equity,
            and a result within 2 bb is a draw.
          </p>
          <QuickMatch
            state={state}
            kind="hu-rated"
            label="Find a rated match"
            presence={false}
            onFind={() => connection?.find('hu-rated')}
            onCancel={() => connection?.cancel()}
          />
          {state.refused && (
            <p className="live-error" role="alert">
              {state.refused}
            </p>
          )}
        </article>
        <article className="panel live-card">
          <Link2 size={22} />
          <h2>Play a friend</h2>
          <p>Open a heads-up table and send the link. 20 hands, play money.</p>
          <button
            className="btn btn-outline"
            disabled={busy}
            onClick={() => void playFriend()}
          >
            {busy ? 'Opening a table…' : 'Play a friend by link'}
          </button>
          {error && (
            <p className="live-error" role="alert">
              {error}
            </p>
          )}
        </article>
        <article className="panel live-card">
          <Users size={22} />
          <h2>6-max tables</h2>
          <p>Six seats, side pots and scheduled arenas.</p>
          <p className="live-muted">Coming after heads-up.</p>
        </article>
        <article className="panel live-card">
          <BookOpen size={22} />
          <h2>Practice vs Atlas</h2>
          <p>The trainer with the full quant lab, any time.</p>
          <a className="btn btn-outline" href="#table">
            Go to the table
          </a>
        </article>
      </div>
    </>
  )
}

function QuickMatch({
  state,
  kind,
  label,
  presence = true,
  onFind,
  onCancel,
}: {
  state: LobbyState
  kind: MatchKind
  label: string
  /** The lobby-wide line (who is here, connecting): shown on one card. */
  presence?: boolean
  onFind: () => void
  onCancel: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [keepWaiting, setKeepWaiting] = useState(false)
  // One queue at a time: the other card waits while this one looks.
  const looking = state.looking && state.kind === kind
  const elsewhere = state.looking && state.kind !== kind
  useEffect(() => {
    if (!looking) return
    setStartedAt(Date.now())
    setKeepWaiting(false)
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [looking])

  const others = Math.max(0, (state.presence?.online ?? 1) - 1)
  if (!looking)
    return (
      <>
        <button
          className="btn btn-primary"
          onClick={onFind}
          disabled={elsewhere}
        >
          {label}
        </button>
        {presence && (
          <p className="live-muted">
            {state.presence
              ? others === 0
                ? 'Nobody else is in the lobby right now.'
                : `${others} other ${others === 1 ? 'player' : 'players'} in the lobby.`
              : state.status === 'failed'
                ? (state.error ?? 'The lobby is unavailable.')
                : 'Connecting to the lobby…'}
          </p>
        )}
      </>
    )

  const waited = startedAt === null ? 0 : now - startedAt
  // Only this card's line can pair: count it alone.
  const counts = state.presence
  const inLine = counts
    ? kind === 'hu-rated'
      ? counts.rated
      : counts.queued - counts.rated
    : 1
  const alone = inLine <= 1
  return (
    <div className="live-looking" role="status" aria-live="polite">
      <p>
        <strong>Looking for an opponent</strong>{' '}
        <span className="live-clock">{clock(waited)}</span>
      </p>
      {state.status === 'reconnecting' && (
        <p className="live-warn">
          {state.error ?? 'Reconnecting to the lobby…'}
        </p>
      )}
      {waited >= BAIL_OUT_MS && alone && !keepWaiting ? (
        <>
          <p className="live-muted">
            Nobody else is looking right now. Keep waiting, or practise against
            Atlas and come back later.
          </p>
          <div className="live-row">
            <button
              className="btn btn-outline"
              onClick={() => setKeepWaiting(true)}
            >
              Keep waiting
            </button>
            <a className="btn btn-outline" href="#table" onClick={onCancel}>
              Practice vs Atlas
            </a>
          </div>
        </>
      ) : (
        <button className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
