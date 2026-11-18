# section-08-save: Save System (src/engine/save/)

## Purpose and Context

This section builds the versioned, validated persistence layer for the headless engine of SHALL WE PLAY A GAME?, a WarGames-inspired browser game shipping as a static React/Vite site. The engine is pure TypeScript under `src/engine/` with zero DOM, React, or asset dependencies, testable entirely in Node. The save system must guarantee that a campaign can survive reloads, Safari private-mode storage failures, quota eviction, corrupted writes, and stale backups, and that no load path can ever unsettle a settled mission or roll a campaign backward.

Everything here lives in `src/engine/save/`. Tests mirror it under `test/engine/save/`.

Two architecture principles from the overall plan govern this section:

- **Monotonic settlement (principle 7).** A mission settles exactly once; settled facts merge monotonically on every load path, primary and backup alike. Reloads, double wakes, and backup recovery can never unsettle, resettle, or re-apply a settled outcome.
- **Serializable everything (principle 8).** All state is plain JSON-safe data: finite numbers, strings, booleans, null, arrays, plain objects with string keys. No Map, Set, Date, undefined, NaN, or Infinity in persisted state. Collections are arrays sorted by stable ID with ID tie-breaks.

The engine is pure: no IO. The save layer therefore exposes pure encode/decode/migrate functions plus a **storage port interface**; the shell (a later split) binds that port to localStorage and schedules debounced writes with flushes on hide/pagehide and on settlement. This split tests the port against in-memory fakes.

## Dependencies

- **section-05-campaign** provides `CampaignState`, its valibot schema (authored in that section as source of truth, TS type via `InferOutput`), and the settlement model (`settled: SettledOutcome[]`, one final record per settled mission).
- **section-06-mission-interface** provides `MissionModule.saveSchema`, the per-mission valibot schema for mission substate, and the permanent test-double mission used as the fixture mission throughout these tests.

Do not duplicate those types; import them. This section composes them into the persisted payload schema and adds the codec, migrations, fallthrough, merge guard, storage port, and budget enforcement.

Blocks: section-10-properties-and-api consumes the save encode/decode/migrate exports and the storage port types in the public API surface.

Runtime dependencies available: `valibot` 1.x (schemas), already in package.json from section-01. Test stack: Vitest 4, engine project in node environment.

## Tests First (write these before implementing)

From the TDD plan, block 10. Suggested file layout under `test/engine/save/`:

**codec.test.ts**
- `encode/decode round-trip strict-equals state`: build a campaign state using the test-double mission (mid-mission, with an active mission substate, settled outcomes, source checks), encode to a JSON string, decode, expect strict deep equality with the original.
- `CampaignState TS type is InferOutput of the schema`: compile-time assertion (e.g. an `expectTypeOf` or an assignment-based type test) plus a runtime `v.parse` of a canonical fixture state that must succeed.
- `mission substate round-trips through the composed saveSchema; corrupted substate fails validation and triggers fallthrough` (this pairs with the section-06 test of the same name; here it exercises the composed codec path: corrupt only the `activeMission` substate bytes in the primary slot and assert the loader falls through to backup).

**migrations.test.ts**
- `migration pipeline applies v0-to-v1 on a synthetic old save`: fabricate a version-0 payload (an invented pre-release shape is fine; the point is the pipeline mechanism exists and is tested from day one even though the shipped version starts at 1), register a synthetic v0→v1 migration in a test-local pipeline, and assert the loader runs it and produces a valid current-version state.
- `a THROWING migration falls through to backup`: wire a migration that throws, confirm the loader does not crash, abandons primary, and loads backup. This must cover throws specifically, not just parse and validation errors.

**fallthrough.test.ts**
- `corrupt primary falls to backup`: garbage bytes in primary slot, valid backup; load result is backup state with recovery flag `'recovered-backup'`.
- `corrupt both falls to fresh`: garbage in both slots; load yields a fresh-start signal with recovery flag `'reset'`.
- `intact primary loads with flag 'clean'`.
- Fallthrough triggers on a throw ANYWHERE: JSON.parse failure, migration throw, valibot validation failure. Parameterize the three failure injection points.

**merge-guard.test.ts**
- `stale backup cannot roll back settlement`: current in-session state has mission A settled; primary is corrupt; backup is an older snapshot where mission A is still active and unsettled. Loading with the merge guard against the in-session settled facts must preserve mission A's settled outcome; the resurrected active mission must not reappear. Assert the guard runs on the backup path, not only the primary path.
- `merge is monotonic and idempotent`: applying the guard twice changes nothing the second time; a settled outcome is never overwritten even if the loaded payload carries a different outcome for the same mission (first settlement wins, per settlement permanence).

