// A player's accuracy (P1-10) and the luck-versus-skill series across their
// rated matches, read from Supabase: public.accuracy and public.rated_luck
// (supabase/migrations/…_accuracy.sql). Both cover matches that are over
// only, so nothing here is analysis of a hand in play.
import type { SupabaseClient } from '@supabase/supabase-js'

/** The label, exactly as the product states it. Never reword it. */
export const ACCURACY_LABEL = 'Accuracy vs. a model opponent, not a solver.'

export const GRADE_NAMES = [
  'best',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
] as const
export type GradeName = (typeof GRADE_NAMES)[number]

/** Rated heads-up blinds (worker/src/rated.ts). */
const RATED_BB = 20

export type Accuracy = {
  /** The plain mean over the latest graded decisions, 0 to 100. */
  accuracy: number
  /** How many decisions it covers (at most 500). */
  graded: number
  counts: Record<GradeName, number>
}

type AccuracyRow = { accuracy: number | null; graded: number } & Record<
  GradeName,
  number
>

/** Null until the player has a graded decision from a match that is over. */
export async function loadAccuracy(
  client: SupabaseClient,
  userId: string,
): Promise<Accuracy | null> {
  const { data, error } = await client
    .from('accuracy')
    .select('accuracy, graded, best, good, inaccuracy, mistake, blunder')
    .eq('user_id', userId)
    .eq('format', 'hu-duplicate')
    .maybeSingle<AccuracyRow>()
  if (error) throw error
  if (!data || !data.graded || data.accuracy === null) return null
  return {
    accuracy: data.accuracy,
    graded: data.graded,
    counts: Object.fromEntries(
      GRADE_NAMES.map((g) => [g, data[g]]),
    ) as Accuracy['counts'],
  }
}

/** One rated hand: the player's net, and the net with all-in luck taken out. */
export type LuckRow = { net: number; adjusted: number }

export async function loadLuck(
  client: SupabaseClient,
  userId: string,
): Promise<LuckRow[]> {
  const { data, error } = await client.rpc('rated_luck', { p_user: userId })
  if (error) throw error
  return ((data ?? []) as LuckRow[]).map((r) => ({
    net: Number(r.net),
    adjusted: Number(r.adjusted),
  }))
}

/**
 * Cumulative result and result without all-in luck, in big blinds, from 0
 * before the first hand. The gap between them is all-in luck.
 */
export function luckSeries(rows: LuckRow[]) {
  const result = [0]
  const skill = [0]
  for (const r of rows) {
    result.push(result[result.length - 1] + r.net / RATED_BB)
    skill.push(skill[skill.length - 1] + r.adjusted / RATED_BB)
  }
  return { result, skill }
}
