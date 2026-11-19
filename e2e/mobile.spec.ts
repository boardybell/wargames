// Mobile (390x844, touch): the hero activates by tap, the menu rows are
// tappable, and the mission screens fall back to their compact single-pane
// layouts so the character map is never required. Runs only on the
// chromium-mobile project.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { activate, startMission } from './helpers/play'

const T0 = 1_700_000_000_000

test.describe('compact mobile layout plays by tap', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
    await page.goto('./')
  })

  test('hero activates by tap and the menu rows are tappable', async ({ page }) => {
    await activate(page)
    await expect(page.getByRole('menuitem', { name: /CRASH OUTLOOK/ })).toBeVisible()
  })

  test('GROUND ALL FLIGHTS renders a single-pane compact flight list', async ({
    page,
  }) => {
    await activate(page)
    await startMission(page, 'flights')
    const screen = page.getByTestId('flights-screen')
    await expect(screen).toHaveAttribute('data-pane', 'single')
    // The compact flight list carries real action rows (no character map needed).
    await expect(page.getByTestId('flight-list-view')).toBeVisible()
  })

  test('FREEZE BANK ACCOUNTS works as a single-pane ledger flow', async ({
    page,
  }) => {
    await activate(page)
    await startMission(page, 'bank')
    await expect(page.getByTestId('bank-screen')).toHaveAttribute(
      'data-pane',
      'single',
    )
    await expect(page.getByTestId('bank-status')).toBeVisible()
  })

  test('settings are reachable on mobile', async ({ page }) => {
    await activate(page)
    const input = page.getByTestId('command-input')
    await input.fill('SETTINGS')
    await input.press('Enter')
    await expect(page.getByTestId('toggle-master')).toBeVisible()
  })
})
