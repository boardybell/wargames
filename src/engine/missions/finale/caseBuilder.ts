// The finale case builder: pure functions over FinaleState and the
// campaign-derived FinaleCaseFile. No authored strings, no mutation, no clock.
// The shared independence validator (records/index.ts) is the single source of
// truth for the observation slot, so mission guidance and the finale case can
// never drift apart. Every rejection is the stable { code, slot } pair the
// Joshua catalog keys on; this file owns the codes, section 03 owns the text.
import {
  getRecord,
  isIndependentObservation,
} from '../../records'
import type { EvidenceRecord } from '../../records'
import type { DeskCheckEntry } from '../types'
import type {
  FinaleCaseFile,
  FinaleSlot,
  FinaleState,
  RejectionCode,
} from './types'
import { SUBSYSTEM_SLOTS } from './types'

/** The decision margin (ms, integer) the finale reserves ahead of the
 *  deadline: a REQUEST FIELD REPORT issued at the first instant of legality
 *  must have its desk reply land at least this far before endsAt, so the
 *  player still has room to validate the case and commit. Amendment 12: the
 *  designated field-report record's authored desk delay is validator-bounded
 *  to durationMs minus this margin. Three minutes standard, one minute margin. */
export const FINALE_DECISION_MARGIN_MS = 60_000

export interface SlotCandidate {
  readonly recordId: string
  /** The player inspected this record during play (drives the highlight). */
  readonly highlighted: boolean
  /** An independent OBSERVED record offered to the observation slot without a
   *  CONFIRMED completed check: listed but not attachable. Only the
   *  observation slot sets this. */
  readonly unverified?: boolean
  /** Whether this candidate may be attached to the slot right now. */
  readonly attachable: boolean
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: RejectionCode; readonly slot: FinaleSlot }

function subsystemOfSlot(slot: FinaleSlot): EvidenceRecord['subsystem'] | null {
  return slot === 'outlook' || slot === 'flights' || slot === 'bank'
    ? slot
    : null
}

/** A record has a CONFIRMED completed play-time source check. PENDING,
 *  UNKNOWN, and CONTRADICTED never qualify; a check that arrived after
 *  settlement is honestly recorded but never corroborates (it did not land in
 *  time). */
function hasConfirmedCheck(
  caseFile: FinaleCaseFile,
  recordId: string,
): boolean {
  return caseFile.sourceChecks.some(
    (check) =>
      check.recordId === recordId &&
      check.outcome === 'CONFIRMED' &&
      check.arrivedAfterSettlement !== true,
  )
}

/** The finale field report is itself a desk-check product: once its reply has
 *  landed (a completed source check of any outcome for the designated record),
 *  it corroborates the observation slot without a second independent check. */
function fieldReportLanded(caseFile: FinaleCaseFile): boolean {
  return caseFile.sourceChecks.some(
    (check) =>
      check.recordId === caseFile.fieldReportId &&
      check.arrivedAfterSettlement !== true,
  )
}

/** Does this record corroborate the claim as an attachable observation? True
 *  only for an independent OBSERVED record with a CONFIRMED completed check,
 *  or the finale field report once its reply has landed. */
function observationQualifies(
  caseFile: FinaleCaseFile,
  recordId: string,
): boolean {
  if (recordId === caseFile.fieldReportId && fieldReportLanded(caseFile)) {
    return true
  }
  const verdict = isIndependentObservation(
    caseFile.graph,
    recordId,
    caseFile.claimRunId,
  )
  return verdict.independent && hasConfirmedCheck(caseFile, recordId)
}

/** An independent OBSERVED record the player could corroborate but has not:
 *  lists with the UNVERIFIED flag and is not attachable. */
function observationUnverified(
  caseFile: FinaleCaseFile,
  recordId: string,
): boolean {
  if (recordId === caseFile.fieldReportId) return !fieldReportLanded(caseFile)
  const verdict = isIndependentObservation(
    caseFile.graph,
    recordId,
    caseFile.claimRunId,
  )
  return verdict.independent && !hasConfirmedCheck(caseFile, recordId)
}

/** Candidate listing per slot from the case file. Every record from all three
 *  missions is a candidate whatever the mission outcomes. Inspected records
 *  carry the highlight flag. For the observation slot, a candidate is
 *  attachable only if it corroborates; an independent-but-unchecked candidate
 *  lists UNVERIFIED and does not satisfy the slot. */
