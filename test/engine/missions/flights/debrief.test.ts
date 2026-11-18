// Section-04 CI fixture: the debrief payload content per end cause. The debrief
// reports arrivals (resolved / on time / late / diverted), diversions, flights
// held, STRANDED passengers, and unresolved (stranded) flights, each on its own
// line; it names the GROUND ALL trade when taken; and its clue flag reflects the
// settled outcome's clue id. The engine-owned D-83 clue (via clueRecords,
// amendment 8) is asserted on the campaign cluesFound path, with and without an
// INSPECT_RECORD on the designated restriction record, logged exactly once; the
// module itself contributes no clue code. Walkthrough and adversarial debriefs
// differ in their outcome lines. All three authored seeds.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { DebriefPayload } from '@engine/missions/types'
import type { SettledOutcome } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import type { FlightsPayload } from '@engine/missions/flights/content'
import { FLIGHTS_ANCHORS_BY_SEED } from '@engine/missions/flights/payloads'
import {
  FLIGHTS_DURATION_MS,
  FLIGHTS_T0,
  flightsContextForSeed,
  flightsPayloadFor,
  groundAllAtStartFor,
  runScript,
  walkthroughFor,
} from './fixtures/index'

const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
const SETTLE_AT = ENDS_AT + 1_000

function startMission(ctx: EngineContext, seedName: string): CampaignState {
  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'flights' },
    FLIGHTS_T0,
  ).state
}

function flightsOutcome(state: CampaignState): SettledOutcome {
  return state.settled.find((s) => s.missionId === 'flights')!
}

function debriefFor(ctx: EngineContext, outcome: SettledOutcome): DebriefPayload {
  return ctx.missions['flights']!.debrief!(outcome)
}

/** The debrief line asserting a per-category count, matched by prefix. */
function lineStarting(debrief: DebriefPayload, prefix: string): string {
  return debrief.lines.find((l) => l.startsWith(prefix))!
}

