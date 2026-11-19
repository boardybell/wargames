// Sound: the game starts muted behind a user-activation gate with a diegetic
// ENABLE SOUND? prompt; answering it flips the master preference; the settings
// switch reflects the state. Audible output is a manual device pass out of scope;
// this spec automates muted startup, the unlock, and the settings reflection.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { activate, command, gotoApp } from './helpers/play'

const T0 = 1_700_000_000_000

test.describe('muted startup and the ENABLE SOUND gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
  })

  test('fresh activation shows the diegetic ENABLE SOUND prompt and starts muted', async ({
    page,
  }) => {
    await gotoApp(page)
    await activate(page)
    // The prompt is diegetic terminal copy, shown once on a fresh campaign.
    await expect(page.getByTestId('sound-prompt')).toBeVisible()
    await expect(page.getByTestId('sound-prompt')).toContainText('ENABLE SOUND?')
    // No sound preference recorded yet, or recorded muted: muted default.
    const muted = await page.evaluate(() => {
      const raw = window.localStorage.getItem('wargames.audio.prefs')
      if (!raw) return true
      try {
        return JSON.parse(raw).master !== true
      } catch {
        return true
      }
    })
    expect(muted).toBe(true)
  })

  test('answering the prompt enables audio, reflected in settings', async ({
    page,
  }) => {
    await gotoApp(page)
    await activate(page)
    await page.getByTestId('sound-yes').click()
    // Open settings and confirm the master sound switch now reads on.
    await command(page, 'SETTINGS')
    const master = page.getByTestId('toggle-master')
    await expect(master).toBeVisible()
    await expect(master).toBeChecked()
  })
})
