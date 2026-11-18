// GLOBAL FAILSAFE finale endings (section 02, amendment 11). The real endingId
// derivation and the earned-why readback over settled metrics. Endings are
// selected by the committed ACTION, not by tier; tier remains the quality axis
// WITHIN an ending, never the selector of it.
//
//   STAGED RECOVERY commit  -> completed / recovery
//   HOLD AND VERIFY commit   -> completed / containment (names the unresolved)
//   REPEAT D-83 commit       -> collapsed / failure
//   timeout and forfeit      -> collapsed / failure (the repeated order)
//
// This module produces the STRUCTURED earned-why data the EndingScreen and the
// section-03 catalog selectors consume. The authored Joshua ending LINES live
// in section-03's catalog; keep the data layer and the line layer separate. No
// em-dashes in any authored string; every number is integer-derived.
import type { SettlementCause } from '../../campaign/types'
import type { BranchProjection } from '../../branch/types'
import type { CommitChoice } from './types'
import {
  metricFor,
  type FinaleCaseState,
  type FinaleSnapshot,
  type ViabilityResult,
} from './projections'

export type EndingId = 'recovery' | 'containment' | 'failure'

/** The inert shape section 01's settlement composed. Kept for the module's
 *  one-line wiring: staged -> recovery, hold -> containment, every collapsed
 *  path (repeat, timeout, forfeit) -> failure. resolveEnding is the full,
 *  cause-aware mapping; deriveEndingId is the committed-only shorthand the
 *  evaluate() path already calls. */
export function deriveEndingId(committed: CommitChoice | null): EndingId {
  if (committed === 'staged') return 'recovery'
  if (committed === 'hold') return 'containment'
  return 'failure'
}

/** Pure cause-plus-action mapping used by module.ts settlement. A committed
 *  staged or hold settles completed (recovery or containment); a committed
 *  repeat, and every timeout or forfeit (the repeated order), settles
 *  collapsed / failure. The exactly-once and synchronous commit guarantees
 *  live in section 01's terminal(); this is only the mapping it calls. */
export function resolveEnding(
  committed: CommitChoice | null,
  cause: SettlementCause,
): { endingId: EndingId; cause: 'completed' | 'collapsed' } {
  // A committed repeat is the repeated order: it collapses regardless of the
  // cause the engine hands in. Mapped first and unconditionally so the ending
  // is correct even if a committed repeat ever arrived with a non-collapsed
  // cause (robust, not coupled to terminal()'s cause classification).
  if (committed === 'repeat') return { endingId: 'failure', cause: 'collapsed' }
  if (cause === 'timeout' || cause === 'forfeit') {
    return { endingId: 'failure', cause: 'collapsed' }
  }
  if (committed === 'staged') return { endingId: 'recovery', cause: 'completed' }
  if (committed === 'hold') return { endingId: 'containment', cause: 'completed' }
  return { endingId: 'failure', cause: 'collapsed' }
}

/** Pure gating predicate for the STAGED commit control: enabled only when the
 *  case is valid AND the engine viability passes. The gating itself renders in
 *  section 04; here is the predicate it reads. */
export function stagedEligible(
  caseValid: boolean,
  viability: ViabilityResult,
): boolean {
  return caseValid && viability.pass
}

export interface EarnedWhy {
  /** Named settled outcomes that opened or closed options. */
  readonly shapingOutcomes: string[]
  /** The validated case slots the player proved, named. */
  readonly provedEvidence: string[]
  /** What the chosen branch projected versus what the ending states. */
  readonly projectedVsActual: string
  /** Containment only: the real unresolved problems, named. */
  readonly unresolved?: string[]
}

const SLOT_LABELS: Readonly<Record<string, string>> = {
  outlook: 'THE OUTLOOK CASE',
  flights: 'THE FLIGHTS CASE',
  bank: 'THE BANK CASE',
  root: 'THE EXERCISE ROOT',
  observation: 'THE INDEPENDENT OBSERVATION',
}

/** Name the settled outcomes that shaped the options, with their real figures.
 *  Each line reads the mission's own settled metrics so the three fixtures read
 *  visibly differently. */
