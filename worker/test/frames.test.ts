// The allowlist in frames.ts only protects a frame type that some test
// sends and checks. Each flow test asserts the exact types it ran through
// checkFrames (its FLOW_TYPES entry); here the entries together must name
// every type the server can send.
import { describe, expect, it } from 'vitest'
import { FLOW_TYPES, FRAME_KEYS } from './frames'

describe('the frame allowlist', () => {
  it('every FRAME_KEYS type passes checkFrame in some test', () => {
    const checked = new Set<string>(Object.values(FLOW_TYPES).flat())
    expect(
      [...checked].sort(),
      'frame types some flow runs through checkFrames',
    ).toEqual(Object.keys(FRAME_KEYS).sort())
  })
})
