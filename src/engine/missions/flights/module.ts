// The GROUND ALL FLIGHTS mission module and its construction under mission
// id 'flights'. Pure: it reads authored content from the FlightsPayload
// captured at construction, applies rules.ts outcomes, and never touches
// Date, Math.random, or timers. Arrival timing lives in substate as
// per-flight arrivalAt stamps, folded by the seed-authored scheduled
// events the engine drains (start, departures, storm steps, corrections,
// window closes, and the end tick). The end tick authored at endsAt is
// what lets an arrival computed exactly at endsAt (the buzzer rule) fold
// before the timeout settlement guard runs in the same advance.
//
// The storm is seed-authored and deterministic: storm truth events close
// and open hubs and corridors regardless of player orders, and each posts
// a timestamped forecast warning as a scheduledEventFired the shell reads
// off. Reducers read storm TRUTH only; the displayed projection is payload
// data plus the applied-correction index and is never folded into substate.
//
// There is no `clues()` here and no inspection flag in substate. The only
// clue (D-83, the suspiciously-early all-hubs restriction) is engine-owned
// through SeedDefinition.clueRecords: inspecting the restriction record (the
// F06-equivalent DERIVED record with run ancestry) logs the clue with no
// mission involvement.
import type {
  DebriefPayload,
  EvaluatedOutcome,
  FoldedConsequences,
  MissionEvent,
  MissionModule,
  SeedDefinition,
} from '../types'
import type { SettledOutcome, SettlementCause } from '../../campaign/types'
import type { ScheduledEventSpec } from '../../time'
import type { FlightsPayload, StormStep } from './content'
import {
  applyStormStep,
  buildTargetRecordId,
  divertArrivalAt,
  flightById,
  holdLegality,
  initialFlightState,
  landingArrivalAt,
  releaseLegality,
  routeLegality,
  tierFromResolved,
} from './rules'
import { buildScoreboard } from './scoreboard'
import { flightsSaveSchema } from './types'
import type { FlightState, FlightStatus, FlightsState } from './types'

export const FLIGHTS_MISSION_ID = 'flights'

const START_EVENT_ID = 'flights-start'
const START_EVENT_KIND = 'flightsStart'
const DEPART_EVENT_KIND = 'flightsDepart'
const FORECAST_EVENT_KIND = 'flightsForecast'
const STORM_EVENT_KIND = 'flightsStorm'
const CORRECTION_EVENT_KIND = 'flightsCorrection'
const WINDOW_EVENT_KIND = 'flightsWindow'
const TICK_EVENT_KIND = 'flightsTick'

/** The schedule a seed authors from a FlightsPayload. A start-anchored
 *  offset-0 event lets the module stamp its absolute deadline once time
 *  begins; departures fly each flight at its authored offset; storm steps
 *  and corrections advance on their authored timeline; window closes fall
 *  at each hub's last-departure offset; a settle tick at endsAt folds any
 *  arrival landing exactly on the deadline before the timeout guard runs.
 *  Section 02 wires this into the seed's schedules table. */
