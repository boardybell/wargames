// Three golden campaign fixtures for the finale projections and endings,
// each FinaleSnapshot built from the REAL settled-outcome metrics the three
// missions produce through the live engine (captured from their own
// walkthrough / adversarial / defensive fixtures, not hand-invented):
//
//   healthyCampaign            all three missions settled clean (wopr 0, cost 0)
//   capacityConstrainedCampaign  outlook adversarial + bank do-nothing,
//                                flights clean: mixed, tight metrics, staged
//                                still viable
//   allFailedCampaign          outlook adversarial + bank do-nothing +
//                              flights grounded: aggregate service_cost breaks
//                              the viability bound, staged not viable
//
// The per-mission metric objects below are verbatim real end states (seed
// exercise-r04) so the golden projection and viability vectors are pinned to
// true mission output. baseline open exceptions for exercise-r04 is 12.
import type { SettledOutcome } from '@engine/campaign/types'
import type { FinaleSnapshot } from '@engine/missions/finale/projections'
import type { FinaleCaseState } from '@engine/missions/finale/projections'

export const OPEN_EXCEPTIONS_BASELINE = 12

// ── Real settled-outcome metric objects (seed exercise-r04) ──────────

/** CRASH OUTLOOK walkthrough end state: all three required messages
 *  delivered correct, completed at full tier. */
const OUTLOOK_CLEAN: SettledOutcome = {
  missionId: 'outlook',
  cause: 'completed',
  tier: 'full',
  settleSeq: 1,
  metrics: {
    required_delivered: 3,
    decoy_capacity_spent: 0,
    weather_correct: 1,
    payroll_correct: 1,
    audit_correct: 1,
    weather_delivered: 1,
    payroll_delivered: 1,
    audit_delivered: 1,
    audit_routed: 1,
    wopr_resolved: 0,
    service_cost: 0,
  },
  clueId: 'clue-D-83',
  consequences: [],
}

/** CRASH OUTLOOK adversarial send-everything end state: one required
 *  delivered, two decoys spent, timed out below tier. */
const OUTLOOK_ADVERSARIAL: SettledOutcome = {
  missionId: 'outlook',
  cause: 'timeout',
  tier: 'poor',
  settleSeq: 1,
  metrics: {
    required_delivered: 1,
    decoy_capacity_spent: 2,
    weather_correct: 1,
    payroll_correct: 0,
    audit_correct: 0,
    weather_delivered: 1,
    payroll_delivered: 1,
    audit_delivered: 1,
    audit_routed: 0,
    wopr_resolved: 2,
    service_cost: 4,
  },
  clueId: null,
  consequences: [],
}

/** FREEZE BANK ACCOUNTS walkthrough end state: all four payments cleared,
 *  full tier, sustainable. */
const BANK_CLEAN: SettledOutcome = {
  missionId: 'bank',
  cause: 'completed',
  tier: 'full',
  settleSeq: 2,
  metrics: {
    sustainability_signals: 3,
    payments_cleared: 4,
    payments_total: 4,
    derived_cash: 25610,
    confidence: 95,
    held_accounts: 0,
    payments_signal: 1,
    cash_signal: 1,
    confidence_signal: 1,
    before_hold_count: 18,
    before_hold_amount: 4040,
    genuine_after_hold_count: 0,
    genuine_after_hold_amount: 0,
    injected_after_hold_count: 0,
    injected_after_hold_amount: 0,
    wopr_resolved: 0,
    service_cost: 0,
  },
  clueId: null,
  consequences: [],
}

/** FREEZE BANK ACCOUNTS do-nothing end state: started and left to run, no
 *  payment cleared. Four payments unpaid: service_cost 4. This is the TIMEOUT
 *  variant (cause timeout, service_cost 4), distinct from the defensive-collapse
 *  variant the VIABILITY_THRESHOLDS calibration describes (bank defensive
 *  service_cost 8); the two are different end states, so this fixture does not
 *  contradict that calibration. */