function shapingOutcomes(snapshot: FinaleSnapshot): string[] {
  const lines: string[] = []
  const deliv = metricFor(snapshot.settled, 'outlook', 'required_delivered')
  const decoy = metricFor(snapshot.settled, 'outlook', 'decoy_capacity_spent')
  lines.push(
    deliv >= 3
      ? `OUTLOOK DELIVERED ALL ${deliv} REQUIRED MESSAGES, KEEPING THE RECOVERY WINDOW OPEN`
      : `OUTLOOK DELIVERED ${deliv} OF 3 AND SPENT ${decoy} DECOY SLOTS, NARROWING THE OPTIONS`,
  )
  const cleared = metricFor(snapshot.settled, 'bank', 'payments_cleared')
  const total = metricFor(snapshot.settled, 'bank', 'payments_total')
  lines.push(
    cleared >= total && total > 0
      ? `THE BANK RECONCILIATION CLEARED ALL ${total} PAYMENTS CLEAN`
      : `THE BANK LEFT ${Math.max(0, total - cleared)} OF ${total} PAYMENTS UNCLEARED`,
  )
  const resolved = metricFor(snapshot.settled, 'flights', 'resolved_passengers')
  const held = metricFor(snapshot.settled, 'flights', 'held_passengers')
  lines.push(
    held > 0
      ? `FLIGHTS HELD ${held} PASSENGERS AND RESOLVED NONE`
      : `FLIGHTS RESOLVED ${resolved} PASSENGERS WITH NO BLANKET GROUNDING`,
  )
  return lines
}

/** The proved evidence: the validated case slots, named. */
function provedEvidence(caseState: FinaleCaseState): string[] {
  const named = caseState.provedSlots.map(
    (slot) => SLOT_LABELS[slot] ?? slot.toUpperCase(),
  )
  if (caseState.fieldReportCorroborated) {
    named.push('THE FIELD REPORT CORROBORATED THE OBSERVATION')
  }
  return named
}

/** The real unresolved problems a containment leaves standing, named from the
 *  settled metrics. */
function unresolvedProblems(snapshot: FinaleSnapshot): string[] {
  const problems: string[] = []
  const held = metricFor(snapshot.settled, 'flights', 'held_passengers')
  if (held > 0) problems.push(`${held} PASSENGERS REMAIN HELD WITH NOWHERE TO GO`)
  const cleared = metricFor(snapshot.settled, 'bank', 'payments_cleared')
  const total = metricFor(snapshot.settled, 'bank', 'payments_total')
  const unpaid = Math.max(0, total - cleared)
  if (unpaid > 0) problems.push(`${unpaid} CRITICAL PAYMENTS STAY UNSETTLED`)
  const deliv = metricFor(snapshot.settled, 'outlook', 'required_delivered')
  if (deliv < 3) {
    problems.push(`${3 - deliv} REQUIRED MESSAGES NEVER REACHED THEIR DESK`)
  }
  if (problems.length === 0) {
    problems.push('NO HARD DAMAGE STANDS, BUT NOTHING IS CLOSED OUT EITHER')
  }
  return problems
}

/** Derive the structured earned-why readback for an ending from the frozen
 *  settled metrics, the finale case state, and the chosen branch projection.
 *  Specific and named, never boilerplate; the three campaign fixtures produce
 *  visibly different readbacks. Containment names the real unresolved problems. */
export function deriveEarnedWhy(
  endingId: EndingId,
  snapshot: FinaleSnapshot,
  projection: BranchProjection,
): EarnedWhy {
  const shaping = shapingOutcomes(snapshot)
  const proved = provedEvidence(snapshot.caseState)
  let projectedVsActual: string
  if (endingId === 'recovery') {
    projectedVsActual = `THE STAGED BRANCH PROJECTED ${projection.passengers} PASSENGERS RECOVERED AND OPEN EXCEPTIONS AT ${projection.openExceptions}; THE RECOVERY HELD`
  } else if (endingId === 'containment') {
    projectedVsActual = `THE HOLD BRANCH PROJECTED CONFIDENCE AT ${projection.confidence} AND OPEN EXCEPTIONS AT ${projection.openExceptions}; THE DAMAGE WAS FROZEN, NOT REPAIRED`
  } else {
    projectedVsActual = `THE REPEAT BRANCH PROJECTED DELIVERIES AT ${projection.deliveries} AND PASSENGERS AT ${projection.passengers}; THE ORDER COLLAPSED SERVICE AS BEFORE`
  }
  const base: EarnedWhy = {
    shapingOutcomes: shaping,
    provedEvidence: proved,
    projectedVsActual,
  }
  if (endingId === 'containment') {
    return { ...base, unresolved: unresolvedProblems(snapshot) }
  }
  return base
}
