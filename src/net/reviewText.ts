// Words for a hand's actions, shared by the live review (ReviewLive.tsx)
// and the public match review (MatchReview.tsx).
import type { HandRecordV1 } from '../shared/protocol'

export const STREETS = ['preflop', 'flop', 'turn', 'river'] as const
export const streetName = (s: string) =>
  s === 'preflop' ? 'Pre-flop' : s[0].toUpperCase() + s.slice(1)
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** "folds" for others, "fold" for you. */
export function describeAction(
  a: HandRecordV1['actions'][number],
  you: boolean,
) {
  const verb = (word: string) => (you ? word : `${word}s`)
  switch (a.action.type) {
    case 'fold':
      return verb('fold')
    case 'check':
      return verb('check')
    case 'call':
      return `${verb('call')} ${a.amount}`
    case 'raise':
      return a.toCall > 0 || a.street === 'preflop'
        ? `${verb('raise')} to ${a.amount}`
        : `${verb('bet')} ${a.amount}`
  }
}
