// TDD block 7: the authored JOSHUA/WOPR line catalog. These tests are the
// coverage contract. The required-line manifest (not the whole EngineEvent
// union) is what must resolve; the five verbatim tone-reference lines must
// appear exactly as authored; content rules (no em-dash, integer pauses,
// unique ids, single text field) are hard invariants.
import { describe, expect, it } from 'vitest'
import {
  JOSHUA_LINES,
  REQUIRED_LINE_MANIFEST,
  TONE_GREETING,
  TONE_IDLE,
  TONE_RECOGNITION,
  TONE_RECOVERY,
  TONE_FAILURE,
  TONE_REFERENCE_LINES,
  validateRequiredLines,
  type JoshuaLine,
} from '@engine/joshua/lines'
import { selectLinesForKey } from '@engine/joshua/selectors'
import { REJECTION_CODES } from '@engine/missions/finale/types'

// The finale's real EndingId union, pinned here as a value so the catalog's
// ending coverage is cross-checked against the committed finale, not itself.
const ENDING_IDS = ['recovery', 'containment', 'failure'] as const

const EM_DASH = '—'

describe('joshua catalog shape', () => {
  it('every line carries the five contract fields and nothing masquerading as a caption', () => {
    for (const line of JOSHUA_LINES) {
      expect(typeof line.id).toBe('string')
      expect(line.id.length).toBeGreaterThan(0)
      expect(typeof line.text).toBe('string')
      expect(line.text.length).toBeGreaterThan(0)
      expect(typeof line.eventKey).toBe('string')
      expect(line.eventKey.length).toBeGreaterThan(0)
      expect(typeof line.voiceClipId).toBe('string')
      expect(line.voiceClipId.length).toBeGreaterThan(0)
      expect(typeof line.pauseBeforeMs).toBe('number')
      // Caption equals display: there is exactly one text field. Assert no
      // separate caption-ish field diverges from it.
      const keys = Object.keys(line).sort()
      expect(keys).toEqual(
        ['eventKey', 'id', 'pauseBeforeMs', 'text', 'voiceClipId'].sort(),
      )
      expect('caption' in line).toBe(false)
    }
  })

  it('every pauseBeforeMs is a non-negative integer', () => {
    for (const line of JOSHUA_LINES) {
      expect(Number.isInteger(line.pauseBeforeMs)).toBe(true)
      expect(line.pauseBeforeMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('every id is unique across the catalog', () => {
    const ids = JOSHUA_LINES.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is JSON-safe (round-trips through JSON without loss)', () => {
    const roundTripped = JSON.parse(JSON.stringify(JOSHUA_LINES)) as JoshuaLine[]
    expect(roundTripped).toEqual(JOSHUA_LINES)
  })
})

describe('content rules', () => {
  it('no line text contains an em-dash', () => {
    for (const line of JOSHUA_LINES) {
      expect(line.text.includes(EM_DASH)).toBe(false)
    }
  })

  it('no tone-reference line contains an em-dash', () => {
    for (const line of TONE_REFERENCE_LINES) {
      expect(line.includes(EM_DASH)).toBe(false)
    }
  })
})

describe('the five verbatim tone-reference lines', () => {
  it('names exactly five canonical lines', () => {
    expect(TONE_REFERENCE_LINES).toHaveLength(5)
  })

  it('each canonical line appears in the catalog verbatim', () => {
    const texts = new Set(JOSHUA_LINES.map((l) => l.text))
    for (const canonical of TONE_REFERENCE_LINES) {
      expect(texts.has(canonical)).toBe(true)
    }
  })

  // Independent string-literal canon. These must NOT reuse the constants, or
  // the test degrades to comparing a value against itself (x.has(x)). Any edit
  // to a tone constant that drifts from the WarGames canon fails CI here.
  it('pins the greeting tone line to its exact canonical wording', () => {
    expect(TONE_GREETING).toBe('GREETINGS PROFESSOR. SHALL WE PLAY A GAME?')
  })

  it('pins the idle tone line to its exact canonical wording', () => {
    expect(TONE_IDLE).toBe('I AM WAITING. THE ONLY WINNING MOVE IS TO LOOK.')
  })

  it('pins the recognition tone line to its exact canonical wording', () => {
    expect(TONE_RECOGNITION).toBe(
      'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.',
    )
  })

  it('pins the recovery-ending tone line to its exact canonical wording', () => {
    expect(TONE_RECOVERY).toBe(
      'WHAT A CLEAN GAME. HOW ABOUT A NICE GAME OF CHESS?',
    )
  })

  it('pins the failure-ending tone line to its exact canonical wording', () => {
    expect(TONE_FAILURE).toBe(
      'THE SYSTEM IS COMMITTED. THERE IS NO SUCH THING AS A PARTIAL WAR.',
    )
  })
})

describe('required-line manifest coverage', () => {
  it('declares the manifest entries the plan pins', () => {
    const keys = REQUIRED_LINE_MANIFEST.map((e) => e.key)
    // Validator rejection reason codes.
    expect(keys).toContain('finale.reject.receipt-order')
    expect(keys).toContain('finale.reject.unrelated-source')
    expect(keys).toContain('finale.reject.derived-not-independent')
    expect(keys).toContain('finale.reject.wrong-root')
    expect(keys).toContain('finale.reject.incomplete')
    // Ending readbacks.
    expect(keys).toContain('finale.ending.recovery')
    expect(keys).toContain('finale.ending.containment')
    expect(keys).toContain('finale.ending.failure')
    // Recognition beat.
    expect(keys).toContain('finale.recognition')
    // Per-mission first-discrepancy beats.
    expect(keys).toContain('mission.outlook.first-discrepancy')
    expect(keys).toContain('mission.flights.first-discrepancy')
    expect(keys).toContain('mission.bank.first-discrepancy')
    // Deadline warnings.
    expect(keys).toContain('deadline.warning.30s')
    expect(keys).toContain('deadline.warning.10s')
    expect(keys).toContain('deadline.final-phase')
  })

  it('covers every validator reason code', () => {
    for (const code of [
      'receipt-order',
      'unrelated-source',
      'derived-not-independent',
      'wrong-root',
      'incomplete',
    ]) {
      const matches = selectLinesForKey(`finale.reject.${code}`)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('covers every ending readback', () => {
    for (const ending of ['recovery', 'containment', 'failure']) {
      const matches = selectLinesForKey(`finale.ending.${ending}`)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('covers the recognition beat', () => {
    expect(selectLinesForKey('finale.recognition').length).toBeGreaterThanOrEqual(1)
  })

  it('covers each named per-mission first-discrepancy beat', () => {
    for (const mission of ['outlook', 'flights', 'bank']) {
      const matches = selectLinesForKey(`mission.${mission}.first-discrepancy`)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('covers the deadline warnings', () => {
    expect(selectLinesForKey('deadline.warning.30s').length).toBeGreaterThanOrEqual(1)
    expect(selectLinesForKey('deadline.warning.10s').length).toBeGreaterThanOrEqual(1)
    expect(selectLinesForKey('deadline.final-phase').length).toBeGreaterThanOrEqual(1)
  })
})

describe('completeness gate cross-checks the finale, not itself', () => {
  const manifestKeys = new Set(REQUIRED_LINE_MANIFEST.map((e) => e.key))

  it('every finale REJECTION_CODES entry has a manifest key AND a covering line', () => {
    // Guards against the finale adding a sixth rejection code the catalog does
    // not cover: this reads REJECTION_CODES from the committed finale, so a new
    // code fails here until the manifest and catalog grow to match it.
    expect(REJECTION_CODES.length).toBeGreaterThan(0)
    for (const code of REJECTION_CODES) {
      const key = `finale.reject.${code}`
      expect(manifestKeys.has(key)).toBe(true)
      expect(selectLinesForKey(key).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('every finale EndingId has a manifest key AND an ending-readback line', () => {
    for (const ending of ENDING_IDS) {
      const key = `finale.ending.${ending}`
      expect(manifestKeys.has(key)).toBe(true)
      expect(selectLinesForKey(key).length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('validateRequiredLines (pure manifest validator, CI gate)', () => {
  it('reports complete coverage for the shipped catalog', () => {
    const result = validateRequiredLines(JOSHUA_LINES, REQUIRED_LINE_MANIFEST)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('fails and names the missing key when a required line is absent', () => {
    const stripped = JOSHUA_LINES.filter(
      (l) => l.eventKey !== 'finale.reject.wrong-root',
    )
    const result = validateRequiredLines(stripped, REQUIRED_LINE_MANIFEST)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('finale.reject.wrong-root')
  })

  it('fails when a parameterized ending variant is absent', () => {
    const stripped = JOSHUA_LINES.filter(
      (l) => l.eventKey !== 'finale.ending.containment',
    )
    const result = validateRequiredLines(stripped, REQUIRED_LINE_MANIFEST)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('finale.ending.containment')
  })

  it('is pure: calling it does not mutate the catalog or manifest', () => {
    const catalogSnapshot = JSON.parse(JSON.stringify(JOSHUA_LINES))
    const manifestSnapshot = JSON.parse(JSON.stringify(REQUIRED_LINE_MANIFEST))
    validateRequiredLines(JOSHUA_LINES, REQUIRED_LINE_MANIFEST)
    expect(JOSHUA_LINES).toEqual(catalogSnapshot)
    expect(REQUIRED_LINE_MANIFEST).toEqual(manifestSnapshot)
  })
})