**storage-port.test.ts**
- `quota error drops backup slot and retries once`: a fake port whose write throws `QuotaExceededError` (match by error name; construct a DOMException-like object with `name: 'QuotaExceededError'` since this runs in Node) on the first attempt; assert the save routine removes the backup slot and retries the primary write exactly once; a second consecutive quota failure surfaces as a reported (non-throwing) failure result, not a crash.
- `all port calls fallible without crashing the engine`: a fake port that throws on every method (read, write, remove); every save-layer entry point returns an error-shaped result or a safe default, never propagates.
- `backup written only after confirmed good primary write`: fake port records call order; assert primary write completes (and, per the chosen confirmation strategy, verifies) before any backup write; when the primary write fails, no backup write occurs.

**byte-budget.test.ts**
- `full-campaign save stays under 64 KB`: construct the largest realistic end state available in this split (campaign with the test-double mission played through all slots to the end, settled outcomes, source checks, inspected records, consequences applied; once section-07 lands, section-10 re-points this at the real walkthrough end state, so write it against a builder helper that section-10 can swap), encode, assert `new TextEncoder().encode(json).length < 64 * 1024`.

## Implementation

### Persisted payload and schema composition (`src/engine/save/schema.ts`)

The valibot schema is the source of truth for persisted shapes. The payload wraps campaign state with a version:

    // Payload { version: 1, state: CampaignState }

- Compose the CampaignState schema (from section-05) with the active mission's substate schema at load time: look up the mission module by `activeMission.missionId` and validate the substate through that module's `saveSchema`. This closes the open-typed substate hole: the engine never holds unvalidatable opaque state, and later mission splits (03 through 06 of the project) get save validation for free just by providing `saveSchema`.
- Composition needs a mission-module registry lookup. Accept the registry (map of mission id to module) as a parameter of the codec functions rather than importing a global; the test-double mission registry comes from section-06.
- Enforce JSON-safety at the schema level where cheap (finite numbers, no unknown keys where the shape is closed).

### Codec (`src/engine/save/codec.ts`)

Pure functions, no IO:

    function encodeSave(state: CampaignState): string
      // JSON.stringify of { version: CURRENT_VERSION, state }. Assumes state is
      // already JSON-safe per engine principle 8; the schema parse on decode is
      // the enforcement point.

    function decodeSave(raw: string, registry: MissionRegistry): CampaignState
      // parse -> migrate -> validate (composed schema incl. mission substate).
      // Throws on any failure; callers handle fallthrough. Never partially
      // succeeds.

### Migrations (`src/engine/save/migrations.ts`)

- An ordered array of migration steps, each a pure, **total, defensive** `(unknown) => unknown` function from stored version N to N+1. Defensive means: never trust field presence or types in the input; a migration that cannot make sense of its input throws, and the throw is caught by the fallthrough logic upstream.
- The shipped array is empty at version 1, but the pipeline runner and its test exist from day one: the runner walks from the payload's recorded version to `CURRENT_VERSION`, applying steps in order, and rejects unknown or future versions by throwing.
- Expose the runner with an injectable step array so the synthetic v0→v1 test can exercise it without shipping a fake migration.

### Load path and fallthrough (`src/engine/save/load.ts`)

    type RecoveryFlag = 'clean' | 'recovered-backup' | 'reset'

    function loadCampaign(port: StoragePort, registry: MissionRegistry,
                          inSessionSettled: SettledOutcome[] | null): LoadResult
      // LoadResult carries { state | null, recovery: RecoveryFlag }.

Order of operations per slot: read raw -> JSON.parse -> migrate -> validate -> monotonic merge guard. A throw **anywhere** in that chain abandons the slot: primary falls to backup, backup falls to fresh (`state: null`, flag `'reset'`). The recovery flag is part of the result so the shell can render the visible reset path; the engine never silently swallows a reset.

### Monotonic settlement merge guard (`src/engine/save/merge-guard.ts`)

Runs on **every** load path including backup recovery. Given a decoded state and the set of settled facts known to be true (from the current session when one exists, or from whichever loaded source carries more settlement), produce a state in which:

- Every mission settled in either input remains settled with its **first** written `SettledOutcome` (settlement permanence; outcomes never replaced).
- A loaded payload whose `activeMission` is a mission already settled elsewhere has that active mission dropped (a stale backup can never resurrect an unsettled mission).
- Applied-consequence markers merge as a set union keyed `(consequenceId, targetMissionId)` so consequences are never re-applied.
- The guard is idempotent and order-insensitive over its two inputs where settlement is concerned.

Keep this as its own pure function so the fc.commands suite in section-10 can hammer it directly.

### Storage port (`src/engine/save/port.ts`)

    interface StoragePort {
      read(key: string): string | null
      write(key: string, value: string): void
      remove(key: string): void
      // Every method may throw; the save layer treats all calls as fallible
      // (Safari private mode, ITP eviction, quota).
    }

