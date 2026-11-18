// The section-04 CI fixture matrix: replay the authored scripts through the
// REAL engine and the REAL outlook module for every seed, proving all four
// settlement causes (completed, timeout, forfeit, and the adversarial's
// below-full settle) plus the clue path and its survival across failure.
// These reuse the section-02 fixture scripts verbatim (via the fixtures/
// re-export) rather than forking them, so the solvability proofs and this
// matrix share one source of truth.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import { OUTLOOK_CLUE_ID } from '@engine/missions/outlook/module'
import { OUTLOOK_PAYLOAD_BY_SEED } from '@engine/missions/outlook/payloads'
import {
  OUTLOOK_DURATION_MS,
  OUTLOOK_T0,
  adversarialScript,
  backupWalkthroughScript,
  driveOutlook,
  outlookContextForSeed,
  outlookSub,
  trustHintsScript,
  walkthroughScript,
} from './fixtures/index'

const TIER_RANK: Record<string, number> = {
  failed: 0,
  poor: 1,
  partial: 2,
  full: 3,
}

const ENDS_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS
const SETTLE_AT = ENDS_AT + 1_000
/** Past the stage-1 fold wake (offset 90s): the +30s walkthrough acks are
 *  folded here so a mid-mission forfeit evaluates them. */
const AFTER_FOLD = OUTLOOK_T0 + 100_000

function startMission(ctx: EngineContext, seedName: string): CampaignState {
  const created = createCampaign(ctx, seedName, { extendedTime: false }, OUTLOOK_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'outlook' },
    OUTLOOK_T0,
  ).state
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

function read(messageId: string): CampaignAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } }
}

function outlookSettled(state: CampaignState) {
  return state.settled.find((s) => s.missionId === 'outlook')!
}

