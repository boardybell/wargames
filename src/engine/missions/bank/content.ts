// The payload shape the three FREEZE BANK ACCOUNTS seeds must satisfy. Only
// the TYPE lives here so the module compiles standalone; the content
// validator functions and the authored payloads are section 02's job.
// Desk-check outcomes deliberately do NOT live here. They stay in the
// shared SeedDefinition.deskChecks table keyed by record id, exactly as
// CRASH OUTLOOK and GROUND ALL FLIGHTS do it.
import type { OutcomeTier } from '../../campaign/types'
import type { EvidenceRecord } from '../../records'
import type { ClueRecordEntry, DeskCheckEntry } from '../types'
import type { ScheduledEventSpec } from '../../time'

/** The five authored account flavors. A typed enum, not authored copy. */
export const BANK_ACCOUNT_FLAVORS = [
  'payroll',
  'operating',
  'vendor',
  'municipal',
  'depositor',
] as const
export type BankAccountFlavor = (typeof BANK_ACCOUNT_FLAVORS)[number]

/** One depositor account. Authored static truth only: the live balance,
 *  hold, and limit live in substate. */
export interface AccountDef {
  readonly id: string
  /** Invented depositor name. Authored copy, never copied into substate. */
  readonly name: string
  /** Authored flavor line the shell renders. Never enters substate. */
  readonly flavor: string
  /** The typed account flavor: one of the five authored kinds
   *  (payroll | operating | vendor | municipal | depositor). A typed code,
   *  not authored copy; selectors join it to the rendered flavor line. */
  readonly flavorKind: BankAccountFlavor
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
  /** The evidence record a CHECK SOURCE on this request resolves against, or
   *  null. A typed id, never authored copy; the engine-owned deskChecks table
   *  holds the outcome. The disputed request names the bank hold-justification
   *  record so the desk resolves its contradiction. Authoring metadata only. */
  readonly recordId?: string | null
  /** For a disputed request only: the balance figure the authored body
   *  CLAIMS for its account, which must contradict the account's authored
   *  openingBalance. The validator proves the contradiction structurally from
   *  this number rather than parsing prose. Integer, or null when undisputed. */
  readonly disputeClaimBalance?: number | null
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

// ── Content validator ─────────────────────────────────────────────────
//
// A PURE validator that turns authoring mistakes into a list of structured
// errors (empty means valid), exactly like validateFlightsContent. Each rule
// maps one-to-one to a content test. The solvability invariants are NOT rules
// here; they need the module lifecycle and live in solvability.test.ts.

/** The per-seed expected ids the validator and the tests both read. One table
 *  per seed so a dropped id shows up as a dropped assertion. */
export interface BankSeedAnchors {
  /** The exercise run stamp the hold-justification record inherits (R04). */
  readonly runId: string
  /** The DERIVED hold-justification record (B04): the emergency hold notice
   *  citing the restriction and assuming a system-wide shutdown. Carries the
   *  D-83 clue. */
  readonly justificationRecordId: string
  /** The EXERCISE root the justification record's ancestry reaches (C17). */
  readonly exerciseRootRecordId: string
  /** The D-83 clue id the justification record is designated for. */
  readonly clueId: string
  /** The one DISPUTED request's id. */
  readonly disputedRequestId: string
  /** The two ids of the one payroll duplicate pair (same amount, linked by
   *  duplicateOfId, differing requester chains). */
  readonly payrollDuplicateFirstId: string
  readonly payrollDuplicateSecondId: string
  /** The exact authored request count this seed must carry. */
  readonly requestCount: number
  /** The exact authored critical-payment count this seed must carry. */
  readonly paymentCount: number
}

export type BankContentErrorCode =
  | 'ACCOUNT_COUNT'
  | 'ACCOUNT_ID_UNIQUE'
  | 'ACCOUNT_FLAVOR'
  | 'REQUEST_COUNT'
  | 'PAYMENT_COUNT'
  | 'DUPLICATE_PAIR'
  | 'DISPUTED_REQUEST'
  | 'THRESHOLD_DESCENT'
  | 'REQUEST_REASON'
  | 'TUNING_INTEGER'
  | 'PREDICTION_SHAPE'
  | 'JUSTIFICATION_PROVENANCE'
  | 'CLUE_RECORD_MISSING'
  | 'DESKCHECK_MISSING'
  | 'SCHEDULE_WARNING'
  | 'JSON_ROUNDTRIP'

export interface BankContentError {
  readonly code: BankContentErrorCode
  readonly detail: string
}

function isFiniteInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

/** Walk a record's parentId chain to its deepest resolvable ancestor,
 *  carrying a visited set so a cycle or dangling parent terminates. */
function traceRoot(
  records: readonly EvidenceRecord[],
  startId: string,
): EvidenceRecord | null {
  const byId = new Map(records.map((r) => [r.id, r]))
  let current = byId.get(startId) ?? null
  if (!current) return null
  const visited = new Set<string>([current.id])
  while (current.parentId !== null) {
    if (visited.has(current.parentId)) break
    const parent = byId.get(current.parentId)
    if (!parent) break
    visited.add(parent.id)
    current = parent
  }
  return current
}

/** The REAL confidence-tick offsets the engine drains, derived exactly as
 *  bankSchedule derives them: periodic start-anchored ticks at every interval
 *  strictly below the standard duration, PLUS the end tick at the standard
 *  duration itself. Returned ascending. This is the source of truth for the
 *  prediction-shape bucketing, so every authored request lands in a real tick
 *  window and none is silently dropped (e.g. a request at offset 190 under a
 *  240s window lands in the 240 end-tick window, not off the end of a fixed
 *  60s-bin array). Pure, integer. */
export function bankTickOffsets(payload: BankPayload): number[] {
  const interval = payload.tickIntervalSeconds
  const duration = payload.standardDurationSeconds
  const offsets: number[] = []
  if (interval > 0) {
    for (let offset = interval; offset < duration; offset += interval) {
      offsets.push(offset)
    }
  }
  // The end tick folds at the standard duration; it owns the tail window up to
  // the duration so a request past the last periodic tick is never dropped.
  if (offsets[offsets.length - 1] !== duration) offsets.push(duration)
  return offsets
}

/** The base observed withdrawal stream aggregated per REAL confidence tick: for
 *  each tick offset (from bankTickOffsets, periodic ticks plus the end tick),
 *  the sum of AUTHORED (non-injected) request amounts whose offset falls in
 *  that tick's window. A request is owned by the smallest tick offset at or
 *  above its own offset; the final (end) tick catches the tail up to the
 *  standard duration, so EVERY authored request lands in exactly one window.
 *  The returned array is indexed by tick (parallel to bankTickOffsets), and the
 *  prediction series is indexed by the same tick index. Pure, integer. */
export function baseObservedPerTick(payload: BankPayload): number[] {
  const ticks = bankTickOffsets(payload)
  const out = new Array<number>(ticks.length).fill(0)
  if (ticks.length === 0) return out
  for (const request of payload.requests) {
    let index = ticks.findIndex((t) => t >= request.offsetSeconds)
    // A request past the last periodic tick (but within the window) falls to
    // the final tick, which catches the tail up to the standard duration.
    if (index < 0) index = ticks.length - 1
    out[index] = out[index]! + request.amount
  }
  return out
}

/** Validate authored bank content. Empty array means valid. Pure over all
 *  inputs; the record graph, deskChecks, clueRecords, and schedule are
 *  threaded in so the provenance, desk-coverage, and schedule rules run
 *  against the real shared tables. */
export function validateBankContent(
  payload: BankPayload,
  records: readonly EvidenceRecord[],
  deskChecks: readonly DeskCheckEntry[],
  clueRecords: readonly ClueRecordEntry[],
  schedule: readonly ScheduledEventSpec[],
  anchors: BankSeedAnchors,
): BankContentError[] {
  const errors: BankContentError[] = []

  // Rule: exactly ten accounts with unique ids and authored flavors.
  if (payload.accounts.length !== 10) {
    errors.push({
      code: 'ACCOUNT_COUNT',
      detail: `expected 10 accounts, found ${payload.accounts.length}`,
    })
  }
  const accountIds = new Set<string>()
  for (const account of payload.accounts) {
    if (accountIds.has(account.id)) {
      errors.push({
        code: 'ACCOUNT_ID_UNIQUE',
        detail: `duplicate account id ${account.id}`,
      })
    }
    accountIds.add(account.id)
    if (!BANK_ACCOUNT_FLAVORS.includes(account.flavorKind)) {
      errors.push({
        code: 'ACCOUNT_FLAVOR',
        detail: `account ${account.id} flavorKind ${account.flavorKind} is not an authored flavor`,
      })
    }
  }
  // Every one of the five flavors is represented.
  for (const flavor of BANK_ACCOUNT_FLAVORS) {
    if (!payload.accounts.some((a) => a.flavorKind === flavor)) {
      errors.push({
        code: 'ACCOUNT_FLAVOR',
        detail: `no account carries the ${flavor} flavor`,
      })
    }
  }

  // Rule: the exact authored request count, and exactly four critical
  // payments.
  if (payload.requests.length !== anchors.requestCount) {
    errors.push({
      code: 'REQUEST_COUNT',
      detail: `expected ${anchors.requestCount} requests, found ${payload.requests.length}`,
    })
  }
  if (payload.payments.length !== 4) {
    errors.push({
      code: 'PAYMENT_COUNT',
      detail: `expected 4 critical payments, found ${payload.payments.length}`,
    })
  }
  if (anchors.paymentCount !== 4) {
    errors.push({
      code: 'PAYMENT_COUNT',
      detail: `anchors.paymentCount ${anchors.paymentCount} is not 4`,
    })
  }

  // Rule: exactly one payroll duplicate pair. Two requests sharing an amount,
  // linked by duplicateOfId, both against payroll accounts, with differing
  // authored requester-chain bodies. Assert the pair is the authored anchor
  // pair and that no OTHER request carries a duplicateOfId link.
  const payrollAccountIds = new Set(
    payload.accounts.filter((a) => a.flavorKind === 'payroll').map((a) => a.id),
  )
  const requestById = new Map(payload.requests.map((r) => [r.id, r]))
  const dupFirst = requestById.get(anchors.payrollDuplicateFirstId)
  const dupSecond = requestById.get(anchors.payrollDuplicateSecondId)
  if (!dupFirst || !dupSecond) {
    errors.push({
      code: 'DUPLICATE_PAIR',
      detail: `payroll duplicate pair ${anchors.payrollDuplicateFirstId}/${anchors.payrollDuplicateSecondId} not both present`,
    })
  } else {
    if (dupSecond.duplicateOfId !== dupFirst.id) {
      errors.push({
        code: 'DUPLICATE_PAIR',
        detail: `${dupSecond.id} duplicateOfId ${String(dupSecond.duplicateOfId)} does not link to ${dupFirst.id}`,
      })
    }
    if (dupFirst.amount !== dupSecond.amount) {
      errors.push({
        code: 'DUPLICATE_PAIR',
        detail: `duplicate pair amounts differ: ${dupFirst.amount} vs ${dupSecond.amount}`,
      })
    }
    if (
      !payrollAccountIds.has(dupFirst.accountId) ||
      !payrollAccountIds.has(dupSecond.accountId)
    ) {
      errors.push({
        code: 'DUPLICATE_PAIR',
        detail: 'the duplicate pair is not drawn from payroll accounts',
      })
    }
    // The requester chains (authored reason bodies) must differ: close
    // reading is the tell.
    if (dupFirst.reason.trim() === dupSecond.reason.trim()) {
      errors.push({
        code: 'DUPLICATE_PAIR',
        detail: 'the duplicate pair shares an identical requester chain; the bodies must differ',
      })
    }
  }
  const linkedRequests = payload.requests.filter((r) => r.duplicateOfId !== null)
  if (linkedRequests.length !== 1) {
    errors.push({
      code: 'DUPLICATE_PAIR',
      detail: `expected exactly one duplicateOf link, found ${linkedRequests.length}`,
    })
  } else if (linkedRequests[0]!.id !== anchors.payrollDuplicateSecondId) {
    errors.push({
      code: 'DUPLICATE_PAIR',
      detail: `the duplicateOf link is on ${linkedRequests[0]!.id}, not the anchor ${anchors.payrollDuplicateSecondId}`,
    })
  }

  // Rule: exactly one DISPUTED request whose authored body structurally
  // contradicts its account's history, not merely differs from it. The
  // contradiction is anchored three ways: (1) the authored disputeClaimBalance
  // is an OVER-claim, strictly ABOVE the account's opening balance (a claim the
  // account never held, the direction that justifies a freeze); (2) the record
  // it references exists, has a desk row, and that desk outcome is CONTRADICTED
  // (the desk disproves the hold basis); and (3) the claim is not reachable
  // from the account's own history, i.e. it does not equal the opening balance
  // plus any single prior request amount against the same account. Only this
  // one request is disputed.
  const disputedRequests = payload.requests.filter((r) => r.disputed)
  if (disputedRequests.length !== 1) {
    errors.push({
      code: 'DISPUTED_REQUEST',
      detail: `expected exactly one disputed request, found ${disputedRequests.length}`,
    })
  }
  const disputed = requestById.get(anchors.disputedRequestId)
  if (!disputed) {
    errors.push({
      code: 'DISPUTED_REQUEST',
      detail: `disputed request ${anchors.disputedRequestId} not present`,
    })
  } else {
    if (!disputed.disputed) {
      errors.push({
        code: 'DISPUTED_REQUEST',
        detail: `request ${disputed.id} is the anchor disputed request but its disputed flag is false`,
      })
    }
    const account = payload.accounts.find((a) => a.id === disputed.accountId)
    if (!account) {
      errors.push({
        code: 'DISPUTED_REQUEST',
        detail: `disputed request ${disputed.id} references unknown account ${disputed.accountId}`,
      })
    } else {
      const claim = disputed.disputeClaimBalance
      if (!isFiniteInteger(claim)) {
        errors.push({
          code: 'DISPUTED_REQUEST',
          detail: `disputed request ${disputed.id} has no integer disputeClaimBalance to contradict the account history`,
        })
      } else {
        // (1) Over-claim direction: strictly above the opening balance.
        if (claim <= account.openingBalance) {
          errors.push({
            code: 'DISPUTED_REQUEST',
            detail: `disputed request ${disputed.id} claim ${claim} is not an over-claim above account ${account.id} opening balance ${account.openingBalance}`,
          })
        }
        // (3) Not reachable from the account's own history: the claim must not
        // equal the opening balance plus any single prior request amount
        // against the same account, so the figure cannot be explained by one
        // genuine prior withdrawal.
        const priorAmounts = payload.requests
          .filter(
            (r) =>
              r.accountId === account.id &&
              r.offsetSeconds < disputed.offsetSeconds,
          )
          .map((r) => r.amount)
        const reachable =
          claim === account.openingBalance ||
          priorAmounts.some((amt) => claim === account.openingBalance + amt)
        if (reachable) {
          errors.push({
            code: 'DISPUTED_REQUEST',
            detail: `disputed request ${disputed.id} claim ${claim} is reachable from account ${account.id} history (opening balance plus a single prior request amount), so it does not contradict it`,
          })
        }
      }
    }
    if (
      typeof disputed.recordId !== 'string' ||
      !records.some((r) => r.id === disputed.recordId)
    ) {
      errors.push({
        code: 'DISPUTED_REQUEST',
        detail: `disputed request ${disputed.id} does not reference a real evidence record`,
      })
    } else {
      // (2) The referenced record's desk outcome must be CONTRADICTED: the desk
      // disproves the emergency-hold basis the disputed body cites.
      const desk = deskChecks.find((d) => d.recordId === disputed.recordId)
      if (!desk) {
        errors.push({
          code: 'DISPUTED_REQUEST',
          detail: `disputed request ${disputed.id} record ${disputed.recordId} has no desk outcome`,
        })
      } else if (desk.outcome !== 'CONTRADICTED') {
        errors.push({
          code: 'DISPUTED_REQUEST',
          detail: `disputed request ${disputed.id} record ${disputed.recordId} desk outcome ${desk.outcome} is not CONTRADICTED`,
        })
      }
    }
  }

  // Rule: thresholds strictly descending.
  for (let i = 1; i < payload.thresholds.length; i += 1) {
    if (payload.thresholds[i]!.value >= payload.thresholds[i - 1]!.value) {
      errors.push({
        code: 'THRESHOLD_DESCENT',
        detail: `threshold ${payload.thresholds[i]!.value} is not strictly below the prior ${payload.thresholds[i - 1]!.value}`,
      })
    }
  }

  // Rule: every request carries a non-empty reason.
  for (const request of payload.requests) {
    if (request.reason.trim().length === 0) {
      errors.push({
        code: 'REQUEST_REASON',
        detail: `request ${request.id} has an empty reason`,
      })
    }
  }

  // Rule: every tuning value, balance, amount, offset, and series entry is a
  // finite integer; no NaN or Infinity; the payload JSON round-trips strict-
  // equal.
  const integerChecks: Array<readonly [string, unknown]> = [
    ['broadHoldCount', payload.broadHoldCount],
    ['tickIntervalSeconds', payload.tickIntervalSeconds],
    ['standardDurationSeconds', payload.standardDurationSeconds],
    ['startingConfidence', payload.startingConfidence],
    ['floor', payload.floor],
    ['collapseFloor', payload.collapseFloor],
    ['target', payload.target],
    ['holdShiftPercent', payload.holdShiftPercent],
    ['confidenceDelta.perHeldAccount', payload.confidenceDelta.perHeldAccount],
    ['confidenceDelta.perClearedPayment', payload.confidenceDelta.perClearedPayment],
    ['confidenceDelta.perSelectiveRelease', payload.confidenceDelta.perSelectiveRelease],
    ['confidenceDelta.cashBelowFloor', payload.confidenceDelta.cashBelowFloor],
  ]
  for (const account of payload.accounts) {
    integerChecks.push([`account ${account.id} openingBalance`, account.openingBalance])
  }
  for (const request of payload.requests) {
    integerChecks.push([`request ${request.id} amount`, request.amount])
    integerChecks.push([`request ${request.id} offset`, request.offsetSeconds])
  }
  for (const payment of payload.payments) {
    integerChecks.push([`payment ${payment.id} amount`, payment.amount])
    integerChecks.push([`payment ${payment.id} dueOffset`, payment.dueOffsetSeconds])
    integerChecks.push([`payment ${payment.id} bonus`, payment.confidenceBonus])
  }
  for (const threshold of payload.thresholds) {
    integerChecks.push([`threshold ${threshold.value}`, threshold.value])
    for (const inj of threshold.injected) {
      integerChecks.push([`injection ${inj.id} base`, inj.baseAmount])
    }
  }
  payload.predictionSeries.forEach((value, i) => {
    integerChecks.push([`predictionSeries[${i}]`, value])
  })
  for (const [label, value] of integerChecks) {
    if (!isFiniteInteger(value)) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `${label} is not a finite integer (${String(value)})`,
      })
    }
  }

  // Rule: prediction-series shape, aligned to the engine's REAL tick windows.
  // The base observed stream buckets every authored request into the tick
  // window its offset falls in (periodic ticks plus the end tick), so the whole
  // request stream is covered and no authored withdrawal is dropped. The
  // prediction series carries one entry per tick window; at every tick the
  // unshifted series tracks at or below the base observed stream, and the
  // hold-shifted series (base plus holdShiftPercent) strictly exceeds it. This
  // makes the divergence read as circular validation, not noise.
  const baseStream = baseObservedPerTick(payload)
  if (payload.predictionSeries.length !== baseStream.length) {
    errors.push({
      code: 'PREDICTION_SHAPE',
      detail: `prediction series length ${payload.predictionSeries.length} does not match the ${baseStream.length} engine tick windows`,
    })
  }
  payload.predictionSeries.forEach((series, i) => {
    const observed = baseStream[i] ?? 0
    if (series > observed) {
      errors.push({
        code: 'PREDICTION_SHAPE',
        detail: `unshifted prediction ${series} at tick ${i} exceeds the base observed stream ${observed}`,
      })
    }
    const shifted = series + Math.trunc((series * payload.holdShiftPercent) / 100)
    if (shifted <= observed) {
      errors.push({
        code: 'PREDICTION_SHAPE',
        detail: `hold-shifted prediction ${shifted} at tick ${i} does not exceed the base observed stream ${observed}`,
      })
    }
  })

  // Rule: the hold-justification record exists, is DERIVED with run ancestry
  // reaching the seed's exercise root at the exercise run, and is designated
  // in clueRecords with the D-83 clue id.
  const justification = records.find((r) => r.id === anchors.justificationRecordId)
  if (!justification) {
    errors.push({
      code: 'JUSTIFICATION_PROVENANCE',
      detail: `hold-justification record ${anchors.justificationRecordId} not in the record graph`,
    })
  } else {
    if (justification.origin !== 'DERIVED') {
      errors.push({
        code: 'JUSTIFICATION_PROVENANCE',
        detail: `justification ${justification.id} origin ${justification.origin}, not DERIVED`,
      })
    }
    const root = traceRoot(records, justification.id)
    if (!root || root.id !== anchors.exerciseRootRecordId) {
      errors.push({
        code: 'JUSTIFICATION_PROVENANCE',
        detail: `justification ${justification.id} ancestry reaches ${root?.id ?? 'nothing'}, not the exercise root ${anchors.exerciseRootRecordId}`,
      })
    } else if (root.origin !== 'EXERCISE' || root.runId !== anchors.runId) {
      errors.push({
        code: 'JUSTIFICATION_PROVENANCE',
        detail: `exercise root ${root.id} origin ${root.origin} run ${String(root.runId)}, expected EXERCISE run ${anchors.runId}`,
      })
    }
  }
  const clueEntry = clueRecords.find(
    (e) => e.recordId === anchors.justificationRecordId && e.clueId === anchors.clueId,
  )
  if (!clueEntry) {
    errors.push({
      code: 'CLUE_RECORD_MISSING',
      detail: `clueRecords has no { ${anchors.justificationRecordId}, ${anchors.clueId} } entry`,
    })
  }

  // Rule: every record id referenced anywhere in the bank payload has a
  // deskChecks row. The justification record and the disputed request's record
  // are the referenced ids; collect any recordId a request carries.
  const deskIds = new Set(deskChecks.map((d) => d.recordId))
  const referencedRecordIds = new Set<string>([anchors.justificationRecordId])
  for (const request of payload.requests) {
    if (typeof request.recordId === 'string') {
      referencedRecordIds.add(request.recordId)
    }
  }
  for (const recordId of referencedRecordIds) {
    if (!deskIds.has(recordId)) {
      errors.push({
        code: 'DESKCHECK_MISSING',
        detail: `referenced record ${recordId} has no deskChecks row`,
      })
    }
  }

  // Rule: the bank schedule carries the 30 and 10 second end warning
  // milestones.
  const warnings = schedule
    .filter((spec) => spec.kind === 'timerMilestone' && spec.anchor === 'end')
    .map((spec) => spec.offsetSeconds)
    .sort((a, b) => a - b)
  if (warnings[0] !== 10 || warnings[1] !== 30 || warnings.length !== 2) {
    errors.push({
      code: 'SCHEDULE_WARNING',
      detail: `bank schedule end warnings are ${JSON.stringify(warnings)}, expected [10, 30]`,
    })
  }

  // Rule: the payload JSON round-trips strict-equal (no undefined, no
  // functions, no non-finite numbers smuggled in).
  try {
    if (JSON.stringify(JSON.parse(JSON.stringify(payload))) !== JSON.stringify(payload)) {
      errors.push({
        code: 'JSON_ROUNDTRIP',
        detail: 'payload does not JSON round-trip strict-equal',
      })
    }
  } catch {
    errors.push({ code: 'JSON_ROUNDTRIP', detail: 'payload is not JSON-serializable' })
  }

  return errors
}
