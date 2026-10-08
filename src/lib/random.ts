// The app's single source of randomness for dealing and Atlas. It is
// Math.random in normal use; tests and screenshot runs seed it (?seed=n)
// so every hand and decision replays identically.
import { lcg } from './sim'

let source: () => number = Math.random

export const random = () => source()

export function seedRandom(seed: number | null) {
  source = seed === null ? Math.random : lcg(seed)
}

/** FNV-1a: a stable 32-bit seed from a string key. */
export function hashString(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
