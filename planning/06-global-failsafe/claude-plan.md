# Implementation Plan: 06-global-failsafe

The finale of SHALL WE PLAY A GAME?: GLOBAL FAILSAFE. Prove D-83 caused
everything, let Joshua test three futures against a snapshot, decide before
the countdown ends. Also the home of Joshua's authored line catalog for the
whole campaign. Self-contained prose; code only as types, signatures,
trees. Companion spec: claude-spec.md in this directory.

## 1. Context and binding contracts

Engine (split 01, rev 2 plus sections 15 to 17): branch machinery
(snapshot deep-freeze comparand, runBranch on an unfrozen clone with
forkStream per branch index, BranchStep { step, label, detail },
STAGED_RECOVERY viability from settled metrics with per-threshold
pass/fail); the shared independence validator isIndependentObservation
with reason codes; case-file state (cluesFound via clues()/clueRecords,
inspectedRecords, sourceChecks with arrivedAfterSettlement); CHECK SOURCE
engine-owned; MissionModule with terminal() (completed | collapsed) and
the widened SettlementCause; emitted events including finaleFinalPhase and
branchRunCompleted; seed-authored milestones; integer math;
reference-only substates. The finale registers as a mission module for
lifecycle purposes (three minutes standard, six extended) but its
settlement outcomes are the three endings. Shell (split 02, rev 2):
playBranchTrace, cabinet red alarm on finaleFinalPhase, native dialogs,
CharacterGrid, verbs, global glossary, art slots failsafe-wall,
countdown-insert, hero-return, ending-recovery, ending-containment,
ending-failure; voice cues via the audio engine. The branch projection
seam named in split 01 section 11 is filled here.

## 2. Directory layout

    src/engine/missions/finale/
      types.ts          case slots, finale state + saveSchema
      module.ts         MissionModule (schedule, terminal(), evaluate)
      caseBuilder.ts    slot filling, ordering, validation glue (pure)
      projections.ts    fills the BranchProjection seam from mission
                        selectors over branch end states
      endings.ts        ending determination, earned-why derivation
    src/engine/joshua/
      lines.ts          the authored line catalog (ids, text, event keys,
                        voiceClipId, pauseBeforeMs)
      selectors.ts      line lookup by event key and finale state
    src/app/missions/finale/
      FinaleScreen.tsx  layout: incident log, shortlist, deadline reach
      CaseBuilderView.tsx  five slots, reorder controls, VALIDATE
      ComparisonView.tsx   three columns, playBranchTrace integration
      DecisionView.tsx     three choices, gating, confirmations
      EndingScreen.tsx     outcome, earned-why readback, final line,
                           fresh-campaign offer
      verbs.ts          SELECT/ORDER/VALIDATE/REQUEST FIELD REPORT/
                        RUN COMPARISON/COMMIT verbs + views
      glossary.ts       local terms (CASE, ROOT SOURCE, PROJECTION,
                        VIABILITY THRESHOLD)
    test/engine/missions/finale/
    test/app/missions/finale/

## 3. Finale state (engine side)

    interface FinaleState {
      slots: { outlook: string | null; flights: string | null;
               bank: string | null; root: string | null;
               observation: string | null }
      ordering: string[]            // player's event-time ordering
      caseValid: boolean
      lastRejection: { code: string; slot: string } | null
      comparisonsRun: number        // display only; branches are pure
      fieldReportRequested: boolean
      committed: 'staged' | 'hold' | 'repeat' | null
    }

Substate reference-only; the case file (records, checks, clues,
highlights) is campaign state read through selectors. The snapshot for
comparisons is taken at finale start by the engine lifecycle and carried
outside mission substate (engine-owned, consistent with branch
machinery); comparisons never mutate it.

## 4. Case building and validation (pure)

