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
//
// Calibrated empirically against all three real missions (outlook, bank,
// flights) stamping wopr_resolved + service_cost on the flights convention.
// Measured aggregates across a full three-mission campaign, identical on all
// three authored seeds:
//   CLEAN (section-02 walkthroughs):      wopr_resolved 0,  service_cost 0
//   DEFENSIVE (hold / freeze / ground,    wopr_resolved 20, service_cost 20
//     deliver nothing; per mission
//     outlook 2/4, bank 10/8, flights 8/8)
// Per-mission defensive service_cost: outlook 4, bank 8, flights 8. The
// service_cost max sits strictly between the single-worst defensive mission
// and the smallest two-defensive pair, so one defensive mission stays viable
// and any two do not, symmetrically regardless of which two:
//   clean campaign                        service_cost 0  (viable at <= 10)
//   single worst defensive mission        service_cost 8  (viable at <= 10)
//   any two defensive missions            service_cost >= 12 (fails: the
//     pairs are outlook+bank 12, outlook+flights 12, bank+flights 16)
//   full defensive campaign               service_cost 20 (fails)
// wopr_resolved max stays 10: clean 0 passes, full defensive 20 fails.
export const VIABILITY_THRESHOLDS: readonly {
  readonly key: string
  readonly max: number
}[] = [
  { key: 'wopr_resolved', max: 10 },
  { key: 'service_cost', max: 10 },
]
