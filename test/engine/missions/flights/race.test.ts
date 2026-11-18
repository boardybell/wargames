import { describe, expect, it } from 'vitest'
import { advanceCampaign, createCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignAction } from '@engine/campaign/types'
import { flightsContext, flightsSub, start, FLIGHTS_T0 } from './fixtures'

const ctx = flightsContext()

// WX101 departs at +10s. A HOLD dispatched with `now` at or past that offset
// races the departure. The engine advances (drains) BEFORE it reduces the
// action, so the departure always wins: the flight is airborne by the time
// the HOLD reduces, and the HOLD rejects NOT SCHEDULED. The outcome is the
// same whether the departure drained in an earlier wake or drains inside the
// same dispatch.
const DEPART_AT = FLIGHTS_T0 + 10_000

function hold(flightId: string): CampaignAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId } }
}

describe('same-call race: HOLD past the departure resolves drain-then-reduce', () => {
  it('ordering A: the departure already drained in a prior wake', () => {
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
    // A separate wake drains the +10s departure first: WX101 is airborne.
    const afterDepart = advanceCampaign(ctx, state, DEPART_AT + 1_000).state
    expect(flightsSub(afterDepart).flights['WX101']!.status).toBe('airborne')
    // Now HOLD at a later now: nothing left to drain, the flight is airborne,
    // the HOLD rejects.
    const result = dispatch(ctx, afterDepart, hold('WX101'), DEPART_AT + 2_000)
    expect(result.rejection).toMatchObject({ rejected: true, reason: 'NOT SCHEDULED' })
    expect(flightsSub(result.state).flights['WX101']!.status).toBe('airborne')
  })

  it('ordering B: the departure drains inside the same HOLD dispatch', () => {
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
    // Before the dispatch, WX101 is still scheduled (no time has passed).
    expect(flightsSub(state).flights['WX101']!.status).toBe('scheduled')
    // Dispatch the HOLD with now past the departure: advance drains the
    // departure (airborne) first, then the HOLD reduces against airborne and
    // rejects. Same terminal state as ordering A.
    const result = dispatch(ctx, state, hold('WX101'), DEPART_AT + 1)
    expect(result.rejection).toMatchObject({ rejected: true, reason: 'NOT SCHEDULED' })
    expect(flightsSub(result.state).flights['WX101']!.status).toBe('airborne')
  })

  it('both orderings reach the identical deterministic flight state', () => {
    // Ordering A outcome.
    let a = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    a = dispatch(ctx, a, start()[0], FLIGHTS_T0).state
    a = advanceCampaign(ctx, a, DEPART_AT + 1_000).state
    a = dispatch(ctx, a, hold('WX101'), DEPART_AT + 2_000).state
    // Ordering B outcome, advanced to the same now so the comparison is fair.
    let b = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    b = dispatch(ctx, b, start()[0], FLIGHTS_T0).state
    b = dispatch(ctx, b, hold('WX101'), DEPART_AT + 1).state
    b = advanceCampaign(ctx, b, DEPART_AT + 2_000).state
    expect(flightsSub(a).flights['WX101']).toEqual(flightsSub(b).flights['WX101'])
    expect(flightsSub(a).flights['WX101']!.status).toBe('airborne')
  })

  it('the inverse: a HOLD strictly BEFORE the departure holds the flight', () => {
    // Control: dispatched before +10s the flight is still scheduled, so the
    // HOLD succeeds and the later departure event is a no-op for a held
    // flight. This pins that the race above is a real ordering effect.
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
    const held = dispatch(ctx, state, hold('WX101'), FLIGHTS_T0 + 1_000)
    expect(held.rejection).toBeNull()
    expect(flightsSub(held.state).flights['WX101']!.status).toBe('held')
    // Advance past the departure: a held flight never departs.
    const after = advanceCampaign(ctx, held.state, DEPART_AT + 5_000)
    expect(flightsSub(after.state).flights['WX101']!.status).toBe('held')
  })
})
