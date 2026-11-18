import { describe, expect, it } from 'vitest'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { selectMenuRows } from '@engine/campaign/selectors'
import { snapshot } from '@engine/branch'
import { materializeSchedule } from '@engine/time'
import { finaleSchedule } from '@engine/missions/finale/module'
import {
  FINALE_DURATION_MS,
  FINALE_ID,
  MISSIONS,
  advanceCampaign,
  makeFinaleContext,
  startedFinale,
  winAndAck,
} from './fixtures'

const specs = finaleSchedule(20)

function at(id: string, queue: ReturnType<typeof materializeSchedule>['queue']): number {
  return queue.find((e) => e.id === id)!.scheduledAt
}

describe('finale schedule: durations and scaling', () => {
  it('standard duration is three minutes; extended is six', () => {
    const start = 1_000_000
    const std = materializeSchedule(specs, start, 'standard', FINALE_DURATION_MS)
    const ext = materializeSchedule(specs, start, 'extended', FINALE_DURATION_MS)
    expect(std.endsAt - start).toBe(FINALE_DURATION_MS)
    expect(ext.endsAt - start).toBe(FINALE_DURATION_MS * 2)
  })

  it('start-anchored authored offsets scale proportionally under extended time', () => {
    const start = 1_000_000
    // Add a start-anchored beat at 60s to prove scaling.
    const withBeat = finaleSchedule(20, [60])
    const std = materializeSchedule(withBeat, start, 'standard', FINALE_DURATION_MS)
    const ext = materializeSchedule(withBeat, start, 'extended', FINALE_DURATION_MS)
    expect(at('finale-beat-0', std.queue) - start).toBe(60_000)
    expect(at('finale-beat-0', ext.queue) - start).toBe(120_000)
  })

  it('end-anchored warnings and finaleFinalPhase anchor to endsAt and do NOT scale', () => {
    const start = 1_000_000
    const std = materializeSchedule(specs, start, 'standard', FINALE_DURATION_MS)
    const ext = materializeSchedule(specs, start, 'extended', FINALE_DURATION_MS)
    // Each end-anchored event is exactly its authored offset before endsAt in
    // BOTH durations (the amendment 9 carve-out).
    expect(std.endsAt - at('warn-30', std.queue)).toBe(30_000)
    expect(ext.endsAt - at('warn-30', ext.queue)).toBe(30_000)
    expect(std.endsAt - at('warn-10', std.queue)).toBe(10_000)
    expect(ext.endsAt - at('warn-10', ext.queue)).toBe(10_000)
    expect(std.endsAt - at('final-phase', std.queue)).toBe(20_000)
    expect(ext.endsAt - at('final-phase', ext.queue)).toBe(20_000)
  })
})

describe('finale schedule: finaleFinalPhase emits exactly once', () => {
  it('emits one finaleFinalPhase at its scheduled wake and not again', () => {
    const { ctx, state } = startedFinale()
    const endsAt = state.activeMission!.endsAt
    const finalPhaseAt = endsAt - 20_000
    // Advance to just past the final-phase wake, short of the deadline.
    const first = advanceCampaign(ctx, state, finalPhaseAt + 1_000)
    expect(first.emitted.filter((e) => e.type === 'finaleFinalPhase')).toHaveLength(1)
    // A further advance (still before endsAt) does not re-emit it.
    const second = advanceCampaign(ctx, first.state, endsAt - 5_000)
    expect(second.emitted.filter((e) => e.type === 'finaleFinalPhase')).toHaveLength(0)
  })
})

describe('finale registration: row 4, unlock, snapshot seam', () => {
  it('registers as row 4, unlocked when all three debriefs are acknowledged', () => {
    const ctx = makeFinaleContext()
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, 1_000_000)
    // Before any debrief, the finale is not among the menu rows.
    let rows = selectMenuRows(state, [...MISSIONS], FINALE_ID)
    expect(rows.finaleUnlocked).toBe(false)
    expect(rows.rows.some((r) => r.missionId === FINALE_ID)).toBe(false)

    state = winAndAck(ctx, state, 'alpha', 1_000_000)
    state = winAndAck(ctx, state, 'beta', 1_300_000)
    state = winAndAck(ctx, state, 'gamma', 1_600_000)

    rows = selectMenuRows(state, [...MISSIONS], FINALE_ID)
    expect(rows.finaleUnlocked).toBe(true)
    // Row 4: appended after the three mission rows.
    expect(rows.rows).toHaveLength(4)
    expect(rows.rows[3]!.missionId).toBe(FINALE_ID)
  })

  it('unlocks regardless of mission outcomes (all-failed by forfeit still unlocks)', () => {
    const ctx = makeFinaleContext()
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, 1_000_000)
    for (const [i, missionId] of [...MISSIONS].entries()) {
      const start = 1_000_000 + i * 300_000
      state = dispatch(ctx, state, { type: 'START_MISSION', missionId }, start).state
      state = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, start + 1_000).state
      state = dispatch(
        ctx,
        state,
        { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
        start + 2_000,
      ).state
    }
    expect(
      selectMenuRows(state, [...MISSIONS], FINALE_ID).finaleUnlocked,
    ).toBe(true)
  })

  it('START materializes the schedule and the campaign is snapshot-able at finale start', () => {
    const { state } = startedFinale()
    // The schedule materialized: the mission queue carries the finale events.
    const ids = state.missionQueue.map((e) => e.id)
    expect(ids).toContain('final-phase')
    expect(ids).toContain('warn-30')
    expect(ids).toContain('warn-10')
    // The engine-owned snapshot seam: the live campaign is frozen for the
    // zero-player comparisons (section 02 runs the branches over it).
    const frozen = snapshot(state)
    expect(frozen.activeMission?.missionId).toBe(FINALE_ID)
    expect(Object.isFrozen(frozen)).toBe(true)
  })
})

export type { CampaignState }
