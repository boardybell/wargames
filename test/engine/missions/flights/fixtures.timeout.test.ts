// Section-04 CI fixture: the timeout settlement cause. At the deadline, a due
// arrival (scheduledAt <= endsAt) folds and lands BEFORE the timeout settlement
// guard runs in the same advance; unresolved airborne flights strand and held
// flights become heldFinal; and evaluate(timeout) aggregates the stranded
// passengers with integer math and the correct resolved tier. All three seeds,
// built through the real engine lifecycle (no queue poking).
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { SEED_NAMES } from '@engine/seeds/catalog'
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
import {
  tierFromResolved,
} from '@engine/missions/flights/rules'
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
  flightsSub,
} from './fixtures/index'

const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
const SETTLE_AT = ENDS_AT + 1_000

function startMission(ctx: EngineContext, seedName: string): CampaignState {
  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'flights' },
    FLIGHTS_T0,
  ).state
}

function land(flightId: string, hubId: string) {
  return {
    type: 'MISSION_ACTION' as const,
    payload: { kind: 'LAND', flightId, hubId },
  }
}

function flightsSettled(state: CampaignState) {
  return state.settled.find((s) => s.missionId === 'flights')!
}

describe.each(SEED_NAMES)('flights timeout fixture: %s', (seedName) => {
  it('at endsAt, a due arrival resolves for EXACTLY the boundary flight before the settlement guard', () => {
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const flight = payload.flights[0]! // departs 10s, open -> east, open corridor
    const routeAt = ENDS_AT - flight.cruiseSeconds * 1000
    // A fresh context per run so the two otherwise-identical settlements (route
    // the boundary flight on the deadline vs never route it) share no closure.
    const run = (routeIt: boolean) => {
      const ctx = flightsContextForSeed(seedName)
      let state = startMission(ctx, seedName)
      // Advance so the flight is airborne.
      state = advanceCampaign(ctx, state, FLIGHTS_T0 + (flight.departureOffsetSeconds + 1) * 1000).state
      if (routeIt) {
        state = dispatch(ctx, state, land(flight.id, flight.destinationHubId), routeAt).state
        // Its arrival stamp lands EXACTLY at endsAt.
        expect((flightsSub(state) as FlightsState).flights[flight.id]!.arrivalAt).toBe(ENDS_AT)
      }
      // A single advance PAST the deadline: the arrival at endsAt folds (when
      // routed), then the timeout guard settles.
      const advanced = advanceCampaign(ctx, state, SETTLE_AT)
      const settlements = advanced.emitted.filter(
        (e) => e.type === 'settlement' && e.missionId === 'flights',
      )
      expect(settlements).toHaveLength(1)
      expect(settlements[0]).toMatchObject({ cause: 'timeout' })
      return flightsSettled(advanced.state)
    }
    const routed = run(true)
    const baseline = run(false)
    // Differencing against the no-route baseline isolates the boundary flight:
    // routing it on the deadline resolves EXACTLY its passengers more and strands
    // EXACTLY its passengers fewer. A `>=` accident from another flight cannot pass.
    expect(
      routed.metrics['resolved_passengers']! -
        baseline.metrics['resolved_passengers']!,
    ).toBe(flight.passengers)
    expect(
      baseline.metrics['stranded_passengers']! -
        routed.metrics['stranded_passengers']!,
    ).toBe(flight.passengers)
  })

  it('unresolved airborne flights strand and held flights become heldFinal at timeout', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    let state = startMission(ctx, seedName)
    // HOLD the first flight at t0 (before it departs). Leave every other flight
    // un-routed, so they go airborne and never land.
    state = dispatch(
      ctx,
      state,
      { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: payload.flights[0]!.id } },
      FLIGHTS_T0 + 1_000,
    ).state
    const advanced = advanceCampaign(ctx, state, SETTLE_AT)
    const settlements = advanced.emitted.filter(
      (e) => e.type === 'settlement' && e.missionId === 'flights',
    )
    expect(settlements[0]).toMatchObject({ cause: 'timeout' })
    const flights = flightsSettled(advanced.state)
    // The held flight became heldFinal (counts as held); the seven airborne
    // flights stranded. No flight landed.
    expect(flights.metrics['held_flights']).toBe(1)
    expect(flights.metrics['stranded_flights']).toBe(payload.flights.length - 1)
    expect(flights.metrics['landed_flights']).toBe(0)
    // The held flight's passengers are held, the rest stranded; integer sums.
    const heldPax = payload.flights[0]!.passengers
    const strandedPax = payload.flights
      .slice(1)
      .reduce((n, f) => n + f.passengers, 0)
    expect(flights.metrics['held_passengers']).toBe(heldPax)
    expect(flights.metrics['stranded_passengers']).toBe(strandedPax)
    expect(Number.isInteger(flights.metrics['stranded_passengers'])).toBe(true)
  })

  it('evaluate(timeout) aggregates stranded passengers with integer math and the correct tier', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    // Route only the earliest-departing half of the fleet to their
    // destinations; leave the rest airborne so they strand. This yields a
    // partial/poor tier the authored thresholds pin.
    let state = startMission(ctx, seedName)
    const sorted = [...payload.flights].sort(
      (a, b) => a.departureOffsetSeconds - b.departureOffsetSeconds,
    )
    const routed = sorted.slice(0, 2) // the two earliest, both land cleanly
    for (const flight of routed) {
      const at = FLIGHTS_T0 + (flight.departureOffsetSeconds + 2) * 1000
      state = advanceCampaign(ctx, state, at).state
      state = dispatch(ctx, state, land(flight.id, flight.destinationHubId), at).state
    }
    const advanced = advanceCampaign(ctx, state, SETTLE_AT)
    const flights = flightsSettled(advanced.state)
    expect(advanced.emitted.some((e) => e.type === 'settlement')).toBe(true)
    const resolved = flights.metrics['resolved_passengers']!
    const expectedTier = tierFromResolved(resolved, payload.tierThresholds)
    expect(flights.tier).toBe(expectedTier)
    // Resolved + stranded + held equals the whole fleet's souls (integer
    // conservation: no passenger is lost or double-counted).
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    const sum =
      flights.metrics['resolved_passengers']! +
      flights.metrics['stranded_passengers']! +
      flights.metrics['held_passengers']!
    expect(sum).toBe(total)
    expect(Number.isInteger(resolved)).toBe(true)
  })
})
