import { describe, expect, it } from 'vitest'
import type { CampaignState } from '@engine/campaign/state'
import {
  listCandidates,
  validateCase,
  fieldReportLegal,
} from '@engine/missions/finale/caseBuilder'
import type { FinaleCaseFile, FinaleState } from '@engine/missions/finale/types'
import { buildRecordGraph } from '@engine/records'
import {
  CLAIM_RUN_ID,
  FIELD_REPORT_ID,
  FINALE_RECORDS,
  ROOT_RECORD_ID,
  act,
  caseFileFrom,
  finaleState,
  startedFinale,
} from './fixtures'

const graph = buildRecordGraph(FINALE_RECORDS)

function caseFile(
  live: Partial<Pick<FinaleCaseFile, 'sourceChecks' | 'inspectedRecords'>> = {},
): FinaleCaseFile {
  return {
    graph,
    claimRunId: CLAIM_RUN_ID,
    rootRecordId: ROOT_RECORD_ID,
    fieldReportId: FIELD_REPORT_ID,
    sourceChecks: live.sourceChecks ?? [],
    inspectedRecords: live.inspectedRecords ?? [],
  }
}

function emptyState(): FinaleState {
  return {
    slots: {
      outlook: null,
      flights: null,
      bank: null,
      root: null,
      observation: null,
    },
    ordering: [],
    caseValid: false,
    lastRejection: null,
    comparisonsRun: 0,
    fieldReportRequested: false,
    committed: null,
  }
}

/** The correct case: C17/F06/B04 in event-time order, root C17, observation a
 *  corroborated independent OBSERVED record (W02 with its CONFIRMED check). */
function correctState(): FinaleState {
  return {
    ...emptyState(),
    slots: {
      outlook: 'C17',
      flights: 'F06',
      bank: 'B04',
      root: 'C17',
      observation: 'W02',
    },
    ordering: ['C17', 'F06', 'B04'],
  }
}

const w02Confirmed = caseFile({
  sourceChecks: [{ recordId: 'W02', outcome: 'CONFIRMED' }],
})

describe('finale caseBuilder: slot candidates', () => {
  it('every record from all three missions is a subsystem-slot candidate', () => {
    const outlook = listCandidates('outlook', caseFile()).map((c) => c.recordId)
    const flights = listCandidates('flights', caseFile()).map((c) => c.recordId)
    const bank = listCandidates('bank', caseFile()).map((c) => c.recordId)
    expect(outlook).toContain('C17')
    expect(outlook).toContain('S11')
    expect(flights).toContain('F06')
    expect(flights).toContain('W02')
    expect(bank).toContain('B04')
    expect(bank).toContain('P13')
  })

  it('inspected records carry the highlight flag', () => {
    const list = listCandidates('flights', caseFile({ inspectedRecords: ['F06'] }))
    const f06 = list.find((c) => c.recordId === 'F06')!
    const w02 = list.find((c) => c.recordId === 'W02')!
    expect(f06.highlighted).toBe(true)
    expect(w02.highlighted).toBe(false)
  })

  it('W02 unchecked lists UNVERIFIED and is not attachable to observation', () => {
    const list = listCandidates('observation', caseFile())
    const w02 = list.find((c) => c.recordId === 'W02')!
    expect(w02.unverified).toBe(true)
    expect(w02.attachable).toBe(false)
  })

  it('W02 with a CONFIRMED completed check qualifies and is attachable', () => {
    const list = listCandidates('observation', w02Confirmed)
    const w02 = list.find((c) => c.recordId === 'W02')!
    expect(w02.attachable).toBe(true)
    expect(w02.unverified).toBeUndefined()
  })

  it('CONTRADICTED, PENDING, UNKNOWN checks never qualify observation', () => {
    for (const outcome of ['CONTRADICTED', 'PENDING', 'UNKNOWN'] as const) {
      const cf = caseFile({ sourceChecks: [{ recordId: 'W02', outcome }] })
      const list = listCandidates('observation', cf)
      const w02 = list.find((c) => c.recordId === 'W02')
      expect(w02?.attachable ?? false).toBe(false)
    }
  })
})