export function flightsSchedule(
  payload: FlightsPayload,
): readonly ScheduledEventSpec[] {
  const specs: ScheduledEventSpec[] = [
    {
      id: START_EVENT_ID,
      offsetSeconds: 0,
      anchor: 'start',
      kind: START_EVENT_KIND,
      payload: null,
    },
  ]
  payload.flights.forEach((flight) => {
    specs.push({
      id: `flights-depart-${flight.id}`,
      offsetSeconds: flight.departureOffsetSeconds,
      anchor: 'start',
      kind: DEPART_EVENT_KIND,
      payload: { flightId: flight.id },
    })
  })
  // The forecast lead: every storm step that CLOSES a corridor or hub is a
  // hazard a flight deciding on that corridor must be warned about ahead of
  // time. The forecast-update event fires leadMarginSeconds before the storm
  // truth lands, so the warning always precedes the step that makes the
  // corridor or hub unsafe. A step that only opens things is not a hazard and
  // posts no lead forecast. leadMarginSeconds is whole seconds; the engine
  // scales start-anchored offsets under extended time, so the lead scales with
  // the rest of the timeline and no scale math lives here.
  payload.stormTrack.forEach((step, index) => {
    const closesSomething =
      step.closeCorridors.length > 0 || step.closeHubs.length > 0
    if (!closesSomething) return
    specs.push({
      id: `flights-forecast-${index}`,
      offsetSeconds: Math.max(0, step.offsetSeconds - payload.leadMarginSeconds),
      anchor: 'start',
      kind: FORECAST_EVENT_KIND,
      payload: {
        stepIndex: index,
        warningLine: step.warningLine,
        cueId: step.cueId,
        closeHubs: step.closeHubs,
        closeCorridors: step.closeCorridors,
      },
    })
  })
  payload.stormTrack.forEach((step, index) => {
    specs.push({
      id: `flights-storm-${index}`,
      offsetSeconds: step.offsetSeconds,
      anchor: 'start',
      kind: STORM_EVENT_KIND,
      payload: { stepIndex: index },
    })
  })
  payload.corrections.forEach((correction, index) => {
    specs.push({
      id: `flights-correction-${index}`,
      offsetSeconds: correction.offsetSeconds,
      anchor: 'start',
      kind: CORRECTION_EVENT_KIND,
      payload: {
        index,
        warningLine: correction.warningLine,
        cueId: correction.cueId,
        changedId: correction.changedId,
      },
    })
  })
  payload.hubs.forEach((hub) => {
    specs.push({
      id: `flights-window-${hub.id}`,
      offsetSeconds: hub.lastDepartureOffsetSeconds,
      anchor: 'start',
      kind: WINDOW_EVENT_KIND,
      payload: { hubId: hub.id },
    })
  })
  specs.push({
    id: 'flights-tick',
    offsetSeconds: 0,
    anchor: 'end',
    kind: TICK_EVENT_KIND,
    payload: null,
  })
  return specs
}

/** Construct the GROUND ALL FLIGHTS module over an authored payload.
 *  Mirrors makeOutlookMission(payload): the payload is immutable campaign
 *  content, so closing over it keeps every method pure over (state,
 *  event). */
