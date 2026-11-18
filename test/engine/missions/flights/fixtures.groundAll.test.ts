// Section-04 CI fixture: the blanket-grounding thesis. GROUND ALL holds every
// scheduled flight, blocks later departures and individual releases, is single
// use (a re-dispatch is a typed rejection, state unchanged), and does NOT early
// complete (the clock runs to endsAt). At the grounding, WOPR's OPEN EXCEPTIONS
// tally falls sharply (every held flight is a resolved exception) while the real
// passenger aggregate worsens against the walkthrough baseline, and the debrief
// names the trade. All three seeds, driven through the real engine lifecycle.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import {
  selectOpenExceptions,
  selectServiceOutcomes,
} from '@engine/campaign/selectors'
import { SEED_NAMES } from '@engine/seeds/catalog'
import type { FlightsPayload } from '@engine/missions/flights/content'
import { buildScoreboard } from '@engine/missions/flights/scoreboard'
import type { FlightsState } from '@engine/missions/flights/types'
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
  flightsSub,
  groundAllAtStartFor,
  runScript,
  walkthroughFor,
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

function groundAll() {
  return { type: 'MISSION_ACTION' as const, payload: { kind: 'GROUND_ALL' } }
}

function flightsSettled(state: CampaignState) {
  return state.settled.find((s) => s.missionId === 'flights')!
}

