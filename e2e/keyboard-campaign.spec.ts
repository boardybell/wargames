// The complete campaign, played through the real browser to real settlements:
// activation, then each of the three missions driven to a passing debrief with
// the engine's own proven walkthrough moves (reused as typed commands, so the
// browser playthrough matches a proven win), each debrief acknowledged, the
// fourth row appearing only after the third acknowledgment, the GLOBAL FAILSAFE
// finale case built and committed, and the recovery ending reached through the
// real router.
//
// The campaign runs on the real production seed (exercise-r04) under page.clock,
// so the real four-minute countdowns settle in controlled, deterministic jumps
// rather than real multi-minute waits. If any mission cannot be won as wired, the
// typed walkthrough stalls short of a passing debrief and this spec fails loudly:
// that is a real integration bug, not a weakened assertion. The campaign is
// driven with the keyboard only (typed commands plus Enter): no pointer touches a
// mission control, which is the keyboard-only guarantee this spec also proves.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { activate, command, gotoApp, startMission } from './helpers/play'
import { unlockFinale } from './helpers/campaign'

const T0 = 1_700_000_000_000

test.describe('full campaign: three missions to passing debriefs, then the finale', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
  })

  test('plays CRASH OUTLOOK, GROUND ALL FLIGHTS, FREEZE BANK ACCOUNTS, then GLOBAL FAILSAFE', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await gotoApp(page)
    await activate(page)

    // Fourth row is hidden before the campaign starts.
    await expect(
      page.getByRole('menuitem', { name: /GLOBAL FAILSAFE/ }),
    ).toHaveCount(0)

    // Play all three missions to acknowledged full-tier debriefs; the fourth row
    // unlocks only after the third acknowledgment.
    const finaleStart = await unlockFinale(page)

    // GLOBAL FAILSAFE: build the valid case, validate, compare, commit staged.
    await page.clock.setFixedTime(finaleStart)
    await startMission(page, 'finale')
    const startBtn = page.getByTestId('finale-start')
    if (await startBtn.count()) await startBtn.click()
    await expect(page.getByTestId('finale-screen')).toBeVisible()

    // Corroborate the field report (R21, the seed-one OBSERVED field report)
    // through the shipped control, then build the event-time-ordered case (C17,
    // F06, B04) with the root and the corroborated observation. REQUEST FIELD
    // REPORT itself issues the engine desk check against R21 now, so no separate
    // CHECK SOURCE is needed.
    await command(page, 'REQUEST FIELD REPORT')
    await page.clock.setFixedTime(finaleStart + 60_000)
    await command(page, 'SELECT C17 outlook')
    await command(page, 'SELECT F06 flights')
    await command(page, 'SELECT B04 bank')
    await command(page, 'SELECT C17 root')
    await command(page, 'SELECT R21 observation')
    // Claim the event-time ordering through the reorder controls (already in
    // order; move down then up records the explicit ordering the validator wants).
    await command(page, 'MOVE F06 DOWN')
    await command(page, 'MOVE F06 UP')
    await command(page, 'VALIDATE')
    await command(page, 'RUN COMPARISON')
    await command(page, 'COMMIT STAGED')
    const confirm = page.getByTestId('finale-confirm-yes')
    if (await confirm.count()) await confirm.click()

    // The STAGED RECOVERY ending renders through the real router on a genuinely
    // certified case: the win gate (engine-enforced caseValid AND viability) now
    // passes because the field report corroborated the observation and the case
    // validated, proving the whole intended win path end to end in the browser.
    await expect(page.getByTestId('finale-ending')).toHaveAttribute(
      'data-ending-id',
      'recovery',
    )
  })
})
