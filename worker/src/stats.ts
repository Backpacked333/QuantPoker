// Hands per day, readable without SQL: GET /api/stats counts archived and
// verified hands per UTC day from the public `hands` table (publishable key,
// head counts only), cached per isolate so the page cannot load Postgres.
import { now } from './clock'
import type { WorkerEnv } from './env'
import { describeError, logEvent } from './log'

export const STATS_DAYS = 7
export const STATS_TTL_MS = 300_000
const DAY_MS = 86_400_000

let cached: { at: number; body: unknown } | null = null

/** Drops the cached answer (tests). */
export function forgetStats() {
  cached = null
}

export async function handsPerDay(env: WorkerEnv) {
  const t = now()
  if (cached && t - cached.at < STATS_TTL_MS) return Response.json(cached.body)
  const today = t - (t % DAY_MS)
  try {
    const handsPerDay = await Promise.all(
      Array.from({ length: STATS_DAYS }, async (_, i) => {
        const from = today - i * DAY_MS
        const [hands, verified] = await Promise.all([
          count(env, from, false),
          count(env, from, true),
        ])
        return {
          day: new Date(from).toISOString().slice(0, 10),
          hands,
          verified,
        }
      }),
    )
    cached = { at: t, body: { handsPerDay } }
    return Response.json(cached.body)
  } catch (error) {
    logEvent('error', { reason: 'stats', detail: describeError(error) })
    return Response.json({ error: 'archive unavailable' }, { status: 503 })
  }
}

/** Hands archived on the UTC day starting at `from` (only verified ones). */
async function count(env: WorkerEnv, from: number, verifiedOnly: boolean) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/hands`)
  url.searchParams.set('select', 'id')
  url.searchParams.set('limit', '0')
  url.searchParams.append('created_at', `gte.${new Date(from).toISOString()}`)
  url.searchParams.append(
    'created_at',
    `lt.${new Date(from + DAY_MS).toISOString()}`,
  )
  if (verifiedOnly) url.searchParams.set('verified', 'is.true')
  const response = await fetch(url, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Prefer: 'count=exact' },
  })
  const total = Number(response.headers.get('Content-Range')?.split('/')[1])
  if (!response.ok || !Number.isSafeInteger(total))
    throw new Error(`hands count ${response.status}`)
  return total
}
