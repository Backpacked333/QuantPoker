import { describe, expect, it, vi } from 'vitest'
import { createMatch, devIdentity, inviteLink } from './api'

const token = async () => 'jwt'

describe('createMatch', () => {
  it('posts with the bearer token and returns the new table', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ matchId: 'm-1' }, { status: 201 }),
    )
    expect(await createMatch(token, fetcher)).toEqual({
      ok: true,
      matchId: 'm-1',
    })
    expect(fetcher).toHaveBeenCalledWith('/api/matches', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt' },
    })
  })

  it('explains each failure', async () => {
    const status = (n: number) =>
      vi.fn(async () => new Response('', { status: n }))
    expect(await createMatch(token, status(401))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/session expired/),
    })
    expect(await createMatch(token, status(500))).toMatchObject({ ok: false })
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await createMatch(token, offline)).toMatchObject({
      reason: expect.stringMatching(/No connection/),
    })
    expect(await createMatch(async () => null, status(201))).toMatchObject({
      ok: false,
    })
  })
})

describe('devIdentity', () => {
  it('plays as the user named in a dev token, and only a well-formed one', async () => {
    sessionStorage.setItem('qp.devToken', 'dev.alice.e2e')
    const dev = devIdentity()
    expect(dev?.player).toEqual({ userId: 'alice', username: 'alice' })
    expect(await dev?.getToken()).toBe('dev.alice.e2e')
    for (const bad of ['dev:alice:e2e', 'alice', 'dev..e2e', 'eyJ.x.y'])
      expect(
        devIdentity({ getItem: () => bad } as unknown as Storage),
      ).toBeNull()
    sessionStorage.removeItem('qp.devToken')
    expect(devIdentity()).toBeNull()
  })
})

describe('inviteLink', () => {
  it('points at the table route on this page', () => {
    expect(
      inviteLink('m-1', {
        origin: 'https://qp.dev',
        pathname: '/',
      } as Location),
    ).toBe('https://qp.dev/#play/m-1')
  })
})
