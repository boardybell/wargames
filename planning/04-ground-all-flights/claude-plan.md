# Implementation Plan: 04-ground-all-flights (revision 2 after review)

Mission 2 of SHALL WE PLAY A GAME?: GROUND ALL FLIGHTS, a live character-map
air-traffic puzzle. Self-contained prose; code only as types, signatures,
trees. Revision 2 integrates reviews/iteration-1-opus.md in full
(claude-integration-notes.md records the decisions); the engine-owned
mechanisms are now named explicitly and the validator carries the
solvability and timing invariants.

## 1. Context and binding contracts

Engine (split 01, rev 2 plus sections 15 and 16): pure MissionModules
(init, schedule, validate, reduce, evaluate, debrief, saveSchema, optional
clues()); dispatch and advanceToNow return { state, emitted }; events drain
in (scheduledAt, id) order and events with scheduledAt <= endsAt resolve
BEFORE the timeout settlement guard in the same advanceToNow; CHECK SOURCE
is engine-owned (REQUEST_SOURCE_CHECK on the campaign queue, authored
outcomes in the shared SeedDefinition.deskChecks table keyed by record id,
replies as sourceCheckResolved with arrivedAfterSettlement support);
INSPECT_RECORD is the campaign action that both highlights a record for the
finale and is observable by the mission reduce; clues(state) is polled
after every reduce and merges into cluesFound with clueFound events;
integer math; substates reference-only. Shell (split 02, rev 2):
CharacterGrid, list parity, verbs, glossary (global provenance terms),
briefing-flights art slot, emitted-driven cues and announcements, persisted
UI preferences. Content in SeedDefinition.missionPayloads.flights plus
SeedDefinition.stormTrack. Fixture records: F06 (DERIVED from C17, run
R04, event 21:14:08, receipt 21:14:52), the OBSERVED field report, decoy
W02 (OBSERVED, no R04 ancestry).

## 2. Directory layout

    src/engine/missions/flights/
      types.ts          state types + valibot saveSchema (reference-only)
      content.ts        payload type, content validators with invariants
      module.ts         MissionModule implementation (with clues())
      rules.ts          legality, queue math, storm application, tiering
      scoreboard.ts     passenger outcome aggregation + held/ground facts
    src/app/missions/flights/
      FlightsScreen.tsx view switching, verb and glossary registration
      MapView.tsx       CharacterGrid composition: map, legend, readout
      mapModel.ts       pure state-to-cell-matrix projection + legend
      FlightListView.tsx  full-parity list with per-flight action rows
      verbs.ts          LAND/DIVERT/HOLD/RELEASE/PROBE/GROUND ALL/TRACE/
                        CHECK SOURCE + view commands
      glossary.ts       local term registrations only
    test/engine/missions/flights/
    test/app/missions/flights/

## 3. Engine types and the reference-only split

Substate holds ONLY mutable facts: per-flight status and held flags, the
groundAll flag (single-use), applied-correction index, probe and
inspection flags (restrictionInspected and per-corridor probe markers),
queue occupancy. Authored content stays in the immutable payload: hub
definitions (ids, names, runway slots, last-departure offsets), flight
definitions (ids, origins, destinations, departure offsets, passenger
counts), corridor graph, the authored projection and its divergence
points, queue delay table, thresholds, the leadMargin, and the
paymentsDelayed target hub id (pinned per seed so consequence folding is
order-independent). The valibot saveSchema structurally excludes authored
copy from the substate.

    type FlightStatus = 'scheduled' | 'airborne' | 'held' | 'heldFinal'
      | 'landed' | 'landedLate' | 'divertedLanded' | 'stranded'

## 4. Rules (pure; every decision against drained state)

- Storm truth: scheduled storm events close and open hubs and corridors
  from SeedDefinition.stormTrack. The displayed projection is payload data
  plus the applied-correction index; reducers never read the projection,
  and display code never reads undrained truth. The correction event
  replaces projection data at its authored offset and emits one material-
  change event (single coalesced announcement naming the changed corridor
  or hub, two-tone cue).
- HOLD and RELEASE: HOLD is legal while a flight's status is scheduled
  (evaluated against drained state; a HOLD arriving in the same
  advanceToNow as the departure event resolves by drain-then-reduce order,
  tested). RELEASE reverses an individual HOLD while the flight's
  last-departure offset has not passed. When it passes, a held flight
  becomes heldFinal (terminal).
- GROUND ALL: single-use, irreversible fleet action (re-dispatch rejects
  as a provable no-op): all scheduled flights become held, departures and
  individual releases are blocked for the rest of the mission. It does NOT
  trigger early completion; the clock runs to endsAt so congestion and
  stranding play out. The scoreboard facts exposed by scoreboard.ts count
  every held flight as a WOPR-resolved exception (so OPEN EXCEPTIONS falls
  sharply at the fleet grounding) while passenger outcomes worsen.
- LAND and DIVERT: legal when the flight is airborne, the target hub is
  open with a free slot, and the connecting corridor is open, all at
  drained state. DIVERT joins the target queue with authored positional
  delay. Dispatches are legal regardless of projected arrival time; an
  arrival event with scheduledAt <= endsAt resolves the landing (late past
  the authored threshold), draining before the timeout guard (buzzer
  tie-break, boundary fixture); a computed arrival past endsAt leaves the
  flight airborne and it strands at timeout. The readout shows projected
  arrival beside the deadline so the gamble is informed.
