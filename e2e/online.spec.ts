import { expect, test, type Page } from '@playwright/test'
import { hasOnlineServer } from '../playwright.config.ts'

test.skip(!hasOnlineServer, 'vuess-server is not available next to this project')

const sq = (page: Page, square: string) => page.locator(`[data-square="${square}"]`)
const status = (page: Page) => page.getByTestId('status')

async function move(page: Page, from: string, to: string) {
  await sq(page, from).click()
  await sq(page, to).click()
}

/** Draw offers are "Offer draw" in the desktop panel and "Draw" in the phone toolbar. */
const drawButton = (page: Page) => page.getByRole('button', { name: /^(Offer draw|Draw)$/ })

test('two players play online: invite link, moves, draw offer, reconnect', async ({ browser }, testInfo) => {
  const device = testInfo.project.use
  const alice = await (await browser.newContext({ ...device })).newPage()
  const bob = await (await browser.newContext({ ...device })).newPage()

  // Alice creates a game from the lobby.
  await alice.goto('/online')
  await alice.getByRole('textbox', { name: 'Your name' }).fill('Alice')
  await alice.getByText('White', { exact: true }).click()
  await alice.getByText('Untimed', { exact: true }).click()
  await alice.getByRole('button', { name: 'Create game' }).click()
  await expect(alice).toHaveURL(/\/online\/[A-Za-z0-9_-]+$/)
  await expect(alice.getByTestId('invite')).toBeVisible()
  const link = await alice.getByRole('textbox', { name: 'Invite link' }).inputValue()

  // Bob opens the link, gives his name and joins as Black.
  await bob.goto(link)
  await bob.getByPlaceholder('Your name').fill('Bob')
  await bob.getByRole('button', { name: 'Join' }).click()
  await expect(status(bob)).toHaveText('Opponent to move')
  await expect(alice.getByTestId('invite')).toBeHidden()
  await expect(status(alice)).toHaveText('Your move')
  await expect(alice.getByText('Bob', { exact: false }).first()).toBeVisible()

  // Moves travel both ways through the server.
  await move(alice, 'e2', 'e4')
  await expect(sq(bob, 'e4')).toHaveAttribute('aria-label', /white pawn/)
  await expect(status(bob)).toHaveText('Your move')
  // Alice cannot move Black's pieces or move twice.
  await sq(alice, 'e7').click()
  await expect(sq(alice, 'e7')).not.toHaveAttribute('aria-selected', 'true')
  await move(bob, 'e7', 'e5')
  await expect(sq(alice, 'e5')).toHaveAttribute('aria-label', /black pawn/)

  // Reloading restores Alice's seat from the saved token.
  await alice.reload()
  await expect(status(alice)).toHaveText('Your move')
  await expect(sq(alice, 'e5')).toHaveAttribute('aria-label', /black pawn/)

  // Draw offer: Bob offers, Alice accepts.
  await drawButton(bob).click()
  await bob.getByRole('dialog', { name: 'Offer a draw?' }).getByRole('button', { name: 'Offer draw' }).click()
  await expect(alice.getByText('Your opponent offers a draw.')).toBeVisible()
  await alice.getByRole('button', { name: 'Accept' }).click()
  for (const page of [alice, bob]) {
    const result = page.getByRole('dialog', { name: 'Game over' })
    await expect(result).toContainText('Draw')
    await expect(result).toContainText('by agreement')
  }
})

test('the New game dialog can create an online game', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await setup.getByText('Online', { exact: true }).click()
  await setup.getByRole('textbox', { name: 'Your name' }).fill('Carol')
  await setup.getByRole('button', { name: 'Create online game' }).click()
  await expect(page).toHaveURL(/\/online\/[A-Za-z0-9_-]+$/)
  await expect(page.getByTestId('invite')).toBeVisible()
  await expect(status(page)).toHaveText('Waiting for an opponent to join')
})
