import { hashString } from './random'
import { analyzeSpot, quickOutcome } from './range'
import type { QuickSpot, SpotRequest } from './range'
import { lcg } from './sim'

// One long-lived worker serves every request in arrival order. Each request
// first gets a fast uniform estimate so the interface responds immediately,
// then the full range-aware analysis. Caches inside range.ts make repeated
// boards cheap, so results are copied rather than transferred.
self.onmessage = (event: MessageEvent<SpotRequest>) => {
  const request = event.data
  // Seeded by the spot itself: the same spot always reads the same numbers.
  const seed = hashString(request.key)
  const quick: QuickSpot = {
    key: request.key,
    stage: 'quick',
    quick: quickOutcome(request.hole, request.board, lcg(seed)),
  }
  self.postMessage(quick)
  self.postMessage(analyzeSpot(request, lcg(seed ^ 0x9e3779b9)))
}
