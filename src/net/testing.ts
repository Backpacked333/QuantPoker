// Test-only: a WebSocket stand-in the tests drive by hand, and server frames
// built from real engine states.
import { startHand } from '../engine/hand'
import { seatView } from '../engine/redact'
import { config, deckWith } from '../engine/testing'
import type { HandState, SeatId } from '../engine/types'
import type { MatchInfo, ServerMsg } from '../shared/protocol'

export class FakeSocket {
  static all: FakeSocket[] = []
  sent: string[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  closedWith: number | null = null
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.all.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close(code = 1000) {
    this.closedWith = code
  }
  // Driven by tests:
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  emit(msg: ServerMsg) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }
  static last() {
    return FakeSocket.all[FakeSocket.all.length - 1]
  }
}

export const MATCH = '33333333-3333-4333-8333-333333333333'

export const tableInfo = (
  players = 2,
  status: MatchInfo['status'] = 'playing',
): MatchInfo => ({
  kind: 'hu-casual',
  status,
  handsTotal: 20,
  players: [
    { seat: 0, username: 'alice', connected: true, consecutiveTimeouts: 0 },
    { seat: 1, username: 'bob', connected: true, consecutiveTimeouts: 0 },
  ].slice(0, players),
})

/** Hand 1 with fixed cards: alice (seat 0) has the button and acts first. */
export function firstHand(): HandState {
  const cfg = config([2000, 2000], 0)
  return startHand(
    cfg,
    deckWith(cfg, { 0: 'As Kd', 1: '7c 2h' }, '2c 7d 9h Tc 3s'),
  )
}

export function frame(
  kind: 'welcome' | 'state',
  seq: number,
  seat: SeatId,
  hand: HandState | null,
  lastReqId: string | null = null,
): ServerMsg {
  const table = tableInfo()
  const view = hand
    ? seatView(hand, seat, {
        matchId: MATCH,
        match: table,
        clock: null,
        lastReqId,
        commitment: null,
      })
    : null
  const base = { seq, matchId: MATCH, serverNow: 0, table, view }
  return kind === 'welcome'
    ? { ...base, t: 'welcome', seat }
    : { ...base, t: 'state' }
}
