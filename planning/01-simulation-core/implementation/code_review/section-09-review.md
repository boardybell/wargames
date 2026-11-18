# Code Review: section-09-branch

Reviewer: deep-implement code-reviewer subagent (adversarial).

## Guarantees confirmed upheld
- **Side-effect freedom.** deepClone rebuilds every array and object sharing
  no references; deepFreeze recurses into arrays and nested objects before
  freezing the parent. runBranch clones the frozen snapshot into an unfrozen
  graph and only ever reduces the clone; the frozen snap is read-only.
- **Determinism / stream separation.** forkStream(rng, BRANCH_INDEX[kind])
  gives each kind a fixed 0/1/2 index; the step now-derivation is pure over a
  frozen field and the loop index. canonicalStringify normalizes -0.
- **Integer / JSON-safety across reachable end states**, including the
  activeMission-null post-settlement case (intOr defaults). computeViability
  sums only present metric keys and defaults missing thresholds to 0.

## Findings
- **HIGH** — runBranch discarded dispatch rejections (`.state` only). A
  rejected action would be a silent no-op that still records a trace step and
  skews the projection. Latent trap for split 06.
- **MED — API signature** — runBranch takes a leading `ctx` the plan's
  `runBranch(snapshot, kind)` signature omits.
- **MED — false comment** — the readonly-words comment allegedly misstates
  the type system.
- **MED — negative-value trap** — passengers/confidence had no zero clamp.
- **LOW — stream separation under-exercised** — 1–2 step branches never cross
  the test-double's start+60s draw, so no RNG is consumed in the tests.
- **LOW — wrapper vs bare array** — runBranch returns a BranchResult wrapper;
  callers destructure `.trace`.

See section-09-interview.md for dispositions.
