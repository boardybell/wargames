# Section 04 review triage

Standing directive: full autonomy. No HIGH issues. The boundary, property, timeout/forfeit/clue, debrief, and extended-time proportionality tests are genuine and stay. Fix the MEDIUM wiring gaps so the load-bearing contracts are actually asserted; keep the LOW items.

## Fix
- **M1.** Wire the already-authored `backupWalkthroughScript` into fixtures.test.ts and assert `0 < backupRemaining < 5` at settlement (the real finite-margin proof), alongside the existing tier-3/completed assertion. The vacuous `>= 1` on the all-primary walkthrough can stay as a secondary check or be replaced.
- **M2.** Wire the already-authored `trustHintsScript` into fixtures.test.ts and assert it settles BELOW tier full (it is documented to land at partial = 2, one short), proving a smart-but-naive hint-follower still loses. Keep the single-desk spray as a second adversarial case.
- **M4.** Add desktop-width assertions (narrow matchMedia off) that `outbox-back` and `log-back` are ABSENT (queryByTestId null), locking the narrow-gating both ways.

## Keep (with rationale)
- **M3** StatusLine guard: structurally always present; acceptable as a move-detector, no change.
- **LOW** keyboard focus assertion (single command surface is the real focus model) and the extended-time absolute sanity anchor (proportionality is separately asserted from the ratio): both fine as-is.

## Done when
Engine + app projects green with the two load-bearing fixtures now asserted (finite backup margin and the trust-hints adversarial below full), the back-affordance gating locked both ways, tsc + eslint clean, no regressions.
