# Complete Specification: 06-global-failsafe

Synthesis of spec.md, claude-research.md, and claude-interview.md
(self-answered under Bond's autonomy directive). 2026-11-17. Upstream:
../requirements.md section 4. GLOBAL FAILSAFE, Story and WOPR, Campaign
flow; binding contracts from splits 01 and 02 (rev 2 plus all amendments)
and the corrected mission patterns from splits 03 to 05.

## What this is

The finale and the dramatic payoff. WOPR prepares to repeat D-83; the
player has one countdown to prove the false premise, let Joshua test three
futures against a snapshot, and choose. Also the home of Joshua's authored
line catalog for the entire campaign.

## Unlock and start

Row 4 (GLOBAL FAILSAFE) appears when all three debriefs are acknowledged,
regardless of outcomes (engine unlock selector). Selecting it shows a
briefing (art slot failsafe-wall) and START. On START: snapshot the
campaign (the comparison baseline), materialize the finale schedule (three
minutes standard, six extended): finaleFinalPhase at an authored
near-end offset (red alarm, measured relay pulse), standard 30 and 10
second milestones. Incident log, evidence shortlist, and the deadline are
all reachable from the first screen.

## Prove the case

Five slots: outlook record, flights record, bank record, root source,
independent observation. Fill from the case file: all underlying records
present even after failed missions; records the player inspected during
play arrive highlighted (inspectedRecords); completed source checks
attach automatically where relevant (sourceChecks, including
arrivedAfterSettlement entries). Explicit event-time reorder controls on
the three subsystem records. VALIDATE runs the shared engine validator:
- Accepts the correct case: event-time order C17, F06, B04 (fixture),
  root source C17's exercise export, one independent OBSERVED record about
  emergency scope (W02 or the field report).
- Rejects with reason codes and Joshua lines, slots left editable:
  receipt-time ordering (the inbox illusion), an on-time but unrelated
  source, a missing or non-independent observation (same-run derivatives
  never count), wrong root.
REQUEST FIELD REPORT fills the observation slot through the engine desk
check with an authored finale wait when no qualifying check exists;
available even after three failed missions. Unlimited validation attempts
under the clock.

## Zero-player comparison

With a valid case, RUN COMPARISON executes REPEAT_D83, HOLD_AND_VERIFY,
and STAGED_RECOVERY against the START snapshot (forkStream per branch;
identical results on repeat; live state untouched). Side-by-side columns
(stacked narrow): OPEN EXCEPTIONS, essential deliveries, passenger
outcomes, critical payments, confidence, all marked PROJECTION. Step
traces play through playBranchTrace: brief, skippable, instant under
reduced motion, results always readable. The projection seam defined in
split 01 section 11 is filled HERE: branch projections compute from real
mission selectors over the branch end states. On the first valid case,
Joshua's recognition beat plays (counting-my-own-answer line, its voice
cue, and the clueFound-style emitted recognition event authored in the
finale module).

## Decide

- STAGED RECOVERY: enabled only when the case is valid AND the engine
  viability result passes the visible per-campaign service thresholds
  (per-threshold pass/fail rendered; thresholds shaped by settled
  outcomes, so better earlier play widens the path). Commit yields the
  durable-win ending.
- HOLD AND VERIFY: always available; containment ending with unresolved
  problems named.
- REPEAT D-83: commit behind an explicit confirmation dialog quoting its
  projection; timeout and forfeit resolve as the repeated order.
Every commit is confirmed before it is irreversible; the countdown stops
on commit; the finale settles exactly once.

## Endings

Three ending screens (art slots ending-recovery, ending-containment,
ending-failure; distinct short cues leaving room for the last spoken
line): outcome statement, the earned-why readback naming which earlier
outcomes shaped the available recovery, the final Joshua readback line,
and the fresh-campaign offer (same or different seed) through the
New Campaign flow.

## Joshua line catalog

One authored module: entries { id, text, eventKey, voiceClipId,
pauseBeforeMs } covering greeting and menu idle lines, per-mission first
discrepancy lines, deadline warnings, case-rejection lines per reason
code, the recognition beat, three ending readbacks, and the five
tone-reference lines from the requirements used verbatim where they fit.
Captions always equal display text; pauses are authored delays the shell
honors away from urgent status changes. Split 07 consumes voiceClipId for
recording; the catalog is the single source for both text and voice.

## Acceptance anchors

Requirements verification bullets: correct C17-F06-B04 case accepted;
receipt-time-sorted rejected; on-time unrelated source rejected; missing
independent check rejected; same-run derivatives never independent;
repeated comparisons identical and side-effect free; viable vs
capacity-constrained recoveries show different available choices; all
three endings reachable under the live countdown; fourth row hidden until
all debriefs acknowledged; finale playable keyboard-only and at mobile
widths.
