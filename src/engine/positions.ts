// Seat order, blinds and position names. Seats are ascending clockwise.
//
// Heads-up the button posts the small blind, acts first pre-flop and last
// after the flop (as in src/lib/poker.ts). With three or more players the
// small blind is the next seat after the button, the big blind the one after
// that, and the first seat after the big blind opens. After the flop the first
// active seat clockwise from the button acts first.
//
// Button rule for Phase 2 (not needed heads-up): forward-moving button, dead
// small blind. The button advances to the next seated player every hand; if
// the player who should post the small blind has left, the small blind is
// dead and the big blind is posted by the next seated player. Nobody posts two
// blinds.
import type { SeatId } from './types'

/** The seat `steps` places clockwise from `from` among `seats` (ascending). */
export function seatAfter(seats: SeatId[], from: SeatId, steps = 1): SeatId {
  const start = seats.findIndex((s) => s > from)
  const base = start === -1 ? 0 : start
  return seats[(base + steps - 1) % seats.length]
}

/** `seats` reordered to start at the first seat clockwise after `from`. */
export function clockwiseFrom(seats: SeatId[], from: SeatId): SeatId[] {
  const first = seatAfter(seats, from)
  const i = seats.indexOf(first)
  return [...seats.slice(i), ...seats.slice(0, i)]
}

export function blindSeats(seats: SeatId[], button: SeatId) {
  const sb = seats.length === 2 ? button : seatAfter(seats, button)
  return { sb, bb: seatAfter(seats, sb) }
}

/** Phase 0 button movement: the next seated seat. */
export const nextButton = (seats: SeatId[], previous: SeatId) =>
  seatAfter(seats, previous)

const NAMES: Record<number, string[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
}

/** Position labels keyed by seat, starting from the button. */
export function positionNames(seats: SeatId[], button: SeatId) {
  const names = NAMES[seats.length]
  if (!names) return {} as Record<SeatId, string>
  const order = [button, ...clockwiseFrom(seats, button).slice(0, -1)]
  return Object.fromEntries(order.map((s, i) => [s, names[i]])) as Record<
    SeatId,
    string
  >
}
