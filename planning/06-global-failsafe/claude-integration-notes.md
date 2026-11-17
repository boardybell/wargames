# Integration Notes: Opus review of 06-global-failsafe plan

All findings integrated; the plan gains a Review Integrations section
(revision 2) and one more engine amendment set (block 18 on the split 01
plan, amendment 4 on its section files). Decisions:

1. Projections resolved as reading (A): BranchProjection is a pure
   transform over the three SettledOutcome.metrics plus the campaign
   exception selector. REPEAT worsens settled damage by authored deltas,
   HOLD freezes it with authored containment costs, STAGED applies the
   authored recovery deltas gated by viability. The split 01 branch
   machinery remains the determinism harness (proven on the test-double);
   for the finale its policies are these transforms, forkStream is unused
   and said so, and BranchStep traces are authored sequences derived from
   the transform steps. Golden-value fixtures per campaign fixture state.
2. Endings by action: SettledOutcome gains endingId ('recovery',
   'containment', 'failure') derived from FinaleState.committed plus
   cause. STAGED and HOLD commits settle completed; REPEAT commit,
   timeout, and forfeit settle collapsed. Tier remains the quality axis
   within an ending.
3. COMMIT settles synchronously: terminal() returns non-null the instant
   committed is set, in the same reduce, so a same-wake timeout cannot
   override; race test added. The finale pause-overlay End Mission
   confirmation states plainly it yields the repeated-order ending.
4. Recognition: finale-state key, no new EngineEvent. The Joshua line and
   voice cue key on the caseValid false-to-true transition observed
   through selectors; emitted stays a closed union.
5. Field report: the observation slot requires corroboration: an
   independent OBSERVED record WITH a CONFIRMED completed check (from
   play) or the finale field report (a desk-check product). Uncorroborated
   W02 renders in the list flagged UNVERIFIED and does not satisfy the
   slot, making REQUEST FIELD REPORT genuinely reachable. Legality: no
   corroborated candidate exists. Bound: the authored finale wait is
   validator-asserted <= finale duration minus an authored decision
   margin; a test requests at first legality and still validates and
   commits. Late arrival (arrivedAfterSettlement) renders honestly as a
   pending line in the ending screen.
6. Viability and the STAGED column are one computation, two renderings;
   consistency asserted in the fixtures.
7. Catalog: coverage test runs against an explicit required-line manifest.
   Reverse dependency resolved by graceful absence: the shell renders
   Joshua lines only when the catalog resolves a key, so missions 03 to
   05 play fully (with their own mission copy) before 06 lands and gain
   Joshua voice-overs when it does.
8. Every seed gains a designated finale field-report record (OBSERVED,
   independent) with a deskChecks row; seed validation asserts presence,
   independence, and the bounded wait (amendment 4 touches the seeds
   section).
9. Dual-state model explicit: the live case file (validator input) keeps
   updating after START; the branch baseline freezes at START; they never
   need to agree. Candidate filter: only corroborated candidates offered.
   Reorder UI exists only on the three subsystem slots.
   selectSettledMetrics joins the public API (amendment 4).
10. UPSTREAM FIX (amendment 4): milestone events authored as offsets from
    mission END anchor to endsAt as absolute T-minus values and NEVER
    scale under extended time; start-anchored offsets scale as before.
    The flights and bank extended-time tests inherit the carve-out (all
    scheduled kinds scale proportionally EXCEPT end-anchored milestones).
