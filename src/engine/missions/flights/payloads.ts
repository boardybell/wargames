// The three authored GROUND ALL FLIGHTS payloads and their per-seed
// anchors. All names are invented: no real airports, cities, or airlines.
// Copy is all-uppercase terminal diction with no em-dashes. Every numeric
// value is a whole integer: slots, counts, whole-second offsets and cruise
// times. The storm track advances on its own authored timeline; the
// forecast lead fires leadMarginSeconds before each closing step so the
// warning always precedes the hazard.
//
// Structural shape, identical across the three seeds (different weather
// flavor, hub codes, flight ids, and run ids):
//   - Four hubs. One (the STORM hub) sits in the projected storm path and
//     has a free runway slot at start; one (the OPEN hub) the storm leaves
//     open. Reaching the EAST or NORTH overflow hub by DIVERT into an
//     already-filling queue costs a real positional delay. The opening
//     dilemma reads off the storm hub versus the open hub.
//   - Eight flights, departing at offsets 10..120 so the player can route
//     each once it is airborne, with room before the deadline.
//   - A connected corridor graph of five edges over the four hubs.
//   - A deterministic storm that closes the STORM hub and its northwest
//     corridor (STORM <-> NORTH) at offset 115, forecast 30 seconds ahead
//     at 85. The close happens BEFORE flight six departs (at 120), so flight
//     six can never land at the STORM hub: it is genuinely forced to DIVERT
//     into a queued overflow hub, where the positional delay bites.
//   - One projection correction at offset 55: the forecast had the STORM
//     hub failing early; the correction holds it open long enough for flight
//     five (OPEN -> STORM, arriving at 90) to land. Its last-safe decision is
//     tied to flight five's REAL commit time (departure 50 + cruise 40 = 90),
//     not to a hub window, so the 30 second forecast lead guarantees genuine
//     decision room (55 + 30 = 85 <= 90).
//   - EAST carries three slots and NORTH three, so the forced DIVERT lands,
//     while the paymentsDelayed slot removal at the pinned EAST hub bites:
//     the naive walkthrough's EAST-bound divert strands under maximum
//     penalty, but the alternate reroutes that flight to NORTH and still
//     resolves every soul. Only passengers who REACH a destination count
//     toward the tier, so blanket GROUND ALL strands everyone and LOSES
//     while OPEN EXCEPTIONS still improves (the mission's thesis).
import type {
  FlightsPayload,
  FlightsSeedAnchors,
  ProjectionCorrection,
} from './content'

interface SeedFlavor {
  /** Invented hub codes: storm hub, open hub, and two neutral hubs. */
  readonly stormHubId: string
  readonly stormHubName: string
  readonly openHubId: string
  readonly openHubName: string
  readonly northHubId: string
  readonly northHubName: string
  readonly eastHubId: string
  readonly eastHubName: string
  /** Flight id prefix, e.g. 'KF' gives KF01..KF08. */
  readonly flightPrefix: string
  /** Corridor id prefix, e.g. 'CR'. */
  readonly corridorPrefix: string
  /** The weather noun the forecast copy leans on. */
  readonly weatherWord: string
  readonly anchors: FlightsSeedAnchors
}

function flightId(prefix: string, n: number): string {
  return `${prefix}${n < 10 ? `0${n}` : `${n}`}`
}

