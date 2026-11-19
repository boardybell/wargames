// Expired session: a mission whose deadline passed while the tab was away
// settles exactly once on arrival. The debrief renders, the outcome records a
// single settlement, and a second reload after settlement changes nothing
// (settlement permanence through the browser).
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { activate, gotoApp, startMission } from './helpers/play'

const T0 = 1_700_000_000_000

test.describe('an expired deadline settles once on arrival', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
  })

  test('arrival settles the mission to a single debrief, permanent across reload', async ({
    page,
  }) => {
    await gotoApp(page)
    await activate(page)
    await startMission(page, 'outlook')
    // Record the started mission into the save (START flushes immediately).

    // The tab goes away and the deadline passes: jump the clock far past the
    // 240s deadline, then reload. Boot's arrival wake settles the mission once.
    await page.clock.setFixedTime(T0 + 600_000)
    await page.reload()

    const debrief = page.getByTestId('debrief-screen')
    await expect(debrief).toBeVisible()
    await expect(debrief).toHaveAttribute('data-mission-id', 'outlook')
    // An abandoned mission settles on timeout, which the debrief reflects (not a
    // full tier).
    await expect(debrief).not.toContainText('TIER FULL')

    // The settled set carries exactly one outlook outcome.
    const settledCount = await page.evaluate(() => {
      const raw = window.localStorage.getItem('wargames.save.primary')
      if (!raw) return -1
      const parsed = JSON.parse(raw) as {
        state: { settled: Array<{ missionId: string }> }
      }
      return parsed.state.settled.filter((s) => s.missionId === 'outlook').length
    })
    expect(settledCount).toBe(1)

    // A second reload after settlement changes nothing: still exactly one.
    await page.clock.setFixedTime(T0 + 700_000)
    await page.reload()
    await expect(page.getByTestId('debrief-screen')).toBeVisible()
    const settledCount2 = await page.evaluate(() => {
      const raw = window.localStorage.getItem('wargames.save.primary')
      const parsed = JSON.parse(raw!) as {
        state: { settled: Array<{ missionId: string }> }
      }
      return parsed.state.settled.filter((s) => s.missionId === 'outlook').length
    })
    expect(settledCount2).toBe(1)
  })
})
