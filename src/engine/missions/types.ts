// The mission-module seam. Section 05 needs the shape to route
// dispatch; section 06 builds the lifecycle depth and the permanent
// test double on top of exactly this interface. Section 07 tightens
// SeedDefinition's payload typing per mission.
import type { GenericSchema } from 'valibot'
import type { EvidenceRecord, SourceCheckOutcome } from '../records'
import type { ScheduledEventSpec } from '../time'
import type {
  Consequence,
  MissionId,
  SettledOutcome,
  SettlementCause,
} from '../campaign/types'

export interface DeskCheckEntry {
  readonly recordId: string
  readonly outcome: SourceCheckOutcome
  readonly delaySeconds: number
  readonly replyBody: readonly string[]
}

export interface ClueRecordEntry {
  readonly recordId: string
  readonly clueId: string
}

export interface SeedDefinition {
  readonly name: string
  readonly description: string
  readonly seedNumber: number
  readonly exerciseRunId: string
  readonly records: readonly EvidenceRecord[]
  readonly deskChecks: readonly DeskCheckEntry[]
  readonly clueRecords: readonly ClueRecordEntry[]
  /** Opaque per-mission payloads; mission splits narrow their own. */
  readonly missionPayloads: Readonly<Record<MissionId, unknown>>
  readonly schedules: Readonly<Record<MissionId, readonly ScheduledEventSpec[]>>
  readonly missionDurationsMs: Readonly<Record<MissionId, number>>
  /** Starting OPEN EXCEPTIONS tally WOPR displays; forced-inactivity
   *  resolutions subtract from it. */
  readonly openExceptionsBaseline: number
}

export interface FoldedConsequences {
  /** Aggregate magnitude per kind after canonical folding and the
   *  per-kind cap, integers. */
  readonly byKind: Readonly<Record<string, number>>
}

export interface MissionEvent {
  readonly type: 'action' | 'scheduled'
  readonly id: string
  readonly kind: string
  readonly payload: unknown
  readonly now: number
}

export type Validity =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string }

export interface MissionModule<S = unknown> {
  readonly id: MissionId
  init(
    seed: SeedDefinition,
    consequences: FoldedConsequences,
    durationMs: number,
  ): S
  validate(state: S, payload: unknown): Validity
  reduce(state: S, event: MissionEvent): S
  evaluate(state: S, cause: SettlementCause): SettledOutcome
  /** Amendment 7: polled after every reduce and drain; non-null
   *  settles immediately with that cause. */
  terminal?(state: S): 'completed' | 'collapsed' | null
  /** Amendment 6: polled after every reduce; new ids merge
   *  monotonically into cluesFound with clueFound events. */
  clues?(state: S): readonly string[]
  /** Consequences this mission emits are carried on its
   *  SettledOutcome; evaluate() authors them. */
  readonly saveSchema: GenericSchema<S>
}

export type MissionRegistry = Readonly<Record<MissionId, MissionModule>>

export type { Consequence }
