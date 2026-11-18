import { describe, expect, it } from 'vitest'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction } from '@engine/campaign/types'
import {
  flightsContext,
  flightsConsequenceContext,
  flightsSub,
  drive,
  start,
  FLIGHTS_T0,
  FLIGHTS_DURATION_MS,
} from './fixtures'

const ctx = flightsContext()
const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS

function land(flightId: string, hubId: string, now: number): [CampaignAction, number] {
  return [{ type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId, hubId } }, now]
}

describe('early completion', () => {
  it('fires only when every flight is terminal; plain held does not count', () => {
    // Ground all -> every flight held (not heldFinal). No early completion
    // before the windows close, even though no flight can ever fly.
    const grounded = drive(
      ctx,
      [start(), [{ type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }, FLIGHTS_T0 + 1_000]],
      FLIGHTS_T0 + 60_000,
    )
    expect(grounded.emitted.filter((e) => e.type === 'settlement')).toEqual([])
    const s = flightsSub(grounded.state)
    expect(Object.values(s.flights).every((f) => f.status === 'held')).toBe(true)
  })

  it('a grounded fleet does NOT complete early; held flights stay held to the deadline', () => {
    // GROUND ALL is deliberate: windows closing do not flip grounded flights
    // to heldFinal, so terminal() never fires early. Past +200s (all windows
    // closed) the fleet is still held and no settlement has fired.
    const { state, emitted } = drive(
      ctx,
      [start(), [{ type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }, FLIGHTS_T0 + 1_000]],
      FLIGHTS_T0 + 205_000,
    )
    expect(emitted.filter((e) => e.type === 'settlement')).toEqual([])
    expect(Object.values(flightsSub(state).flights).every((f) => f.status === 'held')).toBe(true)
  })

  it('heldFinal counts toward terminality for individually held flights whose windows close', () => {
    // Individually HOLD every flight (not GROUND ALL). Their windows close
    // (MERIDIAN +120s, others +200s), flipping each to heldFinal; once all
    // are terminal, terminal() completes before the deadline.
    const holds = ['WX101', 'WX102', 'WX103', 'WX104', 'WX105'].map(
      (id, i): [CampaignAction, number] => [
        { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: id } },
        FLIGHTS_T0 + 1_000 + i,
      ],
    )
    const { emitted } = drive(ctx, [start(), ...holds], FLIGHTS_T0 + 205_000)
    const settlement = emitted.find((e) => e.type === 'settlement')
    expect(settlement).toMatchObject({ missionId: 'flights', cause: 'completed' })
  })
})

describe('evaluate across causes', () => {
  it('timeout strands airborne flights and heldFinals held flights, then evaluates', () => {
    // Fly everything, land none: all strand at timeout.
    const { state } = drive(ctx, [start()], ENDS_AT + 1_000)
    const settled = state.settled.find((o) => o.missionId === 'flights')!
    expect(settled.cause).toBe('timeout')
    expect(settled.metrics['stranded_flights']).toBe(5)
    expect(settled.metrics['held_flights']).toBe(0)
  })

  it('a full-save walkthrough tiers full and emits no outbound consequence', () => {
    // Land all five flights at their own destinations early, on time.
    const { state } = drive(
      ctx,
      [
        start(),
        land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000),
        land('WX102', 'SABLE', FLIGHTS_T0 + 15_000),
        land('WX103', 'VERDANT', FLIGHTS_T0 + 25_000),
        land('WX104', 'MERIDIAN', FLIGHTS_T0 + 25_000),
        land('WX105', 'VERDANT', FLIGHTS_T0 + 15_000),
      ],
      ENDS_AT + 1_000,
    )
    const settled = state.settled.find((o) => o.missionId === 'flights')!
    // 100+80+60+40+50 = 330 resolved >= full threshold 260.
    expect(settled.metrics['resolved_passengers']).toBe(330)
    expect(settled.tier).toBe('full')
    expect(settled.consequences).toEqual([])
  })

  it('a low-resolution outcome emits a flightsDisrupted consequence that varies by tier', () => {
    // Land only WX101 (100 passengers); the rest strand. 100 resolved ->
    // tier poor (>=100, <180). Table maps poor -> magnitude 20.
    const { state } = drive(
      ctx,
      [start(), land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000)],
      ENDS_AT + 1_000,
    )
    const settled = state.settled.find((o) => o.missionId === 'flights')!
    expect(settled.metrics['resolved_passengers']).toBe(100)
    expect(settled.tier).toBe('poor')
    expect(settled.consequences).toEqual([
      { id: 'cq-flights', kind: 'flightsDisrupted', magnitude: 20 },
    ])
  })

  it('a forfeit evaluates the live state as-is', () => {
    // Advance so WX101 folds to landed before the forfeit.
    const driven = drive(ctx, [
      start(),
      land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000),
      [{ type: 'FORFEIT_MISSION' }, FLIGHTS_T0 + 90_000],
    ])
    const settled = driven.state.settled.find((o) => o.missionId === 'flights')!
    expect(settled.cause).toBe('forfeit')
    // WX101 folded to landed before the forfeit; its 100 count on time.
    expect(settled.metrics['on_time_passengers']).toBe(100)
  })
})

