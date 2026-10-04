import { expect, test, type Page } from '@playwright/test'

const sq = (page: Page, square: string) => page.locator(`[data-square="${square}"]`)

async function move(page: Page, from: string, to: string) {
  await sq(page, from).click()
  await sq(page, to).click()
}

/**
 * Clicks a game action. On phones, actions that are not in the bottom
 * toolbar live in the "More options" sheet.
 */
async function action(page: Page, name: string) {
  const direct = page.getByRole('button', { name, exact: true })
  if ((await direct.count()) > 0 && (await direct.first().isVisible())) {
    await direct.first().click()
    return
  }
  await page.getByRole('button', { name: 'More options' }).click()
  await page.getByRole('dialog', { name: 'Game' }).getByRole('button', { name, exact: true }).click()
}

async function importPgn(page: Page, pgn: string) {
  await action(page, 'PGN')
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
  await action(page, 'Redo')
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
  await action(page, 'PGN')
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

  await expect(page.getByTestId('rules-meta')).toContainText('Strict · Untimed')
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await sq(page, 'e2').click()
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', 'e4, empty')
  await sq(page, 'e4').click()
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /white pawn/)
  await page.keyboard.press('Control+z')
  await expect(sq(page, 'e4')).toHaveAttribute('aria-label', /white pawn/)

  await page.reload()
  await expect(page.getByTestId('rules-meta')).toContainText('Strict · Untimed')
})

test('rules: Customized rules is its own choice and is remembered', async ({ page }) => {
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await expect(setup.getByTestId('custom-rules')).toHaveCount(0)
  await setup.getByText('Customized rules', { exact: true }).click()
  await expect(setup.getByTestId('custom-rules')).toBeVisible()
  await setup.getByLabel('Allow takebacks').check()
  await setup.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByTestId('rules-meta')).toContainText('Customized rules · Untimed')
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
  await expect(page.getByTestId('rules-meta')).toContainText('Customized rules · Untimed')
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
  await expect(page.getByTestId('rules-meta')).toContainText('Chess.com style · Untimed')
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'New game' }).click()
  const setup = page.getByRole('dialog', { name: 'New game' })
  await expect(setup.getByRole('radio', { name: /Chess.com style/ })).toBeChecked()
  await setup.getByText('Strict', { exact: true }).click()
  await setup.getByRole('button', { name: 'Start game' }).click()
  await page.getByRole('button', { name: 'New game' }).click()
  await expect(setup.getByRole('radio', { name: /Chess.com style/ })).toBeChecked()
})

test('phones: the game fills the screen without scrolling', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout')
  await move(page, 'e2', 'e4')
  const layout = await page.evaluate(() => {
    const board = document.querySelector('[role="grid"]')!.getBoundingClientRect()
    return {
      verticalScroll: document.documentElement.scrollHeight - window.innerHeight,
      boardWidth: board.width,
      viewportWidth: window.innerWidth,
    }
  })
  expect(layout.verticalScroll).toBeLessThanOrEqual(0)
  expect(layout.boardWidth).toBeGreaterThan(layout.viewportWidth * 0.95)
  await expect(page.getByRole('navigation', { name: 'Game actions' })).toBeVisible()
  await page.getByRole('button', { name: 'Previous move' }).click()
  await expect(page.getByText('Viewing move 0 of 1')).toBeVisible()
  await page.getByRole('button', { name: 'Back to live game' }).click()
  await page.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByRole('dialog', { name: 'Game' }).getByRole('button', { name: 'Resign' })).toBeVisible()
})

test('portrait tablets use the full-screen layout without scrolling', async ({ browser }) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 1366 },
  ]) {
    const page = await browser.newPage({ viewport })
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Game actions' })).toBeVisible()
    const verticalScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(verticalScroll, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(0)
    await page.close()
  }
})

test('landscape tablets keep the side-by-side layout', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Game actions' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Moves' })).toBeVisible()
  await page.close()
})

test('phones: playing, dragging and swiping never scroll the page', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout')
  await expect(page.locator('html')).toHaveClass(/page-locked/)
  await move(page, 'e2', 'e4')
  await move(page, 'e7', 'e5')
  // Touch swipe that starts on an empty square, plus a dispatched touch drag of a piece.
  const empty = (await sq(page, 'd4').boundingBox())!
  await page.touchscreen.tap(empty.x + 5, empty.y + 5)
  await page.mouse.wheel(0, 600)
  const knight = (await sq(page, 'g1').boundingBox())!
  const target = (await sq(page, 'f3').boundingBox())!
  await page.mouse.move(knight.x + knight.width / 2, knight.y + knight.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(sq(page, 'f3')).toHaveAttribute('aria-label', /white knight/)
  const state = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollable: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    overflowY: getComputedStyle(document.documentElement).overflowY,
  }))
  expect(state.scrollY).toBe(0)
  expect(state.overflowY).toBe('hidden')
  expect(state.scrollable).toBeLessThanOrEqual(0)
})

test('leaving the game page unlocks scrolling again', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout')
  await expect(page.locator('html')).toHaveClass(/page-locked/)
  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page.getByRole('heading', { name: 'Rules & help' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/page-locked/)
  await page.mouse.wheel(0, 800)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('playing moves never scrolls the page to the move list', async ({ browser }) => {
  // Layouts where the page or panels could scroll: short desktop, portrait tablet, phone.
  for (const viewport of [
    { width: 1280, height: 620 },
    { width: 900, height: 700 },
    { width: 768, height: 1024 },
    { width: 390, height: 700 },
  ]) {
    const page = await browser.newPage({ viewport })
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'b1c3', 'f8c5', 'd2d3', 'd7d6', 'c1g5', 'h7h6']
    for (const m of line) await move(page, m.slice(0, 2), m.slice(2, 4))
    const scrolled = await page.evaluate(() => {
      const offsets = [window.scrollY]
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (el.closest('.strip, .history')) continue // the move list itself may scroll
        if (el.scrollTop > 0) offsets.push(el.scrollTop)
      }
      return Math.max(...offsets)
    })
    expect(scrolled, `${viewport.width}x${viewport.height}`).toBe(0)
    await expect(page.getByRole('button', { name: 'Move 6, black: h6' })).toBeInViewport()
    await page.close()
  }
})
