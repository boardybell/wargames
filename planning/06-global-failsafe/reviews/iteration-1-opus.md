# Opus Review

**Model:** claude-opus (opus-plan-reviewer subagent)
**Generated:** 2026-11-17 (see session log)

Findings (full text in the session transcript):

1. CRITICAL: the projection seam has no mission substate to replay.
   Settlement deletes mission queues and substate; the finale-start
   snapshot holds settled[] metrics plus campaign case-file state only.
   "Running real mission modules" is unimplementable; golden end-state
   framing in the risk note contradicts the body. Pick reading (A):
   projections are pure transforms over the three SettledOutcome.metrics
   plus the exception selector.
2. CRITICAL: tier-encodes-ending is unsound. Endings must be selected by
   the committed action (explicit endingId), with STAGED and HOLD commits
   settling completed and REPEAT/timeout/forfeit settling collapsed; tier
   stays the quality axis.
3. HIGH: commit-vs-timeout race. COMMIT must settle synchronously in its
   own reduce via terminal() so a same-wake timeout cannot override a
   committed recovery. Finale forfeit confirmation copy must state it
   yields the repeated-order ending.
4. HIGH: the recognition event is not in the EngineEvent union. Pick a
   mechanism: new union member, clueFound reuse, or finale-state key with
   no event.
5. HIGH: field-report timing and legality. The authored wait can strand a
   winnable case near the deadline; and W02 always exists, so "no
   qualifying candidate" may never be true. Define the slot as requiring
   corroboration (a CONFIRMED prior check or the finale field report),
   bound the wait against the finale duration, and test
   request-at-first-legal resolves with slack.
6. MEDIUM: viability pass/fail must be computed from the same STAGED end
   state the projection column displays (one computation, two renderings);
   consistency test.
7. MEDIUM: catalog coverage must assert an explicit required-line
   manifest, not the whole event union; and the reverse dependency (03-05
   display Joshua lines before 06 exists) needs a stated resolution.
8. MEDIUM: deskChecks naming confirmed (split 01 section-07 seeds file),
   but every seed needs a designated finale field-report record with a
   reply row and a seed-validation assertion; currently unenumerated.
9. Lower: dual-state model (live case file vs frozen branch baseline)
   explicit; candidate filter (only independence-passing CONFIRMED checks
   offered); reorder UI limited to the three subsystem slots; name the
   settled-metrics selector on the public API; UPSTREAM BUG: end-anchored
   timer warnings (30s/10s) must anchor to endsAt and never scale under
   extended time, while start-anchored offsets scale; the finale cannot
   fix this alone.

Solid: directory split, shared-validator composition, determinism
commitments, risk register (right risk, understated reason).
