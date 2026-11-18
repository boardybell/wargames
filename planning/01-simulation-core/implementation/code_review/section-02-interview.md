# Review Triage: section-02-rng

Mode: autonomous (standing no-more-questions directive). All findings
auto-fixed; none required a user tradeoff:

1. Defensive copy into xoroshiro128plusFromState (frozen safety no
   longer depends on library internals).
2. forkStream throws on non-integer or negative stream indexes.
3. rngFromSeed throws on non-finite seeds.
4. nextInt throws on non-safe-integer or inverted bounds; min === max
   returns the single value.
5. materialize validates state shape (exactly four finite words) with an
   attributable error message.
6. Stream-separation test rebuilt on shared-contiguous-window detection
   across index pairs (0,1), (1,2), (2,5); identity assertions corrected
   to toBe; boundary and corrupt-state tests added.

Declined (style only): drawSequence returning its terminal state; the
duplicate ten-draw loop in the round-trip test stays as the clearer
reading.

Post-fix verification: 24 tests green, typecheck and lint zero errors.
