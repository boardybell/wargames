// A minimal in-test FREEZE BANK ACCOUNTS fixture for the shell screens. A
// handful of accounts, a few authored withdrawal requests, a couple of critical
// payments, one confidence threshold with an injected withdrawal, and a short
// prediction series. This is NOT an authored seed (section 02 writes those); the
// screens render whatever payload is active, so a small payload that satisfies
// the section-01 BankPayload type proves every view. The content validator does
// not run here (it is a section-02 content test), so the payload need not carry
// the authored ten accounts or the designated clue graph; it only has to init
// and reduce through the real module.
//
// B04 is the DERIVED hold-justification record, engine-owned as a clue record:
// inspecting it logs the clue with no mission involvement. F06 is the OBSERVED
// field report a CHECK SOURCE resolves against, so TRACE and CHECK SOURCE have
// real records and real desk answers to resolve against.
import type { CampaignState, EngineContext, EvidenceRecord, SeedDefinition } from '@engine'
import type { ClueRecordEntry, DeskCheckEntry } from '@engine/missions/types'
import { buildTestContext } from '@engine/testing'
import {
  BANK_MISSION_ID,
  bankSchedule,
  makeBankMission,
} from '@engine/missions/bank/module'
import type { BankPayload } from '@engine/missions/bank/content'
import type { BankState } from '@engine/missions/bank/types'

export const BANK_DURATION_MS = 240_000
export const BANK_CLUE_ID = 'clue-D-83'
/** The DERIVED hold-justification record (B04 equivalent), engine-owned as a
 *  clue record. Inspecting it logs the clue with no mission involvement. */
export const JUSTIFICATION_RECORD_ID = 'B04'
/** The OBSERVED field report a CHECK SOURCE on the disputed request resolves
 *  against. */
export const FIELD_REPORT_RECORD_ID = 'F06'

export const BANK_FIXTURE_RECORDS: EvidenceRecord[] = [
  {
    id: 'C17',
    origin: 'EXERCISE',
    sourceId: 'D83-EXPORT',
    parentId: null,
    runId: 'R04',
    eventTime: 76440,
    receiptTime: 76445,
    subsystem: 'bank',
    body: ['EXERCISE SHUTDOWN ADVISORY PUBLISHED TO ACTIVE FEED'],
  },
  {
    id: 'B04',
    origin: 'DERIVED',
    sourceId: 'HOLD-DESK',
    parentId: 'C17',
    runId: 'R04',
    eventTime: 76448,
    receiptTime: 76492,
    subsystem: 'bank',
    body: ['EMERGENCY HOLD NOTICE PER C17. ASSUMES SYSTEM-WIDE SHUTDOWN.'],
  },
  {
    id: 'F06',
    origin: 'OBSERVED',
    sourceId: 'FIELD-DESK',
    parentId: null,
    runId: null,
    eventTime: 76455,
    receiptTime: 76460,
    subsystem: 'bank',
    body: ['FIELD DESK: OPERATING ACCOUNT BALANCE AS BOOKED. NO CONTRADICTION.'],
  },
]

/** Desk-check answers. B04 comes back CONTRADICTED (the hold justification
 *  launders R04 provenance); F06 comes back CONFIRMED. delaySeconds is small so
 *  a single advance resolves a CHECK SOURCE. */
export const BANK_DESK_CHECKS: DeskCheckEntry[] = [
  {
    recordId: 'B04',
    outcome: 'CONTRADICTED',
    delaySeconds: 5,
    replyBody: ['NO INDEPENDENT SOURCE. RELAYED FROM THE EXERCISE ROOT ONLY.'],
  },
  {
    recordId: 'F06',
    outcome: 'CONFIRMED',
    delaySeconds: 5,
    replyBody: ['FIELD DESK CORROBORATES. OBSERVED AND INDEPENDENT.'],
  },
]

export const BANK_CLUE_RECORDS: ClueRecordEntry[] = [
  { recordId: JUSTIFICATION_RECORD_ID, clueId: BANK_CLUE_ID },
]

/** Four accounts in a fixed authored order. PAYROLL and OPERATING are unlimited;
 *  VENDOR is limit-eligible so LIMIT can be exercised; MUNICIPAL is limit-
 *  eligible and funds the municipal payment. Balances are small, round integers.
 *  broadHoldCount is 0 so the FIRST hold stamps the broad hold (and the WOPR
 *  predicted line shifts up in that same render), which keeps the predicted-
 *  line-moves-on-HOLD test to a single action. */
