// One live table connection. The server sends whole redacted snapshots, so
// the client keeps the newest one and never computes game state itself.
import type { PlayerAction, SeatId } from '../engine/types'
import { PROTOCOL } from '../shared/protocol'
import type {
  ErrorCode,
  MatchEndReason,
  MatchInfo,
  SeatView,
  ServerMsg,
} from '../shared/protocol'

export type ConnectionStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  /** Another tab took this seat; reconnecting would fight it. */
  | 'replaced'
  /** Gave up: no token, or the server kept refusing. */
  | 'failed'

export type TableState = {
  status: ConnectionStatus
  seat: SeatId | null
  table: MatchInfo | null
  view: SeatView | null
  /** The move sent and not yet acknowledged. */
  pending: string | null
  error: { code: ErrorCode; message: string } | null
  ended: { netBySeat: Record<SeatId, number>; reason: MatchEndReason } | null
}

export const INITIAL_STATE: TableState = {
  status: 'connecting',
  seat: null,
  table: null,
  view: null,
  pending: null,
  error: null,
  ended: null,
}

type Options = {
  /** ws(s):// origin of the table server; defaults to this page's origin. */
  origin?: string
  WebSocketImpl?: typeof WebSocket
  /** Give up after this many failed connection attempts in a row. */
  maxAttempts?: number
  newRequestId?: () => string
}

export function socketOrigin(location: Location = window.location) {
  const api = import.meta.env.VITE_API_ORIGIN as string | undefined
  const base = api || `${location.protocol}//${location.host}`
  return base.replace(/^http/, 'ws')
}

/**
 * Browsers hide why an upgrade was refused (full table, bad link), so a
 * table that never opened gets a few quick retries, not the full patience.
 */
const NEVER_OPENED_ATTEMPTS = 3

export class TableConnection {
  private state: TableState = INITIAL_STATE
  private listeners = new Set<() => void>()
  private socket: WebSocket | null = null
  private seq = -1
  private attempts = 0
  /** A table that never accepted us is a bad link or a full table. */
  private everOpened = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private readonly options: Required<Options>

  constructor(
    private readonly matchId: string,
    private readonly getToken: () => Promise<string | null>,
    options: Options = {},
  ) {
    this.options = {
      origin: options.origin ?? socketOrigin(),
      WebSocketImpl: options.WebSocketImpl ?? WebSocket,
      maxAttempts: options.maxAttempts ?? 8,
      newRequestId:
        options.newRequestId ?? (() => crypto.randomUUID().replace(/-/g, '')),
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.state

  start() {
    this.stopped = false
    void this.open()
  }

  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.socket?.close(1000, 'leaving')
    this.socket = null
  }

  /** Sends a move for the current decision. False if it is not ours to make. */
  act(action: PlayerAction): boolean {
    const { view, seat, pending, status } = this.state
    if (status !== 'open' || !view || pending) return false
    if (view.toAct !== seat || view.street === 'showdown') return false
    const reqId = this.options.newRequestId()
    this.socket!.send(
      JSON.stringify({
        t: 'act',
        reqId,
        handNo: view.handNo,
        actionIndex: view.actions.length,
        action,
      }),
    )
    this.set({ pending: reqId, error: null })
    return true
  }

  private set(patch: Partial<TableState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private async open() {
    const token = await this.getToken()
    if (this.stopped) return
    if (!token)
      return this.set({
        status: 'failed',
        error: { code: 'unauthorized', message: 'Sign in to play.' },
      })
    const { WebSocketImpl, origin } = this.options
    const socket = new WebSocketImpl(`${origin}/ws/table/${this.matchId}`, [
      PROTOCOL,
      `bearer.${token}`,
    ])
    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      this.everOpened = true
      this.set({ status: 'open' })
    }
    socket.onmessage = (event) => {
      try {
        this.receive(JSON.parse(String(event.data)) as ServerMsg)
      } catch {
        // A frame we cannot read is ignored; the next snapshot replaces it.
      }
    }
    socket.onclose = (event) => {
      if (this.socket !== socket || this.stopped) return
      this.socket = null
      if (event.code === 4001) return this.set({ status: 'replaced' })
      this.attempts++
      const limit = this.everOpened
        ? this.options.maxAttempts
        : NEVER_OPENED_ATTEMPTS
      if (this.attempts > limit)
        return this.set({
          status: 'failed',
          error: {
            code: 'unauthorized',
            message: 'Could not reach the table. Check the link and try again.',
          },
        })
      // 0.5 s, 1 s, 2 s … capped at 8 s; a fresh token each time.
      const delay = Math.min(8000, 500 * 2 ** (this.attempts - 1))
      this.set({ status: 'reconnecting', pending: null })
      this.timer = setTimeout(() => void this.open(), delay)
    }
  }

  private receive(msg: ServerMsg) {
    if (msg.t === 'error') {
      this.set({
        error: { code: msg.code, message: msg.message },
        pending:
          msg.reqId && msg.reqId === this.state.pending
            ? null
            : this.state.pending,
      })
      return
    }
    if (msg.t === 'match_end') {
      this.set({ ended: msg.result })
      return
    }
    if (msg.t !== 'welcome' && msg.t !== 'state') return
    // Snapshots can repeat a seq (presence changes) but never go back,
    // except a welcome, which is always the server's current truth.
    if (msg.t === 'state' && msg.seq < this.seq) return
    this.seq = msg.seq
    const pending =
      this.state.pending && msg.view?.lastReqId === this.state.pending
        ? null
        : this.state.pending
    this.set({
      ...(msg.t === 'welcome'
        ? { seat: msg.seat, pending: null }
        : { pending }),
      table: msg.table,
      view: msg.view,
    })
  }
}
