diff --git a/src/engine/joshua/lines.ts b/src/engine/joshua/lines.ts
new file mode 100644
index 0000000..53b4e40
--- /dev/null
+++ b/src/engine/joshua/lines.ts
@@ -0,0 +1,281 @@
+// The authored JOSHUA / WOPR line catalog for the whole SHALL WE PLAY A
+// GAME? campaign. This is the ONE place authored voice-over copy is allowed
+// to live. It is pure data: no engine state, no Date.now, no Math.random,
+// no DOM. Split 07 records audio against the stable `id` of each line, so
+// ids are permanent once published. `text` is the single string used for
+// display, caption, and announcer alike; there is no separate caption field.
+//
+// The shell renders a line ONLY when a selector resolves a key for it
+// (see selectors.ts). A key the catalog does not cover renders nothing and
+// logs nothing (graceful absence). The required-line manifest below is the
+// coverage contract, proven complete by validateRequiredLines in CI.
+
+/** One authored Joshua line. JSON-safe. */
+export interface JoshuaLine {
+  /** Stable, globally unique id. Audio records against this; permanent. */
+  readonly id: string
+  /** Display AND caption AND announcer text. The only copy string. */
+  readonly text: string
+  /** The EngineEvent kind string or finale STATE key the shell looks up. */
+  readonly eventKey: string
+  /** Audio clip id consumed by split 07. */
+  readonly voiceClipId: string
+  /** Integer pause honored before the line renders. */
+  readonly pauseBeforeMs: number
+}
+
+// ── The five verbatim tone-reference lines ──────────────────────────────
+// The project requirements pin five canonical Joshua lines that set his
+// WarGames register. They must appear VERBATIM somewhere in the catalog,
+// one at each of: initial greeting, an idle/waiting beat, the recognition
+// beat, the recovery ending, and the failure ending. Treat these as fixed
+// strings. No em-dash. These constants are the single source of truth: the
+// catalog entries below reuse them by reference so they cannot drift.
+
+const TONE_GREETING = 'GREETINGS PROFESSOR. SHALL WE PLAY A GAME?'
+const TONE_IDLE = 'I AM WAITING. THE ONLY WINNING MOVE IS TO LOOK.'
+const TONE_RECOGNITION = 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.'
+const TONE_RECOVERY = 'WHAT A CLEAN GAME. HOW ABOUT A NICE GAME OF CHESS?'
+const TONE_FAILURE =
+  'THE SYSTEM IS COMMITTED. THERE IS NO SUCH THING AS A PARTIAL WAR.'
+
+/** The five canonical lines, in manifest order. Tests assert each appears
+ *  verbatim in the catalog. */
+export const TONE_REFERENCE_LINES: readonly string[] = [
+  TONE_GREETING,
+  TONE_IDLE,
+  TONE_RECOGNITION,
+  TONE_RECOVERY,
+  TONE_FAILURE,
+]
+
+// ── The catalog ─────────────────────────────────────────────────────────
+// Grouped by purpose for reading; the selector treats it as a flat array.
+
+export const JOSHUA_LINES: readonly JoshuaLine[] = [
+  // Greetings. The initial greeting carries verbatim tone line 1.
+  {
+    id: 'greeting.boot',
+    text: TONE_GREETING,
+    eventKey: 'campaign.greeting',
+    voiceClipId: 'vo-greeting-boot',
+    pauseBeforeMs: 0,
+  },
+  {
+    id: 'greeting.return',
+    text: 'HELLO AGAIN PROFESSOR. THE BOARD IS AS YOU LEFT IT.',
+    eventKey: 'campaign.greeting',
+    voiceClipId: 'vo-greeting-return',
+    pauseBeforeMs: 400,
+  },
+
+  // Idle / waiting beats. One carries verbatim tone line 2.
+  {
+    id: 'idle.waiting',
+    text: TONE_IDLE,
+    eventKey: 'campaign.idle',
+    voiceClipId: 'vo-idle-waiting',
+    pauseBeforeMs: 1200,
+  },
+  {
+    id: 'idle.patience',
+    text: 'TAKE YOUR TIME. THE MACHINE DOES NOT TIRE.',
+    eventKey: 'campaign.idle',
+    voiceClipId: 'vo-idle-patience',
+    pauseBeforeMs: 1200,
+  },
+
+  // Per-mission first-discrepancy beats. The first time Joshua notices
+  // something is wrong in each subsystem mission.
+  {
+    id: 'mission.outlook.first-discrepancy',
+    text: 'THAT BULLETIN CONTRADICTS ITS OWN SOURCE. SOMETHING HERE IS NOT WHAT IT CLAIMS.',
+    eventKey: 'mission.outlook.first-discrepancy',
+    voiceClipId: 'vo-outlook-first-discrepancy',
+    pauseBeforeMs: 600,
+  },
+  {
+    id: 'mission.flights.first-discrepancy',
+    text: 'TWO ARRIVALS WANT THE SAME SKY AT THE SAME MINUTE. THE SCHEDULE IS LYING.',
+    eventKey: 'mission.flights.first-discrepancy',
+    voiceClipId: 'vo-flights-first-discrepancy',
+    pauseBeforeMs: 600,
+  },
+  {
+    id: 'mission.bank.first-discrepancy',
+    text: 'THE LEDGER BALANCES AND STILL IT IS WRONG. A HOLD IS HIDING INSIDE THE TOTAL.',
+    eventKey: 'mission.bank.first-discrepancy',
+    voiceClipId: 'vo-bank-first-discrepancy',
+    pauseBeforeMs: 600,
+  },
+
+  // Deadline warnings. End-anchored 30s and 10s, plus the final-phase alarm.
+  {
+    id: 'deadline.warning.30s',
+    text: 'THIRTY SECONDS. DECIDE OR THE MACHINE DECIDES FOR YOU.',
+    eventKey: 'deadline.warning.30s',
+    voiceClipId: 'vo-deadline-30s',
+    pauseBeforeMs: 0,
+  },
+  {
+    id: 'deadline.warning.10s',
+    text: 'TEN SECONDS. THE WINDOW IS CLOSING.',
+    eventKey: 'deadline.warning.10s',
+    voiceClipId: 'vo-deadline-10s',
+    pauseBeforeMs: 0,
+  },
+  {
+    id: 'deadline.final-phase',
+    text: 'FINAL PHASE. EVERY UNANSWERED EXCEPTION IS NOW AN OUTCOME.',
+    eventKey: 'deadline.final-phase',
+    voiceClipId: 'vo-deadline-final-phase',
+    pauseBeforeMs: 0,
+  },
+
+  // Finale validator rejections. One line per reason code the finale can
+  // emit. The manifest below proves every code is covered.
+  {
+    id: 'finale.reject.receipt-order',
+    text: 'YOU ORDERED THEM BY WHEN THEY ARRIVED, NOT BY WHEN THEY HAPPENED. TIME OF RECEIPT IS NOT TIME OF EVENT.',
+    eventKey: 'finale.reject.receipt-order',
+    voiceClipId: 'vo-reject-receipt-order',
+    pauseBeforeMs: 300,
+  },
+  {
+    id: 'finale.reject.unrelated-source',
+    text: 'THE SOURCE CHECKS OUT AND STILL IT DOES NOT BELONG. THAT RECORD IS A STRANGER TO THIS CHAIN.',
+    eventKey: 'finale.reject.unrelated-source',
+    voiceClipId: 'vo-reject-unrelated-source',
+    pauseBeforeMs: 300,
+  },
+  {
+    id: 'finale.reject.derived-not-independent',
+    text: 'IT AGREES BECAUSE IT CAME FROM THE SAME RUN. A COPY OF A WITNESS IS NOT A SECOND WITNESS.',
+    eventKey: 'finale.reject.derived-not-independent',
+    voiceClipId: 'vo-reject-derived-not-independent',
+    pauseBeforeMs: 300,
+  },
+  {
+    id: 'finale.reject.wrong-root',
+    text: 'THAT IS NOT THE ROOT. YOU ANCHORED THE CASE TO A BRANCH, NOT THE TRUNK.',
+    eventKey: 'finale.reject.wrong-root',
+    voiceClipId: 'vo-reject-wrong-root',
+    pauseBeforeMs: 300,
+  },
+  {
+    id: 'finale.reject.incomplete',
+    text: 'A SLOT IS STILL EMPTY. I CANNOT CERTIFY A CASE WITH A HOLE IN IT.',
+    eventKey: 'finale.reject.incomplete',
+    voiceClipId: 'vo-reject-incomplete',
+    pauseBeforeMs: 300,
+  },
+
+  // Recognition beat. Keyed on the finale caseValid false-to-true
+  // transition. Carries verbatim tone line 3.
+  {
+    id: 'finale.recognition',
+    text: TONE_RECOGNITION,
+    eventKey: 'finale.recognition',
+    voiceClipId: 'vo-recognition',
+    pauseBeforeMs: 800,
+  },
+
+  // The three ending readbacks, keyed by endingId. Recovery carries
+  // verbatim tone line 4; failure carries verbatim tone line 5.
+  {
+    id: 'finale.ending.recovery',
+    text: TONE_RECOVERY,
+    eventKey: 'finale.ending.recovery',
+    voiceClipId: 'vo-ending-recovery',
+    pauseBeforeMs: 1000,
+  },
+  {
+    id: 'finale.ending.containment',
+    text: 'HELD AND VERIFIED. THE DRILL STAYED A DRILL. THAT IS THE WHOLE VICTORY.',
+    eventKey: 'finale.ending.containment',
+    voiceClipId: 'vo-ending-containment',
+    pauseBeforeMs: 1000,
+  },
+  {
+    id: 'finale.ending.failure',
+    text: TONE_FAILURE,
+    eventKey: 'finale.ending.failure',
+    voiceClipId: 'vo-ending-failure',
+    pauseBeforeMs: 1000,
+  },
+]
+
+// ── Required-line manifest ───────────────────────────────────────────────
+// The EXPLICIT coverage contract. Not the whole EngineEvent union: this
+// list, and only this list, is what the catalog must cover. Each entry is
+// an eventKey (fully qualified, including parameterized ending variants) the
+// catalog must resolve at least one line for. validateRequiredLines proves
+// completeness and names any gap, so CI fails loudly if a required line or
+// reason-code variant is dropped.
+
+export interface RequiredLineManifestEntry {
+  /** The eventKey a line must exist for. */
+  readonly key: string
+  /** Human note on why the key is required (documentation only). */
+  readonly reason: string
+}
+
+export const REQUIRED_LINE_MANIFEST: readonly RequiredLineManifestEntry[] = [
+  // Every validator rejection reason code the finale can emit.
+  { key: 'finale.reject.receipt-order', reason: 'validator reason code' },
+  { key: 'finale.reject.unrelated-source', reason: 'validator reason code' },
+  {
+    key: 'finale.reject.derived-not-independent',
+    reason: 'validator reason code',
+  },
+  { key: 'finale.reject.wrong-root', reason: 'validator reason code' },
+  { key: 'finale.reject.incomplete', reason: 'validator reason code' },
+  // The three ending readbacks, by endingId.
+  { key: 'finale.ending.recovery', reason: 'ending readback' },
+  { key: 'finale.ending.containment', reason: 'ending readback' },
+  { key: 'finale.ending.failure', reason: 'ending readback' },
+  // The recognition beat.
+  { key: 'finale.recognition', reason: 'recognition beat' },
+  // The named per-mission first-discrepancy beats.
+  {
+    key: 'mission.outlook.first-discrepancy',
+    reason: 'per-mission first-discrepancy',
+  },
+  {
+    key: 'mission.flights.first-discrepancy',
+    reason: 'per-mission first-discrepancy',
+  },
+  {
+    key: 'mission.bank.first-discrepancy',
+    reason: 'per-mission first-discrepancy',
+  },
+  // Deadline warnings.
+  { key: 'deadline.warning.30s', reason: 'deadline warning' },
+  { key: 'deadline.warning.10s', reason: 'deadline warning' },
+  { key: 'deadline.final-phase', reason: 'final-phase alarm' },
+]
+
+/** The result of a required-line coverage check. */
+export interface RequiredLineValidation {
+  /** True when every manifest key resolves at least one catalog line. */
+  readonly ok: boolean
+  /** The manifest keys with no covering line. Empty when ok. */
+  readonly missing: readonly string[]
+}
+
+/**
+ * Pure manifest validator. Fails (ok=false) and names every manifest key the
+ * catalog does not cover. Takes the catalog and manifest as arguments so it
+ * is trivially testable with stripped inputs; neither argument is mutated.
+ * This is the CI gate that proves completeness.
+ */
+export function validateRequiredLines(
+  catalog: readonly JoshuaLine[],
+  manifest: readonly RequiredLineManifestEntry[],
+): RequiredLineValidation {
+  const covered = new Set(catalog.map((line) => line.eventKey))
+  const missing = manifest
+    .map((entry) => entry.key)
+    .filter((key) => !covered.has(key))
+  return { ok: missing.length === 0, missing }
+}
diff --git a/src/engine/joshua/selectors.ts b/src/engine/joshua/selectors.ts
new file mode 100644
index 0000000..92f4d0c
--- /dev/null
+++ b/src/engine/joshua/selectors.ts
@@ -0,0 +1,59 @@
+// Pure selectors over the Joshua line catalog. No engine state, no Date.now,
+// no Math.random, no DOM, no logging. Graceful absence is the critical
+// semantic: a key the catalog does not cover resolves to [] / null and the
+// selector stays silent. The caller renders nothing and logs nothing.
+import { JOSHUA_LINES, type JoshuaLine } from './lines'
+
+/**
+ * The minimal slice of finale state the selector needs to disambiguate
+ * state-keyed lines. Deliberately NOT FinaleState from section-01: a narrow
+ * local structural type keeps this file dependency-free and parallelizable.
+ *   - endingId refines the ending readback.
+ *   - recognized signals the finale caseValid false-to-true transition.
+ */
+export interface FinaleStateRefinement {
+  readonly endingId?: 'recovery' | 'containment' | 'failure'
+  readonly recognized?: boolean
+}
+
+/** The bare state key the ending readbacks hang under. selectLine refines it
+ *  to a fully-qualified finale.ending.<endingId> key via the refinement. */
+const ENDING_KEY = 'finale.ending'
+
+/**
+ * Resolve every line authored for an event key. Returns a fresh array so a
+ * caller mutating it cannot reach the catalog. Returns [] when the catalog
+ * does not cover the key (graceful absence): the caller renders nothing.
+ */
+export function selectLinesForKey(eventKey: string): JoshuaLine[] {
+  return JOSHUA_LINES.filter((line) => line.eventKey === eventKey)
+}
+
+/**
+ * Resolve a single line for a key, refined by finale state where the key is
+ * a finale state key. Returns null when the catalog has no matching line
+ * (graceful absence). Never throws, never logs.
+ *
+ * Refinement rules:
+ *   - The bare ending key (`finale.ending`) requires an endingId; it refines
+ *     to `finale.ending.<endingId>`. Without one, or with an unknown one, it
+ *     returns null rather than guessing.
+ *   - A fully-qualified key (including `finale.ending.recovery` and
+ *     `finale.recognition`) resolves directly; the refinement is optional.
+ */
+export function selectLine(
+  eventKey: string,
+  finale?: FinaleStateRefinement,
+): JoshuaLine | null {
+  const resolvedKey =
+    eventKey === ENDING_KEY
+      ? finale?.endingId
+        ? `${ENDING_KEY}.${finale.endingId}`
+        : null
+      : eventKey
+
+  if (resolvedKey === null) return null
+
+  const matches = selectLinesForKey(resolvedKey)
+  return matches[0] ?? null
+}
diff --git a/test/engine/joshua/lines.test.ts b/test/engine/joshua/lines.test.ts
new file mode 100644
index 0000000..76e7451
--- /dev/null
+++ b/test/engine/joshua/lines.test.ts
@@ -0,0 +1,180 @@
+// TDD block 7: the authored JOSHUA/WOPR line catalog. These tests are the
+// coverage contract. The required-line manifest (not the whole EngineEvent
+// union) is what must resolve; the five verbatim tone-reference lines must
+// appear exactly as authored; content rules (no em-dash, integer pauses,
+// unique ids, single text field) are hard invariants.
+import { describe, expect, it } from 'vitest'
+import {
+  JOSHUA_LINES,
+  REQUIRED_LINE_MANIFEST,
+  TONE_REFERENCE_LINES,
+  validateRequiredLines,
+  type JoshuaLine,
+} from '@engine/joshua/lines'
+import { selectLinesForKey } from '@engine/joshua/selectors'
+
+const EM_DASH = '—'
+
+describe('joshua catalog shape', () => {
+  it('every line carries the five contract fields and nothing masquerading as a caption', () => {
+    for (const line of JOSHUA_LINES) {
+      expect(typeof line.id).toBe('string')
+      expect(line.id.length).toBeGreaterThan(0)
+      expect(typeof line.text).toBe('string')
+      expect(line.text.length).toBeGreaterThan(0)
+      expect(typeof line.eventKey).toBe('string')
+      expect(line.eventKey.length).toBeGreaterThan(0)
+      expect(typeof line.voiceClipId).toBe('string')
+      expect(line.voiceClipId.length).toBeGreaterThan(0)
+      expect(typeof line.pauseBeforeMs).toBe('number')
+      // Caption equals display: there is exactly one text field. Assert no
+      // separate caption-ish field diverges from it.
+      const keys = Object.keys(line).sort()
+      expect(keys).toEqual(
+        ['eventKey', 'id', 'pauseBeforeMs', 'text', 'voiceClipId'].sort(),
+      )
+      expect('caption' in line).toBe(false)
+    }
+  })
+
+  it('every pauseBeforeMs is a non-negative integer', () => {
+    for (const line of JOSHUA_LINES) {
+      expect(Number.isInteger(line.pauseBeforeMs)).toBe(true)
+      expect(line.pauseBeforeMs).toBeGreaterThanOrEqual(0)
+    }
+  })
+
+  it('every id is unique across the catalog', () => {
+    const ids = JOSHUA_LINES.map((l) => l.id)
+    expect(new Set(ids).size).toBe(ids.length)
+  })
+
+  it('is JSON-safe (round-trips through JSON without loss)', () => {
+    const roundTripped = JSON.parse(JSON.stringify(JOSHUA_LINES)) as JoshuaLine[]
+    expect(roundTripped).toEqual(JOSHUA_LINES)
+  })
+})
+
+describe('content rules', () => {
+  it('no line text contains an em-dash', () => {
+    for (const line of JOSHUA_LINES) {
+      expect(line.text.includes(EM_DASH)).toBe(false)
+    }
+  })
+
+  it('no tone-reference line contains an em-dash', () => {
+    for (const line of TONE_REFERENCE_LINES) {
+      expect(line.includes(EM_DASH)).toBe(false)
+    }
+  })
+})
+
+describe('the five verbatim tone-reference lines', () => {
+  it('names exactly five canonical lines', () => {
+    expect(TONE_REFERENCE_LINES).toHaveLength(5)
+  })
+
+  it('each canonical line appears in the catalog verbatim', () => {
+    const texts = new Set(JOSHUA_LINES.map((l) => l.text))
+    for (const canonical of TONE_REFERENCE_LINES) {
+      expect(texts.has(canonical)).toBe(true)
+    }
+  })
+})
+
+describe('required-line manifest coverage', () => {
+  it('declares the manifest entries the plan pins', () => {
+    const keys = REQUIRED_LINE_MANIFEST.map((e) => e.key)
+    // Validator rejection reason codes.
+    expect(keys).toContain('finale.reject.receipt-order')
+    expect(keys).toContain('finale.reject.unrelated-source')
+    expect(keys).toContain('finale.reject.derived-not-independent')
+    expect(keys).toContain('finale.reject.wrong-root')
+    expect(keys).toContain('finale.reject.incomplete')
+    // Ending readbacks.
+    expect(keys).toContain('finale.ending.recovery')
+    expect(keys).toContain('finale.ending.containment')
+    expect(keys).toContain('finale.ending.failure')
+    // Recognition beat.
+    expect(keys).toContain('finale.recognition')
+    // Per-mission first-discrepancy beats.
+    expect(keys).toContain('mission.outlook.first-discrepancy')
+    expect(keys).toContain('mission.flights.first-discrepancy')
+    expect(keys).toContain('mission.bank.first-discrepancy')
+    // Deadline warnings.
+    expect(keys).toContain('deadline.warning.30s')
+    expect(keys).toContain('deadline.warning.10s')
+    expect(keys).toContain('deadline.final-phase')
+  })
+
+  it('covers every validator reason code', () => {
+    for (const code of [
+      'receipt-order',
+      'unrelated-source',
+      'derived-not-independent',
+      'wrong-root',
+      'incomplete',
+    ]) {
+      const matches = selectLinesForKey(`finale.reject.${code}`)
+      expect(matches.length).toBeGreaterThanOrEqual(1)
+    }
+  })
+
+  it('covers every ending readback', () => {
+    for (const ending of ['recovery', 'containment', 'failure']) {
+      const matches = selectLinesForKey(`finale.ending.${ending}`)
+      expect(matches.length).toBeGreaterThanOrEqual(1)
+    }
+  })
+
+  it('covers the recognition beat', () => {
+    expect(selectLinesForKey('finale.recognition').length).toBeGreaterThanOrEqual(1)
+  })
+
+  it('covers each named per-mission first-discrepancy beat', () => {
+    for (const mission of ['outlook', 'flights', 'bank']) {
+      const matches = selectLinesForKey(`mission.${mission}.first-discrepancy`)
+      expect(matches.length).toBeGreaterThanOrEqual(1)
+    }
+  })
+
+  it('covers the deadline warnings', () => {
+    expect(selectLinesForKey('deadline.warning.30s').length).toBeGreaterThanOrEqual(1)
+    expect(selectLinesForKey('deadline.warning.10s').length).toBeGreaterThanOrEqual(1)
+    expect(selectLinesForKey('deadline.final-phase').length).toBeGreaterThanOrEqual(1)
+  })
+})
+
+describe('validateRequiredLines (pure manifest validator, CI gate)', () => {
+  it('reports complete coverage for the shipped catalog', () => {
+    const result = validateRequiredLines(JOSHUA_LINES, REQUIRED_LINE_MANIFEST)
+    expect(result.ok).toBe(true)
+    expect(result.missing).toEqual([])
+  })
+
+  it('fails and names the missing key when a required line is absent', () => {
+    const stripped = JOSHUA_LINES.filter(
+      (l) => l.eventKey !== 'finale.reject.wrong-root',
+    )
+    const result = validateRequiredLines(stripped, REQUIRED_LINE_MANIFEST)
+    expect(result.ok).toBe(false)
+    expect(result.missing).toContain('finale.reject.wrong-root')
+  })
+
+  it('fails when a parameterized ending variant is absent', () => {
+    const stripped = JOSHUA_LINES.filter(
+      (l) => l.eventKey !== 'finale.ending.containment',
+    )
+    const result = validateRequiredLines(stripped, REQUIRED_LINE_MANIFEST)
+    expect(result.ok).toBe(false)
+    expect(result.missing).toContain('finale.ending.containment')
+  })
+
+  it('is pure: calling it does not mutate the catalog or manifest', () => {
+    const catalogSnapshot = JSON.parse(JSON.stringify(JOSHUA_LINES))
+    const manifestSnapshot = JSON.parse(JSON.stringify(REQUIRED_LINE_MANIFEST))
+    validateRequiredLines(JOSHUA_LINES, REQUIRED_LINE_MANIFEST)
+    expect(JOSHUA_LINES).toEqual(catalogSnapshot)
+    expect(REQUIRED_LINE_MANIFEST).toEqual(manifestSnapshot)
+  })
+})
diff --git a/test/engine/joshua/selectors.test.ts b/test/engine/joshua/selectors.test.ts
new file mode 100644
index 0000000..e15ce68
--- /dev/null
+++ b/test/engine/joshua/selectors.test.ts
@@ -0,0 +1,118 @@
+// TDD block 7: selectors with finale-state refinement and graceful absence.
+// The selectors are pure functions over the catalog array. Absence is
+// silent: no throw, no console output, [] / null returned.
+import { afterEach, describe, expect, it, vi } from 'vitest'
+import { JOSHUA_LINES } from '@engine/joshua/lines'
+import {
+  selectLine,
+  selectLinesForKey,
+  type FinaleStateRefinement,
+} from '@engine/joshua/selectors'
+
+afterEach(() => {
+  vi.restoreAllMocks()
+})
+
+describe('selectLinesForKey', () => {
+  it('returns the lines authored for a covered key', () => {
+    const lines = selectLinesForKey('finale.reject.receipt-order')
+    expect(lines.length).toBeGreaterThanOrEqual(1)
+    for (const line of lines) {
+      expect(line.eventKey).toBe('finale.reject.receipt-order')
+    }
+  })
+
+  it('returns a fresh array the caller cannot use to mutate the catalog', () => {
+    const lines = selectLinesForKey('finale.reject.receipt-order')
+    const before = JOSHUA_LINES.length
+    lines.length = 0
+    expect(selectLinesForKey('finale.reject.receipt-order').length).toBeGreaterThanOrEqual(1)
+    expect(JOSHUA_LINES.length).toBe(before)
+  })
+
+  it('graceful absence: returns [] for an uncovered key', () => {
+    expect(selectLinesForKey('no.such.key')).toEqual([])
+  })
+
+  it('graceful absence: does not throw on an empty or odd key', () => {
+    expect(() => selectLinesForKey('')).not.toThrow()
+    expect(selectLinesForKey('')).toEqual([])
+  })
+
+  it('graceful absence: logs nothing for an uncovered key', () => {
+    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
+    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
+    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
+    selectLinesForKey('no.such.key')
+    expect(log).not.toHaveBeenCalled()
+    expect(warn).not.toHaveBeenCalled()
+    expect(error).not.toHaveBeenCalled()
+  })
+})
+
+describe('selectLine', () => {
+  it('returns a single line for a covered non-parameterized key', () => {
+    const line = selectLine('mission.outlook.first-discrepancy')
+    expect(line).not.toBeNull()
+    expect(line?.eventKey).toBe('mission.outlook.first-discrepancy')
+  })
+
+  it('graceful absence: returns null for an uncovered key and logs nothing', () => {
+    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
+    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
+    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
+    expect(selectLine('no.such.key')).toBeNull()
+    expect(log).not.toHaveBeenCalled()
+    expect(warn).not.toHaveBeenCalled()
+    expect(error).not.toHaveBeenCalled()
+  })
+
+  it('does not throw for a missing key', () => {
+    expect(() => selectLine('no.such.key')).not.toThrow()
+  })
+})
+
+describe('finale-state refinement', () => {
+  it('refines ending readbacks by endingId', () => {
+    const recovery = selectLine('finale.ending', { endingId: 'recovery' })
+    const containment = selectLine('finale.ending', { endingId: 'containment' })
+    const failure = selectLine('finale.ending', { endingId: 'failure' })
+    expect(recovery?.eventKey).toBe('finale.ending.recovery')
+    expect(containment?.eventKey).toBe('finale.ending.containment')
+    expect(failure?.eventKey).toBe('finale.ending.failure')
+    expect(recovery?.id).not.toBe(failure?.id)
+  })
+
+  it('also resolves the fully-qualified ending key directly', () => {
+    expect(selectLine('finale.ending.recovery')?.eventKey).toBe(
+      'finale.ending.recovery',
+    )
+  })
+
+  it('returns null for the bare ending key without an endingId (graceful absence)', () => {
+    expect(selectLine('finale.ending')).toBeNull()
+  })
+
+  it('returns null for an unknown endingId (graceful absence, no throw)', () => {
+    const refinement = { endingId: 'nonsense' } as unknown as FinaleStateRefinement
+    expect(selectLine('finale.ending', refinement)).toBeNull()
+  })
+
+  it('resolves the recognition line when the refinement signals recognition', () => {
+    const line = selectLine('finale.recognition', { recognized: true })
+    expect(line).not.toBeNull()
+    expect(line?.eventKey).toBe('finale.recognition')
+  })
+
+  it('resolves the recognition line even without a refinement (caller gates the transition)', () => {
+    expect(selectLine('finale.recognition')?.eventKey).toBe('finale.recognition')
+  })
+})
+
+describe('determinism', () => {
+  it('returns the same result across repeated calls', () => {
+    const a = selectLine('finale.ending', { endingId: 'failure' })
+    const b = selectLine('finale.ending', { endingId: 'failure' })
+    expect(a).toEqual(b)
+  })
+})