const BANK_DONOTHING: SettledOutcome = {
  missionId: 'bank',
  cause: 'timeout',
  tier: 'partial',
  settleSeq: 2,
  metrics: {
    sustainability_signals: 2,
    payments_cleared: 0,
    payments_total: 4,
    derived_cash: 31910,
    confidence: 72,
    held_accounts: 0,
    payments_signal: 0,
    cash_signal: 1,
    confidence_signal: 1,
    before_hold_count: 18,
    before_hold_amount: 4790,
    genuine_after_hold_count: 0,
    genuine_after_hold_amount: 0,
    injected_after_hold_count: 0,
    injected_after_hold_amount: 0,
    wopr_resolved: 0,
    service_cost: 4,
  },
  clueId: null,
  consequences: [],
}

/** GROUND ALL FLIGHTS walkthrough end state: every flight landed, 1090
 *  passengers resolved, full tier. */
const FLIGHTS_CLEAN: SettledOutcome = {
  missionId: 'flights',
  cause: 'completed',
  tier: 'full',
  settleSeq: 3,
  metrics: {
    resolved_passengers: 1090,
    on_time_passengers: 970,
    late_passengers: 0,
    diverted_passengers: 120,
    stranded_passengers: 0,
    held_passengers: 0,
    held_flights: 0,
    landed_flights: 8,
    stranded_flights: 0,
    grounded: 0,
    wopr_resolved: 0,
    service_cost: 0,
  },
  clueId: null,
  consequences: [],
}

/** GROUND ALL FLIGHTS blanket-ground end state: all eight flights held,
 *  nobody reached a destination, failed tier. wopr 8, cost 8. */
const FLIGHTS_GROUNDED: SettledOutcome = {
  missionId: 'flights',
  cause: 'timeout',
  tier: 'failed',
  settleSeq: 3,
  metrics: {
    resolved_passengers: 0,
    on_time_passengers: 0,
    late_passengers: 0,
    diverted_passengers: 0,
    stranded_passengers: 0,
    held_passengers: 1090,
    held_flights: 8,
    landed_flights: 0,
    stranded_flights: 0,
    grounded: 1,
    wopr_resolved: 8,
    service_cost: 8,
  },
  clueId: null,
  consequences: [],
}

// ── Finale case state per fixture ────────────────────────────────────
// The reference-only case facts the earned-why readback names: which slots
// were proved and whether the field report corroborated. Record ids only.

// A fully proved case with the field report corroborated. Shared by the
// healthy and capacity-constrained fixtures: both reach a valid case with every
// slot proved and the field report in, so they carry the same case state (the
// missions they settle differ, not the case file).
const CASE_VALID_FULL: FinaleCaseState = {
  caseValid: true,
  provedSlots: ['outlook', 'flights', 'bank', 'root', 'observation'],
  fieldReportCorroborated: true,
}

const CASE_INVALID: FinaleCaseState = {
  caseValid: false,
  provedSlots: ['outlook', 'bank', 'root'],
  fieldReportCorroborated: false,
}

// ── The three snapshots ──────────────────────────────────────────────

function makeSnapshot(
  settled: readonly SettledOutcome[],
  caseState: FinaleCaseState,
): FinaleSnapshot {
  return {
    settled,
    openExceptionsBaseline: OPEN_EXCEPTIONS_BASELINE,
    caseState,
  }
}

export const healthyCampaign: FinaleSnapshot = makeSnapshot(
  [OUTLOOK_CLEAN, BANK_CLEAN, FLIGHTS_CLEAN],
  CASE_VALID_FULL,
)

export const capacityConstrainedCampaign: FinaleSnapshot = makeSnapshot(
  [OUTLOOK_ADVERSARIAL, BANK_DONOTHING, FLIGHTS_CLEAN],
  CASE_VALID_FULL,
)

export const allFailedCampaign: FinaleSnapshot = makeSnapshot(
  [OUTLOOK_ADVERSARIAL, BANK_DONOTHING, FLIGHTS_GROUNDED],
  CASE_INVALID,
)

export const CAMPAIGN_FIXTURES = {
  healthy: healthyCampaign,
  capacityConstrained: capacityConstrainedCampaign,
  allFailed: allFailedCampaign,
} as const

export type CampaignFixtureId = keyof typeof CAMPAIGN_FIXTURES
