// GET /u/<username>: the app's page with a link preview for that player
// (P1-15/16), so a shared profile shows the player and their rating on
// LinkedIn or in a chat. Profiles are public: the name and rating ± RD are
// read with the publishable key and written into index.html's preview tags
// with HTMLRewriter's setAttribute, which escapes every value. The app then
// routes the path to #u/<username> (src/lib/profilePath.ts).
import { isProvisional } from '../../src/rating/rules'
import type { WorkerEnv } from './env'
import { describeError, logEvent } from './log'

const PROFILE_PATH = /^\/u\/([a-z0-9_]{3,20})\/?$/
/** The share card, 1200 × 630 (public/og-default.png, scripts/og-card.ts). */
export const OG_IMAGE = '/og-default.png'

type Found = {
  username: string
  ratings: { rating: number; rd: number; matches: number }[]
}

type Preview = { status: number; title: string; description: string }

const GENERIC = {
  title: 'QuantPoker',
  description:
    'Rated heads-up poker with the luck taken out: ratings shown with their uncertainty, accuracy, and every hand reviewable.',
}

async function lookUp(env: WorkerEnv, name: string): Promise<Found | null> {
  const url = new URL('/rest/v1/players', env.SUPABASE_URL)
  url.searchParams.set('select', 'username,ratings(rating,rd,matches)')
  url.searchParams.set('username', `eq.${name}`)
  url.searchParams.set('ratings.format', 'eq.hu-duplicate')
  const response = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Accept: 'application/json',
    },
  })
  if (!response.ok) throw new Error(`players: ${response.status}`)
  const rows = (await response.json()) as Found[]
  return rows[0] ?? null
}

/**
 * What the preview says about a player: their name as validated from the
 * path ([a-z0-9_] only, so it can hold no markup) and public numbers.
 */
export function describePlayer(name: string, found: Found): string {
  const r = found.ratings[0]
  if (!r || r.matches === 0)
    return `${name} plays rated heads-up poker on QuantPoker.`
  const rating = `${Math.round(r.rating)} ± ${Math.round(r.rd)}`
  const played = `${r.matches} rated heads-up ${r.matches === 1 ? 'match' : 'matches'}`
  return isProvisional(r)
    ? `Provisional rating ${rating} after ${played} on QuantPoker.`
    : `Rating ${rating} over ${played} on QuantPoker.`
}

async function preview(env: WorkerEnv, name: string | undefined) {
  if (!name) return { status: 404, ...GENERIC }
  try {
    const found = await lookUp(env, name)
    if (!found) return { status: 404, ...GENERIC }
    return {
      status: 200,
      title: `${name} · QuantPoker`,
      description: describePlayer(name, found),
    }
  } catch (error) {
    // The page still loads; only its preview is generic.
    logEvent('error', { reason: 'profile', detail: describeError(error) })
    return { status: 200, ...GENERIC }
  }
}

/** How long a preview is reused at the edge: one read per name per minute. */
export const PREVIEW_TTL_S = 60

export async function profilePage(
  request: Request,
  env: WorkerEnv,
  {
    assets = env.ASSETS,
    cache = caches.default,
  }: { assets?: Pick<Fetcher, 'fetch'>; cache?: Cache } = {},
): Promise<Response> {
  const url = new URL(request.url)
  // Repeated requests for one profile are answered from the edge cache, so
  // nobody can turn page loads into Postgres reads.
  const key = new Request(`${url.origin}${url.pathname}`)
  const hit = await cache.match(key)
  if (hit) return hit
  const name = url.pathname.match(PROFILE_PATH)?.[1]
  const [page, shown]: [Response, Preview] = await Promise.all([
    assets.fetch(new Request(new URL('/', url))),
    preview(env, name),
  ])
  const content = (value: string) => ({
    element(e: Element) {
      e.setAttribute('content', value)
    },
  })
  const rewritten = new HTMLRewriter()
    .on('title', {
      element(e) {
        e.setInnerContent(shown.title)
      },
    })
    .on('meta[name="description"]', content(shown.description))
    .on('meta[property="og:title"]', content(shown.title))
    .on('meta[property="og:description"]', content(shown.description))
    .on('meta[property="og:type"]', content(name ? 'profile' : 'website'))
    .on('meta[property="og:url"]', content(`${url.origin}${url.pathname}`))
    .on('meta[property="og:image"]', content(`${url.origin}${OG_IMAGE}`))
    .transform(page)
  const headers = new Headers(rewritten.headers)
  // The body is no longer index.html's: its validators and length are not ours.
  for (const stale of ['ETag', 'Last-Modified', 'Content-Length'])
    headers.delete(stale)
  headers.set('Cache-Control', `public, max-age=${PREVIEW_TTL_S}`)
  const response = new Response(rewritten.body, {
    status: shown.status,
    headers,
  })
  await cache.put(key, response.clone())
  return response
}
