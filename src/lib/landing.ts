// Who sees the landing page (L-1), decided once at boot so it never changes
// under a visitor mid-hand. Entry-safe: plain storage reads, no imports from
// the landing or online chunks.
import type { Progress } from './storage'

const LANDED_KEY = 'qp.landed'
export const PENDING_CLAIM_KEY = 'qp.pendingClaim'

/** A score waiting to be attached to an account after sign-up (O-4). */
export type PendingClaim = {
  receipt: string
  hand: string
  ver: number
  accuracy: number
  percentile: number | null
  at: number
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** True when this browser holds a Supabase session (any project). */
function signedIn() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? ''
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return true
    }
  } catch {
    // Storage blocked: treat as signed out.
  }
  return false
}

/**
 * A first visit: no trainer progress, never landed or skipped the landing
 * page, not signed in, and not coming back from a sign-in redirect.
 */
export function isFirstVisit(progress: Progress, location = window.location) {
  const params = new URLSearchParams(location.search)
  if (params.has('code') || params.has('error_description')) return false
  return (
    !progress.onboarded &&
    progress.hands.length === 0 &&
    read(LANDED_KEY) === null &&
    !signedIn()
  )
}

/** The visitor finished the challenge or skipped it: next time, the app. */
export function markLanded() {
  try {
    localStorage.setItem(LANDED_KEY, '1')
  } catch {
    // The landing page shows again next time; harmless.
  }
}

export function savePendingClaim(claim: PendingClaim) {
  try {
    localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(claim))
  } catch {
    // Without storage the score stays on this page only.
  }
}

export function readPendingClaim(): PendingClaim | null {
  try {
    const raw = read(PENDING_CLAIM_KEY)
    const claim = raw ? (JSON.parse(raw) as PendingClaim) : null
    return claim && /^[0-9a-f]{32}$/.test(claim.receipt) ? claim : null
  } catch {
    return null
  }
}

export function clearPendingClaim() {
  try {
    localStorage.removeItem(PENDING_CLAIM_KEY)
  } catch {
    // Nothing to clear.
  }
}
