import type { EvidenceRecord } from '@engine/records'

// In-test fixture graph modeled on the canonical seed shape. Times are
// story seconds-of-day: 21:14:00 is 76440.
export const C17: EvidenceRecord = {
  id: 'C17',
  origin: 'EXERCISE',
  sourceId: 'D83-EXPORT',
  parentId: null,
  runId: 'R04',
  eventTime: 76440,
  receiptTime: 76445,
  subsystem: 'outlook',
  body: ['PREVIEW GROUNDING ADVISORY PUBLISHED TO ACTIVE FEED'],
}

export const F06: EvidenceRecord = {
  id: 'F06',
  origin: 'DERIVED',
  sourceId: 'FLIGHT-CONTROL',
  parentId: 'C17',
  runId: 'R04',
  eventTime: 76448,
  receiptTime: 76492,
  subsystem: 'flights',
  body: ['ALL HUBS RESTRICTION PER C17'],
}

export const B04: EvidenceRecord = {
  id: 'B04',
  origin: 'DERIVED',
  sourceId: 'BANK-OPS',
  parentId: 'F06',
  runId: 'R04',
  eventTime: 76461,
  receiptTime: 76470,
  subsystem: 'bank',
  body: ['EMERGENCY HOLD: SYSTEM-WIDE SHUTDOWN ASSUMED PER F06'],
}

export const W02: EvidenceRecord = {
  id: 'W02',
  origin: 'OBSERVED',
  sourceId: 'FIELD-NW',
  parentId: null,
  runId: null,
  eventTime: 76455,
  receiptTime: 76460,
  subsystem: 'flights',
  body: ['LOCAL WEATHER WARNING: NORTHWEST CORRIDOR ONLY'],
}

// OBSERVED label with tainted ancestry: launders the R04 claim.
export const L09: EvidenceRecord = {
  id: 'L09',
  origin: 'OBSERVED',
  sourceId: 'RELAY-DESK',
  parentId: 'F06',
  runId: null,
  eventTime: 76500,
  receiptTime: 76505,
  subsystem: 'flights',
  body: ['CONFIRMING RESTRICTION AS RELAYED'],
}

// Directly stamped with the run despite OBSERVED origin.
export const S11: EvidenceRecord = {
  id: 'S11',
  origin: 'OBSERVED',
  sourceId: 'SCENARIO-TAP',
  parentId: null,
  runId: 'R04',
  eventTime: 76502,
  receiptTime: 76507,
  subsystem: 'outlook',
  body: ['SCENARIO FEED OBSERVATION'],
}

// EXERCISE origin WITHOUT the claim run stamp: the case the plan's
// suggested codes would have misread as independent.
export const E01: EvidenceRecord = {
  id: 'E01',
  origin: 'EXERCISE',
  sourceId: 'D83-EXPORT',
  parentId: null,
  runId: null,
  eventTime: 76490,
  receiptTime: 76495,
  subsystem: 'outlook',
  body: ['EXERCISE SIDE CHANNEL, UNSTAMPED'],
}

// Both a direct run stamp AND tainted ancestry: pins stamp-over-ancestry.
export const P13: EvidenceRecord = {
  id: 'P13',
  origin: 'OBSERVED',
  sourceId: 'RELAY-DESK',
  parentId: 'F06',
  runId: 'R04',
  eventTime: 76510,
  receiptTime: 76515,
  subsystem: 'bank',
  body: ['STAMPED RELAY OF THE RESTRICTION'],
}

export const FIXTURE_RECORDS: EvidenceRecord[] = [
  C17,
  F06,
  B04,
  W02,
  L09,
  S11,
  E01,
  P13,
]
