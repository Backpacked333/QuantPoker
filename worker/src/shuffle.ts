// Cryptographic randomness for dealing. Rejection sampling keeps every
// integer exactly equally likely (a plain modulo would favour small values).
const LIMIT = 2 ** 32

export function randomInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > LIMIT)
    throw new RangeError('randomInt needs 1 ≤ n ≤ 2^32')
  const ceiling = LIMIT - (LIMIT % n)
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    if (buffer[0] < ceiling) return buffer[0] % n
  }
}

export function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length))
}
