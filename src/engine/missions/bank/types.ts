// FREEZE BANK ACCOUNTS substate and its reference-only save schema. Same
// discipline as CRASH OUTLOOK and GROUND ALL FLIGHTS: the persisted substate
// carries ids, typed codes, integer balances, and boolean flags only.
// Authored copy (depositor names, reason strings, the prediction series, the
// floor and target labels) lives exclusively in the immutable BankPayload,
// never in a save. If a test can smuggle a reason string or an account name
// into a parsed substate, this schema is wrong. Cash is NEVER a field: it is
// always the selectDerivedCash selector over account balances.
import * as v from 'valibot'

const integer = v.pipe(v.number(), v.integer())

/** A request's application outcome. A typed code only, never a reason string.
 *  `applied` means the full amount drew; `partial` means a limited account
 *  clipped it; `refused` means a held account turned it away. */
export type RequestOutcome = 'pending' | 'applied' | 'partial' | 'refused'

export const REQUEST_OUTCOMES: readonly RequestOutcome[] = [
  'pending',
  'applied',
  'partial',
  'refused',
]

/** Per-account mutable truth. No authored copy: names, flavors, and opening
 *  balances live in the payload; the substate carries the live balance, the
 *  hold flag, the cumulative limited cap (null when unlimited), and the
 *  cumulative outflow already spent against a limited cap. */
export interface AccountState {
  /** Live whole-dollar balance. Integer. */
  readonly balance: number
  /** True while the account is held: withdrawals and payments refuse. */
  readonly held: boolean
  /** The cumulative limited outflow cap in whole dollars, or null when the
   *  account is unlimited. Integer. */
  readonly limitedTo: number | null
  /** Whole dollars of outflow already spent against the limited cap. A
   *  re-LIMIT can never set limitedTo below this. Integer. */
  readonly limitedSpent: number
}

/** Per-request mutable truth: its application outcome code and whether it
 *  arrived after the broad hold stamped. */
export interface RequestState {
  readonly outcome: RequestOutcome
  /** Whole dollars this request actually drew (0 when refused, the clipped
   *  amount when partial, the full amount when applied). Integer. */
  readonly appliedAmount: number
  /** True when this request resolved in a dispatch at or after the broad hold
   *  stamped. Requests draining in the same dispatch that applies the broad
   *  hold are before-hold by construction (drains precede action reduction). */
  readonly arrivedAfterHold: boolean
  /** True when this request was injected by a threshold crossing, not an
   *  authored wave. */
  readonly injected: boolean
}

/** Per-payment mutable truth: whether it has cleared. Its confidence bonus
 *  lands at the NEXT tick, not inline. */
export interface PaymentState {
  readonly cleared: boolean
}

export interface BankState {
  /** Per-account state by account id. Ids and numbers only. */
  readonly accounts: Readonly<Record<string, AccountState>>
  /** Per-request outcome by request id. Includes injected request ids once
   *  they fire. */
  readonly requests: Readonly<Record<string, RequestState>>
  /** Per-payment cleared flag by payment id. */
  readonly payments: Readonly<Record<string, PaymentState>>
  /** Depositor confidence, 0 to 100. Integer. */
  readonly confidence: number
  /** Epoch ms the broad hold first stamped, or null. Stamps once, ever. */
  readonly firstBroadHoldAt: number | null
  /** Threshold values already consumed by a downward crossing. A consumed
   *  threshold never injects again. Integers. */
  readonly injectedThresholds: readonly number[]
  /** Payments cleared since the last tick folded; the next tick reads and
   *  resets it. Integer. */
  readonly clearedSinceTick: number
  /** Selective (sub-broad) releases since the last tick; the next tick reads
   *  and resets it. Integer. */
  readonly releasesSinceTick: number
  /** The capped inbound flightsDisrupted magnitude folded at init. Sizes
   *  threshold-injected withdrawals (base plus it), never below base. A
   *  seeded integer, not authored copy; reducers read it, never fold it. */
  readonly injectMagnitude: number
  /** Materialized mission length in ms, from init. Integer. */
  readonly durationMs: number
  /** Absolute deadline in ms, stamped from the first event the module sees.
   *  Null until then. terminal() and evaluate() read it. */
  readonly endsAt: number | null
}

const accountStateSchema = v.strictObject({
  balance: integer,
  held: v.boolean(),
  limitedTo: v.nullable(integer),
  limitedSpent: integer,
})

const requestStateSchema = v.strictObject({
  outcome: v.picklist(['pending', 'applied', 'partial', 'refused']),
  appliedAmount: integer,
  arrivedAfterHold: v.boolean(),
  injected: v.boolean(),
})

const paymentStateSchema = v.strictObject({
  cleared: v.boolean(),
})

/** The reference-only save schema. strictObject at every level means any
 *  field that could carry authored copy (a name, a reason, the prediction
 *  series) is structurally rejected. There is deliberately NO cash field. */
export const bankSaveSchema = v.strictObject({
  accounts: v.record(v.string(), accountStateSchema),
  requests: v.record(v.string(), requestStateSchema),
  payments: v.record(v.string(), paymentStateSchema),
  confidence: v.pipe(integer, v.minValue(0), v.maxValue(100)),
  firstBroadHoldAt: v.nullable(integer),
  injectedThresholds: v.array(integer),
  clearedSinceTick: integer,
  releasesSinceTick: integer,
  injectMagnitude: v.pipe(integer, v.minValue(0)),
  durationMs: v.pipe(integer, v.minValue(0)),
  endsAt: v.nullable(v.pipe(integer, v.minValue(0))),
})

export type BankStateParsed = v.InferOutput<typeof bankSaveSchema>
