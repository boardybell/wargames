# section-03-records: Evidence Record Graph (pure layer)

## Purpose and scope

This section builds `src/engine/records/`, the pure data layer for the evidence graph the whole game argues about. The game is a WarGames-inspired browser title whose dramatic premise is an engineering constraint: WOPR misreads one exercise export (run R04 of exercise D-83) as three independent emergencies, and the player wins by reading record provenance. Provenance is therefore first-class data, and the independence rule is one shared validator that mission guidance and the finale case validator both consume, so they can never drift apart.

This section delivers the pure parts only: types, the graph container, the `trace` selector, `isIndependentObservation` with reason codes, and corroboration semantics for desk-reply outcomes. The stateful wiring (INSPECT_RECORD dispatch, REQUEST_SOURCE_CHECK queueing, reply resolution across phases) arrives with the campaign machine in section-05-campaign; this section defines the pure functions and types that wiring will call.

Everything here is pure TypeScript with zero DOM, React, or asset dependencies, testable entirely in Node. The engine-wide ESLint purity gate (from section-01-foundation) bans Math.random, Date.now, performance.now, and DOM globals under `src/engine/**`. All data is plain JSON-safe values: finite numbers, strings, booleans, null, arrays, plain objects with string keys. No Map, Set, Date, undefined, NaN, or Infinity. Collections are arrays sorted by stable ID; every sort comparator ends with an ID tie-break. All times are integers.

## Dependencies

- section-01-foundation must be complete: repository skeleton, vitest projects config (engine project in node environment), `@engine` path alias, ESLint purity gate, canonical-stringify test harness.
- No other section is required. This section blocks section-05-campaign, which wires these primitives into dispatch and the campaign queue, and section-07-seeds, which authors concrete record graphs validated against these functions.

## Files to create

- `/Users/darkpool/wargames/src/engine/records/types.ts` (or a single `index.ts` if preferred; keep the module boundary at `src/engine/records/`)
- `/Users/darkpool/wargames/src/engine/records/trace.ts`
- `/Users/darkpool/wargames/src/engine/records/independence.ts`
- `/Users/darkpool/wargames/src/engine/records/corroboration.ts`
- `/Users/darkpool/wargames/src/engine/records/index.ts` re-exporting the module surface
- `/Users/darkpool/wargames/test/engine/records/trace.test.ts`
- `/Users/darkpool/wargames/test/engine/records/independence.test.ts`
- `/Users/darkpool/wargames/test/engine/records/corroboration.test.ts`

Test tree mirrors `src/engine` per the project layout convention.

## Tests first (write these before implementing)

Extracted from the TDD plan, pure-selector and independence tests only. Build a small in-test fixture graph modeled on the canonical seed shape (do not import from `src/engine/seeds/`, which does not exist yet):

- C17: origin EXERCISE, sourceId 'D83-EXPORT', parentId null, runId 'R04', eventTime 21:14:00 as seconds-of-day (76440), receiptTime 76445, subsystem 'outlook'.
- F06: origin DERIVED, parentId 'C17', runId 'R04', eventTime 76448, receiptTime 76492, subsystem 'flights'.
- B04: origin DERIVED, parentId 'F06', runId 'R04', eventTime 76461, receiptTime 76470, subsystem 'bank'.
- W02: origin OBSERVED, own origin (parentId null), no runId ('null'), subsystem 'flights' or as convenient. The independent decoy.
- One pathological record for the laundering case: origin OBSERVED but with a parent chain that reaches an R04 record (e.g. parentId 'F06').

### trace tests (`trace.test.ts`)

- `trace(graph, 'F06')` returns origin kind DERIVED, eventTime, receiptTime, and a parent summary describing C17.
- `trace(graph, 'C17')` (a true origin) returns null parent fields.
- Purity: deep-equal the graph before and after every trace call; trace takes the graph as read-only input and returns a fresh result object. Call it on a deep-frozen graph and assert no throw in strict mode.
- Unknown record id: define and test the behavior (return a typed not-found result or throw; pick one, document it in the docstring, test it).

### independence tests (`independence.test.ts`)

- `isIndependentObservation(graph, 'W02', 'R04')` accepts: OBSERVED origin, ancestry never touches R04.
- `isIndependentObservation(graph, 'F06', 'R04')` rejects with the derived-origin reason code: DERIVED repetition of an upstream claim is zero corroboration no matter how accurate.
- `isIndependentObservation(graph, pathologicalId, 'R04')` rejects with the tainted-ancestry reason code: an OBSERVED-labeled record whose parent chain reaches the claim run is not independent.
- Each rejection class carries its distinct expected reason code (the finale renders Joshua lines from these codes; assert exact codes, not just falsiness).
- Purity: graph deep-equal before and after; works on a frozen graph.
- Edge: a record whose own runId equals claimRunId is rejected even with origin OBSERVED (direct stamp, not just ancestry).

### corroboration tests (`corroboration.test.ts`)

- The corroboration selector returns zero for PENDING and UNKNOWN reply outcomes, zero for CONTRADICTED as corroboration of the claim (CONTRADICTED is evidence against, not for; it is distinct from PENDING in the verdict surface), and nonzero for CONFIRMED.
- The function is total over the four outcome values and pure.

Note: the TDD plan's block 5 also lists INSPECT_RECORD dispatch dedup, REQUEST_SOURCE_CHECK queue append, and the arrivedAfterSettlement cross-phase test. Those are dispatch and queue tests and belong to section-05-campaign; do not write them here. What this section must guarantee is that the pure functions those tests will exercise exist with stable signatures.

