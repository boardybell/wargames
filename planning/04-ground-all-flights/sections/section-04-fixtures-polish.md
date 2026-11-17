# Section 04: Fixtures, Properties, and Polish

Final integration pass for mission 04-ground-all-flights (GROUND ALL FLIGHTS, mission 2 of SHALL WE PLAY A GAME?). This section wires the authored per-seed scripts into CI as end-to-end fixtures, adds the cross-cutting property and proportionality suites, runs the accessibility passes, and verifies debrief content. It is the proof that the engine module, the authored content, and the screen all hold together under every seed and every cause of mission end.

## Dependencies

- **section-01-module-rules**: the flights MissionModule in `src/engine/missions/flights/` (types, rules, module, scoreboard) with `terminal()`, the widened evaluate cause union, GROUND ALL semantics, buzzer rules, and PROBE-as-REQUEST_SOURCE_CHECK.
- **section-02-content-seeds**: the three seed payloads (`SeedDefinition.missionPayloads.flights` plus `SeedDefinition.stormTrack`), the six-invariant content validator, and the exported walkthrough and max-consequence scripts. Those scripts are inputs to this section; do not re-author them here.
- **section-03-screen-map**: FlightsScreen, MapView, FlightListView, verbs, announcements. The keyboard-only and narrow-width passes exercise these.

Also assumed from the engine and shell splits: pure MissionModules, `dispatch` and `advanceToNow` returning `{ state, emitted }`, drain order `(scheduledAt, id)`, events with `scheduledAt <= endsAt` resolving before the timeout settlement guard in the same `advanceToNow`, the shared `deskChecks` table, `clueRecords` (amendment 8), and extended-time scaling.

## Background facts this section tests against

- Eight flights per seed; terminal statuses are `landed`, `landedLate`, `divertedLanded`, `stranded`, `heldFinal`. Early completion fires only when all eight are terminal; `held` alone does not count.
- GROUND ALL is single-use and irreversible, holds all scheduled flights, blocks departures and individual releases, and does NOT trigger early completion; the clock runs to `endsAt`. Scoreboard facts count every held flight as a WOPR-resolved exception, so OPEN EXCEPTIONS falls sharply while passenger outcomes worsen.
- An arrival event with `scheduledAt <= endsAt` lands (late past the authored threshold) and drains before the timeout guard. An arrival computed past `endsAt` leaves the flight airborne; it strands at timeout, then held flights become `heldFinal`, then evaluate runs.
- Validator invariant 4 requires that no storm close or open event shares a `scheduledAt` with any arrival event it could affect; at least one second apart. Invariant 3 requires the correction event's `scheduledAt <= lastSafeDecisionAt - leadMargin` (30 s standard, proportionally scaled under extended time).
- Integer math everywhere; substate is JSON-safe and holds only mutable facts.
- Debrief reports arrivals, diversions, held and heldFinal counts, stranded passengers, unresolved flights, the GROUND ALL trade if taken, and clue status (the engine-owned D-83 clue via `clueRecords`).

## Files

Create (engine project, node):

    test/engine/missions/flights/fixtures.walkthrough.test.ts
    test/engine/missions/flights/fixtures.maxConsequence.test.ts
    test/engine/missions/flights/fixtures.timeout.test.ts
    test/engine/missions/flights/fixtures.forfeit.test.ts
    test/engine/missions/flights/fixtures.groundAll.test.ts
    test/engine/missions/flights/fixtures.buzzer.test.ts
    test/engine/missions/flights/fixtures.separation.test.ts
    test/engine/missions/flights/extendedTime.test.ts
    test/engine/missions/flights/properties.test.ts
    test/engine/missions/flights/debrief.test.ts

Create (shell project, jsdom with the real engine):

    test/app/missions/flights/keyboardOnly.test.tsx
    test/app/missions/flights/narrowWidth.test.tsx

Shared helper (create if section 02 did not already export one):

    test/engine/missions/flights/helpers/runScript.ts

