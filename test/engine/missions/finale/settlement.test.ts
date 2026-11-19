import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import type { CampaignState } from '@engine/campaign/state'
import type { EngineEvent } from '@engine/campaign/types'
import { finaleSaveSchema } from '@engine/missions/finale/types'
import type { FinaleState } from '@engine/missions/finale/types'
import {
  FINALE_ID,
  act,
  advanceCampaign,
  caseFileFrom,
  certifiedFinale,
  commitSnapshotFrom,
  dispatch,
  finaleState,
  startedFinale,
} from './fixtures'

function settledFinale(state: CampaignState) {
  return state.settled.find((s) => s.missionId === FINALE_ID) ?? null
}

describe('finale settlement: committed transition', () => {
  it('committed moves null -> staged | hold | repeat and never changes', () => {
    // STAGED is the certified-win path: it needs a certified case and the
    // viability snapshot. HOLD and REPEAT are commit-anytime.
    for (const choice of ['staged', 'hold', 'repeat'] as const) {
      const { ctx, state, startedAt } =
        choice === 'staged' ? certifiedFinale() : startedFinale()
      expect(finaleState(state).committed).toBeNull()
      const payload =
        choice === 'staged'
          ? { kind: 'COMMIT', choice, commitSnapshot: commitSnapshotFrom(state) }
          : { kind: 'COMMIT', choice }
      const committed = act(ctx, state, payload, startedAt + 1_000)
      const outcome = settledFinale(committed.state)
      expect(outcome).not.toBeNull()
      // The finale settled; the substate committed value is frozen in the
      // runtime handed to evaluate. Assert via the settled metrics.
      expect(outcome!.metrics[`committed_${choice}`]).toBe(1)
    }
  })

  it('a duplicate commit after settlement is rejected by the engine no-active-mission guard', () => {
    const { ctx, state, startedAt } = certifiedFinale()
    const first = act(
      ctx,
      state,
      { kind: 'COMMIT', choice: 'staged', commitSnapshot: commitSnapshotFrom(state) },
      startedAt + 1_000,
    )
    const firstOutcome = settledFinale(first.state)!
    // Once the finale has settled it is no longer the active mission, so a
    // second COMMIT dispatch never reaches the module reducer: the engine
    // rejects it. (The module's own committed-guard is exercised directly
    // below, where a pre-committed state reaches reduce.)
    const second = dispatch(
      ctx,
      first.state,
      { type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice: 'repeat' } },
      startedAt + 2_000,
    )
    expect(second.rejection).not.toBeNull()
    expect(settledFinale(second.state)).toEqual(firstOutcome)
    expect(second.state.settled.filter((s) => s.missionId === FINALE_ID)).toHaveLength(1)
  })

  it("the module's OWN committed guard ignores a second COMMIT reaching reduce", () => {
    // Call the module reducer directly with a pre-committed state, so the
    // second COMMIT actually reaches reduce (the engine's no-active-mission
    // guard cannot apply). The committed value must not change: commit()
    // returns the input unchanged once committed !== null.
    const { ctx } = startedFinale()
    const module = ctx.missions[FINALE_ID]!
    const committedState = {
      slots: { outlook: null, flights: null, bank: null, root: null, observation: null },
      ordering: [],
      caseValid: false,
      lastRejection: null,
      comparisonsRun: 0,
      fieldReportRequested: false,
      committed: 'staged',
    } as unknown as FinaleState
    const after = module.reduce(committedState, {
      type: 'action',
      id: 'commit-again',
      kind: 'MISSION_ACTION',
      payload: { kind: 'COMMIT', choice: 'repeat' },
      now: 123,
    }) as FinaleState
    expect(after.committed).toBe('staged')
  })
})

describe('finale settlement: cause mapping', () => {
  it('staged and hold commits settle completed', () => {
    for (const choice of ['staged', 'hold'] as const) {
      const { ctx, state, startedAt } =
        choice === 'staged' ? certifiedFinale() : startedFinale()
      const payload =
        choice === 'staged'
          ? { kind: 'COMMIT', choice, commitSnapshot: commitSnapshotFrom(state) }
          : { kind: 'COMMIT', choice }
      const committed = act(ctx, state, payload, startedAt + 1_000)
      expect(settledFinale(committed.state)!.cause).toBe('completed')
    }
  })

  it('a repeat commit settles collapsed', () => {
    const { ctx, state, startedAt } = startedFinale()
    const committed = act(ctx, state, { kind: 'COMMIT', choice: 'repeat' }, startedAt + 1_000)
    expect(settledFinale(committed.state)!.cause).toBe('collapsed')
  })

  it('timeout settles collapsed (the repeated-order path)', () => {
    const { ctx, state } = startedFinale()
    const endsAt = state.activeMission!.endsAt
    const timedOut = advanceCampaign(ctx, state, endsAt + 1_000)
    const outcome = settledFinale(timedOut.state)!
    expect(outcome.cause).toBe('timeout')
    expect(outcome.tier).toBe('failed')
  })

  it('forfeit settles collapsed (the repeated-order path)', () => {
    const { ctx, state, startedAt } = startedFinale()
    const forfeited = dispatch(
      ctx,
      state,
      { type: 'FORFEIT_MISSION' },
      startedAt + 1_000,
    )
    const outcome = settledFinale(forfeited.state)!
    expect(outcome.cause).toBe('forfeit')
    expect(outcome.tier).toBe('failed')
  })
})

