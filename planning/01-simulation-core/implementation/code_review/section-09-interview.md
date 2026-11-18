# Review Triage: section-09-branch

Mode: autonomous (standing no-more-questions directive). Both load-bearing
guarantees were confirmed upheld. Dispositions:

## Fixed
- **HIGH (discarded rejections).** runBranch now inspects dispatch's
  rejection and throws `branch policy produced an invalid action: <reason>`
  rather than recording a silent no-op step. New test: running a branch on a
  fully-settled (no active mission) snapshot throws, proving rejections
  surface instead of skewing the projection. 196 tests green.
- **MED (negative-value trap).** passengers and confidence are now
  `Math.max(0, ...)` clamped, so split 06 inherits a contract where no
  projection field goes negative regardless of policy or goal. Current
  policy values are unchanged (none were negative), so distinctness and the
  integer test still hold.

## Documented (not a code change)
- **MED (signature deviation).** runBranch(ctx, snap, kind) genuinely needs
  the EngineContext to replay reducers; the plan's two-arg signature is
  illustrative. Recorded in the section "As Built" note so section-10 wires
  the three-arg call. The index export list is a superset of the plan's
  (adds deepClone/deepFreeze/computeViability), which is fine.
- **LOW (wrapper vs bare array).** runBranch returns BranchResult { kind,
  projection, trace, viability }; the plan permits a wrapper. Callers
  destructure `.trace`. Noted for section-10 / split 06.

## Declined
- **MED (false readonly-words comment).** The reviewer claimed both RngState
  shapes carry readonly words and the copy is a non-problem. This is a
  misread: the rng module's RngState.words is `readonly number[]`, but the
  campaign schema's rng infers a mutable `number[]` (v.array(v.number())).
  Assigning the fork directly fails tsc (verified during implementation),
  so `{ words: [...forked.words] }` is load-bearing, not cosmetic. Comment
  kept; it is accurate.
- **LOW (stream separation under-exercised).** True that the 1–2 step
  scaffold policies never cross the test-double's start+60s draw, so no RNG
  is consumed in these tests. Not strengthened here: Amendment 4 states the
  real finale policies are pure transforms over settled metrics and do NOT
  use forkStream, and forkStream's stream separation is already unit-tested
  in section-02. Forcing a contrived long-running branch to make the draw
  fire would add fragility for a guarantee that is architectural here and
  unused by the real finale. Known limitation, recorded.

## Verification
tsc 0, eslint 0, 196 tests green.
