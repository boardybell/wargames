// The glossary primitive, exercised through the real browser: a registered term
// shows its plain-language definition on hover and on keyboard focus, and Escape
// closes it. Terms appear in the cabinet readouts and mission screens; this spec
// drives one that is present once a mission is active.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'
import { activate, gotoApp, startMission } from './helpers/play'

const T0 = 1_700_000_000_000

test.describe('glossary definitions open on hover and focus, close on Escape', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: T0 })
    await clearSaves(page)
    await gotoApp(page)
    await activate(page)
    // The bank status block renders visible glossary terms (CASH, CONFIDENCE,
    // FLOOR) in its always-present readout.
    await startMission(page, 'bank')
  })

  /** The first glossary term that is actually visible on screen (the finale keeps
   *  a hidden glossary anchor; mission chrome renders visible ones). */
  function visibleTerm(page: import('@playwright/test').Page) {
    return page
      .getByTestId('glossary-term')
      .filter({ visible: true })
      .first()
  }

  test('hover opens a definition popup', async ({ page }) => {
    const term = visibleTerm(page)
    await expect(term).toBeVisible()
    await term.hover()
    await expect(page.getByTestId('glossary-popup')).toBeVisible()
  })

  test('keyboard focus opens the popup and Escape closes it', async ({ page }) => {
    const term = visibleTerm(page)
    await term.focus()
    await expect(term).toBeFocused()
    const popup = page.getByTestId('glossary-popup')
    await expect(popup).toBeVisible()
    // Escape closes the definition popup (the glossary contract).
    //
    // Known minor interaction overlap (reported, not gated here): the glossary
    // term's Escape handler runs in the bubble phase, but the ScreenRouter opens
    // the mission pause dialog from a CAPTURE-phase Escape that fires first, so
    // during a mission an Escape on a term also opens the pause dialog and moves
    // focus. Outside a mission the term retains focus. This spec asserts the
    // popup-close contract, which holds in both contexts.
    await page.keyboard.press('Escape')
    await expect(popup).toBeHidden()
  })
})
