import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('homepage stays lightweight and its example responds to keyboard input', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  const scripts: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })
  await page.goto('/?motion=off')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Play the hand.',
  )
  const chance = page.getByRole('slider', { name: 'Your assumed win chance' })
  await chance.focus()
  await page.keyboard.press('Home')
  await expect(page.locator('output.lp-ev')).toHaveText('−12.5 chips')
  await chance.fill('20')
  await expect(page.locator('output.lp-ev')).toHaveText('0.0 chips')
  await page.keyboard.press('End')
  await expect(page.locator('output.lp-ev')).toHaveText('+50.0 chips')
  await expect(page.getByText('Positive EV', { exact: true })).toBeVisible()
  expect(page.workers()).toHaveLength(0)
  expect(
    scripts.filter((url) =>
      /\/(App|Lab|LiveApp|Curriculum|equity\.worker)-/.test(url),
    ),
  ).toEqual([])
  expect(errors).toEqual([])
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await chance.fill('30')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: testInfo.outputPath('landing-desktop.png'),
    fullPage: true,
  })
})

test('practice CTA enters the existing guided onboarding and back returns home', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Play a practice hand' }).click()
  await expect(page).toHaveURL(/#table$/)
  await expect(page.getByRole('button', { name: /new to poker/ })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Play the hand.',
  )
})

test('section links, FAQs, curriculum and online links retain their destinations', async ({
  page,
}) => {
  await page.goto('/?motion=off')
  await page.getByRole('link', { name: 'FAQ', exact: true }).click()
  await expect(page).toHaveURL(/#questions$/)
  const question = page.getByText('Do I need an account?', { exact: true })
  await question.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByText(/Practice progress is saved in this browser/),
  ).toBeVisible()
  await expect(
    new AxeBuilder({ page }).analyze().then((result) => result.violations),
  ).resolves.toEqual([])
  await page.getByRole('link', { name: 'Find your first lesson' }).click()
  await expect(page).toHaveURL(/#learn\/path$/)
  await expect(page.getByRole('button', { name: /new to poker/ })).toBeVisible()
  await page.goto('/#home')
  await page.getByRole('link', { name: 'Play online', exact: true }).click()
  await expect(page).toHaveURL(/#lobby$/)
  await expect(page.locator('.landing')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('homepage reflows and remains legible in dark mode on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('link', { name: 'Play a practice hand' }).click()
  await expect(page.getByRole('button', { name: /new to poker/ })).toBeVisible()
})

test('the experiment supports scenarios, repeated runs and keyboard inspection', async ({
  page,
}, testInfo) => {
  await page.goto('/?motion=off#experiment')
  await page.getByRole('button', { name: 'Run 100 calls' }).click()
  await expect(page.locator('.lp-run-summary')).toContainText('ACTUAL RESULT')
  await expect(
    page.locator('.lp-outcomes .lp-win, .lp-outcomes .lp-loss'),
  ).toHaveCount(100)
  const inspect = page.getByRole('slider', { name: /Inspect call/ })
  await inspect.focus()
  await page.keyboard.press('Home')
  await expect(inspect).toHaveValue('1')
  await expect(
    page.getByRole('img', { name: /Cumulative result/ }),
  ).toHaveAccessibleName(/At call 1:/)
  await page.getByRole('button', { name: 'Too expensive' }).click()
  await expect(page.getByText(/Settings changed/)).toBeVisible()
  await page.getByRole('button', { name: 'Run another 100 calls' }).click()
  await expect(page.getByText(/Settings changed/)).toHaveCount(0)
  await expect(page.locator('.lp-experiment-ev')).toContainText('−27.50')
  await expect(page.locator('.lp-run-summary')).toContainText('−2,750')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page
    .locator('.lp-playground')
    .screenshot({ path: testInfo.outputPath('landing-experiment.png') })
})

test('motion can be paused and reduced-motion visits reveal all content', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pause animations' }).click()
  await expect(page.locator('.landing')).toHaveClass(/lp-motion-paused/)
  expect(
    await page
      .locator('.lp-headline-line > span')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  await page.getByRole('button', { name: 'Resume animations' }).click()
  await expect(page.locator('.landing')).not.toHaveClass(/lp-motion-paused/)
  await page.getByRole('link', { name: 'Try the lab' }).click()
  await expect(page).toHaveURL(/#experiment$/)
  await expect(page.locator('.lp-playground')).toHaveCSS('opacity', '1')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.landing')).toHaveClass(/lp-motion-paused/)
  await expect(page.locator('.lp-approach')).toHaveCSS('opacity', '1')
})
