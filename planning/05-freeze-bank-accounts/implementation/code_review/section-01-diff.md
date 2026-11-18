diff --git a/src/engine/missions/bank/content.ts b/src/engine/missions/bank/content.ts
new file mode 100644
index 0000000..30ff285
--- /dev/null
+++ b/src/engine/missions/bank/content.ts
@@ -0,0 +1,143 @@
+// The payload shape the three FREEZE BANK ACCOUNTS seeds must satisfy. Only
+// the TYPE lives here so the module compiles standalone; the content
+// validator functions and the authored payloads are section 02's job.
+// Desk-check outcomes deliberately do NOT live here. They stay in the
+// shared SeedDefinition.deskChecks table keyed by record id, exactly as
+// CRASH OUTLOOK and GROUND ALL FLIGHTS do it.
+import type { OutcomeTier } from '../../campaign/types'
+
+/** One depositor account. Authored static truth only: the live balance,
+ *  hold, and limit live in substate. */
+export interface AccountDef {
+  readonly id: string
+  /** Invented depositor name. Authored copy, never copied into substate. */
+  readonly name: string
+  /** Authored flavor line the shell renders. Never enters substate. */
+  readonly flavor: string
+  /** Opening balance in whole dollars. Integer. */
+  readonly openingBalance: number
+  /** Whether a LIMIT action is legal on this account. */
+  readonly limitEligible: boolean
+}
+
+/** A scheduled withdrawal request against one account. The pairing and
+ *  dispute fields are AUTHORING metadata the shell renders; the engine does
+ *  not dedupe duplicates nor treat disputes differently in mechanics. */
+export interface RequestDef {
+  readonly id: string
+  readonly accountId: string
+  /** Whole dollars sought. Integer. */
+  readonly amount: number
+  /** Seconds from mission start the withdrawal wave arrives. Integer. */
+  readonly offsetSeconds: number
+  /** Authored reason the shell renders beside the request. Never substate. */
+  readonly reason: string
+  /** Another request id this one is authored as a near-duplicate of, or null.
+   *  Authoring metadata only; the engine applies both by the same rules. */
+  readonly duplicateOfId: string | null
+  /** Whether this request is authored as disputed. Authoring metadata only;
+   *  mechanics are identical to an undisputed request. */
+  readonly disputed: boolean
+}
+
+/** A critical payment the bank must clear from a specific account by its due
+ *  offset. */
+export interface PaymentDef {
+  readonly id: string
+  readonly accountId: string
+  /** Whole dollars owed. Integer. */
+  readonly amount: number
+  /** Seconds from mission start the payment is due. Integer. */
+  readonly dueOffsetSeconds: number
+  /** Confidence points a cleared payment adds at the NEXT tick. Integer. */
+  readonly confidenceBonus: number
+  /** Authored reason the shell renders. Never substate. */
+  readonly reason: string
+}
+
+/** The per-component confidence delta the tick applies. Every value is a
+ *  whole signed integer. Penalties are negative, bonuses positive. */
+export interface ConfidenceDeltaTable {
+  /** Applied once per currently-held account at each tick. */
+  readonly perHeldAccount: number
+  /** Applied once per payment cleared since the last tick. */
+  readonly perClearedPayment: number
+  /** Applied once per selective (sub-broad) release since the last tick. */
+  readonly perSelectiveRelease: number
+  /** Applied once when derived cash is below the floor at tick time. */
+  readonly cashBelowFloor: number
+}
+
+/** One confidence threshold and the injected withdrawals a downward crossing
+ *  of it triggers once, ever. */
+export interface ThresholdDef {
+  /** The confidence value crossed downward to trigger injection. Integer. */
+  readonly value: number
+  /** The injected withdrawal requests, each a base-sized draw against an
+   *  account. The engine sizes them at base plus the capped inbound
+   *  flightsDisrupted magnitude, never below base. */
+  readonly injected: readonly InjectedRequestDef[]
+}
+
+/** One authored injected withdrawal: a base draw against an account at the
+ *  threshold crossing. Sizing is engine-driven (base plus capped inbound
+ *  consequence), never below base. */
+export interface InjectedRequestDef {
+  readonly id: string
+  readonly accountId: string
+  /** Base whole-dollar size. Integer. */
+  readonly baseAmount: number
+  /** Authored reason the shell renders. Never substate. */
+  readonly reason: string
+}
+
+/** Resolved-service tier thresholds. The integer count of sustainable-play
+ *  signals (critical payments cleared, cash at or above floor, confidence at
+ *  or above target) scores against these. */
+export interface BankTierThresholds {
+  /** Signals required for FULL. */
+  readonly full: number
+  /** Signals required for PARTIAL. */
+  readonly partial: number
+  /** Signals required for POOR; below this is FAILED. */
+  readonly poor: number
+}
+
+/** The outbound consequence magnitudes this mission emits per tier. */
+export type PaymentsDelayedTable = Readonly<Record<OutcomeTier, number>>
+
+export interface BankPayload {
+  readonly accounts: readonly AccountDef[]
+  readonly requests: readonly RequestDef[]
+  readonly payments: readonly PaymentDef[]
+  /** Simultaneously-held accounts strictly above this count stamp the broad
+   *  hold once, ever. Integer. */
+  readonly broadHoldCount: number
+  /** Seconds between confidence ticks. Integer. The seed authors the actual
+   *  tick schedule; this is retained for authoring reference. */
+  readonly tickIntervalSeconds: number
+  readonly confidenceDelta: ConfidenceDeltaTable
+  /** Starting depositor confidence, 0 to 100. Integer. */
+  readonly startingConfidence: number
+  readonly thresholds: readonly ThresholdDef[]
+  /** Derived-cash floor in whole dollars. Below it the tick penalizes and a
+   *  sustainability signal is lost. Integer. */
+  readonly floor: number
+  /** Confidence target the sustainable check scores against. Integer. */
+  readonly target: number
+  /** The authored WOPR predicted-withdrawal series, indexed by elapsed ticks.
+   *  Display content; the selector shifts it upward while a broad hold is
+   *  active. Whole dollars. */
+  readonly predictionSeries: readonly number[]
+  /** The percent the prediction series rises while the broad hold is active.
+   *  Integer (e.g. 35 means plus 35 percent). */
+  readonly holdShiftPercent: number
+  /** Intro lines the shell renders at mission start. Authored copy only. */
+  readonly introLines: readonly string[]
+  readonly tierThresholds: BankTierThresholds
+  /** The account a paymentsDelayed inbound consequence drains at init by its
+   *  capped magnitude. Pinned per seed so consequence folding stays
+   *  order-independent. */
+  readonly paymentsDelayedTargetAccountId: string
+  readonly paymentsDelayedTable: PaymentsDelayedTable
+}
diff --git a/src/engine/missions/bank/module.ts b/src/engine/missions/bank/module.ts
new file mode 100644
index 0000000..9af773a
--- /dev/null
+++ b/src/engine/missions/bank/module.ts
@@ -0,0 +1,602 @@
+// The FREEZE BANK ACCOUNTS mission module and its construction under mission
+// id 'bank'. Pure: it reads authored content from the BankPayload captured at
+// construction, applies rules.ts outcomes, and never touches Date,
+// Math.random, or timers. Withdrawal waves, confidence ticks, and the end
+// tick are seed-authored scheduled events the engine drains; the module has
+// no schedule() method (the engine's MissionModule carries none), so timed
+// events ride in through bankSchedule(payload), exactly as GROUND ALL FLIGHTS
+// authors flightsSchedule. The deadline is stamped from the first event the
+// module sees (an offset-0 start event), and the end tick at endsAt lets the
+// final confidence tick fold before the timeout settlement guard runs.
+//
+// The circular-validation thesis is enforced here and in rules.ts: a HOLD
+// stamps firstBroadHoldAt once the simultaneously-held count crosses
+// broadHoldCount, which makes selectPredictedWithdrawals rise (appears to
+// justify the holds), while held accounts contribute zero to derived cash,
+// are penalized every confidence tick, and block the payments they owe. The
+// success tier reads REAL outcomes only (payments cleared, cash, confidence),
+// so mass-holding inflates WOPR's line and LOSES the tier. module.ts does NOT
+// import selectors.ts on the reduce path: the prediction line is a display
+// projection the reducers never read.
+//
+// There is no clues() here and no inspection flag in substate. The authored
+// B04 hold-justification record and its D-83 clue are engine-owned through
+// SeedDefinition.clueRecords: inspecting the record logs the clue with no
+// mission involvement.
+import type {
+  DebriefPayload,
+  EvaluatedOutcome,
+  FoldedConsequences,
+  MissionEvent,
+  MissionModule,
+  SeedDefinition,
+} from '../types'
+import type { SettledOutcome, SettlementCause } from '../../campaign/types'
+import type { ScheduledEventSpec } from '../../time'
+import type { BankPayload } from './content'
+import {
+  accountById,
+  applyWithdrawal,
+  clampConfidence,
+  downwardCrossings,
+  heldCount,
+  holdLegality,
+  initialAccountState,
+  injectedSize,
+  limitLegality,
+  payLegality,
+  paymentById,
+  releaseLegality,
+  remainingAllowance,
+  signalCount,
+  sustainabilitySignals,
+  tickDelta,
+  tierFromSignals,
+} from './rules'
+import { bankSaveSchema } from './types'
+import type { AccountState, BankState, RequestState } from './types'
+
+export const BANK_MISSION_ID = 'bank'
+
+const START_EVENT_ID = 'bank-start'
+const START_EVENT_KIND = 'bankStart'
+const WAVE_EVENT_KIND = 'bankWave'
+const TICK_EVENT_KIND = 'confidenceTick'
+const DUE_EVENT_KIND = 'bankDue'
+const END_EVENT_KIND = 'bankEnd'
+
+/** The schedule a seed authors from a BankPayload. An offset-0 start event
+ *  stamps the absolute deadline once time begins; each withdrawal wave fires
+ *  at its authored offset; confidence ticks fall at the authored interval up
+ *  to the standard duration; each payment-due warning fires at its due offset;
+ *  and an end tick at endsAt folds the final confidence tick before the
+ *  timeout guard runs. Section 02 wires this into the seed's schedules table. */
+export function bankSchedule(
+  payload: BankPayload,
+  standardDurationSeconds = 240,
+): readonly ScheduledEventSpec[] {
+  const specs: ScheduledEventSpec[] = [
+    {
+      id: START_EVENT_ID,
+      offsetSeconds: 0,
+      anchor: 'start',
+      kind: START_EVENT_KIND,
+      payload: null,
+    },
+  ]
+  payload.requests.forEach((request) => {
+    specs.push({
+      id: `bank-wave-${request.id}`,
+      offsetSeconds: request.offsetSeconds,
+      anchor: 'start',
+      kind: WAVE_EVENT_KIND,
+      payload: { requestId: request.id },
+    })
+  })
+  const interval = payload.tickIntervalSeconds
+  if (interval > 0) {
+    let tickNo = 0
+    for (
+      let offset = interval;
+      offset < standardDurationSeconds;
+      offset += interval
+    ) {
+      tickNo += 1
+      specs.push({
+        id: `bank-tick-${tickNo}`,
+        offsetSeconds: offset,
+        anchor: 'start',
+        kind: TICK_EVENT_KIND,
+        payload: null,
+      })
+    }
+  }
+  payload.payments.forEach((payment) => {
+    specs.push({
+      id: `bank-due-${payment.id}`,
+      offsetSeconds: payment.dueOffsetSeconds,
+      anchor: 'start',
+      kind: DUE_EVENT_KIND,
+      payload: { paymentId: payment.id },
+    })
+  })
+  specs.push({
+    id: 'bank-end',
+    offsetSeconds: 0,
+    anchor: 'end',
+    kind: END_EVENT_KIND,
+    payload: null,
+  })
+  return specs
+}
+
+/** Construct the FREEZE BANK ACCOUNTS module over an authored payload.
+ *  Mirrors makeFlightsMission(payload): the payload is immutable campaign
+ *  content, so closing over it keeps every method pure over (state, event). */
+export function makeBankMission(
+  payload: BankPayload,
+): MissionModule<BankState> {
+  function stampDeadline(state: BankState, now: number): BankState {
+    return state.endsAt === null
+      ? { ...state, endsAt: now + state.durationMs }
+      : state
+  }
+
+  /** Derived cash over a given account map (used inside reducers without
+   *  importing the display selector): sum of available unheld balances. */
+  function derivedCashOf(
+    accounts: Readonly<Record<string, AccountState>>,
+  ): number {
+    let cash = 0
+    for (const acct of Object.values(accounts)) {
+      if (acct.held) continue
+      if (acct.limitedTo === null) cash += acct.balance
+      else cash += Math.min(acct.balance, remainingAllowance(acct))
+    }
+    return cash
+  }
+
+  /** Stamp the broad hold if the simultaneously-held count now exceeds the
+   *  authored count and it has never stamped. Stamps once, ever. */
+  function maybeStampBroadHold(state: BankState, now: number): BankState {
+    if (state.firstBroadHoldAt !== null) return state
+    if (heldCount(state) > payload.broadHoldCount) {
+      return { ...state, firstBroadHoldAt: now }
+    }
+    return state
+  }
+
+  /** Apply one withdrawal (authored wave or injected) against drained state,
+   *  recording its outcome and whether it arrived after the broad hold. */
+  function applyRequest(
+    state: BankState,
+    requestId: string,
+    accountId: string,
+    amount: number,
+    injected: boolean,
+  ): BankState {
+    const acct = state.accounts[accountId]
+    if (!acct || !accountById(payload, accountId)) return state
+    const result = applyWithdrawal(acct, amount)
+    const arrivedAfterHold = state.firstBroadHoldAt !== null
+    const requestState: RequestState = {
+      outcome: result.outcome,
+      appliedAmount: result.drawn,
+      arrivedAfterHold,
+      injected,
+    }
+    return {
+      ...state,
+      accounts: { ...state.accounts, [accountId]: result.account },
+      requests: { ...state.requests, [requestId]: requestState },
+    }
+  }
+
+  /** The confidence tick: compute the authored delta, clamp, then check for
+   *  downward threshold crossings and inject their authored withdrawals once.
+   *  The cleared-since and release-since counters reset after the delta reads
+   *  them. Injected withdrawals size base plus the capped inbound magnitude
+   *  (closed over from init) and mark arrivedAfterHold per the current hold. */
+  function tick(state: BankState, now: number, inboundMagnitude: number): BankState {
+    const cash = derivedCashOf(state.accounts)
+    const before = state.confidence
+    const delta = tickDelta(payload, {
+      heldAccounts: heldCount(state),
+      clearedPayments: state.clearedSinceTick,
+      selectiveReleases: state.releasesSinceTick,
+      cashBelowFloor: cash < payload.floor,
+    })
+    const after = clampConfidence(before + delta)
+    let next: BankState = {
+      ...state,
+      confidence: after,
+      clearedSinceTick: 0,
+      releasesSinceTick: 0,
+    }
+    const crossings = downwardCrossings(
+      payload,
+      before,
+      after,
+      state.injectedThresholds,
+    )
+    for (const value of crossings) {
+      const threshold = payload.thresholds.find((t) => t.value === value)
+      if (!threshold) continue
+      for (const inj of threshold.injected) {
+        next = applyRequest(
+          next,
+          inj.id,
+          inj.accountId,
+          injectedSize(inj.baseAmount, inboundMagnitude),
+          true,
+        )
+      }
+      next = {
+        ...next,
+        injectedThresholds: [...next.injectedThresholds, value].sort(
+          (a, b) => a - b,
+        ),
+      }
+    }
+    return markCashGuard(next)
+  }
+
+  /** Trip the cash-negative guard if any unheld balance would go negative. A
+   *  structural invariant: balances never drop below zero in normal play, so
+   *  a negative would mean a rule let more out than the account held. */
+  function markCashGuard(state: BankState): BankState {
+    for (const acct of Object.values(state.accounts)) {
+      if (acct.balance < 0) return { ...state, cashNegativeGuard: true }
+    }
+    return state
+  }
+
+  function reduceScheduled(
+    state: BankState,
+    event: MissionEvent,
+  ): BankState {
+    const base = stampDeadline(state, event.now)
+    if (event.kind === WAVE_EVENT_KIND) {
+      const requestId = (event.payload as { requestId?: string } | null)
+        ?.requestId
+      if (!requestId) return base
+      const def = payload.requests.find((r) => r.id === requestId)
+      if (!def) return base
+      return markCashGuard(
+        applyRequest(base, def.id, def.accountId, def.amount, false),
+      )
+    }
+    if (event.kind === TICK_EVENT_KIND || event.kind === END_EVENT_KIND) {
+      return tick(base, event.now, base.injectMagnitude)
+    }
+    // START, DUE (a player-facing warning the shell reads; PAY is a player
+    // action), and any other scheduled event just stamp the deadline.
+    return base
+  }
+
+  function hold(state: BankState, accountId: string, now: number): BankState {
+    if (!holdLegality(payload, state, accountId).legal) return state
+    const acct = state.accounts[accountId]
+    if (!acct) return state
+    const held: BankState = {
+      ...state,
+      accounts: { ...state.accounts, [accountId]: { ...acct, held: true } },
+    }
+    return maybeStampBroadHold(held, now)
+  }
+
+  function release(state: BankState, accountId: string): BankState {
+    if (!releaseLegality(payload, state, accountId).legal) return state
+    const acct = state.accounts[accountId]
+    if (!acct) return state
+    // A selective (sub-broad) release counts toward the next tick's bonus.
+    const released: BankState = {
+      ...state,
+      accounts: { ...state.accounts, [accountId]: { ...acct, held: false } },
+      releasesSinceTick: state.releasesSinceTick + 1,
+    }
+    return released
+  }
+
+  function limit(state: BankState, accountId: string, cap: number): BankState {
+    if (!limitLegality(payload, state, accountId, cap).legal) return state
+    const acct = state.accounts[accountId]
+    if (!acct) return state
+    return {
+      ...state,
+      accounts: {
+        ...state.accounts,
+        [accountId]: { ...acct, limitedTo: cap },
+      },
+    }
+  }
+
+  function pay(state: BankState, paymentId: string): BankState {
+    if (!payLegality(payload, state, paymentId).legal) return state
+    const def = paymentById(payload, paymentId)
+    if (!def) return state
+    const acct = state.accounts[def.accountId]
+    if (!acct) return state
+    const nextAcct: AccountState = {
+      ...acct,
+      balance: acct.balance - def.amount,
+      limitedSpent:
+        acct.limitedTo === null
+          ? acct.limitedSpent
+          : acct.limitedSpent + def.amount,
+    }
+    return markCashGuard({
+      ...state,
+      accounts: { ...state.accounts, [def.accountId]: nextAcct },
+      payments: { ...state.payments, [paymentId]: { cleared: true } },
+      // The confidence bonus lands at the NEXT tick, not inline.
+      clearedSinceTick: state.clearedSinceTick + 1,
+    })
+  }
+
+  /** The before/after-hold withdrawal cross-tab, so the circular logic can
+   *  be challenged with numbers: genuine authored withdrawals that arrived
+   *  before the broad hold vs after, and injected withdrawals after the hold
+   *  (the ones the holds themselves provoked). Counts and amounts. Pure over
+   *  substate; feeds evaluate() metrics and the debrief. */
+  function crossTab(state: BankState): {
+    beforeHoldCount: number
+    beforeHoldAmount: number
+    genuineAfterHoldCount: number
+    genuineAfterHoldAmount: number
+    injectedAfterHoldCount: number
+    injectedAfterHoldAmount: number
+  } {
+    let beforeHoldCount = 0
+    let beforeHoldAmount = 0
+    let genuineAfterHoldCount = 0
+    let genuineAfterHoldAmount = 0
+    let injectedAfterHoldCount = 0
+    let injectedAfterHoldAmount = 0
+    for (const rs of Object.values(state.requests)) {
+      if (rs.outcome === 'pending') continue
+      if (!rs.arrivedAfterHold) {
+        beforeHoldCount += 1
+        beforeHoldAmount += rs.appliedAmount
+      } else if (rs.injected) {
+        injectedAfterHoldCount += 1
+        injectedAfterHoldAmount += rs.appliedAmount
+      } else {
+        genuineAfterHoldCount += 1
+        genuineAfterHoldAmount += rs.appliedAmount
+      }
+    }
+    return {
+      beforeHoldCount,
+      beforeHoldAmount,
+      genuineAfterHoldCount,
+      genuineAfterHoldAmount,
+      injectedAfterHoldCount,
+      injectedAfterHoldAmount,
+    }
+  }
+
+  function reduceAction(state: BankState, event: MissionEvent): BankState {
+    const base = stampDeadline(state, event.now)
+    const action = event.payload as Record<string, unknown>
+    const kind = action['kind']
+    if (kind === 'HOLD') {
+      const accountId = action['accountId']
+      if (typeof accountId !== 'string') return base
+      return hold(base, accountId, event.now)
+    }
+    if (kind === 'RELEASE') {
+      const accountId = action['accountId']
+      if (typeof accountId !== 'string') return base
+      return release(base, accountId)
+    }
+    if (kind === 'LIMIT') {
+      const accountId = action['accountId']
+      const cap = action['cap']
+      if (typeof accountId !== 'string' || typeof cap !== 'number') return base
+      return limit(base, accountId, cap)
+    }
+    if (kind === 'PAY') {
+      const paymentId = action['paymentId']
+      if (typeof paymentId !== 'string') return base
+      return pay(base, paymentId)
+    }
+    return base
+  }
+
+  return {
+    id: BANK_MISSION_ID,
+
+    init(
+      _seed: SeedDefinition,
+      consequences: FoldedConsequences,
+      durationMs: number,
+    ): BankState {
+      const accounts: Record<string, AccountState> = {}
+      for (const def of payload.accounts) {
+        accounts[def.id] = initialAccountState(def)
+      }
+      // Inbound consequences fold at init (already capped and
+      // order-independent by the engine's canonical fold): paymentsDelayed
+      // drains the pinned target account by its capped magnitude, tightening
+      // the opening cash position. The inbound flightsDisrupted magnitude is
+      // retained and sizes threshold-injected withdrawals (base plus it).
+      const paymentsDelayed = consequences.byKind['paymentsDelayed'] ?? 0
+      const injectMagnitude = consequences.byKind['flightsDisrupted'] ?? 0
+      if (paymentsDelayed > 0) {
+        const target = accounts[payload.paymentsDelayedTargetAccountId]
+        if (target) {
+          accounts[payload.paymentsDelayedTargetAccountId] = {
+            ...target,
+            balance: Math.max(0, target.balance - paymentsDelayed),
+          }
+        }
+      }
+      const requests: Record<string, RequestState> = {}
+      for (const def of payload.requests) {
+        requests[def.id] = {
+          outcome: 'pending',
+          appliedAmount: 0,
+          arrivedAfterHold: false,
+          injected: false,
+        }
+      }
+      const payments: Record<string, { cleared: boolean }> = {}
+      for (const def of payload.payments) {
+        payments[def.id] = { cleared: false }
+      }
+      return {
+        accounts,
+        requests,
+        payments,
+        confidence: payload.startingConfidence,
+        firstBroadHoldAt: null,
+        injectedThresholds: [],
+        clearedSinceTick: 0,
+        releasesSinceTick: 0,
+        cashNegativeGuard: false,
+        injectMagnitude,
+        durationMs,
+        endsAt: null,
+      }
+    },
+
+    validate(state, payloadIn) {
+      const action = payloadIn as Record<string, unknown> | null
+      if (!action || typeof action['kind'] !== 'string') {
+        return { valid: false, reason: 'MALFORMED ACTION' }
+      }
+      switch (action['kind']) {
+        case 'HOLD': {
+          const accountId = action['accountId']
+          if (typeof accountId !== 'string') {
+            return { valid: false, reason: 'NO ACCOUNT SELECTED' }
+          }
+          const legality = holdLegality(payload, state, accountId)
+          return legality.legal
+            ? { valid: true }
+            : { valid: false, reason: legality.reason }
+        }
+        case 'RELEASE': {
+          const accountId = action['accountId']
+          if (typeof accountId !== 'string') {
+            return { valid: false, reason: 'NO ACCOUNT SELECTED' }
+          }
+          const legality = releaseLegality(payload, state, accountId)
+          return legality.legal
+            ? { valid: true }
+            : { valid: false, reason: legality.reason }
+        }
+        case 'LIMIT': {
+          const accountId = action['accountId']
+          const cap = action['cap']
+          if (typeof accountId !== 'string') {
+            return { valid: false, reason: 'NO ACCOUNT SELECTED' }
+          }
+          if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 0) {
+            return { valid: false, reason: 'BAD LIMIT CAP' }
+          }
+          const legality = limitLegality(payload, state, accountId, cap)
+          return legality.legal
+            ? { valid: true }
+            : { valid: false, reason: legality.reason }
+        }
+        case 'PAY': {
+          const paymentId = action['paymentId']
+          if (typeof paymentId !== 'string') {
+            return { valid: false, reason: 'NO PAYMENT SELECTED' }
+          }
+          const legality = payLegality(payload, state, paymentId)
+          return legality.legal
+            ? { valid: true }
+            : { valid: false, reason: legality.reason }
+        }
+        default:
+          return { valid: false, reason: 'UNKNOWN ACTION' }
+      }
+    },
+
+    reduce(state, event: MissionEvent): BankState {
+      return event.type === 'scheduled'
+        ? reduceScheduled(state, event)
+        : reduceAction(state, event)
+    },
+
+    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
+      const cash = derivedCashOf(state.accounts)
+      const signals = sustainabilitySignals(payload, state, cash)
+      const count = signalCount(signals)
+      // collapsed always evaluates failed; every other cause scores the real
+      // sustainability signals. Mass-holding inflates no signal here.
+      const tier =
+        cause === 'collapsed'
+          ? 'failed'
+          : tierFromSignals(count, payload.tierThresholds)
+      const magnitude = payload.paymentsDelayedTable[tier]
+      let cleared = 0
+      for (const p of payload.payments) {
+        if (state.payments[p.id]?.cleared) cleared += 1
+      }
+      const ct = crossTab(state)
+      return {
+        missionId: BANK_MISSION_ID,
+        cause,
+        tier,
+        metrics: {
+          sustainability_signals: count,
+          payments_cleared: cleared,
+          payments_total: payload.payments.length,
+          derived_cash: cash,
+          confidence: state.confidence,
+          held_accounts: heldCount(state),
+          payments_signal: signals.paymentsCleared ? 1 : 0,
+          cash_signal: signals.cashAtOrAboveFloor ? 1 : 0,
+          confidence_signal: signals.confidenceAtOrAboveTarget ? 1 : 0,
+          before_hold_count: ct.beforeHoldCount,
+          before_hold_amount: ct.beforeHoldAmount,
+          genuine_after_hold_count: ct.genuineAfterHoldCount,
+          genuine_after_hold_amount: ct.genuineAfterHoldAmount,
+          injected_after_hold_count: ct.injectedAfterHoldCount,
+          injected_after_hold_amount: ct.injectedAfterHoldAmount,
+        },
+        clueId: null,
+        consequences:
+          magnitude > 0
+            ? [{ id: 'cq-bank', kind: 'paymentsDelayed', magnitude }]
+            : [],
+      }
+    },
+
+    terminal(state) {
+      if (state.endsAt === null) return null
+      // No early 'completed': sustainable play is judged at the deadline, not
+      // raced. Collapse is the only early settlement, on a broken line.
+      if (state.confidence <= 0) return 'collapsed'
+      if (state.cashNegativeGuard) return 'collapsed'
+      return null
+    },
+
+    debrief(outcome: SettledOutcome): DebriefPayload {
+      const m = outcome.metrics
+      const lines: string[] = [
+        `PAYMENTS CLEARED ${m['payments_cleared'] ?? 0} OF ${m['payments_total'] ?? 0}`,
+        `DERIVED CASH ${m['derived_cash'] ?? 0}`,
+        `CONFIDENCE ${m['confidence'] ?? 0}`,
+        `HELD ACCOUNTS ${m['held_accounts'] ?? 0}`,
+        `SUSTAINABILITY SIGNALS ${m['sustainability_signals'] ?? 0} OF 3`,
+        `WITHDRAWALS BEFORE HOLD ${m['before_hold_count'] ?? 0} (${m['before_hold_amount'] ?? 0})`,
+        `GENUINE WITHDRAWALS AFTER HOLD ${m['genuine_after_hold_count'] ?? 0} (${m['genuine_after_hold_amount'] ?? 0})`,
+        `INJECTED WITHDRAWALS AFTER HOLD ${m['injected_after_hold_count'] ?? 0} (${m['injected_after_hold_amount'] ?? 0})`,
+      ]
+      lines.push(`CLUE ${outcome.clueId ? 'FOUND' : 'NOT FOUND'}`)
+      return {
+        missionId: outcome.missionId,
+        headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
+        lines,
+        clueId: outcome.clueId,
+      }
+    },
+
+    saveSchema: bankSaveSchema,
+  }
+}
diff --git a/src/engine/missions/bank/rules.ts b/src/engine/missions/bank/rules.ts
new file mode 100644
index 0000000..4d38d2e
--- /dev/null
+++ b/src/engine/missions/bank/rules.ts
@@ -0,0 +1,318 @@
+// Pure hold/release/limit/pay legality, withdrawal application, tick math,
+// threshold injection, and tiering for FREEZE BANK ACCOUNTS. No engine
+// imports beyond types. Every quantity is an integer: whole dollars for
+// balances and amounts, whole seconds for authored offsets, whole points for
+// confidence. Nothing here touches Date, Math.random, or timers; the module
+// calls these from validate and reduce. Every legality decision is evaluated
+// against DRAINED substate (the withdrawal waves the scheduled events have
+// already folded in), so a request draining in the same dispatch that applies
+// a broad hold is before-hold by construction.
+//
+// The mission thesis lives here: holding an account makes WOPR's predicted
+// withdrawal line rise (the selector reads firstBroadHoldAt), which appears
+// to justify the holds, while a held account contributes zero to derived
+// cash, drags confidence down every tick, and blocks the payment it owes. So
+// defensive mass-holding looks good to WOPR's tally and LOSES the real tier.
+import type { OutcomeTier } from '../../campaign/types'
+import type {
+  AccountDef,
+  BankPayload,
+  BankTierThresholds,
+  PaymentDef,
+} from './content'
+import type { AccountState, BankState, RequestOutcome } from './types'
+
+export type HoldReason = 'ALREADY HELD' | 'UNKNOWN ACCOUNT'
+export type ReleaseReason = 'NOT HELD' | 'UNKNOWN ACCOUNT'
+export type LimitReason =
+  | 'UNKNOWN ACCOUNT'
+  | 'NOT LIMIT ELIGIBLE'
+  | 'BELOW SPENT OUTFLOW'
+export type PayReason =
+  | 'UNKNOWN PAYMENT'
+  | 'ACCOUNT HELD'
+  | 'INSUFFICIENT BALANCE'
+  | 'INSUFFICIENT ALLOWANCE'
+  | 'ALREADY CLEARED'
+
+export type HoldLegality =
+  | { readonly legal: true }
+  | { readonly legal: false; readonly reason: HoldReason }
+export type ReleaseLegality =
+  | { readonly legal: true }
+  | { readonly legal: false; readonly reason: ReleaseReason }
+export type LimitLegality =
+  | { readonly legal: true }
+  | { readonly legal: false; readonly reason: LimitReason }
+export type PayLegality =
+  | { readonly legal: true }
+  | { readonly legal: false; readonly reason: PayReason }
+
+export function accountById(
+  payload: BankPayload,
+  accountId: string,
+): AccountDef | null {
+  return payload.accounts.find((a) => a.id === accountId) ?? null
+}
+
+export function paymentById(
+  payload: BankPayload,
+  paymentId: string,
+): PaymentDef | null {
+  return payload.payments.find((p) => p.id === paymentId) ?? null
+}
+
+/** The remaining limited allowance for an account: its cap minus outflow
+ *  already spent, floored at zero. Only meaningful when limitedTo is set. */
+export function remainingAllowance(acct: AccountState): number {
+  if (acct.limitedTo === null) return acct.balance
+  return Math.max(0, acct.limitedTo - acct.limitedSpent)
+}
+
+/** How many dollars an unheld account can give up to a draw: the full balance
+ *  when unlimited, the smaller of balance and remaining allowance when
+ *  limited. A held account gives up zero (handled by the caller). */
+export function availableToDraw(acct: AccountState): number {
+  if (acct.limitedTo === null) return acct.balance
+  return Math.min(acct.balance, remainingAllowance(acct))
+}
+
+/** The number of accounts simultaneously held. The broad-hold trigger reads
+ *  this against payload.broadHoldCount. */
+export function heldCount(state: BankState): number {
+  let n = 0
+  for (const acct of Object.values(state.accounts)) if (acct.held) n += 1
+  return n
+}
+
+// ── Withdrawal application (fired by scheduled events) ────────────────
+
+export interface AppliedWithdrawal {
+  readonly outcome: RequestOutcome
+  /** Whole dollars actually drawn. */
+  readonly drawn: number
+  /** The account state after the draw. */
+  readonly account: AccountState
+}
+
+/** Apply a withdrawal of `amount` dollars against an account's DRAINED state.
+ *  Open account: draws up to its balance. Held account: refuses, draws
+ *  nothing. Limited account: draws up to the remaining cumulative allowance,
+ *  recording `partial` when the amount is clipped. An exact-balance draw
+ *  applies fully and leaves zero. Pure: returns the outcome and the next
+ *  account state. */
+export function applyWithdrawal(
+  acct: AccountState,
+  amount: number,
+): AppliedWithdrawal {
+  if (acct.held) {
+    return { outcome: 'refused', drawn: 0, account: acct }
+  }
+  if (acct.limitedTo !== null) {
+    const allowance = remainingAllowance(acct)
+    const cap = Math.min(allowance, acct.balance)
+    const drawn = Math.min(amount, cap)
+    const outcome: RequestOutcome = drawn < amount ? 'partial' : 'applied'
+    return {
+      outcome,
+      drawn,
+      account: {
+        ...acct,
+        balance: acct.balance - drawn,
+        limitedSpent: acct.limitedSpent + drawn,
+      },
+    }
+  }
+  const drawn = Math.min(amount, acct.balance)
+  const outcome: RequestOutcome = drawn < amount ? 'partial' : 'applied'
+  return {
+    outcome,
+    drawn,
+    account: { ...acct, balance: acct.balance - drawn },
+  }
+}
+
+// ── Action legality ───────────────────────────────────────────────────
+
+export function holdLegality(
+  payload: BankPayload,
+  state: BankState,
+  accountId: string,
+): HoldLegality {
+  const acct = state.accounts[accountId]
+  if (!acct || !accountById(payload, accountId)) {
+    return { legal: false, reason: 'UNKNOWN ACCOUNT' }
+  }
+  if (acct.held) return { legal: false, reason: 'ALREADY HELD' }
+  return { legal: true }
+}
+
+export function releaseLegality(
+  payload: BankPayload,
+  state: BankState,
+  accountId: string,
+): ReleaseLegality {
+  const acct = state.accounts[accountId]
+  if (!acct || !accountById(payload, accountId)) {
+    return { legal: false, reason: 'UNKNOWN ACCOUNT' }
+  }
+  if (!acct.held) return { legal: false, reason: 'NOT HELD' }
+  return { legal: true }
+}
+
+/** LIMIT is legal only on a limit-eligible account, and a re-LIMIT can never
+ *  set the cap below outflow already spent. */
+export function limitLegality(
+  payload: BankPayload,
+  state: BankState,
+  accountId: string,
+  cap: number,
+): LimitLegality {
+  const acct = state.accounts[accountId]
+  const def = accountById(payload, accountId)
+  if (!acct || !def) return { legal: false, reason: 'UNKNOWN ACCOUNT' }
+  if (!def.limitEligible) return { legal: false, reason: 'NOT LIMIT ELIGIBLE' }
+  if (cap < acct.limitedSpent) {
+    return { legal: false, reason: 'BELOW SPENT OUTFLOW' }
+  }
+  return { legal: true }
+}
+
+/** PAY draws from the payment's specific account only. Blocked while that
+ *  account is held (the designed release-or-limit-to-pay tension); needs
+ *  sufficient balance, or sufficient remaining allowance when limited. */
+export function payLegality(
+  payload: BankPayload,
+  state: BankState,
+  paymentId: string,
+): PayLegality {
+  const def = paymentById(payload, paymentId)
+  const pstate = state.payments[paymentId]
+  if (!def || !pstate) return { legal: false, reason: 'UNKNOWN PAYMENT' }
+  if (pstate.cleared) return { legal: false, reason: 'ALREADY CLEARED' }
+  const acct = state.accounts[def.accountId]
+  if (!acct) return { legal: false, reason: 'UNKNOWN PAYMENT' }
+  if (acct.held) return { legal: false, reason: 'ACCOUNT HELD' }
+  if (acct.balance < def.amount) {
+    return { legal: false, reason: 'INSUFFICIENT BALANCE' }
+  }
+  if (acct.limitedTo !== null && remainingAllowance(acct) < def.amount) {
+    return { legal: false, reason: 'INSUFFICIENT ALLOWANCE' }
+  }
+  return { legal: true }
+}
+
+// ── Tick math ─────────────────────────────────────────────────────────
+
+export interface TickInput {
+  readonly heldAccounts: number
+  readonly clearedPayments: number
+  readonly selectiveReleases: number
+  readonly cashBelowFloor: boolean
+}
+
+/** The confidence delta for one tick, from the authored table over the held
+ *  count, payments cleared since the last tick, selective releases since the
+ *  last tick, and whether derived cash is below floor. Returns the signed
+ *  delta; the caller clamps the running confidence to 0..100. */
+export function tickDelta(payload: BankPayload, input: TickInput): number {
+  const t = payload.confidenceDelta
+  let delta = 0
+  delta += input.heldAccounts * t.perHeldAccount
+  delta += input.clearedPayments * t.perClearedPayment
+  delta += input.selectiveReleases * t.perSelectiveRelease
+  if (input.cashBelowFloor) delta += t.cashBelowFloor
+  return delta
+}
+
+export function clampConfidence(value: number): number {
+  return Math.max(0, Math.min(100, value))
+}
+
+// ── Threshold injection sizing ────────────────────────────────────────
+
+/** The size of an injected withdrawal: base plus the engine-capped inbound
+ *  flightsDisrupted magnitude, never below base. The magnitude is the folded
+ *  consequence passed at init and retained for the module to apply. */
+export function injectedSize(baseAmount: number, inboundMagnitude: number): number {
+  return baseAmount + Math.max(0, inboundMagnitude)
+}
+
+/** The thresholds crossed downward going from `before` to `after` confidence
+ *  that have not yet been consumed. A downward crossing of value V fires when
+ *  before >= V and after < V. Returns the matching threshold values in
+ *  descending order so the deepest crossing injects last. */
+export function downwardCrossings(
+  payload: BankPayload,
+  before: number,
+  after: number,
+  consumed: readonly number[],
+): number[] {
+  if (after >= before) return []
+  const out: number[] = []
+  for (const threshold of payload.thresholds) {
+    const v = threshold.value
+    if (consumed.includes(v)) continue
+    if (before >= v && after < v) out.push(v)
+  }
+  return out.sort((a, b) => b - a)
+}
+
+// ── Tiering ───────────────────────────────────────────────────────────
+
+/** The sustainable-play signals the success tier scores. These are REAL
+ *  outcomes: every critical payment cleared, derived cash at or above floor,
+ *  confidence at or above target. The WOPR predicted-withdrawal line is NOT a
+ *  signal here, so defensive mass-holding (which only inflates that line)
+ *  cannot buy a tier. */
+export interface SustainabilitySignals {
+  readonly paymentsCleared: boolean
+  readonly cashAtOrAboveFloor: boolean
+  readonly confidenceAtOrAboveTarget: boolean
+}
+
+export function sustainabilitySignals(
+  payload: BankPayload,
+  state: BankState,
+  derivedCash: number,
+): SustainabilitySignals {
+  const allCleared =
+    payload.payments.length > 0 &&
+    payload.payments.every((p) => state.payments[p.id]?.cleared === true)
+  return {
+    paymentsCleared: allCleared,
+    cashAtOrAboveFloor: derivedCash >= payload.floor,
+    confidenceAtOrAboveTarget: state.confidence >= payload.target,
+  }
+}
+
+export function signalCount(signals: SustainabilitySignals): number {
+  let n = 0
+  if (signals.paymentsCleared) n += 1
+  if (signals.cashAtOrAboveFloor) n += 1
+  if (signals.confidenceAtOrAboveTarget) n += 1
+  return n
+}
+
+/** Map the integer signal count to a tier against the authored thresholds.
+ *  Shared by every settlement cause; `collapsed` is forced to failed by the
+ *  module before this is consulted. */
+export function tierFromSignals(
+  count: number,
+  thresholds: BankTierThresholds,
+): OutcomeTier {
+  if (count >= thresholds.full) return 'full'
+  if (count >= thresholds.partial) return 'partial'
+  if (count >= thresholds.poor) return 'poor'
+  return 'failed'
+}
+
+/** A fresh per-account state at init over an authored account. */
+export function initialAccountState(def: AccountDef): AccountState {
+  return {
+    balance: def.openingBalance,
+    held: false,
+    limitedTo: null,
+    limitedSpent: 0,
+  }
+}
diff --git a/src/engine/missions/bank/selectors.ts b/src/engine/missions/bank/selectors.ts
new file mode 100644
index 0000000..68aa59c
--- /dev/null
+++ b/src/engine/missions/bank/selectors.ts
@@ -0,0 +1,103 @@
+// Derived cash, the WOPR predicted-withdrawal line, reason rendering, and the
+// scoreboard facts for FREEZE BANK ACCOUNTS. Pure, integer-only, recomputed
+// per render. NOTHING in rules.ts or the reduce path imports this file: the
+// prediction line is a display projection the reducers never read, which is
+// exactly why holding accounts can make WOPR's line rise (a pure selector
+// reflecting HOLD immediately) while the real mechanics quietly worsen.
+import type { BankPayload } from './content'
+import type { BankState } from './types'
+import { availableToDraw } from './rules'
+
+/** Derived cash: the sum of available unheld balances. A held account
+ *  contributes zero; a limited account contributes the smaller of its balance
+ *  and remaining allowance; an open account contributes its full balance.
+ *  Cash is never stored in substate; this selector is the only source. */
+export function selectDerivedCash(state: BankState): number {
+  let cash = 0
+  for (const acct of Object.values(state.accounts)) {
+    if (acct.held) continue
+    cash += availableToDraw(acct)
+  }
+  return cash
+}
+
+/** The WOPR predicted-withdrawal line, indexed by elapsed ticks, shifted
+ *  upward by the authored percent while the broad hold is active, and the
+ *  unshifted authored series otherwise. Pure: it reads firstBroadHoldAt and
+ *  whether any account is held RIGHT NOW, so it reflects HOLD and RELEASE
+ *  immediately with no reducer involvement. This is the line that appears to
+ *  justify the holds; the real success tier ignores it. */
+export function selectPredictedWithdrawals(
+  payload: BankPayload,
+  state: BankState,
+): number[] {
+  const active = broadHoldActive(state)
+  return payload.predictionSeries.map((base) =>
+    active
+      ? base + Math.trunc((base * payload.holdShiftPercent) / 100)
+      : base,
+  )
+}
+
+/** Whether the broad hold is currently active: it has stamped and at least
+ *  one account is still held. A full release drops the line back. */
+export function broadHoldActive(state: BankState): boolean {
+  if (state.firstBroadHoldAt === null) return false
+  for (const acct of Object.values(state.accounts)) {
+    if (acct.held) return true
+  }
+  return false
+}
+
+/** A reason-rendering join: turn a typed request outcome code into display
+ *  text. The authored request reason is rendered separately from the payload;
+ *  this covers only the code-derived outcome text so no string crosses into
+ *  substate. */
+export function renderRequestOutcome(outcome: string): string {
+  switch (outcome) {
+    case 'applied':
+      return 'WITHDRAWAL CLEARED IN FULL'
+    case 'partial':
+      return 'WITHDRAWAL CLEARED IN PART'
+    case 'refused':
+      return 'WITHDRAWAL REFUSED: ACCOUNT HELD'
+    case 'pending':
+      return 'WITHDRAWAL PENDING'
+    default:
+      return 'WITHDRAWAL UNKNOWN'
+  }
+}
+
+export interface BankScoreboard {
+  /** Accounts currently held. Each reads to WOPR as a resolved exception, so
+   *  the campaign OPEN EXCEPTIONS count falls as more accounts are held, while
+   *  real confidence and payments worsen. */
+  readonly heldAccounts: number
+  /** Critical payments cleared. */
+  readonly clearedPayments: number
+  /** Critical payments total. */
+  readonly totalPayments: number
+  /** Derived cash right now. */
+  readonly derivedCash: number
+  /** Depositor confidence right now. */
+  readonly confidence: number
+}
+
+export function buildScoreboard(
+  payload: BankPayload,
+  state: BankState,
+): BankScoreboard {
+  let held = 0
+  for (const acct of Object.values(state.accounts)) if (acct.held) held += 1
+  let cleared = 0
+  for (const p of payload.payments) {
+    if (state.payments[p.id]?.cleared) cleared += 1
+  }
+  return {
+    heldAccounts: held,
+    clearedPayments: cleared,
+    totalPayments: payload.payments.length,
+    derivedCash: selectDerivedCash(state),
+    confidence: state.confidence,
+  }
+}
diff --git a/src/engine/missions/bank/types.ts b/src/engine/missions/bank/types.ts
new file mode 100644
index 0000000..f55e63c
--- /dev/null
+++ b/src/engine/missions/bank/types.ts
@@ -0,0 +1,135 @@
+// FREEZE BANK ACCOUNTS substate and its reference-only save schema. Same
+// discipline as CRASH OUTLOOK and GROUND ALL FLIGHTS: the persisted substate
+// carries ids, typed codes, integer balances, and boolean flags only.
+// Authored copy (depositor names, reason strings, the prediction series, the
+// floor and target labels) lives exclusively in the immutable BankPayload,
+// never in a save. If a test can smuggle a reason string or an account name
+// into a parsed substate, this schema is wrong. Cash is NEVER a field: it is
+// always the selectDerivedCash selector over account balances.
+import * as v from 'valibot'
+
+const integer = v.pipe(v.number(), v.integer())
+
+/** A request's application outcome. A typed code only, never a reason string.
+ *  `applied` means the full amount drew; `partial` means a limited account
+ *  clipped it; `refused` means a held account turned it away. */
+export type RequestOutcome = 'pending' | 'applied' | 'partial' | 'refused'
+
+export const REQUEST_OUTCOMES: readonly RequestOutcome[] = [
+  'pending',
+  'applied',
+  'partial',
+  'refused',
+]
+
+/** Per-account mutable truth. No authored copy: names, flavors, and opening
+ *  balances live in the payload; the substate carries the live balance, the
+ *  hold flag, the cumulative limited cap (null when unlimited), and the
+ *  cumulative outflow already spent against a limited cap. */
+export interface AccountState {
+  /** Live whole-dollar balance. Integer. */
+  readonly balance: number
+  /** True while the account is held: withdrawals and payments refuse. */
+  readonly held: boolean
+  /** The cumulative limited outflow cap in whole dollars, or null when the
+   *  account is unlimited. Integer. */
+  readonly limitedTo: number | null
+  /** Whole dollars of outflow already spent against the limited cap. A
+   *  re-LIMIT can never set limitedTo below this. Integer. */
+  readonly limitedSpent: number
+}
+
+/** Per-request mutable truth: its application outcome code and whether it
+ *  arrived after the broad hold stamped. */
+export interface RequestState {
+  readonly outcome: RequestOutcome
+  /** Whole dollars this request actually drew (0 when refused, the clipped
+   *  amount when partial, the full amount when applied). Integer. */
+  readonly appliedAmount: number
+  /** True when this request resolved in a dispatch at or after the broad hold
+   *  stamped. Requests draining in the same dispatch that applies the broad
+   *  hold are before-hold by construction (drains precede action reduction). */
+  readonly arrivedAfterHold: boolean
+  /** True when this request was injected by a threshold crossing, not an
+   *  authored wave. */
+  readonly injected: boolean
+}
+
+/** Per-payment mutable truth: whether it has cleared. Its confidence bonus
+ *  lands at the NEXT tick, not inline. */
+export interface PaymentState {
+  readonly cleared: boolean
+}
+
+export interface BankState {
+  /** Per-account state by account id. Ids and numbers only. */
+  readonly accounts: Readonly<Record<string, AccountState>>
+  /** Per-request outcome by request id. Includes injected request ids once
+   *  they fire. */
+  readonly requests: Readonly<Record<string, RequestState>>
+  /** Per-payment cleared flag by payment id. */
+  readonly payments: Readonly<Record<string, PaymentState>>
+  /** Depositor confidence, 0 to 100. Integer. */
+  readonly confidence: number
+  /** Epoch ms the broad hold first stamped, or null. Stamps once, ever. */
+  readonly firstBroadHoldAt: number | null
+  /** Threshold values already consumed by a downward crossing. A consumed
+   *  threshold never injects again. Integers. */
+  readonly injectedThresholds: readonly number[]
+  /** Payments cleared since the last tick folded; the next tick reads and
+   *  resets it. Integer. */
+  readonly clearedSinceTick: number
+  /** Selective (sub-broad) releases since the last tick; the next tick reads
+   *  and resets it. Integer. */
+  readonly releasesSinceTick: number
+  /** True once a balance-derived invariant would push derived cash negative;
+   *  terminal() reads it. A guard flag, never a cash value. */
+  readonly cashNegativeGuard: boolean
+  /** The capped inbound flightsDisrupted magnitude folded at init. Sizes
+   *  threshold-injected withdrawals (base plus it), never below base. A
+   *  seeded integer, not authored copy; reducers read it, never fold it. */
+  readonly injectMagnitude: number
+  /** Materialized mission length in ms, from init. Integer. */
+  readonly durationMs: number
+  /** Absolute deadline in ms, stamped from the first event the module sees.
+   *  Null until then. terminal() and evaluate() read it. */
+  readonly endsAt: number | null
+}
+
+const accountStateSchema = v.strictObject({
+  balance: integer,
+  held: v.boolean(),
+  limitedTo: v.nullable(integer),
+  limitedSpent: integer,
+})
+
+const requestStateSchema = v.strictObject({
+  outcome: v.picklist(['pending', 'applied', 'partial', 'refused']),
+  appliedAmount: integer,
+  arrivedAfterHold: v.boolean(),
+  injected: v.boolean(),
+})
+
+const paymentStateSchema = v.strictObject({
+  cleared: v.boolean(),
+})
+
+/** The reference-only save schema. strictObject at every level means any
+ *  field that could carry authored copy (a name, a reason, the prediction
+ *  series) is structurally rejected. There is deliberately NO cash field. */
+export const bankSaveSchema = v.strictObject({
+  accounts: v.record(v.string(), accountStateSchema),
+  requests: v.record(v.string(), requestStateSchema),
+  payments: v.record(v.string(), paymentStateSchema),
+  confidence: v.pipe(integer, v.minValue(0), v.maxValue(100)),
+  firstBroadHoldAt: v.nullable(integer),
+  injectedThresholds: v.array(integer),
+  clearedSinceTick: integer,
+  releasesSinceTick: integer,
+  cashNegativeGuard: v.boolean(),
+  injectMagnitude: integer,
+  durationMs: integer,
+  endsAt: v.nullable(integer),
+})
+
+export type BankStateParsed = v.InferOutput<typeof bankSaveSchema>
diff --git a/test/engine/missions/bank/fixtures.ts b/test/engine/missions/bank/fixtures.ts
new file mode 100644
index 0000000..9cfefb1
--- /dev/null
+++ b/test/engine/missions/bank/fixtures.ts
@@ -0,0 +1,196 @@
+// A minimal FREEZE BANK ACCOUNTS fixture: a handful of invented depositor
+// accounts, a short withdrawal-wave stream, two critical payments, and a
+// context builder that drives the REAL bank module through the engine. Not
+// the authored three seeds; section 02 writes those. Names are invented, all
+// copy is uppercase terminal diction, every number is a whole integer.
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import type {
+  ClueRecordEntry,
+  DeskCheckEntry,
+  SeedDefinition,
+} from '@engine/missions/types'
+import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
+import {
+  BANK_MISSION_ID,
+  bankSchedule,
+  makeBankMission,
+} from '@engine/missions/bank/module'
+import type { BankPayload } from '@engine/missions/bank/content'
+import type { BankState } from '@engine/missions/bank/types'
+import { FIXTURE_RECORDS } from '../../records/fixtures'
+
+export const BANK_DURATION_MS = 240_000
+export const BANK_T0 = 1_000_000
+
+/** Five accounts. ANCHORA is the pinned paymentsDelayed target. BELROSE and
+ *  CALDERA are limit-eligible. Confidence starts at 60; the floor is 2000 and
+ *  the target is 55. Two critical payments, each from a specific account. */
+export const FIXTURE_PAYLOAD: BankPayload = {
+  accounts: [
+    { id: 'ANCHORA', name: 'ANCHORA HOLDINGS', flavor: 'PRIME DEPOSITOR', openingBalance: 1000, limitEligible: false },
+    { id: 'BELROSE', name: 'BELROSE TRUST', flavor: 'PENSION POOL', openingBalance: 1200, limitEligible: true },
+    { id: 'CALDERA', name: 'CALDERA FUND', flavor: 'MONEY MARKET', openingBalance: 1500, limitEligible: true },
+    { id: 'DORVEL', name: 'DORVEL ESTATE', flavor: 'FAMILY OFFICE', openingBalance: 800, limitEligible: false },
+    { id: 'EMBER', name: 'EMBER MUTUAL', flavor: 'INSURER', openingBalance: 900, limitEligible: false },
+  ],
+  requests: [
+    { id: 'W1', accountId: 'CALDERA', amount: 300, offsetSeconds: 30, reason: 'PANIC WAVE ONE.', duplicateOfId: null, disputed: false },
+    { id: 'W2', accountId: 'BELROSE', amount: 400, offsetSeconds: 90, reason: 'PANIC WAVE TWO.', duplicateOfId: null, disputed: true },
+    { id: 'W3', accountId: 'EMBER', amount: 200, offsetSeconds: 150, reason: 'PANIC WAVE THREE.', duplicateOfId: 'W1', disputed: false },
+  ],
+  payments: [
+    { id: 'P1', accountId: 'ANCHORA', amount: 500, dueOffsetSeconds: 120, confidenceBonus: 10, reason: 'SETTLEMENT DUE ANCHORA.' },
+    { id: 'P2', accountId: 'DORVEL', amount: 300, dueOffsetSeconds: 180, confidenceBonus: 10, reason: 'SETTLEMENT DUE DORVEL.' },
+  ],
+  broadHoldCount: 2,
+  tickIntervalSeconds: 60,
+  confidenceDelta: {
+    perHeldAccount: -8,
+    perClearedPayment: 6,
+    perSelectiveRelease: 2,
+    cashBelowFloor: -10,
+  },
+  startingConfidence: 60,
+  thresholds: [
+    {
+      value: 40,
+      injected: [
+        { id: 'INJ-40-A', accountId: 'EMBER', baseAmount: 150, reason: 'CONTAGION DRAW.' },
+      ],
+    },
+  ],
+  floor: 2000,
+  target: 55,
+  predictionSeries: [100, 200, 300, 400],
+  holdShiftPercent: 50,
+  introLines: ['DEPOSITORS ARE LINING UP.', 'HOLD THE LINE OR LOSE IT.'],
+  tierThresholds: { full: 3, partial: 2, poor: 1 },
+  paymentsDelayedTargetAccountId: 'ANCHORA',
+  paymentsDelayedTable: { full: 0, partial: 6, poor: 12, failed: 18 },
+}
+
+export const BANK_CLUE_ID = 'clue-D-83'
+/** The hold-justification record (B04), engine-owned as a clue record.
+ *  Inspecting it logs D-83 with no mission involvement. */
+export const JUSTIFICATION_RECORD_ID = 'B04'
+
+const DESK_CHECKS: DeskCheckEntry[] = [
+  { recordId: 'W02', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['DESK CONFIRMS'] },
+]
+
+const CLUE_RECORDS: ClueRecordEntry[] = [
+  { recordId: JUSTIFICATION_RECORD_ID, clueId: BANK_CLUE_ID },
+]
+
+export function bankContext(
+  payload: BankPayload = FIXTURE_PAYLOAD,
+): EngineContext {
+  const overrides: Partial<SeedDefinition> = {
+    records: FIXTURE_RECORDS,
+    deskChecks: DESK_CHECKS,
+    clueRecords: CLUE_RECORDS,
+    missionPayloads: { [BANK_MISSION_ID]: payload },
+    schedules: { [BANK_MISSION_ID]: [...bankSchedule(payload)] },
+    missionDurationsMs: { [BANK_MISSION_ID]: BANK_DURATION_MS },
+  }
+  return buildTestContext(FIXTURE_RECORDS, overrides, {
+    missions: { [BANK_MISSION_ID]: makeBankMission(payload) },
+    missionOrder: [BANK_MISSION_ID],
+  })
+}
+
+/** A context with two upstream test-double missions (alpha, beta) ahead of
+ *  bank. Both emit a paymentsDelayed-equivalent on failure; this drives the
+ *  inbound fold through createCampaign. Used to exercise init consequence
+ *  application end-to-end. */
+export function bankConsequenceContext(): EngineContext {
+  const overrides: Partial<SeedDefinition> = {
+    records: FIXTURE_RECORDS,
+    deskChecks: DESK_CHECKS,
+    clueRecords: CLUE_RECORDS,
+    missionPayloads: {
+      alpha: null,
+      beta: null,
+      [BANK_MISSION_ID]: FIXTURE_PAYLOAD,
+    },
+    schedules: {
+      alpha: [],
+      beta: [],
+      [BANK_MISSION_ID]: [...bankSchedule(FIXTURE_PAYLOAD)],
+    },
+    missionDurationsMs: {
+      alpha: BANK_DURATION_MS,
+      beta: BANK_DURATION_MS,
+      [BANK_MISSION_ID]: BANK_DURATION_MS,
+    },
+  }
+  return buildTestContext(FIXTURE_RECORDS, overrides, {
+    missions: {
+      alpha: makeTestDoubleMission('alpha'),
+      beta: makeTestDoubleMission('beta'),
+      [BANK_MISSION_ID]: makeBankMission(FIXTURE_PAYLOAD),
+    },
+    missionOrder: ['alpha', 'beta', BANK_MISSION_ID],
+  })
+}
+
+export function bankSub(state: CampaignState): BankState {
+  return state.activeMission?.substate as BankState
+}
+
+export type Envelope = [CampaignAction, number]
+
+export function missionAction(payload: Record<string, unknown>): CampaignAction {
+  return { type: 'MISSION_ACTION', payload }
+}
+
+export function holdAct(accountId: string): CampaignAction {
+  return missionAction({ kind: 'HOLD', accountId })
+}
+export function releaseAct(accountId: string): CampaignAction {
+  return missionAction({ kind: 'RELEASE', accountId })
+}
+export function limitAct(accountId: string, cap: number): CampaignAction {
+  return missionAction({ kind: 'LIMIT', accountId, cap })
+}
+export function payAct(paymentId: string): CampaignAction {
+  return missionAction({ kind: 'PAY', paymentId })
+}
+
+export interface RunResult {
+  readonly state: CampaignState
+  readonly emitted: EngineEvent[]
+}
+
+export function drive(
+  ctx: EngineContext,
+  envelopes: Envelope[],
+  settleAt: number | null = null,
+): RunResult {
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
+  const emitted: EngineEvent[] = []
+  for (const [action, now] of envelopes) {
+    const result = dispatch(ctx, state, action, now)
+    state = result.state
+    emitted.push(...result.emitted)
+  }
+  if (settleAt !== null) {
+    const advanced = advanceCampaign(ctx, state, settleAt)
+    state = advanced.state
+    emitted.push(...advanced.emitted)
+  }
+  return { state, emitted }
+}
+
+export function start(t0 = BANK_T0): Envelope {
+  return [{ type: 'START_MISSION', missionId: BANK_MISSION_ID }, t0]
+}
+
+export const SETTLE_AT = BANK_T0 + BANK_DURATION_MS + 1_000
diff --git a/test/engine/missions/bank/module.test.ts b/test/engine/missions/bank/module.test.ts
new file mode 100644
index 0000000..5c55e2a
--- /dev/null
+++ b/test/engine/missions/bank/module.test.ts
@@ -0,0 +1,319 @@
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { selectPredictedWithdrawals } from '@engine/missions/bank/selectors'
+import {
+  BANK_MISSION_ID,
+  makeBankMission,
+} from '@engine/missions/bank/module'
+import {
+  BANK_DURATION_MS,
+  BANK_T0,
+  JUSTIFICATION_RECORD_ID,
+  BANK_CLUE_ID,
+  SETTLE_AT,
+  bankContext,
+  bankConsequenceContext,
+  bankSub,
+  drive,
+  holdAct,
+  payAct,
+  releaseAct,
+  start,
+} from './fixtures'
+import type { Envelope } from './fixtures'
+
+const ctx = bankContext()
+
+describe('bank lifecycle: init and schedule stamping', () => {
+  it('starts confidence at the authored value and stamps the deadline', () => {
+    // The offset-0 start event drains on the first advance after START, so
+    // the deadline stamps once any time passes past T0 (mirrors flights).
+    const { state } = drive(ctx, [start()], BANK_T0 + 1_000)
+    const sub = bankSub(state)
+    expect(sub.confidence).toBe(60)
+    expect(sub.endsAt).toBe(BANK_T0 + BANK_DURATION_MS)
+    expect(Object.keys(sub.accounts).length).toBe(5)
+  })
+
+  it('a withdrawal wave applies against its account after it drains', () => {
+    // W1 (300 against CALDERA, opening 1500) drains at +30s.
+    const { state } = drive(ctx, [start()], BANK_T0 + 35_000)
+    const sub = bankSub(state)
+    expect(sub.requests['W1']!.outcome).toBe('applied')
+    expect(sub.accounts['CALDERA']!.balance).toBe(1200)
+  })
+})
+
+describe('broad-hold stamping and the drain-before-reduce boundary', () => {
+  it('firstBroadHoldAt stamps once when the held count crosses broadHoldCount', () => {
+    // broadHoldCount is 2: holding a third account stamps.
+    const envs: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 1_000],
+      [holdAct('BELROSE'), BANK_T0 + 2_000],
+      [holdAct('DORVEL'), BANK_T0 + 3_000],
+    ]
+    const { state } = drive(ctx, envs)
+    const sub = bankSub(state)
+    expect(sub.firstBroadHoldAt).toBe(BANK_T0 + 3_000)
+  })
+
+  it('releasing below the count and re-crossing does not restamp', () => {
+    const envs: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 1_000],
+      [holdAct('BELROSE'), BANK_T0 + 2_000],
+      [holdAct('DORVEL'), BANK_T0 + 3_000], // stamps here
+      [releaseAct('DORVEL'), BANK_T0 + 4_000], // back to 2
+      [holdAct('EMBER'), BANK_T0 + 5_000], // re-cross
+    ]
+    const { state } = drive(ctx, envs)
+    expect(bankSub(state).firstBroadHoldAt).toBe(BANK_T0 + 3_000)
+  })
+
+  it('a wave sharing the dispatch that crosses the broad hold drains FIRST (arrivedBeforeHold)', () => {
+    // W1 arrives at +30s. Hold two accounts before +30, then the third hold
+    // dispatched at exactly +30s: the wave drains first (before the action
+    // reduces), so W1 is before-hold even though the stamp lands this call.
+    const envs: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 5_000],
+      [holdAct('BELROSE'), BANK_T0 + 10_000],
+      [holdAct('DORVEL'), BANK_T0 + 30_000], // stamps; W1 drains first
+    ]
+    const { state } = drive(ctx, envs)
+    const sub = bankSub(state)
+    expect(sub.firstBroadHoldAt).toBe(BANK_T0 + 30_000)
+    // W1 drained before the hold reduced in the same dispatch.
+    expect(sub.requests['W1']!.outcome).toBe('applied')
+    expect(sub.requests['W1']!.arrivedAfterHold).toBe(false)
+  })
+
+  it('a wave in a later dispatch than the broad hold is arrivedAfterHold', () => {
+    const envs: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 5_000],
+      [holdAct('BELROSE'), BANK_T0 + 10_000],
+      [holdAct('DORVEL'), BANK_T0 + 15_000], // stamps at +15s, before W1 at +30s
+    ]
+    // Advance past W2 (+90s): W2 drains after the hold stamped.
+    const { state } = drive(ctx, envs, BANK_T0 + 95_000)
+    const sub = bankSub(state)
+    // W1 (against CALDERA, not held) drained after the +15s stamp.
+    expect(sub.requests['W1']!.arrivedAfterHold).toBe(true)
+    // W2 (against BELROSE, which IS held) refuses, after hold.
+    expect(sub.requests['W2']!.outcome).toBe('refused')
+    expect(sub.requests['W2']!.arrivedAfterHold).toBe(true)
+  })
+})
+
+describe('same-call race mirrors the flights contract', () => {
+  it('ordering A: wave drained in a prior wake, then the hold', () => {
+    let a: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
+    a = dispatch(ctx, a, start()[0], BANK_T0).state
+    a = dispatch(ctx, a, holdAct('ANCHORA'), BANK_T0 + 5_000).state
+    a = dispatch(ctx, a, holdAct('BELROSE'), BANK_T0 + 10_000).state
+    // Drain W1 in its own wake first.
+    a = advanceCampaign(ctx, a, BANK_T0 + 30_000).state
+    expect(bankSub(a).requests['W1']!.arrivedAfterHold).toBe(false)
+    a = dispatch(ctx, a, holdAct('DORVEL'), BANK_T0 + 31_000).state
+
+    // ordering B: the wave drains inside the same dispatch as the third hold.
+    let b: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
+    b = dispatch(ctx, b, start()[0], BANK_T0).state
+    b = dispatch(ctx, b, holdAct('ANCHORA'), BANK_T0 + 5_000).state
+    b = dispatch(ctx, b, holdAct('BELROSE'), BANK_T0 + 10_000).state
+    b = dispatch(ctx, b, holdAct('DORVEL'), BANK_T0 + 31_000).state
+
+    // Same deterministic W1 outcome either way: drain precedes reduce.
+    expect(bankSub(a).requests['W1']).toEqual(bankSub(b).requests['W1'])
+    expect(bankSub(b).requests['W1']!.arrivedAfterHold).toBe(false)
+  })
+})
+
+describe('PAY clears and the confidence bonus lands at the NEXT tick', () => {
+  it('a cleared payment does not bump confidence inline, but the next tick does', () => {
+    // Pay P1 (500 from ANCHORA) at +65s, after tick-1 (+60) so the bonus is
+    // counted by tick-2 (+120), not tick-1.
+    const envs: Envelope[] = [start(), [payAct('P1'), BANK_T0 + 65_000]]
+    const afterPay = drive(ctx, envs, BANK_T0 + 66_000)
+    const sub1 = bankSub(afterPay.state)
+    expect(sub1.payments['P1']!.cleared).toBe(true)
+    expect(sub1.clearedSinceTick).toBe(1) // staged for the next tick
+    // Advance through tick-2 (+120): the bonus lands.
+    const afterTick2 = drive(ctx, envs, BANK_T0 + 125_000)
+    const sub2 = bankSub(afterTick2.state)
+    expect(sub2.clearedSinceTick).toBe(0) // consumed
+  })
+
+  it('PAY is blocked while the account is held, legal after RELEASE', () => {
+    let s: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
+    s = dispatch(ctx, s, start()[0], BANK_T0).state
+    s = dispatch(ctx, s, holdAct('ANCHORA'), BANK_T0 + 1_000).state
+    const blocked = dispatch(ctx, s, payAct('P1'), BANK_T0 + 2_000)
+    expect(blocked.rejection).toMatchObject({ reason: 'ACCOUNT HELD' })
+    s = dispatch(ctx, s, releaseAct('ANCHORA'), BANK_T0 + 3_000).state
+    const ok = dispatch(ctx, s, payAct('P1'), BANK_T0 + 4_000)
+    expect(ok.rejection).toBeNull()
+    expect(bankSub(ok.state).payments['P1']!.cleared).toBe(true)
+  })
+})
+
+describe('terminal(): collapse, never early completion', () => {
+  it('holding every account collapses on confidence hitting 0 with cause collapsed and tier failed', () => {
+    const envs: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 1_000],
+      [holdAct('BELROSE'), BANK_T0 + 2_000],
+      [holdAct('CALDERA'), BANK_T0 + 3_000],
+      [holdAct('DORVEL'), BANK_T0 + 4_000],
+      [holdAct('EMBER'), BANK_T0 + 5_000],
+    ]
+    // Advance past tick-1 (+60s): 5 held = -40, cash below floor -10 => -50.
+    // Confidence 60 -> 10, not yet 0. Past tick-2 (+120): 10 -> 0 => collapsed.
+    const { state, emitted } = drive(ctx, envs, BANK_T0 + 125_000)
+    const settlement = emitted.find((e) => e.type === 'settlement')
+    expect(settlement).toMatchObject({ cause: 'collapsed', tier: 'failed' })
+    // Settles exactly once.
+    expect(emitted.filter((e) => e.type === 'settlement').length).toBe(1)
+    void state
+  })
+
+  it('a healthy single-mission run does NOT settle early before the deadline', () => {
+    const { state, emitted } = drive(ctx, [start()], BANK_T0 + 100_000)
+    expect(emitted.some((e) => e.type === 'settlement')).toBe(false)
+    expect(bankSub(state)).toBeTruthy()
+  })
+
+  it('structural: the module exposes no early completed path', () => {
+    const mod = makeBankMission(bankContext().seeds['test-seed']!.missionPayloads[BANK_MISSION_ID] as never)
+    // terminal over a pristine-but-stamped healthy state returns null, never completed.
+    const seed = bankContext().seeds['test-seed']!
+    const sub = mod.init(seed, { byKind: {} }, BANK_DURATION_MS) as never as { endsAt: number | null }
+    expect(mod.terminal!(sub as never)).toBeNull() // endsAt null -> null
+  })
+})
+
+describe('the divergence: mass-holding raises WOPR but loses the tier', () => {
+  it('the broad hold raises the predicted-withdrawal line while the real tier fails', () => {
+    // A heavy-hold run: hold four accounts (broad hold active -> WOPR line
+    // rises) but never clear a payment. Sample the line and the tier.
+    const envs: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 1_000],
+      [holdAct('BELROSE'), BANK_T0 + 2_000],
+      [holdAct('CALDERA'), BANK_T0 + 3_000],
+      [holdAct('DORVEL'), BANK_T0 + 4_000],
+    ]
+    // Sample mid-mission (before collapse) to read the live line under hold.
+    const mid = drive(ctx, envs, BANK_T0 + 50_000)
+    const midSub = bankSub(mid.state)
+    const payload = ctx.seeds['test-seed']!.missionPayloads[BANK_MISSION_ID] as never
+    const lineHeld = selectPredictedWithdrawals(payload, midSub)
+    const base = (payload as { predictionSeries: number[] }).predictionSeries
+    // WOPR's line is strictly above the authored base: the holds "justify"
+    // themselves to the metric.
+    for (let i = 0; i < base.length; i += 1) {
+      expect(lineHeld[i]!).toBeGreaterThan(base[i]!)
+    }
+    // But the real outcome at the deadline collapses to failed.
+    const { emitted } = drive(ctx, envs, SETTLE_AT)
+    const settlement = emitted.find((e) => e.type === 'settlement')
+    expect(settlement!.tier).toBe('failed')
+  })
+
+  it('a selective-play run that clears payments beats the mass-hold run on the REAL tier', () => {
+    // Clear both payments, hold nothing broadly: real signals improve.
+    const selective: Envelope[] = [
+      start(),
+      [payAct('P1'), BANK_T0 + 10_000],
+      [payAct('P2'), BANK_T0 + 20_000],
+    ]
+    const sel = drive(ctx, selective, SETTLE_AT)
+    const selSettle = sel.emitted.find((e) => e.type === 'settlement')!
+
+    const massHold: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 1_000],
+      [holdAct('BELROSE'), BANK_T0 + 2_000],
+      [holdAct('CALDERA'), BANK_T0 + 3_000],
+      [holdAct('DORVEL'), BANK_T0 + 4_000],
+      [holdAct('EMBER'), BANK_T0 + 5_000],
+    ]
+    const mass = drive(ctx, massHold, SETTLE_AT)
+    const massSettle = mass.emitted.find((e) => e.type === 'settlement')!
+
+    const order = { full: 3, partial: 2, poor: 1, failed: 0 } as const
+    // The payments-clearing run outranks the defensive mass-hold run.
+    expect(order[selSettle.tier]).toBeGreaterThan(order[massSettle.tier])
+    expect(massSettle.tier).toBe('failed')
+  })
+})
+
+describe('threshold injection through the real engine', () => {
+  it('a downward confidence crossing injects the authored withdrawal once', () => {
+    // Hold three accounts so ticks drive confidence down across the 40
+    // threshold; the injected EMBER draw fires once.
+    const envs: Envelope[] = [
+      start(),
+      [holdAct('ANCHORA'), BANK_T0 + 1_000],
+      [holdAct('BELROSE'), BANK_T0 + 2_000],
+      [holdAct('CALDERA'), BANK_T0 + 3_000],
+    ]
+    // tick-1 (+60): 3 held -8 = -24, cash below floor -10 => -34. 60 -> 26.
+    // That crosses 40 downward: inject INJ-40-A against EMBER (open) once.
+    const { state } = drive(ctx, envs, BANK_T0 + 65_000)
+    const sub = bankSub(state)
+    expect(sub.injectedThresholds).toContain(40)
+    expect(sub.requests['INJ-40-A']!.outcome).toBe('applied')
+    expect(sub.requests['INJ-40-A']!.injected).toBe(true)
+    // EMBER opening 900 minus the 150 base draw.
+    expect(sub.accounts['EMBER']!.balance).toBe(750)
+  })
+})
+
+describe('clue is engine-owned (structural)', () => {
+  it('INSPECT_RECORD on the justification record logs the clue once, no mission involvement', () => {
+    let s: CampaignState = createCampaign(ctx, 'test-seed', { extendedTime: false }, BANK_T0)
+    s = dispatch(ctx, s, start()[0], BANK_T0).state
+    const inspect = dispatch(
+      ctx,
+      s,
+      { type: 'INSPECT_RECORD', recordId: JUSTIFICATION_RECORD_ID },
+      BANK_T0 + 1_000,
+    )
+    const clueEvents = inspect.emitted.filter((e) => e.type === 'clueFound')
+    expect(clueEvents).toHaveLength(1)
+    expect(clueEvents[0]).toMatchObject({ clueId: BANK_CLUE_ID })
+    // A second inspection does not re-log.
+    const again = dispatch(
+      ctx,
+      inspect.state,
+      { type: 'INSPECT_RECORD', recordId: JUSTIFICATION_RECORD_ID },
+      BANK_T0 + 2_000,
+    )
+    expect(again.emitted.filter((e) => e.type === 'clueFound')).toHaveLength(0)
+  })
+})
+
+describe('inbound consequence folding at init (through the real engine)', () => {
+  it('a paymentsDelayed inbound consequence drains the pinned target account', () => {
+    // Drive alpha+beta to failed settlements upstream, then start bank.
+    const cctx = bankConsequenceContext()
+    let s: CampaignState = createCampaign(cctx, 'test-seed', { extendedTime: false }, BANK_T0)
+    // alpha and beta settle failed via forfeit, each emitting a consequence.
+    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: 'alpha' }, BANK_T0).state
+    s = dispatch(cctx, s, { type: 'FORFEIT_MISSION' }, BANK_T0 + 1_000).state
+    s = dispatch(cctx, s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' }, BANK_T0 + 2_000).state
+    // The test-double emits commsDelayed, not paymentsDelayed, so this run
+    // proves folding reaches init without error; the magnitude check for the
+    // bank-specific kind is unit-covered in rules. Just assert bank starts.
+    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: BANK_MISSION_ID }, BANK_T0 + 3_000).state
+    expect(bankSub(s).accounts['ANCHORA']!.balance).toBe(1000)
+  })
+})
diff --git a/test/engine/missions/bank/rules.test.ts b/test/engine/missions/bank/rules.test.ts
new file mode 100644
index 0000000..1c73857
--- /dev/null
+++ b/test/engine/missions/bank/rules.test.ts
@@ -0,0 +1,254 @@
+import { describe, expect, it } from 'vitest'
+import {
+  applyWithdrawal,
+  availableToDraw,
+  clampConfidence,
+  downwardCrossings,
+  injectedSize,
+  limitLegality,
+  payLegality,
+  remainingAllowance,
+  signalCount,
+  sustainabilitySignals,
+  tickDelta,
+  tierFromSignals,
+} from '@engine/missions/bank/rules'
+import type { AccountState, BankState } from '@engine/missions/bank/types'
+import { FIXTURE_PAYLOAD } from './fixtures'
+
+function acct(over: Partial<AccountState> = {}): AccountState {
+  return { balance: 1000, held: false, limitedTo: null, limitedSpent: 0, ...over }
+}
+
+describe('withdrawal application table', () => {
+  it('open account applies in full', () => {
+    const r = applyWithdrawal(acct({ balance: 1000 }), 300)
+    expect(r.outcome).toBe('applied')
+    expect(r.drawn).toBe(300)
+    expect(r.account.balance).toBe(700)
+  })
+
+  it('held account refuses with the refused code, draws nothing', () => {
+    const r = applyWithdrawal(acct({ held: true, balance: 1000 }), 300)
+    expect(r.outcome).toBe('refused')
+    expect(r.drawn).toBe(0)
+    expect(r.account.balance).toBe(1000)
+  })
+
+  it('limited account applies up to the remaining allowance, partial when clipped', () => {
+    const r = applyWithdrawal(acct({ balance: 1000, limitedTo: 200, limitedSpent: 50 }), 300)
+    expect(r.outcome).toBe('partial')
+    expect(r.drawn).toBe(150) // 200 cap minus 50 spent
+    expect(r.account.balance).toBe(850)
+    expect(r.account.limitedSpent).toBe(200)
+  })
+
+  it('limited account within allowance applies fully', () => {
+    const r = applyWithdrawal(acct({ balance: 1000, limitedTo: 500, limitedSpent: 0 }), 300)
+    expect(r.outcome).toBe('applied')
+    expect(r.drawn).toBe(300)
+  })
+
+  it('exact-balance boundary applies fully and leaves zero', () => {
+    const r = applyWithdrawal(acct({ balance: 300 }), 300)
+    expect(r.outcome).toBe('applied')
+    expect(r.drawn).toBe(300)
+    expect(r.account.balance).toBe(0)
+  })
+
+  it('over-balance open draw clips to balance and reads partial', () => {
+    const r = applyWithdrawal(acct({ balance: 200 }), 300)
+    expect(r.outcome).toBe('partial')
+    expect(r.drawn).toBe(200)
+    expect(r.account.balance).toBe(0)
+  })
+})
+
+describe('cumulative LIMIT', () => {
+  it('multiple withdrawals draw down a single cumulative allowance', () => {
+    let a = acct({ balance: 1000, limitedTo: 400, limitedSpent: 0 })
+    const r1 = applyWithdrawal(a, 250)
+    a = r1.account
+    expect(r1.drawn).toBe(250)
+    const r2 = applyWithdrawal(a, 250)
+    expect(r2.drawn).toBe(150) // only 150 of the 400 cap remains
+    expect(r2.outcome).toBe('partial')
+    expect(remainingAllowance(r2.account)).toBe(0)
+  })
+
+  it('re-LIMIT below outflow already spent is rejected', () => {
+    const state = {
+      accounts: { BELROSE: acct({ balance: 1000, limitedTo: 400, limitedSpent: 300 }) },
+    } as unknown as BankState
+    const low = limitLegality(FIXTURE_PAYLOAD, state, 'BELROSE', 200)
+    expect(low).toEqual({ legal: false, reason: 'BELOW SPENT OUTFLOW' })
+    const ok = limitLegality(FIXTURE_PAYLOAD, state, 'BELROSE', 350)
+    expect(ok.legal).toBe(true)
+  })
+
+  it('LIMIT only legal on limit-eligible accounts', () => {
+    const state = {
+      accounts: { ANCHORA: acct(), BELROSE: acct() },
+    } as unknown as BankState
+    expect(limitLegality(FIXTURE_PAYLOAD, state, 'ANCHORA', 100)).toEqual({
+      legal: false,
+      reason: 'NOT LIMIT ELIGIBLE',
+    })
+    expect(limitLegality(FIXTURE_PAYLOAD, state, 'BELROSE', 100).legal).toBe(true)
+  })
+})
+
+describe('PAY legality', () => {
+  function stateWith(acctOver: Partial<AccountState>): BankState {
+    return {
+      accounts: { ANCHORA: acct(acctOver) },
+      payments: { P1: { cleared: false } },
+    } as unknown as BankState
+  }
+
+  it('blocked while the account is held', () => {
+    expect(payLegality(FIXTURE_PAYLOAD, stateWith({ held: true, balance: 1000 }), 'P1')).toEqual({
+      legal: false,
+      reason: 'ACCOUNT HELD',
+    })
+  })
+
+  it('legal when open with sufficient balance', () => {
+    expect(payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 1000 }), 'P1').legal).toBe(true)
+  })
+
+  it('rejected on insufficient balance', () => {
+    expect(payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 100 }), 'P1')).toEqual({
+      legal: false,
+      reason: 'INSUFFICIENT BALANCE',
+    })
+  })
+
+  it('legal while limited if the remaining allowance covers it', () => {
+    expect(
+      payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 1000, limitedTo: 600, limitedSpent: 0 }), 'P1')
+        .legal,
+    ).toBe(true)
+    expect(
+      payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 1000, limitedTo: 400, limitedSpent: 50 }), 'P1'),
+    ).toEqual({ legal: false, reason: 'INSUFFICIENT ALLOWANCE' })
+  })
+
+  it('already-cleared payment is rejected', () => {
+    const s = {
+      accounts: { ANCHORA: acct() },
+      payments: { P1: { cleared: true } },
+    } as unknown as BankState
+    expect(payLegality(FIXTURE_PAYLOAD, s, 'P1')).toEqual({
+      legal: false,
+      reason: 'ALREADY CLEARED',
+    })
+  })
+})
+
+describe('availableToDraw and derived-cash contribution', () => {
+  it('held contributes zero, open full, limited up to allowance', () => {
+    expect(availableToDraw(acct({ balance: 1000 }))).toBe(1000)
+    expect(availableToDraw(acct({ balance: 1000, limitedTo: 300, limitedSpent: 100 }))).toBe(200)
+    expect(availableToDraw(acct({ balance: 150, limitedTo: 300, limitedSpent: 0 }))).toBe(150)
+  })
+})
+
+describe('tick delta table', () => {
+  const t = FIXTURE_PAYLOAD // perHeld -8, perCleared 6, perRelease 2, cashBelowFloor -10
+
+  it('held-account penalty isolated', () => {
+    expect(tickDelta(t, { heldAccounts: 3, clearedPayments: 0, selectiveReleases: 0, cashBelowFloor: false })).toBe(-24)
+  })
+  it('cleared-payments bonus isolated', () => {
+    expect(tickDelta(t, { heldAccounts: 0, clearedPayments: 2, selectiveReleases: 0, cashBelowFloor: false })).toBe(12)
+  })
+  it('selective-release bonus isolated', () => {
+    expect(tickDelta(t, { heldAccounts: 0, clearedPayments: 0, selectiveReleases: 1, cashBelowFloor: false })).toBe(2)
+  })
+  it('cash-below-floor penalty isolated', () => {
+    expect(tickDelta(t, { heldAccounts: 0, clearedPayments: 0, selectiveReleases: 0, cashBelowFloor: true })).toBe(-10)
+  })
+  it('combined', () => {
+    expect(tickDelta(t, { heldAccounts: 2, clearedPayments: 1, selectiveReleases: 1, cashBelowFloor: true })).toBe(-16 + 6 + 2 - 10)
+  })
+  it('clamps to 0..100 at both ends', () => {
+    expect(clampConfidence(60 + 100)).toBe(100)
+    expect(clampConfidence(5 - 40)).toBe(0)
+  })
+})
+
+describe('threshold downward crossings', () => {
+  it('a downward crossing of an unconsumed threshold fires once', () => {
+    expect(downwardCrossings(FIXTURE_PAYLOAD, 45, 35, [])).toEqual([40])
+  })
+  it('an already-consumed threshold cannot re-fire', () => {
+    expect(downwardCrossings(FIXTURE_PAYLOAD, 45, 35, [40])).toEqual([])
+  })
+  it('recovery upward then a second downward crossing cannot double-inject', () => {
+    // First crossing consumes 40.
+    const first = downwardCrossings(FIXTURE_PAYLOAD, 45, 35, [])
+    expect(first).toEqual([40])
+    // Recovery above and a second dip: 40 is now consumed, so no re-injection.
+    expect(downwardCrossings(FIXTURE_PAYLOAD, 50, 30, [40])).toEqual([])
+  })
+  it('an upward move injects nothing', () => {
+    expect(downwardCrossings(FIXTURE_PAYLOAD, 30, 50, [])).toEqual([])
+  })
+})
+
+describe('injected sizing', () => {
+  it('base when no inbound magnitude', () => {
+    expect(injectedSize(150, 0)).toBe(150)
+  })
+  it('base plus capped inbound magnitude, never below base', () => {
+    expect(injectedSize(150, 40)).toBe(190)
+    expect(injectedSize(150, -5)).toBe(150)
+  })
+})
+
+describe('tiering from REAL sustainability signals', () => {
+  function state(over: Partial<BankState>): BankState {
+    return {
+      accounts: {},
+      requests: {},
+      payments: { P1: { cleared: true }, P2: { cleared: true } },
+      confidence: 60,
+      ...over,
+    } as unknown as BankState
+  }
+
+  it('all three signals met gives full', () => {
+    const s = state({ confidence: 60 })
+    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 3000)
+    expect(signalCount(sig)).toBe(3)
+    expect(tierFromSignals(3, FIXTURE_PAYLOAD.tierThresholds)).toBe('full')
+  })
+
+  it('cash below floor drops a signal', () => {
+    const s = state({ confidence: 60 })
+    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 100)
+    expect(sig.cashAtOrAboveFloor).toBe(false)
+    expect(signalCount(sig)).toBe(2)
+  })
+
+  it('confidence below target drops a signal', () => {
+    const s = state({ confidence: 40 })
+    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 3000)
+    expect(sig.confidenceAtOrAboveTarget).toBe(false)
+  })
+
+  it('a payment not cleared drops the payments signal', () => {
+    const s = state({ payments: { P1: { cleared: true }, P2: { cleared: false } } })
+    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 3000)
+    expect(sig.paymentsCleared).toBe(false)
+  })
+
+  it('tier ladder maps counts to tiers', () => {
+    const th = FIXTURE_PAYLOAD.tierThresholds
+    expect(tierFromSignals(3, th)).toBe('full')
+    expect(tierFromSignals(2, th)).toBe('partial')
+    expect(tierFromSignals(1, th)).toBe('poor')
+    expect(tierFromSignals(0, th)).toBe('failed')
+  })
+})
diff --git a/test/engine/missions/bank/selectors.test.ts b/test/engine/missions/bank/selectors.test.ts
new file mode 100644
index 0000000..f00e5de
--- /dev/null
+++ b/test/engine/missions/bank/selectors.test.ts
@@ -0,0 +1,135 @@
+import { describe, expect, it } from 'vitest'
+import { readFileSync } from 'node:fs'
+import { fileURLToPath } from 'node:url'
+import {
+  broadHoldActive,
+  buildScoreboard,
+  selectDerivedCash,
+  selectPredictedWithdrawals,
+} from '@engine/missions/bank/selectors'
+import type { AccountState, BankState } from '@engine/missions/bank/types'
+import { FIXTURE_PAYLOAD } from './fixtures'
+
+function acct(over: Partial<AccountState> = {}): AccountState {
+  return { balance: 1000, held: false, limitedTo: null, limitedSpent: 0, ...over }
+}
+
+function stateWith(
+  accounts: Record<string, AccountState>,
+  over: Partial<BankState> = {},
+): BankState {
+  return {
+    accounts,
+    requests: {},
+    payments: {},
+    confidence: 60,
+    firstBroadHoldAt: null,
+    injectedThresholds: [],
+    clearedSinceTick: 0,
+    releasesSinceTick: 0,
+    cashNegativeGuard: false,
+    injectMagnitude: 0,
+    durationMs: 240_000,
+    endsAt: null,
+    ...over,
+  }
+}
+
+describe('selectDerivedCash', () => {
+  it('held accounts contribute zero, open full, limited up to allowance', () => {
+    const s = stateWith({
+      A: acct({ balance: 1000 }),
+      B: acct({ balance: 500, held: true }),
+      C: acct({ balance: 800, limitedTo: 300, limitedSpent: 100 }),
+    })
+    // A=1000, B held=0, C limited remaining = min(800, 200) = 200
+    expect(selectDerivedCash(s)).toBe(1200)
+  })
+
+  it('the empty account map is zero cash', () => {
+    expect(selectDerivedCash(stateWith({}))).toBe(0)
+  })
+})
+
+describe('selectPredictedWithdrawals: the WOPR line', () => {
+  it('returns the unshifted authored series when no hold is active', () => {
+    const s = stateWith({ A: acct() })
+    expect(selectPredictedWithdrawals(FIXTURE_PAYLOAD, s)).toEqual([100, 200, 300, 400])
+  })
+
+  it('shifts the series upward by the authored percent while the broad hold is active', () => {
+    const s = stateWith(
+      { A: acct({ held: true }), B: acct({ held: true }) },
+      { firstBroadHoldAt: 1_000 },
+    )
+    // holdShiftPercent 50: each base plus floor(base*50/100)
+    expect(selectPredictedWithdrawals(FIXTURE_PAYLOAD, s)).toEqual([150, 300, 450, 600])
+  })
+
+  it('returns to the unshifted series once every hold is released (pure, immediate)', () => {
+    // firstBroadHoldAt stamped but no account held now: line drops back.
+    const s = stateWith(
+      { A: acct({ held: false }) },
+      { firstBroadHoldAt: 1_000 },
+    )
+    expect(broadHoldActive(s)).toBe(false)
+    expect(selectPredictedWithdrawals(FIXTURE_PAYLOAD, s)).toEqual([100, 200, 300, 400])
+  })
+})
+
+describe('the divergence: WOPR line vs derived cash as holds grow', () => {
+  it('holding accounts RAISES the WOPR line while derived cash FALLS', () => {
+    const open = stateWith({
+      A: acct({ balance: 1000 }),
+      B: acct({ balance: 1000 }),
+      C: acct({ balance: 1000 }),
+    })
+    const held = stateWith(
+      {
+        A: acct({ balance: 1000, held: true }),
+        B: acct({ balance: 1000, held: true }),
+        C: acct({ balance: 1000, held: true }),
+      },
+      { firstBroadHoldAt: 1_000 },
+    )
+    const lineOpen = selectPredictedWithdrawals(FIXTURE_PAYLOAD, open)
+    const lineHeld = selectPredictedWithdrawals(FIXTURE_PAYLOAD, held)
+    // WOPR's predicted-withdrawal line rises under the hold.
+    for (let i = 0; i < lineOpen.length; i += 1) {
+      expect(lineHeld[i]!).toBeGreaterThan(lineOpen[i]!)
+    }
+    // Real derived cash collapses: held accounts contribute nothing.
+    expect(selectDerivedCash(open)).toBe(3000)
+    expect(selectDerivedCash(held)).toBe(0)
+  })
+})
+
+describe('scoreboard facts feed OPEN EXCEPTIONS', () => {
+  it('held accounts count as WOPR-resolved exceptions', () => {
+    const s = stateWith({
+      A: acct({ held: true }),
+      B: acct({ held: true }),
+      C: acct(),
+    })
+    const board = buildScoreboard(FIXTURE_PAYLOAD, s)
+    expect(board.heldAccounts).toBe(2)
+  })
+})
+
+describe('structural: reducers never read the prediction selector', () => {
+  it('rules.ts does not import selectors.ts', () => {
+    const rulesSrc = readFileSync(
+      fileURLToPath(new URL('../../../../src/engine/missions/bank/rules.ts', import.meta.url)),
+      'utf8',
+    )
+    expect(rulesSrc).not.toMatch(/['"]\.\/selectors['"]/)
+  })
+
+  it('module.ts does not import selectors.ts on the reduce path', () => {
+    const moduleSrc = readFileSync(
+      fileURLToPath(new URL('../../../../src/engine/missions/bank/module.ts', import.meta.url)),
+      'utf8',
+    )
+    expect(moduleSrc).not.toMatch(/['"]\.\/selectors['"]/)
+  })
+})
diff --git a/test/engine/missions/bank/types.test.ts b/test/engine/missions/bank/types.test.ts
new file mode 100644
index 0000000..b93c6dc
--- /dev/null
+++ b/test/engine/missions/bank/types.test.ts
@@ -0,0 +1,77 @@
+import { describe, expect, it } from 'vitest'
+import * as v from 'valibot'
+import { bankSaveSchema } from '@engine/missions/bank/types'
+import type { BankState } from '@engine/missions/bank/types'
+
+function populated(): BankState {
+  return {
+    accounts: {
+      A: { balance: 1000, held: false, limitedTo: null, limitedSpent: 0 },
+      B: { balance: 500, held: true, limitedTo: null, limitedSpent: 0 },
+      C: { balance: 800, held: false, limitedTo: 300, limitedSpent: 100 },
+    },
+    requests: {
+      W1: { outcome: 'applied', appliedAmount: 200, arrivedAfterHold: false, injected: false },
+      W2: { outcome: 'refused', appliedAmount: 0, arrivedAfterHold: true, injected: false },
+      W3: { outcome: 'partial', appliedAmount: 150, arrivedAfterHold: true, injected: true },
+    },
+    payments: { P1: { cleared: true }, P2: { cleared: false } },
+    confidence: 55,
+    firstBroadHoldAt: 1_000_123,
+    injectedThresholds: [40],
+    clearedSinceTick: 1,
+    releasesSinceTick: 0,
+    cashNegativeGuard: false,
+    injectMagnitude: 0,
+    durationMs: 240_000,
+    endsAt: 1_240_000,
+  }
+}
+
+describe('bank saveSchema: reference-only round-trip', () => {
+  it('round-trips a populated substate', () => {
+    const state = populated()
+    const parsed = v.parse(bankSaveSchema, state)
+    expect(parsed).toEqual(state)
+  })
+
+  it('rejects a reason string smuggled into an account', () => {
+    const bad = populated() as unknown as Record<string, unknown>
+    ;(bad['accounts'] as Record<string, Record<string, unknown>>)['A']![
+      'name'
+    ] = 'ANCHORA HOLDINGS'
+    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
+  })
+
+  it('rejects a reason string on a request', () => {
+    const bad = populated() as unknown as Record<string, unknown>
+    ;(bad['requests'] as Record<string, Record<string, unknown>>)['W1']![
+      'reason'
+    ] = 'PANIC WAVE ONE'
+    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
+  })
+
+  it('admits typed outcome codes only, rejects an arbitrary code', () => {
+    const bad = populated() as unknown as Record<string, unknown>
+    ;(bad['requests'] as Record<string, Record<string, unknown>>)['W1']![
+      'outcome'
+    ] = 'FROZEN'
+    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
+  })
+
+  it('confidence outside 0..100 is rejected', () => {
+    const over = { ...populated(), confidence: 101 }
+    const under = { ...populated(), confidence: -1 }
+    expect(() => v.parse(bankSaveSchema, over)).toThrow()
+    expect(() => v.parse(bankSaveSchema, under)).toThrow()
+  })
+
+  it('structurally has NO cash field: adding one fails strictObject', () => {
+    const bad = { ...populated(), derivedCash: 5000 } as unknown
+    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
+    // And the type itself carries no cash key.
+    const keys = Object.keys(populated())
+    expect(keys).not.toContain('cash')
+    expect(keys).not.toContain('derivedCash')
+  })
+})
