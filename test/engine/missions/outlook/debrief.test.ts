// The debrief payload content checks. The debrief reports the three required
// deliveries individually (one line per kind), the decoy capacity spent as an
// integer, and a clue-found flag that matches cluesFound; and the walkthrough
// debrief differs from the adversarial debrief in all three fields (required
// outcomes, decoy spend, clue). All driven through the REAL engine and the
// REAL outlook module.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction } from '@engine/campaign/types'
import type { DebriefPayload } from '@engine/missions/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import { OUTLOOK_CLUE_ID } from '@engine/missions/outlook/module'
import {
  OUTLOOK_DURATION_MS,
  OUTLOOK_T0,
  adversarialScript,
  driveOutlook,
  outlookContextForSeed,
  walkthroughScript,
} from './fixtures/index'

const SEED = SEED_NAMES[0]!
const SETTLE_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS + 1_000

function startMission(ctx: EngineContext): CampaignState {
  const created = createCampaign(ctx, SEED, { extendedTime: false }, OUTLOOK_T0)
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

function debriefFor(ctx: EngineContext, state: CampaignState): DebriefPayload {
  const outcome = state.settled.find((s) => s.missionId === 'outlook')!
  return ctx.missions['outlook']!.debrief!(outcome)
}

function lineFor(debrief: DebriefPayload, kind: string): string {
  return debrief.lines.find((l) => l.startsWith(`REQUIRED ${kind}:`))!
}

describe('debrief payload', () => {
  it('reports the three required deliveries individually, one outcome per kind', () => {
    // A hand-built mix: weather CORRECT, payroll WRONG RECIPIENT, audit
    // WRONG VERSION (a superseded weather duplicate can never satisfy, so the
    // audit kind is left undelivered here and the wrong-version routing is
    // proven distinct below). This exercises three of the four outcomes in a
    // single debrief, one line per required kind.
    const ctx = outlookContextForSeed(SEED)
    let state = startMission(ctx)
    state = dispatch(ctx, state, send('M01', 'WEATHER_DESK'), OUTLOOK_T0 + 1_000).state
    state = dispatch(ctx, state, send('M04', 'WEATHER_DESK'), OUTLOOK_T0 + 2_000).state
    state = advanceCampaign(ctx, state, SETTLE_AT).state
    const debrief = debriefFor(ctx, state)

    // One line per required kind, each with exactly one outcome.
    expect(lineFor(debrief, 'WEATHER')).toBe('REQUIRED WEATHER: DELIVERED CORRECT')
    expect(lineFor(debrief, 'PAYROLL')).toBe('REQUIRED PAYROLL: DELIVERED TO WRONG DESK')
    expect(lineFor(debrief, 'AUDIT')).toBe('REQUIRED AUDIT: NOT DELIVERED')
  })

  it('a wrong-VERSION routing reads as not-delivered, distinct from a correct one', () => {
    // Route the SUPERSEDED weather duplicate (M02) to the correct desk: right
    // desk, wrong version. The debrief must NOT credit weather, so the
    // wrong-version case is distinguishable from the DELIVERED CORRECT case.
    const ctx = outlookContextForSeed(SEED)
    let state = startMission(ctx)
    state = dispatch(ctx, state, send('M02', 'WEATHER_DESK'), OUTLOOK_T0 + 1_000).state
    state = advanceCampaign(ctx, state, SETTLE_AT).state
    const debrief = debriefFor(ctx, state)
    expect(lineFor(debrief, 'WEATHER')).toBe('REQUIRED WEATHER: NOT DELIVERED')
    const outcome = state.settled.find((s) => s.missionId === 'outlook')!
    expect(outcome.metrics['weather_correct']).toBe(0)
    expect(outcome.metrics['weather_delivered']).toBe(0)
  })

  it('reports decoy capacity spent as an integer', () => {
    // Burn two backup slots on decoys/stale duplicates (M07 decoy, M02 stale
    // weather). The debrief reports the integer count.
    const ctx = outlookContextForSeed(SEED)
    let state = startMission(ctx)
    state = dispatch(ctx, state, send('M07', 'WEATHER_DESK', 'backup'), OUTLOOK_T0 + 1_000).state
    state = dispatch(ctx, state, send('M02', 'WEATHER_DESK', 'backup'), OUTLOOK_T0 + 2_000).state
    state = advanceCampaign(ctx, state, SETTLE_AT).state
    const debrief = debriefFor(ctx, state)
    const outcome = state.settled.find((s) => s.missionId === 'outlook')!
    const decoy = outcome.metrics['decoy_capacity_spent']!
    expect(Number.isInteger(decoy)).toBe(true)
    expect(decoy).toBe(2)
    expect(debrief.lines).toContain('DECOY CAPACITY SPENT 2')
  })

  it('reports a clue-found flag matching cluesFound', () => {
    const ctx = outlookContextForSeed(SEED)
    const state = startMission(ctx)
    // No audit read: no clue.
    const noClue = advanceCampaign(ctx, state, SETTLE_AT).state
    const noClueDebrief = debriefFor(ctx, noClue)
    expect(noClueDebrief.lines).toContain('CLUE NOT FOUND')
    expect(noClueDebrief.clueId).toBeNull()
    expect(noClue.cluesFound).not.toContain(OUTLOOK_CLUE_ID)

    // Read the audit message: clue found, flag and cluesFound agree.
    let withClue = startMission(ctx)
    withClue = dispatch(ctx, withClue, read('M05'), OUTLOOK_T0 + 1_000).state
    withClue = advanceCampaign(ctx, withClue, SETTLE_AT).state
    const clueDebrief = debriefFor(ctx, withClue)
    expect(clueDebrief.lines).toContain('CLUE FOUND')
    expect(clueDebrief.clueId).toBe(OUTLOOK_CLUE_ID)
    expect(withClue.cluesFound).toContain(OUTLOOK_CLUE_ID)
  })

  it('walkthrough debrief and adversarial debrief differ in all three fields', () => {
    const ctx = outlookContextForSeed(SEED)
    const walkthrough = driveOutlook(ctx, SEED, walkthroughScript(SEED))
    const adversarial = driveOutlook(ctx, SEED, adversarialScript(SEED))
    const wOutcome = walkthrough.state.settled.find((s) => s.missionId === 'outlook')!
    const aOutcome = adversarial.state.settled.find((s) => s.missionId === 'outlook')!
    const wDebrief = ctx.missions['outlook']!.debrief!(wOutcome)
    const aDebrief = ctx.missions['outlook']!.debrief!(aOutcome)

    // Field 1: the per-kind required-delivery outcomes differ.
    const wRequired = wDebrief.lines.filter((l) => l.startsWith('REQUIRED '))
    const aRequired = aDebrief.lines.filter((l) => l.startsWith('REQUIRED '))
    expect(wRequired).not.toEqual(aRequired)
    expect(wOutcome.metrics['required_delivered']).not.toBe(
      aOutcome.metrics['required_delivered'],
    )

    // Field 2: decoy capacity spent differs.
    expect(wOutcome.metrics['decoy_capacity_spent']).not.toBe(
      aOutcome.metrics['decoy_capacity_spent'],
    )

    // Field 3: clue found differs.
    expect(wDebrief.clueId).not.toBe(aDebrief.clueId)
    expect(wDebrief.lines).toContain('CLUE FOUND')
    expect(aDebrief.lines).toContain('CLUE NOT FOUND')
  })
})
