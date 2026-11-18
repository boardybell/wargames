# Section 02: RNG Subsystem

**Creates:** `src/engine/rng/` (implementation), `test/engine/rng/` (tests)
**Depends on:** section-01-foundation (repository skeleton, Vitest 4 engine project in node environment, `@engine` path alias, ESLint purity gate). No other sections required.
**Blocks:** section-05-campaign (RNG threads through `CampaignState`) and, downstream, section-09-branch (`forkStream` seeds parallel branch simulations).

## Background and intent

This is the random-number subsystem for the headless game engine of SHALL WE PLAY A GAME?, a WarGames-inspired browser game. The engine lives under `src/engine/` as pure TypeScript with zero DOM, React, or asset dependencies, and every state transition is a pure function. Ambient randomness is banned: the ESLint purity gate from section-01 already forbids `Math.random` under `src/engine/**`. Randomness therefore enters the engine exactly one way: as explicit RNG state threaded immutably through reducers.

The governing architecture principle is "RNG as state." The PRNG lives inside campaign state and threads through reducers as a value; a snapshot of campaign state therefore contains everything a replay needs. Later, the finale runs three zero-player branch simulations against a frozen snapshot of the live campaign, and those branches each need their own well-separated random stream so that running branches in any order yields identical projections. That is what `forkStream` is for.

Scope honesty: the game uses curated seeds, so the engine draws randomness rarely (desk reply jitter and similar flavor, nothing load-bearing). Determinism, not statistical quality, is the requirement. xoroshiro128plus passes PractRand regardless, so there is no quality concern worth engineering around.

## Design

Wrap pure-rand's `xoroshiro128plus` behind a tiny engine-owned interface so pure-rand types never spread through the codebase. pure-rand (runtime dependency, ~8.4.x, already installed by section-01) exposes generators as objects with methods and internal state; the wrapper inverts that into a value-oriented API:

- `RngState` is a JSON-safe opaque encoding of the generator state. pure-rand generators carry serialized numeric state; `RngState` holds those numbers in plain JSON-safe form (finite numbers, plain object or array, no classes). The rest of the engine treats it as opaque. It must survive `JSON.stringify` / `JSON.parse` with no loss, because it is persisted inside campaign saves and snapshots.
- The wrapper reconstructs a pure-rand generator from `RngState` on every call, reads it, and encodes the successor state into a NEW `RngState` object. The input state object is never written to. This is what makes frozen-snapshot branch running safe: calling the wrapper on a deep-frozen `RngState` must work.

Public surface of `src/engine/rng/` (signatures are the contract; bodies are the implementer's job):

    interface RngState        // JSON-safe opaque encoding of generator state

    function rngFromSeed(seed: number): RngState
      // Deterministic: same seed, same state, same draw sequence forever.

    function nextInt(rng: RngState, min: number, max: number): [number, RngState]
      // Uniform integer draw, inclusive of BOTH bounds, delegating to pure-rand's
      // unbiased uniform distribution (never modulo reduction). Returns the value
      // plus a NEW RngState; the input state object is never written to.

    function forkStream(rng: RngState, streamIndex: number): RngState
      // clone() plus streamIndex applications of jump(): yields a 2^64-separated
      // stream per index, for parallel branch simulations. Pure and
      // deterministic: equal inputs give equal outputs; the input is not mutated.

Implementation notes:

- Use pure-rand's unbiased uniform integer distribution for the draw (pure-rand provides an unbiased `uniformIntDistribution`; do not hand-roll modulo reduction, which is biased).
- `forkStream` uses the generator's `jump()` (xoroshiro128plus supports it in pure-rand), applied `streamIndex` times on a clone. `forkStream(rng, 0)` is a plain clone of the current stream position.
- Keep pure-rand imports confined to this directory. Export only `RngState`, `rngFromSeed`, `nextInt`, and `forkStream` from the module's index; nothing else in the engine should import pure-rand directly.
- `RngState` values must obey the engine's serialization rules: finite numbers only, no `undefined`, no bigint leaking into persisted shape (if pure-rand's internal state uses forms that are not JSON-safe, the encoding must convert to JSON-safe numbers and back losslessly).

## Tests first

Write these in `test/engine/rng/` (mirroring `src/engine/rng/`) before implementing. They run headless in Node under the Vitest 4 engine project. Stubs below are what to test, not how:

- Test: `rngFromSeed(sameSeed)` twice, identical draw sequences.
- Test: `nextInt` bounds inclusive on both ends; distribution hits min and max over many draws; never outside range.
- Test: `nextInt` returns a NEW `RngState` and never mutates input; calling it on a deep-frozen `RngState` succeeds (no throw in strict mode) and returns a fresh object. Deep-freeze means recursively `Object.freeze` over the whole state object, not just the top level.
- Test: `RngState` JSON round-trip (`stringify`, `parse`) continues the exact sequence: draw a prefix, round-trip the state, draw the suffix, compare against an uninterrupted run.
- Test: `forkStream(rng, i)` and `forkStream(rng, j)`, `i` differs from `j`, produce non-overlapping sequences over a large sample; `forkStream` is deterministic for equal inputs (call it twice with the same arguments, strict-equal the resulting draw sequences).

Mutation checks should use deep equality on the input state before and after each call, in addition to the deep-freeze test; both together prove the no-mutation contract rather than relying on freeze semantics alone.

## Acceptance

Section is done when all five test groups above pass under `npm test`, `tsc --noEmit` stays clean, the ESLint purity gate passes on `src/engine/rng/` (no `Math.random`, `Date.now`, `performance.now`, or DOM globals), and no module outside `src/engine/rng/` needs a pure-rand import to consume randomness. Coverage counts toward the engine thresholds (lines 80, branches 75) established in section-01.

## As built (2026-11-17)

pure-rand 8.4.2 ships an IMPERATIVE v8 API (next() returns a number and
mutates; uniformInt(rng, from, to) draws by mutating; jump() mutates in
place; xoroshiro128plusFromState restores; subpath exports only), so the
plan's value-oriented [value, nextRng] surface is implemented as a
wrapper that materializes a fresh local generator per call from a
defensive copy of the JSON-safe { words } state. Review hardening:
bounds, seed, stream-index, and state-shape validation all throw
attributably; stream separation tested by shared-contiguous-window
detection. Files: src/engine/rng/index.ts,
test/engine/rng/rng.test.ts (15 tests). Full trail in
implementation/code_review/section-02-*.md.
