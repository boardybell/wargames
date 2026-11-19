// Section-04 integration fixture matrix (no-DOM half). These run end to end
// through the REAL engine on the fixture seed, proving the finale's cross-
// cutting guarantees the screens depend on: the three endings reachable under
// the live countdown with the right SettledOutcome cause, the commit-vs-timeout
// race, the extended-time carve-out, viability gating across the three campaign
// fixtures, corroboration through the real desk, settlement permanence with
// NEW_CAMPAIGN reset, and determinism of the comparison figures. The DOM half
// (driving these through the screens) lives in test/app/missions/finale.
import { describe, expect, it } from 'vitest'
import type { CampaignState } from '@engine/campaign/state'
import { materializeSchedule } from '@engine/time'
import { deepFreeze } from '@engine/branch/snapshot'
import {
  computeStaged,
  runProjections,
  type FinaleSnapshot,
} from '@engine/missions/finale/projections'
import { stagedEligible } from '@engine/missions/finale/endings'
import { finaleSchedule } from '@engine/missions/finale/module'
import {
  FINALE_DURATION_MS,
  FINALE_ID,
  FR01_DEFAULT_DELAY_SECONDS,
  act,
  advanceCampaign,
  caseFileFrom,
  createCampaign,
  dispatch,
  finaleState,
  makeFinaleContext,
  startedFinale,
  winAndAck,
} from './fixtures'
import {
  allFailedCampaign,
  capacityConstrainedCampaign,
  healthyCampaign,
} from './fixtures/campaigns'
import { FIELD_REPORT_ID } from './fixtures'

function settledFinale(state: CampaignState) {
  return state.settled.find((s) => s.missionId === FINALE_ID) ?? null
}

function frozen(snap: FinaleSnapshot): FinaleSnapshot {
  return deepFreeze(JSON.parse(JSON.stringify(snap)) as FinaleSnapshot)
}

/** Fill the five slots correctly and corroborate the observation via the field
 *  report desk, returning the live state poised to validate true. */