`runScript(seed, script)` replays a scripted sequence of timed dispatches through `dispatch`/`advanceToNow`, always advancing to each step's time first so every decision lands against drained state, and returns the final state plus all emitted events. Every fixture below runs for all three seeds via a `describe.each` over seed ids.

## Tests first

All stubs below say what to assert, not how. Keep them as `it(...)` names with short bodies built on `runScript` and the module's public surface only.

### fixtures.walkthrough.test.ts

- `it('walkthrough script reaches full tier under the real storm track')` per seed: replay the section-02 walkthrough script, run to completion, assert evaluate returns the full tier and all eight flights are terminal with zero stranded.
- `it('walkthrough emits the coalesced correction material-change event exactly once')`.
- `it('early completion fires when the last flight turns terminal, not before')`: assert no completion while any flight is non-terminal; assert `held` does not count but `heldFinal` does.

### fixtures.maxConsequence.test.ts

- `it('base walkthrough under capped commsDelayed plus paymentsDelayed still reaches at least partial tier')`: fold maximum inbound consequences (commsDelayed widening the authored divergence by its capped magnitude, paymentsDelayed removing one runway slot at the seed-pinned target hub for the authored early window), replay the same script, assert at least partial tier.
- `it('authored full-tier alternate walkthrough wins at maximum penalty')`: replay the section-02 alternate script under the same folded consequences, assert full tier.
- `it('consequence folding is order-independent')`: property over permutations of the inbound consequence set; final substate strict-deep-equals across orders.

### fixtures.timeout.test.ts

- `it('at endsAt, due arrivals resolve before the settlement guard')`.
- `it('unresolved airborne flights strand and held flights become heldFinal at timeout')`.
- `it('evaluate(timeout) aggregates stranded passengers with integer math and the correct tier')`.

### fixtures.forfeit.test.ts

- `it('forfeit evaluates as-is mid-flight: no synthetic stranding beyond current state, tier from the aggregate at forfeit time')`.
- `it('debrief after forfeit reports unresolved flights')`.

### fixtures.groundAll.test.ts (blanket-grounding fixture)

- `it('GROUND ALL holds every scheduled flight and blocks departures and releases thereafter')`.
- `it('re-dispatch of GROUND ALL rejects as a provable no-op')` (typed rejection, state unchanged).
- `it('GROUND ALL does not early-complete; the clock runs to endsAt')`.
- `it('open exceptions fall sharply at the grounding while the passenger aggregate worsens')`: compare scoreboard facts immediately before and after, and final evaluate against the walkthrough baseline.
- `it('debrief names the GROUND ALL trade when taken')`.

### fixtures.buzzer.test.ts (boundary items from TDD block 4)

- `it('arrival exactly at endsAt lands and counts before the timeout guard')`.
- `it('arrival one tick after endsAt leaves the flight airborne and it strands at timeout')`.
- `it('late landing past the authored threshold settles as landedLate, settled once')`.

### fixtures.separation.test.ts (same-second separation guard)

- `it('no storm close or open shares a scheduledAt with any arrival it could affect, per seed')`: walk every seed's scheduled storm events against every computable arrival; assert at least one second apart. This re-asserts validator invariant 4 against the final shipped seeds as a direct fixture, independent of the validator's own tests.
- `it('drain order (scheduledAt, id) is deterministic across a replayed storm-heavy window')`: replay twice, strict-deep-equal emitted sequences.

### extendedTime.test.ts

- `it('all scheduled kinds scale proportionally under extended time')`: departures, arrivals, storm events, corrections, desk-check replies, and last-departure offsets all scale by the same factor; assert by comparing scaled and unscaled schedules.
- `it('the walkthrough still reaches full tier with time doubled')`.
- `it('the correction lead margin survives doubling')`: scaled correction `scheduledAt <= scaled lastSafeDecisionAt - scaled leadMargin`.

### properties.test.ts (mission-local property suite)

