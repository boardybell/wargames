// Derived cash, the WOPR predicted-withdrawal line, reason rendering, and the
// scoreboard facts for FREEZE BANK ACCOUNTS. Pure, integer-only, recomputed
// per render. NOTHING in rules.ts or the reduce path imports this file: the
// prediction line is a display projection the reducers never read, which is
// exactly why holding accounts can make WOPR's line rise (a pure selector
// reflecting HOLD immediately) while the real mechanics quietly worsen.
import type { BankPayload } from './content'
import type { BankState } from './types'
import { availableToDraw } from './rules'

/** Derived cash: the sum of available unheld balances. A held account
 *  contributes zero; a limited account contributes the smaller of its balance
 *  and remaining allowance; an open account contributes its full balance.
 *  Cash is never stored in substate; this selector is the only source. */
export function selectDerivedCash(state: BankState): number {
  let cash = 0
  for (const acct of Object.values(state.accounts)) {
    if (acct.held) continue
    cash += availableToDraw(acct)
  }
  return cash
}

/** The WOPR predicted-withdrawal line, indexed by elapsed ticks, shifted
 *  upward by the authored percent while the broad hold is active, and the
 *  unshifted authored series otherwise. Pure: it reads firstBroadHoldAt and
 *  whether any account is held RIGHT NOW, so it reflects HOLD and RELEASE
 *  immediately with no reducer involvement. This is the line that appears to
 *  justify the holds; the real success tier ignores it. */
export function selectPredictedWithdrawals(
  payload: BankPayload,
  state: BankState,
): number[] {
  const active = broadHoldActive(state)
  return payload.predictionSeries.map((base) =>
    active
      ? base + Math.trunc((base * payload.holdShiftPercent) / 100)
      : base,
  )
}

/** The OBSERVED withdrawal total so far: the sum of dollars actually drawn by
 *  every resolved request. A pure display projection over substate, computed by
 *  the SAME owner as selectPredictedWithdrawals so both lines of the tell share
 *  one source. NOTHING in rules.ts or the reduce path reads this; the divergence
 *  from the WOPR PREDICTED line (holding lifts the prediction while the real
 *  draws do not follow) is the mission tell. Integer-only. */
export function selectObservedWithdrawals(state: BankState): number {
  let total = 0
  for (const rs of Object.values(state.requests)) {
    if (rs.outcome === 'pending') continue
    total += rs.appliedAmount
  }
  return total
}

/** Whether the broad hold is currently active: it has stamped and at least
 *  one account is still held. A full release drops the line back. */
export function broadHoldActive(state: BankState): boolean {
  if (state.firstBroadHoldAt === null) return false
  for (const acct of Object.values(state.accounts)) {
    if (acct.held) return true
  }
  return false
}

/** A reason-rendering join: turn a typed request outcome code into display
 *  text. The authored request reason is rendered separately from the payload;
 *  this covers only the code-derived outcome text so no string crosses into
 *  substate. */
export function renderRequestOutcome(outcome: string): string {
  switch (outcome) {
    case 'applied':
      return 'WITHDRAWAL CLEARED IN FULL'
    case 'partial':
      return 'WITHDRAWAL CLEARED IN PART'
    case 'refused':
      return 'WITHDRAWAL REFUSED: ACCOUNT HELD'
    case 'pending':
      return 'WITHDRAWAL PENDING'
    default:
      return 'WITHDRAWAL UNKNOWN'
  }
}

export interface BankScoreboard {
  /** Accounts currently held. Each reads to WOPR as a resolved exception, so
   *  the campaign OPEN EXCEPTIONS count falls as more accounts are held, while
   *  real confidence and payments worsen. */
  readonly heldAccounts: number
  /** Critical payments cleared. */
  readonly clearedPayments: number
  /** Critical payments total. */
  readonly totalPayments: number
  /** Derived cash right now. */
  readonly derivedCash: number
  /** Depositor confidence right now. */
  readonly confidence: number
}

export function buildScoreboard(
  payload: BankPayload,
  state: BankState,
): BankScoreboard {
  let held = 0
  for (const acct of Object.values(state.accounts)) if (acct.held) held += 1
  let cleared = 0
  for (const p of payload.payments) {
    if (state.payments[p.id]?.cleared) cleared += 1
  }
  return {
    heldAccounts: held,
    clearedPayments: cleared,
    totalPayments: payload.payments.length,
    derivedCash: selectDerivedCash(state),
    confidence: state.confidence,
  }
}
