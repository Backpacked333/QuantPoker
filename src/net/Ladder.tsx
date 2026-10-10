import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCURACY_LABEL } from './accuracy'
import { useAuth } from './auth'
import {
  LADDER_PAGE,
  loadLadder,
  loadStanding,
  ratingText,
  standingLine,
  trendText,
  winRate,
} from './ladder'
import type { Cursor, LadderRow, LadderView } from './ladder'
import {
  ACTIVE_DAYS,
  MAX_ABANDONMENT,
  PROVISIONAL_MATCHES,
  PROVISIONAL_RD,
} from '../rating/rules'

type Page =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: LadderRow[]; more: boolean }

/**
 * The heads-up duplicate ladder (P1-14), all time or this month: rank,
 * player, rating ± RD, accuracy, matches, win rate and trend, a page at a
 * time. Public; a signed-in viewer also sees where they stand. Keyed by
 * view where it is used, so switching period starts again at the top.
 */
export function Ladder({
  client,
  view,
}: {
  client: SupabaseClient
  view: LadderView
}) {
  // cursors[k] starts page k; page 0 starts at the top.
  const [cursors, setCursors] = useState<(Cursor | null)[]>([null])
  const [page, setPage] = useState<Page>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const after = cursors[cursors.length - 1]

  useEffect(() => {
    let live = true
    setPage({ status: 'loading' })
    loadLadder(client, view, after).then(
      ({ rows, more }) => live && setPage({ status: 'ready', rows, more }),
      () => live && setPage({ status: 'error' }),
    )
    return () => {
      live = false
    }
  }, [client, view, after, attempt])

  const first = (cursors.length - 1) * LADDER_PAGE
  const month = view === 'month'
  return (
    <section className="panel live-ladder" aria-labelledby="ladder-title">
      <h2 id="ladder-title">Heads-up duplicate ladder</h2>
      <nav className="live-ladder-views" aria-label="Ladder period">
        <a href="#ladder" aria-current={month ? undefined : 'page'}>
          All time
        </a>
        <a href="#ladder/month" aria-current={month ? 'page' : undefined}>
          This month
        </a>
      </nav>
      <Standing client={client} />
      <p className="live-muted">
        Glicko-2 ratings, always shown with their uncertainty (the ±). Players
        appear once the ± is under {PROVISIONAL_RD} and they have played{' '}
        {PROVISIONAL_MATCHES} rated matches, with a rated match in the last{' '}
        {ACTIVE_DAYS} days and fewer than {Math.round(MAX_ABANDONMENT * 100)}%
        of rated matches abandoned.
        {month &&
          ' This month lists players with a rated match this month (UTC), with that month’s matches, win rate and change.'}
      </p>
      {page.status === 'loading' ? (
        <p className="live-muted" role="status">
          Loading the ladder…
        </p>
      ) : page.status === 'error' ? (
        <div role="alert">
          <p className="live-error">The ladder could not be loaded.</p>
          <button
            className="btn btn-outline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      ) : page.rows.length === 0 && cursors.length === 1 ? (
        <p className="live-muted" role="status">
          {month
            ? 'Nobody on the ladder has played a rated match this month yet.'
            : 'Nobody is on the ladder yet.'}
        </p>
      ) : (
        <>
          <div
            className="live-ladder-scroll"
            tabIndex={0}
            role="region"
            aria-label="Ladder table, scrolls sideways"
          >
            <table>
              <caption className="sr-only">
                {month ? 'This month' : 'All time'}, ranks {first + 1} to{' '}
                {first + page.rows.length}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Rating ± RD</th>
                  <th scope="col">Accuracy</th>
                  <th scope="col">Matches</th>
                  <th scope="col">Win rate</th>
                  <th scope="col">{month ? 'This month' : '30 days'}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r, i) => (
                  <tr key={r.userId}>
                    <td>{first + i + 1}</td>
                    <th scope="row">{r.username}</th>
                    <td>{ratingText(r)}</td>
                    <td>
                      {r.accuracy === null ? '–' : Math.round(r.accuracy)}
                    </td>
                    <td>{r.matches}</td>
                    <td>{winRate(r)}</td>
                    <td
                      className={
                        r.trend && Math.round(r.trend) > 0
                          ? 'live-good'
                          : undefined
                      }
                    >
                      {trendText(r.trend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="live-muted live-ladder-note">
            Accuracy: {ACCURACY_LABEL} Win rate counts wins only; a result
            within 2 bb is a draw.
          </p>
          <div className="live-row live-ladder-pages">
            <button
              className="btn btn-outline"
              disabled={cursors.length === 1}
              onClick={() => setCursors((c) => c.slice(0, -1))}
            >
              Previous page
            </button>
            <button
              className="btn btn-outline"
              disabled={!page.more}
              onClick={() => {
                const last = page.rows[page.rows.length - 1]
                setCursors((c) => [
                  ...c,
                  { rating: last.rating, userId: last.userId },
                ])
              }}
            >
              Next page
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** The signed-in viewer's line: matches to go, or why they are off it. */
function Standing({ client }: { client: SupabaseClient }) {
  const auth = useAuth(client)
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null
  const [line, setLine] = useState<string | null>(null)
  useEffect(() => {
    if (!userId) return setLine(null)
    let live = true
    loadStanding(client, userId).then(
      (s) => live && setLine(standingLine(s, Date.now())),
      () => live && setLine(null),
    )
    return () => {
      live = false
    }
  }, [client, userId])
  return line ? <p className="live-standing">{line}</p> : null
}