export function listCandidates(
  slot: FinaleSlot,
  caseFile: FinaleCaseFile,
): SlotCandidate[] {
  const inspected = new Set(caseFile.inspectedRecords)
  const candidates: SlotCandidate[] = []
  if (slot === 'observation') {
    for (const record of caseFile.graph.records) {
      const attachable = observationQualifies(caseFile, record.id)
      const unverified = !attachable && observationUnverified(caseFile, record.id)
      if (!attachable && !unverified) continue
      candidates.push({
        recordId: record.id,
        highlighted: inspected.has(record.id),
        unverified: unverified || undefined,
        attachable,
      })
    }
    return candidates
  }
  if (slot === 'root') {
    for (const record of caseFile.graph.records) {
      candidates.push({
        recordId: record.id,
        highlighted: inspected.has(record.id),
        attachable: true,
      })
    }
    return candidates
  }
  const subsystem = subsystemOfSlot(slot)
  for (const record of caseFile.graph.records) {
    if (record.subsystem !== subsystem) continue
    candidates.push({
      recordId: record.id,
      highlighted: inspected.has(record.id),
      attachable: true,
    })
  }
  return candidates
}

/** Is REQUEST FIELD REPORT legal? Legal only while no corroborated
 *  observation candidate exists; once one does (a CONFIRMED independent
 *  record from play, or a landed field report), the request is a no-op. */
export function fieldReportLegal(
  _state: FinaleState,
  caseFile: FinaleCaseFile,
): boolean {
  if (fieldReportLanded(caseFile)) return false
  for (const record of caseFile.graph.records) {
    if (record.id === caseFile.fieldReportId) continue
    if (observationQualifies(caseFile, record.id)) return false
  }
  return true
}

function trueEventTime(
  caseFile: FinaleCaseFile,
  recordId: string | null,
): number | null {
  if (recordId === null) return null
  return getRecord(caseFile.graph, recordId)?.eventTime ?? null
}

/** The shared validator composition. Checks, in reason-code precedence:
 *    - every slot filled (incomplete),
 *    - the root slot is the actual parent-chain root, the exercise export
 *      (wrong-root),
 *    - the three subsystem slots are in true event-time order; a
 *      receipt-time ordering is the inbox illusion (receipt-order),
 *    - the observation slot corroborates: independent OBSERVED with a
 *      CONFIRMED check or the landed field report (derived-not-independent
 *      when a same-run derivative is offered, unrelated-source when an on-time
 *      but uncorroborated / off-claim record is offered).
 *  Returns valid or the first applicable { code, slot }. Never mutates. */
