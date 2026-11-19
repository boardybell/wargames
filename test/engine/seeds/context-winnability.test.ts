// The derived-finale winnability guard. The app boots the engine-driven game
// via createProductionContext(seedName), which DERIVES the finale payload per
// catalog seed (the catalog ships missionPayloads.finale = null): the root
// record is the single EXERCISE-origin export, the claim run is the seed's
// exercise run, the field report is FINALE_FIELD_REPORT[name]. The app-root
// review verified by HAND that the derived finale is winnable for all three
// seeds, but nothing asserted it automatically. This suite drives each derived
// finale to the recovery ending (and a failure direction) through the REAL
// engine and the REAL finale module, so a future edit (a second EXERCISE
// record, a changed FINALE_FIELD_REPORT, a longer desk delay) that ships an
// unwinnable finale fails CI instead of passing green.
//
// No mocks: createProductionContext returns the production finale module, and
// corroboration flows through the real REQUEST_SOURCE_CHECK desk path, exactly
// as the shell drives it. Switching seeds via NEW_CAMPAIGN is covered by the
// describe.each: each seed builds its own production context and campaign.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { createProductionContext } from '@engine/seeds/context'
import {
  FINALE_FIELD_REPORT,
  FINALE_ID,
  SEED_CATALOG,
  SEED_NAMES,
} from '@engine/seeds/catalog'
import type { CaseFileCheck, FinaleState } from '@engine/missions/finale/types'

const T0 = 10_000_000

/** The derived winning case per seed: the EXERCISE root, the three subsystem
 *  records in true event-time order, and the designated field report as the
 *  observation. These mirror the seed graph exactly; the test asserts the
 *  engine agrees rather than trusting this table. */
const WINNING_CASE: Readonly<
  Record<string, { outlook: string; flights: string; bank: string; ordering: readonly string[] }>
> = {
  'exercise-r04': { outlook: 'C17', flights: 'F06', bank: 'B04', ordering: ['C17', 'F06', 'B04'] },
  'exercise-k11': { outlook: 'A09', flights: 'G12', bank: 'H03', ordering: ['A09', 'G12', 'H03'] },
  'exercise-t58': { outlook: 'E22', flights: 'J15', bank: 'K08', ordering: ['E22', 'J15', 'K08'] },
}

function settledFinale(state: CampaignState) {
  return state.settled.find((s) => s.missionId === FINALE_ID) ?? null
}

function finaleState(state: CampaignState): FinaleState {
  return state.activeMission?.substate as FinaleState
}

/** The live case-file reference facts the shell lifts from campaign selectors
 *  and threads into VALIDATE. Reference-only ids and typed codes. */
function caseFileFrom(state: CampaignState): {
  sourceChecks: CaseFileCheck[]
  inspectedRecords: string[]
} {
  return {
    sourceChecks: state.sourceChecks.map((c) => ({
      recordId: c.recordId,
      outcome: c.outcome,
      arrivedAfterSettlement: c.arrivedAfterSettlement,
    })),
    inspectedRecords: [...state.inspectedRecords],
  }
}

function act(
  ctx: EngineContext,
  state: CampaignState,
  payload: unknown,
  now: number,
): { state: CampaignState; rejection: unknown } {
  const result = dispatch(ctx, state, { type: 'MISSION_ACTION', payload }, now)
  return { state: result.state, rejection: result.rejection }
}

/** Start a fresh production campaign on the seed and START the finale directly.
 *  START_MISSION is gated on phase=menu and not-settled only (the finale unlock
 *  is a shell selector, not an engine gate), so this drives the real engine
 *  through makeFinaleMission(...).init() with the DERIVED payload. A
 *  content-invalid finale (desk delay past the bound) throws in init and the
 *  engine maps it to a MISSION INIT FAILED rejection, which this surfaces. */
function startFinale(ctx: EngineContext, seedName: string) {
  const state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
  const started = dispatch(
    ctx,
    state,
    { type: 'START_MISSION', missionId: FINALE_ID },
    T0,
  )
  return { state: started.state, rejection: started.rejection }
}

/** Corroborate the observation slot through the REAL desk: request the field
 *  report's source check, then advance past its authored delay so the reply
 *  lands and corroborates. Then fill the five slots and claim the event-time
 *  ordering, returning the live state poised to validate true. */
function fillCorrectCase(
  ctx: EngineContext,
  state: CampaignState,
  rootId: string,
  fieldReportId: string,
  plan: { outlook: string; flights: string; bank: string; ordering: readonly string[] },
): CampaignState {
  let current = dispatch(
    ctx,
    state,
    { type: 'REQUEST_SOURCE_CHECK', recordId: fieldReportId },
    T0 + 500,
  ).state
  // The real R21/R33/R47 desk delay is 45s; advance well past it so the reply
  // lands, still far inside the 180s finale minus the 60s decision margin.
  current = advanceCampaign(ctx, current, T0 + 60_000).state
  const fills: Array<[string, string]> = [
    ['outlook', plan.outlook],
    ['flights', plan.flights],
    ['bank', plan.bank],
    ['root', rootId],
    ['observation', fieldReportId],
  ]
  let now = T0 + 61_000
  for (const [slot, recordId] of fills) {
    current = act(ctx, current, { kind: 'SELECT', slot, recordId }, now).state
    now += 1_000
  }
  current = act(ctx, current, { kind: 'REORDER', ordering: plan.ordering }, now).state
  return current
}

