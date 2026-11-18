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
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
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
