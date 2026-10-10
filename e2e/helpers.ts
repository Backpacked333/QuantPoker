import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Fresh visitor: welcome, choose a mode, skip the tour. */
export async function onboard(page: Page, mode: 'new' | 'rules' = 'new') {
  await page.goto('/#table')
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
