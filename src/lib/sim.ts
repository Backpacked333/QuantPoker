// Integer-card simulation core. A card id is (rank - 2) * 4 + suit, where
// suit is 0 = s, 1 = h, 2 = d, 3 = c. Scores match the base-15 encoding used
// by `evaluate` in poker.ts: category * 15^5 + kickers.
import type { Card, Suit } from './poker'

export const SUIT_ORDER: Suit[] = ['s', 'h', 'd', 'c']
export const CATEGORY_BASE = 15 ** 5
export const toId = (card: Card) =>
  (card.rank - 2) * 4 + SUIT_ORDER.indexOf(card.suit)
export const fromId = (id: number): Card => ({
  rank: (id >> 2) + 2,
  suit: SUIT_ORDER[id & 3],
})
export const idRank = (id: number) => (id >> 2) + 2
export const idSuit = (id: number) => id & 3

const counts = new Uint8Array(15)
const suitMasks = new Int32Array(4)
const suitCounts = new Uint8Array(4)

function straightHigh(mask: number) {
  const m = mask | (((mask >> 14) & 1) << 1)
  for (let high = 14; high >= 5; high--)
    if (((m >> (high - 4)) & 31) === 31) return high
  return 0
}

const enc = (c: number, a = 0, b = 0, d = 0, e = 0, f = 0) =>
  c * CATEGORY_BASE + a * 50625 + b * 3375 + d * 225 + e * 15 + f

/** Score the best five-card hand among `n` card ids (5–7). */
export function score(cards: ArrayLike<number>, n = cards.length): number {
  counts.fill(0)
  suitMasks.fill(0)
  suitCounts.fill(0)
  let rankMask = 0
  for (let i = 0; i < n; i++) {
    const id = cards[i]
    const rank = (id >> 2) + 2
    const suit = id & 3
    counts[rank]++
    rankMask |= 1 << rank
    suitMasks[suit] |= 1 << rank
    suitCounts[suit]++
  }
  let flushMask = 0
  for (let s = 0; s < 4; s++) if (suitCounts[s] >= 5) flushMask = suitMasks[s]
  if (flushMask) {
    const sf = straightHigh(flushMask)
    if (sf) return enc(8, sf)
  }
  let quad = 0,
    t0 = 0,
    t1 = 0,
    p0 = 0,
    p1 = 0,
    p2 = 0,
    s0 = 0,
    s1 = 0,
    s2 = 0,
    s3 = 0,
    s4 = 0
  for (let r = 14; r >= 2; r--) {
    const c = counts[r]
    if (!c) continue
    if (c === 4) quad = r
    else if (c === 3) {
      if (!t0) t0 = r
      else if (!t1) t1 = r
    } else if (c === 2) {
      if (!p0) p0 = r
      else if (!p1) p1 = r
      else if (!p2) p2 = r
    } else if (!s0) s0 = r
    else if (!s1) s1 = r
    else if (!s2) s2 = r
    else if (!s3) s3 = r
    else if (!s4) s4 = r
  }
  if (quad) {
    let kicker = 0
    for (let r = 14; r >= 2; r--)
      if (r !== quad && counts[r]) {
        kicker = r
        break
      }
    return enc(7, quad, kicker)
  }
  if (t0 && (t1 || p0)) return enc(6, t0, Math.max(t1, p0))
  if (flushMask) {
    const k: number[] = []
    for (let r = 14; r >= 2 && k.length < 5; r--)
      if (flushMask & (1 << r)) k.push(r)
    return enc(5, k[0], k[1], k[2], k[3], k[4])
  }
  const st = straightHigh(rankMask)
  if (st) return enc(4, st)
  if (t0) return enc(3, t0, s0, s1)
  if (p1) return enc(2, p0, p1, Math.max(p2, s0))
  if (p0) return enc(1, p0, s0, s1, s2)
  return enc(0, s0, s1, s2, s3, s4)
}

export const categoryOf = (value: number) => Math.floor(value / CATEGORY_BASE)

/** All ids not in `dead`. */
export function liveIds(dead: Iterable<number>): number[] {
  const used = new Set(dead)
  const out: number[] = []
  for (let id = 0; id < 52; id++) if (!used.has(id)) out.push(id)
  return out
}

/**
 * Partial Fisher–Yates: moves `k` random elements of `pool` (mutated in
 * place) to its tail and returns the start index of that tail.
 */
export function drawTail(pool: number[], k: number, random: () => number) {
  let end = pool.length
  for (let i = 0; i < k; i++) {
    const j = Math.floor(random() * end)
    end--
    const tmp = pool[j]
    pool[j] = pool[end]
    pool[end] = tmp
  }
  return end
}

/** Seedable LCG used by tests and deterministic analyses. */
export function lcg(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}
