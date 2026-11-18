// A minimal FREEZE BANK ACCOUNTS fixture: a handful of invented depositor
// accounts, a short withdrawal-wave stream, two critical payments, and a
// context builder that drives the REAL bank module through the engine. Not
// the authored three seeds; section 02 writes those. Names are invented, all
// copy is uppercase terminal diction, every number is a whole integer.
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import type {
  ClueRecordEntry,
  DeskCheckEntry,
  SeedDefinition,
} from '@engine/missions/types'
import { buildTestContext } from '@engine/testing'
import type { MissionModule } from '@engine/missions/types'
import * as v from 'valibot'
import {
  BANK_MISSION_ID,
  bankSchedule,
  makeBankMission,
} from '@engine/missions/bank/module'
import type { BankPayload } from '@engine/missions/bank/content'
import type { BankState } from '@engine/missions/bank/types'
import { FIXTURE_RECORDS } from '../../records/fixtures'

export const BANK_DURATION_MS = 240_000
export const BANK_T0 = 1_000_000

/** Five accounts. ANCHORA is the pinned paymentsDelayed target. BELROSE and
 *  CALDERA are limit-eligible. Confidence starts at 60; the floor is 2000 and
 *  the target is 55. Two critical payments, each from a specific account. */
export const FIXTURE_PAYLOAD: BankPayload = {
  accounts: [
    { id: 'ANCHORA', name: 'ANCHORA HOLDINGS', flavor: 'PRIME DEPOSITOR', openingBalance: 1000, limitEligible: false },
    { id: 'BELROSE', name: 'BELROSE TRUST', flavor: 'PENSION POOL', openingBalance: 1200, limitEligible: true },
    { id: 'CALDERA', name: 'CALDERA FUND', flavor: 'MONEY MARKET', openingBalance: 1500, limitEligible: true },
    { id: 'DORVEL', name: 'DORVEL ESTATE', flavor: 'FAMILY OFFICE', openingBalance: 800, limitEligible: false },
    { id: 'EMBER', name: 'EMBER MUTUAL', flavor: 'INSURER', openingBalance: 900, limitEligible: false },
  ],
  requests: [
    { id: 'W1', accountId: 'CALDERA', amount: 300, offsetSeconds: 30, reason: 'PANIC WAVE ONE.', duplicateOfId: null, disputed: false },
    { id: 'W2', accountId: 'BELROSE', amount: 400, offsetSeconds: 90, reason: 'PANIC WAVE TWO.', duplicateOfId: null, disputed: true },
    { id: 'W3', accountId: 'EMBER', amount: 200, offsetSeconds: 150, reason: 'PANIC WAVE THREE.', duplicateOfId: 'W1', disputed: false },
  ],
  payments: [
    { id: 'P1', accountId: 'ANCHORA', amount: 500, dueOffsetSeconds: 120, confidenceBonus: 10, reason: 'SETTLEMENT DUE ANCHORA.' },
    { id: 'P2', accountId: 'DORVEL', amount: 300, dueOffsetSeconds: 180, confidenceBonus: 10, reason: 'SETTLEMENT DUE DORVEL.' },
  ],
  broadHoldCount: 2,
  tickIntervalSeconds: 60,
  standardDurationSeconds: 240,
  confidenceDelta: {
    perHeldAccount: -8,
    perClearedPayment: 6,
    perSelectiveRelease: 2,
    cashBelowFloor: -10,
  },
  startingConfidence: 60,
  thresholds: [
    {
      value: 40,
      injected: [
        { id: 'INJ-40-A', accountId: 'EMBER', baseAmount: 150, reason: 'CONTAGION DRAW.' },
      ],
    },
  ],
  floor: 2000,
  collapseFloor: 0,
  target: 55,
  predictionSeries: [100, 200, 300, 400],
  holdShiftPercent: 50,
  introLines: ['DEPOSITORS ARE LINING UP.', 'HOLD THE LINE OR LOSE IT.'],
  tierThresholds: { full: 3, partial: 2, poor: 1 },
  paymentsDelayedTargetAccountId: 'ANCHORA',
  paymentsDelayedTable: { full: 0, partial: 6, poor: 12, failed: 18 },
}

