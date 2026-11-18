// Section-04 CI fixture: the buzzer boundary at endsAt, built from the authored
// ETA/cruise arithmetic through the real engine's settle-tick interleave (never
// by poking the queue). An arrival computed EXACTLY at endsAt folds and lands
// before the timeout settlement guard runs in the same advance; the same
// arrival one tick later (endsAt + 1) never folds, leaves the flight airborne,
// and it strands at timeout. A landing whose queue delay pushes it past the
// authored lateness threshold settles as landedLate, exactly once. All seeds.
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
import { corridorBetween } from '@engine/missions/flights/rules'
import type { FlightsState } from '@engine/missions/flights/types'
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
  return { type: 'MISSION_ACTION' as const, payload: { kind: 'LAND', flightId, hubId } }
}

function flightsSettled(state: CampaignState) {
  return state.settled.find((s) => s.missionId === 'flights')!
}

/** Make a flight airborne (advance past its departure), then return the state
 *  and the flight. The first authored flight departs early and crosses an open
 *  corridor to an open hub, so a LAND is always legal. */
function airborneFirst(
  ctx: EngineContext,
  seedName: string,
  payload: FlightsPayload,
): { state: CampaignState; flightId: string; hubId: string; cruiseMs: number } {
  const flight = payload.flights[0]!
  let state = startMission(ctx, seedName)
  state = advanceCampaign(
    ctx,
    state,
    FLIGHTS_T0 + (flight.departureOffsetSeconds + 1) * 1000,
  ).state
  expect((flightsSub(state) as FlightsState).flights[flight.id]!.status).toBe('airborne')
  return {
    state,
    flightId: flight.id,
    hubId: flight.destinationHubId,
    cruiseMs: flight.cruiseSeconds * 1000,
  }
}

