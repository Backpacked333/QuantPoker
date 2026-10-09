// Real Supabase-shaped tokens: ES256, signed by a key published through a
// stubbed JWKS endpoint. Everything else the Worker does with a token is
// covered by dev tokens in table.test.ts; this file is about who gets in.
import { env, SELF } from 'cloudflare:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import type { JWTPayload } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { identify, verifyToken } from '../src/auth'
import type { WorkerEnv } from '../src/env'
import { ORIGIN } from './helpers'

const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const NO_PROFILE = '00000000-0000-4000-8000-000000000000'
const ISSUER = `${env.SUPABASE_URL}/auth/v1`
const KID = 'qp-test-key'
// Production never sets DEV_AUTH_SECRET.
const prodEnv = { ...env, DEV_AUTH_SECRET: undefined } as WorkerEnv

let signingKey: CryptoKey
let strangerKey: CryptoKey

beforeAll(async () => {
  const signing = await generateKeyPair('ES256', { extractable: true })
  signingKey = signing.privateKey
  strangerKey = (await generateKeyPair('ES256')).privateKey
  const jwk = {
    ...(await exportJWK(signing.publicKey)),
    kid: KID,
    alg: 'ES256',
    use: 'sig',
  }
  const realFetch = globalThis.fetch
  // The test module and the Worker share an isolate, so this also stands in
  // for Supabase when requests go through SELF.
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.origin !== new URL(env.SUPABASE_URL).origin)
        return realFetch(input, init)
      if (url.pathname === '/auth/v1/.well-known/jwks.json')
        return Response.json({ keys: [jwk] })
      if (url.pathname === '/rest/v1/players')
        return Response.json(
          url.searchParams.get('user_id') === `eq.${USER}`
            ? [{ username: 'alice' }]
            : [],
        )
      return new Response('not stubbed', { status: 599 })
    },
  )
})
afterAll(() => vi.unstubAllGlobals())

function sign(
  claims: JWTPayload = {},
  opts: { key?: CryptoKey; kid?: string; exp?: string | number } = {},
) {
  return new SignJWT({ role: 'authenticated', sub: USER, ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: opts.kid ?? KID, typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(typeof claims.iss === 'string' ? claims.iss : ISSUER)
    .setAudience((claims.aud as string) ?? 'authenticated')
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? signingKey)
}

const b64url = (s: string) =>
  btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

const createMatch = (jwt: string) =>
  SELF.fetch(`${ORIGIN}/api/matches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
  })

describe('Supabase access tokens', () => {
  it('accepts a valid ES256 token and resolves the username', async () => {
    expect(await verifyToken(await sign(), prodEnv)).toBe(USER)
    expect(await identify(await sign(), prodEnv)).toEqual({
      userId: USER,
      username: 'alice',
    })
    expect((await createMatch(await sign())).status).toBe(201)
  })

  it.each<[string, () => Promise<string>]>([
    ['a wrong issuer', () => sign({ iss: 'https://evil.example/auth/v1' })],
    ['a wrong audience', () => sign({ aud: 'anon' })],
    [
      'an expired token',
      () => sign({}, { exp: Math.floor(Date.now() / 1000) - 60 }),
    ],
    ['a key Supabase did not publish', () => sign({}, { key: strangerKey })],
    ['an unknown key id', () => sign({}, { kid: 'rotated-away' })],
    ['no subject', () => sign({ sub: undefined })],
    [
      'a payload swapped under a valid signature',
      async () => {
        const [header, , signature] = (await sign()).split('.')
        const payload = b64url(
          JSON.stringify({
            sub: 'mallory',
            aud: 'authenticated',
            iss: ISSUER,
            exp: 9e9,
          }),
        )
        return `${header}.${payload}.${signature}`
      },
    ],
    [
      'alg none',
      async () =>
        `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(
          JSON.stringify({
            sub: USER,
            aud: 'authenticated',
            iss: ISSUER,
            exp: 9e9,
          }),
        )}.`,
    ],
    [
      'HS256 signed with the public publishable key',
      () =>
        new SignJWT({ role: 'authenticated' })
          .setProtectedHeader({ alg: 'HS256', kid: KID })
          .setSubject(USER)
          .setIssuer(ISSUER)
          .setAudience('authenticated')
          .setExpirationTime('1h')
          .sign(new TextEncoder().encode(env.SUPABASE_PUBLISHABLE_KEY)),
    ],
    ['garbage', async () => 'eyJnot.a.jwt'],
  ])('rejects %s', async (_, make) => {
    const jwt = await make()
    expect(await verifyToken(jwt, prodEnv)).toBeNull()
    expect((await createMatch(jwt)).status).toBe(401)
  })

  it('refuses a valid token whose account has no username yet', async () => {
    const jwt = await sign({ sub: NO_PROFILE })
    expect(await verifyToken(jwt, prodEnv)).toBe(NO_PROFILE)
    expect(await identify(jwt, prodEnv)).toBeNull()
    expect((await createMatch(jwt)).status).toBe(401)
  })

  it('takes a real token on the WebSocket subprotocol', async () => {
    const created = await createMatch(await sign())
    const { matchId } = (await created.json()) as { matchId: string }
    const upgrade = async (jwt: string) =>
      SELF.fetch(`${ORIGIN}/ws/table/${matchId}`, {
        headers: {
          Upgrade: 'websocket',
          'Sec-WebSocket-Protocol': `qp.v1, bearer.${jwt}`,
        },
      })
    const ok = await upgrade(await sign())
    expect(ok.status).toBe(101)
    ok.webSocket!.accept()
    ok.webSocket!.close(1000)
    expect((await upgrade(await sign({}, { key: strangerKey }))).status).toBe(
      401,
    )
  })
})

describe('dev tokens', () => {
  const devEnv = env as WorkerEnv

  it('work only where DEV_AUTH_SECRET is set', async () => {
    expect(await verifyToken('dev.alice.test', devEnv)).toBe('alice')
    expect(await verifyToken('dev.alice.wrong', devEnv)).toBeNull()
    // In production the same string is just a malformed JWT.
    expect(await verifyToken('dev.alice.test', prodEnv)).toBeNull()
    expect(
      await verifyToken('dev.alice.', {
        ...env,
        DEV_AUTH_SECRET: '',
      } as WorkerEnv),
    ).toBeNull()
    expect((await createMatch('dev.alice.test')).status).toBe(201)
  })

  it('reject user ids that are not plain words', async () => {
    expect(await verifyToken('dev.a b.test', devEnv)).toBeNull()
    expect(await verifyToken(`dev.${'x'.repeat(65)}.test`, devEnv)).toBeNull()
  })
})
