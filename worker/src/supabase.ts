// The archive: finished matches and hands go to Postgres through two
// service-role functions (supabase/migrations/*record_*.sql). Both are
// idempotent, so the outbox may retry any call.
import type { WorkerEnv } from './env'

export type ArchiveCall = {
  rpc: 'record_match' | 'record_hand'
  body: Record<string, unknown>
}

/** True when Postgres accepted the call. Never throws. */
export async function archive(env: WorkerEnv, call: ArchiveCall) {
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/${call.rpc}`,
      {
        method: 'POST',
        // A secret key goes in `apikey` alone; the gateway maps it to the
        // service role.
        headers: {
          apikey: env.SUPABASE_SECRET_KEY ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p: call.body }),
      },
    )
    if (!response.ok)
      console.error(
        `${call.rpc} failed`,
        response.status,
        (await response.text()).slice(0, 300),
      )
    return response.ok
  } catch (error) {
    console.error(`${call.rpc} failed`, error)
    return false
  }
}
