import { estimateEquity } from './poker'
import type { Card } from './poker'

self.onmessage = (
  event: MessageEvent<{ key: string; hole: Card[]; board: Card[] }>,
) => {
  const { key, hole, board } = event.data
  self.postMessage({ key, equity: estimateEquity(hole, board) })
}
