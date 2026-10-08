// Shared motion language. Springs carry physical objects (cards, chips);
// tweens carry information (numbers, panels). Everything honours reduced
// motion through <MotionConfig reducedMotion="user"> at the root.
import type { Transition } from 'motion/react'

export const spring = {
  /** Presses, toggles, small UI feedback. */
  snappy: { type: 'spring', stiffness: 560, damping: 34 },
  /** Panels, layout shifts, markers. */
  smooth: { type: 'spring', stiffness: 260, damping: 30 },
  /** Cards and chips: weight, a little overshoot. */
  heavy: { type: 'spring', stiffness: 190, damping: 22, mass: 1.1 },
} satisfies Record<string, Transition>

export const ease = [0.22, 1, 0.36, 1] as const
export const duration = { fast: 0.15, base: 0.28, slow: 0.5 }
export const stagger = { deal: 0.11, list: 0.04 }
