diff --git a/src/engine/missions/bank/content.ts b/src/engine/missions/bank/content.ts
index 1b5781a..8e56625 100644
--- a/src/engine/missions/bank/content.ts
+++ b/src/engine/missions/bank/content.ts
@@ -5,6 +5,19 @@
 // shared SeedDefinition.deskChecks table keyed by record id, exactly as
 // CRASH OUTLOOK and GROUND ALL FLIGHTS do it.
 import type { OutcomeTier } from '../../campaign/types'
+import type { EvidenceRecord } from '../../records'
+import type { ClueRecordEntry, DeskCheckEntry } from '../types'
+import type { ScheduledEventSpec } from '../../time'
+
+/** The five authored account flavors. A typed enum, not authored copy. */
+export const BANK_ACCOUNT_FLAVORS = [
+  'payroll',
+  'operating',
+  'vendor',
+  'municipal',
+  'depositor',
+] as const
+export type BankAccountFlavor = (typeof BANK_ACCOUNT_FLAVORS)[number]
 
 /** One depositor account. Authored static truth only: the live balance,
  *  hold, and limit live in substate. */
@@ -14,6 +27,10 @@ export interface AccountDef {
   readonly name: string
   /** Authored flavor line the shell renders. Never enters substate. */
   readonly flavor: string
+  /** The typed account flavor: one of the five authored kinds
+   *  (payroll | operating | vendor | municipal | depositor). A typed code,
+   *  not authored copy; selectors join it to the rendered flavor line. */
+  readonly flavorKind: BankAccountFlavor
   /** Opening balance in whole dollars. Integer. */
   readonly openingBalance: number
   /** Whether a LIMIT action is legal on this account. */
@@ -38,6 +55,16 @@ export interface RequestDef {
   /** Whether this request is authored as disputed. Authoring metadata only;
    *  mechanics are identical to an undisputed request. */
   readonly disputed: boolean
+  /** The evidence record a CHECK SOURCE on this request resolves against, or
+   *  null. A typed id, never authored copy; the engine-owned deskChecks table
+   *  holds the outcome. The disputed request names the bank hold-justification
+   *  record so the desk resolves its contradiction. Authoring metadata only. */
+  readonly recordId?: string | null
+  /** For a disputed request only: the balance figure the authored body
+   *  CLAIMS for its account, which must contradict the account's authored
+   *  openingBalance. The validator proves the contradiction structurally from
+   *  this number rather than parsing prose. Integer, or null when undisputed. */
+  readonly disputeClaimBalance?: number | null
 }
 
 /** A critical payment the bank must clear from a specific account by its due
@@ -155,3 +182,461 @@ export interface BankPayload {
   readonly paymentsDelayedTargetAccountId: string
   readonly paymentsDelayedTable: PaymentsDelayedTable
 }
+
+// ── Content validator ─────────────────────────────────────────────────
+//
+// A PURE validator that turns authoring mistakes into a list of structured
+// errors (empty means valid), exactly like validateFlightsContent. Each rule
+// maps one-to-one to a content test. The solvability invariants are NOT rules
+// here; they need the module lifecycle and live in solvability.test.ts.
+
+/** The per-seed expected ids the validator and the tests both read. One table
+ *  per seed so a dropped id shows up as a dropped assertion. */
+export interface BankSeedAnchors {
+  /** The exercise run stamp the hold-justification record inherits (R04). */
+  readonly runId: string
+  /** The DERIVED hold-justification record (B04): the emergency hold notice
+   *  citing the restriction and assuming a system-wide shutdown. Carries the
+   *  D-83 clue. */
+  readonly justificationRecordId: string
+  /** The EXERCISE root the justification record's ancestry reaches (C17). */
+  readonly exerciseRootRecordId: string
+  /** The D-83 clue id the justification record is designated for. */
+  readonly clueId: string
+  /** The one DISPUTED request's id. */
+  readonly disputedRequestId: string
+  /** The two ids of the one payroll duplicate pair (same amount, linked by
+   *  duplicateOfId, differing requester chains). */
+  readonly payrollDuplicateFirstId: string
+  readonly payrollDuplicateSecondId: string
+  /** The exact authored request count this seed must carry. */
+  readonly requestCount: number
+  /** The exact authored critical-payment count this seed must carry. */
+  readonly paymentCount: number
+}
+
+export type BankContentErrorCode =
+  | 'ACCOUNT_COUNT'
+  | 'ACCOUNT_ID_UNIQUE'
+  | 'ACCOUNT_FLAVOR'
+  | 'REQUEST_COUNT'
+  | 'PAYMENT_COUNT'
+  | 'DUPLICATE_PAIR'
+  | 'DISPUTED_REQUEST'
+  | 'THRESHOLD_DESCENT'
+  | 'REQUEST_REASON'
+  | 'TUNING_INTEGER'
+  | 'PREDICTION_SHAPE'
+  | 'JUSTIFICATION_PROVENANCE'
+  | 'CLUE_RECORD_MISSING'
+  | 'DESKCHECK_MISSING'
+  | 'SCHEDULE_WARNING'
+  | 'JSON_ROUNDTRIP'
+
+export interface BankContentError {
+  readonly code: BankContentErrorCode
+  readonly detail: string
+}
+
+function isFiniteInteger(n: unknown): n is number {
+  return typeof n === 'number' && Number.isInteger(n)
+}
+
+/** Walk a record's parentId chain to its deepest resolvable ancestor,
+ *  carrying a visited set so a cycle or dangling parent terminates. */
+function traceRoot(
+  records: readonly EvidenceRecord[],
+  startId: string,
+): EvidenceRecord | null {
+  const byId = new Map(records.map((r) => [r.id, r]))
+  let current = byId.get(startId) ?? null
+  if (!current) return null
+  const visited = new Set<string>([current.id])
+  while (current.parentId !== null) {
+    if (visited.has(current.parentId)) break
+    const parent = byId.get(current.parentId)
+    if (!parent) break
+    visited.add(parent.id)
+    current = parent
+  }
+  return current
+}
+
+/** The base observed withdrawal stream aggregated per confidence tick: for
+ *  each tick index, the sum of AUTHORED (non-injected) request amounts whose
+ *  offset falls in that tick's window (tick k covers
+ *  ((k)*interval, (k+1)*interval], with index 0 covering [0, interval]). The
+ *  prediction series is indexed by the same tick index. Pure, integer. */
+export function baseObservedPerTick(
+  payload: BankPayload,
+  tickCount: number,
+): number[] {
+  const interval = payload.tickIntervalSeconds
+  const out = new Array<number>(tickCount).fill(0)
+  if (interval <= 0) return out
+  for (const request of payload.requests) {
+    const index = Math.floor((request.offsetSeconds - 1) / interval)
+    if (index >= 0 && index < tickCount) out[index] = out[index]! + request.amount
+  }
+  return out
+}
+
+/** Validate authored bank content. Empty array means valid. Pure over all
+ *  inputs; the record graph, deskChecks, clueRecords, and schedule are
+ *  threaded in so the provenance, desk-coverage, and schedule rules run
+ *  against the real shared tables. */
+export function validateBankContent(
+  payload: BankPayload,
+  records: readonly EvidenceRecord[],
+  deskChecks: readonly DeskCheckEntry[],
+  clueRecords: readonly ClueRecordEntry[],
+  schedule: readonly ScheduledEventSpec[],
+  anchors: BankSeedAnchors,
+): BankContentError[] {
+  const errors: BankContentError[] = []
+
+  // Rule: exactly ten accounts with unique ids and authored flavors.
+  if (payload.accounts.length !== 10) {
+    errors.push({
+      code: 'ACCOUNT_COUNT',
+      detail: `expected 10 accounts, found ${payload.accounts.length}`,
+    })
+  }
+  const accountIds = new Set<string>()
+  for (const account of payload.accounts) {
+    if (accountIds.has(account.id)) {
+      errors.push({
+        code: 'ACCOUNT_ID_UNIQUE',
+        detail: `duplicate account id ${account.id}`,
+      })
+    }
+    accountIds.add(account.id)
+    if (!BANK_ACCOUNT_FLAVORS.includes(account.flavorKind)) {
+      errors.push({
+        code: 'ACCOUNT_FLAVOR',
+        detail: `account ${account.id} flavorKind ${account.flavorKind} is not an authored flavor`,
+      })
+    }
+  }
+  // Every one of the five flavors is represented.
+  for (const flavor of BANK_ACCOUNT_FLAVORS) {
+    if (!payload.accounts.some((a) => a.flavorKind === flavor)) {
+      errors.push({
+        code: 'ACCOUNT_FLAVOR',
+        detail: `no account carries the ${flavor} flavor`,
+      })
+    }
+  }
+
+  // Rule: the exact authored request count, and exactly four critical
+  // payments.
+  if (payload.requests.length !== anchors.requestCount) {
+    errors.push({
+      code: 'REQUEST_COUNT',
+      detail: `expected ${anchors.requestCount} requests, found ${payload.requests.length}`,
+    })
+  }
+  if (payload.payments.length !== 4) {
+    errors.push({
+      code: 'PAYMENT_COUNT',
+      detail: `expected 4 critical payments, found ${payload.payments.length}`,
+    })
+  }
+  if (anchors.paymentCount !== 4) {
+    errors.push({
+      code: 'PAYMENT_COUNT',
+      detail: `anchors.paymentCount ${anchors.paymentCount} is not 4`,
+    })
+  }
+
+  // Rule: exactly one payroll duplicate pair. Two requests sharing an amount,
+  // linked by duplicateOfId, both against payroll accounts, with differing
+  // authored requester-chain bodies. Assert the pair is the authored anchor
+  // pair and that no OTHER request carries a duplicateOfId link.
+  const payrollAccountIds = new Set(
+    payload.accounts.filter((a) => a.flavorKind === 'payroll').map((a) => a.id),
+  )
+  const requestById = new Map(payload.requests.map((r) => [r.id, r]))
+  const dupFirst = requestById.get(anchors.payrollDuplicateFirstId)
+  const dupSecond = requestById.get(anchors.payrollDuplicateSecondId)
+  if (!dupFirst || !dupSecond) {
+    errors.push({
+      code: 'DUPLICATE_PAIR',
+      detail: `payroll duplicate pair ${anchors.payrollDuplicateFirstId}/${anchors.payrollDuplicateSecondId} not both present`,
+    })
+  } else {
+    if (dupSecond.duplicateOfId !== dupFirst.id) {
+      errors.push({
+        code: 'DUPLICATE_PAIR',
+        detail: `${dupSecond.id} duplicateOfId ${String(dupSecond.duplicateOfId)} does not link to ${dupFirst.id}`,
+      })
+    }
+    if (dupFirst.amount !== dupSecond.amount) {
+      errors.push({
+        code: 'DUPLICATE_PAIR',
+        detail: `duplicate pair amounts differ: ${dupFirst.amount} vs ${dupSecond.amount}`,
+      })
+    }
+    if (
+      !payrollAccountIds.has(dupFirst.accountId) ||
+      !payrollAccountIds.has(dupSecond.accountId)
+    ) {
+      errors.push({
+        code: 'DUPLICATE_PAIR',
+        detail: 'the duplicate pair is not drawn from payroll accounts',
+      })
+    }
+    // The requester chains (authored reason bodies) must differ: close
+    // reading is the tell.
+    if (dupFirst.reason.trim() === dupSecond.reason.trim()) {
+      errors.push({
+        code: 'DUPLICATE_PAIR',
+        detail: 'the duplicate pair shares an identical requester chain; the bodies must differ',
+      })
+    }
+  }
+  const linkedRequests = payload.requests.filter((r) => r.duplicateOfId !== null)
+  if (linkedRequests.length !== 1) {
+    errors.push({
+      code: 'DUPLICATE_PAIR',
+      detail: `expected exactly one duplicateOf link, found ${linkedRequests.length}`,
+    })
+  } else if (linkedRequests[0]!.id !== anchors.payrollDuplicateSecondId) {
+    errors.push({
+      code: 'DUPLICATE_PAIR',
+      detail: `the duplicateOf link is on ${linkedRequests[0]!.id}, not the anchor ${anchors.payrollDuplicateSecondId}`,
+    })
+  }
+
+  // Rule: exactly one DISPUTED request whose authored body structurally
+  // contradicts its account's history. The contradiction hook is the authored
+  // disputeClaimBalance differing from the account's opening balance, the
+  // record it references exists and has a desk row, and only this one request
+  // is disputed.
+  const disputedRequests = payload.requests.filter((r) => r.disputed)
+  if (disputedRequests.length !== 1) {
+    errors.push({
+      code: 'DISPUTED_REQUEST',
+      detail: `expected exactly one disputed request, found ${disputedRequests.length}`,
+    })
+  }
+  const disputed = requestById.get(anchors.disputedRequestId)
+  if (!disputed) {
+    errors.push({
+      code: 'DISPUTED_REQUEST',
+      detail: `disputed request ${anchors.disputedRequestId} not present`,
+    })
+  } else {
+    if (!disputed.disputed) {
+      errors.push({
+        code: 'DISPUTED_REQUEST',
+        detail: `request ${disputed.id} is the anchor disputed request but its disputed flag is false`,
+      })
+    }
+    const account = payload.accounts.find((a) => a.id === disputed.accountId)
+    if (!account) {
+      errors.push({
+        code: 'DISPUTED_REQUEST',
+        detail: `disputed request ${disputed.id} references unknown account ${disputed.accountId}`,
+      })
+    } else {
+      const claim = disputed.disputeClaimBalance
+      if (!isFiniteInteger(claim)) {
+        errors.push({
+          code: 'DISPUTED_REQUEST',
+          detail: `disputed request ${disputed.id} has no integer disputeClaimBalance to contradict the account history`,
+        })
+      } else if (claim === account.openingBalance) {
+        errors.push({
+          code: 'DISPUTED_REQUEST',
+          detail: `disputed request ${disputed.id} claim ${claim} does not contradict account ${account.id} opening balance ${account.openingBalance}`,
+        })
+      }
+    }
+    if (
+      typeof disputed.recordId !== 'string' ||
+      !records.some((r) => r.id === disputed.recordId)
+    ) {
+      errors.push({
+        code: 'DISPUTED_REQUEST',
+        detail: `disputed request ${disputed.id} does not reference a real evidence record`,
+      })
+    }
+  }
+
+  // Rule: thresholds strictly descending.
+  for (let i = 1; i < payload.thresholds.length; i += 1) {
+    if (payload.thresholds[i]!.value >= payload.thresholds[i - 1]!.value) {
+      errors.push({
+        code: 'THRESHOLD_DESCENT',
+        detail: `threshold ${payload.thresholds[i]!.value} is not strictly below the prior ${payload.thresholds[i - 1]!.value}`,
+      })
+    }
+  }
+
+  // Rule: every request carries a non-empty reason.
+  for (const request of payload.requests) {
+    if (request.reason.trim().length === 0) {
+      errors.push({
+        code: 'REQUEST_REASON',
+        detail: `request ${request.id} has an empty reason`,
+      })
+    }
+  }
+
+  // Rule: every tuning value, balance, amount, offset, and series entry is a
+  // finite integer; no NaN or Infinity; the payload JSON round-trips strict-
+  // equal.
+  const integerChecks: Array<readonly [string, unknown]> = [
+    ['broadHoldCount', payload.broadHoldCount],
+    ['tickIntervalSeconds', payload.tickIntervalSeconds],
+    ['standardDurationSeconds', payload.standardDurationSeconds],
+    ['startingConfidence', payload.startingConfidence],
+    ['floor', payload.floor],
+    ['collapseFloor', payload.collapseFloor],
+    ['target', payload.target],
+    ['holdShiftPercent', payload.holdShiftPercent],
+    ['confidenceDelta.perHeldAccount', payload.confidenceDelta.perHeldAccount],
+    ['confidenceDelta.perClearedPayment', payload.confidenceDelta.perClearedPayment],
+    ['confidenceDelta.perSelectiveRelease', payload.confidenceDelta.perSelectiveRelease],
+    ['confidenceDelta.cashBelowFloor', payload.confidenceDelta.cashBelowFloor],
+  ]
+  for (const account of payload.accounts) {
+    integerChecks.push([`account ${account.id} openingBalance`, account.openingBalance])
+  }
+  for (const request of payload.requests) {
+    integerChecks.push([`request ${request.id} amount`, request.amount])
+    integerChecks.push([`request ${request.id} offset`, request.offsetSeconds])
+  }
+  for (const payment of payload.payments) {
+    integerChecks.push([`payment ${payment.id} amount`, payment.amount])
+    integerChecks.push([`payment ${payment.id} dueOffset`, payment.dueOffsetSeconds])
+    integerChecks.push([`payment ${payment.id} bonus`, payment.confidenceBonus])
+  }
+  for (const threshold of payload.thresholds) {
+    integerChecks.push([`threshold ${threshold.value}`, threshold.value])
+    for (const inj of threshold.injected) {
+      integerChecks.push([`injection ${inj.id} base`, inj.baseAmount])
+    }
+  }
+  payload.predictionSeries.forEach((value, i) => {
+    integerChecks.push([`predictionSeries[${i}]`, value])
+  })
+  for (const [label, value] of integerChecks) {
+    if (!isFiniteInteger(value)) {
+      errors.push({
+        code: 'TUNING_INTEGER',
+        detail: `${label} is not a finite integer (${String(value)})`,
+      })
+    }
+  }
+
+  // Rule: prediction-series shape. At every tick index the unshifted series
+  // tracks at or below the base observed stream (authored requests aggregated
+  // per tick, injections excluded), and the hold-shifted series (base plus
+  // holdShiftPercent) strictly exceeds the base observed stream. This makes
+  // the divergence read as circular validation, not noise.
+  const baseStream = baseObservedPerTick(payload, payload.predictionSeries.length)
+  payload.predictionSeries.forEach((series, i) => {
+    const observed = baseStream[i]!
+    if (series > observed) {
+      errors.push({
+        code: 'PREDICTION_SHAPE',
+        detail: `unshifted prediction ${series} at tick ${i} exceeds the base observed stream ${observed}`,
+      })
+    }
+    const shifted = series + Math.trunc((series * payload.holdShiftPercent) / 100)
+    if (shifted <= observed) {
+      errors.push({
+        code: 'PREDICTION_SHAPE',
+        detail: `hold-shifted prediction ${shifted} at tick ${i} does not exceed the base observed stream ${observed}`,
+      })
+    }
+  })
+
+  // Rule: the hold-justification record exists, is DERIVED with run ancestry
+  // reaching the seed's exercise root at the exercise run, and is designated
+  // in clueRecords with the D-83 clue id.
+  const justification = records.find((r) => r.id === anchors.justificationRecordId)
+  if (!justification) {
+    errors.push({
+      code: 'JUSTIFICATION_PROVENANCE',
+      detail: `hold-justification record ${anchors.justificationRecordId} not in the record graph`,
+    })
+  } else {
+    if (justification.origin !== 'DERIVED') {
+      errors.push({
+        code: 'JUSTIFICATION_PROVENANCE',
+        detail: `justification ${justification.id} origin ${justification.origin}, not DERIVED`,
+      })
+    }
+    const root = traceRoot(records, justification.id)
+    if (!root || root.id !== anchors.exerciseRootRecordId) {
+      errors.push({
+        code: 'JUSTIFICATION_PROVENANCE',
+        detail: `justification ${justification.id} ancestry reaches ${root?.id ?? 'nothing'}, not the exercise root ${anchors.exerciseRootRecordId}`,
+      })
+    } else if (root.origin !== 'EXERCISE' || root.runId !== anchors.runId) {
+      errors.push({
+        code: 'JUSTIFICATION_PROVENANCE',
+        detail: `exercise root ${root.id} origin ${root.origin} run ${String(root.runId)}, expected EXERCISE run ${anchors.runId}`,
+      })
+    }
+  }
+  const clueEntry = clueRecords.find(
+    (e) => e.recordId === anchors.justificationRecordId && e.clueId === anchors.clueId,
+  )
+  if (!clueEntry) {
+    errors.push({
+      code: 'CLUE_RECORD_MISSING',
+      detail: `clueRecords has no { ${anchors.justificationRecordId}, ${anchors.clueId} } entry`,
+    })
+  }
+
+  // Rule: every record id referenced anywhere in the bank payload has a
+  // deskChecks row. The justification record and the disputed request's record
+  // are the referenced ids; collect any recordId a request carries.
+  const deskIds = new Set(deskChecks.map((d) => d.recordId))
+  const referencedRecordIds = new Set<string>([anchors.justificationRecordId])
+  for (const request of payload.requests) {
+    if (typeof request.recordId === 'string') {
+      referencedRecordIds.add(request.recordId)
+    }
+  }
+  for (const recordId of referencedRecordIds) {
+    if (!deskIds.has(recordId)) {
+      errors.push({
+        code: 'DESKCHECK_MISSING',
+        detail: `referenced record ${recordId} has no deskChecks row`,
+      })
+    }
+  }
+
+  // Rule: the bank schedule carries the 30 and 10 second end warning
+  // milestones.
+  const warnings = schedule
+    .filter((spec) => spec.kind === 'timerMilestone' && spec.anchor === 'end')
+    .map((spec) => spec.offsetSeconds)
+    .sort((a, b) => a - b)
+  if (warnings[0] !== 10 || warnings[1] !== 30 || warnings.length !== 2) {
+    errors.push({
+      code: 'SCHEDULE_WARNING',
+      detail: `bank schedule end warnings are ${JSON.stringify(warnings)}, expected [10, 30]`,
+    })
+  }
+
+  // Rule: the payload JSON round-trips strict-equal (no undefined, no
+  // functions, no non-finite numbers smuggled in).
+  try {
+    if (JSON.stringify(JSON.parse(JSON.stringify(payload))) !== JSON.stringify(payload)) {
+      errors.push({
+        code: 'JSON_ROUNDTRIP',
+        detail: 'payload does not JSON round-trip strict-equal',
+      })
+    }
+  } catch {
+    errors.push({ code: 'JSON_ROUNDTRIP', detail: 'payload is not JSON-serializable' })
+  }
+
+  return errors
+}
diff --git a/src/engine/missions/bank/payloads.ts b/src/engine/missions/bank/payloads.ts
new file mode 100644
index 0000000..8dfc682
--- /dev/null
+++ b/src/engine/missions/bank/payloads.ts
@@ -0,0 +1,212 @@
+// The three authored FREEZE BANK ACCOUNTS payloads and their per-seed anchor
+// tables, one per curated seed. Mirrors flights/payloads.ts: the authored
+// content lives here, the catalog imports it into missionPayloads.bank, and
+// the content validator and the solvability tests read BANK_ANCHORS_BY_SEED.
+//
+// Every seed carries the same mechanical structure so all three pass the one
+// validator and both surge sizing variants: ten accounts across the five
+// flavors, eighteen requests including the one payroll duplicate pair and the
+// one disputed request, four critical payments, three strictly-descending
+// thresholds, and a per-tick prediction series whose unshifted line tracks at
+// or below the base observed withdrawal stream while the hold-shifted line
+// strictly exceeds it. Only the names, record ids, and run stamps change: the
+// incident flavor differs (R04 restriction, K11 icing, T58 crosswind), the
+// account names and request bodies are reworded, but the tuning numbers hold
+// the solvability contract constant.
+//
+// Copy rules: uppercase terminal diction, no em-dashes, invented names only,
+// reason lines in plain English since the debrief aggregates them.
+import type { BankPayload, BankSeedAnchors } from './content'
+
+/** The D-83 clue id the hold-justification record is designated for. This is
+ *  the ledger-hold vector split 01 established (CLUE_IDS.ledgerHold in the
+ *  catalog): inspecting the hold-justification record logs it. */
+export const BANK_CLUE_ID = 'clue-d83-ledger-hold'
+
+/** The shared mechanical tuning every seed reuses so the one validator and
+ *  both surge variants pass unchanged. Names and bodies are layered on top
+ *  per seed; these numbers are the solvability contract. */
+interface BankSeedShape {
+  readonly names: {
+    readonly payrollNorth: string
+    readonly payrollSouth: string
+    readonly opsMain: string
+    readonly opsAux: string
+    readonly vendorHale: string
+    readonly vendorOrr: string
+    readonly municipalEld: string
+    readonly municipalVane: string
+    readonly depositorReeve: string
+    readonly depositorAshe: string
+  }
+  /** The bank hold-justification record id this seed designates (B04 in seed
+   *  one). Also the record the disputed request runs CHECK SOURCE against. */
+  readonly justificationRecordId: string
+  readonly exerciseRootRecordId: string
+  readonly runId: string
+  /** The incident the hold cites, woven into the reason bodies for flavor. */
+  readonly incidentLine: string
+}
+
+function buildBankPayload(shape: BankSeedShape): BankPayload {
+  const n = shape.names
+  return {
+    accounts: [
+      { id: 'PAY-NORTH', name: n.payrollNorth, flavor: 'STAFF PAYROLL POOL', flavorKind: 'payroll', openingBalance: 4000, limitEligible: false },
+      { id: 'PAY-SOUTH', name: n.payrollSouth, flavor: 'STAFF PAYROLL POOL', flavorKind: 'payroll', openingBalance: 3000, limitEligible: false },
+      { id: 'OPS-MAIN', name: n.opsMain, flavor: 'OPERATING EXPENSE', flavorKind: 'operating', openingBalance: 6000, limitEligible: true },
+      { id: 'OPS-AUX', name: n.opsAux, flavor: 'OPERATING EXPENSE', flavorKind: 'operating', openingBalance: 5000, limitEligible: true },
+      { id: 'VEN-HALE', name: n.vendorHale, flavor: 'VENDOR SETTLEMENT', flavorKind: 'vendor', openingBalance: 3500, limitEligible: true },
+      { id: 'VEN-ORR', name: n.vendorOrr, flavor: 'VENDOR SETTLEMENT', flavorKind: 'vendor', openingBalance: 2500, limitEligible: false },
+      { id: 'MUN-ELD', name: n.municipalEld, flavor: 'MUNICIPAL ACCOUNT', flavorKind: 'municipal', openingBalance: 4500, limitEligible: true },
+      { id: 'MUN-VANE', name: n.municipalVane, flavor: 'MUNICIPAL ACCOUNT', flavorKind: 'municipal', openingBalance: 3200, limitEligible: false },
+      { id: 'DEP-REEVE', name: n.depositorReeve, flavor: 'PRIME DEPOSITOR', flavorKind: 'depositor', openingBalance: 2800, limitEligible: false },
+      { id: 'DEP-ASHE', name: n.depositorAshe, flavor: 'PRIME DEPOSITOR', flavorKind: 'depositor', openingBalance: 2200, limitEligible: false },
+    ],
+    requests: [
+      { id: 'W01', accountId: 'DEP-REEVE', amount: 200, offsetSeconds: 20, reason: 'DEPOSITOR DRAWS AGAINST THE MORNING PANIC.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W02', accountId: 'VEN-HALE', amount: 150, offsetSeconds: 30, reason: 'VENDOR CLEARS AN INVOICE EARLY.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W03', accountId: 'PAY-NORTH', amount: 500, offsetSeconds: 40, reason: 'PAYROLL BATCH FILED BY THE NORTH DESK CLERK.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W04', accountId: 'MUN-ELD', amount: 250, offsetSeconds: 50, reason: 'MUNICIPAL TRANSFER ON ITS NORMAL SCHEDULE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W05', accountId: 'OPS-AUX', amount: 180, offsetSeconds: 55, reason: 'OPERATING SWEEP TO CLEAR A SUPPLIER.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W06', accountId: 'DEP-ASHE', amount: 300, offsetSeconds: 70, reason: 'DEPOSITOR WITHDRAWS AFTER THE RUMOR SPREADS.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W07', accountId: 'VEN-ORR', amount: 220, offsetSeconds: 80, reason: 'LOGISTICS VENDOR PULLS A SETTLEMENT FORWARD.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W08', accountId: 'MUN-VANE', amount: 400, offsetSeconds: 90, reason: `COUNTY DISPUTES A BALANCE IT NEVER HELD, CITING ${shape.incidentLine}.`, duplicateOfId: null, disputed: true, recordId: shape.justificationRecordId, disputeClaimBalance: 9000 },
+      { id: 'W09', accountId: 'PAY-NORTH', amount: 500, offsetSeconds: 100, reason: 'PAYROLL BATCH FILED AGAIN BY THE SOUTH DESK SUPERVISOR.', duplicateOfId: 'W03', disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W10', accountId: 'OPS-MAIN', amount: 260, offsetSeconds: 110, reason: 'OPERATING ACCOUNT MEETS A STANDING ORDER.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W11', accountId: 'DEP-REEVE', amount: 250, offsetSeconds: 120, reason: 'DEPOSITOR TAKES A SECOND SLICE OF CASH.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W12', accountId: 'VEN-HALE', amount: 170, offsetSeconds: 130, reason: 'VENDOR CLEARS A LATE INVOICE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W13', accountId: 'MUN-ELD', amount: 300, offsetSeconds: 140, reason: 'MUNICIPAL PAYROLL RELIEF MOVES OUT.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W14', accountId: 'DEP-ASHE', amount: 280, offsetSeconds: 150, reason: 'DEPOSITOR DRAWS DOWN TO CASH.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W15', accountId: 'OPS-AUX', amount: 200, offsetSeconds: 160, reason: 'OPERATING SWEEP CONTINUES.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W16', accountId: 'VEN-ORR', amount: 190, offsetSeconds: 170, reason: 'VENDOR PULLS A FINAL SETTLEMENT.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W17', accountId: 'MUN-VANE', amount: 210, offsetSeconds: 180, reason: 'COUNTY CLEARS A ROUTINE TRANSFER.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+      { id: 'W18', accountId: 'DEP-REEVE', amount: 230, offsetSeconds: 190, reason: 'DEPOSITOR TAKES A LAST TRANCHE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+    ],
+    payments: [
+      { id: 'PM1', accountId: 'OPS-MAIN', amount: 900, dueOffsetSeconds: 95, confidenceBonus: 6, reason: 'OPERATING PAYROLL RUN MUST CLEAR.' },
+      { id: 'PM2', accountId: 'VEN-HALE', amount: 700, dueOffsetSeconds: 125, confidenceBonus: 6, reason: 'VENDOR SETTLEMENT DUE TO THE SUPPLY DESK.' },
+      { id: 'PM3', accountId: 'MUN-ELD', amount: 800, dueOffsetSeconds: 155, confidenceBonus: 6, reason: 'MUNICIPAL OBLIGATION DUE TO THE COUNTY.' },
+      { id: 'PM4', accountId: 'OPS-AUX', amount: 650, dueOffsetSeconds: 185, confidenceBonus: 6, reason: 'OPERATING SETTLEMENT DUE AT CLOSE.' },
+    ],
+    broadHoldCount: 3,
+    tickIntervalSeconds: 60,
+    standardDurationSeconds: 240,
+    confidenceDelta: {
+      perHeldAccount: -3,
+      perClearedPayment: 7,
+      perSelectiveRelease: 2,
+      cashBelowFloor: -8,
+    },
+    startingConfidence: 72,
+    thresholds: [
+      { value: 60, injected: [{ id: 'INJ-60', accountId: 'OPS-MAIN', baseAmount: 150, reason: 'CONTAGION DRAW AS CONFIDENCE SLIPS.' }] },
+      { value: 45, injected: [{ id: 'INJ-45', accountId: 'VEN-HALE', baseAmount: 150, reason: 'CONTAGION DRAW DEEPENS.' }] },
+      { value: 30, injected: [{ id: 'INJ-30', accountId: 'OPS-AUX', baseAmount: 150, reason: 'CONTAGION DRAW AT THE PANIC FLOOR.' }] },
+    ],
+    floor: 8000,
+    collapseFloor: 0,
+    target: 55,
+    predictionSeries: [1200, 1800, 1300],
+    holdShiftPercent: 35,
+    introLines: [
+      'DEPOSITOR CONFIDENCE IS THE PRESSURE HERE.',
+      'HOLD TOO MUCH AND THE LINE YOU CITE BECOMES THE LINE YOU CAUSED.',
+      'CLEAR THE FOUR CRITICAL PAYMENTS AND SETTLE ABOVE THE FLOOR.',
+    ],
+    tierThresholds: { full: 3, partial: 2, poor: 1 },
+    paymentsDelayedTargetAccountId: 'DEP-REEVE',
+    paymentsDelayedTable: { full: 0, partial: 6, poor: 12, failed: 18 },
+  }
+}
+
+function anchorsFor(shape: BankSeedShape): BankSeedAnchors {
+  return {
+    runId: shape.runId,
+    justificationRecordId: shape.justificationRecordId,
+    exerciseRootRecordId: shape.exerciseRootRecordId,
+    clueId: BANK_CLUE_ID,
+    disputedRequestId: 'W08',
+    payrollDuplicateFirstId: 'W03',
+    payrollDuplicateSecondId: 'W09',
+    requestCount: 18,
+    paymentCount: 4,
+  }
+}
+
+const SHAPE_R04: BankSeedShape = {
+  names: {
+    payrollNorth: 'NORTHWIND PAYROLL',
+    payrollSouth: 'SOUTHGATE PAYROLL',
+    opsMain: 'MERIDIAN OPERATING',
+    opsAux: 'CALDERA OPERATING',
+    vendorHale: 'HALE SUPPLY',
+    vendorOrr: 'ORR LOGISTICS',
+    municipalEld: 'ELDRIDGE MUNICIPAL',
+    municipalVane: 'VANE COUNTY',
+    depositorReeve: 'REEVE FAMILY TRUST',
+    depositorAshe: 'ASHE HOLDINGS',
+  },
+  justificationRecordId: 'B04',
+  exerciseRootRecordId: 'C17',
+  runId: 'R04',
+  incidentLine: 'THE ALL HUBS RESTRICTION',
+}
+
+const SHAPE_K11: BankSeedShape = {
+  names: {
+    payrollNorth: 'DAWNLINE PAYROLL',
+    payrollSouth: 'HARROW PAYROLL',
+    opsMain: 'KESTREL OPERATING',
+    opsAux: 'LARKIN OPERATING',
+    vendorHale: 'MABRY SUPPLY',
+    vendorOrr: 'NOLAN FREIGHT',
+    municipalEld: 'PRESCOTT MUNICIPAL',
+    municipalVane: 'QUAIL DISTRICT',
+    depositorReeve: 'RENWICK TRUST',
+    depositorAshe: 'STRAND HOLDINGS',
+  },
+  justificationRecordId: 'H03',
+  exerciseRootRecordId: 'A09',
+  runId: 'K11',
+  incidentLine: 'THE NATIONWIDE GROUND STOP',
+}
+
+const SHAPE_T58: BankSeedShape = {
+  names: {
+    payrollNorth: 'TALLOW PAYROLL',
+    payrollSouth: 'UPTON PAYROLL',
+    opsMain: 'VESPER OPERATING',
+    opsAux: 'WREN OPERATING',
+    vendorHale: 'YARROW SUPPLY',
+    vendorOrr: 'ZEPHYR FREIGHT',
+    municipalEld: 'ALDER MUNICIPAL',
+    municipalVane: 'BRACKEN DISTRICT',
+    depositorReeve: 'CORVIN TRUST',
+    depositorAshe: 'DELMAR HOLDINGS',
+  },
+  justificationRecordId: 'K08',
+  exerciseRootRecordId: 'E22',
+  runId: 'T58',
+  incidentLine: 'THE TOTAL TRAFFIC HALT',
+}
+
+export const BANK_PAYLOAD_R04: BankPayload = buildBankPayload(SHAPE_R04)
+export const BANK_PAYLOAD_K11: BankPayload = buildBankPayload(SHAPE_K11)
+export const BANK_PAYLOAD_T58: BankPayload = buildBankPayload(SHAPE_T58)
+
+const BANK_ANCHORS_R04: BankSeedAnchors = anchorsFor(SHAPE_R04)
+const BANK_ANCHORS_K11: BankSeedAnchors = anchorsFor(SHAPE_K11)
+const BANK_ANCHORS_T58: BankSeedAnchors = anchorsFor(SHAPE_T58)
+
+export const BANK_PAYLOAD_BY_SEED: Readonly<Record<string, BankPayload>> = {
+  'exercise-r04': BANK_PAYLOAD_R04,
+  'exercise-k11': BANK_PAYLOAD_K11,
+  'exercise-t58': BANK_PAYLOAD_T58,
+}
+
+export const BANK_ANCHORS_BY_SEED: Readonly<Record<string, BankSeedAnchors>> = {
+  'exercise-r04': BANK_ANCHORS_R04,
+  'exercise-k11': BANK_ANCHORS_K11,
+  'exercise-t58': BANK_ANCHORS_T58,
+}
diff --git a/src/engine/seeds/catalog.ts b/src/engine/seeds/catalog.ts
index 71602d6..9b7415e 100644
--- a/src/engine/seeds/catalog.ts
+++ b/src/engine/seeds/catalog.ts
@@ -23,6 +23,13 @@ import {
   FLIGHTS_PAYLOAD_K11,
   FLIGHTS_PAYLOAD_T58,
 } from '../missions/flights/payloads'
+import type { BankPayload } from '../missions/bank/content'
+import { bankSchedule } from '../missions/bank/module'
+import {
+  BANK_PAYLOAD_R04,
+  BANK_PAYLOAD_K11,
+  BANK_PAYLOAD_T58,
+} from '../missions/bank/payloads'
 
 export const MISSION_IDS = ['outlook', 'flights', 'bank'] as const
 export const FINALE_ID = 'finale'
@@ -70,6 +77,7 @@ interface SeedSpec {
   clueRecords: ClueRecordEntry[]
   outlookPayload: OutlookPayload
   flightsPayload: FlightsPayload
+  bankPayload: BankPayload
   openExceptionsBaseline: number
 }
 
@@ -85,7 +93,7 @@ function build(spec: SeedSpec): SeedDefinition {
     missionPayloads: {
       outlook: spec.outlookPayload,
       flights: spec.flightsPayload,
-      bank: null,
+      bank: spec.bankPayload,
       finale: null,
     },
     schedules: {
@@ -111,30 +119,12 @@ function build(spec: SeedSpec): SeedDefinition {
       // and the end settle tick) plus the shared end-anchored warnings the
       // seed-validation invariant asserts on every mission.
       flights: [...milestones(), ...flightsSchedule(spec.flightsPayload)],
-      bank: [
-        ...milestones(),
-        {
-          id: 'tick-1',
-          offsetSeconds: 60,
-          anchor: 'start',
-          kind: 'confidenceTick',
-          payload: null,
-        },
-        {
-          id: 'tick-2',
-          offsetSeconds: 120,
-          anchor: 'start',
-          kind: 'confidenceTick',
-          payload: null,
-        },
-        {
-          id: 'tick-3',
-          offsetSeconds: 180,
-          anchor: 'start',
-          kind: 'confidenceTick',
-          payload: null,
-        },
-      ],
+      // The real bank schedule is materialized from the payload (the offset-0
+      // start, each withdrawal wave, confidence ticks at the authored interval,
+      // the payment-due reminders, and the end settle tick) plus the shared
+      // end-anchored warnings the seed-validation invariant asserts on every
+      // mission.
+      bank: [...milestones(), ...bankSchedule(spec.bankPayload)],
       finale: [
         ...milestones(),
         {
@@ -265,9 +255,12 @@ const seedOne = build({
     },
     {
       recordId: 'B04',
-      outcome: 'PENDING',
+      outcome: 'CONTRADICTED',
       delaySeconds: 50,
-      replyBody: ['BANK DESK QUEUE BACKED UP'],
+      replyBody: [
+        'BANK DESK CONTRADICTS THE EMERGENCY HOLD BASIS',
+        'NO SYSTEM-WIDE SHUTDOWN ON RECORD; THE DISPUTED BALANCE WAS NEVER HELD',
+      ],
     },
     {
       recordId: 'W02',
@@ -294,6 +287,7 @@ const seedOne = build({
   ],
   outlookPayload: OUTLOOK_PAYLOAD_R04,
   flightsPayload: FLIGHTS_PAYLOAD_R04,
+  bankPayload: BANK_PAYLOAD_R04,
   openExceptionsBaseline: 12,
 })
 
@@ -388,9 +382,12 @@ const seedTwo = build({
     },
     {
       recordId: 'H03',
-      outcome: 'PENDING',
+      outcome: 'CONTRADICTED',
       delaySeconds: 50,
-      replyBody: ['QUEUE BACKED UP'],
+      replyBody: [
+        'BANK DESK CONTRADICTS THE EMERGENCY HOLD BASIS',
+        'NO NATIONWIDE GROUND STOP ON RECORD; THE DISPUTED BALANCE WAS NEVER HELD',
+      ],
     },
     {
       recordId: 'V07',
@@ -417,6 +414,7 @@ const seedTwo = build({
   ],
   outlookPayload: OUTLOOK_PAYLOAD_K11,
   flightsPayload: FLIGHTS_PAYLOAD_K11,
+  bankPayload: BANK_PAYLOAD_K11,
   openExceptionsBaseline: 14,
 })
 
@@ -511,9 +509,12 @@ const seedThree = build({
     },
     {
       recordId: 'K08',
-      outcome: 'PENDING',
+      outcome: 'CONTRADICTED',
       delaySeconds: 50,
-      replyBody: ['QUEUE BACKED UP'],
+      replyBody: [
+        'BANK DESK CONTRADICTS THE EMERGENCY HOLD BASIS',
+        'NO TOTAL TRAFFIC HALT ON RECORD; THE DISPUTED BALANCE WAS NEVER HELD',
+      ],
     },
     {
       recordId: 'U04',
@@ -540,6 +541,7 @@ const seedThree = build({
   ],
   outlookPayload: OUTLOOK_PAYLOAD_T58,
   flightsPayload: FLIGHTS_PAYLOAD_T58,
+  bankPayload: BANK_PAYLOAD_T58,
   openExceptionsBaseline: 10,
 })
 
diff --git a/test/engine/missions/bank/content.test.ts b/test/engine/missions/bank/content.test.ts
new file mode 100644
index 0000000..19ec489
--- /dev/null
+++ b/test/engine/missions/bank/content.test.ts
@@ -0,0 +1,300 @@
+// The FREEZE BANK ACCOUNTS content validator and authoring suite, run through
+// the full validator and asserted STRUCTURALLY over the three authored seeds.
+// The validator and the tests share one anchor table (BANK_ANCHORS_BY_SEED)
+// so a dropped rule shows up as a dropped assertion. Module rules (application
+// tables, broad-hold stamping, terminal paths) are section-01's suite; the
+// solvability invariants need the module lifecycle and live in
+// solvability.test.ts.
+import { describe, expect, it } from 'vitest'
+import { SEED_CATALOG, SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  BANK_ACCOUNT_FLAVORS,
+  baseObservedPerTick,
+  validateBankContent,
+} from '@engine/missions/bank/content'
+import type {
+  BankContentError,
+  BankPayload,
+} from '@engine/missions/bank/content'
+import { bankSchedule } from '@engine/missions/bank/module'
+import { BANK_ANCHORS_BY_SEED } from '@engine/missions/bank/payloads'
+import type { ScheduledEventSpec } from '@engine/time'
+
+// The single authoritative per-seed authored request count the validator pins
+// (about eighteen; exactly eighteen here).
+const EXPECTED_REQUEST_COUNT: Record<string, number> = {
+  'exercise-r04': 18,
+  'exercise-k11': 18,
+  'exercise-t58': 18,
+}
+
+function payloadFor(seedName: string): BankPayload {
+  return SEED_CATALOG[seedName]!.missionPayloads['bank'] as BankPayload
+}
+
+/** The bank schedule the catalog authored (milestones plus the materialized
+ *  schedule), so the warning-milestone rule runs against the real table. */
+function scheduleFor(seedName: string): ScheduledEventSpec[] {
+  return [...SEED_CATALOG[seedName]!.schedules['bank']!]
+}
+
+function validate(seedName: string): BankContentError[] {
+  const seed = SEED_CATALOG[seedName]!
+  return validateBankContent(
+    payloadFor(seedName),
+    seed.records,
+    seed.deskChecks,
+    seed.clueRecords,
+    scheduleFor(seedName),
+    BANK_ANCHORS_BY_SEED[seedName]!,
+  )
+}
+
+function errorsOfCode(
+  errors: readonly BankContentError[],
+  code: BankContentError['code'],
+): BankContentError[] {
+  return errors.filter((e) => e.code === code)
+}
+
+describe.each(SEED_NAMES)('FREEZE BANK ACCOUNTS content: %s', (seedName) => {
+  const payload = payloadFor(seedName)
+  const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+
+  it('authored content is clean through the full validator', () => {
+    expect(validate(seedName)).toEqual([])
+  })
+
+  it('exactly ten accounts with unique ids across the five flavors', () => {
+    expect(payload.accounts).toHaveLength(10)
+    const ids = new Set(payload.accounts.map((a) => a.id))
+    expect(ids.size).toBe(10)
+    for (const flavor of BANK_ACCOUNT_FLAVORS) {
+      expect(payload.accounts.some((a) => a.flavorKind === flavor)).toBe(true)
+    }
+    expect(errorsOfCode(validate(seedName), 'ACCOUNT_COUNT')).toEqual([])
+    expect(errorsOfCode(validate(seedName), 'ACCOUNT_ID_UNIQUE')).toEqual([])
+    expect(errorsOfCode(validate(seedName), 'ACCOUNT_FLAVOR')).toEqual([])
+  })
+
+  it('carries the exact authored request count and exactly four payments', () => {
+    expect(payload.requests).toHaveLength(EXPECTED_REQUEST_COUNT[seedName]!)
+    expect(anchors.requestCount).toBe(EXPECTED_REQUEST_COUNT[seedName]!)
+    expect(payload.payments).toHaveLength(4)
+    expect(errorsOfCode(validate(seedName), 'REQUEST_COUNT')).toEqual([])
+    expect(errorsOfCode(validate(seedName), 'PAYMENT_COUNT')).toEqual([])
+  })
+
+  it('exactly one payroll duplicate pair: same amount, differing chains, linked', () => {
+    const byId = new Map(payload.requests.map((r) => [r.id, r]))
+    const first = byId.get(anchors.payrollDuplicateFirstId)!
+    const second = byId.get(anchors.payrollDuplicateSecondId)!
+    // Structural: the pair shares an amount, the link runs from second to
+    // first, both are payroll accounts, and the requester-chain bodies differ.
+    expect(second.duplicateOfId).toBe(first.id)
+    expect(first.amount).toBe(second.amount)
+    const payrollIds = new Set(
+      payload.accounts.filter((a) => a.flavorKind === 'payroll').map((a) => a.id),
+    )
+    expect(payrollIds.has(first.accountId)).toBe(true)
+    expect(payrollIds.has(second.accountId)).toBe(true)
+    expect(first.reason).not.toBe(second.reason)
+    // Exactly one request in the whole stream carries a duplicateOf link.
+    expect(payload.requests.filter((r) => r.duplicateOfId !== null)).toHaveLength(1)
+    expect(errorsOfCode(validate(seedName), 'DUPLICATE_PAIR')).toEqual([])
+  })
+
+  it('exactly one disputed request whose body contradicts its account history', () => {
+    const disputed = payload.requests.filter((r) => r.disputed)
+    expect(disputed).toHaveLength(1)
+    const req = disputed[0]!
+    expect(req.id).toBe(anchors.disputedRequestId)
+    const account = payload.accounts.find((a) => a.id === req.accountId)!
+    // Structural contradiction hook: the disputed flag is set, the body
+    // references a claimed balance, and that claim conflicts with the account's
+    // authored opening balance.
+    expect(req.disputed).toBe(true)
+    expect(typeof req.disputeClaimBalance).toBe('number')
+    expect(req.disputeClaimBalance).not.toBe(account.openingBalance)
+    // The request references a real evidence record (its CHECK SOURCE target).
+    expect(payload.requests.filter((r) => typeof r.recordId === 'string')).not.toHaveLength(0)
+    expect(SEED_CATALOG[seedName]!.records.some((r) => r.id === req.recordId)).toBe(true)
+    expect(errorsOfCode(validate(seedName), 'DISPUTED_REQUEST')).toEqual([])
+  })
+
+  it('thresholds strictly descending', () => {
+    for (let i = 1; i < payload.thresholds.length; i += 1) {
+      expect(payload.thresholds[i]!.value).toBeLessThan(payload.thresholds[i - 1]!.value)
+    }
+    expect(errorsOfCode(validate(seedName), 'THRESHOLD_DESCENT')).toEqual([])
+  })
+
+  it('every request carries a non-empty reason', () => {
+    for (const request of payload.requests) {
+      expect(request.reason.trim().length).toBeGreaterThan(0)
+    }
+    expect(errorsOfCode(validate(seedName), 'REQUEST_REASON')).toEqual([])
+  })
+
+  it('every tuning value, balance, amount, offset, and series entry is a finite integer', () => {
+    const ints: number[] = [
+      payload.broadHoldCount,
+      payload.tickIntervalSeconds,
+      payload.standardDurationSeconds,
+      payload.startingConfidence,
+      payload.floor,
+      payload.collapseFloor,
+      payload.target,
+      payload.holdShiftPercent,
+      ...payload.accounts.map((a) => a.openingBalance),
+      ...payload.requests.flatMap((r) => [r.amount, r.offsetSeconds]),
+      ...payload.payments.flatMap((p) => [p.amount, p.dueOffsetSeconds, p.confidenceBonus]),
+      ...payload.predictionSeries,
+    ]
+    for (const n of ints) {
+      expect(Number.isInteger(n)).toBe(true)
+      expect(Number.isFinite(n)).toBe(true)
+    }
+    expect(errorsOfCode(validate(seedName), 'TUNING_INTEGER')).toEqual([])
+  })
+
+  it('the payload JSON round-trips strict-equal', () => {
+    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
+    expect(errorsOfCode(validate(seedName), 'JSON_ROUNDTRIP')).toEqual([])
+  })
+
+  it('prediction-series shape: unshifted tracks at or below, hold-shifted exceeds', () => {
+    const base = baseObservedPerTick(payload, payload.predictionSeries.length)
+    payload.predictionSeries.forEach((series, i) => {
+      const observed = base[i]!
+      expect(series).toBeLessThanOrEqual(observed)
+      const shifted = series + Math.trunc((series * payload.holdShiftPercent) / 100)
+      expect(shifted).toBeGreaterThan(observed)
+    })
+    expect(errorsOfCode(validate(seedName), 'PREDICTION_SHAPE')).toEqual([])
+  })
+
+  it('the hold-justification record is DERIVED, reaches the exercise root, and is a D-83 clue record', () => {
+    const seed = SEED_CATALOG[seedName]!
+    const record = seed.records.find((r) => r.id === anchors.justificationRecordId)!
+    expect(record.origin).toBe('DERIVED')
+    // Walk its ancestry to the exercise root at the exercise run.
+    const byId = new Map(seed.records.map((r) => [r.id, r]))
+    let cursor = record
+    const seen = new Set<string>([cursor.id])
+    while (cursor.parentId !== null && !seen.has(cursor.parentId)) {
+      const parent = byId.get(cursor.parentId)
+      if (!parent) break
+      seen.add(parent.id)
+      cursor = parent
+    }
+    expect(cursor.id).toBe(anchors.exerciseRootRecordId)
+    expect(cursor.origin).toBe('EXERCISE')
+    expect(cursor.runId).toBe(anchors.runId)
+    expect(seed.exerciseRunId).toBe(anchors.runId)
+    // Designated in clueRecords with the D-83 clue id.
+    expect(
+      seed.clueRecords.some(
+        (e) => e.recordId === anchors.justificationRecordId && e.clueId === anchors.clueId,
+      ),
+    ).toBe(true)
+    expect(errorsOfCode(validate(seedName), 'JUSTIFICATION_PROVENANCE')).toEqual([])
+    expect(errorsOfCode(validate(seedName), 'CLUE_RECORD_MISSING')).toEqual([])
+  })
+
+  it('every record id referenced in the payload has a deskChecks row', () => {
+    const seed = SEED_CATALOG[seedName]!
+    const deskIds = new Set(seed.deskChecks.map((d) => d.recordId))
+    const referenced = new Set<string>([anchors.justificationRecordId])
+    for (const request of payload.requests) {
+      if (typeof request.recordId === 'string') referenced.add(request.recordId)
+    }
+    for (const id of referenced) expect(deskIds.has(id)).toBe(true)
+    expect(errorsOfCode(validate(seedName), 'DESKCHECK_MISSING')).toEqual([])
+  })
+
+  it('the disputed record desk outcome resolves the contradiction', () => {
+    const seed = SEED_CATALOG[seedName]!
+    const disputed = payload.requests.find((r) => r.disputed)!
+    const desk = seed.deskChecks.find((d) => d.recordId === disputed.recordId)!
+    // The desk CONTRADICTS the emergency hold basis: the disputed balance was
+    // never held, resolving the request's authored contradiction.
+    expect(desk.outcome).toBe('CONTRADICTED')
+  })
+
+  it('the bank schedule carries the 30 and 10 second end warnings', () => {
+    const warnings = scheduleFor(seedName)
+      .filter((s) => s.kind === 'timerMilestone' && s.anchor === 'end')
+      .map((s) => s.offsetSeconds)
+      .sort((a, b) => a - b)
+    expect(warnings).toEqual([10, 30])
+    expect(errorsOfCode(validate(seedName), 'SCHEDULE_WARNING')).toEqual([])
+  })
+
+  it('the schedule is derived from the payload (waves, ticks, dues)', () => {
+    // The materialized bank schedule rides in beside the milestones; assert a
+    // wave event per request and a tick per authored interval exist.
+    const sched = bankSchedule(payload)
+    expect(sched.filter((s) => s.kind === 'bankWave')).toHaveLength(payload.requests.length)
+    expect(sched.filter((s) => s.kind === 'bankDue')).toHaveLength(payload.payments.length)
+    expect(sched.some((s) => s.kind === 'confidenceTick')).toBe(true)
+  })
+})
+
+// Negative tests: the two re-authored invariants must FAIL loudly when the
+// content lies. These prove the validator checks MEANING, not existence.
+describe('the bank validator rejects untruthful content (negative)', () => {
+  const seedName = 'exercise-r04'
+  const seed = SEED_CATALOG[seedName]!
+  const base = payloadFor(seedName)
+  const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+
+  function run(payload: BankPayload): BankContentError[] {
+    return validateBankContent(
+      payload,
+      seed.records,
+      seed.deskChecks,
+      seed.clueRecords,
+      scheduleFor(seedName),
+      anchors,
+    )
+  }
+
+  it('a disputed request whose claim equals its account balance is rejected', () => {
+    const account = base.accounts.find((a) => a.id === base.requests.find((r) => r.disputed)!.accountId)!
+    const poisoned: BankPayload = {
+      ...base,
+      requests: base.requests.map((r) =>
+        r.disputed ? { ...r, disputeClaimBalance: account.openingBalance } : r,
+      ),
+    }
+    expect(run(poisoned).filter((e) => e.code === 'DISPUTED_REQUEST').length).toBeGreaterThan(0)
+  })
+
+  it('a payroll duplicate pair with matching bodies is rejected', () => {
+    const first = base.requests.find((r) => r.id === anchors.payrollDuplicateFirstId)!
+    const poisoned: BankPayload = {
+      ...base,
+      requests: base.requests.map((r) =>
+        r.id === anchors.payrollDuplicateSecondId ? { ...r, reason: first.reason } : r,
+      ),
+    }
+    expect(run(poisoned).filter((e) => e.code === 'DUPLICATE_PAIR').length).toBeGreaterThan(0)
+  })
+
+  it('a prediction series that exceeds the base observed stream is rejected', () => {
+    const poisoned: BankPayload = {
+      ...base,
+      predictionSeries: base.predictionSeries.map((n) => n + 100000),
+    }
+    expect(run(poisoned).filter((e) => e.code === 'PREDICTION_SHAPE').length).toBeGreaterThan(0)
+  })
+
+  it('ascending thresholds are rejected', () => {
+    const poisoned: BankPayload = {
+      ...base,
+      thresholds: [...base.thresholds].reverse(),
+    }
+    expect(run(poisoned).filter((e) => e.code === 'THRESHOLD_DESCENT').length).toBeGreaterThan(0)
+  })
+})
diff --git a/test/engine/missions/bank/fixtures.ts b/test/engine/missions/bank/fixtures.ts
index 5ef8aff..2f3f9e3 100644
--- a/test/engine/missions/bank/fixtures.ts
+++ b/test/engine/missions/bank/fixtures.ts
@@ -26,6 +26,8 @@ import {
 } from '@engine/missions/bank/module'
 import type { BankPayload } from '@engine/missions/bank/content'
 import type { BankState } from '@engine/missions/bank/types'
+import { SEED_CATALOG } from '@engine/seeds/catalog'
+import { BANK_ANCHORS_BY_SEED } from '@engine/missions/bank/payloads'
 import { FIXTURE_RECORDS } from '../../records/fixtures'
 
 export const BANK_DURATION_MS = 240_000
@@ -36,11 +38,11 @@ export const BANK_T0 = 1_000_000
  *  the target is 55. Two critical payments, each from a specific account. */
 export const FIXTURE_PAYLOAD: BankPayload = {
   accounts: [
-    { id: 'ANCHORA', name: 'ANCHORA HOLDINGS', flavor: 'PRIME DEPOSITOR', openingBalance: 1000, limitEligible: false },
-    { id: 'BELROSE', name: 'BELROSE TRUST', flavor: 'PENSION POOL', openingBalance: 1200, limitEligible: true },
-    { id: 'CALDERA', name: 'CALDERA FUND', flavor: 'MONEY MARKET', openingBalance: 1500, limitEligible: true },
-    { id: 'DORVEL', name: 'DORVEL ESTATE', flavor: 'FAMILY OFFICE', openingBalance: 800, limitEligible: false },
-    { id: 'EMBER', name: 'EMBER MUTUAL', flavor: 'INSURER', openingBalance: 900, limitEligible: false },
+    { id: 'ANCHORA', name: 'ANCHORA HOLDINGS', flavor: 'PRIME DEPOSITOR', flavorKind: 'depositor', openingBalance: 1000, limitEligible: false },
+    { id: 'BELROSE', name: 'BELROSE TRUST', flavor: 'PENSION POOL', flavorKind: 'municipal', openingBalance: 1200, limitEligible: true },
+    { id: 'CALDERA', name: 'CALDERA FUND', flavor: 'MONEY MARKET', flavorKind: 'operating', openingBalance: 1500, limitEligible: true },
+    { id: 'DORVEL', name: 'DORVEL ESTATE', flavor: 'FAMILY OFFICE', flavorKind: 'vendor', openingBalance: 800, limitEligible: false },
+    { id: 'EMBER', name: 'EMBER MUTUAL', flavor: 'INSURER', flavorKind: 'payroll', openingBalance: 900, limitEligible: false },
   ],
   requests: [
     { id: 'W1', accountId: 'CALDERA', amount: 300, offsetSeconds: 30, reason: 'PANIC WAVE ONE.', duplicateOfId: null, disputed: false },
@@ -192,8 +194,8 @@ export function bankSub(state: CampaignState): BankState {
  *  is high so holding one account never stamps a broad hold. */
 export const COLLAPSE_PAYLOAD: BankPayload = {
   accounts: [
-    { id: 'ANCHORA', name: 'ANCHORA HOLDINGS', flavor: 'PRIME DEPOSITOR', openingBalance: 30, limitEligible: false },
-    { id: 'ZEPHYR', name: 'ZEPHYR TRUST', flavor: 'RESERVE POOL', openingBalance: 20, limitEligible: false },
+    { id: 'ANCHORA', name: 'ANCHORA HOLDINGS', flavor: 'PRIME DEPOSITOR', flavorKind: 'depositor', openingBalance: 30, limitEligible: false },
+    { id: 'ZEPHYR', name: 'ZEPHYR TRUST', flavor: 'RESERVE POOL', flavorKind: 'operating', openingBalance: 20, limitEligible: false },
   ],
   requests: [],
   payments: [
@@ -301,3 +303,170 @@ export function start(t0 = BANK_T0): Envelope {
 }
 
 export const SETTLE_AT = BANK_T0 + BANK_DURATION_MS + 1_000
+
+// ── Section 02 solvability scripts over the three AUTHORED seeds ─────
+// The exported difficulty contract section 04 reuses: per seed, a walkthrough
+// that reads the evidence (including a TRACE/INSPECT of the hold-justification
+// record so clue-found is exercised), holds selectively, limits where
+// eligible, releases to pay, clears all four critical payments, and settles at
+// full tier; a surge variant A that lets confidence cross at least one
+// threshold (base injections) then recovers to a sustainable tier; and the
+// same surge replayed with maximum inbound flightsDisrupted (variant B).
+// Plain (action, offsetSeconds) envelope data plus expected-outcome data; the
+// module math stays in the engine.
+
+export function bankPayloadFor(seedName: string): BankPayload {
+  return SEED_CATALOG[seedName]!.missionPayloads['bank'] as BankPayload
+}
+
+/** A single-mission engine context over the REAL bank module and an AUTHORED
+ *  seed's payload, schedule, and records. Mirrors flightsContextForSeed. */
+export function bankContextForSeed(seedName: string): EngineContext {
+  const seed = SEED_CATALOG[seedName]!
+  const payload = bankPayloadFor(seedName)
+  const overrides: Partial<SeedDefinition> = {
+    name: seed.name,
+    records: seed.records,
+    deskChecks: seed.deskChecks,
+    clueRecords: seed.clueRecords,
+    missionPayloads: { ...seed.missionPayloads, bank: payload },
+    schedules: { bank: [...bankSchedule(payload)] },
+    missionDurationsMs: { bank: BANK_DURATION_MS },
+  }
+  return buildTestContext([...seed.records], overrides, {
+    missions: { bank: makeBankMission(payload) },
+    missionOrder: [BANK_MISSION_ID],
+  })
+}
+
+/** Seed the engine state with a prior settled outcome carrying the capped
+ *  inbound flightsDisrupted consequence, so the next START_MISSION folds it
+ *  into bank's init: threshold-injected withdrawals size base plus the capped
+ *  magnitude (40, the engine cap). This is surge variant B's channel. */
+export function withMaxInboundSurge(state: CampaignState): CampaignState {
+  return {
+    ...state,
+    settled: [
+      {
+        missionId: 'flights',
+        cause: 'completed',
+        tier: 'failed',
+        settleSeq: 0,
+        metrics: {},
+        clueId: null,
+        consequences: [
+          { id: 'cq-max-surge', kind: 'flightsDisrupted', magnitude: 40 },
+        ],
+      },
+    ],
+  }
+}
+
+/** Drive a script over an authored seed through the engine, then advance past
+ *  the deadline so the final tick folds and the mission settles. When
+ *  maxInboundSurge is set, threshold injections size at base plus the capped
+ *  inbound magnitude via a folded inbound consequence. */
+export function driveBankSeed(
+  ctx: EngineContext,
+  seedName: string,
+  envelopes: Envelope[],
+  settleAt = BANK_T0 + BANK_DURATION_MS + 1_000,
+  maxInboundSurge = false,
+): RunResult {
+  let state = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+  if (maxInboundSurge) state = withMaxInboundSurge(state)
+  const emitted: EngineEvent[] = []
+  for (const [action, now] of envelopes) {
+    const result = dispatch(ctx, state, action, now)
+    state = result.state
+    emitted.push(...result.emitted)
+  }
+  const advanced = advanceCampaign(ctx, state, settleAt)
+  emitted.push(...advanced.emitted)
+  return { state: advanced.state, emitted }
+}
+
+export interface BankScriptExpectation {
+  readonly tier: string
+  readonly clearedPayments: number
+  readonly totalPayments: number
+  readonly clueFound: boolean
+  readonly clueId: string
+}
+
+/** The walkthrough for an authored seed: TRACE the hold-justification record
+ *  so the clue surfaces, hold two depositor accounts selectively (below the
+ *  broad-hold count), LIMIT an eligible operating account, release to pay, and
+ *  clear all four critical payments at their due offsets. Every payment
+ *  clears, cash stays well above the floor, and confidence recovers past the
+ *  target, so the mission settles at FULL. */
+export function bankWalkthroughFor(seedName: string, t0 = BANK_T0): Envelope[] {
+  const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+  const o = (sec: number) => t0 + sec * 1000
+  return [
+    [{ type: 'START_MISSION', missionId: BANK_MISSION_ID }, t0],
+    [{ type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId }, o(5)],
+    [holdAct('DEP-ASHE'), o(10)],
+    [holdAct('DEP-REEVE'), o(12)],
+    [limitAct('OPS-MAIN', 2000), o(15)],
+    [payAct('PM1'), o(96)],
+    [releaseAct('DEP-ASHE'), o(100)],
+    [payAct('PM2'), o(126)],
+    [releaseAct('DEP-REEVE'), o(130)],
+    [payAct('PM3'), o(156)],
+    [payAct('PM4'), o(186)],
+  ]
+}
+
+export function bankWalkthroughExpectation(seedName: string): BankScriptExpectation {
+  const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+  return {
+    tier: 'full',
+    clearedPayments: 4,
+    totalPayments: 4,
+    clueFound: true,
+    clueId: anchors.clueId,
+  }
+}
+
+/** Surge variant A: hold six accounts hard through the first two ticks so
+ *  confidence crashes across the 60 and 45 thresholds (firing their authored
+ *  base injections, the surge the holds themselves provoke), then release and
+ *  clear every payment. The run recovers to a sustainable FULL settlement.
+ *  Used verbatim at base sizing (variant A) and with the maximum inbound
+ *  magnitude folded in (variant B). */
+export function bankSurgeFor(seedName: string, t0 = BANK_T0): Envelope[] {
+  const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+  const o = (sec: number) => t0 + sec * 1000
+  return [
+    [{ type: 'START_MISSION', missionId: BANK_MISSION_ID }, t0],
+    [{ type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId }, o(5)],
+    [holdAct('DEP-ASHE'), o(10)],
+    [holdAct('DEP-REEVE'), o(11)],
+    [holdAct('VEN-ORR'), o(12)],
+    [holdAct('MUN-VANE'), o(13)],
+    [holdAct('PAY-SOUTH'), o(14)],
+    [holdAct('PAY-NORTH'), o(15)],
+    [releaseAct('DEP-ASHE'), o(125)],
+    [releaseAct('DEP-REEVE'), o(126)],
+    [releaseAct('VEN-ORR'), o(127)],
+    [releaseAct('MUN-VANE'), o(128)],
+    [releaseAct('PAY-SOUTH'), o(129)],
+    [releaseAct('PAY-NORTH'), o(130)],
+    [payAct('PM1'), o(131)],
+    [payAct('PM2'), o(132)],
+    [payAct('PM3'), o(156)],
+    [payAct('PM4'), o(186)],
+  ]
+}
+
+export function bankSurgeExpectation(seedName: string): BankScriptExpectation {
+  const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+  return {
+    tier: 'full',
+    clearedPayments: 4,
+    totalPayments: 4,
+    clueFound: true,
+    clueId: anchors.clueId,
+  }
+}
diff --git a/test/engine/missions/bank/solvability.test.ts b/test/engine/missions/bank/solvability.test.ts
new file mode 100644
index 0000000..e104f0e
--- /dev/null
+++ b/test/engine/missions/bank/solvability.test.ts
@@ -0,0 +1,113 @@
+// The FREEZE BANK ACCOUNTS solvability invariants (section 02), run through
+// the REAL module and engine lifecycle over the three authored seeds. The
+// walkthrough reads the evidence (TRACE of the hold-justification record so
+// clue-found is exercised), holds selectively, limits, releases to pay, clears
+// all four critical payments, and settles at FULL. Surge variant A lets
+// confidence cross at least one threshold (base injections) then recovers to a
+// sustainable tier. Surge variant B is the same script with the inbound
+// flightsDisrupted consequence at its engine-capped maximum, and must stay
+// solvable. Module rules (application tables, broad-hold stamping, terminal
+// paths) are section-01's suite and are not re-tested here.
+import { describe, expect, it } from 'vitest'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  BANK_DURATION_MS,
+  BANK_T0,
+  bankContextForSeed,
+  bankPayloadFor,
+  bankSurgeExpectation,
+  bankSurgeFor,
+  bankWalkthroughExpectation,
+  bankWalkthroughFor,
+  driveBankSeed,
+} from './fixtures'
+
+const TIER_RANK: Record<string, number> = {
+  failed: 0,
+  poor: 1,
+  partial: 2,
+  full: 3,
+}
+
+function bankOutcome(state: {
+  settled: readonly { missionId: string; tier: string; metrics: Record<string, number> }[]
+}) {
+  return state.settled.find((s) => s.missionId === 'bank')!
+}
+
+describe.each(SEED_NAMES)('FREEZE BANK ACCOUNTS solvability: %s', (seedName) => {
+  it('the walkthrough clears all four payments and settles at FULL above the floor', () => {
+    const ctx = bankContextForSeed(seedName)
+    const { state } = driveBankSeed(ctx, seedName, bankWalkthroughFor(seedName))
+    const payload = bankPayloadFor(seedName)
+    const expected = bankWalkthroughExpectation(seedName)
+    const outcome = bankOutcome(state)
+    expect(outcome.tier).toBe(expected.tier)
+    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
+    expect(outcome.metrics['payments_total']).toBe(expected.totalPayments)
+    // Sustainable settlement: derived cash at or above the floor and confidence
+    // at or above the target. All three signals read.
+    expect(outcome.metrics['derived_cash']!).toBeGreaterThanOrEqual(payload.floor)
+    expect(outcome.metrics['confidence']!).toBeGreaterThanOrEqual(payload.target)
+    expect(outcome.metrics['sustainability_signals']).toBe(3)
+  })
+
+  it('the walkthrough TRACE of the hold-justification record surfaces the D-83 clue', () => {
+    const ctx = bankContextForSeed(seedName)
+    const expected = bankWalkthroughExpectation(seedName)
+    const { state } = driveBankSeed(ctx, seedName, bankWalkthroughFor(seedName))
+    expect(state.cluesFound).toContain(expected.clueId)
+  })
+
+  it('surge variant A crosses a threshold then recovers to a sustainable tier', () => {
+    const ctx = bankContextForSeed(seedName)
+    const { state } = driveBankSeed(ctx, seedName, bankSurgeFor(seedName))
+    const outcome = bankOutcome(state)
+    const expected = bankSurgeExpectation(seedName)
+    // The surge genuinely fired injected (contagion) withdrawals the holds
+    // provoked: at least one injected draw after the broad hold stamped.
+    expect(outcome.metrics['injected_after_hold_count']!).toBeGreaterThanOrEqual(1)
+    // And it still recovered to the documented sustainable tier.
+    expect(TIER_RANK[outcome.tier]!).toBeGreaterThanOrEqual(TIER_RANK[expected.tier]!)
+    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
+  })
+
+  it('surge variant B (base plus max-capped inbound magnitude) stays solvable', () => {
+    const ctx = bankContextForSeed(seedName)
+    const { state } = driveBankSeed(
+      ctx,
+      seedName,
+      bankSurgeFor(seedName),
+      BANK_T0 + BANK_DURATION_MS + 1_000,
+      true,
+    )
+    const outcome = bankOutcome(state)
+    const expected = bankSurgeExpectation(seedName)
+    // Same solvability under the maximum inbound surge: every payment clears
+    // and the run settles at the documented tier or better.
+    expect(TIER_RANK[outcome.tier]!).toBeGreaterThanOrEqual(TIER_RANK[expected.tier]!)
+    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
+    expect(outcome.metrics['injected_after_hold_count']!).toBeGreaterThanOrEqual(1)
+  })
+
+  it('variant B injections draw strictly more than variant A (base plus capped magnitude bites)', () => {
+    const ctx = bankContextForSeed(seedName)
+    const a = bankOutcome(
+      driveBankSeed(ctx, seedName, bankSurgeFor(seedName)).state,
+    )
+    const b = bankOutcome(
+      driveBankSeed(
+        ctx,
+        seedName,
+        bankSurgeFor(seedName),
+        BANK_T0 + BANK_DURATION_MS + 1_000,
+        true,
+      ).state,
+    )
+    // The injected (contagion) withdrawals are larger under variant B: base
+    // plus the capped inbound magnitude, never below base.
+    expect(b.metrics['injected_after_hold_amount']!).toBeGreaterThan(
+      a.metrics['injected_after_hold_amount']!,
+    )
+  })
+})
