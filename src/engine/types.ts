// N-player hold'em types shared by the table server and the client. Cards are
// integer ids from src/lib/sim.ts ((rank - 2) * 4 + suit); -1 marks a card
// that is unknown to the holder of the state (a review replay).

/** Absolute seat number, 0..5, ascending clockwise. */
export type SeatId = number
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type BettingStreet = Exclude<Street, 'showdown'>

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }

export type HandConfig = {
  handNo: number
  /** Seated players in ascending seat order. */
  seats: { seat: SeatId; stack: number }[]
  /** Without explicit blinds, a seated player. */
  button: SeatId
  blinds: { sb: number; bb: number }
  /**
   * Six-casual hands name their blind seats (standard dead button, see
   * positions.ts): the player posting the small blind, or null when it is
   * dead. The button may then be a seat with no player dealt in. Heads-up
   * hands leave both out, so their records keep their bytes.
   */
  sb?: SeatId | null
  bb?: SeatId
}

export type SeatState = {
  seat: SeatId
  stack: number
  /** Chips put in on the current street. */
  bet: number
  /** Chips put in over the whole hand, current street included. */
  invested: number
  folded: boolean
  allIn: boolean
  /** raiseSeq when this seat last acted on the street; -1 = not yet. */
  actedSeq: number
  /**
   * The bet to match when this seat last acted on the street. Short all-ins
   * that together add up to a full raise above it reopen its betting.
   */
  actedBet: number
  /** null only in a redacted view. */
  cards: [number, number] | null
  shown: boolean
}

/** A public action with its decision context, like poker.ts HistoryEntry. */
export type HandAction = {
  seat: SeatId
  action: PlayerAction
  street: BettingStreet
  boardCount: number
  /** Raise target for raises, chips added for calls, 0 otherwise. */
  amount: number
  toCall: number
  /** Total chips in the middle before the action, current bets included. */
  pot: number
  canRaise: boolean
}

export type Pot = { amount: number; eligible: SeatId[] }
export type Award = { pot: number; seat: SeatId; amount: number; score: number }

export type LegalActions = {
  seat: SeatId
  toCall: number
  canCheck: boolean
  canRaise: boolean
  minRaiseTo: number
  maxRaiseTo: number
}

export type HandResult = {
  /** Last side pot first, main pot last: the order chips are pushed. */
  awards: Award[]
  netBySeat: Record<SeatId, number>
  showdown: boolean
}

export type HandState = {
  config: HandConfig
  street: Street
  board: number[]
  /** All 52 slots, dealt by index (see dealSlots) and never popped. */
  deck: number[]
  players: SeatState[]
  toAct: SeatId | null
  /** Size of the last full raise this street; the big blind at street start. */
  lastRaise: number
  /** Bumped by every full raise; a seat may raise iff actedSeq < raiseSeq. */
  raiseSeq: number
  actions: HandAction[]
  /** Chips from completed streets, rebuilt whenever a betting round closes. */
  pots: Pot[]
  result?: HandResult
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineError'
  }
}
