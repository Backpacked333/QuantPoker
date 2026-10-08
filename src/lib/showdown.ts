// Post-hand equity with both hands face up. Only used once the hand is over
// and Atlas's cards were revealed at showdown.
import type { Card } from './poker'
import { drawTail, liveIds, score, toId } from './sim'

export type FaceUpEquity = { hero: number; atlas: number; tie: number }

export function faceUpEquity(
  hero: Card[],
  atlas: Card[],
  board: Card[],
  random = Math.random,
): FaceUpEquity {
  const h = hero.map(toId),
    a = atlas.map(toId),
    b = board.map(toId)
  const pool = liveIds([...h, ...a, ...b])
  const missing = 5 - b.length
  const heroHand = [...h, ...b],
    atlasHand = [...a, ...b]
  let win = 0,
    tie = 0,
    n = 0
  const tally = (runout: number[]) => {
    const hs = score([...heroHand, ...runout], 7)
    const as = score([...atlasHand, ...runout], 7)
    if (hs > as) win++
    else if (hs === as) tie++
    n++
  }
  if (missing === 0) tally([])
  else if (missing === 1) pool.forEach((r) => tally([r]))
  else if (missing === 2)
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) tally([pool[i], pool[j]])
  else
    for (let t = 0; t < 4000; t++) {
      const start = drawTail(pool, missing, random)
      tally(pool.slice(start, start + missing))
    }
  return { hero: win / n, tie: tie / n, atlas: 1 - (win + tie) / n }
}

/** Equity at each street the hand reached, for the broadcast-style graph. */
export function streetEquities(hero: Card[], atlas: Card[], board: Card[]) {
  const points = [
    { street: 'Pre-flop', count: 0 },
    { street: 'Flop', count: 3 },
    { street: 'Turn', count: 4 },
    { street: 'River', count: 5 },
  ].filter((p) => p.count <= board.length)
  return points.map((p) => ({
    street: p.street,
    ...faceUpEquity(hero, atlas, board.slice(0, p.count)),
  }))
}
