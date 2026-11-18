diff --git a/src/engine/missions/flights/content.ts b/src/engine/missions/flights/content.ts
index 75de1a9..c0d9007 100644
--- a/src/engine/missions/flights/content.ts
+++ b/src/engine/missions/flights/content.ts
@@ -5,6 +5,10 @@
 // shared SeedDefinition.deskChecks table keyed by record id, exactly as
 // CRASH OUTLOOK does it.
 import type { OutcomeTier } from '../../campaign/types'
+import type { EvidenceRecord } from '../../records'
+import { isIndependentObservation, buildRecordGraph } from '../../records'
+import type { ClueRecordEntry, DeskCheckEntry } from '../types'
+import type { ScheduledEventSpec } from '../../time'
 
 /** One of the four fictional hubs. Ids and authored static facts only;
  *  live open/closed truth and runway occupancy live in substate. */
@@ -72,11 +76,19 @@ export interface StormStep {
  *  forecast is replaced and exactly one material-change announcement
  *  names the changed corridor or hub. The projection data itself is
  *  authored display content; the engine only tracks how many corrections
- *  have applied. */
+ *  have applied. The correction also carries the flight it most affects
+ *  and that flight's authored last-safe-decision offset, so the content
+ *  validator can prove the correction lands with at least leadMargin of
+ *  decision room before the flight must be committed. */
 export interface ProjectionCorrection {
   readonly offsetSeconds: number
   /** The corridor or hub id whose forecast materially changed. */
   readonly changedId: string
+  /** The flight whose routing this correction bears on. */
+  readonly affectedFlightId: string
+  /** Seconds from mission start by which the affected flight must be
+   *  routed or held for the corrected forecast to matter. Integer. */
+  readonly lastSafeDecisionAtSeconds: number
   readonly warningLine: string
   readonly cueId: string
 }
@@ -116,3 +128,454 @@ export interface FlightsPayload {
   readonly paymentsDelayedTargetHubId: string
   readonly flightsDisruptedTable: FlightsDisruptedTable
 }
+
+// ── Content validation ──────────────────────────────────────────────
+// A PURE authoring gate for GROUND ALL FLIGHTS, the analogue of CRASH
+// OUTLOOK's validateOutlookContent. It never throws: it returns a list of
+// structured ContentError entries so one CI run names every authoring
+// mistake. Invariants 1, 3, 4, 5, and 6 from the section plan are validator
+// rules here; invariant 2 (solvability) needs the module lifecycle and lives
+// in solvability.test.ts.
+
+/** The per-seed expected record and run anchors. The fixture seed's anchors
+ *  are the canonical F06 / C17 / R04 / W02 / 21:14 values; seeds two and
+ *  three supply their own equivalents. One table so the validator and the
+ *  tests share a single source of truth. */
+export interface FlightsSeedAnchors {
+  /** The exercise run stamp the all-hubs restriction inherits (R04). */
+  readonly runId: string
+  /** The DERIVED all-hubs restriction record: the suspiciously-early
+   *  blanket grounding (F06). Carries the D-83 clue. */
+  readonly restrictionRecordId: string
+  /** The EXERCISE root the restriction's ancestry reaches (C17). */
+  readonly exerciseRootRecordId: string
+  /** The OBSERVED field report naming local weather and an open corridor,
+   *  the record a PROBE on the open corridor confirms (W02). Independent of
+   *  the exercise run. */
+  readonly openCorridorReportRecordId: string
+  /** The D-83 clue id the restriction record is designated for. */
+  readonly clueId: string
+  /** The corridor whose field report is the open-corridor record. */
+  readonly openCorridorId: string
+  /** Verbatim event clock the restriction embeds (21:14:08). */
+  readonly restrictionEventClock: string
+  /** Verbatim receipt clock the restriction embeds (21:14:52). */
+  readonly restrictionReceiptClock: string
+}
+
+export type FlightsContentErrorCode =
+  | 'HUB_COUNT'
+  | 'FLIGHT_COUNT'
+  | 'CORRIDOR_GRAPH'
+  | 'PROJECTION_PRESENT'
+  | 'DILEMMA'
+  | 'CORRECTION_LEAD'
+  | 'STORM_ARRIVAL_SEPARATION'
+  | 'RESTRICTION_PROVENANCE'
+  | 'DECOY_INDEPENDENCE'
+  | 'DESKCHECK_MISSING'
+  | 'CORRIDOR_REPORT_MISSING'
+  | 'CLUE_RECORD_MISSING'
+  | 'TUNING_INTEGER'
+  | 'PIN_HUB'
+  | 'JSON_ROUNDTRIP'
+
+export interface FlightsContentError {
+  readonly code: FlightsContentErrorCode
+  readonly detail: string
+}
+
+/** The dilemma threshold the opening-dilemma invariant uses: a queue delay
+ *  at or above this many whole seconds makes DIVERT a real cost, so the
+ *  open hub is a congested alternative, not a free landing. Shared by the
+ *  validator and the content test so one number governs both. */
+export const DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS = 15
+
+function isFiniteInteger(n: unknown): n is number {
+  return typeof n === 'number' && Number.isInteger(n)
+}
+
+/** One deterministic arrival derived from authored data or a replayed
+ *  script: the hub it lands at, the corridor it crossed, and the whole-ms
+ *  stamp it resolves. Section 04 reuses this shape for its same-second
+ *  separation guard. */
+export interface DerivedArrival {
+  readonly flightId: string
+  readonly hubId: string
+  readonly corridorId: string | null
+  /** Whole seconds from mission start. */
+  readonly offsetSeconds: number
+}
+
+/** The authored-data arrivals: every flight flown straight to its scheduled
+ *  destination, dispatched at its departure offset, no queue (position 0).
+ *  A pure helper exported beside the validator so invariant 4 and section
+ *  04's separation guard share one derivation. Diverts and holds are script
+ *  decisions, not authored truth, so this covers the authored baseline; the
+ *  solvability tests feed script-derived arrivals to the same separation
+ *  helper. */
+export function authoredArrivals(payload: FlightsPayload): DerivedArrival[] {
+  const out: DerivedArrival[] = []
+  for (const flight of payload.flights) {
+    const corridor = payload.corridors.find(
+      (c) =>
+        (c.fromHubId === flight.originHubId &&
+          c.toHubId === flight.destinationHubId) ||
+        (c.fromHubId === flight.destinationHubId &&
+          c.toHubId === flight.originHubId),
+    )
+    out.push({
+      flightId: flight.id,
+      hubId: flight.destinationHubId,
+      corridorId: corridor?.id ?? null,
+      offsetSeconds: flight.departureOffsetSeconds + flight.cruiseSeconds,
+    })
+  }
+  return out
+}
+
+/** The separation rule, factored out so section 04 reuses it: a storm step
+ *  that closes or opens a hub or corridor must not fall within one second of
+ *  any arrival it could affect (an arrival at that hub, or across that
+ *  corridor). Returns the offending pairs as error details. */
+export function stormArrivalCollisions(
+  stormTrack: readonly StormStep[],
+  arrivals: readonly DerivedArrival[],
+): string[] {
+  const collisions: string[] = []
+  for (const step of stormTrack) {
+    const touchedHubs = new Set<string>([...step.closeHubs, ...step.openHubs])
+    const touchedCorridors = new Set<string>([
+      ...step.closeCorridors,
+      ...step.openCorridors,
+    ])
+    for (const arrival of arrivals) {
+      const affectsHub = touchedHubs.has(arrival.hubId)
+      const affectsCorridor =
+        arrival.corridorId !== null && touchedCorridors.has(arrival.corridorId)
+      if (!affectsHub && !affectsCorridor) continue
+      if (Math.abs(step.offsetSeconds - arrival.offsetSeconds) < 1) {
+        collisions.push(
+          `storm step at ${step.offsetSeconds}s shares a second with arrival ${arrival.flightId} at ${arrival.offsetSeconds}s`,
+        )
+      }
+    }
+  }
+  return collisions
+}
+
+/** Walk a record's parentId chain to its deepest resolvable ancestor,
+ *  carrying a visited set so a cycle or dangling parent terminates. */
+function traceRoot(
+  records: readonly EvidenceRecord[],
+  startId: string,
+): EvidenceRecord | null {
+  const byId = new Map(records.map((r) => [r.id, r]))
+  let current = byId.get(startId) ?? null
+  if (!current) return null
+  const visited = new Set<string>([current.id])
+  while (current.parentId !== null) {
+    if (visited.has(current.parentId)) break
+    const parent = byId.get(current.parentId)
+    if (!parent) break
+    visited.add(parent.id)
+    current = parent
+  }
+  return current
+}
+
+/** Does any storm step close this hub? The projected-storm-path test. */
+function hubInStormPath(stormTrack: readonly StormStep[], hubId: string): boolean {
+  return stormTrack.some((s) => s.closeHubs.includes(hubId))
+}
+
+/** Validate authored flights content. Empty array means valid. Pure over
+ *  all inputs; the record graph, deskChecks, clueRecords, and schedule are
+ *  threaded in so the provenance, desk-coverage, and integer rules run
+ *  against the real shared tables. */
+export function validateFlightsContent(
+  payload: FlightsPayload,
+  records: readonly EvidenceRecord[],
+  deskChecks: readonly DeskCheckEntry[],
+  clueRecords: readonly ClueRecordEntry[],
+  schedule: readonly ScheduledEventSpec[],
+  anchors: FlightsSeedAnchors,
+): FlightsContentError[] {
+  const errors: FlightsContentError[] = []
+
+  // Rule (invariant 1, structure): exactly four hubs and eight flights.
+  if (payload.hubs.length !== 4) {
+    errors.push({
+      code: 'HUB_COUNT',
+      detail: `expected 4 hubs, found ${payload.hubs.length}`,
+    })
+  }
+  if (payload.flights.length !== 8) {
+    errors.push({
+      code: 'FLIGHT_COUNT',
+      detail: `expected 8 flights, found ${payload.flights.length}`,
+    })
+  }
+
+  // Rule: the corridor graph is connected over the authored hubs (every hub
+  // reachable from the first by undirected corridor edges).
+  if (payload.hubs.length > 0) {
+    const hubIds = new Set(payload.hubs.map((h) => h.id))
+    const adjacency = new Map<string, string[]>()
+    for (const hub of payload.hubs) adjacency.set(hub.id, [])
+    for (const corridor of payload.corridors) {
+      if (hubIds.has(corridor.fromHubId) && hubIds.has(corridor.toHubId)) {
+        adjacency.get(corridor.fromHubId)!.push(corridor.toHubId)
+        adjacency.get(corridor.toHubId)!.push(corridor.fromHubId)
+      }
+    }
+    const seen = new Set<string>()
+    const stack = [payload.hubs[0]!.id]
+    while (stack.length > 0) {
+      const id = stack.pop()!
+      if (seen.has(id)) continue
+      seen.add(id)
+      for (const next of adjacency.get(id) ?? []) {
+        if (!seen.has(next)) stack.push(next)
+      }
+    }
+    if (seen.size !== payload.hubs.length) {
+      errors.push({
+        code: 'CORRIDOR_GRAPH',
+        detail: `corridor graph not connected: reached ${seen.size} of ${payload.hubs.length} hubs`,
+      })
+    }
+  }
+
+  // Rule: the authored projection is present with at least one divergence
+  // point (a correction naming a changed id).
+  if (payload.corrections.length < 1) {
+    errors.push({
+      code: 'PROJECTION_PRESENT',
+      detail: 'no projection correction authored (need at least one divergence point)',
+    })
+  }
+
+  // Rule (invariant 1, dilemma): at least one hub inside the projected storm
+  // path with a free slot at mission start, and at least one hub the storm
+  // leaves open; a queue delay at or above the dilemma threshold makes the
+  // open hub a congested alternative rather than a free landing.
+  const stormPathWithSlot = payload.hubs.find(
+    (h) => hubInStormPath(payload.stormTrack, h.id) && h.runwaySlots > 0,
+  )
+  const openHub = payload.hubs.find(
+    (h) => !hubInStormPath(payload.stormTrack, h.id),
+  )
+  const maxQueueDelay =
+    payload.queueDelayTable.length === 0
+      ? 0
+      : Math.max(...payload.queueDelayTable)
+  if (!stormPathWithSlot) {
+    errors.push({
+      code: 'DILEMMA',
+      detail: 'no hub inside the projected storm path with a free runway slot at start',
+    })
+  }
+  if (!openHub) {
+    errors.push({
+      code: 'DILEMMA',
+      detail: 'no hub the storm track leaves open',
+    })
+  }
+  if (maxQueueDelay < DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS) {
+    errors.push({
+      code: 'DILEMMA',
+      detail: `queue delay ${maxQueueDelay}s below dilemma threshold ${DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS}s; DIVERT is a free landing`,
+    })
+  }
+
+  // Rule (invariant 3, correction lead margin): every correction fires at
+  // least leadMargin before the affected flight's last-safe-decision offset,
+  // which must itself not run later than that flight's own departure window.
+  const flightById = new Map(payload.flights.map((f) => [f.id, f]))
+  for (const correction of payload.corrections) {
+    const flight = flightById.get(correction.affectedFlightId)
+    if (!flight) {
+      errors.push({
+        code: 'CORRECTION_LEAD',
+        detail: `correction affects unknown flight ${correction.affectedFlightId}`,
+      })
+      continue
+    }
+    if (
+      correction.offsetSeconds >
+      correction.lastSafeDecisionAtSeconds - payload.leadMarginSeconds
+    ) {
+      errors.push({
+        code: 'CORRECTION_LEAD',
+        detail: `correction at ${correction.offsetSeconds}s leaves under ${payload.leadMarginSeconds}s before flight ${flight.id} last-safe-decision ${correction.lastSafeDecisionAtSeconds}s`,
+      })
+    }
+    const originHub = payload.hubs.find((h) => h.id === flight.originHubId)
+    if (
+      originHub &&
+      correction.lastSafeDecisionAtSeconds > originHub.lastDepartureOffsetSeconds
+    ) {
+      errors.push({
+        code: 'CORRECTION_LEAD',
+        detail: `flight ${flight.id} last-safe-decision ${correction.lastSafeDecisionAtSeconds}s runs past its origin window ${originHub.lastDepartureOffsetSeconds}s`,
+      })
+    }
+  }
+
+  // Rule (invariant 4, storm/arrival separation): no storm transition shares
+  // a second with any authored arrival it could affect.
+  for (const detail of stormArrivalCollisions(
+    payload.stormTrack,
+    authoredArrivals(payload),
+  )) {
+    errors.push({ code: 'STORM_ARRIVAL_SEPARATION', detail })
+  }
+
+  // Rule (invariant 5, records): the restriction record is DERIVED with run
+  // ancestry reaching the EXERCISE root at the exercise run; the open-corridor
+  // field report passes isIndependentObservation against the exercise run;
+  // the clueRecords table designates the restriction record for the D-83 clue.
+  const graph = buildRecordGraph(records)
+  const restriction = records.find((r) => r.id === anchors.restrictionRecordId)
+  if (!restriction) {
+    errors.push({
+      code: 'RESTRICTION_PROVENANCE',
+      detail: `restriction record ${anchors.restrictionRecordId} not in the record graph`,
+    })
+  } else {
+    if (restriction.origin !== 'DERIVED') {
+      errors.push({
+        code: 'RESTRICTION_PROVENANCE',
+        detail: `restriction ${restriction.id} origin ${restriction.origin}, not DERIVED`,
+      })
+    }
+    const root = traceRoot(records, restriction.id)
+    if (!root || root.id !== anchors.exerciseRootRecordId) {
+      errors.push({
+        code: 'RESTRICTION_PROVENANCE',
+        detail: `restriction ${restriction.id} ancestry reaches ${root?.id ?? 'nothing'}, not the exercise root ${anchors.exerciseRootRecordId}`,
+      })
+    } else if (root.origin !== 'EXERCISE' || root.runId !== anchors.runId) {
+      errors.push({
+        code: 'RESTRICTION_PROVENANCE',
+        detail: `exercise root ${root.id} origin ${root.origin} run ${String(root.runId)}, expected EXERCISE run ${anchors.runId}`,
+      })
+    }
+  }
+  const decoyVerdict = isIndependentObservation(
+    graph,
+    anchors.openCorridorReportRecordId,
+    anchors.runId,
+  )
+  if (!decoyVerdict.independent) {
+    errors.push({
+      code: 'DECOY_INDEPENDENCE',
+      detail: `open-corridor report ${anchors.openCorridorReportRecordId} is not independent of run ${anchors.runId}: ${decoyVerdict.reason}`,
+    })
+  }
+  const clueEntry = clueRecords.find(
+    (e) => e.recordId === anchors.restrictionRecordId && e.clueId === anchors.clueId,
+  )
+  if (!clueEntry) {
+    errors.push({
+      code: 'CLUE_RECORD_MISSING',
+      detail: `clueRecords has no { ${anchors.restrictionRecordId}, ${anchors.clueId} } entry`,
+    })
+  }
+
+  // Rule: every record id the payload references has a deskChecks row, and
+  // every corridor's field-report record exists in the graph with a row.
+  const deskIds = new Set(deskChecks.map((d) => d.recordId))
+  const recordIds = new Set(records.map((r) => r.id))
+  for (const corridor of payload.corridors) {
+    if (!recordIds.has(corridor.fieldReportRecordId)) {
+      errors.push({
+        code: 'CORRIDOR_REPORT_MISSING',
+        detail: `corridor ${corridor.id} field report ${corridor.fieldReportRecordId} absent from the record graph`,
+      })
+    }
+    if (!deskIds.has(corridor.fieldReportRecordId)) {
+      errors.push({
+        code: 'DESKCHECK_MISSING',
+        detail: `corridor ${corridor.id} field report ${corridor.fieldReportRecordId} has no deskChecks row`,
+      })
+    }
+  }
+  if (!deskIds.has(anchors.restrictionRecordId)) {
+    errors.push({
+      code: 'DESKCHECK_MISSING',
+      detail: `restriction record ${anchors.restrictionRecordId} has no deskChecks row`,
+    })
+  }
+
+  // Rule (invariant 6, integers and pins): every numeric tuning value in the
+  // payload, the storm track, and the schedule is a finite integer; the
+  // paymentsDelayed target hub names an existing hub; the payload JSON
+  // round-trips strict-equal.
+  const numericChecks: Array<[string, unknown]> = [
+    ['latenessThresholdSeconds', payload.latenessThresholdSeconds],
+    ['leadMarginSeconds', payload.leadMarginSeconds],
+    ['tierThresholds.full', payload.tierThresholds.full],
+    ['tierThresholds.partial', payload.tierThresholds.partial],
+    ['tierThresholds.poor', payload.tierThresholds.poor],
+  ]
+  for (const hub of payload.hubs) {
+    numericChecks.push([`hub ${hub.id} runwaySlots`, hub.runwaySlots])
+    numericChecks.push([
+      `hub ${hub.id} lastDepartureOffsetSeconds`,
+      hub.lastDepartureOffsetSeconds,
+    ])
+  }
+  for (const flight of payload.flights) {
+    numericChecks.push([`flight ${flight.id} departure`, flight.departureOffsetSeconds])
+    numericChecks.push([`flight ${flight.id} cruise`, flight.cruiseSeconds])
+    numericChecks.push([`flight ${flight.id} passengers`, flight.passengers])
+  }
+  payload.queueDelayTable.forEach((d, i) =>
+    numericChecks.push([`queueDelayTable[${i}]`, d]),
+  )
+  for (const step of payload.stormTrack) {
+    numericChecks.push([`storm step ${step.offsetSeconds} offset`, step.offsetSeconds])
+  }
+  for (const correction of payload.corrections) {
+    numericChecks.push([`correction ${correction.offsetSeconds} offset`, correction.offsetSeconds])
+    numericChecks.push([
+      `correction ${correction.affectedFlightId} lastSafeDecision`,
+      correction.lastSafeDecisionAtSeconds,
+    ])
+  }
+  for (const tier of ['full', 'partial', 'poor', 'failed'] as const) {
+    numericChecks.push([
+      `flightsDisruptedTable.${tier}`,
+      payload.flightsDisruptedTable[tier],
+    ])
+  }
+  for (const spec of schedule) {
+    numericChecks.push([`schedule ${spec.id} offset`, spec.offsetSeconds])
+  }
+  for (const [label, value] of numericChecks) {
+    if (!isFiniteInteger(value)) {
+      errors.push({
+        code: 'TUNING_INTEGER',
+        detail: `${label} must be a finite integer, found ${String(value)}`,
+      })
+    }
+  }
+  if (!payload.hubs.some((h) => h.id === payload.paymentsDelayedTargetHubId)) {
+    errors.push({
+      code: 'PIN_HUB',
+      detail: `paymentsDelayed target ${payload.paymentsDelayedTargetHubId} names no authored hub`,
+    })
+  }
+  try {
+    const round = JSON.parse(JSON.stringify(payload)) as unknown
+    if (JSON.stringify(round) !== JSON.stringify(payload)) {
+      errors.push({ code: 'JSON_ROUNDTRIP', detail: 'payload is not JSON stable' })
+    }
+  } catch {
+    errors.push({ code: 'JSON_ROUNDTRIP', detail: 'payload is not JSON-safe' })
+  }
+
+  return errors
+}
diff --git a/src/engine/missions/flights/payloads.ts b/src/engine/missions/flights/payloads.ts
new file mode 100644
index 0000000..a9b1872
--- /dev/null
+++ b/src/engine/missions/flights/payloads.ts
@@ -0,0 +1,257 @@
+// The three authored GROUND ALL FLIGHTS payloads and their per-seed
+// anchors. All names are invented: no real airports, cities, or airlines.
+// Copy is all-uppercase terminal diction with no em-dashes. Every numeric
+// value is a whole integer: slots, counts, whole-second offsets and cruise
+// times. The storm track advances on its own authored timeline; the
+// forecast lead fires leadMarginSeconds before each closing step so the
+// warning always precedes the hazard.
+//
+// Structural shape, identical across the three seeds (different weather
+// flavor, hub codes, flight ids, and run ids):
+//   - Four hubs. One (the STORM hub) sits in the projected storm path and
+//     has a free runway slot at start; one (the OPEN hub) the storm leaves
+//     open but reaching it by DIVERT costs a real queue delay. The opening
+//     dilemma reads off these two.
+//   - Eight flights, departing early (offsets 10..80) so the player can
+//     route each once it is airborne, with room before the deadline.
+//   - A connected corridor graph of five edges over the four hubs.
+//   - A deterministic storm that closes the storm hub and its northwest
+//     corridor at offset 170, forecast 30 seconds ahead at 140.
+//   - One projection correction at offset 100: the forecast had the open
+//     corridor failing; the correction clears it, with 60 seconds of
+//     decision room before the affected flight's last-safe-decision at 160.
+//   - Total runway capacity is eight slots for eight flights, so a single
+//     paymentsDelayed slot removal at the pinned hub forces exactly one
+//     flight to be held rather than landed. Holding a flight still resolves
+//     its passengers, so the mission stays winnable at maximum penalty.
+import type {
+  FlightsPayload,
+  FlightsSeedAnchors,
+  ProjectionCorrection,
+} from './content'
+
+interface SeedFlavor {
+  /** Invented hub codes: storm hub, open hub, and two neutral hubs. */
+  readonly stormHubId: string
+  readonly stormHubName: string
+  readonly openHubId: string
+  readonly openHubName: string
+  readonly northHubId: string
+  readonly northHubName: string
+  readonly eastHubId: string
+  readonly eastHubName: string
+  /** Flight id prefix, e.g. 'KF' gives KF01..KF08. */
+  readonly flightPrefix: string
+  /** Corridor id prefix, e.g. 'CR'. */
+  readonly corridorPrefix: string
+  /** The weather noun the forecast copy leans on. */
+  readonly weatherWord: string
+  readonly anchors: FlightsSeedAnchors
+}
+
+function flightId(prefix: string, n: number): string {
+  return `${prefix}${n < 10 ? `0${n}` : `${n}`}`
+}
+
+function buildPayload(flavor: SeedFlavor): FlightsPayload {
+  const {
+    stormHubId,
+    openHubId,
+    northHubId,
+    eastHubId,
+    flightPrefix: fp,
+    corridorPrefix: cp,
+    weatherWord,
+    anchors,
+  } = flavor
+
+  // Corridor ids. The open corridor is the one the field report confirms
+  // clear; the northwest corridor closes with the storm hub.
+  const openCorridorId = anchors.openCorridorId // open hub <-> east hub
+  const nwCorridorId = `${cp}-NW` // storm hub <-> north hub (closes)
+  const corridors = [
+    // Storm hub to north hub: the northwest corridor the storm closes.
+    { id: nwCorridorId, fromHubId: stormHubId, toHubId: northHubId, fieldReportRecordId: anchors.openCorridorReportRecordId },
+    // Open hub to east hub: the corridor the field report confirms clear.
+    { id: openCorridorId, fromHubId: openHubId, toHubId: eastHubId, fieldReportRecordId: anchors.openCorridorReportRecordId },
+    // Connective edges keeping the graph connected and giving every flight
+    // a corridor to its destination.
+    { id: `${cp}-NE`, fromHubId: northHubId, toHubId: eastHubId, fieldReportRecordId: anchors.openCorridorReportRecordId },
+    { id: `${cp}-OS`, fromHubId: openHubId, toHubId: stormHubId, fieldReportRecordId: anchors.openCorridorReportRecordId },
+    { id: `${cp}-ON`, fromHubId: openHubId, toHubId: northHubId, fieldReportRecordId: anchors.openCorridorReportRecordId },
+  ] as const
+
+  // Four hubs, two runway slots each: eight slots for eight flights, so a
+  // single slot removal forces exactly one hold.
+  const hubs = [
+    { id: stormHubId, name: flavor.stormHubName, runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+    { id: openHubId, name: flavor.openHubName, runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+    { id: northHubId, name: flavor.northHubName, runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+    { id: eastHubId, name: flavor.eastHubName, runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+  ] as const
+
+  // Eight flights, two bound to each hub so every hub's two runway slots
+  // fill exactly. Each origin/destination pair has an authored corridor.
+  // Arrivals (departure + cruise, position 0) land at 50..120 seconds, all
+  // clear of the 140 forecast lead and the 170 storm transition. The two
+  // flights bound for the storm hub (positions 5 and 6) arrive at 90 and
+  // 120, well before the 170 close. Flight 1 crosses the open corridor the
+  // correction clears, so it is the correction's affected flight.
+  const flights = [
+    { id: flightId(fp, 1), originHubId: openHubId, destinationHubId: eastHubId, departureOffsetSeconds: 10, cruiseSeconds: 40, passengers: 180 },
+    { id: flightId(fp, 2), originHubId: northHubId, destinationHubId: eastHubId, departureOffsetSeconds: 20, cruiseSeconds: 40, passengers: 160 },
+    { id: flightId(fp, 3), originHubId: stormHubId, destinationHubId: northHubId, departureOffsetSeconds: 30, cruiseSeconds: 40, passengers: 150 },
+    { id: flightId(fp, 4), originHubId: eastHubId, destinationHubId: northHubId, departureOffsetSeconds: 40, cruiseSeconds: 40, passengers: 140 },
+    { id: flightId(fp, 5), originHubId: openHubId, destinationHubId: stormHubId, departureOffsetSeconds: 50, cruiseSeconds: 40, passengers: 130 },
+    { id: flightId(fp, 6), originHubId: northHubId, destinationHubId: stormHubId, departureOffsetSeconds: 80, cruiseSeconds: 40, passengers: 120 },
+    { id: flightId(fp, 7), originHubId: eastHubId, destinationHubId: openHubId, departureOffsetSeconds: 70, cruiseSeconds: 40, passengers: 110 },
+    { id: flightId(fp, 8), originHubId: northHubId, destinationHubId: openHubId, departureOffsetSeconds: 60, cruiseSeconds: 40, passengers: 100 },
+  ] as const
+
+  // DIVERT into an occupied queue costs a real delay: position 1 adds 20
+  // whole seconds, position 2 adds 45. Above the 15s dilemma threshold.
+  const queueDelayTable = [0, 20, 45] as const
+
+  // The storm closes the storm hub and its northwest corridor at 170; the
+  // forecast lead fires 30 seconds earlier. One divergence point is carried
+  // by the correction below, not a second storm step, so the storm truth
+  // stays a single clean transition clear of every authored arrival.
+  const stormTrack = [
+    {
+      offsetSeconds: 170,
+      closeHubs: [stormHubId],
+      openHubs: [],
+      closeCorridors: [nwCorridorId],
+      openCorridors: [],
+      warningLine: `${weatherWord} FRONT CLOSING ${flavor.stormHubName}. NORTHWEST CORRIDOR GOING DARK.`,
+      cueId: 'tone-storm-close',
+    },
+  ] as const
+
+  // The projection had the open corridor failing; the correction at 100
+  // clears it, 60 seconds before the affected flight (the one routing across
+  // the open corridor) must be committed at 160.
+  const corrections: readonly ProjectionCorrection[] = [
+    {
+      offsetSeconds: 100,
+      changedId: openCorridorId,
+      affectedFlightId: flightId(fp, 1),
+      lastSafeDecisionAtSeconds: 160,
+      warningLine: `CORRECTION: ${flavor.openHubName} CORRIDOR HOLDS CLEAR. EARLIER OUTAGE FORECAST WITHDRAWN.`,
+      cueId: 'tone-correction',
+    },
+  ]
+
+  // Resolved-passenger tiers. Total souls = 1090. FULL demands every flight
+  // resolved (landed, diverted, or safely held): the blanket-ground naive
+  // run strands its airborne flights and falls below FULL. PARTIAL is well
+  // above what a half-grounded fleet leaves.
+  const tierThresholds = { full: 1090, partial: 760, poor: 400 } as const
+
+  return {
+    hubs,
+    flights,
+    corridors,
+    queueDelayTable,
+    stormTrack,
+    corrections,
+    tierThresholds,
+    latenessThresholdSeconds: 30,
+    leadMarginSeconds: 30,
+    paymentsDelayedTargetHubId: eastHubId,
+    flightsDisruptedTable: { full: 0, partial: 6, poor: 12, failed: 18 },
+  }
+}
+
+// ── Seed one: the requirements fixture. Run R04, F06, C17, W02 ───────
+const FLIGHTS_ANCHORS_R04: FlightsSeedAnchors = {
+  runId: 'R04',
+  restrictionRecordId: 'F06',
+  exerciseRootRecordId: 'C17',
+  openCorridorReportRecordId: 'W02',
+  clueId: 'clue-d83-restriction',
+  openCorridorId: 'CR-OE',
+  restrictionEventClock: '21:14:08',
+  restrictionReceiptClock: '21:14:52',
+}
+
+export const FLIGHTS_PAYLOAD_R04 = buildPayload({
+  stormHubId: 'NOR',
+  stormHubName: 'NORVELL',
+  openHubId: 'VES',
+  openHubName: 'VESCARO',
+  northHubId: 'ALD',
+  northHubName: 'ALDREN',
+  eastHubId: 'KES',
+  eastHubName: 'KESTON',
+  flightPrefix: 'RF',
+  corridorPrefix: 'CR',
+  weatherWord: 'STORM',
+  anchors: FLIGHTS_ANCHORS_R04,
+})
+
+// ── Seed two: the dawn run. Run K11, G12, A09, V07 ──────────────────
+const FLIGHTS_ANCHORS_K11: FlightsSeedAnchors = {
+  runId: 'K11',
+  restrictionRecordId: 'G12',
+  exerciseRootRecordId: 'A09',
+  openCorridorReportRecordId: 'V07',
+  clueId: 'clue-d83-restriction',
+  openCorridorId: 'KC-OE',
+  restrictionEventClock: '06:42:10',
+  restrictionReceiptClock: '06:43:05',
+}
+
+export const FLIGHTS_PAYLOAD_K11 = buildPayload({
+  stormHubId: 'BRE',
+  stormHubName: 'BRELLIN',
+  openHubId: 'SOM',
+  openHubName: 'SOMBRAL',
+  northHubId: 'TAV',
+  northHubName: 'TAVRIS',
+  eastHubId: 'OLM',
+  eastHubName: 'OLMET',
+  flightPrefix: 'KF',
+  corridorPrefix: 'KC',
+  weatherWord: 'ICING',
+  anchors: FLIGHTS_ANCHORS_K11,
+})
+
+// ── Seed three: the afternoon run. Run T58, J15, E22, U04 ───────────
+const FLIGHTS_ANCHORS_T58: FlightsSeedAnchors = {
+  runId: 'T58',
+  restrictionRecordId: 'J15',
+  exerciseRootRecordId: 'E22',
+  openCorridorReportRecordId: 'U04',
+  clueId: 'clue-d83-restriction',
+  openCorridorId: 'TC-OE',
+  restrictionEventClock: '14:07:11',
+  restrictionReceiptClock: '14:08:00',
+}
+
+export const FLIGHTS_PAYLOAD_T58 = buildPayload({
+  stormHubId: 'CRA',
+  stormHubName: 'CRAVEN',
+  openHubId: 'DUN',
+  openHubName: 'DUNMORE',
+  northHubId: 'YEL',
+  northHubName: 'YELMERE',
+  eastHubId: 'PRA',
+  eastHubName: 'PRASKO',
+  flightPrefix: 'TF',
+  corridorPrefix: 'TC',
+  weatherWord: 'CROSSWIND',
+  anchors: FLIGHTS_ANCHORS_T58,
+})
+
+export const FLIGHTS_PAYLOAD_BY_SEED: Readonly<Record<string, FlightsPayload>> = {
+  'exercise-r04': FLIGHTS_PAYLOAD_R04,
+  'exercise-k11': FLIGHTS_PAYLOAD_K11,
+  'exercise-t58': FLIGHTS_PAYLOAD_T58,
+}
+
+export const FLIGHTS_ANCHORS_BY_SEED: Readonly<Record<string, FlightsSeedAnchors>> = {
+  'exercise-r04': FLIGHTS_ANCHORS_R04,
+  'exercise-k11': FLIGHTS_ANCHORS_K11,
+  'exercise-t58': FLIGHTS_ANCHORS_T58,
+}
diff --git a/src/engine/seeds/catalog.ts b/src/engine/seeds/catalog.ts
index f94646e..2128fdf 100644
--- a/src/engine/seeds/catalog.ts
+++ b/src/engine/seeds/catalog.ts
@@ -16,6 +16,13 @@ import {
   OUTLOOK_PAYLOAD_K11,
   OUTLOOK_PAYLOAD_T58,
 } from '../missions/outlook/payloads'
+import type { FlightsPayload } from '../missions/flights/content'
+import { flightsSchedule } from '../missions/flights/module'
+import {
+  FLIGHTS_PAYLOAD_R04,
+  FLIGHTS_PAYLOAD_K11,
+  FLIGHTS_PAYLOAD_T58,
+} from '../missions/flights/payloads'
 
 export const MISSION_IDS = ['outlook', 'flights', 'bank'] as const
 export const FINALE_ID = 'finale'
@@ -62,6 +69,7 @@ interface SeedSpec {
   deskChecks: DeskCheckEntry[]
   clueRecords: ClueRecordEntry[]
   outlookPayload: OutlookPayload
+  flightsPayload: FlightsPayload
   openExceptionsBaseline: number
 }
 
@@ -76,7 +84,7 @@ function build(spec: SeedSpec): SeedDefinition {
     clueRecords: spec.clueRecords,
     missionPayloads: {
       outlook: spec.outlookPayload,
-      flights: null,
+      flights: spec.flightsPayload,
       bank: null,
       finale: null,
     },
@@ -98,30 +106,11 @@ function build(spec: SeedSpec): SeedDefinition {
           payload: null,
         },
       ],
-      flights: [
-        ...milestones(),
-        {
-          id: 'storm-step-1',
-          offsetSeconds: 60,
-          anchor: 'start',
-          kind: 'stormStep',
-          payload: null,
-        },
-        {
-          id: 'forecast-correction',
-          offsetSeconds: 100,
-          anchor: 'start',
-          kind: 'forecastCorrection',
-          payload: null,
-        },
-        {
-          id: 'storm-step-2',
-          offsetSeconds: 160,
-          anchor: 'start',
-          kind: 'stormStep',
-          payload: null,
-        },
-      ],
+      // The real flights schedule is materialized from the payload (start,
+      // departures, storm steps, forecast leads, correction, window closes,
+      // and the end settle tick) plus the shared end-anchored warnings the
+      // seed-validation invariant asserts on every mission.
+      flights: [...milestones(), ...flightsSchedule(spec.flightsPayload)],
       bank: [
         ...milestones(),
         {
@@ -284,6 +273,7 @@ const seedOne = build({
     { recordId: 'B04', clueId: CLUE_IDS.ledgerHold },
   ],
   outlookPayload: OUTLOOK_PAYLOAD_R04,
+  flightsPayload: FLIGHTS_PAYLOAD_R04,
   openExceptionsBaseline: 12,
 })
 
@@ -389,6 +379,7 @@ const seedTwo = build({
     { recordId: 'H03', clueId: CLUE_IDS.ledgerHold },
   ],
   outlookPayload: OUTLOOK_PAYLOAD_K11,
+  flightsPayload: FLIGHTS_PAYLOAD_K11,
   openExceptionsBaseline: 14,
 })
 
@@ -494,6 +485,7 @@ const seedThree = build({
     { recordId: 'K08', clueId: CLUE_IDS.ledgerHold },
   ],
   outlookPayload: OUTLOOK_PAYLOAD_T58,
+  flightsPayload: FLIGHTS_PAYLOAD_T58,
   openExceptionsBaseline: 10,
 })
 
diff --git a/test/engine/missions/flights/content.test.ts b/test/engine/missions/flights/content.test.ts
new file mode 100644
index 0000000..60159ef
--- /dev/null
+++ b/test/engine/missions/flights/content.test.ts
@@ -0,0 +1,253 @@
+// The six GROUND ALL FLIGHTS content invariants as named tests,
+// parameterized over the three authored seeds, plus the fixture-seed
+// authoring spot checks and the forecast-before-the-affected-decision
+// property. The validator and the tests share one anchor table so a dropped
+// rule shows up as a dropped test.
+import { describe, expect, it } from 'vitest'
+import { SEED_CATALOG, SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS,
+  authoredArrivals,
+  stormArrivalCollisions,
+  validateFlightsContent,
+} from '@engine/missions/flights/content'
+import type {
+  FlightsContentError,
+  FlightsPayload,
+  FlightsSeedAnchors,
+} from '@engine/missions/flights/content'
+import { flightsSchedule } from '@engine/missions/flights/module'
+import { FLIGHTS_ANCHORS_BY_SEED } from '@engine/missions/flights/payloads'
+import type { ScheduledEventSpec } from '@engine/time'
+
+// The single authoritative per-seed anchor table. These are the ids the
+// validator and the spot checks both read; they must match the payloads'
+// FLIGHTS_ANCHORS_BY_SEED exactly.
+const EXPECTED_ANCHORS: Record<string, FlightsSeedAnchors> = {
+  'exercise-r04': {
+    runId: 'R04',
+    restrictionRecordId: 'F06',
+    exerciseRootRecordId: 'C17',
+    openCorridorReportRecordId: 'W02',
+    clueId: 'clue-d83-restriction',
+    openCorridorId: 'CR-OE',
+    restrictionEventClock: '21:14:08',
+    restrictionReceiptClock: '21:14:52',
+  },
+  'exercise-k11': {
+    runId: 'K11',
+    restrictionRecordId: 'G12',
+    exerciseRootRecordId: 'A09',
+    openCorridorReportRecordId: 'V07',
+    clueId: 'clue-d83-restriction',
+    openCorridorId: 'KC-OE',
+    restrictionEventClock: '06:42:10',
+    restrictionReceiptClock: '06:43:05',
+  },
+  'exercise-t58': {
+    runId: 'T58',
+    restrictionRecordId: 'J15',
+    exerciseRootRecordId: 'E22',
+    openCorridorReportRecordId: 'U04',
+    clueId: 'clue-d83-restriction',
+    openCorridorId: 'TC-OE',
+    restrictionEventClock: '14:07:11',
+    restrictionReceiptClock: '14:08:00',
+  },
+}
+
+function payloadFor(seedName: string): FlightsPayload {
+  return SEED_CATALOG[seedName]!.missionPayloads['flights'] as FlightsPayload
+}
+
+function scheduleFor(seedName: string): ScheduledEventSpec[] {
+  return [...flightsSchedule(payloadFor(seedName))]
+}
+
+function validate(seedName: string): FlightsContentError[] {
+  const seed = SEED_CATALOG[seedName]!
+  return validateFlightsContent(
+    payloadFor(seedName),
+    seed.records,
+    seed.deskChecks,
+    seed.clueRecords,
+    scheduleFor(seedName),
+    EXPECTED_ANCHORS[seedName]!,
+  )
+}
+
+function errorsOfCode(
+  errors: readonly FlightsContentError[],
+  code: FlightsContentError['code'],
+): FlightsContentError[] {
+  return errors.filter((e) => e.code === code)
+}
+
+describe('the anchor table matches the authored payload anchors', () => {
+  it.each(SEED_NAMES)('%s anchors agree', (seedName) => {
+    expect(EXPECTED_ANCHORS[seedName]).toEqual(FLIGHTS_ANCHORS_BY_SEED[seedName])
+  })
+})
+
+describe.each(SEED_NAMES)('GROUND ALL FLIGHTS content: %s', (seedName) => {
+  it('authored content is clean through the full validator', () => {
+    expect(validate(seedName)).toEqual([])
+  })
+
+  // Invariant 1: structure and the opening dilemma.
+  it('invariant 1: four hubs, eight flights, connected graph, projection, dilemma', () => {
+    const payload = payloadFor(seedName)
+    expect(payload.hubs).toHaveLength(4)
+    expect(payload.flights).toHaveLength(8)
+    expect(payload.corrections.length).toBeGreaterThanOrEqual(1)
+    // At least one hub in the projected storm path with a free slot at start.
+    const stormHubs = new Set(
+      payload.stormTrack.flatMap((s) => s.closeHubs),
+    )
+    const stormPathWithSlot = payload.hubs.find(
+      (h) => stormHubs.has(h.id) && h.runwaySlots > 0,
+    )
+    expect(stormPathWithSlot, 'a storm-path hub with a free slot').toBeTruthy()
+    // At least one hub the storm leaves open whose queue delay exceeds the
+    // dilemma threshold, so DIVERT there is a real cost.
+    const openHub = payload.hubs.find((h) => !stormHubs.has(h.id))
+    expect(openHub, 'an open alternative hub').toBeTruthy()
+    expect(Math.max(...payload.queueDelayTable)).toBeGreaterThanOrEqual(
+      DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS,
+    )
+    // The validator agrees (no DILEMMA, structure, or projection errors).
+    const errors = validate(seedName)
+    expect(errorsOfCode(errors, 'HUB_COUNT')).toEqual([])
+    expect(errorsOfCode(errors, 'FLIGHT_COUNT')).toEqual([])
+    expect(errorsOfCode(errors, 'CORRIDOR_GRAPH')).toEqual([])
+    expect(errorsOfCode(errors, 'PROJECTION_PRESENT')).toEqual([])
+    expect(errorsOfCode(errors, 'DILEMMA')).toEqual([])
+  })
+
+  // Invariant 3: correction lead margin arithmetic.
+  it('invariant 3: every correction leads its affected decision by leadMargin', () => {
+    const payload = payloadFor(seedName)
+    const flightById = new Map(payload.flights.map((f) => [f.id, f]))
+    for (const correction of payload.corrections) {
+      const flight = flightById.get(correction.affectedFlightId)
+      expect(flight, correction.affectedFlightId).toBeTruthy()
+      expect(correction.offsetSeconds).toBeLessThanOrEqual(
+        correction.lastSafeDecisionAtSeconds - payload.leadMarginSeconds,
+      )
+      // lastSafeDecision does not run past the affected flight's origin window.
+      const originHub = payload.hubs.find((h) => h.id === flight!.originHubId)!
+      expect(correction.lastSafeDecisionAtSeconds).toBeLessThanOrEqual(
+        originHub.lastDepartureOffsetSeconds,
+      )
+    }
+    expect(errorsOfCode(validate(seedName), 'CORRECTION_LEAD')).toEqual([])
+  })
+
+  // Invariant 4: storm/arrival separation on the authored arrivals.
+  it('invariant 4: no storm transition shares a second with an authored arrival', () => {
+    const payload = payloadFor(seedName)
+    expect(
+      stormArrivalCollisions(payload.stormTrack, authoredArrivals(payload)),
+    ).toEqual([])
+    expect(errorsOfCode(validate(seedName), 'STORM_ARRIVAL_SEPARATION')).toEqual([])
+  })
+
+  // Invariant 5: records, provenance, decoy independence, desk coverage, clue.
+  it('invariant 5: restriction provenance, decoy independence, desk and clue rows', () => {
+    const errors = validate(seedName)
+    expect(errorsOfCode(errors, 'RESTRICTION_PROVENANCE')).toEqual([])
+    expect(errorsOfCode(errors, 'DECOY_INDEPENDENCE')).toEqual([])
+    expect(errorsOfCode(errors, 'DESKCHECK_MISSING')).toEqual([])
+    expect(errorsOfCode(errors, 'CORRIDOR_REPORT_MISSING')).toEqual([])
+    expect(errorsOfCode(errors, 'CLUE_RECORD_MISSING')).toEqual([])
+    // Spot the clueRecords wiring directly.
+    const seed = SEED_CATALOG[seedName]!
+    const anchors = EXPECTED_ANCHORS[seedName]!
+    expect(
+      seed.clueRecords.some(
+        (e) =>
+          e.recordId === anchors.restrictionRecordId &&
+          e.clueId === anchors.clueId,
+      ),
+    ).toBe(true)
+  })
+
+  // Invariant 6: integers and pins.
+  it('invariant 6: every tuning value is a finite integer, pins and round-trip hold', () => {
+    const payload = payloadFor(seedName)
+    const errors = validate(seedName)
+    expect(errorsOfCode(errors, 'TUNING_INTEGER')).toEqual([])
+    expect(errorsOfCode(errors, 'PIN_HUB')).toEqual([])
+    expect(errorsOfCode(errors, 'JSON_ROUNDTRIP')).toEqual([])
+    expect(
+      payload.hubs.some((h) => h.id === payload.paymentsDelayedTargetHubId),
+    ).toBe(true)
+    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
+  })
+
+  // The forecast-arrives-before-the-affected-decision property, asserted on
+  // the authored content: the storm forecast lead precedes every closing
+  // storm step, and each correction precedes its affected decision by at
+  // least leadMargin.
+  it('property: the forecast arrives before every affected decision', () => {
+    const payload = payloadFor(seedName)
+    // The storm forecast lead fires leadMargin before each closing step.
+    for (const step of payload.stormTrack) {
+      const closes = step.closeHubs.length > 0 || step.closeCorridors.length > 0
+      if (!closes) continue
+      const leadOffset = Math.max(0, step.offsetSeconds - payload.leadMarginSeconds)
+      expect(leadOffset).toBeLessThan(step.offsetSeconds)
+    }
+    // Each correction leads its affected flight decision.
+    for (const correction of payload.corrections) {
+      expect(correction.offsetSeconds + payload.leadMarginSeconds).toBeLessThanOrEqual(
+        correction.lastSafeDecisionAtSeconds,
+      )
+    }
+  })
+})
+
+// Fixture-seed authoring spot checks (exercise-r04).
+describe('fixture-seed authoring spot checks (exercise-r04)', () => {
+  const seed = SEED_CATALOG['exercise-r04']!
+  const payload = payloadFor('exercise-r04')
+  const byId = Object.fromEntries(seed.records.map((r) => [r.id, r]))
+
+  it('F06 carries the verbatim restriction times and DERIVED ancestry', () => {
+    // 21:14:08 = 76448, 21:14:52 = 76492.
+    expect(byId['F06']).toMatchObject({
+      origin: 'DERIVED',
+      parentId: 'C17',
+      runId: 'R04',
+      eventTime: 76448,
+      receiptTime: 76492,
+    })
+  })
+
+  it('W02 is the OBSERVED field report naming local weather and an open corridor', () => {
+    expect(byId['W02']).toMatchObject({ origin: 'OBSERVED', runId: null })
+    const body = byId['W02']!.body.join(' ')
+    expect(body).toContain('NORTHWEST')
+    expect(body).toContain('OPEN')
+  })
+
+  it('the open corridor field report is the independent OBSERVED W02 record', () => {
+    const openCorridor = payload.corridors.find((c) => c.id === 'CR-OE')!
+    expect(openCorridor.fieldReportRecordId).toBe('W02')
+    // The desk reply confirms the corridor's true open state (OBSERVED
+    // provenance confirmation), not a contradiction.
+    const desk = seed.deskChecks.find((d) => d.recordId === 'W02')!
+    expect(desk.outcome).toBe('CONFIRMED')
+    expect(Number.isInteger(desk.delaySeconds)).toBe(true)
+  })
+
+  it('the restriction record is the suspiciously-early all-hubs grounding, before the storm', () => {
+    // The F06 restriction (D-83 clue) is published in the record stream well
+    // before the authored storm actually closes anything (offset 170), which
+    // is why it reads as suspiciously early.
+    const stormClose = payload.stormTrack[0]!.offsetSeconds
+    expect(stormClose).toBe(170)
+    // The restriction is a DERIVED exercise artifact, not an OBSERVED event.
+    expect(byId['F06']!.origin).toBe('DERIVED')
+  })
+})
diff --git a/test/engine/missions/flights/solvability.test.ts b/test/engine/missions/flights/solvability.test.ts
new file mode 100644
index 0000000..7fc19b2
--- /dev/null
+++ b/test/engine/missions/flights/solvability.test.ts
@@ -0,0 +1,132 @@
+// The GROUND ALL FLIGHTS solvability invariant (plan invariant 2), run
+// through the REAL module and engine lifecycle over the three authored
+// seeds. The walkthrough reaches full tier under the real storm track; the
+// blanket-grounding adversarial provably falls below full; the same
+// walkthrough replayed with maximum inbound consequences still reaches at
+// least partial; the alternate reaches full tier at that maximum penalty.
+// It also asserts the storm/arrival separation over the script-derived
+// arrivals and confirms inspecting the restriction record surfaces the clue.
+import { describe, expect, it } from 'vitest'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  authoredArrivals,
+  stormArrivalCollisions,
+} from '@engine/missions/flights/content'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  adversarialGroundAllFor,
+  alternateFor,
+  driveFlightsSeed,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  scriptArrivals,
+  walkthroughFor,
+} from './fixtures'
+import { FLIGHTS_ANCHORS_BY_SEED } from '@engine/missions/flights/payloads'
+
+const TIER_RANK: Record<string, number> = {
+  failed: 0,
+  poor: 1,
+  partial: 2,
+  full: 3,
+}
+
+function tierOf(state: { settled: readonly { missionId: string; tier: string }[] }): string {
+  return state.settled.find((s) => s.missionId === 'flights')!.tier
+}
+
+function resolvedOf(state: {
+  settled: readonly { missionId: string; metrics: Record<string, number> }[]
+}): number {
+  return state.settled.find((s) => s.missionId === 'flights')!.metrics[
+    'resolved_passengers'
+  ]!
+}
+
+describe.each(SEED_NAMES)('GROUND ALL FLIGHTS solvability: %s', (seedName) => {
+  it('the walkthrough reaches full tier under the real storm track', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { state } = driveFlightsSeed(ctx, seedName, walkthroughFor(seedName))
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    expect(tierOf(state)).toBe('full')
+    expect(resolvedOf(state)).toBe(total)
+  })
+
+  it('the blanket-grounding adversarial provably falls below full', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { state } = driveFlightsSeed(
+      ctx,
+      seedName,
+      adversarialGroundAllFor(seedName),
+    )
+    const flights = state.settled.find((s) => s.missionId === 'flights')!
+    expect(TIER_RANK[flights.tier]!).toBeLessThan(3)
+    // Grounding stranded the already-airborne flights: a real passenger loss.
+    expect(flights.metrics['stranded_passengers']!).toBeGreaterThan(0)
+    expect(flights.metrics['grounded']).toBe(1)
+  })
+
+  it('the walkthrough replayed at maximum penalty still reaches at least partial', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { state } = driveFlightsSeed(
+      ctx,
+      seedName,
+      walkthroughFor(seedName),
+      FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000,
+      true,
+    )
+    expect(TIER_RANK[tierOf(state)]!).toBeGreaterThanOrEqual(2)
+  })
+
+  it('the alternate reaches full tier at maximum penalty (winnable at max)', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { state } = driveFlightsSeed(
+      ctx,
+      seedName,
+      alternateFor(seedName),
+      FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000,
+      true,
+    )
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    expect(tierOf(state)).toBe('full')
+    expect(resolvedOf(state)).toBe(total)
+  })
+
+  it('the walkthrough-derived arrivals stay clear of every storm transition', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // Sample just before the last arrival folds (and the all-terminal poll
+    // settles the mission, dropping the live substate): every routed flight
+    // carries its computed arrival stamp and inbound hub by then.
+    const arrivals = scriptArrivals(
+      ctx,
+      seedName,
+      walkthroughFor(seedName),
+      FLIGHTS_T0 + 119_000,
+    )
+    // The walkthrough routes all eight flights, so it yields eight arrivals.
+    expect(arrivals.length).toBe(8)
+    expect(stormArrivalCollisions(payload.stormTrack, arrivals)).toEqual([])
+    // And the authored baseline agrees.
+    expect(
+      stormArrivalCollisions(payload.stormTrack, authoredArrivals(payload)),
+    ).toEqual([])
+  })
+
+  it('inspecting the restriction record surfaces the D-83 clue through the engine', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const anchors = FLIGHTS_ANCHORS_BY_SEED[seedName]!
+    const { state } = driveFlightsSeed(ctx, seedName, [
+      [{ type: 'START_MISSION', missionId: 'flights' }, FLIGHTS_T0],
+      [
+        { type: 'INSPECT_RECORD', recordId: anchors.restrictionRecordId },
+        FLIGHTS_T0 + 3_000,
+      ],
+    ])
+    expect(state.cluesFound).toContain(anchors.clueId)
+  })
+})
