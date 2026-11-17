<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation
section-02-rng
section-03-records
section-04-time
section-05-campaign
section-06-mission-interface
section-07-seeds
section-08-save
section-09-branch
section-10-properties-and-api
END_MANIFEST -->

# Implementation Sections Index: 01-simulation-core

Sections implement claude-plan.md with tests from claude-plan-tdd.md written
first. Valibot schemas are authored alongside the types they define (schema as
source of truth, TS types via InferOutput) starting in section-05; section-08
composes them into the save codec.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation | - | all | No |
| section-02-rng | 01 | 05 | Yes |
| section-03-records | 01 | 05 | Yes |
| section-04-time | 01 | 05 | Yes |
| section-05-campaign | 02, 03, 04 | 06 | No |
| section-06-mission-interface | 05 | 07, 08, 09 | No |
| section-07-seeds | 03, 06 | 10 | Yes |
| section-08-save | 05, 06 | 10 | Yes |
| section-09-branch | 05, 06 | 10 | Yes |
| section-10-properties-and-api | 07, 08, 09 | - | No |

## Execution Order

1. section-01-foundation
2. section-02-rng, section-03-records, section-04-time (parallel after 01)
3. section-05-campaign (after 02, 03, 04)
4. section-06-mission-interface (after 05)
5. section-07-seeds, section-08-save, section-09-branch (parallel after 06)
6. section-10-properties-and-api (final)

## Section Summaries

### section-01-foundation
Repository skeleton this split owns and split 02 later extends: package.json
(pure-rand, valibot; dev typescript, vitest 4, @fast-check/vitest, eslint),
strict tsconfig, vitest projects config with engine project in node environment
and v8 coverage scoped to src/engine/**, ESLint purity gate banning
Math.random/Date.now/performance.now/DOM globals under src/engine/**, @engine
alias, empty module directories, test-harness helpers: canonical stringify with
recursively sorted keys, minus-zero normalization, state hash. Meta tests prove
the gate and harness work.

### section-02-rng
src/engine/rng/: RngState JSON-safe encoding over pure-rand xoroshiro128plus,
rngFromSeed, nextInt (inclusive bounds, unbiased, input never mutated,
frozen-input safe), forkStream (clone plus jumps). Full TDD block 4.

### section-03-records
src/engine/records/: EvidenceRecord types, record graph container, trace pure
selector, isIndependentObservation with reason codes, corroboration semantics
for CONFIRMED/CONTRADICTED/PENDING/UNKNOWN. Pure parts only; queue wiring for
source checks arrives with the campaign machine. TDD block 5 pure-selector and
independence tests.

### section-04-time
src/engine/time/: ScheduledEvent, schedule materialization (standard and
extended durations, proportional offset scaling), merged two-queue drain in
(scheduledAt, id) order with deletion on processing, lastNow high-water clamp,
30-minute catch-up cap, timeout settlement hook invoked exactly once. TDD
block 7.

### section-05-campaign
src/engine/campaign/: CampaignState valibot schema and InferOutput type,
envelope dispatch (clamp, advanceToNow, validate, reduce), full action set
(START_MISSION, FORFEIT_MISSION, ACKNOWLEDGE_DEBRIEF, INSPECT_RECORD,
REQUEST_SOURCE_CHECK, SET_PREFERENCE, NEW_CAMPAIGN), settlement permanence,
consequence folding (markers keyed consequenceId plus targetMissionId,
canonical order, aggregate capping), source-check resolution on the campaign
queue surviving settlement with arrivedAfterSettlement markers, fourth-row
unlock, dual scoreboards, phase machine. TDD blocks 5 (stateful parts) and 8.

### section-06-mission-interface
src/engine/missions/: MissionModule generic interface including saveSchema,
MissionRuntime, engine lifecycle sequencing, the permanent test-double mission
with its substate schema, end-to-end lifecycle tests (TDD block 9) including
timeout, forfeit, consequence folding into a later start.

### section-07-seeds
src/engine/seeds/: SeedDefinition type, the fixture seed (C17/F06/B04/W02, run
R04, exact requirement times), two additional curated seeds, walkthrough action
logs as executable fixtures, timeout and partial-recovery fixture states,
mechanical seed validation suite (time bounds, monotonic chains, independent-
observed presence, walkthrough outcomes, integer tuning). TDD block 6.

### section-08-save
src/engine/save/: composed valibot schema with per-mission substate schemas,
versioned codec, migration pipeline (total defensive functions, throws caught,
synthetic v0-to-v1 test), primary/backup fallthrough, monotonic settlement
merge guard on every load path, storage port with fallible calls and quota
handling, recovery flags, 64 KB byte-budget test. TDD block 10.

### section-09-branch
src/engine/branch/: snapshot deep-clone deep-freeze, runBranch on a separate
unfrozen clone with forkStream per branch index, scripted zero-player policies
for REPEAT_D83 / HOLD_AND_VERIFY / STAGED_RECOVERY against the test-double
mission, BranchProjection type with the 06 seam documented, step traces,
side-effect-free and repeatability guarantees, viability thresholds. TDD
block 11.

### section-10-properties-and-api
src/engine/index.ts public surface (all mutation through dispatch, selectors
pure, no internal leaks) plus the cross-cutting test harness: run-twice
determinism over (action, now) envelope logs, snapshot-replay equivalence,
Math.random sabotage test, six-permutation chronology and consequence-order
invariance, fc.commands model-based suite with generated monotonic clocks and
global seed logging. TDD blocks 12 and 13. Closes the split's acceptance
criteria.
