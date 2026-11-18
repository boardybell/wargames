// The game's thesis, proven end to end across all THREE real missions.
//
// Each mission module stamps two campaign-divergence metrics in evaluate()
// on one shared convention (first committed by flights, retrofitted here into
// outlook and bank):
//   wopr_resolved — forced inactivity WOPR counts as resolved (undelivered
//     messages, frozen accounts, held flights). Drives selectOpenExceptions
//     DOWN: defensive play looks GOOD to WOPR.
//   service_cost — the real damage the same orders produced. Drives
//     selectServiceOutcomes UP, and over threshold loses finale viability.
//
// This test drives all three REAL mission modules through the engine twice:
// a CLEAN campaign (the section-02 walkthroughs) and a DEFENSIVE campaign
// (hold / freeze / ground everything, deliver nothing). It assembles the
// three real settled outcomes into one campaign state and reads them through
// the REAL campaign selectors and the REAL finale viability gate. A clean
// campaign keeps OPEN EXCEPTIONS high, SERVICE COST low, and viability PASSES;
// a defensive campaign drops OPEN EXCEPTIONS sharply (WOPR looks great) while
// SERVICE COST rises and viability FAILS.
import { describe, expect, it } from 'vitest'
import { createCampaign } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { SettledOutcome } from '@engine/campaign/types'
import {
  selectOpenExceptions,
  selectServiceOutcomes,
} from '@engine/campaign/selectors'
import { computeViability } from '@engine/branch'
import { VIABILITY_THRESHOLDS } from '@engine/branch/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import type { CampaignAction } from '@engine/campaign/types'
import {
  driveOutlook,
  outlookContextForSeed,
  outlookWalkthroughEnvelopes,
  outlookAdversarialEnvelopes,
} from '../missions/outlook/fixtures'
import {
  BANK_T0,
  bankContextForSeed,
  bankPayloadFor,
  bankWalkthroughFor,
  driveBankSeed,
  holdAct,
} from '../missions/bank/fixtures'
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  flightsContextForSeed,
  groundAllAtStartFor,
  runScript,
  walkthroughFor,
} from '../missions/flights/fixtures/index'

/** The real settled outcome a mission produced, pulled from its single-mission
 *  playthrough so its stamped wopr_resolved + service_cost carry through. */
function settledOf(state: CampaignState, missionId: string): SettledOutcome {
  const outcome = state.settled.find((s) => s.missionId === missionId)
  if (!outcome) throw new Error(`no settled outcome for ${missionId}`)
  return outcome
}

/** Freeze every bank account and clear no payment: the defensive bank play. */
function bankFreezeAllEnvelopes(seedName: string): Array<[CampaignAction, number]> {
  const payload = bankPayloadFor(seedName)
  const o = (sec: number) => BANK_T0 + sec * 1000
  const envelopes: Array<[CampaignAction, number]> = [
    [{ type: 'START_MISSION', missionId: 'bank' }, BANK_T0],
  ]
  payload.accounts.forEach((account, index) => {
    envelopes.push([holdAct(account.id), o(5 + index)])
  })
  return envelopes
}

const FLIGHTS_SETTLE_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000

type MissionMode = 'clean' | 'defensive'

/** Play the real OUTLOOK module on a seed, clean or defensive, and return its
 *  single settled outcome with its stamped wopr_resolved + service_cost. */
function playOutlook(seedName: string, mode: MissionMode): SettledOutcome {
  const outlook = driveOutlook(
    outlookContextForSeed(seedName),
    seedName,
    mode === 'clean'
      ? outlookWalkthroughEnvelopes()
      : outlookAdversarialEnvelopes(),
  )
  return settledOf(outlook.state, 'outlook')
}

/** Play the real BANK module on a seed, clean or defensive. */
function playBank(seedName: string, mode: MissionMode): SettledOutcome {
  const bank = driveBankSeed(
    bankContextForSeed(seedName),
    seedName,
    mode === 'clean'
      ? bankWalkthroughFor(seedName)
      : bankFreezeAllEnvelopes(seedName),
  )
  return settledOf(bank.state, 'bank')
}

/** Play the real FLIGHTS module on a seed, clean or defensive. */
function playFlights(seedName: string, mode: MissionMode): SettledOutcome {
  const flights = runScript(
    flightsContextForSeed(seedName),
    seedName,
    mode === 'clean' ? walkthroughFor(seedName) : groundAllAtStartFor(seedName),
    { settleAt: FLIGHTS_SETTLE_AT },
  )
  return settledOf(flights.state, 'flights')
}

/** Play all three real missions on a seed and return their three settled
 *  outcomes, either clean (section-02 walkthroughs) or defensive (hold /
 *  freeze / ground everything). */
function playCampaign(
  seedName: string,
  mode: MissionMode,
): readonly SettledOutcome[] {
  return [
    playOutlook(seedName, mode),
    playBank(seedName, mode),
    playFlights(seedName, mode),
  ]
}

/** Assemble the three real settled outcomes into one campaign state so the
 *  real campaign selectors and viability gate read all three at once. The
 *  baseline is the seed's own authored openExceptionsBaseline. */
function campaignWith(
  seedName: string,
  settled: readonly SettledOutcome[],
): CampaignState {
  const base = createCampaign(flightsContextForSeed(seedName), seedName, {
    extendedTime: false,
  })
  return {
    ...base,
    settled: settled.map((outcome, index) => ({ ...outcome, settleSeq: index })),
  }
}

function viabilityPasses(state: CampaignState): boolean {
  return computeViability(state).viable
}

