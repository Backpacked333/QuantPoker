// Usernames and the signed-in player's row in public.players. The rules
// mirror the check constraints in supabase/migrations/…_players.sql.
import type { SupabaseClient } from '@supabase/supabase-js'

export const USERNAME = /^[a-z0-9_]{3,20}$/
export const RESERVED = [
  'atlas',
  'admin',
  'quantpoker',
  'support',
  'system',
  'moderator',
]
/** The name every account starts with until the player picks one. */
export const PLACEHOLDER = /^player_[0-9a-f]{12}$/

export type Player = { userId: string; username: string }

/** A reason the name cannot be used, or null when it is fine. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return 'At least 3 characters.'
  if (name.length > 20) return 'At most 20 characters.'
  if (!USERNAME.test(name))
    return 'Lowercase letters, digits and underscores only.'
  if (RESERVED.includes(name)) return 'That name is reserved.'
  if (PLACEHOLDER.test(name)) return 'Pick a name of your own.'
  return null
}

export async function loadPlayer(
  client: SupabaseClient,
  userId: string,
): Promise<Player | null> {
  const { data, error } = await client
    .from('players')
    .select('user_id, username')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? { userId: data.user_id, username: data.username } : null
}

export type RenameResult = { ok: true } | { ok: false; reason: string }

export async function renamePlayer(
  client: SupabaseClient,
  userId: string,
  username: string,
): Promise<RenameResult> {
  const problem = usernameProblem(username)
  if (problem) return { ok: false, reason: problem }
  const { error } = await client
    .from('players')
    .update({ username })
    .eq('user_id', userId)
  if (!error) return { ok: true }
  if (error.code === '23505')
    return { ok: false, reason: 'That name is taken.' }
  return { ok: false, reason: 'Could not save the name. Try again.' }
}
