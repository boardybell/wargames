// The valibot schema is the source of truth for CampaignState; the TS
// type derives via InferOutput so schema and type cannot drift. Mission
// substate is an open JSON-safe slot here; the save layer composes the
// per-mission saveSchema at load (section 08).
import * as v from 'valibot'

const integer = v.pipe(v.number(), v.integer())

const scheduledEventSchema = v.object({
  id: v.string(),
  scheduledAt: integer,
  kind: v.string(),
  payload: v.unknown(),
})

const rngStateSchema = v.object({
  words: v.array(v.pipe(v.number(), v.finite())),
})

const consequenceSchema = v.object({
  id: v.string(),
  kind: v.picklist(['commsDelayed', 'flightsDisrupted', 'paymentsDelayed']),
  magnitude: integer,
})

const settledOutcomeSchema = v.object({
  missionId: v.string(),
  cause: v.picklist(['completed', 'collapsed', 'timeout', 'forfeit']),
  tier: v.picklist(['full', 'partial', 'poor', 'failed']),
  metrics: v.record(v.string(), integer),
  clueId: v.nullable(v.string()),
  consequences: v.array(consequenceSchema),
  endingId: v.optional(v.picklist(['recovery', 'containment', 'failure'])),
})

const appliedMarkerSchema = v.object({
  consequenceId: v.string(),
  targetMissionId: v.string(),
})

const sourceCheckResultSchema = v.object({
  recordId: v.string(),
  outcome: v.picklist(['CONFIRMED', 'CONTRADICTED', 'PENDING', 'UNKNOWN']),
  resolvedAt: integer,
  arrivedAfterSettlement: v.boolean(),
})

const missionRuntimeSchema = v.object({
  missionId: v.string(),
  endsAt: integer,
  actionCount: integer,
  /** Mission substate: opaque JSON-safe value validated per mission by
   *  the composed saveSchema at load. */
  substate: v.unknown(),
})

export const campaignStateSchema = v.object({
  seedName: v.string(),
  rng: rngStateSchema,
  openExceptionsBaseline: integer,
  lastNow: integer,
  phase: v.picklist(['menu', 'mission', 'debrief', 'finale', 'ended']),
  activeMission: v.nullable(missionRuntimeSchema),
  missionQueue: v.array(scheduledEventSchema),
  campaignQueue: v.array(scheduledEventSchema),
  settled: v.array(settledOutcomeSchema),
  acknowledgedDebriefs: v.array(v.string()),
  startedMissionIds: v.array(v.string()),
  cluesFound: v.array(v.string()),
  sourceChecks: v.array(sourceCheckResultSchema),
  inspectedRecords: v.array(v.string()),
  appliedConsequences: v.array(appliedMarkerSchema),
  preferences: v.object({ extendedTime: v.boolean() }),
})

export type CampaignState = v.InferOutput<typeof campaignStateSchema>

export type MissionRuntime = v.InferOutput<typeof missionRuntimeSchema>
