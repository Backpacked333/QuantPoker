// The online area: #lobby, #play/<matchId> and the public #ladder[/month].
// Lazy-loaded so the account client never reaches the entry chunk; the
// trainer works without any of it.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useHash } from '../lib/navigation'
import { devIdentity } from './api'
import type { Identity } from './api'
import { AuthGate } from './AuthGate'
import { Ladder } from './Ladder'
import { LiveTable } from './LiveTable'
import { Lobby } from './Lobby'
import { loadOnline } from './supabase'
import type { Online } from './supabase'
import './live.css'

const PLAY = /^#play\/([0-9a-f-]{36})$/
const LADDER = /^#ladder(\/month)?$/

export default function LiveApp() {
  const hash = useHash()
  const matchId = hash.match(PLAY)?.[1] ?? null
  const ladder = hash.match(LADDER)
  const [dev] = useState(devIdentity)
  const [online, setOnline] = useState<Online | null | undefined>(undefined)
  useEffect(() => {
    if (dev) return
    let live = true
    void loadOnline().then((found) => live && setOnline(found))
    return () => {
      live = false
    }
  }, [dev])

  // #lobby/find starts looking straight away ("Find another match"); the
  // hash goes back to #lobby so a reload does not queue again. Derived from
  // the live hash: this component stays mounted from #play/<id> to here.
  // (replaceState fires no hashchange, so `hash` keeps the value until the
  // next navigation, and the Lobby queues once on mount.)
  const autoFind = hash === '#lobby/find'
  useEffect(() => {
    if (hash === '#lobby/find') window.history.replaceState(null, '', '#lobby')
  }, [hash])

  const content = (identity: Identity): ReactNode =>
    matchId ? (
      <LiveTable key={matchId} matchId={matchId} identity={identity} />
    ) : (
      <Lobby
        identity={identity}
        autoFind={autoFind}
        client={online?.client ?? null}
      />
    )

  // The ladder is public: no sign-in, read with the anonymous key.
  if (ladder)
    return (
      <div className="page live-page">
        <header className="page-head">
          <h1>Ladder</h1>
          <p>Rated heads-up: 40 hands a match, with all-in luck taken out.</p>
          <p className="live-muted">
            <a href="#lobby">Play rated</a> · <a href="#fair-play">Fair play</a>
          </p>
        </header>
        {online === undefined && !dev ? (
          <p className="live-status" role="status">
            Connecting…
          </p>
        ) : online ? (
          <Ladder
            key={ladder[1] ? 'month' : 'all'}
            client={online.client}
            view={ladder[1] ? 'month' : 'all'}
          />
        ) : (
          <p className="live-muted" role="status">
            The ladder is not available on this site: it has no account service
            configured.
          </p>
        )}
      </div>
    )

  return (
    <div className={`page live-page ${matchId ? 'live-page-table' : ''}`}>
      {!matchId && (
        <header className="page-head">
          <h1>Play online</h1>
          <p>Real opponents, play money, every hand reviewable afterwards.</p>
          <p className="live-muted">
            <a href="#ladder">Ladder</a> · <a href="#fair-play">Fair play</a> ·{' '}
            <a href="#terms">Terms</a>
          </p>
        </header>
      )}
      {dev ? (
        content(dev)
      ) : online === undefined ? (
        <p className="live-status" role="status">
          Connecting…
        </p>
      ) : (
        <AuthGate
          client={online?.client ?? null}
          url={online?.url ?? ''}
          apiKey={online?.key ?? ''}
        >
          {content}
        </AuthGate>
      )}
    </div>
  )
}
