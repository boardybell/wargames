// The three curated campaigns. No procedural generation, no arbitrary
// player seeds: every seed here is hand-authored and mechanically
// validated (test/engine/seeds). Mission payloads stay loose at this
// layer; mission splits narrow their own and replace the registered
// modules, never these definitions.
import type { EvidenceRecord } from '../records'
import type { ScheduledEventSpec } from '../time'
import type {
  ClueRecordEntry,
  DeskCheckEntry,
  SeedDefinition,
} from '../missions/types'

export const MISSION_IDS = ['outlook', 'flights', 'bank'] as const
export const FINALE_ID = 'finale'

export const CLUE_IDS = {
  audit: 'clue-d83-audit',
  restriction: 'clue-d83-restriction',
  ledgerHold: 'clue-d83-ledger-hold',
} as const

const STANDARD_MISSION_MS = 240_000
const STANDARD_FINALE_MS = 180_000

/** Finale desk wait must leave validate-and-commit room (amendment 12):
 *  wait <= finale duration minus this margin. */
export const FINALE_DECISION_MARGIN_S = 60

function milestones(): ScheduledEventSpec[] {
  return [
    {
      id: 'warn-30',
      offsetSeconds: 30,
      anchor: 'end',
      kind: 'timerMilestone',
      payload: null,
    },
    {
      id: 'warn-10',
      offsetSeconds: 10,
      anchor: 'end',
      kind: 'timerMilestone',
      payload: null,
    },
  ]
}

interface SeedSpec {
  name: string
  description: string
  seedNumber: number
  runId: string
  /** Anchor second-of-day for the incident (fixture: 76440 = 21:14:00). */
  records: EvidenceRecord[]
  deskChecks: DeskCheckEntry[]
  clueRecords: ClueRecordEntry[]
  openExceptionsBaseline: number
}

function build(spec: SeedSpec): SeedDefinition {
  return {
    name: spec.name,
    description: spec.description,
    seedNumber: spec.seedNumber,
    exerciseRunId: spec.runId,
    records: spec.records,
    deskChecks: spec.deskChecks,
    clueRecords: spec.clueRecords,
    missionPayloads: { outlook: null, flights: null, bank: null, finale: null },
    schedules: {
      outlook: [
        ...milestones(),
        {
          id: 'stage-slow',
          offsetSeconds: 90,
          anchor: 'start',
          kind: 'stage',
          payload: null,
        },
        {
          id: 'stage-dark',
          offsetSeconds: 180,
          anchor: 'start',
          kind: 'stage',
          payload: null,
        },
      ],
      flights: [
        ...milestones(),
        {
          id: 'storm-step-1',
          offsetSeconds: 60,
          anchor: 'start',
          kind: 'stormStep',
          payload: null,
        },
        {
          id: 'forecast-correction',
          offsetSeconds: 100,
          anchor: 'start',
          kind: 'forecastCorrection',
          payload: null,
        },
        {
          id: 'storm-step-2',
          offsetSeconds: 160,
          anchor: 'start',
          kind: 'stormStep',
          payload: null,
        },
      ],
      bank: [
        ...milestones(),
        {
          id: 'tick-1',
          offsetSeconds: 60,
          anchor: 'start',
          kind: 'confidenceTick',
          payload: null,
        },
        {
          id: 'tick-2',
          offsetSeconds: 120,
          anchor: 'start',
          kind: 'confidenceTick',
          payload: null,
        },
        {
          id: 'tick-3',
          offsetSeconds: 180,
          anchor: 'start',
          kind: 'confidenceTick',
          payload: null,
        },
      ],
      finale: [
        ...milestones(),
        {
          id: 'final-phase',
          offsetSeconds: 20,
          anchor: 'end',
          kind: 'finaleFinalPhase',
          payload: null,
        },
      ],
    },
    missionDurationsMs: {
      outlook: STANDARD_MISSION_MS,
      flights: STANDARD_MISSION_MS,
      bank: STANDARD_MISSION_MS,
      finale: STANDARD_FINALE_MS,
    },
    openExceptionsBaseline: spec.openExceptionsBaseline,
  }
}