export function validateCase(
  state: FinaleState,
  caseFile: FinaleCaseFile,
): ValidationResult {
  for (const slot of ['outlook', 'flights', 'bank', 'root', 'observation'] as const) {
    if (state.slots[slot] === null) {
      return { ok: false, code: 'incomplete', slot }
    }
  }

  // Root must be the actual parent-chain root, the exercise export C17-family
  // record designated for this seed.
  if (state.slots.root !== caseFile.rootRecordId) {
    return { ok: false, code: 'wrong-root', slot: 'root' }
  }

  // Event-time ordering of the three subsystem slots. The ordering array is
  // the player's claimed sequence; it must match the records sorted by true
  // event time. A receipt-time-sorted sequence diverges and rejects.
  const ordered = state.ordering
  const subsystemIds = SUBSYSTEM_SLOTS.map((slot) => state.slots[slot]!)
  // An ordering that does not cover the three subsystem record ids is
  // structural incompleteness, not the receipt-vs-event-time inbox illusion:
  // the player has not yet arranged a full three-slot sequence. Name the first
  // subsystem slot whose record the ordering omits and reject as incomplete.
  const orderingCoversSlots =
    ordered.length === subsystemIds.length &&
    subsystemIds.every((id) => ordered.includes(id))
  if (!orderingCoversSlots) {
    const missing =
      SUBSYSTEM_SLOTS.find((slot) => !ordered.includes(state.slots[slot]!)) ??
      'outlook'
    return { ok: false, code: 'incomplete', slot: missing as FinaleSlot }
  }
  const byEventTime = [...subsystemIds].sort((a, b) => {
    const ea = trueEventTime(caseFile, a) ?? 0
    const eb = trueEventTime(caseFile, b) ?? 0
    return ea - eb
  })
  for (let i = 0; i < byEventTime.length; i += 1) {
    if (ordered[i] !== byEventTime[i]) {
      const slot =
        (SUBSYSTEM_SLOTS.find((s) => state.slots[s] === ordered[i]) ??
          'outlook') as FinaleSlot
      return { ok: false, code: 'receipt-order', slot }
    }
  }

  // Observation slot: must corroborate. A same-run derivative offered as the
  // observation reads derived-not-independent; any other non-corroborating
  // record (on time but unrelated, or uncorroborated) reads unrelated-source.
  const observation = state.slots.observation!
  if (!observationQualifies(caseFile, observation)) {
    const verdict = isIndependentObservation(
      caseFile.graph,
      observation,
      caseFile.claimRunId,
    )
    // A same-run derivative: DERIVED origin, or an OBSERVED record tainted by a
    // direct run stamp or tainted ancestry. A BROKEN_CHAIN (cyclic or orphaned
    // parent) is a corrupted derivative whose provenance cannot be cleared, so
    // it reads as derived-not-independent too: the chain never resolves to an
    // independent origin. EXERCISE-origin and merely-on-time records are not run
    // derivatives; they read as unrelated-source.
    const derived =
      verdict.reason === 'DERIVED_ORIGIN' ||
      verdict.reason === 'DIRECT_RUN_STAMP' ||
      verdict.reason === 'ANCESTRY_TOUCHES_RUN' ||
      verdict.reason === 'BROKEN_CHAIN'
    return {
      ok: false,
      code: derived ? 'derived-not-independent' : 'unrelated-source',
      slot: 'observation',
    }
  }

  return { ok: true }
}

// ── Content validation (amendment 12 bounded wait) ──────────────────
// A PURE authoring gate for the GLOBAL FAILSAFE finale, the analogue of the
// three missions' validate*Content functions. It never mutates and returns a
// list of structured errors so one run names every authoring mistake. The one
// invariant it enforces is the bounded-wait contract: the designated
// field-report record's authored desk delay must leave the decision margin
// ahead of the deadline, so a request made at first legality still resolves
// with room to validate and commit.

export type FinaleContentErrorCode =
  | 'FIELD_REPORT_DESK_MISSING'
  | 'FIELD_REPORT_WAIT_UNBOUNDED'

export interface FinaleContentError {
  readonly code: FinaleContentErrorCode
  readonly detail: string
}

/** The authored anchors the finale content validator bounds against: the
 *  designated field-report record id and the materialized finale length in ms
 *  (already doubled under extended time). One source of truth shared by the
 *  validator and its tests. */
export interface FinaleContentInputs {
  readonly fieldReportId: string
  readonly durationMs: number
}

/** Validate authored finale content. Empty array means valid. Pure over all
 *  inputs; the shared deskChecks table carries the field-report record's
 *  authored reply delay. The bound: the field-report desk delay (ms) must be
 *  at most durationMs minus FINALE_DECISION_MARGIN_MS, so REQUEST FIELD REPORT
 *  issued at first legality cannot stall the player past the commit window. */
export function validateFinaleContent(
  inputs: FinaleContentInputs,
  deskChecks: readonly DeskCheckEntry[],
): FinaleContentError[] {
  const errors: FinaleContentError[] = []
  const entry = deskChecks.find((d) => d.recordId === inputs.fieldReportId)
  if (!entry) {
    errors.push({
      code: 'FIELD_REPORT_DESK_MISSING',
      detail: `field-report record ${inputs.fieldReportId} has no deskChecks row to bound`,
    })
    return errors
  }
  const delayMs = entry.delaySeconds * 1000
  const bound = inputs.durationMs - FINALE_DECISION_MARGIN_MS
  if (delayMs > bound) {
    errors.push({
      code: 'FIELD_REPORT_WAIT_UNBOUNDED',
      detail: `field-report ${inputs.fieldReportId} desk delay ${delayMs}ms exceeds the bound ${bound}ms (durationMs ${inputs.durationMs} minus margin ${FINALE_DECISION_MARGIN_MS})`,
    })
  }
  return errors
}