describe.each(SEED_NAMES)('outlook fixtures: %s', (seedName) => {
  it('walkthrough reaches tier 3 completed with at least one spare backup slot', () => {
    const ctx = outlookContextForSeed(seedName)
    const { state, emitted } = driveOutlook(
      ctx,
      seedName,
      walkthroughScript(seedName),
    )
    const settlements = emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
    const outlook = outlookSettled(state)
    expect(outlook.tier).toBe('full')
    expect(outlook.metrics['required_delivered']).toBe(3)
    // The walkthrough never touches the backup channel, so the spare slot is
    // whole. Sample the live substate just before the fold wake settles it.
    const sampled = driveOutlook(
      ctx,
      seedName,
      walkthroughScript(seedName),
      OUTLOOK_T0 + 89_000,
    )
    expect(outlookSub(sampled.state).backupRemaining).toBeGreaterThanOrEqual(1)
  })

  it('backup-spending walkthrough settles completed/full with a real finite margin (0 < backupRemaining < 5)', () => {
    const ctx = outlookContextForSeed(seedName)
    // Sample the LIVE substate just after the late audit backup send (t0+95s)
    // but before the audit ack lands (~t0+215s): the backup slot is already
    // spent, the two primary acks have folded, and the mission is still
    // running. This observes the real, finite margin: strictly below the full
    // five (one slot spent) and strictly above zero (four slots left).
    const sampled = driveOutlook(
      ctx,
      seedName,
      backupWalkthroughScript(seedName),
      OUTLOOK_T0 + 96_000,
    )
    expect(sampled.state.phase).toBe('mission')
    const backupRemaining = outlookSub(sampled.state).backupRemaining
    expect(backupRemaining).toBeGreaterThan(0)
    expect(backupRemaining).toBeLessThan(5)
    // Carry that same live state to the deadline: it must settle completed at
    // the full tier with the backup slot genuinely consumed.
    const settled = advanceCampaign(
      ctx,
      sampled.state,
      ENDS_AT + 1_000,
    )
    const settlements = settled.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
    const outlook = outlookSettled(settled.state)
    expect(outlook.tier).toBe('full')
    expect(outlook.metrics['required_delivered']).toBe(3)
  })

  it('walkthrough audit READ emits clueFound exactly once and cluesFound has the D-83 id', () => {
    const ctx = outlookContextForSeed(seedName)
    const { state, emitted } = driveOutlook(
      ctx,
      seedName,
      walkthroughScript(seedName),
    )
    const clueEvents = emitted.filter((e) => e.type === 'clueFound')
    expect(clueEvents).toHaveLength(1)
    expect(clueEvents[0]).toMatchObject({ clueId: OUTLOOK_CLUE_ID })
    expect(state.cluesFound).toContain(OUTLOOK_CLUE_ID)
  })

  it('adversarial send-everything ends below tier full', () => {
    const ctx = outlookContextForSeed(seedName)
    const { state } = driveOutlook(ctx, seedName, adversarialScript(seedName))
    const outlook = outlookSettled(state)
    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
    expect(outlook.metrics['required_delivered']!).toBeLessThan(3)
  })

  it('trust-the-hints adversarial settles below tier full (decoys beat a naive hint-follower)', () => {
    const ctx = outlookContextForSeed(seedName)
    const { state } = driveOutlook(ctx, seedName, trustHintsScript(seedName))
    const outlook = outlookSettled(state)
    // A smart-but-naive player who routes every message to the desk its
    // visible recipient hint names and never reads a body cannot satisfy all
    // three: the live payroll head carries no hint. This lands at tier
    // partial, one short of winning.
    expect(outlook.tier).toBe('partial')
    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
    expect(outlook.metrics['required_delivered']!).toBeLessThan(3)
  })

  it('timeout: no actions after start settles timeout/failed with the tier-0 commsDelayed magnitude', () => {
    const ctx = outlookContextForSeed(seedName)
    const started = startMission(ctx, seedName)
    const advanced = advanceCampaign(ctx, started, SETTLE_AT)
    const settlements = advanced.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'failed' })
    const outlook = outlookSettled(advanced.state)
    expect(outlook.metrics['required_delivered']).toBe(0)
    // The commsDelayed magnitude for tier 0 (failed) matches the authored
    // consequence table row, not a hard-coded constant.
    const expectedMagnitude = OUTLOOK_PAYLOAD_BY_SEED[seedName]!.commsDelayedTable.failed
    const comms = outlook.consequences.find((c) => c.kind === 'commsDelayed')
    expect(comms).toBeDefined()
    expect(comms!.magnitude).toBe(expectedMagnitude)
  })

  it('forfeit mid-mission tiers poor with the one achieved delivery marked correct in debrief', () => {
    const ctx = outlookContextForSeed(seedName)
    let state = startMission(ctx, seedName)
    // Walkthrough prefix through ONE correct delivery: read and route the
    // weather head to its desk on the primary channel.
    state = dispatch(ctx, state, read('M01'), OUTLOOK_T0 + 1_000).state
    state = dispatch(
      ctx,
      state,
      send('M01', 'WEATHER_DESK', 'primary'),
      OUTLOOK_T0 + 2_000,
    ).state
    // Advance past the stage-1 fold wake so the +30s ack folds, then forfeit.
    state = advanceCampaign(ctx, state, AFTER_FOLD).state
    const result = dispatch(
      ctx,
      state,
      { type: 'FORFEIT_MISSION' },
      AFTER_FOLD + 1_000,
    )
    const outlook = outlookSettled(result.state)
    expect(outlook.cause).toBe('forfeit')
    expect(outlook.tier).toBe('poor')
    expect(outlook.metrics['required_delivered']).toBe(1)
    const module = ctx.missions['outlook']!
    const debrief = module.debrief!(outlook)
    expect(debrief.lines).toContain('REQUIRED WEATHER: DELIVERED CORRECT')
    expect(debrief.lines).toContain('REQUIRED PAYROLL: NOT DELIVERED')
    expect(debrief.lines).toContain('REQUIRED AUDIT: NOT DELIVERED')
  })

  it('clue survives failure: READ audit then forfeit; cluesFound still has the id post-mission', () => {
    const ctx = outlookContextForSeed(seedName)
    let state = startMission(ctx, seedName)
    state = dispatch(ctx, state, read('M05'), OUTLOOK_T0 + 1_000).state
    expect(state.cluesFound).toContain(OUTLOOK_CLUE_ID)
    const result = dispatch(
      ctx,
      state,
      { type: 'FORFEIT_MISSION' },
      OUTLOOK_T0 + 2_000,
    )
    const outlook = outlookSettled(result.state)
    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
    // The clue survives the failed mission in the post-mission campaign state.
    expect(result.state.cluesFound).toContain(OUTLOOK_CLUE_ID)
    expect(outlook.clueId).toBe(OUTLOOK_CLUE_ID)
  })
})
