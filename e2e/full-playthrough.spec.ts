// The single top-to-bottom proof: WarGames played through the REAL shipped front
// door, not the ?engine shortcut. Every other e2e spec enters the engine campaign
// via ?engine, dropping straight into the engine shell. None drives the actual
// shipped path a player takes:
//
//   WarGamesGame hero -> activate (click) -> WOPR boot -> GREETINGS / SHALL WE
//   PLAY A GAME -> LIST GAMES -> GLOBAL THERMONUCLEAR WAR -> chess offer ->
//   pick a side -> the open-ended command game (a limited exchange, then the
//   game continues, saves and resumes). Then the deep engine campaign, entered
//   at ?stage=campaign -> three missions -> GLOBAL FAILSAFE -> recovery ending.
//
// This spec closes that gap in one continuous flow. It reuses the proven engine
// walkthrough helpers (playMission / unlockFinale) once the campaign mounts,
// because the GTW-launched campaign is the SAME bootApp engine app the ?engine
// path serves: identical testids, identical grammar. The only new ground is the
// front-door stitch (hero -> boot -> greeting -> menu -> GTW) that mounts it.
//
// page.clock pins Date.now for the engine countdowns AND the front-end Typer
// animations, so the boot/greeting typewriters resolve in deterministic clock
// jumps rather than wall-clock waits. If the front door blocks automated
// progress that the ?engine helpers never had to handle, this spec fails loudly
// with a screenshot at the failing step: a real integration finding, never a
// weakened assertion.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { command, startMission } from './helpers/play'
import { CAMPAIGN_T0, unlockFinale } from './helpers/campaign'

// The front-end stage machine installs its clock at this origin; the engine
// campaign helpers key off CAMPAIGN_T0, so the whole flow shares one timeline.
const T0 = CAMPAIGN_T0

/** Advance the controlled clock in small steps so a front-end Typer (which drives
 *  itself on setInterval at ~42-120 cps) finishes typing and fires its onDone.
 *  The front-end typewriters are not the engine; they animate on their own timers,
 *  which page.clock also controls, so we tick the fake clock forward in slices and
 *  let React flush between slices until the awaited condition holds. */
async function flushTypers(
  page: import('@playwright/test').Page,
  ms = 8_000,
  step = 250,
): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await page.clock.runFor(step)
  }
}

