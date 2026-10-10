// One Durable Object per match. It is the only place a live hand exists:
// it holds the deck, applies every action through the engine, writes the new
// state durably, and only then tells each seat what that seat may see.
import { DurableObject } from 'cloudflare:workers'
import {
  commitDeck,
  dealSlots,
  fromBase64,
  publicSlots,
  revealSlots,
  toBase64,
} from '../../src/engine/deck'
import { act, assertInvariants, isOver, startHand } from '../../src/engine/hand'
import { luckAdjusted } from '../../src/engine/luck'
import { seatView } from '../../src/engine/redact'
import type { RevealedSlot } from '../../src/engine/deck'
import { EngineError } from '../../src/engine/types'
import type { HandState, SeatId } from '../../src/engine/types'
import {
  CLOSE_ABUSE,
  CLOSE_GONE,
  CLOSE_RATE_LIMITED,
  MAX_FRAME,
  parseClientMsg,
  PROTOCOL,
} from '../../src/shared/protocol'
import type {
  ErrorCode,
  HandRecordV1,
  MatchConfig,
  MatchEndReason,
  MatchInfo,
  MatchKind,
  Outcome,
  RematchState,
  Reveal,
  ServerMsg,
} from '../../src/shared/protocol'
import { now } from './clock'
import { LocalController } from './controller'
import type { TableController } from './controller'
import {
  bankAfter,
  earliest,
  FORFEIT_TIMEOUTS,
  IDLE_MS,
  INVITE_TTL_MS,
  isCurrentTurn,
  outboxBackoff,
  timeoutAction,
  turnDeadline,
} from './deadlines'
import type { Deadline } from './deadlines'
import type { WorkerEnv } from './env'
import { FrameBudget, ILLEGAL_PER_HAND } from './limits'
import { lobbyStub } from './lobby'
import type { RematchAnswer } from './lobby'
import { describeError, logEvent } from './log'
import { GRACE_MS, outcomes, RATED_CONFIG, REMATCH_MS } from './rated'
import { archive, refusedForData } from './supabase'
import type { ArchiveCall, ArchiveOutcome } from './supabase'
import type { HandMessage } from './verify'

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
/**
 * Refusals for bad data after which an archive call is set aside (about half
 * an hour of retries; S7-13). Outages and key errors never count.
 */
export const OUTBOX_MAX_REFUSALS = 12
/** Fallback retry for queued archive calls if the immediate send is lost. */
export const OUTBOX_SAFETY_MS = 30_000

type Player = {
  seat: SeatId
  userId: string
  username: string
  /** Time bank left for the match. */
  bankMs: number
  /** Missed decisions in a row; any move of their own resets it. */
  timeouts: number
  /**
   * Rated: gone past the grace since then; their turns are played at once,
   * and a turn that began while they were away costs no bank.
   */
  awaySince?: number
}
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
  forfeit?: SeatId
  noShow?: SeatId[]
  /** Seats gone past the grace when the match was abandoned (void). */
  abandoned?: SeatId[]
  /**
   * Rated: the luck-adjusted total per seat, through hand
   * `adjustedThrough` (settled after each hand; see settleLuck).
   */
  adjusted?: Record<SeatId, number>
  adjustedThrough?: number
  /** Rated, once finished and not void. */
  outcome?: Record<SeatId, Outcome>
  /** Rated: the match this one is a rematch of. */
  rematchOf?: string
  /** Rated, finished with a result: the rematch offer (P1-04). */
  rematch?: Rematch
}
type Rematch = {
  state: RematchState
  pressed: SeatId[]
  until?: number
  next?: string
}
/** The hand in progress: its commitment and per-action timing. */
type Current = {
  handNo: number
  commitment: string
  startedAt: number
  turnStartedAt: number
  timing: { atMs: number; decisionMs: number; source: 'client' | 'timeout' }[]
}
/**
 * The last finished hand, re-sent to anyone who (re)joins before the next.
 * `own` holds each seat's opening of its own hole slots; a seat only ever
 * receives its own.
 */
type Ended = {
  record: HandRecordV1
  reveal: Reveal
  own?: Record<SeatId, RevealedSlot[]>
}
type Attachment = { userId: string; seat: SeatId }
type Ack = { reqId: string; seq: number }
/**
 * A queued call: an archive function, or a hand for the verify queue. Hands
 * and the match must reach Postgres in order, so an archive failure stops the
 * flush; a verify send or an incident report never holds up what follows.
 */
export type Outbox = (ArchiveCall | { send: HandMessage }) & {
  attempts: number
  /** Of those attempts, how many Postgres refused for the call's data. */
  refused?: number
}
export type InitBody = {
  matchId: string
  creator: { userId: string; username: string }
  /** Set by the lobby: both seats are taken from the start. */
  opponent?: { userId: string; username: string }
  /** Set by the lobby: both must connect within this time. */
  startWithinMs?: number
  handsTotal?: number
  /** Set by the lobby: a rated match plays RATED_CONFIG (no handsTotal). */
  kind?: MatchKind
  /** Set by the lobby: the rated match this one is a rematch of. */
  rematchOf?: string
}
/**
 * For the lobby's one-table-per-account rule: `playing`, or `starting` (a
 * paired table waiting for its players) holds an account; an `open` invite
 * nobody has joined, or an `over` table, does not.
 */
export type Liveness = 'playing' | 'starting' | 'open' | 'over'

const OPEN = 1
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const json = (body: unknown, status = 200) => Response.json(body, { status })
/** Outbox keys sort in the order Postgres needs them: match, hands, end. */
const outboxKey = (n: number, what: string) =>
  `outbox:${String(n).padStart(4, '0')}:${what}`
/** A rated hand's calls wait here until its luck is settled (settleLuck). */
const heldKey = (n: number, what: string) =>
  `held:${String(n).padStart(4, '0')}:${what}`
/** Void endings: nobody wins or loses a rated match that ends so. */
const VOID: MatchEndReason[] = ['no_show', 'engine_fault', 'abandoned']