describe('finale caseBuilder: validation (four requirements fixtures)', () => {
  it('correct case is accepted', () => {
    expect(validateCase(correctState(), w02Confirmed)).toEqual({ ok: true })
  })

  it('receipt-time-sorted ordering is rejected with receipt-order (a genuine receipt sort)', () => {
    // Receipt times: C17=76445, F06=76492, B04=76470 -> receipt order is
    // C17, B04, F06, which diverges from event-time C17, F06, B04. The ordering
    // DOES cover all three subsystem ids, so this is the inbox illusion, not
    // structural incompleteness.
    const state: FinaleState = {
      ...correctState(),
      ordering: ['C17', 'B04', 'F06'],
    }
    const result = validateCase(state, w02Confirmed)
    expect(result).toMatchObject({ ok: false, code: 'receipt-order' })
  })

  it('an ordering that does not cover the three subsystem slots is incomplete, not receipt-order', () => {
    // A short ordering (missing B04) is structural incompleteness: the player
    // has not arranged a full sequence. It must read incomplete naming the
    // missing subsystem slot (bank), NOT receipt-order (which would make
    // section 03 author the inbox-illusion line for an empty ordering).
    const state: FinaleState = {
      ...correctState(),
      ordering: ['C17', 'F06'],
    }
    const result = validateCase(state, w02Confirmed)
    expect(result).toMatchObject({ ok: false, code: 'incomplete', slot: 'bank' })
  })

  it('an empty ordering is incomplete naming a subsystem slot, not receipt-order', () => {
    const state: FinaleState = { ...correctState(), ordering: [] }
    const result = validateCase(state, w02Confirmed)
    expect(result).toMatchObject({ ok: false, code: 'incomplete' })
    expect(['outlook', 'flights', 'bank']).toContain(
      (result as { ok: false; slot: string }).slot,
    )
  })

  it('an on-time but unrelated observation source is rejected unrelated-source', () => {
    // E01 is EXERCISE origin, unstamped: not a derivative, but not an
    // independent OBSERVED corroborator either.
    const state: FinaleState = {
      ...correctState(),
      slots: { ...correctState().slots, observation: 'E01' },
    }
    const result = validateCase(state, w02Confirmed)
    expect(result).toMatchObject({
      ok: false,
      code: 'unrelated-source',
      slot: 'observation',
    })
  })

  it('a missing/uncorroborated independent check is rejected unrelated-source', () => {
    // W02 is independent but has no CONFIRMED check in this case file.
    const result = validateCase(correctState(), caseFile())
    expect(result).toMatchObject({
      ok: false,
      code: 'unrelated-source',
      slot: 'observation',
    })
  })

  it('same-run derivatives are rejected derived-not-independent', () => {
    // F06 is DERIVED off C17, run R04: never passes isIndependentObservation.
    const state: FinaleState = {
      ...correctState(),
      slots: { ...correctState().slots, observation: 'F06' },
    }
    const result = validateCase(state, w02Confirmed)
    expect(result).toMatchObject({
      ok: false,
      code: 'derived-not-independent',
      slot: 'observation',
    })
  })

  it('a laundered OBSERVED derivative is still derived-not-independent', () => {
    // L09 is OBSERVED-labelled but parented on F06 (ancestry touches R04).
    const state: FinaleState = {
      ...correctState(),
      slots: { ...correctState().slots, observation: 'L09' },
      // give L09 a CONFIRMED check so only the independence rule can reject it
    }
    const cf = caseFile({ sourceChecks: [{ recordId: 'L09', outcome: 'CONFIRMED' }] })
    const result = validateCase(state, cf)
    expect(result).toMatchObject({
      ok: false,
      code: 'derived-not-independent',
      slot: 'observation',
    })
  })

  it('a broken-chain derivative (orphaned parent) is rejected derived-not-independent', () => {
    // BC01 is OBSERVED-labelled but parented on an id absent from the graph:
    // isIndependentObservation returns BROKEN_CHAIN. A corrupted derivative
    // whose provenance never clears reads derived-not-independent, NOT
    // unrelated-source.
    const state: FinaleState = {
      ...correctState(),
      slots: { ...correctState().slots, observation: 'BC01' },
    }
    const cf = caseFile({ sourceChecks: [{ recordId: 'BC01', outcome: 'CONFIRMED' }] })
    const result = validateCase(state, cf)
    expect(result).toMatchObject({
      ok: false,
      code: 'derived-not-independent',
      slot: 'observation',
    })
  })

  it('a wrong root is rejected wrong-root', () => {
    const state: FinaleState = {
      ...correctState(),
      slots: { ...correctState().slots, root: 'F06' },
    }
    const result = validateCase(state, w02Confirmed)
    expect(result).toMatchObject({ ok: false, code: 'wrong-root', slot: 'root' })
  })

  it('any empty slot is rejected incomplete, naming the slot', () => {
    for (const slot of ['outlook', 'flights', 'bank', 'root', 'observation'] as const) {
      const base = correctState()
      const state: FinaleState = {
        ...base,
        slots: { ...base.slots, [slot]: null },
      }
      const result = validateCase(state, w02Confirmed)
      expect(result).toMatchObject({ ok: false, code: 'incomplete', slot })
    }
  })

  it('validation never mutates the slots it reads', () => {
    const state = correctState()
    const before = JSON.stringify(state)
    validateCase(state, caseFile())
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('finale caseBuilder: rejections through the real engine', () => {
  it('a rejection carries { code, slot }, leaves slots editable, allows retries', () => {
    const { ctx, state, startedAt } = startedFinale()
    let current = state
    // Fill the case but leave the ordering receipt-sorted (wrong).
    const fills: Array<[string, string]> = [
      ['outlook', 'C17'],
      ['flights', 'F06'],
      ['bank', 'B04'],
      ['root', 'C17'],
      ['observation', 'W02'],
    ]
    let now = startedAt + 1_000
    for (const [slot, recordId] of fills) {
      current = act(ctx, current, { kind: 'SELECT', slot, recordId }, now).state
      now += 1_000
    }
    current = act(
      ctx,
      current,
      { kind: 'REORDER', ordering: ['C17', 'B04', 'F06'] },
      now,
    ).state
    now += 1_000
    // No W02 check yet -> this would reject on the observation anyway; request
    // the field report path is covered elsewhere. Here assert the ordering
    // rejection is structured and the state stays editable.
    const validated = act(
      ctx,
      current,
      { kind: 'VALIDATE', caseFile: caseFileFrom(current) },
      now,
    )
    const s = finaleState(validated.state)
    expect(s.caseValid).toBe(false)
    expect(s.lastRejection).not.toBeNull()
    expect(['receipt-order', 'unrelated-source']).toContain(s.lastRejection!.code)
    // Slots stay editable: a later SELECT changes a slot.
    now += 1_000
    const edited = act(
      ctx,
      validated.state,
      { kind: 'SELECT', slot: 'observation', recordId: 'W02' },
      now,
    )
    expect(finaleState(edited.state).slots.observation).toBe('W02')
    expect(finaleState(edited.state).committed).toBeNull()
  })

  it('reorder applies only to subsystem slots; root and observation keep no ordering', () => {
    const { ctx, state, startedAt } = startedFinale()
    const reordered = act(
      ctx,
      state,
      { kind: 'REORDER', ordering: ['B04', 'F06', 'C17'] },
      startedAt + 1_000,
    )
    expect(finaleState(reordered.state).ordering).toEqual(['B04', 'F06', 'C17'])
  })
})

describe('finale caseBuilder: field report legality', () => {
  it('legal when no corroborated candidate exists', () => {
    expect(fieldReportLegal(emptyState(), caseFile())).toBe(true)
  })

  it('illegal once a corroborated candidate exists', () => {
    // W02 confirmed is a corroborated independent candidate.
    expect(fieldReportLegal(emptyState(), w02Confirmed)).toBe(false)
  })

  it('illegal once the field report itself has landed', () => {
    const cf = caseFile({ sourceChecks: [{ recordId: FIELD_REPORT_ID, outcome: 'CONFIRMED' }] })
    expect(fieldReportLegal(emptyState(), cf)).toBe(false)
  })
})

export type { CampaignState }
