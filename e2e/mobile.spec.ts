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

test('the lab sheet drags between snap points', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: /Lock in/ }).click()
  const handle = page.locator('.sheet-handle')
  const sheet = page.locator('.sheet')
  const viewport = page.viewportSize()!
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  // Drag up past the middle: the sheet opens fully.
  await page.mouse.move(x, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(x, box.y - viewport.height * 0.4, { steps: 12 })
  await page.mouse.move(x, box.y - viewport.height * 0.7, { steps: 6 })
  await page.mouse.up()
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  await expect
    .poll(async () => (await sheet.boundingBox())!.height)
    .toBeGreaterThan(viewport.height * 0.8)
  await expect(page.locator('.sheet-body .meter')).toBeVisible({
    timeout: 15_000,
  })
  // Drag it back down: it closes to the peek handle.
  const top = (await handle.boundingBox())!
  await page.mouse.move(x, top.y + 20)
  await page.mouse.down()
  await page.mouse.move(x, viewport.height - 10, { steps: 12 })
  await page.mouse.up()
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.sheet-body')).toBeHidden()
})
