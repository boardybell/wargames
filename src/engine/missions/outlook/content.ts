// The payload shape the three CRASH OUTLOOK seeds must satisfy. Only the
// TYPE lives here so the module compiles standalone; the content
// validator functions and the authored payloads are section 02's job.
// Desk-check outcomes deliberately do NOT live here. They stay in the
// shared SeedDefinition.deskChecks table keyed by record id.
import type { OutcomeTier } from '../../campaign/types'
import type { OutlookMessage } from './types'

/** Channel tuning. Every value is an integer: a capacity count, or an ETA
 *  in whole seconds. Primary ETA is indexed by the live stage (0 full, 1
 *  slowed); a dark primary (stage 2) has no ETA because it rejects. */
export interface ChannelTuning {
  /** Backup capacity. Five sends total. */
  readonly backupCapacity: number
  /** Primary acknowledgment ETA, seconds, at stage 0 and stage 1. */
  readonly primaryEtaSeconds: readonly [number, number]
  /** Backup acknowledgment ETA, seconds. Constant across stages. */
  readonly backupEtaSeconds: number
}

/** One authored stage-change milestone: the second offset from mission
 *  start at which the primary degrades, the uppercase warning line the
 *  shell announces, and the falling-tone cue id the shell plays. */
export interface StageChange {
  /** Seconds from mission start. Scales proportionally under extended
   *  time (start-anchored). Integer. */
  readonly offsetSeconds: number
  /** Player-facing warning copy, uppercase terminal diction. */
  readonly warningLine: string
  /** Audio cue id for the falling tone. */
  readonly cueId: string
}

/** A late warning milestone, authored as whole seconds before endsAt
 *  (end-anchored, never scales). */
export interface WarningOffset {
  /** Seconds before endsAt. Integer. */
  readonly secondsBeforeEnd: number
  readonly warningLine: string
  readonly cueId: string
}

/** The consequence table: a satisfied-delivery tier maps to the integer
 *  commsDelayed magnitude the mission emits when it falls short. */
export type CommsDelayedTable = Readonly<Record<OutcomeTier, number>>

export interface OutlookPayload {
  /** The twelve messages, ids M01..M12. */
  readonly messages: readonly OutlookMessage[]
  readonly channelTuning: ChannelTuning
  /** Three stage changes, authored in the order the primary degrades. */
  readonly stageChanges: readonly [StageChange, StageChange, StageChange]
  /** The 30-second and 10-second warnings before endsAt. */
  readonly warningOffsets: readonly [WarningOffset, WarningOffset]
  readonly commsDelayedTable: CommsDelayedTable
}
