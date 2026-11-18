// The three authored FREEZE BANK ACCOUNTS payloads and their per-seed anchor
// tables, one per curated seed. Mirrors flights/payloads.ts: the authored
// content lives here, the catalog imports it into missionPayloads.bank, and
// the content validator and the solvability tests read BANK_ANCHORS_BY_SEED.
//
// Every seed carries the same mechanical structure so all three pass the one
// validator and both surge sizing variants: ten accounts across the five
// flavors, eighteen requests including the one payroll duplicate pair and the
// one disputed request, four critical payments, three strictly-descending
// thresholds, and a per-tick prediction series whose unshifted line tracks at
// or below the base observed withdrawal stream while the hold-shifted line
// strictly exceeds it. Only the names, record ids, and run stamps change: the
// incident flavor differs (R04 restriction, K11 icing, T58 crosswind), the
// account names and request bodies are reworded, but the tuning numbers hold
// the solvability contract constant.
//
// Copy rules: uppercase terminal diction, no em-dashes, invented names only,
// reason lines in plain English since the debrief aggregates them.
import type { BankPayload, BankSeedAnchors } from './content'

/** The D-83 clue id the hold-justification record is designated for. This is
 *  the ledger-hold vector split 01 established (CLUE_IDS.ledgerHold in the
 *  catalog): inspecting the hold-justification record logs it. */
export const BANK_CLUE_ID = 'clue-d83-ledger-hold'

/** The shared mechanical tuning every seed reuses so the one validator and
 *  both surge variants pass unchanged. Names and bodies are layered on top
 *  per seed; these numbers are the solvability contract. */
interface BankSeedShape {
  readonly names: {
    readonly payrollNorth: string
    readonly payrollSouth: string
    readonly opsMain: string
    readonly opsAux: string
    readonly vendorHale: string
    readonly vendorOrr: string
    readonly municipalEld: string
    readonly municipalVane: string
    readonly depositorReeve: string
    readonly depositorAshe: string
  }
  /** The bank hold-justification record id this seed designates (B04 in seed
   *  one). Also the record the disputed request runs CHECK SOURCE against: this
   *  double duty is DELIBERATE. The same record is both the D-83 clue anchor
   *  (inspecting it logs the clue) and the disputed request's CONTRADICTED
   *  evidence (CHECK SOURCE disproves the hold basis). A future author must NOT
   *  assume these two roles are independent records; splitting them means
   *  updating both this field's wiring and the disputed request's recordId, and
   *  adding a second deskChecks row with a CONTRADICTED outcome. */
  readonly justificationRecordId: string
  readonly exerciseRootRecordId: string
  readonly runId: string
  /** The incident the hold cites, woven into the reason bodies for flavor. */
  readonly incidentLine: string
}

