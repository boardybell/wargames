// The FREEZE BANK ACCOUNTS mission module and its construction under mission
// id 'bank'. Pure: it reads authored content from the BankPayload captured at
// construction, applies rules.ts outcomes, and never touches Date,
// Math.random, or timers. Withdrawal waves, confidence ticks, and the end
// tick are seed-authored scheduled events the engine drains; the module has
// no schedule() method (the engine's MissionModule carries none), so timed
// events ride in through bankSchedule(payload), exactly as GROUND ALL FLIGHTS
// authors flightsSchedule. The deadline is stamped from the first event the
// module sees (an offset-0 start event), and the end tick at endsAt lets the
// final confidence tick fold before the timeout settlement guard runs.
//
// The circular-validation thesis is enforced here and in rules.ts: a HOLD
// stamps firstBroadHoldAt once the simultaneously-held count crosses
// broadHoldCount, which makes selectPredictedWithdrawals rise (appears to
// justify the holds), while held accounts contribute zero to derived cash,
// are penalized every confidence tick, and block the payments they owe. The
// success tier reads REAL outcomes only (payments cleared, cash, confidence),
// so mass-holding inflates WOPR's line and LOSES the tier. module.ts does NOT
// import selectors.ts on the reduce path: the prediction line is a display
// projection the reducers never read.
//
// There is no clues() here and no inspection flag in substate. The authored
// B04 hold-justification record and its D-83 clue are engine-owned through
// SeedDefinition.clueRecords: inspecting the record logs the clue with no
// mission involvement.
import type {
  DebriefPayload,
  EvaluatedOutcome,
  FoldedConsequences,
  MissionEvent,
  MissionModule,
  SeedDefinition,
} from '../types'
import type {
  EngineEvent,
  SettledOutcome,
  SettlementCause,
} from '../../campaign/types'
import type { ScheduledEventSpec } from '../../time'
import type { BankPayload } from './content'
import {
  accountById,
  applyWithdrawal,
  clampConfidence,
  downwardCrossings,
  heldCount,
  holdLegality,
  initialAccountState,
  injectedSize,
  limitLegality,
  payLegality,
  paymentById,
  releaseLegality,
  remainingAllowance,
  signalCount,
  sustainabilitySignals,
  tickDelta,
  tierFromSignals,
} from './rules'
import { bankSaveSchema } from './types'
import type { AccountState, BankState, RequestState } from './types'

export const BANK_MISSION_ID = 'bank'

const START_EVENT_ID = 'bank-start'
const START_EVENT_KIND = 'bankStart'
const WAVE_EVENT_KIND = 'bankWave'
const TICK_EVENT_KIND = 'confidenceTick'
const DUE_EVENT_KIND = 'bankDue'
const END_EVENT_KIND = 'bankEnd'

/** The schedule a seed authors from a BankPayload. An offset-0 start event
 *  stamps the absolute deadline once time begins; each withdrawal wave fires
 *  at its authored offset; confidence ticks fall at the authored interval up
 *  to the standard duration; each payment-due warning fires at its due offset;
 *  and an end tick at endsAt folds the final confidence tick before the
 *  timeout guard runs. Section 02 wires this into the seed's schedules table. */
export function bankSchedule(
  payload: BankPayload,
): readonly ScheduledEventSpec[] {
  // The tick window is the AUTHORED standard duration, never a hardcoded
  // constant. Start-anchored tick offsets scale x2 under extended time, so
  // deriving them from the real window keeps a proportional cadence that
  // covers the full (possibly doubled) span: the last periodic tick lands
  // within one interval of the standard duration, so under x2 scaling the gap
  // to endsAt is at most one scaled interval and the end tick closes it. No
  // dead tail.
  const standardDurationSeconds = payload.standardDurationSeconds
  const specs: ScheduledEventSpec[] = [
    {
      id: START_EVENT_ID,
      offsetSeconds: 0,
      anchor: 'start',
      kind: START_EVENT_KIND,
      payload: null,
    },
  ]
  payload.requests.forEach((request) => {
    specs.push({
      id: `bank-wave-${request.id}`,
      offsetSeconds: request.offsetSeconds,
      anchor: 'start',
      kind: WAVE_EVENT_KIND,
      payload: { requestId: request.id },
    })
  })
  const interval = payload.tickIntervalSeconds
  if (interval > 0) {
    let tickNo = 0
    for (
      let offset = interval;
      offset < standardDurationSeconds;
      offset += interval
    ) {
      tickNo += 1
      specs.push({
        id: `bank-tick-${tickNo}`,
        offsetSeconds: offset,
        anchor: 'start',
        kind: TICK_EVENT_KIND,
        payload: null,
      })
    }
  }
  payload.payments.forEach((payment) => {
    specs.push({
      id: `bank-due-${payment.id}`,
      offsetSeconds: payment.dueOffsetSeconds,
      anchor: 'start',
      kind: DUE_EVENT_KIND,
      payload: { paymentId: payment.id },
    })
  })
  specs.push({
    id: 'bank-end',
    offsetSeconds: 0,
    anchor: 'end',
    kind: END_EVENT_KIND,
    payload: null,
  })
  return specs
}