// ── Seed one: the requirements fixture, run R04, anchored 21:14 ──────
const seedOneRecords: EvidenceRecord[] = [
  {
    id: 'C17',
    origin: 'EXERCISE',
    sourceId: 'D83-EXPORT',
    parentId: null,
    runId: 'R04',
    eventTime: 76440,
    receiptTime: 76445,
    subsystem: 'outlook',
    body: [
      'EXERCISE D-83 RUN R04 EXPORT',
      'PREVIEW OF A GROUNDING ADVISORY PUBLISHED TO THE ACTIVE FEED',
    ],
  },
  {
    id: 'F06',
    origin: 'DERIVED',
    sourceId: 'FLIGHT-CONTROL',
    parentId: 'C17',
    runId: 'R04',
    eventTime: 76448,
    receiptTime: 76492,
    subsystem: 'flights',
    body: [
      'ALL HUBS RESTRICTION EFFECTIVE IMMEDIATELY',
      'GENERATED FROM ADVISORY C17, RUN STAMP R04',
    ],
  },
  {
    id: 'B04',
    origin: 'DERIVED',
    sourceId: 'BANK-OPS',
    parentId: 'F06',
    runId: 'R04',
    eventTime: 76461,
    receiptTime: 76470,
    subsystem: 'bank',
    body: [
      'EMERGENCY HOLD NOTICE CITING RESTRICTION F06',
      'ASSUMES A SYSTEM-WIDE SHUTDOWN IN PROGRESS',
    ],
  },
  {
    id: 'W02',
    origin: 'OBSERVED',
    sourceId: 'FIELD-NW',
    parentId: null,
    runId: null,
    eventTime: 76455,
    receiptTime: 76460,
    subsystem: 'flights',
    body: [
      'FIELD WEATHER WARNING: NORTHWEST CORRIDOR ONLY',
      'EAST CORRIDOR REMAINS OPEN AND OBSERVED CLEAR',
    ],
  },
  {
    id: 'R21',
    origin: 'OBSERVED',
    sourceId: 'FIELD-DESK',
    parentId: null,
    runId: null,
    eventTime: 76520,
    receiptTime: 76530,
    subsystem: 'flights',
    body: [
      'FIELD REPORT ON EMERGENCY SCOPE',
      'LOCAL DISRUPTION ONLY; NO SYSTEM-WIDE EVENT OBSERVED',
    ],
  },
]

const seedOne = build({
  name: 'exercise-r04',
  description: 'THE RESTORED SESSION. RUN R04, 21:14.',
  seedNumber: 1983,
  runId: 'R04',
  records: seedOneRecords,
  deskChecks: [
    {
      recordId: 'C17',
      outcome: 'CONTRADICTED',
      delaySeconds: 35,
      replyBody: ['DESK FINDS NO OPERATIONAL ORDER BEHIND THE ADVISORY'],
    },
    {
      recordId: 'F06',
      outcome: 'UNKNOWN',
      delaySeconds: 40,
      replyBody: ['FLIGHT DESK CANNOT LOCATE AN INDEPENDENT BASIS'],
    },
    {
      recordId: 'B04',
      outcome: 'PENDING',
      delaySeconds: 50,
      replyBody: ['BANK DESK QUEUE BACKED UP'],
    },
    {
      recordId: 'W02',
      outcome: 'CONFIRMED',
      delaySeconds: 25,
      replyBody: ['FIELD DESK CONFIRMS LOCAL SCOPE, NORTHWEST ONLY'],
    },
    {
      recordId: 'R21',
      outcome: 'CONFIRMED',
      delaySeconds: 45,
      replyBody: ['FIELD DESK CONFIRMS: LOCAL DISRUPTION ONLY'],
    },
  ],
  clueRecords: [
    { recordId: 'F06', clueId: CLUE_IDS.restriction },
    { recordId: 'B04', clueId: CLUE_IDS.ledgerHold },
  ],
  openExceptionsBaseline: 12,
})

