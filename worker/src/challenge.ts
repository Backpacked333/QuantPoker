// The landing page's endpoints (architect: landing-and-onboarding §3). The
// address limit and the Origin check run before any of them touches ScoreDO.
//
//   POST /api/challenge/score  {hand, ver, path}  → ScoreResult
//   POST /api/events           {vid, name}         → 204
//   POST /api/challenge/claim  {receipt} + Bearer  → 204 | 404 | 409
//   GET  /api/challenge/shared/<receipt>           → SharedScore | 404
//   GET  /api/funnel                               → {days}, cached
//   POST /api/school/start, /api/school/confirm    (worker/src/school.ts)
import { isFunnelEvent, VISITOR_ID } from '../../src/challenge/events'
import { MAX_PATH } from '../../src/challenge/score'
import { bearerToken, verifyToken } from './auth'
import { now } from './clock'
import type { WorkerEnv } from './env'
import { originAllowed } from './origin'
import { scoreStub } from './scores'
import { sharedScore } from './share'
import { codeHash, newCode, schoolFor, sendCode } from './school'
import { describeError, logEvent } from './log'
import type { FunnelDay } from './scores'

export const SCORE_BODY_MAX = 2048
export const EVENT_BODY_MAX = 512
export const FUNNEL_TTL_MS = 300_000
const RECEIPT = /^[0-9a-f]{32}$/
const CODE = /^(f|c|r\d{1,5})$/
const HAND = /^[a-z0-9-]{1,32}$/

const json = (body: unknown, status = 200) => Response.json(body, { status })

let funnelCache: { at: number; days: FunnelDay[] } | null = null
/** Drops the cached funnel (tests). */
export function forgetFunnel() {
  funnelCache = null
}

/**
 * The JSON body of a POST from our own pages, at most `max` bytes, or the
 * response refusing it. sendBeacon posts text/plain, so the type is not
 * checked; the content is.
 */
async function readBody(
  request: Request,
  max: number,
): Promise<{ body: Record<string, unknown> } | { refused: Response }> {
  if (request.method !== 'POST')
    return { refused: json({ error: 'method' }, 405) }
  if (!originAllowed(request))
    return { refused: json({ error: 'origin' }, 403) }
  const declared = Number(request.headers.get('Content-Length') ?? 0)
  if (declared > max) return { refused: json({ error: 'too_large' }, 413) }
  const text = await request.text()
  if (text.length > max) return { refused: json({ error: 'too_large' }, 413) }
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object' && !Array.isArray(body))
      return { body: body as Record<string, unknown> }
  } catch {
    // Falls through to the refusal.
  }
  return { refused: json({ error: 'bad_request' }, 400) }
}

/** The response for a landing-page path, or null when it is not one. */
export async function challengeRoute(
  request: Request,
  env: WorkerEnv,
  pathname: string,
): Promise<Response | null> {
  if (pathname === '/api/challenge/score') {
    const read = await readBody(request, SCORE_BODY_MAX)
    if ('refused' in read) return read.refused
    const { hand, ver, path } = read.body
    if (
      typeof hand !== 'string' ||
      !HAND.test(hand) ||
      !Number.isInteger(ver) ||
      !Array.isArray(path) ||
      path.length > MAX_PATH ||
      !path.every((c) => typeof c === 'string' && CODE.test(c))
    )
      return json({ error: 'bad_request' }, 400)
    const result = await scoreStub(env).score(hand, ver as number, path)
    return result ? json(result) : json({ error: 'unknown_line' }, 400)
  }

  if (pathname === '/api/events') {
    const read = await readBody(request, EVENT_BODY_MAX)
    if ('refused' in read) return read.refused
    const { name, vid } = read.body
    if (
      !isFunnelEvent(name) ||
      typeof vid !== 'string' ||
      !VISITOR_ID.test(vid)
    )
      return json({ error: 'bad_request' }, 400)
    await scoreStub(env).event(name, vid)
    return new Response(null, { status: 204 })
  }

  if (pathname === '/api/challenge/claim') {
    const read = await readBody(request, EVENT_BODY_MAX)
    if ('refused' in read) return read.refused
    // Only the account id is needed: no username lookup, no Supabase call.
    const token = bearerToken(request)
    const userId = token && (await verifyToken(token, env))
    if (!userId) return json({ error: 'unauthorized' }, 401)
    const { receipt } = read.body
    if (typeof receipt !== 'string' || !RECEIPT.test(receipt))
      return json({ error: 'bad_request' }, 400)
    const result = await scoreStub(env).claim(receipt, userId)
    if (result === 'unknown') return json({ error: 'unknown_receipt' }, 404)
    if (result === 'taken') return json({ error: 'claimed' }, 409)
    return new Response(null, { status: 204 })
  }

  if (pathname === '/api/school/start' || pathname === '/api/school/confirm') {
    const read = await readBody(request, EVENT_BODY_MAX)
    if ('refused' in read) return read.refused
    const token = bearerToken(request)
    const userId = token && (await verifyToken(token, env))
    if (!userId) return json({ error: 'unauthorized' }, 401)
    return pathname === '/api/school/start'
      ? startSchool(env, userId, read.body.email)
      : confirmSchool(env, userId, read.body.code)
  }

  // A shared score, for the friend who opens /c/<receipt>.
  const shared = pathname.match(/^\/api\/challenge\/shared\/([0-9a-f]{32})$/)
  if (shared && request.method === 'GET') {
    const found = await sharedScore(env, shared[1])
    return found ? json(found) : json({ error: 'unknown_receipt' }, 404)
  }

  // Aggregate counts only, like /api/stats: no visitor ids leave the object.
  if (pathname === '/api/funnel' && request.method === 'GET') {
    const t = now()
    if (!funnelCache || t - funnelCache.at >= FUNNEL_TTL_MS)
      funnelCache = { at: t, days: await scoreStub(env).funnel() }
    return json({ days: funnelCache.days })
  }

  return null
}

async function startSchool(env: WorkerEnv, userId: string, email: unknown) {
  if (typeof email !== 'string' || email.length > 254)
    return json({ error: 'bad_request' }, 400)
  if (!env.RESEND_API_KEY || !env.SCHOOL_EMAIL_FROM)
    return json({ error: 'email_unavailable' }, 503)
  let school
  try {
    school = await schoolFor(env, email)
  } catch (error) {
    logEvent('error', { reason: 'school_lookup', detail: describeError(error) })
    return json({ error: 'unavailable' }, 503)
  }
  if (!school) return json({ error: 'not_school' }, 400)
  const code = newCode()
  const address = email.trim().toLowerCase()
  const stub = scoreStub(env)
  if (
    !(await stub.schoolStart(
      userId,
      address,
      school,
      await codeHash(userId, code),
    ))
  )
    return json({ error: 'too_many' }, 429)
  if (!(await sendCode(env, address, code, school.school))) {
    await stub.schoolUnsend(userId)
    return json({ error: 'email_unavailable' }, 503)
  }
  return json({ school: school.school })
}

async function confirmSchool(env: WorkerEnv, userId: string, code: unknown) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim()))
    return json({ error: 'bad_request' }, 400)
  const result = await scoreStub(env).schoolConfirm(
    userId,
    await codeHash(userId, code.trim()),
  )
  if (typeof result === 'object') return json({ school: result.school })
  if (result === 'wrong') return json({ error: 'wrong' }, 400)
  if (result === 'locked') return json({ error: 'locked' }, 429)
  return json({ error: result === 'expired' ? 'expired' : 'no_code' }, 410)
}
