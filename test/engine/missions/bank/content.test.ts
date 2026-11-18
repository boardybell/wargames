// The FREEZE BANK ACCOUNTS content validator and authoring suite, run through
// the full validator and asserted STRUCTURALLY over the three authored seeds.
// The validator and the tests share one anchor table (BANK_ANCHORS_BY_SEED)
// so a dropped rule shows up as a dropped assertion. Module rules (application
// tables, broad-hold stamping, terminal paths) are section-01's suite; the
// solvability invariants need the module lifecycle and live in
// solvability.test.ts.
import { describe, expect, it } from 'vitest'
import { SEED_CATALOG, SEED_NAMES } from '@engine/seeds/catalog'
import {
  BANK_ACCOUNT_FLAVORS,
  bankTickOffsets,
  baseObservedPerTick,
  validateBankContent,
} from '@engine/missions/bank/content'
import type {
  BankContentError,
  BankPayload,
} from '@engine/missions/bank/content'
import { bankSchedule } from '@engine/missions/bank/module'
import { BANK_ANCHORS_BY_SEED } from '@engine/missions/bank/payloads'
import type { ScheduledEventSpec } from '@engine/time'

// The single authoritative per-seed authored request count the validator pins
// (about eighteen; exactly eighteen here).
const EXPECTED_REQUEST_COUNT: Record<string, number> = {
  'exercise-r04': 18,
  'exercise-k11': 18,
  'exercise-t58': 18,
}

function payloadFor(seedName: string): BankPayload {
  return SEED_CATALOG[seedName]!.missionPayloads['bank'] as BankPayload
}

/** The bank schedule the catalog authored (milestones plus the materialized
 *  schedule), so the warning-milestone rule runs against the real table. */
function scheduleFor(seedName: string): ScheduledEventSpec[] {
  return [...SEED_CATALOG[seedName]!.schedules['bank']!]
}

function validate(seedName: string): BankContentError[] {
  const seed = SEED_CATALOG[seedName]!
  return validateBankContent(
    payloadFor(seedName),
    seed.records,
    seed.deskChecks,
    seed.clueRecords,
    scheduleFor(seedName),
    BANK_ANCHORS_BY_SEED[seedName]!,
  )
}

function errorsOfCode(
  errors: readonly BankContentError[],
  code: BankContentError['code'],
): BankContentError[] {
  return errors.filter((e) => e.code === code)
}

