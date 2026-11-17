# Section 02: Projections and Endings

Section id: `section-02-projections-endings`. Part of split 06-global-failsafe,
the finale of SHALL WE PLAY A GAME?: GLOBAL FAILSAFE. This section builds the
two pure engine modules that turn the campaign's settled history into the three
projected futures and the three endings:

- `src/engine/missions/finale/projections.ts`
- `src/engine/missions/finale/endings.ts`
- `test/engine/missions/finale/projections.test.ts`
- `test/engine/missions/finale/endings.test.ts`

Runtime: typescript-npm. Test command: `npm test`. Engine tests run in the node
project (no jsdom needed here). Integer math throughout, per the engine-wide
contract. No em-dashes in any authored string.

## Dependencies

- **section-01-finale-module** (required, must land first): provides
  `src/engine/missions/finale/types.ts` (FinaleState, saveSchema), the finale
  MissionModule in `module.ts` with `terminal()` and the synchronous commit
  settlement, and the engine-owned finale-start snapshot. This section plugs
  into those; it does not re-implement them.
- **Engine prerequisites from splits 01 to 05** (already implemented, consumed
  here as stable APIs): `selectSettledMetrics` and the exception selector over
  campaign state; the branch machinery contracts (`BranchProjection` seam named
  in split 01 section 11, `BranchStep { step, label, detail }`,
  `playBranchTrace` is shell-side and out of scope here); STAGED_RECOVERY
  viability from settled metrics with per-threshold pass/fail; the widened
  `SettlementCause` and `terminal()` returning `completed | collapsed`;
  `endingId` on the finale `SettledOutcome` (engine amendment 11); the emitted
  event `branchRunCompleted`.
- **Blocks**: section-04-screens-fixtures consumes both modules.
- Parallelizable with section-03-joshua-catalog.

## Background: the corrected projection model

The finale lets the player test three futures against a snapshot taken by the
engine lifecycle at finale START. Corrected model (plan review finding 1,
engine amendment 10): by finale time all three mission substates have been
deleted at settlement, so the snapshot contains only the three settled
`SettledOutcome` metrics plus campaign case-file state. There is no replay.
`projections.ts` fills the split 01 `BranchProjection` seam with PURE
TRANSFORMS over `selectSettledMetrics` plus the exception selector.
`forkStream` is unused by these policies; the reducer-replay guarantees stay
proven on the engine's test-double elsewhere. Determinism here is structural
(pure functions over frozen inputs) and still asserted by tests.

The three branch policies, all authored per-metric deltas (integers):

1. **REPEAT D-83**: worsens the settled damage by authored per-metric deltas.
2. **HOLD AND VERIFY**: freezes the damage, applies authored containment
   costs.
3. **STAGED RECOVERY**: applies the authored recovery deltas, gated by the
   engine viability result.

Dual-state model: after START the live case file keeps updating (a late field
report joins it), but the branch baseline stays frozen at START. They never
need to agree, and the projections must never read the live state.

Single-computation rule: the viability result and the STAGED column are ONE
computation rendered twice. The viability panel's per-threshold pass/fail and
the STAGED column's figures must derive from the same end state so panel and
column can never contradict.

`BranchStep` traces are authored sequences derived from the transform steps,
one trace per branch, consumed later by the shell's `playBranchTrace`
(section-04).

## Background: endings

Endings are selected by the committed ACTION, not by tier (review findings 2
and 3). `endingId` is `'recovery' | 'containment' | 'failure'`, carried on the
finale `SettledOutcome`:

- STAGED RECOVERY commit: cause `completed`, ending `recovery`.
- HOLD AND VERIFY commit: cause `completed`, ending `containment`, with the
  unresolved problems named from real campaign state.
- REPEAT D-83 commit: cause `collapsed`, ending `failure`.
- Timeout and forfeit: `evaluate` maps both causes to the `failure` ending
  (the repeated order). The commit-vs-timeout race guard itself lives in
  section-01's `terminal()`; this section supplies the pure
  cause-plus-action to endingId mapping it calls.

`endings.ts` also derives the earned-why readback: which settled outcomes
opened or closed options (named, specific, sourced from
`selectSettledMetrics`), which evidence the player proved (from finale case
state), and what the chosen branch projected versus what the ending states.
Tier remains the quality axis within an ending, not the selector of it.

## Tests first

Write these before the implementation. Stubs describe what to test, not how.

### test/engine/missions/finale/projections.test.ts

