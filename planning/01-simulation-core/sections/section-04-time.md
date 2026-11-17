# Section 04: Time and Scheduling (src/engine/time/)

## Context

This section is part of the headless engine for SHALL WE PLAY A GAME?, a WarGames-inspired browser game. The engine is pure TypeScript under `src/engine/` with zero DOM, React, or asset dependencies, testable entirely in Node. Determinism is absolute: the canonical record of any campaign is its seed plus the ordered log of (action, now) envelopes. Wall-clock samples are part of the log, never ambient inputs, so replaying the log reproduces the campaign exactly, including every timeout.

This section builds the time subsystem: scheduled-event types, materialization of authored schedules into absolute times, the merged two-queue drain, the clock high-water clamp, the catch-up cap, and the timeout settlement hook. It is deliberately campaign-agnostic: it operates on a narrow time-facing state slice so it can be built and tested before the campaign state machine exists. Section 05 (campaign) wires these functions into `CampaignState` and `dispatch`.

### Dependencies

- **section-01-foundation** (required, complete first): repository skeleton, strict tsconfig, Vitest 4 projects config with the engine project in node environment, the `@engine` path alias, the ESLint purity gate banning `Math.random`, `Date.now`, `performance.now`, and DOM globals under `src/engine/**`, and the test-harness helpers (canonical stringify, state hash).
- **Blocks section-05-campaign**, which consumes this module's exports.

### Architecture principles that bind this section

1. **Purity.** Every function here is a pure function from inputs to outputs. No IO, no ambient time, no ambient randomness. The ESLint gate from section 01 enforces this mechanically; this module must pass it.
2. **The clock is logged input.** The engine only ever sees wall time as an explicit `now` argument. The time subsystem never reads a clock.
3. **Three clocks that never leak into each other.** Story time is fictional seconds-of-day integers fixed per seed (owned by records and seeds, not this module). Mission time is the real countdown, persisted as absolute epoch ms (`endsAt`). This module deals in mission/campaign wall time only, as epoch ms. Branch time (discrete step counts) is section 09's concern.
4. **Integer simulation math.** Offsets, durations, scheduled times, and `endsAt` are all integers (ms or seconds as documented at each site). Proportional scaling for extended duration must use integer arithmetic with a documented rounding rule: floor unless stated otherwise at the site. No float equality anywhere.
5. **Serializable everything.** `ScheduledEvent` and every queue are plain JSON-safe data: finite numbers, strings, booleans, null, arrays, plain objects with string keys. No `Map`, `Set`, `Date`, `undefined`, `NaN`, or `Infinity`. Queues are arrays; every sort comparator ends with an ID tie-break.

## Files

Create:

- `/Users/darkpool/wargames/src/engine/time/types.ts` (or a single `index.ts` if preferred; keep the module boundary at `src/engine/time/`)
- `/Users/darkpool/wargames/src/engine/time/schedule.ts` (materialization)
- `/Users/darkpool/wargames/src/engine/time/advance.ts` (clamp, drain, timeout hook)
- `/Users/darkpool/wargames/test/engine/time/schedule.test.ts`
- `/Users/darkpool/wargames/test/engine/time/advance.test.ts`

(Adjust relative paths to the actual repository root established by section 01; `test/engine/` mirrors `src/engine/`.)

## Tests first (TDD block 7)

Write these before implementing. Build the tests against a minimal time-slice fixture (see "Design: the time slice" below), not against `CampaignState`, which does not exist yet.

