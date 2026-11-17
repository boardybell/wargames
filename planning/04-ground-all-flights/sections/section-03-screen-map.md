# section-03-screen-map: Flights Screen, Map, List, Verbs, Glossary

Implements the shell side of GROUND ALL FLIGHTS (Mission 2 of SHALL WE
PLAY A GAME?), a live character-map air-traffic puzzle. This section
builds everything under `src/app/missions/flights/` plus its tests under
`test/app/missions/flights/`. Screen tests run in jsdom against the real
engine module, never a mock engine.

## Dependencies

- **section-01-module-rules** (required, complete before starting): the
  engine mission module at `src/engine/missions/flights/` with types,
  rules (including the shared legality selector), scoreboard facts, and
  module registration. This section imports those; it does not reimplement
  them.
- Splits 01 and 02 of the campaign engine and shell are already in place:
  pure MissionModules with `dispatch`/`advanceToNow` returning
  `{ state, emitted }`, the shell's CharacterGrid component, verb
  registration, the global glossary (which already defines OBSERVED,
  EXERCISE, DERIVED), the briefing art-slot system (`briefing-flights`),
  emitted-driven cue/announcement plumbing, and persisted UI preferences.
- section-02-content-seeds runs in parallel; do not block on it. Screen
  tests use state fixtures built against the engine module, not the real
  seeds.
- section-04-fixtures-polish consumes this section for keyboard-only and
  narrow-width full-flow passes; leave those two end-to-end passes to it
  (this section covers one basic keyboard-only and narrow-width routing
  flow at smoke level, section 04 does the exhaustive versions).

## Binding background (copied here so the section stands alone)

The mission: four hubs, eight flights, a corridor graph, a scheduled
storm that closes and opens hubs and corridors over time. The player sees
a character-map of the airspace. Truth (actual weather, from drained
engine state) renders solid; the authored forecast projection renders
hatched; an all-hubs restriction marker renders distinct from both. A
mid-mission correction event replaces projection data and the engine
emits one material-change event for it.

Critical separation contract: **reducers never read the projection, and
display code never reads undrained truth.** The shell only ever renders
from the state returned by the last `dispatch`/`advanceToNow` call plus
the immutable payload. No local timers in the shell: the scope tick and
two-tone cues fire from emitted events only.

Flight lifecycle statuses (engine type, imported):

    type FlightStatus = 'scheduled' | 'airborne' | 'held' | 'heldFinal'
      | 'landed' | 'landedLate' | 'divertedLanded' | 'stranded'

Player verbs and what the shell dispatches:

- LAND `<flight> <hub>` and DIVERT `<flight> <hub>`: mission actions,
  legal only when the flight is airborne, the target hub is open with a
  free runway slot, and the connecting corridor is open, all at drained
  state. DIVERT joins the target arrival queue with authored positional
  delay. Dispatch is legal even when projected arrival lands past the
  deadline; the readout must show projected arrival beside the deadline
  so the gamble is informed.
- HOLD `<flight>`: legal while status is scheduled. RELEASE `<flight>`:
  reverses an individual HOLD while the flight's last-departure offset
  has not passed (after that the flight is heldFinal, terminal).
- GROUND ALL: single-use, irreversible fleet action. All scheduled
  flights become held; departures and individual releases are blocked
  for the rest of the mission. It does NOT end the mission early; the
  clock runs to endsAt. On the dual scoreboard, OPEN EXCEPTIONS falls
  sharply (every held flight counts as a WOPR-resolved exception) while
  passenger outcomes worsen. Re-dispatch is a provable no-op the engine
  rejects; the shell renders the verb as spent.
- PROBE `<corridor>`: sugar for the campaign action REQUEST_SOURCE_CHECK
  against the corridor's authored field-report record. The desk reply
  arrives later as a `sourceCheckResolved` emitted event; the shell then
  reveals the OBSERVED report in the corridor readout and announces it
  politely. The shell schedules nothing itself.
- TRACE: the screen dispatches the campaign action INSPECT_RECORD for
  the restriction record. The D-83 clue is engine-owned (clueRecords);
  the screen's only job is dispatching the action and reflecting the
  resulting highlight/clue events. No clue logic in the shell.
- View commands: grid/list toggle (persisted in UI preferences).