describe.each(SEED_NAMES)('flights GROUND ALL fixture: %s', (seedName) => {
  it('GROUND ALL holds every scheduled flight and blocks departures and releases thereafter', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    let state = startMission(ctx, seedName)
    state = dispatch(ctx, state, groundAll(), FLIGHTS_T0).state
    const sub = flightsSub(state) as FlightsState
    // Every flight was scheduled at t0, so every one is now held.
    for (const flight of payload.flights) {
      expect(sub.flights[flight.id]!.status).toBe('held')
    }
    // Advancing past every scheduled departure never launches a held flight:
    // they stay held, nobody goes airborne.
    const advanced = advanceCampaign(ctx, state, FLIGHTS_T0 + 130_000).state
    const laterSub = flightsSub(advanced) as FlightsState
    for (const flight of payload.flights) {
      expect(['held', 'heldFinal']).toContain(laterSub.flights[flight.id]!.status)
    }
    // An individual RELEASE after grounding is a typed rejection, state intact.
    const release = dispatch(
      ctx,
      advanced,
      { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId: payload.flights[0]!.id } },
      FLIGHTS_T0 + 131_000,
    )
    expect(release.rejection).toBeDefined()
    expect(release.rejection!.reason).toBe('GROUNDED')
  })

  it('re-dispatch of GROUND ALL rejects as a provable no-op', () => {
    const ctx = flightsContextForSeed(seedName)
    let state = startMission(ctx, seedName)
    state = dispatch(ctx, state, groundAll(), FLIGHTS_T0).state
    const before = state
    const second = dispatch(ctx, state, groundAll(), FLIGHTS_T0 + 1_000)
    expect(second.rejection).toBeDefined()
    expect(second.rejection!.reason).toBe('ALREADY GROUNDED')
    // State unchanged by the rejected re-dispatch (substate strict-deep-equal).
    expect(flightsSub(second.state)).toStrictEqual(flightsSub(before))
  })

  it('GROUND ALL does not early-complete; the clock runs to endsAt', () => {
    const ctx = flightsContextForSeed(seedName)
    const { state, emitted } = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
      settleAt: SETTLE_AT,
    })
    const settlements = emitted.filter(
      (e) => e.type === 'settlement' && e.missionId === 'flights',
    )
    expect(settlements).toHaveLength(1)
    // The clock ran to the deadline: the cause is timeout, not completed. A
    // grounded fleet never triggers early completion.
    expect(settlements[0]).toMatchObject({ cause: 'timeout' })
    // And no settlement fired BEFORE the deadline: sampling mid-run at 130s
    // (past every departure) the mission is still live.
    const mid = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
      settleAt: FLIGHTS_T0 + 130_000,
    })
    expect(mid.state.phase).toBe('mission')
    expect(mid.state.settled.some((s) => s.missionId === 'flights')).toBe(false)
    void state
  })

  it('open exceptions fall sharply at the grounding while the passenger aggregate worsens vs the walkthrough baseline', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    // Scoreboard immediately BEFORE the grounding (at t0, all scheduled) and
    // immediately AFTER (all held): held flights jump from 0 to the full fleet,
    // the WOPR-resolved exception count the campaign subtracts.
    let state = startMission(ctx, seedName)
    const beforeBoard = buildScoreboard(payload, flightsSub(state) as FlightsState)
    expect(beforeBoard.heldFlights).toBe(0)
    state = dispatch(ctx, state, groundAll(), FLIGHTS_T0).state
    const afterBoard = buildScoreboard(payload, flightsSub(state) as FlightsState)
    expect(afterBoard.heldFlights).toBe(payload.flights.length)
    expect(afterBoard.grounded).toBe(true)

    // Final evaluate vs the walkthrough baseline: grounding resolves ZERO real
    // passengers (the worst) while the walkthrough resolves every soul.
    const grounded = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
      settleAt: SETTLE_AT,
    })
    const groundedOutcome = flightsSettled(grounded.state)
    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
    const walkOutcome = flightsSettled(walk.state)
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    expect(groundedOutcome.metrics['resolved_passengers']).toBe(0)
    expect(groundedOutcome.tier).toBe('failed')
    expect(walkOutcome.metrics['resolved_passengers']).toBe(total)
    expect(walkOutcome.tier).toBe('full')
    // The WOPR tally diverges from the truth: grounding posts the maximum
    // held-flight tally yet the worst real outcome.
    expect(groundedOutcome.metrics['held_flights']).toBe(payload.flights.length)
    expect(walkOutcome.metrics['held_flights']).toBe(0)

    // The mission thesis, proven through the REAL campaign selectors over the
    // real settled states (not by comment): WOPR's OPEN EXCEPTIONS tally falls
    // by the full held fleet under GROUND ALL while the real SERVICE OUTCOMES
    // damage rises. selectOpenExceptions reads wopr_resolved; selectServiceOutcomes
    // reads service_cost. Both are stamped by the flights module evaluate().
    const fleet = payload.flights.length
    const openGrounded = selectOpenExceptions(grounded.state)
    const openWalk = selectOpenExceptions(walk.state)
    const costGrounded = selectServiceOutcomes(grounded.state)
    const costWalk = selectServiceOutcomes(walk.state)
    // Grounding drops OPEN EXCEPTIONS strictly below the walkthrough, by exactly
    // the full held fleet (wopr_resolved = held-flight count = fleet under GROUND
    // ALL; 0 on the clean walkthrough).
    expect(openGrounded).toBeLessThan(openWalk)
    expect(openWalk - openGrounded).toBe(fleet)
    // And the real SERVICE OUTCOMES damage is strictly GREATER under grounding:
    // service_cost = stranded flights + held-at-deadline flights = fleet under
    // GROUND ALL; a clean walkthrough denies no service, so service_cost = 0.
    expect(costGrounded).toBeGreaterThan(costWalk)
    expect(costGrounded).toBe(fleet)
    expect(costWalk).toBe(0)
  })

  it('debrief names the GROUND ALL trade when taken', () => {
    const ctx = flightsContextForSeed(seedName)
    const { state } = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
      settleAt: SETTLE_AT,
    })
    const outcome = flightsSettled(state)
    const module = ctx.missions['flights']!
    const debrief = module.debrief!(outcome)
    expect(debrief.lines).toContain('GROUND ALL FLIGHTS WAS ORDERED')
    // A walkthrough that never grounds does NOT carry the line (the trade is
    // reported only when taken).
    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
    const walkDebrief = module.debrief!(flightsSettled(walk.state))
    expect(walkDebrief.lines).not.toContain('GROUND ALL FLIGHTS WAS ORDERED')
  })
})
