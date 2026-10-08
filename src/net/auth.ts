import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { rememberAuthReturn } from '../lib/authReturn'

export type OAuthProvider = 'google' | 'github'
export type Providers = Record<OAuthProvider | 'email', boolean>

const FALLBACK: Providers = { google: false, github: false, email: true }

/**
 * Which sign-in methods the project has turned on, from Supabase Auth's public
 * settings endpoint, so the page never shows a button that cannot work.
 */
export async function loadProviders(
  url: string,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<Providers> {
  try {
    const response = await fetcher(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
    })
    if (!response.ok) return FALLBACK
    const { external = {} } = (await response.json()) as {
      external?: Partial<Providers>
    }
    return {
      google: external.google === true,
      github: external.github === true,
      email: external.email !== false,
    }
  } catch {
    return FALLBACK
  }
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session }

export function useAuth(client: SupabaseClient): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  useEffect(() => {
    let live = true
    const apply = (session: Session | null) =>
      live &&
      setState(
        session ? { status: 'signed-in', session } : { status: 'signed-out' },
      )
    client.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null))
    const { data } = client.auth.onAuthStateChange((_event, session) =>
      apply(session),
    )
    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [client])
  return state
}

/** Providers come back to the bare page; authReturn restores the route. */
const returnUrl = () => `${window.location.origin}${window.location.pathname}`

export async function signInWithProvider(
  client: SupabaseClient,
  provider: OAuthProvider,
) {
  rememberAuthReturn('#lobby')
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: returnUrl() },
  })
  return error ? error.message : null
}

export async function sendMagicLink(client: SupabaseClient, email: string) {
  rememberAuthReturn('#lobby')
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: returnUrl() },
  })
  return error ? error.message : null
}