export const BANK_CLUE_ID = 'clue-D-83'
/** The hold-justification record (B04), engine-owned as a clue record.
 *  Inspecting it logs D-83 with no mission involvement. */
export const JUSTIFICATION_RECORD_ID = 'B04'

const DESK_CHECKS: DeskCheckEntry[] = [
  { recordId: 'W02', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['DESK CONFIRMS'] },
]

const CLUE_RECORDS: ClueRecordEntry[] = [
  { recordId: JUSTIFICATION_RECORD_ID, clueId: BANK_CLUE_ID },
]

export function bankContext(
  payload: BankPayload = FIXTURE_PAYLOAD,
): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: FIXTURE_RECORDS,
    deskChecks: DESK_CHECKS,
    clueRecords: CLUE_RECORDS,
    missionPayloads: { [BANK_MISSION_ID]: payload },
    schedules: { [BANK_MISSION_ID]: [...bankSchedule(payload)] },
    missionDurationsMs: { [BANK_MISSION_ID]: BANK_DURATION_MS },
  }
  return buildTestContext(FIXTURE_RECORDS, overrides, {
    missions: { [BANK_MISSION_ID]: makeBankMission(payload) },
    missionOrder: [BANK_MISSION_ID],
  })
}

/** A minimal upstream mission that emits a REAL paymentsDelayed consequence
 *  on any non-full settlement, at an authored magnitude, so the bank's init
 *  fold receives the exact inbound kind it drains (not the test-double's
 *  commsDelayed). It forfeits trivially: start then FORFEIT yields failed and
 *  a paymentsDelayed consequence of the given magnitude. */
const upstreamSchema = v.strictObject({})

export function makePaymentsDelayedMission(
  id: string,
  magnitude: number,
): MissionModule<Record<string, never>> {
  return {
    id,
    init: () => ({}),
    validate: () => ({ valid: false, reason: 'NO ACTIONS' }),
    reduce: (state) => state,
    evaluate: (_state, cause) => ({
      missionId: id,
      cause,
      tier: 'failed',
      metrics: {},
      clueId: null,
      consequences: [
        { id: `cq-${id}`, kind: 'paymentsDelayed', magnitude },
      ],
    }),
    terminal: () => null,
    debrief: (outcome) => ({
      missionId: outcome.missionId,
      headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
      lines: [],
      clueId: null,
    }),
    saveSchema: upstreamSchema,
  }
}

/** A context with an upstream mission that emits a REAL paymentsDelayed
 *  consequence of `magnitude` ahead of bank, so the bank's init fold drains
 *  the exact kind it targets. Used to exercise init consequence application
 *  end-to-end (M4) and the derived-cash collapse path (the penalty can exceed
 *  the target balance). The default magnitude leaves the mission solvable; a
 *  large magnitude drives derived cash below the collapse floor. */
export function bankConsequenceContext(magnitude = 20): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: FIXTURE_RECORDS,
    deskChecks: DESK_CHECKS,
    clueRecords: CLUE_RECORDS,
    missionPayloads: {
      alpha: null,
      [BANK_MISSION_ID]: FIXTURE_PAYLOAD,
    },
    schedules: {
      alpha: [],
      [BANK_MISSION_ID]: [...bankSchedule(FIXTURE_PAYLOAD)],
    },
    missionDurationsMs: {
      alpha: BANK_DURATION_MS,
      [BANK_MISSION_ID]: BANK_DURATION_MS,
    },
  }
  return buildTestContext(FIXTURE_RECORDS, overrides, {
    missions: {
      alpha: makePaymentsDelayedMission('alpha', magnitude),
      [BANK_MISSION_ID]: makeBankMission(FIXTURE_PAYLOAD),
    },
    missionOrder: ['alpha', BANK_MISSION_ID],
  })
}

export function bankSub(state: CampaignState): BankState {
  return state.activeMission?.substate as BankState
}

/** A payload purpose-built to drive the DERIVED-CASH collapse path, distinct
 *  from the confidence-zero collapse. ANCHORA is the paymentsDelayed target
 *  with a small opening balance, so a capped upstream penalty drives it
 *  negative at init. The confidence deltas are zeroed so confidence never
 *  moves: any collapse here is purely a derived-cash collapse. broadHoldCount
 *  is high so holding one account never stamps a broad hold. */
