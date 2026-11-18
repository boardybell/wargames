// The evidence graph: provenance is first-class data, and the
// independence rule lives here so mission guidance and the finale case
// validator can never drift apart. Everything is pure and total over
// malformed input; ancestry walks carry a visited set so cycles and
// dangling parents produce verdicts, never hangs.

export type OriginKind = 'OBSERVED' | 'EXERCISE' | 'DERIVED'

export type Subsystem = 'outlook' | 'flights' | 'bank'

export interface EvidenceRecord {
  readonly id: string
  readonly origin: OriginKind
  readonly sourceId: string
  readonly parentId: string | null
  readonly runId: string | null
  /** Story seconds-of-day integer in [0, 86400); seed validation
   *  enforces the range, this module only documents it. */
  readonly eventTime: number
  /** Story seconds-of-day integer in [0, 86400). */
  readonly receiptTime: number
  readonly subsystem: Subsystem
  readonly body: readonly string[]
}

export interface RecordGraph {
  /** Sorted by id; the persisted shape stays a plain array. */
  readonly records: readonly EvidenceRecord[]
}

/** Throws on duplicate ids (seed-authoring defect, fail at build);
 *  never mutates the input array. */
export function buildRecordGraph(records: readonly EvidenceRecord[]): RecordGraph {
  const seen = new Set<string>()
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`records: duplicate id ${record.id}`)
    }
    seen.add(record.id)
  }
  const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { records: sorted }
}

export function getRecord(graph: RecordGraph, id: string): EvidenceRecord | null {
  return graph.records.find((r) => r.id === id) ?? null
}

export interface ParentSummary {
  readonly id: string
  readonly origin: OriginKind
  readonly sourceId: string
  readonly eventTime: number
}

export type TraceResult =
  | {
      readonly found: true
      readonly recordId: string
      readonly origin: OriginKind
      readonly runId: string | null
      readonly eventTime: number
      readonly receiptTime: number
      readonly parent: ParentSummary | null
    }
  | { readonly found: false; readonly recordId: string }

/** PURE SELECTOR, no state change; unknown ids return the typed
 *  not-found variant. Recording that the player inspected a record is
 *  the separate dispatched INSPECT_RECORD action. A non-null parentId
 *  that does not resolve (including the empty string) renders as a
 *  null parent here and rejects as BROKEN_CHAIN in the independence
 *  walk; both treat it as a broken edge, never a true origin. */
export function trace(graph: RecordGraph, recordId: string): TraceResult {
  const record = getRecord(graph, recordId)
  if (!record) return { found: false, recordId }
  const parent =
    record.parentId !== null ? getRecord(graph, record.parentId) : null
  return {
    found: true,
    recordId,
    origin: record.origin,
    runId: record.runId,
    eventTime: record.eventTime,
    receiptTime: record.receiptTime,
    parent: parent
      ? {
          id: parent.id,
          origin: parent.origin,
          sourceId: parent.sourceId,
          eventTime: parent.eventTime,
        }
      : null,
  }
}

export type IndependenceReason =
  | 'INDEPENDENT'
  | 'RECORD_NOT_FOUND'
  | 'DERIVED_ORIGIN'
  | 'EXERCISE_ORIGIN'
  | 'DIRECT_RUN_STAMP'
  | 'ANCESTRY_TOUCHES_RUN'
  | 'BROKEN_CHAIN'

export interface Verdict {
  readonly independent: boolean
  readonly reason: IndependenceReason
}

/** THE independence rule, shared by mission guidance and the finale
 *  case validator: a record is independent corroboration of a claim
 *  only if its origin is OBSERVED and neither its own run stamp nor its
 *  full parent chain touches the claim run. DERIVED repetition of an
 *  upstream claim is zero corroboration no matter how accurate.
 *  Reason-code precedence: not-found, then origin, then direct stamp,
 *  then ancestry walk (broken chains and cycles reject). */
export function isIndependentObservation(
  graph: RecordGraph,
  recordId: string,
  claimRunId: string,
): Verdict {
  const record = getRecord(graph, recordId)
  if (!record) return { independent: false, reason: 'RECORD_NOT_FOUND' }
  if (record.origin === 'DERIVED') {
    return { independent: false, reason: 'DERIVED_ORIGIN' }
  }
  if (record.origin === 'EXERCISE') {
    return { independent: false, reason: 'EXERCISE_ORIGIN' }
  }
  if (record.runId === claimRunId) {
    return { independent: false, reason: 'DIRECT_RUN_STAMP' }
  }
  const visited = new Set<string>([record.id])
  let cursor = record.parentId
  while (cursor !== null) {
    if (visited.has(cursor)) {
      return { independent: false, reason: 'BROKEN_CHAIN' }
    }
    visited.add(cursor)
    const parent = getRecord(graph, cursor)
    if (!parent) return { independent: false, reason: 'BROKEN_CHAIN' }
    if (parent.runId === claimRunId) {
      return { independent: false, reason: 'ANCESTRY_TOUCHES_RUN' }
    }
    cursor = parent.parentId
  }
  return { independent: true, reason: 'INDEPENDENT' }
}

export type SourceCheckOutcome =
  | 'CONFIRMED'
  | 'CONTRADICTED'
  | 'PENDING'
  | 'UNKNOWN'

/** Integer corroboration weight toward a claim. PENDING and UNKNOWN
 *  carry zero; CONTRADICTED is counter-evidence surfaced separately and
 *  also contributes zero corroboration toward the claim. */
export function corroborationValue(outcome: SourceCheckOutcome): number {
  return outcome === 'CONFIRMED' ? 1 : 0
}
