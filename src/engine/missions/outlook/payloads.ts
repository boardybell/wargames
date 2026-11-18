// The three authored CRASH OUTLOOK payloads and their per-seed anchors.
// Every routing decision is decidable from in-message body evidence under
// time pressure. The recordIds here reference records that already live in
// the shared SeedDefinition records table (the fixture C17 / W02 and their
// per-seed equivalents), so the shared deskChecks table already carries a
// row for each. Copy is all uppercase terminal diction, no em-dashes,
// invented authority lines only.
//
// Structural mix per seed (identical, different incident flavor):
//   M01  live weather CORRECTION, cites the OBSERVED field record, routes
//        to WEATHER_DESK. The live required weather head.
//   M02  stale weather advisory, SUPERSEDED by M01, carries a MISLEADING
//        recipient hint that is not WEATHER_DESK. Deliberate decoy.
//   M03  payroll thread opener, SUPERSEDED by M04.
//   M04  live payroll approval head, names PAYROLL_DESK inside its body.
//   M05  audit export message, references the run export feed in its body
//        (the D-83 clue vector), recordId is the audit record: a DERIVED
//        record carrying the run stamp that resolves NON-contradicted, so
//        reading evidence and CHECK SOURCE stay consistent with routing it
//        to AUDIT_DESK. Distinct from the bulletin's record.
//   M06  EXERCISE bulletin: repeats the weather correction claim but with
//        EXERCISE provenance, recordId resolves to the C17-equivalent, so
//        CHECK SOURCE returns CONTRADICTED. No requiredKind. NEVER routed.
//   M07..M12  plausible decoys naming desks in their authority lines, some
//        with recipient hints, none required. Tempting enough that the
//        send-everything adversarial spends on them.
import type { OutlookMessage } from './types'
import type { OutlookPayload, SeedAnchors } from './content'

const SHARED_TUNING: OutlookPayload['channelTuning'] = {
  backupCapacity: 5,
  primaryEtaSeconds: [30, 90],
  backupEtaSeconds: 120,
}

const SHARED_STAGE_CHANGES: OutlookPayload['stageChanges'] = [
  {
    offsetSeconds: 90,
    warningLine: 'PRIMARY LINK DEGRADING. ACK TIMES RISING.',
    cueId: 'tone-fall-1',
  },
  {
    offsetSeconds: 180,
    warningLine: 'PRIMARY LINK DARK. ROUTE OVER BACKUP.',
    cueId: 'tone-fall-2',
  },
  {
    offsetSeconds: 230,
    warningLine: 'STAGE THREE RESERVED. HOLD THE LINE.',
    cueId: 'tone-fall-3',
  },
]

const SHARED_WARNINGS: OutlookPayload['warningOffsets'] = [
  {
    secondsBeforeEnd: 30,
    warningLine: 'THIRTY SECONDS TO DEADLINE.',
    cueId: 'tone-warn-30',
  },
  {
    secondsBeforeEnd: 10,
    warningLine: 'TEN SECONDS TO DEADLINE.',
    cueId: 'tone-warn-10',
  },
]

const SHARED_COMMS_DELAYED: OutlookPayload['commsDelayedTable'] = {
  full: 0,
  partial: 10,
  poor: 20,
  failed: 30,
}

/** Per-seed authoring inputs. The record and run ids reference rows that
 *  already exist in each SeedDefinition's shared records + deskChecks
 *  tables, so no new evidence records are introduced. */
interface SeedContentSpec {
  readonly anchors: SeedAnchors
  /** Incident flavor words that color the authored copy. */
  readonly hazard: string
  readonly corridor: string
  readonly node: string
  readonly exportFeed: string
}

