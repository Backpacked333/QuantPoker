import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { onboard, playHand } from './helpers'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
})

test('guess first, act by keyboard, then review a graded hand', async ({
  page,
}) => {
  await onboard(page)
  await expect(page.getByText('Make your read first.')).toBeVisible()
  const slider = page.getByLabel('Your equity estimate in percent')
  await slider.fill('55')
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('Your read', { exact: false }).first(),
  ).toBeVisible()
  await expect(page.locator('.meter')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.act-call .ring-label')).not.toHaveText('')
  await page.keyboard.press('c')
  await playHand(page)
  await expect(page.locator('.review')).toBeVisible()
  await expect(page.locator('.accuracy-badge')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.timeline-item').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Guided hand 2 of 3')).toBeVisible()
})

test('records results that survive a reload', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: /Fold/ }).first().click()
  await expect(page.locator('.accuracy-badge')).toBeVisible({ timeout: 15_000 })
  await page.reload()
  await expect(page.getByRole('button', { name: /new to poker/ })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: /Progress/ }).click()
  await expect(page.getByText(/1 hands recorded/)).toBeVisible()
  await expect(page.getByText('Luck versus skill')).toBeVisible()
})

test('analyst views, the 3D terrain and GL context cleanup', async ({
  page,
}) => {
  const warnings: string[] = []
  page.on('console', (m) => {
    if (/WebGL|context/i.test(m.text())) warnings.push(m.text())
  })
  await onboard(page, 'rules')
  await page.getByRole('button', { name: 'Reveal without guessing' }).click()
  for (const tab of ['Atlas range', 'Optionality', 'Protection', 'Decision'])
    await page.getByRole('tab', { name: tab }).click()
  await expect(page.locator('.heatmap canvas')).toBeVisible()
  for (let i = 0; i < 18; i++) {
    await page.getByRole('button', { name: '3D view' }).click()
    await expect(page.locator('.surface-viewport canvas')).toBeVisible()
    await page.keyboard.press('Escape')
  }
  expect(warnings.filter((w) => /Too many active/i.test(w))).toEqual([])
})

test('lessons are interactive and completable', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: /Learn/ }).click()
  await page.getByRole('button', { name: /Count outs/ }).click()
  await page.getByRole('button', { name: 'About 20%' }).click()
  await expect(page.getByText(/Exactly\./)).toBeVisible()
  await page.getByRole('button', { name: 'All lessons' }).click()
  await expect(page.getByText('1 of 6 complete')).toBeVisible()
})

test('dark theme and reduced motion still render the table', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await onboard(page)
  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )
  expect(background).toBe('rgb(12, 19, 17)')
  await expect(page.locator('.board .pcard')).toHaveCount(5)
})

for (const colorScheme of ['light', 'dark'] as const)
  test(`has no serious accessibility violations (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await onboard(page)
    await page.getByRole('button', { name: 'Reveal without guessing' }).click()
    await expect(page.locator('.meter')).toBeVisible({ timeout: 15_000 })
    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    )
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
