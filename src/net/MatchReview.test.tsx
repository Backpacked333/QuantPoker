import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HandRecordV1 } from '../shared/protocol'
import { fakeSupabase } from './fakeSupabase'
import { MatchReview } from './MatchReview'
import { finishedHand, MATCH } from './testing'

async function tables(status = 'finished') {
  const showdown = (await finishedHand()).record
  const folded: HandRecordV1 = {
    ...(await finishedHand({ fold: true })).record,
    handNo: 2,
  }
  return {
    matches: [
      {
        id: MATCH,
        kind: 'hu-rated',
        status,
        finished_at: '2026-10-10T10:00:00Z',
      },
    ],
    match_players: [
      { match_id: MATCH, seat: 0, user_id: 'u-alice', outcome: 'win' },
      { match_id: MATCH, seat: 1, user_id: 'u-bob', outcome: 'loss' },
    ],
    players: [
      { user_id: 'u-alice', username: 'alice' },
      { user_id: 'u-bob', username: 'bob' },
    ],
    hands: [
      { match_id: MATCH, hand_no: 1, record: showdown, verified: true },
      { match_id: MATCH, hand_no: 2, record: folded, verified: true },
    ],
  }
}

const cards = () =>
  [...document.querySelectorAll('.mini-card')].map((c) => c.textContent)

describe('the public match review', () => {
  it('shows each hand with only the cards shown at showdown', async () => {
    const { client } = fakeSupabase({ tables: await tables() })
    render(<MatchReview client={client} matchId={MATCH} />)
    const hand1 = await screen.findByRole('region', { name: 'Hand 1' })
    expect(screen.getByText('alice won, bob lost.')).toBeInTheDocument()
    // Hand 1 went to showdown: both hands were shown, and the board.
    expect(within(hand1).getByText('alice showed')).toBeInTheDocument()
    expect(within(hand1).getByText('bob showed')).toBeInTheDocument()
    expect(cards()).toHaveLength(9)
    expect(within(hand1).getByText('Verified')).toBeInTheDocument()
    // Decision times stay out of the public review.
    expect(hand1).not.toHaveTextContent(/1\.5 s/)

    // Hand 2 ended with a fold before the flop: no card of anyone's.
    fireEvent.click(screen.getByRole('button', { name: 'Next hand' }))
    const hand2 = await screen.findByRole('region', { name: 'Hand 2' })
    expect(within(hand2).queryByText(/showed/)).toBeNull()
    expect(cards()).toEqual([])
    expect(hand2).toHaveTextContent('alice folds')
    expect(screen.getByText('Hand 2 of 2')).toBeInTheDocument()
  })

  it('a match still being played is not shown, and its hands are not read', async () => {
    const { client, reads } = fakeSupabase({
      tables: await tables('playing'),
    })
    render(<MatchReview client={client} matchId={MATCH} />)
    expect(
      await screen.findByText(/This match is still being played/),
    ).toBeInTheDocument()
    expect(reads.map((r) => r.table)).toEqual(['matches'])
    expect(cards()).toEqual([])
  })

  it('an unknown match says so', async () => {
    const { client } = fakeSupabase({ tables: await tables() })
    render(
      <MatchReview
        client={client}
        matchId="99999999-9999-4999-8999-999999999999"
      />,
    )
    expect(
      await screen.findByText('There is no such match.'),
    ).toBeInTheDocument()
  })
})
