import { useState } from 'react'
import { Cloud, LogOut } from 'lucide-react'
import { useCloud } from '../lib/cloud-context'
import { readProgress } from '../lib/storage'

export function AccountPanel({ onImport }: { onImport: () => void }) {
  const cloud = useCloud()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  if (!cloud?.store.client)
    return (
      <p>
        Cloud saves are not configured. You can keep playing and learning on
        this device.
      </p>
    )
  const { store, state } = cloud
  const guest = readProgress()
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not connect. Please retry.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="account-panel">
      <div className="account-intro">
        <Cloud size={28} />
        <h3>Keep the insight. Take it anywhere.</h3>
      </div>
      {state.user ? (
        <>
          <p>
            Signed in as <strong>{state.user.email}</strong>.
          </p>
          <p role="status">
            {state.status === 'offline'
              ? 'Cloud sync failed. Changes stay on this device until you retry.'
              : state.status === 'saving'
                ? 'Saving your latest changes…'
                : 'Your learning is saved to your private account.'}
          </p>
          {!state.localAvailable && (
            <p role="alert">
              Browser storage is unavailable. Keep this page open until cloud
              saving finishes.
            </p>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await store.retry()
                if (store.snapshot().status === 'offline')
                  throw new Error(
                    'Still unable to sync. Your local changes are safe.',
                  )
                setNotice('Cloud save is up to date.')
              })
            }
          >
            Retry cloud save
          </button>
          {(guest.hands.length > 0 || guest.lessons.length > 0) && (
            <div className="account-import">
              <h4>Bring your guest progress with you</h4>
              <p>
                {guest.hands.length} hand results and {guest.lessons.length}{' '}
                lessons are saved in this browser. Import only if they belong to
                you.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  onImport()
                  setNotice(
                    'Guest progress added. Cloud saving will run automatically.',
                  )
                }}
              >
                Import this device’s guest progress
              </button>
            </div>
          )}
          <button
            disabled={busy}
            onClick={() => void run(() => store.signOut())}
          >
            <LogOut size={14} /> Sign out on this device
          </button>
        </>
      ) : (
        <>
          <p>
            Save hand results, completed lessons, practice answers, table
            preferences, and coach conversations across devices. Guest play
            needs no account.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                const { error: authError } =
                  await store.client!.auth.signInWithOtp({
                    email: email.trim(),
                    options: { emailRedirectTo: window.location.origin },
                  })
                if (authError)
                  throw new Error(
                    authError.code === 'email_address_not_authorized'
                      ? 'Public signup email is not enabled yet. The owner needs to configure an SMTP sender in Supabase. Guest play remains available.'
                      : authError.message,
                  )
                setNotice(
                  'Check your inbox for a secure sign-in link. You can open it on this device or another one.',
                )
              })
            }}
          >
            <label htmlFor="account-email">Email address</label>
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              placeholder="you@example.com"
            />
            <button type="submit" disabled={busy || state.status === 'loading'}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
          <small>
            Signing in starts a fresh table session. No passwords and no real
            money.
          </small>
        </>
      )}
      <p className="account-privacy">
        Private to your account. Guest results are never imported automatically.
        Current hands and hidden cards are not uploaded. Coach messages are sent
        to the AI provider when you ask a question.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
