import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { flightsContext, flightsSub, drive, start, FLIGHTS_T0 } from './fixtures'

const ctx = flightsContext()

describe('flights init', () => {
  it('produces the empty starting state with every flight scheduled', () => {
    const { state } = drive(ctx, [start()])
    const s = flightsSub(state)
    expect(Object.keys(s.flights).sort()).toEqual(['WX101', 'WX102', 'WX103', 'WX104', 'WX105'])
    for (const fs of Object.values(s.flights)) {
      expect(fs.status).toBe('scheduled')
    }
    expect(s.groundAll).toBe(false)
    expect(s.closedHubs).toEqual([])
    expect(s.closedCorridors).toEqual([])
    expect(s.appliedCorrection).toBe(0)
    expect(s.runwayUse).toEqual({})
  })

  it('round-trips the engine-produced substate through the saveSchema', () => {
    const { state } = drive(ctx, [start()])
    const schema = ctx.missions['flights']!.saveSchema
    const substate = state.activeMission?.substate
    const revived = v.parse(schema, JSON.parse(JSON.stringify(substate)))
    expect(revived).toEqual(substate)
  })
})

describe('flights departures', () => {
  it('flips a scheduled flight to airborne when its departure event fires', () => {
    // WX101 departs at +10s; advance past it.
    const { state } = drive(ctx, [start()], FLIGHTS_T0 + 15_000)
    const s = flightsSub(state)
    expect(s.flights['WX101']!.status).toBe('airborne')
    expect(s.flights['WX102']!.status).toBe('airborne')
  })

  it('does not depart a flight that was individually held first', () => {
    const { state } = drive(ctx, [
      start(),
      [{ type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: 'WX101' } }, FLIGHTS_T0 + 1_000],
    ], FLIGHTS_T0 + 15_000)
    const s = flightsSub(state)
    expect(s.flights['WX101']!.status).toBe('held')
    expect(s.flights['WX102']!.status).toBe('airborne')
  })
})
