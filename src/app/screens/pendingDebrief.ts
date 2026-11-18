// The one place that decides which debrief is pending, so the ACKNOWLEDGE
// button (DebriefScreen) and the ACKNOWLEDGE command (ScreenRouter) provably
// target the same mission: the first settled mission not yet acknowledged.
import type { CampaignState, SettledOutcome } from '@engine'

export function pendingDebrief(state: CampaignState): SettledOutcome | null {
  return (
    state.settled.find(
      (s) => !state.acknowledgedDebriefs.includes(s.missionId),
    ) ?? null
  )
}
