// The payload shape the three CRASH OUTLOOK seeds must satisfy. Only the
// TYPE lives here so the module compiles standalone; the content
// validator functions and the authored payloads are section 02's job.
// Desk-check outcomes deliberately do NOT live here. They stay in the
// shared SeedDefinition.deskChecks table keyed by record id.
import type { OutcomeTier } from '../../campaign/types'
import type { EvidenceRecord } from '../../records'
import type { DeskCheckEntry } from '../types'
import type { DeskId, OutlookMessage, RequiredKind } from './types'

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

// ── Content validation ──────────────────────────────────────────────
// A PURE authoring gate. It never throws: it returns a list of
// structured errors so one run names every mistake in the authored
// content. The solvability invariants are NOT validator rules; they need
// the module lifecycle and live in the solvability fixture tests. Each
// rule below maps one-to-one to a "Tests first" bullet in the section
// spec, so a dropped rule shows up as a dropped test.

/** The per-seed expected record and run anchors. The fixture seed's
 *  anchors are the canonical C17 / EXERCISE / R04 / 21:14 values; seeds
 *  two and three supply their own equivalents. One table so the validator
 *  and the tests share a single source of truth. */
export interface SeedAnchors {
  /** The exercise run stamp the audit export carries (R04 equivalent). */
  readonly runId: string
  /** The record the audit message routes on: a NON-contradicted record
   *  that resolves (through deskChecks) to anything but CONTRADICTED, so a
   *  player who reads the evidence and runs CHECK SOURCE on it gets a
   *  signal consistent with routing the audit message to AUDIT_DESK. This
   *  is DISTINCT from the bulletin's EXERCISE/CONTRADICTED record. The run
   *  stamp and export-feed reference still live in the audit message BODY
   *  (the D-83 clue vector), not in this record's deskCheck. For the
   *  fixture seed this is F06 (DERIVED, carries run stamp R04). */
  readonly auditRecordId: string
  /** The record the EXERCISE bulletin's TRACE reaches (C17 equivalent).
   *  For the fixture this is C17 itself. CHECK SOURCE on it returns
   *  CONTRADICTED; the bulletin must NOT be routed. */
  readonly bulletinRecordId: string
  /** The OBSERVED field observation the live weather correction cites
   *  (W02 equivalent), which the desk confirms. */
  readonly weatherObservationRecordId: string
  /** The verbatim event clock the fixture anchor embeds (21:14:00). */
  readonly eventClock: string
  /** The verbatim receipt clock the fixture anchor embeds (21:14:05). */
  readonly receiptClock: string
}

export type ContentErrorCode =
  | 'REQUIRED_HEAD_COUNT'
  | 'MESSAGE_COUNT'
  | 'MESSAGE_IDS'
  | 'AUDIT_EXPORT_REF'
  | 'BULLETIN_TRACE'
  | 'SUPERSESSION_CHAIN'
  | 'TUNING_INTEGER'
  | 'DESKCHECK_MISSING'
  | 'REQUIRED_EVIDENCE'

export interface ContentError {
  readonly code: ContentErrorCode
  readonly detail: string
}

const REQUIRED_KINDS: readonly RequiredKind[] = ['weather', 'payroll', 'audit']

const EXPECTED_IDS: readonly string[] = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1
  return `M${n < 10 ? `0${n}` : `${n}`}`
})

function liveHeadOfKind(
  messages: readonly OutlookMessage[],
  kind: RequiredKind,
): OutlookMessage | null {
  const heads = messages.filter(
    (m) =>
      m.requiredKind === kind &&
      m.supersededBy === null &&
      m.correctRecipient !== null,
  )
  return heads.length === 1 ? heads[0]! : null
}

function isInteger(n: number): boolean {
  return Number.isInteger(n)
}

/** Walk a record's parentId chain and return the deepest ancestor id
 *  reached (itself when it has no parent). Carries a visited set so a
 *  cycle or a dangling parent terminates the walk at the last resolvable
 *  node rather than hanging. */
function traceRoot(
  records: readonly EvidenceRecord[],
  startId: string,
): EvidenceRecord | null {
  const byId = new Map(records.map((r) => [r.id, r]))
  let current = byId.get(startId) ?? null
  if (!current) return null
  const visited = new Set<string>([current.id])
  while (current.parentId !== null) {
    if (visited.has(current.parentId)) break
    const parent = byId.get(current.parentId)
    if (!parent) break
    visited.add(parent.id)
    current = parent
  }
  return current
}

/** Validate authored outlook content. Empty array means valid. The record
 *  graph and the mission duration (whole seconds) are threaded in so the
 *  bulletin trace can walk provenance and the stage offsets can be bounded
 *  by the real mission window. */
