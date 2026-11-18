// TDD block 7: selectors with finale-state refinement and graceful absence.
// The selectors are pure functions over the catalog array. Absence is
// silent: no throw, no console output, [] / null returned.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JOSHUA_LINES } from '@engine/joshua/lines'
import {
  DEADLINE_FINAL_PHASE_KEY,
  DEADLINE_WARNING_10S_KEY,
  DEADLINE_WARNING_30S_KEY,
  eventKeyFor,
  selectLine,
  selectLinesForKey,
  type FinaleStateRefinement,
} from '@engine/joshua/selectors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('selectLinesForKey', () => {
  it('returns the lines authored for a covered key', () => {
    const lines = selectLinesForKey('finale.reject.receipt-order')
    expect(lines.length).toBeGreaterThanOrEqual(1)
    for (const line of lines) {
      expect(line.eventKey).toBe('finale.reject.receipt-order')
    }
  })

  it('returns a fresh array the caller cannot use to mutate the catalog', () => {
    const lines = selectLinesForKey('finale.reject.receipt-order')
    const before = JOSHUA_LINES.length
    lines.length = 0
    expect(selectLinesForKey('finale.reject.receipt-order').length).toBeGreaterThanOrEqual(1)
    expect(JOSHUA_LINES.length).toBe(before)
  })

  it('graceful absence: returns [] for an uncovered key', () => {
    expect(selectLinesForKey('no.such.key')).toEqual([])
  })

  it('graceful absence: does not throw on an empty or odd key', () => {
    expect(() => selectLinesForKey('')).not.toThrow()
    expect(selectLinesForKey('')).toEqual([])
  })

  it('graceful absence: logs nothing for an uncovered key', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    selectLinesForKey('no.such.key')
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('selectLine', () => {
  it('returns a single line for a covered non-parameterized key', () => {
    const line = selectLine('mission.outlook.first-discrepancy')
    expect(line).not.toBeNull()
    expect(line?.eventKey).toBe('mission.outlook.first-discrepancy')
  })

  it('graceful absence: returns null for an uncovered key and logs nothing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(selectLine('no.such.key')).toBeNull()
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('does not throw for a missing key', () => {
    expect(() => selectLine('no.such.key')).not.toThrow()
  })
})

describe('finale-state refinement', () => {
  it('refines ending readbacks by endingId', () => {
    const recovery = selectLine('finale.ending', { endingId: 'recovery' })
    const containment = selectLine('finale.ending', { endingId: 'containment' })
    const failure = selectLine('finale.ending', { endingId: 'failure' })
    expect(recovery?.eventKey).toBe('finale.ending.recovery')
    expect(containment?.eventKey).toBe('finale.ending.containment')
    expect(failure?.eventKey).toBe('finale.ending.failure')
    expect(recovery?.id).not.toBe(failure?.id)
  })

  it('also resolves the fully-qualified ending key directly', () => {
    expect(selectLine('finale.ending.recovery')?.eventKey).toBe(
      'finale.ending.recovery',
    )
  })

  it('returns null for the bare ending key without an endingId (graceful absence)', () => {
    expect(selectLine('finale.ending')).toBeNull()
  })

  it('returns null for an unknown endingId (graceful absence, no throw)', () => {
    const refinement = { endingId: 'nonsense' } as unknown as FinaleStateRefinement
    expect(selectLine('finale.ending', refinement)).toBeNull()
  })

  it('resolves the recognition line when the refinement signals recognition', () => {
    const line = selectLine('finale.recognition', { recognized: true })
    expect(line).not.toBeNull()
    expect(line?.eventKey).toBe('finale.recognition')
  })

  it('resolves the recognition line even without a refinement (caller gates the transition)', () => {
    expect(selectLine('finale.recognition')?.eventKey).toBe('finale.recognition')
  })
})

describe('eventKeyFor (finale engine event -> catalog key)', () => {
  it('maps the finale warn-30 event to the 30-second deadline key', () => {
    expect(eventKeyFor({ id: 'warn-30', kind: 'timerMilestone' })).toBe(
      DEADLINE_WARNING_30S_KEY,
    )
  })

  it('maps the finale warn-10 event to the 10-second deadline key', () => {
    expect(eventKeyFor({ id: 'warn-10', kind: 'timerMilestone' })).toBe(
      DEADLINE_WARNING_10S_KEY,
    )
  })

  it('maps the finaleFinalPhase event kind to the final-phase key', () => {
    expect(eventKeyFor({ id: 'final-phase', kind: 'finaleFinalPhase' })).toBe(
      DEADLINE_FINAL_PHASE_KEY,
    )
  })

  it('every key eventKeyFor can return resolves to a non-empty catalog line', () => {
    const emitted = [
      { id: 'warn-30', kind: 'timerMilestone' },
      { id: 'warn-10', kind: 'timerMilestone' },
      { id: 'final-phase', kind: 'finaleFinalPhase' },
    ]
    for (const event of emitted) {
      const key = eventKeyFor(event)
      expect(key).not.toBeNull()
      const line = selectLine(key as string)
      expect(line).not.toBeNull()
      expect(line?.text.length).toBeGreaterThan(0)
      expect(selectLinesForKey(key as string).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('graceful: returns null for an unmapped event and does not throw', () => {
    expect(eventKeyFor({ id: 'start', kind: 'finaleStart' })).toBeNull()
    expect(eventKeyFor({})).toBeNull()
    expect(() => eventKeyFor({ id: 'nonsense' })).not.toThrow()
  })
})

describe('determinism', () => {
  it('returns the same result across repeated calls', () => {
    const a = selectLine('finale.ending', { endingId: 'failure' })
    const b = selectLine('finale.ending', { endingId: 'failure' })
    expect(a).toEqual(b)
  })
})
