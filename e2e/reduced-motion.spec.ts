// Reduced motion: with prefers-reduced-motion set, activation is an immediate
// reveal (no push-in), the terminal is interactive well under the animation
// budget, and no long-running transform animation exists.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { gotoApp } from './helpers/play'

const T0 = 1_700_000_000_000

test.use({ reducedMotion: 'reduce' })

test.describe('reduced motion replaces the push-in with an immediate reveal', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
  })

  test('activation reveals the menu immediately with no running transform animation', async ({
    page,
  }) => {
    await gotoApp(page)
    const start = Date.now()
    await page.getByTestId('hero-button').click()
    // The menu is interactive well under the 700ms push-in budget.
    await expect(page.getByTestId('menu-screen')).toBeVisible({ timeout: 500 })
    expect(Date.now() - start).toBeLessThan(2_000)

    // No transform (push-in) animation is in flight: reduced motion replaces the
    // dolly push-in with a plain crossfade, so any running animation touches
    // opacity, never transform. A running transform here would mean the push-in
    // ignored the motion preference.
    const runningTransforms = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .filter((a) => {
          const kf = (a.effect as KeyframeEffect)?.getKeyframes?.() ?? []
          const props = new Set<string>()
          for (const frame of kf) {
            for (const key of Object.keys(frame)) props.add(key)
          }
          return props.has('transform')
        }).length,
    )
    expect(runningTransforms).toBe(0)
  })
})
