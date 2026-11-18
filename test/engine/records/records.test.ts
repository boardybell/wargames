import { describe, expect, it } from 'vitest'
import {
  buildRecordGraph,
  corroborationValue,
  getRecord,
  isIndependentObservation,
  trace,
} from '@engine/records'
import type { EvidenceRecord } from '@engine/records'
import { stateHash } from '../harness/canonical'
import { C17, F06, FIXTURE_RECORDS, W02 } from './fixtures'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

const graph = deepFreeze(buildRecordGraph(FIXTURE_RECORDS))

describe('record graph container', () => {
  it('stores records as an array sorted by id', () => {
    const ids = graph.records.map((r) => r.id)
    expect(ids).toEqual([...ids].sort())
  })

  it('getRecord resolves by id and returns null for unknown ids', () => {
    expect(getRecord(graph, 'F06')?.sourceId).toBe('FLIGHT-CONTROL')
    expect(getRecord(graph, 'ZZ9')).toBeNull()
  })

  it('rejects duplicate ids at construction', () => {
    expect(() => buildRecordGraph([C17, { ...F06, id: 'C17' }])).toThrow(
      /duplicate/i,
    )
  })
})

describe('trace', () => {
  it('returns origin, times, and a parent summary for a derived record', () => {
    const result = trace(graph, 'F06')
    expect(result.found).toBe(true)
    if (!result.found) return
    expect(result.origin).toBe('DERIVED')
    expect(result.eventTime).toBe(76448)
    expect(result.receiptTime).toBe(76492)
    expect(result.parent).toEqual({
      id: 'C17',
      origin: 'EXERCISE',
      sourceId: 'D83-EXPORT',
      eventTime: 76440,
    })
    expect(result.runId).toBe('R04')
  })

  it('returns null parent fields for a true origin', () => {
    const result = trace(graph, 'C17')
    expect(result.found).toBe(true)
    if (!result.found) return
    expect(result.parent).toBeNull()
  })

  it('returns a typed not-found result for unknown ids', () => {
    expect(trace(graph, 'NOPE')).toEqual({ found: false, recordId: 'NOPE' })
  })

  it('is pure and frozen-input safe', () => {
    const before = stateHash(graph)
    trace(graph, 'B04')
    trace(graph, 'NOPE')
    expect(stateHash(graph)).toBe(before)
  })
})

describe('isIndependentObservation', () => {
  it('accepts an observed record with no claim-run ancestry', () => {
    const verdict = isIndependentObservation(graph, 'W02', 'R04')
    expect(verdict).toEqual({ independent: true, reason: 'INDEPENDENT' })
  })

  it('rejects derived records regardless of accuracy', () => {
    expect(isIndependentObservation(graph, 'F06', 'R04').reason).toBe(
      'DERIVED_ORIGIN',
    )
    expect(isIndependentObservation(graph, 'B04', 'R04').independent).toBe(
      false,
    )
  })

  it('rejects observed-labeled records whose ancestry reaches the run', () => {
    const verdict = isIndependentObservation(graph, 'L09', 'R04')
    expect(verdict).toEqual({
      independent: false,
      reason: 'ANCESTRY_TOUCHES_RUN',
    })
  })

  it('rejects a direct run stamp even with observed origin', () => {
    const verdict = isIndependentObservation(graph, 'S11', 'R04')
    expect(verdict).toEqual({ independent: false, reason: 'DIRECT_RUN_STAMP' })
  })

  it('rejects exercise origin even when unstamped by the claim run', () => {
    expect(isIndependentObservation(graph, 'E01', 'R04')).toEqual({
      independent: false,
      reason: 'EXERCISE_ORIGIN',
    })
  })

  it('pins precedence: origin outranks stamp, stamp outranks ancestry', () => {
    expect(isIndependentObservation(graph, 'C17', 'R04').reason).toBe(
      'EXERCISE_ORIGIN',
    )
    expect(isIndependentObservation(graph, 'P13', 'R04').reason).toBe(
      'DIRECT_RUN_STAMP',
    )
  })

  it('returns RECORD_NOT_FOUND for unknown ids', () => {
    expect(isIndependentObservation(graph, 'ZZ9', 'R04').reason).toBe(
      'RECORD_NOT_FOUND',
    )
  })

  it('terminates with BROKEN_CHAIN on a dangling parent, pure on frozen input', () => {
    const dangling: EvidenceRecord = { ...W02, id: 'D01', parentId: 'GONE' }
    const g = deepFreeze(buildRecordGraph([...FIXTURE_RECORDS, dangling]))
    expect(isIndependentObservation(g, 'D01', 'R04').reason).toBe(
      'BROKEN_CHAIN',
    )
  })

  it('treats an empty-string parentId as a broken edge in both functions', () => {
    const empty: EvidenceRecord = { ...W02, id: 'E99', parentId: '' }
    const g = deepFreeze(buildRecordGraph([...FIXTURE_RECORDS, empty]))
    const traced = trace(g, 'E99')
    expect(traced.found && traced.parent).toBeNull()
    expect(isIndependentObservation(g, 'E99', 'R04').reason).toBe(
      'BROKEN_CHAIN',
    )
  })

  it('terminates with BROKEN_CHAIN on a parent cycle, pure on frozen input', () => {
    const a: EvidenceRecord = { ...W02, id: 'X1', parentId: 'X2' }
    const b: EvidenceRecord = { ...W02, id: 'X2', parentId: 'X1' }
    const g = deepFreeze(buildRecordGraph([...FIXTURE_RECORDS, a, b]))
    expect(isIndependentObservation(g, 'X1', 'R04').reason).toBe('BROKEN_CHAIN')
  })

  it('accepts a frozen input array at construction', () => {
    const frozenInput = deepFreeze([...FIXTURE_RECORDS])
    expect(() => buildRecordGraph(frozenInput)).not.toThrow()
  })

  it('is pure on a frozen graph', () => {
    const before = stateHash(graph)
    isIndependentObservation(graph, 'W02', 'R04')
    isIndependentObservation(graph, 'L09', 'R04')
    expect(stateHash(graph)).toBe(before)
  })
})

describe('corroborationValue', () => {
  it('scores CONFIRMED positive and everything else zero', () => {
    expect(corroborationValue('CONFIRMED')).toBeGreaterThan(0)
    expect(corroborationValue('CONTRADICTED')).toBe(0)
    expect(corroborationValue('PENDING')).toBe(0)
    expect(corroborationValue('UNKNOWN')).toBe(0)
  })

  it('returns integers for every outcome', () => {
    for (const outcome of [
      'CONFIRMED',
      'CONTRADICTED',
      'PENDING',
      'UNKNOWN',
    ] as const) {
      expect(Number.isInteger(corroborationValue(outcome))).toBe(true)
    }
  })
})
