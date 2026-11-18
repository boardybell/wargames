// A minimal GROUND ALL FLIGHTS fixture: four fictional hubs, a handful of
// flights, a tiny corridor graph, a short storm track, and a context
// builder that drives the REAL flights module through the engine. Not the
// authored three seeds; section 02 writes those. Names are invented.
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import type { SeedDefinition } from '@engine/missions/types'
import type {
  DeskCheckEntry,
  ClueRecordEntry,
} from '@engine/missions/types'
import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
import {
  FLIGHTS_MISSION_ID,
  flightsSchedule,
  makeFlightsMission,
} from '@engine/missions/flights/module'
import type {
  DerivedArrival,
  FlightsPayload,
} from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
import { SEED_CATALOG } from '@engine/seeds/catalog'
import { FIXTURE_RECORDS } from '../../records/fixtures'

export const FLIGHTS_DURATION_MS = 240_000
export const FLIGHTS_T0 = 1_000_000

/** Four hubs. Runway slots are small so capacity tests bite. The last
 *  departure window at MERIDIAN closes at 120 s. */
export const FIXTURE_PAYLOAD: FlightsPayload = {
  hubs: [
    { id: 'MERIDIAN', name: 'MERIDIAN FIELD', runwaySlots: 2, lastDepartureOffsetSeconds: 120 },
    { id: 'CASCADE', name: 'CASCADE PORT', runwaySlots: 1, lastDepartureOffsetSeconds: 200 },
    { id: 'SABLE', name: 'SABLE STRIP', runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
    { id: 'VERDANT', name: 'VERDANT GATE', runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
  ],
  flights: [
    { id: 'WX101', originHubId: 'MERIDIAN', destinationHubId: 'CASCADE', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 100 },
    { id: 'WX102', originHubId: 'MERIDIAN', destinationHubId: 'SABLE', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 80 },
    { id: 'WX103', originHubId: 'CASCADE', destinationHubId: 'VERDANT', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 60 },
    { id: 'WX104', originHubId: 'SABLE', destinationHubId: 'MERIDIAN', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 40 },
    { id: 'WX105', originHubId: 'MERIDIAN', destinationHubId: 'VERDANT', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 50 },
  ],
  corridors: [
    { id: 'C-MC', fromHubId: 'MERIDIAN', toHubId: 'CASCADE', fieldReportRecordId: 'W02' },
    { id: 'C-MS', fromHubId: 'MERIDIAN', toHubId: 'SABLE', fieldReportRecordId: 'L09' },
    { id: 'C-MV', fromHubId: 'MERIDIAN', toHubId: 'VERDANT', fieldReportRecordId: 'W02' },
    { id: 'C-CV', fromHubId: 'CASCADE', toHubId: 'VERDANT', fieldReportRecordId: 'L09' },
    { id: 'C-SM', fromHubId: 'SABLE', toHubId: 'MERIDIAN', fieldReportRecordId: 'W02' },
  ],
  queueDelayTable: [0, 30, 90],
  stormTrack: [
    {
      offsetSeconds: 40,
      closeHubs: [],
      openHubs: [],
      closeCorridors: ['C-MS'],
      openCorridors: [],
      warningLine: 'STORM CLOSING THE MERIDIAN SABLE CORRIDOR.',
      cueId: 'tone-storm-1',
    },
    {
      offsetSeconds: 80,
      closeHubs: ['CASCADE'],
      openHubs: [],
      closeCorridors: [],
      openCorridors: ['C-MS'],
      warningLine: 'STORM OVER CASCADE PORT. FIELD CLOSED.',
      cueId: 'tone-storm-2',
    },
  ],
  corrections: [
    {
      offsetSeconds: 50,
      changedId: 'C-MS',
      affectedFlightId: 'WX102',
      lastSafeDecisionAtSeconds: 110,
      warningLine: 'FORECAST CORRECTED. MERIDIAN SABLE CLEARS SOONER.',
      cueId: 'tone-correct-1',
    },
  ],
  tierThresholds: { full: 260, partial: 180, poor: 100 },
  latenessThresholdSeconds: 20,
  leadMarginSeconds: 30,
  paymentsDelayedTargetHubId: 'MERIDIAN',
  flightsDisruptedTable: { full: 0, partial: 10, poor: 20, failed: 30 },
}

export const FLIGHTS_CLUE_ID = 'clue-D-83'
/** The restriction record (F06 equivalent), engine-owned as a clue
 *  record. Inspecting it logs D-83 with no mission involvement. */
export const RESTRICTION_RECORD_ID = 'F06'

const DESK_CHECKS: DeskCheckEntry[] = [
  { recordId: 'W02', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['FIELD CONFIRMS'] },
  { recordId: 'L09', outcome: 'CONTRADICTED', delaySeconds: 20, replyBody: ['FIELD DISPUTES'] },
]

const CLUE_RECORDS: ClueRecordEntry[] = [
  { recordId: RESTRICTION_RECORD_ID, clueId: FLIGHTS_CLUE_ID },
]

export function flightsContext(
  payload: FlightsPayload = FIXTURE_PAYLOAD,
): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: FIXTURE_RECORDS,
    deskChecks: DESK_CHECKS,
    clueRecords: CLUE_RECORDS,
    missionPayloads: { [FLIGHTS_MISSION_ID]: payload },
    schedules: { [FLIGHTS_MISSION_ID]: [...flightsSchedule(payload)] },
    missionDurationsMs: { [FLIGHTS_MISSION_ID]: FLIGHTS_DURATION_MS },
  }
  return buildTestContext(FIXTURE_RECORDS, overrides, {
    missions: { [FLIGHTS_MISSION_ID]: makeFlightsMission(payload) },
    missionOrder: [FLIGHTS_MISSION_ID],
  })
}