export class TableDO extends DurableObject<WorkerEnv> {
  private match: Match | null = null
  private hand: HandState | null = null
  private current: Current | null = null
  private ended: Ended | null = null
  private deadlines: Deadline[] = []
  private seq = 0
  private lastAck: Record<SeatId, Ack> = {}
  private flushing = false
  /** A call was queued while a flush was under way: that flush goes again. */
  private flushAgain = false
  controller: TableController = new LocalController()
  /** The table's clock; tests move it instead of waiting. */
  clock: () => number = now
  /** Frames and connects that do not move the game, per account. */
  private budget = new FrameBudget(() => this.clock())
  /** Illegal frames per seat in the current hand. */
  private illegalCount = new Map<SeatId, { handNo: number; n: number }>()

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    // Keepalives are answered without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get([
        'match',
        'hand',
        'current',
        'ended',
        'deadlines',
        'seq',
        'lastAck',
      ])
      this.match = (stored.get('match') as Match | undefined) ?? null
      this.hand = (stored.get('hand') as HandState | undefined) ?? null
      this.current = (stored.get('current') as Current | undefined) ?? null
      this.ended = (stored.get('ended') as Ended | undefined) ?? null
      this.deadlines = (stored.get('deadlines') as Deadline[]) ?? []
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
    const rated = body.kind === 'hu-rated'
    const config = rated
      ? { ...RATED_CONFIG }
      : { ...DEFAULT_CONFIG, handsTotal }
    this.match = {
      v: 1,
      id: body.matchId,
      config,
      status: 'waiting',
      players: [],
      handNo: 0,
      net: { 0: 0, 1: 0 },
      ...(rated ? { adjusted: { 0: 0, 1: 0 }, adjustedThrough: 0 } : {}),
      ...(rated && body.rematchOf ? { rematchOf: body.rematchOf } : {}),
    }
    this.match.players.push(this.newPlayer(0, body.creator))
    if (body.opponent) this.match.players.push(this.newPlayer(1, body.opponent))
    // A paired table must start soon; an invite waits for its friend, but
    // not forever.
    this.deadlines = [
      body.startWithinMs
        ? { kind: 'start', at: this.clock() + body.startWithinMs }
        : { kind: 'idle', at: this.clock() + INVITE_TTL_MS },
    ]
    await this.ctx.storage.put({
      match: this.match,
      seq: this.seq,
      deadlines: this.deadlines,
    })
    await this.armAlarm()
    return json({ matchId: body.matchId }, 201)
  }

  /** RPC from the lobby. */
  async liveness(): Promise<Liveness> {
    const match = this.match
    if (!match || match.status === 'finished') return 'over'
    if (match.status === 'playing') return 'playing'
    return match.players.length === 2 ? 'starting' : 'open'
  }

  private newPlayer(
    seat: SeatId,
    who: { userId: string; username: string },
  ): Player {
    return { seat, ...who, bankMs: this.match!.config.bankMs, timeouts: 0 }
  }

  private async join(userId: string, username: string) {
    const match = this.match
    // Cleaned up (or never existed): say so, and store nothing.
    if (!match) return this.refuse(CLOSE_GONE, 'closed')
    // A connect costs a frame, so reconnecting does not refill a budget.
    if (!this.budget.spend(userId)) {
      logEvent('limit_hit', {
        matchId: match.id,
        userId,
        code: CLOSE_RATE_LIMITED,
        reason: 'connects',
      })
      return this.refuse(CLOSE_RATE_LIMITED, 'Too many connections')
    }
    let player = match.players.find((p) => p.userId === userId)
    if (!player) {
      // Invite link: the first other account to open it takes the empty seat.
      if (match.status !== 'waiting' || match.players.length >= 2)
        return json({ error: 'table full' }, 403)
      // One table per account: someone playing elsewhere is sent back there.
      const elsewhere = await lobbyStub(this.env).claim(userId, match.id)
      if (elsewhere) return this.refuse(4409, elsewhere)
      // The claim awaited, so another join may have run meanwhile. If it
      // seated this same account (a second tab), join as that seat: releasing
      // here would free an account that is now playing at this table.
      player = match.players.find((p) => p.userId === userId)
      if (!player) {
        if (match.players.length >= 2) {
          await lobbyStub(this.env).release([userId], match.id)
          return json({ error: 'table full' }, 403)
        }
        player = this.newPlayer(1, { userId, username })
        match.players.push(player)
        await this.ctx.storage.put('match', match)
      }
    }
    await this.back(player)
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
    this.sendEnded(server)
    this.sendMatchEnd(server)
    if (match.status === 'waiting' && this.seated(0) && this.seated(1)) {
      match.status = 'playing'
      await this.startNextHand()
    } else this.broadcast('state', { skip: server })
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': PROTOCOL },
    })
  }

  /**
   * Browsers cannot read why an upgrade failed, so a refusal the player
   * should understand is an accepted socket closed with a code and reason.
   */
  private refuse(code: number, reason: string) {
    const pair = new WebSocketPair()
    pair[1].accept()
    pair[1].close(code, reason)
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { 'Sec-WebSocket-Protocol': PROTOCOL },
    })
  }

  // ---- Socket events (hibernation API) ------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Frames still in flight from a socket we already closed do nothing.
    if (ws.readyState !== OPEN || !this.match) return
    const { seat, userId } = ws.deserializeAttachment() as Attachment
    if (!this.budget.spend(userId))
      return this.cutOff(
        ws,
        CLOSE_RATE_LIMITED,
        'rate_limited',
        'Too many messages',
      )
    const size =
      typeof message === 'string' ? message.length : message.byteLength
    // Refused unread: parsing is the cost an oversized frame imposes.
    if (size > MAX_FRAME)
      return this.cutOff(ws, CLOSE_ABUSE, 'too_large', 'Message too large')
    const msg = typeof message === 'string' ? parseClientMsg(message) : null
    if (!msg) return this.illegal(ws, seat, 'Malformed message')
    if (msg.t === 'resync') {
      this.send(ws, this.frame('welcome', seat))
      this.sendEnded(ws)
      return this.sendMatchEnd(ws)
    }
    if (msg.t === 'rematch') return this.pressRematch(ws, seat)
    if (msg.t !== 'act') return this.illegal(ws, seat, 'Not a table message')

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
    let next: HandState
    try {
      next = act(hand, seat, msg.action)
    } catch (error) {
      if (error instanceof EngineError)
        return this.illegal(ws, seat, error.message, msg.reqId)
      throw error
    }
    await this.applyAction(seat, next, 'client', msg.reqId)
    // A move the table applied is play, not noise: it costs nothing. Moves
    // are paced by the opponent, so they cannot flood.
    this.budget.refund(userId)
  }

  /** Tells the socket why, then closes it; the seat may reconnect. */
  private cutOff(
    ws: WebSocket,
    code: number,
    error: ErrorCode,
    message: string,
  ) {
    this.reject(ws, error, message)
    ws.close(code, message)
    this.limitHit(ws, code, error)
    void this.socketGone(ws)
  }

  private limitHit(ws: WebSocket, code: number, reason: string) {
    const { userId } = ws.deserializeAttachment() as Attachment
    logEvent('limit_hit', { matchId: this.match?.id, userId, code, reason })
  }

  /**
   * A frame an honest client never sends: answered with `illegal`, and
   * counted. More than ILLEGAL_PER_HAND in one hand closes the socket.
   * Wrong-turn and stale moves are not counted: lag produces those.
   */
  private illegal(
    ws: WebSocket,
    seat: SeatId,
    message: string,
    reqId?: string,
  ) {
    this.reject(ws, 'illegal', message, reqId)
    const handNo = this.hand?.config.handNo ?? 0
    const seen = this.illegalCount.get(seat)
    const n = seen?.handNo === handNo ? seen.n + 1 : 1
    this.illegalCount.set(seat, { handNo, n })
    if (n > ILLEGAL_PER_HAND) {
      ws.close(CLOSE_ABUSE, 'Too many illegal messages')
      this.limitHit(ws, CLOSE_ABUSE, 'illegal')
      void this.socketGone(ws)
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // Finish the closing handshake so the runtime can release the socket.
    try {
      ws.close(code === 1005 ? 1000 : code, reason)
    } catch {
      // Already closed.
    }
    await this.socketGone(ws)
  }

  async webSocketError(ws: WebSocket) {
    await this.socketGone(ws)
  }

  /**
   * A socket is closing: the others see the seat offline, and a rated
   * seat with no other socket open starts its grace.
   */
  private async socketGone(ws: WebSocket) {
    this.broadcast('state', { gone: ws })
    const match = this.match
    if (!match?.adjusted || match.status !== 'playing') return
    const { seat } = ws.deserializeAttachment() as Attachment
    const player = match.players.find((p) => p.seat === seat)
    if (!player || player.awaySince !== undefined || this.seated(seat, ws))
      return
    if (this.deadlines.some((d) => d.kind === 'grace' && d.seat === seat))
      return
    this.deadlines.push({ kind: 'grace', at: this.clock() + GRACE_MS, seat })
    await this.armAlarm()
  }

  /** A rated seat that (re)connects ends its grace, or its time away. */
  private async back(player: Player) {
    const match = this.match!
    if (!match.adjusted) return
    const grace = (d: Deadline) => d.kind === 'grace' && d.seat === player.seat
    const away = player.awaySince !== undefined
    if (!this.deadlines.some(grace) && !away) return
    this.deadlines = this.deadlines.filter((d) => !grace(d))
    const hand = this.hand
    if (away) {
      delete player.awaySince
      // A turn of theirs still pending (its alarm not yet run) starts over
      // with the normal clock from now: they had no clock while away.
      const writes: Record<string, unknown> = { match }
      if (hand && !isOver(hand) && hand.toAct === player.seat) {
        const current = this.current!
        current.turnStartedAt = this.clock()
        this.setGameDeadline(this.turnFor(hand, current.turnStartedAt))
        writes.current = current
      }
      await this.ctx.storage.put(writes)
    }
    await this.armAlarm()
  }

  /**
   * Seats whose grace ran out are away: a turn of theirs is played at once.
   * Both away: the match is abandoned, void.
   */
  private async graceOver(seats: SeatId[]) {
    const match = this.match
    if (match?.status !== 'playing') return
    const leaving = match.players.filter(
      (p) =>
        seats.includes(p.seat) &&
        p.awaySince === undefined &&
        !this.seated(p.seat),
    )
    if (!leaving.length) return
    for (const p of leaving) p.awaySince = this.clock()
    if (match.players.every((p) => p.awaySince !== undefined))
      return this.finish(
        'abandoned',
        undefined,
        undefined,
        match.players.map((p) => p.seat),
      )
    await this.ctx.storage.put('match', match)
    const hand = this.hand
    const seat = hand?.toAct
    if (hand && !isOver(hand) && leaving.some((p) => p.seat === seat))
      await this.applyAction(
        seat!,
        act(hand, seat!, timeoutAction(hand)),
        'timeout',
      )
  }

  /**
   * Runs every deadline that is due. Each one is checked against the table
   * first, so a late or repeated alarm does nothing. Never throws: a throw
   * would spend the platform's retry budget on a bug.
   */
  async alarm() {
    try {
      const t = this.clock()
      const due = this.deadlines.filter((d) => d.at <= t)
      this.deadlines = this.deadlines.filter((d) => d.at > t)
      // All graces first, so two seats gone together void the match.
      const graces = due.flatMap((d) => (d.kind === 'grace' ? [d.seat] : []))
      if (graces.length) await this.graceOver(graces)
      for (const d of due) {
        if (d.kind === 'grace') continue
        if (d.kind === 'outbox') {
          void this.flushOutbox()
          continue
        }
        if (d.kind === 'start') {
          if (this.match?.status === 'waiting') await this.noShow()
          continue
        }
        if (d.kind === 'idle') {
          // Deleted: nothing is left to arm.
          if (await this.idle()) return
          continue
        }
        if (d.kind === 'rematch') {
          await this.rematchExpired()
          continue
        }
        if (this.match?.status !== 'playing') continue
        const hand = this.hand
        if (d.kind === 'turn' && isCurrentTurn(d, hand))
          await this.applyAction(
            d.seat,
            act(hand!, d.seat, timeoutAction(hand!)),
            'timeout',
          )
        else if (
          d.kind === 'nextHand' &&
          hand &&
          isOver(hand) &&
          hand.config.handNo === d.handNo
        )
          await this.startNextHand()
      }
      await this.armAlarm()
    } catch (error) {
      logEvent('error', {
        matchId: this.match?.id,
        reason: 'alarm',
        detail: describeError(error),
      })
    }
  }

  // ---- Hands ----------------------------------------------------------------

  /**
   * The single write path for a move, from a player or the clock: account
   * the time, persist everything in one write, then tell the seats.
   */
  private applyAction(
    seat: SeatId,
    next: HandState,
    source: 'client' | 'timeout',
    reqId?: string,
  ) {
    // The reveal's crypto awaits between the change and its write. Holding
    // other events until the write lands keeps any frame from showing a
    // state that is not yet durable.
    return this.ctx.blockConcurrencyWhile(() =>
      this.applyActionNow(seat, next, source, reqId),
    )
  }

  private async applyActionNow(
    seat: SeatId,
    next: HandState,
    source: 'client' | 'timeout',
    reqId?: string,
  ) {
    if (!this.invariantsHold(next)) return
    const match = this.match!
    const current = this.current!
    const t = this.clock()
    const took = t - current.turnStartedAt
    const player = match.players.find((p) => p.seat === seat)!
    // A turn that began while the seat was away was due at once: however
    // late the alarm ran, it costs no bank.
    const awayTurn =
      source === 'timeout' &&
      player.awaySince !== undefined &&
      current.turnStartedAt >= player.awaySince
    if (!awayTurn)
      player.bankMs = bankAfter(player.bankMs, took, match.config.decisionMs)
    player.timeouts = source === 'timeout' ? player.timeouts + 1 : 0
    current.timing.push({
      atMs: t - current.startedAt,
      decisionMs: took,
      source,
    })
    current.turnStartedAt = t
    this.hand = next
    this.seq++
    if (reqId) this.lastAck[seat] = { reqId, seq: this.seq }

    const writes: Record<string, unknown> = {
      match,
      hand: next,
      current,
      seq: this.seq,
      lastAck: this.lastAck,
    }
    const forfeit = player.timeouts >= FORFEIT_TIMEOUTS
    if (isOver(next)) {
      for (const [s, net] of Object.entries(next.result!.netBySeat))
        match.net[Number(s)] += net
      this.logHandEnd(next, t - current.startedAt)
      this.ended = await this.endOfHand(next, current, writes)
      writes.ended = this.ended
      this.setGameDeadline(
        forfeit
          ? null
          : { kind: 'nextHand', at: t + NEXT_HAND_MS, handNo: match.handNo },
      )
    } else this.setGameDeadline(this.turnFor(next, t))
    writes.deadlines = this.deadlines
    this.expectArchive(writes)
    await this.ctx.storage.put(writes)
    await this.armAlarm()
    this.broadcast('state')
    if (isOver(next)) for (const ws of this.openSockets()) this.sendEnded(ws)
    if (forfeit) await this.finish('forfeit', seat)
    else if (isOver(next)) void this.flushOutbox()
  }

  private startNextHand() {
    return this.ctx.blockConcurrencyWhile(() => this.startNextHandNow())
  }

  private async startNextHandNow() {
    const match = this.match!
    await this.settleLuck()
    const plan = this.controller.nextHandPlan(match.handNo + 1, match.config)
    if (!plan) return this.finish('complete')
    let hand: HandState
    try {
      hand = startHand(plan.config, plan.deck)
    } catch (error) {
      // A plan the engine refuses (a bad stored deck, in Phase 1): halt the
      // match like any engine fault rather than break the object.
      return this.engineFault(error, plan.config.handNo, {
        config: plan.config,
        deck: plan.deck,
        secret: toBase64(plan.secret),
      })
    }
    if (!this.invariantsHold(hand)) return
    const { commitment } = await commitDeck(plan.deck, plan.secret)
    const t = this.clock()
    match.handNo = plan.config.handNo
    // Rated: each half of the match has its own bank; what is left of the
    // last one does not carry over.
    const every = match.config.bankRefillEvery
    if (every && match.handNo > 1 && (match.handNo - 1) % every === 0)
      for (const p of match.players) p.bankMs = match.config.bankMs
    this.hand = hand
    this.current = {
      handNo: match.handNo,
      commitment,
      startedAt: t,
      turnStartedAt: t,
      timing: [],
    }
    this.seq++
    this.setGameDeadline(this.turnFor(hand, t))
    const writes: Record<string, unknown> = {
      match,
      hand,
      current: this.current,
      deadlines: this.deadlines,
      seq: this.seq,
      // Kept for the match: the reveal opens it, Phase 1 replays decks.
      [`deck:${match.handNo}`]: {
        deck: plan.deck,
        secret: toBase64(plan.secret),
      },
    }
    if (match.handNo === 1 && this.recordable())
      writes[outboxKey(0, 'match')] = this.matchCall()
    this.expectArchive(writes)
    await this.ctx.storage.put(writes)
    await this.armAlarm()
    // The commitment goes out before any frame carries a card of this hand.
    for (const ws of this.openSockets())
      this.send(ws, {
        t: 'hand_start',
        seq: this.seq,
        matchId: match.id,
        handNo: match.handNo,
        commitment,
        button: hand.config.button,
        blinds: hand.config.blinds,
        stacks: hand.players.map((p) => p.stack),
      })
    this.broadcast('state')
    if (match.handNo === 1)
      logEvent('match_start', {
        matchId: match.id,
        userIds: match.players.map((p) => p.userId),
      })
    // A hand that is over at the deal (blinds all in) still needs its end.
    if (isOver(hand)) await this.applyEndAtDeal(hand)
    else if (match.handNo === 1) void this.flushOutbox()
  }

  /** Settles a hand the blinds alone finished, through the normal end path. */
  private async applyEndAtDeal(hand: HandState) {
    const match = this.match!
    for (const [s, net] of Object.entries(hand.result!.netBySeat))
      match.net[Number(s)] += net
    this.logHandEnd(hand, 0)
    const writes: Record<string, unknown> = { match }
    this.ended = await this.endOfHand(hand, this.current!, writes)
    writes.ended = this.ended
    this.setGameDeadline({
      kind: 'nextHand',
      at: this.clock() + NEXT_HAND_MS,
      handNo: match.handNo,
    })
    writes.deadlines = this.deadlines
    this.expectArchive(writes)
    await this.ctx.storage.put(writes)
    await this.armAlarm()
    for (const ws of this.openSockets()) this.sendEnded(ws)
    void this.flushOutbox()
  }

  private logHandEnd(hand: HandState, ms: number) {
    logEvent('hand_end', {
      matchId: this.match!.id,
      handNo: hand.config.handNo,
      reason: hand.result!.showdown ? 'showdown' : 'fold',
      ms,
    })
  }

  /** The public record and reveal of a finished hand; queues the archive. */
  private async endOfHand(
    hand: HandState,
    current: Current,
    writes: Record<string, unknown>,
  ): Promise<Ended> {
    const match = this.match!
    const stored = (await this.ctx.storage.get(`deck:${match.handNo}`)) as {
      deck: number[]
      secret: string
    }
    const secret = fromBase64(stored.secret)
    const shown = hand.players
      .filter((p) => p.shown && p.cards)
      .map((p) => ({ seat: p.seat, cards: p.cards! }))
    const record: HandRecordV1 = {
      v: 1,
      matchId: match.id,
      handNo: match.handNo,
      segment: 1,
      config: hand.config,
      seats: match.players.map(({ seat, userId, username }) => ({
        seat,
        userId,
        username,
      })),
      commitment: current.commitment,
      actions: hand.actions.map((a, i) => ({ ...a, ...current.timing[i] })),
      board: hand.board,
      shown,
      awards: hand.result!.awards,
      netBySeat: hand.result!.netBySeat,
      showdown: hand.result!.showdown,
    }
    const { leaves } = await commitDeck(stored.deck, secret)
    const slots = await revealSlots(
      stored.deck,
      secret,
      publicSlots({ config: hand.config, board: hand.board, shown }),
    )
    const reveal: Reveal = {
      handNo: match.handNo,
      leaves: toBase64(leaves),
      slots,
    }
    const holeSlots = dealSlots(hand.config).holes
    const own: Record<SeatId, RevealedSlot[]> = {}
    for (const p of hand.players)
      own[p.seat] = await revealSlots(stored.deck, secret, holeSlots[p.seat])
    if (this.recordable()) {
      // A rated hand's record waits for its luck (settleLuck).
      const key = match.adjusted ? heldKey : outboxKey
      const userOf = (seat: SeatId) =>
        match.players.find((p) => p.seat === seat)!.userId
      const holes = Object.fromEntries(
        hand.players.map((p) => [
          p.seat,
          holeSlots[p.seat].map((slot) => stored.deck[slot]),
        ]),
      )
      writes[key(match.handNo, 'hand')] = {
        rpc: 'record_hand',
        attempts: 0,
        body: {
          id: `${match.id}:${match.handNo}`,
          matchId: match.id,
          handNo: match.handNo,
          segment: 1,
          button: hand.config.button,
          commitment: current.commitment,
          leaves: reveal.leaves,
          reveal: slots,
          record,
          deck: stored.deck,
          secret: stored.secret,
          holes,
          holesByUser: hand.players.map((p) => ({
            userId: userOf(p.seat),
            cards: holes[p.seat],
          })),
          netByUser: Object.fromEntries(
            Object.entries(hand.result!.netBySeat).map(([s, n]) => [
              userOf(Number(s)),
              n,
            ]),
          ),
        },
      } satisfies Outbox
      // Sorts after this hand's archive call, so it is sent only once
      // Postgres has the hand: the consumer never races the archive.
      writes[key(match.handNo, 'verify')] = {
        send: { matchId: match.id, handNo: match.handNo },
        attempts: 0,
      } satisfies Outbox
    }
    return { record, reveal, own }
  }

  /**
   * Rated: adds the last finished hand's luck-adjusted net to the match
   * total and releases its held archive calls with the luck in the record.
   * Runs as the next hand starts and at the finish, never before a hand's
   * showdown frames: a preflop all-in costs ≈ 0.5 s of CPU. Idempotent, and
   * recomputed from the stored hand after a restart.
   */
  private async settleLuck() {
    const match = this.match!
    const hand = this.hand
    if (!match.adjusted || !hand?.result) return
    const handNo = hand.config.handNo
    if ((match.adjustedThrough ?? 0) >= handNo) return
    const luck = luckAdjusted(hand)
    for (const [s, net] of Object.entries(luck.netBySeat))
      match.adjusted[Number(s)] += net
    match.adjustedThrough = handNo
    const held = await this.ctx.storage.list<Outbox>({
      prefix: heldKey(handNo, ''),
    })
    const writes: Record<string, unknown> = { match }
    for (const [key, call] of held) {
      if (!('send' in call) && call.rpc === 'record_hand')
        (call.body as { record: HandRecordV1 }).record.luck = {
          allInAt: luck.allInAt,
          equity: luck.equity,
          adjustedBySeat: luck.netBySeat,
        }
      writes[`outbox:${key.slice('held:'.length)}`] = call
    }
    this.expectArchive(writes)
    // No await between the two: they commit together.
    const released = held.size
      ? this.ctx.storage.delete([...held.keys()])
      : null
    await this.ctx.storage.put(writes)
    await released
    if (held.size) void this.flushOutbox()
  }

  /** The turn deadline: the decision clock and bank, or now for an away seat. */
  private turnFor(hand: HandState, startedAt: number) {
    const match = this.match!
    const player = match.players.find((p) => p.seat === hand.toAct)
    return player?.awaySince !== undefined
      ? turnDeadline(hand, startedAt, 0, 0)
      : turnDeadline(
          hand,
          startedAt,
          match.config.decisionMs,
          this.bankOf(hand),
        )
  }

  private bankOf(hand: HandState) {
    return this.match!.players.find((p) => p.seat === hand.toAct)?.bankMs ?? 0
  }

  /**
   * Called with every write that queues an archive call: if the object is
   * evicted before the immediate send, this deadline still delivers it.
   */
  private expectArchive(writes: Record<string, unknown>) {
    if (!Object.keys(writes).some((k) => k.startsWith('outbox:'))) return
    if (!this.deadlines.some((d) => d.kind === 'outbox'))
      this.deadlines.push({
        kind: 'outbox',
        at: this.clock() + OUTBOX_SAFETY_MS,
      })
    writes.deadlines = this.deadlines
  }

  /** Replaces the turn/next-hand deadline; archive retries and graces stay. */
  private setGameDeadline(deadline: Deadline | null) {
    this.deadlines = [
      ...this.deadlines.filter(
        (d) =>
          d.kind === 'outbox' || d.kind === 'grace' || d.kind === 'rematch',
      ),
      ...(deadline ? [deadline] : []),
    ]
  }

  private async armAlarm() {
    await this.ctx.storage.put('deadlines', this.deadlines)
    const at = earliest(this.deadlines)
    if (at === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(at)
  }

  private invariantsHold(state: HandState) {
    try {
      assertInvariants(
        state,
        state.config.seats.reduce((sum, s) => sum + s.stack, 0),
      )
      return true
    } catch (error) {
      this.engineFault(error, state.config.handNo, state)
      return false
    }
  }

  /**
   * Loud and final rather than a wrong payout: the match ends as
   * `engine_fault`. Ids only in the log: `evidence` (the state or plan) holds
   * the deck and every hole card.
   */
  private engineFault(error: unknown, handNo: number, evidence: unknown) {
    const detail = error instanceof Error ? error.message : describeError(error)
    logEvent('error', {
      matchId: this.match?.id,
      handNo,
      reason: 'engine_fault',
      detail,
    })
    // The evidence goes where only the service role can read it. Written
    // before finish() so its flush sends it.
    if (this.recordable())
      void this.ctx.storage.put(outboxKey(handNo, 'incident'), {
        rpc: 'record_incident',
        attempts: 0,
        body: {
          matchId: this.match!.id,
          handNo,
          kind: 'engine_fault',
          detail: { error: detail, evidence },
        },
      } satisfies Outbox)
    void this.finish('engine_fault')
  }

  /**
   * An expired invite or a finished table deletes itself, closing any
   * socket still open, once nothing is left to archive; otherwise it checks
   * again later. True when the table is gone.
   */
  private async idle() {
    if (this.match?.status === 'playing') return false
    const pending = await this.ctx.storage.list({ prefix: 'outbox:', limit: 1 })
    if (pending.size) {
      this.deadlines.push({ kind: 'idle', at: this.clock() + IDLE_MS })
      return false
    }
    for (const ws of this.ctx.getWebSockets())
      try {
        ws.close(CLOSE_GONE, 'closed')
      } catch {
        // Already closed.
      }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.match = null
    this.hand = null
    this.current = null
    this.ended = null
    this.deadlines = []
    this.seq = 0
    this.lastAck = {}
    return true
  }

  /** A paired table not everyone opened in time. */
  private noShow() {
    const absent = this.match!.players.map((p) => p.seat).filter(
      (seat) => !this.seated(seat),
    )
    return this.finish('no_show', undefined, absent)
  }

  private async finish(
    reason: MatchEndReason,
    forfeit?: SeatId,
    noShow?: SeatId[],
    abandoned?: SeatId[],
  ) {
    const match = this.match!
    await this.settleLuck()
    match.status = 'finished'
    match.endReason = reason
    if (forfeit !== undefined) match.forfeit = forfeit
    if (noShow) match.noShow = noShow
    if (abandoned) match.abandoned = abandoned
    // Rated: a forfeit loses whatever the chips say; a void match has no
    // result; otherwise the luck-adjusted total and the draw band decide.
    if (match.adjusted && !VOID.includes(reason))
      match.outcome =
        forfeit !== undefined
          ? forfeit === 0
            ? { 0: 'loss', 1: 'win' }
            : { 0: 'win', 1: 'loss' }
          : outcomes(match.adjusted, match.config.blinds.bb)
    this.seq++
    this.logFinish(match, reason, forfeit, noShow)
    this.setGameDeadline({ kind: 'idle', at: this.clock() + IDLE_MS })
    this.deadlines = this.deadlines.filter((d) => d.kind !== 'grace')
    const writes: Record<string, unknown> = {
      match,
      seq: this.seq,
      deadlines: this.deadlines,
    }
    if (this.recordable()) writes[outboxKey(9999, 'end')] = this.matchCall()
    this.expectArchive(writes)
    await this.ctx.storage.put(writes)
    await this.armAlarm()
    this.broadcast('state')
    for (const ws of this.openSockets())
      this.send(ws, {
        t: 'match_end',
        seq: this.seq,
        matchId: match.id,
        result: this.result(),
      })
    void this.flushOutbox()
    // Free both accounts for their next table. If this is lost, the lobby
    // finds the table over the next time it asks.
    try {
      await lobbyStub(this.env).release(
        match.players.map((p) => p.userId),
        match.id,
      )
    } catch (error) {
      logEvent('error', {
        matchId: match.id,
        reason: 'lobby_release',
        detail: describeError(error),
      })
    }
    await this.offerRematch()
  }

  // ---- Rematch (P1-04) -------------------------------------------------------

  /**
   * A rated match with a result may be played again by the same two players.
   * The lobby says whether they may still meet today (R-9). It is asked once
   * the result is stored and sent, so the result never waits on it.
   */
  private async offerRematch() {
    const match = this.match!
    if (!match.outcome || match.rematch) return
    let left = 1
    try {
      left = await lobbyStub(this.env).pairsLeft(
        match.players.map((p) => p.userId),
      )
    } catch (error) {
      // Asked again when both players press.
      logEvent('error', {
        matchId: match.id,
        reason: 'lobby_pairs',
        detail: describeError(error),
      })
    }
    // Made meanwhile by a join or a press, or the table closed.
    if (this.match !== match || match.rematch) return
    await this.setRematch({ state: left > 0 ? 'open' : 'limit', pressed: [] })
  }

  /** Both press within REMATCH_MS and the lobby starts a new rated table. */
  private async pressRematch(ws: WebSocket, seat: SeatId) {
    const match = this.match!
    // Finished with a result but no offer yet (on its way, or lost to a
    // restart after the result was stored): make it now.
    if (match.outcome && !match.rematch) await this.offerRematch()
    const offer = match.rematch
    if (!offer)
      return this.illegal(ws, seat, 'There is no rematch at this table')
    // The minute is over, even if its alarm has not run yet.
    if (
      offer.state === 'waiting' &&
      offer.until !== undefined &&
      this.clock() >= offer.until
    )
      return this.rematchExpired()
    // Pressed already, or nothing left to press: how it stands.
    if (
      (offer.state !== 'open' && offer.state !== 'waiting') ||
      offer.pressed.includes(seat)
    )
      return this.send(ws, this.rematchFrame())
    const pressed = [...offer.pressed, seat].sort((a, b) => a - b)
    if (pressed.length < 2) {
      const until = this.clock() + REMATCH_MS
      // However late the press, the table stays for the whole minute, and
      // a while after it so both see how it ended.
      this.deadlines = this.deadlines.map((d) =>
        d.kind === 'idle'
          ? { ...d, at: Math.max(d.at, until + REMATCH_MS) }
          : d,
      )
      this.deadlines.push({ kind: 'rematch', at: until })
      return this.setRematch({ state: 'waiting', pressed, until })
    }
    // Both pressed. Marked first, so neither the expiry nor another press
    // changes the offer while the lobby answers.
    match.rematch = { state: 'starting', pressed }
    this.deadlines = this.deadlines.filter((d) => d.kind !== 'rematch')
    let answer: RematchAnswer
    try {
      // Seats swap, so the other player has the first hand's button.
      const players = [...match.players]
        .sort((a, b) => b.seat - a.seat)
        .map(({ userId, username }) => ({ userId, username }))
      answer = await lobbyStub(this.env).rematch(players, match.id)
    } catch (error) {
      logEvent('error', {
        matchId: match.id,
        reason: 'lobby_rematch',
        detail: describeError(error),
      })
      answer = { refused: 'busy' }
    }
    await this.setRematch(
      'matchId' in answer
        ? { state: 'starting', pressed, next: answer.matchId }
        : { state: answer.refused === 'limit' ? 'limit' : 'declined', pressed },
    )
  }

  private async rematchExpired() {
    const offer = this.match?.rematch
    if (offer?.state !== 'waiting') return
    this.deadlines = this.deadlines.filter((d) => d.kind !== 'rematch')
    await this.setRematch({ state: 'declined', pressed: offer.pressed })
  }

  /** Stores the offer, then tells both seats. */
  private async setRematch(offer: Rematch) {
    const match = this.match!
    match.rematch = offer
    this.seq++
    await this.ctx.storage.put({ match, seq: this.seq })
    await this.armAlarm()
    for (const ws of this.openSockets()) this.send(ws, this.rematchFrame())
  }

  private rematchFrame(): ServerMsg {
    const match = this.match!
    const { state, pressed, until, next } = match.rematch!
    return {
      t: 'rematch_state',
      seq: this.seq,
      matchId: match.id,
      state,
      pressed: [...pressed],
      ...(until !== undefined ? { until } : {}),
      ...(next ? { next } : {}),
    }
  }

  /** A finished match's result and offer, for a socket that (re)joins. */
  private sendMatchEnd(ws: WebSocket) {
    const match = this.match
    if (match?.status !== 'finished') return
    this.send(ws, {
      t: 'match_end',
      seq: this.seq,
      matchId: match.id,
      result: this.result(),
    })
    if (match.rematch) this.send(ws, this.rematchFrame())
    // A result whose offer was lost to a restart: made now, for both.
    else if (match.outcome) void this.offerRematch()
  }

  private logFinish(
    match: Match,
    reason: MatchEndReason,
    forfeit?: SeatId,
    noShow?: SeatId[],
  ) {
    const userOf = (seat: SeatId) =>
      match.players.find((p) => p.seat === seat)?.userId
    if (forfeit !== undefined)
      logEvent('forfeit', {
        matchId: match.id,
        seat: forfeit,
        userId: userOf(forfeit),
      })
    for (const seat of noShow ?? [])
      logEvent('no_show', { matchId: match.id, seat, userId: userOf(seat) })
    logEvent('match_end', { matchId: match.id, reason, handNo: match.handNo })
  }

  // ---- Archive ---------------------------------------------------------------

  /** Real accounts and a configured key; local dev tables are not archived. */
  private recordable() {
    return (
      !!this.env.SUPABASE_SECRET_KEY &&
      !!this.match?.players.every((p) => UUID.test(p.userId))
    )
  }

  private matchCall(): Outbox {
    const match = this.match!
    return {
      rpc: 'record_match',
      attempts: 0,
      body: {
        id: match.id,
        kind: match.config.kind,
        config: match.config,
        players: match.players.map(({ seat, userId }) => ({ seat, userId })),
        ...(match.rematchOf ? { rematchOf: match.rematchOf } : {}),
        ...(match.status === 'finished'
          ? {
              handNo: match.handNo,
              timeouts: Object.fromEntries(
                match.players.map((p) => [p.seat, p.timeouts]),
              ),
              result: this.result(),
            }
          : {}),
      },
    }
  }

  /** A finished match's result, as the seats and the archive get it. */
  private result() {
    const match = this.match!
    return {
      netBySeat: { ...match.net },
      reason: match.endReason!,
      ...(match.forfeit !== undefined ? { forfeit: match.forfeit } : {}),
      ...(match.noShow ? { noShow: match.noShow } : {}),
      ...(match.abandoned ? { abandoned: match.abandoned } : {}),
      ...(match.adjusted ? { adjustedBySeat: { ...match.adjusted } } : {}),
      ...(match.outcome ? { outcomeBySeat: { ...match.outcome } } : {}),
    }
  }

  /**
   * Sends queued archive calls in key order and stops at the first failure,
   * so a hand never reaches Postgres before its match. A failure schedules
   * a retry with backoff; play never waits on the archive.
   */
  async flushOutbox() {
    if (this.flushing) {
      this.flushAgain = true
      return
    }
    this.flushing = true
    try {
      do {
        this.flushAgain = false
        // A failure has armed its own retry, which lists everything again.
        if (!(await this.flushPass())) return
      } while (this.flushAgain)
      // Nothing can be queued between the check above and this line, so no
      // call is left without a deadline; one queued later arms its own.
      if (this.deadlines.some((d) => d.kind === 'outbox')) {
        this.deadlines = this.deadlines.filter((d) => d.kind !== 'outbox')
        await this.armAlarm()
      }
    } finally {
      this.flushing = false
    }
  }

  /** One pass over the outbox. False when a failure armed a retry. */
  private async flushPass() {
    const queued = await this.ctx.storage.list<Outbox>({ prefix: 'outbox:' })
    // The most attempts among calls that failed without stopping the flush.
    let behind = 0
    // A parked call queues an incident report that this pass did not list.
    let parked = false
    // Entries parked along with a call (a hand's verification).
    const dropped = new Set<string>()
    for (const [key, call] of queued) {
      if (dropped.has(key)) continue
      const outcome: ArchiveOutcome =
        'send' in call
          ? { ok: await this.enqueue(call.send) }
          : await archive(this.env, call)
      if (outcome.ok) {
        await this.ctx.storage.delete(key)
        continue
      }
      const attempts = call.attempts + 1
      const refused = (call.refused ?? 0) + (refusedForData(outcome) ? 1 : 0)
      // An incident report never holds up the flush, so it is never parked:
      // parking it would only lose its evidence at cleanup.
      if (
        !('send' in call) &&
        call.rpc !== 'record_incident' &&
        refused >= OUTBOX_MAX_REFUSALS
      ) {
        for (const k of await this.park(key, call, outcome)) dropped.add(k)
        parked = true
        continue
      }
      logEvent('outbox_retry', {
        matchId: this.match?.id,
        rpc: 'send' in call ? 'hand_queue' : call.rpc,
        attempt: attempts,
        depth: queued.size,
      })
      await this.ctx.storage.put(key, { ...call, attempts, refused })
      if ('send' in call || call.rpc === 'record_incident') {
        behind = Math.max(behind, attempts)
        continue
      }
      await this.retryOutbox(attempts)
      return false
    }
    if (behind || parked) {
      await this.retryOutbox(Math.max(behind, 1))
      return false
    }
    return true
  }

  /**
   * Sets aside a call Postgres keeps refusing for its data, so the calls
   * behind it can go through, and reports it once as an incident. The
   * incident carries the call itself (incidents are for the service role
   * only, like the deck), so it can be replayed once the cause is fixed.
   * A parked hand takes its verification with it: the verifier would find
   * no hand and report a false failure. Returns the keys parked with it.
   */
  private async park(
    key: string,
    call: ArchiveCall & { attempts: number },
    outcome: ArchiveOutcome,
  ) {
    const rest = key.slice('outbox:'.length)
    const [n, what] = rest.split(':')
    await this.ctx.storage.put(`parked:${rest}`, call)
    await this.ctx.storage.delete(key)
    const alongside: string[] = []
    if (call.rpc === 'record_hand') {
      const verify = `outbox:${n}:verify`
      const entry = await this.ctx.storage.get<Outbox>(verify)
      if (entry) {
        await this.ctx.storage.put(`parked:${n}:verify`, entry)
        await this.ctx.storage.delete(verify)
        alongside.push(verify)
      }
    }
    logEvent('outbox_parked', {
      matchId: this.match?.id,
      rpc: call.rpc,
      code: outcome.status,
      detail: outcome.code,
    })
    const handNo = (call.body as { handNo?: unknown }).handNo
    await this.ctx.storage.put(`${key}:parked`, {
      rpc: 'record_incident',
      attempts: 0,
      body: {
        matchId: this.match!.id,
        handNo:
          call.rpc === 'record_hand' && typeof handNo === 'number'
            ? handNo
            : null,
        // One incident per parked call: the match's start and end both have
        // no hand number, so the call names the kind (incidents_once).
        kind: `archive_parked:${what}`,
        detail: {
          rpc: call.rpc,
          status: outcome.status,
          code: outcome.code,
          body: call.body,
        },
      },
    } satisfies Outbox)
    return alongside
  }

  private async retryOutbox(attempts: number) {
    this.deadlines = [
      ...this.deadlines.filter((d) => d.kind !== 'outbox'),
      { kind: 'outbox', at: this.clock() + outboxBackoff(attempts) },
    ]
    await this.armAlarm()
  }

  /** Hands a finished hand to the verify queue. Never throws. */
  private async enqueue(message: HandMessage) {
    try {
      await this.env.HAND_QUEUE.send(message)
      return true
    } catch {
      return false
    }
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
        consecutiveTimeouts: p.timeouts,
      })),
    }
    const turn = this.deadlines.find((d) => isCurrentTurn(d, this.hand))
    const view = this.hand
      ? seatView(this.hand, seat, {
          matchId: match.id,
          match: table,
          clock:
            turn && match.status === 'playing'
              ? { deadline: turn.at, bankMs: this.bankOf(this.hand) }
              : null,
          lastReqId: this.lastAck[seat]?.reqId ?? null,
          commitment: this.current?.commitment ?? null,
        })
      : null
    const base = { seq: this.seq, matchId: match.id, serverNow: this.clock() }
    return kind === 'welcome'
      ? { ...base, t: 'welcome', seat, table, view }
      : { ...base, t: 'state', table, view }
  }

  /** The finished hand's record and reveal, while it is still on the table. */
  private sendEnded(ws: WebSocket) {
    const ended = this.ended
    if (!ended || !this.hand || ended.record.handNo !== this.hand.config.handNo)
      return
    const { seat } = ws.deserializeAttachment() as Attachment
    const base = { seq: this.seq, matchId: ended.record.matchId }
    this.send(ws, {
      ...base,
      t: 'hand_end',
      handNo: ended.record.handNo,
      record: ended.record,
    })
    const own = ended.own?.[seat]
    this.send(ws, {
      ...base,
      t: 'reveal',
      ...ended.reveal,
      ...(own ? { own } : {}),
    })
  }

  /**
   * `gone` is a socket that is closing: offline, and not sent to. `skip`
   * already has its frame (a fresh welcome) but still counts as connected.
   */
  private broadcast(
    kind: 'state',
    { gone, skip }: { gone?: WebSocket; skip?: WebSocket } = {},
  ) {
    if (!this.match) return
    for (const ws of this.openSockets(gone)) {
      if (ws === skip) continue
      const { seat } = ws.deserializeAttachment() as Attachment
      this.send(ws, this.frame(kind, seat, gone))
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