- PROBE <corridor>: sugar for REQUEST_SOURCE_CHECK against the corridor's
  authored field-report record. The engine schedules the desk reply from
  the shared deskChecks table (authored offset; the mission schedules
  nothing and draws nothing); the reply is an OBSERVED record landing in
  campaign sourceChecks (finale-usable) and revealed in the corridor
  readout via the sourceCheckResolved event.
- TRACE: the screen dispatches INSPECT_RECORD. The D-83 clue is engine-
  owned via SeedDefinition.clueRecords (amendment 3): the restriction
  record (F06 equivalent) is a designated clue record, so inspecting it
  logs the clue and highlights it for the finale with no mission
  involvement. The module carries no inspection flag and defines no
  clues() for this (the campaign action never reaches mission reduce).
- Early completion: fires only when every flight is terminal (landed,
  landedLate, divertedLanded, stranded, heldFinal). Timeout: arrivals at
  the buzzer resolve first, then unresolved airborne flights strand, held
  flights become heldFinal, and evaluate runs. Forfeit evaluates as-is.
- evaluate(cause): integer passenger aggregation from scoreboard.ts; tier
  thresholds authored; consequence flightsDisrupted by tier. Inbound
  consequences: commsDelayed widens the authored projection divergence by
  its capped magnitude; paymentsDelayed removes one runway slot at the
  seed-named target hub for the authored early window.
- Debrief: arrivals, diversions, held and heldFinal counts, stranded
  passengers, unresolved flights, the GROUND ALL trade if taken, clue
  status.

## 5. Content validator invariants (content.ts, run per seed)

1. Structure: four hubs, eight flights, connected corridor graph, authored
   projection present with at least one divergence point, opening dilemma
   present (one projected-path hub with capacity, one open hub with a long
   queue).
2. Solvability: the walkthrough script reaches full tier under the real
   storm track; the same script, replayed under maximum inbound
   consequences (capped commsDelayed and paymentsDelayed folded), still
   reaches at least partial tier and a full-tier variant exists (authored
   alternate walkthrough) proving the mission is winnable at maximum
   penalty.
3. Timing: the correction event's scheduledAt <= the affected flight's
   lastSafeDecisionAt minus the authored leadMargin (30 s standard,
   proportionally scaled under extended time).
4. Separation: no storm close or open event shares a scheduledAt with any
   arrival event it could affect; at least one second apart.
5. Records: the restriction record is DERIVED with run ancestry reaching
   the exercise export; W02 (or seed equivalent) passes
   isIndependentObservation against the run; every referenced record id
   has a deskChecks entry; the corridor field-report records exist for
   every probe-able corridor.
6. Integers everywhere; paymentsDelayed target hub id exists.

## 6. Map and screens (shell side)

mapModel.ts: pure FlightsState-plus-payload to GridCell matrix and legend
(hubs bracketed, corridors as line characters, current weather solid,
projection hatched, restriction marker distinct, flight markers).
Keyboard selection cycles flight markers only (next marker in reading
order); hub and corridor cells are never selectable; tap selects any
flight marker. The readout renders the selected flight's hub, runway
availability, projected arrival beside the deadline, and viable
destinations from THE SAME legality selector the validators use (parity
test: offered strict-equals accepted across state fixtures).
FlightListView: all eight flights, status, conditions, full action rows
(LAND targets, DIVERT targets, HOLD/RELEASE), selection synced with the
grid. Narrow screens default to the list; the grid/list toggle persists
with UI preferences. GROUND ALL renders prominent, quoting WOPR's
directive, beside the dual scoreboard. Briefing still in briefing-flights.
Glossary: local terms only (CORRIDOR, RUNWAY SLOT, ARRIVAL QUEUE,
PROJECTION, FIELD REPORT, ALL-HUBS RESTRICTION); OBSERVED, EXERCISE,
DERIVED from the global glossary. Announcements: correction as one
coalesced polite message; probe results polite; milestones engine-owned;
scope tick and two-tone cues from emitted events only.

## 7. Testing strategy notes

Engine: legality tables (including HOLD/RELEASE windows and same-call
drain races); storm/projection separation (reducers never read
projection; display never reads undrained truth); buzzer boundary fixture
(arrival at endsAt lands, one tick later strands); GROUND ALL single-use,
no early completion, exceptions-fall-outcomes-worsen fixture; early-
completion terminal-status rule; arrival-past-deadline stranding;
correction timing margin; the six validator invariants per seed;
walkthrough, max-consequence, timeout, forfeit fixtures; extended-time
proportionality (all scheduled kinds scale; full tier and lead margin
survive doubling); mission-local property tests (no negative slots,
statuses only move forward along the lifecycle, settled once). Shell:
map model snapshots; marker-only keyboard cycling; grid-list selection
sync; readout-validator parity; command-button identity; coalesced
correction announcement; persisted view toggle; keyboard-only and
narrow-width passes.

## 8. Risks

Compact-grid readability (mitigated by list-first narrow default and the
legend; manual smoke). Authoring density: the storm track, projection,
divergences, and margins per seed are the real work; the six validator
invariants turn every authoring slip into a CI failure.