1. **Materialization, standard duration.** Mission start materializes authored offsets (seconds from mission start) into absolute epoch-ms `scheduledAt` values and computes `endsAt = startNow + duration`. Assert exact integer values for a fixture schedule at a known `startNow`.
2. **Materialization, extended duration.** Extended exactly doubles `endsAt` relative to standard (duration doubles) and scales every offset proportionally so pacing holds. With doubling, proportional scaling is exact integer multiplication by 2; assert each materialized `scheduledAt` is exactly double the offset from start, and assert the rounding rule holds on a case that would be fractional under a non-doubling scale factor if the implementation generalizes (if it only supports the factor 2, assert that directly).
3. **Merged drain order.** `advanceToNow` drains due events from both queues (mission and campaign) merged in `(scheduledAt, id)` order. Construct a fixture where the interleaving matters: mission and campaign events alternating in `scheduledAt`, plus two events with equal `scheduledAt` whose processing order must break by `id`. Assert the processed-event sequence exactly.
4. **Deletion and double-wake idempotence.** Events are deleted from their queue as processed. Calling `advanceToNow` twice with the same `now` changes nothing the second time: the second result is deep-equal to the first (same hash via the section-01 canonical stringify helper), and the processed-event list from the second call is empty.
5. **Backward clock clamp.** A `rawNow` below `lastNow` is clamped to `lastNow`: no event un-fires, no event fires again, settlement stands, and `lastNow` never decreases. Feed a `rawNow` earlier than a previously processed event's `scheduledAt` and assert strict no-op.
6. **Timeout settles exactly once.** When `now >= endsAt` and the active mission is unsettled, the timeout settlement hook fires exactly once. Cover three arrival shapes: (a) `now` passes `endsAt` during a normal advance; (b) the deadline passed long ago, as on reload discovery (a single advance with `now` far beyond `endsAt` after a gap); (c) an advance arrives after the deadline while other activity is happening, modeling a menu-overlay action envelope landing late. In every shape the hook is invoked once; subsequent advances never invoke it again because the slice is marked settled.
7. **Catch-up cap.** A catch-up span beyond 30 minutes clamps to the cap. A campaign-queue event scheduled beyond the clamped horizon does not drain on this advance but does drain on the following `advanceToNow`. Assert both halves: the event survives the first call and processes on the second. Also assert `lastNow` after the clamped call reflects the clamped time, not the raw `now` (this is what makes the second drain happen; see implementation notes for the exact rule to adopt and document).

Also required by the global testing strategy, applied here:

- All drain and materialization functions are pure: inputs deep-equal their before images after every call (use deep-frozen fixture inputs where convenient; functions must not throw on frozen inputs in strict mode).
- All produced state is JSON-safe: round-trip a materialized slice through `JSON.stringify`/`parse` and assert deep equality.

## Design

### ScheduledEvent

    interface ScheduledEvent {
      id: string
      scheduledAt: number     // absolute epoch ms once materialized
      kind: string            // event discriminator routed to reducers
      payload: unknown
    }

An authored, pre-materialization spec carries an offset instead of an absolute time:

    interface ScheduledEventSpec {
      id: string
      offsetSeconds: number   // seconds from mission start, authored in seeds
      kind: string
      payload: unknown
    }

