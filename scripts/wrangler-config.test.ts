// @vitest-environment node
// wrangler.jsonc carries numbers the Worker's code also relies on. They are
// checked here so the two cannot drift apart unnoticed.
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { UPGRADES_PER_IP_PER_MINUTE } from '../worker/src/limits'

type RateLimit = {
  name: string
  namespace_id: string
  simple: { limit: number; period: number }
}

const config = ts.parseConfigFileTextToJson(
  'wrangler.jsonc',
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
).config as { ratelimits: RateLimit[] }

describe('wrangler.jsonc', () => {
  it('limits each client address to UPGRADES_PER_IP_PER_MINUTE signed-in requests a minute', () => {
    const limiter = config.ratelimits.find((r) => r.name === 'IP_LIMITER')
    expect(limiter?.simple).toEqual({
      limit: UPGRADES_PER_IP_PER_MINUTE,
      period: 60,
    })
  })
})
