import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCURACY_LABEL, luckSeries } from './accuracy'
import type { LuckRow } from './accuracy'
import { AccuracyPanel } from './AccuracyPanel'

type Row = Record<string, number | null> | null

/** Answers public.accuracy and rated_luck the way PostgREST does. */
function fakeClient(row: Row, luck: LuckRow[], fail = false) {
  const asked: unknown[] = []
  const client = {
    from: (table: string) => {
      asked.push(table)
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          asked.push([column, value])
          return query
        },
        maybeSingle: async () =>
          fail
            ? { data: null, error: new Error('down') }
            : { data: row, error: null },
      }
      return query
    },
    rpc: async (fn: string, args: unknown) => {
      asked.push([fn, args])
      return { data: luck, error: null }
    },
  } as unknown as SupabaseClient
  return { client, asked }
}

const GRADED = {
  accuracy: 78.6,
  graded: 412,
  best: 200,
  good: 90,
  inaccuracy: 60,
  mistake: 40,
  blunder: 22,
}

describe('the accuracy panel', () => {
  it('carries the exact label, the number and how many decisions it covers', async () => {
    const { client, asked } = fakeClient(GRADED, [])
    render(<AccuracyPanel client={client} userId="u1" />)
    expect(await screen.findByText('79')).toBeTruthy()
    expect(screen.getByText(ACCURACY_LABEL)).toBeTruthy()
    expect(ACCURACY_LABEL).toBe('Accuracy vs. a model opponent, not a solver.')
    expect(screen.getByText(/last 412 graded decisions/)).toBeTruthy()
    expect(asked).toEqual(
      expect.arrayContaining([
        'accuracy',
        ['user_id', 'u1'],
        ['format', 'hu-duplicate'],
        ['rated_luck', { p_user: 'u1' }],
      ]),
    )
  })

  it('shows the grade distribution over the same decisions', async () => {
    const { client } = fakeClient(GRADED, [])
    render(<AccuracyPanel client={client} userId="u1" />)
    const bars = await screen.findByLabelText('Grade distribution')
    expect(bars.textContent).toBe('Best200Good90Inaccuracy60Mistake40Blunder22')
  })

  it('reads "Not graded yet", under the same label, before any graded decision', async () => {
    for (const row of [null, { ...GRADED, accuracy: null, graded: 0 }]) {
      const { client } = fakeClient(row, [])
      const view = render(<AccuracyPanel client={client} userId="u1" />)
      expect(await screen.findByText('Not graded yet')).toBeTruthy()
      expect(screen.getByText(ACCURACY_LABEL)).toBeTruthy()
      expect(screen.queryByLabelText('Grade distribution')).toBeNull()
      view.unmount()
    }
  })

  it('says so when it cannot load, rather than showing a number', async () => {
    const { client } = fakeClient(GRADED, [], true)
    render(<AccuracyPanel client={client} userId="u1" />)
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy()
    expect(screen.queryByText('79')).toBeNull()
  })

  it('draws luck versus skill across rated hands, with the all-in luck in big blinds', async () => {
    const luck = [
      { net: 400, adjusted: 100 },
      { net: -200, adjusted: -200 },
    ]
    const { client } = fakeClient(GRADED, luck)
    render(<AccuracyPanel client={client} userId="u1" />)
    expect(await screen.findByText('Luck versus skill')).toBeTruthy()
    expect(screen.getByText(/across 2 rated hands/).textContent).toContain(
      '+15.0 bb',
    )
    const chart = screen.getByRole('img', {
      name: /result versus all-in luck taken out/,
    })
    // Three points (0, then two hands), labelled as the hands they are.
    expect(chart.textContent).toContain('Before hand 1')
    expect(chart.textContent).toContain('Hand 2')
    expect(chart.textContent).not.toContain('Hand 3')
  })
})

describe('the luck series', () => {
  it('sums to the net result, and to the luck-adjusted result, in big blinds', () => {
    const rows = [
      { net: 400, adjusted: 100 },
      { net: -200, adjusted: -200 },
      { net: 60, adjusted: 90 },
    ]
    const { result, skill } = luckSeries(rows)
    expect(result).toEqual([0, 20, 10, 13])
    expect(skill).toEqual([0, 5, -5, -0.5])
    expect(result[rows.length]).toBe(rows.reduce((a, r) => a + r.net, 0) / 20)
  })
})
