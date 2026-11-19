// The router seam for the GLOBAL FAILSAFE ending. The engine settles the finale
// like any mission (phase 'debrief'); ScreenRouter routes a settled, unacknowledged
// finale here instead of the generic DebriefScreen so the climax renders through
// the real router path. This wrapper only lifts the designated field-report id off
// the active seed's finale payload and hands the settled SettledOutcome to the
// EndingScreen. NO engine logic: the ending, readback, and cues are engine- and
// catalog-owned; this renders them.
import type { CampaignState, SettledOutcome } from '@engine'
import { EndingScreen } from './EndingScreen'
import { finalePayload } from './selectors'

export interface FinaleEndingRouteProps {
  readonly state: CampaignState
  /** The settled finale outcome (the pending, unacknowledged debrief). */
  readonly outcome: SettledOutcome
}

export function FinaleEndingRoute({ state, outcome }: FinaleEndingRouteProps) {
  const payload = finalePayload(state)
  // Without a finale payload on the seed the ending cannot name its field
  // report; fall back to the generic debrief frame rather than throwing.
  if (!payload) {
    return (
      <div data-testid="finale-ending-route-missing-payload">
        NO FINALE PAYLOAD
      </div>
    )
  }
  return (
    <EndingScreen
      state={state}
      outcome={outcome}
      fieldReportId={payload.fieldReportId}
    />
  )
}
