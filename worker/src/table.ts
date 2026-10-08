// One Durable Object per match. It is the only place a live hand exists:
// it holds the deck, applies every action through the engine, writes the new
// state durably, and only then tells each seat what that seat may see.
import { DurableObject } from 'cloudflare:workers'
import { toBase64 } from '../../src/engine/deck'
import { act, assertInvariants, isOver, startHand } from '../../src/engine/hand'
import { seatView } from '../../src/engine/redact'
import { EngineError } from '../../src/engine/types'
import type { HandState, PlayerAction, SeatId } from '../../src/engine/types'
import { parseClientMsg, PROTOCOL } from '../../src/shared/protocol'
import type {
  ErrorCode,
  MatchConfig,
  MatchEndReason,
  MatchInfo,
  ServerMsg,
} from '../../src/shared/protocol'
import { now } from './clock'
import { LocalController } from './controller'
import type { TableController } from './controller'
import type { WorkerEnv } from './env'

export const DEFAULT_CONFIG: MatchConfig = {
  kind: 'hu-casual',
  handsTotal: 20,
  startingStack: 2000,
  blinds: { sb: 10, bb: 20 },
  decisionMs: 20_000,
  bankMs: 60_000,
}
/** Pause after a hand so both players see the result. */
export const NEXT_HAND_MS = 3000

type Player = { seat: SeatId; userId: string; username: string }
type Match = {
  v: 1
  id: string
  config: MatchConfig
  status: 'waiting' | 'playing' | 'finished'
  players: Player[]
  handNo: number
  /** Running result per seat over the match. */
  net: Record<SeatId, number>
  endReason?: MatchEndReason
}
type Attachment = { userId: string; seat: SeatId }
type Ack = { reqId: string; seq: number }
export type InitBody = {
  matchId: string
  creator: { userId: string; username: string }
  handsTotal?: number
}

const OPEN = 1
const json = (body: unknown, status = 200) => Response.json(body, { status })

