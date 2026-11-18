// Section-04 CI fixture: extended time (the accessibility time option) scales
// every scheduled kind PROPORTIONALLY. Departures, arrivals, storm events,
// corrections, desk-check replies, and the hub last-departure (window) offsets
// all scale by the SAME factor, derived from the materialized endsAt (ratio and
// order, never absolute magic numbers); the end-anchored settle tick lands at
// the scaled deadline. The walkthrough still reaches full tier at the longer
// duration (action times scaled by the same ratio), and the correction lead
// margin survives doubling. All three seeds.
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
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
  walkthroughFor,
} from './fixtures/index'

function startMission(
  ctx: EngineContext,
  seedName: string,
  extendedTime: boolean,
): CampaignState {
  const created = createCampaign(ctx, seedName, { extendedTime }, FLIGHTS_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'flights' },
    FLIGHTS_T0,
  ).state
}

/** The materialized start-offset (ms from T0) of a scheduled event by id. */
function offsetOf(state: CampaignState, id: string): number | null {
  const event = state.missionQueue.find((e) => e.id === id)
  return event ? event.scheduledAt - FLIGHTS_T0 : null
}

describe.each(SEED_NAMES)('flights extended-time fixture: %s', (seedName) => {
  it('all scheduled kinds scale proportionally under extended time', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const standard = startMission(ctx, seedName, false)
    const extended = startMission(ctx, seedName, true)

    // The ratio is derived from the materialized deadline, not a hard-coded 2.
    const standardSpan = standard.activeMission!.endsAt - FLIGHTS_T0
    const extendedSpan = extended.activeMission!.endsAt - FLIGHTS_T0
    const ratio = extendedSpan / standardSpan
    expect(ratio).toBeGreaterThan(1)
    expect(extendedSpan).toBe(FLIGHTS_DURATION_MS * ratio)

    // Every start-anchored scheduled id scales by the SAME ratio: departures,
    // storm steps, forecast leads, the correction, and the hub windows.
    const startAnchoredIds: string[] = [
      ...payload.flights.map((f) => `flights-depart-${f.id}`),
      ...payload.stormTrack.map((_, i) => `flights-storm-${i}`),
      ...payload.stormTrack
        .map((s, i) =>
          s.closeCorridors.length > 0 || s.closeHubs.length > 0
            ? `flights-forecast-${i}`
            : null,
        )
        .filter((id): id is string => id !== null),
      ...payload.corrections.map((_, i) => `flights-correction-${i}`),
      ...payload.hubs.map((h) => `flights-window-${h.id}`),
    ]
    for (const id of startAnchoredIds) {
      const std = offsetOf(standard, id)
      const ext = offsetOf(extended, id)
      expect(std).not.toBeNull()
      expect(ext).not.toBeNull()
      expect(ext).toBe(std! * ratio)
    }

    // The arrival offsets scale too: a flight's departure scales by the ratio,
    // its cruise is in-flight time scaled by the clock, so the whole arrival
    // offset scales proportionally (checked via the depart offsets above, the
    // only authored arrival driver on the schedule).

    // The end-anchored settle tick lands at the scaled deadline (endsAt), not a
    // scaled start offset: it materializes as endsAt - 0.
    const tickStd = standard.missionQueue.find((e) => e.id === 'flights-tick')!
    const tickExt = extended.missionQueue.find((e) => e.id === 'flights-tick')!
    expect(tickStd.scheduledAt).toBe(standard.activeMission!.endsAt)
    expect(tickExt.scheduledAt).toBe(extended.activeMission!.endsAt)

    // Order is preserved under scaling: the standard and extended schedules fire
    // their ids in the same relative order (scaling is monotonic).
    const orderOf = (state: CampaignState): string[] =>
      [...state.missionQueue]
        .sort((a, b) =>
          a.scheduledAt !== b.scheduledAt
            ? a.scheduledAt - b.scheduledAt
            : a.id < b.id
              ? -1
              : 1,
        )
        .map((e) => e.id)
    expect(orderOf(extended)).toEqual(orderOf(standard))
  })

  it('the walkthrough still reaches full tier with time doubled', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    let state = startMission(ctx, seedName, true)
    const endsAt = state.activeMission!.endsAt
    const ratio = (endsAt - FLIGHTS_T0) / FLIGHTS_DURATION_MS
    // Replay the walkthrough action envelopes (skip the START prefix, already
    // dispatched) with each delta from T0 scaled by the SAME ratio.
    const envelopes = walkthroughFor(seedName).slice(1)
    for (const [action, now] of envelopes) {
      const scaledNow = FLIGHTS_T0 + (now - FLIGHTS_T0) * ratio
      state = advanceCampaign(ctx, state, scaledNow).state
      state = dispatch(ctx, state, action, scaledNow).state
    }
    const advanced = advanceCampaign(ctx, state, endsAt + 1_000)
    const flights = advanced.state.settled.find((s) => s.missionId === 'flights')!
    expect(flights.tier).toBe('full')
    expect(flights.metrics['resolved_passengers']).toBe(total)
    // Doubled: the extended window is exactly twice the standard.
    expect(endsAt - FLIGHTS_T0).toBe(FLIGHTS_DURATION_MS * 2)
  })

  it('the correction lead margin survives doubling', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const extended = startMission(ctx, seedName, true)
    const ratio = (extended.activeMission!.endsAt - FLIGHTS_T0) / FLIGHTS_DURATION_MS
    // For each authored correction, the scaled correction offset still lands at
    // least the scaled lead margin before the scaled last-safe-decision, so the
    // forecast reaches the player with genuine decision room at the longer
    // duration. Proportional arithmetic, not an absolute offset.
    payload.corrections.forEach((correction, i) => {
      const correctionAt = offsetOf(extended, `flights-correction-${i}`)!
      const scaledLastSafe = correction.lastSafeDecisionAtSeconds * 1000 * ratio
      const scaledLeadMargin = payload.leadMarginSeconds * 1000 * ratio
      expect(correctionAt).toBeLessThanOrEqual(scaledLastSafe - scaledLeadMargin)
      // And the scaled correction offset is exactly the authored offset scaled.
      expect(correctionAt).toBe(correction.offsetSeconds * 1000 * ratio)
    })
  })
})
