// Finale test fixtures: a real engine context with three test-double
// missions plus the finale module registered under id 'finale', driven
// through the real dispatch. The record graph is the shared records fixture
// (C17 the exercise-export root, F06/B04 the subsystem derivatives, W02 the
// independent OBSERVED corroborator, plus the taint cases). Campaign facts the
// finale reads (sourceChecks, inspectedRecords) are produced by real dispatch,
// never hand-stitched.
import type { EngineContext } from '@engine/campaign/engine'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import type { SeedDefinition } from '@engine/missions/types'
import type { EvidenceRecord } from '@engine/records'
import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
import { makeFinaleMission, finaleSchedule } from '@engine/missions/finale/module'
import type { FinalePayload } from '@engine/missions/finale/module'
import type { FinaleState } from '@engine/missions/finale/types'
import type { CaseFileCheck } from '@engine/missions/finale/types'
import { FIXTURE_RECORDS } from '../../records/fixtures'

// The designated finale field report (amendment 12): an OBSERVED, independent
// record distinct from the in-play corroborator W02, desk-answerable inside the
// bounded wait. Added locally so the shared records fixture stays untouched.
export const FR01: EvidenceRecord = {
  id: 'FR01',
  origin: 'OBSERVED',
  sourceId: 'FIELD-DESK',
  parentId: null,
  runId: null,
  eventTime: 76520,
  receiptTime: 76530,
  subsystem: 'flights',
  body: ['FIELD REPORT ON SCOPE: LOCAL DISRUPTION ONLY'],
}

// A corrupted derivative: OBSERVED-labelled but parented on an id that does
// not resolve in the graph, so isIndependentObservation walks into a dangling
// edge and returns BROKEN_CHAIN. Offered as the observation it must read as
// derived-not-independent (the chain never clears to an independent origin),
// never as unrelated-source. Added locally so the shared fixture stays
// untouched.
export const BC01: EvidenceRecord = {
  id: 'BC01',
  origin: 'OBSERVED',
  sourceId: 'RELAY-DESK',
  parentId: 'GHOST-PARENT',
  runId: null,
  eventTime: 76540,
  receiptTime: 76545,
  subsystem: 'flights',
  body: ['RELAY WITH A PARENT THAT DOES NOT RESOLVE'],
}

export const FINALE_RECORDS: EvidenceRecord[] = [...FIXTURE_RECORDS, FR01, BC01]

export const MISSIONS = ['alpha', 'beta', 'gamma'] as const
export const FINALE_ID = 'finale'

/** The exercise run the whole fixture graph is stamped with (R04) and the
 *  parent-chain root (C17's exercise export). The designated field-report
 *  record is FR01, a dedicated OBSERVED record the player can request, distinct
 *  from the in-play corroborator W02. */
export const CLAIM_RUN_ID = 'R04'
export const ROOT_RECORD_ID = 'C17'
/** The finale field report: FR01, an OBSERVED, independent record distinct
 *  from the in-play corroborator W02. Its desk reply corroborates the
 *  observation slot. */
export const FIELD_REPORT_ID = 'FR01'

const FINALE_PAYLOAD: FinalePayload = {
  records: FINALE_RECORDS,
  claimRunId: CLAIM_RUN_ID,
  rootRecordId: ROOT_RECORD_ID,
  fieldReportId: FIELD_REPORT_ID,
}

/** The default FR01 field-report desk delay (seconds): 20s, well inside the
 *  bound (durationMs 180_000 minus the 60_000 margin = 120_000ms). The H1
 *  reject test raises this past the bound to prove construction rejects it. */
export const FR01_DEFAULT_DELAY_SECONDS = 20

function seedOverrides(
  fieldReportDelaySeconds: number,
): Partial<SeedDefinition> {
  return {
  records: FINALE_RECORDS,
  deskChecks: [
    {
      recordId: 'W02',
      outcome: 'CONFIRMED',
      delaySeconds: 20,
      replyBody: ['FIELD DESK CONFIRMS LOCAL SCOPE'],
    },
    {
      recordId: 'FR01',
      outcome: 'CONFIRMED',
      delaySeconds: fieldReportDelaySeconds,
      replyBody: ['FIELD DESK CONFIRMS: LOCAL DISRUPTION ONLY'],
    },
    {
      recordId: 'F06',
      outcome: 'UNKNOWN',
      delaySeconds: 15,
      replyBody: ['NO DESK RECORD'],
    },
    {
      recordId: 'B04',
      outcome: 'PENDING',
      delaySeconds: 15,
      replyBody: ['DESK QUEUE BACKED UP'],
    },
    {
      recordId: 'L09',
      outcome: 'CONFIRMED',
      delaySeconds: 20,
      replyBody: ['RELAY DESK CONFIRMS AS RELAYED'],
    },
    {
      recordId: 'S11',
      outcome: 'CONFIRMED',
      delaySeconds: 20,
      replyBody: ['SCENARIO TAP CONFIRMS'],
    },
    {
      recordId: 'BC01',
      outcome: 'CONFIRMED',
      delaySeconds: 20,
      replyBody: ['RELAY DESK CONFIRMS BC01'],
    },
  ],
  clueRecords: [{ recordId: 'F06', clueId: 'clue-restriction' }],
  // Standard finale is three minutes (180_000 ms); finaleFinalPhase sits 20s
  // before endsAt. A field report requested at first legality resolves in 20s
  // (well inside finaleDuration minus the 60s decision margin).
  schedules: {
    alpha: [],
    beta: [],
    gamma: [],
    finale: finaleSchedule(20),
  },
  missionDurationsMs: {
    alpha: 240_000,
    beta: 240_000,
    gamma: 240_000,
    finale: 180_000,
  },
  }
}

