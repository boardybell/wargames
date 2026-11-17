# Section 04: Screens and Fixtures

Finale shell for 06-global-failsafe: the FinaleScreen layout and its three views, the ending screen, verbs and glossary, countdown chrome wiring, plus the full integration fixture matrix that proves the finale end to end. This is the last section of the split; it lands after the engine module, the projections and endings, and the Joshua catalog, and it stitches them into playable screens.

## Dependencies

- section-01-finale-module: `src/engine/missions/finale/` module, FinaleState, case builder, VALIDATE composition, REQUEST FIELD REPORT, synchronous commit settlement, schedule with end-anchored warnings. This section consumes its selectors and verbs surface; do not reimplement any validation here.
- section-02-projections-endings: `projections.ts` (pure transforms over `selectSettledMetrics` plus the exception selector, authored BranchStep traces, the single viability computation) and `endings.ts` (endingId, earned-why readback). This section renders those results; it never computes them.
- section-03-joshua-catalog: `src/engine/joshua/lines.ts` and `selectors.ts`. The shell renders a Joshua line only when the catalog resolves a key; a missing key renders nothing and logs nothing in production (graceful absence).

Prerequisites from earlier splits, available and binding: shell primitives from split 02 rev 2 (`playBranchTrace`, cabinet red alarm on `finaleFinalPhase`, native dialogs, CharacterGrid, the verb system, the global glossary, voice cues via the audio engine) and the art slots `failsafe-wall`, `countdown-insert`, `hero-return`, `ending-recovery`, `ending-containment`, `ending-failure`. Engine amendments 7 through 12 are implemented (terminal(), clueRecords, end-anchored milestones, settled-metrics projections, endingId, finale field-report designation).

## Background: the finale in one paragraph

The player builds a five-slot case proving D-83 caused everything: three subsystem slots (outlook, flights, bank) ordered by true event time, a root slot (the actual parent chain root), and an observation slot that requires CORROBORATION (an independent OBSERVED record with a CONFIRMED completed source check from play, or the finale field report). VALIDATE runs the shared validator composition and returns `{ code, slot }` rejections mapped to Joshua lines, unlimited attempts under the clock. RUN COMPARISON (requires `caseValid`) executes three branches as pure transforms over the engine's finale-start snapshot and renders three columns of PROJECTION-badged figures with authored step traces. The player commits one of three orders: STAGED RECOVERY (gated by caseValid AND viability), HOLD AND VERIFY (always enabled), REPEAT D-83 (confirmation quoting its projection). Timeout and forfeit resolve as the repeated order. Endings carry endingId `recovery`, `containment`, or `failure`; STAGED and HOLD settle `completed`, the rest `collapsed`. Standard duration three minutes, extended six.

Finale state the screens read (owned by section 01, shown for reference):

    interface FinaleState {
      slots: { outlook: string | null; flights: string | null;
               bank: string | null; root: string | null;
               observation: string | null }
      ordering: string[]
      caseValid: boolean
      lastRejection: { code: string; slot: string } | null
      comparisonsRun: number
      fieldReportRequested: boolean
      committed: 'staged' | 'hold' | 'repeat' | null
    }

Dual-state model the shell must respect: the live case file keeps updating after START (a late field report joins it); the branch baseline stays frozen at finale start; they never need to agree, and the UI must not imply they do.

## Files

Create:

    src/app/missions/finale/
      FinaleScreen.tsx      layout: incident log, shortlist, deadline reach
      CaseBuilderView.tsx   five slots, reorder controls, VALIDATE
      ComparisonView.tsx    three columns, playBranchTrace integration
      DecisionView.tsx      three commits, gating, confirmations
      EndingScreen.tsx      outcome, earned-why readback, final line,
                            fresh-campaign offer
      verbs.ts              SELECT/ORDER/VALIDATE/REQUEST FIELD REPORT/
                            RUN COMPARISON/COMMIT verbs + views
      glossary.ts           CASE, ROOT SOURCE, PROJECTION,
                            VIABILITY THRESHOLD
    test/app/missions/finale/
      (screen tests, jsdom, real engine + real mission modules on the
       fixture seed)
    test/engine/missions/finale/
      (the fixture matrix tests listed below that run without a DOM)

## Tests first

Screen tests run in jsdom with the real engine and real mission modules on the fixture seed. No mocked engine. Fixture-matrix tests that need no DOM live in the node project. Stubs say what to test, not how.

### Screen tests (TDD block 8)

CaseBuilderView:

