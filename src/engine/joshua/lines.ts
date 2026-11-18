// The authored JOSHUA / WOPR line catalog for the whole SHALL WE PLAY A
// GAME? campaign. This is the ONE place authored voice-over copy is allowed
// to live. It is pure data: no engine state, no Date.now, no Math.random,
// no DOM. Split 07 records audio against the stable `id` of each line, so
// ids are permanent once published. `text` is the single string used for
// display, caption, and announcer alike; there is no separate caption field.
//
// The shell renders a line ONLY when a selector resolves a key for it
// (see selectors.ts). A key the catalog does not cover renders nothing and
// logs nothing (graceful absence). The required-line manifest below is the
// coverage contract, proven complete by validateRequiredLines in CI.

/** One authored Joshua line. JSON-safe. */
export interface JoshuaLine {
  /** Stable, globally unique id. Audio records against this; permanent. */
  readonly id: string
  /** Display AND caption AND announcer text. The only copy string. */
  readonly text: string
  /** The EngineEvent kind string or finale STATE key the shell looks up. */
  readonly eventKey: string
  /** Audio clip id consumed by split 07. */
  readonly voiceClipId: string
  /** Integer pause honored before the line renders. */
  readonly pauseBeforeMs: number
}

// ── The five verbatim tone-reference lines ──────────────────────────────
// The project requirements pin five canonical Joshua lines that set his
// WarGames register. They must appear VERBATIM somewhere in the catalog,
// one at each of: initial greeting, an idle/waiting beat, the recognition
// beat, the recovery ending, and the failure ending. Treat these as fixed
// strings. No em-dash. These constants are the single source of truth: the
// catalog entries below reuse them by reference so they cannot drift.

export const TONE_GREETING = 'GREETINGS PROFESSOR. SHALL WE PLAY A GAME?'
export const TONE_IDLE = 'I AM WAITING. THE ONLY WINNING MOVE IS TO LOOK.'
export const TONE_RECOGNITION =
  'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.'
export const TONE_RECOVERY = 'WHAT A CLEAN GAME. HOW ABOUT A NICE GAME OF CHESS?'
export const TONE_FAILURE =
  'THE SYSTEM IS COMMITTED. THERE IS NO SUCH THING AS A PARTIAL WAR.'

/** The five canonical lines, in manifest order. Tests assert each appears
 *  verbatim in the catalog. */
export const TONE_REFERENCE_LINES: readonly string[] = [
  TONE_GREETING,
  TONE_IDLE,
  TONE_RECOGNITION,
  TONE_RECOVERY,
  TONE_FAILURE,
]

// ── The catalog ─────────────────────────────────────────────────────────
// Grouped by purpose for reading; the selector treats it as a flat array.

