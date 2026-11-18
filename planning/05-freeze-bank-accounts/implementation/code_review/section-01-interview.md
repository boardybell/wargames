# Section 01 triage (bank module)

Full autonomy. The real-outcome tier, WOPR-line-as-pure-display, credit-at-resolution, engine-owned clue, and reference-only schema are correct and stay. Fix the extended-time cadence, the real drain-before-reduce tie, the cross-tab evidence, and the dead collapse path.

## Fix
- H1: make the confidence-tick cadence scale correctly under extended time. Do not hardcode 240; derive the tick offsets from the payload's actual duration and emit them so that under the engine's extended-time scaling the ticks keep a proportional cadence covering the FULL (possibly doubled) window with no dead tail. Add an extendedTime:true test asserting the ticks fire at the scaled cadence across the whole window and the mission stays solvable.
- H2: construct the TRUE same-call tie — a withdrawal wave whose scheduledAt equals the broad hold's dispatch timestamp — and test BOTH orderings (the wave drained in a prior wake vs drained in the same dispatch as the hold), asserting the engine's drain-before-reduce ordering makes the wave count as arrivedBeforeHold deterministically in both, with identical resulting substate.
- M1: fix crossTab so an injected withdrawal with no active broad hold is NOT counted as a before-hold genuine withdrawal — check injected provenance before the before/after-hold split so the debrief evidence is truthful. Add a test (injected draw with no active hold is categorized as injected/contagion, not before-hold).
- M2: make the second collapse cause REAL and tested: collapse when derived cash falls below zero/the collapse floor (penalties + injected draws can drive derived cash negative), distinct from the confidence-zero collapse; add a test that drives it. If after analysis a derived-cash collapse is genuinely impossible, instead delete the dead guard and make confidence-zero the single documented collapse cause (no dead branches).
- M3: pin the selective-play run's tier to a concrete value in the divergence test (not just "beats failed").
- M4: drive an inbound paymentsDelayed consequence through the REAL engine fold at init and assert the target account actually drains (not the current commsDelayed no-op).
- LOW: add lower bounds (>= 0) to injectMagnitude/durationMs/endsAt in the saveSchema.

## Done when
Bank engine tests green including a real extendedTime:true cadence test, the true drain-before-reduce tie in both orderings, truthful cross-tab categorization, a real + tested second collapse path (or the dead one removed), a pinned divergence oracle, and a real paymentsDelayed fold test. tsc + eslint clean, no regressions.