function buildBankPayload(shape: BankSeedShape): BankPayload {
  const n = shape.names
  return {
    accounts: [
      { id: 'PAY-NORTH', name: n.payrollNorth, flavor: 'STAFF PAYROLL POOL', flavorKind: 'payroll', openingBalance: 4000, limitEligible: false },
      { id: 'PAY-SOUTH', name: n.payrollSouth, flavor: 'STAFF PAYROLL POOL', flavorKind: 'payroll', openingBalance: 3000, limitEligible: false },
      { id: 'OPS-MAIN', name: n.opsMain, flavor: 'OPERATING EXPENSE', flavorKind: 'operating', openingBalance: 6000, limitEligible: true },
      { id: 'OPS-AUX', name: n.opsAux, flavor: 'OPERATING EXPENSE', flavorKind: 'operating', openingBalance: 5000, limitEligible: true },
      { id: 'VEN-HALE', name: n.vendorHale, flavor: 'VENDOR SETTLEMENT', flavorKind: 'vendor', openingBalance: 3500, limitEligible: true },
      { id: 'VEN-ORR', name: n.vendorOrr, flavor: 'VENDOR SETTLEMENT', flavorKind: 'vendor', openingBalance: 2500, limitEligible: false },
      { id: 'MUN-ELD', name: n.municipalEld, flavor: 'MUNICIPAL ACCOUNT', flavorKind: 'municipal', openingBalance: 4500, limitEligible: true },
      { id: 'MUN-VANE', name: n.municipalVane, flavor: 'MUNICIPAL ACCOUNT', flavorKind: 'municipal', openingBalance: 3200, limitEligible: false },
      { id: 'DEP-REEVE', name: n.depositorReeve, flavor: 'PRIME DEPOSITOR', flavorKind: 'depositor', openingBalance: 2800, limitEligible: false },
      { id: 'DEP-ASHE', name: n.depositorAshe, flavor: 'PRIME DEPOSITOR', flavorKind: 'depositor', openingBalance: 2200, limitEligible: false },
    ],
    requests: [
      { id: 'W01', accountId: 'DEP-REEVE', amount: 200, offsetSeconds: 20, reason: 'DEPOSITOR DRAWS AGAINST THE MORNING PANIC.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W02', accountId: 'VEN-HALE', amount: 150, offsetSeconds: 30, reason: 'VENDOR CLEARS AN INVOICE EARLY.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W03', accountId: 'PAY-NORTH', amount: 500, offsetSeconds: 40, reason: 'PAYROLL BATCH FILED BY THE NORTH DESK CLERK.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W04', accountId: 'MUN-ELD', amount: 250, offsetSeconds: 50, reason: 'MUNICIPAL TRANSFER ON ITS NORMAL SCHEDULE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W05', accountId: 'OPS-AUX', amount: 180, offsetSeconds: 55, reason: 'OPERATING SWEEP TO CLEAR A SUPPLIER.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W06', accountId: 'DEP-ASHE', amount: 300, offsetSeconds: 70, reason: 'DEPOSITOR WITHDRAWS AFTER THE RUMOR SPREADS.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W07', accountId: 'VEN-ORR', amount: 220, offsetSeconds: 80, reason: 'LOGISTICS VENDOR PULLS A SETTLEMENT FORWARD.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      // W08 is the one disputed request. Its disputeClaimBalance (9000) is an
      // OVER-claim strictly above MUN-VANE's opening balance (3200), is not
      // reachable from opening-balance-plus-any-prior-draw (no MUN-VANE request
      // precedes offset 90), and its recordId points at the justification
      // record whose desk outcome is CONTRADICTED. That record is also the D-83
      // clue anchor (see justificationRecordId above): the coupling is
      // deliberate, not an accident of reuse.
      { id: 'W08', accountId: 'MUN-VANE', amount: 400, offsetSeconds: 90, reason: `COUNTY DISPUTES A BALANCE IT NEVER HELD, CITING ${shape.incidentLine}.`, duplicateOfId: null, disputed: true, recordId: shape.justificationRecordId, disputeClaimBalance: 9000 },
      { id: 'W09', accountId: 'PAY-NORTH', amount: 500, offsetSeconds: 100, reason: 'PAYROLL BATCH FILED AGAIN BY THE SOUTH DESK SUPERVISOR.', duplicateOfId: 'W03', disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W10', accountId: 'OPS-MAIN', amount: 260, offsetSeconds: 110, reason: 'OPERATING ACCOUNT MEETS A STANDING ORDER.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W11', accountId: 'DEP-REEVE', amount: 250, offsetSeconds: 120, reason: 'DEPOSITOR TAKES A SECOND SLICE OF CASH.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W12', accountId: 'VEN-HALE', amount: 170, offsetSeconds: 130, reason: 'VENDOR CLEARS A LATE INVOICE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W13', accountId: 'MUN-ELD', amount: 300, offsetSeconds: 140, reason: 'MUNICIPAL PAYROLL RELIEF MOVES OUT.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W14', accountId: 'DEP-ASHE', amount: 280, offsetSeconds: 150, reason: 'DEPOSITOR DRAWS DOWN TO CASH.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W15', accountId: 'OPS-AUX', amount: 200, offsetSeconds: 160, reason: 'OPERATING SWEEP CONTINUES.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W16', accountId: 'VEN-ORR', amount: 190, offsetSeconds: 170, reason: 'VENDOR PULLS A FINAL SETTLEMENT.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W17', accountId: 'MUN-VANE', amount: 210, offsetSeconds: 180, reason: 'COUNTY CLEARS A ROUTINE TRANSFER.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
      { id: 'W18', accountId: 'DEP-REEVE', amount: 230, offsetSeconds: 190, reason: 'DEPOSITOR TAKES A LAST TRANCHE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
    ],
    payments: [
      { id: 'PM1', accountId: 'OPS-MAIN', amount: 900, dueOffsetSeconds: 95, confidenceBonus: 6, reason: 'OPERATING PAYROLL RUN MUST CLEAR.' },
      { id: 'PM2', accountId: 'VEN-HALE', amount: 700, dueOffsetSeconds: 125, confidenceBonus: 6, reason: 'VENDOR SETTLEMENT DUE TO THE SUPPLY DESK.' },
      { id: 'PM3', accountId: 'MUN-ELD', amount: 800, dueOffsetSeconds: 155, confidenceBonus: 6, reason: 'MUNICIPAL OBLIGATION DUE TO THE COUNTY.' },
      { id: 'PM4', accountId: 'OPS-AUX', amount: 650, dueOffsetSeconds: 185, confidenceBonus: 6, reason: 'OPERATING SETTLEMENT DUE AT CLOSE.' },
    ],
    broadHoldCount: 3,
    tickIntervalSeconds: 60,
    standardDurationSeconds: 240,
    confidenceDelta: {
      perHeldAccount: -3,
      perClearedPayment: 7,
      perSelectiveRelease: 2,
      cashBelowFloor: -8,
    },
    startingConfidence: 72,
    thresholds: [
      { value: 60, injected: [{ id: 'INJ-60', accountId: 'OPS-MAIN', baseAmount: 150, reason: 'CONTAGION DRAW AS CONFIDENCE SLIPS.' }] },
      { value: 45, injected: [{ id: 'INJ-45', accountId: 'VEN-HALE', baseAmount: 150, reason: 'CONTAGION DRAW DEEPENS.' }] },
      { value: 30, injected: [{ id: 'INJ-30', accountId: 'OPS-AUX', baseAmount: 150, reason: 'CONTAGION DRAW AT THE PANIC FLOOR.' }] },
    ],
    floor: 8000,
    collapseFloor: 0,
    target: 55,
    // One entry per REAL engine tick window (periodic ticks at 60/120/180 plus
    // the end tick at 240). The base observed stream per window is
    // [1280, 1930, 1350, 230]; each unshifted value tracks at or below its
    // window and the hold-shifted (plus 35 percent) value strictly exceeds it,
    // so W18 at offset 190 (the end-tick window) is covered, not dropped.
    predictionSeries: [1200, 1800, 1250, 220],
    holdShiftPercent: 35,
    introLines: [
      'DEPOSITOR CONFIDENCE IS THE PRESSURE HERE.',
      'HOLD TOO MUCH AND THE LINE YOU CITE BECOMES THE LINE YOU CAUSED.',
      'CLEAR THE FOUR CRITICAL PAYMENTS AND SETTLE ABOVE THE FLOOR.',
    ],
    tierThresholds: { full: 3, partial: 2, poor: 1 },
    paymentsDelayedTargetAccountId: 'DEP-REEVE',
    paymentsDelayedTable: { full: 0, partial: 6, poor: 12, failed: 18 },
  }
}

function anchorsFor(shape: BankSeedShape): BankSeedAnchors {
  return {
    runId: shape.runId,
    justificationRecordId: shape.justificationRecordId,
    exerciseRootRecordId: shape.exerciseRootRecordId,
    clueId: BANK_CLUE_ID,
    disputedRequestId: 'W08',
    payrollDuplicateFirstId: 'W03',
    payrollDuplicateSecondId: 'W09',
    requestCount: 18,
    paymentCount: 4,
  }
}

const SHAPE_R04: BankSeedShape = {
  names: {
    payrollNorth: 'NORTHWIND PAYROLL',
    payrollSouth: 'SOUTHGATE PAYROLL',
    opsMain: 'MERIDIAN OPERATING',
    opsAux: 'CALDERA OPERATING',
    vendorHale: 'HALE SUPPLY',
    vendorOrr: 'ORR LOGISTICS',
    municipalEld: 'ELDRIDGE MUNICIPAL',
    municipalVane: 'VANE COUNTY',
    depositorReeve: 'REEVE FAMILY TRUST',
    depositorAshe: 'ASHE HOLDINGS',
  },
  justificationRecordId: 'B04',
  exerciseRootRecordId: 'C17',
  runId: 'R04',
  incidentLine: 'THE ALL HUBS RESTRICTION',
}

const SHAPE_K11: BankSeedShape = {
  names: {
    payrollNorth: 'DAWNLINE PAYROLL',
    payrollSouth: 'HARROW PAYROLL',
    opsMain: 'KESTREL OPERATING',
    opsAux: 'LARKIN OPERATING',
    vendorHale: 'MABRY SUPPLY',
    vendorOrr: 'NOLAN FREIGHT',
    municipalEld: 'PRESCOTT MUNICIPAL',
    municipalVane: 'QUAIL DISTRICT',
    depositorReeve: 'RENWICK TRUST',
    depositorAshe: 'STRAND HOLDINGS',
  },
  justificationRecordId: 'H03',
  exerciseRootRecordId: 'A09',
  runId: 'K11',
  incidentLine: 'THE NATIONWIDE GROUND STOP',
}

const SHAPE_T58: BankSeedShape = {
  names: {
    payrollNorth: 'TALLOW PAYROLL',
    payrollSouth: 'UPTON PAYROLL',
    opsMain: 'VESPER OPERATING',
    opsAux: 'WREN OPERATING',
    vendorHale: 'YARROW SUPPLY',
    vendorOrr: 'ZEPHYR FREIGHT',
    municipalEld: 'ALDER MUNICIPAL',
    municipalVane: 'BRACKEN DISTRICT',
    depositorReeve: 'CORVIN TRUST',
    depositorAshe: 'DELMAR HOLDINGS',
  },
  justificationRecordId: 'K08',
  exerciseRootRecordId: 'E22',
  runId: 'T58',
  incidentLine: 'THE TOTAL TRAFFIC HALT',
}

export const BANK_PAYLOAD_R04: BankPayload = buildBankPayload(SHAPE_R04)
export const BANK_PAYLOAD_K11: BankPayload = buildBankPayload(SHAPE_K11)
export const BANK_PAYLOAD_T58: BankPayload = buildBankPayload(SHAPE_T58)

const BANK_ANCHORS_R04: BankSeedAnchors = anchorsFor(SHAPE_R04)
const BANK_ANCHORS_K11: BankSeedAnchors = anchorsFor(SHAPE_K11)
const BANK_ANCHORS_T58: BankSeedAnchors = anchorsFor(SHAPE_T58)

export const BANK_PAYLOAD_BY_SEED: Readonly<Record<string, BankPayload>> = {
  'exercise-r04': BANK_PAYLOAD_R04,
  'exercise-k11': BANK_PAYLOAD_K11,
  'exercise-t58': BANK_PAYLOAD_T58,
}

export const BANK_ANCHORS_BY_SEED: Readonly<Record<string, BankSeedAnchors>> = {
  'exercise-r04': BANK_ANCHORS_R04,
  'exercise-k11': BANK_ANCHORS_K11,
  'exercise-t58': BANK_ANCHORS_T58,
}
