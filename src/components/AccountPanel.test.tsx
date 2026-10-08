// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { AccountPanel } from './AccountPanel'
import { CloudContext } from '../lib/cloud-context'
import { CloudStore } from '../lib/cloud-store'
import { STORAGE_KEY } from '../lib/storage'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
function mount(user: User | null = null, code?: string) {
  const signInWithOtp = vi.fn(async () => ({
    error: code ? { code, message: 'Delivery blocked' } : null,
  }))
  const store = new CloudStore({
    auth: { signInWithOtp },
  } as unknown as SupabaseClient)
  const onImport = vi.fn()
  render(
    <CloudContext.Provider
      value={{ store, state: { ...store.snapshot(), user } }}
    >
      <AccountPanel onImport={onImport} />
    </CloudContext.Provider>,
  )
  return { signInWithOtp, onImport, user: userEvent.setup() }
}
describe('account panel', () => {
  it('requests a secure sign-in link with a same-origin redirect', async () => {
    const { user, signInWithOtp } = mount()
    await user.type(
      screen.getByLabelText('Email address'),
      'learner@example.com',
    )
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    )
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      options: { emailRedirectTo: window.location.origin },
    })
    expect(screen.getByRole('status').textContent).toContain('Check your inbox')
  })
  it('explains the SMTP limitation instead of pretending email was sent', async () => {
    const { user } = mount(null, 'email_address_not_authorized')
    await user.type(
      screen.getByLabelText('Email address'),
      'learner@example.com',
    )
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in link' }),
    )
    expect(screen.getByRole('alert').textContent).toContain('SMTP sender')
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('never imports guest history until the signed-in person explicitly chooses to', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hands: [], lessons: ['equity'] }),
    )
    const { user, onImport } = mount({
      id: 'fixture',
      email: 'learner@example.com',
    } as User)
    expect(onImport).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', {
        name: 'Import this device’s guest progress',
      }),
    )
    expect(onImport).toHaveBeenCalledOnce()
  })
})