describe.each(SEED_NAMES)('flights debrief fixture: %s', (seedName) => {
  it('debrief carries arrivals, diversions, held and heldFinal counts, stranded passengers, and unresolved flights for each end cause', () => {
    const ctx = flightsContextForSeed(seedName)
    const payload = flightsPayloadFor(seedName) as FlightsPayload

    // Cause 1: completed (the walkthrough). Every soul resolved, nothing held
    // or stranded.
    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
    const walkOutcome = flightsOutcome(walk.state)
    expect(walkOutcome.cause).toBe('completed')
    const walkDebrief = debriefFor(ctx, walkOutcome)
    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
    // Arrivals: a RESOLVED line and the on-time/late/diverted breakdown line.
    expect(lineStarting(walkDebrief, 'RESOLVED ')).toBe(`RESOLVED ${total} PASSENGERS`)
    const arrivalsLine = lineStarting(walkDebrief, 'ON TIME ')
    // Diversions appear in the arrivals breakdown line (the forced DIVERT).
    expect(arrivalsLine).toContain('DIVERTED ')
    expect(walkOutcome.metrics['diverted_passengers']!).toBeGreaterThan(0)
    // Held and stranded lines present, both zero for the clean walkthrough.
    expect(lineStarting(walkDebrief, 'HELD ')).toBe('HELD 0 FLIGHTS, 0 PASSENGERS')
    expect(lineStarting(walkDebrief, 'STRANDED ')).toBe('STRANDED 0 FLIGHTS, 0 PASSENGERS')

    // Cause 2: timeout with strandings. Leave everyone airborne (no routing) so
    // every flight strands at the deadline; the stranded line reports them.
    const timeoutRun = advanceCampaign(ctx, startMission(ctx, seedName), SETTLE_AT)
    const timeoutOutcome = flightsOutcome(timeoutRun.state)
    expect(timeoutOutcome.cause).toBe('timeout')
    const timeoutDebrief = debriefFor(ctx, timeoutOutcome)
    const strandLine = lineStarting(timeoutDebrief, 'STRANDED ')
    expect(strandLine).toContain(`${timeoutOutcome.metrics['stranded_flights']} FLIGHTS`)
    expect(strandLine).toContain(`${timeoutOutcome.metrics['stranded_passengers']} PASSENGERS`)
    expect(timeoutOutcome.metrics['stranded_flights']!).toBeGreaterThan(0)

    // Cause 3: forfeit with a held flight, so the HELD (heldFinal) line is
    // non-zero. HOLD the first flight, forfeit mid-run.
    let state = startMission(ctx, seedName)
    state = dispatch(
      ctx,
      state,
      { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: payload.flights[0]!.id } },
      FLIGHTS_T0 + 1_000,
    ).state
    state = advanceCampaign(ctx, state, FLIGHTS_T0 + 60_000).state
    const forfeit = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, FLIGHTS_T0 + 61_000)
    const forfeitOutcome = flightsOutcome(forfeit.state)
    expect(forfeitOutcome.cause).toBe('forfeit')
    const forfeitDebrief = debriefFor(ctx, forfeitOutcome)
    const heldLine = lineStarting(forfeitDebrief, 'HELD ')
    expect(forfeitOutcome.metrics['held_flights']).toBe(1)
    expect(heldLine).toContain('1 FLIGHTS')
    expect(heldLine).toContain(`${payload.flights[0]!.passengers} PASSENGERS`)

    // Cause 4: GROUND ALL (blanket). Names the trade, every flight heldFinal.
    const grounded = runScript(ctx, seedName, groundAllAtStartFor(seedName), { settleAt: SETTLE_AT })
    const groundedOutcome = flightsOutcome(grounded.state)
    const groundedDebrief = debriefFor(ctx, groundedOutcome)
    expect(groundedDebrief.lines).toContain('GROUND ALL FLIGHTS WAS ORDERED')
    expect(lineStarting(groundedDebrief, 'HELD ')).toBe(
      `HELD ${payload.flights.length} FLIGHTS, ${total} PASSENGERS`,
    )
  })

  it('clue status reflects whether the restriction record was inspected (engine clueRecords path, module contributes no clue)', () => {
    const ctx = flightsContextForSeed(seedName)
    const anchors = FLIGHTS_ANCHORS_BY_SEED[seedName]!

    // WITHOUT an INSPECT_RECORD: the clue never logs; the campaign cluesFound is
    // empty of it and the settled outcome carries no clue id, so the debrief
    // flag reads NOT FOUND.
    const noClue = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
    expect(noClue.state.cluesFound).not.toContain(anchors.clueId)
    const noClueOutcome = flightsOutcome(noClue.state)
    expect(noClueOutcome.clueId).toBeNull()
    expect(debriefFor(ctx, noClueOutcome).lines).toContain('CLUE NOT FOUND')

    // WITH an INSPECT_RECORD on the designated restriction record: the clue logs
    // exactly once via the engine clueRecords path, before settlement, and
    // survives into the post-mission campaign state.
    let state = startMission(ctx, seedName)
    const inspect = dispatch(
      ctx,
      state,
      { type: 'INSPECT_RECORD', recordId: anchors.restrictionRecordId },
      FLIGHTS_T0 + 2_000,
    )
    const clueEvents = inspect.emitted.filter((e) => e.type === 'clueFound')
    expect(clueEvents).toEqual([{ type: 'clueFound', clueId: anchors.clueId }])
    expect(inspect.state.cluesFound).toContain(anchors.clueId)
    // A second inspect logs nothing new (exactly once).
    const again = dispatch(
      ctx,
      inspect.state,
      { type: 'INSPECT_RECORD', recordId: anchors.restrictionRecordId },
      FLIGHTS_T0 + 3_000,
    )
    expect(again.emitted.filter((e) => e.type === 'clueFound')).toEqual([])
    // Carry to settlement: the clue survives even a failed (timeout) mission.
    state = advanceCampaign(ctx, again.state, SETTLE_AT).state
    expect(state.cluesFound).toContain(anchors.clueId)
    // The module contributes no clue code: its evaluate stamps no clue id on the
    // outcome (the clue is a campaign fact, not a mission outcome field).
    expect(flightsOutcome(state).clueId).toBeNull()
    expect(ctx.missions['flights']!.clues).toBeUndefined()
  })

  it('walkthrough and adversarial (blanket-grounding) debriefs differ in their outcome lines', () => {
    const ctx = flightsContextForSeed(seedName)
    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
    const grounded = runScript(ctx, seedName, groundAllAtStartFor(seedName), { settleAt: SETTLE_AT })
    const walkOutcome = flightsOutcome(walk.state)
    const groundedOutcome = flightsOutcome(grounded.state)
    const walkDebrief = debriefFor(ctx, walkOutcome)
    const groundedDebrief = debriefFor(ctx, groundedOutcome)

    // The two debriefs differ: different headline tier/cause, different resolved
    // and held lines, and only the grounding names the trade.
    expect(walkDebrief.lines).not.toEqual(groundedDebrief.lines)
    expect(walkDebrief.headline).not.toBe(groundedDebrief.headline)
    expect(lineStarting(walkDebrief, 'RESOLVED ')).not.toBe(
      lineStarting(groundedDebrief, 'RESOLVED '),
    )
    expect(lineStarting(walkDebrief, 'HELD ')).not.toBe(
      lineStarting(groundedDebrief, 'HELD '),
    )
    expect(groundedDebrief.lines).toContain('GROUND ALL FLIGHTS WAS ORDERED')
    expect(walkDebrief.lines).not.toContain('GROUND ALL FLIGHTS WAS ORDERED')
  })
})
