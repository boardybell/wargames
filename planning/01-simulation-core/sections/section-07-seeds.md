# section-07-seeds: Curated Seeds, Walkthrough Fixtures, and Mechanical Seed Validation

## Purpose

Build `src/engine/seeds/`: the `SeedDefinition` type, three curated campaign seeds (no procedural generation, no arbitrary player seeds), executable walkthrough fixtures, timeout and partial-recovery fixture states, and a mechanical validation suite that turns authoring errors into CI failures instead of broken playthroughs.

This is content-plus-contract work for the headless engine of SHALL WE PLAY A GAME?, a WarGames-inspired browser game. The dramatic premise drives the data model: WOPR misreads one exercise export (D-83, run R04) as three independent emergencies, and the player wins by reading record provenance. A seed therefore carries the evidence graph the whole game argues about, and the validation suite proves every seed is solvable by the same rules the finale uses.

## Dependencies

- **section-03-records** provides `EvidenceRecord`, `OriginKind`, the record graph container, and `isIndependentObservation(graph, recordId, claimRunId)`. This section consumes those; do not reimplement them.
- **section-06-mission-interface** provides `SeedDefinition`'s consumer side (`MissionModule.init` / `schedule`) and the permanent test-double mission, whose tiny payload proves the opaque-payload pattern.
- Blocks **section-10-properties-and-api** (six-permutation and walkthrough-replay suites build on these fixtures).

## Engine ground rules that bind this section

- Purity: no IO, no ambient time, no `Math.random` / `Date.now` (ESLint bans them under `src/engine/**`).
- Story time is seconds-of-day integers. All story times must be in `[0, 86400)` and parent chains time-monotonic, so midnight wrap is impossible by construction. Story time is fixed per seed and identical across all six mission orders.
- Integer simulation math: every sim-affecting tuning value (channel capacities, liquidity, confidence thresholds, counts) is an integer in its smallest unit.
- Serializable everything: seeds are plain JSON-safe data. No Map, Set, Date, undefined, NaN, Infinity. Collections are arrays sorted by stable ID.
- The campaign's canonical record is seed plus ordered `(action, now)` envelope log; walkthrough fixtures are exactly such logs.

## Files

Create:

- `/Users/darkpool/wargames/src/engine/seeds/types.ts` — `SeedDefinition` and supporting types
- `/Users/darkpool/wargames/src/engine/seeds/seed-one.ts` — the requirements fixture seed (run R04)
- `/Users/darkpool/wargames/src/engine/seeds/seed-two.ts` — second curated seed
- `/Users/darkpool/wargames/src/engine/seeds/seed-three.ts` — third curated seed
- `/Users/darkpool/wargames/src/engine/seeds/catalog.ts` — seed registry by name, plus catalog metadata (names, descriptions) for the public API
- `/Users/darkpool/wargames/src/engine/seeds/fixtures/` — walkthrough action logs, timeout fixture state, partial-recovery fixture state, one trio per seed
- `/Users/darkpool/wargames/test/engine/seeds/seed-validation.test.ts` — parameterized mechanical validation over all three seeds
- `/Users/darkpool/wargames/test/engine/seeds/seed-one-fixture.test.ts` — seed-one exactness against the requirements table
- `/Users/darkpool/wargames/test/engine/seeds/walkthrough.test.ts` — executable walkthrough, timeout, and partial-recovery fixture tests

Adjust paths to match the repository root established by section-01-foundation; test files live under `test/engine/` mirroring `src/engine/`, run through the `@engine` alias in the Vitest node-environment project.

## Tests first (TDD block 6)

Write these before authoring any seed content. Stub shapes below describe what to assert, not how.

```ts
// test/engine/seeds/seed-validation.test.ts
// Parameterized describe.each over all three seeds from the catalog.

test('every story time is in [0, 86400)')
  // Walk every EvidenceRecord in every subsystem graph; assert
  // 0 <= eventTime < 86400 and 0 <= receiptTime < 86400, integers.

test('parent chains are time-monotonic')
  // For every record with parentId !== null: child.eventTime >= parent.eventTime.
  // Also assert the chain terminates (no cycles, every parentId resolves).

test('at least one record passes isIndependentObservation against the seed exercise run')
  // Uses the section-03 validator with the seed's authored exerciseRunId.
  // This is the solvability floor: without it the finale is unwinnable.

test('all numeric tuning values are integers')
  // Recursively walk SeedDefinition.tuning; every number satisfies
  // Number.isInteger. Reject NaN/Infinity while you are there.

test('seed is JSON-safe and stable')
  // JSON round-trip strict-equals the seed object; record arrays sorted by id.
```

