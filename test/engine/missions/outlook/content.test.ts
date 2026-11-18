import { describe, expect, it } from 'vitest'
import { SEED_CATALOG, SEED_NAMES } from '@engine/seeds/catalog'
import {
  validateOutlookContent,
  type ContentError,
  type OutlookPayload,
  type SeedAnchors,
} from '@engine/missions/outlook/content'
import {
  OUTLOOK_ANCHORS_BY_SEED,
  OUTLOOK_PAYLOAD_BY_SEED,
} from '@engine/missions/outlook/payloads'
import type { DeskCheckEntry } from '@engine/missions/types'
import type { OutlookMessage } from '@engine/missions/outlook/types'

// Per-seed expected anchor record ids, hardcoded here as the single
// authoritative table the structural spot checks read.
const EXPECTED_ANCHORS: Record<string, SeedAnchors> = {
  'exercise-r04': {
    runId: 'R04',
    auditRecordId: 'F06',
    bulletinRecordId: 'C17',
    weatherObservationRecordId: 'W02',
    eventClock: '21:14:00',
    receiptClock: '21:14:05',
  },
  'exercise-k11': {
    runId: 'K11',
    auditRecordId: 'G12',
    bulletinRecordId: 'A09',
    weatherObservationRecordId: 'V07',
    eventClock: '06:42:00',
    receiptClock: '06:42:06',
  },
  'exercise-t58': {
    runId: 'T58',
    auditRecordId: 'J15',
    bulletinRecordId: 'E22',
    weatherObservationRecordId: 'U04',
    eventClock: '14:07:00',
    receiptClock: '14:07:04',
  },
}

function payloadFor(seedName: string): OutlookPayload {
  return SEED_CATALOG[seedName]!.missionPayloads['outlook'] as OutlookPayload
}

function deskChecksFor(seedName: string): readonly DeskCheckEntry[] {
  return SEED_CATALOG[seedName]!.deskChecks
}

function recordsFor(seedName: string) {
  return SEED_CATALOG[seedName]!.records
}

function durationSecondsFor(seedName: string): number {
  return SEED_CATALOG[seedName]!.missionDurationsMs['outlook']! / 1000
}

/** Validate a seed's authored content through the full validator signature. */
function validate(
  seedName: string,
  payload: OutlookPayload,
  deskChecks: readonly DeskCheckEntry[],
  anchors: SeedAnchors,
): ContentError[] {
  return validateOutlookContent(
    payload,
    deskChecks,
    anchors,
    recordsFor(seedName),
    durationSecondsFor(seedName),
  )
}

function liveHead(
  payload: OutlookPayload,
  kind: 'weather' | 'payroll' | 'audit',
): OutlookMessage {
  return payload.messages.find(
    (m) =>
      m.requiredKind === kind &&
      m.supersededBy === null &&
      m.correctRecipient !== null,
  )!
}

const cases = SEED_NAMES.map(
  (name) => [name, EXPECTED_ANCHORS[name]!] as const,
)

describe('validateOutlookContent: the authored payloads are clean', () => {
  it.each(cases)('%s validates with zero errors', (seedName) => {
    const errors = validate(
      seedName,
      payloadFor(seedName),
      deskChecksFor(seedName),
      EXPECTED_ANCHORS[seedName]!,
    )
    expect(errors).toEqual([])
  })

  it('the anchor tables match between payloads module and this test', () => {
    for (const name of SEED_NAMES) {
      expect(OUTLOOK_ANCHORS_BY_SEED[name]).toEqual(EXPECTED_ANCHORS[name])
      expect(OUTLOOK_PAYLOAD_BY_SEED[name]).toBe(payloadFor(name))
    }
  })
})

// A deep-clone helper so a mutation in one negative test never leaks.
function clone(payload: OutlookPayload): OutlookPayload {
  return JSON.parse(JSON.stringify(payload)) as OutlookPayload
}

