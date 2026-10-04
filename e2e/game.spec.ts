import { expect, test, type Page } from '@playwright/test'

const sq = (page: Page, square: string) => page.locator(`[data-square="${square}"]`)

async function move(page: Page, from: string, to: string) {
  await sq(page, from).click()
  await sq(page, to).click()
}

async function importPgn(page: Page, pgn: string) {
  await page.getByRole('button', { name: 'PGN' }).click()
  await page.getByLabel('PGN to import').fill(pgn)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
}

const status = (page: Page) => page.getByTestId('status')

/** Starts an untimed game with the named rules preset (the default, Chess.com style, has no takebacks). */
async function startWithRules(page: Page, preset: string) {
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await setup.getByText(preset, { exact: true }).click()
  await setup.getByRole('button', { name: 'Start game' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('plays to checkmate, shows the result, and restores it after reload', async ({ page }) => {
  await move(page, 'f2', 'f3')
  await move(page, 'e7', 'e5')
  await move(page, 'g2', 'g4')
  await expect(sq(page, 'd8')).toHaveAttribute('aria-label', 'd8, black queen')
  await move(page, 'd8', 'h4')

  const dialog = page.getByRole('dialog', { name: 'Game over' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Black wins')
  await expect(dialog).toContainText('by checkmate')
  await dialog.getByRole('button', { name: 'Review board' }).click()
  await expect(sq(page, 'e1')).toHaveAttribute('aria-label', /in check/)

  await page.reload()
  await expect(status(page)).toContainText('Black wins')
  await expect(page.getByRole('list').getByRole('button')).toHaveCount(4)
  await expect(sq(page, 'h4')).toHaveAttribute('aria-label', /black queen/)
})

test('promotion asks for a piece; cancelling leaves the pawn in place', async ({ page }) => {
  await importPgn(page, '[SetUp "1"]\n[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]\n\n*')
  await move(page, 'a7', 'a8')
  const dialog = page.getByRole('dialog', { name: 'Promote pawn' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(sq(page, 'a7')).toHaveAttribute('aria-label', /white pawn/)

  await move(page, 'a7', 'a8')
  await page.getByTestId('promote-n').click()
  await expect(sq(page, 'a8')).toHaveAttribute('aria-label', /white knight/)
  await expect(page.getByRole('button', { name: /a8=N/ })).toBeVisible()
})

test('drag and drop uses the same move pipeline and rejects illegal drops', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse drag is covered on desktop; taps are covered on all projects.')
  const drag = async (from: string, to: string) => {
    const a = (await sq(page, from).boundingBox())!
    const b = (await sq(page, to).boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
    await page.mouse.up()
  }
  await drag('e2', 'e5') // illegal
  await expect(sq(page, 'e2')).toHaveAttribute('aria-label', /white pawn/)
  await drag('e2', 'e4')
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /white pawn/)
  await expect(status(page)).toHaveText('Black to move')
})

test('keyboard can select and move pieces', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Physical keyboard flow')
  await startWithRules(page, 'Casual')
  await sq(page, 'e2').focus()
  await page.keyboard.press('Enter')
  await expect(sq(page, 'e2')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(sq(page, 'e4')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /white pawn/)
  await page.keyboard.press('Control+z')
  await expect(sq(page, 'e2')).toHaveAttribute('aria-label', /white pawn/)
})

test('browsing history does not change the live game and blocks moves', async ({ page }) => {
  await move(page, 'e2', 'e4')
  await move(page, 'e7', 'e5')
  await page.getByRole('button', { name: 'Move 1, white: e4' }).click()
  await expect(page.getByText('Viewing move 1 of 2')).toBeVisible()
  await expect(sq(page, 'e5')).toHaveAttribute('aria-label', /empty/)
  await sq(page, 'g1').click()
  await expect(sq(page, 'g1')).not.toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Back to live game' }).click()
  await expect(sq(page, 'e5')).toHaveAttribute('aria-label', /black pawn/)
  await move(page, 'g1', 'f3')
  await expect(status(page)).toHaveText('Black to move')
})

test('undo and redo', async ({ page }) => {
  await startWithRules(page, 'Casual')
  await move(page, 'e2', 'e4')
  await move(page, 'e7', 'e5')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(sq(page, 'e7')).toHaveAttribute('aria-label', /black pawn/)
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(sq(page, 'e5')).toHaveAttribute('aria-label', /black pawn/)
})

test('timed games restore paused and resume on request', async ({ page }) => {
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await setup.getByLabel('White player').fill('Ada')
  await setup.getByText('3 min + 2 s').click()
  await setup.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByRole('timer')).toHaveCount(2)
  await move(page, 'e2', 'e4')
  await expect(page.getByRole('timer', { name: /Black clock.*running/ })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Game paused').first()).toBeVisible()
  await expect(page.getByText('Ada')).toBeVisible()
  await sq(page, 'e7').click({ force: true })
  await expect(sq(page, 'e7')).not.toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('resume').click()
  await move(page, 'e7', 'e5')
  await expect(page.getByRole('timer', { name: /White clock.*running/ })).toBeVisible()
})

test('PGN export, failed import keeps the game, valid import replaces it', async ({ page }) => {
  await move(page, 'e2', 'e4')
  await page.getByRole('button', { name: 'PGN' }).click()
  await expect(page.getByLabel('PGN of the current game')).toHaveValue(/1\. e4 \*/)
  await page.getByLabel('PGN to import').fill('1. e4 e5 2. Ke3')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not be read')
  await page.keyboard.press('Escape')
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /white pawn/)

  await importPgn(page, '[White "Ada"]\n[Black "Grace"]\n\n1. d4 d5 *')
  await expect(sq(page, 'd5')).toHaveAttribute('aria-label', /black pawn/)
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /empty/)
  await expect(page.getByText('Grace')).toBeVisible()
})

test('corrupted saved data starts a fresh game with a notice', async ({ page }) => {
  // Write the corrupt save from a blank same-origin page so the running app cannot overwrite it on unload.
  await page.route('**/blank', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }))
  await page.goto('/blank')
  await page.evaluate(() => localStorage.setItem('vuess.game', '{broken'))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('A new game was started')
  await move(page, 'e2', 'e4')
  await expect(status(page)).toHaveText('Black to move')
})

test('layout has no horizontal overflow and routes work', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByLabel('Slate').check()
  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page.getByRole('heading', { name: 'Rules & help' })).toBeVisible()
  await page.goto('/does-not-exist')
  await expect(sq(page, 'e2')).toBeVisible()
  await expect(page.locator('.game')).toHaveClass(/board-theme--slate/)
})