describe.each(SEED_NAMES)('derived-finale winnability: %s', (seedName) => {
  const rootByName: Readonly<Record<string, string>> = {
    'exercise-r04': 'C17',
    'exercise-k11': 'A09',
    'exercise-t58': 'E22',
  }
  const expectedRoot = rootByName[seedName]!
  const fieldReportId = FINALE_FIELD_REPORT[seedName]!
  const plan = WINNING_CASE[seedName]!

  it('the catalog seed ships finale payload null (the context derives it)', () => {
    expect(SEED_CATALOG[seedName]!.missionPayloads.finale).toBeNull()
  })

  it('createProductionContext starts the finale: init does not throw the bounded-wait gate', () => {
    const ctx = createProductionContext(seedName)
    const { state, rejection } = startFinale(ctx, seedName)
    // A thrown init maps to MISSION INIT FAILED; a clean start has no rejection
    // and an active finale substate.
    expect(rejection).toBeNull()
    expect(state.activeMission?.missionId).toBe(FINALE_ID)
    const fs = finaleState(state)
    expect(fs.committed).toBeNull()
    expect(fs.caseValid).toBe(false)
  })

  it('the derived root is the single EXERCISE-origin export', () => {
    const ctx = createProductionContext(seedName)
    const finale = ctx.seeds[seedName]!.missionPayloads[FINALE_ID] as {
      rootRecordId: string
      claimRunId: string
      fieldReportId: string
    }
    expect(finale.rootRecordId).toBe(expectedRoot)
    expect(finale.fieldReportId).toBe(fieldReportId)
    expect(finale.claimRunId).toBe(SEED_CATALOG[seedName]!.exerciseRunId)
  })

  it('the derived case validates true: EXERCISE root plus corroborated field report', () => {
    const ctx = createProductionContext(seedName)
    const { state } = startFinale(ctx, seedName)
    const ready = fillCorrectCase(ctx, state, expectedRoot, fieldReportId, plan)
    const validated = act(
      ctx,
      ready,
      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
      T0 + 70_000,
    ).state
    const fs = finaleState(validated)
    // If this is false, the DERIVED payload does not validate: a real
    // integration bug in context.ts or the catalog, not a test to weaken.
    expect(fs.caseValid).toBe(true)
    expect(fs.lastRejection).toBeNull()
  })

  it('STAGED RECOVERY: the derived valid case commits staged to the recovery ending / completed', () => {
    const ctx = createProductionContext(seedName)
    const { state } = startFinale(ctx, seedName)
    const ready = fillCorrectCase(ctx, state, expectedRoot, fieldReportId, plan)
    const validated = act(
      ctx,
      ready,
      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
      T0 + 70_000,
    ).state
    expect(finaleState(validated).caseValid).toBe(true)
    const committed = act(
      ctx,
      validated,
      { kind: 'COMMIT', choice: 'staged' },
      T0 + 71_000,
    ).state
    const outcome = settledFinale(committed)!
    expect(outcome).not.toBeNull()
    expect(outcome.cause).toBe('completed')
    expect(outcome.endingId).toBe('recovery')
    expect(outcome.metrics['committed_staged']).toBe(1)
    expect(outcome.metrics['case_valid']).toBe(1)
    // The settled finale is the active mission no longer; the campaign settled.
    expect(committed.activeMission).toBeNull()
  })

  it('the derived case also wins HOLD (containment / completed)', () => {
    const ctx = createProductionContext(seedName)
    const { state } = startFinale(ctx, seedName)
    const ready = fillCorrectCase(ctx, state, expectedRoot, fieldReportId, plan)
    const validated = act(
      ctx,
      ready,
      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
      T0 + 70_000,
    ).state
    const committed = act(
      ctx,
      validated,
      { kind: 'COMMIT', choice: 'hold' },
      T0 + 71_000,
    ).state
    const outcome = settledFinale(committed)!
    expect(outcome.cause).toBe('completed')
    expect(outcome.endingId).toBe('containment')
  })

  it('REPEAT settles collapsed to failure (the opposite direction is proven)', () => {
    const ctx = createProductionContext(seedName)
    const { state } = startFinale(ctx, seedName)
    const ready = fillCorrectCase(ctx, state, expectedRoot, fieldReportId, plan)
    const validated = act(
      ctx,
      ready,
      { kind: 'VALIDATE', caseFile: caseFileFrom(ready) },
      T0 + 70_000,
    ).state
    const committed = act(
      ctx,
      validated,
      { kind: 'COMMIT', choice: 'repeat' },
      T0 + 71_000,
    ).state
    const outcome = settledFinale(committed)!
    expect(outcome.cause).toBe('collapsed')
    expect(outcome.endingId).toBe('failure')
  })

  it('a timeout with no commit settles failure (the countdown direction is proven)', () => {
    const ctx = createProductionContext(seedName)
    const { state } = startFinale(ctx, seedName)
    const endsAt = state.activeMission!.endsAt
    const timedOut = advanceCampaign(ctx, state, endsAt + 1_000)
    const outcome = settledFinale(timedOut.state)!
    expect(outcome.cause).toBe('timeout')
    expect(outcome.tier).toBe('failed')
    expect(outcome.endingId).toBe('failure')
  })
})
