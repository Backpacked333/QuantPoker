import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { fakeLadder } from './helpers'

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('table').locator('tbody tr')

test('the ladder is public: ranks, rating ± RD, keyset pages and this month', async ({
  page,
}) => {
  await fakeLadder(page)
  await page.goto('/#ladder')
  await expect(
    page.getByRole('heading', { name: 'Ladder', level: 1 }),
  ).toBeVisible()
  // No sign-in, no welcome dialog: anyone can read it.
  await expect(page.getByRole('button', { name: /new to poker/ })).toHaveCount(
    0,
  )
  await expect(rows(page)).toHaveCount(50)
  await expect(rows(page).first()).toContainText('1player12096 ± 56')
  await expect(
    page.getByRole('columnheader', { name: 'Rating ± RD' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(rows(page).first()).toContainText('51player51')
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(rows(page)).toHaveCount(20)
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(rows(page).first()).toContainText('51player51')

  await page.getByRole('link', { name: 'This month' }).click()
  await expect(page).toHaveURL(/#ladder\/month$/)
  await expect(
    page.getByRole('columnheader', { name: 'This month' }),
  ).toBeVisible()
  await expect(rows(page)).toHaveCount(30)
  await expect(rows(page).first()).toContainText('1player1')
})

for (const colorScheme of ['light', 'dark'] as const)
  test(`the ladder has no accessibility violations (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await fakeLadder(page)
    await page.goto('/#ladder')
    await expect(rows(page)).toHaveCount(50)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
