/** Plain-language definitions for the lab's jargon. */
export const GLOSSARY = {
  equity:
    'Your share of the pot if the hand were played out many times from here: how often you win, plus half your ties.',
  breakEven:
    'The equity at which calling exactly pays for itself: the price divided by the pot you would win. Above it, calling makes money on average.',
  ev: 'Expected value: what an action wins or loses on average, in chips, over many repeats of this exact spot.',
  range:
    'Every hand Atlas could hold, weighted by how likely its actions so far make each one. You never see its cards; you reason about the range.',
} as const

export type GlossaryKey = keyof typeof GLOSSARY
