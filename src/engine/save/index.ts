// Versioned, validated persistence. The Valibot schema is the source of
// truth; migrations are total and defensive; a throw anywhere on the
// load chain (parse, migrate, validate, merge) falls through primary to
// backup to fresh, and the monotonic merge guard runs on every load
// path so a stale backup can never resurrect a settled mission. All
// storage calls are fallible: Safari private mode, ITP eviction, quota.
import * as v from 'valibot'
import { campaignStateSchema } from '../campaign/state'
import type { CampaignState } from '../campaign/state'
import type { AppliedMarker, SettledOutcome } from '../campaign/types'
import type { MissionRegistry } from '../missions/types'

export const PRIMARY_KEY = 'wargames.save.primary'
export const BACKUP_KEY = 'wargames.save.backup'
export const CURRENT_VERSION = 1

/** Every call may throw; the save layer treats all as fallible. Writes are
 *  assumed atomic per key (the localStorage contract): a throwing write
 *  leaves the prior value intact and never deposits a partial one. The
 *  persist rollback relies on this — a port without it could still surface
 *  a torn slot on a failed restore. */
export interface StoragePort {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
}

// The post-migration envelope must be exactly the current version: a
// migration that returns any other version is a bug, and pinning the
// literal here catches it at parse rather than letting a mis-versioned
// state validate and load.
const savePayloadSchema = v.object({
  version: v.literal(CURRENT_VERSION),
  state: campaignStateSchema,
})

export type SavePayload = v.InferOutput<typeof savePayloadSchema>

export type Migration = (raw: unknown) => unknown

/** Ordered pure, total, defensive migrations from version N to N+1.
 *  Empty at v1; the pipeline and its test exist from day one. The runner
 *  accepts an injectable array so the application path is testable
 *  without shipping a migration. */
export const MIGRATIONS: ReadonlyArray<Migration> = []

export function encodeSave(state: CampaignState): string {
  // Pre-write validation turns a would-be silent corruption (a non-
  // JSON-safe substate, a non-integer field) into a catchable failure.
  v.parse(campaignStateSchema, state)
  return JSON.stringify({ version: CURRENT_VERSION, state })
}

/** The migration runner, exported so the application path is testable
 *  with an injected migration without shipping one in MIGRATIONS. */
export function runMigrations(
  raw: unknown,
  migrations: ReadonlyArray<Migration> = MIGRATIONS,
): unknown {
  const envelope = raw as { version?: unknown }
  // A missing version is the real pre-versioning case: treat it as v0 and
  // route it through migration (defensive, not default-to-current).
  let version =
    typeof envelope?.version === 'number' ? envelope.version : 0
  if (!Number.isInteger(version) || version < 0 || version > CURRENT_VERSION) {
    throw new Error(`save: unknown version ${String(version)}`)
  }
  let current = raw
  while (version < CURRENT_VERSION) {
    const step = migrations[version]
    if (!step) throw new Error(`save: missing migration from ${version}`)
    current = step(current)
    version += 1
  }
  return current
}

/** Validate the one thing the campaign schema leaves opaque: the active
 *  mission's substate, against that mission's own saveSchema. Throws on a
 *  mismatch (unknown mission, or an engine-produced substate corrupted on
 *  disk). A settled or absent mission has no live substate to check. */
function validateActiveSubstate(
  state: CampaignState,
  registry: MissionRegistry,
): void {
  const runtime = state.activeMission
  if (!runtime) return
  const module = registry[runtime.missionId]
  if (!module) throw new Error(`save: unknown mission ${runtime.missionId}`)
  v.parse(module.saveSchema, runtime.substate)
}

/** Composes the active mission's saveSchema at load: the campaign schema
 *  validates the envelope, then the mission module validates its own
 *  substate. Throws on any mismatch; callers handle fallthrough. */
export function decodeSave(
  raw: string,
  registry: MissionRegistry,
): CampaignState {
  const parsed = JSON.parse(raw) as unknown
  const migrated = runMigrations(parsed)
  const payload = v.parse(savePayloadSchema, migrated)
  validateActiveSubstate(payload.state, registry)
  return payload.state
}

