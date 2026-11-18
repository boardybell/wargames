// The six GROUND ALL FLIGHTS content invariants as named tests,
// parameterized over the three authored seeds, plus the fixture-seed
// authoring spot checks and the forecast-before-the-affected-decision
// property. The validator and the tests share one anchor table so a dropped
// rule shows up as a dropped test.
import { describe, expect, it } from 'vitest'
import { SEED_CATALOG, SEED_NAMES } from '@engine/seeds/catalog'
import {
  DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS,
  authoredArrivals,
  stormArrivalCollisions,
  validateFlightsContent,
} from '@engine/missions/flights/content'
import type {
  FlightsContentError,
  FlightsPayload,
  FlightsSeedAnchors,
} from '@engine/missions/flights/content'
import { flightsSchedule } from '@engine/missions/flights/module'
import { FLIGHTS_ANCHORS_BY_SEED } from '@engine/missions/flights/payloads'
import type { ScheduledEventSpec } from '@engine/time'

// The single authoritative per-seed anchor table. These are the ids the
// validator and the spot checks both read; they must match the payloads'
// FLIGHTS_ANCHORS_BY_SEED exactly.
const EXPECTED_ANCHORS: Record<string, FlightsSeedAnchors> = {
  'exercise-r04': {
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
  },
  'exercise-k11': {
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
  },
  'exercise-t58': {
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
  },
}

function payloadFor(seedName: string): FlightsPayload {
  return SEED_CATALOG[seedName]!.missionPayloads['flights'] as FlightsPayload
}

function scheduleFor(seedName: string): ScheduledEventSpec[] {
  return [...flightsSchedule(payloadFor(seedName))]
}

function validate(seedName: string): FlightsContentError[] {
  const seed = SEED_CATALOG[seedName]!
  return validateFlightsContent(
    payloadFor(seedName),
    seed.records,
    seed.deskChecks,
    seed.clueRecords,
    scheduleFor(seedName),
    EXPECTED_ANCHORS[seedName]!,
  )
}

function errorsOfCode(
  errors: readonly FlightsContentError[],
  code: FlightsContentError['code'],
): FlightsContentError[] {
  return errors.filter((e) => e.code === code)
}

describe('the anchor table matches the authored payload anchors', () => {
  it.each(SEED_NAMES)('%s anchors agree', (seedName) => {
    expect(EXPECTED_ANCHORS[seedName]).toEqual(FLIGHTS_ANCHORS_BY_SEED[seedName])
  })
})

