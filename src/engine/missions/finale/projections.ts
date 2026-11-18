// GLOBAL FAILSAFE finale projections: pure integer transforms over a frozen
// FinaleSnapshot (the three settled SettledOutcome metrics plus the finale
// case-file state). There is no mission substate here, no replay, no
// forkStream (engine amendment 10): by finale time every mission substate has
// been deleted at settlement, so the snapshot carries only settled metrics and
// campaign case-file facts. These transforms fill the split 01 BranchProjection
// seam.
//
// Three authored branch policies, all per-metric integer deltas:
//   REPEAT D-83      worsens the settled damage
//   HOLD AND VERIFY  freezes the damage, applies containment costs
//   STAGED RECOVERY  applies recovery deltas gated by the engine viability
//
// Single-computation rule: computeStaged returns ONE StagedComputation whose
// .endState feeds BOTH .viability and .projection, so the DecisionView panel
// (which reads .viability) and the ComparisonView STAGED column (which reads
// .projection) can never contradict. computeViability from runBranch is reused
// verbatim; this module never forks a second viability formula, and never reads
// or mutates live campaign state (the frozen snapshot is the only input).
import { computeViability } from '../../branch/runBranch'
import { VIABILITY_THRESHOLDS } from '../../branch/types'
import type { BranchProjection, BranchStep } from '../../branch/types'
import { selectOpenExceptions } from '../../campaign/selectors'
import type { CampaignState } from '../../campaign/state'
import type { SettledOutcome } from '../../campaign/types'

export type BranchId = 'repeat' | 'hold' | 'staged'

/** Reference-only finale case facts the readback and projections name. Record
 *  ids and booleans only; no authored copy. Deep-frozen with the snapshot. */
export interface FinaleCaseState {
  readonly caseValid: boolean
  /** The case slots the player proved (filled and validated). Slot names. */
  readonly provedSlots: readonly string[]
  /** Whether the designated field report corroborated the observation slot. */
  readonly fieldReportCorroborated: boolean
}

/** The frozen finale-start snapshot: three settled SettledOutcome metrics plus
 *  campaign case-file state and the seed's open-exceptions baseline. NO mission
 *  substate. The engine deep-freezes this at finale START; the transforms treat
 *  it as read-only (mutation throws in strict mode). */
export interface FinaleSnapshot {
  readonly settled: readonly SettledOutcome[]
  readonly openExceptionsBaseline: number
  readonly caseState: FinaleCaseState
}

export interface ViabilityThresholdView {
  readonly id: string
  readonly required: number
  readonly actual: number
  readonly pass: boolean
}

export interface ViabilityResult {
  readonly pass: boolean
  readonly thresholds: readonly ViabilityThresholdView[]
}

export interface StagedComputation {
  /** ONE computation rendered twice: the panel reads .viability, the STAGED
   *  column reads .projection; both derive from .endState. */
  readonly endState: BranchProjection
  readonly viability: ViabilityResult
  readonly projection: BranchProjection
}

/** Authored signed per-metric integer deltas. Applied to the baseline
 *  projection and clamped at zero. */
export interface PerMetricDeltas {
  readonly openExceptions: number
  readonly deliveries: number
  readonly passengers: number
  readonly payments: number
  readonly confidence: number
}

/** REPEAT D-83: run the decoy order again. Every real service figure worsens;
 *  the open-exceptions tally drops because WOPR counts the forced inactivity as
 *  resolution. Authored integers, applied then clamped at zero. */
export const REPEAT_DELTAS: PerMetricDeltas = {
  openExceptions: -6,
  deliveries: -2,
  passengers: -600,
  payments: -2,
  confidence: -40,
}

/** HOLD AND VERIFY: freeze the settled figures where they stand and pay the
 *  containment cost. Deliveries, passengers, and payments hold; confidence
 *  erodes and the open-exceptions tally climbs with the unresolved load. */
export const CONTAINMENT_COSTS: PerMetricDeltas = {
  openExceptions: 2,
  deliveries: 0,
  passengers: 0,
  payments: 0,
  confidence: -15,
}

/** STAGED RECOVERY when viability passes: measured recovery across every
 *  service figure, the tally falling as real exceptions actually close. */