Property-based (fast-check or the project's existing property harness), seeded for reproducibility, over random legal action sequences per seed:

- `it('runway slot occupancy never goes negative')`.
- `it('statuses only move forward along the lifecycle')`: scheduled -> airborne or held; held -> scheduled only while the release window is open; terminal states absorb; `heldFinal` is terminal.
- `it('every flight settles exactly once')`: no terminal status ever changes, no double settlement events.
- `it('substate stays JSON-safe and round-trips through saveSchema at every step')`.
- `it('reducers never read the projection')`: structural proof or spy, consistent with how section 01 proved it, but run across random sequences here.

### debrief.test.ts

- `it('debrief carries arrivals, diversions, held and heldFinal counts, stranded passengers, and unresolved flights for each end cause')`: run the walkthrough, timeout, forfeit, and GROUND ALL fixtures and assert the debrief fields for each.
- `it('clue status reflects whether the restriction record was inspected')`: with and without an INSPECT_RECORD on the designated clue record; the clue logs exactly once via the engine clueRecords path and the module contributes no clue code.

### keyboardOnly.test.tsx (shell)

- `it('completes one full routing flow keyboard-only')`: from mission start, using only key events: cycle flight markers (markers only, reading order, no empty-cell selection), open the readout, choose a LAND or DIVERT target, confirm, and observe the status change through emitted-driven cues. Fake timers prove no local timers drive cues or announcements.
- `it('glossary hover terms are focusable and Escape closes')` for one local term (e.g. CORRIDOR) and one global term (OBSERVED).

### narrowWidth.test.tsx (shell)

- `it('narrow viewport defaults to the list view with full action rows')`.
- `it('the grid/list toggle persists with UI preferences across remount')`.
- `it('the same routing flow completes in the list view at narrow width')` including GROUND ALL with its confirmation and single-use rendering.

## Implementation notes

1. **Scripts come from section 02.** The walkthrough, alternate full-tier, and max-consequence scripts are authored content exported alongside the seeds. This section only replays them. If a fixture fails, the fix belongs in the seed or the rules, never in a fixture-local patch.
2. **Drained-state discipline in the helper.** `runScript` must call `advanceToNow(step.at)` before each `dispatch`, mirroring real play, so every fixture inherits the drain-then-reduce ordering the rules were tested with in section 01. Do not batch dispatches at a single time unless the script explicitly encodes a same-call race.
3. **Three seeds, every fixture.** Wrap every engine fixture file in `describe.each(seedIds)`. CI must fail if a future seed edit breaks any script; that is the entire point of invariant-backed authoring.
4. **Integer assertions.** Anywhere a passenger count, delay, or tier boundary appears in an assertion, assert `Number.isInteger` as part of the check. Cheap, and it catches drift into float math.
5. **Shell tests use the real engine.** No mocked reducers. Mount FlightsScreen against a real initialized mission on a real seed, drive time with the engine's clock interface, and read emitted events for cue assertions. Fake timers belong only to proving the absence of local `setTimeout`/`setInterval` driven UI behavior.
6. **Property suite budget.** Keep generated sequence length and run counts modest enough for CI (on the order of 100 runs, sequences of 20 to 40 actions); fix the PRNG seed and log it on failure so any counterexample replays.
7. **Polish items surfaced by the passes.** The keyboard-only and narrow-width passes are also the manual-smoke stand-ins for compact-grid readability. If marker cycling order or list parity feels wrong while writing these tests, the fix goes to section 03 files (`MapView.tsx`, `FlightListView.tsx`, `mapModel.ts`); this section may adjust them but must keep their section-03 unit tests green.

## Definition of done

All new test files pass under `npm test` for all three seeds. The walkthrough reaches full tier, the max-consequence alternate reaches full tier, the base script under maximum penalty reaches at least partial, timeout and forfeit and GROUND ALL evaluate correctly, the buzzer boundary behaves on both sides of `endsAt`, separation and lead-margin arithmetic hold on shipped seeds, extended time scales everything proportionally, the property suite finds no counterexamples, debrief content is complete per cause, and both accessibility passes complete a full routing flow.