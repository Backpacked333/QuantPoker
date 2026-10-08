import { createClient } from '@supabase/supabase-js'

export type CloudAccess = {
  authorize: (token: string) => Promise<string | null>
  reserve: (userId: string) => Promise<boolean>
}

export function createCloudAccess(): CloudAccess | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    async authorize(token) {
      if (!token) return null
      const { data, error } = await client.auth.getUser(token)
      return !error && data.user?.email_confirmed_at && !data.user.is_anonymous
        ? data.user.id
        : null
    },
    async reserve(userId) {
      const { data, error } = await client.rpc('reserve_coach_request', {
        learner: userId,
      })
      if (error) throw new Error('Coach allowance unavailable')
      return data === true
    },
  }
}
