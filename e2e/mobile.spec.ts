import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeLadder, fakeProfile, onboard, playHand } from './helpers'

/**
 * Nothing wider than the device. Comparing with innerWidth alone is not
 * enough: when content overflows, a phone browser zooms out and widens the
 * layout viewport to match, so scrollWidth === innerWidth still holds.
 */
async function expectNoOverflow(page: Page) {
  const device = page.viewportSize()!.width
  const widths = await page.evaluate(() => ({
    layout: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(widths).toEqual({ layout: device, content: device })
}

test('phone layout has no horizontal scroll and a working lab sheet', async ({
  page,
}) => {
  await onboard(page)
  await expectNoOverflow(page)
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

test('the landing page fits a phone and shows the table on the first screen', async ({
  page,
}) => {
  await page.goto('/?motion=off')
  const decision = page.getByRole('group', { name: /Your decision/ })
  await expect(decision).toBeVisible({ timeout: 10_000 })
  await expectNoOverflow(page)
  const table = await page
    .getByRole('region', { name: 'Poker table' })
    .boundingBox()
  expect(table!.y).toBeLessThan(page.viewportSize()!.height)
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

test('the online lobby fits a phone without horizontal scroll', async ({
  page,
}) => {
  await onboard(page)
  await page.getByRole('button', { name: 'Online', exact: true }).click()
  await expect(
    page.getByText('Online play is not set up on this site yet.'),
  ).toBeVisible()
  await expectNoOverflow(page)
})

test('the ladder fits a phone, down to 320 px: the table scrolls inside itself', async ({
  page,
}) => {
  await fakeLadder(page)
  await page.goto('/#ladder')
  const table = page.getByRole('region', { name: /Ladder table/ })
  await expect(table.locator('tbody tr')).toHaveCount(50)
  await expectNoOverflow(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await expectNoOverflow(page)
  // Every column stays reachable: the region scrolls sideways to the last.
  await table.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect(
    page.getByRole('columnheader', { name: '30 days' }),
  ).toBeInViewport()
})

test('the profile, a match review and the Method page fit a phone, down to 320 px', async ({
  page,
}) => {
  await fakeProfile(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/u/alice')
  await expect(page.getByText('1625 ± 64')).toBeVisible()
  await expectNoOverflow(page)
  await page.goto('/#match/10000000-0000-4000-8000-000000000025')
  await expect(page.getByRole('region', { name: 'Hand 1' })).toBeVisible()
  await expectNoOverflow(page)
  await page.goto('/#method')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Method' }),
  ).toBeVisible()
  await expectNoOverflow(page)
})
