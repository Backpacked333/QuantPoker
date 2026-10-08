import { analyzeSpot, quickOutcome } from './range'
import type { QuickSpot, SpotRequest } from './range'

// One long-lived worker serves every request in arrival order. Each request
// first gets a fast uniform estimate so the interface responds immediately,
// then the full range-aware analysis. Caches inside range.ts make repeated
// boards cheap, so results are copied rather than transferred.
self.onmessage = (event: MessageEvent<SpotRequest>) => {
  const request = event.data
  const quick: QuickSpot = {
    key: request.key,
    stage: 'quick',
    quick: quickOutcome(request.hole, request.board, Math.random),
  }
  self.postMessage(quick)
  self.postMessage(analyzeSpot(request))
}