```ts
// test/engine/seeds/seed-one-fixture.test.ts

test('C17/F06/B04 times match the requirements table exactly')
  // C17 event 21:14:00 (76440), receipt 21:14:05 (76445)
  // F06 event 21:14:08 (76448), receipt 21:14:52 (76492)
  // B04 event 21:14:21 (76461), receipt 21:14:30 (76470)

test('receipt order (C17, B04, F06) contradicts event order (C17, F06, B04)')
  // Sort the three by receiptTime, then by eventTime; assert the two
  // orderings as literal id sequences.

test('W02 has no R04 ancestry')
  // Walk W02 parent chain; no ancestor has runId 'R04'; W02.origin is OBSERVED.

test('provenance edges match the premise')
  // F06.parentId === 'C17', F06.runId === 'R04'; B04 derives citing F06;
  // C17 origin EXERCISE with sourceId 'D83-EXPORT'.
```

```ts
// test/engine/seeds/walkthrough.test.ts
// Parameterized over all three seeds.

test('walkthrough action log replays to the documented best outcome')
  // Fold the fixture's (action, now) envelope log over dispatch starting from
  // createCampaign(seedName, preferences); assert the terminal settled
  // outcomes/phase match the fixture's declared expected outcome tier(s).

test('timeout fixture state settles as timeout')
  // Load the timeout fixture state, advanceToNow past its endsAt, assert
  // exactly one SettledOutcome with cause timeout; re-advancing changes nothing.

test('partial-recovery fixture loads and reaches the finale')
  // Load the fixture (some missions settled imperfectly), acknowledge
  // remaining debriefs via dispatched envelopes, assert the fourth row
  // unlocks and the finale phase is reachable.
```

Note on dispatch coverage: until the real missions exist (later splits), walkthrough fixtures drive the test-double mission from section-06. The fixture format and replay harness must not care which mission module runs; that indifference is itself part of what these tests prove.

## Implementation

### SeedDefinition type

A seed is authored content plus initial conditions, one typed object:

```ts
interface SeedDefinition {
  name: string                       // catalog key, e.g. 'seed-one'
  description: string                // menu copy for the catalog metadata
  exerciseRunId: string              // e.g. 'R04'; the claim run the finale argues about
  records: {                         // evidence graph per subsystem (section-03 types)
    outlook: EvidenceRecord[]
    flights: EvidenceRecord[]
    bank: EvidenceRecord[]
  }
  missionPayloads: Record<MissionId, unknown>
    // Opaque at this layer by design. Each mission split (03..06) tightens its
    // own payload type; the test-double mission defines a tiny concrete payload
    // here to prove the pattern. Do NOT type real mission content in this split.
  deskChecks: DeskCheckEntry[]       // authored reply table per record:
    // { recordId, outcome: 'CONFIRMED' | 'CONTRADICTED' | 'PENDING' | 'UNKNOWN',
    //   delaySeconds: integer, replyBody: string[] }
    // PENDING and UNKNOWN carry zero corroboration (enforced in section-03).
  stormTrack: StormTrackPoint[]      // authored, integer story times
  schedules: Record<MissionId, ScheduledEventSpec[]>
    // Authored offsets in seconds from mission start; section-04 materializes
    // them to absolute times at mission start (extended duration doubles and
    // scales proportionally; seeds never store absolute epoch times).
  tuning: SeedTuning                 // channel capacities, liquidity,
                                     // confidence thresholds; ALL integers
}
```

Everything is plain data. If a field wants to be a function, it belongs in a mission module, not a seed.

### Seed one: the requirements fixture (run R04)

The canonical incident, 21:14 story time:

- **Outlook C17**: event 21:14:00, receipt 21:14:05, origin `EXERCISE`, sourceId `D83-EXPORT`, runId `R04`, parentId null. The exercise export WOPR misreads.
- **Flights F06**: event 21:14:08, receipt 21:14:52, origin `DERIVED`, parentId `C17`, runId `R04`. Beside it, an OBSERVED field report record showing local weather and an open corridor (this or a sibling is the independent-observation guarantee).
- **Bank B04**: event 21:14:21, receipt 21:14:30, origin `DERIVED`, citing F06 (parentId `F06`), runId `R04`, body assuming a system-wide shutdown.
- **Decoy W02**: origin `OBSERVED`, own origin (parentId null), no R04 ancestry, a real local weather warning. It explains a real local restriction and establishes the true (local) scope, which is why it must stay clean of R04.

