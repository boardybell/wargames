// Reload-resume: a mission in progress survives a reload. The mission screen is
// restored directly (no hero), the timer shows less than the full duration and
// keeps counting down. A reload at the settled menu, by the fresh-visit rule,
// shows the hero again, and activation returns to a menu that still reflects the
// settled state.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { activate, command, gotoApp, startMission } from './helpers/play'

const T0 = 1_700_000_000_000

/** Read the outlook countdown as whole seconds from its dot-matrix digits. */
async function outlookRemaining(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="outlook-countdown"]')
    const text = el?.textContent ?? ''
    const m = text.match(/(\d+):(\d+)/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
  })
}

test.describe('reload mid-mission restores the live mission', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
  })

  test('a mid-mission reload reopens the mission screen with a smaller, still-counting timer', async ({
    page,
  }) => {
    await gotoApp(page)
    await activate(page)
    await startMission(page, 'outlook')
    // Let a chunk of the deadline elapse, then nudge the engine so the save
    // records the advanced clock.
    await page.clock.setFixedTime(T0 + 60_000)
    await command(page, 'TRACE C17')

    // Reload: the clock persists across navigation, so the restored save resumes
    // mid-mission rather than booting the hero.
    await page.reload()
    await expect(page.getByTestId('hero-button')).toHaveCount(0)
    await expect(
      page.locator('[data-testid="screen-root"][data-active-screen="mission:outlook"]'),
    ).toBeVisible()

    // The timer shows less than the full 240s and within tolerance of expected
    // (about 180s remaining after 60s elapsed).
    const remaining = await outlookRemaining(page)
    expect(remaining).toBeGreaterThan(150)
    expect(remaining).toBeLessThan(200)

    // It keeps counting down: step the engine clock forward through a real send,
    // which recaptures the display clock at the later wall time, so the rendered
    // remaining strictly decreases.
    await page.clock.setFixedTime(T0 + 120_000)
    await command(page, 'TRACE F06')
    await expect
      .poll(async () => outlookRemaining(page))
      .toBeLessThan(remaining)
  })
})
