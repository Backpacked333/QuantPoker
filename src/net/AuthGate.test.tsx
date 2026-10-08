import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadProviders } from './auth'
import { AuthGate } from './AuthGate'

type Row = { user_id: string; username: string }

/** Just enough of supabase-js for the gate: auth and the players table. */
function fakeClient({
  signedIn = false,
  row = { user_id: 'u1', username: 'player_0123456789ab' } as Row | null,
  updateError = null as { code: string } | null,
} = {}) {
  let listener: ((event: string, session: unknown) => void) | null = null
  const session = { user: { id: 'u1' }, access_token: 'jwt-for-u1' }
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: signedIn ? session : null },
      })),
      onAuthStateChange: vi.fn((fn: typeof listener) => {
        listener = fn
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signOut: vi.fn(async () => listener?.('SIGNED_OUT', null)),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      update: vi.fn(() => ({ eq: async () => ({ error: updateError }) })),
    })),
  }
  return client as typeof client & SupabaseClient
}

function settings(external: Record<string, boolean>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ external }))),
  )
}

const renderGate = (client: SupabaseClient | null) =>
  render(
    <AuthGate client={client} url="https://x.supabase.co" apiKey="k">
      {({ player, getToken, signOut }) => (
        <div>
          <p>Lobby for {player.username}</p>
          <button
            onClick={() =>
              void getToken().then((t) => (document.title = t ?? 'none'))
            }
          >
            Token
          </button>
          <button onClick={signOut}>Leave</button>
        </div>
      )}
    </AuthGate>,
  )

describe('loadProviders', () => {
  it('reads enabled providers and falls back to email on failure', async () => {
    const ok = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            external: { google: true, github: false, email: true },
          }),
        ),
    )
    expect(await loadProviders('https://x', 'k', ok)).toEqual({
      google: true,
      github: false,
      email: true,
    })
    expect(ok).toHaveBeenCalledWith('https://x/auth/v1/settings', {
      headers: { apikey: 'k' },
    })
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await loadProviders('https://x', 'k', down)).toEqual({
      google: false,
      github: false,
      email: true,
    })
  })
})

describe('AuthGate', () => {
  it('explains when online play is not configured', () => {
    renderGate(null)
    expect(screen.getByText(/not set up on this site/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Practice vs Atlas' }),
    ).toHaveAttribute('href', '#table')
  })

  it('shows only enabled sign-in methods and sends a magic link', async () => {
    settings({ google: false, github: true, email: true })
    const client = fakeClient()
    renderGate(client)
    expect(
      await screen.findByRole('button', { name: 'Continue with GitHub' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(
      screen.getByRole('button', { name: 'Email me a link' }),
    )
    expect(await screen.findByText(/Check/)).toHaveTextContent('a@b.co')
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.co',
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    expect(sessionStorage.getItem('qp.afterAuth')).toBe('#lobby')
  })

  it('starts OAuth with a redirect back to the page', async () => {
    settings({ google: true, github: false, email: false })
    const client = fakeClient()
    renderGate(client)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    )
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  it('asks a new player for a name, validates it, then opens the lobby', async () => {
    const client = fakeClient({ signedIn: true })
    renderGate(client)
    const input = await screen.findByLabelText('Username')
    await userEvent.type(input, 'ab')
    expect(screen.getByText(/At least 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(input, 'c_Q')
    expect(input).toHaveValue('abc_q')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Lobby for abc_q')).toBeInTheDocument()
  })

  it('reports a taken name', async () => {
    renderGate(fakeClient({ signedIn: true, updateError: { code: '23505' } }))
    await userEvent.type(await screen.findByLabelText('Username'), 'taken')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('That name is taken.')).toBeInTheDocument()
  })

  it('goes straight to the lobby for a named player and signs out', async () => {
    settings({ email: true })
    const client = fakeClient({
      signedIn: true,
      row: { user_id: 'u1', username: 'alice' },
    })
    renderGate(client)
    expect(await screen.findByText('Lobby for alice')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Token' }))
    await waitFor(() => expect(document.title).toBe('jwt-for-u1'))
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toBeInTheDocument(),
    )
  })

  it('shows an error when the profile row cannot be loaded', async () => {
    renderGate(fakeClient({ signedIn: true, row: null }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not load your player profile',
    )
  })
})
