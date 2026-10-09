// Checks a finished hand's deal against the commitment this client received
// before the first card. Runs in the browser with Web Crypto.
import { useEffect, useState } from 'react'
import { fromBase64, verifyDeal } from '../engine/deck'
import type { HandSeen } from './client'

export type DeckCheck = 'waiting' | 'checking' | 'verified' | 'failed'

/** Verifies a hand once its record and reveal have both arrived. */
export function useDeckCheck(seen: HandSeen | undefined): DeckCheck {
  const [result, setResult] = useState<{
    key: HandSeen
    ok: boolean
  } | null>(null)
  const ready = !!(seen?.record && seen.reveal && seen.commitment)
  useEffect(() => {
    if (!seen || !ready) return
    let live = true
    const { record, reveal, commitment } = seen
    const check = async () => {
      try {
        return (
          record!.commitment === commitment &&
          (await verifyDeal(
            commitment!,
            fromBase64(reveal!.leaves),
            reveal!.slots,
            record!,
          ))
        )
      } catch {
        return false
      }
    }
    void check().then((ok) => {
      if (live) setResult({ key: seen, ok })
    })
    return () => {
      live = false
    }
  }, [seen, ready])
  if (!ready) return 'waiting'
  if (result?.key !== seen) return 'checking'
  return result.ok ? 'verified' : 'failed'
}
