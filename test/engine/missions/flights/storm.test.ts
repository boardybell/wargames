import { describe, expect, it } from 'vitest'
import { applyStormStep } from '@engine/missions/flights/rules'
import type { FlightsState } from '@engine/missions/flights/types'
import { flightsContext, flightsSub, drive, start, FLIGHTS_T0 } from './fixtures'

const ctx = flightsContext()

function emptyState(): FlightsState {
  return {
    flights: {},
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
  }
}

describe('storm truth (pure)', () => {
  it('closes and opens hubs and corridors deterministically', () => {
    const s0 = emptyState()
    const s1 = {
      ...s0,
      ...applyStormStep(s0, {
        offsetSeconds: 0,
        closeHubs: ['CASCADE'],
        openHubs: [],
        closeCorridors: ['C-MS'],
        openCorridors: [],
        warningLine: 'X',
        cueId: 'c',
      }),
    }
    expect(s1.closedHubs).toEqual(['CASCADE'])
    expect(s1.closedCorridors).toEqual(['C-MS'])
    const s2 = {
      ...s1,
      ...applyStormStep(s1, {
        offsetSeconds: 0,
        closeHubs: [],
        openHubs: ['CASCADE'],
        closeCorridors: [],
        openCorridors: ['C-MS'],
        warningLine: 'X',
        cueId: 'c',
      }),
    }
    expect(s2.closedHubs).toEqual([])
    expect(s2.closedCorridors).toEqual([])
  })
})

describe('storm through the real engine', () => {
  it('scheduled storm events advance truth regardless of player orders', () => {
    // Storm step 0 at +40s closes C-MS; step 1 at +80s closes CASCADE and
    // reopens C-MS. Advance past both.
    const { state } = drive(ctx, [start()], FLIGHTS_T0 + 85_000)
    const s = flightsSub(state)
    expect(s.closedHubs).toEqual(['CASCADE'])
    expect(s.closedCorridors).toEqual([])
  })

  it('posts each storm forecast as a scheduledEventFired, not a mission-queue write', () => {
    const { emitted } = drive(ctx, [start()], FLIGHTS_T0 + 85_000)
    const stormFires = emitted.filter(
      (e) => e.type === 'scheduledEventFired' && e.kind === 'flightsStorm',
    )
    expect(stormFires.length).toBe(2)
  })

  it('the correction event bumps the applied-correction index exactly once and emits one change', () => {
    // Correction at +50s.
    const before = drive(ctx, [start()], FLIGHTS_T0 + 45_000)
    expect(flightsSub(before.state).appliedCorrection).toBe(0)
    const after = drive(ctx, [start()], FLIGHTS_T0 + 55_000)
    expect(flightsSub(after.state).appliedCorrection).toBe(1)
    const corrFires = after.emitted.filter(
      (e) => e.type === 'scheduledEventFired' && e.kind === 'flightsCorrection',
    )
    expect(corrFires.length).toBe(1)
  })

  it('reducers never fold the projection into substate (no projection field exists)', () => {
    const { state } = drive(ctx, [start()], FLIGHTS_T0 + 55_000)
    const keys = Object.keys(flightsSub(state))
    expect(keys).not.toContain('projection')
    expect(keys).not.toContain('forecast')
  })

  it('is byte-identical across two runs from the same seed at every step', () => {
    // Build the campaign twice from the same seed, advancing to the same set
    // of stamps across the whole storm timeline, and assert the storm
    // substate (closed hubs/corridors and the full flight set) is identical
    // at every step. applyStormStep is pure and integer, so reproducibility
    // is total.
    const stamps = [
      FLIGHTS_T0,
      FLIGHTS_T0 + 10_000,
      FLIGHTS_T0 + 45_000,
      FLIGHTS_T0 + 55_000,
      FLIGHTS_T0 + 85_000,
      FLIGHTS_T0 + 125_000,
      FLIGHTS_T0 + 205_000,
    ]
    for (const at of stamps) {
      const runA = drive(ctx, [start()], at)
      const runB = drive(ctx, [start()], at)
      const a = flightsSub(runA.state)
      const b = flightsSub(runB.state)
      expect(a.closedHubs).toEqual(b.closedHubs)
      expect(a.closedCorridors).toEqual(b.closedCorridors)
      expect(a.appliedCorrection).toBe(b.appliedCorrection)
      // The whole substate serializes byte-for-byte identically.
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    }
  })
})
