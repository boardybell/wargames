// GLOBAL FAILSAFE case validation through the real finale screen.
//
// These specs drive the finale the way a real player must: typed verbs and
// on-screen controls only, no direct engine send(). They assert the INTENDED
// puzzle: corroborate the independent observation through the shipped UI, build
// the event-time case, and have VALIDATE certify it (caseValid true). The jsdom
// finale tests reach caseValid by calling the engine REQUEST_SOURCE_CHECK
// directly, which no shipped control dispatches, so they never exercised the real
// corroboration path. This matrix does, and if the path is unreachable the spec
// fails loudly with a screenshot: that is a real integration blocker, not a weak
// assertion, and must be fixed before deploy.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { activate, command, gotoApp, startMission } from './helpers/play'
import { unlockFinale } from './helpers/campaign'

const T0 = 1_700_000_000_000

/** Read caseValid off the persisted save (the save mirrors live substate). */
async function caseValid(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('wargames.save.primary')
    if (!raw) return false
    const s = JSON.parse(raw).state as {
      activeMission?: { substate?: { caseValid?: boolean } }
    }
    return s.activeMission?.substate?.caseValid === true
  })
}

test.describe('finale case validation through the shipped UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
  })

  async function reachLiveFinale(
    page: import('@playwright/test').Page,
  ): Promise<number> {
    await gotoApp(page)
    await activate(page)
    const finaleStart = await unlockFinale(page)
    await page.clock.setFixedTime(finaleStart)
    await startMission(page, 'finale')
    const startBtn = page.getByTestId('finale-start')
    if (await startBtn.count()) await startBtn.click()
    await expect(page.getByTestId('finale-screen')).toBeVisible()
    return finaleStart
  }

  test('corroborating the field report and ordering by event time certifies the case', async ({
    page,
  }) => {
    // FIXED: the finale field-report corroboration is now reachable through the
    // shipped UI. REQUEST FIELD REPORT dispatches the SAME ordered pair the
    // on-screen button raises: the mission flag AND the engine REQUEST_SOURCE_CHECK
    // (finale/verbs.ts makeFieldReportSourceCheckAction) against the designated
    // record, so its reply lands, corroborates the observation, and VALIDATE
    // certifies the case (caseValid true) for a real player.
    test.setTimeout(120_000)
    const finaleStart = await reachLiveFinale(page)

    // Corroborate the independent observation through the shipped control: the
    // REQUEST FIELD REPORT command/button is the only reachable path a player
    // has to the field desk here.
    await command(page, 'REQUEST FIELD REPORT')
    // Let the field-desk reply resolve (R21 desk delay is 45s in seed one), then
    // wake the engine so the reply folds.
    await page.clock.setFixedTime(finaleStart + 60_000)
    await command(page, 'TRACE C17')

    // Build the event-time-ordered case (C17, F06, B04) with the root source and
    // the corroborated observation.
    await command(page, 'SELECT C17 outlook')
    await command(page, 'SELECT F06 flights')
    await command(page, 'SELECT B04 bank')
    await command(page, 'SELECT C17 root')
    await command(page, 'SELECT R21 observation')
    // Claim the event-time ordering through the shipped reorder controls. The
    // three are already selected in event-time order; moving one down then back
    // up records the explicit ordering the validator requires without changing
    // it (C17, F06, B04).
    await command(page, 'MOVE F06 DOWN')
    await command(page, 'MOVE F06 UP')
    await command(page, 'VALIDATE')

    // INTENDED: the case certifies. If this fails, the field-report corroboration
    // is unreachable through the shipped UI (see finale verbs: the field-report
    // source check builder is never dispatched by any control), so caseValid can
    // never become true for a real player. That is a release blocker.
    await expect(page.getByTestId('finale-screen')).toContainText('CASE CERTIFIED')
    // The save mirror is debounced (600ms); advance the controlled clock past it
    // so the persisted substate reflects the certified case before reading it.
    await page.clock.runFor(700)
    expect(await caseValid(page)).toBe(true)
  })

  test('an uncertified case cannot win: a typed COMMIT STAGED must not reach recovery without a certified case', async ({
    page,
  }) => {
    // FIXED: the win gate is now enforced at the ENGINE level, so no input path
    // can bypass it. A STAGED RECOVERY commit is a structured refusal unless the
    // case certified AND the viability predicate stagedEligible uses passes; the
    // engine recomputes viability from the reference settled metrics the action
    // carries, never a trusted boolean. A typed COMMIT STAGED on an uncertified
    // case no longer settles the recovery ending.
    test.setTimeout(120_000)
    const finaleStart = await reachLiveFinale(page)

    // Build the slots but DO NOT corroborate the observation, so the case is not
    // certifiable through the shipped UI.
    await page.clock.setFixedTime(finaleStart + 10_000)
    await command(page, 'SELECT C17 outlook')
    await command(page, 'SELECT F06 flights')
    await command(page, 'SELECT B04 bank')
    await command(page, 'SELECT C17 root')
    await command(page, 'SELECT R21 observation')
    await command(page, 'VALIDATE')
    await command(page, 'RUN COMPARISON')
    expect(await caseValid(page)).toBe(false)

    // The typed COMMIT STAGED routes through the confirmation gate and dispatches.
    await command(page, 'COMMIT STAGED')
    const confirm = page.getByTestId('finale-confirm-yes')
    if (await confirm.count()) await confirm.click()

    // INTENDED: an uncertified case must NOT yield the recovery ending. The win
    // gate (stagedEligible = caseValid AND viability) holds at the ENGINE for the
    // typed path as it does for the disabled button: the engine refuses the
    // ineligible STAGED commit, so the finale never settles and no recovery
    // ending is reached. Assert the finale is still live (never settled) and no
    // recovery ending exists. If this fails, a typed COMMIT STAGED bypassed the
    // gate and won the finale on an unproven case, a release blocker.
    const screen = page.getByTestId('finale-screen')
    await expect(screen).toBeVisible()
    await expect(screen).not.toHaveAttribute('data-settled', 'true')
    await expect(
      page.locator('[data-testid="finale-ending"][data-ending-id="recovery"]'),
    ).toHaveCount(0)
    expect(await caseValid(page)).toBe(false)
  })

  test('a REPEAT commit reaches the failure ending through the real router', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const finaleStart = await reachLiveFinale(page)

    await page.clock.setFixedTime(finaleStart + 10_000)
    await command(page, 'SELECT C17 outlook')
    await command(page, 'SELECT F06 flights')
    await command(page, 'SELECT B04 bank')
    await command(page, 'SELECT C17 root')
    await command(page, 'SELECT R21 observation')
    await command(page, 'VALIDATE')
    await command(page, 'RUN COMPARISON')
    // Taking the WOPR grounding at face value (REPEAT D-83) settles to failure.
    await command(page, 'COMMIT REPEAT')
    const confirm = page.getByTestId('finale-confirm-yes')
    if (await confirm.count()) await confirm.click()
    await expect(page.getByTestId('finale-ending')).toHaveAttribute(
      'data-ending-id',
      'failure',
    )
  })
})