- Slot filling from the case-file selector: every record from all three
  missions is available regardless of mission outcomes; player-inspected
  records render highlighted. The observation slot requires
  CORROBORATION (review finding 5): an independent OBSERVED record with
  a CONFIRMED completed source check from play, or the finale field
  report (itself a desk-check product). Uncorroborated independent
  records (W02 unchecked) list as candidates flagged UNVERIFIED and do
  not satisfy the slot. Only corroborated candidates render as
  attachable; CONTRADICTED, PENDING, and UNKNOWN checks never qualify.
  Reorder controls exist only on the three subsystem slots.
- VALIDATE runs the shared validator composition: event-time ordering of
  the three subsystem slots must match true event times; the root slot
  must be the actual parent chain root (exercise export); the observation
  slot must pass isIndependentObservation against the seed's run; every
  slot filled. Failures return { code, slot } mapped to Joshua rejection
  lines (receipt-order confusion, unrelated source, derived-not-
  independent, wrong root, incomplete), leaving slots editable; unlimited
  attempts under the clock.
- REQUEST FIELD REPORT: legal when no CORROBORATED candidate exists;
  dispatches the engine desk-check against the seed-designated finale
  field-report record (engine amendment 12: every seed designates one,
  OBSERVED and independent, with its authored wait validator-bounded to
  finaleDuration minus a decision margin so a request at first legality
  still leaves room to validate and commit; tested). The reply joins the
  corroborated candidate list. Available after any combination of
  mission failures. A reply that still arrives post-settlement renders
  honestly as a pending line on the ending screen.
- The recognition beat keys on the caseValid false-to-true FINALE STATE
  transition (review finding 4): no new EngineEvent; the Joshua line and
  voice cue render through the line selectors observing that state
  change; emitted stays a closed union.

## 5. Comparison and projections

