import { expect, test } from '@playwright/test'
import { onboard, playHand } from './helpers'

test('phone layout has no horizontal scroll and a working lab sheet', async ({
  page,
}) => {
  await onboard(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
  await page.getByRole('button', { name: /Lock in/ }).click()
  await page.locator('.sheet-handle').click()
  await expect(page.locator('.sheet-body .meter')).toBeVisible({
    timeout: 15_000,
  })
  await page.locator('.sheet-handle').click()
  await playHand(page)
  await page.getByRole('button', { name: 'Review hand' }).click()
  await expect(page.locator('.sheet-body .review')).toBeVisible()
})