```ts
describe('projections: pure transforms over settled metrics', () => {
  // Golden-value fixtures: three campaign end states built from the
  // walkthrough end states of each mission.
  //   healthyCampaign           all three missions settled well
  //   capacityConstrainedCampaign  mixed outcomes, tight metrics
  //   allFailedCampaign         every mission collapsed
  // For each fixture x each branch (repeat, hold, staged): the projected
  // end-state metrics strict-equal authored golden values.
  it.todo('repeat branch golden values per campaign fixture')
  it.todo('hold branch golden values per campaign fixture')
  it.todo('staged branch golden values per campaign fixture')

  it.todo('repeat runs are strictly equal (same inputs, deepStrictEqual outputs)')
  it.todo('projection run leaves live campaign state untouched (immutability)')
  it.todo('projection run leaves the frozen baseline untouched (immutability)')
  it.todo('branch execution order is irrelevant: any permutation yields identical results')
})

describe('projections: viability-column single computation', () => {
  // Consistency fixture: the viability panel per-threshold pass/fail must
  // strict-equal values re-derived from the SAME end state the STAGED
  // column renders. Build one result object, assert both views of it are
  // the same reference or derived by pure selectors from it.
  it.todo('per-threshold pass/fail strict-equals values derived from the staged end state')
  it.todo('viability thresholds derive from settled metrics: healthy fixture passes, all-failed fixture fails')
})

describe('projections: dual-state model', () => {
  it.todo('post-START field report updates the live case file and never the frozen baseline')
})

describe('projections: branch traces', () => {
  it.todo('each branch yields an authored BranchStep[] derived from its transform steps')
  it.todo('trace steps carry { step, label, detail } and no em-dash in any string')
})
```

Note on `playBranchTrace`: the skippable/reduced-motion/readable-after-skip
behavior is shell-side and tested in section-04. Here the engine tests only
assert the authored `BranchStep[]` content exists and is deterministic.

### test/engine/missions/finale/endings.test.ts

```ts
describe('endings: endingId derivation', () => {
  it.todo("STAGED commit settles cause completed, endingId 'recovery'")
  it.todo("HOLD commit settles cause completed, endingId 'containment'")
  it.todo("REPEAT commit settles cause collapsed, endingId 'failure'")
  it.todo("timeout settles cause collapsed, endingId 'failure'")
  it.todo("forfeit settles cause collapsed, endingId 'failure'")
  it.todo('settlement carries endingId exactly once; permanence after settle')
})

describe('endings: earned-why readback', () => {
  // Derives from selectSettledMetrics plus finale case state. Content tests
  // run against the three campaign fixtures.
  it.todo('names the specific settled outcomes that opened or closed options')
  it.todo('names the evidence the player proved (slots of the validated case)')
  it.todo('states what the chosen branch projected versus what the ending states')
  it.todo('containment readback names the unresolved problems from real campaign state')
  it.todo('readback content differs across healthy, capacity-constrained, all-failed fixtures')
  it.todo('no em-dash in any readback string; all numbers integer-derived')
})

describe('endings: viability gating input to decision', () => {
  // The gating itself (STAGED enabled iff caseValid AND viability passes)
  // renders in section-04; here assert the pure predicate.
  it.todo('stagedEligible(caseValid, viability) true only when both hold')
  it.todo('different choice sets across the three campaign fixtures (better earlier play widens the path)')
})
```

The commit-vs-timeout race fixture (same-wake timeout cannot override a
committed recovery) lives with section-01's `terminal()` tests; the
ending-reachability scripted fixtures under the live countdown live in
section-04's fixture matrix. Do not duplicate them here.

## Implementation

### src/engine/missions/finale/projections.ts

Pure module, no engine imports beyond selectors and shared types. Suggested
shape (stubs, adjust names to the actual seam signatures from split 01
section 11):

```ts
import type { SettledMetrics } from '../../selectors'           // selectSettledMetrics result
import type { BranchProjection, BranchStep } from '../../branches'

export type BranchId = 'repeat' | 'hold' | 'staged'

export interface FinaleSnapshot {
  /** Three settled SettledOutcome metrics plus campaign case-file state.
   *  NO mission substate. Deep-frozen by the engine at finale START. */
  settled: SettledMetrics
  exceptions: ExceptionSummary   // from the exception selector
}

export interface ViabilityResult {
  pass: boolean
  thresholds: { id: string; required: number; actual: number; pass: boolean }[]
}

export interface StagedComputation {
  /** ONE computation rendered twice: the panel reads .viability, the
   *  STAGED column reads .projection; both derive from .endState. */
  endState: SettledMetrics
  viability: ViabilityResult
  projection: BranchProjection
}

/** Authored per-metric integer deltas for each branch policy. */
export const REPEAT_DELTAS: PerMetricDeltas = /* authored */
export const CONTAINMENT_COSTS: PerMetricDeltas = /* authored */
export const RECOVERY_DELTAS: PerMetricDeltas = /* authored */

/** Pure transform: worsens settled damage by REPEAT_DELTAS. */
export function projectRepeat(snapshot: FinaleSnapshot): BranchProjection

/** Pure transform: freezes damage, applies CONTAINMENT_COSTS. */
export function projectHold(snapshot: FinaleSnapshot): BranchProjection

/** Pure transform: applies RECOVERY_DELTAS gated by viability; returns the
 *  single staged computation shared by panel and column. */
export function computeStaged(snapshot: FinaleSnapshot): StagedComputation

/** Fills the split 01 BranchProjection seam: all three branches from the
 *  frozen snapshot. Deterministic; callable repeatedly; never mutates. */
export function runProjections(snapshot: FinaleSnapshot): {
  repeat: BranchProjection
  hold: BranchProjection
  staged: StagedComputation
}

/** Authored BranchStep sequences derived from each branch's transform
 *  steps, for playBranchTrace. */
export function traceFor(branch: BranchId, snapshot: FinaleSnapshot): BranchStep[]
```