(`ScheduledEventSpec` is the shape the mission-module interface's `schedule()` returns in section 06; define it here so both sections share one type.)

### Two queues, one drain discipline

- **Mission queue**: materialized at mission start, deleted wholesale at settlement (the deletion-at-settlement wiring is section 05's job; this section only needs the queue as an input to the drain).
- **Campaign queue**: source-check replies and other cross-phase events; survives settlement. Same element type, same drain discipline.

### The time slice

To keep this section implementable before `CampaignState` exists, define the drain over a minimal structural slice rather than the full campaign state. Something like:

    interface TimeSlice {
      lastNow: number                      // clock high-water mark, epoch ms
      missionQueue: ScheduledEvent[]       // empty when no active mission
      campaignQueue: ScheduledEvent[]
      endsAt: number | null                // active mission deadline, epoch ms
      missionSettled: boolean              // guard for the timeout hook
    }

Section 05's `CampaignState` will satisfy this shape structurally (or adapt to it trivially). Do not import anything from campaign/; the dependency arrow points the other way.

### Function stubs

    function materializeSchedule(
      specs: ScheduledEventSpec[],
      startNow: number,                    // epoch ms at mission start
      duration: 'standard' | 'extended',
      standardDurationMs: number,          // from seed tuning, integer ms
    ): { queue: ScheduledEvent[], endsAt: number }
      // Standard: scheduledAt = startNow + offsetSeconds * 1000;
      //   endsAt = startNow + standardDurationMs.
      // Extended: duration doubles; offsets scale proportionally (exactly x2),
      //   so pacing holds. All integer math; document floor at any division
      //   site if the implementation generalizes the scale factor.
      // Returned queue is sorted by (scheduledAt, id).

    type DrainResult = {
      slice: TimeSlice                     // new slice: queues pruned, lastNow updated
      processed: ScheduledEvent[]          // in (scheduledAt, id) order
      timedOut: boolean                    // true iff the timeout hook condition fired
    }

    function advanceToNow(
      slice: TimeSlice,
      rawNow: number,
      onTimeout?: () => void,              // settlement hook; see note below
    ): DrainResult
      // 1. Clamp: now = max(rawNow, slice.lastNow).
      // 2. Catch-up cap: if now - slice.lastNow > 30 minutes (1_800_000 ms),
      //    clamp now to slice.lastNow + cap. Safety rail only; missions are at
      //    most 8 minutes, and campaign-queue events beyond the cap simply
      //    drain on the next wake.
      // 3. Drain both queues merged in (scheduledAt, id) order for every event
      //    with scheduledAt <= now, deleting each as processed.
      // 4. After draining, if endsAt !== null, now >= endsAt, and
      //    missionSettled is false, report timeout (timedOut: true, invoke the
      //    hook once). Exactly-once is structural: the settled flag guards it,
      //    and section 05's settlement marks the flag.
      // 5. Record lastNow = now (the clamped value).
      // Pure with respect to its inputs: returns a new slice, never mutates.

Implementation notes and decisions to document in code comments:

- **The hook versus the flag.** In this section, the drain cannot perform settlement (that is campaign logic). It reports `timedOut` and optionally invokes a caller-supplied hook. Section 05 wires the hook to `settleMission(state, timeoutResult)` and sets `missionSettled` in the resulting state. For this section's tests, the fixture hook sets the flag on the returned slice the way 05 will, proving exactly-once across repeated advances. Keep the pure `timedOut` return as the primary signal; the callback is a convenience, and if it complicates purity testing, drop it and return only the flag. Either way the exported seam must let 05 run settlement exactly once.
- **Catch-up cap and lastNow.** After a clamped advance, `lastNow` must be the clamped `now`, not `rawNow`. This is what guarantees the beyond-horizon campaign event drains on the following wake: the next `advanceToNow(slice, sameRawNow)` starts from the clamped `lastNow` and advances up to another 30 minutes. Test 7 pins this behavior.
- **Timeout versus the cap.** The timeout check uses the clamped `now`. Since missions run at most 8 minutes and the cap is 30, a mission deadline is always within one clamped advance of being discovered; no special case needed, but do not check `endsAt` against `rawNow`.
- **Merged drain.** Do not concatenate-and-sort naively if it obscures which queue each event came from; the caller (section 05) routes processed events to reducers and must delete from the correct queue. Simplest correct approach: tag or track provenance internally, produce the merged processed list in `(scheduledAt, id)` order, and rebuild both queues minus processed events. Comparator ends with the ID tie-break per the global sort rule.
- **Determinism.** Equal inputs produce byte-identical outputs. No `Date.now` fallbacks, no default-now parameters. The purity lint gate from section 01 will catch violations; do not suppress it.

### Who calls advanceToNow

For orientation only (wired in section 05, not here): `advanceToNow` is the only way time passes in the engine. The shell calls it on every wake signal (focus, visibilitychange, timer tick), and campaign `dispatch(state, action, now)` runs it before every reduction. This covers timeout during a menu overlay, during background, and timeout discovered on reload. Exactly-once is structural: processed events leave their queue, settlement guards on settled state.

## Done criteria

- All seven TDD-block-7 tests plus the purity and JSON-safety assertions pass under `npm test` in the engine Vitest project.
- `tsc --noEmit` passes.
- The ESLint purity gate passes over `src/engine/time/**`.
- Exports available to section 05: `ScheduledEvent`, `ScheduledEventSpec`, `TimeSlice` (or equivalent structural type), `materializeSchedule`, `advanceToNow`, `DrainResult`, and the 30-minute cap constant.

## Amendment (2026-11-17, from the split 02 shell review)

The DrainResult.processed list this section already returns is the raw
material for the engine's new emitted-events contract: campaign dispatch
(section 05) maps processed entries plus settlement transitions into a
JSON-safe EngineEvent[] returned to callers. Nothing changes in this
section's drain discipline, but two additions bind it:

1. Timer milestones are scheduled events. materializeSchedule also
   materializes seed-authored milestone specs (including the 30 and 10
   second warnings, authored as offsets from mission END) into the
   mission queue with kind 'timerMilestone'. They scale with extended
   duration like every other offset and drain exactly once.
2. The processed list must preserve the (scheduledAt, id) drain order so
   the emitted mapping stays ordered.

## Amendment 4 (2026-11-17, from the split 06 finale review)

ScheduledEventSpec gains anchor: 'start' | 'end'. Start-anchored
offsets materialize as startNow + offset and scale proportionally
under extended duration. End-anchored offsets (the 30 and 10 second
warnings, finaleFinalPhase) materialize as endsAt - offset and NEVER
scale: a 30-second warning fires at T minus 30 under both durations.
Tests: both anchors materialize correctly; extended time scales
start-anchored only.
