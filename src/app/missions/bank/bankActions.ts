// Shared, pure helpers that shape the per-account and per-payment action rows,
// so the ledger and payments views never diverge and never invent a reason.
// These hold NO legality logic of their own: every legal/illegal decision and
// its typed reason come from the engine selectors (holdLegality, releaseLegality,
// limitLegality, payLegality) imported from src/engine/missions/bank/rules.ts.
// That is the parity contract: the shell offers exactly what the engine accepts,
// and a rejected action renders disabled with the engine's typed reason inline.
import type { BankPayload } from '@engine/missions/bank/content'
import type { BankState } from '@engine/missions/bank/types'
import {
  availableToDraw,
  holdLegality,
  limitLegality,
  payLegality,
  releaseLegality,
  remainingAllowance,
  type HoldReason,
  type LimitReason,
  type PayReason,
  type ReleaseReason,
} from '@engine/missions/bank/rules'

export interface AccountControlRow {
  readonly holdLegal: boolean
  readonly holdReason?: HoldReason
  readonly releaseLegal: boolean
  readonly releaseReason?: ReleaseReason
  /** True when LIMIT is eligible on this account at all (a re-LIMIT below spent
   *  outflow is still rejected at dispatch with BELOW SPENT OUTFLOW). */
  readonly limitEligible: boolean
  readonly limitReason?: LimitReason
}

/** HOLD/RELEASE/LIMIT legality for one account, straight from the engine
 *  selectors against drained state. A probe cap of the account's remaining
 *  allowance proves limit eligibility without committing a cap. */
export function accountControl(
  payload: BankPayload,
  state: BankState,
  accountId: string,
): AccountControlRow {
  const h = holdLegality(payload, state, accountId)
  const r = releaseLegality(payload, state, accountId)
  const acct = state.accounts[accountId]
  // Probe LIMIT eligibility with a cap at the account's current spent outflow
  // (the lowest cap a re-LIMIT can take), so the only reason that can surface is
  // NOT LIMIT ELIGIBLE, never BELOW SPENT OUTFLOW.
  const probeCap = acct ? Math.max(0, acct.limitedSpent) : 0
  const l = limitLegality(payload, state, accountId, probeCap)
  return {
    holdLegal: h.legal,
    holdReason: h.legal ? undefined : h.reason,
    releaseLegal: r.legal,
    releaseReason: r.legal ? undefined : r.reason,
    limitEligible: l.legal,
    limitReason: l.legal ? undefined : l.reason,
  }
}

/** The engine's LIMIT legality for an account against a SPECIFIC draft cap
 *  (not the eligibility probe). When the account is limit-eligible but the draft
 *  cap would be rejected (e.g. BELOW SPENT OUTFLOW), this surfaces that exact
 *  typed reason so the ledger can disable the button and render it inline,
 *  rather than dispatching an action the engine will silently reject. Returns
 *  null when the draft is legal. All judgment stays in the engine rule. */
export function limitDraftReason(
  payload: BankPayload,
  state: BankState,
  accountId: string,
  cap: number,
): LimitReason | null {
  const l = limitLegality(payload, state, accountId, cap)
  return l.legal ? null : l.reason
}

export interface PaymentControlRow {
  readonly payLegal: boolean
  readonly payReason?: PayReason
  readonly cleared: boolean
}

/** PAY legality for one payment, straight from the engine selector. The
 *  held-account reason (ACCOUNT HELD) is exactly the teaching case the view
 *  renders inline. */
export function paymentControl(
  payload: BankPayload,
  state: BankState,
  paymentId: string,
): PaymentControlRow {
  const p = payLegality(payload, state, paymentId)
  return {
    payLegal: p.legal,
    payReason: p.legal ? undefined : p.reason,
    cleared: state.payments[paymentId]?.cleared ?? false,
  }
}

/** The display view of one account's live state for the ledger row: its balance,
 *  hold flag, limited cap and remaining allowance. Read from drained substate
 *  only; the engine selector availableToDraw / remainingAllowance do the math. */
export interface AccountDisplay {
  readonly balance: number
  readonly held: boolean
  readonly limitedTo: number | null
  readonly remaining: number | null
  readonly available: number
}

export function accountDisplay(
  state: BankState,
  accountId: string,
): AccountDisplay | null {
  const acct = state.accounts[accountId]
  if (!acct) return null
  return {
    balance: acct.balance,
    held: acct.held,
    limitedTo: acct.limitedTo,
    remaining: acct.limitedTo === null ? null : remainingAllowance(acct),
    available: acct.held ? 0 : availableToDraw(acct),
  }
}
