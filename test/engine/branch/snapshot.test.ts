import { describe, expect, it } from 'vitest'
import { snapshot } from '@engine/branch'
import { buildTestContext } from '@engine/testing'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import { FIXTURE_RECORDS } from '../records/fixtures'

const ctx = buildTestContext(FIXTURE_RECORDS)
const T0 = 1_000_000

function midCampaign() {
  return dispatch(
    ctx,
    createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
    { type: 'START_MISSION', missionId: 'alpha' },
    T0,
  ).state
}

describe('snapshot deep freeze', () => {
  it('freezes the top level and every nested object and array', () => {
    const snap = snapshot(midCampaign())
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.rng)).toBe(true)
    expect(Object.isFrozen(snap.rng.words)).toBe(true)
    expect(Object.isFrozen(snap.activeMission)).toBe(true)
    expect(Object.isFrozen(snap.activeMission?.substate)).toBe(true)
    expect(Object.isFrozen(snap.campaignQueue)).toBe(true)
    expect(Object.isFrozen(snap.settled)).toBe(true)
  })

  it('mutating a nested path throws in strict mode', () => {
    const snap = snapshot(midCampaign())
    expect(() => {
      ;(snap as { lastNow: number }).lastNow = 0
    }).toThrow()
    expect(() => {
      ;(snap.rng.words as number[])[0] = 0
    }).toThrow()
    expect(() => {
      ;(snap.activeMission!.substate as { delivered: number }).delivered = 99
    }).toThrow()
  })

  it('is a structural clone sharing no references with the source', () => {
    const live = midCampaign()
    const snap = snapshot(live)
    expect(snap).not.toBe(live)
    expect(snap.rng).not.toBe(live.rng)
    expect(snap.rng.words).not.toBe(live.rng.words)
    expect(snap.activeMission).not.toBe(live.activeMission)
  })

  it('survives a JSON round trip unchanged (JSON-safe)', () => {
    const snap = snapshot(midCampaign())
    const round = JSON.parse(JSON.stringify(snap))
    expect(round).toEqual(snap)
  })
})
