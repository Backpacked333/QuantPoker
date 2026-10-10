// The landing page in the real app (L-1 to L-6): who sees it, a full
// challenge hand against the pre-scored tree, the score card with the
// server's percentile (or without it), and the hand-off to sign-up.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { CHALLENGE_HANDS } from '../challenge/hands'
import { scorePath } from '../challenge/score'
import { treeFor } from '../challenge/trees'
import { PENDING_CLAIM_KEY } from '../lib/landing'
import { hashString } from '../lib/random'
import { STORAGE_KEY } from '../lib/storage'

vi.mock('../net/supabase', () => ({ loadOnline: async () => null }))

class NoWorker {
  onmessage?: (event: unknown) => void
  postMessage() {}
  terminate() {}
}

/** A visitor id whose first hand is `id`. */
function visitorFor(id: string) {
  const want = CHALLENGE_HANDS.findIndex((h) => h.id === id)
  for (let i = 0; ; i++) {
    const vid = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    if (hashString(vid) % CHALLENGE_HANDS.length === want) return vid
  }
}

const RECEIPT = 'ab'.repeat(16)
const FRIEND = 'cd'.repeat(16)
let beacons: { name: string }[] = []
let scoreBodies: { hand: string; ver: number; path: string[] }[] = []
let scoreFails = false

beforeAll(() => import('./Landing'))
beforeEach(() => {
  beacons = []
  scoreBodies = []
  scoreFails = false
  vi.stubGlobal('Worker', NoWorker)
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (_: string, body: string) => {
      beacons.push(JSON.parse(body))
      return true
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `/api/challenge/shared/${FRIEND}`)
        return Response.json({
          hand: 'nut-draw',
          ver: 1,
          accuracy: 101,
          percentile: 99,
          basis: 'model',
        })
      if (url.startsWith('/api/challenge/shared/'))
        return Response.json({}, { status: 404 })
      if (url !== '/api/challenge/score' || scoreFails)
        return new Response('{}', { status: 503 })
      const body = JSON.parse(String(init?.body))
      scoreBodies.push(body)
      const tree = treeFor(body.hand, body.ver)!
      return Response.json({
        accuracy: scorePath(tree, body.path)!.accuracy,
        percentile: 72,
        basis: 'model',
        crowd: body.path.map(() => null),
        receipt: RECEIPT,
      })
    }),
  )
})

const landingHeading = () =>
  screen.queryByRole('heading', { level: 1, name: /misprice this hand/ })

describe('who sees the landing page', () => {
  it('a first visit at the bare URL, instead of the welcome dialog', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { level: 1, name: /misprice/ }),
    ).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(beacons).toContainEqual(
        expect.objectContaining({ name: 'landing_view' }),
      ),
    )
  })

  it('not a returning player, unless they open #start', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true }))
    const { unmount } = render(<App />)
    expect(
      await screen.findByRole('region', { name: 'Poker table' }),
    ).toBeVisible()
    expect(landingHeading()).not.toBeInTheDocument()
    unmount()
    window.history.replaceState(null, '', '/#start')
    render(<App />)
    expect(
      await screen.findByRole('heading', { level: 1, name: /misprice/ }),
    ).toBeVisible()
  })

  it('not someone who landed before, is signed in, or is back from sign-in', async () => {
    for (const setup of [
      () => localStorage.setItem('qp.landed', '1'),
      () => localStorage.setItem('sb-abc-auth-token', '{}'),
      () => window.history.replaceState(null, '', '/?code=xyz'),
    ]) {
      localStorage.clear()
      window.history.replaceState(null, '', '/')
      setup()
      const { unmount } = render(<App />)
      expect(
        await screen.findByRole('region', { name: 'Poker table' }),
      ).toBeVisible()
      expect(landingHeading()).not.toBeInTheDocument()
      unmount()
    }
  })
})

