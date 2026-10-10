import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Fresh visitor: welcome, choose a mode, skip the tour. */
export async function onboard(page: Page, mode: 'new' | 'rules' = 'new') {
  await page.goto('/')
  await page
    .getByRole('button', {
      name: mode === 'new' ? /new to poker/ : /know the rules/,
    })
    .click()
  await page.getByRole('button', { name: 'Skip tour' }).click()
}

/** Play the current hand to the end, locking a read and calling or checking. */
export async function playHand(page: Page) {
  for (let i = 0; i < 80; i++) {
    if (await page.locator('.action-done').count()) return
    if (await page.locator('.guess-bar').count()) {
      await page.getByRole('button', { name: /Lock in/ }).click()
      continue
    }
    const call = page.locator('.act-call:not([disabled])')
    if (await call.count()) {
      await call.click()
      continue
    }
    await page.waitForTimeout(250)
  }
  await expect(page.locator('.action-done')).toBeVisible()
}

/**
 * A stand-in account service for the public ladder: /api/config points the
 * app at a fake Supabase, whose ladder functions answer keyset pages of
 * `players` generated players the way PostgREST does (capped at 100).
 * Nothing leaves the browser.
 */
export async function fakeLadder(page: Page, players = 120) {
  const url = 'https://ladder.e2e.test'
  const rows = Array.from({ length: players }, (_, i) => {
    const n = i + 1
    return {
      user_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      username: `player${n}`,
      rating: 2100 - n * 4.5,
      rd: 55 + (n % 40),
      matches: 20 + n,
      wins: 10 + Math.floor(n / 2),
      draws: n % 3,
      accuracy: n % 9 === 0 ? null : 64 + (n % 15),
      trend: n % 4 === 0 ? null : n % 2 ? 14.2 : -6.8,
    }
  })
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { supabaseUrl: url, supabaseKey: 'e2e-publishable-key' },
    }),
  )
  await page.route(`${url}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (
      path === '/rest/v1/rpc/ladder' ||
      path === '/rest/v1/rpc/ladder_month'
    ) {
      const args = route.request().postDataJSON() as {
        p_after_rating: number | null
        p_after_user: string | null
        p_page: number
      }
      const listed = path.endsWith('month') ? rows.slice(0, 30) : rows
      const start =
        args.p_after_rating === null
          ? 0
          : listed.findIndex(
              (r) =>
                r.rating < args.p_after_rating! ||
                (r.rating === args.p_after_rating &&
                  r.user_id > args.p_after_user!),
            )
      const size = Math.min(args.p_page, 100)
      return route.fulfill({
        json: start < 0 ? [] : listed.slice(start, start + size),
      })
    }
    return route.fulfill({ status: 404, json: { message: 'not here' } })
  })
}