// ── Seed two: run K11, anchored 06:42 (24120) ───────────────────────
const seedTwoRecords: EvidenceRecord[] = [
  {
    id: 'A09',
    origin: 'EXERCISE',
    sourceId: 'D83-EXPORT',
    parentId: null,
    runId: 'K11',
    eventTime: 24120,
    receiptTime: 24126,
    subsystem: 'outlook',
    body: ['EXERCISE D-83 RUN K11 EXPORT', 'ICING ADVISORY PREVIEW ON LIVE FEED'],
  },
  {
    id: 'G12',
    origin: 'DERIVED',
    sourceId: 'FLIGHT-CONTROL',
    parentId: 'A09',
    runId: 'K11',
    eventTime: 24130,
    receiptTime: 24185,
    subsystem: 'flights',
    body: ['ALL HUBS RESTRICTION PER ADVISORY A09, RUN STAMP K11'],
  },
  {
    id: 'H03',
    origin: 'DERIVED',
    sourceId: 'BANK-OPS',
    parentId: 'G12',
    runId: 'K11',
    eventTime: 24142,
    receiptTime: 24150,
    subsystem: 'bank',
    body: ['EMERGENCY HOLD CITING G12', 'ASSUMES NATIONWIDE GROUND STOP'],
  },
  {
    id: 'V07',
    origin: 'OBSERVED',
    sourceId: 'FIELD-SE',
    parentId: null,
    runId: null,
    eventTime: 24135,
    receiptTime: 24140,
    subsystem: 'flights',
    body: ['FIELD ICING WARNING: SOUTHEAST APPROACH ONLY'],
  },
  {
    id: 'R33',
    origin: 'OBSERVED',
    sourceId: 'FIELD-DESK',
    parentId: null,
    runId: null,
    eventTime: 24200,
    receiptTime: 24210,
    subsystem: 'flights',
    body: ['FIELD REPORT ON SCOPE: ONE APPROACH AFFECTED, NOTHING SYSTEMIC'],
  },
]

const seedTwo = build({
  name: 'exercise-k11',
  description: 'THE DAWN RUN. RUN K11, 06:42.',
  seedNumber: 2718,
  runId: 'K11',
  records: seedTwoRecords,
  deskChecks: [
    {
      recordId: 'A09',
      outcome: 'CONTRADICTED',
      delaySeconds: 35,
      replyBody: ['NO OPERATIONAL ORDER FOUND'],
    },
    {
      recordId: 'G12',
      outcome: 'UNKNOWN',
      delaySeconds: 40,
      replyBody: ['NO INDEPENDENT BASIS LOCATED'],
    },
    {
      recordId: 'H03',
      outcome: 'PENDING',
      delaySeconds: 50,
      replyBody: ['QUEUE BACKED UP'],
    },
    {
      recordId: 'V07',
      outcome: 'CONFIRMED',
      delaySeconds: 25,
      replyBody: ['CONFIRMED: SOUTHEAST APPROACH ONLY'],
    },
    {
      recordId: 'R33',
      outcome: 'CONFIRMED',
      delaySeconds: 45,
      replyBody: ['CONFIRMED: NOTHING SYSTEMIC'],
    },
  ],
  clueRecords: [
    { recordId: 'G12', clueId: CLUE_IDS.restriction },
    { recordId: 'H03', clueId: CLUE_IDS.ledgerHold },
  ],
  openExceptionsBaseline: 14,
})

