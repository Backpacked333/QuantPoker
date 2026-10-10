// How long do rated players wait for an opponent with the widening rating
// window (P1-13's riskiest assumption: a median under 60 s at launch)?
// Simulates the lobby's rule on seeded Poisson arrivals: N players online,
// each re-queueing after a rated match of about 12 minutes, ratings drawn
// from 1500 ± 200. Pairing runs on every arrival and every 15 s, oldest
// first, closest rating within the older player's window.
//
//   node scripts/pairing-sim.ts
import { ratingWindow, REPAIR_MS } from '../worker/src/pairing.ts'

const MATCH_MINUTES = 12
const HOURS = 200
const RATING_SD = 200

/** A small seeded generator, so every run prints the same table. */
function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function simulate(online: number, seed: number) {
  const random = seeded(seed)
  const normal = () =>
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  // Each online player enters the queue about once per match.
  const perMs = online / (MATCH_MINUTES * 60_000)
  const end = HOURS * 3_600_000
  const queue: { since: number; rating: number }[] = []
  const waits: number[] = []
  let gaps = 0
  let pairs = 0
  const pairUp = (at: number) => {
    queue.sort((a, b) => a.since - b.since)
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i]
      let best = -1
      for (let j = i + 1; j < queue.length; j++) {
        const gap = Math.abs(a.rating - queue[j].rating)
        if (gap > ratingWindow(at - a.since)) continue
        if (best < 0 || gap < Math.abs(a.rating - queue[best].rating)) best = j
      }
      if (best < 0) continue
      const b = queue[best]
      waits.push(at - a.since, at - b.since)
      gaps += Math.abs(a.rating - b.rating)
      pairs++
      queue.splice(best, 1)
      queue.splice(i, 1)
      i--
    }
  }
  let next = -Math.log(1 - random()) / perMs
  for (let tick = 0; tick < end; tick += REPAIR_MS) {
    while (next < tick + REPAIR_MS) {
      queue.push({ since: next, rating: 1500 + RATING_SD * normal() })
      pairUp(next)
      next += -Math.log(1 - random()) / perMs
    }
    if (queue.length >= 2) pairUp(tick + REPAIR_MS)
  }
  waits.sort((a, b) => a - b)
  const at = (q: number) => waits[Math.floor(q * (waits.length - 1))] / 1000
  return {
    online,
    median: at(0.5),
    p90: at(0.9),
    over60: waits.filter((w) => w > 60_000).length / waits.length,
    gap: gaps / pairs,
  }
}

console.log('| online | median wait | p90 wait | waits > 60 s | mean gap |')
console.log('| -----: | ----------: | -------: | -----------: | -------: |')
for (const online of [10, 20, 30]) {
  const r = simulate(online, online)
  console.log(
    `| ${online} | ${r.median.toFixed(0)} s | ${r.p90.toFixed(0)} s | ${(100 * r.over60).toFixed(0)}% | ${r.gap.toFixed(0)} |`,
  )
}
