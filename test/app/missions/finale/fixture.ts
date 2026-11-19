// The GLOBAL FAILSAFE finale shell fixture: a real EngineContext with three
// test-double missions plus the real finale module registered under id 'finale',
// the finale FinalePayload placed on the seed's missionPayloads so the shell can
// read records / claimRunId / rootRecordId / fieldReportId, and helpers that
// drive the real engine through the app send() path to finale start and beyond.
// No engine is mocked. The record graph is the shared records fixture (C17 the
// exercise-export root, F06/B04 the subsystem derivatives, W02 the independent
// OBSERVED corroborator) plus the finale's FR01 field report and BC01 broken
// chain, mirroring the engine fixtures exactly.
import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
import type { EngineContext } from '@engine'
import type { CampaignState, SettledOutcome } from '@engine'
import type { SeedDefinition } from '@engine/missions/types'
import type { EvidenceRecord } from '@engine/records'
import { makeFinaleMission, finaleSchedule } from '@engine/missions/finale/module'
import type { FinalePayload } from '@engine/missions/finale/module'
import type { FinaleState } from '@engine/missions/finale/types'
import { FIXTURE_RECORDS } from '../../../engine/records/fixtures'
import { getState, send } from '@app/state'
import { act } from '@testing-library/react'

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
export const CLAIM_RUN_ID = 'R04'
export const ROOT_RECORD_ID = 'C17'
export const FIELD_REPORT_ID = 'FR01'
export const FINALE_DURATION_MS = 180_000
export const FR01_DEFAULT_DELAY_SECONDS = 20

const FINALE_PAYLOAD: FinalePayload = {
  records: FINALE_RECORDS,
  claimRunId: CLAIM_RUN_ID,
  rootRecordId: ROOT_RECORD_ID,
  fieldReportId: FIELD_REPORT_ID,
}

function seedOverrides(
  fieldReportDelaySeconds: number,
  extendedTime: boolean,
): Partial<SeedDefinition> {
  return {
    records: FINALE_RECORDS,
    deskChecks: [
      { recordId: 'W02', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['FIELD DESK CONFIRMS LOCAL SCOPE'] },
      { recordId: 'FR01', outcome: 'CONFIRMED', delaySeconds: fieldReportDelaySeconds, replyBody: ['FIELD DESK CONFIRMS: LOCAL DISRUPTION ONLY'] },
      { recordId: 'F06', outcome: 'UNKNOWN', delaySeconds: 15, replyBody: ['NO DESK RECORD'] },
      { recordId: 'B04', outcome: 'PENDING', delaySeconds: 15, replyBody: ['DESK QUEUE BACKED UP'] },
      { recordId: 'L09', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['RELAY DESK CONFIRMS AS RELAYED'] },
      { recordId: 'S11', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['SCENARIO TAP CONFIRMS'] },
      { recordId: 'BC01', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['RELAY DESK CONFIRMS BC01'] },
    ],
    clueRecords: [{ recordId: 'F06', clueId: 'clue-restriction' }],
    missionPayloads: { alpha: null, beta: null, gamma: null, finale: FINALE_PAYLOAD },
    schedules: { alpha: [], beta: [], gamma: [], finale: finaleSchedule(20) },
    missionDurationsMs: {
      alpha: 240_000,
      beta: 240_000,
      gamma: 240_000,
      finale: 180_000,
    },
    openExceptionsBaseline: extendedTime ? 12 : 12,
  }
}

export function makeFinaleCtx(
  fieldReportDelaySeconds: number = FR01_DEFAULT_DELAY_SECONDS,
  extendedTime = false,
): EngineContext {
  const base = buildTestContext(
    FINALE_RECORDS,
    seedOverrides(fieldReportDelaySeconds, extendedTime),
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

/** Read the live finale substate off the current store state. */
export function finaleSub(state: CampaignState = getState()): FinaleState {
  return state.activeMission?.substate as FinaleState
}

/** The settled finale outcome, or null. */
export function settledFinaleOf(
  state: CampaignState = getState(),
): SettledOutcome | null {
  return state.settled.find((s) => s.missionId === FINALE_ID) ?? null
}

/** Win and acknowledge a test-double mission through the real send() path. The
 *  Date.now spy supplies the clock; the caller advances it per action. */
function winAndAck(
  missionId: string,
  advanceTo: (ms: number) => void,
  base: number,
): void {
  advanceTo(base)
  act(() => {
    send({ type: 'START_MISSION', missionId })
  })
  for (let i = 1; i <= 3; i += 1) {
    advanceTo(base + i * 1_000)
    act(() => {
      send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    })
  }
  advanceTo(base + 4_000)
  act(() => {
    send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId })
  })
}

/** Drive the real engine (via send) through winning and acknowledging all three
 *  missions and then START the finale. advanceTo sets Date.now for each wake. */
export function startFinaleViaSend(advanceTo: (ms: number) => void, startAt = 1_000_000): void {
  winAndAck('alpha', advanceTo, startAt)
  winAndAck('beta', advanceTo, startAt + 300_000)
  winAndAck('gamma', advanceTo, startAt + 600_000)
  advanceTo(startAt + 900_000)
  act(() => {
    send({ type: 'START_MISSION', missionId: FINALE_ID })
  })
}

export const FINALE_START_AT = 1_900_000

export { FINALE_PAYLOAD }
