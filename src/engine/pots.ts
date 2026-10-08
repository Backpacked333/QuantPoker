import type { Pot, SeatState } from './types'

/**
 * Main and side pots from what each seat has invested. Levels are the distinct
 * investments of seats still in the hand; every seat (folded included) pays
 * into each level up to its own investment, and only live seats that reached
 * a level can win it. Folded chips above the top live level join the last pot.
 */
export function buildPots(players: SeatState[]): Pot[] {
  const live = players.filter((p) => !p.folded)
  const levels = [...new Set(live.map((p) => p.invested))]
    .filter((level) => level > 0)
    .sort((a, b) => a - b)
  const pots: Pot[] = []
  let previous = 0
  for (const level of levels) {
    const amount = players.reduce(
      (sum, p) =>
        sum + Math.min(p.invested, level) - Math.min(p.invested, previous),
      0,
    )
    const eligible = live.filter((p) => p.invested >= level).map((p) => p.seat)
    if (amount > 0) pots.push({ amount, eligible })
    previous = level
  }
  const total = players.reduce((sum, p) => sum + p.invested, 0)
  const counted = pots.reduce((sum, p) => sum + p.amount, 0)
  if (total > counted) {
    if (pots.length) pots[pots.length - 1].amount += total - counted
    else pots.push({ amount: total, eligible: live.map((p) => p.seat) })
  }
  return pots
}

/**
 * Test oracle: hands out invested chips one at a time from every seat into
 * the cheapest pot that seat has not yet filled. Slow but obviously right.
 */
export function referencePots(players: SeatState[]): Pot[] {
  const live = players.filter((p) => !p.folded)
  const caps = [...new Set(live.map((p) => p.invested))]
    .filter((c) => c > 0)
    .sort((a, b) => a - b)
  const amounts = caps.map(() => 0)
  for (const p of players)
    for (let chip = 1; chip <= p.invested; chip++) {
      const i = caps.findIndex((cap) => chip <= cap)
      amounts[i === -1 ? caps.length - 1 : i]++
    }
  return caps
    .map((cap, i) => ({
      amount: amounts[i],
      eligible: live.filter((p) => p.invested >= cap).map((p) => p.seat),
    }))
    .filter((pot) => pot.amount > 0)
}

/** Refunds the part of the top bet that nobody matched. Mutates `players`. */
export function returnUncalled(players: SeatState[]) {
  const sorted = [...players].sort((a, b) => b.bet - a.bet)
  const [top, second] = sorted
  if (!top || !second || top.bet <= second.bet) return 0
  const refund = top.bet - second.bet
  top.bet -= refund
  top.invested -= refund
  top.stack += refund
  if (top.stack > 0) top.allIn = false
  return refund
}