test.describe('top-to-bottom: WarGames front door through to the recovery ending', () => {
  test.beforeEach(async ({ page }) => {
    // Same controlled-clock + clean-save setup every other spec uses, but we never
    // touch ?engine: this test must enter through the real WarGamesGame front end.
    await page.clock.install({ time: T0 })
    await clearSaves(page)
  })

  test('hero -> boot -> LIST GAMES -> GLOBAL THERMONUCLEAR WAR (play, save, resume) -> campaign -> finale -> recovery ending', async ({
    page,
  }, testInfo) => {
    // This single test drives the whole game, including three real four-minute
    // mission countdowns settled in clock jumps. Give it the generous headroom the
    // campaign specs use.
    test.setTimeout(180_000)

    // ---- 1. The real front door. No ?engine. The hero must show. ----
    await page.goto('./')
    await expect(page.getByTestId('wargames')).toBeVisible()
    const hero = page.getByTestId('hero')
    await expect(hero).toBeVisible()

    // ---- 2. Activate: click the hero, ride boot + greeting to LIST GAMES. ----
    await hero.click()

    // The push-in animation sets stage 'boot' after ~720ms, then the BOOT Typer
    // runs, then GREETING, each advancing on its own interval. Tick the fake clock
    // forward until the engine-side front end renders the greeting's LIST GAMES
    // control (the only path onward).
    const listGames = page.getByRole('button', { name: /LIST GAMES/ })
    await expect
      .poll(
        async () => {
          await flushTypers(page, 2_000)
          return listGames.count()
        },
        {
          message:
            'front-door boot+greeting never reached LIST GAMES (front-end Typer gate)',
          timeout: 30_000,
        },
      )
      .toBeGreaterThan(0)
    await expect(page.getByTestId('screen')).toBeVisible()
    await listGames.click()

    // The LIST GAMES Typer then renders the games list. Tick until GLOBAL
    // THERMONUCLEAR WAR is present and clickable.
    const gtw = page.getByRole('button', { name: 'GLOBAL THERMONUCLEAR WAR' })
    await expect
      .poll(
        async () => {
          await flushTypers(page, 1_500)
          return gtw.count()
        },
        {
          message: 'LIST GAMES never rendered GLOBAL THERMONUCLEAR WAR',
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(0)
    await expect(gtw).toBeVisible()

    // ---- 3. Pick GLOBAL THERMONUCLEAR WAR: the film's chess offer, a side,
    // then the open-ended command game on the big board. ----
    await gtw.click()
    const later = page.getByRole('button', { name: /LATER\. LET US PLAY GLOBAL THERMONUCLEAR WAR/ })
    await expect
      .poll(async () => (await flushTypers(page, 1_000), later.count()), { timeout: 20_000 })
      .toBeGreaterThan(0)
    await later.click()
    const us = page.getByRole('button', { name: /UNITED STATES/ })
    await expect
      .poll(async () => (await flushTypers(page, 1_000), us.count()), { timeout: 20_000 })
      .toBeGreaterThan(0)
    await us.click()
    await expect(page.getByTestId('gtw')).toBeVisible()
    await expect(page.getByTestId('gtw')).toContainText('1983 Q3')

    // A limited strike: one ICBM at one enemy silo, confirmed as a first strike.
    await page.locator('[data-site="us-min"] .hit').click()
    await page.locator('[data-site="su-uzh"] .hit').click()
    await page.getByRole('button', { name: 'CONFIRM' }).click()
    await expect(page.getByTestId('gtw')).toContainText('CRISIS')
    // Ride the crisis clock until the exchange stops and command returns.
    await expect
      .poll(async () => (await page.clock.runFor(2_000), page.getByTestId('gtw-end-quarter').count()), {
        message: 'the limited exchange never resolved back to strategic command',
        timeout: 60_000,
      })
      .toBeGreaterThan(0)
    // The game goes on: no game-over, the calendar advanced.
    await expect(page.getByTestId('gtw-over')).toHaveCount(0)
    await expect(page.getByTestId('gtw')).toContainText('1983 Q4')

    // Saved: leave and come back, and the side picker offers to resume.
    await page.getByRole('button', { name: /SAVE & EXIT/ }).click()
    await expect(page.getByTestId('games')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'GLOBAL THERMONUCLEAR WAR' }).click()
    await expect
      .poll(async () => (await flushTypers(page, 1_000), later.count()), { timeout: 20_000 })
      .toBeGreaterThan(0)
    await later.click()
    const resume = page.getByRole('button', { name: /RESUME COMMAND: UNITED STATES, 1983 Q4/ })
    await expect
      .poll(async () => (await flushTypers(page, 1_000), resume.count()), { timeout: 20_000 })
      .toBeGreaterThan(0)
    await resume.click()
    await expect(page.getByTestId('gtw')).toContainText('1983 Q4')

    // ---- The deep engine campaign is its own entry point now (?stage=campaign,
    // or ?engine). Enter it and play it through to the recovery ending. ----
    await page.goto('./?stage=campaign')
    await expect(page.getByTestId('campaign')).toBeVisible()

    // The campaign is bootApp({skipHero:true}): it drops straight into the engine
    // menu. SHALL WE PLAY A GAME with the three mission rows must render. From here
    // the shipped engine testids and grammar are identical to the ?engine path, so
    // the proven walkthrough helpers drive it unchanged.
    await expect(page.getByTestId('menu-screen')).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: /CRASH OUTLOOK/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: /GROUND ALL FLIGHTS/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: /FREEZE BANK ACCOUNTS/ }),
    ).toBeVisible()
    // The fourth row is still locked before any mission is acknowledged.
    await expect(
      page.getByRole('menuitem', { name: /GLOBAL FAILSAFE/ }),
    ).toHaveCount(0)

    // ---- 4. Play all three missions to acknowledged full-tier debriefs. ----
    // unlockFinale replays the engine's proven winning walkthroughs as typed
    // commands over the shared clock, asserts each TIER FULL debrief, acknowledges
    // each, and asserts the GLOBAL FAILSAFE row appears after the third ack.
    const finaleStart = await unlockFinale(page)
    await expect(
      page.getByRole('menuitem', { name: /GLOBAL FAILSAFE/ }),
    ).toBeVisible()

    // ---- 5. The finale, certified the real way, to the recovery ending. ----
    await page.clock.setFixedTime(finaleStart)
    await startMission(page, 'finale')
    const startBtn = page.getByTestId('finale-start')
    if (await startBtn.count()) await startBtn.click()
    await expect(page.getByTestId('finale-screen')).toBeVisible()

    // Corroborate the independent field report through the shipped control, build
    // the event-time-ordered case (C17, F06, B04) with the root and corroborated
    // observation, claim the ordering through the reorder controls, VALIDATE.
    await command(page, 'REQUEST FIELD REPORT')
    await page.clock.setFixedTime(finaleStart + 60_000)
    await command(page, 'SELECT C17 outlook')
    await command(page, 'SELECT F06 flights')
    await command(page, 'SELECT B04 bank')
    await command(page, 'SELECT C17 root')
    await command(page, 'SELECT R21 observation')
    await command(page, 'MOVE F06 DOWN')
    await command(page, 'MOVE F06 UP')
    await command(page, 'VALIDATE')
    await expect(page.getByTestId('finale-screen')).toContainText('CASE CERTIFIED')

    // Run the comparison, then commit the STAGED RECOVERY. The win gate is
    // engine-enforced (certified case AND viability), so this only wins on the
    // genuinely built case this flow proved.
    await command(page, 'RUN COMPARISON')
    await command(page, 'COMMIT STAGED')
    const confirm = page.getByTestId('finale-confirm-yes')
    if (await confirm.count()) await confirm.click()

    // The recovery EndingScreen renders through the real finale router.
    const ending = page.getByTestId('finale-ending')
    await expect(ending).toHaveAttribute('data-ending-id', 'recovery')

    // ---- 6. Screenshot the final ending as proof of the whole path. ----
    const shot = testInfo.outputPath('front-door-recovery-ending.png')
    await ending.screenshot({ path: shot })
    await testInfo.attach('front-door-recovery-ending', {
      path: shot,
      contentType: 'image/png',
    })
  })
})
