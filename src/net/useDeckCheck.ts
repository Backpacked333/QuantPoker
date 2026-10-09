// Checks a finished hand's deal against the commitment this client received
// before the first card. Runs in the browser with Web Crypto.
import { useEffect, useState } from 'react'
import { fromBase64, verifyDeal, verifyOwn } from '../engine/deck'
import type { SeatId } from '../engine/types'
import type { HandSeen } from './client'

export type DeckCheck = 'waiting' | 'checking' | 'verified' | 'failed'

/**
 * Verifies a hand once its record and reveal have both arrived: the board
 * and shown hands, and this seat's own two cards (the server must open them
 * for this seat, folded or not).
 */
export function useDeckCheck(
  seen: HandSeen | undefined,
  you: SeatId,
): DeckCheck {
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
        const leaves = fromBase64(reveal!.leaves)
        return (
          record!.commitment === commitment &&
          !!seen.mine &&
          !!reveal!.own &&
          (await verifyDeal(commitment!, leaves, reveal!.slots, record!)) &&
          (await verifyOwn(
            commitment!,
            leaves,
            reveal!.own,
            record!.config,
            you,
            seen.mine,
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
  }, [seen, ready, you])
  if (!ready) return 'waiting'
  if (result?.key !== seen) return 'checking'
  return result.ok ? 'verified' : 'failed'
}
