// The online area: #lobby and #play/<matchId>. Lazy-loaded so the account
// client never reaches the entry chunk; the trainer works without any of it.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useHash } from '../lib/navigation'
import { devIdentity } from './api'
import type { Identity } from './api'
import { AuthGate } from './AuthGate'
import { LiveTable } from './LiveTable'
import { Lobby } from './Lobby'
import { loadOnline } from './supabase'
import type { Online } from './supabase'
import './live.css'

const PLAY = /^#play\/([0-9a-f-]{36})$/

export default function LiveApp() {
  const hash = useHash()
  const matchId = hash.match(PLAY)?.[1] ?? null
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

  const content = (identity: Identity): ReactNode =>
    matchId ? (
      <LiveTable key={matchId} matchId={matchId} identity={identity} />
    ) : (
      <Lobby identity={identity} />
    )

  return (
    <div className={`page live-page ${matchId ? 'live-page-table' : ''}`}>
      {!matchId && (
        <header className="page-head">
          <h1>Play online</h1>
          <p>Real opponents, play money, every hand reviewable afterwards.</p>
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
