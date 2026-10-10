import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PENDING_CLAIM_KEY, savePendingClaim } from '../lib/landing'
import { Onboarding } from './Onboarding'

const identity = {
  player: { userId: 'u1', username: 'ada' },
  getToken: async () => 'jwt',
  signOut: () => {},
}

/** Just enough of the client for players.select().eq().maybeSingle(). */
const clientWith = (row: Record<string, unknown> | null) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  }) as unknown as SupabaseClient

let beacons: string[] = []
beforeEach(() => {
  beacons = []
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (_: string, body: string) => {
      beacons.push(JSON.parse(body).name)
      return true
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  )
})

describe('Onboarding', () => {
  it('saves the challenge score, shows the school badge, then offers a first move', async () => {
    savePendingClaim({
      receipt: 'ef'.repeat(16),
      hand: 'overpair',
      ver: 1,
      accuracy: 88,
      percentile: 91,
      at: 1,
    })
    const user = userEvent.setup()
    render(
      <Onboarding
        identity={identity}
        client={clientWith({ school: 'MIT', school_domain: 'mit.edu' })}
      />,
    )
    expect(
      await screen.findByText(/score of 88 is saved to your account/),
    ).toBeVisible()
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull()
    expect(await screen.findByText('MIT')).toBeVisible()
    expect(screen.getByText('Step 2 of 3')).toBeVisible()
    expect(beacons).toContain('signup_complete')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Step 3 of 3')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Play a rated match/ }))
    expect(window.location.hash).toBe('#lobby')
    expect(beacons).toContain('first_move_rated')
  })

  it('verifies a school email by code when the account has no badge', async () => {
    const asked: { url: string; body: unknown; auth: string | null }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        asked.push({
          url,
          body,
          auth: new Headers(init?.headers).get('Authorization'),
        })
        if (url === '/api/school/start') return Response.json({ school: 'MIT' })
        return body.code === '123456'
          ? Response.json({ school: 'MIT' })
          : Response.json({ error: 'wrong' }, { status: 400 })
      }),
    )
    const user = userEvent.setup()
    render(
      <Onboarding
        identity={identity}
        client={clientWith({ school: null, school_domain: null })}
      />,
    )
    await user.type(await screen.findByLabelText('School email'), 'ada@mit.edu')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    const code = await screen.findByLabelText(
      /Code sent to ada@mit.edu \(MIT\)/,
    )
    await user.type(code, '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not right')
    await user.clear(code)
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText(/You're playing for/)).toHaveTextContent(
      'MIT',
    )
    expect(asked.map((a) => [a.url, a.body, a.auth])).toEqual([
      ['/api/school/start', { email: 'ada@mit.edu' }, 'Bearer jwt'],
      ['/api/school/confirm', { code: '000000' }, 'Bearer jwt'],
      ['/api/school/confirm', { code: '123456' }, 'Bearer jwt'],
    ])
    expect(beacons).toEqual(
      expect.arrayContaining(['school_verify_start', 'school_verify_complete']),
    )
  })

  it('explains when a school email cannot be sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'email_unavailable' }, { status: 503 }),
      ),
    )
    const user = userEvent.setup()
    render(
      <Onboarding
        identity={identity}
        client={clientWith({ school: null, school_domain: null })}
      />,
    )
    await user.type(await screen.findByLabelText('School email'), 'ada@mit.edu')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'cannot be sent right now',
    )
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeVisible()
  })
})
