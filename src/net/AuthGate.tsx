import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Mail, UserRound } from 'lucide-react'
import {
  loadProviders,
  sendMagicLink,
  signInWithProvider,
  useAuth,
} from './auth'
import type { OAuthProvider, Providers } from './auth'
import {
  loadPlayer,
  PLACEHOLDER,
  renamePlayer,
  usernameProblem,
} from './players'
import type { Player } from './players'
import type { Identity } from './api'
import { readPendingClaim } from '../lib/landing'
import { track } from '../lib/track'

type Props = {
  client: SupabaseClient | null
  url: string
  apiKey: string
  /** Signing up from the landing page: the score is the reason to. */
  onboarding?: boolean
  children: (identity: Identity) => ReactNode
}

export function AuthGate({
  client,
  url,
  apiKey,
  onboarding = false,
  children,
}: Props) {
  if (!client) return <NotConfigured />
  return (
    <SignedIn client={client} url={url} apiKey={apiKey} onboarding={onboarding}>
      {children}
    </SignedIn>
  )
}

function NotConfigured() {
  return (
    <div className="empty live-empty">
      <UserRound size={26} />
      <h3>Online play is not set up on this site yet.</h3>
      <p>
        This build has no account service configured. Practice against Atlas
        works as always.
      </p>
      <a className="btn btn-primary" href="#table">
        Practice vs Atlas
      </a>
    </div>
  )
}

function SignedIn({
  client,
  url,
  apiKey,
  onboarding,
  children,
}: Props & { client: SupabaseClient }) {
  const auth = useAuth(client)
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null
  const [player, setPlayer] = useState<Player | null | 'error'>(null)

  useEffect(() => {
    if (!userId) return
    let live = true
    loadPlayer(client, userId)
      .then((p) => live && setPlayer(p ?? 'error'))
      .catch(() => live && setPlayer('error'))
    return () => {
      live = false
    }
  }, [client, userId])

  // Stable, so a live table does not reconnect on every render.
  const getToken = useCallback(
    async () =>
      (await client.auth.getSession()).data.session?.access_token ?? null,
    [client],
  )
  const signOut = () => {
    setPlayer(null)
    void client.auth.signOut()
  }

  if (auth.status === 'loading' || (userId && player === null))
    return (
      <p className="live-status" role="status">
        Checking your account…
      </p>
    )
  if (auth.status === 'signed-out')
    return (
      <SignIn
        client={client}
        url={url}
        apiKey={apiKey}
        onboarding={!!onboarding}
      />
    )
  if (player === 'error' || player === null)
    return (
      <div className="empty live-empty" role="alert">
        <h3>We could not load your player profile.</h3>
        <p>Check your connection and reload the page.</p>
        <button className="btn btn-outline" onClick={signOut}>
          Sign out
        </button>
      </div>
    )
  if (PLACEHOLDER.test(player.username))
    return (
      <ChooseName
        client={client}
        player={player}
        onSaved={(saved) => {
          track('username_set')
          setPlayer(saved)
        }}
        onSignOut={signOut}
        onboarding={!!onboarding}
      />
    )
  return <>{children({ player, getToken, signOut })}</>
}

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Continue with Google',
  github: 'Continue with GitHub',
}

function SignIn({
  client,
  url,
  apiKey,
  onboarding,
}: {
  client: SupabaseClient
  url: string
  apiKey: string
  onboarding: boolean
}) {
  const [pending] = useState(() => (onboarding ? readPendingClaim() : null))
  const [providers, setProviders] = useState<Providers | null>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    loadProviders(url, apiKey).then((p) => live && setProviders(p))
    return () => {
      live = false
    }
  }, [url, apiKey])

  const oauth = async (provider: OAuthProvider) => {
    setBusy(true)
    setError(await signInWithProvider(client, provider))
    setBusy(false)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy(true)
    const problem = await sendMagicLink(client, address)
    setBusy(false)
    if (problem) setError(problem)
    else {
      setError(null)
      setSent(address)
    }
  }

  return (
    <section className="panel live-signin" aria-labelledby="signin-title">
      <h2 id="signin-title">
        {pending
          ? `Save your ${pending.accuracy} and get rated`
          : onboarding
            ? 'Create your account'
            : 'Sign in to play real opponents'}
      </h2>
      <p className="live-muted">
        Play money only. No prizes, no deposits. 18+. Your username and finished
        hands are public; your email is not.
      </p>
      {providers === null ? (
        <p className="live-status" role="status">
          Loading sign-in options…
        </p>
      ) : (
        <>
          {(['google', 'github'] as const)
            .filter((p) => providers[p])
            .map((p) => (
              <button
                key={p}
                className="btn btn-outline btn-lg live-wide"
                disabled={busy}
                onClick={() => void oauth(p)}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          {providers.email &&
            (sent ? (
              <p className="live-sent" role="status">
                <Mail size={16} /> Check <b>{sent}</b> for a sign-in link. Open
                it in this browser.
              </p>
            ) : (
              <form className="live-email" onSubmit={(e) => void submit(e)}>
                <label htmlFor="signin-email">Email</label>
                <div className="live-row">
                  <input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button className="btn btn-primary" disabled={busy}>
                    Email me a link
                  </button>
                </div>
              </form>
            ))}
          {!providers.email && !providers.google && !providers.github && (
            <p role="alert">Sign-in is turned off for this site right now.</p>
          )}
        </>
      )}
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function ChooseName({
  client,
  player,
  onSaved,
  onSignOut,
  onboarding,
}: {
  client: SupabaseClient
  player: Player
  onSaved: (player: Player) => void
  onSignOut: () => void
  onboarding: boolean
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hint = name ? usernameProblem(name) : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await renamePlayer(client, player.userId, name)
    setBusy(false)
    if (result.ok) onSaved({ ...player, username: name })
    else setError(result.reason)
  }

  return (
    <section className="panel live-signin" aria-labelledby="name-title">
      {onboarding && <p className="onboard-step">Step 1 of 3</p>}
      <h2 id="name-title">Choose your table name</h2>
      <p className="live-muted">
        Opponents and the leaderboard will see it. 3–20 lowercase letters,
        digits or underscores.
      </p>
      <form className="live-email" onSubmit={(e) => void submit(e)}>
        <label htmlFor="username">Username</label>
        <div className="live-row">
          <input
            id="username"
            autoComplete="username"
            spellCheck={false}
            maxLength={20}
            value={name}
            aria-invalid={!!(hint || error)}
            aria-describedby="username-help"
            onChange={(e) => {
              setName(e.target.value.toLowerCase())
              setError(null)
            }}
          />
          <button
            className="btn btn-primary"
            disabled={busy || !!hint || !name}
          >
            Save
          </button>
        </div>
        <p
          id="username-help"
          className={hint || error ? 'live-error' : 'live-muted'}
        >
          {error ?? hint ?? 'You can change it later.'}
        </p>
      </form>
      <button className="btn btn-quiet" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  )
}
