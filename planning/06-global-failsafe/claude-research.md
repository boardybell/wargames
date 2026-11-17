# Research: 06-global-failsafe

Decision (autonomous per Bond's 2026-11-17 directive): no new research. The
finale composes contracts that already exist and were review-hardened:
engine branch machinery (snapshot, runBranch with forkStream per branch
index, BranchStep { step, label, detail }, viability thresholds from settled
metrics), the shared independence validator (isIndependentObservation with
reason codes), the campaign case file (cluesFound via clues()/clueFound,
inspectedRecords via INSPECT_RECORD, sourceChecks with
arrivedAfterSettlement), engine-owned CHECK SOURCE, emitted events including
finaleFinalPhase, and the shell's playBranchTrace, cabinet alarm, dialogs,
and grid. Joshua's authored line set is content, not technique.

## Testing approach

Finale module and case-validator tests in the engine node project; the four
required validator rejection cases from the requirements run as named
fixtures (correct C17-F06-B04 accepted; receipt-time-sorted rejected;
on-time unrelated source rejected; missing independent check rejected).
Branch determinism re-asserted at the finale level over real mission
projections. Screen tests in jsdom with the real engine across settled
campaign fixtures (healthy, capacity-constrained, all-failed). Ending
reachability fixtures for all three endings under the countdown.
