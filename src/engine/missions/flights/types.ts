// GROUND ALL FLIGHTS substate and its reference-only save schema. Same
// discipline as CRASH OUTLOOK: the persisted substate carries ids,
// statuses, integer offsets, and boolean flags only. Authored copy (hub
// names, passenger counts, the projection, corridor labels) lives
// exclusively in the immutable FlightsPayload, never in a save. If a test
// can smuggle a passenger count or a hub name into a parsed substate,
// this schema is wrong.
import * as v from 'valibot'

const integer = v.pipe(v.number(), v.integer())

/** A flight's lifecycle. Statuses only move forward. A scheduled flight
 *  departs (`airborne`) or is held (`held`); a held flight can RELEASE
 *  back to `scheduled` while its window is open, or fall to `heldFinal`
 *  (terminal) when the window closes. An airborne flight lands
 *  (`landed` / `landedLate` / `divertedLanded`) or strands. The four
 *  terminal states absorb every later transition. */
export type FlightStatus =
  | 'scheduled'
  | 'airborne'
  | 'held'
  | 'heldFinal'
  | 'landed'
  | 'landedLate'
  | 'divertedLanded'
  | 'stranded'

export const TERMINAL_FLIGHT_STATUSES: readonly FlightStatus[] = [
  'landed',
  'landedLate',
  'divertedLanded',
  'stranded',
  'heldFinal',
]

/** Per-flight mutable truth. No authored copy: passenger counts, origins,
 *  destinations, and departure offsets live in the payload; the substate
 *  carries only the live status, the hub the flight actually arrived at
 *  (null until it lands), the computed arrival stamp (null until airborne
 *  toward a hub), and whether a RELEASE is still legal. */
export interface FlightState {
  readonly status: FlightStatus
  /** The hub id this flight is currently inbound to or landed at. Null
   *  while scheduled, held, or stranded. */
  readonly inboundHubId: string | null
  /** Absolute ms the arrival event is computed to resolve at. Null unless
   *  airborne toward a hub. Folded by scheduled wakes, buzzer rules. */
  readonly arrivalAt: number | null
  /** Absolute ms this flight would have arrived on time (direct landing,
   *  no queue delay) from the same dispatch. A DIVERT whose actual
   *  arrivalAt exceeds this by more than the authored lateness threshold
   *  lands LATE. A computed stamp, not authored copy. Null unless airborne
   *  toward a hub. */
  readonly onTimeAt: number | null
  /** True once a landing has been credited (late or on time) so a fold
   *  never double-counts a runway slot or a passenger tally. */
  readonly settled: boolean
}

export interface FlightsState {
  /** Per-flight status by flight id. Ids and statuses only. */
  readonly flights: Readonly<Record<string, FlightState>>
  /** Closed hub ids, from storm truth. A hub not listed is open. */
  readonly closedHubs: readonly string[]
  /** Closed corridor ids, from storm truth. */
  readonly closedCorridors: readonly string[]
  /** Hub ids whose last-departure window has closed. A held flight whose
   *  origin hub is listed falls to heldFinal; RELEASE on it rejects. Set
   *  by seed-authored flightsWindow events (engine-scaled, so no scale
   *  math lives in the module). */
  readonly closedWindowHubs: readonly string[]
  /** Runway slots occupied per hub id, integer counts. */
  readonly runwayUse: Readonly<Record<string, number>>
  /** The single-use blanket grounding flag. */
  readonly groundAll: boolean
  /** How many correction events have been applied. Indexes into the
   *  authored projection corrections; the projection itself is never
   *  copied into substate. */
  readonly appliedCorrection: number
  /** Corridor ids a PROBE has been requested against. Markers only. */
  readonly probed: readonly string[]
  /** Integer forecast-divergence magnitude a commsDelayed inbound
   *  consequence widened the displayed projection by at init. A seeded
   *  integer, not projection copy; the shell reads it to widen the
   *  divergence band, reducers never fold it. */
  readonly projectionDivergence: number
  /** Materialized mission length in ms, from init. Integer. */
  readonly durationMs: number
  /** Absolute deadline in ms, stamped from the first event the module
   *  sees. Null until then. terminal() and evaluate() read it. */
  readonly endsAt: number | null
}

const flightStateSchema = v.strictObject({
  status: v.picklist([
    'scheduled',
    'airborne',
    'held',
    'heldFinal',
    'landed',
    'landedLate',
    'divertedLanded',
    'stranded',
  ]),
  inboundHubId: v.nullable(v.string()),
  arrivalAt: v.nullable(integer),
  onTimeAt: v.nullable(integer),
  settled: v.boolean(),
})

/** The reference-only save schema. strictObject at every level means any
 *  field that could carry authored copy (a hub name, a passenger count,
 *  a projection array) is structurally rejected. */
export const flightsSaveSchema = v.strictObject({
  flights: v.record(v.string(), flightStateSchema),
  closedHubs: v.array(v.string()),
  closedCorridors: v.array(v.string()),
  closedWindowHubs: v.array(v.string()),
  runwayUse: v.record(v.string(), integer),
  groundAll: v.boolean(),
  appliedCorrection: integer,
  probed: v.array(v.string()),
  projectionDivergence: integer,
  durationMs: integer,
  endsAt: v.nullable(integer),
})

export type FlightsStateParsed = v.InferOutput<typeof flightsSaveSchema>
