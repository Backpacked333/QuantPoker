import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from './api'
import { Lobby } from './Lobby'
import { LobbyConnection } from './lobbyClient'
import { LiveTable } from './LiveTable'
import { FakeSocket, MATCH, tableInfo } from './testing'

const flush = () => new Promise((r) => setTimeout(r, 0))
const sent = (s: FakeSocket) => s.sent.map((m) => JSON.parse(m))
const lobbyFrame = (msg: object) => ({ seq: 1, ...msg }) as never

const alice: Identity = {
  player: { userId: 'alice', username: 'alice' },
  getToken: async () => 'dev.alice.t',
  signOut: vi.fn(),
}
const noActive = vi.fn(async () => Response.json({ activeMatch: null }))

beforeEach(() => {
  FakeSocket.all = []
  vi.stubGlobal('WebSocket', FakeSocket)
  window.location.hash = '#lobby'
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LobbyConnection', () => {
  function connect() {
    const connection = new LobbyConnection(async () => 'jwt', {
      origin: 'wss://qp.test',
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    })
    connection.start()
    return connection
  }

  it('opens the lobby socket and queues once it is open', async () => {
    const connection = connect()
    connection.find() // before the socket opens
    await flush()
    const socket = FakeSocket.last()
    expect(socket.url).toBe('wss://qp.test/ws/lobby')
    expect(socket.protocols).toEqual(['qp.v1', 'bearer.jwt'])
    expect(socket.sent).toEqual([])
    socket.open()
    expect(sent(socket)).toEqual([{ t: 'queue', kind: 'hu-casual' }])
    socket.emit(lobbyFrame({ t: 'queued', position: 1, since: 5 }))
    socket.emit(lobbyFrame({ t: 'presence', online: 3, queued: 1 }))
    expect(connection.getState()).toMatchObject({
      looking: true,
      queued: { position: 1, since: 5 },
      presence: { online: 3, queued: 1 },
    })
  })

  it('asks again after a reconnect while still looking', async () => {
    vi.useFakeTimers()
    const connection = connect()
    await vi.advanceTimersByTimeAsync(0)
    FakeSocket.last().open()
    connection.find()
    FakeSocket.last().drop(1006)
    expect(connection.getState().status).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(600)
    const again = FakeSocket.last()
    again.open()
    expect(sent(again)).toEqual([{ t: 'queue', kind: 'hu-casual' }])
  })

  it('stops looking when cancelled or matched', async () => {
    const connection = connect()
    await flush()
    const socket = FakeSocket.last()
    socket.open()
    connection.find()
    connection.cancel()
    expect(sent(socket).at(-1)).toEqual({ t: 'dequeue' })
    expect(connection.getState().looking).toBe(false)
    // A late 'queued' after cancelling is ignored.
    socket.emit(lobbyFrame({ t: 'queued', position: 1, since: 5 }))
    expect(connection.getState().queued).toBeNull()

    connection.find()
    socket.emit(lobbyFrame({ t: 'matched', matchId: MATCH, resumed: true }))
    expect(connection.getState()).toMatchObject({
      looking: false,
      matched: { matchId: MATCH, resumed: true },
    })
  })

  it('stops for good when another tab opens the lobby', async () => {
    const connection = connect()
    await flush()
    FakeSocket.last().drop(4001)
    expect(connection.getState().status).toBe('replaced')
  })
})

