import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from './api'
import { TableConnection } from './client'
import { clockParts } from './clockParts'
import { LiveTable } from './LiveTable'
import { ReviewLive } from './ReviewLive'
import { FakeSocket, finishedHand, frame, MATCH } from './testing'

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  FakeSocket.all = []
})
afterEach(() => vi.unstubAllGlobals())

describe('clockParts', () => {
  const clock = { deadline: 100_000, bankMs: 60_000 }
  it('counts the decision time first, then the bank', () => {
    expect(clockParts(clock, 20_000)).toEqual({
      phase: 'decision',
      seconds: 20,
    })
    expect(clockParts(clock, 39_001)).toEqual({ phase: 'decision', seconds: 1 })
    expect(clockParts(clock, 40_000)).toEqual({ phase: 'bank', seconds: 60 })
    expect(clockParts(clock, 99_500)).toEqual({ phase: 'bank', seconds: 1 })
    expect(clockParts(clock, 200_000)).toEqual({ phase: 'bank', seconds: 0 })
  })
})

describe('TableConnection hand records', () => {
  it('keeps the commitment from before the cards, the record and the reveal', async () => {
    const { hand, frames, commitment, record } = await finishedHand()
    const connection = new TableConnection(MATCH, async () => 'jwt', {
      origin: 'wss://qp.test',
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    })
    connection.start()
    await flush()
    const socket = FakeSocket.last()
    socket.open()
    socket.emit(frames.start)
    socket.emit(frame('welcome', 2, 0, hand))
    socket.emit(frames.end)
    socket.emit(frames.reveal)
    const seen = connection.getState().hands[1]
    expect(seen.commitment).toBe(commitment)
    expect(seen.late).toBeUndefined()
    expect(seen.mine).toEqual(hand.players[0].cards)
    expect(seen.record).toEqual(record)
    expect(seen.reveal?.slots).toHaveLength(9)
  })

  it('marks a commitment first seen mid-hand as late', async () => {
    const { hand } = await finishedHand()
    const connection = new TableConnection(MATCH, async () => 'jwt', {
      origin: 'wss://qp.test',
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    })
    connection.start()
    await flush()
    const socket = FakeSocket.last()
    socket.open()
    const welcome = frame('welcome', 2, 0, hand)
    if (welcome.t !== 'welcome') throw new Error()
    welcome.view!.commitment = 'f'.repeat(64)
    welcome.serverNow = Date.now() + 5000
    socket.emit(welcome)
    const state = connection.getState()
    expect(state.hands[1]).toMatchObject({
      commitment: 'f'.repeat(64),
      late: true,
    })
    expect(state.clockOffset).toBeGreaterThan(4000)
  })
})

describe('ReviewLive', () => {
  it('verifies the deal and tells the hand street by street', async () => {
    const { record, reveal, commitment, hand } = await finishedHand()
    render(
      <ReviewLive
        seen={{ commitment, record, reveal, mine: hand.players[0].cards! }}
        you={0}
      />,
    )
    expect(await screen.findByText('Deck verified')).toBeInTheDocument()
    const review = screen.getByRole('region', { name: 'Hand review' })
    expect(review).toHaveTextContent('Hand 1')
    expect(review).toHaveTextContent('bob showed')
    expect(review).toHaveTextContent('Pre-flop')
    expect(review).toHaveTextContent('You call 10')
    expect(review).toHaveTextContent('bob checks')
    expect(review).toHaveTextContent('River')
    expect(review).toHaveTextContent('You lost 20 chips.')
  })

  it('fails the check when a card differs from the committed deck', async () => {
    const { record, reveal, commitment } = await finishedHand()
    const tampered = { ...record, board: [...record.board].reverse() }
    render(
      <ReviewLive seen={{ commitment, record: tampered, reveal }} you={0} />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deck check failed',
    )
  })

  it('fails the check when the record names a different commitment', async () => {
    const { record, reveal } = await finishedHand()
    render(
      <ReviewLive
        seen={{ commitment: 'e'.repeat(64), record, reveal }}
        you={0}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deck check failed',
    )
  })

  it('waits for the reveal', async () => {
    const { record, commitment } = await finishedHand()
    render(<ReviewLive seen={{ commitment, record }} you={0} />)
    expect(screen.getByText('Waiting for the reveal…')).toBeInTheDocument()
  })
})

describe('LiveTable clock and review', () => {
  const alice: Identity = {
    player: { userId: 'alice', username: 'alice' },
    getToken: async () => 'dev.alice.t',
    signOut: vi.fn(),
  }

  it('shows whose clock is running', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const { hand } = await finishedHand()
    render(<LiveTable matchId={MATCH} identity={alice} />)
    await act(async () => {})
    const socket = FakeSocket.last()
    act(() => socket.open())
    const fresh = frame('welcome', 1, 0, {
      ...hand,
      street: 'preflop',
      toAct: 0,
      result: undefined,
      board: [],
    })
    if (fresh.t !== 'welcome') throw new Error()
    fresh.serverNow = Date.now()
    fresh.view!.clock = { deadline: fresh.serverNow + 80_000, bankMs: 60_000 }
    act(() => socket.emit(fresh))
    expect(screen.getByRole('timer')).toHaveTextContent('Your clock · 20s')
  })

  it('opens the finished hand with the deck check', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const { hand, frames } = await finishedHand()
    render(<LiveTable matchId={MATCH} identity={alice} />)
    await act(async () => {})
    const socket = FakeSocket.last()
    act(() => socket.open())
    act(() => socket.emit(frames.start))
    act(() => socket.emit(frame('welcome', 2, 0, hand)))
    act(() => socket.emit(frames.end))
    act(() => socket.emit(frames.reveal))
    expect(screen.queryByRole('timer')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Review hand 1' }))
    expect(await screen.findByText('Deck verified')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close review' }))
    expect(screen.queryByText('Deck verified')).toBeNull()
  })
})