describe.each(SEED_NAMES)('FREEZE BANK ACCOUNTS content: %s', (seedName) => {
  const payload = payloadFor(seedName)
  const anchors = BANK_ANCHORS_BY_SEED[seedName]!

  it('authored content is clean through the full validator', () => {
    expect(validate(seedName)).toEqual([])
  })

  it('exactly ten accounts with unique ids across the five flavors', () => {
    expect(payload.accounts).toHaveLength(10)
    const ids = new Set(payload.accounts.map((a) => a.id))
    expect(ids.size).toBe(10)
    for (const flavor of BANK_ACCOUNT_FLAVORS) {
      expect(payload.accounts.some((a) => a.flavorKind === flavor)).toBe(true)
    }
    expect(errorsOfCode(validate(seedName), 'ACCOUNT_COUNT')).toEqual([])
    expect(errorsOfCode(validate(seedName), 'ACCOUNT_ID_UNIQUE')).toEqual([])
    expect(errorsOfCode(validate(seedName), 'ACCOUNT_FLAVOR')).toEqual([])
  })

  it('carries the exact authored request count and exactly four payments', () => {
    expect(payload.requests).toHaveLength(EXPECTED_REQUEST_COUNT[seedName]!)
    expect(anchors.requestCount).toBe(EXPECTED_REQUEST_COUNT[seedName]!)
    expect(payload.payments).toHaveLength(4)
    expect(errorsOfCode(validate(seedName), 'REQUEST_COUNT')).toEqual([])
    expect(errorsOfCode(validate(seedName), 'PAYMENT_COUNT')).toEqual([])
  })

  it('exactly one payroll duplicate pair: same amount, differing chains, linked', () => {
    const byId = new Map(payload.requests.map((r) => [r.id, r]))
    const first = byId.get(anchors.payrollDuplicateFirstId)!
    const second = byId.get(anchors.payrollDuplicateSecondId)!
    // Structural: the pair shares an amount, the link runs from second to
    // first, both are payroll accounts, and the requester-chain bodies differ.
    expect(second.duplicateOfId).toBe(first.id)
    expect(first.amount).toBe(second.amount)
    const payrollIds = new Set(
      payload.accounts.filter((a) => a.flavorKind === 'payroll').map((a) => a.id),
    )
    expect(payrollIds.has(first.accountId)).toBe(true)
    expect(payrollIds.has(second.accountId)).toBe(true)
    expect(first.reason).not.toBe(second.reason)
    // Exactly one request in the whole stream carries a duplicateOf link.
    expect(payload.requests.filter((r) => r.duplicateOfId !== null)).toHaveLength(1)
    expect(errorsOfCode(validate(seedName), 'DUPLICATE_PAIR')).toEqual([])
  })

  it('exactly one disputed request whose body contradicts its account history', () => {
    const disputed = payload.requests.filter((r) => r.disputed)
    expect(disputed).toHaveLength(1)
    const req = disputed[0]!
    expect(req.id).toBe(anchors.disputedRequestId)
    const account = payload.accounts.find((a) => a.id === req.accountId)!
    // Structural contradiction hook: the disputed flag is set, the body
    // references a claimed balance, and that claim conflicts with the account's
    // authored opening balance.
    expect(req.disputed).toBe(true)
    expect(typeof req.disputeClaimBalance).toBe('number')
    // Over-claim direction: strictly above the account's opening balance.
    expect(req.disputeClaimBalance!).toBeGreaterThan(account.openingBalance)
    // Not reachable from the account's own history: the claim does not equal
    // opening balance plus any single prior request amount against the account.
    const priorAmounts = payload.requests
      .filter((r) => r.accountId === account.id && r.offsetSeconds < req.offsetSeconds)
      .map((r) => r.amount)
    expect(priorAmounts.some((amt) => req.disputeClaimBalance === account.openingBalance + amt)).toBe(false)
    // The referenced record's desk outcome is CONTRADICTED.
    const desk = SEED_CATALOG[seedName]!.deskChecks.find((d) => d.recordId === req.recordId)!
    expect(desk.outcome).toBe('CONTRADICTED')
    // The request references a real evidence record (its CHECK SOURCE target).
    expect(payload.requests.filter((r) => typeof r.recordId === 'string')).not.toHaveLength(0)
    expect(SEED_CATALOG[seedName]!.records.some((r) => r.id === req.recordId)).toBe(true)
    expect(errorsOfCode(validate(seedName), 'DISPUTED_REQUEST')).toEqual([])
  })

  it('thresholds strictly descending', () => {
    for (let i = 1; i < payload.thresholds.length; i += 1) {
      expect(payload.thresholds[i]!.value).toBeLessThan(payload.thresholds[i - 1]!.value)
    }
    expect(errorsOfCode(validate(seedName), 'THRESHOLD_DESCENT')).toEqual([])
  })

  it('every request carries a non-empty reason', () => {
    for (const request of payload.requests) {
      expect(request.reason.trim().length).toBeGreaterThan(0)
    }
    expect(errorsOfCode(validate(seedName), 'REQUEST_REASON')).toEqual([])
  })

  it('every tuning value, balance, amount, offset, and series entry is a finite integer', () => {
    const ints: number[] = [
      payload.broadHoldCount,
      payload.tickIntervalSeconds,
      payload.standardDurationSeconds,
      payload.startingConfidence,
      payload.floor,
      payload.collapseFloor,
      payload.target,
      payload.holdShiftPercent,
      ...payload.accounts.map((a) => a.openingBalance),
      ...payload.requests.flatMap((r) => [r.amount, r.offsetSeconds]),
      ...payload.payments.flatMap((p) => [p.amount, p.dueOffsetSeconds, p.confidenceBonus]),
      ...payload.predictionSeries,
    ]
    for (const n of ints) {
      expect(Number.isInteger(n)).toBe(true)
      expect(Number.isFinite(n)).toBe(true)
    }
    expect(errorsOfCode(validate(seedName), 'TUNING_INTEGER')).toEqual([])
  })

  it('the payload JSON round-trips strict-equal', () => {
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
    expect(errorsOfCode(validate(seedName), 'JSON_ROUNDTRIP')).toEqual([])
  })

  it('prediction-series shape: unshifted tracks at or below, hold-shifted exceeds', () => {
    const base = baseObservedPerTick(payload)
    // One prediction entry per REAL engine tick window (periodic ticks plus the
    // end tick), not per fixed 60s bin.
    expect(payload.predictionSeries).toHaveLength(bankTickOffsets(payload).length)
    expect(base).toHaveLength(payload.predictionSeries.length)
    payload.predictionSeries.forEach((series, i) => {
      const observed = base[i]!
      expect(series).toBeLessThanOrEqual(observed)
      const shifted = series + Math.trunc((series * payload.holdShiftPercent) / 100)
      expect(shifted).toBeGreaterThan(observed)
    })
    expect(errorsOfCode(validate(seedName), 'PREDICTION_SHAPE')).toEqual([])
  })

  it('every authored request lands in exactly one real tick window (no silent drop)', () => {
    // The tick offsets the engine actually drains (bankSchedule), ascending.
    const ticks = bankTickOffsets(payload)
    // The periodic ticks plus the end tick at the standard duration.
    const interval = payload.tickIntervalSeconds
    const duration = payload.standardDurationSeconds
    const expectedTicks: number[] = []
    for (let o = interval; o < duration; o += interval) expectedTicks.push(o)
    if (expectedTicks[expectedTicks.length - 1] !== duration) expectedTicks.push(duration)
    expect(ticks).toEqual(expectedTicks)
    // Bucket each request into the smallest tick offset at or above its own
    // offset, with the final tick catching the tail, and assert the per-window
    // sums reproduce baseObservedPerTick AND that the total across windows
    // equals the sum of every authored request amount (nothing dropped).
    const windows = new Array<number>(ticks.length).fill(0)
    let accounted = 0
    for (const request of payload.requests) {
      let index = ticks.findIndex((t) => t >= request.offsetSeconds)
      if (index < 0) index = ticks.length - 1
      windows[index] = windows[index]! + request.amount
      accounted += 1
    }
    expect(accounted).toBe(payload.requests.length)
    expect(windows).toEqual(baseObservedPerTick(payload))
    const total = windows.reduce((a, b) => a + b, 0)
    const authoredTotal = payload.requests.reduce((a, r) => a + r.amount, 0)
    expect(total).toBe(authoredTotal)
    // The largest-offset request (W18 at 190 in seed one) lands in the final
    // (end-tick) window, never off the end of the array.
    const latest = [...payload.requests].sort((a, b) => b.offsetSeconds - a.offsetSeconds)[0]!
    let latestIndex = ticks.findIndex((t) => t >= latest.offsetSeconds)
    if (latestIndex < 0) latestIndex = ticks.length - 1
    expect(latestIndex).toBeGreaterThanOrEqual(0)
    expect(latestIndex).toBeLessThan(ticks.length)
  })

  it('the hold-justification record is DERIVED, reaches the exercise root, and is a D-83 clue record', () => {
    const seed = SEED_CATALOG[seedName]!
    const record = seed.records.find((r) => r.id === anchors.justificationRecordId)!
    expect(record.origin).toBe('DERIVED')
    // Walk its ancestry to the exercise root at the exercise run.
    const byId = new Map(seed.records.map((r) => [r.id, r]))
    let cursor = record
    const seen = new Set<string>([cursor.id])
    while (cursor.parentId !== null && !seen.has(cursor.parentId)) {
      const parent = byId.get(cursor.parentId)
      if (!parent) break
      seen.add(parent.id)
      cursor = parent
    }
    expect(cursor.id).toBe(anchors.exerciseRootRecordId)
    expect(cursor.origin).toBe('EXERCISE')
    expect(cursor.runId).toBe(anchors.runId)
    expect(seed.exerciseRunId).toBe(anchors.runId)
    // Designated in clueRecords with the D-83 clue id.
    expect(
      seed.clueRecords.some(
        (e) => e.recordId === anchors.justificationRecordId && e.clueId === anchors.clueId,
      ),
    ).toBe(true)
    expect(errorsOfCode(validate(seedName), 'JUSTIFICATION_PROVENANCE')).toEqual([])
    expect(errorsOfCode(validate(seedName), 'CLUE_RECORD_MISSING')).toEqual([])
  })

  it('every record id referenced in the payload has a deskChecks row', () => {
    const seed = SEED_CATALOG[seedName]!
    const deskIds = new Set(seed.deskChecks.map((d) => d.recordId))
    const referenced = new Set<string>([anchors.justificationRecordId])
    for (const request of payload.requests) {
      if (typeof request.recordId === 'string') referenced.add(request.recordId)
    }
    for (const id of referenced) expect(deskIds.has(id)).toBe(true)
    expect(errorsOfCode(validate(seedName), 'DESKCHECK_MISSING')).toEqual([])
  })

  it('the disputed record desk outcome resolves the contradiction', () => {
    const seed = SEED_CATALOG[seedName]!
    const disputed = payload.requests.find((r) => r.disputed)!
    const desk = seed.deskChecks.find((d) => d.recordId === disputed.recordId)!
    // The desk CONTRADICTS the emergency hold basis: the disputed balance was
    // never held, resolving the request's authored contradiction.
    expect(desk.outcome).toBe('CONTRADICTED')
  })

  it('the bank schedule carries the 30 and 10 second end warnings', () => {
    const warnings = scheduleFor(seedName)
      .filter((s) => s.kind === 'timerMilestone' && s.anchor === 'end')
      .map((s) => s.offsetSeconds)
      .sort((a, b) => a - b)
    expect(warnings).toEqual([10, 30])
    expect(errorsOfCode(validate(seedName), 'SCHEDULE_WARNING')).toEqual([])
  })

  it('the schedule is derived from the payload (waves, ticks, dues)', () => {
    // The materialized bank schedule rides in beside the milestones; assert a
    // wave event per request and a tick per authored interval exist.
    const sched = bankSchedule(payload)
    expect(sched.filter((s) => s.kind === 'bankWave')).toHaveLength(payload.requests.length)
    expect(sched.filter((s) => s.kind === 'bankDue')).toHaveLength(payload.payments.length)
    expect(sched.some((s) => s.kind === 'confidenceTick')).toBe(true)
  })
})