test('rules: strict hides takebacks and hints, and shows what it includes', async ({ page }) => {
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await setup.getByText('Strict', { exact: true }).click()
  await setup.getByText('What Strict includes').click()
  await expect(setup.getByText('Off Allow takebacks')).toBeVisible()
  await expect(setup.getByText('On En passant')).toBeVisible()
  await expect(setup.getByLabel('Allow takebacks')).toHaveCount(0)
  await setup.getByRole('button', { name: 'Start game' }).click()

  await expect(page.getByText('Strict · Untimed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await sq(page, 'e2').click()
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', 'e4, empty')
  await sq(page, 'e4').click()
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /white pawn/)
  await page.keyboard.press('Control+z')
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /white pawn/)

  await page.reload()
  await expect(page.getByText('Strict · Untimed')).toBeVisible()
})

test('rules: Customized rules is its own choice and is remembered', async ({ page }) => {
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await expect(setup.getByTestId('custom-rules')).toHaveCount(0)
  await setup.getByText('Customized rules', { exact: true }).click()
  await expect(setup.getByTestId('custom-rules')).toBeVisible()
  await setup.getByLabel('Allow takebacks').check()
  await setup.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByText('Customized rules · Untimed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()

  await page.getByRole('button', { name: 'New game' }).click()
  await expect(setup.getByRole('radio', { name: /Chess\.com style/ })).toBeChecked()
  await setup.getByText('Customized rules', { exact: true }).click()
  await expect(setup.getByLabel('Allow takebacks')).toBeChecked()
})

test('rules: rotate board puts the side to move at the bottom', async ({ page }) => {
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await setup.getByText('Customized rules', { exact: true }).click()
  await setup.getByLabel('Rotate board each turn').check()
  await setup.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByRole('button', { name: 'Flip' })).toHaveCount(0)
  const firstSquare = () => page.locator('[data-square]').first()
  await expect(firstSquare()).toHaveAttribute('data-square', 'a8')
  await move(page, 'e2', 'e4')
  await expect(firstSquare()).toHaveAttribute('data-square', 'h1')
})

test('rules: en passant can be switched off', async ({ page }) => {
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await setup.getByText('Customized rules', { exact: true }).click()
  await setup.getByLabel('En passant').uncheck()
  await setup.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByText('Customized rules · Untimed')).toBeVisible()
  await move(page, 'e2', 'e4')
  await move(page, 'a7', 'a6')
  await move(page, 'e4', 'e5')
  await move(page, 'd7', 'd5')
  await sq(page, 'e5').click()
  await expect(sq(page, 'd6')).toHaveAttribute('aria-label', 'd6, empty')
  await sq(page, 'd6').click()
  await expect(sq(page, 'd5')).toHaveAttribute('aria-label', /black pawn/)
  await expect(status(page)).toHaveText('White to move')
})

test('rules: new games default to Chess.com style', async ({ page }) => {
  await expect(page.getByText('Chess.com style · Untimed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await expect(setup.getByRole('radio', { name: /Chess.com style/ })).toBeChecked()
  await setup.getByText('Strict', { exact: true }).click()
  await setup.getByRole('button', { name: 'Start game' }).click()
  await page.getByRole('button', { name: 'New game' }).click()
  await expect(setup.getByRole('radio', { name: /Chess.com style/ })).toBeChecked()
})
