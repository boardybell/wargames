diff --git a/src/engine/records/index.ts b/src/engine/records/index.ts
new file mode 100644
index 0000000..513aec8
--- /dev/null
+++ b/src/engine/records/index.ts
@@ -0,0 +1,152 @@
+// The evidence graph: provenance is first-class data, and the
+// independence rule lives here so mission guidance and the finale case
+// validator can never drift apart. Everything is pure and total over
+// malformed input; ancestry walks carry a visited set so cycles and
+// dangling parents produce verdicts, never hangs.
+
+export type OriginKind = 'OBSERVED' | 'EXERCISE' | 'DERIVED'
+
+export type Subsystem = 'outlook' | 'flights' | 'bank'
+
+export interface EvidenceRecord {
+  readonly id: string
+  readonly origin: OriginKind
+  readonly sourceId: string
+  readonly parentId: string | null
+  readonly runId: string | null
+  readonly eventTime: number
+  readonly receiptTime: number
+  readonly subsystem: Subsystem
+  readonly body: readonly string[]
+}
+
+export interface RecordGraph {
+  /** Sorted by id; the persisted shape stays a plain array. */
+  readonly records: readonly EvidenceRecord[]
+}
+
+export function buildRecordGraph(records: readonly EvidenceRecord[]): RecordGraph {
+  const seen = new Set<string>()
+  for (const record of records) {
+    if (seen.has(record.id)) {
+      throw new Error(`records: duplicate id ${record.id}`)
+    }
+    seen.add(record.id)
+  }
+  const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
+  return { records: sorted }
+}
+
+export function getRecord(graph: RecordGraph, id: string): EvidenceRecord | null {
+  return graph.records.find((r) => r.id === id) ?? null
+}
+
+export interface ParentSummary {
+  readonly id: string
+  readonly origin: OriginKind
+  readonly sourceId: string
+  readonly eventTime: number
+}
+
+export type TraceResult =
+  | {
+      readonly found: true
+      readonly recordId: string
+      readonly origin: OriginKind
+      readonly runId: string | null
+      readonly eventTime: number
+      readonly receiptTime: number
+      readonly parent: ParentSummary | null
+    }
+  | { readonly found: false; readonly recordId: string }
+
+/** PURE SELECTOR, no state change. Recording that the player inspected
+ *  a record is the separate dispatched INSPECT_RECORD action. */
+export function trace(graph: RecordGraph, recordId: string): TraceResult {
+  const record = getRecord(graph, recordId)
+  if (!record) return { found: false, recordId }
+  const parent = record.parentId ? getRecord(graph, record.parentId) : null
+  return {
+    found: true,
+    recordId,
+    origin: record.origin,
+    runId: record.runId,
+    eventTime: record.eventTime,
+    receiptTime: record.receiptTime,
+    parent: parent
+      ? {
+          id: parent.id,
+          origin: parent.origin,
+          sourceId: parent.sourceId,
+          eventTime: parent.eventTime,
+        }
+      : null,
+  }
+}
+
+export type IndependenceReason =
+  | 'INDEPENDENT'
+  | 'RECORD_NOT_FOUND'
+  | 'DERIVED_ORIGIN'
+  | 'EXERCISE_ORIGIN'
+  | 'DIRECT_RUN_STAMP'
+  | 'ANCESTRY_TOUCHES_RUN'
+  | 'BROKEN_CHAIN'
+
+export interface Verdict {
+  readonly independent: boolean
+  readonly reason: IndependenceReason
+}
+
+/** THE independence rule, shared by mission guidance and the finale
+ *  case validator: a record is independent corroboration of a claim
+ *  only if its origin is OBSERVED and neither its own run stamp nor its
+ *  full parent chain touches the claim run. DERIVED repetition of an
+ *  upstream claim is zero corroboration no matter how accurate.
+ *  Reason-code precedence: not-found, then origin, then direct stamp,
+ *  then ancestry walk (broken chains and cycles reject). */
+export function isIndependentObservation(
+  graph: RecordGraph,
+  recordId: string,
+  claimRunId: string,
+): Verdict {
+  const record = getRecord(graph, recordId)
+  if (!record) return { independent: false, reason: 'RECORD_NOT_FOUND' }
+  if (record.origin === 'DERIVED') {
+    return { independent: false, reason: 'DERIVED_ORIGIN' }
+  }
+  if (record.origin === 'EXERCISE') {
+    return { independent: false, reason: 'EXERCISE_ORIGIN' }
+  }
+  if (record.runId === claimRunId) {
+    return { independent: false, reason: 'DIRECT_RUN_STAMP' }
+  }
+  const visited = new Set<string>([record.id])
+  let cursor = record.parentId
+  while (cursor !== null) {
+    if (visited.has(cursor)) {
+      return { independent: false, reason: 'BROKEN_CHAIN' }
+    }
+    visited.add(cursor)
+    const parent = getRecord(graph, cursor)
+    if (!parent) return { independent: false, reason: 'BROKEN_CHAIN' }
+    if (parent.runId === claimRunId) {
+      return { independent: false, reason: 'ANCESTRY_TOUCHES_RUN' }
+    }
+    cursor = parent.parentId
+  }
+  return { independent: true, reason: 'INDEPENDENT' }
+}
+
+export type SourceCheckOutcome =
+  | 'CONFIRMED'
+  | 'CONTRADICTED'
+  | 'PENDING'
+  | 'UNKNOWN'
+
+/** Integer corroboration weight toward a claim. PENDING and UNKNOWN
+ *  carry zero; CONTRADICTED is counter-evidence surfaced separately and
+ *  also contributes zero corroboration toward the claim. */
+export function corroborationValue(outcome: SourceCheckOutcome): number {
+  return outcome === 'CONFIRMED' ? 1 : 0
+}
diff --git a/test/engine/records/fixtures.ts b/test/engine/records/fixtures.ts
new file mode 100644
index 0000000..944bd35
--- /dev/null
+++ b/test/engine/records/fixtures.ts
@@ -0,0 +1,79 @@
+import type { EvidenceRecord } from '@engine/records'
+
+// In-test fixture graph modeled on the canonical seed shape. Times are
+// story seconds-of-day: 21:14:00 is 76440.
+export const C17: EvidenceRecord = {
+  id: 'C17',
+  origin: 'EXERCISE',
+  sourceId: 'D83-EXPORT',
+  parentId: null,
+  runId: 'R04',
+  eventTime: 76440,
+  receiptTime: 76445,
+  subsystem: 'outlook',
+  body: ['PREVIEW GROUNDING ADVISORY PUBLISHED TO ACTIVE FEED'],
+}
+
+export const F06: EvidenceRecord = {
+  id: 'F06',
+  origin: 'DERIVED',
+  sourceId: 'FLIGHT-CONTROL',
+  parentId: 'C17',
+  runId: 'R04',
+  eventTime: 76448,
+  receiptTime: 76492,
+  subsystem: 'flights',
+  body: ['ALL HUBS RESTRICTION PER C17'],
+}
+
+export const B04: EvidenceRecord = {
+  id: 'B04',
+  origin: 'DERIVED',
+  sourceId: 'BANK-OPS',
+  parentId: 'F06',
+  runId: 'R04',
+  eventTime: 76461,
+  receiptTime: 76470,
+  subsystem: 'bank',
+  body: ['EMERGENCY HOLD: SYSTEM-WIDE SHUTDOWN ASSUMED PER F06'],
+}
+
+export const W02: EvidenceRecord = {
+  id: 'W02',
+  origin: 'OBSERVED',
+  sourceId: 'FIELD-NW',
+  parentId: null,
+  runId: null,
+  eventTime: 76455,
+  receiptTime: 76460,
+  subsystem: 'flights',
+  body: ['LOCAL WEATHER WARNING: NORTHWEST CORRIDOR ONLY'],
+}
+
+// OBSERVED label with tainted ancestry: launders the R04 claim.
+export const L09: EvidenceRecord = {
+  id: 'L09',
+  origin: 'OBSERVED',
+  sourceId: 'RELAY-DESK',
+  parentId: 'F06',
+  runId: null,
+  eventTime: 76500,
+  receiptTime: 76505,
+  subsystem: 'flights',
+  body: ['CONFIRMING RESTRICTION AS RELAYED'],
+}
+
+// Directly stamped with the run despite OBSERVED origin.
+export const S11: EvidenceRecord = {
+  id: 'S11',
+  origin: 'OBSERVED',
+  sourceId: 'SCENARIO-TAP',
+  parentId: null,
+  runId: 'R04',
+  eventTime: 76502,
+  receiptTime: 76507,
+  subsystem: 'outlook',
+  body: ['SCENARIO FEED OBSERVATION'],
+}
+
+export const FIXTURE_RECORDS: EvidenceRecord[] = [C17, F06, B04, W02, L09, S11]
diff --git a/test/engine/records/records.test.ts b/test/engine/records/records.test.ts
new file mode 100644
index 0000000..31dd130
--- /dev/null
+++ b/test/engine/records/records.test.ts
@@ -0,0 +1,152 @@
+import { describe, expect, it } from 'vitest'
+import {
+  buildRecordGraph,
+  corroborationValue,
+  getRecord,
+  isIndependentObservation,
+  trace,
+} from '@engine/records'
+import type { EvidenceRecord } from '@engine/records'
+import { stateHash } from '../harness/canonical'
+import { C17, F06, FIXTURE_RECORDS, W02 } from './fixtures'
+
+function deepFreeze<T>(value: T): T {
+  if (value && typeof value === 'object') {
+    for (const v of Object.values(value)) deepFreeze(v)
+    Object.freeze(value)
+  }
+  return value
+}
+
+const graph = deepFreeze(buildRecordGraph(FIXTURE_RECORDS))
+
+describe('record graph container', () => {
+  it('stores records as an array sorted by id', () => {
+    const ids = graph.records.map((r) => r.id)
+    expect(ids).toEqual([...ids].sort())
+  })
+
+  it('getRecord resolves by id and returns null for unknown ids', () => {
+    expect(getRecord(graph, 'F06')?.sourceId).toBe('FLIGHT-CONTROL')
+    expect(getRecord(graph, 'ZZ9')).toBeNull()
+  })
+
+  it('rejects duplicate ids at construction', () => {
+    expect(() => buildRecordGraph([C17, { ...F06, id: 'C17' }])).toThrow(
+      /duplicate/i,
+    )
+  })
+})
+
+describe('trace', () => {
+  it('returns origin, times, and a parent summary for a derived record', () => {
+    const result = trace(graph, 'F06')
+    expect(result.found).toBe(true)
+    if (!result.found) return
+    expect(result.origin).toBe('DERIVED')
+    expect(result.eventTime).toBe(76448)
+    expect(result.receiptTime).toBe(76492)
+    expect(result.parent).toEqual({
+      id: 'C17',
+      origin: 'EXERCISE',
+      sourceId: 'D83-EXPORT',
+      eventTime: 76440,
+    })
+    expect(result.runId).toBe('R04')
+  })
+
+  it('returns null parent fields for a true origin', () => {
+    const result = trace(graph, 'C17')
+    expect(result.found).toBe(true)
+    if (!result.found) return
+    expect(result.parent).toBeNull()
+  })
+
+  it('returns a typed not-found result for unknown ids', () => {
+    expect(trace(graph, 'NOPE')).toEqual({ found: false, recordId: 'NOPE' })
+  })
+
+  it('is pure and frozen-input safe', () => {
+    const before = stateHash(graph)
+    trace(graph, 'B04')
+    trace(graph, 'NOPE')
+    expect(stateHash(graph)).toBe(before)
+  })
+})
+
+describe('isIndependentObservation', () => {
+  it('accepts an observed record with no claim-run ancestry', () => {
+    const verdict = isIndependentObservation(graph, 'W02', 'R04')
+    expect(verdict).toEqual({ independent: true, reason: 'INDEPENDENT' })
+  })
+
+  it('rejects derived records regardless of accuracy', () => {
+    expect(isIndependentObservation(graph, 'F06', 'R04').reason).toBe(
+      'DERIVED_ORIGIN',
+    )
+    expect(isIndependentObservation(graph, 'B04', 'R04').independent).toBe(
+      false,
+    )
+  })
+
+  it('rejects observed-labeled records whose ancestry reaches the run', () => {
+    const verdict = isIndependentObservation(graph, 'L09', 'R04')
+    expect(verdict).toEqual({
+      independent: false,
+      reason: 'ANCESTRY_TOUCHES_RUN',
+    })
+  })
+
+  it('rejects a direct run stamp even with observed origin', () => {
+    const verdict = isIndependentObservation(graph, 'S11', 'R04')
+    expect(verdict).toEqual({ independent: false, reason: 'DIRECT_RUN_STAMP' })
+  })
+
+  it('returns RECORD_NOT_FOUND for unknown ids', () => {
+    expect(isIndependentObservation(graph, 'ZZ9', 'R04').reason).toBe(
+      'RECORD_NOT_FOUND',
+    )
+  })
+
+  it('terminates with BROKEN_CHAIN on a dangling parent', () => {
+    const dangling: EvidenceRecord = { ...W02, id: 'D01', parentId: 'GONE' }
+    const g = buildRecordGraph([...FIXTURE_RECORDS, dangling])
+    expect(isIndependentObservation(g, 'D01', 'R04').reason).toBe(
+      'BROKEN_CHAIN',
+    )
+  })
+
+  it('terminates with BROKEN_CHAIN on a parent cycle', () => {
+    const a: EvidenceRecord = { ...W02, id: 'X1', parentId: 'X2' }
+    const b: EvidenceRecord = { ...W02, id: 'X2', parentId: 'X1' }
+    const g = buildRecordGraph([...FIXTURE_RECORDS, a, b])
+    expect(isIndependentObservation(g, 'X1', 'R04').reason).toBe('BROKEN_CHAIN')
+  })
+
+  it('is pure on a frozen graph', () => {
+    const before = stateHash(graph)
+    isIndependentObservation(graph, 'W02', 'R04')
+    isIndependentObservation(graph, 'L09', 'R04')
+    expect(stateHash(graph)).toBe(before)
+  })
+})
+
+describe('corroborationValue', () => {
+  it('scores CONFIRMED positive and everything else zero', () => {
+    expect(corroborationValue('CONFIRMED')).toBeGreaterThan(0)
+    expect(corroborationValue('CONTRADICTED')).toBe(0)
+    expect(corroborationValue('PENDING')).toBe(0)
+    expect(corroborationValue('UNKNOWN')).toBe(0)
+  })
+
+  it('returns integers for every outcome', () => {
+    for (const outcome of [
+      'CONFIRMED',
+      'CONTRADICTED',
+      'PENDING',
+      'UNKNOWN',
+    ] as const) {
+      expect(Number.isInteger(corroborationValue(outcome))).toBe(true)
+    }
+  })
+})