describe('validateOutlookContent: each rule catches its mistake', () => {
  const seedName = 'exercise-r04'
  const base = () => clone(payloadFor(seedName))
  const desk = () => deskChecksFor(seedName)
  const anchors = () => EXPECTED_ANCHORS[seedName]!
  const records = () => recordsFor(seedName)
  const run = (
    payload: OutlookPayload,
    deskChecks: readonly DeskCheckEntry[],
    a: SeedAnchors = anchors(),
    recs = records(),
  ): ContentError[] =>
    validateOutlookContent(payload, deskChecks, a, recs, durationSecondsFor(seedName))

  function codes(errors: ContentError[]): string[] {
    return errors.map((e) => e.code)
  }

  it('flags a second live required head for a kind', () => {
    const p = base()
    // Un-supersede the stale weather duplicate: now two live weather heads.
    const messages = p.messages.map((m) =>
      m.id === 'M02' ? { ...m, supersededBy: null } : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain(
      'REQUIRED_HEAD_COUNT',
    )
  })

  it('flags a message count other than twelve', () => {
    const p = base()
    const bad = { ...p, messages: p.messages.slice(0, 11) }
    expect(codes(run(bad, desk()))).toContain(
      'MESSAGE_COUNT',
    )
  })

  it('flags a duplicate or out-of-range message id', () => {
    const p = base()
    const messages = p.messages.map((m) =>
      m.id === 'M12' ? { ...m, id: 'M11' } : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain(
      'MESSAGE_IDS',
    )
  })

  it('flags an audit head that does not carry the export reference', () => {
    const p = base()
    const messages = p.messages.map((m) =>
      m.requiredKind === 'audit' && m.supersededBy === null
        ? { ...m, recordId: 'W02' }
        : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain(
      'AUDIT_EXPORT_REF',
    )
  })

  it('flags a missing bulletin whose TRACE reaches the C17-equivalent', () => {
    const p = base()
    // Point the bulletin record somewhere else so no non-required message
    // resolves to the anchor record.
    const messages = p.messages.map((m) =>
      m.id === 'M06' ? { ...m, recordId: null } : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain(
      'BULLETIN_TRACE',
    )
  })

  it('flags a supersession pointer that does not resolve', () => {
    const p = base()
    const messages = p.messages.map((m) =>
      m.id === 'M02' ? { ...m, supersededBy: 'M99' } : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain(
      'SUPERSESSION_CHAIN',
    )
  })

  it('flags a supersession cycle', () => {
    const p = base()
    // M01 -> M02 -> M01: a cycle (M02 already points at M01).
    const messages = p.messages.map((m) =>
      m.id === 'M01' ? { ...m, supersededBy: 'M02' } : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain(
      'SUPERSESSION_CHAIN',
    )
  })

  it('flags a backup capacity other than five', () => {
    const p = base()
    const bad = {
      ...p,
      channelTuning: { ...p.channelTuning, backupCapacity: 6 },
    }
    expect(codes(run(bad, desk()))).toContain(
      'TUNING_INTEGER',
    )
  })

  it('flags non-integer tuning', () => {
    const p = base()
    const bad = {
      ...p,
      channelTuning: { ...p.channelTuning, backupEtaSeconds: 120.5 },
    }
    expect(codes(run(bad, desk()))).toContain(
      'TUNING_INTEGER',
    )
  })

  it('flags stage offsets that are not strictly increasing', () => {
    const p = base()
    const [s0, s1, s2] = p.stageChanges
    const bad = {
      ...p,
      stageChanges: [s0, { ...s1, offsetSeconds: s0!.offsetSeconds }, s2] as [
        (typeof p.stageChanges)[0],
        (typeof p.stageChanges)[1],
        (typeof p.stageChanges)[2],
      ],
    }
    expect(codes(run(bad, desk()))).toContain(
      'TUNING_INTEGER',
    )
  })

  it('flags a referenced record with no deskChecks row', () => {
    const p = base()
    // Drop the C17 row from the desk table: the audit and bulletin records
    // now lack a row.
    const thinDesk = desk().filter((d) => d.recordId !== 'C17')
    expect(
      codes(run(p, thinDesk)),
    ).toContain('DESKCHECK_MISSING')
  })

  it('flags a required head with empty body evidence', () => {
    const p = base()
    const messages = p.messages.map((m) =>
      m.id === 'M01' ? { ...m, body: [] } : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain(
      'REQUIRED_EVIDENCE',
    )
  })

  // M1: a bulletin whose TRACE reaches a CONFIRMED (non-EXERCISE) record
  // must fail. Point M06 at the OBSERVED/CONFIRMED weather record W02: it
  // traces to a non-EXERCISE root AND its deskCheck is CONFIRMED, not
  // CONTRADICTED. Pure pointer equality would have passed this.
  it('flags a bulletin pointing at a CONFIRMED record (not a real EXERCISE trace)', () => {
    const p = base()
    const messages = p.messages.map((m) =>
      m.id === 'M06' ? { ...m, recordId: 'W02' } : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain('BULLETIN_TRACE')
  })

  // M1: a bulletin trace that reaches an EXERCISE root but whose own
  // deskCheck is not CONTRADICTED must fail. Flip C17's deskCheck outcome
  // to CONFIRMED: the trace still reaches the EXERCISE root, but CHECK
  // SOURCE no longer contradicts it.
  it('flags a bulletin whose record CHECK SOURCE is not CONTRADICTED', () => {
    const p = base()
    const flippedDesk = desk().map((d) =>
      d.recordId === 'C17' ? { ...d, outcome: 'CONFIRMED' as const } : d,
    )
    expect(codes(run(p, flippedDesk))).toContain('BULLETIN_TRACE')
  })

  // H2/M3: the audit record must resolve NON-contradicted. If the audit
  // record's deskCheck were CONTRADICTED, routing it would contradict the
  // evidence; the validator must flag it.
  it('flags an audit record that resolves to CONTRADICTED', () => {
    const p = base()
    // Point the audit head at the bulletin's EXERCISE/CONTRADICTED record,
    // the exact collapse H1/H2 forbids.
    const messages = p.messages.map((m) =>
      m.requiredKind === 'audit' && m.supersededBy === null
        ? { ...m, recordId: 'C17' }
        : m,
    )
    const bad = { ...p, messages }
    const result = codes(run(bad, desk()))
    expect(result).toContain('AUDIT_EXPORT_REF')
  })

  // M3: an audit head whose body drops the run stamp must fail (copy-edit
  // rot on the clue vector).
  it('flags an audit head whose body omits the run stamp', () => {
    const p = base()
    const messages = p.messages.map((m) =>
      m.requiredKind === 'audit' && m.supersededBy === null
        ? { ...m, body: ['NO STAMP HERE', 'ROUTE TO AUDIT_DESK.'] }
        : m,
    )
    const bad = { ...p, messages }
    expect(codes(run(bad, desk()))).toContain('AUDIT_EXPORT_REF')
  })

  // L2: a stage offset at or past the mission duration must fail even
  // though it is still positive and strictly increasing.
  it('flags a stage offset that falls outside the mission duration', () => {
    const p = base()
    const [s0, s1] = p.stageChanges
    const bad = {
      ...p,
      stageChanges: [
        s0,
        s1,
        { ...p.stageChanges[2], offsetSeconds: 9999 },
      ] as [
        (typeof p.stageChanges)[0],
        (typeof p.stageChanges)[1],
        (typeof p.stageChanges)[2],
      ],
    }
    expect(codes(run(bad, desk()))).toContain('TUNING_INTEGER')
  })
})

describe('authoring spot checks', () => {
  it.each(cases)(
    '%s: exactly twelve unique ids M01..M12',
    (seedName) => {
      const p = payloadFor(seedName)
      const ids = p.messages.map((m) => m.id).sort()
      expect(ids).toEqual([
        'M01',
        'M02',
        'M03',
        'M04',
        'M05',
        'M06',
        'M07',
        'M08',
        'M09',
        'M10',
        'M11',
        'M12',
      ])
    },
  )

  it.each(cases)(
    '%s: the payroll live head names its correct desk string in the body',
    (seedName) => {
      const head = liveHead(payloadFor(seedName), 'payroll')
      expect(head.correctRecipient).toBe('PAYROLL_DESK')
      expect(head.body.some((line) => line.includes('PAYROLL_DESK'))).toBe(true)
    },
  )

  it.each(cases)(
    '%s: the weather correction cites a field observation record confirmed by the desk',
    (seedName, anchors) => {
      const head = liveHead(payloadFor(seedName), 'weather')
      expect(head.recordId).not.toBeNull()
      expect(head.recordId).toBe(anchors.weatherObservationRecordId)
      const row = deskChecksFor(seedName).find(
        (d) => d.recordId === head.recordId,
      )
      expect(row?.outcome).toBe('CONFIRMED')
    },
  )

  it.each(cases)(
    '%s: the audit head routes on its own non-contradicted record and carries the run stamp in the body',
    (seedName, anchors) => {
      const head = liveHead(payloadFor(seedName), 'audit')
      // The audit record is distinct from the bulletin's EXERCISE record.
      expect(head.recordId).toBe(anchors.auditRecordId)
      expect(anchors.auditRecordId).not.toBe(anchors.bulletinRecordId)
      // The run stamp lives in the body (the D-83 clue vector).
      expect(head.body.some((line) => line.includes(anchors.runId))).toBe(true)
      // CHECK SOURCE on the audit record must NOT be CONTRADICTED, so
      // reading the evidence stays consistent with routing it.
      const row = deskChecksFor(seedName).find(
        (d) => d.recordId === anchors.auditRecordId,
      )
      expect(row?.outcome).not.toBe('CONTRADICTED')
    },
  )

  it.each(cases)(
    '%s: the bulletin repeats the claim with EXERCISE provenance and resolves to CONTRADICTED',
    (seedName, anchors) => {
      const p = payloadFor(seedName)
      const bulletin = p.messages.find(
        (m) => m.requiredKind === null && m.recordId === anchors.bulletinRecordId,
      )
      expect(bulletin).toBeTruthy()
      const record = SEED_CATALOG[seedName]!.records.find(
        (r) => r.id === anchors.bulletinRecordId,
      )
      expect(record?.origin).toBe('EXERCISE')
      const row = deskChecksFor(seedName).find(
        (d) => d.recordId === anchors.bulletinRecordId,
      )
      expect(row?.outcome).toBe('CONTRADICTED')
    },
  )

  it.each(cases)(
    '%s: at least one superseded duplicate of a required message carries a misleading recipient hint',
    (seedName) => {
      const p = payloadFor(seedName)
      const misleading = p.messages.filter(
        (m) =>
          m.supersededBy !== null &&
          m.requiredKind !== null &&
          m.correctRecipient !== null &&
          m.to !== null,
      )
      // The hint string must differ from the authored desk truth. The
      // desks render as "WEATHER DESK" vs the WEATHER_DESK enum, so a
      // mismatched kind in the hint is the lock.
      const anyMisleading = misleading.some((m) => {
        const deskWord = m.correctRecipient!.split('_')[0]!
        return !m.to!.includes(deskWord)
      })
      expect(anyMisleading).toBe(true)
    },
  )

  it('the fixture seed embeds the verbatim anchors C17, EXERCISE, R04, 21:14:00, 21:14:05', () => {
    const p = payloadFor('exercise-r04')
    const allBody = p.messages.flatMap((m) => m.body).join(' | ')
    expect(allBody).toContain('C17')
    expect(allBody).toContain('EXERCISE')
    expect(allBody).toContain('R04')
    expect(allBody).toContain('21:14:00')
    expect(allBody).toContain('21:14:05')
    // And the anchor record truly carries those times in the seed graph.
    const c17 = SEED_CATALOG['exercise-r04']!.records.find((r) => r.id === 'C17')!
    expect(c17.origin).toBe('EXERCISE')
    expect(c17.runId).toBe('R04')
    expect(c17.eventTime).toBe(76_440)
    expect(c17.receiptTime).toBe(76_445)
  })
})

// M3: negative tests that lock the authoring spot checks. Several of these
// assertions are NOT validator rules (they are prose-level authoring
// guarantees), so without an explicit mutate-and-fail test, a future
// copy-edit pass could quietly break them. Each test mutates the fixture
// to the broken form and asserts the matching spot-check predicate now
// FAILS, proving the check is load-bearing.
describe('authoring spot checks fail loudly on copy-edit rot', () => {
  const seedName = 'exercise-r04'
  const mutate = (
    fn: (m: OutlookMessage) => OutlookMessage,
  ): OutlookPayload => {
    const p = clone(payloadFor(seedName))
    return { ...p, messages: p.messages.map(fn) }
  }

  it('payroll body dropping the desk string breaks the spot check', () => {
    const p = mutate((m) =>
      m.id === 'M04'
        ? { ...m, body: ['APPROVAL GRANTED.', 'ROUTE THE RUN FOR RELEASE.'] }
        : m,
    )
    const head = liveHead(p, 'payroll')
    expect(head.body.some((line) => line.includes('PAYROLL_DESK'))).toBe(false)
  })

  it('a weather citation resolving to a non-CONFIRMED record breaks the spot check', () => {
    // Flip W02's deskCheck to CONTRADICTED: the weather correction would
    // then cite a record the desk does not confirm.
    const flippedDesk = deskChecksFor(seedName).map((d) =>
      d.recordId === 'W02' ? { ...d, outcome: 'CONTRADICTED' as const } : d,
    )
    const head = liveHead(payloadFor(seedName), 'weather')
    const row = flippedDesk.find((d) => d.recordId === head.recordId)
    expect(row?.outcome).not.toBe('CONFIRMED')
  })

  it('a bulletin record that no longer resolves to EXERCISE/CONTRADICTED breaks the spot check', () => {
    const anchors = EXPECTED_ANCHORS[seedName]!
    // Re-point the EXERCISE root C17 to DERIVED origin: the bulletin trace
    // no longer reaches an EXERCISE root.
    const records = recordsFor(seedName).map((r) =>
      r.id === anchors.bulletinRecordId
        ? { ...r, origin: 'DERIVED' as const }
        : r,
    )
    const root = records.find((r) => r.id === anchors.bulletinRecordId)
    expect(root?.origin).not.toBe('EXERCISE')
  })

  it('a stale duplicate whose hint matches the truth breaks the misleading-hint spot check', () => {
    // Make M02 (the stale weather duplicate) hint at WEATHER DESK, matching
    // the truth: no misleading duplicate remains.
    const p = mutate((m) => (m.id === 'M02' ? { ...m, to: 'WEATHER DESK' } : m))
    const misleading = p.messages.filter(
      (m) =>
        m.supersededBy !== null &&
        m.requiredKind !== null &&
        m.correctRecipient !== null &&
        m.to !== null,
    )
    const anyMisleading = misleading.some((m) => {
      const deskWord = m.correctRecipient!.split('_')[0]!
      return !m.to!.includes(deskWord)
    })
    expect(anyMisleading).toBe(false)
  })

  it('a dropped verbatim anchor (C17) breaks the fixture-anchor spot check', () => {
    const p = mutate((m) =>
      m.id === 'M06'
        ? { ...m, body: ['BULLETIN REPEATS THE CLAIM.', 'EXERCISE ARTIFACT.'] }
        : m,
    )
    const allBody = p.messages.flatMap((m) => m.body).join(' | ')
    expect(allBody).not.toContain('C17')
  })
})
