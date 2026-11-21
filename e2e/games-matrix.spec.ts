// Every LIST GAMES entry (except GLOBAL THERMONUCLEAR WAR, which has its own
// flow and is covered in full-playthrough) must be reachable from the front-end menu,
// render, respond to real input (state changes, not frozen), raise no runtime
// error, and exit back to the menu. This is the playability gate for the 14
// tribute games.
import { test, expect, type Page } from '@playwright/test'

const GAMES: ReadonlyArray<{ label: string; slug: string }> = [
  { label: 'FALKENS MAZE', slug: 'falkens-maze' },
  { label: 'BLACK JACK', slug: 'blackjack' },
  { label: 'GIN RUMMY', slug: 'gin-rummy' },
  { label: 'HEARTS', slug: 'hearts' },
  { label: 'BRIDGE', slug: 'bridge' },
  { label: 'CHECKERS', slug: 'checkers' },
  { label: 'CHESS', slug: 'chess' },
  { label: 'POKER', slug: 'poker' },
  { label: 'FIGHTER COMBAT', slug: 'fighter-combat' },
  { label: 'GUERRILLA ENGAGEMENT', slug: 'guerrilla-engagement' },
  { label: 'DESERT WARFARE', slug: 'desert-warfare' },
  { label: 'AIR-TO-GROUND ACTIONS', slug: 'air-to-ground' },
  { label: 'THEATERWIDE TACTICAL WARFARE', slug: 'theaterwide-tactical' },
  { label: 'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE', slug: 'theaterwide-biochem' },
]

async function openMenu(page: Page): Promise<void> {
  await page.goto('./?stage=menu')
  await expect(page.getByTestId('games')).toBeVisible({ timeout: 10_000 })
}

for (const { label, slug } of GAMES) {
  test(`playable: ${label}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await openMenu(page)
    await page.getByRole('button', { name: label, exact: true }).click()

    const root = page.getByTestId(`game-${slug}`)
    await expect(root).toBeVisible({ timeout: 10_000 })

    const markup = (): Promise<string> => root.innerHTML().catch(() => '')
    const before = await markup()

    // Escalate input, cheapest first, stopping as soon as the game responds.
    // Button/key games (blackjack, the sims) react to a few clicks; only grid
    // games (chess/checkers, whose square CELLS are divs, not buttons) need the
    // board coordinate sweep, which is heavier and reserved for last.
    const pressKeys = async (): Promise<void> => {
      for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'w', 'a', 's', 'd', 'Enter']) {
        await page.keyboard.press(key).catch(() => {})
      }
    }
    const clickButtons = async (): Promise<void> => {
      const buttons = root.locator('button:not([data-testid="game-exit"])')
      const n = Math.min(await buttons.count(), 6)
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i)
        if (await b.isEnabled().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => {})
      }
    }
    const sweepBoard = async (): Promise<void> => {
      const box = await root.boundingBox().catch(() => null)
      if (!box) return
      const fs = [0.24, 0.36, 0.48, 0.6, 0.72]
      for (const fy of fs) for (const fx of fs) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy).catch(() => {})
      }
    }

    let after = before
    for (const step of [pressKeys, clickButtons, clickButtons, sweepBoard]) {
      if (after !== before) break
      await step()
      await page.waitForTimeout(300)
      after = await markup()
    }

    // Responsive: the rendered markup changed under input (no frozen screen).
    expect(after, `${label} did not respond to input`).not.toBe(before)

    // Exit returns to the games menu.
    await page.getByTestId('game-exit').first().click()
    await expect(page.getByTestId('games')).toBeVisible({ timeout: 10_000 })

    expect(errors, `${label} raised a runtime error: ${errors.join(' | ')}`).toEqual([])
  })
}
