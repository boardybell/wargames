// A minimal in-test GROUND ALL FLIGHTS fixture for the shell screens. Four
// fictional hubs, a handful of flights, a small corridor graph, a short storm
// track, and one projection correction. This is NOT the authored seed (section
// 02 writes those); the screens render whatever payload is active, so a handful
// of hubs and flights prove every view. The records, desk-check table, and clue
// record mirror the engine flights fixtures (F06 is the all-hubs restriction
// record that logs the D-83 clue; W02 is the OBSERVED field report a PROBE on
// the Meridian-Cascade corridor runs CHECK SOURCE against; L09 is the laundered
// OBSERVED record behind the Meridian-Sable corridor) so TRACE and PROBE have
// real records and real desk answers to resolve against.
import type { EngineContext } from '@engine'
import type { EvidenceRecord } from '@engine'
import type { SeedDefinition } from '@engine'
import type {
  ClueRecordEntry,
  DeskCheckEntry,
} from '@engine/missions/types'
import { buildTestContext } from '@engine/testing'
import {
  FLIGHTS_MISSION_ID,
  flightsSchedule,
  makeFlightsMission,
} from '@engine/missions/flights/module'
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
import type { CampaignState } from '@engine'

export const FLIGHTS_DURATION_MS = 240_000
export const FLIGHTS_CLUE_ID = 'clue-D-83'
/** The all-hubs restriction record (F06 equivalent), engine-owned as a clue
 *  record. Inspecting it logs D-83 with no mission involvement. */
export const RESTRICTION_RECORD_ID = 'F06'

/** The evidence records the fixture corridors point at. F06 is the DERIVED
 *  all-hubs restriction record (TRACE target, clue source); W02 is the OBSERVED
 *  field report; L09 is the laundered OBSERVED record. */
export const FLIGHTS_FIXTURE_RECORDS: EvidenceRecord[] = [
  {
    id: 'C17',
    origin: 'EXERCISE',
    sourceId: 'D83-EXPORT',
    parentId: null,
    runId: 'R04',
    eventTime: 76440,
    receiptTime: 76445,
    subsystem: 'flights',
    body: ['PREVIEW GROUNDING ADVISORY PUBLISHED TO ACTIVE FEED'],
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
    body: ['ALL HUBS RESTRICTION PER C17'],
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
    body: ['LOCAL WEATHER WARNING: NORTHWEST CORRIDOR ONLY'],
  },
  {
    id: 'L09',
    origin: 'OBSERVED',
    sourceId: 'RELAY-DESK',
    parentId: 'F06',
    runId: null,
    eventTime: 76500,
    receiptTime: 76505,
    subsystem: 'flights',
    body: ['CONFIRMING RESTRICTION AS RELAYED'],
  },
]

/** The desk-check answers for the two field reports. W02 comes back CONFIRMED;
 *  L09 comes back CONTRADICTED (its OBSERVED label launders R04 provenance).
 *  delaySeconds is small so a single advance resolves a PROBE. */
export const FLIGHTS_DESK_CHECKS: DeskCheckEntry[] = [
  { recordId: 'W02', outcome: 'CONFIRMED', delaySeconds: 5, replyBody: ['FIELD STATION CORROBORATES. OBSERVED AND INDEPENDENT.'] },
  { recordId: 'L09', outcome: 'CONTRADICTED', delaySeconds: 5, replyBody: ['NO INDEPENDENT SOURCE. RELAYED FROM THE RESTRICTION ONLY.'] },
]

export const FLIGHTS_CLUE_RECORDS: ClueRecordEntry[] = [
  { recordId: RESTRICTION_RECORD_ID, clueId: FLIGHTS_CLUE_ID },
]

/** Four hubs in a fixed authored order (MERIDIAN, CASCADE, SABLE, VERDANT).
 *  Runway slots are small so capacity rejections bite. MERIDIAN's departure
 *  window closes at 120 s so RELEASE-after-window can be exercised. Eight
 *  flights so the list-parity test has the canonical fleet size. */
export const FLIGHTS_FIXTURE_PAYLOAD: FlightsPayload = {
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
    { id: 'WX106', originHubId: 'VERDANT', destinationHubId: 'CASCADE', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 70 },
    { id: 'WX107', originHubId: 'SABLE', destinationHubId: 'VERDANT', departureOffsetSeconds: 30, cruiseSeconds: 60, passengers: 90 },
    { id: 'WX108', originHubId: 'CASCADE', destinationHubId: 'MERIDIAN', departureOffsetSeconds: 30, cruiseSeconds: 60, passengers: 55 },
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
      lastSafeDecisionAtSeconds: 90,
      warningLine: 'FORECAST CORRECTED. MERIDIAN SABLE CLEARS SOONER.',
      cueId: 'tone-correct-1',
    },
  ],
  tierThresholds: { full: 400, partial: 260, poor: 140 },
  latenessThresholdSeconds: 20,
  leadMarginSeconds: 30,
  paymentsDelayedTargetHubId: 'MERIDIAN',
  flightsDisruptedTable: { full: 0, partial: 10, poor: 20, failed: 30 },
}

/** Build an EngineContext over the fixture payload, records, desk checks, and
 *  clue record, registering only the flights mission. Mirrors the engine
 *  module test's buildTestContext usage exactly. */
export function makeFlightsCtx(
  payload: FlightsPayload = FLIGHTS_FIXTURE_PAYLOAD,
): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: FLIGHTS_FIXTURE_RECORDS,
    deskChecks: FLIGHTS_DESK_CHECKS,
    clueRecords: FLIGHTS_CLUE_RECORDS,
    missionPayloads: { [FLIGHTS_MISSION_ID]: payload },
    schedules: { [FLIGHTS_MISSION_ID]: [...flightsSchedule(payload)] },
    missionDurationsMs: { [FLIGHTS_MISSION_ID]: FLIGHTS_DURATION_MS },
  }
  return buildTestContext(FLIGHTS_FIXTURE_RECORDS, overrides, {
    missions: { [FLIGHTS_MISSION_ID]: makeFlightsMission(payload) },
    missionOrder: [FLIGHTS_MISSION_ID],
  })
}

/** Read the live flights substate off a campaign state. */
export function flightsSub(state: CampaignState): FlightsState {
  return state.activeMission?.substate as FlightsState
}