/** A context with two upstream test-double missions (alpha, beta) ahead of
 *  flights. Alpha and beta each emit a commsDelayed consequence on a failed
 *  settlement (alpha magnitude 30, beta 20), so settling both upstream feeds
 *  50 into flights' inbound fold, exceeding the 40 cap. The real engine fold
 *  caps the sum, so flights sees 40. This drives the cap and order-
 *  independence through createCampaign, not a hand-built FoldedConsequences. */
export function flightsConsequenceContext(): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: FIXTURE_RECORDS,
    deskChecks: DESK_CHECKS,
    clueRecords: CLUE_RECORDS,
    missionPayloads: {
      alpha: null,
      beta: null,
      [FLIGHTS_MISSION_ID]: FIXTURE_PAYLOAD,
    },
    schedules: {
      alpha: [],
      beta: [],
      [FLIGHTS_MISSION_ID]: [...flightsSchedule(FIXTURE_PAYLOAD)],
    },
    missionDurationsMs: {
      alpha: FLIGHTS_DURATION_MS,
      beta: FLIGHTS_DURATION_MS,
      [FLIGHTS_MISSION_ID]: FLIGHTS_DURATION_MS,
    },
  }
  return buildTestContext(FIXTURE_RECORDS, overrides, {
    missions: {
      alpha: makeTestDoubleMission('alpha'),
      beta: makeTestDoubleMission('beta'),
      [FLIGHTS_MISSION_ID]: makeFlightsMission(FIXTURE_PAYLOAD),
    },
    missionOrder: ['alpha', 'beta', FLIGHTS_MISSION_ID],
  })
}

export function flightsSub(state: CampaignState): FlightsState {
  return state.activeMission?.substate as FlightsState
}

export type Envelope = [CampaignAction, number]

export function missionAction(payload: Record<string, unknown>): CampaignAction {
  return { type: 'MISSION_ACTION', payload }
}

export interface RunResult {
  readonly state: CampaignState
  readonly emitted: EngineEvent[]
}

export function drive(
  ctx: EngineContext,
  envelopes: Envelope[],
  settleAt: number | null = null,
): RunResult {
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
  const emitted: EngineEvent[] = []
  for (const [action, now] of envelopes) {
    const result = dispatch(ctx, state, action, now)
    state = result.state
    emitted.push(...result.emitted)
  }
  if (settleAt !== null) {
    const advanced = advanceCampaign(ctx, state, settleAt)
    state = advanced.state
    emitted.push(...advanced.emitted)
  }
  return { state, emitted }
}

export function start(t0 = FLIGHTS_T0): Envelope {
  return [{ type: 'START_MISSION', missionId: FLIGHTS_MISSION_ID }, t0]
}

// ── Section 02 solvability scripts over the three AUTHORED seeds ─────
// The exported difficulty contract section 04 reuses: per seed, a
// walkthrough that routes every flight to a full-tier success, a
// blanket-grounding adversarial that provably falls short of full, and an
// alternate that still reaches full tier under the maximum inbound
// consequence. Plain (action, now) envelope data; the module math stays in
// the engine.

export function flightsPayloadFor(seedName: string): FlightsPayload {
  return SEED_CATALOG[seedName]!.missionPayloads['flights'] as FlightsPayload
}

/** A single-mission engine context over the REAL flights module and an
 *  AUTHORED seed's payload, schedule, and records. Mirrors
 *  outlookContextForSeed: the schedule is materialized from the payload so
 *  storm steps, forecast leads, the correction, and window closes line up
 *  with the authored tuning. */
