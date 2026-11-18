// The GROUND ALL FLIGHTS solvability invariant (plan invariant 2), run
// through the REAL module and engine lifecycle over the three authored
// seeds. The walkthrough reaches full tier under the real storm track; the
// blanket-grounding adversarial provably falls below full; the same
// walkthrough replayed with maximum inbound consequences still reaches at
// least partial; the alternate reaches full tier at that maximum penalty.
// It also asserts the storm/arrival separation over the script-derived
// arrivals and confirms inspecting the restriction record surfaces the clue.
import { describe, expect, it } from 'vitest'
import { SEED_NAMES } from '@engine/seeds/catalog'
import {
  authoredArrivals,
  stormArrivalCollisions,
} from '@engine/missions/flights/content'
import type { FlightsPayload } from '@engine/missions/flights/content'
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  adversarialGroundAllFor,
  alternateFor,
  driveFlightsSeed,
  flightsContextForSeed,
  flightsPayloadFor,
  flightsSub,
  groundAllAtStartFor,
  lastArrivalOffsetSeconds,
  scriptArrivals,
  walkthroughFor,
} from './fixtures'
import { FLIGHTS_ANCHORS_BY_SEED } from '@engine/missions/flights/payloads'

const TIER_RANK: Record<string, number> = {
  failed: 0,
  poor: 1,
  partial: 2,
  full: 3,
}

function tierOf(state: { settled: readonly { missionId: string; tier: string }[] }): string {
  return state.settled.find((s) => s.missionId === 'flights')!.tier
}

function resolvedOf(state: {
  settled: readonly { missionId: string; metrics: Record<string, number> }[]
}): number {
  return state.settled.find((s) => s.missionId === 'flights')!.metrics[
    'resolved_passengers'
  ]!
}

