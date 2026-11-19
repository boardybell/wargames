// Shared campaign drive: play the three missions to acknowledged full-tier
// debriefs so the GLOBAL FAILSAFE fourth row unlocks, all through the real
// browser with page.clock pacing the real countdowns. Both keyboard-campaign and
// finale-validation reach the finale this way, each move a proven engine
// walkthrough step reused as a typed command.
import { expect, type Page } from '@playwright/test'
import type { CampaignAction } from '@engine'
import { command, startMission } from './play'
import { walkthroughFor } from '../../test/engine/missions/flights/fixtures'
import { bankWalkthroughFor } from '../../test/engine/missions/bank/fixtures'
import { outlookWalkthroughEnvelopes } from '../../test/engine/missions/outlook/fixtures'
import { envelopesToCommands } from './commands'

export const CAMPAIGN_T0 = 1_700_000_000_000
const MISSION_MS = 240_000
const SEED = 'exercise-r04'

type Env = [CampaignAction, number]

/** Drive one mission's proven walkthrough as typed commands over the controlled
 *  clock, settle past the deadline, assert a full-tier debrief, and acknowledge. */
export async function playMission(
  page: Page,
  missionId: 'outlook' | 'flights' | 'bank',
  envelopes: Env[],
  missionStart: number,
): Promise<void> {
  const fixtureT0 = envelopes[0]![1]
  const { commands } = envelopesToCommands(envelopes)
  await page.clock.setFixedTime(missionStart)
  await startMission(page, missionId)
  for (const cmd of commands) {
    await page.clock.setFixedTime(missionStart + (cmd.at - fixtureT0))
    await command(page, cmd.text)
  }
  await page.clock.setFixedTime(missionStart + MISSION_MS + 2_000)
  await command(page, 'TRACE C17')
  const debrief = page.getByTestId('debrief-screen')
  await expect(debrief).toBeVisible()
  await expect(debrief).toHaveAttribute('data-mission-id', missionId)
  await expect(debrief).toContainText('TIER FULL')
  await command(page, 'ACKNOWLEDGE')
  await expect(page.getByTestId('menu-screen')).toBeVisible()
}

/** Play all three missions so the GLOBAL FAILSAFE row unlocks. Returns the wall
 *  clock the finale should start at. */
export async function unlockFinale(page: Page): Promise<number> {
  await playMission(
    page,
    'outlook',
    outlookWalkthroughEnvelopes(1_000_000),
    CAMPAIGN_T0 + 1_000,
  )
  await playMission(page, 'flights', walkthroughFor(SEED, 1_000_000), CAMPAIGN_T0 + 300_000)
  await playMission(page, 'bank', bankWalkthroughFor(SEED, 1_000_000), CAMPAIGN_T0 + 600_000)
  await expect(
    page.getByRole('menuitem', { name: /GLOBAL FAILSAFE/ }),
  ).toBeVisible()
  return CAMPAIGN_T0 + 900_000
}