describe('inbound consequence folding at init (mapping)', () => {
  const module = ctx.missions['flights']!
  const seed = ctx.seeds['test-seed']!

  it('paymentsDelayed removes one runway slot at the pinned target hub', () => {
    const none = module.init(seed, { byKind: {} }, FLIGHTS_DURATION_MS) as ReturnType<
      typeof flightsSub
    >
    expect(none.runwayUse).toEqual({})
    const withPay = module.init(
      seed,
      { byKind: { paymentsDelayed: 30 } },
      FLIGHTS_DURATION_MS,
    ) as ReturnType<typeof flightsSub>
    // MERIDIAN is the pinned target: one phantom occupancy removes a slot.
    expect(withPay.runwayUse['MERIDIAN']).toBe(1)
  })

  it('commsDelayed widens the projection divergence by the folded magnitude', () => {
    const withComms = module.init(
      seed,
      { byKind: { commsDelayed: 18 } },
      FLIGHTS_DURATION_MS,
    ) as ReturnType<typeof flightsSub>
    expect(withComms.projectionDivergence).toBe(18)
  })
})

// The cap and order-independence are properties of the ENGINE fold, not the
// module init. These tests settle real upstream consequences through
// createCampaign that exceed the 40 cap, then start flights and assert the
// module sees the capped value, and that the arrival order of upstream
// settlements does not change what flights sees.
describe('inbound consequence folding through the engine', () => {
  const cctx = flightsConsequenceContext()

  function forfeit(now: number): [CampaignAction, number] {
    return [{ type: 'FORFEIT_MISSION' }, now]
  }
  function ack(missionId: string, now: number): [CampaignAction, number] {
    return [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, now]
  }
  function startMission(missionId: string, now: number): [CampaignAction, number] {
    return [{ type: 'START_MISSION', missionId }, now]
  }

  /** Settle alpha and beta (each a failed forfeit -> one commsDelayed, 30 and
   *  20), acknowledging between, then start flights. Upstream order is the
   *  order the two missions are listed. Returns flights' live substate. */
  function runUpstreamThenFlights(
    cctxIn: EngineContext,
    upstreamOrder: readonly string[],
  ): CampaignState {
    let state = createCampaign(cctxIn, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    let t = FLIGHTS_T0
    for (const missionId of upstreamOrder) {
      state = dispatch(cctxIn, state, startMission(missionId, t)[0], t).state
      t += 1_000
      state = dispatch(cctxIn, state, forfeit(t)[0], t).state
      t += 1_000
      state = dispatch(cctxIn, state, ack(missionId, t)[0], t).state
      t += 1_000
    }
    state = dispatch(cctxIn, state, startMission('flights', t)[0], t).state
    return state
  }

  it('settled upstream consequences exceeding the 40 cap arrive at flights capped', () => {
    // alpha (30) + beta (20) = 50 commsDelayed settled upstream; the cap is 40.
    const state = runUpstreamThenFlights(cctx, ['alpha', 'beta'])
    expect(flightsSub(state).projectionDivergence).toBe(40)
  })

  it('the same multiset folds identically regardless of upstream arrival order', () => {
    const ab = runUpstreamThenFlights(cctx, ['alpha', 'beta'])
    const ba = runUpstreamThenFlights(cctx, ['beta', 'alpha'])
    // Order-independent through the real engine fold: same capped value, same
    // whole substate.
    expect(flightsSub(ab).projectionDivergence).toBe(40)
    expect(flightsSub(ba).projectionDivergence).toBe(40)
    expect(flightsSub(ab)).toEqual(flightsSub(ba))
  })

  it('a single sub-cap upstream consequence passes through uncapped', () => {
    // Only alpha settles (30, under the 40 cap): flights sees exactly 30.
    const state = runUpstreamThenFlights(cctx, ['alpha'])
    expect(flightsSub(state).projectionDivergence).toBe(30)
  })
})
