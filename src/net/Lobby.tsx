import { useState } from 'react'
import { BookOpen, Link2, Swords, Users } from 'lucide-react'
import { createMatch } from './api'
import type { Identity } from './api'

/**
 * The online home. A table by link works now; quick-match arrives with the
 * matchmaking queue (Phase 0 step 6), so its card says so plainly.
 */
export function Lobby({
  identity,
  fetcher,
}: {
  identity: Identity
  fetcher?: typeof fetch
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const playFriend = async () => {
    setBusy(true)
    setError(null)
    const result = await createMatch(identity.getToken, fetcher)
    setBusy(false)
    if (result.ok) window.location.hash = `#play/${result.matchId}`
    else setError(result.reason)
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
      <div className="live-cards">
        <article className="panel live-card">
          <Link2 size={22} />
          <h2>Play a friend</h2>
          <p>Open a heads-up table and send the link. 20 hands, play money.</p>
          <button
            className="btn btn-primary"
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
          <Swords size={22} />
          <h2>Play 1v1</h2>
          <p>Heads-up against a real opponent near your level.</p>
          <button
            className="btn btn-outline"
            disabled
            aria-describedby="hu-soon"
          >
            Find a match
          </button>
          <p id="hu-soon" className="live-muted">
            Opening soon: matchmaking is being built.
          </p>
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
