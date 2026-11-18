// The public engine surface. One rule: all player-driven mutation goes
// through dispatch. No logic lives here; everything is re-exported from an
// internal module, and the import-surface test pins this list exactly so a
// new export cannot leak in untested.
//
// Signature note: createCampaign, dispatch, advanceCampaign, and runBranch
// take a leading EngineContext (the seed catalog + mission registry) that
// emerged during implementation; the shell assembles one ctx per session
// and threads it. EngineContext is therefore part of the surface.
export const ENGINE_VERSION = '0.1.0'

export {
  createCampaign,
  dispatch,
  advanceCampaign,
  isMissionSettled,
} from './campaign/engine'
// EngineContext is public because the ctx (seed catalog + mission registry)
// is threaded through createCampaign/dispatch/advanceCampaign/runBranch; the
// shell assembles one per session. BriefingLine stays internal.
export type { EngineContext } from './campaign/engine'

export {
  selectMenuRows,
  selectOpenExceptions,
  selectServiceOutcomes,
  selectSettledOutcome,
  selectSettledMetrics,
  selectCorroboration,
  selectCampaignBegun,
} from './campaign/selectors'
export type { MenuRow } from './campaign/selectors'

export { snapshot, runBranch } from './branch'
export type {
  FrozenCampaignState,
  BranchKind,
  BranchProjection,
  BranchStep,
  BranchResult,
  StagedViability,
  ViabilityThreshold,
} from './branch'
export { BRANCH_KINDS } from './branch'

export {
  buildRecordGraph,
  getRecord,
  trace,
  isIndependentObservation,
  corroborationValue,
} from './records'
export type {
  EvidenceRecord,
  RecordGraph,
  TraceResult,
  Verdict,
  SourceCheckOutcome,
} from './records'

export {
  encodeSave,
  decodeSave,
  runMigrations,
  loadCampaign,
  persistCampaign,
  PRIMARY_KEY,
  BACKUP_KEY,
} from './save'
export type {
  StoragePort,
  SavePayload,
  RecoveryFlag,
  LoadResult,
  PersistResult,
  Migration,
} from './save'

export { seedCatalogMetadata, SEED_NAMES } from './seeds/catalog'

export type { CampaignState } from './campaign/state'
export type {
  CampaignAction,
  EngineEvent,
  SettledOutcome,
  SettlementCause,
  OutcomeTier,
  Consequence,
  SourceCheckResult,
  CampaignPhase,
  DispatchResult,
} from './campaign/types'
// MissionModule/MissionRegistry/SeedDefinition are the seams later splits
// implement (missions) and assemble into an EngineContext; they are public
// for that reason. MissionRuntime, AppliedMarker, and BriefingLine stay
// internal — consumers read them via CampaignState, never by name.
export type {
  MissionModule,
  MissionRegistry,
  SeedDefinition,
  DebriefPayload,
} from './missions/types'
