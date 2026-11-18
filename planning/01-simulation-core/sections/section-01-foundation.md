# Section 01: Foundation

Repository skeleton, tooling, purity enforcement, and the deterministic test harness for the SHALL WE PLAY A GAME? simulation engine. Everything later sections build on starts here. This section has no dependencies and blocks all others.

## Background

The engine is the headless core of a WarGames-inspired browser game that ships as a static React/Vite site. It lives entirely under `src/engine/` as pure TypeScript with zero DOM, React, or asset dependencies, testable in Node. The whole design rests on absolute determinism: every state transition is a pure function `(prev, envelope) => next`, wall time only ever enters as logged input, randomness is state threaded through reducers, and all state is plain JSON-safe data. The canonical record of a campaign is its seed plus an ordered log of `(action, now)` envelopes; replaying the log must reproduce the campaign exactly.

This section builds the scaffolding that makes those guarantees enforceable and testable from day one: the package and config skeleton, an ESLint purity gate that mechanically bans ambient time and randomness inside the engine, and a canonical state-hashing harness that later determinism tests (run-twice equality, snapshot-replay equivalence, six-permutation chronology) depend on. A later split (02, the app shell) will extend this skeleton rather than replace it, so configs must be additive-friendly.

Repo root: `/Users/darkpool/wargames`. All paths below are relative to it.

## Tests First

Write these before implementing. They live under `test/engine/` (mirroring `src/engine/`) except where noted.

### Tooling smoke tests (TDD block 3)

1. `test/engine/smoke.test.ts`: Vitest runs a trivial engine spec in the node environment, importing a trivial exported constant or function from the engine through the `@engine` path alias. Proves the projects config, node environment, and alias resolution all work.
2. ESLint purity gate meta test: a fixture file (kept OUTSIDE `src/engine/`, e.g. `test/fixtures/purity-violation.ts.fixture`) that uses `Math.random`, `Date.now()`, `performance.now()`, and `window`. The meta test (or a CI step) invokes ESLint programmatically against that fixture AS IF it were under `src/engine/**` and asserts the lint run reports errors for all four usages. A companion assertion runs the same lint over a clean engine file and expects zero errors. Use the ESLint Node API (e.g. the `ESLint` class with `lintText` and a synthetic `filePath` under `src/engine/`) so the fixture never pollutes the real source tree.
3. Type check: `tsc --noEmit` passes on the skeleton. This can be a CI/package script (`npm run typecheck`) rather than a Vitest test, but it must exist and must be green.

### Harness tests (the canonical-stringify portion of TDD block 13)

In `test/engine/harness/canonical.test.ts`:

1. Canonical stringify sorts keys recursively: two deep objects with identical content but different key insertion orders stringify to byte-identical output and therefore hash equal.
2. Minus-zero normalizes to zero before hashing: an object containing `-0` hashes identically to the same object containing `0`, and the canonical string contains no `-0` representation.
3. Hash stability: `stateHash` of a fixed fixture object is deterministic across repeated calls.
4. JSON-safety guard (supports the engine-wide "serializable everything" principle): the canonical stringify helper throws (or the companion `assertJsonSafe` helper rejects) on `NaN`, `Infinity`, `undefined` values, `Map`, `Set`, and `Date` instances, so later property suites can assert state JSON-safety through one shared helper.

Stub definitions and docstrings are sufficient for tests at this stage where behavior is obvious from the name; fully specify only the assertions above.

## Implementation

### 1. package.json