## Files to create

    src/app/missions/flights/
      FlightsScreen.tsx   screen registration, view switching between
                          MapView and FlightListView, verb and glossary
                          registration, GROUND ALL placement, dual
                          scoreboard wiring, emitted-event subscription
                          for cues and announcements
      MapView.tsx         CharacterGrid composition: map, legend, and the
                          selected-flight readout panel
      mapModel.ts         pure projection: (FlightsState, payload,
                          selection) -> { cells: GridCell[][], legend }
      FlightListView.tsx  full-parity list of all eight flights with
                          per-flight action rows
      verbs.ts            LAND / DIVERT / HOLD / RELEASE / PROBE /
                          GROUND ALL / TRACE / CHECK SOURCE registration
                          plus view commands
      glossary.ts         local term registrations only
    test/app/missions/flights/
      mapModel.test.ts
      MapView.keyboard.test.tsx
      readoutParity.test.tsx
      listView.test.tsx
      verbs.test.tsx
      announcements.test.tsx
      flow.smoke.test.tsx

## Tests first (TDD block 6)

Write these before the components. Stubs below say what to test; fill in
bodies against the real engine module and hand-built state fixtures.

**mapModel.test.ts** (pure, no DOM):

    describe('mapModel projection', () => {
      it.todo('snapshots the cell matrix per state fixture: hubs ' +
        'bracketed, corridors as line characters, flight markers placed')
      it.todo('renders current weather solid and projection hatched, ' +
        'visually distinct cell kinds in the model output')
      it.todo('renders the all-hubs restriction marker distinct from ' +
        'both weather kinds')
      it.todo('marks the selected flight marker with the selection ' +
        'classHook and no other cell')
      it.todo('produces the legend from payload data alone')
      it.todo('reads only drained state plus payload: feeding a state ' +
        'with a pending (undrained) storm event must not change output ' +
        'versus the same drained-state snapshot')
    })

**MapView.keyboard.test.tsx**:

    describe('marker-only selection', () => {
      it.todo('arrow keys cycle flight markers only, in reading order ' +
        '(row-major next marker), wrapping at the end')
      it.todo('hub and corridor cells are never selectable by keyboard')
      it.todo('tap/click selects flight markers only; taps on empty, ' +
        'hub, or corridor cells do not change selection')
    })

**readoutParity.test.tsx** (the load-bearing test of this section):

    describe('readout-validator parity', () => {
      it.todo('for each state fixture, the destination set offered in ' +
        'the readout strict-equals the set the engine legality ' +
        'selector accepts (same selector import, deepStrictEqual)')
      it.todo('readout shows the selected flight hub, runway ' +
        'availability, and viable destinations')
      it.todo('projected arrival renders beside the deadline for ' +
        'airborne flights, including when projected arrival is past ' +
        'the deadline (informed gamble)')
    })

Parity means the readout and the action rows call THE SAME exported
legality function from `src/engine/missions/flights/rules.ts` that the
engine validators use. The test imports that selector directly and
compares. Do not duplicate legality logic in the shell; if the shell
needs a helper, it lives in the engine rules module and is imported.

**listView.test.tsx**:

    describe('FlightListView', () => {
      it.todo('lists all eight flights with status and conditions')
      it.todo('each row carries full action rows: LAND targets, DIVERT ' +
        'targets, HOLD/RELEASE as legal; disabled actions show inline ' +
        'reasons from the typed rejection reasons')
      it.todo('selection syncs grid -> list and list -> grid')
      it.todo('narrow viewport defaults to the list view')
      it.todo('grid/list toggle persists via UI preferences across ' +
        'remount')
    })

**verbs.test.tsx**:

    describe('verbs', () => {
      it.todo('command-button identity: every registered verb (LAND, ' +
        'DIVERT, HOLD, RELEASE, PROBE, GROUND ALL, TRACE, CHECK ' +
        'SOURCE, view commands) dispatches the identical action the ' +
        'equivalent on-screen button dispatches')
      it.todo('GROUND ALL requires confirmation, quotes the WOPR ' +
        'directive, and renders spent/disabled after use')
      it.todo('PROBE dispatches REQUEST_SOURCE_CHECK with the ' +
        'corridor field-report record id; no shell scheduling')
      it.todo('TRACE dispatches INSPECT_RECORD for the restriction ' +
        'record; no clue state held in the shell')
    })

**announcements.test.tsx** (fake timers throughout to prove the shell
sets no timers of its own):

    describe('announcements and cues', () => {
      it.todo('the projection correction announces exactly once, ' +
        'coalesced, naming the changed corridor or hub, polite ' +
        'politeness, with the two-tone cue')
      it.todo('probe results (sourceCheckResolved) announce politely ' +
        'and reveal the OBSERVED report in the corridor readout')
      it.todo('scope tick and two-tone cues fire only in response to ' +
        'emitted events; with fake timers advanced and no events, ' +
        'nothing fires')
    })

