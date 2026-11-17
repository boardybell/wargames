# Interview: 01-simulation-core

2026-11-17. Interviewee: Bond. Prior context: planning/deep_project_interview.md
already fixed full pipeline, full quality, determinism, Vitest, no em-dashes.
Research (claude-research.md) answered the technical trade-offs, so this round
covered only the two decisions that change player-facing scope.

## Q1: Campaign seed support

Q: The spec requires the known-solvable fixture seed plus at least one more. How far
do we take seed support? Options: fixture + 2 curated, fixture + 1 curated, arbitrary
player seeds with procedural variation.

A: Fixture + 2 curated. Three shipped campaigns, each hand-authored and verified
solvable, selectable by name at New Campaign. No procedural generation.

## Q2: Extended-time setting

Q: What should extended time actually offer beyond 4-minute missions and the
3-minute finale? Options: one Extended toggle at double time, a preset menu, or an
untimed practice mode.

A: Double time. One labeled toggle: Standard (4/3) or Extended (8/6). Every mission
stays a timed mission.

## Engineering decisions carried from research (not user questions)

- PRNG: pure-rand xoroshiro128plus, rngState stored inside game state, clone() at
  branch forks, jump() for parallel branches.
- Save validation: Valibot (about 1.4 kB) over zod/mini; migration function array;
  primary + backup localStorage keys; layered fallback to fresh state.
- Time enters the engine only as action payload or advanceToNow(state, now)
  argument; ESLint bans Math.random, Date.now, performance.now under src/engine/**.
- Vitest 4 projects config, engine tests in node environment, fast-check 4
  properties for determinism and snapshot-replay equivalence.
