diff --git a/src/engine/missions/finale/caseBuilder.ts b/src/engine/missions/finale/caseBuilder.ts
new file mode 100644
index 0000000..d0b8a58
--- /dev/null
+++ b/src/engine/missions/finale/caseBuilder.ts
@@ -0,0 +1,249 @@
+// The finale case builder: pure functions over FinaleState and the
+// campaign-derived FinaleCaseFile. No authored strings, no mutation, no clock.
+// The shared independence validator (records/index.ts) is the single source of
+// truth for the observation slot, so mission guidance and the finale case can
+// never drift apart. Every rejection is the stable { code, slot } pair the
+// Joshua catalog keys on; this file owns the codes, section 03 owns the text.
+import {
+  getRecord,
+  isIndependentObservation,
+} from '../../records'
+import type { EvidenceRecord } from '../../records'
+import type {
+  FinaleCaseFile,
+  FinaleSlot,
+  FinaleState,
+  RejectionCode,
+} from './types'
+import { SUBSYSTEM_SLOTS } from './types'
+
+export interface SlotCandidate {
+  readonly recordId: string
+  /** The player inspected this record during play (drives the highlight). */
+  readonly highlighted: boolean
+  /** An independent OBSERVED record offered to the observation slot without a
+   *  CONFIRMED completed check: listed but not attachable. Only the
+   *  observation slot sets this. */
+  readonly unverified?: boolean
+  /** Whether this candidate may be attached to the slot right now. */
+  readonly attachable: boolean
+}
+
+export type ValidationResult =
+  | { readonly ok: true }
+  | { readonly ok: false; readonly code: RejectionCode; readonly slot: FinaleSlot }
+
+function subsystemOfSlot(slot: FinaleSlot): EvidenceRecord['subsystem'] | null {
+  return slot === 'outlook' || slot === 'flights' || slot === 'bank'
+    ? slot
+    : null
+}
+
+/** A record has a CONFIRMED completed play-time source check. PENDING,
+ *  UNKNOWN, and CONTRADICTED never qualify; a check that arrived after
+ *  settlement is honestly recorded but never corroborates (it did not land in
+ *  time). */
+function hasConfirmedCheck(
+  caseFile: FinaleCaseFile,
+  recordId: string,
+): boolean {
+  return caseFile.sourceChecks.some(
+    (check) =>
+      check.recordId === recordId &&
+      check.outcome === 'CONFIRMED' &&
+      check.arrivedAfterSettlement !== true,
+  )
+}
+
+/** The finale field report is itself a desk-check product: once its reply has
+ *  landed (a completed source check of any outcome for the designated record),
+ *  it corroborates the observation slot without a second independent check. */
+function fieldReportLanded(caseFile: FinaleCaseFile): boolean {
+  return caseFile.sourceChecks.some(
+    (check) =>
+      check.recordId === caseFile.fieldReportId &&
+      check.arrivedAfterSettlement !== true,
+  )
+}
+
+/** Does this record corroborate the claim as an attachable observation? True
+ *  only for an independent OBSERVED record with a CONFIRMED completed check,
+ *  or the finale field report once its reply has landed. */
+function observationQualifies(
+  caseFile: FinaleCaseFile,
+  recordId: string,
+): boolean {
+  if (recordId === caseFile.fieldReportId && fieldReportLanded(caseFile)) {
+    return true
+  }
+  const verdict = isIndependentObservation(
+    caseFile.graph,
+    recordId,
+    caseFile.claimRunId,
+  )
+  return verdict.independent && hasConfirmedCheck(caseFile, recordId)
+}
+
+/** An independent OBSERVED record the player could corroborate but has not:
+ *  lists with the UNVERIFIED flag and is not attachable. */
+function observationUnverified(
+  caseFile: FinaleCaseFile,
+  recordId: string,
+): boolean {
+  if (recordId === caseFile.fieldReportId) return !fieldReportLanded(caseFile)
+  const verdict = isIndependentObservation(
+    caseFile.graph,
+    recordId,
+    caseFile.claimRunId,
+  )
+  return verdict.independent && !hasConfirmedCheck(caseFile, recordId)
+}
+
+/** Candidate listing per slot from the case file. Every record from all three
+ *  missions is a candidate whatever the mission outcomes. Inspected records
+ *  carry the highlight flag. For the observation slot, a candidate is
+ *  attachable only if it corroborates; an independent-but-unchecked candidate
+ *  lists UNVERIFIED and does not satisfy the slot. */
+export function listCandidates(
+  slot: FinaleSlot,
+  caseFile: FinaleCaseFile,
+): SlotCandidate[] {
+  const inspected = new Set(caseFile.inspectedRecords)
+  const candidates: SlotCandidate[] = []
+  if (slot === 'observation') {
+    for (const record of caseFile.graph.records) {
+      const attachable = observationQualifies(caseFile, record.id)
+      const unverified = !attachable && observationUnverified(caseFile, record.id)
+      if (!attachable && !unverified) continue
+      candidates.push({
+        recordId: record.id,
+        highlighted: inspected.has(record.id),
+        unverified: unverified || undefined,
+        attachable,
+      })
+    }
+    return candidates
+  }
+  if (slot === 'root') {
+    for (const record of caseFile.graph.records) {
+      candidates.push({
+        recordId: record.id,
+        highlighted: inspected.has(record.id),
+        attachable: true,
+      })
+    }
+    return candidates
+  }
+  const subsystem = subsystemOfSlot(slot)
+  for (const record of caseFile.graph.records) {
+    if (record.subsystem !== subsystem) continue
+    candidates.push({
+      recordId: record.id,
+      highlighted: inspected.has(record.id),
+      attachable: true,
+    })
+  }
+  return candidates
+}
+
+/** Is REQUEST FIELD REPORT legal? Legal only while no corroborated
+ *  observation candidate exists; once one does (a CONFIRMED independent
+ *  record from play, or a landed field report), the request is a no-op. */
+export function fieldReportLegal(
+  _state: FinaleState,
+  caseFile: FinaleCaseFile,
+): boolean {
+  if (fieldReportLanded(caseFile)) return false
+  for (const record of caseFile.graph.records) {
+    if (record.id === caseFile.fieldReportId) continue
+    if (observationQualifies(caseFile, record.id)) return false
+  }
+  return true
+}
+
+function trueEventTime(
+  caseFile: FinaleCaseFile,
+  recordId: string | null,
+): number | null {
+  if (recordId === null) return null
+  return getRecord(caseFile.graph, recordId)?.eventTime ?? null
+}
+
+/** The shared validator composition. Checks, in reason-code precedence:
+ *    - every slot filled (incomplete),
+ *    - the root slot is the actual parent-chain root, the exercise export
+ *      (wrong-root),
+ *    - the three subsystem slots are in true event-time order; a
+ *      receipt-time ordering is the inbox illusion (receipt-order),
+ *    - the observation slot corroborates: independent OBSERVED with a
+ *      CONFIRMED check or the landed field report (derived-not-independent
+ *      when a same-run derivative is offered, unrelated-source when an on-time
+ *      but uncorroborated / off-claim record is offered).
+ *  Returns valid or the first applicable { code, slot }. Never mutates. */
+export function validateCase(
+  state: FinaleState,
+  caseFile: FinaleCaseFile,
+): ValidationResult {
+  for (const slot of ['outlook', 'flights', 'bank', 'root', 'observation'] as const) {
+    if (state.slots[slot] === null) {
+      return { ok: false, code: 'incomplete', slot }
+    }
+  }
+
+  // Root must be the actual parent-chain root, the exercise export C17-family
+  // record designated for this seed.
+  if (state.slots.root !== caseFile.rootRecordId) {
+    return { ok: false, code: 'wrong-root', slot: 'root' }
+  }
+
+  // Event-time ordering of the three subsystem slots. The ordering array is
+  // the player's claimed sequence; it must match the records sorted by true
+  // event time. A receipt-time-sorted sequence diverges and rejects.
+  const ordered = state.ordering
+  const subsystemIds = SUBSYSTEM_SLOTS.map((slot) => state.slots[slot]!)
+  const orderingCoversSlots =
+    ordered.length === subsystemIds.length &&
+    subsystemIds.every((id) => ordered.includes(id))
+  if (!orderingCoversSlots) {
+    return { ok: false, code: 'receipt-order', slot: 'outlook' }
+  }
+  const byEventTime = [...subsystemIds].sort((a, b) => {
+    const ea = trueEventTime(caseFile, a) ?? 0
+    const eb = trueEventTime(caseFile, b) ?? 0
+    return ea - eb
+  })
+  for (let i = 0; i < byEventTime.length; i += 1) {
+    if (ordered[i] !== byEventTime[i]) {
+      const slot =
+        (SUBSYSTEM_SLOTS.find((s) => state.slots[s] === ordered[i]) ??
+          'outlook') as FinaleSlot
+      return { ok: false, code: 'receipt-order', slot }
+    }
+  }
+
+  // Observation slot: must corroborate. A same-run derivative offered as the
+  // observation reads derived-not-independent; any other non-corroborating
+  // record (on time but unrelated, or uncorroborated) reads unrelated-source.
+  const observation = state.slots.observation!
+  if (!observationQualifies(caseFile, observation)) {
+    const verdict = isIndependentObservation(
+      caseFile.graph,
+      observation,
+      caseFile.claimRunId,
+    )
+    // A same-run derivative: DERIVED origin, or an OBSERVED record tainted by a
+    // direct run stamp or tainted ancestry. EXERCISE-origin and merely-on-time
+    // records are not run derivatives; they read as unrelated-source.
+    const derived =
+      verdict.reason === 'DERIVED_ORIGIN' ||
+      verdict.reason === 'DIRECT_RUN_STAMP' ||
+      verdict.reason === 'ANCESTRY_TOUCHES_RUN'
+    return {
+      ok: false,
+      code: derived ? 'derived-not-independent' : 'unrelated-source',
+      slot: 'observation',
+    }
+  }
+
+  return { ok: true }
+}
diff --git a/src/engine/missions/finale/endings.ts b/src/engine/missions/finale/endings.ts
new file mode 100644
index 0000000..6753183
--- /dev/null
+++ b/src/engine/missions/finale/endings.ts
@@ -0,0 +1,20 @@
+// SECTION-02 SEAM. The real endingId derivation and the earned-why readback
+// over settled metrics belong to section-02-projections-endings; this file is
+// the minimal, inert stub section 01 composes so its own settlement tests can
+// assert cause mapping without any ending content. Section 02 overwrites this
+// module with the real derivation (amendment 11). Keep it typed and total; do
+// not grow it here.
+import type { CommitChoice } from './types'
+
+export type EndingId = 'recovery' | 'containment' | 'failure'
+
+/** The committed action and settlement cause this section provides; section
+ *  02 derives the real endingId and the earned-why readback from settled
+ *  metrics. This inert map only pins the shape so evaluate() can attach a
+ *  value and the settlement tests can run: staged -> recovery, hold ->
+ *  containment, every collapsed path (repeat, timeout, forfeit) -> failure. */
+export function deriveEndingId(committed: CommitChoice | null): EndingId {
+  if (committed === 'staged') return 'recovery'
+  if (committed === 'hold') return 'containment'
+  return 'failure'
+}
diff --git a/src/engine/missions/finale/module.ts b/src/engine/missions/finale/module.ts
new file mode 100644
index 0000000..a08696d
--- /dev/null
+++ b/src/engine/missions/finale/module.ts
@@ -0,0 +1,389 @@
+// The GLOBAL FAILSAFE finale mission module and its construction under mission
+// id 'finale'. Pure: it reads authored record truth from the seed captured at
+// construction and never touches Date, Math.random, or timers. The finale
+// registers as a mission module for lifecycle purposes (row 4, unlocked when
+// all three debriefs are acknowledged through the existing engine unlock
+// selector); its three settlement outcomes are the endings.
+//
+// Substate is strictly reference-only: record ids in the slots and ordering, a
+// typed { code, slot } rejection, booleans, integer counters. The case file
+// (records, checks, clues, highlights) is campaign state the shell reads
+// through selectors and threads into VALIDATE / REQUEST FIELD REPORT as a
+// reference bundle; it is never copied into FinaleState. The comparison
+// snapshot is engine-owned and lives outside mission substate entirely.
+//
+// Settlement is synchronous: COMMIT sets `committed` in the same reduce and
+// terminal() returns non-null the instant it is set, so a commit landing in
+// the same wake as the final-phase timeout wins deterministically (the engine
+// polls terminal() after every reduce and drain, and the campaign settle guard
+// is exactly-once). evaluate() maps timeout and forfeit onto the collapsed,
+// repeated-order path.
+import type {
+  EvaluatedOutcome,
+  FoldedConsequences,
+  MissionEvent,
+  MissionModule,
+  SeedDefinition,
+} from '../types'
+import type { SettlementCause } from '../../campaign/types'
+import type { ScheduledEventSpec } from '../../time'
+import { buildRecordGraph } from '../../records'
+import type { EvidenceRecord, RecordGraph } from '../../records'
+import { validateCase, fieldReportLegal } from './caseBuilder'
+import { deriveEndingId } from './endings'
+import { finaleSaveSchema } from './types'
+import type {
+  CaseFileCheck,
+  CommitChoice,
+  FinaleCaseFile,
+  FinaleSlot,
+  FinaleState,
+} from './types'
+
+export const FINALE_MISSION_ID = 'finale'
+
+const START_EVENT_ID = 'finale-start'
+const START_EVENT_KIND = 'finaleStart'
+
+/** Authored content the finale module needs at construction: the seed-wide
+ *  record set (for the case-file graph and the parent-chain root), the
+ *  exercise run id the observation is checked against, and the designated
+ *  field-report record. Mirrors how the other modules close over a payload;
+ *  section 04 assembles one per seed. */
+export interface FinalePayload {
+  readonly records: readonly EvidenceRecord[]
+  readonly claimRunId: string
+  readonly rootRecordId: string
+  readonly fieldReportId: string
+}
+
+/** The schedule a seed authors for the finale. A start-anchored offset-0 event
+ *  stamps the absolute deadline once time begins (start-anchored offsets scale
+ *  under extended time). The 30 and 10 second warnings and finaleFinalPhase are
+ *  end-anchored to endsAt and never scale (amendment 9). Section 04 wires the
+ *  real near-end finaleFinalPhase offset; the seed catalog already authors a
+ *  20-second end-anchored finaleFinalPhase for the shipped seeds. */
+export function finaleSchedule(
+  finalPhaseSecondsBeforeEnd: number,
+  startOffsets: readonly number[] = [],
+): readonly ScheduledEventSpec[] {
+  const specs: ScheduledEventSpec[] = [
+    {
+      id: START_EVENT_ID,
+      offsetSeconds: 0,
+      anchor: 'start',
+      kind: START_EVENT_KIND,
+      payload: null,
+    },
+    {
+      id: 'warn-30',
+      offsetSeconds: 30,
+      anchor: 'end',
+      kind: 'timerMilestone',
+      payload: null,
+    },
+    {
+      id: 'warn-10',
+      offsetSeconds: 10,
+      anchor: 'end',
+      kind: 'timerMilestone',
+      payload: null,
+    },
+    {
+      id: 'final-phase',
+      offsetSeconds: finalPhaseSecondsBeforeEnd,
+      anchor: 'end',
+      kind: 'finaleFinalPhase',
+      payload: null,
+    },
+  ]
+  startOffsets.forEach((offset, index) => {
+    specs.push({
+      id: `finale-beat-${index}`,
+      offsetSeconds: offset,
+      anchor: 'start',
+      kind: 'timerMilestone',
+      payload: null,
+    })
+  })
+  return specs
+}
+
+interface FinaleAction {
+  readonly kind?: string
+  readonly slot?: FinaleSlot
+  readonly recordId?: string | null
+  readonly ordering?: readonly string[]
+  readonly choice?: CommitChoice
+  /** The live reference half of the case file the shell lifts from campaign
+   *  selectors. Record ids and typed outcome codes only, never a reply body. */
+  readonly caseFile?: {
+    readonly sourceChecks?: readonly CaseFileCheck[]
+    readonly inspectedRecords?: readonly string[]
+  }
+}
+
+function isCommitChoice(value: unknown): value is CommitChoice {
+  return value === 'staged' || value === 'hold' || value === 'repeat'
+}
+
+function isSlot(value: unknown): value is FinaleSlot {
+  return (
+    value === 'outlook' ||
+    value === 'flights' ||
+    value === 'bank' ||
+    value === 'root' ||
+    value === 'observation'
+  )
+}
+
+/** Construct the GLOBAL FAILSAFE module over an authored payload. The record
+ *  graph and the static case-file facts are built once; every method stays
+ *  pure over (state, event). */
+export function makeFinaleMission(
+  payload: FinalePayload,
+): MissionModule<FinaleState> {
+  const graph: RecordGraph = buildRecordGraph(payload.records)
+
+  function assembleCaseFile(action: FinaleAction): FinaleCaseFile {
+    const live = action.caseFile ?? {}
+    return {
+      graph,
+      claimRunId: payload.claimRunId,
+      rootRecordId: payload.rootRecordId,
+      fieldReportId: payload.fieldReportId,
+      sourceChecks: live.sourceChecks ?? [],
+      inspectedRecords: live.inspectedRecords ?? [],
+    }
+  }
+
+  function stampDeadline(state: FinaleState, now: number): FinaleState {
+    return state.endsAt === null
+      ? { ...state, endsAt: now + state.durationMs }
+      : state
+  }
+
+  function select(
+    state: FinaleState,
+    slot: FinaleSlot,
+    recordId: string,
+  ): FinaleState {
+    return { ...state, slots: { ...state.slots, [slot]: recordId } }
+  }
+
+  function clear(state: FinaleState, slot: FinaleSlot): FinaleState {
+    return { ...state, slots: { ...state.slots, [slot]: null } }
+  }
+
+  function reorder(state: FinaleState, ordering: readonly string[]): FinaleState {
+    return { ...state, ordering: [...ordering] }
+  }
+
+  /** VALIDATE: delegate to the shared validator, write caseValid and
+   *  lastRejection, and fire the recognition key exactly once on the
+   *  false-to-true transition. The key is the caseValid transition itself; no
+   *  new EngineEvent kind is emitted (emitted stays a closed union). */
+  function validate(state: FinaleState, action: FinaleAction): FinaleState {
+    const result = validateCase(state, assembleCaseFile(action))
+    if (result.ok) {
+      const firstTime = !state.caseValid && !state.recognitionFired
+      return {
+        ...state,
+        caseValid: true,
+        lastRejection: null,
+        recognitionFired: state.recognitionFired || firstTime,
+      }
+    }
+    return {
+      ...state,
+      caseValid: false,
+      lastRejection: { code: result.code, slot: result.slot },
+    }
+  }
+
+  /** REQUEST FIELD REPORT: legal only when no corroborated candidate exists.
+   *  Illegal once one does (a no-op; the structured refusal is the unchanged
+   *  state). Legal: set fieldReportRequested. The shell then dispatches the
+   *  engine desk check (REQUEST_SOURCE_CHECK) against the designated record;
+   *  CHECK SOURCE is engine-owned, so the reply joins campaign.sourceChecks and
+   *  thereafter corroborates the observation slot. */
+  function requestFieldReport(
+    state: FinaleState,
+    action: FinaleAction,
+  ): FinaleState {
+    if (!fieldReportLegal(state, assembleCaseFile(action))) return state
+    return { ...state, fieldReportRequested: true }
+  }
+
+  /** COMMIT: set `committed` once; it never changes thereafter. Settlement is
+   *  synchronous via terminal() polling the committed field in the same reduce. */
+  function commit(state: FinaleState, choice: CommitChoice): FinaleState {
+    if (state.committed !== null) return state
+    return { ...state, committed: choice }
+  }
+
+  function reduceAction(state: FinaleState, event: MissionEvent): FinaleState {
+    const base = stampDeadline(state, event.now)
+    const action = (event.payload ?? {}) as FinaleAction
+    switch (action.kind) {
+      case 'SELECT': {
+        if (!isSlot(action.slot) || typeof action.recordId !== 'string') {
+          return base
+        }
+        return select(base, action.slot, action.recordId)
+      }
+      case 'CLEAR': {
+        if (!isSlot(action.slot)) return base
+        return clear(base, action.slot)
+      }
+      case 'REORDER': {
+        if (!Array.isArray(action.ordering)) return base
+        return reorder(base, action.ordering)
+      }
+      case 'VALIDATE':
+        return validate(base, action)
+      case 'REQUEST_FIELD_REPORT':
+        return requestFieldReport(base, action)
+      case 'RUN_COMPARISON':
+        // Display-only bookkeeping. SECTION-02 SEAM: the real three-future
+        // branch run is pure over the engine-owned snapshot (runBranch); this
+        // module only counts the comparison and never mutates case state or
+        // settles as a side effect.
+        return { ...base, comparisonsRun: base.comparisonsRun + 1 }
+      case 'COMMIT': {
+        if (!isCommitChoice(action.choice)) return base
+        return commit(base, action.choice)
+      }
+      default:
+        return base
+    }
+  }
+
+  return {
+    id: FINALE_MISSION_ID,
+
+    init(
+      _seed: SeedDefinition,
+      _consequences: FoldedConsequences,
+      durationMs: number,
+    ): FinaleState {
+      return {
+        slots: {
+          outlook: null,
+          flights: null,
+          bank: null,
+          root: null,
+          observation: null,
+        },
+        ordering: [],
+        caseValid: false,
+        lastRejection: null,
+        comparisonsRun: 0,
+        fieldReportRequested: false,
+        committed: null,
+        recognitionFired: false,
+        durationMs,
+        endsAt: null,
+      }
+    },
+
+    validate(_state, payloadIn) {
+      const action = payloadIn as FinaleAction | null
+      if (!action || typeof action.kind !== 'string') {
+        return { valid: false, reason: 'MALFORMED ACTION' }
+      }
+      switch (action.kind) {
+        case 'SELECT': {
+          if (!isSlot(action.slot)) {
+            return { valid: false, reason: 'NO SLOT SELECTED' }
+          }
+          if (typeof action.recordId !== 'string') {
+            return { valid: false, reason: 'NO RECORD SELECTED' }
+          }
+          return { valid: true }
+        }
+        case 'CLEAR': {
+          if (!isSlot(action.slot)) {
+            return { valid: false, reason: 'NO SLOT SELECTED' }
+          }
+          return { valid: true }
+        }
+        case 'REORDER': {
+          if (!Array.isArray(action.ordering)) {
+            return { valid: false, reason: 'NO ORDERING SUPPLIED' }
+          }
+          return { valid: true }
+        }
+        case 'VALIDATE':
+        case 'REQUEST_FIELD_REPORT':
+        case 'RUN_COMPARISON':
+          return { valid: true }
+        case 'COMMIT': {
+          if (!isCommitChoice(action.choice)) {
+            return { valid: false, reason: 'NO COMMIT CHOICE' }
+          }
+          return { valid: true }
+        }
+        default:
+          return { valid: false, reason: 'UNKNOWN ACTION' }
+      }
+    },
+
+    reduce(state, event: MissionEvent): FinaleState {
+      // Scheduled events (start, warnings, finaleFinalPhase) only stamp the
+      // deadline; the shell reads the beat off the emitted event's identity.
+      return event.type === 'scheduled'
+        ? stampDeadline(state, event.now)
+        : reduceAction(state, event)
+    },
+
+    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
+      // staged and hold commits settle completed; a repeat commit settles
+      // collapsed; timeout and forfeit map onto the collapsed, repeated-order
+      // path. terminal() already resolved a commit to its cause before the
+      // engine reached any timeout, so the cause the engine hands evaluate is
+      // authoritative; this guard only classifies the non-commit causes.
+      const committed = state.committed
+      const repeatedOrder =
+        cause === 'timeout' || cause === 'forfeit' || committed === 'repeat'
+      const tier = repeatedOrder ? 'failed' : 'full'
+      // SECTION-02 SEAM: endings.ts derives the real endingId and earned-why
+      // readback from settled metrics; this inert map pins the shape so the
+      // committed action and cause section 02 derives from are present here.
+      const endingId = repeatedOrder
+        ? deriveEndingId('repeat')
+        : deriveEndingId(committed)
+      return {
+        missionId: FINALE_MISSION_ID,
+        cause,
+        tier,
+        metrics: {
+          committed_staged: committed === 'staged' ? 1 : 0,
+          committed_hold: committed === 'hold' ? 1 : 0,
+          committed_repeat: committed === 'repeat' ? 1 : 0,
+          case_valid: state.caseValid ? 1 : 0,
+          comparisons_run: state.comparisonsRun,
+          field_report_requested: state.fieldReportRequested ? 1 : 0,
+        },
+        clueId: null,
+        consequences: [],
+        endingId,
+      }
+    },
+
+    /** Polled after every reduce and drain. A commit settles synchronously:
+     *  the instant `committed` is non-null terminal() returns, so the engine
+     *  settles in the same reduce. staged and hold complete; repeat collapses.
+     *  The commit-vs-timeout race is decided here for the commit: a terminal
+     *  result is produced by the reduce that set `committed`, before any
+     *  timeout settlement for a later same-wake event can run, and the campaign
+     *  settle guard is exactly-once, so a timeout cannot override a committed
+     *  recovery. */
+    terminal(state) {
+      if (state.committed === null) return null
+      return state.committed === 'repeat' ? 'collapsed' : 'completed'
+    },
+
+    saveSchema: finaleSaveSchema,
+  }
+}
diff --git a/src/engine/missions/finale/types.ts b/src/engine/missions/finale/types.ts
new file mode 100644
index 0000000..09b81f9
--- /dev/null
+++ b/src/engine/missions/finale/types.ts
@@ -0,0 +1,162 @@
+// GLOBAL FAILSAFE finale substate and its reference-only save schema. The
+// one discipline this file enforces structurally: the persisted substate
+// carries record ids, typed codes, booleans, and integer counters only.
+// Authored copy (record bodies, rejection line text, ending readbacks) lives
+// in the seed payload and the section-03 catalog, never in a save. The case
+// file (records, checks, clues, highlights) is campaign state read through
+// selectors and is never copied into FinaleState. The comparison snapshot is
+// engine-owned and lives outside mission substate entirely; nothing here
+// references it. If a test can smuggle an authored string into a parsed
+// substate, this schema is wrong.
+import * as v from 'valibot'
+import type { RecordGraph } from '../../records'
+import type { SourceCheckOutcome } from '../../records'
+
+const integer = v.pipe(v.number(), v.integer())
+
+/** The five case slots. The three subsystem slots reorder; the root and
+ *  observation slots expose no ordering. One source of truth shared by
+ *  caseBuilder, module, the section-03 catalog, and the section-04 screens. */
+export type FinaleSlot =
+  | 'outlook'
+  | 'flights'
+  | 'bank'
+  | 'root'
+  | 'observation'
+
+export const FINALE_SLOTS: readonly FinaleSlot[] = [
+  'outlook',
+  'flights',
+  'bank',
+  'root',
+  'observation',
+]
+
+/** The three subsystem slots the event-time ordering applies to, in no
+ *  particular order; validation sorts by true event time, not this list. */
+export const SUBSYSTEM_SLOTS: readonly FinaleSlot[] = [
+  'outlook',
+  'flights',
+  'bank',
+]
+
+/** Five stable rejection codes, one per Joshua rejection line family
+ *  (section 03 maps each to an authored line; section 04 renders the slot
+ *  highlight). The codes are the contract; no text lives here. */
+export type RejectionCode =
+  | 'receipt-order'
+  | 'unrelated-source'
+  | 'derived-not-independent'
+  | 'wrong-root'
+  | 'incomplete'
+
+export const REJECTION_CODES: readonly RejectionCode[] = [
+  'receipt-order',
+  'unrelated-source',
+  'derived-not-independent',
+  'wrong-root',
+  'incomplete',
+]
+
+/** The three commit choices. staged and hold settle completed; repeat
+ *  settles collapsed (the repeated-order path timeout and forfeit also map
+ *  onto). */
+export type CommitChoice = 'staged' | 'hold' | 'repeat'
+
+export interface FinaleSlots {
+  readonly outlook: string | null
+  readonly flights: string | null
+  readonly bank: string | null
+  readonly root: string | null
+  readonly observation: string | null
+}
+
+export interface FinaleRejection {
+  readonly code: RejectionCode
+  readonly slot: FinaleSlot
+}
+
+export interface FinaleState {
+  readonly slots: FinaleSlots
+  /** The player's event-time ordering over the three subsystem slots. Record
+   *  ids only; validation checks this matches true event-time order. */
+  readonly ordering: readonly string[]
+  readonly caseValid: boolean
+  readonly lastRejection: FinaleRejection | null
+  /** Display only; branches are pure and this never gates settlement. */
+  readonly comparisonsRun: number
+  readonly fieldReportRequested: boolean
+  readonly committed: CommitChoice | null
+  /** Set once the caseValid false-to-true recognition beat has fired, so the
+   *  key fires exactly once per campaign. Reference boolean, no text. */
+  readonly recognitionFired: boolean
+  /** Materialized finale length in ms, from init. Integer. */
+  readonly durationMs: number
+  /** Absolute deadline in ms, stamped from the first event the module sees.
+   *  Null until then. terminal() and the schedule reason over it. */
+  readonly endsAt: number | null
+}
+
+/** A live source-check fact the shell lifts from campaign.sourceChecks and
+ *  threads into VALIDATE / REQUEST FIELD REPORT. Reference-only: a record id
+ *  and a typed outcome code, never a desk reply body. */
+export interface CaseFileCheck {
+  readonly recordId: string
+  readonly outcome: SourceCheckOutcome
+  /** Honestly carried so a post-settlement field reply renders its pending
+   *  line (section 04); never gates corroboration. */
+  readonly arrivedAfterSettlement?: boolean
+}
+
+/** The campaign-derived facts the pure case builder reads. The static half
+ *  (graph, claimRunId, fieldReportId) comes from the immutable seed the
+ *  module closes over; the live half (sourceChecks, inspectedRecords) the
+ *  shell assembles from campaign selectors and threads through the action
+ *  payload. All reference data: ids, typed codes, integers, booleans. */
+export interface FinaleCaseFile {
+  readonly graph: RecordGraph
+  readonly claimRunId: string
+  readonly rootRecordId: string
+  readonly fieldReportId: string
+  readonly sourceChecks: readonly CaseFileCheck[]
+  readonly inspectedRecords: readonly string[]
+}
+
+const slotsSchema = v.strictObject({
+  outlook: v.nullable(v.string()),
+  flights: v.nullable(v.string()),
+  bank: v.nullable(v.string()),
+  root: v.nullable(v.string()),
+  observation: v.nullable(v.string()),
+})
+
+const rejectionSchema = v.strictObject({
+  code: v.picklist([
+    'receipt-order',
+    'unrelated-source',
+    'derived-not-independent',
+    'wrong-root',
+    'incomplete',
+  ]),
+  slot: v.picklist(['outlook', 'flights', 'bank', 'root', 'observation']),
+})
+
+/** The reference-only save schema. strictObject at every level means any
+ *  field that could carry authored copy (a body array, a line string) is
+ *  structurally rejected. Slots and ordering hold record ids; lastRejection
+ *  holds a typed code and a slot name; everything else is a boolean, a
+ *  picklist code, or an integer. */
+export const finaleSaveSchema = v.strictObject({
+  slots: slotsSchema,
+  ordering: v.array(v.string()),
+  caseValid: v.boolean(),
+  lastRejection: v.nullable(rejectionSchema),
+  comparisonsRun: integer,
+  fieldReportRequested: v.boolean(),
+  committed: v.nullable(v.picklist(['staged', 'hold', 'repeat'])),
+  recognitionFired: v.boolean(),
+  durationMs: integer,
+  endsAt: v.nullable(integer),
+})
+
+export type FinaleStateParsed = v.InferOutput<typeof finaleSaveSchema>
diff --git a/test/engine/missions/finale/caseBuilder.test.ts b/test/engine/missions/finale/caseBuilder.test.ts
new file mode 100644
index 0000000..9308595
--- /dev/null
+++ b/test/engine/missions/finale/caseBuilder.test.ts
@@ -0,0 +1,299 @@
+import { describe, expect, it } from 'vitest'
+import type { CampaignState } from '@engine/campaign/state'
+import {
+  listCandidates,
+  validateCase,
+  fieldReportLegal,
+} from '@engine/missions/finale/caseBuilder'
+import type { FinaleCaseFile, FinaleState } from '@engine/missions/finale/types'
+import { buildRecordGraph } from '@engine/records'
+import {
+  CLAIM_RUN_ID,
+  FIELD_REPORT_ID,
+  FINALE_RECORDS,
+  ROOT_RECORD_ID,
+  act,
+  caseFileFrom,
+  finaleState,
+  startedFinale,
+} from './fixtures'
+
+const graph = buildRecordGraph(FINALE_RECORDS)
+
+function caseFile(
+  live: Partial<Pick<FinaleCaseFile, 'sourceChecks' | 'inspectedRecords'>> = {},
+): FinaleCaseFile {
+  return {
+    graph,
+    claimRunId: CLAIM_RUN_ID,
+    rootRecordId: ROOT_RECORD_ID,
+    fieldReportId: FIELD_REPORT_ID,
+    sourceChecks: live.sourceChecks ?? [],
+    inspectedRecords: live.inspectedRecords ?? [],
+  }
+}
+
+function emptyState(): FinaleState {
+  return {
+    slots: {
+      outlook: null,
+      flights: null,
+      bank: null,
+      root: null,
+      observation: null,
+    },
+    ordering: [],
+    caseValid: false,
+    lastRejection: null,
+    comparisonsRun: 0,
+    fieldReportRequested: false,
+    committed: null,
+    recognitionFired: false,
+    durationMs: 180_000,
+    endsAt: null,
+  }
+}
+
+/** The correct case: C17/F06/B04 in event-time order, root C17, observation a
+ *  corroborated independent OBSERVED record (W02 with its CONFIRMED check). */
+function correctState(): FinaleState {
+  return {
+    ...emptyState(),
+    slots: {
+      outlook: 'C17',
+      flights: 'F06',
+      bank: 'B04',
+      root: 'C17',
+      observation: 'W02',
+    },
+    ordering: ['C17', 'F06', 'B04'],
+  }
+}
+
+const w02Confirmed = caseFile({
+  sourceChecks: [{ recordId: 'W02', outcome: 'CONFIRMED' }],
+})
+
+describe('finale caseBuilder: slot candidates', () => {
+  it('every record from all three missions is a subsystem-slot candidate', () => {
+    const outlook = listCandidates('outlook', caseFile()).map((c) => c.recordId)
+    const flights = listCandidates('flights', caseFile()).map((c) => c.recordId)
+    const bank = listCandidates('bank', caseFile()).map((c) => c.recordId)
+    expect(outlook).toContain('C17')
+    expect(outlook).toContain('S11')
+    expect(flights).toContain('F06')
+    expect(flights).toContain('W02')
+    expect(bank).toContain('B04')
+    expect(bank).toContain('P13')
+  })
+
+  it('inspected records carry the highlight flag', () => {
+    const list = listCandidates('flights', caseFile({ inspectedRecords: ['F06'] }))
+    const f06 = list.find((c) => c.recordId === 'F06')!
+    const w02 = list.find((c) => c.recordId === 'W02')!
+    expect(f06.highlighted).toBe(true)
+    expect(w02.highlighted).toBe(false)
+  })
+
+  it('W02 unchecked lists UNVERIFIED and is not attachable to observation', () => {
+    const list = listCandidates('observation', caseFile())
+    const w02 = list.find((c) => c.recordId === 'W02')!
+    expect(w02.unverified).toBe(true)
+    expect(w02.attachable).toBe(false)
+  })
+
+  it('W02 with a CONFIRMED completed check qualifies and is attachable', () => {
+    const list = listCandidates('observation', w02Confirmed)
+    const w02 = list.find((c) => c.recordId === 'W02')!
+    expect(w02.attachable).toBe(true)
+    expect(w02.unverified).toBeUndefined()
+  })
+
+  it('CONTRADICTED, PENDING, UNKNOWN checks never qualify observation', () => {
+    for (const outcome of ['CONTRADICTED', 'PENDING', 'UNKNOWN'] as const) {
+      const cf = caseFile({ sourceChecks: [{ recordId: 'W02', outcome }] })
+      const list = listCandidates('observation', cf)
+      const w02 = list.find((c) => c.recordId === 'W02')
+      expect(w02?.attachable ?? false).toBe(false)
+    }
+  })
+})
+
+describe('finale caseBuilder: validation (four requirements fixtures)', () => {
+  it('correct case is accepted', () => {
+    expect(validateCase(correctState(), w02Confirmed)).toEqual({ ok: true })
+  })
+
+  it('receipt-time-sorted ordering is rejected with receipt-order', () => {
+    // Receipt times: C17=76445, F06=76492, B04=76470 -> receipt order is
+    // C17, B04, F06, which diverges from event-time C17, F06, B04.
+    const state: FinaleState = {
+      ...correctState(),
+      ordering: ['C17', 'B04', 'F06'],
+    }
+    const result = validateCase(state, w02Confirmed)
+    expect(result).toMatchObject({ ok: false, code: 'receipt-order' })
+  })
+
+  it('an on-time but unrelated observation source is rejected unrelated-source', () => {
+    // E01 is EXERCISE origin, unstamped: not a derivative, but not an
+    // independent OBSERVED corroborator either.
+    const state: FinaleState = {
+      ...correctState(),
+      slots: { ...correctState().slots, observation: 'E01' },
+    }
+    const result = validateCase(state, w02Confirmed)
+    expect(result).toMatchObject({
+      ok: false,
+      code: 'unrelated-source',
+      slot: 'observation',
+    })
+  })
+
+  it('a missing/uncorroborated independent check is rejected unrelated-source', () => {
+    // W02 is independent but has no CONFIRMED check in this case file.
+    const result = validateCase(correctState(), caseFile())
+    expect(result).toMatchObject({
+      ok: false,
+      code: 'unrelated-source',
+      slot: 'observation',
+    })
+  })
+
+  it('same-run derivatives are rejected derived-not-independent', () => {
+    // F06 is DERIVED off C17, run R04: never passes isIndependentObservation.
+    const state: FinaleState = {
+      ...correctState(),
+      slots: { ...correctState().slots, observation: 'F06' },
+    }
+    const result = validateCase(state, w02Confirmed)
+    expect(result).toMatchObject({
+      ok: false,
+      code: 'derived-not-independent',
+      slot: 'observation',
+    })
+  })
+
+  it('a laundered OBSERVED derivative is still derived-not-independent', () => {
+    // L09 is OBSERVED-labelled but parented on F06 (ancestry touches R04).
+    const state: FinaleState = {
+      ...correctState(),
+      slots: { ...correctState().slots, observation: 'L09' },
+      // give L09 a CONFIRMED check so only the independence rule can reject it
+    }
+    const cf = caseFile({ sourceChecks: [{ recordId: 'L09', outcome: 'CONFIRMED' }] })
+    const result = validateCase(state, cf)
+    expect(result).toMatchObject({
+      ok: false,
+      code: 'derived-not-independent',
+      slot: 'observation',
+    })
+  })
+
+  it('a wrong root is rejected wrong-root', () => {
+    const state: FinaleState = {
+      ...correctState(),
+      slots: { ...correctState().slots, root: 'F06' },
+    }
+    const result = validateCase(state, w02Confirmed)
+    expect(result).toMatchObject({ ok: false, code: 'wrong-root', slot: 'root' })
+  })
+
+  it('any empty slot is rejected incomplete, naming the slot', () => {
+    for (const slot of ['outlook', 'flights', 'bank', 'root', 'observation'] as const) {
+      const base = correctState()
+      const state: FinaleState = {
+        ...base,
+        slots: { ...base.slots, [slot]: null },
+      }
+      const result = validateCase(state, w02Confirmed)
+      expect(result).toMatchObject({ ok: false, code: 'incomplete', slot })
+    }
+  })
+
+  it('validation never mutates the slots it reads', () => {
+    const state = correctState()
+    const before = JSON.stringify(state)
+    validateCase(state, caseFile())
+    expect(JSON.stringify(state)).toBe(before)
+  })
+})
+
+describe('finale caseBuilder: rejections through the real engine', () => {
+  it('a rejection carries { code, slot }, leaves slots editable, allows retries', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    let current = state
+    // Fill the case but leave the ordering receipt-sorted (wrong).
+    const fills: Array<[string, string]> = [
+      ['outlook', 'C17'],
+      ['flights', 'F06'],
+      ['bank', 'B04'],
+      ['root', 'C17'],
+      ['observation', 'W02'],
+    ]
+    let now = startedAt + 1_000
+    for (const [slot, recordId] of fills) {
+      current = act(ctx, current, { kind: 'SELECT', slot, recordId }, now).state
+      now += 1_000
+    }
+    current = act(
+      ctx,
+      current,
+      { kind: 'REORDER', ordering: ['C17', 'B04', 'F06'] },
+      now,
+    ).state
+    now += 1_000
+    // No W02 check yet -> this would reject on the observation anyway; request
+    // the field report path is covered elsewhere. Here assert the ordering
+    // rejection is structured and the state stays editable.
+    const validated = act(
+      ctx,
+      current,
+      { kind: 'VALIDATE', caseFile: caseFileFrom(current) },
+      now,
+    )
+    const s = finaleState(validated.state)
+    expect(s.caseValid).toBe(false)
+    expect(s.lastRejection).not.toBeNull()
+    expect(['receipt-order', 'unrelated-source']).toContain(s.lastRejection!.code)
+    // Slots stay editable: a later SELECT changes a slot.
+    now += 1_000
+    const edited = act(
+      ctx,
+      validated.state,
+      { kind: 'SELECT', slot: 'observation', recordId: 'W02' },
+      now,
+    )
+    expect(finaleState(edited.state).slots.observation).toBe('W02')
+    expect(finaleState(edited.state).committed).toBeNull()
+  })
+
+  it('reorder applies only to subsystem slots; root and observation keep no ordering', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const reordered = act(
+      ctx,
+      state,
+      { kind: 'REORDER', ordering: ['B04', 'F06', 'C17'] },
+      startedAt + 1_000,
+    )
+    expect(finaleState(reordered.state).ordering).toEqual(['B04', 'F06', 'C17'])
+  })
+})
+
+describe('finale caseBuilder: field report legality', () => {
+  it('legal when no corroborated candidate exists', () => {
+    expect(fieldReportLegal(emptyState(), caseFile())).toBe(true)
+  })
+
+  it('illegal once a corroborated candidate exists', () => {
+    // W02 confirmed is a corroborated independent candidate.
+    expect(fieldReportLegal(emptyState(), w02Confirmed)).toBe(false)
+  })
+
+  it('illegal once the field report itself has landed', () => {
+    const cf = caseFile({ sourceChecks: [{ recordId: FIELD_REPORT_ID, outcome: 'CONFIRMED' }] })
+    expect(fieldReportLegal(emptyState(), cf)).toBe(false)
+  })
+})
+
+export type { CampaignState }
diff --git a/test/engine/missions/finale/fieldReport.test.ts b/test/engine/missions/finale/fieldReport.test.ts
new file mode 100644
index 0000000..3e310a4
--- /dev/null
+++ b/test/engine/missions/finale/fieldReport.test.ts
@@ -0,0 +1,199 @@
+import { describe, expect, it } from 'vitest'
+import { advanceCampaign, createCampaign, dispatch } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { validateCase } from '@engine/missions/finale/caseBuilder'
+import { buildRecordGraph } from '@engine/records'
+import {
+  CLAIM_RUN_ID,
+  FIELD_REPORT_ID,
+  FINALE_DECISION_MARGIN_MS,
+  FINALE_DURATION_MS,
+  FINALE_ID,
+  FINALE_RECORDS,
+  ROOT_RECORD_ID,
+  act,
+  caseFileFrom,
+  finaleState,
+  makeFinaleContext,
+  startedFinale,
+} from './fixtures'
+import type { FinaleState } from '@engine/missions/finale/types'
+
+const graph = buildRecordGraph(FINALE_RECORDS)
+
+function correctWith(observation: string): FinaleState {
+  return {
+    slots: {
+      outlook: 'C17',
+      flights: 'F06',
+      bank: 'B04',
+      root: 'C17',
+      observation,
+    },
+    ordering: ['C17', 'F06', 'B04'],
+    caseValid: false,
+    lastRejection: null,
+    comparisonsRun: 0,
+    fieldReportRequested: false,
+    committed: null,
+    recognitionFired: false,
+    durationMs: FINALE_DURATION_MS,
+    endsAt: null,
+  }
+}
+
+describe('finale field report: legality through the engine', () => {
+  it('REQUEST FIELD REPORT is legal when no corroborated candidate exists', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const requested = act(
+      ctx,
+      state,
+      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
+      startedAt + 1_000,
+    )
+    expect(finaleState(requested.state).fieldReportRequested).toBe(true)
+  })
+
+  it('illegal once a corroborated candidate exists: a no-op, not a crash', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    // Make W02 a corroborated candidate: request + resolve its desk check.
+    let current = dispatch(
+      ctx,
+      state,
+      { type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' },
+      startedAt + 1_000,
+    ).state
+    current = advanceCampaign(ctx, current, startedAt + 30_000).state
+    // Now a corroborated candidate (W02) exists; the request is a no-op.
+    const requested = act(
+      ctx,
+      current,
+      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(current) },
+      startedAt + 31_000,
+    )
+    expect(finaleState(requested.state).fieldReportRequested).toBe(false)
+  })
+})
+
+describe('finale field report: the bounded-wait flow', () => {
+  it('the reply joins the corroborated list and satisfies the observation slot', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    // Request the field report (finale flag) then dispatch the engine desk
+    // check against the designated record.
+    let current = act(
+      ctx,
+      state,
+      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
+      startedAt + 1_000,
+    ).state
+    current = dispatch(
+      ctx,
+      current,
+      { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
+      startedAt + 1_000,
+    ).state
+    // The desk resolves 20s later.
+    current = advanceCampaign(ctx, current, startedAt + 25_000).state
+    expect(
+      current.sourceChecks.some((c) => c.recordId === FIELD_REPORT_ID),
+    ).toBe(true)
+    // The field report now corroborates the observation slot.
+    const result = validateCase(correctWith(FIELD_REPORT_ID), {
+      graph,
+      claimRunId: CLAIM_RUN_ID,
+      rootRecordId: ROOT_RECORD_ID,
+      fieldReportId: FIELD_REPORT_ID,
+      sourceChecks: caseFileFrom(current).sourceChecks,
+      inspectedRecords: [],
+    })
+    expect(result).toEqual({ ok: true })
+  })
+
+  it('slack: requested at first legality resolves with room to validate and commit', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const endsAt = state.activeMission!.endsAt
+    expect(endsAt).toBe(startedAt + FINALE_DURATION_MS)
+    // Request at the first instant of legality (finale start).
+    let current = act(
+      ctx,
+      state,
+      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
+      startedAt + 1,
+    ).state
+    current = dispatch(
+      ctx,
+      current,
+      { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
+      startedAt + 1,
+    ).state
+    // Resolve the desk. The authored wait (20s) is bounded well below
+    // finaleDuration minus the decision margin.
+    current = advanceCampaign(ctx, current, startedAt + 25_000).state
+    const resolvedAt = current.sourceChecks.find(
+      (c) => c.recordId === FIELD_REPORT_ID,
+    )!.resolvedAt
+    const commitDeadline = endsAt - FINALE_DECISION_MARGIN_MS
+    // The reply lands with the full decision margin still ahead of it.
+    expect(resolvedAt).toBeLessThanOrEqual(commitDeadline)
+    expect(commitDeadline - resolvedAt).toBeGreaterThan(0)
+  })
+
+  it('available after any combination of mission failures (all-failed fixture)', () => {
+    const ctx = makeFinaleContext()
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, 1_000_000)
+    // Fail every mission by forfeit, then acknowledge. Finale still unlocks and
+    // the field report is still requestable.
+    for (const [i, missionId] of ['alpha', 'beta', 'gamma'].entries()) {
+      const at = 1_000_000 + i * 300_000
+      state = dispatch(ctx, state, { type: 'START_MISSION', missionId }, at).state
+      state = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, at + 1_000).state
+      state = dispatch(
+        ctx,
+        state,
+        { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
+        at + 2_000,
+      ).state
+    }
+    const finaleStart = 1_000_000 + 900_000
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'START_MISSION', missionId: FINALE_ID },
+      finaleStart,
+    ).state
+    const requested = act(
+      ctx,
+      state,
+      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
+      finaleStart + 1_000,
+    )
+    expect(finaleState(requested.state).fieldReportRequested).toBe(true)
+  })
+})
+
+describe('finale field report: post-settlement reply', () => {
+  it('a reply arriving post-settlement is recorded with arrivedAfterSettlement', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    // Request the field report desk check, then commit (settling the finale)
+    // before the desk reply lands. The reply arrives after settlement.
+    let current = dispatch(
+      ctx,
+      state,
+      { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
+      startedAt + 1_000,
+    ).state
+    current = act(
+      ctx,
+      current,
+      { kind: 'COMMIT', choice: 'hold' },
+      startedAt + 2_000,
+    ).state
+    expect(current.settled.some((s) => s.missionId === FINALE_ID)).toBe(true)
+    // Now advance past the desk delay; the reply lands post-settlement.
+    current = advanceCampaign(ctx, current, startedAt + 25_000).state
+    const check = current.sourceChecks.find((c) => c.recordId === FIELD_REPORT_ID)!
+    expect(check.arrivedAfterSettlement).toBe(true)
+  })
+})
+
+export type { CampaignState }
diff --git a/test/engine/missions/finale/fixtures.ts b/test/engine/missions/finale/fixtures.ts
new file mode 100644
index 0000000..3b137c0
--- /dev/null
+++ b/test/engine/missions/finale/fixtures.ts
@@ -0,0 +1,219 @@
+// Finale test fixtures: a real engine context with three test-double
+// missions plus the finale module registered under id 'finale', driven
+// through the real dispatch. The record graph is the shared records fixture
+// (C17 the exercise-export root, F06/B04 the subsystem derivatives, W02 the
+// independent OBSERVED corroborator, plus the taint cases). Campaign facts the
+// finale reads (sourceChecks, inspectedRecords) are produced by real dispatch,
+// never hand-stitched.
+import type { EngineContext } from '@engine/campaign/engine'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import type { SeedDefinition } from '@engine/missions/types'
+import type { EvidenceRecord } from '@engine/records'
+import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
+import { makeFinaleMission, finaleSchedule } from '@engine/missions/finale/module'
+import type { FinalePayload } from '@engine/missions/finale/module'
+import type { FinaleState } from '@engine/missions/finale/types'
+import type { CaseFileCheck } from '@engine/missions/finale/types'
+import { FIXTURE_RECORDS } from '../../records/fixtures'
+
+// The designated finale field report (amendment 12): an OBSERVED, independent
+// record distinct from the in-play corroborator W02, desk-answerable inside the
+// bounded wait. Added locally so the shared records fixture stays untouched.
+export const FR01: EvidenceRecord = {
+  id: 'FR01',
+  origin: 'OBSERVED',
+  sourceId: 'FIELD-DESK',
+  parentId: null,
+  runId: null,
+  eventTime: 76520,
+  receiptTime: 76530,
+  subsystem: 'flights',
+  body: ['FIELD REPORT ON SCOPE: LOCAL DISRUPTION ONLY'],
+}
+
+export const FINALE_RECORDS: EvidenceRecord[] = [...FIXTURE_RECORDS, FR01]
+
+export const MISSIONS = ['alpha', 'beta', 'gamma'] as const
+export const FINALE_ID = 'finale'
+
+/** The exercise run the whole fixture graph is stamped with (R04), the
+ *  parent-chain root (C17's exercise export), and the designated field-report
+ *  record (R21 is not in the small fixture graph; the field report in this
+ *  fixture is W02's desk, so we designate a dedicated observed record). The
+ *  field report in this fixture is a separate OBSERVED record the player can
+ *  request; we reuse W02 as a stand-in corroborator and designate a distinct
+ *  field-report record id present in the graph. */
+export const CLAIM_RUN_ID = 'R04'
+export const ROOT_RECORD_ID = 'C17'
+/** The finale field report: FR01, an OBSERVED, independent record distinct
+ *  from the in-play corroborator W02. Its desk reply corroborates the
+ *  observation slot. */
+export const FIELD_REPORT_ID = 'FR01'
+
+const FINALE_PAYLOAD: FinalePayload = {
+  records: FINALE_RECORDS,
+  claimRunId: CLAIM_RUN_ID,
+  rootRecordId: ROOT_RECORD_ID,
+  fieldReportId: FIELD_REPORT_ID,
+}
+
+const SEED_OVERRIDES: Partial<SeedDefinition> = {
+  records: FINALE_RECORDS,
+  deskChecks: [
+    {
+      recordId: 'W02',
+      outcome: 'CONFIRMED',
+      delaySeconds: 20,
+      replyBody: ['FIELD DESK CONFIRMS LOCAL SCOPE'],
+    },
+    {
+      recordId: 'FR01',
+      outcome: 'CONFIRMED',
+      delaySeconds: 20,
+      replyBody: ['FIELD DESK CONFIRMS: LOCAL DISRUPTION ONLY'],
+    },
+    {
+      recordId: 'F06',
+      outcome: 'UNKNOWN',
+      delaySeconds: 15,
+      replyBody: ['NO DESK RECORD'],
+    },
+    {
+      recordId: 'B04',
+      outcome: 'PENDING',
+      delaySeconds: 15,
+      replyBody: ['DESK QUEUE BACKED UP'],
+    },
+    {
+      recordId: 'L09',
+      outcome: 'CONFIRMED',
+      delaySeconds: 20,
+      replyBody: ['RELAY DESK CONFIRMS AS RELAYED'],
+    },
+    {
+      recordId: 'S11',
+      outcome: 'CONFIRMED',
+      delaySeconds: 20,
+      replyBody: ['SCENARIO TAP CONFIRMS'],
+    },
+  ],
+  clueRecords: [{ recordId: 'F06', clueId: 'clue-restriction' }],
+  // Standard finale is three minutes (180_000 ms); finaleFinalPhase sits 20s
+  // before endsAt. A field report requested at first legality resolves in 20s
+  // (well inside finaleDuration minus the 60s decision margin).
+  schedules: {
+    alpha: [],
+    beta: [],
+    gamma: [],
+    finale: finaleSchedule(20),
+  },
+  missionDurationsMs: {
+    alpha: 240_000,
+    beta: 240_000,
+    gamma: 240_000,
+    finale: 180_000,
+  },
+}
+
+export const FINALE_DURATION_MS = 180_000
+export const FINALE_DECISION_MARGIN_MS = 60_000
+
+export function makeFinaleContext(): EngineContext {
+  const base = buildTestContext(FINALE_RECORDS, SEED_OVERRIDES)
+  return {
+    ...base,
+    missions: {
+      alpha: makeTestDoubleMission('alpha'),
+      beta: makeTestDoubleMission('beta'),
+      gamma: makeTestDoubleMission('gamma'),
+      finale: makeFinaleMission(FINALE_PAYLOAD),
+    },
+    missionOrder: [...MISSIONS],
+  }
+}
+
+/** Play a test-double mission to full and acknowledge its debrief, so the
+ *  finale unlock (all three debriefs acknowledged) is reachable. */
+export function winAndAck(
+  ctx: EngineContext,
+  state: CampaignState,
+  missionId: string,
+  startAt: number,
+): CampaignState {
+  const envelopes: Array<[CampaignAction, number]> = [
+    [{ type: 'START_MISSION', missionId }, startAt],
+    [{ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, startAt + 1_000],
+    [{ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, startAt + 2_000],
+    [{ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, startAt + 3_000],
+    [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, startAt + 4_000],
+  ]
+  let current = state
+  for (const [action, now] of envelopes) {
+    current = dispatch(ctx, current, action, now).state
+  }
+  return current
+}
+
+export interface FinaleFixture {
+  readonly ctx: EngineContext
+  readonly state: CampaignState
+  readonly startedAt: number
+}
+
+/** A campaign with all three missions won and acknowledged and the finale
+ *  started. Returns the context and the live state at finale start. */
+export function startedFinale(startAt = 1_000_000): FinaleFixture {
+  const ctx = makeFinaleContext()
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, startAt)
+  state = winAndAck(ctx, state, 'alpha', startAt)
+  state = winAndAck(ctx, state, 'beta', startAt + 300_000)
+  state = winAndAck(ctx, state, 'gamma', startAt + 600_000)
+  const finaleStart = startAt + 900_000
+  const started = dispatch(
+    ctx,
+    state,
+    { type: 'START_MISSION', missionId: FINALE_ID },
+    finaleStart,
+  )
+  return { ctx, state: started.state, startedAt: finaleStart }
+}
+
+/** Read the live finale substate. */
+export function finaleState(state: CampaignState): FinaleState {
+  return state.activeMission?.substate as FinaleState
+}
+
+/** The live case-file reference facts the shell lifts from campaign selectors
+ *  and threads into VALIDATE / REQUEST FIELD REPORT. Reference-only. */
+export function caseFileFrom(state: CampaignState): {
+  sourceChecks: CaseFileCheck[]
+  inspectedRecords: string[]
+} {
+  return {
+    sourceChecks: state.sourceChecks.map((c) => ({
+      recordId: c.recordId,
+      outcome: c.outcome,
+      arrivedAfterSettlement: c.arrivedAfterSettlement,
+    })),
+    inspectedRecords: [...state.inspectedRecords],
+  }
+}
+
+/** Dispatch a finale MISSION_ACTION and return the next state. */
+export function act(
+  ctx: EngineContext,
+  state: CampaignState,
+  payload: unknown,
+  now: number,
+): { state: CampaignState; emitted: readonly EngineEvent[] } {
+  const result = dispatch(ctx, state, { type: 'MISSION_ACTION', payload }, now)
+  return { state: result.state, emitted: result.emitted }
+}
+
+export { advanceCampaign, dispatch, createCampaign }
diff --git a/test/engine/missions/finale/recognition.test.ts b/test/engine/missions/finale/recognition.test.ts
new file mode 100644
index 0000000..4bc4a89
--- /dev/null
+++ b/test/engine/missions/finale/recognition.test.ts
@@ -0,0 +1,141 @@
+import { describe, expect, it } from 'vitest'
+import type { CampaignState } from '@engine/campaign/state'
+import {
+  FIELD_REPORT_ID,
+  act,
+  advanceCampaign,
+  caseFileFrom,
+  dispatch,
+  finaleState,
+  startedFinale,
+} from './fixtures'
+
+/** Fill the five slots correctly and corroborate the observation via the
+ *  field report desk, returning the live state poised to validate true. */
+function fillCorrectCase(
+  ctx: ReturnType<typeof startedFinale>['ctx'],
+  state: CampaignState,
+  startedAt: number,
+): CampaignState {
+  let current = state
+  // Corroborate the observation: request + resolve the field report desk.
+  current = dispatch(
+    ctx,
+    current,
+    { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
+    startedAt + 500,
+  ).state
+  current = advanceCampaign(ctx, current, startedAt + 25_000).state
+  const fills: Array<[string, string]> = [
+    ['outlook', 'C17'],
+    ['flights', 'F06'],
+    ['bank', 'B04'],
+    ['root', 'C17'],
+    ['observation', FIELD_REPORT_ID],
+  ]
+  let now = startedAt + 26_000
+  for (const [slot, recordId] of fills) {
+    current = act(ctx, current, { kind: 'SELECT', slot, recordId }, now).state
+    now += 1_000
+  }
+  current = act(
+    ctx,
+    current,
+    { kind: 'REORDER', ordering: ['C17', 'F06', 'B04'] },
+    now,
+  ).state
+  return current
+}
+
+describe('finale recognition beat', () => {
+  it('keys on the caseValid false-to-true transition and fires exactly once', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const ready = fillCorrectCase(ctx, state, startedAt)
+    const cf = caseFileFrom(ready)
+    let now = startedAt + 40_000
+
+    // First validate: false -> true. Recognition fires.
+    const first = act(ctx, ready, { kind: 'VALIDATE', caseFile: cf }, now)
+    const afterFirst = finaleState(first.state)
+    expect(afterFirst.caseValid).toBe(true)
+    expect(afterFirst.recognitionFired).toBe(true)
+
+    // Break it (clear a slot), validate again (now false): recognition stays
+    // fired, caseValid goes false.
+    now += 1_000
+    const broken = act(
+      ctx,
+      first.state,
+      { kind: 'CLEAR', slot: 'observation' },
+      now,
+    ).state
+    now += 1_000
+    const invalid = act(
+      ctx,
+      broken,
+      { kind: 'VALIDATE', caseFile: caseFileFrom(broken) },
+      now,
+    )
+    expect(finaleState(invalid.state).caseValid).toBe(false)
+    expect(finaleState(invalid.state).recognitionFired).toBe(true)
+
+    // Fix it and re-validate true: recognitionFired does NOT re-fire (it was
+    // already true; the beat is observable exactly once per campaign).
+    now += 1_000
+    const refixed = act(
+      ctx,
+      invalid.state,
+      { kind: 'SELECT', slot: 'observation', recordId: FIELD_REPORT_ID },
+      now,
+    ).state
+    now += 1_000
+    const revalid = act(
+      ctx,
+      refixed,
+      { kind: 'VALIDATE', caseFile: caseFileFrom(refixed) },
+      now,
+    )
+    expect(finaleState(revalid.state).caseValid).toBe(true)
+    expect(finaleState(revalid.state).recognitionFired).toBe(true)
+  })
+
+  it('a later re-validation of an already-valid case does not re-fire', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const ready = fillCorrectCase(ctx, state, startedAt)
+    let now = startedAt + 40_000
+    const first = act(
+      ctx,
+      ready,
+      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
+      now,
+    )
+    expect(finaleState(first.state).recognitionFired).toBe(true)
+    // Edit a subsystem slot to the same value, re-validate: still valid, still
+    // fired, no second firing observable (recognitionFired is a latch).
+    now += 1_000
+    const second = act(
+      ctx,
+      first.state,
+      { kind: 'VALIDATE', caseFile: caseFileFrom(first.state) },
+      now,
+    )
+    expect(finaleState(second.state).caseValid).toBe(true)
+    expect(finaleState(second.state).recognitionFired).toBe(true)
+  })
+
+  it('no new EngineEvent kind is emitted on validation; emitted stays closed', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const ready = fillCorrectCase(ctx, state, startedAt)
+    const result = act(
+      ctx,
+      ready,
+      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
+      startedAt + 40_000,
+    )
+    // The only known kinds are the engine's closed union; no 'recognition'
+    // event exists.
+    for (const e of result.emitted) {
+      expect(e.type).not.toBe('recognition')
+    }
+  })
+})
diff --git a/test/engine/missions/finale/schedule.test.ts b/test/engine/missions/finale/schedule.test.ts
new file mode 100644
index 0000000..6a35887
--- /dev/null
+++ b/test/engine/missions/finale/schedule.test.ts
@@ -0,0 +1,126 @@
+import { describe, expect, it } from 'vitest'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { selectMenuRows } from '@engine/campaign/selectors'
+import { snapshot } from '@engine/branch'
+import { materializeSchedule } from '@engine/time'
+import { finaleSchedule } from '@engine/missions/finale/module'
+import {
+  FINALE_DURATION_MS,
+  FINALE_ID,
+  MISSIONS,
+  advanceCampaign,
+  makeFinaleContext,
+  startedFinale,
+  winAndAck,
+} from './fixtures'
+
+const specs = finaleSchedule(20)
+
+function at(id: string, queue: ReturnType<typeof materializeSchedule>['queue']): number {
+  return queue.find((e) => e.id === id)!.scheduledAt
+}
+
+describe('finale schedule: durations and scaling', () => {
+  it('standard duration is three minutes; extended is six', () => {
+    const start = 1_000_000
+    const std = materializeSchedule(specs, start, 'standard', FINALE_DURATION_MS)
+    const ext = materializeSchedule(specs, start, 'extended', FINALE_DURATION_MS)
+    expect(std.endsAt - start).toBe(FINALE_DURATION_MS)
+    expect(ext.endsAt - start).toBe(FINALE_DURATION_MS * 2)
+  })
+
+  it('start-anchored authored offsets scale proportionally under extended time', () => {
+    const start = 1_000_000
+    // Add a start-anchored beat at 60s to prove scaling.
+    const withBeat = finaleSchedule(20, [60])
+    const std = materializeSchedule(withBeat, start, 'standard', FINALE_DURATION_MS)
+    const ext = materializeSchedule(withBeat, start, 'extended', FINALE_DURATION_MS)
+    expect(at('finale-beat-0', std.queue) - start).toBe(60_000)
+    expect(at('finale-beat-0', ext.queue) - start).toBe(120_000)
+  })
+
+  it('end-anchored warnings and finaleFinalPhase anchor to endsAt and do NOT scale', () => {
+    const start = 1_000_000
+    const std = materializeSchedule(specs, start, 'standard', FINALE_DURATION_MS)
+    const ext = materializeSchedule(specs, start, 'extended', FINALE_DURATION_MS)
+    // Each end-anchored event is exactly its authored offset before endsAt in
+    // BOTH durations (the amendment 9 carve-out).
+    expect(std.endsAt - at('warn-30', std.queue)).toBe(30_000)
+    expect(ext.endsAt - at('warn-30', ext.queue)).toBe(30_000)
+    expect(std.endsAt - at('warn-10', std.queue)).toBe(10_000)
+    expect(ext.endsAt - at('warn-10', ext.queue)).toBe(10_000)
+    expect(std.endsAt - at('final-phase', std.queue)).toBe(20_000)
+    expect(ext.endsAt - at('final-phase', ext.queue)).toBe(20_000)
+  })
+})
+
+describe('finale schedule: finaleFinalPhase emits exactly once', () => {
+  it('emits one finaleFinalPhase at its scheduled wake and not again', () => {
+    const { ctx, state } = startedFinale()
+    const endsAt = state.activeMission!.endsAt
+    const finalPhaseAt = endsAt - 20_000
+    // Advance to just past the final-phase wake, short of the deadline.
+    const first = advanceCampaign(ctx, state, finalPhaseAt + 1_000)
+    expect(first.emitted.filter((e) => e.type === 'finaleFinalPhase')).toHaveLength(1)
+    // A further advance (still before endsAt) does not re-emit it.
+    const second = advanceCampaign(ctx, first.state, endsAt - 5_000)
+    expect(second.emitted.filter((e) => e.type === 'finaleFinalPhase')).toHaveLength(0)
+  })
+})
+
+describe('finale registration: row 4, unlock, snapshot seam', () => {
+  it('registers as row 4, unlocked when all three debriefs are acknowledged', () => {
+    const ctx = makeFinaleContext()
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, 1_000_000)
+    // Before any debrief, the finale is not among the menu rows.
+    let rows = selectMenuRows(state, [...MISSIONS], FINALE_ID)
+    expect(rows.finaleUnlocked).toBe(false)
+    expect(rows.rows.some((r) => r.missionId === FINALE_ID)).toBe(false)
+
+    state = winAndAck(ctx, state, 'alpha', 1_000_000)
+    state = winAndAck(ctx, state, 'beta', 1_300_000)
+    state = winAndAck(ctx, state, 'gamma', 1_600_000)
+
+    rows = selectMenuRows(state, [...MISSIONS], FINALE_ID)
+    expect(rows.finaleUnlocked).toBe(true)
+    // Row 4: appended after the three mission rows.
+    expect(rows.rows).toHaveLength(4)
+    expect(rows.rows[3]!.missionId).toBe(FINALE_ID)
+  })
+
+  it('unlocks regardless of mission outcomes (all-failed by forfeit still unlocks)', () => {
+    const ctx = makeFinaleContext()
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, 1_000_000)
+    for (const [i, missionId] of [...MISSIONS].entries()) {
+      const start = 1_000_000 + i * 300_000
+      state = dispatch(ctx, state, { type: 'START_MISSION', missionId }, start).state
+      state = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, start + 1_000).state
+      state = dispatch(
+        ctx,
+        state,
+        { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
+        start + 2_000,
+      ).state
+    }
+    expect(
+      selectMenuRows(state, [...MISSIONS], FINALE_ID).finaleUnlocked,
+    ).toBe(true)
+  })
+
+  it('START materializes the schedule and the campaign is snapshot-able at finale start', () => {
+    const { state } = startedFinale()
+    // The schedule materialized: the mission queue carries the finale events.
+    const ids = state.missionQueue.map((e) => e.id)
+    expect(ids).toContain('final-phase')
+    expect(ids).toContain('warn-30')
+    expect(ids).toContain('warn-10')
+    // The engine-owned snapshot seam: the live campaign is frozen for the
+    // zero-player comparisons (section 02 runs the branches over it).
+    const frozen = snapshot(state)
+    expect(frozen.activeMission?.missionId).toBe(FINALE_ID)
+    expect(Object.isFrozen(frozen)).toBe(true)
+  })
+})
+
+export type { CampaignState }
diff --git a/test/engine/missions/finale/settlement.test.ts b/test/engine/missions/finale/settlement.test.ts
new file mode 100644
index 0000000..eb71477
--- /dev/null
+++ b/test/engine/missions/finale/settlement.test.ts
@@ -0,0 +1,216 @@
+import { describe, expect, it } from 'vitest'
+import * as v from 'valibot'
+import type { CampaignState } from '@engine/campaign/state'
+import type { EngineEvent } from '@engine/campaign/types'
+import { finaleSaveSchema } from '@engine/missions/finale/types'
+import type { FinaleState } from '@engine/missions/finale/types'
+import {
+  FINALE_ID,
+  act,
+  advanceCampaign,
+  caseFileFrom,
+  dispatch,
+  finaleState,
+  startedFinale,
+} from './fixtures'
+
+function settledFinale(state: CampaignState) {
+  return state.settled.find((s) => s.missionId === FINALE_ID) ?? null
+}
+
+describe('finale settlement: committed transition', () => {
+  it('committed moves null -> staged | hold | repeat and never changes', () => {
+    for (const choice of ['staged', 'hold', 'repeat'] as const) {
+      const { ctx, state, startedAt } = startedFinale()
+      expect(finaleState(state).committed).toBeNull()
+      const committed = act(ctx, state, { kind: 'COMMIT', choice }, startedAt + 1_000)
+      const outcome = settledFinale(committed.state)
+      expect(outcome).not.toBeNull()
+      // The finale settled; the substate committed value is frozen in the
+      // runtime handed to evaluate. Assert via the settled metrics.
+      expect(outcome!.metrics[`committed_${choice}`]).toBe(1)
+    }
+  })
+
+  it('a duplicate commit after settlement does not re-settle or change the outcome', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const first = act(ctx, state, { kind: 'COMMIT', choice: 'staged' }, startedAt + 1_000)
+    const firstOutcome = settledFinale(first.state)!
+    // A second commit dispatch is rejected (no active mission) and settles
+    // nothing new.
+    const second = dispatch(
+      ctx,
+      first.state,
+      { type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice: 'repeat' } },
+      startedAt + 2_000,
+    )
+    expect(second.rejection).not.toBeNull()
+    expect(settledFinale(second.state)).toEqual(firstOutcome)
+    expect(second.state.settled.filter((s) => s.missionId === FINALE_ID)).toHaveLength(1)
+  })
+})
+
+describe('finale settlement: cause mapping', () => {
+  it('staged and hold commits settle completed', () => {
+    for (const choice of ['staged', 'hold'] as const) {
+      const { ctx, state, startedAt } = startedFinale()
+      const committed = act(ctx, state, { kind: 'COMMIT', choice }, startedAt + 1_000)
+      expect(settledFinale(committed.state)!.cause).toBe('completed')
+    }
+  })
+
+  it('a repeat commit settles collapsed', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const committed = act(ctx, state, { kind: 'COMMIT', choice: 'repeat' }, startedAt + 1_000)
+    expect(settledFinale(committed.state)!.cause).toBe('collapsed')
+  })
+
+  it('timeout settles collapsed (the repeated-order path)', () => {
+    const { ctx, state } = startedFinale()
+    const endsAt = state.activeMission!.endsAt
+    const timedOut = advanceCampaign(ctx, state, endsAt + 1_000)
+    const outcome = settledFinale(timedOut.state)!
+    expect(outcome.cause).toBe('timeout')
+    expect(outcome.tier).toBe('failed')
+  })
+
+  it('forfeit settles collapsed (the repeated-order path)', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const forfeited = dispatch(
+      ctx,
+      state,
+      { type: 'FORFEIT_MISSION' },
+      startedAt + 1_000,
+    )
+    const outcome = settledFinale(forfeited.state)!
+    expect(outcome.cause).toBe('forfeit')
+    expect(outcome.tier).toBe('failed')
+  })
+})
+
+describe('finale settlement: exactly once', () => {
+  it('no second settlement from a later wake after a commit', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const committed = act(ctx, state, { kind: 'COMMIT', choice: 'hold' }, startedAt + 1_000)
+    const before = committed.state.settled.length
+    const settleSeq = settledFinale(committed.state)!.settleSeq
+    // Advance far past the deadline; no re-settle.
+    const later = advanceCampaign(ctx, committed.state, startedAt + 1_000_000)
+    expect(later.state.settled.length).toBe(before)
+    expect(settledFinale(later.state)!.settleSeq).toBe(settleSeq)
+    // No settlement event in the later wake.
+    expect(later.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+  })
+})
+
+describe('finale settlement: commit-vs-timeout race guard', () => {
+  it('a commit during the final phase settles completed, finaleFinalPhase drains in the same wake', () => {
+    const { ctx, state } = startedFinale()
+    const endsAt = state.activeMission!.endsAt
+    // finaleFinalPhase fires 20s before endsAt. Dispatch COMMIT at a now in the
+    // final phase (after the finaleFinalPhase scheduledAt, before endsAt) so
+    // the final-phase event drains in the SAME wake as the commit reduces.
+    const finalPhaseAt = endsAt - 20_000
+    const now = finalPhaseAt + 5_000
+    expect(now).toBeLessThan(endsAt)
+    const result = dispatch(
+      ctx,
+      state,
+      { type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice: 'staged' } },
+      now,
+    )
+    // The final-phase beat emitted in this wake AND the commit settled completed.
+    const events: EngineEvent[] = [...result.emitted]
+    expect(events.some((e) => e.type === 'finaleFinalPhase')).toBe(true)
+    const outcome = settledFinale(result.state)!
+    expect(outcome.cause).toBe('completed')
+    expect(outcome.metrics['committed_staged']).toBe(1)
+    // Settled exactly once.
+    expect(result.state.settled.filter((s) => s.missionId === FINALE_ID)).toHaveLength(1)
+  })
+
+  it('once committed, a timeout arriving in a later wake cannot override the committed recovery', () => {
+    const { ctx, state } = startedFinale()
+    const endsAt = state.activeMission!.endsAt
+    // Commit in the final phase, before endsAt.
+    const committed = dispatch(
+      ctx,
+      state,
+      { type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice: 'staged' } },
+      endsAt - 10_000,
+    )
+    expect(settledFinale(committed.state)!.cause).toBe('completed')
+    // Now cross the deadline; the timeout path finds the finale already settled.
+    const crossed = advanceCampaign(ctx, committed.state, endsAt + 5_000)
+    const outcome = settledFinale(crossed.state)!
+    expect(outcome.cause).toBe('completed')
+    expect(crossed.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+  })
+
+  it('terminal() returns non-null the instant committed is set, in the same reduce', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    // Without the final phase in play: a plain commit still settles in the same
+    // dispatch, proving terminal() fires synchronously off the committed field.
+    const committed = act(ctx, state, { kind: 'COMMIT', choice: 'hold' }, startedAt + 1_000)
+    expect(committed.state.activeMission).toBeNull()
+    expect(settledFinale(committed.state)).not.toBeNull()
+  })
+})
+
+describe('finale settlement: comparisonsRun is display-only', () => {
+  it('incrementing comparisonsRun causes no settlement or committed mutation', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    let current = state
+    let now = startedAt + 1_000
+    for (let i = 0; i < 3; i += 1) {
+      current = act(ctx, current, { kind: 'RUN_COMPARISON' }, now).state
+      now += 1_000
+    }
+    const s = finaleState(current)
+    expect(s.comparisonsRun).toBe(3)
+    expect(s.committed).toBeNull()
+    expect(current.settled.some((x) => x.missionId === FINALE_ID)).toBe(false)
+    expect(current.activeMission).not.toBeNull()
+  })
+})
+
+describe('finale settlement: save/load round trip', () => {
+  it('FinaleState survives the saveSchema unchanged, including lastRejection and fieldReportRequested', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    // Produce a rejection and request the field report, so both fields carry
+    // non-default values.
+    let current = act(
+      ctx,
+      state,
+      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
+      startedAt + 500,
+    ).state
+    current = act(
+      ctx,
+      current,
+      { kind: 'SELECT', slot: 'outlook', recordId: 'C17' },
+      startedAt + 1_000,
+    ).state
+    current = act(
+      ctx,
+      current,
+      { kind: 'VALIDATE', caseFile: caseFileFrom(current) },
+      startedAt + 2_000,
+    ).state
+    const substate: FinaleState = finaleState(current)
+    expect(substate.lastRejection).not.toBeNull()
+    expect(substate.fieldReportRequested).toBe(true)
+    const revived = v.parse(finaleSaveSchema, JSON.parse(JSON.stringify(substate)))
+    expect(revived).toEqual(substate)
+  })
+
+  it('the saveSchema structurally rejects a smuggled authored string', () => {
+    const { ctx, state, startedAt } = startedFinale()
+    const substate = finaleState(
+      act(ctx, state, { kind: 'SELECT', slot: 'root', recordId: 'C17' }, startedAt + 1_000).state,
+    )
+    expect(() =>
+      v.parse(finaleSaveSchema, { ...(substate as object), body: ['SMUGGLED COPY'] }),
+    ).toThrow()
+  })
+})
