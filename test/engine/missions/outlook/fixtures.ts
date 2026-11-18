// Shared CRASH OUTLOOK solvability fixtures: the walkthrough and the
// adversarial action scripts, per seed, plus a context builder that drives
// the REAL module through the engine. Section 04 reuses these scripts for
// its CI fixture matrix, so they live here rather than inlined in one
// test file.
//
// A script is an ordered list of [CampaignAction, now] envelopes. The
// walkthrough reads the evidence, routes the three required messages to
// their correct desks on the primary channel while it is up, and never
// touches the backup channel, so at least one backup slot is spare at
// settlement. The adversarial script sprays SENDs at every message to a
// single desk without reading anything: at most the weather kind can
// satisfy, so it ends below tier 3.
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import type { SeedDefinition } from '@engine/missions/types'
import { buildTestContext } from '@engine/testing'
import {
  makeOutlookMission,
  outlookSchedule,
} from '@engine/missions/outlook/module'
import type { OutlookPayload } from '@engine/missions/outlook/content'
import type { OutlookState } from '@engine/missions/outlook/types'
import { SEED_CATALOG } from '@engine/seeds/catalog'

export const OUTLOOK_DURATION_MS = 240_000
export const OUTLOOK_T0 = 1_000_000

export type Envelope = [CampaignAction, number]

/** Build a single-mission engine context over the REAL outlook module and
 *  a real seed's authored payload, schedule, and records. The schedule is
 *  materialized from the payload so stage changes line up with the payload
 *  tuning. */
export function outlookContextForSeed(seedName: string): EngineContext {
  const seed = SEED_CATALOG[seedName]!
  const payload = seed.missionPayloads['outlook'] as OutlookPayload
  const overrides: Partial<SeedDefinition> = {
    name: seed.name,
    records: seed.records,
    deskChecks: seed.deskChecks,
    clueRecords: seed.clueRecords,
    missionPayloads: { ...seed.missionPayloads, outlook: payload },
    schedules: { outlook: [...outlookSchedule(payload)] },
    missionDurationsMs: { outlook: OUTLOOK_DURATION_MS },
  }
  return buildTestContext([...seed.records], overrides, {
    missions: { outlook: makeOutlookMission(payload) },
    missionOrder: ['outlook'],
  })
}

export function outlookSub(state: CampaignState): OutlookState {
  return state.activeMission?.substate as OutlookState
}

function read(messageId: string): CampaignAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } }
}

function send(
  messageId: string,
  recipient: string,
  channel: 'primary' | 'backup' = 'primary',
): CampaignAction {
  return {
    type: 'MISSION_ACTION',
    payload: { kind: 'SEND', messageId, channel, recipient },
  }
}

/** The walkthrough: read the three required messages (audit read also
 *  fires the clue), route each to its correct desk on primary at stage 0,
 *  and leave the backup untouched. All acks are scheduled at +30s, far
 *  inside the 240s deadline. */
export function outlookWalkthroughEnvelopes(t0 = OUTLOOK_T0): Envelope[] {
  return [
    [{ type: 'START_MISSION', missionId: 'outlook' }, t0],
    [read('M01'), t0 + 1_000],
    [read('M04'), t0 + 2_000],
    [read('M05'), t0 + 3_000],
    [send('M01', 'WEATHER_DESK', 'primary'), t0 + 4_000],
    [send('M04', 'PAYROLL_DESK', 'primary'), t0 + 5_000],
    [send('M05', 'AUDIT_DESK', 'primary'), t0 + 6_000],
  ]
}

/** A backup-spending walkthrough that keeps the margin load-bearing. The
 *  player routes weather and payroll on primary at stage 0, then is slow on
 *  the audit: by the time it goes out the primary has SLOWED to stage 1
 *  (past the 90s offset) and the player routes the audit over BACKUP to
 *  beat the ack clock. The backup send spends one of the five slots, so at
 *  settlement backupRemaining is strictly below 5 and strictly above 0: a
 *  real but finite margin, not the vacuous full-five the pure-primary
 *  walkthrough leaves. All three acks still land inside the 240s deadline
 *  (weather/payroll primary +30s near t0; audit backup +120s from ~t0+95s,
 *  landing ~t0+215s). */
