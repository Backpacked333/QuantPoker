export const GENERATOR_VERSION = 'qp-rng-v1'
export function uint32(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Seed must be a uint32.')
  return seed >>> 0
}
// Mulberry32: all addition and multiplication use uint32 overflow semantics.
export function createRandom(seed: number): () => number {
  let state = uint32(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function hashText(text: string): number {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text))
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  return hash
}
export function deriveSeed(
  seed: number,
  purpose: string,
  candidateId = '',
): number {
  uint32(seed)
  if (!purpose || purpose.length > 100 || candidateId.length > 100)
    throw new RangeError('Use bounded, nonempty stream names.')
  return hashText(
    JSON.stringify([GENERATOR_VERSION, seed, purpose, candidateId]),
  )
}
export function namedStream(
  seed: number,
  purpose: 'development' | 'holdout' | 'population' | 'stress' | 'example',
  candidateId = '',
) {
  return createRandom(deriveSeed(seed, purpose, candidateId))
}
export function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}
export function parameterHash(value: unknown): string {
  function canonical(v: unknown): string {
    if (v === null || typeof v !== 'object') {
      const encoded = JSON.stringify(v)
      if (
        encoded === undefined ||
        (typeof v === 'number' && !Number.isFinite(v))
      )
        throw new RangeError('Invalid hash input.')
      return encoded
    }
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
    return `{${Object.entries(v)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  }
  return hashText(canonical(value)).toString(16).padStart(8, '0')
}