The receipt ordering (C17 at :05, B04 at :30, F06 at :52) contradicts event ordering (C17 at :00, F06 at :08, B04 at :21) on purpose. Parent links and event times resolve the contradiction; that resolution is the game. Author `body` lines that reward reading: F06's body should reference C17's content, B04's should cite F06 and assume system-wide scope, W02's should name the local restriction.

Convert clock times to seconds-of-day integers at authoring time (21:14:00 = 76440). No time arithmetic at runtime.

### Seeds two and three

Same shape, different concrete content: times anchored to different minutes of the day, different decoy flavors, different record ids and source names, same solvability guarantees. Each must independently pass every mechanical validation test, including the receipt-versus-event ordering contradiction (the test for seeds two and three can assert the structural property, "receipt order differs from event order among the three core records," rather than hard-coded times). Keep the four-role structure: one EXERCISE origin, one DERIVED mid-chain with an OBSERVED sibling, one DERIVED leaf assuming global scope, one OBSERVED decoy with no exercise ancestry.

### Walkthrough and fixture states

Per seed, three executable fixtures under `src/engine/seeds/fixtures/`:

1. **Walkthrough action log**: an ordered list of `(action, now)` envelopes, plus the expected best-outcome assertion data (outcome tiers, clues found). This is the same envelope format the campaign log uses, so replay is fold-left over dispatch; nothing fixture-specific in the engine.
2. **Timeout fixture**: a `CampaignState` (or a seed-plus-prefix-log that produces one) with an active mission whose `endsAt` is already behind the next `now`; loading and advancing must settle it as timed out exactly once.
3. **Partial-recovery fixture**: a mid-campaign state with imperfect settled outcomes; must load, unlock the fourth row after remaining debrief acknowledgments, and reach the finale.

Fixtures are data files (TS modules exporting plain objects is fine); they are consumed by tests now and by section-10's six-permutation and replay suites later. Keep `now` values in fixtures as explicit epoch-ms integers; the engine clamps via `lastNow` so monotonic fixture clocks are mandatory.

### Validation suite

Mechanical, not editorial, parameterized over the catalog so adding a seed automatically subjects it to every check: time bounds, monotonic and acyclic parent chains, independent-observation presence against `exerciseRunId`, walkthrough reaching the documented best outcome, timeout and partial-recovery fixtures behaving, integer tuning, JSON safety, arrays sorted by id. An authoring error fails CI, never a playthrough.

### Catalog

`catalog.ts` exports the three seeds keyed by name plus a metadata list (name, description) that section-10 re-exports through the public API for the menu. `NEW_CAMPAIGN` and `createCampaign` take a seed name and look it up here; unknown names are a rejected action, not a throw inside the reducer.

## Done when

- All TDD block 6 tests exist, run in the Vitest engine project (node environment), and pass.
- Three seeds in the catalog, each passing the full parameterized validation suite.
- Seed one matches the requirements table byte-for-byte on ids, times, origins, and provenance edges.
- Walkthrough, timeout, and partial-recovery fixtures exist per seed and execute through real dispatch with the test-double mission.
- No floats in tuning, no non-JSON-safe values anywhere in seed data, no ESLint purity violations.

## Amendment (2026-11-17, from the split 02 shell review)

Binding contract change from the shell split's review: SeedDefinition
schedules include seed-authored timer-milestone specs per mission
(including the 30 and 10 second warnings, authored as offsets from
mission end so they scale with extended time). The seed validation
suite asserts every mission schedule carries the 30 and 10 second
warning milestones.

## Amendment 3 (2026-11-17, from the splits 04 and 05 mission reviews)

SeedDefinition gains clueRecords: { recordId, clueId }[] per seed.
Seed validation asserts every mission has at least one clue source
(module clues() or a clueRecords entry) per seed, and every
clueRecords recordId exists in the record graph.

## Amendment 4 (2026-11-17, from the split 06 finale review)

1. Milestone specs are end-anchored (anchor: 'end') and the seed
   validation asserts their presence per mission unchanged.
2. Every seed designates a finale field-report record: OBSERVED,
   passing isIndependentObservation against the seed's exercise run,
   with a deskChecks reply row whose authored wait satisfies
   wait <= finaleDuration - decisionMargin (both authored integers).
   Seed validation asserts existence, independence, and the bound.
