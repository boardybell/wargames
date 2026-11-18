// Pure hold/release/limit/pay legality, withdrawal application, tick math,
// threshold injection, and tiering for FREEZE BANK ACCOUNTS. No engine
// imports beyond types. Every quantity is an integer: whole dollars for
// balances and amounts, whole seconds for authored offsets, whole points for
// confidence. Nothing here touches Date, Math.random, or timers; the module
// calls these from validate and reduce. Every legality decision is evaluated
// against DRAINED substate (the withdrawal waves the scheduled events have
// already folded in), so a request draining in the same dispatch that applies
// a broad hold is before-hold by construction.
//
// The mission thesis lives here: holding an account makes WOPR's predicted
// withdrawal line rise (the selector reads firstBroadHoldAt), which appears
// to justify the holds, while a held account contributes zero to derived
// cash, drags confidence down every tick, and blocks the payment it owes. So
// defensive mass-holding looks good to WOPR's tally and LOSES the real tier.
import type { OutcomeTier } from '../../campaign/types'
import type {
  AccountDef,
  BankPayload,
  BankTierThresholds,
  PaymentDef,
} from './content'
import type { AccountState, BankState, RequestOutcome } from './types'

export type HoldReason = 'ALREADY HELD' | 'UNKNOWN ACCOUNT'
export type ReleaseReason = 'NOT HELD' | 'UNKNOWN ACCOUNT'
export type LimitReason =
  | 'UNKNOWN ACCOUNT'
  | 'NOT LIMIT ELIGIBLE'
  | 'BELOW SPENT OUTFLOW'
export type PayReason =
  | 'UNKNOWN PAYMENT'
  | 'ACCOUNT HELD'
  | 'INSUFFICIENT BALANCE'
  | 'INSUFFICIENT ALLOWANCE'
  | 'ALREADY CLEARED'

export type HoldLegality =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: HoldReason }
export type ReleaseLegality =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: ReleaseReason }
export type LimitLegality =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: LimitReason }
export type PayLegality =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: PayReason }

export function accountById(
  payload: BankPayload,
  accountId: string,
): AccountDef | null {
  return payload.accounts.find((a) => a.id === accountId) ?? null
}

export function paymentById(
  payload: BankPayload,
  paymentId: string,
): PaymentDef | null {
  return payload.payments.find((p) => p.id === paymentId) ?? null
}

/** The remaining limited allowance for an account: its cap minus outflow
 *  already spent, floored at zero. Only meaningful when limitedTo is set. */
export function remainingAllowance(acct: AccountState): number {
  if (acct.limitedTo === null) return acct.balance
  return Math.max(0, acct.limitedTo - acct.limitedSpent)
}

/** How many dollars an unheld account can give up to a draw: the full balance
 *  when unlimited, the smaller of balance and remaining allowance when
 *  limited. A held account gives up zero (handled by the caller). */
export function availableToDraw(acct: AccountState): number {
  if (acct.limitedTo === null) return acct.balance
  return Math.min(acct.balance, remainingAllowance(acct))
}

/** The number of accounts simultaneously held. The broad-hold trigger reads
 *  this against payload.broadHoldCount. */
export function heldCount(state: BankState): number {
  let n = 0
  for (const acct of Object.values(state.accounts)) if (acct.held) n += 1
  return n
}

// ── Withdrawal application (fired by scheduled events) ────────────────

export interface AppliedWithdrawal {
  readonly outcome: RequestOutcome
  /** Whole dollars actually drawn. */
  readonly drawn: number
  /** The account state after the draw. */
  readonly account: AccountState
}

/** Apply a withdrawal of `amount` dollars against an account's DRAINED state.
 *  Open account: draws up to its balance. Held account: refuses, draws
 *  nothing. Limited account: draws up to the remaining cumulative allowance,
 *  recording `partial` when the amount is clipped. An exact-balance draw
 *  applies fully and leaves zero. Pure: returns the outcome and the next
 *  account state. */