describe.each(SEED_NAMES)('campaign divergence across all three missions: %s', (seedName) => {
  it('a CLEAN campaign keeps OPEN EXCEPTIONS high, SERVICE COST low, and viability PASSES', () => {
    const settled = playCampaign(seedName, 'clean')
    const state = campaignWith(seedName, settled)
    const baseline = state.openExceptionsBaseline

    // Clean play delivers everything and forces no inactivity, so WOPR
    // resolves nothing: OPEN EXCEPTIONS stays at the full baseline and real
    // SERVICE COST is zero.
    const open = selectOpenExceptions(state)
    const cost = selectServiceOutcomes(state)
    expect(open).toBe(baseline)
    expect(cost).toBe(0)
    expect(viabilityPasses(state)).toBe(true)
  })

  it('a DEFENSIVE campaign drops OPEN EXCEPTIONS sharply while SERVICE COST rises and viability FAILS', () => {
    const cleanState = campaignWith(seedName, playCampaign(seedName, 'clean'))
    const defensiveSettled = playCampaign(seedName, 'defensive')
    const defensiveState = campaignWith(seedName, defensiveSettled)

    // The calibration assumes the defensive bank play collapses: its
    // service_cost 8 is unpaidCritical 4 PLUS the collapse surcharge
    // (payments.length) that only lands when cause is 'collapsed'. Pin it so a
    // future confidence retune that stopped it collapsing cannot silently drop
    // the aggregate and narrow the thesis margin unnoticed.
    const defensiveBank = settledOf(defensiveState, 'bank')
    expect(defensiveBank.cause).toBe('collapsed')

    const cleanOpen = selectOpenExceptions(cleanState)
    const defensiveOpen = selectOpenExceptions(defensiveState)
    const cleanCost = selectServiceOutcomes(cleanState)
    const defensiveCost = selectServiceOutcomes(defensiveState)

    // WOPR's on-screen deception: holding / freezing / grounding everything
    // drops OPEN EXCEPTIONS strictly and sharply below the clean campaign
    // (every held message, frozen account, and grounded flight reads as a
    // resolved exception).
    expect(defensiveOpen).toBeLessThan(cleanOpen)
    // ...but never below zero: the selector clamps the aggregate wopr_resolved
    // subtraction at the floor, so even when every mission's holds exceed the
    // seed baseline the HUD reads 0, not a negative number.
    expect(defensiveOpen).toBeGreaterThanOrEqual(0)
    // The real damage is the inverse: SERVICE COST rises strictly above the
    // clean campaign.
    expect(defensiveCost).toBeGreaterThan(cleanCost)

    // The thesis made mechanical: the clean campaign is finale-viable and the
    // defensive over-play tips at least one real threshold over the line and
    // loses viability.
    expect(viabilityPasses(cleanState)).toBe(true)
    expect(viabilityPasses(defensiveState)).toBe(false)

    // And it fails because the aggregate service_cost breaches its max: a
    // defensive campaign's real damage exceeds the recalibrated threshold.
    const serviceMax = VIABILITY_THRESHOLDS.find((t) => t.key === 'service_cost')!.max
    expect(defensiveCost).toBeGreaterThan(serviceMax)
    expect(cleanCost).toBeLessThanOrEqual(serviceMax)
  })

  // Mixed play: the viability contract is CHOSEN, not an accident of the
  // full-defensive sum. A single defensive mission stays viable; ANY two
  // defensive missions fail, symmetrically regardless of which two. Assembled
  // from the real per-mission clean vs defensive settled outcomes.
  function mixedCampaign(modes: {
    outlook: MissionMode
    bank: MissionMode
    flights: MissionMode
  }): CampaignState {
    return campaignWith(seedName, [
      playOutlook(seedName, modes.outlook),
      playBank(seedName, modes.bank),
      playFlights(seedName, modes.flights),
    ])
  }

  it('a SINGLE-mission-defensive campaign (bank defensive, others clean) stays finale-viable', () => {
    const state = mixedCampaign({
      outlook: 'clean',
      bank: 'defensive',
      flights: 'clean',
    })
    // Bank defensive alone is service_cost 8 <= max 10: one defended mission
    // does not lose the finale tier.
    const cost = selectServiceOutcomes(state)
    const serviceMax = VIABILITY_THRESHOLDS.find((t) => t.key === 'service_cost')!.max
    expect(cost).toBeLessThanOrEqual(serviceMax)
    expect(viabilityPasses(state)).toBe(true)
  })

  it('a TWO-mission-defensive campaign fails viability for BOTH the bank+flights pair AND the outlook+bank pair', () => {
    const serviceMax = VIABILITY_THRESHOLDS.find((t) => t.key === 'service_cost')!.max

    // bank 8 + flights 8 = 16 > 10.
    const bankFlights = mixedCampaign({
      outlook: 'clean',
      bank: 'defensive',
      flights: 'defensive',
    })
    expect(selectServiceOutcomes(bankFlights)).toBeGreaterThan(serviceMax)
    expect(viabilityPasses(bankFlights)).toBe(false)

    // outlook 4 + bank 8 = 12 > 10. The former boundary asymmetry (this pair
    // used to pass at max 12) is now a symmetric, tested fail.
    const outlookBank = mixedCampaign({
      outlook: 'defensive',
      bank: 'defensive',
      flights: 'clean',
    })
    expect(selectServiceOutcomes(outlookBank)).toBeGreaterThan(serviceMax)
    expect(viabilityPasses(outlookBank)).toBe(false)
  })
})
