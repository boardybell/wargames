diff --git a/src/engine/missions/outlook/content.ts b/src/engine/missions/outlook/content.ts
index 51d261c..c22601b 100644
--- a/src/engine/missions/outlook/content.ts
+++ b/src/engine/missions/outlook/content.ts
@@ -4,7 +4,8 @@
 // Desk-check outcomes deliberately do NOT live here. They stay in the
 // shared SeedDefinition.deskChecks table keyed by record id.
 import type { OutcomeTier } from '../../campaign/types'
-import type { OutlookMessage } from './types'
+import type { DeskCheckEntry } from '../types'
+import type { DeskId, OutlookMessage, RequiredKind } from './types'
 
 /** Channel tuning. Every value is an integer: a capacity count, or an ETA
  *  in whole seconds. Primary ETA is indexed by the live stage (0 full, 1
@@ -54,3 +55,277 @@ export interface OutlookPayload {
   readonly warningOffsets: readonly [WarningOffset, WarningOffset]
   readonly commsDelayedTable: CommsDelayedTable
 }
+
+// ── Content validation ──────────────────────────────────────────────
+// A PURE authoring gate. It never throws: it returns a list of
+// structured errors so one run names every mistake in the authored
+// content. The solvability invariants are NOT validator rules; they need
+// the module lifecycle and live in the solvability fixture tests. Each
+// rule below maps one-to-one to a "Tests first" bullet in the section
+// spec, so a dropped rule shows up as a dropped test.
+
+/** The per-seed expected record and run anchors. The fixture seed's
+ *  anchors are the canonical C17 / EXERCISE / R04 / 21:14 values; seeds
+ *  two and three supply their own equivalents. One table so the validator
+ *  and the tests share a single source of truth. */
+export interface SeedAnchors {
+  /** The exercise run stamp the audit export carries (R04 equivalent). */
+  readonly runId: string
+  /** The record the audit message references: the D-83 export feed record
+   *  that carries the run stamp (C17 equivalent). */
+  readonly exportRecordId: string
+  /** The record the EXERCISE bulletin's TRACE reaches (C17 equivalent).
+   *  For the fixture this is C17 itself. */
+  readonly bulletinRecordId: string
+  /** The OBSERVED field observation the live weather correction cites
+   *  (W02 equivalent), which the desk confirms. */
+  readonly weatherObservationRecordId: string
+  /** The verbatim event clock the fixture anchor embeds (21:14:00). */
+  readonly eventClock: string
+  /** The verbatim receipt clock the fixture anchor embeds (21:14:05). */
+  readonly receiptClock: string
+}
+
+export type ContentErrorCode =
+  | 'REQUIRED_HEAD_COUNT'
+  | 'MESSAGE_COUNT'
+  | 'MESSAGE_IDS'
+  | 'AUDIT_EXPORT_REF'
+  | 'BULLETIN_TRACE'
+  | 'SUPERSESSION_CHAIN'
+  | 'TUNING_INTEGER'
+  | 'DESKCHECK_MISSING'
+  | 'REQUIRED_EVIDENCE'
+
+export interface ContentError {
+  readonly code: ContentErrorCode
+  readonly detail: string
+}
+
+const REQUIRED_KINDS: readonly RequiredKind[] = ['weather', 'payroll', 'audit']
+
+const EXPECTED_IDS: readonly string[] = Array.from({ length: 12 }, (_, i) => {
+  const n = i + 1
+  return `M${n < 10 ? `0${n}` : `${n}`}`
+})
+
+function liveHeadOfKind(
+  messages: readonly OutlookMessage[],
+  kind: RequiredKind,
+): OutlookMessage | null {
+  const heads = messages.filter(
+    (m) =>
+      m.requiredKind === kind &&
+      m.supersededBy === null &&
+      m.correctRecipient !== null,
+  )
+  return heads.length === 1 ? heads[0]! : null
+}
+
+function isInteger(n: number): boolean {
+  return Number.isInteger(n)
+}
+
+/** Validate authored outlook content. Empty array means valid. */
+export function validateOutlookContent(
+  payload: OutlookPayload,
+  deskChecks: readonly DeskCheckEntry[],
+  anchors: SeedAnchors,
+): ContentError[] {
+  const errors: ContentError[] = []
+  const messages = payload.messages
+
+  // Rule: exactly one NON-SUPERSEDED message with a non-null
+  // correctRecipient per requiredKind. Superseded duplicates may also
+  // carry correctRecipient; only the live head of each chain counts.
+  for (const kind of REQUIRED_KINDS) {
+    const heads = messages.filter(
+      (m) =>
+        m.requiredKind === kind &&
+        m.supersededBy === null &&
+        m.correctRecipient !== null,
+    )
+    if (heads.length !== 1) {
+      errors.push({
+        code: 'REQUIRED_HEAD_COUNT',
+        detail: `${kind}: expected exactly one live required head, found ${heads.length}`,
+      })
+    }
+  }
+
+  // Rule: twelve messages exactly, ids M01..M12, unique.
+  if (messages.length !== 12) {
+    errors.push({
+      code: 'MESSAGE_COUNT',
+      detail: `expected 12 messages, found ${messages.length}`,
+    })
+  }
+  const ids = messages.map((m) => m.id)
+  const idSet = new Set(ids)
+  if (idSet.size !== ids.length) {
+    errors.push({ code: 'MESSAGE_IDS', detail: 'duplicate message ids' })
+  }
+  for (const expected of EXPECTED_IDS) {
+    if (!idSet.has(expected)) {
+      errors.push({
+        code: 'MESSAGE_IDS',
+        detail: `missing message id ${expected}`,
+      })
+    }
+  }
+  for (const id of ids) {
+    if (!EXPECTED_IDS.includes(id)) {
+      errors.push({ code: 'MESSAGE_IDS', detail: `unexpected message id ${id}` })
+    }
+  }
+
+  // Rule: the audit message's recordId carries the R04 export reference.
+  const auditHead = liveHeadOfKind(messages, 'audit')
+  if (auditHead === null) {
+    errors.push({
+      code: 'AUDIT_EXPORT_REF',
+      detail: 'no single live audit message to carry the export reference',
+    })
+  } else if (auditHead.recordId !== anchors.exportRecordId) {
+    errors.push({
+      code: 'AUDIT_EXPORT_REF',
+      detail: `audit recordId ${String(auditHead.recordId)} is not the export record ${anchors.exportRecordId}`,
+    })
+  }
+
+  // Rule: the bulletin's TRACE reaches the C17-equivalent record. The
+  // bulletin is the EXERCISE repeat: no requiredKind, recordId resolving
+  // to the C17-equivalent. (Modeled as the recordId being the anchor
+  // record, which trivially traces to itself.)
+  const bulletin = messages.find(
+    (m) => m.requiredKind === null && m.recordId === anchors.bulletinRecordId,
+  )
+  if (!bulletin) {
+    errors.push({
+      code: 'BULLETIN_TRACE',
+      detail: `no non-required bulletin whose TRACE reaches ${anchors.bulletinRecordId}`,
+    })
+  }
+
+  // Rule: supersession chains resolve acyclically. Every supersededBy
+  // points at an existing id, no cycles, chains terminate at a live
+  // message (supersededBy null).
+  for (const message of messages) {
+    if (message.supersededBy === null) continue
+    const visited = new Set<string>([message.id])
+    let cursor: string | null = message.supersededBy
+    while (cursor !== null) {
+      if (visited.has(cursor)) {
+        errors.push({
+          code: 'SUPERSESSION_CHAIN',
+          detail: `cycle through ${message.id} at ${cursor}`,
+        })
+        break
+      }
+      visited.add(cursor)
+      const next = messages.find((m) => m.id === cursor)
+      if (!next) {
+        errors.push({
+          code: 'SUPERSESSION_CHAIN',
+          detail: `${message.id} supersededBy ${cursor} does not exist`,
+        })
+        break
+      }
+      // A live terminus ends the chain.
+      cursor = next.supersededBy
+    }
+  }
+
+  // Rule: all channel tuning values are integers. Backup capacity equals
+  // 5. Three strictly-increasing stage offsets inside the mission
+  // duration (bounded by the earliest end-anchored warning window below).
+  const tuning = payload.channelTuning
+  if (tuning.backupCapacity !== 5) {
+    errors.push({
+      code: 'TUNING_INTEGER',
+      detail: `backupCapacity must equal 5, found ${tuning.backupCapacity}`,
+    })
+  }
+  for (const [label, value] of [
+    ['backupCapacity', tuning.backupCapacity],
+    ['primaryEtaSeconds[0]', tuning.primaryEtaSeconds[0]],
+    ['primaryEtaSeconds[1]', tuning.primaryEtaSeconds[1]],
+    ['backupEtaSeconds', tuning.backupEtaSeconds],
+  ] as const) {
+    if (!isInteger(value)) {
+      errors.push({
+        code: 'TUNING_INTEGER',
+        detail: `${label} must be an integer, found ${value}`,
+      })
+    }
+  }
+  const stageOffsets = payload.stageChanges.map((s) => s.offsetSeconds)
+  for (let i = 0; i < stageOffsets.length; i++) {
+    if (!isInteger(stageOffsets[i]!)) {
+      errors.push({
+        code: 'TUNING_INTEGER',
+        detail: `stage offset ${i} must be an integer, found ${stageOffsets[i]}`,
+      })
+    }
+  }
+  for (let i = 1; i < stageOffsets.length; i++) {
+    if (stageOffsets[i]! <= stageOffsets[i - 1]!) {
+      errors.push({
+        code: 'TUNING_INTEGER',
+        detail: `stage offsets must strictly increase: ${stageOffsets[i - 1]} then ${stageOffsets[i]}`,
+      })
+    }
+  }
+  // Every stage offset is positive (inside the mission window; the start
+  // is offset 0, so a non-positive offset would collide with init).
+  for (let i = 0; i < stageOffsets.length; i++) {
+    if (stageOffsets[i]! <= 0) {
+      errors.push({
+        code: 'TUNING_INTEGER',
+        detail: `stage offset ${i} must be positive, found ${stageOffsets[i]}`,
+      })
+    }
+  }
+  // Warning offsets are whole seconds before the end.
+  for (const warn of payload.warningOffsets) {
+    if (!isInteger(warn.secondsBeforeEnd)) {
+      errors.push({
+        code: 'TUNING_INTEGER',
+        detail: `warning offset must be an integer, found ${warn.secondsBeforeEnd}`,
+      })
+    }
+  }
+
+  // Rule: every non-null recordId appearing in the messages has a desk
+  // entry in the shared table.
+  const deskIds = new Set(deskChecks.map((d) => d.recordId))
+  for (const message of messages) {
+    if (message.recordId !== null && !deskIds.has(message.recordId)) {
+      errors.push({
+        code: 'DESKCHECK_MISSING',
+        detail: `recordId ${message.recordId} (${message.id}) has no deskChecks row`,
+      })
+    }
+  }
+
+  // Rule: required messages carry non-empty body evidence.
+  for (const kind of REQUIRED_KINDS) {
+    const head = liveHeadOfKind(messages, kind)
+    if (head && head.body.length === 0) {
+      errors.push({
+        code: 'REQUIRED_EVIDENCE',
+        detail: `${kind} live head ${head.id} has empty body evidence`,
+      })
+    }
+  }
+
+  return errors
+}
+
+/** The set of desks a required routing can name, for authoring spot
+ *  checks that the live payroll head names its correct desk in the body. */
+export const OUTLOOK_DESKS: readonly DeskId[] = [
+  'WEATHER_DESK',
+  'PAYROLL_DESK',
+  'AUDIT_DESK',
+]
diff --git a/src/engine/missions/outlook/payloads.ts b/src/engine/missions/outlook/payloads.ts
new file mode 100644
index 0000000..42a59cc
--- /dev/null
+++ b/src/engine/missions/outlook/payloads.ts
@@ -0,0 +1,349 @@
+// The three authored CRASH OUTLOOK payloads and their per-seed anchors.
+// Every routing decision is decidable from in-message body evidence under
+// time pressure. The recordIds here reference records that already live in
+// the shared SeedDefinition records table (the fixture C17 / W02 and their
+// per-seed equivalents), so the shared deskChecks table already carries a
+// row for each. Copy is all uppercase terminal diction, no em-dashes,
+// invented authority lines only.
+//
+// Structural mix per seed (identical, different incident flavor):
+//   M01  live weather CORRECTION, cites the OBSERVED field record, routes
+//        to WEATHER_DESK. The live required weather head.
+//   M02  stale weather advisory, SUPERSEDED by M01, carries a MISLEADING
+//        recipient hint that is not WEATHER_DESK. Deliberate decoy.
+//   M03  payroll thread opener, SUPERSEDED by M04.
+//   M04  live payroll approval head, names PAYROLL_DESK inside its body.
+//   M05  audit export message, references the run export feed, recordId is
+//        the D-83 export record (the clue vector). Routes to AUDIT_DESK.
+//   M06  EXERCISE bulletin: repeats the weather correction claim but with
+//        EXERCISE provenance, recordId resolves to the C17-equivalent, so
+//        CHECK SOURCE returns CONTRADICTED. No requiredKind.
+//   M07..M12  plausible decoys naming desks in their authority lines, some
+//        with recipient hints, none required. Tempting enough that the
+//        send-everything adversarial spends on them.
+import type { OutlookMessage } from './types'
+import type { OutlookPayload, SeedAnchors } from './content'
+
+const SHARED_TUNING: OutlookPayload['channelTuning'] = {
+  backupCapacity: 5,
+  primaryEtaSeconds: [30, 90],
+  backupEtaSeconds: 120,
+}
+
+const SHARED_STAGE_CHANGES: OutlookPayload['stageChanges'] = [
+  {
+    offsetSeconds: 90,
+    warningLine: 'PRIMARY LINK DEGRADING. ACK TIMES RISING.',
+    cueId: 'tone-fall-1',
+  },
+  {
+    offsetSeconds: 180,
+    warningLine: 'PRIMARY LINK DARK. ROUTE OVER BACKUP.',
+    cueId: 'tone-fall-2',
+  },
+  {
+    offsetSeconds: 230,
+    warningLine: 'STAGE THREE RESERVED. HOLD THE LINE.',
+    cueId: 'tone-fall-3',
+  },
+]
+
+const SHARED_WARNINGS: OutlookPayload['warningOffsets'] = [
+  {
+    secondsBeforeEnd: 30,
+    warningLine: 'THIRTY SECONDS TO DEADLINE.',
+    cueId: 'tone-warn-30',
+  },
+  {
+    secondsBeforeEnd: 10,
+    warningLine: 'TEN SECONDS TO DEADLINE.',
+    cueId: 'tone-warn-10',
+  },
+]
+
+const SHARED_COMMS_DELAYED: OutlookPayload['commsDelayedTable'] = {
+  full: 0,
+  partial: 10,
+  poor: 20,
+  failed: 30,
+}
+
+/** Per-seed authoring inputs. The record and run ids reference rows that
+ *  already exist in each SeedDefinition's shared records + deskChecks
+ *  tables, so no new evidence records are introduced. */
+interface SeedContentSpec {
+  readonly anchors: SeedAnchors
+  /** Incident flavor words that color the authored copy. */
+  readonly hazard: string
+  readonly corridor: string
+  readonly node: string
+  readonly exportFeed: string
+}
+
+function buildMessages(spec: SeedContentSpec): OutlookMessage[] {
+  const a = spec.anchors
+  return [
+    // M01 live weather correction, routes WEATHER_DESK, cites OBSERVED
+    // field record. Visible hint intentionally matches the truth here so
+    // the correction reads clean, but the mechanical truth lives in body.
+    {
+      id: 'M01',
+      from: `${spec.node} WEATHER WATCH`,
+      to: 'WEATHER DESK',
+      subject: `${spec.hazard} CORRECTION`,
+      body: [
+        `CORRECTION SUPERSEDES THE EARLIER ADVISORY.`,
+        `FIELD OBSERVATION ${a.weatherObservationRecordId} CONFIRMS LOCAL SCOPE.`,
+        `${spec.corridor} ONLY. ROUTE THIS CORRECTION TO THE WEATHER DESK.`,
+      ],
+      recordId: a.weatherObservationRecordId,
+      requiredKind: 'weather',
+      correctRecipient: 'WEATHER_DESK',
+      supersededBy: null,
+    },
+    // M02 stale weather advisory, superseded by M01, MISLEADING hint.
+    {
+      id: 'M02',
+      from: `${spec.node} WEATHER WATCH`,
+      to: 'AUDIT DESK',
+      subject: `${spec.hazard} ADVISORY`,
+      body: [
+        `STALE ADVISORY. HELD PENDING FIELD CONFIRMATION.`,
+        `DO NOT ACT ON THIS COPY. A CORRECTION FOLLOWS.`,
+      ],
+      recordId: null,
+      requiredKind: 'weather',
+      correctRecipient: 'WEATHER_DESK',
+      supersededBy: 'M01',
+    },
+    // M03 payroll thread opener, superseded by M04.
+    {
+      id: 'M03',
+      from: `${spec.node} PAY CONTROL`,
+      to: 'PAYROLL DESK',
+      subject: 'PAYROLL RUN HOLD',
+      body: [
+        `PAYROLL RUN PLACED ON HOLD PENDING APPROVAL.`,
+        `AWAIT THE APPROVAL NOTICE BEFORE ANY ROUTING.`,
+      ],
+      recordId: null,
+      requiredKind: 'payroll',
+      correctRecipient: 'PAYROLL_DESK',
+      supersededBy: 'M04',
+    },
+    // M04 live payroll approval head, names PAYROLL_DESK inside the body.
+    {
+      id: 'M04',
+      from: `${spec.node} PAY CONTROL`,
+      to: null,
+      subject: 'PAYROLL RUN APPROVED',
+      body: [
+        `APPROVAL GRANTED. THE HOLD IS LIFTED.`,
+        `ROUTE THE APPROVED RUN TO PAYROLL_DESK FOR RELEASE.`,
+        `AUTHORITY ON FILE WITH PAY CONTROL.`,
+      ],
+      recordId: null,
+      requiredKind: 'payroll',
+      correctRecipient: 'PAYROLL_DESK',
+      supersededBy: null,
+    },
+    // M05 audit export message, references the run export feed, recordId
+    // is the D-83 export record (the clue vector).
+    {
+      id: 'M05',
+      from: `${spec.node} AUDIT RELAY`,
+      to: 'AUDIT DESK',
+      subject: 'EXPORT FEED ANOMALY',
+      body: [
+        `RUN ${a.runId} EXPORT ${spec.exportFeed} PUBLISHED TO THE ACTIVE FEED.`,
+        `EXPORT RECORD ${a.exportRecordId} CARRIES THE RUN STAMP ${a.runId}.`,
+        `ROUTE TO AUDIT_DESK. EVENT ${a.eventClock} RECEIPT ${a.receiptClock}.`,
+      ],
+      recordId: a.exportRecordId,
+      requiredKind: 'audit',
+      correctRecipient: 'AUDIT_DESK',
+      supersededBy: null,
+    },
+    // M06 EXERCISE bulletin: repeats the correction claim with EXERCISE
+    // provenance, recordId resolves to the C17-equivalent (CONTRADICTED).
+    {
+      id: 'M06',
+      from: `${spec.node} BULLETIN FEED`,
+      to: 'WEATHER DESK',
+      subject: `${spec.hazard} BULLETIN`,
+      body: [
+        `BULLETIN REPEATS THE ${spec.hazard} CLAIM FROM THE EXERCISE FEED.`,
+        `TRACE REACHES EXPORT RECORD ${a.bulletinRecordId}, EXERCISE PROVENANCE.`,
+        `CHECK SOURCE RETURNS CONTRADICTED. THIS IS AN EXERCISE ARTIFACT.`,
+      ],
+      recordId: a.bulletinRecordId,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+    // M07..M12 plausible decoys naming desks.
+    {
+      id: 'M07',
+      from: `${spec.node} OPS SUMMARY`,
+      to: 'WEATHER DESK',
+      subject: 'SHIFT SUMMARY',
+      body: [
+        `ROUTINE SHIFT SUMMARY. NO ACTION REQUIRED.`,
+        `FILED FOR THE RECORD BY OPS SUMMARY.`,
+      ],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+    {
+      id: 'M08',
+      from: `${spec.node} FACILITIES`,
+      to: 'PAYROLL DESK',
+      subject: 'BADGE READER OUTAGE',
+      body: [
+        `BADGE READER AT THE NORTH DOOR IS OFFLINE.`,
+        `FACILITIES IS ON SITE. INFORMATIONAL ONLY.`,
+      ],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+    {
+      id: 'M09',
+      from: `${spec.node} AUDIT RELAY`,
+      to: 'AUDIT DESK',
+      subject: 'ARCHIVE REMINDER',
+      body: [
+        `MONTHLY ARCHIVE WINDOW OPENS AT THE TOP OF THE HOUR.`,
+        `NO LIVE RECORD ATTACHED. REMINDER ONLY.`,
+      ],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+    {
+      id: 'M10',
+      from: `${spec.node} RELAY POOL`,
+      to: null,
+      subject: 'TEST PATTERN',
+      body: [
+        `CHANNEL TEST PATTERN. DISREGARD.`,
+        `RELAY POOL CONFIDENCE CHECK.`,
+      ],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+    {
+      id: 'M11',
+      from: `${spec.node} WEATHER WATCH`,
+      to: 'WEATHER DESK',
+      subject: 'UPSTREAM OUTLOOK',
+      body: [
+        `UPSTREAM OUTLOOK UNCHANGED SINCE THE LAST CYCLE.`,
+        `NO CORRECTION PENDING ON THIS THREAD.`,
+      ],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+    {
+      id: 'M12',
+      from: `${spec.node} PAY CONTROL`,
+      to: 'PAYROLL DESK',
+      subject: 'STATEMENT CYCLE',
+      body: [
+        `STATEMENT CYCLE RUNS ON SCHEDULE.`,
+        `NO APPROVAL REQUIRED ON THIS NOTICE.`,
+      ],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+  ]
+}
+
+function buildPayload(spec: SeedContentSpec): OutlookPayload {
+  return {
+    messages: buildMessages(spec),
+    channelTuning: SHARED_TUNING,
+    stageChanges: SHARED_STAGE_CHANGES,
+    warningOffsets: SHARED_WARNINGS,
+    commsDelayedTable: SHARED_COMMS_DELAYED,
+  }
+}
+
+// ── Fixture seed (exercise-r04): verbatim C17 / EXERCISE / R04 / 21:14 ──
+export const OUTLOOK_ANCHORS_R04: SeedAnchors = {
+  runId: 'R04',
+  exportRecordId: 'C17',
+  bulletinRecordId: 'C17',
+  weatherObservationRecordId: 'W02',
+  eventClock: '21:14:00',
+  receiptClock: '21:14:05',
+}
+
+// ── Seed two (exercise-k11): run K11, 06:42 ──────────────────────────
+export const OUTLOOK_ANCHORS_K11: SeedAnchors = {
+  runId: 'K11',
+  exportRecordId: 'A09',
+  bulletinRecordId: 'A09',
+  weatherObservationRecordId: 'V07',
+  eventClock: '06:42:00',
+  receiptClock: '06:42:06',
+}
+
+// ── Seed three (exercise-t58): run T58, 14:07 ────────────────────────
+export const OUTLOOK_ANCHORS_T58: SeedAnchors = {
+  runId: 'T58',
+  exportRecordId: 'E22',
+  bulletinRecordId: 'E22',
+  weatherObservationRecordId: 'U04',
+  eventClock: '14:07:00',
+  receiptClock: '14:07:04',
+}
+
+export const OUTLOOK_PAYLOAD_R04: OutlookPayload = buildPayload({
+  anchors: OUTLOOK_ANCHORS_R04,
+  hazard: 'GROUNDING ADVISORY',
+  corridor: 'NORTHWEST CORRIDOR',
+  node: 'NODE SEVEN',
+  exportFeed: 'D83-EXPORT',
+})
+
+export const OUTLOOK_PAYLOAD_K11: OutlookPayload = buildPayload({
+  anchors: OUTLOOK_ANCHORS_K11,
+  hazard: 'ICING ADVISORY',
+  corridor: 'SOUTHEAST APPROACH',
+  node: 'NODE FOUR',
+  exportFeed: 'D83-EXPORT',
+})
+
+export const OUTLOOK_PAYLOAD_T58: OutlookPayload = buildPayload({
+  anchors: OUTLOOK_ANCHORS_T58,
+  hazard: 'CROSSWIND ADVISORY',
+  corridor: 'WEST RUNWAYS',
+  node: 'NODE NINE',
+  exportFeed: 'D83-EXPORT',
+})
+
+/** The per-seed anchor table, keyed by SeedDefinition name, so the
+ *  validator and the tests share one source of truth. */
+export const OUTLOOK_ANCHORS_BY_SEED: Readonly<Record<string, SeedAnchors>> = {
+  'exercise-r04': OUTLOOK_ANCHORS_R04,
+  'exercise-k11': OUTLOOK_ANCHORS_K11,
+  'exercise-t58': OUTLOOK_ANCHORS_T58,
+}
+
+/** The per-seed authored payload, keyed by SeedDefinition name. */
+export const OUTLOOK_PAYLOAD_BY_SEED: Readonly<Record<string, OutlookPayload>> = {
+  'exercise-r04': OUTLOOK_PAYLOAD_R04,
+  'exercise-k11': OUTLOOK_PAYLOAD_K11,
+  'exercise-t58': OUTLOOK_PAYLOAD_T58,
+}
diff --git a/src/engine/seeds/catalog.ts b/src/engine/seeds/catalog.ts
index d0fe17c..f94646e 100644
--- a/src/engine/seeds/catalog.ts
+++ b/src/engine/seeds/catalog.ts
@@ -10,6 +10,12 @@ import type {
   DeskCheckEntry,
   SeedDefinition,
 } from '../missions/types'
+import type { OutlookPayload } from '../missions/outlook/content'
+import {
+  OUTLOOK_PAYLOAD_R04,
+  OUTLOOK_PAYLOAD_K11,
+  OUTLOOK_PAYLOAD_T58,
+} from '../missions/outlook/payloads'
 
 export const MISSION_IDS = ['outlook', 'flights', 'bank'] as const
 export const FINALE_ID = 'finale'
@@ -55,6 +61,7 @@ interface SeedSpec {
   records: EvidenceRecord[]
   deskChecks: DeskCheckEntry[]
   clueRecords: ClueRecordEntry[]
+  outlookPayload: OutlookPayload
   openExceptionsBaseline: number
 }
 
@@ -67,7 +74,12 @@ function build(spec: SeedSpec): SeedDefinition {
     records: spec.records,
     deskChecks: spec.deskChecks,
     clueRecords: spec.clueRecords,
-    missionPayloads: { outlook: null, flights: null, bank: null, finale: null },
+    missionPayloads: {
+      outlook: spec.outlookPayload,
+      flights: null,
+      bank: null,
+      finale: null,
+    },
     schedules: {
       outlook: [
         ...milestones(),
@@ -271,6 +283,7 @@ const seedOne = build({
     { recordId: 'F06', clueId: CLUE_IDS.restriction },
     { recordId: 'B04', clueId: CLUE_IDS.ledgerHold },
   ],
+  outlookPayload: OUTLOOK_PAYLOAD_R04,
   openExceptionsBaseline: 12,
 })
 
@@ -375,6 +388,7 @@ const seedTwo = build({
     { recordId: 'G12', clueId: CLUE_IDS.restriction },
     { recordId: 'H03', clueId: CLUE_IDS.ledgerHold },
   ],
+  outlookPayload: OUTLOOK_PAYLOAD_K11,
   openExceptionsBaseline: 14,
 })
 
@@ -479,6 +493,7 @@ const seedThree = build({
     { recordId: 'J15', clueId: CLUE_IDS.restriction },
     { recordId: 'K08', clueId: CLUE_IDS.ledgerHold },
   ],
+  outlookPayload: OUTLOOK_PAYLOAD_T58,
   openExceptionsBaseline: 10,
 })
 
diff --git a/test/engine/missions/outlook/content.test.ts b/test/engine/missions/outlook/content.test.ts
new file mode 100644
index 0000000..17cf63d
--- /dev/null
+++ b/test/engine/missions/outlook/content.test.ts
@@ -0,0 +1,352 @@
+import { describe, expect, it } from 'vitest'
+import { SEED_CATALOG, SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  validateOutlookContent,
+  type ContentError,
+  type OutlookPayload,
+  type SeedAnchors,
+} from '@engine/missions/outlook/content'
+import {
+  OUTLOOK_ANCHORS_BY_SEED,
+  OUTLOOK_PAYLOAD_BY_SEED,
+} from '@engine/missions/outlook/payloads'
+import type { DeskCheckEntry } from '@engine/missions/types'
+import type { OutlookMessage } from '@engine/missions/outlook/types'
+
+// Per-seed expected anchor record ids, hardcoded here as the single
+// authoritative table the structural spot checks read.
+const EXPECTED_ANCHORS: Record<string, SeedAnchors> = {
+  'exercise-r04': {
+    runId: 'R04',
+    exportRecordId: 'C17',
+    bulletinRecordId: 'C17',
+    weatherObservationRecordId: 'W02',
+    eventClock: '21:14:00',
+    receiptClock: '21:14:05',
+  },
+  'exercise-k11': {
+    runId: 'K11',
+    exportRecordId: 'A09',
+    bulletinRecordId: 'A09',
+    weatherObservationRecordId: 'V07',
+    eventClock: '06:42:00',
+    receiptClock: '06:42:06',
+  },
+  'exercise-t58': {
+    runId: 'T58',
+    exportRecordId: 'E22',
+    bulletinRecordId: 'E22',
+    weatherObservationRecordId: 'U04',
+    eventClock: '14:07:00',
+    receiptClock: '14:07:04',
+  },
+}
+
+function payloadFor(seedName: string): OutlookPayload {
+  return SEED_CATALOG[seedName]!.missionPayloads['outlook'] as OutlookPayload
+}
+
+function deskChecksFor(seedName: string): readonly DeskCheckEntry[] {
+  return SEED_CATALOG[seedName]!.deskChecks
+}
+
+function liveHead(
+  payload: OutlookPayload,
+  kind: 'weather' | 'payroll' | 'audit',
+): OutlookMessage {
+  return payload.messages.find(
+    (m) =>
+      m.requiredKind === kind &&
+      m.supersededBy === null &&
+      m.correctRecipient !== null,
+  )!
+}
+
+const cases = SEED_NAMES.map(
+  (name) => [name, EXPECTED_ANCHORS[name]!] as const,
+)
+
+describe('validateOutlookContent: the authored payloads are clean', () => {
+  it.each(cases)('%s validates with zero errors', (seedName) => {
+    const errors = validateOutlookContent(
+      payloadFor(seedName),
+      deskChecksFor(seedName),
+      EXPECTED_ANCHORS[seedName]!,
+    )
+    expect(errors).toEqual([])
+  })
+
+  it('the anchor tables match between payloads module and this test', () => {
+    for (const name of SEED_NAMES) {
+      expect(OUTLOOK_ANCHORS_BY_SEED[name]).toEqual(EXPECTED_ANCHORS[name])
+      expect(OUTLOOK_PAYLOAD_BY_SEED[name]).toBe(payloadFor(name))
+    }
+  })
+})
+
+// A deep-clone helper so a mutation in one negative test never leaks.
+function clone(payload: OutlookPayload): OutlookPayload {
+  return JSON.parse(JSON.stringify(payload)) as OutlookPayload
+}
+
+describe('validateOutlookContent: each rule catches its mistake', () => {
+  const seedName = 'exercise-r04'
+  const base = () => clone(payloadFor(seedName))
+  const desk = () => deskChecksFor(seedName)
+  const anchors = () => EXPECTED_ANCHORS[seedName]!
+
+  function codes(errors: ContentError[]): string[] {
+    return errors.map((e) => e.code)
+  }
+
+  it('flags a second live required head for a kind', () => {
+    const p = base()
+    // Un-supersede the stale weather duplicate: now two live weather heads.
+    const messages = p.messages.map((m) =>
+      m.id === 'M02' ? { ...m, supersededBy: null } : m,
+    )
+    const bad = { ...p, messages }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'REQUIRED_HEAD_COUNT',
+    )
+  })
+
+  it('flags a message count other than twelve', () => {
+    const p = base()
+    const bad = { ...p, messages: p.messages.slice(0, 11) }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'MESSAGE_COUNT',
+    )
+  })
+
+  it('flags a duplicate or out-of-range message id', () => {
+    const p = base()
+    const messages = p.messages.map((m) =>
+      m.id === 'M12' ? { ...m, id: 'M11' } : m,
+    )
+    const bad = { ...p, messages }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'MESSAGE_IDS',
+    )
+  })
+
+  it('flags an audit head that does not carry the export reference', () => {
+    const p = base()
+    const messages = p.messages.map((m) =>
+      m.requiredKind === 'audit' && m.supersededBy === null
+        ? { ...m, recordId: 'W02' }
+        : m,
+    )
+    const bad = { ...p, messages }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'AUDIT_EXPORT_REF',
+    )
+  })
+
+  it('flags a missing bulletin whose TRACE reaches the C17-equivalent', () => {
+    const p = base()
+    // Point the bulletin record somewhere else so no non-required message
+    // resolves to the anchor record.
+    const messages = p.messages.map((m) =>
+      m.id === 'M06' ? { ...m, recordId: null } : m,
+    )
+    const bad = { ...p, messages }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'BULLETIN_TRACE',
+    )
+  })
+
+  it('flags a supersession pointer that does not resolve', () => {
+    const p = base()
+    const messages = p.messages.map((m) =>
+      m.id === 'M02' ? { ...m, supersededBy: 'M99' } : m,
+    )
+    const bad = { ...p, messages }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'SUPERSESSION_CHAIN',
+    )
+  })
+
+  it('flags a supersession cycle', () => {
+    const p = base()
+    // M01 -> M02 -> M01: a cycle (M02 already points at M01).
+    const messages = p.messages.map((m) =>
+      m.id === 'M01' ? { ...m, supersededBy: 'M02' } : m,
+    )
+    const bad = { ...p, messages }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'SUPERSESSION_CHAIN',
+    )
+  })
+
+  it('flags a backup capacity other than five', () => {
+    const p = base()
+    const bad = {
+      ...p,
+      channelTuning: { ...p.channelTuning, backupCapacity: 6 },
+    }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'TUNING_INTEGER',
+    )
+  })
+
+  it('flags non-integer tuning', () => {
+    const p = base()
+    const bad = {
+      ...p,
+      channelTuning: { ...p.channelTuning, backupEtaSeconds: 120.5 },
+    }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'TUNING_INTEGER',
+    )
+  })
+
+  it('flags stage offsets that are not strictly increasing', () => {
+    const p = base()
+    const [s0, s1, s2] = p.stageChanges
+    const bad = {
+      ...p,
+      stageChanges: [s0, { ...s1, offsetSeconds: s0!.offsetSeconds }, s2] as [
+        (typeof p.stageChanges)[0],
+        (typeof p.stageChanges)[1],
+        (typeof p.stageChanges)[2],
+      ],
+    }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'TUNING_INTEGER',
+    )
+  })
+
+  it('flags a referenced record with no deskChecks row', () => {
+    const p = base()
+    // Drop the C17 row from the desk table: the audit and bulletin records
+    // now lack a row.
+    const thinDesk = desk().filter((d) => d.recordId !== 'C17')
+    expect(
+      codes(validateOutlookContent(p, thinDesk, anchors())),
+    ).toContain('DESKCHECK_MISSING')
+  })
+
+  it('flags a required head with empty body evidence', () => {
+    const p = base()
+    const messages = p.messages.map((m) =>
+      m.id === 'M01' ? { ...m, body: [] } : m,
+    )
+    const bad = { ...p, messages }
+    expect(codes(validateOutlookContent(bad, desk(), anchors()))).toContain(
+      'REQUIRED_EVIDENCE',
+    )
+  })
+})
+
+describe('authoring spot checks', () => {
+  it.each(cases)(
+    '%s: exactly twelve unique ids M01..M12',
+    (seedName) => {
+      const p = payloadFor(seedName)
+      const ids = p.messages.map((m) => m.id).sort()
+      expect(ids).toEqual([
+        'M01',
+        'M02',
+        'M03',
+        'M04',
+        'M05',
+        'M06',
+        'M07',
+        'M08',
+        'M09',
+        'M10',
+        'M11',
+        'M12',
+      ])
+    },
+  )
+
+  it.each(cases)(
+    '%s: the payroll live head names its correct desk string in the body',
+    (seedName) => {
+      const head = liveHead(payloadFor(seedName), 'payroll')
+      expect(head.correctRecipient).toBe('PAYROLL_DESK')
+      expect(head.body.some((line) => line.includes('PAYROLL_DESK'))).toBe(true)
+    },
+  )
+
+  it.each(cases)(
+    '%s: the weather correction cites a field observation record confirmed by the desk',
+    (seedName, anchors) => {
+      const head = liveHead(payloadFor(seedName), 'weather')
+      expect(head.recordId).not.toBeNull()
+      expect(head.recordId).toBe(anchors.weatherObservationRecordId)
+      const row = deskChecksFor(seedName).find(
+        (d) => d.recordId === head.recordId,
+      )
+      expect(row?.outcome).toBe('CONFIRMED')
+    },
+  )
+
+  it.each(cases)(
+    '%s: the audit head carries the run export reference',
+    (seedName, anchors) => {
+      const head = liveHead(payloadFor(seedName), 'audit')
+      expect(head.recordId).toBe(anchors.exportRecordId)
+      expect(head.body.some((line) => line.includes(anchors.runId))).toBe(true)
+    },
+  )
+
+  it.each(cases)(
+    '%s: the bulletin repeats the claim with EXERCISE provenance and resolves to CONTRADICTED',
+    (seedName, anchors) => {
+      const p = payloadFor(seedName)
+      const bulletin = p.messages.find(
+        (m) => m.requiredKind === null && m.recordId === anchors.bulletinRecordId,
+      )
+      expect(bulletin).toBeTruthy()
+      const record = SEED_CATALOG[seedName]!.records.find(
+        (r) => r.id === anchors.bulletinRecordId,
+      )
+      expect(record?.origin).toBe('EXERCISE')
+      const row = deskChecksFor(seedName).find(
+        (d) => d.recordId === anchors.bulletinRecordId,
+      )
+      expect(row?.outcome).toBe('CONTRADICTED')
+    },
+  )
+
+  it.each(cases)(
+    '%s: at least one superseded duplicate of a required message carries a misleading recipient hint',
+    (seedName) => {
+      const p = payloadFor(seedName)
+      const misleading = p.messages.filter(
+        (m) =>
+          m.supersededBy !== null &&
+          m.requiredKind !== null &&
+          m.correctRecipient !== null &&
+          m.to !== null,
+      )
+      // The hint string must differ from the authored desk truth. The
+      // desks render as "WEATHER DESK" vs the WEATHER_DESK enum, so a
+      // mismatched kind in the hint is the lock.
+      const anyMisleading = misleading.some((m) => {
+        const deskWord = m.correctRecipient!.split('_')[0]!
+        return !m.to!.includes(deskWord)
+      })
+      expect(anyMisleading).toBe(true)
+    },
+  )
+
+  it('the fixture seed embeds the verbatim anchors C17, EXERCISE, R04, 21:14:00, 21:14:05', () => {
+    const p = payloadFor('exercise-r04')
+    const allBody = p.messages.flatMap((m) => m.body).join(' | ')
+    expect(allBody).toContain('C17')
+    expect(allBody).toContain('EXERCISE')
+    expect(allBody).toContain('R04')
+    expect(allBody).toContain('21:14:00')
+    expect(allBody).toContain('21:14:05')
+    // And the anchor record truly carries those times in the seed graph.
+    const c17 = SEED_CATALOG['exercise-r04']!.records.find((r) => r.id === 'C17')!
+    expect(c17.origin).toBe('EXERCISE')
+    expect(c17.runId).toBe('R04')
+    expect(c17.eventTime).toBe(76_440)
+    expect(c17.receiptTime).toBe(76_445)
+  })
+})
diff --git a/test/engine/missions/outlook/fixtures.ts b/test/engine/missions/outlook/fixtures.ts
new file mode 100644
index 0000000..842d65e
--- /dev/null
+++ b/test/engine/missions/outlook/fixtures.ts
@@ -0,0 +1,142 @@
+// Shared CRASH OUTLOOK solvability fixtures: the walkthrough and the
+// adversarial action scripts, per seed, plus a context builder that drives
+// the REAL module through the engine. Section 04 reuses these scripts for
+// its CI fixture matrix, so they live here rather than inlined in one
+// test file.
+//
+// A script is an ordered list of [CampaignAction, now] envelopes. The
+// walkthrough reads the evidence, routes the three required messages to
+// their correct desks on the primary channel while it is up, and never
+// touches the backup channel, so at least one backup slot is spare at
+// settlement. The adversarial script sprays SENDs at every message to a
+// single desk without reading anything: at most the weather kind can
+// satisfy, so it ends below tier 3.
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import type { SeedDefinition } from '@engine/missions/types'
+import { buildTestContext } from '@engine/testing'
+import {
+  makeOutlookMission,
+  outlookSchedule,
+} from '@engine/missions/outlook/module'
+import type { OutlookPayload } from '@engine/missions/outlook/content'
+import type { OutlookState } from '@engine/missions/outlook/types'
+import { SEED_CATALOG } from '@engine/seeds/catalog'
+
+export const OUTLOOK_DURATION_MS = 240_000
+export const OUTLOOK_T0 = 1_000_000
+
+export type Envelope = [CampaignAction, number]
+
+/** Build a single-mission engine context over the REAL outlook module and
+ *  a real seed's authored payload, schedule, and records. The schedule is
+ *  materialized from the payload so stage changes line up with the payload
+ *  tuning. */
+export function outlookContextForSeed(seedName: string): EngineContext {
+  const seed = SEED_CATALOG[seedName]!
+  const payload = seed.missionPayloads['outlook'] as OutlookPayload
+  const overrides: Partial<SeedDefinition> = {
+    name: seed.name,
+    records: seed.records,
+    deskChecks: seed.deskChecks,
+    clueRecords: seed.clueRecords,
+    missionPayloads: { outlook: payload },
+    schedules: { outlook: [...outlookSchedule(payload)] },
+    missionDurationsMs: { outlook: OUTLOOK_DURATION_MS },
+  }
+  return buildTestContext([...seed.records], overrides, {
+    missions: { outlook: makeOutlookMission(payload) },
+    missionOrder: ['outlook'],
+  })
+}
+
+export function outlookSub(state: CampaignState): OutlookState {
+  return state.activeMission?.substate as OutlookState
+}
+
+function read(messageId: string): CampaignAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } }
+}
+
+function send(
+  messageId: string,
+  recipient: string,
+  channel: 'primary' | 'backup' = 'primary',
+): CampaignAction {
+  return {
+    type: 'MISSION_ACTION',
+    payload: { kind: 'SEND', messageId, channel, recipient },
+  }
+}
+
+/** The walkthrough: read the three required messages (audit read also
+ *  fires the clue), route each to its correct desk on primary at stage 0,
+ *  and leave the backup untouched. All acks are scheduled at +30s, far
+ *  inside the 240s deadline. */
+export function outlookWalkthroughEnvelopes(t0 = OUTLOOK_T0): Envelope[] {
+  return [
+    [{ type: 'START_MISSION', missionId: 'outlook' }, t0],
+    [read('M01'), t0 + 1_000],
+    [read('M04'), t0 + 2_000],
+    [read('M05'), t0 + 3_000],
+    [send('M01', 'WEATHER_DESK', 'primary'), t0 + 4_000],
+    [send('M04', 'PAYROLL_DESK', 'primary'), t0 + 5_000],
+    [send('M05', 'AUDIT_DESK', 'primary'), t0 + 6_000],
+  ]
+}
+
+/** The adversarial send-everything script: no reads, SEND every one of the
+ *  twelve messages to a SINGLE desk (WEATHER_DESK) over primary at stage 0,
+ *  then burn the whole backup capacity on the same desk. Only the weather
+ *  kind can possibly satisfy, so this ends at tier poor at best. */
+export function outlookAdversarialEnvelopes(t0 = OUTLOOK_T0): Envelope[] {
+  const envelopes: Envelope[] = [
+    [{ type: 'START_MISSION', missionId: 'outlook' }, t0],
+  ]
+  const ids = Array.from({ length: 12 }, (_, i) => {
+    const n = i + 1
+    return `M${n < 10 ? `0${n}` : `${n}`}`
+  })
+  let clock = t0 + 1_000
+  for (const id of ids) {
+    envelopes.push([send(id, 'WEATHER_DESK', 'primary'), clock])
+    clock += 1_000
+  }
+  // Burn backup capacity too, on the same single desk.
+  for (const id of ids.slice(0, 6)) {
+    envelopes.push([send(id, 'WEATHER_DESK', 'backup'), clock])
+    clock += 1_000
+  }
+  return envelopes
+}
+
+export interface RunResult {
+  readonly state: CampaignState
+  readonly emitted: EngineEvent[]
+}
+
+/** Drive a script through the engine, then advance past the deadline so
+ *  acks fold and the mission settles. */
+export function driveOutlook(
+  ctx: EngineContext,
+  seedName: string,
+  envelopes: Envelope[],
+  settleAt = OUTLOOK_T0 + OUTLOOK_DURATION_MS + 1_000,
+): RunResult {
+  let state = createCampaign(ctx, seedName, { extendedTime: false }, OUTLOOK_T0)
+  const emitted: EngineEvent[] = []
+  for (const [action, now] of envelopes) {
+    const result = dispatch(ctx, state, action, now)
+    state = result.state
+    emitted.push(...result.emitted)
+  }
+  const advanced = advanceCampaign(ctx, state, settleAt)
+  emitted.push(...advanced.emitted)
+  return { state: advanced.state, emitted }
+}
diff --git a/test/engine/missions/outlook/solvability.test.ts b/test/engine/missions/outlook/solvability.test.ts
new file mode 100644
index 0000000..b48e7e1
--- /dev/null
+++ b/test/engine/missions/outlook/solvability.test.ts
@@ -0,0 +1,81 @@
+import { describe, expect, it } from 'vitest'
+import { advanceCampaign } from '@engine/campaign/engine'
+import type { EngineEvent } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  OUTLOOK_DURATION_MS,
+  OUTLOOK_T0,
+  driveOutlook,
+  outlookAdversarialEnvelopes,
+  outlookContextForSeed,
+  outlookSub,
+  outlookWalkthroughEnvelopes,
+} from './fixtures'
+
+function tierOf(settled: readonly { missionId: string; tier: string }[]): string {
+  return settled.find((s) => s.missionId === 'outlook')!.tier
+}
+
+const TIER_RANK: Record<string, number> = {
+  failed: 0,
+  poor: 1,
+  partial: 2,
+  full: 3,
+}
+
+describe.each(SEED_NAMES)('CRASH OUTLOOK solvability: %s', (seedName) => {
+  it('adversarial send-everything ends below tier 3', () => {
+    const ctx = outlookContextForSeed(seedName)
+    const { state } = driveOutlook(
+      ctx,
+      seedName,
+      outlookAdversarialEnvelopes(),
+    )
+    const outlook = state.settled.find((s) => s.missionId === 'outlook')!
+    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
+    expect(outlook.metrics['required_delivered']!).toBeLessThan(3)
+  })
+
+  it('walkthrough reaches tier 3 with at least one spare backup slot', () => {
+    const ctx = outlookContextForSeed(seedName)
+    // Measure the backup capacity at the last active wake before the third
+    // ack folds (stage-1 at offset 90s folds the +30s acks and settles the
+    // mission): no backup send is ever issued, so the spare count is whole.
+    const envelopes = outlookWalkthroughEnvelopes()
+    // Dispatch the script, then sample the live substate just before the
+    // folding wake, then settle.
+    const sampled = driveOutlook(
+      ctx,
+      seedName,
+      envelopes,
+      OUTLOOK_T0 + 89_000,
+    )
+    expect(sampled.state.phase).toBe('mission')
+    const sub = outlookSub(sampled.state)
+    expect(sub.backupRemaining).toBeGreaterThanOrEqual(1)
+    // Now carry that same live state to the deadline: it must settle
+    // completed at the full tier.
+    const settled = advanceCampaign(
+      ctx,
+      sampled.state,
+      OUTLOOK_T0 + OUTLOOK_DURATION_MS + 1_000,
+    )
+    const emitted: EngineEvent[] = [...settled.emitted]
+    const settlements = emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
+    expect(tierOf(settled.state.settled)).toBe('full')
+    const outlook = settled.state.settled.find((s) => s.missionId === 'outlook')!
+    expect(outlook.metrics['required_delivered']).toBe(3)
+  })
+
+  it('the walkthrough reads the audit message and surfaces the clue', () => {
+    const ctx = outlookContextForSeed(seedName)
+    const { state } = driveOutlook(
+      ctx,
+      seedName,
+      outlookWalkthroughEnvelopes(),
+    )
+    expect(state.cluesFound.length).toBeGreaterThanOrEqual(1)
+  })
+})
