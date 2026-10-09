// The Worker in front of everything. Static files come from ./dist without
// reaching this code; only /api/* and /ws/* do (see wrangler.jsonc).
import { PROTOCOL } from '../../src/shared/protocol'
import { bearerToken, identify, readSubprotocols } from './auth'
import type { WorkerEnv } from './env'
import { lobbyStub, tableStub } from './lobby'
import { logEvent } from './log'
import type { InitBody } from './table'
import { HANDS_DLQ } from './queues'
import { handsPerDay } from './stats'
import { consumeDeadLetters, consumeHands } from './verify'

export { LobbyDO } from './lobby'
export { TableDO } from './table'

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers })
const MATCH_PATH = /^\/ws\/table\/([0-9a-f-]{36})$/
/** Paths that verify a token and may wake a Durable Object. */
const SIGNED_IN = /^\/(ws\/|api\/(matches|me)$)/

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/api/health')
      return json({ ok: true, protocol: PROTOCOL })

    // Browser-safe settings for the online area, so the static build needs
    // no environment variables.
    if (pathname === '/api/config')
      return json({
        supabaseUrl: env.SUPABASE_URL,
        supabaseKey: env.SUPABASE_PUBLISHABLE_KEY,
      })

    // Hands per day from the archive, for the operator (README §Operations).
    if (pathname === '/api/stats') return handsPerDay(env)

    // One address cannot make the server verify tokens and wake objects
    // without bound. Checked before any token work.
    if (SIGNED_IN.test(pathname) && (await overAddressLimit(request, env))) {
      // The address itself is never logged.
      logEvent('limit_hit', { code: 429, reason: 'address' })
      return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' })
    }

    // Create a heads-up table and a link to share. The creator takes seat 0.
    if (pathname === '/api/matches' && request.method === 'POST') {
      const who = await identify(bearerToken(request), env)
      if (!who) return json({ error: 'unauthorized' }, 401)
      const matchId = crypto.randomUUID()
      // One table per account: finish the one you are playing first. And a
      // daily cap, so one account cannot create tables without end.
      const verdict = await lobbyStub(env).createMatch(who.userId, matchId)
      if (verdict.active)
        return json({ error: 'active', matchId: verdict.active }, 409)
      if (verdict.retryAfter) {
        logEvent('limit_hit', {
          userId: who.userId,
          code: 429,
          reason: 'creates',
        })
        return json(
          { error: 'too_many_tables', retryAfter: verdict.retryAfter },
          429,
          { 'Retry-After': String(verdict.retryAfter) },
        )
      }
      const body: InitBody = { matchId, creator: who }
      const created = await tableStub(env, matchId).fetch(
        'https://table/init',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )
      return created.ok
        ? json({ matchId }, 201)
        : json({ error: 'failed' }, 500)
    }

    // The table this account should be at, so a lobby page can offer it.
    if (pathname === '/api/me') {
      const who = await identify(bearerToken(request), env)
      if (!who) return json({ error: 'unauthorized' }, 401)
      return json({
        activeMatch: await lobbyStub(env).activeFor(who.userId),
      })
    }

    if (pathname === '/ws/lobby') {
      const refused = upgradeRefusal(request)
      if (refused) return refused
      const offered = readSubprotocols(
        request.headers.get('Sec-WebSocket-Protocol'),
      )
      const who = await identify(offered.token, env)
      if (!who) return json({ error: 'unauthorized' }, 401)
      return lobbyStub(env).fetch('https://lobby/connect', {
        headers: {
          Upgrade: 'websocket',
          'x-user-id': who.userId,
          'x-username': who.username,
        },
      })
    }

    const match = pathname.match(MATCH_PATH)
    if (match) {
      const refused = upgradeRefusal(request)
      if (refused) return refused
      const offered = readSubprotocols(
        request.headers.get('Sec-WebSocket-Protocol'),
      )
      const who = await identify(offered.token, env)
      if (!who) return json({ error: 'unauthorized' }, 401)
      return tableStub(env, match[1]).fetch('https://table/connect', {
        headers: {
          Upgrade: 'websocket',
          'x-user-id': who.userId,
          'x-username': who.username,
        },
      })
    }

    if (pathname.startsWith('/api/') || pathname.startsWith('/ws/'))
      return json({ error: 'not found' }, 404)
    return env.ASSETS.fetch(request)
  },

  // Archived hands to re-verify, and those that could not be.
  async queue(batch: MessageBatch, env: WorkerEnv) {
    if (batch.queue === HANDS_DLQ) await consumeDeadLetters(batch, env)
    else await consumeHands(batch, env)
  },
} satisfies ExportedHandler<WorkerEnv>

/**
 * True when this client address is over its per-minute allowance. Cloudflare
 * sets CF-Connecting-IP on every request it serves; a request without it is
 * local (tests, `wrangler dev` tools) and is not counted.
 */
async function overAddressLimit(request: Request, env: WorkerEnv) {
  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return false
  const { success } = await env.IP_LIMITER.limit({ key: ip })
  return !success
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/
const LOCAL_PAGE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/

/**
 * A page may open a socket only to its own site. Browsers always send Origin
 * on a WebSocket handshake; a local server (wrangler dev) also takes pages
 * from localhost, such as Vite on :5173. Tokens are bearer subprotocols, not
 * cookies, so this is defence in depth against a hostile page, not the lock.
 */
function originAllowed(request: Request) {
  const origin = request.headers.get('Origin')
  if (!origin) return false
  const self = new URL(request.url)
  if (origin === self.origin) return true
  return LOCAL_HOST.test(self.hostname) && LOCAL_PAGE.test(origin)
}

/** Why a socket request cannot be upgraded, or null when it can. */
function upgradeRefusal(request: Request) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
    return json({ error: 'expected a WebSocket upgrade' }, 426)
  if (!originAllowed(request)) return json({ error: 'origin' }, 403)
  const offered = readSubprotocols(
    request.headers.get('Sec-WebSocket-Protocol'),
  )
  // An old client after a deploy: it should reload, not misread frames.
  if (!offered.supported)
    return json({ error: 'unsupported protocol', protocol: PROTOCOL }, 426)
  return null
}