**flow.smoke.test.tsx**: one keyboard-only routing flow (select a
flight, LAND it at a legal hub, observe the status change) and one
narrow-width pass confirming the list default and that every action
reachable on the grid is reachable in the list. Exhaustive passes belong
to section-04.

## Implementation details

**mapModel.ts.** Pure function, no React. Signature along the lines of:

    function buildMapModel(
      state: FlightsState,
      payload: FlightsPayload,
      selectedFlightId: FlightId | null
    ): { cells: GridCell[][]; legend: LegendEntry[] }

Cell kinds the model must distinguish: hub (bracketed, open vs closed),
corridor segment (line characters, open vs storm-closed solid vs
projection-hatched), restriction marker, flight marker (status-aware),
empty. The projection layer comes from payload data plus the
applied-correction index in state (the engine substate records which
correction has been applied; the model picks the corresponding authored
projection variant). The model never inspects the engine event queue.

**MapView.tsx.** Composes CharacterGrid from the shell with the model
output, the legend, and the readout panel. Keyboard handling implements
marker-only cycling: compute the ordered list of flight-marker cell
positions in reading order from the model, and arrow keys move selection
through that list only. Selection state is owned by FlightsScreen so the
list view shares it.

**Readout panel** (inside MapView): selected flight's current hub or
position, target hub runway availability, projected arrival rendered
beside the deadline, and the viable destination list derived from the
imported engine legality selector. Each viable destination is an
actionable LAND/DIVERT affordance; non-viable ones may render with the
typed rejection reason inline.

**FlightListView.tsx.** Full parity is the rule: anything doable from
the grid is doable from the list. Eight rows, each with status,
conditions (relevant corridor/hub weather facts), and action rows built
from the same legality selector. Selection is the same shared state as
the grid.

**FlightsScreen.tsx.** Registers the screen for the mission, owns
selection and the grid/list toggle (default resolved from viewport
width: narrow defaults to list; the user's explicit toggle persists via
the shell's UI preference store and wins over the default thereafter).
Places GROUND ALL prominently beside the dual scoreboard (OPEN
EXCEPTIONS and passenger outcomes, both fed from the engine
scoreboard facts), quoting WOPR's directive, with a confirmation step
and a spent state after use. Subscribes to emitted events from
dispatch/advanceToNow results for all cues and announcements; the
coalesced correction announcement is driven by the single
material-change event the engine emits, so the shell must not
re-coalesce or debounce with timers. Briefing art renders in the
existing `briefing-flights` slot; this section does not author briefing
copy.

**verbs.ts.** Registers LAND, DIVERT, HOLD, RELEASE, PROBE, GROUND ALL,
TRACE, CHECK SOURCE, and the view commands with the shell verb system.
Every verb maps to exactly the action object the corresponding button
dispatches (this is what the command-button identity test asserts, so
factor action construction into shared helpers used by both paths).
CHECK SOURCE is the engine-owned generic form; PROBE is its
corridor-specific sugar and must resolve the corridor's authored
field-report record id from the payload before dispatching
REQUEST_SOURCE_CHECK.

**glossary.ts.** Local registrations only: CORRIDOR, RUNWAY SLOT,
ARRIVAL QUEUE, PROJECTION, FIELD REPORT, ALL-HUBS RESTRICTION. Do not
re-register OBSERVED, EXERCISE, or DERIVED; those come from the global
glossary and re-registration should fail the glossary system's
uniqueness check if attempted. Definitions are plain-language for a
smart layperson, consistent with the global glossary register.

## Acceptance checklist

- All TDD block 6 tests above written first and passing.
- No legality logic duplicated in `src/app/`; the engine selector is the
  single source, proven by the parity test.
- No `setTimeout`/`setInterval`/`requestAnimationFrame` scheduling in
  any file under `src/app/missions/flights/` (fake-timer test holds).
- Display code reads only drained state plus payload; the mapModel
  undrained-truth test holds.
- Grid/list toggle, selection sync, narrow default, and persistence all
  pass; GROUND ALL confirmation and spent rendering pass.
- Glossary hover behavior and term coverage match the shell's existing
  glossary conventions.

Relevant absolute paths for the implementer:
`/Users/darkpool/wargames/src/app/missions/flights/` (create),
`/Users/darkpool/wargames/test/app/missions/flights/` (create),
`/Users/darkpool/wargames/src/engine/missions/flights/rules.ts` (import
the legality selector; built in section-01-module-rules). Test command:
`npm test`.