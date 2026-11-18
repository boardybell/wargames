// Pure selectors over the Joshua line catalog. No engine state, no Date.now,
// no Math.random, no DOM, no logging. Graceful absence is the critical
// semantic: a key the catalog does not cover resolves to [] / null and the
// selector stays silent. The caller renders nothing and logs nothing.
import { JOSHUA_LINES, type JoshuaLine } from './lines'

/**
 * The minimal slice of finale state the selector needs to disambiguate
 * state-keyed lines. Deliberately NOT FinaleState from section-01: a narrow
 * local structural type keeps this file dependency-free and parallelizable.
 *   - endingId refines the ending readback.
 *   - recognized signals the finale caseValid false-to-true transition.
 */
export interface FinaleStateRefinement {
  readonly endingId?: 'recovery' | 'containment' | 'failure'
  readonly recognized?: boolean
}

/** The bare state key the ending readbacks hang under. selectLine refines it
 *  to a fully-qualified finale.ending.<endingId> key via the refinement. */
const ENDING_KEY = 'finale.ending'

/** The catalog eventKeys the finale's real emitted engine events map onto.
 *  Exported so section 04 binds against these constants instead of inventing
 *  its own key strings. Kept in lockstep with the catalog's deadline lines. */
export const DEADLINE_WARNING_30S_KEY = 'deadline.warning.30s'
export const DEADLINE_WARNING_10S_KEY = 'deadline.warning.10s'
export const DEADLINE_FINAL_PHASE_KEY = 'deadline.final-phase'

/**
 * The narrow structural view of a finale-emitted engine event eventKeyFor
 * reads. The finale schedules warnings with ids `warn-30` / `warn-10`
 * (kind `timerMilestone`) and a final-phase event with kind `finaleFinalPhase`.
 * Deliberately NOT the full EngineEvent type: a local shape keeps the catalog
 * dependency-free and parallelizable.
 */
export interface EngineEventRef {
  readonly id?: string
  readonly kind?: string
}

/**
 * Pure mapping from a finale-emitted engine event to the catalog eventKey the
 * shell looks up. The warnings are identified by their scheduled id and the
 * final phase by its event kind, matching the finale's real emission surface:
 *   - id `warn-30` -> the 30-second deadline-warning key
 *   - id `warn-10` -> the 10-second deadline-warning key
 *   - kind `finaleFinalPhase` -> the final-phase key
 * Returns null for any event this does not map (graceful: never throws, never
 * logs, never guesses). The per-mission `mission.<x>.first-discrepancy` beats
 * have NO engine event; section 04 selects them directly via selectLine with a
 * known key, so they are intentionally outside eventKeyFor yet still covered by
 * the completeness test.
 */
export function eventKeyFor(event: EngineEventRef): string | null {
  if (event.id === 'warn-30') return DEADLINE_WARNING_30S_KEY
  if (event.id === 'warn-10') return DEADLINE_WARNING_10S_KEY
  if (event.kind === 'finaleFinalPhase') return DEADLINE_FINAL_PHASE_KEY
  return null
}

/**
 * Resolve every line authored for an event key. Returns a fresh array so a
 * caller mutating it cannot reach the catalog. Returns [] when the catalog
 * does not cover the key (graceful absence): the caller renders nothing.
 */
export function selectLinesForKey(eventKey: string): JoshuaLine[] {
  return JOSHUA_LINES.filter((line) => line.eventKey === eventKey)
}

/**
 * Resolve a single line for a key, refined by finale state where the key is
 * a finale state key. Returns null when the catalog has no matching line
 * (graceful absence). Never throws, never logs.
 *
 * Refinement rules:
 *   - The bare ending key (`finale.ending`) requires an endingId; it refines
 *     to `finale.ending.<endingId>`. Without one, or with an unknown one, it
 *     returns null rather than guessing.
 *   - A fully-qualified key (including `finale.ending.recovery` and
 *     `finale.recognition`) resolves directly; the refinement is optional.
 */
export function selectLine(
  eventKey: string,
  finale?: FinaleStateRefinement,
): JoshuaLine | null {
  const resolvedKey =
    eventKey === ENDING_KEY
      ? finale?.endingId
        ? `${ENDING_KEY}.${finale.endingId}`
        : null
      : eventKey

  if (resolvedKey === null) return null

  const matches = selectLinesForKey(resolvedKey)
  return matches[0] ?? null
}
