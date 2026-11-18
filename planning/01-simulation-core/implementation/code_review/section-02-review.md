# Code Review: section-02-rng

Reviewer: deep-implement code-reviewer subagent. Findings:

- MEDIUM-HIGH: materialize() passed rng.words directly into
  xoroshiro128plusFromState; frozen-safety depended on the library
  copying its input. Fix: unconditional defensive copy on the way in.
- MEDIUM: forkStream accepted negative and fractional indexes silently
  (negative = clone of the parent stream, fractional aliases to its
  ceiling): correlated "independent" branches with no crash. Fix: throw
  on non-integer or negative.
- MEDIUM: rngFromSeed accepted NaN/Infinity; a poisoned state would
  survive JSON into a save and detonate on restore. Fix: finite guard.
- MEDIUM: nextInt had no bounds validation (min > max delegated
  undefined behavior to pure-rand). Fix: safe-integer and order guard.
- LOW: materialize now validates state shape (4 finite words) so a
  corrupt save fails attributably at load.
- LOW: subpath exports confirmed real by the passing suite.
- MEDIUM (tests): stream-separation test was statistically toothless
  (value-collision counting). Fix: shared-contiguous-window assertion
  across pairs including indexes >= 1.
- LOW (tests): frozen-input assertion used toEqual instead of toBe;
  edge cases uncovered. Fixed and added.
- Verdict quote: "Both fixes are under five lines. Everything else is
  boundary hardening and test sharpening."