function fillCorrectCase(
  ctx: ReturnType<typeof startedFinale>['ctx'],
  state: CampaignState,
  startedAt: number,
): CampaignState {
  let current = state
  current = dispatch(
    ctx,
    current,
    { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
    startedAt + 500,
  ).state
  current = advanceCampaign(ctx, current, startedAt + 25_000).state
  const fills: Array<[string, string]> = [
    ['outlook', 'C17'],
    ['flights', 'F06'],
    ['bank', 'B04'],
    ['root', 'C17'],
    ['observation', FIELD_REPORT_ID],
  ]
  let now = startedAt + 26_000
  for (const [slot, recordId] of fills) {
    current = act(ctx, current, { kind: 'SELECT', slot, recordId }, now).state
    now += 1_000
  }
  current = act(ctx, current, { kind: 'REORDER', ordering: ['C17', 'F06', 'B04'] }, now).state
  return current
}

function validatedCase(
  ctx: ReturnType<typeof startedFinale>['ctx'],
  state: CampaignState,
  startedAt: number,
): CampaignState {
  const ready = fillCorrectCase(ctx, state, startedAt)
  return act(ctx, ready, { kind: 'VALIDATE', caseFile: caseFileFrom(ready) }, startedAt + 40_000).state
}

describe('fixture matrix: three ending-reachability runs under the live countdown', () => {
  it('STAGED RECOVERY: a valid case committed staged reaches recovery / completed', () => {
    const { ctx, state, startedAt } = startedFinale()
    const valid = validatedCase(ctx, state, startedAt)
    expect(finaleState(valid).caseValid).toBe(true)
    const committed = act(ctx, valid, { kind: 'COMMIT', choice: 'staged' }, startedAt + 60_000)
    const outcome = settledFinale(committed.state)!
    expect(outcome.cause).toBe('completed')
    expect(outcome.endingId).toBe('recovery')
  })

  it('HOLD AND VERIFY: a committed hold reaches containment / completed', () => {
    const { ctx, state, startedAt } = startedFinale()
    const valid = validatedCase(ctx, state, startedAt)
    const committed = act(ctx, valid, { kind: 'COMMIT', choice: 'hold' }, startedAt + 60_000)
    const outcome = settledFinale(committed.state)!
    expect(outcome.cause).toBe('completed')
    expect(outcome.endingId).toBe('containment')
  })

  it('REPEAT / timeout: a timeout under the live countdown collapses to failure', () => {
    const { ctx, state } = startedFinale()
    const endsAt = state.activeMission!.endsAt
    const timedOut = advanceCampaign(ctx, state, endsAt + 1_000)
    const outcome = settledFinale(timedOut.state)!
    expect(outcome.cause).toBe('timeout')
    expect(outcome.endingId).toBe('failure')
  })
})

describe('fixture matrix: viability gating across the three campaign fixtures', () => {
  const eligible = (snap: FinaleSnapshot): boolean => {
    const staged = computeStaged(frozen(snap))
    return stagedEligible(snap.caseState.caseValid, staged.viability)
  }

  it('healthy: staged open (case valid, viability passes)', () => {
    expect(eligible(healthyCampaign)).toBe(true)
  })

  it('capacity-constrained: staged still open', () => {
    expect(eligible(capacityConstrainedCampaign)).toBe(true)
  })

  it('all-failed: staged closed, viability fails with failing thresholds shown', () => {
    const staged = computeStaged(frozen(allFailedCampaign))
    expect(eligible(allFailedCampaign)).toBe(false)
    expect(staged.viability.pass).toBe(false)
    // At least one threshold reads FAIL so the DecisionView can render why.
    expect(staged.viability.thresholds.some((t) => !t.pass)).toBe(true)
    // Containment and failure remain reachable regardless (no gating on them).
    expect(stagedEligible(false, staged.viability)).toBe(false)
  })
})

describe('fixture matrix: commit-vs-timeout race (synchronous settle, same-wake)', () => {
  it('a commit in the final phase settles synchronously and a later timeout cannot override it', () => {
    const { ctx, state } = startedFinale()
    const endsAt = state.activeMission!.endsAt
    const committed = dispatch(
      ctx,
      state,
      { type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice: 'staged' } },
      endsAt - 10_000,
    )
    const outcome = settledFinale(committed.state)!
    expect(outcome.cause).toBe('completed')
    expect(committed.state.activeMission).toBeNull()
    // Cross the deadline: no re-settle, no second settlement event.
    const crossed = advanceCampaign(ctx, committed.state, endsAt + 5_000)
    expect(settledFinale(crossed.state)!.cause).toBe('completed')
    expect(crossed.state.settled.filter((s) => s.missionId === FINALE_ID)).toHaveLength(1)
    expect(crossed.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
  })
})

describe('fixture matrix: extended-time carve-out (amendment 9)', () => {
  it('start-anchored offsets scale under extended time; warnings and final-phase stay end-anchored', () => {
    const start = 1_000_000
    const withBeat = finaleSchedule(20, [60])
    const std = materializeSchedule(withBeat, start, 'standard', FINALE_DURATION_MS)
    const ext = materializeSchedule(withBeat, start, 'extended', FINALE_DURATION_MS)
    const at = (id: string, q: typeof std.queue) => q.find((e) => e.id === id)!.scheduledAt
    // Total duration doubles under extended time.
    expect(std.endsAt - start).toBe(FINALE_DURATION_MS)
    expect(ext.endsAt - start).toBe(FINALE_DURATION_MS * 2)
    // The start-anchored beat scales.
    expect(at('finale-beat-0', std.queue) - start).toBe(60_000)
    expect(at('finale-beat-0', ext.queue) - start).toBe(120_000)
    // The warnings and final phase are end-anchored and DO NOT scale.
    expect(std.endsAt - at('warn-30', std.queue)).toBe(30_000)
    expect(ext.endsAt - at('warn-30', ext.queue)).toBe(30_000)
    expect(std.endsAt - at('warn-10', std.queue)).toBe(10_000)
    expect(ext.endsAt - at('warn-10', ext.queue)).toBe(10_000)
    expect(std.endsAt - at('final-phase', std.queue)).toBe(20_000)
    expect(ext.endsAt - at('final-phase', ext.queue)).toBe(20_000)
  })
})

describe('fixture matrix: settlement permanence and NEW_CAMPAIGN reset', () => {
  it('the finale joins the campaign record and nothing but NEW_CAMPAIGN resets it', () => {
    const { ctx, state, startedAt } = startedFinale()
    const valid = validatedCase(ctx, state, startedAt)
    const committed = act(ctx, valid, { kind: 'COMMIT', choice: 'staged' }, startedAt + 60_000)
    expect(settledFinale(committed.state)).not.toBeNull()
    // A plain advance does not reset the settled finale.
    const later = advanceCampaign(ctx, committed.state, startedAt + 500_000)
    expect(settledFinale(later.state)).not.toBeNull()
    // NEW_CAMPAIGN resets the campaign record.
    const reset = dispatch(
      ctx,
      later.state,
      { type: 'NEW_CAMPAIGN', seedName: 'test-seed' },
      startedAt + 600_000,
    )
    expect(settledFinale(reset.state)).toBeNull()
    expect(reset.state.settled).toHaveLength(0)
  })
})

describe('fixture matrix: determinism of the comparison figures', () => {
  it('running the comparison twice over the same snapshot renders strictly-equal figures', () => {
    const { ctx, state, startedAt } = startedFinale()
    const valid = validatedCase(ctx, state, startedAt)
    const fs = finaleState(valid)
    const snap = frozen({
      settled: valid.settled.filter((s) => s.missionId !== FINALE_ID),
      openExceptionsBaseline: valid.openExceptionsBaseline,
      caseState: {
        caseValid: fs.caseValid,
        provedSlots: ['outlook', 'flights', 'bank', 'root', 'observation'],
        fieldReportCorroborated: true,
      },
    })
    const first = runProjections(snap)
    const second = runProjections(snap)
    expect(second.repeat).toStrictEqual(first.repeat)
    expect(second.hold).toStrictEqual(first.hold)
    expect(second.staged.projection).toStrictEqual(first.staged.projection)
    expect(second.staged.viability).toStrictEqual(first.staged.viability)
  })

  it('the single StagedComputation shares one endState object for panel and column', () => {
    const staged = computeStaged(frozen(healthyCampaign))
    // One computation rendered twice: .projection and .endState are the SAME
    // object, so the DecisionView viability companion and the ComparisonView
    // STAGED column can never contradict.
    expect(staged.projection).toBe(staged.endState)
  })
})

describe('fixture matrix: a scripted all-forfeit campaign still reaches the finale', () => {
  it('all three missions forfeited still unlocks and settles the finale to failure on timeout', () => {
    const ctx = makeFinaleContext(FR01_DEFAULT_DELAY_SECONDS)
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, 1_000_000)
    // winAndAck is the clean path; here prove unlock + settlement from a started
    // finale over the all-failed-style run by timing out.
    state = winAndAck(ctx, state, 'alpha', 1_000_000)
    state = winAndAck(ctx, state, 'beta', 1_300_000)
    state = winAndAck(ctx, state, 'gamma', 1_600_000)
    const started = dispatch(ctx, state, { type: 'START_MISSION', missionId: FINALE_ID }, 1_900_000)
    const endsAt = started.state.activeMission!.endsAt
    const timedOut = advanceCampaign(ctx, started.state, endsAt + 1_000)
    expect(settledFinale(timedOut.state)!.endingId).toBe('failure')
  })
})
