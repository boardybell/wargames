// Section-04 CI fixture: the forfeit settlement cause. A forfeit mid-flight
// evaluates the aggregate AS-IS: landed flights stay landed, held flights count
// as held, airborne flights strand (the real consequence of abandoning them),
// but flights that never departed are NOT synthetically stranded. The tier is
// the aggregate at forfeit time, and the debrief reports the unresolved
// (airborne-then-stranded) flights. All three seeds.
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
import { tierFromResolved } from '@engine/missions/flights/rules'
import {
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
} from './fixtures/index'

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

describe.each(SEED_NAMES)('flights forfeit fixture: %s', (seedName) => {
  it('forfeit evaluates as-is mid-flight: no synthetic stranding beyond current state, tier from the aggregate at forfeit time', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const sorted = [...payload.flights].sort(
      (a, b) => a.departureOffsetSeconds - b.departureOffsetSeconds,
    )
    // Land the four earliest flights cleanly (routed at departure+2, each lands
    // at departure+42, all by 82s); then forfeit at a time when at least one
    // flight is airborne and the LAST flight (departs 120) is still SCHEDULED.
    let state = startMission(ctx, seedName)
    const landed = sorted.slice(0, 4)
    for (const flight of landed) {
      const at = FLIGHTS_T0 + (flight.departureOffsetSeconds + 2) * 1000
      state = advanceCampaign(ctx, state, at).state
      state = dispatch(ctx, state, land(flight.id, flight.destinationHubId), at).state
    }
    // Forfeit at 100s: the four early flights have landed; flights departing at
    // 50/70/80 are airborne and un-routed; the flight departing at 120 has NOT
    // departed yet (still SCHEDULED), so it is never synthetically stranded.
    const forfeitAt = FLIGHTS_T0 + 100_000
    state = advanceCampaign(ctx, state, forfeitAt).state
    const result = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, forfeitAt + 1_000)
    const flights = flightsSettled(result.state)
    expect(flights.cause).toBe('forfeit')

    // The two cleanly-landed flights are credited, their passengers resolved.
    const landedPax = landed.reduce((n, f) => n + f.passengers, 0)
    expect(flights.metrics['resolved_passengers']!).toBeGreaterThanOrEqual(landedPax)
    expect(flights.metrics['landed_flights']!).toBeGreaterThanOrEqual(2)

    // No synthetic departures: a scheduled flight that never departed contributes
    // NOTHING to resolved, stranded, or held (it is neither airborne nor held),
    // so conservation across resolved + stranded + held is LESS than the full
    // fleet. The still-scheduled souls are simply not aggregated.
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    const aggregated =
      flights.metrics['resolved_passengers']! +
      flights.metrics['stranded_passengers']! +
      flights.metrics['held_passengers']!
    expect(aggregated).toBeLessThan(total)
    expect(aggregated).toBeGreaterThan(0)

    // Tier is the aggregate resolved figure at forfeit time, no earlier or later.
    const expectedTier = tierFromResolved(
      flights.metrics['resolved_passengers']!,
      payload.tierThresholds,
    )
    expect(flights.tier).toBe(expectedTier)
    expect(Number.isInteger(flights.metrics['resolved_passengers'])).toBe(true)
  })

  it('debrief after forfeit reports unresolved flights', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    // Forfeit with at least one airborne-then-stranded flight: no routing,
    // forfeit at 45s so the early departures are airborne and strand.
    let state = startMission(ctx, seedName)
    const forfeitAt = FLIGHTS_T0 + 45_000
    state = advanceCampaign(ctx, state, forfeitAt).state
    const result = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, forfeitAt + 1_000)
    const outcome = flightsSettled(result.state)
    expect(outcome.cause).toBe('forfeit')
    expect(outcome.metrics['stranded_flights']!).toBeGreaterThan(0)

    const module = ctx.missions['flights']!
    const debrief = module.debrief!(outcome)
    // The debrief names the stranded (unresolved) flights as a count and their
    // passengers: a line reporting the strand.
    const strandLine = debrief.lines.find((l) => l.startsWith('STRANDED '))
    expect(strandLine).toBeDefined()
    expect(strandLine).toContain(`${outcome.metrics['stranded_flights']} FLIGHTS`)
    expect(strandLine).toContain(`${outcome.metrics['stranded_passengers']} PASSENGERS`)
    // Headline carries the forfeit cause.
    expect(debrief.headline).toContain('FORFEIT')
    void payload
  })
})