Implementation notes:

- Every projected figure is derived by integer arithmetic from the frozen
  settled metrics. No floats, no Date.now, no randomness, no forkStream.
- `runProjections` must not touch the live campaign state; take only the
  snapshot argument. The engine passes the deep-frozen snapshot from
  section-01; treat frozen inputs as a test ally (mutation throws in strict
  mode).
- Viability thresholds come from the engine's STAGED_RECOVERY viability
  contract (per-threshold pass/fail from settled metrics, splits 01 sections
  15 to 17). Reuse that computation; do not fork a second viability formula.
  `StagedComputation` exists precisely so the DecisionView panel and the
  ComparisonView column read one object.
- Mark nothing shell-facing here; the PROJECTION badge, columns, and skip
  behavior belong to section-04.

### src/engine/missions/finale/endings.ts

```ts
export type EndingId = 'recovery' | 'containment' | 'failure'
export type CommitChoice = 'staged' | 'hold' | 'repeat'

/** Pure mapping used by module.ts settlement (section-01):
 *  staged -> completed/recovery, hold -> completed/containment,
 *  repeat -> collapsed/failure; timeout and forfeit -> collapsed/failure. */
export function resolveEnding(
  committed: CommitChoice | null,
  cause: SettlementCause,
): { endingId: EndingId; cause: 'completed' | 'collapsed' }

/** Pure gating predicate for the STAGED commit control. */
export function stagedEligible(caseValid: boolean, viability: ViabilityResult): boolean

export interface EarnedWhy {
  shapingOutcomes: string[]   // named settled outcomes that opened/closed options
  provedEvidence: string[]    // the validated case slots, named
  projectedVsActual: string   // chosen branch projection vs the ending statement
  unresolved?: string[]       // containment only: real unresolved problems
}

/** Derives the readback from selectSettledMetrics plus finale case state
 *  and the chosen branch projection. Specific and named, never generic. */
export function deriveEarnedWhy(
  endingId: EndingId,
  settled: SettledMetrics,
  finale: FinaleState,
  projection: BranchProjection,
): EarnedWhy
```

Implementation notes:

- `resolveEnding` is the pure mapping; the exactly-once and synchronous
  commit guarantees live in section-01's `terminal()`, which calls this.
- `deriveEarnedWhy` must name specifics from the metrics ("the bank
  reconciliation you settled clean kept the recovery window open" class of
  statement, authored per metric and fixture), not boilerplate. Content
  assertions in the fixture tests keep it honest: the three campaign fixtures
  must produce visibly different readbacks.
- Ending readback LINES (the Joshua voice) come from section-03's catalog;
  this module produces the structured EarnedWhy data the EndingScreen and the
  catalog selectors consume. Keep the data layer and the authored-line layer
  separate.
- Strings authored here obey the campaign text rules: no em-dashes, caption
  text equals display text where surfaced.

### Fixtures

Create the three campaign golden fixtures under
`test/engine/missions/finale/fixtures/` (or the project's established fixture
location from earlier splits): `healthyCampaign`, `capacityConstrainedCampaign`,
`allFailedCampaign`. Build each from the walkthrough end states of the three
missions (the mitigations named in plan section 10: golden values pinned
against real mission-module end states, not hand-invented metrics). Each
fixture provides a complete `FinaleSnapshot` plus the expected golden
projection values per branch and the expected viability pass/fail vector.

## Definition of done

- All tests in the two test files above implemented and green via `npm test`.
- `runProjections` fills the split 01 `BranchProjection` seam and is wired
  into section-01's module where the seam was left open.
- `resolveEnding` is called by section-01's settlement path (one-line wiring
  change in `module.ts` if the stub was left there).
- Repeat-run strict equality, snapshot and live-state immutability, and the
  viability single-computation consistency fixture all asserted.
- No em-dash anywhere in authored strings; all deltas and thresholds integer.
- Nothing shell-side touched; section-04 consumes these modules as-is.