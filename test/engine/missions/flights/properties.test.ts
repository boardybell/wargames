// Section-04 mission-local property suite over the REAL engine lifecycle and
// the REAL flights module. The arbitrary generates sequences of valid-SHAPED
// actions (LAND, DIVERT, HOLD, RELEASE, GROUND_ALL, PROBE) at nondecreasing
// integer times inside the mission window, over the authored seed's flight and
// hub ids. Invalid-shaped actions are rejected by validate() (surfaced as
// dispatch rejections), never a crash, and every invariant holds over whatever
// subset the engine accepts:
//   - runway slot occupancy never goes negative (and never exceeds capacity);
//   - statuses only move forward along the lifecycle (terminal states absorb);
//   - every flight settles exactly once (a terminal status never changes);
//   - substate stays JSON-safe and round-trips saveSchema at every step;
//   - reducers never fold the projection (projectionDivergence is invariant
//     after init; appliedCorrection is a monotone storm-event counter, never
//     moved by a player action).
// Run count is modest (200) and the fast-check seed is pinned for a
// deterministic CI harness that replays any counterexample.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import * as v from 'valibot'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import type { FlightsPayload } from '@engine/missions/flights/content'
import { flightsSaveSchema } from '@engine/missions/flights/types'
import type { FlightStatus, FlightsState } from '@engine/missions/flights/types'
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
} from './fixtures/index'

const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
const FC_SEED = 0x0f117 // pinned per the deterministic split-01 harness convention

const TERMINAL = new Set<FlightStatus>([
  'landed',
  'landedLate',
  'divertedLanded',
  'stranded',
  'heldFinal',
])

/** The forward-rank of each status: a status may only move to a rank >= its
 *  own, with the sole legal regression RELEASE (held -> scheduled) handled
 *  explicitly. Terminal states share the top rank and never change. */
const RANK: Record<FlightStatus, number> = {
  scheduled: 0,
  airborne: 1,
  held: 1,
  heldFinal: 2,
  landed: 2,
  landedLate: 2,
  divertedLanded: 2,
  stranded: 2,
}

type GenAction =
  | { readonly kind: 'LAND'; readonly flightId: string; readonly hubId: string }
  | { readonly kind: 'DIVERT'; readonly flightId: string; readonly hubId: string }
  | { readonly kind: 'HOLD'; readonly flightId: string }
  | { readonly kind: 'RELEASE'; readonly flightId: string }
  | { readonly kind: 'GROUND_ALL' }
  | { readonly kind: 'PROBE'; readonly corridorId: string }

interface TimedGenAction {
  readonly action: GenAction
  /** Delta ms from mission start. Nondecreasing across the sequence. */
  readonly delta: number
}

function toCampaignAction(gen: GenAction): CampaignAction {
  switch (gen.kind) {
    case 'LAND':
      return { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId: gen.flightId, hubId: gen.hubId } }
    case 'DIVERT':
      return { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId: gen.flightId, hubId: gen.hubId } }
    case 'HOLD':
      return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: gen.flightId } }
    case 'RELEASE':
      return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId: gen.flightId } }
    case 'GROUND_ALL':
      return { type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }
    case 'PROBE':
      return { type: 'MISSION_ACTION', payload: { kind: 'PROBE', corridorId: gen.corridorId } }
  }
}

function startMission(ctx: EngineContext, seedName: string): CampaignState {
  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'flights' },
    FLIGHTS_T0,
  ).state
}

function sub(state: CampaignState): FlightsState | null {
  return (state.activeMission?.substate as FlightsState | undefined) ?? null
}

