import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { flightsSaveSchema } from '@engine/missions/flights/types'
import type { FlightsState } from '@engine/missions/flights/types'

function baseState(): FlightsState {
  return {
    flights: {
      WX101: { status: 'scheduled', inboundHubId: null, arrivalAt: null, onTimeAt: null, settled: false },
      WX102: { status: 'airborne', inboundHubId: 'CASCADE', arrivalAt: 1_060_000, onTimeAt: 1_060_000, settled: false },
    },
    closedHubs: ['CASCADE'],
    closedCorridors: ['C-MS'],
    closedWindowHubs: ['MERIDIAN'],
    runwayUse: { CASCADE: 1 },
    groundAll: false,
    appliedCorrection: 1,
    probed: ['C-MC'],
    projectionDivergence: 0,
    durationMs: 240_000,
    endsAt: 1_240_000,
  }
}

describe('flights saveSchema (reference-only)', () => {
  it('round-trips a substate through JSON and the schema', () => {
    const state = baseState()
    const revived = v.parse(flightsSaveSchema, JSON.parse(JSON.stringify(state)))
    expect(revived).toEqual(state)
  })

  it('rejects authored hub names smuggled into a flight state', () => {
    const state = baseState() as unknown as Record<string, unknown>
    const poisoned = {
      ...state,
      flights: {
        WX101: {
          status: 'scheduled',
          inboundHubId: null,
          arrivalAt: null,
          onTimeAt: null,
          settled: false,
          hubName: 'MERIDIAN FIELD',
        },
      },
    }
    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
  })

  it('rejects passenger counts smuggled into the top-level substate', () => {
    const poisoned = { ...(baseState() as unknown as Record<string, unknown>), passengers: 100 }
    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
  })

  it('rejects projection data smuggled into the substate', () => {
    const poisoned = {
      ...(baseState() as unknown as Record<string, unknown>),
      projection: [{ corridor: 'C-MS', open: true }],
    }
    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
  })

  it('rejects non-integer runway occupancy', () => {
    const poisoned = {
      ...(baseState() as unknown as Record<string, unknown>),
      runwayUse: { CASCADE: 1.5 },
    }
    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
  })
})