export function outlookBackupWalkthroughEnvelopes(t0 = OUTLOOK_T0): Envelope[] {
  return [
    [{ type: 'START_MISSION', missionId: 'outlook' }, t0],
    [read('M01'), t0 + 1_000],
    [read('M04'), t0 + 2_000],
    [read('M05'), t0 + 3_000],
    [send('M01', 'WEATHER_DESK', 'primary'), t0 + 4_000],
    [send('M04', 'PAYROLL_DESK', 'primary'), t0 + 5_000],
    // The audit goes out late, after the primary has slowed, over backup.
    [send('M05', 'AUDIT_DESK', 'backup'), t0 + 95_000],
  ]
}

/** The adversarial send-everything script: no reads, SEND every one of the
 *  twelve messages to a SINGLE desk (WEATHER_DESK) over primary at stage 0,
 *  then burn the whole backup capacity on the same desk. Only the weather
 *  kind can possibly satisfy, so this ends at tier poor at best. */
export function outlookAdversarialEnvelopes(t0 = OUTLOOK_T0): Envelope[] {
  const envelopes: Envelope[] = [
    [{ type: 'START_MISSION', missionId: 'outlook' }, t0],
  ]
  const ids = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    return `M${n < 10 ? `0${n}` : `${n}`}`
  })
  let clock = t0 + 1_000
  for (const id of ids) {
    envelopes.push([send(id, 'WEATHER_DESK', 'primary'), clock])
    clock += 1_000
  }
  // Burn backup capacity too, on the same single desk.
  for (const id of ids.slice(0, 6)) {
    envelopes.push([send(id, 'WEATHER_DESK', 'backup'), clock])
    clock += 1_000
  }
  return envelopes
}

/** Map a visible recipient hint ("WEATHER DESK") to the desk enum a naive
 *  player would route it to. Returns null when there is no hint to trust. */
function deskFromHint(to: string | null): string | null {
  if (to === null) return null
  if (to.includes('WEATHER')) return 'WEATHER_DESK'
  if (to.includes('PAYROLL')) return 'PAYROLL_DESK'
  if (to.includes('AUDIT')) return 'AUDIT_DESK'
  return null
}

/** The "trust the visible hints" adversarial: a naive player who routes
 *  every message to the desk its recipient hint names and never reads a
 *  body. This is the decoy trap the content was authored for: the live
 *  payroll head (M04) carries NO hint (to: null), so a hint-truster never
 *  routes it, and the misleading hints on stale duplicates waste effort.
 *  At most weather and audit can satisfy (their live heads happen to hint
 *  their true desk), so this settles at tier partial, below 3. Proves the
 *  decoys defeat a naive player, not just that the engine math is sound. */
export function outlookTrustHintsEnvelopes(
  seedName: string,
  t0 = OUTLOOK_T0,
): Envelope[] {
  const payload = SEED_CATALOG[seedName]!.missionPayloads['outlook'] as OutlookPayload
  const envelopes: Envelope[] = [
    [{ type: 'START_MISSION', missionId: 'outlook' }, t0],
  ]
  let clock = t0 + 1_000
  for (const message of payload.messages) {
    const desk = deskFromHint(message.to)
    if (desk === null) continue
    envelopes.push([send(message.id, desk, 'primary'), clock])
    clock += 1_000
  }
  return envelopes
}

export interface RunResult {
  readonly state: CampaignState
  readonly emitted: EngineEvent[]
}

/** Drive a script through the engine, then advance past the deadline so
 *  acks fold and the mission settles. */
export function driveOutlook(
  ctx: EngineContext,
  seedName: string,
  envelopes: Envelope[],
  settleAt = OUTLOOK_T0 + OUTLOOK_DURATION_MS + 1_000,
): RunResult {
  let state = createCampaign(ctx, seedName, { extendedTime: false }, OUTLOOK_T0)
  const emitted: EngineEvent[] = []
  for (const [action, now] of envelopes) {
    const result = dispatch(ctx, state, action, now)
    state = result.state
    emitted.push(...result.emitted)
  }
  const advanced = advanceCampaign(ctx, state, settleAt)
  emitted.push(...advanced.emitted)
  return { state: advanced.state, emitted }
}