- Slot interaction by keyboard and by tap: SELECT a record, target a slot, both paths produce identical state.
- Reorder controls exist on the three subsystem slots only; the root and observation slots expose none. MOVE <record> UP/DOWN commands and the arrow-button equivalents produce identical orderings.
- Command-button identity for every verb: each typed command and its on-screen button dispatch the same action and land in the same state.
- Rejection rendering: a failed VALIDATE highlights the failing slot named in `lastRejection.slot` and renders the Joshua rejection line resolved from `lastRejection.code`; slots remain editable; a second attempt is accepted when corrected.
- UNVERIFIED flags render on uncorroborated independent candidates (the W02-unchecked case); flagged candidates are not attachable to the observation slot; a corroborated candidate is.
- Inspected-during-play records render highlighted (from `inspectedRecords`).
- REQUEST FIELD REPORT button and command appear only when legal (no corroborated candidate exists); after the reply arrives the candidate joins the list and the control retires.

FinaleScreen and views:

- Briefing renders the `failsafe-wall` art slot and the START control; the three-view layout appears only after START.
- CASE, COMPARISON, DECISION commands switch views; tabs do the same; mobile back affordances return; the active-view toggle persists across navigation away and back.
- Countdown chrome stays in reach in all three views; `finaleFinalPhase` drives the red alarm and relay-pulse cue; warnings are end-anchored, never scaled (assert against the extended-time fixture below).
- Recognition beat: the caseValid false-to-true transition renders the Joshua line and fires the voice cue exactly once; re-validating an already-valid case does not repeat it.

ComparisonView:

- RUN COMPARISON disabled until `caseValid`; enabled after.
- Three columns render (stacked at narrow widths); every figure carries the PROJECTION badge.
- Step traces play through `playBranchTrace`; SKIP works; traces are instant under reduced motion; results remain fully readable after skip.
- The STAGED column's figures strict-equal the values the DecisionView viability panel shows (one computation rendered twice; consistency assertion at the DOM level).
- Dual-state: a field report arriving after comparison updates the live case file list but no column figure changes (frozen baseline).

DecisionView:

- Gating: STAGED RECOVERY enabled iff caseValid AND viability passes, with per-threshold pass/fail rendered beside the control; HOLD AND VERIFY always enabled; REPEAT D-83 enabled behind confirmation.
- Each commit raises a native confirmation dialog; REPEAT's dialog quotes its own projection figures; cancel leaves state untouched; confirm settles.
- The finale pause-overlay End Mission confirmation names the repeated-order consequence in plain text.

EndingScreen:

- Renders outcome, the earned-why readback (named settled outcomes from `selectSettledMetrics`, the evidence proved, projected vs stated), the final Joshua line with voice cue, the correct ending art slot per endingId, the ending cue, and the fresh-campaign offer wired to the New Campaign flow.
- A field-report reply that arrives post-settlement renders honestly as the pending line on the ending screen.

Accessibility passes:

- Keyboard-only pass: build the case, reorder, validate, run comparison, skip the trace, commit, reach the ending screen without a pointer.
- Narrow pass: the same journey at a narrow viewport with stacked columns and back affordances.
- Glossary terms (CASE, ROOT SOURCE, PROJECTION, VIABILITY THRESHOLD) are active wherever they appear.

### Fixture matrix (TDD block 9 plus the remaining block 4 to 6 fixtures)

These are the integration fixtures this section owns. Engine-unit variants live in sections 01 and 02; here they run end to end, through the screens where a screen is involved.

- The four requirements validator fixtures per seed, driven through CaseBuilderView: correct C17-F06-B04 event-time case accepted; receipt-time-sorted ordering rejected with the receipt-order reason; on-time unrelated source rejected; missing or uncorroborated independent check rejected; same-run derivatives never independent. Each rejection renders the right Joshua line and highlights the right slot.
- Corroboration rule through the UI: W02 unchecked lists UNVERIFIED and fails the slot; W02 with a CONFIRMED play-time check qualifies; CONTRADICTED, PENDING, and UNKNOWN never qualify.
- Field-report slack fixture: a request made at first legality still leaves room to validate and commit before the deadline (the authored wait is validator-bounded to finaleDuration minus a decision margin); a scripted late-arrival variant settles first and shows the pending line on the ending screen.
- Three ending-reachability fixtures, scripted, under the live countdown: one playthrough per endingId reaching recovery, containment, and failure, each asserting the SettledOutcome cause (completed, completed, collapsed) and the correct ending screen.
- Viability gating across the three campaign fixtures from section 02 (healthy, capacity-constrained, all-failed): different choice sets render; the all-failed fixture still reaches containment and failure, and STAGED stays disabled with its failing thresholds shown.
- Commit-vs-timeout race fixture: COMMIT settles synchronously in its own reduce (terminal() non-null the instant committed is set); a same-wake timeout cannot override a committed recovery; settlement exactly once.
- Extended-time carve-out (amendment 9): with the six-minute setting, start-anchored offsets scale; the 30 and 10 second warnings and `finaleFinalPhase` anchor to endsAt and do not scale.
- Settlement permanence: the finale joins the campaign record; the fresh-campaign offer resets via NEW_CAMPAIGN and nothing else does.
- Determinism at the UI boundary: running the comparison twice renders strictly equal figures; the frozen baseline and live state are untouched by either run.