export const FINALE_DURATION_MS = 180_000
// Single source of truth: the margin is the module's constant, re-exported so
// the field-report slack and reject tests bound against the same number the
// validator enforces.
export { FINALE_DECISION_MARGIN_MS } from '@engine/missions/finale/caseBuilder'

export function makeFinaleContext(
  fieldReportDelaySeconds: number = FR01_DEFAULT_DELAY_SECONDS,
): EngineContext {
  const base = buildTestContext(
    FINALE_RECORDS,
    seedOverrides(fieldReportDelaySeconds),
  )
  return {
    ...base,
    missions: {
      alpha: makeTestDoubleMission('alpha'),
      beta: makeTestDoubleMission('beta'),
      gamma: makeTestDoubleMission('gamma'),
      finale: makeFinaleMission(FINALE_PAYLOAD),
    },
    missionOrder: [...MISSIONS],
  }
}

/** Play a test-double mission to full and acknowledge its debrief, so the
 *  finale unlock (all three debriefs acknowledged) is reachable. */
export function winAndAck(
  ctx: EngineContext,
  state: CampaignState,
  missionId: string,
  startAt: number,
): CampaignState {
  const envelopes: Array<[CampaignAction, number]> = [
    [{ type: 'START_MISSION', missionId }, startAt],
    [{ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, startAt + 1_000],
    [{ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, startAt + 2_000],
    [{ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, startAt + 3_000],
    [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, startAt + 4_000],
  ]
  let current = state
  for (const [action, now] of envelopes) {
    current = dispatch(ctx, current, action, now).state
  }
  return current
}

export interface FinaleFixture {
  readonly ctx: EngineContext
  readonly state: CampaignState
  readonly startedAt: number
}

/** A campaign with all three missions won and acknowledged and the finale
 *  started. Returns the context and the live state at finale start. */
export function startedFinale(startAt = 1_000_000): FinaleFixture {
  const ctx = makeFinaleContext()
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, startAt)
  state = winAndAck(ctx, state, 'alpha', startAt)
  state = winAndAck(ctx, state, 'beta', startAt + 300_000)
  state = winAndAck(ctx, state, 'gamma', startAt + 600_000)
  const finaleStart = startAt + 900_000
  const started = dispatch(
    ctx,
    state,
    { type: 'START_MISSION', missionId: FINALE_ID },
    finaleStart,
  )
  return { ctx, state: started.state, startedAt: finaleStart }
}

/** Drive the real engine to the finale START with a custom FR01 desk delay and
 *  return the raw START dispatch result, so a test can assert whether
 *  construction (module.init) accepted or rejected the authored bound. */
export function startFinaleWithDelay(
  fieldReportDelaySeconds: number,
  startAt = 1_000_000,
): { result: ReturnType<typeof dispatch>; startedAt: number } {
  const ctx = makeFinaleContext(fieldReportDelaySeconds)
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, startAt)
  state = winAndAck(ctx, state, 'alpha', startAt)
  state = winAndAck(ctx, state, 'beta', startAt + 300_000)
  state = winAndAck(ctx, state, 'gamma', startAt + 600_000)
  const finaleStart = startAt + 900_000
  const result = dispatch(
    ctx,
    state,
    { type: 'START_MISSION', missionId: FINALE_ID },
    finaleStart,
  )
  return { result, startedAt: finaleStart }
}

/** Read the live finale substate. */
export function finaleState(state: CampaignState): FinaleState {
  return state.activeMission?.substate as FinaleState
}

/** The live case-file reference facts the shell lifts from campaign selectors
 *  and threads into VALIDATE / REQUEST FIELD REPORT. Reference-only. */
export function caseFileFrom(state: CampaignState): {
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

/** Dispatch a finale MISSION_ACTION and return the next state. */
export function act(
  ctx: EngineContext,
  state: CampaignState,
  payload: unknown,
  now: number,
): { state: CampaignState; emitted: readonly EngineEvent[] } {
  const result = dispatch(ctx, state, { type: 'MISSION_ACTION', payload }, now)
  return { state: result.state, emitted: result.emitted }
}

export { advanceCampaign, dispatch, createCampaign }