const byMissionId = (
  a: { readonly missionId: string },
  b: { readonly missionId: string },
): number => (a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0)

const byMarkerKey = (a: AppliedMarker, b: AppliedMarker): number =>
  a.consequenceId !== b.consequenceId
    ? a.consequenceId < b.consequenceId
      ? -1
      : 1
    : a.targetMissionId < b.targetMissionId
      ? -1
      : a.targetMissionId > b.targetMissionId
        ? 1
        : 0

/** Reconcile a loaded save against the live session. The in-session state,
 *  when present, is authoritative: a reload can only ADD settlement facts
 *  for missions the session has never settled, and can never roll back the
 *  live rng, clock, queues, or active mission. settleSeq is a per-lineage
 *  counter and is NOT comparable across two divergent saves, so the merge
 *  is by source priority, not by seq. The self-consistency pass (a settled
 *  mission can never also be active) and the settle-counter floor run on
 *  every path, including a fresh boot where there is no session to merge
 *  against, so a single corrupt slot is sanitized regardless. Idempotent:
 *  feeding a guarded state back through changes nothing. */
export function mergeGuard(
  loaded: CampaignState,
  inSession: CampaignState | null,
): CampaignState {
  // Base is the authoritative state: the live session when present, else
  // the loaded save on a fresh boot.
  const base = inSession ?? loaded
  // Settled facts: the base's own, plus — only when merging a load against
  // a live session — any settled mission the session has never seen. A
  // stale load can thus move settlement forward but never overwrite or
  // unsettle a mission the session already resolved.
  const byMission = new Map<string, SettledOutcome>(
    base.settled.map((s) => [s.missionId, s]),
  )
  if (inSession) {
    for (const outcome of loaded.settled) {
      if (!byMission.has(outcome.missionId)) {
        byMission.set(outcome.missionId, outcome)
      }
    }
  }
  const settled = [...byMission.values()].sort(byMissionId)
  const settledIds = new Set(settled.map((s) => s.missionId))
  // Self-consistency: a settled mission can never also be the active one.
  const activeMission =
    base.activeMission && settledIds.has(base.activeMission.missionId)
      ? null
      : base.activeMission
  // Union applied-consequence markers from both sources, keyed by
  // (consequenceId, targetMissionId).
  const mergedMarkers = new Map(
    base.appliedConsequences.map((m) => [
      `${m.consequenceId}:${m.targetMissionId}`,
      m,
    ]),
  )
  if (inSession) {
    for (const m of loaded.appliedConsequences) {
      const key = `${m.consequenceId}:${m.targetMissionId}`
      if (!mergedMarkers.has(key)) mergedMarkers.set(key, m)
    }
  }
  // Clues are monotonic: every settled outcome's clue is permanently known.
  // Fold them over the merged settled set so an additively-imported outcome
  // can never leave its clue unrecorded — an internal-consistency skew the
  // self-consistency pass (settled-vs-active only) would not otherwise catch.
  const cluesFound = [
    ...new Set([
      ...base.cluesFound,
      ...settled
        .map((s) => s.clueId)
        .filter((c): c is string => c !== null),
    ]),
  ].sort()
  // The settle counter must never regress below any imported settleSeq, or
  // the next in-engine settlement would reuse a stamp.
  const maxSeq = settled.reduce(
    (m, s) => (s.settleSeq > m ? s.settleSeq : m),
    -1,
  )
  const settleCounter = Math.max(base.settleCounter, maxSeq + 1)
  return {
    ...base,
    settled,
    activeMission,
    cluesFound,
    settleCounter,
    appliedConsequences: [...mergedMarkers.values()].sort(byMarkerKey),
  }
}

export type RecoveryFlag = 'clean' | 'recovered-backup' | 'reset'

export interface LoadResult {
  readonly state: CampaignState | null
  readonly recovery: RecoveryFlag
}

