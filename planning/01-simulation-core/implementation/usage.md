# Usage Guide: WarGames Simulation Core (`@engine`)

The pure, headless, deterministic TypeScript engine for SHALL WE PLAY A GAME?
Zero DOM, React, or asset dependencies. Everything runs in Node and is driven
through one choke point: `dispatch`. The canonical record of any campaign is a
seed plus the ordered log of `(action, now)` envelopes, so replaying the log
reproduces the campaign exactly, including every timeout.

## Quick Start

```ts
import {
  createCampaign,
  dispatch,
  snapshot,
  runBranch,
  selectMenuRows,
  encodeSave,
  decodeSave,
  type EngineContext,
} from '@engine'

// The shell assembles one EngineContext per session: the seed catalog plus
// the mission registry. (In the engine-core split, build one from the
// test-double context under @engine/testing; splits 03-06 register the real
// missions.)
declare const ctx: EngineContext

// A fresh campaign from a curated seed.
let state = createCampaign(ctx, 'exercise-r04', { extendedTime: false })

// Every player action and wall-clock sample is a logged envelope. `now` is
// epoch milliseconds, supplied by the caller — the engine never reads a clock.
state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'outlook' }, Date.now()).state
state = dispatch(ctx, state, { type: 'INSPECT_RECORD', recordId: 'C17' }, Date.now()).state
state = dispatch(ctx, state, { type: 'MISSION_ACTION', payload: { /* mission-defined */ } }, Date.now()).state

// Derive view data with pure selectors.
const { rows, finaleUnlocked } = selectMenuRows(state, ['outlook', 'flights', 'bank'], 'finale')

// Persist (the shell binds a StoragePort to localStorage).
const blob = encodeSave(state)
const revived = decodeSave(blob, ctx.missions)
```

## The dispatch envelope

`dispatch(ctx, state, action, now)` returns `{ state, emitted, rejection }`.

- `state` — the next `CampaignState` (never mutated in place).
- `emitted` — an ordered `EngineEvent[]` side channel (settlement, clueFound,
  consequenceApplied, phaseChanged, ...), one entry per real transition, for
  exactly-once downstream consumption. Replay folds use `state` only.
- `rejection` — `{ rejected: true, reason }` or `null`. A rejected action still
  advances the clock but adds no campaign effect of its own.

The full action set: `START_MISSION`, `MISSION_ACTION`, `FORFEIT_MISSION`,
`ACKNOWLEDGE_DEBRIEF`, `INSPECT_RECORD`, `REQUEST_SOURCE_CHECK`,
`SET_PREFERENCE`, `NEW_CAMPAIGN`. Use `advanceCampaign(ctx, state, now)` for a
shell wake signal with no action.

## Zero-player futures

```ts
const frozen = snapshot(state) // deep clone + deep freeze
const future = runBranch(ctx, frozen, 'STAGED_RECOVERY')
// future.projection (integer service metrics), future.trace (BranchStep[]),
// future.viability (threshold detail). Repeated runs are bit-identical; the
// frozen snapshot is never mutated.
```

## API Reference (public surface)

Functions: `createCampaign`, `dispatch`, `advanceCampaign`, `isMissionSettled`,
`snapshot`, `runBranch`, `buildRecordGraph`, `getRecord`, `trace`,
`isIndependentObservation`, `corroborationValue`, `encodeSave`, `decodeSave`,
`runMigrations`, `loadCampaign`, `persistCampaign`, `seedCatalogMetadata`,
`SEED_NAMES`, `BRANCH_KINDS`, and the selectors `selectMenuRows`,
`selectOpenExceptions`, `selectServiceOutcomes`, `selectSettledOutcome`,
`selectSettledMetrics`, `selectCorroboration`, `selectCampaignBegun`.

Types: `CampaignState`, `CampaignAction`, `EngineEvent`, `DispatchResult`,
`SettledOutcome`, `SettlementCause`, `OutcomeTier`, `Consequence`,
`SourceCheckResult`, `CampaignPhase`, `EngineContext`, `MissionModule`,
`MissionRegistry`, `SeedDefinition`, `DebriefPayload`, `BranchKind`,
`BranchProjection`, `BranchStep`, `BranchResult`, `StagedViability`,
`FrozenCampaignState`, `StoragePort`, `SavePayload`, `RecoveryFlag`,
`LoadResult`, `PersistResult`, `Migration`, `EvidenceRecord`, `RecordGraph`,
`TraceResult`, `Verdict`, `SourceCheckOutcome`.

The export set is pinned by `test/engine/api/public-surface.test.ts`; a new
export fails that test until added deliberately. `@engine/testing` (the
permanent test-double mission) is excluded from the surface and the bundle.

## Guarantees (proven by the property suites)

- **Determinism.** Folding an identical envelope log twice yields a
  bit-identical final state and emitted sequence, timeouts included.
- **Snapshot-replay equivalence.** Replaying a log suffix on a snapshot equals
  the full run, state and emitted tail alike.
- **Serializable, integer state.** No Map/Set/Date/undefined/NaN/Infinity;
  every sim quantity is an integer; collections sort by stable ID.
- **Settlement permanence.** A mission settles once; no load path can unsettle
  or roll a campaign backward.

## Running it

```
npm test            # 219 engine tests (Vitest, node project)
npm test -- --coverage   # lines 97%+ / branches 86%+ over src/engine/**
npx tsc --noEmit    # type check
npx eslint .        # purity gate: no Math.random/Date.now/DOM in src/engine
```
