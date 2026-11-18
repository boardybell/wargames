import { describe, expect, it } from 'vitest'
import {
  buildTargetRecordId,
  corridorBetween,
  divertArrivalAt,
  holdLegality,
  landingArrivalAt,
  releaseLegality,
  resolvedPassengers,
  routeLegality,
  tallyPassengers,
  tierFromResolved,
} from '@engine/missions/flights/rules'
import type { FlightsState } from '@engine/missions/flights/types'
import { FIXTURE_PAYLOAD } from './fixtures'

function stateWith(
  flights: Partial<Record<string, FlightsState['flights'][string]>>,
  over: Partial<FlightsState> = {},
): FlightsState {
  return {
    flights: flights as FlightsState['flights'],
    closedHubs: [],
    closedCorridors: [],
    closedWindowHubs: [],
    runwayUse: {},
    groundAll: false,
    appliedCorrection: 0,
    probed: [],
    projectionDivergence: 0,
    durationMs: 240_000,
    endsAt: 1_240_000,
    ...over,
  }
}

const airborne = {
  status: 'airborne' as const,
  inboundHubId: null,
  arrivalAt: null,
  onTimeAt: null,
  settled: false,
}

describe('routeLegality for LAND and DIVERT', () => {
  it('is legal when airborne, hub open, slot free, corridor open', () => {
    const state = stateWith({ WX101: { ...airborne } })
    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE').legal).toBe(true)
  })

  it('rejects when the flight is not airborne', () => {
    const state = stateWith({ WX101: { ...airborne, status: 'scheduled' } })
    const r = routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')
    expect(r).toEqual({ legal: false, reason: 'NOT AIRBORNE' })
  })

  it('rejects when the target hub is closed', () => {
    const state = stateWith({ WX101: { ...airborne } }, { closedHubs: ['CASCADE'] })
    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')).toEqual({
      legal: false,
      reason: 'HUB CLOSED',
    })
  })

  it('rejects when no runway slot is free', () => {
    const state = stateWith({ WX101: { ...airborne } }, { runwayUse: { CASCADE: 1 } })
    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')).toEqual({
      legal: false,
      reason: 'NO FREE RUNWAY SLOT',
    })
  })

  it('rejects when the connecting corridor is closed', () => {
    const state = stateWith({ WX101: { ...airborne } }, { closedCorridors: ['C-MC'] })
    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')).toEqual({
      legal: false,
      reason: 'CORRIDOR CLOSED',
    })
  })

  it('rejects when no corridor connects the origin to the hub', () => {
    // WX101 originates at MERIDIAN; there is no corridor MERIDIAN->(itself)
    // and SABLE is reachable, but CASCADE->VERDANT is not from MERIDIAN.
    const state = stateWith({ WX103: { ...airborne } })
    // WX103 originates at CASCADE; SABLE is not adjacent to CASCADE.
    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX103', 'SABLE')).toEqual({
      legal: false,
      reason: 'NO CORRIDOR TO HUB',
    })
  })

  it('rejects an unknown target hub', () => {
    const state = stateWith({ WX101: { ...airborne } })
    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'NOWHERE')).toEqual({
      legal: false,
      reason: 'HUB UNKNOWN',
    })
  })
})