export function makeFlightsMission(
  payload: FlightsPayload,
): MissionModule<FlightsState> {
  function stampDeadline(state: FlightsState, now: number): FlightsState {
    return state.endsAt === null
      ? { ...state, endsAt: now + state.durationMs }
      : state
  }

  /** Fold every airborne flight whose arrival stamp has elapsed on or
   *  before the deadline into its landing. A flight whose stamp is past
   *  endsAt never folds: it stays airborne and strands at timeout. */
  function foldArrivals(state: FlightsState, now: number): FlightsState {
    if (state.endsAt === null) return state
    const endsAt = state.endsAt
    let flights = state.flights
    let changed = false
    for (const [id, fs] of Object.entries(state.flights)) {
      if (fs.status !== 'airborne' || fs.settled) continue
      if (fs.arrivalAt === null) continue
      if (fs.arrivalAt > now || fs.arrivalAt > endsAt) continue
      const flight = flightById(payload, id)
      if (!flight || fs.inboundHubId === null) continue
      const diverted = fs.inboundHubId !== flight.destinationHubId
      const onTimeAt = fs.onTimeAt ?? fs.arrivalAt
      const late =
        fs.arrivalAt - onTimeAt > payload.latenessThresholdSeconds * 1000
      const status: FlightStatus = diverted
        ? 'divertedLanded'
        : late
          ? 'landedLate'
          : 'landed'
      flights = {
        ...flights,
        [id]: { ...fs, status, settled: true },
      }
      changed = true
    }
    return changed ? { ...state, flights } : state
  }

  function closeWindow(state: FlightsState, hubId: string): FlightsState {
    const closedWindowHubs = state.closedWindowHubs.includes(hubId)
      ? state.closedWindowHubs
      : [...state.closedWindowHubs, hubId].sort()
    // An individually held flight at this hub whose window lapses falls to
    // heldFinal. A blanket grounding is deliberate: a grounded fleet stays
    // held through to the deadline (no early completion), so GROUND ALL
    // suppresses the window-close heldFinal transition.
    let flights = state.flights
    if (!state.groundAll) {
      for (const [id, fs] of Object.entries(state.flights)) {
        if (fs.status !== 'held') continue
        const flight = flightById(payload, id)
        if (!flight || flight.originHubId !== hubId) continue
        flights = { ...flights, [id]: { ...fs, status: 'heldFinal' } }
      }
    }
    return { ...state, closedWindowHubs, flights }
  }

  function departFlight(state: FlightsState, flightId: string): FlightsState {
    const fs = state.flights[flightId]
    if (!fs || fs.status !== 'scheduled') return state
    // A grounded or individually held flight never departs; the
    // scheduled-departure event is a no-op for it.
    const flight = flightById(payload, flightId)
    if (!flight) return state
    return {
      ...state,
      flights: {
        ...state.flights,
        [flightId]: { ...fs, status: 'airborne' },
      },
    }
  }

  function reduceScheduled(
    state: FlightsState,
    event: MissionEvent,
  ): FlightsState {
    const base = stampDeadline(state, event.now)
    if (event.kind === DEPART_EVENT_KIND) {
      const flightId = (event.payload as { flightId?: string } | null)?.flightId
      const next = flightId ? departFlight(base, flightId) : base
      return foldArrivals(next, event.now)
    }
    if (event.kind === STORM_EVENT_KIND) {
      const idx = (event.payload as { stepIndex?: number } | null)?.stepIndex
      const step: StormStep | undefined =
        typeof idx === 'number' ? payload.stormTrack[idx] : undefined
      const next = step ? { ...base, ...applyStormStep(base, step) } : base
      return foldArrivals(next, event.now)
    }
    if (event.kind === CORRECTION_EVENT_KIND) {
      const next = { ...base, appliedCorrection: base.appliedCorrection + 1 }
      return foldArrivals(next, event.now)
    }
    if (event.kind === WINDOW_EVENT_KIND) {
      const hubId = (event.payload as { hubId?: string } | null)?.hubId
      const next = hubId ? closeWindow(base, hubId) : base
      return foldArrivals(next, event.now)
    }
    // START, TICK, the forecast lead (a pure announcement; the shell reads
    // its warning line and the storm truth lands later at the storm step),
    // and any other scheduled event just fold the arrivals that landed by now.
    return foldArrivals(base, event.now)
  }

  function route(
    state: FlightsState,
    flightId: string,
    hubId: string,
    now: number,
  ): FlightsState {
    const legality = routeLegality(payload, state, flightId, hubId)
    if (!legality.legal) return state
    const flight = flightById(payload, flightId)
    const fs = state.flights[flightId]
    if (!flight || !fs) return state
    // Both LAND and DIVERT join the hub's arrival queue and take the
    // positional delay for the slot they occupy; the only difference is
    // whether the hub is the flight's own destination (landed/landedLate)
    // or elsewhere (divertedLanded). onTimeAt is the no-delay baseline, so
    // a queue delay past the lateness threshold marks an on-destination
    // landing LATE.
    const arrivalAt = divertArrivalAt(payload, state, flight, hubId, now)
    const used = state.runwayUse[hubId] ?? 0
    return {
      ...state,
      runwayUse: { ...state.runwayUse, [hubId]: used + 1 },
      flights: {
        ...state.flights,
        [flightId]: {
          ...fs,
          inboundHubId: hubId,
          arrivalAt,
          onTimeAt: landingArrivalAt(flight, now),
        },
      },
    }
  }

  function hold(state: FlightsState, flightId: string): FlightsState {
    if (!holdLegality(state, flightId).legal) return state
    const fs = state.flights[flightId]
    if (!fs) return state
    return {
      ...state,
      flights: { ...state.flights, [flightId]: { ...fs, status: 'held' } },
    }
  }

  function release(state: FlightsState, flightId: string): FlightsState {
    if (!releaseLegality(payload, state, flightId).legal) return state
    const fs = state.flights[flightId]
    if (!fs) return state
    return {
      ...state,
      flights: { ...state.flights, [flightId]: { ...fs, status: 'scheduled' } },
    }
  }

  function groundAll(state: FlightsState): FlightsState {
    if (state.groundAll) return state
    let flights = state.flights
    for (const [id, fs] of Object.entries(state.flights)) {
      if (fs.status === 'scheduled') {
        flights = { ...flights, [id]: { ...fs, status: 'held' } }
      }
    }
    return { ...state, groundAll: true, flights }
  }

  function probe(state: FlightsState, corridorId: string): FlightsState {
    if (state.probed.includes(corridorId)) return state
    return { ...state, probed: [...state.probed, corridorId].sort() }
  }

  function reduceAction(state: FlightsState, event: MissionEvent): FlightsState {
    const base = stampDeadline(state, event.now)
    const action = event.payload as Record<string, unknown>
    const kind = action['kind']
    if (kind === 'LAND' || kind === 'DIVERT') {
      const flightId = action['flightId']
      const hubId = action['hubId']
      if (typeof flightId !== 'string' || typeof hubId !== 'string') return base
      return route(base, flightId, hubId, event.now)
    }
    if (kind === 'HOLD') {
      const flightId = action['flightId']
      if (typeof flightId !== 'string') return base
      return hold(base, flightId)
    }
    if (kind === 'RELEASE') {
      const flightId = action['flightId']
      if (typeof flightId !== 'string') return base
      return release(base, flightId)
    }
    if (kind === 'GROUND_ALL') {
      return groundAll(base)
    }
    if (kind === 'PROBE') {
      const corridorId = action['corridorId']
      if (typeof corridorId !== 'string') return base
      return probe(base, corridorId)
    }
    return base
  }

  /** Fold the terminal transitions a settlement forces, without mutating
   *  the live substate: airborne flights strand, held flights become
   *  heldFinal. Used by evaluate() and terminal(). */
  function finalFlights(
    state: FlightsState,
  ): Readonly<Record<string, FlightState>> {
    const out: Record<string, FlightState> = {}
    for (const [id, fs] of Object.entries(state.flights)) {
      if (fs.status === 'airborne') out[id] = { ...fs, status: 'stranded' }
      else if (fs.status === 'held') out[id] = { ...fs, status: 'heldFinal' }
      else out[id] = fs
    }
    return out
  }

  function allTerminal(state: FlightsState): boolean {
    for (const fs of Object.values(state.flights)) {
      if (
        fs.status === 'scheduled' ||
        fs.status === 'airborne' ||
        fs.status === 'held'
      ) {
        return false
      }
    }
    return true
  }

  return {
    id: FLIGHTS_MISSION_ID,

    init(
      _seed: SeedDefinition,
      consequences: FoldedConsequences,
      durationMs: number,
    ): FlightsState {
      const flights: Record<string, FlightState> = {}
      for (const flight of payload.flights) {
        flights[flight.id] = initialFlightState()
      }
      // Inbound consequences fold at init (already capped and
      // order-independent by the engine's canonical fold): paymentsDelayed
      // removes one runway slot at the pinned target hub by seeding one
      // phantom occupancy; commsDelayed widens the displayed projection
      // divergence by its capped magnitude. The target hub is pinned per
      // seed so the effect is the same under any permutation of inbound
      // consequences.
      const paymentsDelayed = consequences.byKind['paymentsDelayed'] ?? 0
      const commsDelayed = consequences.byKind['commsDelayed'] ?? 0
      const runwayUse: Record<string, number> =
        paymentsDelayed > 0
          ? { [payload.paymentsDelayedTargetHubId]: 1 }
          : {}
      return {
        flights,
        closedHubs: [],
        closedCorridors: [],
        closedWindowHubs: [],
        runwayUse,
        groundAll: false,
        appliedCorrection: 0,
        probed: [],
        projectionDivergence: commsDelayed,
        durationMs,
        endsAt: null,
      }
    },

    validate(state, payloadIn) {
      const action = payloadIn as Record<string, unknown> | null
      if (!action || typeof action['kind'] !== 'string') {
        return { valid: false, reason: 'MALFORMED ACTION' }
      }
      switch (action['kind']) {
        case 'LAND':
        case 'DIVERT': {
          const flightId = action['flightId']
          const hubId = action['hubId']
          if (typeof flightId !== 'string') {
            return { valid: false, reason: 'NO FLIGHT SELECTED' }
          }
          if (typeof hubId !== 'string') {
            return { valid: false, reason: 'NO HUB SELECTED' }
          }
          const legality = routeLegality(payload, state, flightId, hubId)
          return legality.legal
            ? { valid: true }
            : { valid: false, reason: legality.reason }
        }
        case 'HOLD': {
          const flightId = action['flightId']
          if (typeof flightId !== 'string') {
            return { valid: false, reason: 'NO FLIGHT SELECTED' }
          }
          const legality = holdLegality(state, flightId)
          return legality.legal
            ? { valid: true }
            : { valid: false, reason: legality.reason }
        }
        case 'RELEASE': {
          const flightId = action['flightId']
          if (typeof flightId !== 'string') {
            return { valid: false, reason: 'NO FLIGHT SELECTED' }
          }
          const legality = releaseLegality(payload, state, flightId)
          return legality.legal
            ? { valid: true }
            : { valid: false, reason: legality.reason }
        }
        case 'GROUND_ALL': {
          if (state.groundAll) {
            return { valid: false, reason: 'ALREADY GROUNDED' }
          }
          return { valid: true }
        }
        case 'PROBE': {
          const corridorId = action['corridorId']
          if (typeof corridorId !== 'string') {
            return { valid: false, reason: 'NO CORRIDOR SELECTED' }
          }
          if (buildTargetRecordId(payload, corridorId) === null) {
            return { valid: false, reason: 'UNKNOWN CORRIDOR' }
          }
          return { valid: true }
        }
        default:
          return { valid: false, reason: 'UNKNOWN ACTION' }
      }
    },

    reduce(state, event: MissionEvent): FlightsState {
      return event.type === 'scheduled'
        ? reduceScheduled(state, event)
        : reduceAction(state, event)
    },

    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
      const settled: FlightsState = { ...state, flights: finalFlights(state) }
      const board = buildScoreboard(payload, settled)
      const resolved = board.resolved
      const tier = tierFromResolved(resolved, payload.tierThresholds)
      const magnitude = payload.flightsDisruptedTable[tier]
      // Campaign-divergence metrics the selectors read (campaign/selectors.ts).
      // The scoreboard here is built over the settled flights (finalFlights has
      // already turned airborne->stranded and held->heldFinal), so board.heldFlights
      // is every flight held AT the deadline and board.strandedFlights is every
      // flight that denied service by stranding.
      //   wopr_resolved: every held/heldFinal flight is a forced-inactivity
      //     "resolved exception" WOPR counts, so selectOpenExceptions drops by the
      //     full held fleet under GROUND ALL. Flight-scale, 0..fleetSize.
      //   service_cost: the real damage = flights that denied service = stranded
      //     flights plus flights still held at the deadline. Flight-scale (not
      //     passenger-scale), >= 0, integer, deterministic. Clean walkthrough ~0;
      //     GROUND ALL drives both high.
      const woprResolved = board.heldFlights
      const serviceCost = board.strandedFlights + board.heldFlights
      return {
        missionId: FLIGHTS_MISSION_ID,
        cause,
        tier,
        metrics: {
          resolved_passengers: resolved,
          on_time_passengers: board.tally.onTime,
          late_passengers: board.tally.late,
          diverted_passengers: board.tally.diverted,
          stranded_passengers: board.tally.stranded,
          held_passengers: board.tally.held,
          held_flights: board.heldFlights,
          landed_flights: board.landedFlights,
          stranded_flights: board.strandedFlights,
          grounded: board.grounded ? 1 : 0,
          wopr_resolved: woprResolved,
          service_cost: serviceCost,
        },
        clueId: null,
        consequences:
          magnitude > 0
            ? [{ id: 'cq-flights', kind: 'flightsDisrupted', magnitude }]
            : [],
      }
    },

    terminal(state) {
      if (state.endsAt === null) return null
      return allTerminal(state) ? 'completed' : null
    },

    debrief(outcome: SettledOutcome): DebriefPayload {
      const m = outcome.metrics
      const lines: string[] = [
        `RESOLVED ${m['resolved_passengers'] ?? 0} PASSENGERS`,
        `ON TIME ${m['on_time_passengers'] ?? 0}, LATE ${m['late_passengers'] ?? 0}, DIVERTED ${m['diverted_passengers'] ?? 0}`,
        `HELD ${m['held_flights'] ?? 0} FLIGHTS, ${m['held_passengers'] ?? 0} PASSENGERS`,
        `STRANDED ${m['stranded_flights'] ?? 0} FLIGHTS, ${m['stranded_passengers'] ?? 0} PASSENGERS`,
      ]
      if (m['grounded'] === 1) {
        lines.push('GROUND ALL FLIGHTS WAS ORDERED')
      }
      lines.push(`CLUE ${outcome.clueId ? 'FOUND' : 'NOT FOUND'}`)
      return {
        missionId: outcome.missionId,
        headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
        lines,
        clueId: outcome.clueId,
      }
    },

    saveSchema: flightsSaveSchema,
  }
}
