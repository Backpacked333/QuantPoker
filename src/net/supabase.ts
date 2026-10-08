import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Online = { client: SupabaseClient; url: string; key: string }

/** Settings from the build (local .env) or, when absent, the Worker. */
async function settings(fetcher: typeof fetch) {
  const url = import.meta.env.VITE_SUPABASE_URL ?? ''
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (url && key) return { url, key }
  try {
    // The Worker serves this; anywhere else (Vite preview, CI) it is the
    // HTML fallback or a 404, and online play stays off.
    const response = await fetcher('/api/config')
    if (!response.headers.get('content-type')?.includes('application/json'))
      return null
    const config = (await response.json()) as {
      supabaseUrl?: unknown
      supabaseKey?: unknown
    }
    return typeof config.supabaseUrl === 'string' &&
      typeof config.supabaseKey === 'string' &&
      config.supabaseUrl &&
      config.supabaseKey
      ? { url: config.supabaseUrl, key: config.supabaseKey }
      : null
  } catch {
    return null
  }
}

let pending: Promise<Online | null> | null = null

/**
 * The browser client, or null when this deployment has no account service.
 * Uses the PKCE flow: providers return ?code=… and the client exchanges it.
 */
export function loadOnline(fetcher: typeof fetch = fetch) {
  pending ??= settings(fetcher).then((found) =>
    found
      ? {
          ...found,
          client: createClient(found.url, found.key, {
            auth: {
              flowType: 'pkce',
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
            },
          }),
        }
      : null,
  )
  return pending
}