export function validateOutlookContent(
  payload: OutlookPayload,
  deskChecks: readonly DeskCheckEntry[],
  anchors: SeedAnchors,
  records: readonly EvidenceRecord[],
  missionDurationSeconds: number,
): ContentError[] {
  const errors: ContentError[] = []
  const messages = payload.messages

  // Rule: exactly one NON-SUPERSEDED message with a non-null
  // correctRecipient per requiredKind. Superseded duplicates may also
  // carry correctRecipient; only the live head of each chain counts.
  for (const kind of REQUIRED_KINDS) {
    const heads = messages.filter(
      (m) =>
        m.requiredKind === kind &&
        m.supersededBy === null &&
        m.correctRecipient !== null,
    )
    if (heads.length !== 1) {
      errors.push({
        code: 'REQUIRED_HEAD_COUNT',
        detail: `${kind}: expected exactly one live required head, found ${heads.length}`,
      })
    }
  }

  // Rule: twelve messages exactly, ids M01..M12, unique.
  if (messages.length !== 12) {
    errors.push({
      code: 'MESSAGE_COUNT',
      detail: `expected 12 messages, found ${messages.length}`,
    })
  }
  const ids = messages.map((m) => m.id)
  const idSet = new Set(ids)
  if (idSet.size !== ids.length) {
    errors.push({ code: 'MESSAGE_IDS', detail: 'duplicate message ids' })
  }
  for (const expected of EXPECTED_IDS) {
    if (!idSet.has(expected)) {
      errors.push({
        code: 'MESSAGE_IDS',
        detail: `missing message id ${expected}`,
      })
    }
  }
  for (const id of ids) {
    if (!EXPECTED_IDS.includes(id)) {
      errors.push({ code: 'MESSAGE_IDS', detail: `unexpected message id ${id}` })
    }
  }

  // Rule: the audit message routes on its OWN distinct, non-contradicted
  // record (the auditRecordId), carries the run stamp in its body, and
  // names a desk that a required routing can target. This record must NOT
  // be the bulletin's EXERCISE/CONTRADICTED record: reading the evidence
  // and running CHECK SOURCE on the audit record must never contradict the
  // required routing. The run/export-feed reference stays in the body.
  const auditHead = liveHeadOfKind(messages, 'audit')
  if (auditHead === null) {
    errors.push({
      code: 'AUDIT_EXPORT_REF',
      detail: 'no single live audit message to carry the export reference',
    })
  } else {
    if (auditHead.recordId !== anchors.auditRecordId) {
      errors.push({
        code: 'AUDIT_EXPORT_REF',
        detail: `audit recordId ${String(auditHead.recordId)} is not the audit record ${anchors.auditRecordId}`,
      })
    }
    if (anchors.auditRecordId === anchors.bulletinRecordId) {
      errors.push({
        code: 'AUDIT_EXPORT_REF',
        detail: `audit record ${anchors.auditRecordId} must differ from the bulletin record`,
      })
    }
    if (!OUTLOOK_DESKS.includes(auditHead.correctRecipient as DeskId)) {
      errors.push({
        code: 'AUDIT_EXPORT_REF',
        detail: `audit head ${auditHead.id} must route to a known desk`,
      })
    }
    // The run stamp must appear in the body (the clue vector fires from
    // reading, not from the deskCheck).
    if (!auditHead.body.some((line) => line.includes(anchors.runId))) {
      errors.push({
        code: 'AUDIT_EXPORT_REF',
        detail: `audit head ${auditHead.id} body omits the run stamp ${anchors.runId}`,
      })
    }
    // The audit record must NOT resolve to CONTRADICTED.
    const auditDesk = deskChecks.find((d) => d.recordId === anchors.auditRecordId)
    if (auditDesk && auditDesk.outcome === 'CONTRADICTED') {
      errors.push({
        code: 'AUDIT_EXPORT_REF',
        detail: `audit record ${anchors.auditRecordId} resolves to CONTRADICTED; routing it would contradict the evidence`,
      })
    }
  }

  // Rule: the bulletin's TRACE walks the record graph to the C17-equivalent
  // root, confirms EXERCISE origin at that root, and confirms CHECK SOURCE
  // on the bulletin's record returns CONTRADICTED via the deskChecks table.
  // This is a real provenance walk, not pointer equality: a bulletin
  // pointing at a CONFIRMED (or non-EXERCISE) record fails.
  const bulletin = messages.find(
    (m) => m.requiredKind === null && m.recordId !== null,
  )
  if (!bulletin || bulletin.recordId === null) {
    errors.push({
      code: 'BULLETIN_TRACE',
      detail: 'no non-required bulletin carrying a record id',
    })
  } else {
    const root = traceRoot(records, bulletin.recordId)
    if (!root) {
      errors.push({
        code: 'BULLETIN_TRACE',
        detail: `bulletin record ${bulletin.recordId} does not resolve in the record graph`,
      })
    } else {
      if (root.id !== anchors.bulletinRecordId) {
        errors.push({
          code: 'BULLETIN_TRACE',
          detail: `bulletin TRACE reaches ${root.id}, not the C17-equivalent ${anchors.bulletinRecordId}`,
        })
      }
      if (root.origin !== 'EXERCISE') {
        errors.push({
          code: 'BULLETIN_TRACE',
          detail: `bulletin TRACE root ${root.id} origin is ${root.origin}, not EXERCISE`,
        })
      }
    }
    const bulletinDesk = deskChecks.find(
      (d) => d.recordId === bulletin.recordId,
    )
    if (!bulletinDesk || bulletinDesk.outcome !== 'CONTRADICTED') {
      errors.push({
        code: 'BULLETIN_TRACE',
        detail: `bulletin record ${bulletin.recordId} CHECK SOURCE must return CONTRADICTED, found ${bulletinDesk?.outcome ?? 'no row'}`,
      })
    }
  }

  // Rule: supersession chains resolve acyclically. Every supersededBy
  // points at an existing id, no cycles, chains terminate at a live
  // message (supersededBy null).
  for (const message of messages) {
    if (message.supersededBy === null) continue
    const visited = new Set<string>([message.id])
    let cursor: string | null = message.supersededBy
    while (cursor !== null) {
      if (visited.has(cursor)) {
        errors.push({
          code: 'SUPERSESSION_CHAIN',
          detail: `cycle through ${message.id} at ${cursor}`,
        })
        break
      }
      visited.add(cursor)
      const next = messages.find((m) => m.id === cursor)
      if (!next) {
        errors.push({
          code: 'SUPERSESSION_CHAIN',
          detail: `${message.id} supersededBy ${cursor} does not exist`,
        })
        break
      }
      // A live terminus ends the chain.
      cursor = next.supersededBy
    }
  }

  // Rule: all channel tuning values are integers. Backup capacity equals
  // 5. Three strictly-increasing stage offsets inside the mission
  // duration (bounded by the earliest end-anchored warning window below).
  const tuning = payload.channelTuning
  if (tuning.backupCapacity !== 5) {
    errors.push({
      code: 'TUNING_INTEGER',
      detail: `backupCapacity must equal 5, found ${tuning.backupCapacity}`,
    })
  }
  for (const [label, value] of [
    ['backupCapacity', tuning.backupCapacity],
    ['primaryEtaSeconds[0]', tuning.primaryEtaSeconds[0]],
    ['primaryEtaSeconds[1]', tuning.primaryEtaSeconds[1]],
    ['backupEtaSeconds', tuning.backupEtaSeconds],
  ] as const) {
    if (!isInteger(value)) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `${label} must be an integer, found ${value}`,
      })
    }
  }
  const stageOffsets = payload.stageChanges.map((s) => s.offsetSeconds)
  for (let i = 0; i < stageOffsets.length; i++) {
    if (!isInteger(stageOffsets[i]!)) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `stage offset ${i} must be an integer, found ${stageOffsets[i]}`,
      })
    }
  }
  for (let i = 1; i < stageOffsets.length; i++) {
    if (stageOffsets[i]! <= stageOffsets[i - 1]!) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `stage offsets must strictly increase: ${stageOffsets[i - 1]} then ${stageOffsets[i]}`,
      })
    }
  }
  // Every stage offset is strictly inside the mission window: positive (the
  // start is offset 0, so a non-positive offset would collide with init)
  // and strictly less than the mission duration (an offset at or past the
  // deadline never fires).
  for (let i = 0; i < stageOffsets.length; i++) {
    if (stageOffsets[i]! <= 0) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `stage offset ${i} must be positive, found ${stageOffsets[i]}`,
      })
    }
    if (stageOffsets[i]! >= missionDurationSeconds) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `stage offset ${i} (${stageOffsets[i]}) must be inside the mission duration ${missionDurationSeconds}`,
      })
    }
  }
  // Warning offsets are whole seconds before the end.
  for (const warn of payload.warningOffsets) {
    if (!isInteger(warn.secondsBeforeEnd)) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `warning offset must be an integer, found ${warn.secondsBeforeEnd}`,
      })
    }
  }

  // Rule: every non-null recordId appearing in the messages has a desk
  // entry in the shared table.
  const deskIds = new Set(deskChecks.map((d) => d.recordId))
  for (const message of messages) {
    if (message.recordId !== null && !deskIds.has(message.recordId)) {
      errors.push({
        code: 'DESKCHECK_MISSING',
        detail: `recordId ${message.recordId} (${message.id}) has no deskChecks row`,
      })
    }
  }

  // Rule: required messages carry non-empty body evidence.
  for (const kind of REQUIRED_KINDS) {
    const head = liveHeadOfKind(messages, kind)
    if (head && head.body.length === 0) {
      errors.push({
        code: 'REQUIRED_EVIDENCE',
        detail: `${kind} live head ${head.id} has empty body evidence`,
      })
    }
  }

  return errors
}

/** The set of desks a required routing can name. The validator's
 *  AUDIT_EXPORT_REF rule uses it to confirm the audit head routes to a
 *  known desk; authoring spot checks reuse it for the payroll desk. */
export const OUTLOOK_DESKS: readonly DeskId[] = [
  'WEATHER_DESK',
  'PAYROLL_DESK',
  'AUDIT_DESK',
]
