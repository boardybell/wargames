// localStorage setup that runs in the page BEFORE any app code. The matrix
// drives every playthrough live through the real UI over a controlled clock, so
// the only injection it needs is a one-time save clear for a clean first boot;
// reloads within a spec must keep the save the app just wrote.
import type { Page } from '@playwright/test'

/** Clear both save slots on the FIRST navigation only, so a later reload within
 *  the same spec resumes the save the app just wrote rather than wiping it. A
 *  sessionStorage guard (which survives reloads but not a fresh context) marks
 *  that the one-time clear already ran. */
export async function clearSaves(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      if (!window.sessionStorage.getItem('__e2e_cleared__')) {
        window.localStorage.clear()
        window.sessionStorage.setItem('__e2e_cleared__', '1')
      }
    } catch {
      // best effort
    }
  })
}