describe.each(SEED_NAMES)('GROUND ALL FLIGHTS solvability: %s', (seedName) => {
  it('the walkthrough reaches full tier under the real storm track', () => {
    const ctx = flightsContextForSeed(seedName)
    const { state } = driveFlightsSeed(ctx, seedName, walkthroughFor(seedName))
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    expect(tierOf(state)).toBe('full')
    expect(resolvedOf(state)).toBe(total)
  })

  it('blanket GROUND ALL at t=0 strands everyone and LOSES while OPEN EXCEPTIONS improves', () => {
    // The mission's thesis, proven through the real lifecycle with no
    // hand-tuned timing: GROUND ALL before any departure holds all eight
    // flights. Nobody reaches a destination, so REAL service collapses to
    // zero and the tier is FAILED. Meanwhile WOPR's OPEN EXCEPTIONS tally
    // improves sharply: every held flight is a resolved exception. The tally
    // and the truth diverge, exactly as in mission one.
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    const { state } = driveFlightsSeed(ctx, seedName, groundAllAtStartFor(seedName))
    const flights = state.settled.find((s) => s.missionId === 'flights')!
    // Real service: zero passengers reached a destination, tier FAILED.
    expect(flights.tier).toBe('failed')
    expect(flights.metrics['resolved_passengers']).toBe(0)
    expect(flights.metrics['on_time_passengers']).toBe(0)
    expect(flights.metrics['diverted_passengers']).toBe(0)
    // Every soul was held: nobody reached anywhere. Grounding was ordered.
    expect(flights.metrics['held_passengers']).toBe(total)
    expect(flights.metrics['grounded']).toBe(1)
    // WOPR-resolved OPEN EXCEPTIONS: all eight flights held -> a strong tally
    // even as the real outcome is the worst possible.
    expect(flights.metrics['held_flights']).toBe(payload.flights.length)
    expect(flights.metrics['landed_flights']).toBe(0)
  })

  it('the mid-run blanket-grounding adversarial also falls below full with real strandings', () => {
    const ctx = flightsContextForSeed(seedName)
    const { state } = driveFlightsSeed(
      ctx,
      seedName,
      adversarialGroundAllFor(seedName),
    )
    const flights = state.settled.find((s) => s.missionId === 'flights')!
    expect(TIER_RANK[flights.tier]!).toBeLessThan(3)
    // Grounding stranded the already-airborne flights: a real passenger loss.
    expect(flights.metrics['stranded_passengers']!).toBeGreaterThan(0)
    expect(flights.metrics['grounded']).toBe(1)
  })

  it('the walkthrough genuinely forces a DIVERT into a queued hub and the delay bites', () => {
    // The storm hub closes before flight six departs, so flight six can never
    // land there: it is forced to DIVERT into the EAST overflow queue, taking
    // the deepest positional delay. A real queue cost, not a free landing.
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const stormHub = payload.stormTrack.flatMap((s) => s.closeHubs)[0]!
    const stormClose = payload.stormTrack.find((s) =>
      s.closeHubs.includes(stormHub),
    )!.offsetSeconds
    const forced = payload.flights.find(
      (f) =>
        f.destinationHubId === stormHub &&
        f.departureOffsetSeconds > stormClose,
    )!
    const { state } = driveFlightsSeed(ctx, seedName, walkthroughFor(seedName))
    const sub = flightsSub(state)
    // The mission settles at the deadline; sample the settled outcome instead.
    const flights = state.settled.find((s) => s.missionId === 'flights')!
    expect(flights.metrics['diverted_passengers']).toBeGreaterThanOrEqual(
      forced.passengers,
    )
    // It diverted into a NON-empty queue: its arrival carried a real delay.
    // Re-derive the arrival at a mid-run sample to read the stamp.
    void sub
    const maxDelay = Math.max(...payload.queueDelayTable)
    const arrivals = scriptArrivals(
      ctx,
      seedName,
      walkthroughFor(seedName),
      FLIGHTS_T0 + (lastArrivalOffsetSeconds(payload) - 5) * 1000,
    )
    const divertArrival = arrivals.find((a) => a.flightId === forced.id)!
    // The walkthrough routes the forced flight two seconds after it goes
    // airborne, so its no-queue baseline arrival would be departure + 2 +
    // cruise. The real arrival exceeds that baseline by a positive queue
    // delay drawn from the table: the positional cost genuinely bit.
    const routedAt = forced.departureOffsetSeconds + 2
    const noQueueArrival = routedAt + forced.cruiseSeconds
    const delay = divertArrival.offsetSeconds - noQueueArrival
    expect(delay).toBeGreaterThan(0)
    expect(payload.queueDelayTable).toContain(delay)
    expect(delay).toBeLessThanOrEqual(maxDelay)
  })

  it('the walkthrough replayed at maximum penalty still reaches at least partial', () => {
    const ctx = flightsContextForSeed(seedName)
    const { state } = driveFlightsSeed(
      ctx,
      seedName,
      walkthroughFor(seedName),
      FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000,
      true,
    )
    expect(TIER_RANK[tierOf(state)]!).toBeGreaterThanOrEqual(2)
  })

  it('the alternate reaches full tier at maximum penalty (winnable at max)', () => {
    const ctx = flightsContextForSeed(seedName)
    const { state } = driveFlightsSeed(
      ctx,
      seedName,
      alternateFor(seedName),
      FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000,
      true,
    )
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    expect(tierOf(state)).toBe('full')
    expect(resolvedOf(state)).toBe(total)
  })

  it('the walkthrough-derived arrivals stay clear of every storm transition', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    // Sample just before the last arrival folds (and the all-terminal poll
    // settles the mission, dropping the live substate): every routed flight
    // carries its computed arrival stamp and inbound hub by then. The sample
    // time is DERIVED from the schedule (the last authored arrival offset),
    // not a magic constant, so it tracks any re-authoring.
    const arrivals = scriptArrivals(
      ctx,
      seedName,
      walkthroughFor(seedName),
      FLIGHTS_T0 + (lastArrivalOffsetSeconds(payload) - 5) * 1000,
    )
    // The walkthrough routes all eight flights, so it yields eight arrivals.
    expect(arrivals.length).toBe(8)
    expect(stormArrivalCollisions(payload.stormTrack, arrivals)).toEqual([])
    // And the authored baseline agrees.
    expect(
      stormArrivalCollisions(payload.stormTrack, authoredArrivals(payload)),
    ).toEqual([])
  })

  it('inspecting the restriction record surfaces the D-83 clue through the engine', () => {
    const ctx = flightsContextForSeed(seedName)
    const anchors = FLIGHTS_ANCHORS_BY_SEED[seedName]!
    const { state } = driveFlightsSeed(ctx, seedName, [
      [{ type: 'START_MISSION', missionId: 'flights' }, FLIGHTS_T0],
      [
        { type: 'INSPECT_RECORD', recordId: anchors.restrictionRecordId },
        FLIGHTS_T0 + 3_000,
      ],
    ])
    expect(state.cluesFound).toContain(anchors.clueId)
  })
})