function tryLoad(
  port: StoragePort,
  key: string,
  registry: MissionRegistry,
  inSession: CampaignState | null,
): CampaignState | null {
  try {
    const raw = port.read(key)
    if (raw === null) return null
    return mergeGuard(decodeSave(raw, registry), inSession)
  } catch {
    return null
  }
}

function slotStatus(
  port: StoragePort,
  key: string,
): 'empty' | 'present' | 'error' {
  try {
    return port.read(key) === null ? 'empty' : 'present'
  } catch {
    return 'error'
  }
}

/** Primary then backup then fresh. The monotonic merge guard runs on both
 *  slot paths. The recovery flag is the shell's visible notice: 'clean' also
 *  covers a first-time load with no save at all (both slots empty), so a brand
 *  new player is never told their save could not be recovered. 'reset' means a
 *  save was actually present or the storage errored, but nothing loaded. */
export function loadCampaign(
  port: StoragePort,
  registry: MissionRegistry,
  inSession: CampaignState | null = null,
): LoadResult {
  const primary = tryLoad(port, PRIMARY_KEY, registry, inSession)
  if (primary) return { state: primary, recovery: 'clean' }
  const backup = tryLoad(port, BACKUP_KEY, registry, inSession)
  if (backup) return { state: backup, recovery: 'recovered-backup' }
  const bothEmpty =
    slotStatus(port, PRIMARY_KEY) === 'empty' &&
    slotStatus(port, BACKUP_KEY) === 'empty'
  return { state: null, recovery: bothEmpty ? 'clean' : 'reset' }
}

export interface PersistResult {
  readonly ok: boolean
  readonly reason?: string
}

/** Validate, snapshot the prior primary into backup (a double buffer, so
 *  the backup always trails one generation and offers real rollback),
 *  then write and read-back-confirm the new primary. On a QuotaExceeded
 *  storm the backup slot is freed and the primary retried once; if that
 *  still fails the prior good primary is restored, so no path ever leaves
 *  a torn or garbage primary behind. The validity check composes the
 *  active mission's own schema, so write-side substate corruption is
 *  reported now rather than surfacing as a silent reset next session. No
 *  path throws out of this function. */
export function persistCampaign(
  port: StoragePort,
  state: CampaignState,
  registry: MissionRegistry,
): PersistResult {
  let payload: string
  try {
    // encodeSave validates campaignStateSchema; the only thing it leaves
    // opaque is the active substate, so compose just that mission schema
    // rather than re-parsing the whole (up to 64 KB) payload. A broken
    // substate fails here, at write, not as a silent reset next load.
    payload = encodeSave(state)
    validateActiveSubstate(state, registry)
  } catch {
    return { ok: false, reason: 'INVALID STATE' }
  }
  const safeRead = (key: string): string | null => {
    try {
      return port.read(key)
    } catch {
      return null
    }
  }
  const safeWrite = (key: string, value: string): void => {
    try {
      port.write(key, value)
    } catch {
      // best effort
    }
  }
  // Preserve the last confirmed-good primary one generation back in the
  // backup slot before overwriting primary, and keep it for rollback.
  const prior = safeRead(PRIMARY_KEY)
  if (prior !== null && prior !== payload) safeWrite(BACKUP_KEY, prior)
  const confirmPrimary = (): boolean => {
    try {
      port.write(PRIMARY_KEY, payload)
      return port.read(PRIMARY_KEY) === payload
    } catch (error) {
      if ((error as { name?: string })?.name === 'QuotaExceededError') {
        try {
          port.remove(BACKUP_KEY)
          port.write(PRIMARY_KEY, payload)
          return port.read(PRIMARY_KEY) === payload
        } catch {
          return false
        }
      }
      return false
    }
  }
  if (!confirmPrimary()) {
    // Restore the prior good primary so the slot is never left torn.
    if (prior !== null) safeWrite(PRIMARY_KEY, prior)
    return { ok: false, reason: 'PRIMARY WRITE FAILED' }
  }
  return { ok: true }
}