export const JOSHUA_LINES: readonly JoshuaLine[] = [
  // Greetings. The initial greeting carries verbatim tone line 1.
  {
    id: 'greeting.boot',
    text: TONE_GREETING,
    eventKey: 'campaign.greeting',
    voiceClipId: 'vo-greeting-boot',
    pauseBeforeMs: 0,
  },
  {
    id: 'greeting.return',
    text: 'HELLO AGAIN PROFESSOR. THE BOARD IS AS YOU LEFT IT.',
    eventKey: 'campaign.greeting',
    voiceClipId: 'vo-greeting-return',
    pauseBeforeMs: 400,
  },

  // Idle / waiting beats. One carries verbatim tone line 2.
  {
    id: 'idle.waiting',
    text: TONE_IDLE,
    eventKey: 'campaign.idle',
    voiceClipId: 'vo-idle-waiting',
    pauseBeforeMs: 1200,
  },
  {
    id: 'idle.patience',
    text: 'TAKE YOUR TIME. THE MACHINE DOES NOT TIRE.',
    eventKey: 'campaign.idle',
    voiceClipId: 'vo-idle-patience',
    pauseBeforeMs: 1200,
  },

  // Per-mission first-discrepancy beats. The first time Joshua notices
  // something is wrong in each subsystem mission.
  {
    id: 'mission.outlook.first-discrepancy',
    text: 'THAT BULLETIN CONTRADICTS ITS OWN SOURCE. SOMETHING HERE IS NOT WHAT IT CLAIMS.',
    eventKey: 'mission.outlook.first-discrepancy',
    voiceClipId: 'vo-outlook-first-discrepancy',
    pauseBeforeMs: 600,
  },
  {
    id: 'mission.flights.first-discrepancy',
    text: 'TWO ARRIVALS WANT THE SAME SKY AT THE SAME MINUTE. THE SCHEDULE IS LYING.',
    eventKey: 'mission.flights.first-discrepancy',
    voiceClipId: 'vo-flights-first-discrepancy',
    pauseBeforeMs: 600,
  },
  {
    id: 'mission.bank.first-discrepancy',
    text: 'THE LEDGER BALANCES AND STILL IT IS WRONG. A HOLD IS HIDING INSIDE THE TOTAL.',
    eventKey: 'mission.bank.first-discrepancy',
    voiceClipId: 'vo-bank-first-discrepancy',
    pauseBeforeMs: 600,
  },

  // Deadline warnings. End-anchored 30s and 10s, plus the final-phase alarm.
  {
    id: 'deadline.warning.30s',
    text: 'THIRTY SECONDS. DECIDE OR THE MACHINE DECIDES FOR YOU.',
    eventKey: 'deadline.warning.30s',
    voiceClipId: 'vo-deadline-30s',
    pauseBeforeMs: 0,
  },
  {
    id: 'deadline.warning.10s',
    text: 'TEN SECONDS. THE WINDOW IS CLOSING.',
    eventKey: 'deadline.warning.10s',
    voiceClipId: 'vo-deadline-10s',
    pauseBeforeMs: 0,
  },
  {
    id: 'deadline.final-phase',
    text: 'FINAL PHASE. EVERY UNANSWERED EXCEPTION IS NOW AN OUTCOME.',
    eventKey: 'deadline.final-phase',
    voiceClipId: 'vo-deadline-final-phase',
    pauseBeforeMs: 0,
  },

  // Finale validator rejections. One line per reason code the finale can
  // emit. The manifest below proves every code is covered.
  {
    id: 'finale.reject.receipt-order',
    text: 'YOU ORDERED THEM BY WHEN THEY ARRIVED, NOT BY WHEN THEY HAPPENED. TIME OF RECEIPT IS NOT TIME OF EVENT.',
    eventKey: 'finale.reject.receipt-order',
    voiceClipId: 'vo-reject-receipt-order',
    pauseBeforeMs: 300,
  },
  {
    id: 'finale.reject.unrelated-source',
    text: 'THE SOURCE CHECKS OUT AND STILL IT DOES NOT BELONG. THAT RECORD IS A STRANGER TO THIS CHAIN.',
    eventKey: 'finale.reject.unrelated-source',
    voiceClipId: 'vo-reject-unrelated-source',
    pauseBeforeMs: 300,
  },
  {
    id: 'finale.reject.derived-not-independent',
    text: 'IT AGREES BECAUSE IT CAME FROM THE SAME RUN. A COPY OF A WITNESS IS NOT A SECOND WITNESS.',
    eventKey: 'finale.reject.derived-not-independent',
    voiceClipId: 'vo-reject-derived-not-independent',
    pauseBeforeMs: 300,
  },
  {
    id: 'finale.reject.wrong-root',
    text: 'THAT IS NOT THE ROOT. YOU ANCHORED THE CASE TO A BRANCH, NOT THE TRUNK.',
    eventKey: 'finale.reject.wrong-root',
    voiceClipId: 'vo-reject-wrong-root',
    pauseBeforeMs: 300,
  },
  {
    id: 'finale.reject.incomplete',
    text: 'A SLOT IS STILL EMPTY. I CANNOT CERTIFY A CASE WITH A HOLE IN IT.',
    eventKey: 'finale.reject.incomplete',
    voiceClipId: 'vo-reject-incomplete',
    pauseBeforeMs: 300,
  },

  // Recognition beat. Keyed on the finale caseValid false-to-true
  // transition. Carries verbatim tone line 3.
  {
    id: 'finale.recognition',
    text: TONE_RECOGNITION,
    eventKey: 'finale.recognition',
    voiceClipId: 'vo-recognition',
    pauseBeforeMs: 800,
  },

  // The three ending readbacks, keyed by endingId. Recovery carries
  // verbatim tone line 4; failure carries verbatim tone line 5.
  {
    id: 'finale.ending.recovery',
    text: TONE_RECOVERY,
    eventKey: 'finale.ending.recovery',
    voiceClipId: 'vo-ending-recovery',
    pauseBeforeMs: 1000,
  },
  {
    id: 'finale.ending.containment',
    text: 'HELD AND VERIFIED. THE DRILL STAYED A DRILL. THAT IS THE WHOLE VICTORY.',
    eventKey: 'finale.ending.containment',
    voiceClipId: 'vo-ending-containment',
    pauseBeforeMs: 1000,
  },
  {
    id: 'finale.ending.failure',
    text: TONE_FAILURE,
    eventKey: 'finale.ending.failure',
    voiceClipId: 'vo-ending-failure',
    pauseBeforeMs: 1000,
  },
]

