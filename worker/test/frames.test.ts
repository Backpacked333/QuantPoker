/// <reference types="vite/client" />
// The allowlist in frames.ts only protects a frame type that some test
// sends and checks. Each flow test asserts the exact types it ran through
// checkFrames (its FLOW_TYPES entry); here the entries together must name
// every type the server can send, and each entry must be asserted by some
// flow test, or the list would say a type is covered that no test checks.
import { describe, expect, it } from 'vitest'
import { FLOW_TYPES, FRAME_KEYS } from './frames'

// The flow tests' source. Each test file runs in its own module instance,
// so a flow cannot report at run time what it checked; its source shows
// which entry it asserts.
const sources = import.meta.glob<string>('./*.test.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('the frame allowlist', () => {
  it('every FRAME_KEYS type passes checkFrame in some test', () => {
    const checked = new Set<string>(Object.values(FLOW_TYPES).flat())
    expect(
      [...checked].sort(),
      'frame types some flow runs through checkFrames',
    ).toEqual(Object.keys(FRAME_KEYS).sort())
  })

  it('every FLOW_TYPES entry is asserted by some flow test', () => {
    // Comments stripped: a commented-out assertion checks nothing.
    const code = Object.entries(sources)
      .filter(([path]) => path !== './frames.test.ts')
      .map(([, src]) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))
      .join('\n')
    expect(
      Object.keys(FLOW_TYPES).filter(
        (k) => !code.includes(`new Set(FLOW_TYPES.${k})`),
      ),
      'FLOW_TYPES entries no flow test asserts',
    ).toEqual([])
  })
})
