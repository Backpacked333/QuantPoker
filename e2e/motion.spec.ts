import { expect, test } from '@playwright/test'

// Samples requestAnimationFrame through the heaviest choreography, an all-in
// runout with card reveals, equity bars and chip flights. Thresholds leave
// room for shared CI cores while still catching layout thrash or a blocked
// main thread (which shows up as a run of long frames).
test('the all-in runout animates without long frames', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'quantpoker.progress.v2',
      JSON.stringify({ onboarded: true }),
    ),
  )
  await page.goto('/?seed=3')
  await page.getByRole('button', { name: 'All-in' }).click()
  await page.evaluate(() => {
    const frames: number[] = []
    Object.assign(window, { sampledFrames: frames })
    let last = performance.now()
    const tick = (now: number) => {
      frames.push(now - last)
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.getByRole('button', { name: /Raise to 1,940/ }).click()
  await expect(page.locator('.runout')).toBeVisible()
  await expect(page.locator('.runout')).toBeHidden({ timeout: 15_000 })
  await page.waitForTimeout(800)
  const frames = await page.evaluate(
    () => (window as unknown as { sampledFrames: number[] }).sampledFrames,
  )
  const sorted = [...frames].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  expect(frames.length).toBeGreaterThan(90)
  expect(median).toBeLessThanOrEqual(34)
  expect(frames.filter((f) => f > 150).length).toBeLessThanOrEqual(3)
})
