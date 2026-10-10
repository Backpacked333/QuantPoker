import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LineChart } from '../components/progress/Charts'
import {
  ACCURACY_LABEL,
  GRADE_NAMES,
  loadAccuracy,
  loadLuck,
  luckSeries,
} from './accuracy'
import type { Accuracy, LuckRow } from './accuracy'

const TITLE: Record<(typeof GRADE_NAMES)[number], string> = {
  best: 'Best',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
}

const bb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} bb`

type Loaded = { accuracy: Accuracy | null; luck: LuckRow[] }

/**
 * A player's rated play (P1-10): accuracy over their latest graded
 * decisions, the grade distribution, and luck versus skill across their
 * rated matches. Only matches that are over count; reusable on the profile.
 */
export function AccuracyPanel({
  client,
  userId,
  subject,
}: {
  client: SupabaseClient
  userId: string
  /** Whose numbers, on someone else's profile; "your" when absent. */
  subject?: string
}) {
  const [state, setState] = useState<Loaded | 'loading' | 'error'>('loading')

  useEffect(() => {
    let live = true
    setState('loading')
    Promise.all([loadAccuracy(client, userId), loadLuck(client, userId)]).then(
      ([accuracy, luck]) => live && setState({ accuracy, luck }),
      () => live && setState('error'),
    )
    return () => {
      live = false
    }
  }, [client, userId])

  return (
    <section className="panel live-accuracy" aria-labelledby="accuracy-title">
      <h2 id="accuracy-title">Rated play</h2>
      {state === 'loading' ? (
        <p className="live-muted" role="status">
          Loading…
        </p>
      ) : state === 'error' ? (
        <p className="live-muted" role="status">
          Accuracy could not be loaded. Try again later.
        </p>
      ) : (
        <Loaded {...state} subject={subject} />
      )}
    </section>
  )
}

function Loaded({ accuracy, luck, subject }: Loaded & { subject?: string }) {
  const whose = subject ? `${subject}’s` : 'your'
  const series = luckSeries(luck)
  const most = accuracy ? Math.max(1, ...Object.values(accuracy.counts)) : 1
  return (
    <>
      <div className="tile live-accuracy-tile">
        <span className="label">{ACCURACY_LABEL}</span>
        {accuracy ? (
          <>
            <strong>{Math.round(accuracy.accuracy)}</strong>
            <small>
              over {whose} last {accuracy.graded} graded decisions in rated
              matches
            </small>
          </>
        ) : (
          <strong className="live-accuracy-empty">Not graded yet</strong>
        )}
      </div>
      {accuracy && (
        <div className="grade-bars" aria-label="Grade distribution">
          {GRADE_NAMES.map((g) => (
            <div key={g}>
              <span className={`grade grade-${g}`}>{TITLE[g]}</span>
              <span className="grade-track">
                <i
                  className={`grade-fill grade-${g}`}
                  style={{ width: `${(accuracy.counts[g] / most) * 100}%` }}
                />
              </span>
              <b>{accuracy.counts[g]}</b>
            </div>
          ))}
        </div>
      )}
      {luck.length > 0 && (
        <div className="live-accuracy-luck">
          <h3>Luck versus skill</h3>
          <p className="live-muted">
            {subject ? `${subject}’s` : 'Your'} result across {luck.length}{' '}
            rated hands against the same hands with every all-in settled at
            equity. The gap is all-in luck:{' '}
            {bb(series.result[luck.length] - series.skill[luck.length])}.
          </p>
          <div className="legend">
            <span>
              <i className="series-key actual" /> Result
            </span>
            <span>
              <i className="series-key expected" /> All-in luck taken out
            </span>
          </div>
          <LineChart
            width={560}
            height={180}
            label="Cumulative big blinds across rated matches: result versus all-in luck taken out"
            format={(v) => `${Math.round(v)}`}
            // The series starts at 0 before the first hand.
            ends={['Before hand 1', `Hand ${luck.length}`]}
            series={[
              {
                label: 'All-in luck taken out',
                className: 'expected',
                values: series.skill,
              },
              { label: 'Result', className: 'actual', values: series.result },
            ]}
          />
        </div>
      )}
    </>
  )
}
