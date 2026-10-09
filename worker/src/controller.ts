// What the next hand is. The table runs hands; a controller decides decks,
// buttons and stacks. Phase 1's duplicate matches replace this one (same
// decks, seats swapped) without touching the table or the protocol.
import { shuffleWith } from '../../src/engine/deck'
import type { HandConfig } from '../../src/engine/types'
import type { MatchConfig } from '../../src/shared/protocol'
import { randomBytes, randomInt } from './shuffle'

export type HandPlan = {
  config: HandConfig
  deck: number[]
  /** Per-hand secret for the deck commitment (used from Step 5). */
  secret: Uint8Array
}

export interface TableController {
  /** The plan for hand `handNo` (1-based), or null when the match is over. */
  nextHandPlan(handNo: number, config: MatchConfig): HandPlan | null
}

/** Casual heads-up: fresh shuffle, alternating button, stacks reset. */
export class LocalController implements TableController {
  constructor(
    private readonly random: (n: number) => number = randomInt,
    private readonly bytes: (n: number) => Uint8Array = randomBytes,
  ) {}

  nextHandPlan(handNo: number, config: MatchConfig): HandPlan | null {
    if (handNo > config.handsTotal) return null
    return {
      config: {
        handNo,
        seats: [
          { seat: 0, stack: config.startingStack },
          { seat: 1, stack: config.startingStack },
        ],
        button: (handNo - 1) % 2,
        blinds: config.blinds,
      },
      deck: shuffleWith(this.random),
      secret: this.bytes(32),
    }
  }
}
