import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// The landing page (L-1, L-2, L-11): a first visit at the bare URL plays a
// graded challenge hand by keyboard, with no account, and reaches the score
// card. The preview server has no Worker, so the percentile is unavailable
// here; the Worker's own suite covers ranking (worker/test/challenge.test.ts).

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

/** Presses the check-or-call key at every decision until the hand ends. */
async function playByKeyboard(page: Page) {
  const card = page.getByRole('region', { name: /Accuracy/ })
  for (let i = 0; i < 30 && !(await card.count()); i++) {
    const call = page
      .getByRole('group', { name: /Your decision/ })
      .getByRole('button', { name: /Call|Check/ })
    if (await call.count()) {
      const key = await call.first().getAttribute('aria-keyshortcuts')
      await page.keyboard.press(key!)
    }
    await page.waitForTimeout(400)
  }
  await expect(card).toBeVisible({ timeout: 15_000 })
  return card
}

for (const colorScheme of ['light', 'dark'] as const)
  test(`a first visit plays a graded hand and reaches the score card (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/?motion=off')
    await expect(
      page.getByRole('heading', { level: 1, name: /misprice this hand/ }),
    ).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(
      page.getByRole('group', { name: /Your decision/ }),
    ).toBeVisible({ timeout: 10_000 })
    await axe(page)
    const card = await playByKeyboard(page)
    await expect(card).toContainText('/100')
    await expect(card).toContainText(/graded Best/)
    await expect(card).toContainText(/Percentile unavailable/)
    await axe(page)
    // Finished: the next visit opens the app, not the landing page again.
    await page.reload()
    await expect(page.locator('.table')).toBeVisible()
    await expect(page.getByRole('heading', { name: /misprice/ })).toHaveCount(0)
  })

test('skipping goes to free practice and is remembered', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Skip to free practice/ }).click()
  await expect(page).toHaveURL(/#table$/)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /misprice/ })).toHaveCount(0)
  await page.goto('/#start')
  await expect(page.getByRole('heading', { name: /misprice/ })).toBeVisible()
})