describe.each(SEED_NAMES)('flights buzzer boundary: %s', (seedName) => {
  /** Settle the boundary flight at an exact arrival stamp (or leave it un-routed
   *  when routeAt is null) and read the settled flights outcome. Every other
   *  flight is left identical, so differencing two of these isolates the boundary
   *  flight's exact contribution. */
  function settleWithBoundaryRoute(
    base: CampaignState,
    flightId: string,
    hubId: string,
    routeAt: number | null,
  ) {
    let state = base
    if (routeAt !== null) {
      state = dispatch(ctx(), state, land(flightId, hubId), routeAt).state
    }
    const advanced = advanceCampaign(ctx(), state, SETTLE_AT)
    const settlements = advanced.emitted.filter(
      (e) => e.type === 'settlement' && e.missionId === 'flights',
    )
    return { outcome: flightsSettled(advanced.state), settlements }
  }
  // A fresh context per call keeps the three runs (on-boundary, one-tick-later,
  // no-route baseline) from sharing mission module closure state.
  function ctx() {
    return flightsContextForSeed(seedName)
  }

  it('arrival exactly at endsAt lands and counts for EXACTLY the boundary flight', () => {
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const flight = payload.flights[0]!
    // Three otherwise-identical runs that differ only in the boundary flight's
    // routing: on-boundary (arrival == endsAt), one-tick-later (endsAt + 1), and
    // a no-route baseline that never touches the boundary flight. Differencing
    // the resolved/stranded metrics against the baseline isolates EXACTLY this
    // flight's passengers, so a `>=` other-flight accident cannot pass this.
    const onBoundary = airborneFirst(ctx(), seedName, payload)
    const base = onBoundary.state
    const cruiseMs = onBoundary.cruiseMs
    const routeOn = ENDS_AT - cruiseMs
    const routeLate = ENDS_AT - cruiseMs + 1
    // Confirm the computed stamps land exactly on the two sides of the boundary.
    expect(
      (flightsSub(dispatch(ctx(), base, land(flight.id, onBoundary.hubId), routeOn).state) as FlightsState)
        .flights[flight.id]!.arrivalAt,
    ).toBe(ENDS_AT)

    const on = settleWithBoundaryRoute(base, flight.id, onBoundary.hubId, routeOn)
    const late = settleWithBoundaryRoute(base, flight.id, onBoundary.hubId, routeLate)
    const none = settleWithBoundaryRoute(base, flight.id, onBoundary.hubId, null)
    // Settled exactly once in every run.
    expect(on.settlements).toHaveLength(1)
    expect(late.settlements).toHaveLength(1)
    expect(none.settlements).toHaveLength(1)
    expect(on.settlements[0]).toMatchObject({ cause: 'timeout' })
    // On-boundary vs no-route: routing the flight on the deadline resolves
    // EXACTLY its passengers more and strands EXACTLY its passengers fewer.
    const dResolvedOn =
      on.outcome.metrics['resolved_passengers']! -
      none.outcome.metrics['resolved_passengers']!
    const dStrandedOn =
      none.outcome.metrics['stranded_passengers']! -
      on.outcome.metrics['stranded_passengers']!
    expect(dResolvedOn).toBe(flight.passengers)
    expect(dStrandedOn).toBe(flight.passengers)
    // One tick later makes NO difference vs no-route: the flight never folds, so
    // its passengers stay stranded exactly as if it was never routed.
    expect(late.outcome.metrics['resolved_passengers']).toBe(
      none.outcome.metrics['resolved_passengers'],
    )
    expect(late.outcome.metrics['stranded_passengers']).toBe(
      none.outcome.metrics['stranded_passengers'],
    )
  })

  it('on-boundary vs one-tick-later differ by EXACTLY the boundary flight passengers', () => {
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const flight = payload.flights[0]!
    const onBoundary = airborneFirst(ctx(), seedName, payload)
    const base = onBoundary.state
    const routeOn = ENDS_AT - onBoundary.cruiseMs
    const routeLate = ENDS_AT - onBoundary.cruiseMs + 1
    // Prove the one-tick-later run leaves the flight airborne pre-settlement.
    const lateRouted = dispatch(ctx(), base, land(flight.id, onBoundary.hubId), routeLate).state
    expect((flightsSub(lateRouted) as FlightsState).flights[flight.id]!.arrivalAt).toBe(
      ENDS_AT + 1,
    )
    const on = settleWithBoundaryRoute(base, flight.id, onBoundary.hubId, routeOn)
    const late = settleWithBoundaryRoute(base, flight.id, onBoundary.hubId, routeLate)
    // The on-boundary run resolves exactly the boundary flight's passengers more
    // and strands exactly that many fewer than the one-tick-later run.
    expect(
      on.outcome.metrics['resolved_passengers']! -
        late.outcome.metrics['resolved_passengers']!,
    ).toBe(flight.passengers)
    expect(
      late.outcome.metrics['stranded_passengers']! -
        on.outcome.metrics['stranded_passengers']!,
    ).toBe(flight.passengers)
  })

  it('late landing past the authored threshold settles as landedLate, settled once', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    // A DIVERT into a hub whose arrival queue already has enough occupancy to
    // draw a positional delay past the lateness threshold lands LATE. The queue
    // delay table's deepest entry exceeds the lateness threshold by authoring.
    const maxQueueDelay = Math.max(...payload.queueDelayTable)
    expect(maxQueueDelay).toBeGreaterThan(payload.latenessThresholdSeconds)
    // Only a LAND at a flight's OWN destination can be landedLate (a divert to
    // another hub is divertedLanded). So pick a "late" flight that lands at its
    // destination, and pre-fill THAT destination's early queue positions with
    // diverts from other eligible airborne flights, so the late flight takes the
    // deepest positional delay on its own-destination landing.
    const deepIndex = payload.queueDelayTable.length - 1

    let state = startMission(ctx, seedName)
    // Advance so the earliest flights are airborne.
    state = advanceCampaign(ctx, state, FLIGHTS_T0 + 85_000).state
    const sub0 = flightsSub(state) as FlightsState
    // Candidate late flights: airborne, landing at a destination hub with enough
    // slots to hold the pre-fill plus this landing, and with at least deepIndex
    // OTHER airborne flights able to reach that same hub to fill the queue.
    const airborneFlights = payload.flights.filter(
      (f) => sub0.flights[f.id]!.status === 'airborne',
    )
    let late = airborneFlights[0]!
    let fillers = [] as typeof airborneFlights
    for (const candidate of airborneFlights) {
      const destHub = payload.hubs.find((h) => h.id === candidate.destinationHubId)!
      if (destHub.runwaySlots <= deepIndex) continue
      const others = airborneFlights.filter(
        (f) =>
          f.id !== candidate.id &&
          f.originHubId !== destHub.id &&
          corridorBetween(payload, f.originHubId, destHub.id) !== null,
      )
      if (others.length >= deepIndex) {
        late = candidate
        fillers = others.slice(0, deepIndex)
        break
      }
    }
    const targetHub = payload.hubs.find((h) => h.id === late.destinationHubId)!
    expect(fillers.length).toBe(deepIndex)
    for (const f of fillers) {
      state = dispatch(
        ctx,
        state,
        { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId: f.id, hubId: targetHub.id } },
        FLIGHTS_T0 + 85_000,
      ).state
    }
    const beforeUsed = (flightsSub(state) as FlightsState).runwayUse[targetHub.id] ?? 0
    expect(beforeUsed).toBe(deepIndex)
    // LAND the late flight at its OWN destination: it takes the deepest queue
    // position, pushing its arrival past the lateness threshold -> landedLate.
    state = dispatch(
      ctx,
      state,
      { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId: late.id, hubId: targetHub.id } },
      FLIGHTS_T0 + 85_000,
    ).state
    const lateSub = flightsSub(state) as FlightsState
    const lateFs = lateSub.flights[late.id]!
    expect(lateFs.inboundHubId).toBe(targetHub.id)
    // The computed arrival exceeds the no-queue on-time baseline by the deepest
    // delay, which is past the lateness threshold.
    const delayMs = lateFs.arrivalAt! - lateFs.onTimeAt!
    expect(delayMs).toBe(maxQueueDelay * 1000)
    // Settle and confirm the flight resolves exactly once as landedLate: its
    // passengers land in the LATE bucket, and resolving twice is impossible.
    const advanced = advanceCampaign(ctx, state, SETTLE_AT)
    const flights = flightsSettled(advanced.state)
    expect(flights.metrics['late_passengers']!).toBeGreaterThanOrEqual(
      late.passengers,
    )
    // Settled exactly once: a single settlement event for the mission.
    expect(
      advanced.emitted.filter(
        (e) => e.type === 'settlement' && e.missionId === 'flights',
      ),
    ).toHaveLength(1)
  })
})
