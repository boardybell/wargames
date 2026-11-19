// Shared browser-play helpers: activation, typed-command drive over a controlled
// clock, and settlement. These run every mission the same way the engine
// solvability fixtures prove it wins, inside the real shell: page.clock pins the
// Date.now the shell feeds the engine, each winning move is typed into the real
// command input, then the clock steps past the deadline and a wake settles the
// mission to its real debrief.
import { expect, type Page } from '@playwright/test'

/** Activate the hero (click) and wait for the SHALL WE PLAY A GAME menu. Uses the
 *  committed testids, never text guesses. */
export async function activate(page: Page): Promise<void> {
  const hero = page.getByTestId('hero-button')
  await expect(hero).toBeVisible()
  await hero.click()
  await expect(page.getByTestId('menu-screen')).toBeVisible()
}

/** Type one command into the shared command input and submit it. Mirrors how the
 *  jsdom tests drive the grammar: set the value, submit the form. */
export async function command(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('command-input')
  await input.fill(text)
  await input.press('Enter')
}

/** Start a mission from the menu by typed-safe control: the menu rows are
 *  buttons; click the row for the mission. Returns once the mission screen is
 *  active. */
export async function startMission(
  page: Page,
  missionId: 'outlook' | 'flights' | 'bank' | 'finale',
): Promise<void> {
  const titles: Record<string, RegExp> = {
    outlook: /CRASH OUTLOOK/,
    flights: /GROUND ALL FLIGHTS/,
    bank: /FREEZE BANK ACCOUNTS/,
    finale: /GLOBAL FAILSAFE/,
  }
  await page.getByRole('menuitem', { name: titles[missionId] }).click()
  await expect(
    page.locator(`[data-testid="screen-root"][data-active-screen="mission:${missionId}"]`),
  ).toBeVisible()
}

/** Read the current displayed remaining countdown seconds, or null if absent. */
export async function remainingSeconds(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="countdown-line"]')
    if (!el) return null
    const text = el.textContent ?? ''
    const m = text.match(/(\d+):(\d+)/)
    if (m) return Number(m[1]) * 60 + Number(m[2])
    const s = text.match(/(\d+)/)
    return s ? Number(s[1]) : null
  })
}

/** Set the controlled clock to an absolute wall-clock ms. page.clock.install
 *  must have run before navigation. */
export async function setClock(page: Page, ms: number): Promise<void> {
  await page.clock.setFixedTime(ms)
}
