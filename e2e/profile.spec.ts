import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeProfile } from './helpers'

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

test('a shared /u/<name> link opens the public profile, and its matches open hand by hand', async ({
  page,
}) => {
  await fakeProfile(page)
  await page.goto('/u/alice')
  await expect(page).toHaveURL(/\/#u\/alice$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'alice' }),
  ).toBeVisible()
  await expect(page.getByText('1625 ± 64')).toBeVisible()
  await expect(page.getByText('Established')).toBeVisible()
  await expect(
    page.getByRole('img', { name: /Rating over time/ }),
  ).toBeVisible()
  const matches = page.getByRole('list').filter({ hasText: 'rival25' })
  await expect(matches.getByRole('listitem')).toHaveCount(20)
  await axe(page)

  await matches
    .getByRole('listitem')
    .first()
    .getByRole('link', { name: /Review/ })
    .click()
  await expect(page).toHaveURL(/#match\/10000000-0000-4000-8000-000000000025$/)
  const hand1 = page.getByRole('region', { name: 'Hand 1' })
  await expect(hand1.getByText('alice showed')).toBeVisible()
  await axe(page)
  await page.getByRole('button', { name: 'Next hand' }).click()
  const hand2 = page.getByRole('region', { name: 'Hand 2' })
  await expect(hand2).toContainText('alice folds')
  await expect(hand2).toContainText('ran out of time')
  await expect(hand2.locator('.mini-card')).toHaveCount(0)
})

for (const colorScheme of ['light', 'dark'] as const)
  test(`the Method page states the formulas and versions and is accessible (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/#method')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Method' }),
    ).toBeVisible()
    await expect(page.getByText('glicko2.v1').first()).toBeVisible()
    await axe(page)
  })
