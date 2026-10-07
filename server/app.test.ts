import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import { createCoachApp } from './app'
import { guidedHand, legalActions } from '../src/lib/poker'
import { visibleCoachState } from '../src/lib/coach'
import type { CoachEvent, CoachRequest } from '../src/lib/coach'

const servers: Server[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        }),
    ),
  )
})
function request(): CoachRequest {
  const game = guidedHand(),
    legal = legalActions(game)
  return {
    snapshot: {
      ...visibleCoachState(game),
      id: 'test',
      mode: 'live',
      pot: 160,
      callCost: 40,
      minRaiseTo: legal.minRaiseTo,
      maxRaiseTo: legal.maxRaiseTo,
      canRaise: true,
      raiseTo: 120,
      action: 'continue',
      foldProbability: 0.25,
      coverageFraction: 0.75,
      probabilities: { win: 0.5, tie: 0.1, loss: 0.4 },
      hypotheticalCard: null,
      nextCardVolatility: 0.1,
      lens: 'equity',
      chart: 'payoff',
      lesson: 'price',
      probe: null,
    },
    messages: [{ role: 'user', content: 'Explain my hand' }],
  }
}
async function start(options: Parameters<typeof createCoachApp>[0] = {}) {
  const app = createCoachApp({
    configured: true,
    production: false,
    accessToken: '',
    serveStatic: false,
    generate: async function* () {
      yield { type: 'text', text: 'Engine-grounded reply' }
      yield { type: 'done' }
    },
    ...options,
  })
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve) => server.on('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No server address')
  return `http://127.0.0.1:${address.port}`
}
const post = (
  base: string,
  body: unknown = request(),
  headers: Record<string, string> = {},
) =>
  fetch(`${base}/api/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
describe('coach API boundaries', () => {
  it('discovers Vercel OIDC at request time, not cold-start module evaluation', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    vi.stubEnv('VERCEL_OIDC_TOKEN', '')
    const url = await start({ configured: undefined })
    expect(await (await fetch(`${url}/api/coach/health`)).json()).toMatchObject(
      { configured: false },
    )
    vi.stubGlobal(Symbol.for('@vercel/request-context'), {
      get: () => ({
        headers: { 'x-vercel-oidc-token': 'test-request-identity' },
      }),
    })
    expect(await (await fetch(`${url}/api/coach/health`)).json()).toMatchObject(
      { configured: true },
    )
    expect((await post(url)).status).toBe(200)
  })
  it('uses verified account identity and durable allowance in cloud mode', async () => {
    const authorize = vi.fn(async (token: string) =>
      token === 'valid-session' ? 'learner-id' : null,
    )
    const reserve = vi.fn(async () => true)
    const url = await start({ production: true, cloud: { authorize, reserve } })
    expect(await (await fetch(`${url}/api/coach/health`)).json()).toMatchObject(
      { configured: true, authMode: 'account', authRequired: true },
    )
    expect((await post(url)).status).toBe(401)
    expect(reserve).not.toHaveBeenCalled()
    expect(
      (
        await post(
          url,
          { invalid: true },
          { Authorization: 'Bearer valid-session' },
        )
      ).status,
    ).toBe(400)
    expect(reserve).not.toHaveBeenCalled()
    const response = await post(url, request(), {
      Authorization: 'Bearer valid-session',
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Engine-grounded reply')
    expect(reserve).toHaveBeenCalledWith('learner-id')
  })
  it('fails closed when the durable quota is exhausted or unavailable', async () => {
    const reserve = vi.fn(async () => false)
    const url = await start({
      production: true,
      cloud: { authorize: async () => 'learner-id', reserve },
    })
    expect((await post(url)).status).toBe(429)
    reserve.mockRejectedValueOnce(new Error('DATABASE_SECRET_CANARY'))
    const response = await post(url)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('DATABASE_SECRET_CANARY')
  })
  it.each([3001, 3017])(
    'accepts its standalone loopback browser origin on port %s',
    async (port) => {
      vi.stubEnv('COACH_PORT', String(port))
      vi.stubEnv('COACH_ALLOWED_ORIGINS', '')
      const url = await start({
        production: true,
        accessToken: 'test-only-passphrase',
      })
      const headers = { Authorization: 'Bearer test-only-passphrase' }
      for (const host of ['localhost', '127.0.0.1']) {
        const response = await post(url, request(), {
          ...headers,
          Origin: `http://${host}:${port}`,
        })
        expect(response.status).toBe(200)
        await response.text()
      }
      expect(
        (
          await post(url, request(), {
            ...headers,
            Origin: 'https://untrusted.example',
          })
        ).status,
      ).toBe(403)
    },
  )
  it('honors explicit deployment origins rather than trusting arbitrary Host headers', async () => {
    vi.stubEnv('COACH_ALLOWED_ORIGINS', ' https://poker.example , ')
    const url = await start({
      production: true,
      accessToken: 'test-only-passphrase',
    })
    const headers = { Authorization: 'Bearer test-only-passphrase' }
    const response = await post(url, request(), {
      ...headers,
      Origin: 'https://poker.example',
    })
    expect(response.status).toBe(200)
    await response.text()
    expect(
      (
        await post(url, request(), {
          ...headers,
          Origin: 'http://localhost:3001',
        })
      ).status,
    ).toBe(403)
  })
  it('streams a validated request with no-store headers', async () => {
    const response = await post(await start())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toContain(
      'application/x-ndjson',
    )
    expect(await response.text()).toContain('"type":"done"')
  })
  it('fails honestly when the provider is not configured', async () => {
    const url = await start({ configured: false })
    expect((await post(url)).status).toBe(503)
    expect(await (await fetch(`${url}/api/coach/health`)).json()).toMatchObject(
      { configured: false },
    )
  })
  it('fails closed in production unless private access is configured', async () => {
    expect((await post(await start({ production: true }))).status).toBe(503)
    const privateApp = await start({
      production: true,
      accessToken: 'test-only-passphrase',
    })
    expect((await post(privateApp)).status).toBe(401)
    expect(
      (await post(privateApp, request(), { Authorization: 'Bearer wrong' }))
        .status,
    ).toBe(401)
    const accepted = await post(privateApp, request(), {
      Authorization: 'Bearer test-only-passphrase',
    })
    expect(accepted.status).toBe(200)
    await accepted.text()
  })
  it('rejects other origins, oversized payloads and hidden-state fields', async () => {
    const url = await start()
    expect(
      (await post(url, request(), { Origin: 'https://untrusted.example' }))
        .status,
    ).toBe(403)
    expect((await post(url, { junk: 'x'.repeat(50000) })).status).toBe(413)
    expect(
      (
        await post(url, {
          ...request(),
          snapshot: { ...request().snapshot, deck: [] },
        })
      ).status,
    ).toBe(400)
  })
  it('caps total model requests instead of exposing an unbounded relay', async () => {
    const url = await start({ requestBudget: 1 })
    await (await post(url)).text()
    const response = await post(url)
    expect(response.status).toBe(429)
    expect(await response.text()).toContain('allowance')
  })
  it('does not reveal provider exception details or fabricate answers', async () => {
    const url = await start({
      generate: async function* () {
        yield { type: 'status', text: 'Connecting' }
        throw new Error('SECRET_CANARY')
      },
    })
    const text = await (await post(url)).text()
    expect(text).toContain('"type":"error"')
    expect(text).not.toContain('SECRET_CANARY')
    expect(text).not.toContain('"type":"done"')
  })
  it('aborts model work when a caller disconnects', async () => {
    let signal: AbortSignal | undefined
    const url = await start({
      generate: async function* (
        _request,
        incoming,
      ): AsyncGenerator<CoachEvent> {
        signal = incoming
        yield { type: 'status', text: 'Started' }
        await new Promise<void>((resolve) =>
          incoming.addEventListener('abort', () => resolve(), { once: true }),
        )
      },
    })
    const controller = new AbortController()
    const response = await fetch(`${url}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request()),
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    await reader.read()
    controller.abort()
    await expect.poll(() => signal?.aborted).toBe(true)
    await reader.cancel().catch(() => {})
  })
})
