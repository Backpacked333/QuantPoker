// Who is calling. Supabase access tokens are ES256 JWTs checked against the
// project's published keys; nothing is trusted from the request body.
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { PROTOCOL } from '../../src/shared/protocol'
import type { WorkerEnv } from './env'

export type Identity = { userId: string; username: string }

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let jwksUrl = ''

/** The account id for a token, or null when it does not verify. */
export async function verifyToken(
  token: string,
  env: WorkerEnv,
): Promise<string | null> {
  // Dots, not colons: a token travels as a WebSocket subprotocol, where
  // browsers reject separators like ':'. Real JWTs start with 'eyJ'.
  if (env.DEV_AUTH_SECRET && token.startsWith('dev.')) {
    const [, userId, secret] = token.split('.')
    return secret === env.DEV_AUTH_SECRET && /^[\w-]{1,64}$/.test(userId)
      ? userId
      : null
  }
  const url = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`
  if (!jwks || jwksUrl !== url) {
    jwks = createRemoteJWKSet(new URL(url))
    jwksUrl = url
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
      // Pinned: rejects alg confusion and the HS256 legacy API keys.
      algorithms: ['ES256'],
    })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/** The public username, from public.players (readable with the anon key). */
export async function usernameFor(
  userId: string,
  env: WorkerEnv,
): Promise<string | null> {
  if (env.DEV_AUTH_SECRET && !/^[0-9a-f-]{36}$/.test(userId)) return userId
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/players?select=username&user_id=eq.${userId}`,
    { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } },
  )
  if (!response.ok) return null
  const rows = (await response.json()) as { username: string }[]
  return rows[0]?.username ?? null
}

export async function identify(
  token: string | null,
  env: WorkerEnv,
): Promise<Identity | null> {
  if (!token) return null
  const userId = await verifyToken(token, env)
  if (!userId) return null
  const username = await usernameFor(userId, env)
  return username ? { userId, username } : null
}

/**
 * Browsers cannot set headers on a WebSocket, so the client offers
 * `qp.v1, bearer.<jwt>` as subprotocols. The token never goes in a URL.
 */
export function readSubprotocols(header: string | null) {
  const offered = (header ?? '').split(',').map((s) => s.trim())
  const bearer = offered.find((s) => s.startsWith('bearer.'))
  return {
    supported: offered.includes(PROTOCOL),
    token: bearer ? bearer.slice('bearer.'.length) : null,
  }
}

export function bearerToken(request: Request) {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}