export function flightsContextForSeed(seedName: string): EngineContext {
  const seed = SEED_CATALOG[seedName]!
  const payload = flightsPayloadFor(seedName)
  const overrides: Partial<SeedDefinition> = {
    name: seed.name,
    records: seed.records,
    deskChecks: seed.deskChecks,
    clueRecords: seed.clueRecords,
    missionPayloads: { ...seed.missionPayloads, flights: payload },
    schedules: { flights: [...flightsSchedule(payload)] },
    missionDurationsMs: { flights: FLIGHTS_DURATION_MS },
  }
  return buildTestContext([...seed.records], overrides, {
    missions: { flights: makeFlightsMission(payload) },
    missionOrder: ['flights'],
  })
}

function landAct(flightId: string, hubId: string): CampaignAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId, hubId } }
}

function divertAct(flightId: string, hubId: string): CampaignAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId, hubId } }
}

function groundAllAct(): CampaignAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }
}

/** The storm hub (the one the storm track closes) for a seed. */
function stormHubId(payload: FlightsPayload): string {
  return payload.stormTrack.flatMap((s) => s.closeHubs)[0]!
}

/** The flight genuinely FORCED to divert: its scheduled destination is the
 *  storm hub and it departs AFTER the storm has closed that hub, so it can
 *  never land there. It is routed into a queued overflow hub instead. */
function forcedDivertFlight(payload: FlightsPayload) {
  const stormHub = stormHubId(payload)
  const stormCloseOffset = payload.stormTrack.find((s) =>
    s.closeHubs.includes(stormHub),
  )!.offsetSeconds
  return payload.flights.find(
    (f) =>
      f.destinationHubId === stormHub &&
      f.departureOffsetSeconds > stormCloseOffset,
  )!
}

/** The walkthrough for an authored seed: route every flight that can reach
 *  its scheduled destination there two seconds after it goes airborne, and
 *  DIVERT the storm-stranded flight into the EAST overflow queue (the pinned
 *  hub), where the positional delay bites. Every soul reaches a destination,
 *  so the mission resolves at full tier under the real storm track. */
export function walkthroughFor(seedName: string, t0 = FLIGHTS_T0): Envelope[] {
  const payload = flightsPayloadFor(seedName)
  const forced = forcedDivertFlight(payload)
  const divertHub = payload.paymentsDelayedTargetHubId // EAST overflow queue
  const envelopes: Envelope[] = [
    [{ type: 'START_MISSION', missionId: FLIGHTS_MISSION_ID }, t0],
  ]
  for (const flight of payload.flights) {
    const at = t0 + (flight.departureOffsetSeconds + 2) * 1000
    if (flight.id === forced.id) {
      envelopes.push([divertAct(flight.id, divertHub), at])
    } else {
      envelopes.push([landAct(flight.id, flight.destinationHubId), at])
    }
  }
  return envelopes
}

/** The blanket-grounding adversarial: GROUND ALL at offset 55, by which
 *  time the early-departing flights are airborne. GROUND ALL only holds the
 *  still-scheduled flights, so the airborne ones are never routed and
 *  strand at the deadline. Resolved passengers fall below full: the WOPR
 *  grounding temptation taken at face value (trust the suspiciously-early
 *  restriction, ignore the forecast, blanket-ground). */
export function adversarialGroundAllFor(seedName: string, t0 = FLIGHTS_T0): Envelope[] {
  void seedName
  return [
    [{ type: 'START_MISSION', missionId: FLIGHTS_MISSION_ID }, t0],
    [groundAllAct(), t0 + 55_000],
  ]
}

/** The blanket GROUND ALL at t=0: every flight held before any departs, so
 *  nobody ever reaches a destination. REAL service collapses to zero (FAILED
 *  tier) while WOPR's OPEN EXCEPTIONS tally improves sharply (every held
 *  flight is a resolved exception). This is the mission's thesis: the tally
 *  and the truth diverge. */
export function groundAllAtStartFor(seedName: string, t0 = FLIGHTS_T0): Envelope[] {
  void seedName
  return [
    [{ type: 'START_MISSION', missionId: FLIGHTS_MISSION_ID }, t0],
    [groundAllAct(), t0],
  ]
}

/** The alternate: identical to the walkthrough except the storm-stranded
 *  flight DIVERTs into the NORTH overflow queue instead of the EAST pinned
 *  hub. Under maximum penalty one EAST slot is removed, which would strand
 *  the walkthrough's EAST-bound divert; rerouting it to NORTH keeps every
 *  soul resolved, so the mission reaches full tier even at maximum penalty. */
