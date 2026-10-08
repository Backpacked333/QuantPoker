// The lobby connection: presence counts, the quick-match queue, and the
// table the server pairs us at. A queue place is held only while the socket
// is open, so after a reconnect we ask again if we were still looking.
import { PROTOCOL } from '../shared/protocol'
import type { LobbyMsg } from '../shared/protocol'
import { socketOrigin } from './client'

export type LobbyState = {
  status: 'connecting' | 'open' | 'reconnecting' | 'replaced' | 'failed'
  /** True from "Find a match" until matched or cancelled. */
  looking: boolean
  queued: { position: number; since: number } | null
  presence: { online: number; queued: number } | null
  matched: { matchId: string; resumed: boolean } | null
  error: string | null
}

export const INITIAL_LOBBY: LobbyState = {
  status: 'connecting',
  looking: false,
  queued: null,
  presence: null,
  matched: null,
  error: null,
}

type Options = {
  origin?: string
  WebSocketImpl?: typeof WebSocket
  maxAttempts?: number
}

export class LobbyConnection {
  private state: LobbyState = INITIAL_LOBBY
  private listeners = new Set<() => void>()
  private socket: WebSocket | null = null
  private attempts = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private readonly options: Required<Options>

  constructor(
    private readonly getToken: () => Promise<string | null>,
    options: Options = {},
  ) {
    this.options = {
      origin: options.origin ?? socketOrigin(),
      WebSocketImpl: options.WebSocketImpl ?? WebSocket,
      maxAttempts: options.maxAttempts ?? 8,
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

  /** Joins the queue (now, or as soon as the socket is open). */
  find() {
    this.set({ looking: true, matched: null, error: null })
    if (this.state.status === 'open') this.sendQueue()
  }

  cancel() {
    this.set({ looking: false, queued: null })
    if (this.state.status === 'open')
      this.socket?.send(JSON.stringify({ t: 'dequeue' }))
  }

  private sendQueue() {
    this.socket?.send(JSON.stringify({ t: 'queue', kind: 'hu-casual' }))
  }

  private set(patch: Partial<LobbyState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private async open() {
    const token = await this.getToken()
    if (this.stopped) return
    if (!token)
      return this.set({ status: 'failed', error: 'Sign in to find a match.' })
    const socket = new this.options.WebSocketImpl(
      `${this.options.origin}/ws/lobby`,
      [PROTOCOL, `bearer.${token}`],
    )
    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      this.set({ status: 'open' })
      if (this.state.looking) this.sendQueue()
    }
    socket.onmessage = (event) => {
      try {
        this.receive(JSON.parse(String(event.data)) as LobbyMsg)
      } catch {
        // Unreadable frame: ignored.
      }
    }
    socket.onclose = (event) => {
      if (this.socket !== socket || this.stopped) return
      this.socket = null
      if (event.code === 4001) return this.set({ status: 'replaced' })
      this.attempts++
      if (this.attempts > this.options.maxAttempts)
        return this.set({
          status: 'failed',
          error: 'Could not reach the lobby. Reload to try again.',
        })
      const delay = Math.min(8000, 500 * 2 ** (this.attempts - 1))
      this.set({ status: 'reconnecting', queued: null })
      this.timer = setTimeout(() => void this.open(), delay)
    }
  }

  private receive(msg: LobbyMsg) {
    switch (msg.t) {
      case 'presence':
        return this.set({
          presence: { online: msg.online, queued: msg.queued },
        })
      case 'queued':
        return this.state.looking
          ? this.set({ queued: { position: msg.position, since: msg.since } })
          : undefined
      case 'matched':
        return this.set({
          looking: false,
          queued: null,
          matched: { matchId: msg.matchId, resumed: !!msg.resumed },
        })
      case 'error':
        return this.set({ error: msg.message })
    }
  }
}
