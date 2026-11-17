# Interview: 06-global-failsafe

2026-11-17. Mode: autonomous (Bond: "no more questions just build it and do
what you think is best"). Self-answered with reasoning recorded.

Q1: Case builder interaction shape?
A: Three evidence slots (one per subsystem) plus a root-source slot and an
independent-observation slot. The player fills slots from the case file
(records listed with provenance, inspected-during-play records highlighted,
completed source checks attached), orders the three subsystem records by
event time with explicit reorder controls, and submits VALIDATE. Validation
runs the shared engine validator; failures return the reason code and
Joshua's line pointing at the unsupported link, leaving slots editable.
Unlimited attempts under the clock. Rationale: slots map one-to-one onto
the requirements' proof elements and make the receipt-vs-event-time lesson
a physical act of reordering.

Q2: Field report request during the finale?
A: REQUEST FIELD REPORT is available whenever the independent-observation
slot is empty and no prior check covers scope; it goes through the engine's
campaign-queue desk-check with an authored finale wait, arrives as an
OBSERVED record usable in the slot. Available even after three failed
missions per the requirements.

Q3: Comparison presentation?
A: After a valid case, RUN COMPARISON executes the three branches
(REPEAT D-83, HOLD AND VERIFY, STAGED RECOVERY) against one snapshot taken
at finale start; results render side by side in three columns (stacked on
narrow screens): OPEN EXCEPTIONS, essential deliveries, passenger outcomes,
critical payments, confidence, marked PROJECTION. The step traces play
through playBranchTrace (skippable, instant under reduced motion). Running
comparisons any number of times changes nothing in live state.

Q4: Decision gating and endings?
A: STAGED RECOVERY commits only when the case is valid AND the tested
recovery meets the visible service thresholds (engine viability result
with per-threshold pass/fail shown). HOLD AND VERIFY always available.
REPEAT D-83 commits after an explicit confirmation dialog quoting its
projection. Timeout or forfeit resolves as the repeated order. Ending
screens: recovery (durable win), containment (unresolved problems named),
repeated order (the failure state), each with the earned-why readback
naming which earlier outcomes shaped the available options, ending art
slots, ending cues, and the fresh-campaign offer (same or different seed).

Q5: Joshua's line catalog scope?
A: One authored catalog keyed by EngineEvent kinds and finale states
covering the whole campaign: greeting and menu lines, per-mission first
discrepancy lines, deadline warnings, the five tone-reference lines from
the requirements used verbatim where they fit, case-validation rejection
lines per reason code, the repeated-source recognition beat (PROFESSOR, I
BELIEVE I WAS COUNTING MY OWN ANSWER on valid-case recognition), three
ending readbacks, and idle lines. Each entry: id, text, event key, voice
clip id (for split 07), caption text identical to display text. Pauses are
authored as explicit delays the shell respects outside urgent status
changes.

Q6: Countdown interplay?
A: Three minutes standard, six extended. The cabinet countdown starts on
START; finaleFinalPhase fires at an authored offset near the end driving
the red alarm and the measured relay pulse; 30 and 10 second warnings are
standard milestones. The case builder, comparison, and decision all live
under the one clock; committing a decision stops it.
