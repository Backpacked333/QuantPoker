// The ladder (P1-14): eligible players by rating, all time or this month,
// read a page at a time from public.ladder and public.ladder_month
// (supabase/migrations/…_ladder.sql) with a keyset cursor. Ratings are
// public, so anyone can read it, signed in or not.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ACTIVE_DAYS,
  isProvisional,
  MAX_ABANDONMENT,
  matchesToGo,
  PROVISIONAL_MATCHES,
  PROVISIONAL_RD,
} from '../rating/rules'

/** Rows per page; one more is asked for to know whether a next page exists. */
export const LADDER_PAGE = 50

export type LadderView = 'all' | 'month'

export type LadderRow = {
  userId: string
  username: string
  rating: number
  rd: number
  /** All time, or this month's on the month view. */
  matches: number
  wins: number
  draws: number
  accuracy: number | null
  /** Rating change over 30 days (all time) or over the month. */
  trend: number | null
}

/** Where a page starts: the last row of the page before. */
export type Cursor = { rating: number; userId: string }

type Row = {
  user_id: string
  username: string
  rating: number
  rd: number
  matches: number
  wins: number
  draws: number
  accuracy: number | null
  trend: number | null
}

export async function loadLadder(
  client: SupabaseClient,
  view: LadderView,
  after: Cursor | null,
): Promise<{ rows: LadderRow[]; more: boolean }> {
  const { data, error } = await client.rpc(
    view === 'month' ? 'ladder_month' : 'ladder',
    {
      p_format: 'hu-duplicate',
      p_after_rating: after?.rating ?? null,
      p_after_user: after?.userId ?? null,
      p_page: LADDER_PAGE + 1,
    },
  )
  if (error) throw error
  const rows = ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    rating: Number(r.rating),
    rd: Number(r.rd),
    matches: r.matches,
    wins: r.wins,
    draws: r.draws,
    accuracy: r.accuracy === null ? null : Number(r.accuracy),
    trend: r.trend === null ? null : Number(r.trend),
  }))
  return { rows: rows.slice(0, LADDER_PAGE), more: rows.length > LADDER_PAGE }
}

/** "1534 ± 92": the rating never appears without its uncertainty. */
export const ratingText = ({ rating, rd }: { rating: number; rd: number }) =>
  `${Math.round(rating)} ± ${Math.round(rd)}`

export const winRate = ({
  wins,
  matches,
}: {
  wins: number
  matches: number
}) => (matches ? `${Math.round((100 * wins) / matches)}%` : '–')

export const trendText = (trend: number | null) => {
  if (trend === null) return '–'
  const n = Math.round(trend)
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

/** The viewer's own ratings row, for the line above the ladder. */
export type Standing = {
  rating: number
  rd: number
  matches: number
  abandoned: number
  lastMatchAt: string | null
}

export async function loadStanding(
  client: SupabaseClient,
  userId: string,
): Promise<Standing | null> {
  const { data, error } = await client
    .from('ratings')
    .select('rating, rd, matches, abandoned, last_match_at')
    .eq('user_id', userId)
    .eq('format', 'hu-duplicate')
    .maybeSingle<{
      rating: number
      rd: number
      matches: number
      abandoned: number
      last_match_at: string | null
    }>()
  if (error) throw error
  if (!data) return null
  return {
    rating: Number(data.rating),
    rd: Number(data.rd),
    matches: data.matches,
    abandoned: data.abandoned,
    lastMatchAt: data.last_match_at,
  }
}

const DAY = 86_400_000

/**
 * Where the viewer stands, in one line: provisional players see how many
 * matches are left; established players off the ladder see why. The rules
 * are the ladder's own (src/rating/rules.ts, applied again in SQL).
 */
export function standingLine(s: Standing | null, now: number): string {
  if (!s || s.matches === 0)
    return `You have no rated matches yet. Your rating appears on the ladder after ${PROVISIONAL_MATCHES}.`
  const yours = `Your rating is ${ratingText(s)}`
  if (isProvisional(s)) {
    const left = matchesToGo(s)
    return left > 0
      ? `${yours}, provisional: ${left} rated ${left === 1 ? 'match' : 'matches'} to go.`
      : `${yours}, provisional until the ± is under ${PROVISIONAL_RD}: keep playing rated matches.`
  }
  // Exactly 10% is out, as in the SQL (10 * abandoned < matches stays on).
  if (s.abandoned / s.matches >= MAX_ABANDONMENT)
    return `${yours}. You are off the ladder while abandoned matches are ${Math.round(MAX_ABANDONMENT * 100)}% or more of your rated matches (${s.abandoned} of ${s.matches}).`
  if (!s.lastMatchAt || now - Date.parse(s.lastMatchAt) > ACTIVE_DAYS * DAY)
    return `${yours}. You are off the ladder until you play a rated match: your last was over ${ACTIVE_DAYS} days ago.`
  return `${yours}. You are on the ladder.`
}