describe.each(SEED_NAMES)('flights rules properties: %s', (seedName) => {
  const payload = flightsPayloadFor(seedName) as FlightsPayload
  const flightIds = payload.flights.map((f) => f.id)
  const hubIds = payload.hubs.map((h) => h.id)
  const corridorIds = payload.corridors.map((c) => c.id)
  // Also feed some invalid-shaped ids so validate() rejection (not a crash) is
  // exercised: a bogus flight id and a bogus hub id.
  const flightArb = fc.constantFrom(...flightIds, 'ZZ99')
  const hubArb = fc.constantFrom(...hubIds, 'NOWHERE')
  const corridorArb = fc.constantFrom(...corridorIds, 'C-NONE')

  const genActionArb: fc.Arbitrary<GenAction> = fc.oneof(
    fc.tuple(flightArb, hubArb).map(([flightId, hubId]) => ({ kind: 'LAND' as const, flightId, hubId })),
    fc.tuple(flightArb, hubArb).map(([flightId, hubId]) => ({ kind: 'DIVERT' as const, flightId, hubId })),
    flightArb.map((flightId) => ({ kind: 'HOLD' as const, flightId })),
    flightArb.map((flightId) => ({ kind: 'RELEASE' as const, flightId })),
    fc.constant({ kind: 'GROUND_ALL' as const }),
    corridorArb.map((corridorId) => ({ kind: 'PROBE' as const, corridorId })),
  )

  const sequenceArb: fc.Arbitrary<TimedGenAction[]> = fc
    .array(
      fc.record({
        action: genActionArb,
        gap: fc.integer({ min: 0, max: 20_000 }),
      }),
      { minLength: 0, maxLength: 36 },
    )
    .map((entries) => {
      let delta = 0
      return entries.map(({ action, gap }) => {
        delta += gap
        return { action, delta }
      })
    })

  it('never negative runway capacity, never credits an unresolved flight, never settles twice, holding invariants hold; invalid actions rejected not crashing', () => {
    fc.assert(
      fc.property(sequenceArb, (sequence) => {
        const ctx = flightsContextForSeed(seedName)
        let state = startMission(ctx, seedName)
        let settlementCount = 0
        // Track the last-seen status per flight to prove forward-only motion and
        // exactly-once terminal settlement.
        const lastStatus = new Map<string, FlightStatus>()
        // Track projection-fold invariants from the init substate.
        const initSub = sub(state)!
        const initDivergence = initSub.projectionDivergence
        let lastAppliedCorrection = initSub.appliedCorrection

        const checkInvariants = (s: FlightsState): void => {
          // Runway occupancy: never negative, never above the hub's capacity.
          for (const hub of payload.hubs) {
            const used = s.runwayUse[hub.id] ?? 0
            expect(used).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(used)).toBe(true)
            expect(used).toBeLessThanOrEqual(hub.runwaySlots)
          }
          // Per-flight: forward-only motion, terminal absorption, no unresolved
          // credit (a terminal landing always has an inbound hub and arrival).
          for (const [id, fs] of Object.entries(s.flights)) {
            const prev = lastStatus.get(id)
            if (prev !== undefined && prev !== fs.status) {
              // A terminal status never changes (settles exactly once).
              expect(TERMINAL.has(prev)).toBe(false)
              // The only legal regression is RELEASE: held -> scheduled.
              if (RANK[fs.status] < RANK[prev]) {
                expect(prev).toBe('held')
                expect(fs.status).toBe('scheduled')
              }
            }
            // A credited landing is never an unresolved flight: a landed status
            // carries a real inbound hub and arrival stamp.
            if (
              fs.status === 'landed' ||
              fs.status === 'landedLate' ||
              fs.status === 'divertedLanded'
            ) {
              expect(fs.inboundHubId).not.toBeNull()
              expect(fs.arrivalAt).not.toBeNull()
              expect(Number.isInteger(fs.arrivalAt)).toBe(true)
            }
            lastStatus.set(id, fs.status)
          }
          // Projection-fold invariants: reducers never fold the projection.
          // projectionDivergence is set once at init and never moves; the
          // applied-correction counter is monotone non-decreasing (storm-event
          // driven only, never a player action).
          expect(s.projectionDivergence).toBe(initDivergence)
          expect(s.appliedCorrection).toBeGreaterThanOrEqual(lastAppliedCorrection)
          lastAppliedCorrection = s.appliedCorrection
          // JSON-safe and round-trips the reference-only save schema.
          const round = v.parse(flightsSaveSchema, JSON.parse(JSON.stringify(s)))
          expect(round).toEqual(s)
        }

        for (const { action, delta } of sequence) {
          const now = FLIGHTS_T0 + delta
          const result = dispatch(ctx, state, toCampaignAction(action), now)
          // Dispatch never throws: an invalid-shaped action is rejected, not a
          // crash, and leaves the substate intact.
          settlementCount += result.emitted.filter(
            (e) => e.type === 'settlement' && e.missionId === 'flights',
          ).length
          state = result.state
          const live = sub(state)
          if (live) checkInvariants(live)
        }

        // Advance past the deadline so settlement always fires if it has not.
        const advanced = advanceCampaign(ctx, state, ENDS_AT + 10_000)
        settlementCount += advanced.emitted.filter(
          (e) => e.type === 'settlement' && e.missionId === 'flights',
        ).length
        state = advanced.state

        // Settles exactly once over the whole run, regardless of the action tail.
        expect(settlementCount).toBe(1)
        expect(
          state.settled.filter((s) => s.missionId === 'flights'),
        ).toHaveLength(1)
        // Conservation at settlement: every soul lands in exactly one bucket.
        const outcome = state.settled.find((s) => s.missionId === 'flights')!
        const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
        const bucketed =
          outcome.metrics['on_time_passengers']! +
          outcome.metrics['late_passengers']! +
          outcome.metrics['diverted_passengers']! +
          outcome.metrics['stranded_passengers']! +
          outcome.metrics['held_passengers']!
        expect(bucketed).toBe(total)
      }),
      { numRuns: 200, seed: FC_SEED },
    )
  })
})
