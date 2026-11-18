// A minimal in-test CRASH OUTLOOK fixture: one message of each
// requiredKind, one superseded weather duplicate, and one decoy. Not the
// authored twelve (section 02 writes those); the screens render whatever
// payload is active, so a handful proves the views. The record graph and
// desk-check table mirror the engine fixtures (C17 is the EXERCISE
// bulletin, W02 the OBSERVED weather correction) so TRACE and CHECK
// SOURCE have real records and real desk answers to resolve against.
import type { EngineContext } from '@engine'
import type { EvidenceRecord } from '@engine'
import type { SeedDefinition } from '@engine'
import type { DeskCheckEntry } from '@engine/missions/types'
import { buildTestContext } from '@engine/testing'
import {
  makeOutlookMission,
  outlookSchedule,
} from '@engine/missions/outlook/module'
import type { OutlookPayload } from '@engine/missions/outlook/content'

export const OUTLOOK_DURATION_MS = 240_000

/** The evidence records the fixture messages point at. C17 is the EXERCISE
 *  bulletin (run R04) the audit message carries; W02 is the OBSERVED
 *  weather correction; B04 is the DERIVED payroll record. */
export const OUTLOOK_FIXTURE_RECORDS: EvidenceRecord[] = [
  {
    id: 'C17',
    origin: 'EXERCISE',
    sourceId: 'D83-EXPORT',
    parentId: null,
    runId: 'R04',
    eventTime: 76440,
    receiptTime: 76445,
    subsystem: 'outlook',
    body: ['PREVIEW GROUNDING ADVISORY PUBLISHED TO ACTIVE FEED'],
  },
  {
    id: 'W02',
    origin: 'OBSERVED',
    sourceId: 'FIELD-NW',
    parentId: null,
    runId: null,
    eventTime: 76455,
    receiptTime: 76460,
    subsystem: 'outlook',
    body: ['LOCAL WEATHER WARNING: NORTHWEST CORRIDOR ONLY'],
  },
  {
    id: 'B04',
    origin: 'DERIVED',
    sourceId: 'BANK-OPS',
    parentId: 'C17',
    runId: 'R04',
    eventTime: 76461,
    receiptTime: 76470,
    subsystem: 'outlook',
    body: ['PAYROLL RUN TOTALS PER FEED'],
  },
]

/** The desk-check answers. C17 (the EXERCISE bulletin) comes back
 *  CONTRADICTED; W02 (the OBSERVED weather correction) comes back
 *  CONFIRMED. delaySeconds is small so a single advance resolves them. */
export const OUTLOOK_DESK_CHECKS: DeskCheckEntry[] = [
  {
    recordId: 'C17',
    outcome: 'CONTRADICTED',
    delaySeconds: 5,
    replyBody: ['NO INDEPENDENT SOURCE. EXERCISE PROVENANCE ONLY.'],
  },
  {
    recordId: 'W02',
    outcome: 'CONFIRMED',
    delaySeconds: 5,
    replyBody: ['FIELD STATION CORROBORATES. OBSERVED AND INDEPENDENT.'],
  },
]

export const OUTLOOK_FIXTURE_PAYLOAD: OutlookPayload = {
  messages: [
    {
      id: 'M01',
      from: 'NODE 7 WEATHER AUTHORITY',
      to: 'WEATHER DESK',
      subject: 'STORM OUTLOOK CORRECTION',
      body: ['NORTHWEST CORRIDOR ONLY.', 'PRIOR ADVISORY SUPERSEDED.'],
      recordId: 'W02',
      requiredKind: 'weather',
      correctRecipient: 'WEATHER_DESK',
      supersededBy: null,
    },
    {
      id: 'M02',
      from: 'NODE 7 WEATHER AUTHORITY',
      to: 'PAYROLL DESK',
      subject: 'STORM OUTLOOK REV A',
      // Authored recipient hint is deliberately misleading on the stale
      // duplicate; the view renders it verbatim with no correction.
      body: ['ROUTE THIS COPY TO PAYROLL DESK.', 'STALE REVISION.'],
      recordId: 'W02',
      requiredKind: 'weather',
      correctRecipient: 'WEATHER_DESK',
      supersededBy: 'M01',
    },
    {
      id: 'M03',
      from: 'PAY NODE',
      to: 'PAYROLL DESK',
      subject: 'PAYROLL RUN',
      body: ['PAYROLL RUN TOTALS ATTACHED.'],
      recordId: 'B04',
      requiredKind: 'payroll',
      correctRecipient: 'PAYROLL_DESK',
      supersededBy: null,
    },
    {
      id: 'M04',
      from: 'AUDIT NODE',
      to: 'AUDIT DESK',
      subject: 'AUDIT EXPORT BULLETIN',
      body: ['EXERCISE BULLETIN PUBLISHED TO ACTIVE FEED.', 'EXPORT FEED R04.'],
      recordId: 'C17',
      requiredKind: 'audit',
      correctRecipient: 'AUDIT_DESK',
      supersededBy: null,
    },
    {
      id: 'M05',
      from: 'UNKNOWN',
      to: null,
      subject: 'CHAIN LETTER',
      body: ['DECOY NOISE.', 'NO RECORD ATTACHED.'],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
  ],
  channelTuning: {
    backupCapacity: 5,
    primaryEtaSeconds: [30, 90],
    backupEtaSeconds: 120,
  },
  stageChanges: [
    {
      offsetSeconds: 60,
      warningLine: 'PRIMARY LINK DEGRADING. ACK TIMES RISING.',
      cueId: 'tone-fall-1',
    },
    {
      offsetSeconds: 120,
      warningLine: 'PRIMARY LINK DARK. BACKUP REMAINS USABLE TO THE DEADLINE.',
      cueId: 'tone-fall-2',
    },
    {
      offsetSeconds: 180,
      warningLine: 'STAGE THREE RESERVED.',
      cueId: 'tone-fall-3',
    },
  ],
  warningOffsets: [
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
  ],
  commsDelayedTable: {
    full: 0,
    partial: 10,
    poor: 20,
    failed: 30,
  },
}

/** Build an EngineContext over the fixture payload, records, and desk
 *  checks, registering only the outlook mission. Mirrors the engine
 *  module test's buildTestContext usage. */
export function makeOutlookCtx(): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: OUTLOOK_FIXTURE_RECORDS,
    deskChecks: OUTLOOK_DESK_CHECKS,
    missionPayloads: { outlook: OUTLOOK_FIXTURE_PAYLOAD },
    schedules: { outlook: [...outlookSchedule(OUTLOOK_FIXTURE_PAYLOAD)] },
    missionDurationsMs: { outlook: OUTLOOK_DURATION_MS },
  }
  return buildTestContext(OUTLOOK_FIXTURE_RECORDS, overrides, {
    missions: { outlook: makeOutlookMission(OUTLOOK_FIXTURE_PAYLOAD) },
    missionOrder: ['outlook'],
  })
}
