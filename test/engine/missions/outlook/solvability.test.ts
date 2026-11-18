import { describe, expect, it } from 'vitest'
import { advanceCampaign } from '@engine/campaign/engine'
import type { EngineEvent } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import {
  OUTLOOK_DURATION_MS,
  OUTLOOK_T0,
  driveOutlook,
  outlookAdversarialEnvelopes,
  outlookBackupWalkthroughEnvelopes,
  outlookContextForSeed,
  outlookSub,
  outlookTrustHintsEnvelopes,
  outlookWalkthroughEnvelopes,
} from './fixtures'

function tierOf(settled: readonly { missionId: string; tier: string }[]): string {
  return settled.find((s) => s.missionId === 'outlook')!.tier
}

const TIER_RANK: Record<string, number> = {
  failed: 0,
  poor: 1,
  partial: 2,
  full: 3,
}

describe.each(SEED_NAMES)('CRASH OUTLOOK solvability: %s', (seedName) => {
  it('adversarial send-everything ends below tier 3', () => {
    const ctx = outlookContextForSeed(seedName)
    const { state } = driveOutlook(
      ctx,
      seedName,
      outlookAdversarialEnvelopes(),
    )
    const outlook = state.settled.find((s) => s.missionId === 'outlook')!
    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
    expect(outlook.metrics['required_delivered']!).toBeLessThan(3)
  })

  it('walkthrough reaches tier 3 with at least one spare backup slot', () => {
    const ctx = outlookContextForSeed(seedName)
    // Measure the backup capacity at the last active wake before the third
    // ack folds (stage-1 at offset 90s folds the +30s acks and settles the
    // mission): no backup send is ever issued, so the spare count is whole.
    const envelopes = outlookWalkthroughEnvelopes()
    // Dispatch the script, then sample the live substate just before the
    // folding wake, then settle.
    const sampled = driveOutlook(
      ctx,
      seedName,
      envelopes,
      OUTLOOK_T0 + 89_000,
    )
    expect(sampled.state.phase).toBe('mission')
    const sub = outlookSub(sampled.state)
    expect(sub.backupRemaining).toBeGreaterThanOrEqual(1)
    // Now carry that same live state to the deadline: it must settle
    // completed at the full tier.
    const settled = advanceCampaign(
      ctx,
      sampled.state,
      OUTLOOK_T0 + OUTLOOK_DURATION_MS + 1_000,
    )
    const emitted: EngineEvent[] = [...settled.emitted]
    const settlements = emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
    expect(tierOf(settled.state.settled)).toBe('full')
    const outlook = settled.state.settled.find((s) => s.missionId === 'outlook')!
    expect(outlook.metrics['required_delivered']).toBe(3)
  })

  it('trust-the-hints adversarial settles below tier 3 (decoys beat a naive player)', () => {
    const ctx = outlookContextForSeed(seedName)
    const { state } = driveOutlook(
      ctx,
      seedName,
      outlookTrustHintsEnvelopes(seedName),
    )
    const outlook = state.settled.find((s) => s.missionId === 'outlook')!
    // A player who routes by recipient hint and never reads a body cannot
    // satisfy all three: the live payroll head carries no hint. Below 3.
    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
    expect(outlook.metrics['required_delivered']!).toBeLessThan(3)
  })

  it('backup-spending walkthrough wins tier 3 with a real but finite margin (< 5 and >= 1)', () => {
    const ctx = outlookContextForSeed(seedName)
    const envelopes = outlookBackupWalkthroughEnvelopes()
    // Sample the LIVE substate just after the backup send (t0+95s) but
    // before the audit ack lands (~t0+215s): the audit backup slot is
    // already spent, two primary acks have folded, and the mission is
    // still running. This observes the real, finite margin.
    const sampled = driveOutlook(ctx, seedName, envelopes, OUTLOOK_T0 + 96_000)
    expect(sampled.state.phase).toBe('mission')
    const sub = outlookSub(sampled.state)
    expect(sub.backupRemaining).toBeLessThan(5)
    expect(sub.backupRemaining).toBeGreaterThanOrEqual(1)
    // Carry that same live state to the deadline: it must settle completed
    // at the full tier with the backup slot genuinely consumed.
    const settled = advanceCampaign(
      ctx,
      sampled.state,
      OUTLOOK_T0 + OUTLOOK_DURATION_MS + 1_000,
    )
    const outlook = settled.state.settled.find((s) => s.missionId === 'outlook')!
    expect(outlook.tier).toBe('full')
    expect(outlook.metrics['required_delivered']).toBe(3)
  })

  it('the walkthrough reads the audit message and surfaces the clue', () => {
    const ctx = outlookContextForSeed(seedName)
    const { state } = driveOutlook(
      ctx,
      seedName,
      outlookWalkthroughEnvelopes(),
    )
    expect(state.cluesFound.length).toBeGreaterThanOrEqual(1)
  })
})