RUN COMPARISON (requires caseValid): executes the three branches against
the engine's finale-start snapshot. Corrected model (review finding 1,
engine amendment 10): the snapshot contains the three settled
SettledOutcome metrics and campaign case-file state but NO mission
substate (deleted at settlement), so projections.ts fills the split 01
seam with PURE TRANSFORMS over selectSettledMetrics plus the exception
selector. REPEAT D-83 worsens the settled damage by authored per-metric
deltas; HOLD AND VERIFY freezes it with authored containment costs;
STAGED RECOVERY applies the authored recovery deltas gated by viability.
forkStream is unused by these policies (the reducer-replay guarantees
stay proven on the engine's test-double); determinism is structural
(pure transforms over frozen metrics) and still asserted by repeat-run
strict equality and snapshot/live-state immutability tests. BranchStep
traces are authored sequences derived from the transform steps. The
viability result and the STAGED column are ONE computation rendered
twice, so the panel and the column can never contradict (consistency
fixture). Results render as three columns (stacked narrow), every figure
marked PROJECTION, step traces through playBranchTrace (skippable,
instant under reduced motion, results readable after skip). Dual-state
model: the live case file keeps updating after START (a late field
report joins it); the branch baseline stays frozen at START; they never
need to agree.

## 6. Decision and endings

- STAGED RECOVERY: enabled iff caseValid AND the engine viability result
  passes (per-threshold pass/fail rendered beside the control; thresholds
  derive from settled metrics, so better earlier play widens the path).
  Commit via confirmation dialog; terminal() returns completed; ending
  recovery.
- HOLD AND VERIFY: always enabled; confirmation; ending containment with
  the unresolved problems named from real campaign state.
- REPEAT D-83: confirmation dialog quoting its projection; ending
  failure. Timeout and forfeit also resolve as the repeated order
  (evaluate maps timeout and forfeit causes to the failure ending).
- endings.ts derives the earned-why readback: which settled outcomes
  opened or closed options (named, specific, from selectSettledMetrics),
  which evidence the player proved, what the chosen branch projected vs
  what the ending states. EndingScreen renders outcome, readback, the
  final Joshua line (voice cue), ending art slot, ending cue, and the
  fresh-campaign offer through the New Campaign flow.
- Settlement (corrected per review findings 2 and 3): endings are
  selected by the committed ACTION, carried as endingId ('recovery',
  'containment', 'failure') on the finale SettledOutcome (engine
  amendment 11). STAGED and HOLD commits settle with cause completed;
  REPEAT commit, timeout, and forfeit settle with cause collapsed. Tier
  remains the quality axis within an ending. COMMIT settles
  synchronously: terminal() returns non-null the instant committed is
  set, in the same reduce, so a same-wake timeout cannot override a
  committed recovery (race fixture in the tests). The finale's
  pause-overlay End Mission confirmation states plainly that forfeiting
  yields the repeated-order ending.

## 7. Joshua line catalog (src/engine/joshua/)

    interface JoshuaLine { id: string; text: string;
      eventKey: string;             // EngineEvent kind or finale state key
      voiceClipId: string;          // consumed by split 07
      pauseBeforeMs: number }

One catalog covering: greeting and idle lines, per-mission first
discrepancy lines, deadline warnings, case rejection lines per validator
reason code, the recognition beat, three ending readbacks, and the five
requirements tone-reference lines placed verbatim where they fit. Caption
text always equals display text. selectors.ts resolves lines by event key
with finale-state refinement; the shell renders them through TerminalText
with authored pauses honored away from urgent status changes (the shell's
caption line and announcer consume the same text). A catalog validation
test asserts coverage of an EXPLICIT required-line manifest (every
validator reason code, every ending readback, the recognition beat, the
named per-mission beats, deadline warnings) rather than the whole event
union, and that no line contains an em-dash. Reverse-dependency
resolution (review finding 7): the shell renders Joshua lines only when
the catalog resolves a key, so missions implemented before this split
play fully on their own mission copy and gain the Joshua voice-over
layer when the catalog lands; graceful absence, no placeholders.

## 8. Screens (shell side)

FinaleScreen: briefing (failsafe-wall art), START control, then the
three-view layout with the incident log (case file list), evidence
shortlist (slots), and the deadline always in reach (countdown chrome;
finaleFinalPhase drives the red alarm and relay-pulse cue). Views: CASE,
COMPARISON, DECISION commands plus tabs and mobile back affordances;
toggle persists. CaseBuilderView: five slots with SELECT and slot-target
commands, explicit reorder controls (MOVE <record> UP/DOWN and arrow
equivalents), VALIDATE with rejection rendering (Joshua line plus the
failing slot highlighted). ComparisonView: three columns, RUN COMPARISON
and SKIP, PROJECTION badges. DecisionView: three commits with gating
states and confirmation dialogs. EndingScreen per section 6. Keyboard
complete throughout; glossary terms active; all actions identical via
commands and buttons.

## 9. Testing strategy notes

Engine: validator composition cases (the four requirements fixtures:
correct C17-F06-B04 accepted; receipt-time-sorted rejected; on-time
unrelated source rejected; missing independent check rejected; same-run
derivatives never independent) per seed; field-report request legality
and late arrival; recognition event exactly once; projections filled from
real mission selectors with repeat-run strict equality and
snapshot/live-state immutability; viability gating across healthy,
capacity-constrained, and all-failed campaign fixtures (different choice
sets); ending determination per commit, timeout, forfeit; earned-why
content derives from settled metrics; catalog validation; settlement
exactly once; extended-time proportionality; the three endings reachable
under the live countdown (scripted fixtures). Shell: slot interaction and
reorder by keyboard and tap; command-button identity; rejection rendering
with slot highlight; comparison columns and trace skip; gating states and
confirmations; ending screens with readbacks and fresh-campaign offer;
keyboard-only and narrow passes.

## 10. Risks

The projections seam is the integration risk: it touches all three
mission modules; mitigated by building it against the walkthrough end
states of each mission with golden-value fixtures. The line catalog is
the voice risk: locked here so split 07 records against stable ids.
