// Campaign vocabulary: actions players dispatch, events the engine
// emits, and the settled facts both scoreboards derive from. The
// valibot schema in state.ts is the source of truth for persisted
// shapes; these are the hand-authored unions it composes.
import type { SourceCheckOutcome } from '../records'

export type MissionId = string

export type SettlementCause = 'completed' | 'collapsed' | 'timeout' | 'forfeit'

export type OutcomeTier = 'full' | 'partial' | 'poor' | 'failed'

export type ConsequenceKind =
  | 'commsDelayed'
  | 'flightsDisrupted'
  | 'paymentsDelayed'

export interface Consequence {
  readonly id: string
  readonly kind: ConsequenceKind
  /** Integer magnitude in the kind's smallest unit. */
  readonly magnitude: number
}

export interface SettledOutcome {
  readonly missionId: MissionId
  readonly cause: SettlementCause
  readonly tier: OutcomeTier
  /** Integer service metrics, mission-defined keys. */
  readonly metrics: Record<string, number>
  readonly clueId: string | null
  readonly consequences: Consequence[]
  /** Finale only (amendment 11). */
  readonly endingId?: 'recovery' | 'containment' | 'failure'
}

export interface AppliedMarker {
  readonly consequenceId: string
  readonly targetMissionId: MissionId
}

export interface SourceCheckResult {
  readonly recordId: string
  readonly outcome: SourceCheckOutcome
  readonly resolvedAt: number
  readonly arrivedAfterSettlement: boolean
}

export interface CampaignPreferences {
  readonly extendedTime: boolean
}

// Player-driven actions: commands and buttons both produce these; the
// envelope log of (action, now) pairs is the canonical campaign record.
export type CampaignAction =
  | { readonly type: 'START_MISSION'; readonly missionId: MissionId }
  | { readonly type: 'FORFEIT_MISSION' }
  | { readonly type: 'ACKNOWLEDGE_DEBRIEF'; readonly missionId: MissionId }
  | { readonly type: 'INSPECT_RECORD'; readonly recordId: string }
  | { readonly type: 'REQUEST_SOURCE_CHECK'; readonly recordId: string }
  | {
      readonly type: 'SET_PREFERENCE'
      readonly preference: 'extendedTime'
      readonly value: boolean
    }
  | {
      readonly type: 'NEW_CAMPAIGN'
      readonly seedName: string
      readonly resetPreferences?: boolean
    }
  | {
      readonly type: 'MISSION_ACTION'
      readonly payload: unknown
    }

// The emitted side channel (amendment 1): entries correspond one to one
// with queue deletions and settlement transitions, so exactly-once
// consumption downstream is structural. Replay folds use state only.
export type EngineEvent =
  | { readonly type: 'missionStarted'; readonly missionId: MissionId }
  | {
      readonly type: 'scheduledEventFired'
      readonly id: string
      readonly kind: string
      readonly queue: 'mission' | 'campaign'
    }
  | { readonly type: 'timerMilestone'; readonly id: string }
  | {
      readonly type: 'settlement'
      readonly missionId: MissionId
      readonly cause: SettlementCause
      readonly tier: OutcomeTier
    }
  | {
      readonly type: 'phaseChanged'
      readonly from: CampaignPhase
      readonly to: CampaignPhase
    }
  | {
      readonly type: 'consequenceApplied'
      readonly consequenceId: string
      readonly targetMissionId: MissionId
    }
  | {
      readonly type: 'sourceCheckResolved'
      readonly recordId: string
      readonly outcome: SourceCheckOutcome
      readonly arrivedAfterSettlement: boolean
    }
  | { readonly type: 'debriefAcknowledged'; readonly missionId: MissionId }
  | { readonly type: 'clueFound'; readonly clueId: string }
  | { readonly type: 'finaleFinalPhase' }
  | { readonly type: 'branchRunCompleted'; readonly branch: string }
  | { readonly type: 'campaignReset'; readonly seedName: string }

export type CampaignPhase = 'menu' | 'mission' | 'debrief' | 'finale' | 'ended'

export interface RejectionResult {
  readonly rejected: true
  readonly reason: string
}

export interface DispatchResult<State> {
  readonly state: State
  readonly emitted: readonly EngineEvent[]
  readonly rejection: RejectionResult | null
}