export function applyWithdrawal(
  acct: AccountState,
  amount: number,
): AppliedWithdrawal {
  if (acct.held) {
    return { outcome: 'refused', drawn: 0, account: acct }
  }
  if (acct.limitedTo !== null) {
    const allowance = remainingAllowance(acct)
    // A balance already driven negative by an upstream penalty gives up zero;
    // draws never deepen a negative balance.
    const cap = Math.max(0, Math.min(allowance, acct.balance))
    const drawn = Math.min(amount, cap)
    const outcome: RequestOutcome = drawn < amount ? 'partial' : 'applied'
    return {
      outcome,
      drawn,
      account: {
        ...acct,
        balance: acct.balance - drawn,
        limitedSpent: acct.limitedSpent + drawn,
      },
    }
  }
  // Clamp at zero so a penalty-negative balance gives up nothing and never
  // deepens; healthy draws are unaffected.
  const drawn = Math.min(amount, Math.max(0, acct.balance))
  const outcome: RequestOutcome = drawn < amount ? 'partial' : 'applied'
  return {
    outcome,
    drawn,
    account: { ...acct, balance: acct.balance - drawn },
  }
}

// ── Action legality ───────────────────────────────────────────────────

export function holdLegality(
  payload: BankPayload,
  state: BankState,
  accountId: string,
): HoldLegality {
  const acct = state.accounts[accountId]
  if (!acct || !accountById(payload, accountId)) {
    return { legal: false, reason: 'UNKNOWN ACCOUNT' }
  }
  if (acct.held) return { legal: false, reason: 'ALREADY HELD' }
  return { legal: true }
}

export function releaseLegality(
  payload: BankPayload,
  state: BankState,
  accountId: string,
): ReleaseLegality {
  const acct = state.accounts[accountId]
  if (!acct || !accountById(payload, accountId)) {
    return { legal: false, reason: 'UNKNOWN ACCOUNT' }
  }
  if (!acct.held) return { legal: false, reason: 'NOT HELD' }
  return { legal: true }
}

/** LIMIT is legal only on a limit-eligible account, and a re-LIMIT can never
 *  set the cap below outflow already spent. */
export function limitLegality(
  payload: BankPayload,
  state: BankState,
  accountId: string,
  cap: number,
): LimitLegality {
  const acct = state.accounts[accountId]
  const def = accountById(payload, accountId)
  if (!acct || !def) return { legal: false, reason: 'UNKNOWN ACCOUNT' }
  if (!def.limitEligible) return { legal: false, reason: 'NOT LIMIT ELIGIBLE' }
  if (cap < acct.limitedSpent) {
    return { legal: false, reason: 'BELOW SPENT OUTFLOW' }
  }
  return { legal: true }
}

/** PAY draws from the payment's specific account only. Blocked while that
 *  account is held (the designed release-or-limit-to-pay tension); needs
 *  sufficient balance, or sufficient remaining allowance when limited. */
export function payLegality(
  payload: BankPayload,
  state: BankState,
  paymentId: string,
): PayLegality {
  const def = paymentById(payload, paymentId)
  const pstate = state.payments[paymentId]
  if (!def || !pstate) return { legal: false, reason: 'UNKNOWN PAYMENT' }
  if (pstate.cleared) return { legal: false, reason: 'ALREADY CLEARED' }
  const acct = state.accounts[def.accountId]
  if (!acct) return { legal: false, reason: 'UNKNOWN PAYMENT' }
  if (acct.held) return { legal: false, reason: 'ACCOUNT HELD' }
  if (acct.balance < def.amount) {
    return { legal: false, reason: 'INSUFFICIENT BALANCE' }
  }
  if (acct.limitedTo !== null && remainingAllowance(acct) < def.amount) {
    return { legal: false, reason: 'INSUFFICIENT ALLOWANCE' }
  }
  return { legal: true }
}