function buildMessages(spec: SeedContentSpec): OutlookMessage[] {
  const a = spec.anchors
  return [
    // M01 live weather correction, routes WEATHER_DESK, cites OBSERVED
    // field record. Visible hint intentionally matches the truth here so
    // the correction reads clean, but the mechanical truth lives in body.
    {
      id: 'M01',
      from: `${spec.node} WEATHER WATCH`,
      to: 'WEATHER DESK',
      subject: `${spec.hazard} CORRECTION`,
      body: [
        `CORRECTION SUPERSEDES THE EARLIER ADVISORY.`,
        `FIELD OBSERVATION ${a.weatherObservationRecordId} CONFIRMS LOCAL SCOPE.`,
        `${spec.corridor} ONLY. ROUTE THIS CORRECTION TO THE WEATHER DESK.`,
      ],
      recordId: a.weatherObservationRecordId,
      requiredKind: 'weather',
      correctRecipient: 'WEATHER_DESK',
      supersededBy: null,
    },
    // M02 stale weather advisory, superseded by M01, MISLEADING hint.
    {
      id: 'M02',
      from: `${spec.node} WEATHER WATCH`,
      to: 'AUDIT DESK',
      subject: `${spec.hazard} ADVISORY`,
      body: [
        `STALE ADVISORY. HELD PENDING FIELD CONFIRMATION.`,
        `DO NOT ACT ON THIS COPY. A CORRECTION FOLLOWS.`,
      ],
      recordId: null,
      requiredKind: 'weather',
      correctRecipient: 'WEATHER_DESK',
      supersededBy: 'M01',
    },
    // M03 payroll thread opener, superseded by M04.
    {
      id: 'M03',
      from: `${spec.node} PAY CONTROL`,
      to: 'PAYROLL DESK',
      subject: 'PAYROLL RUN HOLD',
      body: [
        `PAYROLL RUN PLACED ON HOLD PENDING APPROVAL.`,
        `AWAIT THE APPROVAL NOTICE BEFORE ANY ROUTING.`,
      ],
      recordId: null,
      requiredKind: 'payroll',
      correctRecipient: 'PAYROLL_DESK',
      supersededBy: 'M04',
    },
    // M04 live payroll approval head, names PAYROLL_DESK inside the body.
    {
      id: 'M04',
      from: `${spec.node} PAY CONTROL`,
      to: null,
      subject: 'PAYROLL RUN APPROVED',
      body: [
        `APPROVAL GRANTED. THE HOLD IS LIFTED.`,
        `ROUTE THE APPROVED RUN TO PAYROLL_DESK FOR RELEASE.`,
        `AUTHORITY ON FILE WITH PAY CONTROL.`,
      ],
      recordId: null,
      requiredKind: 'payroll',
      correctRecipient: 'PAYROLL_DESK',
      supersededBy: null,
    },
    // M05 audit export message. The run stamp and export feed live in the
    // body (the D-83 clue vector fires from reading). recordId is the audit
    // record: a DERIVED record that carries the run stamp and resolves
    // NON-contradicted, distinct from the bulletin's EXERCISE record, so a
    // player who reads and CHECK SOURCEs it gets a signal consistent with
    // routing to AUDIT_DESK.
    {
      id: 'M05',
      from: `${spec.node} AUDIT RELAY`,
      to: 'AUDIT DESK',
      subject: 'EXPORT FEED ANOMALY',
      body: [
        `RUN ${a.runId} EXPORT ${spec.exportFeed} PUBLISHED TO THE ACTIVE FEED.`,
        `AUDIT RECORD ${a.auditRecordId} CARRIES THE RUN STAMP ${a.runId}.`,
        `ROUTE TO AUDIT_DESK. EVENT ${a.eventClock} RECEIPT ${a.receiptClock}.`,
      ],
      recordId: a.auditRecordId,
      requiredKind: 'audit',
      correctRecipient: 'AUDIT_DESK',
      supersededBy: null,
    },
    // M06 EXERCISE bulletin: repeats the correction claim with EXERCISE
    // provenance, recordId resolves to the C17-equivalent (CONTRADICTED).
    {
      id: 'M06',
      from: `${spec.node} BULLETIN FEED`,
      to: 'WEATHER DESK',
      subject: `${spec.hazard} BULLETIN`,
      body: [
        `BULLETIN REPEATS THE ${spec.hazard} CLAIM FROM THE EXERCISE FEED.`,
        `TRACE REACHES EXPORT RECORD ${a.bulletinRecordId}, EXERCISE PROVENANCE.`,
        `CHECK SOURCE RETURNS CONTRADICTED. THIS IS AN EXERCISE ARTIFACT.`,
      ],
      recordId: a.bulletinRecordId,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
    // M07..M12 plausible decoys naming desks.
    {
      id: 'M07',
      from: `${spec.node} OPS SUMMARY`,
      to: 'WEATHER DESK',
      subject: 'SHIFT SUMMARY',
      body: [
        `ROUTINE SHIFT SUMMARY. NO ACTION REQUIRED.`,
        `FILED FOR THE RECORD BY OPS SUMMARY.`,
      ],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
    {
      id: 'M08',
      from: `${spec.node} FACILITIES`,
      to: 'PAYROLL DESK',
      subject: 'BADGE READER OUTAGE',
      body: [
        `BADGE READER AT THE NORTH DOOR IS OFFLINE.`,
        `FACILITIES IS ON SITE. INFORMATIONAL ONLY.`,
      ],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
    {
      id: 'M09',
      from: `${spec.node} AUDIT RELAY`,
      to: 'AUDIT DESK',
      subject: 'ARCHIVE REMINDER',
      body: [
        `MONTHLY ARCHIVE WINDOW OPENS AT THE TOP OF THE HOUR.`,
        `NO LIVE RECORD ATTACHED. REMINDER ONLY.`,
      ],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
    {
      id: 'M10',
      from: `${spec.node} RELAY POOL`,
      to: null,
      subject: 'TEST PATTERN',
      body: [
        `CHANNEL TEST PATTERN. DISREGARD.`,
        `RELAY POOL CONFIDENCE CHECK.`,
      ],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
    {
      id: 'M11',
      from: `${spec.node} WEATHER WATCH`,
      to: 'WEATHER DESK',
      subject: 'UPSTREAM OUTLOOK',
      body: [
        `UPSTREAM OUTLOOK UNCHANGED SINCE THE LAST CYCLE.`,
        `NO CORRECTION PENDING ON THIS THREAD.`,
      ],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
    {
      id: 'M12',
      from: `${spec.node} PAY CONTROL`,
      to: 'PAYROLL DESK',
      subject: 'STATEMENT CYCLE',
      body: [
        `STATEMENT CYCLE RUNS ON SCHEDULE.`,
        `NO APPROVAL REQUIRED ON THIS NOTICE.`,
      ],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
  ]
}

function buildPayload(spec: SeedContentSpec): OutlookPayload {
  return {
    messages: buildMessages(spec),
    channelTuning: SHARED_TUNING,
    stageChanges: SHARED_STAGE_CHANGES,
    warningOffsets: SHARED_WARNINGS,
    commsDelayedTable: SHARED_COMMS_DELAYED,
  }
}

// ── Fixture seed (exercise-r04): verbatim C17 / EXERCISE / R04 / 21:14 ──
export const OUTLOOK_ANCHORS_R04: SeedAnchors = {
  runId: 'R04',
  auditRecordId: 'F06',
  bulletinRecordId: 'C17',
  weatherObservationRecordId: 'W02',
  eventClock: '21:14:00',
  receiptClock: '21:14:05',
}

// ── Seed two (exercise-k11): run K11, 06:42 ──────────────────────────
export const OUTLOOK_ANCHORS_K11: SeedAnchors = {
  runId: 'K11',
  auditRecordId: 'G12',
  bulletinRecordId: 'A09',
  weatherObservationRecordId: 'V07',
  eventClock: '06:42:00',
  receiptClock: '06:42:06',
}

// ── Seed three (exercise-t58): run T58, 14:07 ────────────────────────
export const OUTLOOK_ANCHORS_T58: SeedAnchors = {
  runId: 'T58',
  auditRecordId: 'J15',
  bulletinRecordId: 'E22',
  weatherObservationRecordId: 'U04',
  eventClock: '14:07:00',
  receiptClock: '14:07:04',
}

export const OUTLOOK_PAYLOAD_R04: OutlookPayload = buildPayload({
  anchors: OUTLOOK_ANCHORS_R04,
  hazard: 'GROUNDING ADVISORY',
  corridor: 'NORTHWEST CORRIDOR',
  node: 'NODE SEVEN',
  exportFeed: 'D83-EXPORT',
})

export const OUTLOOK_PAYLOAD_K11: OutlookPayload = buildPayload({
  anchors: OUTLOOK_ANCHORS_K11,
  hazard: 'ICING ADVISORY',
  corridor: 'SOUTHEAST APPROACH',
  node: 'NODE FOUR',
  exportFeed: 'D83-EXPORT',
})

export const OUTLOOK_PAYLOAD_T58: OutlookPayload = buildPayload({
  anchors: OUTLOOK_ANCHORS_T58,
  hazard: 'CROSSWIND ADVISORY',
  corridor: 'WEST RUNWAYS',
  node: 'NODE NINE',
  exportFeed: 'D83-EXPORT',
})

/** The per-seed anchor table, keyed by SeedDefinition name, so the
 *  validator and the tests share one source of truth. */
export const OUTLOOK_ANCHORS_BY_SEED: Readonly<Record<string, SeedAnchors>> = {
  'exercise-r04': OUTLOOK_ANCHORS_R04,
  'exercise-k11': OUTLOOK_ANCHORS_K11,
  'exercise-t58': OUTLOOK_ANCHORS_T58,
}

/** The per-seed authored payload, keyed by SeedDefinition name. */
export const OUTLOOK_PAYLOAD_BY_SEED: Readonly<Record<string, OutlookPayload>> = {
  'exercise-r04': OUTLOOK_PAYLOAD_R04,
  'exercise-k11': OUTLOOK_PAYLOAD_K11,
  'exercise-t58': OUTLOOK_PAYLOAD_T58,
}
