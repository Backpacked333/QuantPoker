// The landing funnel's events (L-10), shared by the browser's track() and the
// Worker, which refuses any other name. Counted once per visitor per UTC day;
// no event carries an email, a name, an address or a card.
export const FUNNEL_EVENTS = [
  'landing_view',
  'challenge_start',
  'challenge_decision',
  'challenge_complete',
  'signup_start',
  'signup_complete',
  'username_set',
  'school_verify_start',
  'school_verify_complete',
  'first_move_rated',
  'first_move_practice',
  'first_move_learn',
  'share_click',
  'challenge_link_open',
] as const

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number]

/** The main path, in order: each step's rate is against the one before. */
export const FUNNEL_STEPS: FunnelEvent[] = [
  'landing_view',
  'challenge_start',
  'challenge_complete',
  'signup_start',
  'signup_complete',
  'username_set',
]

export const isFunnelEvent = (name: unknown): name is FunnelEvent =>
  typeof name === 'string' &&
  (FUNNEL_EVENTS as readonly string[]).includes(name)

/** A visitor id: a random UUID the browser keeps (never derived from anything). */
export const VISITOR_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
