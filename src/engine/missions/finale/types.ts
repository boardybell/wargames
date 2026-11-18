// GLOBAL FAILSAFE finale substate and its reference-only save schema. The
// one discipline this file enforces structurally: the persisted substate
// carries record ids, typed codes, booleans, and integer counters only.
// Authored copy (record bodies, rejection line text, ending readbacks) lives
// in the seed payload and the section-03 catalog, never in a save. The case
// file (records, checks, clues, highlights) is campaign state read through
// selectors and is never copied into FinaleState. The comparison snapshot is
// engine-owned and lives outside mission substate entirely; nothing here
// references it. If a test can smuggle an authored string into a parsed
// substate, this schema is wrong.
import * as v from 'valibot'
import type { RecordGraph } from '../../records'
import type { SourceCheckOutcome } from '../../records'

const integer = v.pipe(v.number(), v.integer())

/** The five case slots. The three subsystem slots reorder; the root and
 *  observation slots expose no ordering. One source of truth shared by
 *  caseBuilder, module, the section-03 catalog, and the section-04 screens. */
export type FinaleSlot =
  | 'outlook'
  | 'flights'
  | 'bank'
  | 'root'
  | 'observation'

export const FINALE_SLOTS: readonly FinaleSlot[] = [
  'outlook',
  'flights',
  'bank',
  'root',
  'observation',
]

/** The three subsystem slots the event-time ordering applies to, in no
 *  particular order; validation sorts by true event time, not this list. */
export const SUBSYSTEM_SLOTS: readonly FinaleSlot[] = [
  'outlook',
  'flights',
  'bank',
]

/** Five stable rejection codes, one per Joshua rejection line family
 *  (section 03 maps each to an authored line; section 04 renders the slot
 *  highlight). The codes are the contract; no text lives here. */
export type RejectionCode =
  | 'receipt-order'
  | 'unrelated-source'
  | 'derived-not-independent'
  | 'wrong-root'
  | 'incomplete'

export const REJECTION_CODES: readonly RejectionCode[] = [
  'receipt-order',
  'unrelated-source',
  'derived-not-independent',
  'wrong-root',
  'incomplete',
]

/** The three commit choices. staged and hold settle completed; repeat
 *  settles collapsed (the repeated-order path timeout and forfeit also map
 *  onto). */
export type CommitChoice = 'staged' | 'hold' | 'repeat'

export interface FinaleSlots {
  readonly outlook: string | null
  readonly flights: string | null
  readonly bank: string | null
  readonly root: string | null
  readonly observation: string | null
}

export interface FinaleRejection {
  readonly code: RejectionCode
  readonly slot: FinaleSlot
}

export interface FinaleState {
  readonly slots: FinaleSlots
  /** The player's event-time ordering over the three subsystem slots. Record
   *  ids only; validation checks this matches true event-time order. */
  readonly ordering: readonly string[]
  readonly caseValid: boolean
  readonly lastRejection: FinaleRejection | null
  /** Display only; branches are pure and this never gates settlement. */
  readonly comparisonsRun: number
  readonly fieldReportRequested: boolean
  readonly committed: CommitChoice | null
}

/** A live source-check fact the shell lifts from campaign.sourceChecks and
 *  threads into VALIDATE / REQUEST FIELD REPORT. Reference-only: a record id
 *  and a typed outcome code, never a desk reply body. */
export interface CaseFileCheck {
  readonly recordId: string
  readonly outcome: SourceCheckOutcome
  /** Honestly carried so a post-settlement field reply renders its pending
   *  line (section 04); never gates corroboration. */
  readonly arrivedAfterSettlement?: boolean
}

/** The campaign-derived facts the pure case builder reads. The static half
 *  (graph, claimRunId, fieldReportId) comes from the immutable seed the
 *  module closes over; the live half (sourceChecks, inspectedRecords) the
 *  shell assembles from campaign selectors and threads through the action
 *  payload. All reference data: ids, typed codes, integers, booleans. */
export interface FinaleCaseFile {
  readonly graph: RecordGraph
  readonly claimRunId: string
  readonly rootRecordId: string
  readonly fieldReportId: string
  readonly sourceChecks: readonly CaseFileCheck[]
  readonly inspectedRecords: readonly string[]
}

const slotsSchema = v.strictObject({
  outlook: v.nullable(v.string()),
  flights: v.nullable(v.string()),
  bank: v.nullable(v.string()),
  root: v.nullable(v.string()),
  observation: v.nullable(v.string()),
})

const rejectionSchema = v.strictObject({
  code: v.picklist([
    'receipt-order',
    'unrelated-source',
    'derived-not-independent',
    'wrong-root',
    'incomplete',
  ]),
  slot: v.picklist(['outlook', 'flights', 'bank', 'root', 'observation']),
})

/** The reference-only save schema. strictObject at every level means any
 *  field that could carry authored copy (a body array, a line string) is
 *  structurally rejected. Slots and ordering hold record ids; lastRejection
 *  holds a typed code and a slot name; everything else is a boolean, a
 *  picklist code, or an integer. */
export const finaleSaveSchema = v.strictObject({
  slots: slotsSchema,
  ordering: v.array(v.string()),
  caseValid: v.boolean(),
  lastRejection: v.nullable(rejectionSchema),
  comparisonsRun: integer,
  fieldReportRequested: v.boolean(),
  committed: v.nullable(v.picklist(['staged', 'hold', 'repeat'])),
})

export type FinaleStateParsed = v.InferOutput<typeof finaleSaveSchema>