// ── Required-line manifest ───────────────────────────────────────────────
// The EXPLICIT coverage contract. Not the whole EngineEvent union: this
// list, and only this list, is what the catalog must cover. Each entry is
// an eventKey (fully qualified, including parameterized ending variants) the
// catalog must resolve at least one line for. validateRequiredLines proves
// completeness and names any gap, so CI fails loudly if a required line or
// reason-code variant is dropped.

export interface RequiredLineManifestEntry {
  /** The eventKey a line must exist for. */
  readonly key: string
  /** Human note on why the key is required (documentation only). */
  readonly reason: string
}

export const REQUIRED_LINE_MANIFEST: readonly RequiredLineManifestEntry[] = [
  // Every validator rejection reason code the finale can emit.
  { key: 'finale.reject.receipt-order', reason: 'validator reason code' },
  { key: 'finale.reject.unrelated-source', reason: 'validator reason code' },
  {
    key: 'finale.reject.derived-not-independent',
    reason: 'validator reason code',
  },
  { key: 'finale.reject.wrong-root', reason: 'validator reason code' },
  { key: 'finale.reject.incomplete', reason: 'validator reason code' },
  // The three ending readbacks, by endingId.
  { key: 'finale.ending.recovery', reason: 'ending readback' },
  { key: 'finale.ending.containment', reason: 'ending readback' },
  { key: 'finale.ending.failure', reason: 'ending readback' },
  // The recognition beat.
  { key: 'finale.recognition', reason: 'recognition beat' },
  // The named per-mission first-discrepancy beats.
  {
    key: 'mission.outlook.first-discrepancy',
    reason: 'per-mission first-discrepancy',
  },
  {
    key: 'mission.flights.first-discrepancy',
    reason: 'per-mission first-discrepancy',
  },
  {
    key: 'mission.bank.first-discrepancy',
    reason: 'per-mission first-discrepancy',
  },
  // Deadline warnings.
  { key: 'deadline.warning.30s', reason: 'deadline warning' },
  { key: 'deadline.warning.10s', reason: 'deadline warning' },
  { key: 'deadline.final-phase', reason: 'final-phase alarm' },
]

/** The result of a required-line coverage check. */
export interface RequiredLineValidation {
  /** True when every manifest key resolves at least one catalog line. */
  readonly ok: boolean
  /** The manifest keys with no covering line. Empty when ok. */
  readonly missing: readonly string[]
}

/**
 * Pure manifest validator. Fails (ok=false) and names every manifest key the
 * catalog does not cover. Takes the catalog and manifest as arguments so it
 * is trivially testable with stripped inputs; neither argument is mutated.
 * This is the CI gate that proves completeness.
 */
export function validateRequiredLines(
  catalog: readonly JoshuaLine[],
  manifest: readonly RequiredLineManifestEntry[],
): RequiredLineValidation {
  const covered = new Set(catalog.map((line) => line.eventKey))
  const missing = manifest
    .map((entry) => entry.key)
    .filter((key) => !covered.has(key))
  return { ok: missing.length === 0, missing }
}