## Implementation

### FinaleScreen.tsx

Briefing state first: `failsafe-wall` art, mission brief text, START control. START triggers the engine lifecycle (the engine takes the comparison snapshot at finale start; the shell never touches it). After START, the three-view layout: incident log (the case file list from campaign selectors, inspected records highlighted), evidence shortlist (the five slots, summarized), and the deadline always in reach as countdown chrome with the `countdown-insert` art slot. `finaleFinalPhase` from the engine event stream drives the cabinet red alarm and the relay-pulse cue through the split 02 primitives; the screen adds nothing of its own to timing. View switching by CASE, COMPARISON, DECISION commands, tabs, and mobile back affordances; persist the active-view toggle. Joshua lines render through TerminalText via the catalog selectors with authored `pauseBeforeMs` honored, pauses suppressed near urgent status changes; the caption line and announcer consume the same text; caption always equals display text.

Per the global Web UI rules, the screen restores its last state on return navigation: active view, slot contents, and the last comparison results reappear rather than an empty state, with the normal path to recompute.

### CaseBuilderView.tsx

Five slots rendered from FinaleState. Every record from all three missions is available regardless of mission outcomes. The observation slot lists corroborated candidates as attachable and uncorroborated independent candidates flagged UNVERIFIED and not attachable. Reorder controls (MOVE UP/DOWN buttons plus the typed commands) on the three subsystem slots only. VALIDATE dispatches the engine verb; on rejection, highlight `lastRejection.slot` and render the Joshua line for `lastRejection.code`; slots stay editable. REQUEST FIELD REPORT renders only while legal and shows a dispatched/pending status after use. All interactions are duplicated as commands and buttons with identical dispatch paths; this is what the command-button identity tests pin.

### ComparisonView.tsx

RUN COMPARISON (gated on caseValid) asks the engine for the three branch results; the view renders three columns, stacked at narrow widths, every figure marked PROJECTION. Step traces are the authored BranchStep sequences from section 02 played through `playBranchTrace`: skippable, instant under reduced motion, results readable after skip. The STAGED column renders the same computed values the viability panel uses; the view receives one result object, not two computations. `comparisonsRun` is display only.

### DecisionView.tsx

Three commit controls with gating states rendered plainly: STAGED RECOVERY shows the per-threshold pass/fail list beside the control and disables until caseValid AND viability pass; HOLD AND VERIFY always enabled; REPEAT D-83 always enabled behind its confirmation. Confirmations use native dialogs; REPEAT's quotes its projection figures. Confirm dispatches COMMIT; the engine settles synchronously. The pause-overlay End Mission confirmation for the finale carries the repeated-order consequence text.

### EndingScreen.tsx

Reads the finale SettledOutcome. Renders: the outcome per endingId with its art slot (`ending-recovery` with `hero-return` where the layout calls for it, `ending-containment`, `ending-failure`), the earned-why readback from endings.ts verbatim, the final Joshua line with its voice cue, the ending audio cue, the pending field-report line when applicable, and the fresh-campaign offer through the New Campaign flow. The containment ending names its unresolved problems from real campaign state as supplied by endings.ts; the screen does not synthesize text.

### verbs.ts

Registers SELECT, ORDER (MOVE UP/DOWN), VALIDATE, REQUEST FIELD REPORT, RUN COMPARISON, COMMIT, plus the CASE, COMPARISON, DECISION view commands, into the split 02 verb system. Each verb maps one to one onto an engine action or a view switch; no shell-side logic beyond argument parsing. Stub shape:

    export const finaleVerbs: VerbRegistration[]
    // each entry: { verb, parse(args), dispatch(engine, parsed), view? }

### glossary.ts

Local glossary entries for CASE, ROOT SOURCE, PROJECTION, VIABILITY THRESHOLD, registered into the global glossary so hover and focus definitions work anywhere the terms render. Plain-language definitions for a smart layperson, one glossary for the project, Escape closes, tap-friendly.

## Acceptance

All screen tests and the full fixture matrix green under `npm test`. The three endings each reachable in a scripted run under the live countdown. Keyboard-only and narrow passes complete the whole journey. No em-dash appears in any rendered line. Verify the screens render in a browser before calling this done.