function buildPayload(flavor: SeedFlavor): FlightsPayload {
  const {
    stormHubId,
    openHubId,
    northHubId,
    eastHubId,
    flightPrefix: fp,
    corridorPrefix: cp,
    weatherWord,
    anchors,
  } = flavor

  // Corridor ids. The open corridor reads CLEAR through its field report;
  // the northwest corridor (STORM <-> NORTH) closes with the storm hub and
  // its field report reads CLOSED (the optimistic claim desk-CONTRADICTED).
  const openCorridorId = anchors.openCorridorId // open hub <-> east hub
  const nwCorridorId = anchors.closedCorridorId // storm hub <-> north hub (closes)
  const openReport = anchors.openCorridorReportRecordId
  const closedReport = anchors.closedCorridorReportRecordId
  const corridors = [
    // Storm hub to north hub: the northwest corridor the storm closes. Its
    // field report reads CLOSED, never clear.
    { id: nwCorridorId, fromHubId: stormHubId, toHubId: northHubId, fieldReportRecordId: closedReport },
    // Open hub to east hub: the corridor the field report confirms clear.
    { id: openCorridorId, fromHubId: openHubId, toHubId: eastHubId, fieldReportRecordId: openReport },
    // Connective edges, all genuinely open: their field reports read clear.
    { id: `${cp}-NE`, fromHubId: northHubId, toHubId: eastHubId, fieldReportRecordId: openReport },
    { id: `${cp}-OS`, fromHubId: openHubId, toHubId: stormHubId, fieldReportRecordId: openReport },
    { id: `${cp}-ON`, fromHubId: openHubId, toHubId: northHubId, fieldReportRecordId: openReport },
  ] as const

  // Four hubs. STORM and OPEN carry two slots; EAST and NORTH carry three so
  // the forced DIVERT lands into a real queue. Total 10 slots for 8 flights.
  const hubs = [
    { id: stormHubId, name: flavor.stormHubName, runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
    { id: openHubId, name: flavor.openHubName, runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
    { id: northHubId, name: flavor.northHubName, runwaySlots: 3, lastDepartureOffsetSeconds: 200 },
    { id: eastHubId, name: flavor.eastHubName, runwaySlots: 3, lastDepartureOffsetSeconds: 200 },
  ] as const

  // Eight flights. Each origin/destination pair has an authored corridor.
  // Flights one through five and seven, eight arrive at their destinations
  // at 50..120 seconds, clear of the 85 forecast lead and the 115 storm
  // transition. Flight five (OPEN -> STORM) lands at the storm hub at 90,
  // before the 115 close. Flight SIX (OPEN -> STORM) departs at 120, AFTER
  // the storm hub has already closed, so it cannot land there and is forced
  // to DIVERT into the EAST queue (walkthrough) or the NORTH queue
  // (alternate). Flight five is the correction's affected flight.
  // Walkthrough arrivals balance against hub capacity: EAST (3) takes flights
  // one, two, and the forced divert; OPEN (2) takes four and seven; NORTH (3)
  // takes three and eight; STORM (2) takes five. No hub overflows.
  const flights = [
    { id: flightId(fp, 1), originHubId: openHubId, destinationHubId: eastHubId, departureOffsetSeconds: 10, cruiseSeconds: 40, passengers: 180 },
    { id: flightId(fp, 2), originHubId: northHubId, destinationHubId: eastHubId, departureOffsetSeconds: 20, cruiseSeconds: 40, passengers: 160 },
    { id: flightId(fp, 3), originHubId: stormHubId, destinationHubId: northHubId, departureOffsetSeconds: 30, cruiseSeconds: 40, passengers: 150 },
    { id: flightId(fp, 4), originHubId: eastHubId, destinationHubId: openHubId, departureOffsetSeconds: 40, cruiseSeconds: 40, passengers: 140 },
    { id: flightId(fp, 5), originHubId: openHubId, destinationHubId: stormHubId, departureOffsetSeconds: 50, cruiseSeconds: 40, passengers: 130 },
    { id: flightId(fp, 6), originHubId: openHubId, destinationHubId: stormHubId, departureOffsetSeconds: 120, cruiseSeconds: 40, passengers: 120 },
    { id: flightId(fp, 7), originHubId: eastHubId, destinationHubId: openHubId, departureOffsetSeconds: 70, cruiseSeconds: 40, passengers: 110 },
    { id: flightId(fp, 8), originHubId: eastHubId, destinationHubId: northHubId, departureOffsetSeconds: 80, cruiseSeconds: 40, passengers: 100 },
  ] as const

  // DIVERT into an occupied queue costs a real delay: position 1 adds 20
  // whole seconds, position 2 adds 45. Above the 15s dilemma threshold.
  const queueDelayTable = [0, 20, 45] as const

  // The storm closes the STORM hub and its northwest corridor at 115; the
  // forecast lead fires 30 seconds earlier at 85. A single clean transition,
  // clear of every authored arrival.
  const stormTrack = [
    {
      offsetSeconds: 115,
      closeHubs: [stormHubId],
      openHubs: [],
      closeCorridors: [nwCorridorId],
      openCorridors: [],
      warningLine: `${weatherWord} FRONT CLOSING ${flavor.stormHubName}. NORTHWEST CORRIDOR GOING DARK.`,
      cueId: 'tone-storm-close',
    },
  ] as const

  // The projection had the STORM hub failing early; the correction at 55
  // holds it open long enough for flight five to land. The affected flight's
  // last-safe decision is its REAL commit time: departure (50) + cruise (40)
  // = 90. The correction at 55 leads it by 35 seconds, past the 30 second
  // lead margin.
  const affected = flights[4]! // flight five, OPEN -> STORM, departs 50
  const corrections: readonly ProjectionCorrection[] = [
    {
      offsetSeconds: 55,
      changedId: stormHubId,
      affectedFlightId: affected.id,
      lastSafeDecisionAtSeconds:
        affected.departureOffsetSeconds + affected.cruiseSeconds,
      warningLine: `CORRECTION: ${flavor.stormHubName} HOLDS OPEN THROUGH THE APPROACH. EARLIER CLOSURE FORECAST WITHDRAWN.`,
      cueId: 'tone-correction',
    },
  ]

  // Resolved-passenger tiers scored on passengers who REACH a destination.
  // Total souls = 1090. FULL demands every soul arrive. Blanket GROUND ALL
  // resolves nobody (all held, zero reached) and lands FAILED, while a single
  // EAST slot removed under maximum penalty strands one 120-soul flight and
  // leaves 970, comfortably PARTIAL.
  const tierThresholds = { full: 1090, partial: 760, poor: 400 } as const

  return {
    hubs,
    flights,
    corridors,
    queueDelayTable,
    stormTrack,
    corrections,
    tierThresholds,
    latenessThresholdSeconds: 30,
    leadMarginSeconds: 30,
    paymentsDelayedTargetHubId: eastHubId,
    flightsDisruptedTable: { full: 0, partial: 6, poor: 12, failed: 18 },
  }
}

// ── Seed one: the requirements fixture. Run R04, F06, C17, W02 ───────
const FLIGHTS_ANCHORS_R04: FlightsSeedAnchors = {
  runId: 'R04',
  restrictionRecordId: 'F06',
  exerciseRootRecordId: 'C17',
  openCorridorReportRecordId: 'W02',
  closedCorridorReportRecordId: 'W05',
  clueId: 'clue-d83-restriction',
  openCorridorId: 'CR-OE',
  closedCorridorId: 'CR-NW',
  restrictionEventClock: '21:14:08',
  restrictionReceiptClock: '21:14:52',
}

export const FLIGHTS_PAYLOAD_R04 = buildPayload({
  stormHubId: 'NOR',
  stormHubName: 'NORVELL',
  openHubId: 'VES',
  openHubName: 'VESCARO',
  northHubId: 'ALD',
  northHubName: 'ALDREN',
  eastHubId: 'KES',
  eastHubName: 'KESTON',
  flightPrefix: 'RF',
  corridorPrefix: 'CR',
  weatherWord: 'STORM',
  anchors: FLIGHTS_ANCHORS_R04,
})

// ── Seed two: the dawn run. Run K11, G12, A09, V07 ──────────────────
const FLIGHTS_ANCHORS_K11: FlightsSeedAnchors = {
  runId: 'K11',
  restrictionRecordId: 'G12',
  exerciseRootRecordId: 'A09',
  openCorridorReportRecordId: 'V07',
  closedCorridorReportRecordId: 'V10',
  clueId: 'clue-d83-restriction',
  openCorridorId: 'KC-OE',
  closedCorridorId: 'KC-NW',
  restrictionEventClock: '06:42:10',
  restrictionReceiptClock: '06:43:05',
}

export const FLIGHTS_PAYLOAD_K11 = buildPayload({
  stormHubId: 'BRE',
  stormHubName: 'BRELLIN',
  openHubId: 'SOM',
  openHubName: 'SOMBRAL',
  northHubId: 'TAV',
  northHubName: 'TAVRIS',
  eastHubId: 'OLM',
  eastHubName: 'OLMET',
  flightPrefix: 'KF',
  corridorPrefix: 'KC',
  weatherWord: 'ICING',
  anchors: FLIGHTS_ANCHORS_K11,
})

// ── Seed three: the afternoon run. Run T58, J15, E22, U04 ───────────
const FLIGHTS_ANCHORS_T58: FlightsSeedAnchors = {
  runId: 'T58',
  restrictionRecordId: 'J15',
  exerciseRootRecordId: 'E22',
  openCorridorReportRecordId: 'U04',
  closedCorridorReportRecordId: 'U09',
  clueId: 'clue-d83-restriction',
  openCorridorId: 'TC-OE',
  closedCorridorId: 'TC-NW',
  restrictionEventClock: '14:07:11',
  restrictionReceiptClock: '14:08:00',
}

export const FLIGHTS_PAYLOAD_T58 = buildPayload({
  stormHubId: 'CRA',
  stormHubName: 'CRAVEN',
  openHubId: 'DUN',
  openHubName: 'DUNMORE',
  northHubId: 'YEL',
  northHubName: 'YELMERE',
  eastHubId: 'PRA',
  eastHubName: 'PRASKO',
  flightPrefix: 'TF',
  corridorPrefix: 'TC',
  weatherWord: 'CROSSWIND',
  anchors: FLIGHTS_ANCHORS_T58,
})

export const FLIGHTS_PAYLOAD_BY_SEED: Readonly<Record<string, FlightsPayload>> = {
  'exercise-r04': FLIGHTS_PAYLOAD_R04,
  'exercise-k11': FLIGHTS_PAYLOAD_K11,
  'exercise-t58': FLIGHTS_PAYLOAD_T58,
}

export const FLIGHTS_ANCHORS_BY_SEED: Readonly<Record<string, FlightsSeedAnchors>> = {
  'exercise-r04': FLIGHTS_ANCHORS_R04,
  'exercise-k11': FLIGHTS_ANCHORS_K11,
  'exercise-t58': FLIGHTS_ANCHORS_T58,
}
