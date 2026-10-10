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

  it('explains how to get a badge when there is none', async () => {
    render(
      <Onboarding
        identity={identity}
        client={clientWith({ school: null, school_domain: null })}
      />,
    )
    expect(await screen.findByText(/you have no badge yet/)).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })
})