// ── Tick math ─────────────────────────────────────────────────────────

export interface TickInput {
  readonly heldAccounts: number
  readonly clearedPayments: number
  readonly selectiveReleases: number
  readonly cashBelowFloor: boolean
}

/** The confidence delta for one tick, from the authored table over the held
 *  count, payments cleared since the last tick, selective releases since the
 *  last tick, and whether derived cash is below floor. Returns the signed
 *  delta; the caller clamps the running confidence to 0..100. */
export function tickDelta(payload: BankPayload, input: TickInput): number {
  const t = payload.confidenceDelta
  let delta = 0
  delta += input.heldAccounts * t.perHeldAccount
  delta += input.clearedPayments * t.perClearedPayment
  delta += input.selectiveReleases * t.perSelectiveRelease
  if (input.cashBelowFloor) delta += t.cashBelowFloor
  return delta
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, value))
}

// ── Threshold injection sizing ────────────────────────────────────────

/** The size of an injected withdrawal: base plus the engine-capped inbound
 *  flightsDisrupted magnitude, never below base. The magnitude is the folded
 *  consequence passed at init and retained for the module to apply. */
export function injectedSize(baseAmount: number, inboundMagnitude: number): number {
  return baseAmount + Math.max(0, inboundMagnitude)
}

/** The thresholds crossed downward going from `before` to `after` confidence
 *  that have not yet been consumed. A downward crossing of value V fires when
 *  before >= V and after < V. Returns the matching threshold values in
 *  descending order so the deepest crossing injects last. */
export function downwardCrossings(
  payload: BankPayload,
  before: number,
  after: number,
  consumed: readonly number[],
): number[] {
  if (after >= before) return []
  const out: number[] = []
  for (const threshold of payload.thresholds) {
    const v = threshold.value
    if (consumed.includes(v)) continue
    if (before >= v && after < v) out.push(v)
  }
  return out.sort((a, b) => b - a)
}

// ── Tiering ───────────────────────────────────────────────────────────

/** The sustainable-play signals the success tier scores. These are REAL
 *  outcomes: every critical payment cleared, derived cash at or above floor,
 *  confidence at or above target. The WOPR predicted-withdrawal line is NOT a
 *  signal here, so defensive mass-holding (which only inflates that line)
 *  cannot buy a tier. */
export interface SustainabilitySignals {
  readonly paymentsCleared: boolean
  readonly cashAtOrAboveFloor: boolean
  readonly confidenceAtOrAboveTarget: boolean
}

export function sustainabilitySignals(
  payload: BankPayload,
  state: BankState,
  derivedCash: number,
): SustainabilitySignals {
  const allCleared =
    payload.payments.length > 0 &&
    payload.payments.every((p) => state.payments[p.id]?.cleared === true)
  return {
    paymentsCleared: allCleared,
    cashAtOrAboveFloor: derivedCash >= payload.floor,
    confidenceAtOrAboveTarget: state.confidence >= payload.target,
  }
}

export function signalCount(signals: SustainabilitySignals): number {
  let n = 0
  if (signals.paymentsCleared) n += 1
  if (signals.cashAtOrAboveFloor) n += 1
  if (signals.confidenceAtOrAboveTarget) n += 1
  return n
}

/** Map the integer signal count to a tier against the authored thresholds.
 *  Shared by every settlement cause; `collapsed` is forced to failed by the
 *  module before this is consulted. */
export function tierFromSignals(
  count: number,
  thresholds: BankTierThresholds,
): OutcomeTier {
  if (count >= thresholds.full) return 'full'
  if (count >= thresholds.partial) return 'partial'
  if (count >= thresholds.poor) return 'poor'
  return 'failed'
}

/** A fresh per-account state at init over an authored account. */
export function initialAccountState(def: AccountDef): AccountState {
  return {
    balance: def.openingBalance,
    held: false,
    limitedTo: null,
    limitedSpent: 0,
  }
}
