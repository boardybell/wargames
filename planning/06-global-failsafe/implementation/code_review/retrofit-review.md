# Campaign-divergence retrofit review

Reviewer: deep-implement:code-reviewer. FIX-THEN-SHIP. The retrofit math and the test's use of REAL mission modules (not test-doubles) are sound; metrics are integer/>=0/deterministic; the runBranch.test.ts update is an honest recalibration (breach moves from the wopr line to the service_cost line, viability still false). But one HIGH and a sharp threshold MEDIUM.

## HIGH
- **selectOpenExceptions goes NEGATIVE in the defensive campaign on every seed, and the test is blind to it.** src/engine/campaign/selectors.ts subtracts aggregate wopr_resolved with no floor; seed baselines are 12/14/10 but defensive aggregate wopr_resolved is 20, so OPEN EXCEPTIONS = -8/-6/-10. That headline WOPR-deception number rendered negative is a broken HUD, not "WOPR looks great." runBranch.ts:135 already clamps the analogous projection with Math.max(0, ...); the real selector does not. divergence.test.ts asserts only defensiveOpen < cleanOpen, which a negative satisfies. Fix: clamp the selector (return Math.max(0, open)) AND add expect(defensiveOpen).toBeGreaterThanOrEqual(0) so the clamp is pinned.

## MEDIUM
- **service_cost max 12 cannot cleanly separate one-defensive (survivable) from two-defensive (should fail).** Per-mission defensive service_cost: outlook 4, bank 8, flights 8. Single-worst = 8; min two-pair = 12. With max 12 and a <= gate, bank+flights (16) fails but outlook+bank (12) passes at the boundary — identical "defend two" behavior flips on which two, with no in-fiction reason, and it sits exactly on the boundary so one extra held item tips it. Fix: set service_cost max to 10 (strictly between single-worst 8 and min-two 12): any single defensive mission (<=8) stays viable, ANY two defensive missions (>=12) fail, cleanly and symmetrically. Add mixed-play divergence cases proving a single-mission-defensive campaign PASSES and a two-mission-defensive campaign (test both bank+flights and outlook+bank) FAILS, so the contract is chosen and tested, not an accident of summation.

## LOW
- outlook service_cost = woprResolved + decoy double-counts the undelivered messages into both axes by design (WOPR credits the holds; the campaign bills the same holds as real damage — that IS the divergence). Defensible; add a one-line comment acknowledging the deliberate coupling so a future author does not "fix" it.
- bank defensive service_cost = 8 depends on the freeze-all run actually reaching cause 'collapsed' (surcharge = payments.length only when collapsed). It does today (confidence crosses 0), but a future confidence retune could silently drop it to 4, narrowing the thesis margin unnoticed. Pin it: expect(settledOf(defensive bank).cause).toBe('collapsed') in the divergence test.

## CLEAN (verified)
Metrics integer/>=0/deterministic; new keys purely additive (no existing metric altered); runBranch.test.ts update honest (viable stays false, breach moves lines); divergence test drives real makeOutlook/Bank/Flights through the real engine and real selectors/computeViability.

## Bottom line
Fix-then-ship. Clamp selectOpenExceptions + assert >= 0; lower service_cost max to 10 and add mixed-play cases pinning one-defensive-passes / two-defensive-fails; pin the bank 'collapsed' precondition; comment the outlook deliberate coupling. Small surgical changes.