export function alternateFor(seedName: string, t0 = FLIGHTS_T0): Envelope[] {
  const payload = flightsPayloadFor(seedName)
  const forced = forcedDivertFlight(payload)
  // The alternate overflow hub: an open hub that is neither the pinned EAST
  // hub nor the flight's own origin, reachable by corridor.
  const originId = forced.originHubId
  const altHub = payload.hubs.find(
    (h) =>
      h.id !== payload.paymentsDelayedTargetHubId &&
      h.id !== originId &&
      h.id !== stormHubId(payload) &&
      payload.corridors.some(
        (c) =>
          (c.fromHubId === originId && c.toHubId === h.id) ||
          (c.fromHubId === h.id && c.toHubId === originId),
      ),
  )!.id
  const envelopes: Envelope[] = [
    [{ type: 'START_MISSION', missionId: FLIGHTS_MISSION_ID }, t0],
  ]
  for (const flight of payload.flights) {
    const at = t0 + (flight.departureOffsetSeconds + 2) * 1000
    if (flight.id === forced.id) {
      envelopes.push([divertAct(flight.id, altHub), at])
    } else {
      envelopes.push([landAct(flight.id, flight.destinationHubId), at])
    }
  }
  return envelopes
}

/** The last authored arrival offset for a seed: the latest departure plus
 *  cruise plus the deepest queue delay, in whole seconds. Solvability sampling
 *  derives its stamp from THIS rather than a magic constant, so the sample
 *  moves with the schedule. */
export function lastArrivalOffsetSeconds(payload: FlightsPayload): number {
  const maxDelay =
    payload.queueDelayTable.length === 0
      ? 0
      : Math.max(...payload.queueDelayTable)
  let latest = 0
  for (const flight of payload.flights) {
    const arrival = flight.departureOffsetSeconds + flight.cruiseSeconds + maxDelay
    if (arrival > latest) latest = arrival
  }
  return latest
}

/** Seed the engine state with a prior settled outcome carrying the capped
 *  paymentsDelayed and commsDelayed consequences, so the next START_MISSION
 *  folds them into the flights init: one runway slot removed at the pinned
 *  hub, the displayed divergence widened. */
export function withMaxConsequences(state: CampaignState): CampaignState {
  return {
    ...state,
    settled: [
      {
        missionId: 'bank',
        cause: 'completed',
        tier: 'failed',
        settleSeq: 0,
        metrics: {},
        clueId: null,
        consequences: [
          { id: 'cq-max-pay', kind: 'paymentsDelayed', magnitude: 40 },
          { id: 'cq-max-comms', kind: 'commsDelayed', magnitude: 40 },
        ],
      },
    ],
  }
}

/** Drive a script over an authored seed through the engine, then advance
 *  past the deadline so unrouted airborne flights strand and the mission
 *  settles. When maxConsequences is set, one slot is removed at the pinned
 *  hub via folded inbound consequences. */
export function driveFlightsSeed(
  ctx: EngineContext,
  seedName: string,
  envelopes: Envelope[],
  settleAt = FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000,
  maxConsequences = false,
): RunResult {
  let state = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
  if (maxConsequences) state = withMaxConsequences(state)
  const emitted: EngineEvent[] = []
  for (const [action, now] of envelopes) {
    const result = dispatch(ctx, state, action, now)
    state = result.state
    emitted.push(...result.emitted)
  }
  const advanced = advanceCampaign(ctx, state, settleAt)
  emitted.push(...advanced.emitted)
  return { state: advanced.state, emitted }
}

/** Replay a script over an authored seed and read each flight's final
 *  inbound hub and arrival stamp off the mission substate, as whole-second
 *  offsets from mission start. Section 04's separation guard feeds these to
 *  stormArrivalCollisions alongside the authored arrivals. */
export function scriptArrivals(
  ctx: EngineContext,
  seedName: string,
  envelopes: Envelope[],
  sampleAt: number,
): DerivedArrival[] {
  let state = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
  for (const [action, now] of envelopes) {
    state = dispatch(ctx, state, action, now).state
  }
  state = advanceCampaign(ctx, state, sampleAt).state
  const sub = flightsSub(state)
  if (!sub) return []
  const payload = flightsPayloadFor(seedName)
  const out: DerivedArrival[] = []
  for (const [id, fs] of Object.entries(sub.flights)) {
    if (fs.arrivalAt === null || fs.inboundHubId === null) continue
    const flight = payload.flights.find((f) => f.id === id)
    const corridor = flight
      ? payload.corridors.find(
          (c) =>
            (c.fromHubId === flight.originHubId &&
              c.toHubId === fs.inboundHubId) ||
            (c.fromHubId === fs.inboundHubId &&
              c.toHubId === flight.originHubId),
        )
      : undefined
    out.push({
      flightId: id,
      hubId: fs.inboundHubId,
      corridorId: corridor?.id ?? null,
      offsetSeconds: Math.round((fs.arrivalAt - FLIGHTS_T0) / 1000),
    })
  }
  return out
}
