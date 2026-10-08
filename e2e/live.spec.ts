import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

type Frame = {
  t: string
  view?: {
    you: number
    handNo: number
    players: { cards: [number, number] | null; shown: boolean }[]
  } | null
}

/** A signed-in player in their own browser, recording every frame. */
async function player(browser: Browser, name: string) {
  const context = await browser.newContext()
  await context.addInitScript((token) => {
    localStorage.setItem(
      'quantpoker.progress.v2',
      JSON.stringify({ onboarded: true }),
    )
    sessionStorage.setItem('qp.devToken', token)
  }, `dev.${name}.e2e`)
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    throw error
  })
  const frames: Frame[] = []
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => frames.push(JSON.parse(String(f.payload)))),
  )
  return { page, frames, close: () => context.close() }
}

const myTurn = (page: Page) =>
  page.locator('.action-status strong', { hasText: 'Your move' })

test('two browsers play a hand against each other', async ({ browser }) => {
  const alice = await player(browser, 'alice')
  const bob = await player(browser, 'bob')

  await alice.page.goto('/#lobby')
  await expect(alice.page.getByText('Signed in as')).toContainText('alice')
  await alice.page
    .getByRole('button', { name: 'Play a friend by link' })
    .click()
  await expect(alice.page).toHaveURL(/#play\/[0-9a-f-]{36}$/)
  await expect(alice.page.getByText('Waiting for your opponent')).toBeVisible()
  const link = await alice.page.getByLabel('Invite link').inputValue()

  await bob.page.goto(link)
  for (const { page } of [alice, bob]) {
    await expect(page.getByText('Hand 1 of 20')).toBeVisible()
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Poker table' }),
    ).toContainText('Live table')
  }
  await expect(
    alice.page.getByRole('region', { name: 'Poker table' }),
  ).toContainText('vs bob')
  await expect(
    bob.page.getByRole('region', { name: 'Poker table' }),
  ).toContainText('vs alice')

  // Exactly one of them is to act at any time; check or call down.
  const everyone = [alice, bob]
  const done = (page: Page) => page.getByText('Next hand in a few seconds.')
  for (let i = 0; i < 40 && !(await done(alice.page).isVisible()); i++) {
    for (const { page } of [alice, bob])
      if (await myTurn(page).isVisible()) {
        // The big blind can act twice in a row (pre-flop option, then first
        // on the flop), so wait for the server's answer, not for the label.
        const before = everyone.reduce((n, p) => n + p.frames.length, 0)
        await page.locator('.act-call').click()
        await expect
          .poll(() => everyone.reduce((n, p) => n + p.frames.length, 0))
          .toBeGreaterThan(before)
      }
    await alice.page.waitForTimeout(100)
  }
  for (const { page } of [alice, bob]) await expect(done(page)).toBeVisible()

  // Each browser checks the deal against the commitment it got before the
  // first card, with its own Web Crypto.
  for (const { page } of [alice, bob]) {
    await page.getByRole('button', { name: 'Review hand 1' }).click()
    await expect(page.getByText('Deck verified')).toBeVisible()
  }

  // The server deals the next hand by itself.
  for (const { page } of [alice, bob])
    await expect(page.getByText('Hand 2 of 20')).toBeVisible({
      timeout: 10_000,
    })

  // Privacy over the wire: no frame carried the opponent's cards before
  // they were shown at showdown.
  for (const { frames } of [alice, bob]) {
    const views = frames.flatMap((f) => (f.view ? [f.view] : []))
    expect(views.length).toBeGreaterThan(5)
    for (const view of views) {
      const opponent = view.players[1 - view.you]
      if (!opponent.shown) expect(opponent.cards).toBeNull()
      expect(view.players[view.you].cards).not.toBeNull()
    }
    expect(JSON.stringify(frames)).not.toContain('"deck"')
  }

  const axe = await new AxeBuilder({ page: alice.page }).analyze()
  const serious = axe.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  )
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])

  await alice.close()
  await bob.close()
})

test('a third person cannot take a full table', async ({ browser }) => {
  const alice = await player(browser, 'alice2')
  const bob = await player(browser, 'bob2')
  const carol = await player(browser, 'carol')
  await alice.page.goto('/#lobby')
  await alice.page
    .getByRole('button', { name: 'Play a friend by link' })
    .click()
  const link = await alice.page.getByLabel('Invite link').inputValue()
  await bob.page.goto(link)
  await expect(bob.page.getByText('Hand 1 of 20')).toBeVisible()
  await carol.page.goto(link)
  await expect(carol.page.getByRole('alert')).toContainText(
    'Could not join this table',
    {
      timeout: 15_000,
    },
  )
  for (const p of [alice, bob, carol]) await p.close()
})