export const BANK_FIXTURE_PAYLOAD: BankPayload = {
  accounts: [
    { id: 'A-PAY', name: 'PAYROLL CLEARING', flavor: 'STAFF WAGES', flavorKind: 'payroll', openingBalance: 40_000, limitEligible: true },
    { id: 'A-OPS', name: 'OPERATING CASH', flavor: 'DAY TO DAY', flavorKind: 'operating', openingBalance: 60_000, limitEligible: false },
    { id: 'A-VEND', name: 'VENDOR ESCROW', flavor: 'SUPPLIER FLOAT', flavorKind: 'vendor', openingBalance: 30_000, limitEligible: true },
    { id: 'A-MUNI', name: 'MUNICIPAL DEPOSIT', flavor: 'CITY FUNDS', flavorKind: 'municipal', openingBalance: 50_000, limitEligible: true },
  ],
  requests: [
    { id: 'R-1', accountId: 'A-OPS', amount: 5_000, offsetSeconds: 20, reason: 'DEPOSITOR WITHDRAWAL. ROUTINE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
    { id: 'R-2', accountId: 'A-VEND', amount: 4_000, offsetSeconds: 40, reason: 'SUPPLIER DRAW AGAINST ESCROW.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
    { id: 'R-DISP', accountId: 'A-OPS', amount: 8_000, offsetSeconds: 60, reason: 'DISPUTED. CLAIMED BALANCE DOES NOT MATCH THE LEDGER.', duplicateOfId: null, disputed: true, recordId: FIELD_REPORT_RECORD_ID, disputeClaimBalance: 999 },
  ],
  payments: [
    { id: 'P-PAY', accountId: 'A-PAY', amount: 10_000, dueOffsetSeconds: 120, confidenceBonus: 5, reason: 'STAFF PAYROLL. DUE THIS CYCLE.' },
    { id: 'P-MUNI', accountId: 'A-MUNI', amount: 12_000, dueOffsetSeconds: 180, confidenceBonus: 5, reason: 'MUNICIPAL REMITTANCE.' },
  ],
  broadHoldCount: 0,
  tickIntervalSeconds: 30,
  standardDurationSeconds: 240,
  confidenceDelta: {
    perHeldAccount: -4,
    perClearedPayment: 6,
    perSelectiveRelease: 2,
    cashBelowFloor: -5,
  },
  startingConfidence: 70,
  thresholds: [
    {
      value: 50,
      injected: [
        { id: 'INJ-1', accountId: 'A-OPS', baseAmount: 9_000, reason: 'CONTAGION DRAW TRIGGERED BY FALLING CONFIDENCE.' },
      ],
    },
  ],
  floor: 20_000,
  collapseFloor: 0,
  target: 60,
  predictionSeries: [1_000, 1_000, 1_000, 1_000],
  holdShiftPercent: 35,
  introLines: [
    'FREEZE BANK ACCOUNTS',
    'HOLD TOO MUCH AND WOPR CALLS IT RESOLVED WHILE THE BANK FAILS.',
    'CLEAR THE CRITICAL PAYMENTS. KEEP CASH ABOVE THE FLOOR.',
  ],
  tierThresholds: { full: 3, partial: 2, poor: 1 },
  paymentsDelayedTargetAccountId: 'A-OPS',
  paymentsDelayedTable: { full: 0, partial: 5_000, poor: 10_000, failed: 15_000 },
}

/** Build an EngineContext over the fixture payload, records, desk checks, and
 *  clue record, registering only the bank mission. Mirrors the engine module
 *  test's buildTestContext usage exactly. */
export function makeBankCtx(
  payload: BankPayload = BANK_FIXTURE_PAYLOAD,
): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    records: BANK_FIXTURE_RECORDS,
    deskChecks: BANK_DESK_CHECKS,
    clueRecords: BANK_CLUE_RECORDS,
    missionPayloads: { [BANK_MISSION_ID]: payload },
    schedules: { [BANK_MISSION_ID]: [...bankSchedule(payload)] },
    missionDurationsMs: { [BANK_MISSION_ID]: BANK_DURATION_MS },
  }
  return buildTestContext(BANK_FIXTURE_RECORDS, overrides, {
    missions: { [BANK_MISSION_ID]: makeBankMission(payload) },
    missionOrder: [BANK_MISSION_ID],
  })
}

/** Read the live bank substate off a campaign state. */
export function bankSub(state: CampaignState): BankState {
  return state.activeMission?.substate as BankState
}
