import { BookOpen, Swords, Users } from 'lucide-react'
import type { Player } from './players'

/**
 * The online home. Quick-match arrives with the table server (Phase 0 steps
 * 3–6); until then the cards say so plainly rather than pretending.
 */
export function Lobby({
  player,
  onSignOut,
}: {
  player: Player
  onSignOut: () => void
}) {
  return (
    <>
      <div className="live-account">
        <span>
          Signed in as <b>{player.username}</b>
        </span>
        <button className="btn btn-quiet" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <div className="live-cards">
        <article className="panel live-card">
          <Swords size={22} />
          <h2>Play 1v1</h2>
          <p>Heads-up against a real opponent near your level.</p>
          <button
            className="btn btn-primary"
            disabled
            aria-describedby="hu-soon"
          >
            Find a match
          </button>
          <p id="hu-soon" className="live-muted">
            Opening soon: the table server is being built.
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
