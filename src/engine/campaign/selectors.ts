// Pure selectors over one state: WOPR's tally and the real service
// outcomes diverge by construction because they read the same facts
// with different values. The divergence is the game's thesis.
import { corroborationValue } from '../records'
import type { CampaignState } from './state'
import type { MissionId } from './types'

/** WOPR counts forced inactivity as resolution: settled missions and
 *  the standing exceptions they closed. Mission modules express their
 *  forced-inactivity facts through the wopr_resolved metric. */
export function selectOpenExceptions(state: CampaignState): number {
  let open = state.openExceptionsBaseline
  for (const outcome of state.settled) {
    open -= outcome.metrics['wopr_resolved'] ?? 0
  }
  // Clamp at zero (mirrors runBranch.ts computeViability's projection clamp):
  // the aggregate wopr_resolved can exceed the seed baseline, and a negative
  // OPEN EXCEPTIONS is a broken HUD, not a better WOPR deception number.
  return Math.max(0, open)
}

/** The settled record a reselected menu row displays. */
export function selectSettledOutcome(
  state: CampaignState,
  missionId: string,
) {
  return state.settled.find((s) => s.missionId === missionId) ?? null
}

/** Per-mission settled metrics for the finale's projections and the
 *  earned-why readback (amendment 4). Null when the mission has not
 *  settled; the returned record is the outcome's own metrics object. */
export function selectSettledMetrics(
  state: CampaignState,
  missionId: string,
): Readonly<Record<string, number>> | null {
  return state.settled.find((s) => s.missionId === missionId)?.metrics ?? null
}

/** Real service outcomes: integer damage the same orders produced.
 *  Mission modules express them through the service_cost metric. */
export function selectServiceOutcomes(state: CampaignState): number {
  let cost = 0
  for (const outcome of state.settled) {
    cost += outcome.metrics['service_cost'] ?? 0
  }
  return cost
}

export interface MenuRow {
  readonly missionId: MissionId
  readonly settled: boolean
  readonly acknowledged: boolean
}

export function selectMenuRows(
  state: CampaignState,
  missionOrder: readonly MissionId[],
  finaleId: MissionId,
): { rows: MenuRow[]; finaleUnlocked: boolean } {
  const rows = missionOrder.map((missionId) => ({
    missionId,
    settled: state.settled.some((s) => s.missionId === missionId),
    acknowledged: state.acknowledgedDebriefs.includes(missionId),
  }))
  const finaleUnlocked = missionOrder.every((missionId) =>
    state.acknowledgedDebriefs.includes(missionId),
  )
  return {
    rows: finaleUnlocked
      ? [...rows, { missionId: finaleId, settled: false, acknowledged: false }]
      : rows,
    finaleUnlocked,
  }
}

/** Corroboration earned for a record from completed source checks. */
export function selectCorroboration(
  state: CampaignState,
  recordId: string,
): number {
  return state.sourceChecks
    .filter((check) => check.recordId === recordId)
    .reduce((sum, check) => sum + corroborationValue(check.outcome), 0)
}

export function selectCampaignBegun(state: CampaignState): boolean {
  return state.startedMissionIds.length > 0
}