// ── Seed three: run T58, anchored 14:07 (50820) ─────────────────────
const seedThreeRecords: EvidenceRecord[] = [
  {
    id: 'E22',
    origin: 'EXERCISE',
    sourceId: 'D83-EXPORT',
    parentId: null,
    runId: 'T58',
    eventTime: 50820,
    receiptTime: 50824,
    subsystem: 'outlook',
    body: ['EXERCISE D-83 RUN T58 EXPORT', 'CROSSWIND ADVISORY PREVIEW ON LIVE FEED'],
  },
  {
    id: 'J15',
    origin: 'DERIVED',
    sourceId: 'FLIGHT-CONTROL',
    parentId: 'E22',
    runId: 'T58',
    eventTime: 50831,
    receiptTime: 50880,
    subsystem: 'flights',
    body: ['ALL HUBS RESTRICTION PER ADVISORY E22, RUN STAMP T58'],
  },
  {
    id: 'K08',
    origin: 'DERIVED',
    sourceId: 'BANK-OPS',
    parentId: 'J15',
    runId: 'T58',
    eventTime: 50845,
    receiptTime: 50852,
    subsystem: 'bank',
    body: ['EMERGENCY HOLD CITING J15', 'ASSUMES TOTAL TRAFFIC HALT'],
  },
  {
    id: 'U04',
    origin: 'OBSERVED',
    sourceId: 'FIELD-W',
    parentId: null,
    runId: null,
    eventTime: 50838,
    receiptTime: 50843,
    subsystem: 'flights',
    body: ['FIELD CROSSWIND WARNING: WEST RUNWAYS ONLY'],
  },
  {
    id: 'R47',
    origin: 'OBSERVED',
    sourceId: 'FIELD-DESK',
    parentId: null,
    runId: null,
    eventTime: 50900,
    receiptTime: 50910,
    subsystem: 'flights',
    body: ['FIELD REPORT ON SCOPE: WEST RUNWAYS AFFECTED, EAST NORMAL'],
  },
]

const seedThree = build({
  name: 'exercise-t58',
  description: 'THE AFTERNOON RUN. RUN T58, 14:07.',
  seedNumber: 3141,
  runId: 'T58',
  records: seedThreeRecords,
  deskChecks: [
    {
      recordId: 'E22',
      outcome: 'CONTRADICTED',
      delaySeconds: 35,
      replyBody: ['NO OPERATIONAL ORDER FOUND'],
    },
    {
      recordId: 'J15',
      outcome: 'UNKNOWN',
      delaySeconds: 40,
      replyBody: ['NO INDEPENDENT BASIS LOCATED'],
    },
    {
      recordId: 'K08',
      outcome: 'PENDING',
      delaySeconds: 50,
      replyBody: ['QUEUE BACKED UP'],
    },
    {
      recordId: 'U04',
      outcome: 'CONFIRMED',
      delaySeconds: 25,
      replyBody: ['CONFIRMED: WEST RUNWAYS ONLY'],
    },
    {
      recordId: 'R47',
      outcome: 'CONFIRMED',
      delaySeconds: 45,
      replyBody: ['CONFIRMED: EAST NORMAL'],
    },
  ],
  clueRecords: [
    { recordId: 'J15', clueId: CLUE_IDS.restriction },
    { recordId: 'K08', clueId: CLUE_IDS.ledgerHold },
  ],
  openExceptionsBaseline: 10,
})

export const SEED_CATALOG: Readonly<Record<string, SeedDefinition>> = {
  [seedOne.name]: seedOne,
  [seedTwo.name]: seedTwo,
  [seedThree.name]: seedThree,
}

export const SEED_NAMES = Object.keys(SEED_CATALOG).sort()

/** The finale field-report record per seed (amendment 12): OBSERVED,
 *  independent of the exercise run, desk-answerable inside the bounded
 *  wait. */
export const FINALE_FIELD_REPORT: Readonly<Record<string, string>> = {
  'exercise-r04': 'R21',
  'exercise-k11': 'R33',
  'exercise-t58': 'R47',
}

export function seedCatalogMetadata(): Array<{
  name: string
  description: string
}> {
  return SEED_NAMES.map((name) => ({
    name,
    description: SEED_CATALOG[name]!.description,
  }))
}