/** Checks or calls at every decision until the score card shows. */
async function playByCalling(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 20; i++) {
    if (screen.queryByRole('region', { name: /Accuracy/ })) return
    const group = screen.getByRole('group', {
      name: /Your decision|Waiting for Atlas/,
    })
    const call = within(group)
      .queryAllByRole('button')
      .find(
        (b) =>
          /Call|Check/.test(b.textContent ?? '') && !b.hasAttribute('disabled'),
      )
    if (call) await user.click(call)
    await act(() => new Promise((r) => setTimeout(r, 900)))
  }
}

describe('the challenge', () => {
  it('grades a whole hand, ranks it on the server and hands off to sign-up', async () => {
    localStorage.setItem('qp.vid', visitorFor('overpair'))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Challenge/)
    expect(screen.getByText('Overpair under pressure')).toBeVisible()
    await playByCalling(user)
    const card = await screen.findByRole(
      'region',
      { name: /Accuracy/ },
      { timeout: 10_000 },
    )
    const tree = treeFor('overpair')!
    expect(scoreBodies).toHaveLength(1)
    const expected = scorePath(tree, scoreBodies[0].path)!
    expect(card).toHaveTextContent(`${expected.accuracy}/100`)
    expect(await within(card).findByText('72')).toBeVisible()
    expect(card).toHaveTextContent('Against model players')
    expect(card).toHaveTextContent(/graded Best/)
    expect(within(card).getAllByRole('listitem').length).toBeGreaterThanOrEqual(
      expected.decisions.length,
    )
    expect(JSON.parse(localStorage.getItem(PENDING_CLAIM_KEY)!)).toMatchObject({
      receipt: RECEIPT,
      hand: 'overpair',
      accuracy: expected.accuracy,
    })
    expect(localStorage.getItem('qp.landed')).toBe('1')
    expect(beacons.map((b) => b.name)).toEqual(
      expect.arrayContaining([
        'challenge_start',
        'challenge_decision',
        'challenge_complete',
      ]),
    )
    await user.click(screen.getByRole('button', { name: /Save your score/ }))
    expect(window.location.hash).toBe('#welcome/onboard')
  }, 30_000)

  it('still shows exact grades when the server cannot rank the line', async () => {
    scoreFails = true
    localStorage.setItem('qp.vid', visitorFor('nut-draw'))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('The nut flush draw')
    await playByCalling(user)
    const card = await screen.findByRole(
      'region',
      { name: /Accuracy/ },
      { timeout: 10_000 },
    )
    expect(
      await within(card).findByText(/Percentile unavailable/),
    ).toBeVisible()
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Play another hand/ }))
    expect(
      await screen.findByRole('group', { name: /Your decision/ }),
    ).toBeVisible()
  }, 30_000)
})

describe("a friend's challenge link", () => {
  it("plays the friend's hand, compares the scores and shares a new link", async () => {
    window.history.replaceState(null, '', `/#c/${FRIEND}`)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ onboarded: true }))
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText(/A friend scored/)).toHaveTextContent(
      'A friend scored 101/100 on this hand. Beat it.',
    )
    expect(await screen.findByText('The nut flush draw')).toBeVisible()
    await playByCalling(user)
    const card = await screen.findByRole(
      'region',
      { name: /Accuracy/ },
      { timeout: 10_000 },
    )
    expect(
      await within(card).findByText(/Your friend wins this one/),
    ).toBeVisible()
    expect(beacons.map((b) => b.name)).toContain('challenge_link_open')
    await user.click(
      await within(card).findByRole('button', { name: /Challenge a friend/ }),
    )
    // user-event provides the clipboard.
    expect(await navigator.clipboard.readText()).toContain(
      `${window.location.origin}/c/${RECEIPT}`,
    )
    expect(
      within(card).getByRole('button', { name: /Link copied/ }),
    ).toBeVisible()
  }, 30_000)

  it('says when a link has expired and deals a fresh hand', async () => {
    window.history.replaceState(null, '', `/#c/${'ef'.repeat(16)}`)
    render(<App />)
    expect(await screen.findByText(/link has expired/)).toBeVisible()
    expect(
      await screen.findByRole('group', { name: /Your decision/ }),
    ).toBeVisible()
  })
})