/** Construct the FREEZE BANK ACCOUNTS module over an authored payload.
 *  Mirrors makeFlightsMission(payload): the payload is immutable campaign
 *  content, so closing over it keeps every method pure over (state, event). */
export function makeBankMission(
  payload: BankPayload,
): MissionModule<BankState> {
  function stampDeadline(state: BankState, now: number): BankState {
    return state.endsAt === null
      ? { ...state, endsAt: now + state.durationMs }
      : state
  }

  /** Derived cash over a given account map (used inside reducers without
   *  importing the display selector): sum of available unheld balances. */
  function derivedCashOf(
    accounts: Readonly<Record<string, AccountState>>,
  ): number {
    let cash = 0
    for (const acct of Object.values(accounts)) {
      if (acct.held) continue
      if (acct.limitedTo === null) cash += acct.balance
      else cash += Math.min(acct.balance, remainingAllowance(acct))
    }
    return cash
  }

  /** Stamp the broad hold if the simultaneously-held count now exceeds the
   *  authored count and it has never stamped. Stamps once, ever. */
  function maybeStampBroadHold(state: BankState, now: number): BankState {
    if (state.firstBroadHoldAt !== null) return state
    if (heldCount(state) > payload.broadHoldCount) {
      return { ...state, firstBroadHoldAt: now }
    }
    return state
  }

  /** Apply one withdrawal (authored wave or injected) against drained state,
   *  recording its outcome and whether it arrived after the broad hold. */
  function applyRequest(
    state: BankState,
    requestId: string,
    accountId: string,
    amount: number,
    injected: boolean,
  ): BankState {
    const acct = state.accounts[accountId]
    if (!acct || !accountById(payload, accountId)) return state
    const result = applyWithdrawal(acct, amount)
    const arrivedAfterHold = state.firstBroadHoldAt !== null
    const requestState: RequestState = {
      outcome: result.outcome,
      appliedAmount: result.drawn,
      arrivedAfterHold,
      injected,
    }
    return {
      ...state,
      accounts: { ...state.accounts, [accountId]: result.account },
      requests: { ...state.requests, [requestId]: requestState },
    }
  }

  /** The confidence tick: compute the authored delta, clamp, then check for
   *  downward threshold crossings and inject their authored withdrawals once.
   *  The cleared-since and release-since counters reset after the delta reads
   *  them. Injected withdrawals size base plus the capped inbound magnitude
   *  (closed over from init) and mark arrivedAfterHold per the current hold. */
  function tick(state: BankState, now: number, inboundMagnitude: number): BankState {
    const cash = derivedCashOf(state.accounts)
    const before = state.confidence
    const delta = tickDelta(payload, {
      heldAccounts: heldCount(state),
      clearedPayments: state.clearedSinceTick,
      selectiveReleases: state.releasesSinceTick,
      cashBelowFloor: cash < payload.floor,
    })
    const after = clampConfidence(before + delta)
    let next: BankState = {
      ...state,
      confidence: after,
      clearedSinceTick: 0,
      releasesSinceTick: 0,
    }
    const crossings = downwardCrossings(
      payload,
      before,
      after,
      state.injectedThresholds,
    )
    for (const value of crossings) {
      const threshold = payload.thresholds.find((t) => t.value === value)
      if (!threshold) continue
      for (const inj of threshold.injected) {
        next = applyRequest(
          next,
          inj.id,
          inj.accountId,
          injectedSize(inj.baseAmount, inboundMagnitude),
          true,
        )
      }
      next = {
        ...next,
        injectedThresholds: [...next.injectedThresholds, value].sort(
          (a, b) => a - b,
        ),
      }
    }
    return next
  }

  function reduceScheduled(
    state: BankState,
    event: MissionEvent,
  ): BankState {
    const base = stampDeadline(state, event.now)
    if (event.kind === WAVE_EVENT_KIND) {
      const requestId = (event.payload as { requestId?: string } | null)
        ?.requestId
      if (!requestId) return base
      const def = payload.requests.find((r) => r.id === requestId)
      if (!def) return base
      return applyRequest(base, def.id, def.accountId, def.amount, false)
    }
    if (event.kind === TICK_EVENT_KIND || event.kind === END_EVENT_KIND) {
      return tick(base, event.now, base.injectMagnitude)
    }
    // START, DUE (a player-facing warning the shell reads; PAY is a player
    // action), and any other scheduled event just stamp the deadline.
    return base
  }

  function hold(state: BankState, accountId: string, now: number): BankState {
    if (!holdLegality(payload, state, accountId).legal) return state
    const acct = state.accounts[accountId]
    if (!acct) return state
    const held: BankState = {
      ...state,
      accounts: { ...state.accounts, [accountId]: { ...acct, held: true } },
    }
    return maybeStampBroadHold(held, now)
  }

  function release(state: BankState, accountId: string): BankState {
    if (!releaseLegality(payload, state, accountId).legal) return state
    const acct = state.accounts[accountId]
    if (!acct) return state
    // A selective (sub-broad) release counts toward the next tick's bonus.
    const released: BankState = {
      ...state,
      accounts: { ...state.accounts, [accountId]: { ...acct, held: false } },
      releasesSinceTick: state.releasesSinceTick + 1,
    }
    return released
  }

  function limit(state: BankState, accountId: string, cap: number): BankState {
    if (!limitLegality(payload, state, accountId, cap).legal) return state
    const acct = state.accounts[accountId]
    if (!acct) return state
    return {
      ...state,
      accounts: {
        ...state.accounts,
        [accountId]: { ...acct, limitedTo: cap },
      },
    }
  }

  function pay(state: BankState, paymentId: string): BankState {
    if (!payLegality(payload, state, paymentId).legal) return state
    const def = paymentById(payload, paymentId)
    if (!def) return state
    const acct = state.accounts[def.accountId]
    if (!acct) return state
    const nextAcct: AccountState = {
      ...acct,
      balance: acct.balance - def.amount,
      limitedSpent:
        acct.limitedTo === null
          ? acct.limitedSpent
          : acct.limitedSpent + def.amount,
    }
    return {
      ...state,
      accounts: { ...state.accounts, [def.accountId]: nextAcct },
      payments: { ...state.payments, [paymentId]: { cleared: true } },
      // The confidence bonus lands at the NEXT tick, not inline.
      clearedSinceTick: state.clearedSinceTick + 1,
    }
  }

  /** The before/after-hold withdrawal cross-tab, so the circular logic can
   *  be challenged with numbers: genuine authored withdrawals that arrived
   *  before the broad hold vs after, and injected withdrawals after the hold
   *  (the ones the holds themselves provoked). Counts and amounts. Pure over
   *  substate; feeds evaluate() metrics and the debrief. */
  function crossTab(state: BankState): {
    beforeHoldCount: number
    beforeHoldAmount: number
    genuineAfterHoldCount: number
    genuineAfterHoldAmount: number
    injectedAfterHoldCount: number
    injectedAfterHoldAmount: number
  } {
    let beforeHoldCount = 0
    let beforeHoldAmount = 0
    let genuineAfterHoldCount = 0
    let genuineAfterHoldAmount = 0
    let injectedAfterHoldCount = 0
    let injectedAfterHoldAmount = 0
    for (const rs of Object.values(state.requests)) {
      if (rs.outcome === 'pending') continue
      // Check injected provenance FIRST. An injected (contagion) draw is
      // never a genuine before-hold depositor withdrawal, even when it fires
      // with no active broad hold (arrivedAfterHold false because the hold has
      // not stamped). Counting it as before-hold would corrupt the exact
      // evidence that lets the player challenge WOPR's circular logic, so
      // injected always lands in the injected bucket.
      if (rs.injected) {
        injectedAfterHoldCount += 1
        injectedAfterHoldAmount += rs.appliedAmount
      } else if (!rs.arrivedAfterHold) {
        beforeHoldCount += 1
        beforeHoldAmount += rs.appliedAmount
      } else {
        genuineAfterHoldCount += 1
        genuineAfterHoldAmount += rs.appliedAmount
      }
    }
    return {
      beforeHoldCount,
      beforeHoldAmount,
      genuineAfterHoldCount,
      genuineAfterHoldAmount,
      injectedAfterHoldCount,
      injectedAfterHoldAmount,
    }
  }

  function reduceAction(state: BankState, event: MissionEvent): BankState {
    const base = stampDeadline(state, event.now)
    const action = event.payload as Record<string, unknown>
    const kind = action['kind']
    if (kind === 'HOLD') {
      const accountId = action['accountId']
      if (typeof accountId !== 'string') return base
      return hold(base, accountId, event.now)
    }
    if (kind === 'RELEASE') {
      const accountId = action['accountId']
      if (typeof accountId !== 'string') return base
      return release(base, accountId)
    }
    if (kind === 'LIMIT') {
      const accountId = action['accountId']
      const cap = action['cap']
      if (typeof accountId !== 'string' || typeof cap !== 'number') return base
      return limit(base, accountId, cap)
    }
    if (kind === 'PAY') {
      const paymentId = action['paymentId']
      if (typeof paymentId !== 'string') return base
      return pay(base, paymentId)
    }
    return base
  }

  return {
    id: BANK_MISSION_ID,

    init(
      _seed: SeedDefinition,
      consequences: FoldedConsequences,
      durationMs: number,
    ): BankState {
      const accounts: Record<string, AccountState> = {}
      for (const def of payload.accounts) {
        accounts[def.id] = initialAccountState(def)
      }
      // Inbound consequences fold at init (already capped and
      // order-independent by the engine's canonical fold): paymentsDelayed
      // drains the pinned target account by its capped magnitude, tightening
      // the opening cash position. The inbound flightsDisrupted magnitude is
      // retained and sizes threshold-injected withdrawals (base plus it).
      const paymentsDelayed = consequences.byKind['paymentsDelayed'] ?? 0
      const injectMagnitude = consequences.byKind['flightsDisrupted'] ?? 0
      if (paymentsDelayed > 0) {
        const target = accounts[payload.paymentsDelayedTargetAccountId]
        if (target) {
          // The penalty is NOT clipped at zero: a large enough upstream
          // paymentsDelayed can drive the target balance (and therefore
          // derived cash) negative, which is the second real collapse path
          // terminal() reads against the authored collapse floor. Account
          // draws are separately clamped so they never deepen a negative.
          accounts[payload.paymentsDelayedTargetAccountId] = {
            ...target,
            balance: target.balance - paymentsDelayed,
          }
        }
      }
      const requests: Record<string, RequestState> = {}
      for (const def of payload.requests) {
        requests[def.id] = {
          outcome: 'pending',
          appliedAmount: 0,
          arrivedAfterHold: false,
          injected: false,
        }
      }
      const payments: Record<string, { cleared: boolean }> = {}
      for (const def of payload.payments) {
        payments[def.id] = { cleared: false }
      }
      return {
        accounts,
        requests,
        payments,
        confidence: payload.startingConfidence,
        firstBroadHoldAt: null,
        injectedThresholds: [],
        clearedSinceTick: 0,
        releasesSinceTick: 0,
        injectMagnitude,
        durationMs,
        endsAt: null,
      }
    },

    validate(state, payloadIn) {
      const action = payloadIn as Record<string, unknown> | null
      if (!action || typeof action['kind'] !== 'string') {
        return { valid: false, reason: 'MALFORMED ACTION' }
      }
      switch (action['kind']) {
        case 'HOLD': {
          const accountId = action['accountId']
          if (typeof accountId !== 'string') {
            return { valid: false, reason: 'NO ACCOUNT SELECTED' }
          }
          const legality = holdLegality(payload, state, accountId)
          return legality.legal
            ? { valid: true }
            : { valid: false, reason: legality.reason }
        }
        case 'RELEASE': {
          const accountId = action['accountId']
          if (typeof accountId !== 'string') {
            return { valid: false, reason: 'NO ACCOUNT SELECTED' }
          }
          const legality = releaseLegality(payload, state, accountId)
          return legality.legal
            ? { valid: true }
            : { valid: false, reason: legality.reason }
        }
        case 'LIMIT': {
          const accountId = action['accountId']
          const cap = action['cap']
          if (typeof accountId !== 'string') {
            return { valid: false, reason: 'NO ACCOUNT SELECTED' }
          }
          if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 0) {
            return { valid: false, reason: 'BAD LIMIT CAP' }
          }
          const legality = limitLegality(payload, state, accountId, cap)
          return legality.legal
            ? { valid: true }
            : { valid: false, reason: legality.reason }
        }
        case 'PAY': {
          const paymentId = action['paymentId']
          if (typeof paymentId !== 'string') {
            return { valid: false, reason: 'NO PAYMENT SELECTED' }
          }
          const legality = payLegality(payload, state, paymentId)
          return legality.legal
            ? { valid: true }
            : { valid: false, reason: legality.reason }
        }
        default:
          return { valid: false, reason: 'UNKNOWN ACTION' }
      }
    },

    reduce(state, event: MissionEvent): BankState {
      return event.type === 'scheduled'
        ? reduceScheduled(state, event)
        : reduceAction(state, event)
    },

    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
      const cash = derivedCashOf(state.accounts)
      const signals = sustainabilitySignals(payload, state, cash)
      const count = signalCount(signals)
      // collapsed always evaluates failed; every other cause scores the real
      // sustainability signals. Mass-holding inflates no signal here.
      const tier =
        cause === 'collapsed'
          ? 'failed'
          : tierFromSignals(count, payload.tierThresholds)
      const magnitude = payload.paymentsDelayedTable[tier]
      let cleared = 0
      for (const p of payload.payments) {
        if (state.payments[p.id]?.cleared) cleared += 1
      }
      const ct = crossTab(state)
      return {
        missionId: BANK_MISSION_ID,
        cause,
        tier,
        metrics: {
          sustainability_signals: count,
          payments_cleared: cleared,
          payments_total: payload.payments.length,
          derived_cash: cash,
          confidence: state.confidence,
          held_accounts: heldCount(state),
          payments_signal: signals.paymentsCleared ? 1 : 0,
          cash_signal: signals.cashAtOrAboveFloor ? 1 : 0,
          confidence_signal: signals.confidenceAtOrAboveTarget ? 1 : 0,
          before_hold_count: ct.beforeHoldCount,
          before_hold_amount: ct.beforeHoldAmount,
          genuine_after_hold_count: ct.genuineAfterHoldCount,
          genuine_after_hold_amount: ct.genuineAfterHoldAmount,
          injected_after_hold_count: ct.injectedAfterHoldCount,
          injected_after_hold_amount: ct.injectedAfterHoldAmount,
        },
        clueId: null,
        consequences:
          magnitude > 0
            ? [{ id: 'cq-bank', kind: 'paymentsDelayed', magnitude }]
            : [],
      }
    },

    drainEmitted(prev: BankState, next: BankState): readonly EngineEvent[] {
      // A downward confidence crossing grows injectedThresholds inside the tick
      // reduce. Diff the prior and next consumed-threshold sets and emit one
      // DISTINCT crossing event per newly consumed threshold, carrying its
      // integer value, so the shell keys its cue off the event's identity
      // rather than diffing substate. Pure over (prev, next) and
      // replay-reproducible: a plain tick that crosses nothing emits nothing.
      if (next.injectedThresholds.length === prev.injectedThresholds.length) {
        return []
      }
      const before = new Set(prev.injectedThresholds)
      const events: EngineEvent[] = []
      for (const value of next.injectedThresholds) {
        if (!before.has(value)) {
          events.push({ type: 'bankThresholdCrossed', threshold: value })
        }
      }
      return events
    },

    terminal(state) {
      if (state.endsAt === null) return null
      // No early 'completed': sustainable play is judged at the deadline, not
      // raced. Two real collapse causes, both early settlements on a broken
      // line: depositor confidence hitting zero, and DERIVED cash falling
      // strictly below the authored collapse floor (an upstream paymentsDelayed
      // penalty can drive a targeted balance, and so derived cash, negative).
      if (state.confidence <= 0) return 'collapsed'
      if (derivedCashOf(state.accounts) < payload.collapseFloor) {
        return 'collapsed'
      }
      return null
    },

    debrief(outcome: SettledOutcome): DebriefPayload {
      const m = outcome.metrics
      const lines: string[] = [
        `PAYMENTS CLEARED ${m['payments_cleared'] ?? 0} OF ${m['payments_total'] ?? 0}`,
        `DERIVED CASH ${m['derived_cash'] ?? 0}`,
        `CONFIDENCE ${m['confidence'] ?? 0}`,
        `HELD ACCOUNTS ${m['held_accounts'] ?? 0}`,
        `SUSTAINABILITY SIGNALS ${m['sustainability_signals'] ?? 0} OF 3`,
        `WITHDRAWALS BEFORE HOLD ${m['before_hold_count'] ?? 0} (${m['before_hold_amount'] ?? 0})`,
        `GENUINE WITHDRAWALS AFTER HOLD ${m['genuine_after_hold_count'] ?? 0} (${m['genuine_after_hold_amount'] ?? 0})`,
        `INJECTED WITHDRAWALS AFTER HOLD ${m['injected_after_hold_count'] ?? 0} (${m['injected_after_hold_amount'] ?? 0})`,
      ]
      lines.push(`CLUE ${outcome.clueId ? 'FOUND' : 'NOT FOUND'}`)
      return {
        missionId: outcome.missionId,
        headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
        lines,
        clueId: outcome.clueId,
      }
    },

    saveSchema: bankSaveSchema,
  }
}