export const COLLAPSE_PAYLOAD: BankPayload = {
  accounts: [
    { id: 'ANCHORA', name: 'ANCHORA HOLDINGS', flavor: 'PRIME DEPOSITOR', openingBalance: 30, limitEligible: false },
    { id: 'ZEPHYR', name: 'ZEPHYR TRUST', flavor: 'RESERVE POOL', openingBalance: 20, limitEligible: false },
  ],
  requests: [],
  payments: [
    { id: 'P1', accountId: 'ZEPHYR', amount: 5, dueOffsetSeconds: 120, confidenceBonus: 0, reason: 'SETTLEMENT DUE.' },
  ],
  broadHoldCount: 5,
  tickIntervalSeconds: 60,
  standardDurationSeconds: 240,
  confidenceDelta: {
    perHeldAccount: 0,
    perClearedPayment: 0,
    perSelectiveRelease: 0,
    cashBelowFloor: 0,
  },
  startingConfidence: 80,
  thresholds: [],
  floor: 0,
  collapseFloor: 0,
  target: 55,
  predictionSeries: [100, 200],
  holdShiftPercent: 50,
  introLines: ['RESERVES ARE THIN.'],
  tierThresholds: { full: 3, partial: 2, poor: 1 },
  paymentsDelayedTargetAccountId: 'ANCHORA',
  paymentsDelayedTable: { full: 0, partial: 6, poor: 12, failed: 18 },
}

/** A context whose upstream mission emits a paymentsDelayed of `magnitude`
 *  ahead of a bank running COLLAPSE_PAYLOAD. A magnitude above ANCHORA's
 *  opening balance drives ANCHORA (and, once ZEPHYR is held, derived cash)
 *  negative, tripping the derived-cash collapse. */
export function bankCashCollapseContext(magnitude: number): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: FIXTURE_RECORDS,
    deskChecks: DESK_CHECKS,
    clueRecords: CLUE_RECORDS,
    missionPayloads: {
      alpha: null,
      [BANK_MISSION_ID]: COLLAPSE_PAYLOAD,
    },
    schedules: {
      alpha: [],
      [BANK_MISSION_ID]: [...bankSchedule(COLLAPSE_PAYLOAD)],
    },
    missionDurationsMs: {
      alpha: BANK_DURATION_MS,
      [BANK_MISSION_ID]: BANK_DURATION_MS,
    },
  }
  return buildTestContext(FIXTURE_RECORDS, overrides, {
    missions: {
      alpha: makePaymentsDelayedMission('alpha', magnitude),
      [BANK_MISSION_ID]: makeBankMission(COLLAPSE_PAYLOAD),
    },
    missionOrder: ['alpha', BANK_MISSION_ID],
  })
}

export type Envelope = [CampaignAction, number]

export function missionAction(payload: Record<string, unknown>): CampaignAction {
  return { type: 'MISSION_ACTION', payload }
}

export function holdAct(accountId: string): CampaignAction {
  return missionAction({ kind: 'HOLD', accountId })
}
export function releaseAct(accountId: string): CampaignAction {
  return missionAction({ kind: 'RELEASE', accountId })
}
export function limitAct(accountId: string, cap: number): CampaignAction {
  return missionAction({ kind: 'LIMIT', accountId, cap })
}
export function payAct(paymentId: string): CampaignAction {
  return missionAction({ kind: 'PAY', paymentId })
}

export interface RunResult {
  readonly state: CampaignState
  readonly emitted: EngineEvent[]
}

export function drive(
  ctx: EngineContext,
  envelopes: Envelope[],
  settleAt: number | null = null,
): RunResult {
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
  const emitted: EngineEvent[] = []
  for (const [action, now] of envelopes) {
    const result = dispatch(ctx, state, action, now)
    state = result.state
    emitted.push(...result.emitted)
  }
  if (settleAt !== null) {
    const advanced = advanceCampaign(ctx, state, settleAt)
    state = advanced.state
    emitted.push(...advanced.emitted)
  }
  return { state, emitted }
}

export function start(t0 = BANK_T0): Envelope {
  return [{ type: 'START_MISSION', missionId: BANK_MISSION_ID }, t0]
}

export const SETTLE_AT = BANK_T0 + BANK_DURATION_MS + 1_000