describe.each(SEED_NAMES)('GROUND ALL FLIGHTS content: %s', (seedName) => {
  it('authored content is clean through the full validator', () => {
    expect(validate(seedName)).toEqual([])
  })

  // Invariant 1: structure and the opening dilemma.
  it('invariant 1: four hubs, eight flights, connected graph, projection, dilemma', () => {
    const payload = payloadFor(seedName)
    expect(payload.hubs).toHaveLength(4)
    expect(payload.flights).toHaveLength(8)
    expect(payload.corrections.length).toBeGreaterThanOrEqual(1)
    // At least one hub in the projected storm path with a free slot at start.
    const stormHubs = new Set(
      payload.stormTrack.flatMap((s) => s.closeHubs),
    )
    const stormPathWithSlot = payload.hubs.find(
      (h) => stormHubs.has(h.id) && h.runwaySlots > 0,
    )
    expect(stormPathWithSlot, 'a storm-path hub with a free slot').toBeTruthy()
    // At least one hub the storm leaves open whose queue delay exceeds the
    // dilemma threshold, so DIVERT there is a real cost.
    const openHub = payload.hubs.find((h) => !stormHubs.has(h.id))
    expect(openHub, 'an open alternative hub').toBeTruthy()
    expect(Math.max(...payload.queueDelayTable)).toBeGreaterThanOrEqual(
      DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS,
    )
    // The validator agrees (no DILEMMA, structure, or projection errors).
    const errors = validate(seedName)
    expect(errorsOfCode(errors, 'HUB_COUNT')).toEqual([])
    expect(errorsOfCode(errors, 'FLIGHT_COUNT')).toEqual([])
    expect(errorsOfCode(errors, 'CORRIDOR_GRAPH')).toEqual([])
    expect(errorsOfCode(errors, 'PROJECTION_PRESENT')).toEqual([])
    expect(errorsOfCode(errors, 'DILEMMA')).toEqual([])
  })

  // Invariant 3: correction lead margin arithmetic.
  it('invariant 3: every correction leads its affected decision by leadMargin', () => {
    const payload = payloadFor(seedName)
    const flightById = new Map(payload.flights.map((f) => [f.id, f]))
    for (const correction of payload.corrections) {
      const flight = flightById.get(correction.affectedFlightId)
      expect(flight, correction.affectedFlightId).toBeTruthy()
      expect(correction.offsetSeconds).toBeLessThanOrEqual(
        correction.lastSafeDecisionAtSeconds - payload.leadMarginSeconds,
      )
      // lastSafeDecision does not run past the affected flight's origin window.
      const originHub = payload.hubs.find((h) => h.id === flight!.originHubId)!
      expect(correction.lastSafeDecisionAtSeconds).toBeLessThanOrEqual(
        originHub.lastDepartureOffsetSeconds,
      )
    }
    expect(errorsOfCode(validate(seedName), 'CORRECTION_LEAD')).toEqual([])
  })

  // Invariant 4: storm/arrival separation on the authored arrivals.
  it('invariant 4: no storm transition shares a second with an authored arrival', () => {
    const payload = payloadFor(seedName)
    expect(
      stormArrivalCollisions(payload.stormTrack, authoredArrivals(payload)),
    ).toEqual([])
    expect(errorsOfCode(validate(seedName), 'STORM_ARRIVAL_SEPARATION')).toEqual([])
  })

  // Invariant 5: records, provenance, decoy independence, desk coverage, clue.
  it('invariant 5: restriction provenance, decoy independence, desk and clue rows', () => {
    const errors = validate(seedName)
    expect(errorsOfCode(errors, 'RESTRICTION_PROVENANCE')).toEqual([])
    expect(errorsOfCode(errors, 'DECOY_INDEPENDENCE')).toEqual([])
    expect(errorsOfCode(errors, 'DESKCHECK_MISSING')).toEqual([])
    expect(errorsOfCode(errors, 'CORRIDOR_REPORT_MISSING')).toEqual([])
    expect(errorsOfCode(errors, 'CLUE_RECORD_MISSING')).toEqual([])
    // Spot the clueRecords wiring directly.
    const seed = SEED_CATALOG[seedName]!
    const anchors = EXPECTED_ANCHORS[seedName]!
    expect(
      seed.clueRecords.some(
        (e) =>
          e.recordId === anchors.restrictionRecordId &&
          e.clueId === anchors.clueId,
      ),
    ).toBe(true)
  })

  // Invariant 6: integers and pins.
  it('invariant 6: every tuning value is a finite integer, pins and round-trip hold', () => {
    const payload = payloadFor(seedName)
    const errors = validate(seedName)
    expect(errorsOfCode(errors, 'TUNING_INTEGER')).toEqual([])
    expect(errorsOfCode(errors, 'PIN_HUB')).toEqual([])
    expect(errorsOfCode(errors, 'JSON_ROUNDTRIP')).toEqual([])
    expect(
      payload.hubs.some((h) => h.id === payload.paymentsDelayedTargetHubId),
    ).toBe(true)
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
  })

  // The forecast-arrives-before-the-affected-decision property, asserted on
  // the authored content: the storm forecast lead precedes every closing
  // storm step, and each correction precedes its affected decision by at
  // least leadMargin.
  it('property: the forecast arrives before every affected decision', () => {
    const payload = payloadFor(seedName)
    // The storm forecast lead fires leadMargin before each closing step.
    for (const step of payload.stormTrack) {
      const closes = step.closeHubs.length > 0 || step.closeCorridors.length > 0
      if (!closes) continue
      const leadOffset = Math.max(0, step.offsetSeconds - payload.leadMarginSeconds)
      expect(leadOffset).toBeLessThan(step.offsetSeconds)
    }
    // Each correction leads its affected flight decision.
    for (const correction of payload.corrections) {
      expect(correction.offsetSeconds + payload.leadMarginSeconds).toBeLessThanOrEqual(
        correction.lastSafeDecisionAtSeconds,
      )
    }
  })
})

// Fixture-seed authoring spot checks (exercise-r04).
describe('fixture-seed authoring spot checks (exercise-r04)', () => {
  const seed = SEED_CATALOG['exercise-r04']!
  const payload = payloadFor('exercise-r04')
  const byId = Object.fromEntries(seed.records.map((r) => [r.id, r]))

  it('F06 carries the verbatim restriction times and DERIVED ancestry', () => {
    // 21:14:08 = 76448, 21:14:52 = 76492.
    expect(byId['F06']).toMatchObject({
      origin: 'DERIVED',
      parentId: 'C17',
      runId: 'R04',
      eventTime: 76448,
      receiptTime: 76492,
    })
  })

  it('W02 is the OBSERVED field report naming local weather and an open corridor', () => {
    expect(byId['W02']).toMatchObject({ origin: 'OBSERVED', runId: null })
    const body = byId['W02']!.body.join(' ')
    expect(body).toContain('NORTHWEST')
    expect(body).toContain('OPEN')
  })

  it('the open corridor field report is the independent OBSERVED W02 record', () => {
    const openCorridor = payload.corridors.find((c) => c.id === 'CR-OE')!
    expect(openCorridor.fieldReportRecordId).toBe('W02')
    // The desk reply confirms the corridor's true open state (OBSERVED
    // provenance confirmation), not a contradiction.
    const desk = seed.deskChecks.find((d) => d.recordId === 'W02')!
    expect(desk.outcome).toBe('CONFIRMED')
    expect(Number.isInteger(desk.delaySeconds)).toBe(true)
  })

  it('the restriction record is the suspiciously-early all-hubs grounding, before the storm', () => {
    // The F06 restriction (D-83 clue) is published in the record stream well
    // before the authored storm actually closes anything (offset 115), which
    // is why it reads as suspiciously early.
    const stormClose = payload.stormTrack[0]!.offsetSeconds
    expect(stormClose).toBe(115)
    // The restriction is a DERIVED exercise artifact, not an OBSERVED event.
    expect(byId['F06']!.origin).toBe('DERIVED')
  })

  it('probing the storm-closed corridor reads CLOSED, never clear', () => {
    // The storm-closed northwest corridor (CR-NW) points at a field report
    // whose optimistic clear claim the desk CONTRADICTS: a PROBE there reads
    // CLOSED. The open corridor (CR-OE) reads CONFIRMED clear. The evidence
    // can never tell the player to route into the shut corridor.
    const closed = payload.corridors.find((c) => c.id === 'CR-NW')!
    expect(closed.fieldReportRecordId).toBe('W05')
    const closedDesk = seed.deskChecks.find((d) => d.recordId === 'W05')!
    expect(closedDesk.outcome).toBe('CONTRADICTED')
    const open = payload.corridors.find((c) => c.id === 'CR-OE')!
    const openDesk = seed.deskChecks.find(
      (d) => d.recordId === open.fieldReportRecordId,
    )!
    expect(openDesk.outcome).toBe('CONFIRMED')
  })
})