export const RECOVERY_DELTAS: PerMetricDeltas = {
  openExceptions: -3,
  deliveries: 1,
  passengers: 300,
  payments: 1,
  confidence: 20,
}

/** STAGED RECOVERY when viability fails: the single constrained stage. Capacity
 *  thresholds are breached, so recovery holds at one tranche. */
export const RECOVERY_DELTAS_CONSTRAINED: PerMetricDeltas = {
  openExceptions: -1,
  deliveries: 0,
  passengers: 100,
  payments: 0,
  confidence: 5,
}

/** The single shared metric lookup: find the settled outcome by missionId and
 *  read one integer metric key, defaulting to 0 when the mission or key is
 *  absent. Pure. Both this module and endings.ts read every settled figure
 *  through this one helper so there is one implementation, not three. */
export function metricFor(
  settled: readonly SettledOutcome[],
  missionId: string,
  key: string,
): number {
  return settled.find((s) => s.missionId === missionId)?.metrics[key] ?? 0
}

/** The pre-branch baseline projection: the real service figures the settled
 *  metrics already carry. Every field is an integer read straight off the
 *  frozen settled outcomes; the open-exceptions figure reuses the campaign
 *  selector's baseline-minus-resolved formula. */
export function baselineProjection(snapshot: FinaleSnapshot): BranchProjection {
  const openExceptions = selectOpenExceptions(snapshotAsCampaign(snapshot))
  return {
    openExceptions,
    deliveries: metricFor(snapshot.settled, 'outlook', 'required_delivered'),
    passengers: metricFor(snapshot.settled, 'flights', 'resolved_passengers'),
    payments: metricFor(snapshot.settled, 'bank', 'payments_cleared'),
    confidence: metricFor(snapshot.settled, 'bank', 'confidence'),
  }
}

/** Apply authored deltas to a baseline projection, clamping every field at
 *  zero (a negative service figure is a broken panel, not a worse number). */
function applyDeltas(
  base: BranchProjection,
  deltas: PerMetricDeltas,
): BranchProjection {
  return {
    openExceptions: Math.max(0, base.openExceptions + deltas.openExceptions),
    deliveries: Math.max(0, base.deliveries + deltas.deliveries),
    passengers: Math.max(0, base.passengers + deltas.passengers),
    payments: Math.max(0, base.payments + deltas.payments),
    confidence: Math.max(0, base.confidence + deltas.confidence),
  }
}

/** Build the minimal campaign-shaped view the reused selectors read. Only the
 *  settled outcomes and the baseline matter to selectOpenExceptions and
 *  computeViability; everything else is an empty stub. Never a live state. */
function snapshotAsCampaign(snapshot: FinaleSnapshot): CampaignState {
  return {
    seedName: '',
    rng: { words: [] },
    openExceptionsBaseline: snapshot.openExceptionsBaseline,
    settleCounter: 0,
    lastNow: 0,
    phase: 'finale',
    activeMission: null,
    missionQueue: [],
    campaignQueue: [],
    settled: snapshot.settled as SettledOutcome[],
    acknowledgedDebriefs: [],
    startedMissionIds: [],
    cluesFound: [],
    sourceChecks: [],
    inspectedRecords: [],
    appliedConsequences: [],
    preferences: { extendedTime: false },
  }
}

/** Reuse the engine's STAGED_RECOVERY viability (computeViability from
 *  runBranch): per-threshold pass/fail from the summed settled metrics. The
 *  thresholds are mapped into the finale's view shape without re-deriving any
 *  number. The threshold numbers come from VIABILITY_THRESHOLDS; this module
 *  never hardcodes them. */
export function computeFinaleViability(snapshot: FinaleSnapshot): ViabilityResult {
  const staged = computeViability(snapshotAsCampaign(snapshot))
  const thresholds = staged.thresholds.map((t) => ({
    id: t.key,
    required: t.threshold,
    actual: t.actual,
    pass: t.pass,
  }))
  return { pass: staged.viable, thresholds }
}

/** REPEAT D-83 projection: baseline worsened by REPEAT_DELTAS. */
export function projectRepeat(snapshot: FinaleSnapshot): BranchProjection {
  return applyDeltas(baselineProjection(snapshot), REPEAT_DELTAS)
}

