import express from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import { coachRequestSchema } from '../src/lib/coach.js'
import type { CoachEvent, CoachRequest } from '../src/lib/coach.js'
import { DEFAULT_MODEL, runCoach } from './coach.js'

type Options = {
  configured?: boolean
  accessToken?: string
  production?: boolean
  origins?: string[]
  requestBudget?: number
  serveStatic?: boolean
  generate?: (
    request: CoachRequest,
    signal: AbortSignal,
  ) => AsyncIterable<CoachEvent>
}
export function createCoachApp(options: Options = {}) {
  const app = express()
  const configured =
    options.configured ?? Boolean(process.env.AI_GATEWAY_API_KEY)
  const accessToken =
    options.accessToken ?? process.env.COACH_ACCESS_TOKEN ?? ''
  const production = options.production ?? process.env.NODE_ENV === 'production'
  const origins =
    options.origins ??
    (
      process.env.COACH_ALLOWED_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173'
    ).split(',')
  const budget =
    options.requestBudget ??
    Math.max(1, Math.min(1000, Number(process.env.COACH_REQUEST_BUDGET) || 30))
  const generate = options.generate ?? runCoach
  let requests = 0,
    active = 0
  const recent: number[] = []
  app.disable('x-powered-by')
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.get('/api/coach/health', (_req, res) =>
    res.json({
      configured: configured && (!production || Boolean(accessToken)),
      authRequired: Boolean(accessToken),
      model: process.env.COACH_MODEL || DEFAULT_MODEL,
    }),
  )
  app.post('/api/coach', express.json({ limit: '48kb' }), async (req, res) => {
    if (!configured || (production && !accessToken)) {
      res
        .status(503)
        .json({
          error:
            'The AI coach is not configured. The poker game and deterministic explanations still work.',
        })
      return
    }
    if (req.get('origin') && !origins.includes(req.get('origin')!)) {
      res
        .status(403)
        .json({ error: 'This origin is not enabled for the coach.' })
      return
    }
    if (accessToken) {
      const supplied = (req.get('authorization') ?? '').replace(/^Bearer /, '')
      if (
        !timingSafeEqual(
          createHash('sha256').update(supplied).digest(),
          createHash('sha256').update(accessToken).digest(),
        )
      ) {
        res
          .status(401)
          .json({
            error:
              'Enter the private coach access token, not a provider API key.',
          })
        return
      }
    }
    const parsed = coachRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error:
            'The question or visible-hand snapshot is invalid. Refresh the hand and try again.',
        })
      return
    }
    const now = Date.now()
    while (recent.length && recent[0] < now - 60000) recent.shift()
    if (requests >= budget || recent.length >= 6 || active >= 2) {
      res.setHeader('Retry-After', '60')
      res
        .status(429)
        .json({
          error:
            requests >= budget
              ? 'This preview’s coach request allowance is used up. The owner can renew it.'
              : 'The coach is busy. Wait a minute before trying again.',
        })
      return
    }
    requests++
    recent.push(now)
    active++
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(45000),
    ])
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.flushHeaders()
    try {
      for await (const event of generate(parsed.data, signal)) {
        if (signal.aborted || res.destroyed) break
        res.write(`${JSON.stringify(event)}\n`)
      }
    } catch {
      if (!res.destroyed)
        res.write(
          `${JSON.stringify({ type: 'error', text: signal.aborted ? 'The coach timed out or was stopped. Your game is unchanged.' : 'The model could not complete this reply. Check provider access or try again later; no fallback answer was fabricated.' })}\n`,
        )
    } finally {
      active--
      res.end()
    }
  })
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown endpoint' })
  })
  if (options.serveStatic !== false)
    app.use(express.static(resolve('dist'), { index: 'index.html' }))
  app.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(error)
        return
      }
      res
        .status(error.status === 413 ? 413 : 400)
        .json({ error: 'Invalid or oversized request.' })
    },
  )
  return app
}
