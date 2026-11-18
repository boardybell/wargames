// Zero-player branch machinery types. The finale (split 06) runs three
// futures against a frozen snapshot of the live campaign; this split owns
// the framework and its determinism guarantees, not the real projection
// computation. BranchProjection is defined here; split 06 populates it for
// real by pulling mission selectors. Everything is JSON-safe: finite
// integers, strings, booleans, arrays, plain objects.

export type BranchKind = 'REPEAT_D83' | 'HOLD_AND_VERIFY' | 'STAGED_RECOVERY'

export const BRANCH_KINDS: readonly BranchKind[] = [
  'REPEAT_D83',
  'HOLD_AND_VERIFY',
  'STAGED_RECOVERY',
]

// Stable per-kind stream index: each branch draws from its own
// 2^64-separated RNG stream forked off the snapshot, so running the three
// branches in any order yields bit-identical per-kind results.
export const BRANCH_INDEX: Readonly<Record<BranchKind, number>> = {
  REPEAT_D83: 0,
  HOLD_AND_VERIFY: 1,
  STAGED_RECOVERY: 2,
}

export interface BranchProjection {
  /** All fields integer, smallest unit. Split-06 seam fills the real
   *  derivation; here they are honest-but-simple over the test double. */
  readonly openExceptions: number
  readonly deliveries: number
  readonly passengers: number
  readonly payments: number
  readonly confidence: number
}

// Pinned by the split 02 shell review: the shell animates these entries
// in its character grid (skippable, instant under reduced motion); split
// 06 authors the real labels and details.
export interface BranchStep {
  readonly step: number
  readonly label: string
  readonly detail: string
}

export interface ViabilityThreshold {
  readonly key: string
  readonly actual: number
  readonly threshold: number
  readonly pass: boolean
}

export interface StagedViability {
  readonly viable: boolean
  /** Per-threshold detail so the shell and split 06 can show WHY staged
   *  recovery is or is not viable. */
  readonly thresholds: readonly ViabilityThreshold[]
}

export interface BranchResult {
  readonly kind: BranchKind
  readonly projection: BranchProjection
  readonly trace: readonly BranchStep[]
  /** Present for every kind for a uniform surface; only STAGED_RECOVERY
   *  gates its stages on it. */
  readonly viability: StagedViability
}

// Integer service thresholds shaped by settled outcomes: better earlier
// outcomes keep these totals low and widen finale recovery options.
// Summed across settled metrics and compared <= threshold.
export const VIABILITY_THRESHOLDS: readonly {
  readonly key: string
  readonly max: number
}[] = [
  { key: 'wopr_resolved', max: 2 },
  { key: 'service_cost', max: 20 },
]
