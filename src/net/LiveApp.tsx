// The online area (#lobby). Lazy-loaded so the account client never reaches
// the entry chunk; the trainer works without any of this.
import { AuthGate } from './AuthGate'
import { Lobby } from './Lobby'
import { supabase, SUPABASE_KEY, SUPABASE_URL } from './supabase'
import './live.css'

export default function LiveApp() {
  return (
    <div className="page live-page">
      <header className="page-head">
        <h1>Play online</h1>
        <p>Real opponents, play money, every hand reviewable afterwards.</p>
      </header>
      <AuthGate client={supabase} url={SUPABASE_URL} apiKey={SUPABASE_KEY}>
        {(player, signOut) => <Lobby player={player} onSignOut={signOut} />}
      </AuthGate>
    </div>
  )
}
