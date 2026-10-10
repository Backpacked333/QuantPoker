// Attaches the landing page's challenge score to the account that just
// signed up (O-4): the receipt waits in localStorage until then.
import { clearPendingClaim, readPendingClaim } from '../lib/landing'
import type { PendingClaim } from '../lib/landing'

export type Claimed = { claim: PendingClaim; saved: boolean } | null

/**
 * Sends the pending score once. A definite answer (saved, unknown, already
 * claimed, refused) clears it; a network failure keeps it for next time.
 */
export async function claimPendingScore(
  getToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
): Promise<Claimed> {
  const claim = readPendingClaim()
  if (!claim) return null
  const token = await getToken()
  if (!token) return { claim, saved: false }
  try {
    const response = await fetcher('/api/challenge/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ receipt: claim.receipt }),
    })
    if (response.status >= 500 || response.status === 429)
      return { claim, saved: false }
    clearPendingClaim()
    return { claim, saved: response.ok }
  } catch {
    return { claim, saved: false }
  }
}
