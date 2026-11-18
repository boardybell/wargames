// The initial-screen decision. The engine load result decides whether the
// hero appears; the shell never guesses game state. A mid-engagement save
// (a mission in progress, a debrief pending, the finale running) skips the
// hero and goes straight to the engine-driven screen, so a returning player is
// never greeted with the opening scene over an in-progress campaign. A fresh
// campaign or a menu-phase save shows the hero; activation lands on the menu
// with all campaign state intact.
import type { CampaignState } from '@engine'

export type InitialScreen = 'hero' | 'engine'

export function decideInitialScreen(state: CampaignState | null): InitialScreen {
  if (!state) return 'hero'
  // Only a fresh or menu-phase save shows the hero. Everything mid or
  // post engagement (mission, debrief, finale, ended) resumes the
  // engine-driven screen, so a returning player is never re-greeted with the
  // opening scene over an existing campaign.
  return state.phase === 'menu' ? 'hero' : 'engine'
}