describe('Lobby: Play 1v1', () => {
  async function lobbyPage(props: Partial<Parameters<typeof Lobby>[0]> = {}) {
    render(<Lobby identity={alice} fetcher={noActive} {...props} />)
    await act(async () => {})
    const socket = FakeSocket.last()
    act(() => socket.open())
    return socket
  }

  it('finds a match and goes to the table', async () => {
    const socket = await lobbyPage()
    act(() => socket.emit(lobbyFrame({ t: 'presence', online: 3, queued: 0 })))
    expect(screen.getByText('2 other players in the lobby.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Find a match' }))
    expect(sent(socket)).toEqual([{ t: 'queue', kind: 'hu-casual' }])
    expect(screen.getByText('Looking for an opponent')).toBeVisible()
    act(() => socket.emit(lobbyFrame({ t: 'matched', matchId: MATCH })))
    expect(window.location.hash).toBe(`#play/${MATCH}`)
  })

  it('cancels', async () => {
    const socket = await lobbyPage()
    await userEvent.click(screen.getByRole('button', { name: 'Find a match' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(sent(socket).at(-1)).toEqual({ t: 'dequeue' })
    expect(screen.getByRole('button', { name: 'Find a match' })).toBeVisible()
  })

  it('offers Atlas after a minute alone in the queue', async () => {
    const socket = await lobbyPage()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    act(() => screen.getByRole('button', { name: 'Find a match' }).click())
    act(() => socket.emit(lobbyFrame({ t: 'presence', online: 1, queued: 1 })))
    expect(screen.queryByText(/Nobody else is looking/)).toBeNull()
    await act(async () => vi.advanceTimersByTime(61_000))
    expect(screen.getByText(/Nobody else is looking right now/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Practice vs Atlas' }),
    ).toHaveAttribute('href', '#table')
    act(() => screen.getByRole('button', { name: 'Keep waiting' }).click())
    expect(screen.queryByText(/Nobody else is looking/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  it('starts looking at once when sent back to find another match', async () => {
    const socket = await lobbyPage({ autoFind: true })
    expect(sent(socket)).toEqual([{ t: 'queue', kind: 'hu-casual' }])
  })

  it('points to the table already in play', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/api/me')
        ? Response.json({ activeMatch: MATCH })
        : Response.json({ error: 'active', matchId: MATCH }, { status: 409 }),
    ) as unknown as typeof fetch
    await lobbyPage({ fetcher })
    expect(
      await screen.findByRole('link', { name: 'Return to your table' }),
    ).toHaveAttribute('href', `#play/${MATCH}`)
    await userEvent.click(
      screen.getByRole('button', { name: 'Play a friend by link' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already playing at another table',
    )
  })
})

describe('LiveTable and the lobby', () => {
  async function table() {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    await act(async () => {})
    const socket = FakeSocket.last()
    act(() => socket.open())
    return socket
  }
  const welcome = (info = tableInfo(2, 'waiting')) =>
    ({
      t: 'welcome',
      seq: 0,
      matchId: MATCH,
      seat: 0,
      serverNow: 0,
      table: info,
      view: null,
    }) as const

  it('waits for a paired opponent by name', async () => {
    const socket = await table()
    const info = tableInfo(2, 'waiting')
    info.players[1].connected = false
    act(() => socket.emit(welcome(info)))
    expect(screen.getByText('Waiting for bob')).toBeVisible()
    expect(screen.queryByLabelText('Invite link')).toBeNull()
  })

  it('explains a no-show and offers another match', async () => {
    const socket = await table()
    const info = tableInfo(2, 'waiting')
    info.players[1].connected = false
    act(() => socket.emit(welcome(info)))
    act(() =>
      socket.emit({
        t: 'match_end',
        seq: 1,
        matchId: MATCH,
        result: { netBySeat: { 0: 0, 1: 0 }, reason: 'no_show', noShow: [1] },
      }),
    )
    expect(screen.getByText('bob did not show up')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Find another match' }),
    ).toHaveAttribute('href', '#lobby/find')
  })

  it('sends a player who is busy elsewhere to their table', async () => {
    const socket = await table()
    const other = '44444444-4444-4444-8444-444444444444'
    act(() => socket.drop(4409, other))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'already playing at another table',
    )
    expect(
      screen.getByRole('link', { name: 'Go to your table' }),
    ).toHaveAttribute('href', `#play/${other}`)
  })
})
