// Section-04 CI fixture: the max-consequence fold. With the capped inbound
// consequences folded (commsDelayed widening the projection divergence by its
// capped magnitude, paymentsDelayed removing one runway slot at the pinned
// target hub), the base walkthrough still reaches at least PARTIAL, and the
// authored alternate still reaches FULL. Consequence folding is order
// independent: the folded substate is identical across any permutation of the
// inbound consequence set. All three authored seeds.
import { describe, expect, it } from 'vitest'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { SettledOutcome } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  alternateFor,
  flightsContextForSeed,
  flightsPayloadFor,
  flightsSub,
  runScript,
  walkthroughFor,
} from './fixtures/index'

const TIER_RANK: Record<string, number> = {
  failed: 0,
  poor: 1,
  partial: 2,
  full: 3,
}

const SETTLE_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000

function tierOf(state: CampaignState): string {
  return state.settled.find((s) => s.missionId === 'flights')!.tier
}

/** A settled bank outcome carrying the two capped inbound consequences in a
 *  given order, so a START_MISSION folds them into flights init. */
function seedWithConsequences(
  state: CampaignState,
  order: ConsequenceKind[],
): CampaignState {
  const byKind = {
    paymentsDelayed: { id: 'cq-max-pay', kind: 'paymentsDelayed' as const, magnitude: 40 },
    commsDelayed: { id: 'cq-max-comms', kind: 'commsDelayed' as const, magnitude: 40 },
  }
  const outcome: SettledOutcome = {
    missionId: 'bank',
    cause: 'completed',
    tier: 'failed',
    settleSeq: 0,
    metrics: {},
    clueId: null,
    consequences: order.map((k) => byKind[k]),
  }
  return { ...state, settled: [outcome] }
}

describe.each(SEED_NAMES)('flights max-consequence fixture: %s', (seedName) => {
  it('base walkthrough under capped commsDelayed plus paymentsDelayed still reaches at least partial tier', () => {
    const ctx = flightsContextForSeed(seedName)
    const { state } = runScript(ctx, seedName, walkthroughFor(seedName), {
      settleAt: SETTLE_AT,
      maxConsequences: true,
    })
    const tier = tierOf(state)
    expect(TIER_RANK[tier]!).toBeGreaterThanOrEqual(TIER_RANK['partial']!)
  })

  it('authored full-tier alternate walkthrough wins at maximum penalty', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    const { state } = runScript(ctx, seedName, alternateFor(seedName), {
      settleAt: SETTLE_AT,
      maxConsequences: true,
    })
    const flights = state.settled.find((s) => s.missionId === 'flights')!
    expect(flights.tier).toBe('full')
    expect(flights.metrics['resolved_passengers']).toBe(total)
    expect(Number.isInteger(flights.metrics['resolved_passengers'])).toBe(true)
  })

  it('consequence folding is order-independent: folded substate strict-deep-equals across EVERY permutation', () => {
    const ctx = flightsContextForSeed(seedName)
    // ALL permutations of the inbound consequence set, not two hand-picked
    // orderings: a genuine order-independence property. The engine's canonical
    // fold must produce byte-identical folded substate regardless of input order.
    const orders = permutations<ConsequenceKind>(['paymentsDelayed', 'commsDelayed'])
    const foldedSubstates: FlightsState[] = orders.map((order) =>
      startAndReadSub(ctx, seedName, order),
    )
    for (const sub of foldedSubstates) {
      expect(sub).toStrictEqual(foldedSubstates[0])
    }
    // The fold genuinely took effect: a runway slot is phantom-occupied at the
    // pinned hub and the projection divergence widened. Integer facts.
    const pinned = (flightsPayloadFor(seedName) as FlightsPayload)
      .paymentsDelayedTargetHubId
    expect(foldedSubstates[0]!.runwayUse[pinned]).toBe(1)
    expect(Number.isInteger(foldedSubstates[0]!.projectionDivergence)).toBe(true)
    expect(foldedSubstates[0]!.projectionDivergence).toBeGreaterThan(0)
  })

  it('duplicate-kind consequences fold identically regardless of order (canonical cap applies)', () => {
    const ctx = flightsContextForSeed(seedName)
    // Two of the SAME kind plus the other: all orderings must fold to one
    // identical substate. The canonical fold caps each kind, so a duplicate
    // kind cannot double-count or depend on its position.
    const dupOrders = permutations<ConsequenceKind>([
      'paymentsDelayed',
      'paymentsDelayed',
      'commsDelayed',
    ])
    const foldedDup: FlightsState[] = dupOrders.map((order) =>
      startAndReadSub(ctx, seedName, order),
    )
    for (const sub of foldedDup) {
      expect(sub).toStrictEqual(foldedDup[0])
    }
    const pinned = (flightsPayloadFor(seedName) as FlightsPayload)
      .paymentsDelayedTargetHubId
    expect(foldedDup[0]!.runwayUse[pinned]).toBe(1)
  })

  it('empty consequence set folds to the no-consequence baseline substate', () => {
    const ctx = flightsContextForSeed(seedName)
    // No inbound consequences: the folded substate equals the untouched init,
    // so the pinned hub carries no phantom occupancy and divergence stays 0.
    const sub = startAndReadSub(ctx, seedName, [])
    const pinned = (flightsPayloadFor(seedName) as FlightsPayload)
      .paymentsDelayedTargetHubId
    expect(sub.runwayUse[pinned] ?? 0).toBe(0)
    expect(sub.projectionDivergence).toBe(0)
  })
})

type ConsequenceKind = 'paymentsDelayed' | 'commsDelayed'

/** Every permutation of `items` (Heap's algorithm, deterministic order). */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  const out: T[][] = []
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)]
    for (const tail of permutations(rest)) {
      out.push([item, ...tail])
    }
  })
  return out
}

/** Create a campaign, seed the bank consequences in `order`, start the flights
 *  mission through the real engine, and read the folded substate. */
function startAndReadSub(
  ctx: EngineContext,
  seedName: string,
  order: ConsequenceKind[],
): FlightsState {
  const base = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
  const seeded = seedWithConsequences(base, order)
  const started = dispatch(
    ctx,
    seeded,
    { type: 'START_MISSION', missionId: 'flights' },
    FLIGHTS_T0,
  ).state
  return flightsSub(started) as FlightsState
}
