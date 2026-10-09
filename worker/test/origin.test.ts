// A web page may open a socket only to its own site. Browsers always send
// Origin on a WebSocket handshake, so a missing or foreign Origin is refused
// before any token work. A local server (wrangler dev) also accepts pages
// served from localhost, such as Vite on :5173; production never does.
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createTable, ORIGIN, token } from './helpers'

function upgrade(path: string, origin: string | null, base = ORIGIN) {
  return SELF.fetch(`${base}${path}`, {
    headers: {
      Upgrade: 'websocket',
      'Sec-WebSocket-Protocol': `qp.v1, bearer.${token('alice')}`,
      ...(origin === null ? {} : { Origin: origin }),
    },
  })
}

describe('socket origins', () => {
  it('accepts a page from the same site, for the lobby and a table', async () => {
    expect((await upgrade('/ws/lobby', ORIGIN)).status).toBe(101)
    const matchId = await createTable('alice')
    expect((await upgrade(`/ws/table/${matchId}`, ORIGIN)).status).toBe(101)
  })

  it.each([
    ['no Origin', null],
    ['another site', 'https://evil.example'],
    ['a look-alike host', 'https://quantpoker.test.evil.example'],
    ['the same host without TLS', 'http://quantpoker.test'],
    ['an opaque origin', 'null'],
    ['a local page against the real site', 'http://localhost:5173'],
  ])('refuses %s with 403', async (_, origin) => {
    const matchId = await createTable('alice')
    for (const path of ['/ws/lobby', `/ws/table/${matchId}`]) {
      const response = await upgrade(path, origin)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'origin' })
    }
  })

  it('lets a local server take local pages, and only local pages', async () => {
    for (const base of ['http://localhost:8787', 'http://127.0.0.1:8787']) {
      expect(
        (await upgrade('/ws/lobby', 'http://localhost:5173', base)).status,
      ).toBe(101)
      expect(
        (await upgrade('/ws/lobby', 'http://127.0.0.1:4174', base)).status,
      ).toBe(101)
      expect(
        (await upgrade('/ws/lobby', 'https://evil.example', base)).status,
      ).toBe(403)
      expect(
        (await upgrade('/ws/lobby', 'http://localhost.evil.example', base))
          .status,
      ).toBe(403)
    }
  })
})
