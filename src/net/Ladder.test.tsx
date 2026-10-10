import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCURACY_LABEL } from './accuracy'
import { Ladder } from './Ladder'

type Row = {
  user_id: string
  username: string
  rating: number
  rd: number
  matches: number
  wins: number
  draws: number
  accuracy: number | null
  trend: number | null
}

const row = (n: number): Row => ({
  user_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  username: `pl${n}`,
  rating: 2000 - n * 3.25,
  rd: 60 + (n % 30),
  matches: 20 + n,
  wins: 10 + Math.floor(n / 2),
  draws: 1,
  accuracy: n % 7 === 0 ? null : 70 + (n % 10),
  trend: n % 3 === 0 ? null : n % 2 ? 12.4 : -5.6,
})

/**
 * Answers public.ladder / ladder_month (keyset, page size as asked, capped
 * at 100 like the SQL) and the viewer's ratings row, the way PostgREST does.
 */
function fakeClient({
  players = 0,
  signedIn = null as string | null,
  standing = null as Record<string, unknown> | null,
  fail = 0,
} = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  let failures = fail
  const all = Array.from({ length: players }, (_, i) => row(i + 1))
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (failures > 0) {
        failures--
        return { data: null, error: new Error('down') }
      }
      const after = args.p_after_rating as number | null
      const start =
        after === null
          ? 0
          : all.findIndex(
              (r) =>
                r.rating < after ||
                (r.rating === after && r.user_id > String(args.p_after_user)),
            )
      const size = Math.min(args.p_page as number, 100)
      return {
        data: start < 0 ? [] : all.slice(start, start + size),
        error: null,
      }
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: standing, error: null }),
      }
      return query
    },
    auth: {
      getSession: async () => ({
        data: {
          session: signedIn ? { user: { id: signedIn } } : null,
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const bodyRows = () =>
  within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('the ladder', () => {
  it('lists rank, player, rating ± RD, accuracy, matches, win rate and trend', async () => {
    const { client, calls } = fakeClient({ players: 3 })
    render(<Ladder client={client} view="all" />)
    await screen.findByRole('table')
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Rank',
      'Player',
      'Rating ± RD',
      'Accuracy',
      'Matches',
      'Win rate',
      '30 days',
    ])
    expect(bodyRows().map((r) => r.textContent)).toEqual([
      // pl1: 1996.75 ± 61, 71, 21 matches, 10 of 21 won, +12 over 30 days
      '1pl11997 ± 61712148%+12',
      '2pl21994 ± 62722250%−6',
      '3pl31990 ± 63732348%–',
    ])
    expect(screen.getByText(new RegExp(ACCURACY_LABEL))).toBeTruthy()
    expect(calls).toEqual([
      {
        fn: 'ladder',
        args: {
          p_format: 'hu-duplicate',
          p_after_rating: null,
          p_after_user: null,
          p_page: 51,
        },
      },
    ])
  })

  it('pages by keyset: ranks continue, previous returns, the last page has no next', async () => {
    const { client, calls } = fakeClient({ players: 120 })
    render(<Ladder client={client} view="all" />)
    await screen.findByRole('table')
    expect(bodyRows()).toHaveLength(50)
    const previous = screen.getByRole('button', { name: 'Previous page' })
    const next = screen.getByRole('button', { name: 'Next page' })
    expect(previous).toHaveProperty('disabled', true)

    fireEvent.click(next)
    await screen.findByText('pl51')
    expect(bodyRows()[0].textContent).toMatch(/^51pl51/)
    // The cursor is the last row shown, not the extra row asked for.
    expect(calls[1].args).toMatchObject({
      p_after_rating: row(50).rating,
      p_after_user: row(50).user_id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('pl101')
    expect(bodyRows()).toHaveLength(20)
    expect(bodyRows()[19].textContent).toMatch(/^120pl120/)
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty(
      'disabled',
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    await screen.findByText('pl51')
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    await screen.findByText('pl1')
    expect(bodyRows()[0].textContent).toMatch(/^1pl1/)
  })

  it('this month reads ladder_month and labels the change as this month’s', async () => {
    const { client, calls } = fakeClient({ players: 2 })
    render(<Ladder client={client} view="month" />)
    await screen.findByRole('table')
    expect(calls[0].fn).toBe('ladder_month')
    expect(
      screen.getByRole('columnheader', { name: 'This month' }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'This month' })
        .getAttribute('aria-current'),
    ).toBe('page')
  })

  it('a provisional viewer sees how many matches are left; a visitor sees no line', async () => {
    const viewer = fakeClient({
      players: 2,
      signedIn: 'me',
      standing: {
        rating: 1540,
        rd: 120,
        matches: 13,
        abandoned: 0,
        last_match_at: new Date().toISOString(),
      },
    })
    const view = render(<Ladder client={viewer.client} view="all" />)
    expect(
      await screen.findByText(
        'Your rating is 1540 ± 120, provisional: 7 rated matches to go.',
      ),
    ).toBeTruthy()
    view.unmount()

    const visitor = fakeClient({ players: 2 })
    render(<Ladder client={visitor.client} view="all" />)
    await screen.findByRole('table')
    expect(screen.queryByText(/Your rating/)).toBeNull()
  })

  it('says so when nobody is on it yet, and offers a retry when it cannot load', async () => {
    const empty = fakeClient()
    const view = render(<Ladder client={empty.client} view="all" />)
    expect(await screen.findByText('Nobody is on the ladder yet.')).toBeTruthy()
    view.unmount()

    const down = fakeClient({ players: 2, fail: 1 })
    render(<Ladder client={down.client} view="all" />)
    expect(
      await screen.findByText('The ladder could not be loaded.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('table')
    expect(down.calls).toHaveLength(2)
  })
})