describe('HOLD and RELEASE legality', () => {
  it('HOLD legal only while scheduled', () => {
    const scheduled = stateWith({ WX101: { ...airborne, status: 'scheduled' } })
    expect(holdLegality(scheduled, 'WX101').legal).toBe(true)
    const flying = stateWith({ WX101: { ...airborne } })
    expect(holdLegality(flying, 'WX101')).toEqual({ legal: false, reason: 'NOT SCHEDULED' })
  })

  it('RELEASE legal only while held and the window is open', () => {
    const held = stateWith({ WX101: { ...airborne, status: 'held' } })
    expect(releaseLegality(FIXTURE_PAYLOAD, held, 'WX101').legal).toBe(true)
    const notHeld = stateWith({ WX101: { ...airborne, status: 'scheduled' } })
    expect(releaseLegality(FIXTURE_PAYLOAD, notHeld, 'WX101')).toEqual({
      legal: false,
      reason: 'NOT HELD',
    })
  })

  it('RELEASE rejects once the origin-hub window has closed', () => {
    const held = stateWith(
      { WX101: { ...airborne, status: 'held' } },
      { closedWindowHubs: ['MERIDIAN'] },
    )
    expect(releaseLegality(FIXTURE_PAYLOAD, held, 'WX101')).toEqual({
      legal: false,
      reason: 'WINDOW CLOSED',
    })
  })

  it('HOLD and RELEASE reject under a blanket grounding', () => {
    const grounded = stateWith(
      { WX101: { ...airborne, status: 'held' } },
      { groundAll: true },
    )
    expect(releaseLegality(FIXTURE_PAYLOAD, grounded, 'WX101')).toEqual({
      legal: false,
      reason: 'GROUNDED',
    })
    const groundedScheduled = stateWith(
      { WX102: { ...airborne, status: 'scheduled' } },
      { groundAll: true },
    )
    expect(holdLegality(groundedScheduled, 'WX102')).toEqual({
      legal: false,
      reason: 'GROUNDED',
    })
  })
})

describe('queue math and corridor mapping', () => {
  it('landingArrivalAt adds whole-second cruise in ms', () => {
    const flight = FIXTURE_PAYLOAD.flights[0]!
    expect(landingArrivalAt(flight, 1_000_000)).toBe(1_000_000 + flight.cruiseSeconds * 1000)
  })

  it('divertArrivalAt adds the positional queue delay for the occupied slot', () => {
    const flight = FIXTURE_PAYLOAD.flights[0]!
    const empty = stateWith({})
    const oneBusy = stateWith({}, { runwayUse: { SABLE: 1 } })
    // delay table [0, 30, 90]: empty -> +0, one busy -> +30s.
    expect(divertArrivalAt(FIXTURE_PAYLOAD, empty, flight, 'SABLE', 1_000_000)).toBe(
      1_000_000 + flight.cruiseSeconds * 1000,
    )
    expect(divertArrivalAt(FIXTURE_PAYLOAD, oneBusy, flight, 'SABLE', 1_000_000)).toBe(
      1_000_000 + (flight.cruiseSeconds + 30) * 1000,
    )
  })

  it('corridorBetween is undirected', () => {
    expect(corridorBetween(FIXTURE_PAYLOAD, 'MERIDIAN', 'CASCADE')?.id).toBe('C-MC')
    expect(corridorBetween(FIXTURE_PAYLOAD, 'CASCADE', 'MERIDIAN')?.id).toBe('C-MC')
  })

  it('buildTargetRecordId maps a corridor to its field-report record', () => {
    expect(buildTargetRecordId(FIXTURE_PAYLOAD, 'C-MC')).toBe('W02')
    expect(buildTargetRecordId(FIXTURE_PAYLOAD, 'NOPE')).toBeNull()
  })
})

describe('tiering from passenger aggregation', () => {
  it('tallies and tiers integer resolved passengers', () => {
    const state = stateWith({
      WX101: { status: 'landed', inboundHubId: 'CASCADE', arrivalAt: 1, onTimeAt: 1, settled: true },
      WX102: { status: 'divertedLanded', inboundHubId: 'SABLE', arrivalAt: 1, onTimeAt: 1, settled: true },
      WX103: { status: 'stranded', inboundHubId: null, arrivalAt: null, onTimeAt: null, settled: false },
      WX104: { status: 'heldFinal', inboundHubId: null, arrivalAt: null, onTimeAt: null, settled: false },
    })
    const tally = tallyPassengers(FIXTURE_PAYLOAD, state)
    expect(tally).toEqual({ onTime: 100, late: 0, diverted: 80, stranded: 60, held: 40 })
    // resolved = 100 + 80 + 40 = 220 -> partial (>=180, <260).
    expect(resolvedPassengers(tally)).toBe(220)
    expect(tierFromResolved(220, FIXTURE_PAYLOAD.tierThresholds)).toBe('partial')
  })
})
