import { describe, expect, it } from 'vitest'
import { advanceCampaign, createCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { validateCase } from '@engine/missions/finale/caseBuilder'
import { buildRecordGraph } from '@engine/records'
import {
  CLAIM_RUN_ID,
  FIELD_REPORT_ID,
  FINALE_DECISION_MARGIN_MS,
  FINALE_DURATION_MS,
  FINALE_ID,
  FINALE_RECORDS,
  ROOT_RECORD_ID,
  act,
  caseFileFrom,
  finaleState,
  makeFinaleContext,
  startFinaleWithDelay,
  startedFinale,
} from './fixtures'
import type { FinaleState } from '@engine/missions/finale/types'

const graph = buildRecordGraph(FINALE_RECORDS)

function correctWith(observation: string): FinaleState {
  return {
    slots: {
      outlook: 'C17',
      flights: 'F06',
      bank: 'B04',
      root: 'C17',
      observation,
    },
    ordering: ['C17', 'F06', 'B04'],
    caseValid: false,
    lastRejection: null,
    comparisonsRun: 0,
    fieldReportRequested: false,
    committed: null,
  }
}

describe('finale field report: the bounded wait is ENFORCED at construction', () => {
  // The bound: the FR01 desk delay (ms) must be <= durationMs - margin.
  // durationMs 180_000, margin 60_000, so the bound is 120_000ms (120s).
  it('a seed whose field-report desk delay exceeds the bound is REJECTED at START', () => {
    // 121s desk delay = 121_000ms, one second past the 120_000ms bound. A
    // REQUEST FIELD REPORT at first legality would resolve past the commit
    // window, so construction (module.init) throws and START is rejected.
    const { result } = startFinaleWithDelay(121)
    expect(result.rejection).not.toBeNull()
    expect(result.rejection!.reason).toBe('MISSION INIT FAILED')
    // No finale became active; the unwinnable seed never ran.
    expect(result.state.activeMission).toBeNull()
  })

  it('a compliant seed passes construction and starts the finale', () => {
    // 120s desk delay = 120_000ms, exactly on the bound (<=): allowed.
    const { result } = startFinaleWithDelay(120)
    expect(result.rejection).toBeNull()
    expect(result.state.activeMission!.missionId).toBe(FINALE_ID)
  })

  it('the default compliant seed resolves the reply with the decision margin ahead of the deadline', () => {
    // Drive the real deskCheck/sourceCheck path: a request at first legality
    // resolves well inside the bound, leaving the full decision margin.
    const { ctx, state, startedAt } = startedFinale()
    const endsAt = state.activeMission!.endsAt
    let current = act(
      ctx,
      state,
      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
      startedAt + 1,
    ).state
    current = dispatch(
      ctx,
      current,
      { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
      startedAt + 1,
    ).state
    current = advanceCampaign(ctx, current, startedAt + 25_000).state
    const resolvedAt = current.sourceChecks.find(
      (c) => c.recordId === FIELD_REPORT_ID,
    )!.resolvedAt
    const commitDeadline = endsAt - FINALE_DECISION_MARGIN_MS
    expect(resolvedAt).toBeLessThanOrEqual(commitDeadline)
    expect(commitDeadline - resolvedAt).toBeGreaterThanOrEqual(
      FINALE_DECISION_MARGIN_MS,
    )
  })
})

describe('finale field report: legality through the engine', () => {
  it('REQUEST FIELD REPORT is legal when no corroborated candidate exists', () => {
    const { ctx, state, startedAt } = startedFinale()
    const requested = act(
      ctx,
      state,
      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
      startedAt + 1_000,
    )
    expect(finaleState(requested.state).fieldReportRequested).toBe(true)
  })

  it('illegal once a corroborated candidate exists: a no-op, not a crash', () => {
    const { ctx, state, startedAt } = startedFinale()
    // Make W02 a corroborated candidate: request + resolve its desk check.
    let current = dispatch(
      ctx,
      state,
      { type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' },
      startedAt + 1_000,
    ).state
    current = advanceCampaign(ctx, current, startedAt + 30_000).state
    // Now a corroborated candidate (W02) exists; the request is a no-op.
    const requested = act(
      ctx,
      current,
      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(current) },
      startedAt + 31_000,
    )
    expect(finaleState(requested.state).fieldReportRequested).toBe(false)
  })
})

describe('finale field report: the bounded-wait flow', () => {
  it('the reply joins the corroborated list and satisfies the observation slot', () => {
    const { ctx, state, startedAt } = startedFinale()
    // Request the field report (finale flag) then dispatch the engine desk
    // check against the designated record.
    let current = act(
      ctx,
      state,
      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
      startedAt + 1_000,
    ).state
    current = dispatch(
      ctx,
      current,
      { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
      startedAt + 1_000,
    ).state
    // The desk resolves 20s later.
    current = advanceCampaign(ctx, current, startedAt + 25_000).state
    expect(
      current.sourceChecks.some((c) => c.recordId === FIELD_REPORT_ID),
    ).toBe(true)
    // The field report now corroborates the observation slot.
    const result = validateCase(correctWith(FIELD_REPORT_ID), {
      graph,
      claimRunId: CLAIM_RUN_ID,
      rootRecordId: ROOT_RECORD_ID,
      fieldReportId: FIELD_REPORT_ID,
      sourceChecks: caseFileFrom(current).sourceChecks,
      inspectedRecords: [],
    })
    expect(result).toEqual({ ok: true })
  })

  it('slack: requested at first legality resolves with room to validate and commit', () => {
    const { ctx, state, startedAt } = startedFinale()
    const endsAt = state.activeMission!.endsAt
    expect(endsAt).toBe(startedAt + FINALE_DURATION_MS)
    // Request at the first instant of legality (finale start).
    let current = act(
      ctx,
      state,
      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
      startedAt + 1,
    ).state
    current = dispatch(
      ctx,
      current,
      { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
      startedAt + 1,
    ).state
    // Resolve the desk. The authored wait (20s) is bounded well below
    // finaleDuration minus the decision margin.
    current = advanceCampaign(ctx, current, startedAt + 25_000).state
    const resolvedAt = current.sourceChecks.find(
      (c) => c.recordId === FIELD_REPORT_ID,
    )!.resolvedAt
    const commitDeadline = endsAt - FINALE_DECISION_MARGIN_MS
    // The reply lands with the full decision margin still ahead of it.
    expect(resolvedAt).toBeLessThanOrEqual(commitDeadline)
    expect(commitDeadline - resolvedAt).toBeGreaterThan(0)
  })

  it('available after any combination of mission failures (all-failed fixture)', () => {
    const ctx = makeFinaleContext()
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, 1_000_000)
    // Fail every mission by forfeit, then acknowledge. Finale still unlocks and
    // the field report is still requestable.
    for (const [i, missionId] of ['alpha', 'beta', 'gamma'].entries()) {
      const at = 1_000_000 + i * 300_000
      state = dispatch(ctx, state, { type: 'START_MISSION', missionId }, at).state
      state = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, at + 1_000).state
      state = dispatch(
        ctx,
        state,
        { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
        at + 2_000,
      ).state
    }
    const finaleStart = 1_000_000 + 900_000
    state = dispatch(
      ctx,
      state,
      { type: 'START_MISSION', missionId: FINALE_ID },
      finaleStart,
    ).state
    const requested = act(
      ctx,
      state,
      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
      finaleStart + 1_000,
    )
    expect(finaleState(requested.state).fieldReportRequested).toBe(true)
  })
})

describe('finale field report: post-settlement reply', () => {
  it('a reply arriving post-settlement is recorded with arrivedAfterSettlement', () => {
    const { ctx, state, startedAt } = startedFinale()
    // Request the field report desk check, then commit (settling the finale)
    // before the desk reply lands. The reply arrives after settlement.
    let current = dispatch(
      ctx,
      state,
      { type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID },
      startedAt + 1_000,
    ).state
    current = act(
      ctx,
      current,
      { kind: 'COMMIT', choice: 'hold' },
      startedAt + 2_000,
    ).state
    expect(current.settled.some((s) => s.missionId === FINALE_ID)).toBe(true)
    // Now advance past the desk delay; the reply lands post-settlement.
    current = advanceCampaign(ctx, current, startedAt + 25_000).state
    const check = current.sourceChecks.find((c) => c.recordId === FIELD_REPORT_ID)!
    expect(check.arrivedAfterSettlement).toBe(true)
  })
})

export type { CampaignState }
