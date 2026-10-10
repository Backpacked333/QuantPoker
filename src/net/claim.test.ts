import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PENDING_CLAIM_KEY, savePendingClaim } from '../lib/landing'
import { claimPendingScore } from './claim'

const claim = {
  receipt: 'cd'.repeat(16),
  hand: 'overpair',
  ver: 1,
  accuracy: 81,
  percentile: 64,
  at: 1,
}
const token = async () => 'jwt'

beforeEach(() => savePendingClaim(claim))

describe('claimPendingScore', () => {
  it('does nothing without a pending score', async () => {
    localStorage.clear()
    const fetcher = vi.fn()
    expect(await claimPendingScore(token, fetcher)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends the receipt with the token and clears it once saved', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await claimPendingScore(token, fetcher)).toEqual({
      claim,
      saved: true,
    })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/challenge/claim',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt' }),
        body: JSON.stringify({ receipt: claim.receipt }),
      }),
    )
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull()
  })

  it.each([404, 409, 400])(
    'drops a receipt the server answers %i to',
    async (status) => {
      const fetcher = vi.fn(async () => new Response('{}', { status }))
      expect(await claimPendingScore(token, fetcher)).toEqual({
        claim,
        saved: false,
      })
      expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull()
    },
  )

  it.each([
    ['an outage', async () => new Response('', { status: 503 })],
    ['a rate limit', async () => new Response('', { status: 429 })],
    ['no network', async () => Promise.reject(new TypeError('offline'))],
  ])('keeps it for next time after %s', async (_, answer) => {
    const fetcher = vi.fn(answer)
    expect(await claimPendingScore(token, fetcher)).toEqual({
      claim,
      saved: false,
    })
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).not.toBeNull()
  })

  it('keeps it when there is no session yet', async () => {
    const fetcher = vi.fn()
    expect(await claimPendingScore(async () => null, fetcher)).toEqual({
      claim,
      saved: false,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
