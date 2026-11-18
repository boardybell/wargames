import { describe, expect, it } from 'vitest'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import {
  flightsContext,
  flightsSub,
  drive,
  start,
  FLIGHTS_T0,
  FLIGHTS_DURATION_MS,
} from './fixtures'

const ctx = flightsContext()
const ga = (now: number) => [
  { type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } },
  now,
] as [import('@engine/campaign/types').CampaignAction, number]

describe('GROUND ALL FLIGHTS', () => {
  it('holds every scheduled flight at once on first dispatch', () => {
    const { state } = drive(ctx, [start(), ga(FLIGHTS_T0 + 1_000)])
    const s = flightsSub(state)
    expect(s.groundAll).toBe(true)
    for (const fs of Object.values(s.flights)) {
      expect(fs.status).toBe('held')
    }
  })

  it('blocks all subsequent departures for the rest of the mission', () => {
    // Ground at +1s, then run past all departure offsets (<=20s).
    const { state } = drive(ctx, [start(), ga(FLIGHTS_T0 + 1_000)], FLIGHTS_T0 + 30_000)
    const s = flightsSub(state)
    for (const fs of Object.values(s.flights)) {
      expect(fs.status).toBe('held')
    }
  })

  it('a second GROUND ALL rejects as a provable no-op', () => {
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
    state = dispatch(ctx, state, ga(FLIGHTS_T0 + 1_000)[0], FLIGHTS_T0 + 1_000).state
    const result = dispatch(ctx, state, ga(FLIGHTS_T0 + 2_000)[0], FLIGHTS_T0 + 2_000)
    expect(result.rejection).toMatchObject({ rejected: true, reason: 'ALREADY GROUNDED' })
    // Same substate reference: a rejection cannot churn the fleet.
    expect(flightsSub(result.state).flights).toBe(flightsSub(state).flights)
  })

  it('blocks individual RELEASE after grounding', () => {
    const { state } = drive(ctx, [
      start(),
      ga(FLIGHTS_T0 + 1_000),
      [{ type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId: 'WX101' } }, FLIGHTS_T0 + 2_000],
    ])
    expect(flightsSub(state).flights['WX101']!.status).toBe('held')
  })

  it('does not trigger early completion; the clock runs to endsAt', () => {
    // Ground all; before endsAt, no settlement should have fired.
    const { emitted } = drive(ctx, [start(), ga(FLIGHTS_T0 + 1_000)], FLIGHTS_T0 + 60_000)
    const settlements = emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toEqual([])
  })

  it('settles only at the deadline, every held flight a WOPR-resolved exception', () => {
    const { state, emitted } = drive(
      ctx,
      [start(), ga(FLIGHTS_T0 + 1_000)],
      FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000,
    )
    const settlement = emitted.find((e) => e.type === 'settlement')
    expect(settlement).toMatchObject({ missionId: 'flights', cause: 'timeout' })
    const settled = state.settled.find((o) => o.missionId === 'flights')!
    // Five held flights -> five WOPR-resolved exceptions.
    expect(settled.metrics['held_flights']).toBe(5)
    // Grounding saves no passengers on time: all 330 passengers held.
    expect(settled.metrics['held_passengers']).toBe(330)
    expect(settled.metrics['on_time_passengers']).toBe(0)
  })
})
