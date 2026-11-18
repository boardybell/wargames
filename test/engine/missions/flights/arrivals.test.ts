import { describe, expect, it } from 'vitest'
import type { CampaignAction } from '@engine/campaign/types'
import {
  flightsContext,
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
function divert(flightId: string, hubId: string, now: number): [CampaignAction, number] {
  return [{ type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId, hubId } }, now]
}

describe('arrivals and the buzzer', () => {
  it('a LAND is legal regardless of projected arrival time', () => {
    // WX101 airborne at +10s; land it late in the window, arrival still
    // computed far past but inside the deadline.
    const { state } = drive(ctx, [start(), land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000)])
    const fs = flightsSub(state).flights['WX101']!
    expect(fs.status).toBe('airborne')
    expect(fs.inboundHubId).toBe('CASCADE')
    expect(fs.arrivalAt).toBe(FLIGHTS_T0 + 15_000 + 60_000)
  })

  it('an arrival with scheduledAt <= endsAt resolves the landing', () => {
    // Land WX101 at +15s, cruise 60s -> arrival at +75s, well inside.
    const { state } = drive(
      ctx,
      [start(), land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000)],
      FLIGHTS_T0 + 90_000,
    )
    expect(flightsSub(state).flights['WX101']!.status).toBe('landed')
  })

  it('marks a landing LATE past the authored lateness threshold via queue delay', () => {
    // VERDANT has two slots and is the destination of both WX103
    // (CASCADE->VERDANT) and WX105 (MERIDIAN->VERDANT). WX103 lands on time
    // and fills one slot. WX105 then LANDs into the occupied queue: delay
    // table[1] = 30s > the 20s lateness threshold, so WX105 lands LATE at
    // its OWN destination (landedLate, not divertedLanded).
    const { state } = drive(
      ctx,
      [
        start(),
        land('WX103', 'VERDANT', FLIGHTS_T0 + 25_000),
        land('WX105', 'VERDANT', FLIGHTS_T0 + 25_000),
      ],
      FLIGHTS_T0 + 150_000,
    )
    const s = flightsSub(state)
    expect(s.flights['WX103']!.status).toBe('landed')
    expect(s.flights['WX105']!.status).toBe('landedLate')
  })

  it('leaves a flight airborne when its computed arrival is past endsAt', () => {
    // WX104 (SABLE->MERIDIAN) toward its always-open destination. Dispatch
    // at endsAt - 30s, cruise 60s -> arrival at endsAt + 30s, past the
    // deadline: it never folds and strands at timeout.
    const { state } = drive(
      ctx,
      [start(), land('WX104', 'MERIDIAN', ENDS_AT - 30_000)],
      ENDS_AT + 1_000,
    )
    const settled = state.settled.find((o) => o.missionId === 'flights')!
    expect(settled.metrics['stranded_flights']).toBeGreaterThanOrEqual(1)
  })

  it('buzzer boundary: an arrival exactly at endsAt lands before the timeout guard', () => {
    // WX104 to MERIDIAN (always open). Dispatch at endsAt - 60s, cruise 60s
    // -> arrival EXACTLY at endsAt.
    const { state } = drive(
      ctx,
      [start(), land('WX104', 'MERIDIAN', ENDS_AT - 60_000)],
      ENDS_AT + 1_000,
    )
    const settled = state.settled.find((o) => o.missionId === 'flights')!
    expect(settled.metrics['landed_flights']).toBeGreaterThanOrEqual(1)
    // WX104's 40 passengers reached a hub on time.
    expect(settled.metrics['on_time_passengers']).toBeGreaterThanOrEqual(40)
  })

  it('buzzer boundary: the same arrival one tick later strands', () => {
    const { state } = drive(
      ctx,
      [start(), land('WX104', 'MERIDIAN', ENDS_AT - 60_000 + 1)],
      ENDS_AT + 1_000,
    )
    const settled = state.settled.find((o) => o.missionId === 'flights')!
    // WX104 did not land in time; its 40 are not credited on time. (Other
    // flights also strand, so on_time stays 0.)
    expect(settled.metrics['on_time_passengers']).toBe(0)
  })

  it('a DIVERT joins the target hub queue with positional delay', () => {
    void divert
    const { state } = drive(ctx, [
      start(),
      // WX104 (SABLE->MERIDIAN) diverts to MERIDIAN at +25s (airborne +20s).
      divert('WX104', 'MERIDIAN', FLIGHTS_T0 + 25_000),
    ])
    const fs = flightsSub(state).flights['WX104']!
    expect(fs.inboundHubId).toBe('MERIDIAN')
    // MERIDIAN empty at divert -> position 0 -> +0 queue delay.
    expect(fs.arrivalAt).toBe(FLIGHTS_T0 + 25_000 + 60_000)
  })
})
