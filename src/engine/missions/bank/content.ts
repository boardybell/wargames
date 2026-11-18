// The payload shape the three FREEZE BANK ACCOUNTS seeds must satisfy. Only
// the TYPE lives here so the module compiles standalone; the content
// validator functions and the authored payloads are section 02's job.
// Desk-check outcomes deliberately do NOT live here. They stay in the
// shared SeedDefinition.deskChecks table keyed by record id, exactly as
// CRASH OUTLOOK and GROUND ALL FLIGHTS do it.
import type { OutcomeTier } from '../../campaign/types'

/** One depositor account. Authored static truth only: the live balance,
 *  hold, and limit live in substate. */
export interface AccountDef {
  readonly id: string
  /** Invented depositor name. Authored copy, never copied into substate. */
  readonly name: string
  /** Authored flavor line the shell renders. Never enters substate. */
  readonly flavor: string
  /** Opening balance in whole dollars. Integer. */
  readonly openingBalance: number
  /** Whether a LIMIT action is legal on this account. */
  readonly limitEligible: boolean
}

/** A scheduled withdrawal request against one account. The pairing and
 *  dispute fields are AUTHORING metadata the shell renders; the engine does
 *  not dedupe duplicates nor treat disputes differently in mechanics. */
export interface RequestDef {
  readonly id: string
  readonly accountId: string
  /** Whole dollars sought. Integer. */
  readonly amount: number
  /** Seconds from mission start the withdrawal wave arrives. Integer. */
  readonly offsetSeconds: number
  /** Authored reason the shell renders beside the request. Never substate. */
  readonly reason: string
  /** Another request id this one is authored as a near-duplicate of, or null.
   *  Authoring metadata only; the engine applies both by the same rules. */
  readonly duplicateOfId: string | null
  /** Whether this request is authored as disputed. Authoring metadata only;
   *  mechanics are identical to an undisputed request. */
  readonly disputed: boolean
}

/** A critical payment the bank must clear from a specific account by its due
 *  offset. */
export interface PaymentDef {
  readonly id: string
  readonly accountId: string
  /** Whole dollars owed. Integer. */
  readonly amount: number
  /** Seconds from mission start the payment is due. Integer. */
  readonly dueOffsetSeconds: number
  /** Confidence points a cleared payment adds at the NEXT tick. Integer. */
  readonly confidenceBonus: number
  /** Authored reason the shell renders. Never substate. */
  readonly reason: string
}

/** The per-component confidence delta the tick applies. Every value is a
 *  whole signed integer. Penalties are negative, bonuses positive. */
export interface ConfidenceDeltaTable {
  /** Applied once per currently-held account at each tick. */
  readonly perHeldAccount: number
  /** Applied once per payment cleared since the last tick. */
  readonly perClearedPayment: number
  /** Applied once per selective (sub-broad) release since the last tick. */
  readonly perSelectiveRelease: number
  /** Applied once when derived cash is below the floor at tick time. */
  readonly cashBelowFloor: number
}

/** One confidence threshold and the injected withdrawals a downward crossing
 *  of it triggers once, ever. */
export interface ThresholdDef {
  /** The confidence value crossed downward to trigger injection. Integer. */
  readonly value: number
  /** The injected withdrawal requests, each a base-sized draw against an
   *  account. The engine sizes them at base plus the capped inbound
   *  flightsDisrupted magnitude, never below base. */
  readonly injected: readonly InjectedRequestDef[]
}

/** One authored injected withdrawal: a base draw against an account at the
 *  threshold crossing. Sizing is engine-driven (base plus capped inbound
 *  consequence), never below base. */
export interface InjectedRequestDef {
  readonly id: string
  readonly accountId: string
  /** Base whole-dollar size. Integer. */
  readonly baseAmount: number
  /** Authored reason the shell renders. Never substate. */
  readonly reason: string
}

/** Resolved-service tier thresholds. The integer count of sustainable-play
 *  signals (critical payments cleared, cash at or above floor, confidence at
 *  or above target) scores against these. */
export interface BankTierThresholds {
  /** Signals required for FULL. */
  readonly full: number
  /** Signals required for PARTIAL. */
  readonly partial: number
  /** Signals required for POOR; below this is FAILED. */
  readonly poor: number
}

/** The outbound consequence magnitudes this mission emits per tier. */
export type PaymentsDelayedTable = Readonly<Record<OutcomeTier, number>>

export interface BankPayload {
  readonly accounts: readonly AccountDef[]
  readonly requests: readonly RequestDef[]
  readonly payments: readonly PaymentDef[]
  /** Simultaneously-held accounts strictly above this count stamp the broad
   *  hold once, ever. Integer. */
  readonly broadHoldCount: number
  /** Seconds between confidence ticks. Integer. The seed authors the actual
   *  tick schedule; this is retained for authoring reference. */
  readonly tickIntervalSeconds: number
  /** The authored STANDARD mission length in whole seconds. bankSchedule
   *  derives the confidence-tick offsets from this, never a hardcoded
   *  constant, so a seed with a non-240 duration still ticks across its whole
   *  window, and the engine's extended-time x2 start-anchored scaling keeps a
   *  proportional cadence to endsAt with no dead tail. Integer. */
  readonly standardDurationSeconds: number
  readonly confidenceDelta: ConfidenceDeltaTable
  /** Starting depositor confidence, 0 to 100. Integer. */
  readonly startingConfidence: number
  readonly thresholds: readonly ThresholdDef[]
  /** Derived-cash floor in whole dollars. Below it the tick penalizes and a
   *  sustainability signal is lost. Integer. */
  readonly floor: number
  /** The hard collapse floor in whole dollars. When DERIVED cash falls
   *  strictly below this, terminal() returns 'collapsed' as the second
   *  documented collapse cause, distinct from confidence hitting zero.
   *  Upstream paymentsDelayed penalties (applied at init without clipping) can
   *  drive the targeted account's balance, and therefore derived cash, below
   *  this. Typically 0: a bank whose available cash has gone negative has
   *  failed its depositors outright. Integer, at or below floor. */
  readonly collapseFloor: number
  /** Confidence target the sustainable check scores against. Integer. */
  readonly target: number
  /** The authored WOPR predicted-withdrawal series, indexed by elapsed ticks.
   *  Display content; the selector shifts it upward while a broad hold is
   *  active. Whole dollars. */
  readonly predictionSeries: readonly number[]
  /** The percent the prediction series rises while the broad hold is active.
   *  Integer (e.g. 35 means plus 35 percent). */
  readonly holdShiftPercent: number
  /** Intro lines the shell renders at mission start. Authored copy only. */
  readonly introLines: readonly string[]
  readonly tierThresholds: BankTierThresholds
  /** The account a paymentsDelayed inbound consequence drains at init by its
   *  capped magnitude. Pinned per seed so consequence folding stays
   *  order-independent. */
  readonly paymentsDelayedTargetAccountId: string
  readonly paymentsDelayedTable: PaymentsDelayedTable
}
