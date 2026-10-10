import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act as engineAct } from '../engine/hand'
import { seedRandom } from '../lib/random'
import type { Identity } from './api'
import { Lobby } from './Lobby'
import { LiveTable } from './LiveTable'
import {
  FakeSocket,
  finishedHand,
  firstHand,
  frame,
  MATCH,
  tableInfo,
} from './testing'

const identity = (username: string): Identity => ({
  player: { userId: username, username },
  getToken: async () => `dev.${username}.t`,
  signOut: vi.fn(),
})
const alice = identity('alice')

beforeEach(() => {
  FakeSocket.all = []
  vi.stubGlobal('WebSocket', FakeSocket)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function opened() {
  await act(async () => {})
  const socket = FakeSocket.last()
  act(() => socket.open())
  return socket
}

/** The welcome to hand 1 at a rated table, as the server sends it. */
function ratedWelcome() {
  const f = frame('welcome', 1, 0, firstHand())
  if (f.t !== 'welcome' || !f.view) throw new Error('fixture')
  const rated = { ...f.table, kind: 'hu-rated' as const, handsTotal: 40 }
  return { ...f, table: rated, view: { ...f.view, match: rated } }
}

describe('LiveTable', () => {
  it('waits with a copyable invite link until the opponent arrives', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    expect(screen.getByRole('status')).toHaveTextContent('Joining')
    const socket = await opened()
    act(() =>
      socket.emit({
        t: 'welcome',
        seq: 0,
        matchId: MATCH,
        seat: 0,
        serverNow: 0,
        table: tableInfo(1, 'waiting'),
        view: null,
      }),
    )
    expect(screen.getByText('Waiting for your opponent')).toBeInTheDocument()
    expect(screen.getByLabelText('Invite link')).toHaveValue(
      `${window.location.origin}/#play/${MATCH}`,
    )
  })

  it('renders the live hand from the server and sends moves', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    const socket = await opened()
    const hand = firstHand()
    act(() => socket.emit(frame('welcome', 1, 0, hand)))

    const table = screen.getByRole('region', { name: 'Poker table' })
    expect(table).toHaveTextContent('Live table')
    expect(table).toHaveTextContent('vs bob')
    expect(table).not.toHaveTextContent('Atlas')
    expect(screen.getByText('Hand 1 of 20')).toBeInTheDocument()
    expect(screen.getByText('Your move')).toBeInTheDocument()
    // No lab, no read prompt, no EV, and no practice controls.
    expect(screen.queryByText(/EV/)).toBeNull()
    for (const name of [/Pause table/, 'Hand history', 'Table settings'])
      expect(screen.queryByRole('button', { name })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Call 10/ }))
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      t: 'act',
      handNo: 1,
      actionIndex: 0,
      action: { type: 'call' },
    })
    const reqId = JSON.parse(socket.sent[0]).reqId as string
    act(() =>
      socket.emit(
        frame('state', 2, 0, engineAct(hand, 0, { type: 'call' }), reqId),
      ),
    )
    expect(screen.getByText('bob to act')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Check/ })).toBeDisabled()
  })

  it('shows the hand result without deal buttons', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    const socket = await opened()
    const folded = engineAct(firstHand(), 0, { type: 'fold' })
    act(() => socket.emit(frame('welcome', 3, 0, folded)))
    expect(screen.getByText('You fold · bob wins')).toBeInTheDocument()
    expect(screen.getByText('Next hand in a few seconds.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Deal next hand/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Review hand' })).toBeNull()
  })

  it('ends a rated match by its outcome: a forfeit while ahead reads as a loss', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    const socket = await opened()
    const folded = engineAct(firstHand(), 0, { type: 'fold' })
    act(() => socket.emit(frame('welcome', 3, 0, folded)))
    act(() =>
      socket.emit({
        t: 'match_end',
        seq: 4,
        matchId: MATCH,
        result: {
          netBySeat: { 0: 560, 1: -560 },
          reason: 'forfeit',
          forfeit: 0,
          adjustedBySeat: { 0: 560, 1: -560 },
          outcomeBySeat: { 0: 'loss', 1: 'win' },
        },
      }),
    )
    expect(
      screen.getByText('Match over: you lost by forfeit.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/you won/)).toBeNull()
  })

  it('a finished rated match shows the end panel, and Rematch is sent to the table', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    const socket = await opened()
    const { hand, record } = await finishedHand({ fold: true })
    const welcome = ratedWelcome()
    const folded = frame('welcome', 3, 0, hand)
    if (folded.t !== 'welcome' || !folded.view) throw new Error('fixture')
    const view = { ...folded.view, match: welcome.table }
    act(() => socket.emit({ ...folded, table: welcome.table, view }))
    act(() =>
      socket.emit({ t: 'hand_end', seq: 3, matchId: MATCH, handNo: 1, record }),
    )
    act(() =>
      socket.emit({
        t: 'match_end',
        seq: 4,
        matchId: MATCH,
        result: {
          netBySeat: { 0: 220, 1: -220 },
          reason: 'complete',
          adjustedBySeat: { 0: 250, 1: -250 },
          outcomeBySeat: { 0: 'win', 1: 'loss' },
        },
      }),
    )
    act(() =>
      socket.emit({
        t: 'rematch_state',
        seq: 5,
        matchId: MATCH,
        state: 'open',
        pressed: [],
      }),
    )
    expect(
      screen.getByRole('heading', { name: '+12.5 bb · Win' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rematch' }))
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ t: 'rematch' })
  })

  it('names a rated match in the match bar', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    const socket = await opened()
    const welcome = frame('welcome', 1, 0, firstHand())
    if (welcome.t !== 'welcome' || !welcome.view) throw new Error('fixture')
    const rated = {
      ...welcome.table,
      kind: 'hu-rated' as const,
      handsTotal: 40,
    }
    const view = { ...welcome.view, match: rated }
    act(() => socket.emit({ ...welcome, table: rated, view }))
    expect(screen.getByText('Rated · Hand 1 of 40')).toBeInTheDocument()
  })

  it('a rated table renders no equity value, EV label, lab button or guess bar', async () => {
    // The same decision at a casual table shows the pot-odds ring and the
    // break-even figure, so the checks below are not vacuous.
    const casual = render(<LiveTable matchId={MATCH} identity={alice} />)
    let socket = await opened()
    act(() => socket.emit(frame('welcome', 1, 0, firstHand())))
    expect(casual.container.querySelector('.ring')).not.toBeNull()
    expect(screen.getByText(/break-even \d+%/)).toBeInTheDocument()
    casual.unmount()

    const { container } = render(<LiveTable matchId={MATCH} identity={alice} />)
    socket = await opened()
    act(() => socket.emit(ratedWelcome()))
    expect(screen.getByText('Rated · Hand 1 of 40')).toBeInTheDocument()
    expect(screen.getByText('Your move')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Call 10/ })).toBeEnabled()
    expect(container.querySelector('.ring')).toBeNull()
    expect(container.textContent).not.toMatch(/%|break-even|equity|\bEV\b/i)
    expect(screen.queryByRole('slider', { name: /equity/i })).toBeNull()
    for (const name of [
      /lab/i,
      /lock in/i,
      /skip/i,
      /Pause table/,
      'Hand history',
      'Table settings',
    ])
      expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('?seed=3&motion=off does not change a rated table', async () => {
    // What the two switches do at boot (src/env.ts, src/main.tsx): seed the
    // trainer's random source, and freeze every animation.
    const seen = async (switches: boolean) => {
      if (switches) {
        seedRandom(3)
        document.documentElement.classList.add('no-motion')
      }
      const table = <LiveTable matchId={MATCH} identity={alice} />
      const { container, unmount } = render(
        switches ? (
          <MotionConfig reducedMotion="always">{table}</MotionConfig>
        ) : (
          table
        ),
      )
      try {
        const socket = await opened()
        act(() => socket.emit(ratedWelcome()))
        return {
          text: container.textContent,
          buttons: screen
            .getAllByRole('button')
            .map(
              (b) => `${b.textContent}|${(b as HTMLButtonElement).disabled}`,
            ),
          sliders: screen
            .queryAllByRole('slider')
            .map((i) => i.getAttribute('aria-label') ?? i.id),
        }
      } finally {
        unmount()
        seedRandom(null)
        document.documentElement.classList.remove('no-motion')
      }
    }
    const plain = await seen(false)
    expect(plain.text).toContain('Rated · Hand 1 of 40')
    expect(await seen(true)).toEqual(plain)
  })

  it('flags a dropped opponent and its own reconnects, and disables moves', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    const socket = await opened()
    const hand = firstHand()
    act(() => socket.emit(frame('welcome', 1, 0, hand)))
    const bar = () => screen.getAllByRole('status')[0]
    expect(bar()).not.toHaveTextContent('disconnected')

    const away = frame('state', 2, 0, hand)
    if (away.t !== 'state') throw new Error('expected state')
    away.table.players[1].connected = false
    act(() => socket.emit(away))
    expect(bar()).toHaveTextContent('vs bob · disconnected')

    vi.useFakeTimers()
    act(() => socket.drop(1006))
    expect(bar()).toHaveTextContent('Reconnecting…')
    // A move made now would go nowhere, so none can be made.
    expect(screen.getByRole('button', { name: /Call 10/ })).toBeDisabled()

    await act(async () => vi.advanceTimersByTime(10_000))
    vi.useRealTimers()
    await act(async () => {})
    const again = FakeSocket.last()
    expect(again).not.toBe(socket)
    act(() => again.open())
    act(() => again.emit(frame('welcome', 3, 0, hand)))
    expect(bar()).not.toHaveTextContent(/Reconnecting|disconnected/)
    expect(screen.getByRole('button', { name: /Call 10/ })).toBeEnabled()
  })

  it('explains when another tab took the seat', async () => {
    render(<LiveTable matchId={MATCH} identity={alice} />)
    const socket = await opened()
    act(() => socket.drop(4001))
    expect(screen.getByRole('alert')).toHaveTextContent('open in another tab')
  })
})

describe('Lobby', () => {
  it('opens a table by link and goes to it', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ matchId: MATCH }, { status: 201 }),
    )
    render(<Lobby identity={alice} fetcher={fetcher} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Play a friend by link' }),
    )
    expect(window.location.hash).toBe(`#play/${MATCH}`)
    expect(fetcher).toHaveBeenCalledWith('/api/matches', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev.alice.t' },
    })
  })

  it('shows why a table could not be opened', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 500 }))
    render(<Lobby identity={alice} fetcher={fetcher} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Play a friend by link' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create a table',
    )
  })
})