Create at repo root (or extend if one exists). Runtime dependencies, exactly two: `pure-rand` (~8.4.x) and `valibot` (1.x). Nothing else at runtime. Dev dependencies: `typescript`, `vitest` (v4), `@fast-check/vitest` with `fast-check` (v4), `eslint` plus whatever minimal plugins the flat config needs (`typescript-eslint` for parsing TS). Scripts: `test` (runs `vitest run`; the manifest's project test command is `npm test`), `typecheck` (`tsc --noEmit`), `lint`. Note pure-rand and valibot are installed now even though they are first consumed in sections 02 and 05; pinning them here keeps the dependency surface a settled fact.

### 2. tsconfig.json

Strict TypeScript: `strict: true`, `moduleResolution: "bundler"`, `noEmit: true` (Vite will build in split 02; Vitest runs TS directly). Target a modern ES level (ES2022 or later). Define the path alias `@engine/*` -> `src/engine/*` (and `@engine` -> `src/engine/index.ts`). Include `src` and `test`.

### 3. vitest.config.ts

Vitest 4 uses the `projects` config; the separate workspace file is gone in v4, so do not create one. Define one project now, named `engine`, with `environment: 'node'`, test glob covering `test/engine/**/*.test.ts`. Coverage: v8 provider, scoped with `include: ['src/engine/**']`, thresholds lines 80 and branches 75. Resolve the `@engine` alias here as well (Vitest does not read tsconfig paths by itself; mirror the alias in `resolve.alias` or use a tsconfig-paths plugin). Split 02 will later add an app project beside the engine project; keep the engine project self-contained so that addition is a pure append.

### 4. ESLint purity gate

Flat config (`eslint.config.js`). A config block scoped to `files: ['src/engine/**']` applying:

- `no-restricted-properties` banning `Math.random`, `Date.now`, `performance.now`.
- `no-restricted-globals` banning DOM globals: `window`, `document`, `navigator`, `localStorage`, and `performance` itself.

Each ban carries a message pointing at the architecture rule it enforces (time is logged input; RNG is state). This gate is the mechanical teeth behind the purity principle: engine code can never reach ambient time, ambient randomness, or the DOM. Test code and future app code are unaffected because the block is path-scoped.

### 5. Directory skeleton

Create the module directories, empty except for placeholder index files where needed for the smoke test:

    src/engine/
      rng/          (filled by section-02)
      time/         (section-04)
      records/      (section-03)
      campaign/     (section-05)
      missions/     (section-06)
      seeds/        (section-07)
      save/         (section-08)
      branch/       (section-09)
      index.ts      (public surface; section-10 finalizes, create with a trivial export now)
    test/engine/    (mirrors src/engine)

`src/engine/index.ts` gets a trivial export (a version constant is fine) so the alias smoke test has something real to import.

### 6. Test harness helpers

Location: `test/engine/harness/canonical.ts` (test-tree code, not shipped engine code; the engine itself never hashes state, only tests do).

    /** Deterministic stringify: plain data only, keys recursively sorted,
     *  minus-zero normalized to zero. Throws on NaN, Infinity, undefined
     *  values, functions, Map, Set, Date, or any non-plain object. */
    function canonicalStringify(value: unknown): string

    /** Hash of canonicalStringify output. Any stable string hash is fine
     *  (e.g. FNV-1a over the canonical string); cryptographic strength is
     *  not required, only determinism and collision rarity in tests. */
    function stateHash(value: unknown): string

    /** Walks a value and throws with a path-bearing message on the first
     *  JSON-unsafe leaf. Shared by later property suites. */
    function assertJsonSafe(value: unknown): void

Implementation notes: sort object keys with default string comparison at every level; arrays keep order (order is meaningful, collections in engine state are arrays sorted by stable ID per the architecture rules); normalize `-0` with `Object.is(v, -0) ? 0 : v` at each numeric leaf. Do not use `JSON.stringify` with a replacer alone, because it silently drops `undefined` and coerces `NaN` to `null`; the helpers must throw loudly instead, since silent coercion would mask determinism bugs.

These helpers are the foundation for section-10's run-twice determinism, sabotage, and six-permutation tests, and for the fc.commands invariant checks. Get them right once here.

## Acceptance Checklist

- `npm test` green: smoke test through `@engine` alias in node environment, purity-gate meta test, canonical-stringify and hash tests.
- `npm run typecheck` green.
- Coverage config active (v8, `src/engine/**`, lines 80 / branches 75 thresholds); with near-empty source this trivially passes or is verified configured.
- Directory skeleton in place; `src/engine/index.ts` exports something importable.
- No runtime dependency beyond pure-rand and valibot.

## Dependencies and Downstream

Depends on nothing. Blocks every other section: 02 (rng), 03 (records), and 04 (time) start in parallel immediately after this lands and each relies on the alias, the node test project, the purity gate, and (for their determinism assertions) the canonical harness helpers.

## As built (2026-11-17)

Implemented at the repo root as planned with these deviations, all from
the section code review (implementation/code_review/section-01-*.md):

- vitest.config.ts uses ordered REGEX aliases (testing exact, @engine
  exact, @engine/* wildcard to src/engine/$1) because string aliases are
  prefix matches that corrupt deep imports.
- stateHash is 64-bit (two FNV-1a passes concatenated).
- Purity-gate meta test lints inline sources via the ESLint API with
  repo-relative paths derived from process.cwd(); no .fixture file.
- Lint fixtures note: member aliasing evades no-restricted-properties;
  lint-green is not proof of purity.
- eslint engine block scoped to src/engine/**/*.ts.
- Empty module directories exist on disk only; each later section
  creates its own files (git tracks no empty dirs).
- Files: package.json, tsconfig.json, vitest.config.ts, eslint.config.js,
  src/engine/index.ts, test/engine/smoke.test.ts,
  test/engine/purity-gate.test.ts, test/engine/harness/canonical.ts,
  test/engine/harness/canonical.test.ts. Tests: 9 green; typecheck and
  lint clean; deps pure-rand 8.4.2, valibot 1.x, vitest 4.1.12,
  fast-check 4.10.2 (+@fast-check/vitest 0.2.4, peer-clean).
