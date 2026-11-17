# Research: 01-simulation-core

Web research synthesized 2026-11-17 for the deterministic headless engine. No codebase
research: fresh workspace. Sources cited inline; version anchors confirmed where
possible: Vitest 4.0 (Oct 2025), Zod 4 + zod/mini, Valibot 1.5.x, pure-rand 8.4.x,
fast-check 4.10.x, Chrome intensive throttling (88) and Energy Saver freezing (133).

## 1. Deterministic simulation patterns in TypeScript

PRNG comparison reference: bryc's PRNGs.md
(https://github.com/bryc/code/blob/master/jshash/PRNGs.md).

| Algorithm | State | Quality | Notes |
|---|---|---|---|
| mulberry32 / splitmix32 | 32-bit | Fails PractRand around 1 GB | Fastest; single serializable number; period about 2^32 |
| sfc32 | 128-bit | Passes PractRand | Best hand-rolled pick; 8 lines, zero deps |
| xoshiro/xoroshiro128 family | 128-bit | Passes | jump() gives 2^64-separated independent streams |

Libraries: pure-rand (8.4.x, TypeScript-native, actively maintained, the PRNG under
fast-check) is the strongest fit: xoroshiro128plus with pure
[value, nextRng] = rng.next(), clone(), jump(), skipN()
(https://github.com/dubzzz/pure-rand). seedrandom last published 2019, effectively
abandoned (https://www.npmjs.com/package/seedrandom); prando likewise.

Threading RNG through reducers, three patterns cross-validated:
- A. Pre-draw randomness in action creators (Redux orthodoxy). Snapshot alone cannot
  seed a branch because the PRNG cursor lives outside state.
- B. Store PRNG state inside game state and thread it immutably:
  const [roll, nextRng] = state.rng.next(); return { ...state, rng: nextRng, ... }.
  Every snapshot is a self-contained branch-replay starting point
  (https://dev.to/mighty840/a-pure-seeded-game-engine-gives-you-multiplayer-almost-for-free-4412,
  https://news.ycombinator.com/item?id=42471288).
- C. Middleware hydrates rngState around each dispatch
  (https://spin.atomicobject.com/randomness-redux-middleware/).

For an engine whose zero-player branches replay reducers against a snapshot, Pattern B
wins. clone() the RNG at fork points; jump() each clone for parallel branches.

Event-sourcing shape: the complete record is initialSeed + ordered action log;
snapshots (including rngState) are fast-forward checkpoints. Foundational invariant is
deterministic lockstep: identical initial state + identical inputs gives bit-identical
output (https://gafferongames.com/post/deterministic_lockstep/). Determinism testing:
hash canonical serialized state at checkpoints, run twice, assert equality, and inject
Math.random() once deliberately to prove the harness catches divergence
(https://www.shardsofstone.com/blog/testing-game-determinism).

Pitfalls:
- Floating point: IEEE 754 basic ops and Math.sqrt/fround/floor/min/max are spec-pinned
  and identical across engines. Math.sin/cos/tan/exp/log/pow/atan2/hypot are
  implementation-approximated and can differ in the last ULP across engines
  (https://rapier.rs/docs/user_guides/javascript/determinism/). Avoid in sim logic.
- Iteration order: plain-object integer-like keys sort numerically first. Prefer arrays
  sorted by stable ID, or Map/Set (insertion-ordered), rebuilt in deterministic order
  on snapshot restore.
- Array.prototype.sort stable since ES2019 (https://v8.dev/features/stable-sort), but
  always add a unique-ID tie-break.
- Ban Math.random, Date.now, performance.now inside the engine with ESLint
  no-restricted-globals / no-restricted-properties. Time enters only as action payload.
- JSON roundtrips drop undefined, turn NaN/Infinity into null, cannot carry
  Map/Set/BigInt. Keep snapshots finite-number-only. Watch -0.

## 2. Timer persistence and catch-up

Persist the absolute deadline: endsAt = startedAt + durationMs (epoch ms) in engine
state and save; UI derives remaining = max(0, endsAt - Date.now()) each repaint.
Decrementing counters drift under throttling
(https://learn.microsoft.com/en-us/answers/questions/6067444/25-second-countdown-loses-accuracy-when-the-tab-lo).
The interval/rAF is only a repaint trigger, never the clock.

Throttling realities 2025/2026:
- Chrome: hidden-tab nested timers clamp to about 1/second; intensive throttling
  (Chrome 88+) clamps to about 1/minute after hidden over 5 minutes and silent over
  30 seconds (https://developer.chrome.com/blog/timer-throttling-in-chrome-88). A
  4-minute mission backgrounded 5+ minutes hits this; in-tab ticking cannot be trusted.
- Chrome 133 (Feb 2025) Energy Saver freezing: hidden tabs can have JS frozen
  entirely, with Page Lifecycle freeze/resume events
  (https://developer.chrome.com/blog/freezing-on-energy-saver). Memory Saver can
  discard tabs (full reload on return).
- MDN documents clamping and Firefox's 1 s background clamp
  (https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout). Safari more
  aggressive still (https://nolanlawson.com/2025/08/31/why-do-browsers-throttle-javascript-timers/).
- Web Workers escape tab throttling but are unnecessary with deadline-timestamp +
  catch-up. Skip.

Wake-up signals: visibilitychange (to visible), pageshow with event.persisted true
(the only reliable bfcache-restore signal), resume (Page Lifecycle, fires before
pageshow on thaw), focus as backstop
(https://developer.chrome.com/docs/web-platform/page-lifecycle-api,
https://web.dev/articles/bfcache). Save on pagehide plus visibilitychange-to-hidden;
beforeunload is unreliable on mobile and blocks bfcache; unload is being removed.

Exactly-once in-order catch-up: persist a queue of scheduled events
{ id, scheduledAt, type } sorted by (scheduledAt, id). Pure advanceToNow(state, now)
pops and processes every event with scheduledAt <= now in order, deleting each as it
fires. Queue lives in the versioned save, so a double wake processes nothing the
second time; idempotent by construction. Fix Your Timestep accumulator adapted to
coarse events (https://gafferongames.com/post/fix_your_timestep/); matches idle-game
offline-progress patterns
(https://edvins.io/rebuilding-the-welcome-back-mechanic-from-idle-games-in-react,
https://idleworlds.com/blog/offline-progress-explained). Passing now keeps it
clock-free and testable.

Monotonic vs wall clock: performance.now() origin resets every navigation, useless for
cross-reload deadlines
(https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing).
Use Date.now() for persisted time; clamp negative elapsed to zero and cap catch-up
(30 minutes is generous for 4-minute missions).

## 3. Versioned save validation

Versioning: integer version in the payload; ordered pipeline of pure migration
functions from stored to current. Mirrors redux-persist createMigrate
(https://github.com/rt2zz/redux-persist/blob/master/docs/migrations.md) and Zustand
persist version + migrate
(https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data). For a
framework-free engine: array of (state) => state functions indexed by from-version.
Migrate on read, validate after migrating.

Validation libraries (Nov 2026):
- Zod 4: core about 5.4 kB gzipped; zod/mini tree-shakes to about 1.9 kB
  (https://zod.dev/v4, https://zod.dev/packages/mini).
- Valibot 1.x (1.5.0): modular named imports, about 1.4 kB gzipped typical, smallest
  full-featured option (https://www.npmjs.com/package/valibot).
- ArkType 2.x: fastest runtime but about 45 kB gzipped fixed cost; overkill
  (https://www.pkgpulse.com/compare/arktype-vs-zod).
- Hand-rolled guards: zero bytes, brittle as schema grows.

Pick Valibot or zod/mini; both about 1.5 to 2 kB.

Corruption recovery: try/catch around getItem + parse + migrate + validate; fall
through primary, then backup key, then fresh state. Write save-backup only after a
confirmed good primary write. Hazards: Safari ITP deletes script-writable storage
after 7 days without interaction; Safari private mode has thrown on writes; treat
every storage call as fallible.

Write strategy: debounce autosaves 500 to 800 ms; flush synchronously on
visibilitychange-to-hidden and pagehide
(https://www.igvita.com/2015/11/20/dont-lose-user-and-app-state-use-page-visibility/).
localStorage.setItem is synchronous and single-key writes effectively atomic; no
double-buffer needed for a few-KB save. Catch QuotaExceededError (drop backup slot,
retry once). localStorage beats IndexedDB on simplicity at this size.

## 4. Vitest setup for the engine package

Layout: single package, src/engine + src/ui, @engine path alias. Workspaces only pay
off with multiple consumers (https://vercel.com/academy/production-monorepos/set-up-vitest).
Enforce engine purity with lint rules (no DOM globals, no Math.random/Date.now under
src/engine/**), not package boundaries.

Vitest 4 is current (4.0 Oct 22, 2025). The workspace option and vitest.workspace.ts
are removed; projects in vitest.config.ts is the mechanism; environmentMatchGlobs is
gone (https://vitest.dev/blog/vitest-4, https://v4.vitest.dev/guide/migration,
https://v4.vitest.dev/guide/projects). Recommended config shape:

    export default defineConfig({
      resolve: { alias: { '@engine': '/src/engine' } },
      test: {
        coverage: {
          provider: 'v8',
          include: ['src/engine/**'],
          thresholds: { lines: 80, branches: 75 },
        },
        projects: [
          { extends: true, test: { name: 'engine', environment: 'node',
              include: ['src/engine/**/*.test.ts'] } },
          { extends: true, test: { name: 'ui', environment: 'jsdom',
              include: ['src/ui/**/*.test.tsx'] } },
        ],
      },
    })

extends: true required for sub-projects to inherit root plugins and aliases. Default
node; jsdom opt-in (startup cost). Coverage: v8 provider; Vitest 4 AST-aware
remapping closed the accuracy gap with Istanbul.

fast-check 4.x (4.10.x) with @fast-check/vitest test.prop
(https://www.npmjs.com/package/@fast-check/vitest). Core determinism property: same
seed + action log run twice gives toStrictEqual states. Second property: snapshot
mid-log, replay suffix from snapshot, assert equals full run (directly tests the
branch path). fc.commands for model-based sequences
(https://fast-check.dev/docs/advanced/model-based-testing/). Log the global
fast-check seed in CI for reproduction. fast-check is itself built on pure-rand.

## Recommendations for this engine

1. PRNG: pure-rand xoroshiro128plus (or inline sfc32 for zero deps). rngState inside
   GameState, threaded immutably; clone() at branch forks, jump() for parallel
   branches.
2. Sim record: initial seed + ordered action log; snapshots carry rngState so any
   snapshot seeds a branch replay. Run-twice state-hash determinism test plus one
   deliberate sabotage test of the harness.
3. Time never enters the engine implicitly: now arrives as action payload or
   advanceToNow argument. ESLint bans Math.random, Date.now, performance.now under
   src/engine/**.
4. Missions persist endsAt epoch ms; UI ticks repaint-only. On load and on
   visibilitychange/pageshow(persisted)/resume/focus call advanceToNow, draining the
   persisted queue in (scheduledAt, id) order, deleting as processed. Clamp negative
   elapsed, cap catch-up at 30 minutes.
5. Save: { version, state } JSON in localStorage, migration array on read, Valibot or
   zod/mini validation after migrating, backup key, layered fallback to fresh state.
   Debounced writes plus flush on pagehide and hidden visibilitychange; catch quota
   errors.
6. Testing: single package, Vitest 4 projects, engine in node environment, v8
   coverage scoped to engine, fast-check 4 properties for seed determinism and
   snapshot-replay equivalence.
