// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLACEHOLDER, RESERVED, renamePlayer, usernameProblem } from './players'

const sql = readFileSync(
  new URL(
    '../../supabase/migrations/20261008133809_players.sql',
    import.meta.url,
  ),
  'utf8',
)

const clientReturning = (error: { code: string } | null) =>
  ({
    from: () => ({ update: () => ({ eq: async () => ({ error }) }) }),
  }) as unknown as SupabaseClient

describe('usernames', () => {
  it('match the database rules', () => {
    expect(sql).toContain("username ~ '^[a-z0-9_]{3,20}$'")
    const reserved = sql.match(/username not in \(([^)]*)\)/)![1]
    expect(reserved.match(/'([^']+)'/g)!.map((s) => s.slice(1, -1))).toEqual(
      RESERVED,
    )
    expect(sql).toContain(
      "'player_' || substr(replace(new.id::text, '-', ''), 1, 12)",
    )
    expect(PLACEHOLDER.test('player_0123456789ab')).toBe(true)
  })

  it('explain what is wrong', () => {
    expect(usernameProblem('ok_name_7')).toBeNull()
    expect(usernameProblem('ab')).toMatch(/3/)
    expect(usernameProblem('x'.repeat(21))).toMatch(/20/)
    expect(usernameProblem('Has Caps')).toMatch(/Lowercase/)
    expect(usernameProblem('atlas')).toMatch(/reserved/)
    expect(usernameProblem('player_0123456789ab')).toMatch(/your own/)
  })

  it('maps save results to messages', async () => {
    expect(await renamePlayer(clientReturning(null), 'u', 'alice')).toEqual({
      ok: true,
    })
    expect(
      await renamePlayer(clientReturning({ code: '23505' }), 'u', 'alice'),
    ).toEqual({ ok: false, reason: 'That name is taken.' })
    expect(
      await renamePlayer(clientReturning({ code: '42501' }), 'u', 'alice'),
    ).toMatchObject({ ok: false })
    expect(await renamePlayer(clientReturning(null), 'u', 'no')).toMatchObject({
      ok: false,
    })
  })
})