## Implementation details

### Types

```ts
type OriginKind = 'OBSERVED' | 'EXERCISE' | 'DERIVED'

interface EvidenceRecord {
  id: string              // stable, e.g. 'C17', 'F06', 'B04', 'W02'
  origin: OriginKind
  sourceId: string        // issuing system or desk, e.g. 'D83-EXPORT', 'FIELD-NW'
  parentId: string | null // provenance edge; null for true origins
  runId: string | null    // exercise run stamp, e.g. 'R04'; null if none
  eventTime: number       // story seconds-of-day, when it happened
  receiptTime: number     // story seconds-of-day, when the terminal got it
  subsystem: 'outlook' | 'flights' | 'bank'
  body: string[]          // inspectable text lines, authored
}
```

Story times are seconds-of-day integers in [0, 86400). This module does not enforce the range (seed validation in section-07 does, at load) but should document it. Event time and receipt time deliberately diverge: in the canonical seed the receipt ordering (C17, B04, F06) contradicts the event ordering (C17, F06, B04), and parent links plus event times resolve it. Nothing in this module may assume receipt order implies causal order.

### Graph container

A `RecordGraph` holding records as an array sorted by id (JSON-safe, per the serialization principle), plus whatever internal index lookup is convenient as long as the persisted shape stays a sorted array. Provide a constructor or lookup helper such as:

```ts
function getRecord(graph: RecordGraph, id: string): EvidenceRecord | null
```

Decide and document behavior for a parentId pointing at a missing record (seeds are validated in section-07, but the pure functions here must still be total; a broken chain should produce a defined verdict or error, never an infinite loop or undefined access). Also guard ancestry walks against cycles: a visited-set walk that terminates with a defined rejection, because `isIndependentObservation` must be total even over malformed input.

### trace

```ts
function trace(graph: RecordGraph, recordId: string): TraceResult
// PURE SELECTOR, no state change: returns origin kind, event and receipt
// times, and a parent record summary when a parent exists (parent id, origin,
// sourceId, eventTime is enough for the UI line); null parent fields for true
// origins.
```

Recording that the player inspected a record is NOT this function's job; that is a separate dispatched INSPECT_RECORD action handled in section-05 (inspected records arrive highlighted in the finale case file). trace must be callable any number of times with zero observable effect.

### isIndependentObservation

```ts
type IndependenceReason =
  // define distinct, stable string codes, for example:
  // 'INDEPENDENT', 'DERIVED_ORIGIN', 'ANCESTRY_TOUCHES_RUN',
  // 'DIRECT_RUN_STAMP', 'RECORD_NOT_FOUND', 'BROKEN_CHAIN'
  string // narrow this to a union; codes are rendered as Joshua dialogue hooks

interface Verdict {
  independent: boolean
  reason: IndependenceReason
}

function isIndependentObservation(
  graph: RecordGraph,
  recordId: string,
  claimRunId: string
): Verdict
// THE independence rule, shared by mission guidance and the finale case
// validator: a record is independent corroboration of a claim only if its
// origin is OBSERVED and its full ancestry (the parent chain, including the
// record's own runId stamp) never touches claimRunId. DERIVED records are
// never independent. The verdict reason code identifies WHY, per rejection
// class, because the finale speaks these reasons.
```

Implementation shape: walk the parent chain from the record to its root with a visited set, checking runId at every node and origin at the leaf. Reason-code precedence should be deterministic and documented (e.g. record-not-found first, then derived origin, then run-stamp or ancestry taint).

This validator is deliberately placed in this module so the finale case-builder validation (split 06 of the larger project) consumes the same primitive the missions use: event-time ordering checks, root-source identification against actual parent links, and the required one independent OBSERVED record about emergency scope all build on it.

### Corroboration semantics

Desk-reply outcomes for CHECK SOURCE are authored per record per seed and arrive via the campaign-level queue (wired in section-05). This section defines the outcome type and the pure scoring rule:

```ts
type SourceCheckOutcome = 'CONFIRMED' | 'CONTRADICTED' | 'PENDING' | 'UNKNOWN'

function corroborationValue(outcome: SourceCheckOutcome): number
// Integer corroboration weight. PENDING and UNKNOWN carry zero corroboration.
// CONFIRMED carries a positive integer. CONTRADICTED contributes zero
// corroboration toward the claim (it is counter-evidence, surfaced
// separately); keep the function total and the values integers.
```

All values are integers per the engine-wide integer-simulation-math principle; no floats anywhere in this module.

### Module surface

`/Users/darkpool/wargames/src/engine/records/index.ts` exports: `OriginKind`, `EvidenceRecord`, `RecordGraph`, `TraceResult`, `Verdict`, `SourceCheckOutcome`, `trace`, `isIndependentObservation`, `corroborationValue`, `getRecord`. Section-05 imports these to wire dispatch; section-07 imports them for seed validation. Nothing here imports from `campaign/`, `time/`, `seeds/`, or `save/`.

## Definition of done

- All tests above written first and passing under `npm test` (engine project, node environment, through the `@engine` alias).
- `tsc --noEmit` clean; ESLint purity gate clean over `src/engine/records/**`.
- Every exported function is pure and frozen-input safe; no module-level mutable state.
- Reason codes are a closed union with distinct values per rejection class, stable enough for downstream dialogue rendering.
- No queue, dispatch, or CampaignState code in this module; those hooks land in section-05-campaign against the signatures defined here.