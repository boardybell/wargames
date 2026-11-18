# Review Triage: section-07-seeds

Mode: autonomous (standing no-more-questions directive). All findings
fixed as recorded in section-07-review.md. The two that mattered most:
the six-permutation proof was a tautology (hashing static seed input)
and is now a genuine order-invariance test over dispatched campaign
facts; and the lastNow fix is unified on one convention with the
default documented.

Decision recorded: SeedTuning and StormTrackPoint are deliberately NOT
top-level SeedDefinition fields. The rev-2 mission-split plans place
mission-specific tuning and storm data inside missionPayloads.<mission>
(opaque here, narrowed by splits 03 to 05), so folding them there is
correct, not a drop. The finale field-report absolute-second desk delay
is time-safe because the deadline only grows under extended time;
standard is the tight bound and is asserted.

Post-fix verification: 157 tests green, typecheck and lint zero errors.
