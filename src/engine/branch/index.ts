// Branch machinery public surface, consumed by src/engine/index.ts and
// surfaced on the engine API in section-10.
export { snapshot, deepClone, deepFreeze } from './snapshot'
export type { FrozenCampaignState } from './snapshot'
export { runBranch, computeViability } from './runBranch'
export {
  BRANCH_KINDS,
  BRANCH_INDEX,
  VIABILITY_THRESHOLDS,
} from './types'
export type {
  BranchKind,
  BranchProjection,
  BranchStep,
  BranchResult,
  StagedViability,
  ViabilityThreshold,
} from './types'