Keys: `'wargames.save.primary'` and `'wargames.save.backup'`. Define them as exported constants.

    function persistCampaign(port: StoragePort, state: CampaignState): PersistResult
      // 1. Encode once. 2. Write primary; confirm the write is good (read-back
      //    compare is the simple confirmation in this layer). 3. Only after a
      //    confirmed good primary write, write the previous good primary into
      //    backup (or re-write current payload to backup; pick one strategy and
      //    document it in a comment; backup-after-confirm is the invariant the
      //    test pins).
      // QuotaExceededError (matched by error name): remove the backup slot,
      // retry the primary write exactly once; if it fails again, return a
      // failure-shaped PersistResult. No path throws out of this function.

The shell owns scheduling (debounce, flush on hide/pagehide and on settlement); this split only guarantees that `persistCampaign` is safe to call at any frequency and that settlement-time flushing has a correct function to call.

### Exports (`src/engine/save/index.ts`)

Re-export: `encodeSave`, `decodeSave`, `loadCampaign`, `persistCampaign`, `StoragePort`, `RecoveryFlag`, the key constants, and the migration runner type surface needed by tests. Section-10 lifts these into `src/engine/index.ts`; nothing else in `src/engine/save/` leaks.

## Constraints and Reminders

- No `Date.now`, `Math.random`, `performance.now`, or DOM globals anywhere under `src/engine/**`; the ESLint purity gate from section-01 enforces this and the save layer has no legitimate need for any of them.
- No code comments or strings containing em-dashes.
- Rounding, if any division appears (it should not in this section), is floor with a comment at the site.
- The 64 KB budget exists so future authored content cannot creep toward mobile quota limits; do not raise it to make a test pass. If the fixture state exceeds it, the fixture or the state shape is wrong, not the budget.

## Definition of Done

All tests in the six test files above pass under `npm test`; coverage thresholds (lines 80, branches 75 over `src/engine/**`) hold; `tsc --noEmit` passes; the corrupted-substate fallthrough test from section-06 still passes against the composed codec; no new runtime dependencies beyond valibot.
## As Built (section-08 implementation)

Implemented and committed. Final state: 183 engine tests green, `tsc --noEmit` 0 errors, eslint purity gate 0.

### Actual file layout
- `src/engine/save/index.ts` — the whole save layer in one cohesive module: `StoragePort`, `encodeSave`, `decodeSave`, `runMigrations` (exported, injectable migrations), `MIGRATIONS` (empty at v1), `mergeGuard`, `loadCampaign`, `persistCampaign`, and the recovery/result types. Deviation from the plan's 7-file split (schema/codec/migrations/load/merge-guard/port/index): every function the split isolated is individually exported, so section-10's fc.commands suite imports `mergeGuard` directly — the testability the split protected is intact.
- `test/engine/save/save.test.ts` — one consolidated suite in place of the plan's six named files (codec, migrations, fallthrough, merge-guard, storage-port, byte-budget), covering every case plus three added by review.

### Merge-guard semantics (as built, post-review)
The guard reconciles by **source priority, not by sequence number**. `settleSeq` is a per-lineage monotonic stamp (assigned by the engine's `settle()` from `settleCounter`) and is NOT comparable across two divergent saves. So:
- `const base = inSession ?? loaded`. When the live session is present it is authoritative; the loaded save may only ADD settled facts for missions the session never settled, and never overwrites the live rng, clock, queues, or active mission.
- Self-consistency (a settled mission can never also be active) runs on every path, including a fresh boot where `base === loaded`.
- `settleCounter` is lifted above the highest imported `settleSeq` so the next in-engine settlement can't reuse a stamp.
- Markers union by `(consequenceId, targetMissionId)`. The guard is idempotent.

### Persist semantics (as built, post-review)
`persistCampaign(port, state, registry)`:
- Validates by round-tripping through `decodeSave` (composes the mission `saveSchema`), so a broken substate is reported `INVALID STATE` before any write.
- Double buffer: the prior good primary moves into backup before the new primary is written, so backup trails one generation and offers real rollback.
- Read-back-confirms the primary. On `QuotaExceededError` it frees backup and retries once; on total failure it restores the prior good primary so the slot is never left torn. No path throws.

### Schema
`savePayloadSchema.version` is pinned to `v.literal(CURRENT_VERSION)` so a mis-versioned post-migration envelope fails at parse. All closed schemas in `campaign/state.ts` are `v.strictObject` (the only opaque slots are the scheduled-event `payload` and mission `substate` VALUES, typed `v.unknown()` inside closed key sets).

### Engine-contract change
`MissionModule.evaluate` now returns `EvaluatedOutcome = Omit<SettledOutcome, 'settleSeq'>`; the engine's `settle()` stamps `settleSeq` from `settleCounter`. `createCampaign` seeds `settleCounter: 0`.
