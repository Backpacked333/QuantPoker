// Splits the time left on a turn into decision time and time bank.
import type { SeatView } from '../shared/protocol'

/** Seconds left before the bank, and in the bank, at `serverNow`. */
export function clockParts(
  clock: NonNullable<SeatView['clock']>,
  serverNow: number,
) {
  const left = Math.max(0, clock.deadline - serverNow)
  const decision = Math.max(0, left - clock.bankMs)
  return decision > 0
    ? { phase: 'decision' as const, seconds: Math.ceil(decision / 1000) }
    : { phase: 'bank' as const, seconds: Math.ceil(left / 1000) }
}
