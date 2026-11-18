// Read-only selectors over the active campaign for the CRASH OUTLOOK screen.
// Authored message truth (bodies, subjects, sender lines) lives in the
// immutable seed payload; marks and send records live in the mission
// substate. These pull both from the running context and state so the views
// render whatever payload is active, never a hardcoded one.
import type { CampaignState } from '@engine'
import { getContext } from '../../state'
import type { OutlookPayload } from '@engine/missions/outlook/content'
import type { OutlookState } from '@engine/missions/outlook/types'
import type { MissionModule } from '@engine'

const OUTLOOK = 'outlook'

/** The immutable authored payload for the active outlook mission, or
 *  undefined when no outlook payload is present on the active seed. Callers
 *  guard the undefined case; nothing here lies about nullability with a cast. */
export function outlookPayload(state: CampaignState): OutlookPayload | undefined {
  const seed = getContext().seeds[state.seedName]
  return seed?.missionPayloads[OUTLOOK] as OutlookPayload | undefined
}

/** The live outlook substate, or null before the mission starts. */
export function outlookSubstate(state: CampaignState): OutlookState | null {
  if (state.activeMission?.missionId !== OUTLOOK) return null
  return (state.activeMission.substate as OutlookState) ?? null
}

/** The outlook mission module from the context: its validate() is the single
 *  source of truth for whether an action is currently legal. */
export function outlookModule(): MissionModule<OutlookState> {
  return getContext().missions[OUTLOOK] as MissionModule<OutlookState>
}

export type StageLabel = 'FULL' | 'SLOWED' | 'DARK'

export function stageLabel(stage: number): StageLabel {
  if (stage === 2) return 'DARK'
  if (stage === 1) return 'SLOWED'
  return 'FULL'
}

/** The current primary ETA in whole seconds, or null when the primary is
 *  dark. Read from the authored tuning, never computed locally. */
export function primaryEtaSeconds(
  payload: OutlookPayload,
  stage: number,
): number | null {
  if (stage === 2) return null
  const index = stage === 1 ? 1 : 0
  return payload.channelTuning.primaryEtaSeconds[index]
}

export function backupEtaSeconds(payload: OutlookPayload): number {
  return payload.channelTuning.backupEtaSeconds
}
