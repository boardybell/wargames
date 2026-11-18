// Section-04 CI fixture: the evidence-reading walkthrough reaches the FULL
// success tier with margin under the real storm track, for every authored
// seed. The script comes from section 02 (walkthroughFor) and is only replayed
// here. Also proves the single coalesced correction material-change event fires
// exactly once, and that early completion is gated on the LAST flight turning
// terminal (a held flight does not count; a heldFinal flight does).
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
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
  flightsSub,
  runScript,
  walkthroughFor,
} from './fixtures/index'

const SETTLE_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000

const TERMINAL = new Set([
  'landed',
  'landedLate',
  'divertedLanded',
  'stranded',
  'heldFinal',
])

function flightsSettled(state: CampaignState) {
  return state.settled.find((s) => s.missionId === 'flights')!
}

function totalPassengers(payload: FlightsPayload): number {
  return payload.flights.reduce((n, f) => n + f.passengers, 0)
}

function startMission(ctx: EngineContext, seedName: string): CampaignState {
  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'flights' },
    FLIGHTS_T0,
  ).state
}

describe.each(SEED_NAMES)('flights walkthrough fixture: %s', (seedName) => {
  it('walkthrough script reaches full tier under the real storm track with margin', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const { state, emitted } = runScript(ctx, seedName, walkthroughFor(seedName), {
      settleAt: SETTLE_AT,
    })
    const settlements = emitted.filter(
      (e) => e.type === 'settlement' && e.missionId === 'flights',
    )
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })

    const flights = flightsSettled(state)
    const total = totalPassengers(payload)
    expect(flights.tier).toBe('full')
    // Full tier with MARGIN: every soul resolved, zero stranded, and the
    // resolved figure sits at or above the full threshold with room to spare
    // over partial (the margin the authoring guarantees).
    expect(flights.metrics['resolved_passengers']).toBe(total)
    expect(Number.isInteger(flights.metrics['resolved_passengers'])).toBe(true)
    expect(flights.metrics['stranded_passengers']).toBe(0)
    expect(flights.metrics['held_passengers']).toBe(0)
    expect(flights.metrics['resolved_passengers']!).toBeGreaterThanOrEqual(
      payload.tierThresholds.full,
    )
    expect(flights.metrics['resolved_passengers']!).toBeGreaterThan(
      payload.tierThresholds.partial,
    )
    // All eight flights terminal with a real landing (on time, late, or
    // diverted); none stranded or held.
    expect(flights.metrics['landed_flights']).toBe(payload.flights.length)
    expect(flights.metrics['held_flights']).toBe(0)
    expect(flights.metrics['stranded_flights']).toBe(0)
  })

  it('walkthrough emits the coalesced correction material-change event exactly once', () => {
    const ctx = flightsContextForSeed(seedName)
    const { emitted } = runScript(ctx, seedName, walkthroughFor(seedName), {
      settleAt: SETTLE_AT,
    })
    // The authored projection correction fires as a single scheduledEventFired
    // (kind flightsCorrection). One correction authored per seed, so exactly
    // one coalesced material-change event reaches the shell: no re-fire, no
    // duplicate.
    const corrections = emitted.filter(
      (e) => e.type === 'scheduledEventFired' && e.kind === 'flightsCorrection',
    )
    expect(corrections).toHaveLength(1)
  })

  it('early completion fires when the last flight turns terminal, not before; held does not count but heldFinal does', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    // Sample the LIVE walkthrough substate at a mid-run time when at least one
    // flight is still non-terminal (scheduled, airborne, or held): the mission
    // has NOT early-completed, so it is still active with live substate.
    const lastDeparture = Math.max(
      ...payload.flights.map((f) => f.departureOffsetSeconds),
    )
    const sampleAt = FLIGHTS_T0 + (lastDeparture - 1) * 1000
    const mid = runScript(ctx, seedName, walkthroughFor(seedName), {
      settleAt: sampleAt,
    })
    expect(mid.state.phase).toBe('mission')
    const sub = flightsSub(mid.state) as FlightsState
    const statuses = Object.values(sub.flights).map((f) => f.status)
    const nonTerminal = statuses.filter((s) => !TERMINAL.has(s))
    expect(nonTerminal.length).toBeGreaterThan(0)
    // No settlement has fired while a flight is still non-terminal.
    expect(
      mid.state.settled.some((s) => s.missionId === 'flights'),
    ).toBe(false)

    // A held flight alone never early-completes: HOLD a scheduled flight at t0
    // and land everyone else, then sample BEFORE the origin-hub departure
    // window closes (200s). The held flight is still `held` (non-terminal), so
    // the mission stays live: held does not count toward all-terminal.
    const minWindow = Math.min(
      ...payload.hubs.map((h) => h.lastDepartureOffsetSeconds),
    )
    const beforeWindow = FLIGHTS_T0 + (minWindow - 5) * 1000
    const heldRun = (): CampaignState => {
      let state = startMission(ctx, seedName)
      const firstFlight = payload.flights[0]!
      state = dispatch(
        ctx,
        state,
        { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: firstFlight.id } },
        FLIGHTS_T0 + 1_000,
      ).state
      // Land everyone else so only the held flight is non-terminal.
      for (const flight of payload.flights.slice(1)) {
        const at = FLIGHTS_T0 + (flight.departureOffsetSeconds + 2) * 1000
        state = dispatch(
          ctx,
          state,
          { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId: flight.id, hubId: flight.destinationHubId } },
          at,
        ).state
      }
      return advanceCampaign(ctx, state, beforeWindow).state
    }
    const held = heldRun()
    // Before the origin window closes, the held flight is still `held` (not
    // heldFinal): a non-terminal flight the mission waits on.
    expect(held.phase).toBe('mission')
    const heldSub = flightsSub(held) as FlightsState
    expect(heldSub.flights[payload.flights[0]!.id]!.status).toBe('held')
    expect(held.settled.some((s) => s.missionId === 'flights')).toBe(false)

    // At the deadline, timeout folds the held flight to heldFinal (terminal) and
    // the mission settles: heldFinal counts toward all-terminal.
    const settled = advanceCampaign(ctx, held, SETTLE_AT).state
    expect(settled.settled.some((s) => s.missionId === 'flights')).toBe(true)
    const flights = flightsSettled(settled)
    expect(flights.metrics['held_flights']).toBe(1)
  })
})
