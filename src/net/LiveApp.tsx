// The online area (#lobby). Lazy-loaded so the account client never reaches
// the entry chunk; the trainer works without any of this.
import { useEffect, useState } from 'react'
import { AuthGate } from './AuthGate'
import { Lobby } from './Lobby'
import { loadOnline } from './supabase'
import type { Online } from './supabase'
import './live.css'

export default function LiveApp() {
  const [online, setOnline] = useState<Online | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void loadOnline().then((found) => live && setOnline(found))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="page live-page">
      <header className="page-head">
        <h1>Play online</h1>
        <p>Real opponents, play money, every hand reviewable afterwards.</p>
      </header>
      {online === undefined ? (
        <p className="live-status" role="status">
          Connecting…
        </p>
      ) : (
        <AuthGate
          client={online?.client ?? null}
          url={online?.url ?? ''}
          apiKey={online?.key ?? ''}
        >
          {(player, signOut) => <Lobby player={player} onSignOut={signOut} />}
        </AuthGate>
      )}
    </div>
  )
}