/** HOLD AND VERIFY projection: baseline frozen, CONTAINMENT_COSTS applied. */
export function projectHold(snapshot: FinaleSnapshot): BranchProjection {
  return applyDeltas(baselineProjection(snapshot), CONTAINMENT_COSTS)
}

/** STAGED RECOVERY: the single computation. The viability result selects the
 *  recovery deltas (full when it passes, constrained when it fails); the SAME
 *  resulting end state is both .viability's companion projection and the STAGED
 *  column's figures, so panel and column cannot contradict. */
export function computeStaged(snapshot: FinaleSnapshot): StagedComputation {
  const viability = computeFinaleViability(snapshot)
  const deltas = viability.pass ? RECOVERY_DELTAS : RECOVERY_DELTAS_CONSTRAINED
  const endState = applyDeltas(baselineProjection(snapshot), deltas)
  return { endState, viability, projection: endState }
}

/** Fill the split 01 BranchProjection seam: all three branches from the frozen
 *  snapshot. Pure and deterministic; callable repeatedly; never mutates the
 *  snapshot or any live state. */
export function runProjections(snapshot: FinaleSnapshot): {
  repeat: BranchProjection
  hold: BranchProjection
  staged: StagedComputation
} {
  return {
    repeat: projectRepeat(snapshot),
    hold: projectHold(snapshot),
    staged: computeStaged(snapshot),
  }
}

/** Authored BranchStep traces, one sequence per branch, derived from each
 *  branch's transform steps. Consumed later by the shell's playBranchTrace
 *  (section 04). No em-dashes; UPPERCASE terminal diction on the labels. The
 *  details read the frozen baseline figures so the trace and the projection
 *  agree. */
export function traceFor(
  branch: BranchId,
  snapshot: FinaleSnapshot,
): BranchStep[] {
  const base = baselineProjection(snapshot)
  switch (branch) {
    case 'repeat': {
      const after = projectRepeat(snapshot)
      return [
        {
          step: 0,
          label: 'REISSUE D-83',
          detail: `Run the decoy order again against ${base.deliveries} settled deliveries`,
        },
        {
          step: 1,
          label: 'ABSORB THE DAMAGE',
          detail: `Deliveries fall to ${after.deliveries}, passengers to ${after.passengers}`,
        },
        {
          step: 2,
          label: 'TALLY RESOLVES',
          detail: `OPEN EXCEPTIONS reads ${after.openExceptions} as WOPR counts the inactivity`,
        },
      ]
    }
    case 'hold': {
      const after = projectHold(snapshot)
      return [
        {
          step: 0,
          label: 'HOLD THE LINE',
          detail: `Freeze ${base.payments} cleared payments and ${base.passengers} resolved passengers`,
        },
        {
          step: 1,
          label: 'PAY CONTAINMENT',
          detail: `Confidence erodes to ${after.confidence} under the standing load`,
        },
        {
          step: 2,
          label: 'LOG UNRESOLVED',
          detail: `OPEN EXCEPTIONS climbs to ${after.openExceptions} with nothing closed`,
        },
      ]
    }
    case 'staged': {
      const staged = computeStaged(snapshot)
      const viable = staged.viability.pass
      return [
        {
          step: 0,
          label: 'STAGE ONE',
          detail: viable
            ? `Recover the first tranche from ${base.deliveries} verified deliveries`
            : `Capacity breached; hold recovery at one tranche from ${base.deliveries} deliveries`,
        },
        {
          step: 1,
          label: viable ? 'STAGE TWO' : 'STAGE TWO HELD',
          detail: viable
            ? `Advance recovery; passengers reach ${staged.projection.passengers}`
            : `Thresholds fail; passengers reach only ${staged.projection.passengers}`,
        },
        {
          step: 2,
          label: 'CLOSE EXCEPTIONS',
          detail: `OPEN EXCEPTIONS settles at ${staged.projection.openExceptions}`,
        },
      ]
    }
    default: {
      const never: never = branch
      throw new Error(`UNKNOWN BRANCH: ${String(never)}`)
    }
  }
}

// Re-export so callers can reach the viability threshold contract without a
// second import of the branch module; the numbers still live there.
export { VIABILITY_THRESHOLDS }
