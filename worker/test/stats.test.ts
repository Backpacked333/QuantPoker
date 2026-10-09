// Hands per day, readable in a browser without SQL: GET /api/stats counts
// archived and verified hands per UTC day from the public archive, with the
// publishable key, and caches the answer so the page cannot load Postgres.
import { env, SELF } from 'cloudflare:test'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { STATS_DAYS, STATS_TTL_MS, forgetStats } from '../src/stats'
import { ORIGIN } from './helpers'

let asked: URL[] = []
let down = false
/** Hands per day in the fake archive, and how many of them are verified. */
const archive: Record<string, { hands: number; verified: number }> = {
  '2026-10-09': { hands: 120, verified: 118 },
  '2026-10-08': { hands: 75, verified: 75 },
}

beforeAll(() => {
  const realFetch = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.origin !== new URL(env.SUPABASE_URL).origin)
        return realFetch(input, init)
      asked.push(url)
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY)
      expect(headers.get('Prefer')).toBe('count=exact')
      if (down) return new Response('down', { status: 503 })
      const from = url.searchParams.getAll('created_at')[0].slice(4, 14)
      const day = archive[from] ?? { hands: 0, verified: 0 }
      const n = url.searchParams.get('verified') ? day.verified : day.hands
      return new Response(null, {
        status: 206,
        headers: { 'Content-Range': `*/${n}` },
      })
    },
  )
})
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  asked = []
  down = false
  forgetStats()
})

const stats = () => SELF.fetch(`${ORIGIN}/api/stats`)

describe('GET /api/stats', () => {
  it(`counts archived and verified hands for each of the last ${STATS_DAYS} UTC days, newest first`, async () => {
    const response = await stats()
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      handsPerDay: { day: string; hands: number; verified: number }[]
    }
    expect(body.handsPerDay).toHaveLength(STATS_DAYS)
    const days = body.handsPerDay.map((d) => d.day)
    expect([...days].sort().reverse()).toEqual(days)
    for (const d of body.handsPerDay)
      expect(d).toEqual({
        day: d.day,
        ...(archive[d.day] ?? { hands: 0, verified: 0 }),
      })
    // Only head counts, by created_at, from the public hands table.
    for (const url of asked) {
      expect(url.pathname).toBe('/rest/v1/hands')
      expect(url.searchParams.get('select')).toBe('id')
      expect(url.searchParams.get('limit')).toBe('0')
    }
  })

  it(`asks the archive at most once per ${STATS_TTL_MS / 1000} s`, async () => {
    await stats()
    const first = asked.length
    expect(first).toBe(2 * STATS_DAYS)
    await stats()
    await stats()
    expect(asked.length).toBe(first)
  })

  it('says so when the archive cannot be reached', async () => {
    down = true
    const response = await stats()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'archive unavailable' })
  })
})