describe('finale settlement: exactly once', () => {
  it('no second settlement from a later wake after a commit', () => {
    const { ctx, state, startedAt } = startedFinale()
    const committed = act(ctx, state, { kind: 'COMMIT', choice: 'hold' }, startedAt + 1_000)
    const before = committed.state.settled.length
    const settleSeq = settledFinale(committed.state)!.settleSeq
    // Advance far past the deadline; no re-settle.
    const later = advanceCampaign(ctx, committed.state, startedAt + 1_000_000)
    expect(later.state.settled.length).toBe(before)
    expect(settledFinale(later.state)!.settleSeq).toBe(settleSeq)
    // No settlement event in the later wake.
    expect(later.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
  })
})

describe('finale settlement: commit-vs-timeout race guard', () => {
  it('a commit during the final phase settles completed, finaleFinalPhase drains in the same wake', () => {
    // A certified case so the STAGED win gate passes; the race guard is about
    // settlement timing, not the gate.
    const { ctx, state } = certifiedFinale()
    const endsAt = state.activeMission!.endsAt
    // finaleFinalPhase fires 20s before endsAt. Dispatch COMMIT at a now in the
    // final phase (after the finaleFinalPhase scheduledAt, before endsAt) so
    // the final-phase event drains in the SAME wake as the commit reduces.
    const finalPhaseAt = endsAt - 20_000
    const now = finalPhaseAt + 5_000
    expect(now).toBeLessThan(endsAt)
    const result = dispatch(
      ctx,
      state,
      {
        type: 'MISSION_ACTION',
        payload: {
          kind: 'COMMIT',
          choice: 'staged',
          commitSnapshot: commitSnapshotFrom(state),
        },
      },
      now,
    )
    // The final-phase beat emitted in this wake AND the commit settled completed.
    const events: EngineEvent[] = [...result.emitted]
    expect(events.some((e) => e.type === 'finaleFinalPhase')).toBe(true)
    const outcome = settledFinale(result.state)!
    expect(outcome.cause).toBe('completed')
    expect(outcome.metrics['committed_staged']).toBe(1)
    // Settled exactly once.
    expect(result.state.settled.filter((s) => s.missionId === FINALE_ID)).toHaveLength(1)
  })

  it('once committed, a timeout arriving in a later wake cannot override the committed recovery', () => {
    const { ctx, state } = certifiedFinale()
    const endsAt = state.activeMission!.endsAt
    // Commit the certified STAGED win in the final phase, before endsAt.
    const committed = dispatch(
      ctx,
      state,
      {
        type: 'MISSION_ACTION',
        payload: {
          kind: 'COMMIT',
          choice: 'staged',
          commitSnapshot: commitSnapshotFrom(state),
        },
      },
      endsAt - 10_000,
    )
    expect(settledFinale(committed.state)!.cause).toBe('completed')
    // Now cross the deadline; the timeout path finds the finale already settled.
    const crossed = advanceCampaign(ctx, committed.state, endsAt + 5_000)
    const outcome = settledFinale(crossed.state)!
    expect(outcome.cause).toBe('completed')
    expect(crossed.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
  })

  it('terminal() returns non-null the instant committed is set, in the same reduce', () => {
    const { ctx, state, startedAt } = startedFinale()
    // Without the final phase in play: a plain commit still settles in the same
    // dispatch, proving terminal() fires synchronously off the committed field.
    const committed = act(ctx, state, { kind: 'COMMIT', choice: 'hold' }, startedAt + 1_000)
    expect(committed.state.activeMission).toBeNull()
    expect(settledFinale(committed.state)).not.toBeNull()
  })
})

describe('finale settlement: persisted proved-slot metrics', () => {
  const SLOT_KEYS = [
    'proved_outlook',
    'proved_flights',
    'proved_bank',
    'proved_root',
    'proved_observation',
  ] as const

  it('a certified case persists one proved bit per filled slot at settlement', () => {
    const { ctx, state, startedAt } = startedFinale()
    // Corroborate the field report via the engine desk, land the reply, then
    // fill every slot and certify. The proved bits reflect the REAL
    // filled-and-validated slots, not the single case_valid flag.
    let current = dispatch(
      ctx,
      state,
      { type: 'REQUEST_SOURCE_CHECK', recordId: 'FR01' },
      startedAt + 500,
    ).state
    current = advanceCampaign(ctx, current, startedAt + 25_000).state
    const fills: Array<[string, string]> = [
      ['outlook', 'C17'],
      ['flights', 'F06'],
      ['bank', 'B04'],
      ['root', 'C17'],
      ['observation', 'FR01'],
    ]
    let now = startedAt + 26_000
    for (const [slot, recordId] of fills) {
      current = act(ctx, current, { kind: 'SELECT', slot, recordId }, now).state
      now += 1_000
    }
    current = act(ctx, current, { kind: 'REORDER', ordering: ['C17', 'F06', 'B04'] }, now).state
    now += 1_000
    current = act(
      ctx,
      current,
      { kind: 'VALIDATE', caseFile: caseFileFrom(current) },
      now,
    ).state
    expect(finaleState(current).caseValid).toBe(true)
    now += 1_000
    const committed = act(ctx, current, { kind: 'COMMIT', choice: 'staged' }, now).state
    const outcome = settledFinale(committed)!
    expect(outcome.metrics['case_valid']).toBe(1)
    for (const key of SLOT_KEYS) {
      expect(outcome.metrics[key]).toBe(1)
    }
  })

  it('an uncertified timeout persists every proved bit as zero', () => {
    const { ctx, state } = startedFinale()
    const endsAt = state.activeMission!.endsAt
    const timedOut = advanceCampaign(ctx, state, endsAt + 1_000)
    const outcome = settledFinale(timedOut.state)!
    expect(outcome.metrics['case_valid']).toBe(0)
    for (const key of SLOT_KEYS) {
      expect(outcome.metrics[key]).toBe(0)
    }
  })

  it('a filled slot on an uncertified case still persists a zero bit (the bit is gated on caseValid)', () => {
    const { ctx, state, startedAt } = startedFinale()
    const current = act(
      ctx,
      state,
      { kind: 'SELECT', slot: 'outlook', recordId: 'C17' },
      startedAt + 1_000,
    ).state
    // One slot is filled but the case never certified, so every proved bit is
    // zero: the persisted bit reflects filled-AND-validated, not filled alone.
    const committed = act(ctx, current, { kind: 'COMMIT', choice: 'hold' }, startedAt + 2_000).state
    const outcome = settledFinale(committed)!
    expect(outcome.metrics['case_valid']).toBe(0)
    expect(outcome.metrics['proved_outlook']).toBe(0)
  })
})

describe('finale settlement: comparisonsRun is display-only', () => {
  it('incrementing comparisonsRun causes no settlement or committed mutation', () => {
    const { ctx, state, startedAt } = startedFinale()
    let current = state
    let now = startedAt + 1_000
    for (let i = 0; i < 3; i += 1) {
      current = act(ctx, current, { kind: 'RUN_COMPARISON' }, now).state
      now += 1_000
    }
    const s = finaleState(current)
    expect(s.comparisonsRun).toBe(3)
    expect(s.committed).toBeNull()
    expect(current.settled.some((x) => x.missionId === FINALE_ID)).toBe(false)
    expect(current.activeMission).not.toBeNull()
  })
})

describe('finale settlement: save/load round trip', () => {
  it('FinaleState survives the saveSchema unchanged, including lastRejection and fieldReportRequested', () => {
    const { ctx, state, startedAt } = startedFinale()
    // Produce a rejection and request the field report, so both fields carry
    // non-default values.
    let current = act(
      ctx,
      state,
      { kind: 'REQUEST_FIELD_REPORT', caseFile: caseFileFrom(state) },
      startedAt + 500,
    ).state
    current = act(
      ctx,
      current,
      { kind: 'SELECT', slot: 'outlook', recordId: 'C17' },
      startedAt + 1_000,
    ).state
    current = act(
      ctx,
      current,
      { kind: 'VALIDATE', caseFile: caseFileFrom(current) },
      startedAt + 2_000,
    ).state
    const substate: FinaleState = finaleState(current)
    expect(substate.lastRejection).not.toBeNull()
    expect(substate.fieldReportRequested).toBe(true)
    const revived = v.parse(finaleSaveSchema, JSON.parse(JSON.stringify(substate)))
    expect(revived).toEqual(substate)
  })

  it('the saveSchema structurally rejects a smuggled authored string', () => {
    const { ctx, state, startedAt } = startedFinale()
    const substate = finaleState(
      act(ctx, state, { kind: 'SELECT', slot: 'root', recordId: 'C17' }, startedAt + 1_000).state,
    )
    expect(() =>
      v.parse(finaleSaveSchema, { ...(substate as object), body: ['SMUGGLED COPY'] }),
    ).toThrow()
  })
})