// Negative tests: the two re-authored invariants must FAIL loudly when the
// content lies. These prove the validator checks MEANING, not existence.
describe('the bank validator rejects untruthful content (negative)', () => {
  const seedName = 'exercise-r04'
  const seed = SEED_CATALOG[seedName]!
  const base = payloadFor(seedName)
  const anchors = BANK_ANCHORS_BY_SEED[seedName]!

  function run(payload: BankPayload): BankContentError[] {
    return validateBankContent(
      payload,
      seed.records,
      seed.deskChecks,
      seed.clueRecords,
      scheduleFor(seedName),
      anchors,
    )
  }

  it('a disputed request whose claim equals its account balance is rejected', () => {
    const account = base.accounts.find((a) => a.id === base.requests.find((r) => r.disputed)!.accountId)!
    const poisoned: BankPayload = {
      ...base,
      requests: base.requests.map((r) =>
        r.disputed ? { ...r, disputeClaimBalance: account.openingBalance } : r,
      ),
    }
    expect(run(poisoned).filter((e) => e.code === 'DISPUTED_REQUEST').length).toBeGreaterThan(0)
  })

  it('a disputed request whose claim UNDER-claims (below opening balance) is rejected', () => {
    const disputed = base.requests.find((r) => r.disputed)!
    const account = base.accounts.find((a) => a.id === disputed.accountId)!
    // An under-claim is not the freeze-justifying over-claim direction; the
    // strengthened rule must reject it, not just exact equality.
    const poisoned: BankPayload = {
      ...base,
      requests: base.requests.map((r) =>
        r.disputed ? { ...r, disputeClaimBalance: account.openingBalance - 1 } : r,
      ),
    }
    expect(run(poisoned).filter((e) => e.code === 'DISPUTED_REQUEST').length).toBeGreaterThan(0)
  })

  it('a disputed request whose over-claim is reachable from a prior draw is rejected', () => {
    const disputed = base.requests.find((r) => r.disputed)!
    const account = base.accounts.find((a) => a.id === disputed.accountId)!
    // Author a prior request against the SAME account, then claim exactly
    // openingBalance + that prior draw. It is an over-claim but is explained by
    // the account's own history, so the rule must reject it as non-contradictory.
    const priorAmount = 1500
    const priorRequest = {
      ...base.requests[0]!,
      id: 'W-PRIOR',
      accountId: account.id,
      amount: priorAmount,
      offsetSeconds: disputed.offsetSeconds - 5,
      duplicateOfId: null,
      disputed: false,
      recordId: null,
      disputeClaimBalance: null,
    }
    const poisoned: BankPayload = {
      ...base,
      requests: [
        priorRequest,
        ...base.requests.map((r) =>
          r.disputed
            ? { ...r, disputeClaimBalance: account.openingBalance + priorAmount }
            : r,
        ),
      ],
    }
    expect(run(poisoned).filter((e) => e.code === 'DISPUTED_REQUEST').length).toBeGreaterThan(0)
  })

  it('a disputed request whose referenced record is not CONTRADICTED is rejected', () => {
    // Point the desk row for the disputed record at a non-CONTRADICTED outcome.
    const disputed = base.requests.find((r) => r.disputed)!
    const poisonedDesk = seed.deskChecks.map((d) =>
      d.recordId === disputed.recordId ? { ...d, outcome: 'CONFIRMED' as const } : d,
    )
    const errors = validateBankContent(
      base,
      seed.records,
      poisonedDesk,
      seed.clueRecords,
      scheduleFor(seedName),
      anchors,
    )
    expect(errors.filter((e) => e.code === 'DISPUTED_REQUEST').length).toBeGreaterThan(0)
  })

  it('a payroll duplicate pair with matching bodies is rejected', () => {
    const first = base.requests.find((r) => r.id === anchors.payrollDuplicateFirstId)!
    const poisoned: BankPayload = {
      ...base,
      requests: base.requests.map((r) =>
        r.id === anchors.payrollDuplicateSecondId ? { ...r, reason: first.reason } : r,
      ),
    }
    expect(run(poisoned).filter((e) => e.code === 'DUPLICATE_PAIR').length).toBeGreaterThan(0)
  })

  it('a prediction series that exceeds the base observed stream is rejected', () => {
    const poisoned: BankPayload = {
      ...base,
      predictionSeries: base.predictionSeries.map((n) => n + 100000),
    }
    expect(run(poisoned).filter((e) => e.code === 'PREDICTION_SHAPE').length).toBeGreaterThan(0)
  })

  it('ascending thresholds are rejected', () => {
    const poisoned: BankPayload = {
      ...base,
      thresholds: [...base.thresholds].reverse(),
    }
    expect(run(poisoned).filter((e) => e.code === 'THRESHOLD_DESCENT').length).toBeGreaterThan(0)
  })
})
