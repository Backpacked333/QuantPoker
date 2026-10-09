import type { Card, Suit } from '../lib/poker'

// The original (slow, readable) evaluator, kept as a reference oracle.
export function reference(cards: Card[]) {
  const encode = (category: number, kickers: number[]) =>
    [category, ...kickers, ...Array(5 - kickers.length).fill(0)].reduce(
      (s, n) => s * 15 + n,
      0,
    )
  const straight = (ranks: number[]) => {
    const unique = [...new Set(ranks)].sort((a, b) => b - a)
    if (unique[0] === 14) unique.push(1)
    for (let i = 0; i <= unique.length - 5; i++)
      if (unique[i] - unique[i + 4] === 4) return unique[i]
    return 0
  }
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a)
  const counts = new Map<number, number>()
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1))
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  )
  const flush = (['s', 'h', 'd', 'c'] as Suit[])
    .map((s) =>
      cards
        .filter((c) => c.suit === s)
        .map((c) => c.rank)
        .sort((a, b) => b - a),
    )
    .find((c) => c.length >= 5)
  const sf = flush ? straight(flush) : 0
  const st = straight(ranks)
  if (sf) return encode(8, [sf])
  if (groups[0][1] === 4)
    return encode(7, [groups[0][0], ranks.find((r) => r !== groups[0][0])!])
  if (groups[0][1] === 3 && groups[1][1] >= 2)
    return encode(6, [groups[0][0], groups[1][0]])
  if (flush) return encode(5, flush.slice(0, 5))
  if (st) return encode(4, [st])
  if (groups[0][1] === 3)
    return encode(3, [
      groups[0][0],
      ...groups
        .slice(1)
        .map((g) => g[0])
        .sort((a, b) => b - a)
        .slice(0, 2),
    ])
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups
      .filter((g) => g[1] === 2)
      .map((g) => g[0])
      .slice(0, 2)
    return encode(2, [
      ...pairs,
      ...ranks.filter((r) => !pairs.includes(r)).slice(0, 1),
    ])
  }
  if (groups[0][1] === 2)
    return encode(1, [
      groups[0][0],
      ...groups
        .slice(1)
        .map((g) => g[0])
        .slice(0, 3),
    ])
  return encode(0, ranks.slice(0, 5))
}
