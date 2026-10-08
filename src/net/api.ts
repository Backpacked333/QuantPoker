// HTTP calls to the table server (same origin as the page in production).
const apiOrigin = () =>
  (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? ''

export type Identity = {
  player: { userId: string; username: string }
  /** A fresh access token for each request or socket. */
  getToken: () => Promise<string | null>
  signOut: () => void
}

/** Opens a heads-up table; the caller takes seat 0 and shares the link. */
export async function createMatch(
  getToken: Identity['getToken'],
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; matchId: string } | { ok: false; reason: string }> {
  const token = await getToken()
  if (!token) return { ok: false, reason: 'Sign in again to create a table.' }
  try {
    const response = await fetcher(`${apiOrigin()}/api/matches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.status === 201) {
      const { matchId } = (await response.json()) as { matchId: string }
      return { ok: true, matchId }
    }
    return {
      ok: false,
      reason:
        response.status === 401
          ? 'Your session expired. Sign in again.'
          : 'Could not create a table. Try again in a moment.',
    }
  } catch {
    return { ok: false, reason: 'No connection to the table server.' }
  }
}

export const inviteLink = (
  matchId: string,
  location: Location = window.location,
) => `${location.origin}${location.pathname}#play/${matchId}`

/**
 * Development and end-to-end tests only: `sessionStorage['qp.devToken'] =
 * 'dev.<user>.<secret>'` plays as <user> without an account. The server
 * accepts these only when it was started with DEV_AUTH_SECRET, which
 * production never has.
 */
export function devIdentity(
  storage: Storage = sessionStorage,
): Identity | null {
  let token: string | null = null
  try {
    token = storage.getItem('qp.devToken')
  } catch {
    return null
  }
  const match = token?.match(/^dev\.([\w-]{1,64})\.[\w-]+$/)
  if (!token || !match) return null
  return {
    player: { userId: match[1], username: match[1] },
    getToken: async () => token,
    signOut: () => {
      storage.removeItem('qp.devToken')
      window.location.reload()
    },
  }
}
