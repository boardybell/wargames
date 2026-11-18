// Section-04 CI fixture: the same-second separation guard, re-asserted against
// the final SHIPPED seeds as a direct fixture (independent of the validator's
// own tests, validator invariant 4). No storm close or open event shares a
// scheduledAt with any arrival it could affect, per seed: every seed's storm
// steps are walked against every computable arrival (authored and
// walkthrough-derived) and asserted at least one second apart. Also: the drain
// order (scheduledAt, id) is deterministic across a replayed storm-heavy window.
import { describe, expect, it } from 'vitest'
import { SEED_NAMES } from '@engine/seeds/catalog'
import {
  authoredArrivals,
  stormArrivalCollisions,
} from '@engine/missions/flights/content'
import type { FlightsPayload } from '@engine/missions/flights/content'
import {
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
  lastArrivalOffsetSeconds,
  runScript,
  scriptArrivals,
  walkthroughFor,
} from './fixtures/index'

describe.each(SEED_NAMES)('flights separation fixture: %s', (seedName) => {
  it('no storm close or open shares a scheduledAt with any arrival it could affect', () => {
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    // The authored baseline arrivals: every flight straight to its destination.
    expect(
      stormArrivalCollisions(payload.stormTrack, authoredArrivals(payload)),
    ).toEqual([])
    // And the walkthrough-derived arrivals (the real routed stamps, including
    // the forced divert's queued arrival) also clear every storm transition.
    const ctx = flightsContextForSeed(seedName)
    const arrivals = scriptArrivals(
      ctx,
      seedName,
      walkthroughFor(seedName),
      FLIGHTS_T0 + (lastArrivalOffsetSeconds(payload) - 5) * 1000,
    )
    expect(arrivals.length).toBe(payload.flights.length)
    expect(stormArrivalCollisions(payload.stormTrack, arrivals)).toEqual([])
    // Every storm step offset is at least one whole second from each storm
    // transition it carries vs the authored arrivals it could touch (the guard
    // is integer seconds, so this is a hard >= 1 separation).
    for (const step of payload.stormTrack) {
      const touchedHubs = new Set([...step.closeHubs, ...step.openHubs])
      const touchedCorridors = new Set([
        ...step.closeCorridors,
        ...step.openCorridors,
      ])
      for (const arrival of authoredArrivals(payload)) {
        const affects =
          touchedHubs.has(arrival.hubId) ||
          (arrival.corridorId !== null &&
            touchedCorridors.has(arrival.corridorId))
        if (!affects) continue
        expect(Math.abs(step.offsetSeconds - arrival.offsetSeconds)).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('drain order (scheduledAt, id) is deterministic across a replayed storm-heavy window', () => {
    const ctx = flightsContextForSeed(seedName)
    const settleAt = FLIGHTS_T0 + 240_000 + 1_000
    // Replay the walkthrough twice through the real engine across the full
    // storm-heavy window and compare the emitted scheduledEventFired sequences:
    // the engine drains by (scheduledAt, id), so the id-ordered fire sequence is
    // byte-for-byte identical on a replay.
    const firstRun = runScript(ctx, seedName, walkthroughFor(seedName), {
      settleAt,
    })
    const secondRun = runScript(ctx, seedName, walkthroughFor(seedName), {
      settleAt,
    })
    const fires = (emitted: typeof firstRun.emitted) =>
      emitted
        .filter((e) => e.type === 'scheduledEventFired')
        .map((e) => ({ id: (e as { id: string }).id, kind: (e as { kind: string }).kind }))
    const firstFires = fires(firstRun.emitted)
    const secondFires = fires(secondRun.emitted)
    expect(firstFires).toStrictEqual(secondFires)
    // The sequence actually carried the storm transitions (storm-heavy window).
    expect(firstFires.some((f) => f.kind === 'flightsStorm')).toBe(true)
    expect(firstFires.some((f) => f.kind === 'flightsForecast')).toBe(true)
  })
})