export class TableDO extends DurableObject<WorkerEnv> {
  private match: Match | null = null
  private hand: HandState | null = null
  private seq = 0
  private lastAck: Record<SeatId, Ack> = {}
  controller: TableController = new LocalController()

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    // Keepalives are answered without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(['match', 'hand', 'seq', 'lastAck'])
      this.match = (stored.get('match') as Match | undefined) ?? null
      this.hand = (stored.get('hand') as HandState | undefined) ?? null
      this.seq = (stored.get('seq') as number | undefined) ?? 0
      this.lastAck = (stored.get('lastAck') as Record<SeatId, Ack>) ?? {}
    })
  }

  // ---- Requests from the Worker (never from the internet) ----------------

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/init' && request.method === 'POST')
      return this.init((await request.json()) as InitBody)
    if (pathname === '/connect') {
      const userId = request.headers.get('x-user-id')
      const username = request.headers.get('x-username')
      if (!userId || !username) return json({ error: 'unauthorized' }, 401)
      return this.join(userId, username)
    }
    return json({ error: 'not found' }, 404)
  }

  private async init(body: InitBody) {
    if (this.match) return json({ error: 'exists' }, 409)
    const handsTotal =
      Number.isInteger(body.handsTotal) &&
      body.handsTotal! >= 1 &&
      body.handsTotal! <= 100
        ? body.handsTotal!
        : DEFAULT_CONFIG.handsTotal
    this.match = {
      v: 1,
      id: body.matchId,
      config: { ...DEFAULT_CONFIG, handsTotal },
      status: 'waiting',
      players: [{ seat: 0, ...body.creator }],
      handNo: 0,
      net: { 0: 0, 1: 0 },
    }
    await this.ctx.storage.put({ match: this.match, seq: this.seq })
    return json({ matchId: body.matchId }, 201)
  }

  private async join(userId: string, username: string) {
    const match = this.match
    if (!match) return json({ error: 'no such table' }, 404)
    let player = match.players.find((p) => p.userId === userId)
    if (!player) {
      // Invite link: the first other account to open it takes the empty seat.
      if (match.status !== 'waiting' || match.players.length >= 2)
        return json({ error: 'table full' }, 403)
      player = { seat: 1, userId, username }
      match.players.push(player)
      await this.ctx.storage.put('match', match)
    }
    // One socket per account: a second tab replaces the first.
    for (const old of this.ctx.getWebSockets(userId))
      old.close(4001, 'replaced')
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server, [userId])
    server.serializeAttachment({
      userId,
      seat: player.seat,
    } satisfies Attachment)
    this.send(server, this.frame('welcome', player.seat))
    if (match.status === 'waiting' && this.seated(0) && this.seated(1)) {
      match.status = 'playing'
      await this.startNextHand()
    } else this.broadcast('state', server)
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': PROTOCOL },
    })
  }

  // ---- Socket events (hibernation API) ------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const { seat } = ws.deserializeAttachment() as Attachment
    const msg = typeof message === 'string' ? parseClientMsg(message) : null
    if (!msg) return this.reject(ws, 'illegal', 'Malformed message')
    if (msg.t === 'resync') return this.send(ws, this.frame('welcome', seat))
    if (msg.t !== 'act')
      return this.reject(ws, 'illegal', 'Not a table message')

    // A retry of the action we already applied: acknowledge it again.
    if (this.lastAck[seat]?.reqId === msg.reqId)
      return this.send(ws, this.frame('state', seat))
    const hand = this.hand
    if (
      !hand ||
      this.match?.status !== 'playing' ||
      isOver(hand) ||
      msg.handNo !== hand.config.handNo ||
      msg.actionIndex !== hand.actions.length
    ) {
      this.reject(ws, 'stale', 'That decision has passed', msg.reqId)
      return this.send(ws, this.frame('state', seat))
    }
    if (hand.toAct !== seat)
      return this.reject(ws, 'not_your_turn', 'Wait for your turn', msg.reqId)
    await this.applyAction(ws, seat, msg.action, msg.reqId)
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // Finish the closing handshake so the runtime can release the socket.
    try {
      ws.close(code === 1005 ? 1000 : code, reason)
    } catch {
      // Already closed.
    }
    this.broadcast('state', ws)
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast('state', ws)
  }

  async alarm() {
    try {
      if (this.match?.status === 'playing' && this.hand && isOver(this.hand))
        await this.startNextHand()
    } catch (error) {
      // Never throw from an alarm: retries would burn the platform budget.
      console.error('alarm failed', error)
    }
  }

  // ---- Hands ----------------------------------------------------------------

  private async applyAction(
    ws: WebSocket,
    seat: SeatId,
    action: PlayerAction,
    reqId: string,
  ) {
    let next: HandState
    try {
      next = act(this.hand!, seat, action)
    } catch (error) {
      if (error instanceof EngineError)
        return this.reject(ws, 'illegal', error.message, reqId)
      throw error
    }
    if (!this.invariantsHold(next)) return
    this.hand = next
    this.seq++
    this.lastAck[seat] = { reqId, seq: this.seq }
    await this.persist({ hand: next, seq: this.seq, lastAck: this.lastAck })
    this.broadcast('state')
  }

  private async startNextHand() {
    const match = this.match!
    const plan = this.controller.nextHandPlan(match.handNo + 1, match.config)
    if (!plan) return this.finish('complete')
    const hand = startHand(plan.config, plan.deck)
    if (!this.invariantsHold(hand)) return
    match.handNo = plan.config.handNo
    this.hand = hand
    this.seq++
    await this.persist({
      match,
      hand,
      seq: this.seq,
      // Kept for the match: Phase 1 replays decks; Step 5 reveals from it.
      [`deck:${match.handNo}`]: {
        deck: plan.deck,
        secret: toBase64(plan.secret),
      },
    })
    this.broadcast('state')
  }

  /**
   * The single write path: one atomic multi-key put, then (for a finished
   * hand) the next-hand alarm. Frames go out only after this resolves.
   */
  private async persist(writes: Record<string, unknown>) {
    const hand = writes.hand as HandState | undefined
    if (hand && isOver(hand)) {
      for (const [seat, net] of Object.entries(hand.result!.netBySeat))
        this.match!.net[Number(seat)] += net
      writes.match = this.match
    }
    await this.ctx.storage.put(writes)
    if (hand && isOver(hand))
      await this.ctx.storage.setAlarm(now() + NEXT_HAND_MS)
  }

  private invariantsHold(state: HandState) {
    try {
      assertInvariants(
        state,
        state.config.seats.reduce((sum, s) => sum + s.stack, 0),
      )
      return true
    } catch (error) {
      // Loud and final rather than a wrong payout.
      console.error('engine invariant failed', error, JSON.stringify(state))
      void this.finish('engine_fault')
      return false
    }
  }

  private async finish(reason: MatchEndReason) {
    const match = this.match!
    match.status = 'finished'
    match.endReason = reason
    this.seq++
    await this.ctx.storage.put({ match, seq: this.seq })
    await this.ctx.storage.deleteAlarm()
    this.broadcast('state')
    for (const ws of this.openSockets())
      this.send(ws, {
        t: 'match_end',
        seq: this.seq,
        matchId: match.id,
        result: { netBySeat: { ...match.net }, reason },
      })
  }

  // ---- Frames ----------------------------------------------------------------

  private openSockets(exclude?: WebSocket) {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== exclude && ws.readyState === OPEN)
  }

  private seated(seat: SeatId, exclude?: WebSocket) {
    return this.openSockets(exclude).some(
      (ws) => (ws.deserializeAttachment() as Attachment).seat === seat,
    )
  }

  private frame(
    kind: 'welcome' | 'state',
    seat: SeatId,
    exclude?: WebSocket,
  ): ServerMsg {
    const match = this.match!
    const table: MatchInfo = {
      kind: match.config.kind,
      status: match.status,
      handsTotal: match.config.handsTotal,
      players: match.players.map((p) => ({
        seat: p.seat,
        username: p.username,
        connected: this.seated(p.seat, exclude),
        consecutiveTimeouts: 0,
      })),
    }
    const view = this.hand
      ? seatView(this.hand, seat, {
          matchId: match.id,
          match: table,
          clock: null,
          lastReqId: this.lastAck[seat]?.reqId ?? null,
          commitment: null,
        })
      : null
    const base = { seq: this.seq, matchId: match.id, serverNow: now() }
    return kind === 'welcome'
      ? { ...base, t: 'welcome', seat, table, view }
      : { ...base, t: 'state', table, view }
  }

  private broadcast(kind: 'state', exclude?: WebSocket) {
    for (const ws of this.openSockets(exclude)) {
      const { seat } = ws.deserializeAttachment() as Attachment
      this.send(ws, this.frame(kind, seat, exclude))
    }
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // The socket closed meanwhile; webSocketClose will follow.
    }
  }

  private reject(
    ws: WebSocket,
    code: ErrorCode,
    message: string,
    reqId?: string,
  ) {
    this.send(ws, {
      t: 'error',
      seq: this.seq,
      matchId: this.match?.id ?? '',
      code,
      message,
      ...(reqId ? { reqId } : {}),
    })
  }
}
