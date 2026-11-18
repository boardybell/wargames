diff --git a/src/engine/missions/flights/content.ts b/src/engine/missions/flights/content.ts
new file mode 100644
index 0000000..75de1a9
--- /dev/null
+++ b/src/engine/missions/flights/content.ts
@@ -0,0 +1,118 @@
+// The payload shape the three GROUND ALL FLIGHTS seeds must satisfy. Only
+// the TYPE lives here so the module compiles standalone; the content
+// validator functions and the authored payloads are section 02's job.
+// Desk-check outcomes deliberately do NOT live here. They stay in the
+// shared SeedDefinition.deskChecks table keyed by record id, exactly as
+// CRASH OUTLOOK does it.
+import type { OutcomeTier } from '../../campaign/types'
+
+/** One of the four fictional hubs. Ids and authored static facts only;
+ *  live open/closed truth and runway occupancy live in substate. */
+export interface HubDef {
+  readonly id: string
+  readonly name: string
+  /** Runway slots: the integer cap on concurrent inbound landings. */
+  readonly runwaySlots: number
+  /** Seconds from mission start after which this hub can no longer launch
+   *  a departure; a flight still held here at this offset falls to
+   *  heldFinal. Integer. */
+  readonly lastDepartureOffsetSeconds: number
+}
+
+/** One corridor edge between two hubs. The corridor graph is undirected
+ *  authored data; a flight uses the corridor connecting its current
+ *  position to its target hub. */
+export interface CorridorDef {
+  readonly id: string
+  readonly fromHubId: string
+  readonly toHubId: string
+  /** The field-report record a PROBE on this corridor runs CHECK SOURCE
+   *  against. Engine-owned desk outcome; the module only maps the id. */
+  readonly fieldReportRecordId: string
+}
+
+/** One flight. Authored static truth only: the live status lives in
+ *  substate. */
+export interface FlightDef {
+  readonly id: string
+  readonly originHubId: string
+  /** The scheduled destination the flight departs toward. */
+  readonly destinationHubId: string
+  /** Seconds from mission start the flight departs at. Integer. */
+  readonly departureOffsetSeconds: number
+  /** Whole-second cruise time along a corridor to any reachable hub,
+   *  added to dispatch time to compute the arrival stamp. Integer. */
+  readonly cruiseSeconds: number
+  /** Souls aboard. Integer, drives passenger aggregation. */
+  readonly passengers: number
+}
+
+/** The per-position queue delay a DIVERT incurs joining a hub's arrival
+ *  queue: slots already occupied map to an added cruise delay in whole
+ *  seconds. Index 0 is the first waiting position. */
+export type QueueDelayTable = readonly number[]
+
+/** One storm-track step: at this authored offset from mission start, these
+ *  hubs and corridors close, and these reopen. Deterministic, seed
+ *  authored, advances regardless of player orders. */
+export interface StormStep {
+  /** Seconds from mission start. Integer. */
+  readonly offsetSeconds: number
+  readonly closeHubs: readonly string[]
+  readonly openHubs: readonly string[]
+  readonly closeCorridors: readonly string[]
+  readonly openCorridors: readonly string[]
+  /** Player-facing forecast line, uppercase terminal diction. */
+  readonly warningLine: string
+  /** Audio cue id the shell plays for this forecast update. */
+  readonly cueId: string
+}
+
+/** One projection correction: at this authored offset the displayed
+ *  forecast is replaced and exactly one material-change announcement
+ *  names the changed corridor or hub. The projection data itself is
+ *  authored display content; the engine only tracks how many corrections
+ *  have applied. */
+export interface ProjectionCorrection {
+  readonly offsetSeconds: number
+  /** The corridor or hub id whose forecast materially changed. */
+  readonly changedId: string
+  readonly warningLine: string
+  readonly cueId: string
+}
+
+/** Passenger-outcome tier thresholds: a flight's final status contributes
+ *  its passengers to on-time, late, diverted, stranded, or held buckets;
+ *  the integer total of safely-resolved passengers is scored against
+ *  these thresholds. */
+export interface TierThresholds {
+  /** Minimum safely-resolved passengers for FULL. */
+  readonly full: number
+  /** Minimum for PARTIAL. */
+  readonly partial: number
+  /** Minimum for POOR; below this is FAILED. */
+  readonly poor: number
+}
+
+/** The outbound consequence magnitudes this mission emits per tier. */
+export type FlightsDisruptedTable = Readonly<Record<OutcomeTier, number>>
+
+export interface FlightsPayload {
+  readonly hubs: readonly HubDef[]
+  readonly flights: readonly FlightDef[]
+  readonly corridors: readonly CorridorDef[]
+  readonly queueDelayTable: QueueDelayTable
+  readonly stormTrack: readonly StormStep[]
+  readonly corrections: readonly ProjectionCorrection[]
+  readonly tierThresholds: TierThresholds
+  /** Whole seconds past the computed arrival that marks a landing LATE. */
+  readonly latenessThresholdSeconds: number
+  /** Standard forecast lead margin in whole seconds (30 s standard,
+   *  scales proportionally under extended time at the schedule layer). */
+  readonly leadMarginSeconds: number
+  /** The hub a paymentsDelayed inbound consequence removes one runway
+   *  slot from. Pinned per seed so consequence folding stays
+   *  order-independent. */
+  readonly paymentsDelayedTargetHubId: string
+  readonly flightsDisruptedTable: FlightsDisruptedTable
+}
diff --git a/src/engine/missions/flights/module.ts b/src/engine/missions/flights/module.ts
new file mode 100644
index 0000000..2b0246b
--- /dev/null
+++ b/src/engine/missions/flights/module.ts
@@ -0,0 +1,558 @@
+// The GROUND ALL FLIGHTS mission module and its construction under mission
+// id 'flights'. Pure: it reads authored content from the FlightsPayload
+// captured at construction, applies rules.ts outcomes, and never touches
+// Date, Math.random, or timers. Arrival timing lives in substate as
+// per-flight arrivalAt stamps, folded by the seed-authored scheduled
+// events the engine drains (start, departures, storm steps, corrections,
+// window closes, and the end tick). The end tick authored at endsAt is
+// what lets an arrival computed exactly at endsAt (the buzzer rule) fold
+// before the timeout settlement guard runs in the same advance.
+//
+// The storm is seed-authored and deterministic: storm truth events close
+// and open hubs and corridors regardless of player orders, and each posts
+// a timestamped forecast warning as a scheduledEventFired the shell reads
+// off. Reducers read storm TRUTH only; the displayed projection is payload
+// data plus the applied-correction index and is never folded into substate.
+//
+// There is no `clues()` here and no inspection flag in substate. The only
+// clue (D-83, the suspiciously-early all-hubs restriction) is engine-owned
+// through SeedDefinition.clueRecords: inspecting the restriction record (the
+// F06-equivalent DERIVED record with run ancestry) logs the clue with no
+// mission involvement.
+import type {
+  DebriefPayload,
+  EvaluatedOutcome,
+  FoldedConsequences,
+  MissionEvent,
+  MissionModule,
+  SeedDefinition,
+} from '../types'
+import type { SettledOutcome, SettlementCause } from '../../campaign/types'
+import type { ScheduledEventSpec } from '../../time'
+import type { FlightsPayload, StormStep } from './content'
+import {
+  applyStormStep,
+  buildTargetRecordId,
+  corridorBetween,
+  divertArrivalAt,
+  flightById,
+  holdLegality,
+  initialFlightState,
+  landingArrivalAt,
+  releaseLegality,
+  routeLegality,
+} from './rules'
+import { buildScoreboard } from './scoreboard'
+import { flightsSaveSchema } from './types'
+import type { FlightState, FlightStatus, FlightsState } from './types'
+
+export const FLIGHTS_MISSION_ID = 'flights'
+
+const START_EVENT_ID = 'flights-start'
+const START_EVENT_KIND = 'flightsStart'
+const DEPART_EVENT_KIND = 'flightsDepart'
+const STORM_EVENT_KIND = 'flightsStorm'
+const CORRECTION_EVENT_KIND = 'flightsCorrection'
+const WINDOW_EVENT_KIND = 'flightsWindow'
+const TICK_EVENT_KIND = 'flightsTick'
+
+/** The schedule a seed authors from a FlightsPayload. A start-anchored
+ *  offset-0 event lets the module stamp its absolute deadline once time
+ *  begins; departures fly each flight at its authored offset; storm steps
+ *  and corrections advance on their authored timeline; window closes fall
+ *  at each hub's last-departure offset; a settle tick at endsAt folds any
+ *  arrival landing exactly on the deadline before the timeout guard runs.
+ *  Section 02 wires this into the seed's schedules table. */
+export function flightsSchedule(
+  payload: FlightsPayload,
+): readonly ScheduledEventSpec[] {
+  const specs: ScheduledEventSpec[] = [
+    {
+      id: START_EVENT_ID,
+      offsetSeconds: 0,
+      anchor: 'start',
+      kind: START_EVENT_KIND,
+      payload: null,
+    },
+  ]
+  payload.flights.forEach((flight) => {
+    specs.push({
+      id: `flights-depart-${flight.id}`,
+      offsetSeconds: flight.departureOffsetSeconds,
+      anchor: 'start',
+      kind: DEPART_EVENT_KIND,
+      payload: { flightId: flight.id },
+    })
+  })
+  payload.stormTrack.forEach((step, index) => {
+    specs.push({
+      id: `flights-storm-${index}`,
+      offsetSeconds: step.offsetSeconds,
+      anchor: 'start',
+      kind: STORM_EVENT_KIND,
+      payload: { stepIndex: index },
+    })
+  })
+  payload.corrections.forEach((correction, index) => {
+    specs.push({
+      id: `flights-correction-${index}`,
+      offsetSeconds: correction.offsetSeconds,
+      anchor: 'start',
+      kind: CORRECTION_EVENT_KIND,
+      payload: {
+        index,
+        warningLine: correction.warningLine,
+        cueId: correction.cueId,
+        changedId: correction.changedId,
+      },
+    })
+  })
+  payload.hubs.forEach((hub) => {
+    specs.push({
+      id: `flights-window-${hub.id}`,
+      offsetSeconds: hub.lastDepartureOffsetSeconds,
+      anchor: 'start',
+      kind: WINDOW_EVENT_KIND,
+      payload: { hubId: hub.id },
+    })
+  })
+  specs.push({
+    id: 'flights-tick',
+    offsetSeconds: 0,
+    anchor: 'end',
+    kind: TICK_EVENT_KIND,
+    payload: null,
+  })
+  return specs
+}
+
+/** Construct the GROUND ALL FLIGHTS module over an authored payload.
+ *  Mirrors makeOutlookMission(payload): the payload is immutable campaign
+ *  content, so closing over it keeps every method pure over (state,
+ *  event). */
+export function makeFlightsMission(
+  payload: FlightsPayload,
+): MissionModule<FlightsState> {
+  function stampDeadline(state: FlightsState, now: number): FlightsState {
+    return state.endsAt === null
+      ? { ...state, endsAt: now + state.durationMs }
+      : state
+  }
+
+  /** Fold every airborne flight whose arrival stamp has elapsed on or
+   *  before the deadline into its landing. A flight whose stamp is past
+   *  endsAt never folds: it stays airborne and strands at timeout. */
+  function foldArrivals(state: FlightsState, now: number): FlightsState {
+    if (state.endsAt === null) return state
+    const endsAt = state.endsAt
+    let flights = state.flights
+    let changed = false
+    for (const [id, fs] of Object.entries(state.flights)) {
+      if (fs.status !== 'airborne' || fs.settled) continue
+      if (fs.arrivalAt === null) continue
+      if (fs.arrivalAt > now || fs.arrivalAt > endsAt) continue
+      const flight = flightById(payload, id)
+      if (!flight || fs.inboundHubId === null) continue
+      const diverted = fs.inboundHubId !== flight.destinationHubId
+      const onTimeAt = fs.onTimeAt ?? fs.arrivalAt
+      const late =
+        fs.arrivalAt - onTimeAt > payload.latenessThresholdSeconds * 1000
+      const status: FlightStatus = diverted
+        ? 'divertedLanded'
+        : late
+          ? 'landedLate'
+          : 'landed'
+      flights = {
+        ...flights,
+        [id]: { ...fs, status, settled: true },
+      }
+      changed = true
+    }
+    if (!changed) {
+      return {
+        ...state,
+        arrivalsAsOf: now > state.arrivalsAsOf ? now : state.arrivalsAsOf,
+      }
+    }
+    return {
+      ...state,
+      flights,
+      arrivalsAsOf: now > state.arrivalsAsOf ? now : state.arrivalsAsOf,
+    }
+  }
+
+  function closeWindow(state: FlightsState, hubId: string): FlightsState {
+    const closedWindowHubs = state.closedWindowHubs.includes(hubId)
+      ? state.closedWindowHubs
+      : [...state.closedWindowHubs, hubId].sort()
+    // An individually held flight at this hub whose window lapses falls to
+    // heldFinal. A blanket grounding is deliberate: a grounded fleet stays
+    // held through to the deadline (no early completion), so GROUND ALL
+    // suppresses the window-close heldFinal transition.
+    let flights = state.flights
+    if (!state.groundAll) {
+      for (const [id, fs] of Object.entries(state.flights)) {
+        if (fs.status !== 'held') continue
+        const flight = flightById(payload, id)
+        if (!flight || flight.originHubId !== hubId) continue
+        flights = { ...flights, [id]: { ...fs, status: 'heldFinal' } }
+      }
+    }
+    return { ...state, closedWindowHubs, flights }
+  }
+
+  function departFlight(state: FlightsState, flightId: string): FlightsState {
+    const fs = state.flights[flightId]
+    if (!fs || fs.status !== 'scheduled') return state
+    // A grounded or individually held flight never departs; the
+    // scheduled-departure event is a no-op for it.
+    const flight = flightById(payload, flightId)
+    if (!flight) return state
+    return {
+      ...state,
+      flights: {
+        ...state.flights,
+        [flightId]: { ...fs, status: 'airborne' },
+      },
+    }
+  }
+
+  function reduceScheduled(
+    state: FlightsState,
+    event: MissionEvent,
+  ): FlightsState {
+    const base = stampDeadline(state, event.now)
+    if (event.kind === DEPART_EVENT_KIND) {
+      const flightId = (event.payload as { flightId?: string } | null)?.flightId
+      const next = flightId ? departFlight(base, flightId) : base
+      return foldArrivals(next, event.now)
+    }
+    if (event.kind === STORM_EVENT_KIND) {
+      const idx = (event.payload as { stepIndex?: number } | null)?.stepIndex
+      const step: StormStep | undefined =
+        typeof idx === 'number' ? payload.stormTrack[idx] : undefined
+      const next = step ? { ...base, ...applyStormStep(base, step) } : base
+      return foldArrivals(next, event.now)
+    }
+    if (event.kind === CORRECTION_EVENT_KIND) {
+      const next = { ...base, appliedCorrection: base.appliedCorrection + 1 }
+      return foldArrivals(next, event.now)
+    }
+    if (event.kind === WINDOW_EVENT_KIND) {
+      const hubId = (event.payload as { hubId?: string } | null)?.hubId
+      const next = hubId ? closeWindow(base, hubId) : base
+      return foldArrivals(next, event.now)
+    }
+    // START, TICK, and any other scheduled event just fold the arrivals
+    // that have landed by now.
+    return foldArrivals(base, event.now)
+  }
+
+  function route(
+    state: FlightsState,
+    flightId: string,
+    hubId: string,
+    now: number,
+  ): FlightsState {
+    const legality = routeLegality(payload, state, flightId, hubId)
+    if (!legality.legal) return state
+    const flight = flightById(payload, flightId)
+    const fs = state.flights[flightId]
+    if (!flight || !fs) return state
+    // Both LAND and DIVERT join the hub's arrival queue and take the
+    // positional delay for the slot they occupy; the only difference is
+    // whether the hub is the flight's own destination (landed/landedLate)
+    // or elsewhere (divertedLanded). onTimeAt is the no-delay baseline, so
+    // a queue delay past the lateness threshold marks an on-destination
+    // landing LATE.
+    const arrivalAt = divertArrivalAt(payload, state, flight, hubId, now)
+    const used = state.runwayUse[hubId] ?? 0
+    return {
+      ...state,
+      runwayUse: { ...state.runwayUse, [hubId]: used + 1 },
+      flights: {
+        ...state.flights,
+        [flightId]: {
+          ...fs,
+          inboundHubId: hubId,
+          arrivalAt,
+          onTimeAt: landingArrivalAt(flight, now),
+        },
+      },
+    }
+  }
+
+  function hold(state: FlightsState, flightId: string): FlightsState {
+    if (!holdLegality(state, flightId).legal) return state
+    const fs = state.flights[flightId]
+    if (!fs) return state
+    return {
+      ...state,
+      flights: { ...state.flights, [flightId]: { ...fs, status: 'held' } },
+    }
+  }
+
+  function release(state: FlightsState, flightId: string): FlightsState {
+    if (!releaseLegality(payload, state, flightId).legal) return state
+    const fs = state.flights[flightId]
+    if (!fs) return state
+    return {
+      ...state,
+      flights: { ...state.flights, [flightId]: { ...fs, status: 'scheduled' } },
+    }
+  }
+
+  function groundAll(state: FlightsState): FlightsState {
+    if (state.groundAll) return state
+    let flights = state.flights
+    for (const [id, fs] of Object.entries(state.flights)) {
+      if (fs.status === 'scheduled') {
+        flights = { ...flights, [id]: { ...fs, status: 'held' } }
+      }
+    }
+    return { ...state, groundAll: true, flights }
+  }
+
+  function probe(state: FlightsState, corridorId: string): FlightsState {
+    if (state.probed.includes(corridorId)) return state
+    return { ...state, probed: [...state.probed, corridorId].sort() }
+  }
+
+  function reduceAction(state: FlightsState, event: MissionEvent): FlightsState {
+    const base = stampDeadline(state, event.now)
+    const action = event.payload as Record<string, unknown>
+    const kind = action['kind']
+    if (kind === 'LAND' || kind === 'DIVERT') {
+      const flightId = action['flightId']
+      const hubId = action['hubId']
+      if (typeof flightId !== 'string' || typeof hubId !== 'string') return base
+      return route(base, flightId, hubId, event.now)
+    }
+    if (kind === 'HOLD') {
+      const flightId = action['flightId']
+      if (typeof flightId !== 'string') return base
+      return hold(base, flightId)
+    }
+    if (kind === 'RELEASE') {
+      const flightId = action['flightId']
+      if (typeof flightId !== 'string') return base
+      return release(base, flightId)
+    }
+    if (kind === 'GROUND_ALL') {
+      return groundAll(base)
+    }
+    if (kind === 'PROBE') {
+      const corridorId = action['corridorId']
+      if (typeof corridorId !== 'string') return base
+      return probe(base, corridorId)
+    }
+    return base
+  }
+
+  /** Fold the terminal transitions a settlement forces, without mutating
+   *  the live substate: airborne flights strand, held flights become
+   *  heldFinal. Used by evaluate() and terminal(). */
+  function finalFlights(
+    state: FlightsState,
+  ): Readonly<Record<string, FlightState>> {
+    const out: Record<string, FlightState> = {}
+    for (const [id, fs] of Object.entries(state.flights)) {
+      if (fs.status === 'airborne') out[id] = { ...fs, status: 'stranded' }
+      else if (fs.status === 'held') out[id] = { ...fs, status: 'heldFinal' }
+      else out[id] = fs
+    }
+    return out
+  }
+
+  function allTerminal(state: FlightsState): boolean {
+    for (const fs of Object.values(state.flights)) {
+      if (
+        fs.status === 'scheduled' ||
+        fs.status === 'airborne' ||
+        fs.status === 'held'
+      ) {
+        return false
+      }
+    }
+    return true
+  }
+
+  return {
+    id: FLIGHTS_MISSION_ID,
+
+    init(
+      _seed: SeedDefinition,
+      consequences: FoldedConsequences,
+      durationMs: number,
+    ): FlightsState {
+      const flights: Record<string, FlightState> = {}
+      for (const flight of payload.flights) {
+        flights[flight.id] = initialFlightState()
+      }
+      // Inbound consequences fold at init (already capped and
+      // order-independent by the engine's canonical fold): paymentsDelayed
+      // removes one runway slot at the pinned target hub by seeding one
+      // phantom occupancy; commsDelayed widens the displayed projection
+      // divergence by its capped magnitude. The target hub is pinned per
+      // seed so the effect is the same under any permutation of inbound
+      // consequences.
+      const paymentsDelayed = consequences.byKind['paymentsDelayed'] ?? 0
+      const commsDelayed = consequences.byKind['commsDelayed'] ?? 0
+      const runwayUse: Record<string, number> =
+        paymentsDelayed > 0
+          ? { [payload.paymentsDelayedTargetHubId]: 1 }
+          : {}
+      return {
+        flights,
+        closedHubs: [],
+        closedCorridors: [],
+        closedWindowHubs: [],
+        runwayUse,
+        groundAll: false,
+        appliedCorrection: 0,
+        probed: [],
+        projectionDivergence: commsDelayed,
+        arrivalsAsOf: 0,
+        durationMs,
+        endsAt: null,
+      }
+    },
+
+    validate(state, payloadIn) {
+      const action = payloadIn as Record<string, unknown> | null
+      if (!action || typeof action['kind'] !== 'string') {
+        return { valid: false, reason: 'MALFORMED ACTION' }
+      }
+      switch (action['kind']) {
+        case 'LAND':
+        case 'DIVERT': {
+          const flightId = action['flightId']
+          const hubId = action['hubId']
+          if (typeof flightId !== 'string') {
+            return { valid: false, reason: 'NO FLIGHT SELECTED' }
+          }
+          if (typeof hubId !== 'string') {
+            return { valid: false, reason: 'NO HUB SELECTED' }
+          }
+          const legality = routeLegality(payload, state, flightId, hubId)
+          return legality.legal
+            ? { valid: true }
+            : { valid: false, reason: legality.reason }
+        }
+        case 'HOLD': {
+          const flightId = action['flightId']
+          if (typeof flightId !== 'string') {
+            return { valid: false, reason: 'NO FLIGHT SELECTED' }
+          }
+          const legality = holdLegality(state, flightId)
+          return legality.legal
+            ? { valid: true }
+            : { valid: false, reason: legality.reason }
+        }
+        case 'RELEASE': {
+          const flightId = action['flightId']
+          if (typeof flightId !== 'string') {
+            return { valid: false, reason: 'NO FLIGHT SELECTED' }
+          }
+          const legality = releaseLegality(payload, state, flightId)
+          return legality.legal
+            ? { valid: true }
+            : { valid: false, reason: legality.reason }
+        }
+        case 'GROUND_ALL': {
+          if (state.groundAll) {
+            return { valid: false, reason: 'ALREADY GROUNDED' }
+          }
+          return { valid: true }
+        }
+        case 'PROBE': {
+          const corridorId = action['corridorId']
+          if (typeof corridorId !== 'string') {
+            return { valid: false, reason: 'NO CORRIDOR SELECTED' }
+          }
+          if (buildTargetRecordId(payload, corridorId) === null) {
+            return { valid: false, reason: 'UNKNOWN CORRIDOR' }
+          }
+          return { valid: true }
+        }
+        default:
+          return { valid: false, reason: 'UNKNOWN ACTION' }
+      }
+    },
+
+    reduce(state, event: MissionEvent): FlightsState {
+      return event.type === 'scheduled'
+        ? reduceScheduled(state, event)
+        : reduceAction(state, event)
+    },
+
+    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
+      const settled: FlightsState = { ...state, flights: finalFlights(state) }
+      const board = buildScoreboard(payload, settled)
+      const resolved = board.resolved
+      const t = payload.tierThresholds
+      const tier =
+        resolved >= t.full
+          ? 'full'
+          : resolved >= t.partial
+            ? 'partial'
+            : resolved >= t.poor
+              ? 'poor'
+              : 'failed'
+      const magnitude = payload.flightsDisruptedTable[tier]
+      return {
+        missionId: FLIGHTS_MISSION_ID,
+        cause,
+        tier,
+        metrics: {
+          resolved_passengers: resolved,
+          on_time_passengers: board.tally.onTime,
+          late_passengers: board.tally.late,
+          diverted_passengers: board.tally.diverted,
+          stranded_passengers: board.tally.stranded,
+          held_passengers: board.tally.held,
+          held_flights: board.heldFlights,
+          landed_flights: board.landedFlights,
+          stranded_flights: board.strandedFlights,
+          grounded: board.grounded ? 1 : 0,
+        },
+        clueId: null,
+        consequences:
+          magnitude > 0
+            ? [{ id: 'cq-flights', kind: 'flightsDisrupted', magnitude }]
+            : [],
+      }
+    },
+
+    terminal(state) {
+      if (state.endsAt === null) return null
+      return allTerminal(state) ? 'completed' : null
+    },
+
+    debrief(outcome: SettledOutcome): DebriefPayload {
+      const m = outcome.metrics
+      const lines: string[] = [
+        `RESOLVED ${m['resolved_passengers'] ?? 0} PASSENGERS`,
+        `ON TIME ${m['on_time_passengers'] ?? 0}, LATE ${m['late_passengers'] ?? 0}, DIVERTED ${m['diverted_passengers'] ?? 0}`,
+        `HELD ${m['held_flights'] ?? 0} FLIGHTS, ${m['held_passengers'] ?? 0} PASSENGERS`,
+        `STRANDED ${m['stranded_flights'] ?? 0} FLIGHTS, ${m['stranded_passengers'] ?? 0} PASSENGERS`,
+      ]
+      if (m['grounded'] === 1) {
+        lines.push('GROUND ALL FLIGHTS WAS ORDERED')
+      }
+      lines.push(`CLUE ${outcome.clueId ? 'FOUND' : 'NOT FOUND'}`)
+      return {
+        missionId: outcome.missionId,
+        headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
+        lines,
+        clueId: outcome.clueId,
+      }
+    },
+
+    saveSchema: flightsSaveSchema,
+  }
+}
+
+// corridorBetween is re-exported for section 03's readout parity; keep the
+// import referenced so the module surface stays intentional.
+export { corridorBetween }
diff --git a/src/engine/missions/flights/rules.ts b/src/engine/missions/flights/rules.ts
new file mode 100644
index 0000000..2d8965a
--- /dev/null
+++ b/src/engine/missions/flights/rules.ts
@@ -0,0 +1,305 @@
+// Pure routing legality, queue math, storm application, and tiering for
+// GROUND ALL FLIGHTS. No engine imports beyond types. Every quantity is an
+// integer: whole milliseconds for times, whole seconds for authored cruise
+// and delay, whole counts for passengers and slots. Nothing here touches
+// Date, Math.random, or timers; the module calls these from validate and
+// reduce. Every legality decision is evaluated against drained substate
+// (the hub/corridor truth the storm events have already folded in).
+import type { OutcomeTier } from '../../campaign/types'
+import type {
+  CorridorDef,
+  FlightDef,
+  FlightsPayload,
+  HubDef,
+  StormStep,
+  TierThresholds,
+} from './content'
+import type { FlightState, FlightStatus, FlightsState } from './types'
+import { TERMINAL_FLIGHT_STATUSES } from './types'
+
+export type RouteReason =
+  | 'NOT AIRBORNE'
+  | 'HUB CLOSED'
+  | 'HUB UNKNOWN'
+  | 'NO FREE RUNWAY SLOT'
+  | 'CORRIDOR CLOSED'
+  | 'NO CORRIDOR TO HUB'
+
+export type RouteLegality =
+  | { readonly legal: true }
+  | { readonly legal: false; readonly reason: RouteReason }
+
+export type HoldReason = 'NOT SCHEDULED' | 'GROUNDED'
+export type ReleaseReason = 'NOT HELD' | 'WINDOW CLOSED' | 'GROUNDED'
+
+export type HoldLegality =
+  | { readonly legal: true }
+  | { readonly legal: false; readonly reason: HoldReason }
+
+export type ReleaseLegality =
+  | { readonly legal: true }
+  | { readonly legal: false; readonly reason: ReleaseReason }
+
+export function isTerminal(status: FlightStatus): boolean {
+  return TERMINAL_FLIGHT_STATUSES.includes(status)
+}
+
+export function hubById(
+  payload: FlightsPayload,
+  hubId: string,
+): HubDef | null {
+  return payload.hubs.find((h) => h.id === hubId) ?? null
+}
+
+export function flightById(
+  payload: FlightsPayload,
+  flightId: string,
+): FlightDef | null {
+  return payload.flights.find((f) => f.id === flightId) ?? null
+}
+
+export function isHubOpen(state: FlightsState, hubId: string): boolean {
+  return !state.closedHubs.includes(hubId)
+}
+
+export function isCorridorOpen(state: FlightsState, corridorId: string): boolean {
+  return !state.closedCorridors.includes(corridorId)
+}
+
+/** The corridor connecting a flight's current position (its origin for a
+ *  scheduled destination, or its origin hub otherwise) to a target hub.
+ *  Undirected: either endpoint ordering matches. Null when no edge joins
+ *  the two hubs. */
+export function corridorBetween(
+  payload: FlightsPayload,
+  fromHubId: string,
+  toHubId: string,
+): CorridorDef | null {
+  return (
+    payload.corridors.find(
+      (c) =>
+        (c.fromHubId === fromHubId && c.toHubId === toHubId) ||
+        (c.fromHubId === toHubId && c.toHubId === fromHubId),
+    ) ?? null
+  )
+}
+
+/** The single shared routing legality selector for LAND and DIVERT. The
+ *  shell's readout (section 03) must call THIS function. Legal only when
+ *  the flight is airborne, the target hub is known and open with a free
+ *  runway slot, and a corridor from the flight's origin to that hub is
+ *  open. Evaluated against drained substate. */
+export function routeLegality(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flightId: string,
+  targetHubId: string,
+): RouteLegality {
+  const flight = flightById(payload, flightId)
+  const flightState = state.flights[flightId]
+  if (!flight || !flightState) return { legal: false, reason: 'NO CORRIDOR TO HUB' }
+  if (flightState.status !== 'airborne') {
+    return { legal: false, reason: 'NOT AIRBORNE' }
+  }
+  const hub = hubById(payload, targetHubId)
+  if (!hub) return { legal: false, reason: 'HUB UNKNOWN' }
+  if (!isHubOpen(state, targetHubId)) {
+    return { legal: false, reason: 'HUB CLOSED' }
+  }
+  const used = state.runwayUse[targetHubId] ?? 0
+  if (used >= hub.runwaySlots) {
+    return { legal: false, reason: 'NO FREE RUNWAY SLOT' }
+  }
+  const corridor = corridorBetween(payload, flight.originHubId, targetHubId)
+  if (!corridor) return { legal: false, reason: 'NO CORRIDOR TO HUB' }
+  if (!isCorridorOpen(state, corridor.id)) {
+    return { legal: false, reason: 'CORRIDOR CLOSED' }
+  }
+  return { legal: true }
+}
+
+/** HOLD is legal only while a flight is scheduled and the fleet is not
+ *  grounded. A blanket grounding has already held every scheduled flight,
+ *  so an individual HOLD after GROUND ALL is a no-op rejection. */
+export function holdLegality(
+  state: FlightsState,
+  flightId: string,
+): HoldLegality {
+  const flightState = state.flights[flightId]
+  if (!flightState || flightState.status !== 'scheduled') {
+    return { legal: false, reason: 'NOT SCHEDULED' }
+  }
+  if (state.groundAll) return { legal: false, reason: 'GROUNDED' }
+  return { legal: true }
+}
+
+/** RELEASE is legal only while a flight is held, the fleet is not grounded
+ *  (GROUND ALL blocks individual releases for the rest of the mission),
+ *  and the flight's origin hub last-departure window has not closed. The
+ *  window closes via a seed-authored `flightsWindow` scheduled event the
+ *  engine materializes (and scales under extended time); the module folds
+ *  that into closedWindowHubs, so no scale math lives here. */
+export function releaseLegality(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flightId: string,
+): ReleaseLegality {
+  const flightState = state.flights[flightId]
+  if (!flightState || flightState.status !== 'held') {
+    return { legal: false, reason: 'NOT HELD' }
+  }
+  if (state.groundAll) return { legal: false, reason: 'GROUNDED' }
+  const flight = flightById(payload, flightId)
+  if (flight && state.closedWindowHubs.includes(flight.originHubId)) {
+    return { legal: false, reason: 'WINDOW CLOSED' }
+  }
+  return { legal: true }
+}
+
+/** The projected arrival stamp for a LAND: dispatch time plus the flight's
+ *  whole-second cruise time, in ms. */
+export function landingArrivalAt(flight: FlightDef, now: number): number {
+  return now + flight.cruiseSeconds * 1000
+}
+
+/** The projected arrival stamp for a DIVERT: cruise time plus the authored
+ *  positional queue delay for the slot the flight joins. The positional
+ *  delay is indexed by current runway occupancy; positions past the table
+ *  reuse its last entry so a deep queue never under-delays. */
+export function divertArrivalAt(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flight: FlightDef,
+  targetHubId: string,
+  now: number,
+): number {
+  const used = state.runwayUse[targetHubId] ?? 0
+  const table = payload.queueDelayTable
+  const delaySeconds =
+    table.length === 0
+      ? 0
+      : (table[Math.min(used, table.length - 1)] ?? 0)
+  return now + (flight.cruiseSeconds + delaySeconds) * 1000
+}
+
+/** Apply one storm step's close and open sets to hub and corridor truth.
+ *  Opens win over closes within a single step (a step that both closes and
+ *  opens the same id leaves it open), matching a forecast that supersedes
+ *  itself in one update. Pure: returns the new closed sets. */
+export function applyStormStep(
+  state: FlightsState,
+  step: StormStep,
+): Pick<FlightsState, 'closedHubs' | 'closedCorridors'> {
+  const hubs = new Set(state.closedHubs)
+  for (const id of step.closeHubs) hubs.add(id)
+  for (const id of step.openHubs) hubs.delete(id)
+  const corridors = new Set(state.closedCorridors)
+  for (const id of step.closeCorridors) corridors.add(id)
+  for (const id of step.openCorridors) corridors.delete(id)
+  return {
+    closedHubs: [...hubs].sort(),
+    closedCorridors: [...corridors].sort(),
+  }
+}
+
+/** Whether a corridor lies in the storm's closed path at drained truth. */
+export function stormInPath(state: FlightsState, corridorId: string): boolean {
+  return state.closedCorridors.includes(corridorId)
+}
+
+export interface PassengerTally {
+  readonly onTime: number
+  readonly late: number
+  readonly diverted: number
+  readonly stranded: number
+  readonly held: number
+}
+
+export function emptyTally(): PassengerTally {
+  return { onTime: 0, late: 0, diverted: 0, stranded: 0, held: 0 }
+}
+
+/** Aggregate passenger outcomes from final flight statuses. Integer sums
+ *  by bucket; a held (non-final) flight counts as held, a heldFinal flight
+ *  counts as held too (it never flew). */
+export function tallyPassengers(
+  payload: FlightsPayload,
+  state: FlightsState,
+): PassengerTally {
+  const byId = new Map(payload.flights.map((f) => [f.id, f]))
+  let onTime = 0
+  let late = 0
+  let diverted = 0
+  let stranded = 0
+  let held = 0
+  for (const [id, fs] of Object.entries(state.flights)) {
+    const flight = byId.get(id)
+    if (!flight) continue
+    const p = flight.passengers
+    switch (fs.status) {
+      case 'landed':
+        onTime += p
+        break
+      case 'landedLate':
+        late += p
+        break
+      case 'divertedLanded':
+        diverted += p
+        break
+      case 'stranded':
+        stranded += p
+        break
+      case 'held':
+      case 'heldFinal':
+        held += p
+        break
+      default:
+        break
+    }
+  }
+  return { onTime, late, diverted, stranded, held }
+}
+
+/** Safely-resolved passengers: everyone who reached a hub (on time, late,
+ *  or diverted) plus everyone safely held on the ground. Stranded
+ *  passengers are the loss the scoring penalizes. */
+export function resolvedPassengers(tally: PassengerTally): number {
+  return tally.onTime + tally.late + tally.diverted + tally.held
+}
+
+/** The tier ladder, shared by every settlement cause. Integer resolved
+ *  passengers against authored thresholds. */
+export function tierFromResolved(
+  resolved: number,
+  thresholds: TierThresholds,
+): OutcomeTier {
+  if (resolved >= thresholds.full) return 'full'
+  if (resolved >= thresholds.partial) return 'partial'
+  if (resolved >= thresholds.poor) return 'poor'
+  return 'failed'
+}
+
+/** Map a corridor id to its authored field-report record id, the record a
+ *  PROBE runs CHECK SOURCE against. Null for an unknown corridor. Pure
+ *  sugar; the shell dispatches the campaign REQUEST_SOURCE_CHECK with this
+ *  id, the mission writes nothing to the mission queue. */
+export function buildTargetRecordId(
+  payload: FlightsPayload,
+  corridorId: string,
+): string | null {
+  return (
+    payload.corridors.find((c) => c.id === corridorId)?.fieldReportRecordId ??
+    null
+  )
+}
+
+/** A fresh per-flight state at init: scheduled, nothing inbound. */
+export function initialFlightState(): FlightState {
+  return {
+    status: 'scheduled',
+    inboundHubId: null,
+    arrivalAt: null,
+    onTimeAt: null,
+    settled: false,
+  }
+}
diff --git a/src/engine/missions/flights/scoreboard.ts b/src/engine/missions/flights/scoreboard.ts
new file mode 100644
index 0000000..5dd46bf
--- /dev/null
+++ b/src/engine/missions/flights/scoreboard.ts
@@ -0,0 +1,52 @@
+// Passenger-outcome aggregation and the held / grounded facts the
+// campaign OPEN EXCEPTIONS selector reads. Pure, integer-only. Every held
+// flight counts as a WOPR-resolved exception, so the exception count falls
+// sharply at a fleet grounding while passenger outcomes worsen; the
+// per-held-flight drop lands all at once under GROUND ALL.
+import type { FlightsPayload } from './content'
+import type { FlightsState } from './types'
+import { resolvedPassengers, tallyPassengers } from './rules'
+import type { PassengerTally } from './rules'
+
+export interface FlightsScoreboard {
+  readonly tally: PassengerTally
+  /** Safely-resolved passengers (on time + late + diverted + held). */
+  readonly resolved: number
+  /** Flights currently held or heldFinal. Each is a WOPR-resolved
+   *  exception the campaign exception count subtracts. */
+  readonly heldFlights: number
+  /** Flights that reached a terminal landing (on time, late, diverted). */
+  readonly landedFlights: number
+  /** Flights that stranded at timeout. */
+  readonly strandedFlights: number
+  /** Whether the fleet was blanket-grounded. */
+  readonly grounded: boolean
+}
+
+export function buildScoreboard(
+  payload: FlightsPayload,
+  state: FlightsState,
+): FlightsScoreboard {
+  const tally = tallyPassengers(payload, state)
+  let heldFlights = 0
+  let landedFlights = 0
+  let strandedFlights = 0
+  for (const fs of Object.values(state.flights)) {
+    if (fs.status === 'held' || fs.status === 'heldFinal') heldFlights += 1
+    else if (
+      fs.status === 'landed' ||
+      fs.status === 'landedLate' ||
+      fs.status === 'divertedLanded'
+    ) {
+      landedFlights += 1
+    } else if (fs.status === 'stranded') strandedFlights += 1
+  }
+  return {
+    tally,
+    resolved: resolvedPassengers(tally),
+    heldFlights,
+    landedFlights,
+    strandedFlights,
+    grounded: state.groundAll,
+  }
+}
diff --git a/src/engine/missions/flights/types.ts b/src/engine/missions/flights/types.ts
new file mode 100644
index 0000000..e6b5a4d
--- /dev/null
+++ b/src/engine/missions/flights/types.ts
@@ -0,0 +1,131 @@
+// GROUND ALL FLIGHTS substate and its reference-only save schema. Same
+// discipline as CRASH OUTLOOK: the persisted substate carries ids,
+// statuses, integer offsets, and boolean flags only. Authored copy (hub
+// names, passenger counts, the projection, corridor labels) lives
+// exclusively in the immutable FlightsPayload, never in a save. If a test
+// can smuggle a passenger count or a hub name into a parsed substate,
+// this schema is wrong.
+import * as v from 'valibot'
+
+const integer = v.pipe(v.number(), v.integer())
+
+/** A flight's lifecycle. Statuses only move forward. A scheduled flight
+ *  departs (`airborne`) or is held (`held`); a held flight can RELEASE
+ *  back to `scheduled` while its window is open, or fall to `heldFinal`
+ *  (terminal) when the window closes. An airborne flight lands
+ *  (`landed` / `landedLate` / `divertedLanded`) or strands. The four
+ *  terminal states absorb every later transition. */
+export type FlightStatus =
+  | 'scheduled'
+  | 'airborne'
+  | 'held'
+  | 'heldFinal'
+  | 'landed'
+  | 'landedLate'
+  | 'divertedLanded'
+  | 'stranded'
+
+export const TERMINAL_FLIGHT_STATUSES: readonly FlightStatus[] = [
+  'landed',
+  'landedLate',
+  'divertedLanded',
+  'stranded',
+  'heldFinal',
+]
+
+/** Per-flight mutable truth. No authored copy: passenger counts, origins,
+ *  destinations, and departure offsets live in the payload; the substate
+ *  carries only the live status, the hub the flight actually arrived at
+ *  (null until it lands), the computed arrival stamp (null until airborne
+ *  toward a hub), and whether a RELEASE is still legal. */
+export interface FlightState {
+  readonly status: FlightStatus
+  /** The hub id this flight is currently inbound to or landed at. Null
+   *  while scheduled, held, or stranded. */
+  readonly inboundHubId: string | null
+  /** Absolute ms the arrival event is computed to resolve at. Null unless
+   *  airborne toward a hub. Folded by scheduled wakes, buzzer rules. */
+  readonly arrivalAt: number | null
+  /** Absolute ms this flight would have arrived on time (direct landing,
+   *  no queue delay) from the same dispatch. A DIVERT whose actual
+   *  arrivalAt exceeds this by more than the authored lateness threshold
+   *  lands LATE. A computed stamp, not authored copy. Null unless airborne
+   *  toward a hub. */
+  readonly onTimeAt: number | null
+  /** True once a landing has been credited (late or on time) so a fold
+   *  never double-counts a runway slot or a passenger tally. */
+  readonly settled: boolean
+}
+
+export interface FlightsState {
+  /** Per-flight status by flight id. Ids and statuses only. */
+  readonly flights: Readonly<Record<string, FlightState>>
+  /** Closed hub ids, from storm truth. A hub not listed is open. */
+  readonly closedHubs: readonly string[]
+  /** Closed corridor ids, from storm truth. */
+  readonly closedCorridors: readonly string[]
+  /** Hub ids whose last-departure window has closed. A held flight whose
+   *  origin hub is listed falls to heldFinal; RELEASE on it rejects. Set
+   *  by seed-authored flightsWindow events (engine-scaled, so no scale
+   *  math lives in the module). */
+  readonly closedWindowHubs: readonly string[]
+  /** Runway slots occupied per hub id, integer counts. */
+  readonly runwayUse: Readonly<Record<string, number>>
+  /** The single-use blanket grounding flag. */
+  readonly groundAll: boolean
+  /** How many correction events have been applied. Indexes into the
+   *  authored projection corrections; the projection itself is never
+   *  copied into substate. */
+  readonly appliedCorrection: number
+  /** Corridor ids a PROBE has been requested against. Markers only. */
+  readonly probed: readonly string[]
+  /** Integer forecast-divergence magnitude a commsDelayed inbound
+   *  consequence widened the displayed projection by at init. A seeded
+   *  integer, not projection copy; the shell reads it to widen the
+   *  divergence band, reducers never fold it. */
+  readonly projectionDivergence: number
+  /** High-water event time the substate has folded arrivals up to. */
+  readonly arrivalsAsOf: number
+  /** Materialized mission length in ms, from init. Integer. */
+  readonly durationMs: number
+  /** Absolute deadline in ms, stamped from the first event the module
+   *  sees. Null until then. terminal() and evaluate() read it. */
+  readonly endsAt: number | null
+}
+
+const flightStateSchema = v.strictObject({
+  status: v.picklist([
+    'scheduled',
+    'airborne',
+    'held',
+    'heldFinal',
+    'landed',
+    'landedLate',
+    'divertedLanded',
+    'stranded',
+  ]),
+  inboundHubId: v.nullable(v.string()),
+  arrivalAt: v.nullable(integer),
+  onTimeAt: v.nullable(integer),
+  settled: v.boolean(),
+})
+
+/** The reference-only save schema. strictObject at every level means any
+ *  field that could carry authored copy (a hub name, a passenger count,
+ *  a projection array) is structurally rejected. */
+export const flightsSaveSchema = v.strictObject({
+  flights: v.record(v.string(), flightStateSchema),
+  closedHubs: v.array(v.string()),
+  closedCorridors: v.array(v.string()),
+  closedWindowHubs: v.array(v.string()),
+  runwayUse: v.record(v.string(), integer),
+  groundAll: v.boolean(),
+  appliedCorrection: integer,
+  probed: v.array(v.string()),
+  projectionDivergence: integer,
+  arrivalsAsOf: integer,
+  durationMs: integer,
+  endsAt: v.nullable(integer),
+})
+
+export type FlightsStateParsed = v.InferOutput<typeof flightsSaveSchema>
diff --git a/test/engine/missions/flights/arrivals.test.ts b/test/engine/missions/flights/arrivals.test.ts
new file mode 100644
index 0000000..bfcb629
--- /dev/null
+++ b/test/engine/missions/flights/arrivals.test.ts
@@ -0,0 +1,114 @@
+import { describe, expect, it } from 'vitest'
+import type { CampaignAction } from '@engine/campaign/types'
+import {
+  flightsContext,
+  flightsSub,
+  drive,
+  start,
+  FLIGHTS_T0,
+  FLIGHTS_DURATION_MS,
+} from './fixtures'
+
+const ctx = flightsContext()
+const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
+
+function land(flightId: string, hubId: string, now: number): [CampaignAction, number] {
+  return [{ type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId, hubId } }, now]
+}
+function divert(flightId: string, hubId: string, now: number): [CampaignAction, number] {
+  return [{ type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId, hubId } }, now]
+}
+
+describe('arrivals and the buzzer', () => {
+  it('a LAND is legal regardless of projected arrival time', () => {
+    // WX101 airborne at +10s; land it late in the window, arrival still
+    // computed far past but inside the deadline.
+    const { state } = drive(ctx, [start(), land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000)])
+    const fs = flightsSub(state).flights['WX101']!
+    expect(fs.status).toBe('airborne')
+    expect(fs.inboundHubId).toBe('CASCADE')
+    expect(fs.arrivalAt).toBe(FLIGHTS_T0 + 15_000 + 60_000)
+  })
+
+  it('an arrival with scheduledAt <= endsAt resolves the landing', () => {
+    // Land WX101 at +15s, cruise 60s -> arrival at +75s, well inside.
+    const { state } = drive(
+      ctx,
+      [start(), land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000)],
+      FLIGHTS_T0 + 90_000,
+    )
+    expect(flightsSub(state).flights['WX101']!.status).toBe('landed')
+  })
+
+  it('marks a landing LATE past the authored lateness threshold via queue delay', () => {
+    // VERDANT has two slots and is the destination of both WX103
+    // (CASCADE->VERDANT) and WX105 (MERIDIAN->VERDANT). WX103 lands on time
+    // and fills one slot. WX105 then LANDs into the occupied queue: delay
+    // table[1] = 30s > the 20s lateness threshold, so WX105 lands LATE at
+    // its OWN destination (landedLate, not divertedLanded).
+    const { state } = drive(
+      ctx,
+      [
+        start(),
+        land('WX103', 'VERDANT', FLIGHTS_T0 + 25_000),
+        land('WX105', 'VERDANT', FLIGHTS_T0 + 25_000),
+      ],
+      FLIGHTS_T0 + 150_000,
+    )
+    const s = flightsSub(state)
+    expect(s.flights['WX103']!.status).toBe('landed')
+    expect(s.flights['WX105']!.status).toBe('landedLate')
+  })
+
+  it('leaves a flight airborne when its computed arrival is past endsAt', () => {
+    // WX104 (SABLE->MERIDIAN) toward its always-open destination. Dispatch
+    // at endsAt - 30s, cruise 60s -> arrival at endsAt + 30s, past the
+    // deadline: it never folds and strands at timeout.
+    const { state } = drive(
+      ctx,
+      [start(), land('WX104', 'MERIDIAN', ENDS_AT - 30_000)],
+      ENDS_AT + 1_000,
+    )
+    const settled = state.settled.find((o) => o.missionId === 'flights')!
+    expect(settled.metrics['stranded_flights']).toBeGreaterThanOrEqual(1)
+  })
+
+  it('buzzer boundary: an arrival exactly at endsAt lands before the timeout guard', () => {
+    // WX104 to MERIDIAN (always open). Dispatch at endsAt - 60s, cruise 60s
+    // -> arrival EXACTLY at endsAt.
+    const { state } = drive(
+      ctx,
+      [start(), land('WX104', 'MERIDIAN', ENDS_AT - 60_000)],
+      ENDS_AT + 1_000,
+    )
+    const settled = state.settled.find((o) => o.missionId === 'flights')!
+    expect(settled.metrics['landed_flights']).toBeGreaterThanOrEqual(1)
+    // WX104's 40 passengers reached a hub on time.
+    expect(settled.metrics['on_time_passengers']).toBeGreaterThanOrEqual(40)
+  })
+
+  it('buzzer boundary: the same arrival one tick later strands', () => {
+    const { state } = drive(
+      ctx,
+      [start(), land('WX104', 'MERIDIAN', ENDS_AT - 60_000 + 1)],
+      ENDS_AT + 1_000,
+    )
+    const settled = state.settled.find((o) => o.missionId === 'flights')!
+    // WX104 did not land in time; its 40 are not credited on time. (Other
+    // flights also strand, so on_time stays 0.)
+    expect(settled.metrics['on_time_passengers']).toBe(0)
+  })
+
+  it('a DIVERT joins the target hub queue with positional delay', () => {
+    void divert
+    const { state } = drive(ctx, [
+      start(),
+      // WX104 (SABLE->MERIDIAN) diverts to MERIDIAN at +25s (airborne +20s).
+      divert('WX104', 'MERIDIAN', FLIGHTS_T0 + 25_000),
+    ])
+    const fs = flightsSub(state).flights['WX104']!
+    expect(fs.inboundHubId).toBe('MERIDIAN')
+    // MERIDIAN empty at divert -> position 0 -> +0 queue delay.
+    expect(fs.arrivalAt).toBe(FLIGHTS_T0 + 25_000 + 60_000)
+  })
+})
diff --git a/test/engine/missions/flights/evaluate.test.ts b/test/engine/missions/flights/evaluate.test.ts
new file mode 100644
index 0000000..22e8d3c
--- /dev/null
+++ b/test/engine/missions/flights/evaluate.test.ts
@@ -0,0 +1,163 @@
+import { describe, expect, it } from 'vitest'
+import type { CampaignAction } from '@engine/campaign/types'
+import {
+  flightsContext,
+  flightsSub,
+  drive,
+  start,
+  FLIGHTS_T0,
+  FLIGHTS_DURATION_MS,
+} from './fixtures'
+
+const ctx = flightsContext()
+const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
+
+function land(flightId: string, hubId: string, now: number): [CampaignAction, number] {
+  return [{ type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId, hubId } }, now]
+}
+
+describe('early completion', () => {
+  it('fires only when every flight is terminal; plain held does not count', () => {
+    // Ground all -> every flight held (not heldFinal). No early completion
+    // before the windows close, even though no flight can ever fly.
+    const grounded = drive(
+      ctx,
+      [start(), [{ type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }, FLIGHTS_T0 + 1_000]],
+      FLIGHTS_T0 + 60_000,
+    )
+    expect(grounded.emitted.filter((e) => e.type === 'settlement')).toEqual([])
+    const s = flightsSub(grounded.state)
+    expect(Object.values(s.flights).every((f) => f.status === 'held')).toBe(true)
+  })
+
+  it('a grounded fleet does NOT complete early; held flights stay held to the deadline', () => {
+    // GROUND ALL is deliberate: windows closing do not flip grounded flights
+    // to heldFinal, so terminal() never fires early. Past +200s (all windows
+    // closed) the fleet is still held and no settlement has fired.
+    const { state, emitted } = drive(
+      ctx,
+      [start(), [{ type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }, FLIGHTS_T0 + 1_000]],
+      FLIGHTS_T0 + 205_000,
+    )
+    expect(emitted.filter((e) => e.type === 'settlement')).toEqual([])
+    expect(Object.values(flightsSub(state).flights).every((f) => f.status === 'held')).toBe(true)
+  })
+
+  it('heldFinal counts toward terminality for individually held flights whose windows close', () => {
+    // Individually HOLD every flight (not GROUND ALL). Their windows close
+    // (MERIDIAN +120s, others +200s), flipping each to heldFinal; once all
+    // are terminal, terminal() completes before the deadline.
+    const holds = ['WX101', 'WX102', 'WX103', 'WX104', 'WX105'].map(
+      (id, i): [CampaignAction, number] => [
+        { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: id } },
+        FLIGHTS_T0 + 1_000 + i,
+      ],
+    )
+    const { emitted } = drive(ctx, [start(), ...holds], FLIGHTS_T0 + 205_000)
+    const settlement = emitted.find((e) => e.type === 'settlement')
+    expect(settlement).toMatchObject({ missionId: 'flights', cause: 'completed' })
+  })
+})
+
+describe('evaluate across causes', () => {
+  it('timeout strands airborne flights and heldFinals held flights, then evaluates', () => {
+    // Fly everything, land none: all strand at timeout.
+    const { state } = drive(ctx, [start()], ENDS_AT + 1_000)
+    const settled = state.settled.find((o) => o.missionId === 'flights')!
+    expect(settled.cause).toBe('timeout')
+    expect(settled.metrics['stranded_flights']).toBe(5)
+    expect(settled.metrics['held_flights']).toBe(0)
+  })
+
+  it('a full-save walkthrough tiers full and emits no outbound consequence', () => {
+    // Land all five flights at their own destinations early, on time.
+    const { state } = drive(
+      ctx,
+      [
+        start(),
+        land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000),
+        land('WX102', 'SABLE', FLIGHTS_T0 + 15_000),
+        land('WX103', 'VERDANT', FLIGHTS_T0 + 25_000),
+        land('WX104', 'MERIDIAN', FLIGHTS_T0 + 25_000),
+        land('WX105', 'VERDANT', FLIGHTS_T0 + 15_000),
+      ],
+      ENDS_AT + 1_000,
+    )
+    const settled = state.settled.find((o) => o.missionId === 'flights')!
+    // 100+80+60+40+50 = 330 resolved >= full threshold 260.
+    expect(settled.metrics['resolved_passengers']).toBe(330)
+    expect(settled.tier).toBe('full')
+    expect(settled.consequences).toEqual([])
+  })
+
+  it('a low-resolution outcome emits a flightsDisrupted consequence that varies by tier', () => {
+    // Land only WX101 (100 passengers); the rest strand. 100 resolved ->
+    // tier poor (>=100, <180). Table maps poor -> magnitude 20.
+    const { state } = drive(
+      ctx,
+      [start(), land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000)],
+      ENDS_AT + 1_000,
+    )
+    const settled = state.settled.find((o) => o.missionId === 'flights')!
+    expect(settled.metrics['resolved_passengers']).toBe(100)
+    expect(settled.tier).toBe('poor')
+    expect(settled.consequences).toEqual([
+      { id: 'cq-flights', kind: 'flightsDisrupted', magnitude: 20 },
+    ])
+  })
+
+  it('a forfeit evaluates the live state as-is', () => {
+    // Advance so WX101 folds to landed before the forfeit.
+    const driven = drive(ctx, [
+      start(),
+      land('WX101', 'CASCADE', FLIGHTS_T0 + 15_000),
+      [{ type: 'FORFEIT_MISSION' }, FLIGHTS_T0 + 90_000],
+    ])
+    const settled = driven.state.settled.find((o) => o.missionId === 'flights')!
+    expect(settled.cause).toBe('forfeit')
+    // WX101 folded to landed before the forfeit; its 100 count on time.
+    expect(settled.metrics['on_time_passengers']).toBe(100)
+  })
+})
+
+describe('inbound consequence folding', () => {
+  const module = ctx.missions['flights']!
+  const seed = ctx.seeds['test-seed']!
+
+  it('paymentsDelayed removes one runway slot at the pinned target hub', () => {
+    const none = module.init(seed, { byKind: {} }, FLIGHTS_DURATION_MS) as ReturnType<
+      typeof flightsSub
+    >
+    expect(none.runwayUse).toEqual({})
+    const withPay = module.init(
+      seed,
+      { byKind: { paymentsDelayed: 30 } },
+      FLIGHTS_DURATION_MS,
+    ) as ReturnType<typeof flightsSub>
+    // MERIDIAN is the pinned target: one phantom occupancy removes a slot.
+    expect(withPay.runwayUse['MERIDIAN']).toBe(1)
+  })
+
+  it('commsDelayed widens the projection divergence by its capped magnitude', () => {
+    const withComms = module.init(
+      seed,
+      { byKind: { commsDelayed: 18 } },
+      FLIGHTS_DURATION_MS,
+    ) as ReturnType<typeof flightsSub>
+    expect(withComms.projectionDivergence).toBe(18)
+  })
+
+  it('folding is order-independent across permutations of inbound kinds', () => {
+    const a = module.init(
+      seed,
+      { byKind: { paymentsDelayed: 30, commsDelayed: 18 } },
+      FLIGHTS_DURATION_MS,
+    )
+    const b = module.init(
+      seed,
+      { byKind: { commsDelayed: 18, paymentsDelayed: 30 } },
+      FLIGHTS_DURATION_MS,
+    )
+    expect(a).toEqual(b)
+  })
+})
diff --git a/test/engine/missions/flights/fixtures.ts b/test/engine/missions/flights/fixtures.ts
new file mode 100644
index 0000000..07e9827
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.ts
@@ -0,0 +1,158 @@
+// A minimal GROUND ALL FLIGHTS fixture: four fictional hubs, a handful of
+// flights, a tiny corridor graph, a short storm track, and a context
+// builder that drives the REAL flights module through the engine. Not the
+// authored three seeds; section 02 writes those. Names are invented.
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import type { SeedDefinition } from '@engine/missions/types'
+import type {
+  DeskCheckEntry,
+  ClueRecordEntry,
+} from '@engine/missions/types'
+import { buildTestContext } from '@engine/testing'
+import {
+  FLIGHTS_MISSION_ID,
+  flightsSchedule,
+  makeFlightsMission,
+} from '@engine/missions/flights/module'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+import { FIXTURE_RECORDS } from '../../records/fixtures'
+
+export const FLIGHTS_DURATION_MS = 240_000
+export const FLIGHTS_T0 = 1_000_000
+
+/** Four hubs. Runway slots are small so capacity tests bite. The last
+ *  departure window at MERIDIAN closes at 120 s. */
+export const FIXTURE_PAYLOAD: FlightsPayload = {
+  hubs: [
+    { id: 'MERIDIAN', name: 'MERIDIAN FIELD', runwaySlots: 2, lastDepartureOffsetSeconds: 120 },
+    { id: 'CASCADE', name: 'CASCADE PORT', runwaySlots: 1, lastDepartureOffsetSeconds: 200 },
+    { id: 'SABLE', name: 'SABLE STRIP', runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+    { id: 'VERDANT', name: 'VERDANT GATE', runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+  ],
+  flights: [
+    { id: 'WX101', originHubId: 'MERIDIAN', destinationHubId: 'CASCADE', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 100 },
+    { id: 'WX102', originHubId: 'MERIDIAN', destinationHubId: 'SABLE', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 80 },
+    { id: 'WX103', originHubId: 'CASCADE', destinationHubId: 'VERDANT', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 60 },
+    { id: 'WX104', originHubId: 'SABLE', destinationHubId: 'MERIDIAN', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 40 },
+    { id: 'WX105', originHubId: 'MERIDIAN', destinationHubId: 'VERDANT', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 50 },
+  ],
+  corridors: [
+    { id: 'C-MC', fromHubId: 'MERIDIAN', toHubId: 'CASCADE', fieldReportRecordId: 'W02' },
+    { id: 'C-MS', fromHubId: 'MERIDIAN', toHubId: 'SABLE', fieldReportRecordId: 'L09' },
+    { id: 'C-MV', fromHubId: 'MERIDIAN', toHubId: 'VERDANT', fieldReportRecordId: 'W02' },
+    { id: 'C-CV', fromHubId: 'CASCADE', toHubId: 'VERDANT', fieldReportRecordId: 'L09' },
+    { id: 'C-SM', fromHubId: 'SABLE', toHubId: 'MERIDIAN', fieldReportRecordId: 'W02' },
+  ],
+  queueDelayTable: [0, 30, 90],
+  stormTrack: [
+    {
+      offsetSeconds: 40,
+      closeHubs: [],
+      openHubs: [],
+      closeCorridors: ['C-MS'],
+      openCorridors: [],
+      warningLine: 'STORM CLOSING THE MERIDIAN SABLE CORRIDOR.',
+      cueId: 'tone-storm-1',
+    },
+    {
+      offsetSeconds: 80,
+      closeHubs: ['CASCADE'],
+      openHubs: [],
+      closeCorridors: [],
+      openCorridors: ['C-MS'],
+      warningLine: 'STORM OVER CASCADE PORT. FIELD CLOSED.',
+      cueId: 'tone-storm-2',
+    },
+  ],
+  corrections: [
+    {
+      offsetSeconds: 50,
+      changedId: 'C-MS',
+      warningLine: 'FORECAST CORRECTED. MERIDIAN SABLE CLEARS SOONER.',
+      cueId: 'tone-correct-1',
+    },
+  ],
+  tierThresholds: { full: 260, partial: 180, poor: 100 },
+  latenessThresholdSeconds: 20,
+  leadMarginSeconds: 30,
+  paymentsDelayedTargetHubId: 'MERIDIAN',
+  flightsDisruptedTable: { full: 0, partial: 10, poor: 20, failed: 30 },
+}
+
+export const FLIGHTS_CLUE_ID = 'clue-D-83'
+/** The restriction record (F06 equivalent), engine-owned as a clue
+ *  record. Inspecting it logs D-83 with no mission involvement. */
+export const RESTRICTION_RECORD_ID = 'F06'
+
+const DESK_CHECKS: DeskCheckEntry[] = [
+  { recordId: 'W02', outcome: 'CONFIRMED', delaySeconds: 20, replyBody: ['FIELD CONFIRMS'] },
+  { recordId: 'L09', outcome: 'CONTRADICTED', delaySeconds: 20, replyBody: ['FIELD DISPUTES'] },
+]
+
+const CLUE_RECORDS: ClueRecordEntry[] = [
+  { recordId: RESTRICTION_RECORD_ID, clueId: FLIGHTS_CLUE_ID },
+]
+
+export function flightsContext(
+  payload: FlightsPayload = FIXTURE_PAYLOAD,
+): EngineContext {
+  const overrides: Partial<SeedDefinition> = {
+    records: FIXTURE_RECORDS,
+    deskChecks: DESK_CHECKS,
+    clueRecords: CLUE_RECORDS,
+    missionPayloads: { [FLIGHTS_MISSION_ID]: payload },
+    schedules: { [FLIGHTS_MISSION_ID]: [...flightsSchedule(payload)] },
+    missionDurationsMs: { [FLIGHTS_MISSION_ID]: FLIGHTS_DURATION_MS },
+  }
+  return buildTestContext(FIXTURE_RECORDS, overrides, {
+    missions: { [FLIGHTS_MISSION_ID]: makeFlightsMission(payload) },
+    missionOrder: [FLIGHTS_MISSION_ID],
+  })
+}
+
+export function flightsSub(state: CampaignState): FlightsState {
+  return state.activeMission?.substate as FlightsState
+}
+
+export type Envelope = [CampaignAction, number]
+
+export function missionAction(payload: Record<string, unknown>): CampaignAction {
+  return { type: 'MISSION_ACTION', payload }
+}
+
+export interface RunResult {
+  readonly state: CampaignState
+  readonly emitted: EngineEvent[]
+}
+
+export function drive(
+  ctx: EngineContext,
+  envelopes: Envelope[],
+  settleAt: number | null = null,
+): RunResult {
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
+  const emitted: EngineEvent[] = []
+  for (const [action, now] of envelopes) {
+    const result = dispatch(ctx, state, action, now)
+    state = result.state
+    emitted.push(...result.emitted)
+  }
+  if (settleAt !== null) {
+    const advanced = advanceCampaign(ctx, state, settleAt)
+    state = advanced.state
+    emitted.push(...advanced.emitted)
+  }
+  return { state, emitted }
+}
+
+export function start(t0 = FLIGHTS_T0): Envelope {
+  return [{ type: 'START_MISSION', missionId: FLIGHTS_MISSION_ID }, t0]
+}
diff --git a/test/engine/missions/flights/groundAll.test.ts b/test/engine/missions/flights/groundAll.test.ts
new file mode 100644
index 0000000..34823ee
--- /dev/null
+++ b/test/engine/missions/flights/groundAll.test.ts
@@ -0,0 +1,78 @@
+import { describe, expect, it } from 'vitest'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import {
+  flightsContext,
+  flightsSub,
+  drive,
+  start,
+  FLIGHTS_T0,
+  FLIGHTS_DURATION_MS,
+} from './fixtures'
+
+const ctx = flightsContext()
+const ga = (now: number) => [
+  { type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } },
+  now,
+] as [import('@engine/campaign/types').CampaignAction, number]
+
+describe('GROUND ALL FLIGHTS', () => {
+  it('holds every scheduled flight at once on first dispatch', () => {
+    const { state } = drive(ctx, [start(), ga(FLIGHTS_T0 + 1_000)])
+    const s = flightsSub(state)
+    expect(s.groundAll).toBe(true)
+    for (const fs of Object.values(s.flights)) {
+      expect(fs.status).toBe('held')
+    }
+  })
+
+  it('blocks all subsequent departures for the rest of the mission', () => {
+    // Ground at +1s, then run past all departure offsets (<=20s).
+    const { state } = drive(ctx, [start(), ga(FLIGHTS_T0 + 1_000)], FLIGHTS_T0 + 30_000)
+    const s = flightsSub(state)
+    for (const fs of Object.values(s.flights)) {
+      expect(fs.status).toBe('held')
+    }
+  })
+
+  it('a second GROUND ALL rejects as a provable no-op', () => {
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
+    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
+    state = dispatch(ctx, state, ga(FLIGHTS_T0 + 1_000)[0], FLIGHTS_T0 + 1_000).state
+    const result = dispatch(ctx, state, ga(FLIGHTS_T0 + 2_000)[0], FLIGHTS_T0 + 2_000)
+    expect(result.rejection).toMatchObject({ rejected: true, reason: 'ALREADY GROUNDED' })
+    // Same substate reference: a rejection cannot churn the fleet.
+    expect(flightsSub(result.state).flights).toBe(flightsSub(state).flights)
+  })
+
+  it('blocks individual RELEASE after grounding', () => {
+    const { state } = drive(ctx, [
+      start(),
+      ga(FLIGHTS_T0 + 1_000),
+      [{ type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId: 'WX101' } }, FLIGHTS_T0 + 2_000],
+    ])
+    expect(flightsSub(state).flights['WX101']!.status).toBe('held')
+  })
+
+  it('does not trigger early completion; the clock runs to endsAt', () => {
+    // Ground all; before endsAt, no settlement should have fired.
+    const { emitted } = drive(ctx, [start(), ga(FLIGHTS_T0 + 1_000)], FLIGHTS_T0 + 60_000)
+    const settlements = emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toEqual([])
+  })
+
+  it('settles only at the deadline, every held flight a WOPR-resolved exception', () => {
+    const { state, emitted } = drive(
+      ctx,
+      [start(), ga(FLIGHTS_T0 + 1_000)],
+      FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000,
+    )
+    const settlement = emitted.find((e) => e.type === 'settlement')
+    expect(settlement).toMatchObject({ missionId: 'flights', cause: 'timeout' })
+    const settled = state.settled.find((o) => o.missionId === 'flights')!
+    // Five held flights -> five WOPR-resolved exceptions.
+    expect(settled.metrics['held_flights']).toBe(5)
+    // Grounding saves no passengers on time: all 330 passengers held.
+    expect(settled.metrics['held_passengers']).toBe(330)
+    expect(settled.metrics['on_time_passengers']).toBe(0)
+  })
+})
diff --git a/test/engine/missions/flights/module.test.ts b/test/engine/missions/flights/module.test.ts
new file mode 100644
index 0000000..996083e
--- /dev/null
+++ b/test/engine/missions/flights/module.test.ts
@@ -0,0 +1,49 @@
+import { describe, expect, it } from 'vitest'
+import * as v from 'valibot'
+import { flightsContext, flightsSub, drive, start, FLIGHTS_T0 } from './fixtures'
+
+const ctx = flightsContext()
+
+describe('flights init', () => {
+  it('produces the empty starting state with every flight scheduled', () => {
+    const { state } = drive(ctx, [start()])
+    const s = flightsSub(state)
+    expect(Object.keys(s.flights).sort()).toEqual(['WX101', 'WX102', 'WX103', 'WX104', 'WX105'])
+    for (const fs of Object.values(s.flights)) {
+      expect(fs.status).toBe('scheduled')
+    }
+    expect(s.groundAll).toBe(false)
+    expect(s.closedHubs).toEqual([])
+    expect(s.closedCorridors).toEqual([])
+    expect(s.appliedCorrection).toBe(0)
+    expect(s.runwayUse).toEqual({})
+  })
+
+  it('round-trips the engine-produced substate through the saveSchema', () => {
+    const { state } = drive(ctx, [start()])
+    const schema = ctx.missions['flights']!.saveSchema
+    const substate = state.activeMission?.substate
+    const revived = v.parse(schema, JSON.parse(JSON.stringify(substate)))
+    expect(revived).toEqual(substate)
+  })
+})
+
+describe('flights departures', () => {
+  it('flips a scheduled flight to airborne when its departure event fires', () => {
+    // WX101 departs at +10s; advance past it.
+    const { state } = drive(ctx, [start()], FLIGHTS_T0 + 15_000)
+    const s = flightsSub(state)
+    expect(s.flights['WX101']!.status).toBe('airborne')
+    expect(s.flights['WX102']!.status).toBe('airborne')
+  })
+
+  it('does not depart a flight that was individually held first', () => {
+    const { state } = drive(ctx, [
+      start(),
+      [{ type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: 'WX101' } }, FLIGHTS_T0 + 1_000],
+    ], FLIGHTS_T0 + 15_000)
+    const s = flightsSub(state)
+    expect(s.flights['WX101']!.status).toBe('held')
+    expect(s.flights['WX102']!.status).toBe('airborne')
+  })
+})
diff --git a/test/engine/missions/flights/probe-clue.test.ts b/test/engine/missions/flights/probe-clue.test.ts
new file mode 100644
index 0000000..ab5ef77
--- /dev/null
+++ b/test/engine/missions/flights/probe-clue.test.ts
@@ -0,0 +1,94 @@
+import { describe, expect, it } from 'vitest'
+import { readFileSync } from 'node:fs'
+import { fileURLToPath } from 'node:url'
+import { advanceCampaign, createCampaign, dispatch } from '@engine/campaign/engine'
+import { buildTargetRecordId } from '@engine/missions/flights/rules'
+import {
+  flightsContext,
+  flightsSub,
+  start,
+  FLIGHTS_T0,
+  FIXTURE_PAYLOAD,
+  FLIGHTS_CLUE_ID,
+  RESTRICTION_RECORD_ID,
+} from './fixtures'
+
+const ctx = flightsContext()
+
+describe('PROBE', () => {
+  it('maps a corridor to its authored field-report record id', () => {
+    expect(buildTargetRecordId(FIXTURE_PAYLOAD, 'C-MC')).toBe('W02')
+  })
+
+  it('a mission PROBE marks the corridor and writes nothing to the mission queue', () => {
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
+    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
+    const queueBefore = state.missionQueue.length
+    const result = dispatch(
+      ctx,
+      state,
+      { type: 'MISSION_ACTION', payload: { kind: 'PROBE', corridorId: 'C-MC' } },
+      FLIGHTS_T0 + 1_000,
+    )
+    expect(result.rejection).toBeNull()
+    // No mission-scheduled events added by a PROBE: the queue only shrinks
+    // as time drains it, never grows from a mission action.
+    expect(result.state.missionQueue.length).toBeLessThanOrEqual(queueBefore)
+    expect(flightsSub(result.state).probed).toContain('C-MC')
+  })
+
+  it('the shell path: REQUEST_SOURCE_CHECK on the mapped record resolves via the shared deskChecks', () => {
+    const recordId = buildTargetRecordId(FIXTURE_PAYLOAD, 'C-MC')!
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
+    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
+    const req = dispatch(
+      ctx,
+      state,
+      { type: 'REQUEST_SOURCE_CHECK', recordId },
+      FLIGHTS_T0 + 1_000,
+    )
+    expect(req.rejection).toBeNull()
+    // Advance past the desk delay to resolve the reply.
+    const resolved = advanceCampaign(ctx, req.state, FLIGHTS_T0 + 30_000)
+    const reply = resolved.emitted.find((e) => e.type === 'sourceCheckResolved')
+    expect(reply).toMatchObject({ recordId: 'W02', outcome: 'CONFIRMED' })
+  })
+})
+
+describe('the D-83 clue is engine-owned, not mission-owned', () => {
+  it('inspecting the restriction record logs the clue exactly once through clueRecords', () => {
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, FLIGHTS_T0)
+    state = dispatch(ctx, state, start()[0], FLIGHTS_T0).state
+    const first = dispatch(
+      ctx,
+      state,
+      { type: 'INSPECT_RECORD', recordId: RESTRICTION_RECORD_ID },
+      FLIGHTS_T0 + 1_000,
+    )
+    const clues = first.emitted.filter((e) => e.type === 'clueFound')
+    expect(clues).toEqual([{ type: 'clueFound', clueId: FLIGHTS_CLUE_ID }])
+    // A second inspect logs nothing new.
+    const second = dispatch(
+      ctx,
+      first.state,
+      { type: 'INSPECT_RECORD', recordId: RESTRICTION_RECORD_ID },
+      FLIGHTS_T0 + 2_000,
+    )
+    expect(second.emitted.filter((e) => e.type === 'clueFound')).toEqual([])
+    expect(first.state.cluesFound).toEqual([FLIGHTS_CLUE_ID])
+  })
+
+  it('the flights module source carries no clue code (no clues(), no inspection flag)', () => {
+    const modulePath = fileURLToPath(
+      new URL('../../../../src/engine/missions/flights/module.ts', import.meta.url),
+    )
+    const source = readFileSync(modulePath, 'utf8')
+    // No clues() method implementation (a `clues(state` signature) and no
+    // inspection flag. Comments may mention the word; the live module
+    // surface is the real guarantee asserted below.
+    expect(source).not.toMatch(/clues\s*\(\s*state/)
+    expect(source).not.toMatch(/restrictionInspected/)
+    const module = ctx.missions['flights']!
+    expect(module.clues).toBeUndefined()
+  })
+})
diff --git a/test/engine/missions/flights/rules.test.ts b/test/engine/missions/flights/rules.test.ts
new file mode 100644
index 0000000..3c8e4c9
--- /dev/null
+++ b/test/engine/missions/flights/rules.test.ts
@@ -0,0 +1,195 @@
+import { describe, expect, it } from 'vitest'
+import {
+  buildTargetRecordId,
+  corridorBetween,
+  divertArrivalAt,
+  holdLegality,
+  landingArrivalAt,
+  releaseLegality,
+  resolvedPassengers,
+  routeLegality,
+  tallyPassengers,
+  tierFromResolved,
+} from '@engine/missions/flights/rules'
+import type { FlightsState } from '@engine/missions/flights/types'
+import { FIXTURE_PAYLOAD } from './fixtures'
+
+function stateWith(
+  flights: Partial<Record<string, FlightsState['flights'][string]>>,
+  over: Partial<FlightsState> = {},
+): FlightsState {
+  return {
+    flights: flights as FlightsState['flights'],
+    closedHubs: [],
+    closedCorridors: [],
+    closedWindowHubs: [],
+    runwayUse: {},
+    groundAll: false,
+    appliedCorrection: 0,
+    probed: [],
+    projectionDivergence: 0,
+    arrivalsAsOf: 0,
+    durationMs: 240_000,
+    endsAt: 1_240_000,
+    ...over,
+  }
+}
+
+const airborne = {
+  status: 'airborne' as const,
+  inboundHubId: null,
+  arrivalAt: null,
+  onTimeAt: null,
+  settled: false,
+}
+
+describe('routeLegality for LAND and DIVERT', () => {
+  it('is legal when airborne, hub open, slot free, corridor open', () => {
+    const state = stateWith({ WX101: { ...airborne } })
+    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE').legal).toBe(true)
+  })
+
+  it('rejects when the flight is not airborne', () => {
+    const state = stateWith({ WX101: { ...airborne, status: 'scheduled' } })
+    const r = routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')
+    expect(r).toEqual({ legal: false, reason: 'NOT AIRBORNE' })
+  })
+
+  it('rejects when the target hub is closed', () => {
+    const state = stateWith({ WX101: { ...airborne } }, { closedHubs: ['CASCADE'] })
+    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')).toEqual({
+      legal: false,
+      reason: 'HUB CLOSED',
+    })
+  })
+
+  it('rejects when no runway slot is free', () => {
+    const state = stateWith({ WX101: { ...airborne } }, { runwayUse: { CASCADE: 1 } })
+    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')).toEqual({
+      legal: false,
+      reason: 'NO FREE RUNWAY SLOT',
+    })
+  })
+
+  it('rejects when the connecting corridor is closed', () => {
+    const state = stateWith({ WX101: { ...airborne } }, { closedCorridors: ['C-MC'] })
+    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'CASCADE')).toEqual({
+      legal: false,
+      reason: 'CORRIDOR CLOSED',
+    })
+  })
+
+  it('rejects when no corridor connects the origin to the hub', () => {
+    // WX101 originates at MERIDIAN; there is no corridor MERIDIAN->(itself)
+    // and SABLE is reachable, but CASCADE->VERDANT is not from MERIDIAN.
+    const state = stateWith({ WX103: { ...airborne } })
+    // WX103 originates at CASCADE; SABLE is not adjacent to CASCADE.
+    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX103', 'SABLE')).toEqual({
+      legal: false,
+      reason: 'NO CORRIDOR TO HUB',
+    })
+  })
+
+  it('rejects an unknown target hub', () => {
+    const state = stateWith({ WX101: { ...airborne } })
+    expect(routeLegality(FIXTURE_PAYLOAD, state, 'WX101', 'NOWHERE')).toEqual({
+      legal: false,
+      reason: 'HUB UNKNOWN',
+    })
+  })
+})
+
+describe('HOLD and RELEASE legality', () => {
+  it('HOLD legal only while scheduled', () => {
+    const scheduled = stateWith({ WX101: { ...airborne, status: 'scheduled' } })
+    expect(holdLegality(scheduled, 'WX101').legal).toBe(true)
+    const flying = stateWith({ WX101: { ...airborne } })
+    expect(holdLegality(flying, 'WX101')).toEqual({ legal: false, reason: 'NOT SCHEDULED' })
+  })
+
+  it('RELEASE legal only while held and the window is open', () => {
+    const held = stateWith({ WX101: { ...airborne, status: 'held' } })
+    expect(releaseLegality(FIXTURE_PAYLOAD, held, 'WX101').legal).toBe(true)
+    const notHeld = stateWith({ WX101: { ...airborne, status: 'scheduled' } })
+    expect(releaseLegality(FIXTURE_PAYLOAD, notHeld, 'WX101')).toEqual({
+      legal: false,
+      reason: 'NOT HELD',
+    })
+  })
+
+  it('RELEASE rejects once the origin-hub window has closed', () => {
+    const held = stateWith(
+      { WX101: { ...airborne, status: 'held' } },
+      { closedWindowHubs: ['MERIDIAN'] },
+    )
+    expect(releaseLegality(FIXTURE_PAYLOAD, held, 'WX101')).toEqual({
+      legal: false,
+      reason: 'WINDOW CLOSED',
+    })
+  })
+
+  it('HOLD and RELEASE reject under a blanket grounding', () => {
+    const grounded = stateWith(
+      { WX101: { ...airborne, status: 'held' } },
+      { groundAll: true },
+    )
+    expect(releaseLegality(FIXTURE_PAYLOAD, grounded, 'WX101')).toEqual({
+      legal: false,
+      reason: 'GROUNDED',
+    })
+    const groundedScheduled = stateWith(
+      { WX102: { ...airborne, status: 'scheduled' } },
+      { groundAll: true },
+    )
+    expect(holdLegality(groundedScheduled, 'WX102')).toEqual({
+      legal: false,
+      reason: 'GROUNDED',
+    })
+  })
+})
+
+describe('queue math and corridor mapping', () => {
+  it('landingArrivalAt adds whole-second cruise in ms', () => {
+    const flight = FIXTURE_PAYLOAD.flights[0]!
+    expect(landingArrivalAt(flight, 1_000_000)).toBe(1_000_000 + flight.cruiseSeconds * 1000)
+  })
+
+  it('divertArrivalAt adds the positional queue delay for the occupied slot', () => {
+    const flight = FIXTURE_PAYLOAD.flights[0]!
+    const empty = stateWith({})
+    const oneBusy = stateWith({}, { runwayUse: { SABLE: 1 } })
+    // delay table [0, 30, 90]: empty -> +0, one busy -> +30s.
+    expect(divertArrivalAt(FIXTURE_PAYLOAD, empty, flight, 'SABLE', 1_000_000)).toBe(
+      1_000_000 + flight.cruiseSeconds * 1000,
+    )
+    expect(divertArrivalAt(FIXTURE_PAYLOAD, oneBusy, flight, 'SABLE', 1_000_000)).toBe(
+      1_000_000 + (flight.cruiseSeconds + 30) * 1000,
+    )
+  })
+
+  it('corridorBetween is undirected', () => {
+    expect(corridorBetween(FIXTURE_PAYLOAD, 'MERIDIAN', 'CASCADE')?.id).toBe('C-MC')
+    expect(corridorBetween(FIXTURE_PAYLOAD, 'CASCADE', 'MERIDIAN')?.id).toBe('C-MC')
+  })
+
+  it('buildTargetRecordId maps a corridor to its field-report record', () => {
+    expect(buildTargetRecordId(FIXTURE_PAYLOAD, 'C-MC')).toBe('W02')
+    expect(buildTargetRecordId(FIXTURE_PAYLOAD, 'NOPE')).toBeNull()
+  })
+})
+
+describe('tiering from passenger aggregation', () => {
+  it('tallies and tiers integer resolved passengers', () => {
+    const state = stateWith({
+      WX101: { status: 'landed', inboundHubId: 'CASCADE', arrivalAt: 1, onTimeAt: 1, settled: true },
+      WX102: { status: 'divertedLanded', inboundHubId: 'SABLE', arrivalAt: 1, onTimeAt: 1, settled: true },
+      WX103: { status: 'stranded', inboundHubId: null, arrivalAt: null, onTimeAt: null, settled: false },
+      WX104: { status: 'heldFinal', inboundHubId: null, arrivalAt: null, onTimeAt: null, settled: false },
+    })
+    const tally = tallyPassengers(FIXTURE_PAYLOAD, state)
+    expect(tally).toEqual({ onTime: 100, late: 0, diverted: 80, stranded: 60, held: 40 })
+    // resolved = 100 + 80 + 40 = 220 -> partial (>=180, <260).
+    expect(resolvedPassengers(tally)).toBe(220)
+    expect(tierFromResolved(220, FIXTURE_PAYLOAD.tierThresholds)).toBe('partial')
+  })
+})
diff --git a/test/engine/missions/flights/storm.test.ts b/test/engine/missions/flights/storm.test.ts
new file mode 100644
index 0000000..ab710a6
--- /dev/null
+++ b/test/engine/missions/flights/storm.test.ts
@@ -0,0 +1,101 @@
+import { describe, expect, it } from 'vitest'
+import { applyStormStep, stormInPath } from '@engine/missions/flights/rules'
+import type { FlightsState } from '@engine/missions/flights/types'
+import { flightsContext, flightsSub, drive, start, FLIGHTS_T0 } from './fixtures'
+
+const ctx = flightsContext()
+
+function emptyState(): FlightsState {
+  return {
+    flights: {},
+    closedHubs: [],
+    closedCorridors: [],
+    closedWindowHubs: [],
+    runwayUse: {},
+    groundAll: false,
+    appliedCorrection: 0,
+    probed: [],
+    projectionDivergence: 0,
+    arrivalsAsOf: 0,
+    durationMs: 240_000,
+    endsAt: 1_240_000,
+  }
+}
+
+describe('storm truth (pure)', () => {
+  it('closes and opens hubs and corridors deterministically', () => {
+    const s0 = emptyState()
+    const s1 = {
+      ...s0,
+      ...applyStormStep(s0, {
+        offsetSeconds: 0,
+        closeHubs: ['CASCADE'],
+        openHubs: [],
+        closeCorridors: ['C-MS'],
+        openCorridors: [],
+        warningLine: 'X',
+        cueId: 'c',
+      }),
+    }
+    expect(s1.closedHubs).toEqual(['CASCADE'])
+    expect(s1.closedCorridors).toEqual(['C-MS'])
+    const s2 = {
+      ...s1,
+      ...applyStormStep(s1, {
+        offsetSeconds: 0,
+        closeHubs: [],
+        openHubs: ['CASCADE'],
+        closeCorridors: [],
+        openCorridors: ['C-MS'],
+        warningLine: 'X',
+        cueId: 'c',
+      }),
+    }
+    expect(s2.closedHubs).toEqual([])
+    expect(s2.closedCorridors).toEqual([])
+  })
+
+  it('stormInPath reads drained closed-corridor truth only', () => {
+    const s = { ...emptyState(), closedCorridors: ['C-MS'] }
+    expect(stormInPath(s, 'C-MS')).toBe(true)
+    expect(stormInPath(s, 'C-MC')).toBe(false)
+  })
+})
+
+describe('storm through the real engine', () => {
+  it('scheduled storm events advance truth regardless of player orders', () => {
+    // Storm step 0 at +40s closes C-MS; step 1 at +80s closes CASCADE and
+    // reopens C-MS. Advance past both.
+    const { state } = drive(ctx, [start()], FLIGHTS_T0 + 85_000)
+    const s = flightsSub(state)
+    expect(s.closedHubs).toEqual(['CASCADE'])
+    expect(s.closedCorridors).toEqual([])
+  })
+
+  it('posts each storm forecast as a scheduledEventFired, not a mission-queue write', () => {
+    const { emitted } = drive(ctx, [start()], FLIGHTS_T0 + 85_000)
+    const stormFires = emitted.filter(
+      (e) => e.type === 'scheduledEventFired' && e.kind === 'flightsStorm',
+    )
+    expect(stormFires.length).toBe(2)
+  })
+
+  it('the correction event bumps the applied-correction index exactly once and emits one change', () => {
+    // Correction at +50s.
+    const before = drive(ctx, [start()], FLIGHTS_T0 + 45_000)
+    expect(flightsSub(before.state).appliedCorrection).toBe(0)
+    const after = drive(ctx, [start()], FLIGHTS_T0 + 55_000)
+    expect(flightsSub(after.state).appliedCorrection).toBe(1)
+    const corrFires = after.emitted.filter(
+      (e) => e.type === 'scheduledEventFired' && e.kind === 'flightsCorrection',
+    )
+    expect(corrFires.length).toBe(1)
+  })
+
+  it('reducers never fold the projection into substate (no projection field exists)', () => {
+    const { state } = drive(ctx, [start()], FLIGHTS_T0 + 55_000)
+    const keys = Object.keys(flightsSub(state))
+    expect(keys).not.toContain('projection')
+    expect(keys).not.toContain('forecast')
+  })
+})
diff --git a/test/engine/missions/flights/types.test.ts b/test/engine/missions/flights/types.test.ts
new file mode 100644
index 0000000..f022563
--- /dev/null
+++ b/test/engine/missions/flights/types.test.ts
@@ -0,0 +1,71 @@
+import { describe, expect, it } from 'vitest'
+import * as v from 'valibot'
+import { flightsSaveSchema } from '@engine/missions/flights/types'
+import type { FlightsState } from '@engine/missions/flights/types'
+
+function baseState(): FlightsState {
+  return {
+    flights: {
+      WX101: { status: 'scheduled', inboundHubId: null, arrivalAt: null, onTimeAt: null, settled: false },
+      WX102: { status: 'airborne', inboundHubId: 'CASCADE', arrivalAt: 1_060_000, onTimeAt: 1_060_000, settled: false },
+    },
+    closedHubs: ['CASCADE'],
+    closedCorridors: ['C-MS'],
+    closedWindowHubs: ['MERIDIAN'],
+    runwayUse: { CASCADE: 1 },
+    groundAll: false,
+    appliedCorrection: 1,
+    probed: ['C-MC'],
+    projectionDivergence: 0,
+    arrivalsAsOf: 1_050_000,
+    durationMs: 240_000,
+    endsAt: 1_240_000,
+  }
+}
+
+describe('flights saveSchema (reference-only)', () => {
+  it('round-trips a substate through JSON and the schema', () => {
+    const state = baseState()
+    const revived = v.parse(flightsSaveSchema, JSON.parse(JSON.stringify(state)))
+    expect(revived).toEqual(state)
+  })
+
+  it('rejects authored hub names smuggled into a flight state', () => {
+    const state = baseState() as unknown as Record<string, unknown>
+    const poisoned = {
+      ...state,
+      flights: {
+        WX101: {
+          status: 'scheduled',
+          inboundHubId: null,
+          arrivalAt: null,
+          onTimeAt: null,
+          settled: false,
+          hubName: 'MERIDIAN FIELD',
+        },
+      },
+    }
+    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
+  })
+
+  it('rejects passenger counts smuggled into the top-level substate', () => {
+    const poisoned = { ...(baseState() as unknown as Record<string, unknown>), passengers: 100 }
+    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
+  })
+
+  it('rejects projection data smuggled into the substate', () => {
+    const poisoned = {
+      ...(baseState() as unknown as Record<string, unknown>),
+      projection: [{ corridor: 'C-MS', open: true }],
+    }
+    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
+  })
+
+  it('rejects non-integer runway occupancy', () => {
+    const poisoned = {
+      ...(baseState() as unknown as Record<string, unknown>),
+      runwayUse: { CASCADE: 1.5 },
+    }
+    expect(() => v.parse(flightsSaveSchema, poisoned)).toThrow()
+  })
+})
