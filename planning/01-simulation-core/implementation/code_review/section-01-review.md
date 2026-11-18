# Code Review: section-01-foundation

Reviewer: deep-implement code-reviewer subagent. Findings as reported:

- HIGH vitest.config.ts: string aliases are prefix matches; the @engine
  entry would rewrite deep imports like @engine/rng to
  <index.ts>/rng. Fix with regex finds including a wildcard entry.
- HIGH deep_implement_config.json: test_command was "uv run pytest" in a
  TypeScript project; must be "npm test" before section-02.
- MEDIUM: planned directory skeleton absent from git (empty dirs
  untracked); each section creates its own module (accepted, recorded).
- MEDIUM purity-gate.test.ts: hardcoded absolute repo paths break on any
  other checkout; derive from process.cwd().
- MEDIUM package.json: verify @fast-check/vitest 0.2.x peer range admits
  vitest 4.
- LOW: stateHash 32-bit FNV-1a is collision-prone at section-10 scale;
  concatenate two passes for 64 bits.
- LOW: fail() misattributes assertJsonSafe errors to canonicalStringify.
- LOW: eslint files glob 'src/engine/**' looser than needed.
- LOW: @engine/testing alias targets a not-yet-existing module
  (intentional; sections 06+ create it).
- INFO: harness correctness and purity-gate coverage confirmed sound;
  inline lint fixtures accepted as a conscious deviation; member-aliasing
  evasion (const d = Date; d.now()) is an accepted lint limitation, so
  lint-green is not proof of purity.