// Negative tests: the two re-authored invariants must FAIL loudly when the
// content lies. These prove the validator checks MEANING, not existence.
describe('the validator rejects untruthful evidence (H2 negative)', () => {
  const seedName = 'exercise-r04'
  const seed = SEED_CATALOG[seedName]!

  it('a storm-closed corridor whose field report reads CLEAR is rejected', () => {
    // Flip the storm-closed corridor's desk outcome to CONFIRMED (reads
    // clear): the validator must flag CORRIDOR_EVIDENCE_MISMATCH, because
    // probing the shut corridor would then tell the player it is open.
    const poisonedDesk = seed.deskChecks.map((d) =>
      d.recordId === 'W05' ? { ...d, outcome: 'CONFIRMED' as const } : d,
    )
    const errors = validateFlightsContent(
      payloadFor(seedName),
      seed.records,
      poisonedDesk,
      seed.clueRecords,
      scheduleFor(seedName),
      EXPECTED_ANCHORS[seedName]!,
    )
    expect(errorsOfCode(errors, 'CORRIDOR_EVIDENCE_MISMATCH').length).toBeGreaterThan(0)
  })

  it('an open corridor whose field report reads CLOSED is rejected', () => {
    const poisonedDesk = seed.deskChecks.map((d) =>
      d.recordId === 'W02' ? { ...d, outcome: 'CONTRADICTED' as const } : d,
    )
    const errors = validateFlightsContent(
      payloadFor(seedName),
      seed.records,
      poisonedDesk,
      seed.clueRecords,
      scheduleFor(seedName),
      EXPECTED_ANCHORS[seedName]!,
    )
    expect(errorsOfCode(errors, 'CORRIDOR_EVIDENCE_MISMATCH').length).toBeGreaterThan(0)
  })
})

describe('the correction lead is REAL, not vacuous (M1)', () => {
  it.each(SEED_NAMES)('%s: the correction leads the affected flight real commit by >= leadMargin', (seedName) => {
    const payload = payloadFor(seedName)
    for (const correction of payload.corrections) {
      const flight = payload.flights.find(
        (f) => f.id === correction.affectedFlightId,
      )!
      // The last-safe decision is the flight's REAL commit time: departure +
      // cruise, the moment it reaches the junction it is warned about.
      const realCommit = flight.departureOffsetSeconds + flight.cruiseSeconds
      expect(correction.lastSafeDecisionAtSeconds).toBe(realCommit)
      // The forecast update fires at least leadMargin before that real point.
      expect(correction.offsetSeconds + payload.leadMarginSeconds).toBeLessThanOrEqual(
        realCommit,
      )
    }
  })

  it('a correction tied to a FAKE decision time (not real commit) is rejected', () => {
    const seedName = 'exercise-r04'
    const seed = SEED_CATALOG[seedName]!
    const base = payloadFor(seedName)
    // Inflate lastSafeDecisionAt past the real commit: the validator must
    // flag CORRECTION_LEAD, because the forecast would no longer provably
    // lead the real decision.
    const poisoned = {
      ...base,
      corrections: base.corrections.map((c) => ({
        ...c,
        lastSafeDecisionAtSeconds: c.lastSafeDecisionAtSeconds + 40,
      })),
    }
    const errors = validateFlightsContent(
      poisoned,
      seed.records,
      seed.deskChecks,
      seed.clueRecords,
      scheduleFor(seedName),
      EXPECTED_ANCHORS[seedName]!,
    )
    expect(errorsOfCode(errors, 'CORRECTION_LEAD').length).toBeGreaterThan(0)
  })
})
