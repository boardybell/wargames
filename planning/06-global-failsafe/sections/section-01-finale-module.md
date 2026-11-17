# Section 01: Finale Engine Module

Section id: `section-01-finale-module`. First section of split 06-global-failsafe,
the finale of SHALL WE PLAY A GAME?: GLOBAL FAILSAFE. This section builds the
engine-side finale mission module: state types and save schema, the case builder
with its corroboration rule, the shared-validator composition with structured
rejections, the REQUEST FIELD REPORT flow, the recognition state transition, the
commit settlement path with its race guard, the schedule with end-anchored
milestones, and module registration. No shell code, no projections, no endings
content, no line catalog; those are sections 02 through 04.

Runtime: typescript-npm. Test command: `npm test`. Engine tests run in the node
project (no jsdom needed for this section).

## What the finale is

WOPR prepares to repeat defense exercise D-83. The player has one countdown
(three minutes standard, six under extended time) to prove the false premise by
assembling a five-slot evidence case, run a zero-player comparison of three
futures against a snapshot, and commit to one of three orders. This section
delivers everything up to and including a valid case and a committed decision
settling the mission; what the branches project and what the ending screens say
land in later sections.

## Dependencies and prerequisites

Splits 01 through 05 are implemented, including engine amendments 7 through 12.
This section depends on no other section of this split. It blocks
section-02-projections-endings and section-04-screens-fixtures. It may be built
in parallel with section-03-joshua-catalog.

Binding contracts this section consumes from the engine (split 01, rev 2 plus
sections 15 to 17):

- `MissionModule` with `terminal()` returning `completed | collapsed` and the
  widened `SettlementCause`. The finale registers as a mission module for
  lifecycle purposes; its settlement outcomes are the three endings.
- The shared independence validator `isIndependentObservation` with reason
  codes; same-run derivatives are never independent.
- Case-file campaign state read through selectors: `cluesFound` via
  `clues()`/`clueRecords`, `inspectedRecords`, `sourceChecks` including entries
  with `arrivedAfterSettlement`. CHECK SOURCE is engine-owned.
- Emitted events including `finaleFinalPhase`; `emitted` is a closed union and
  this section adds NO new EngineEvent kinds.
- Seed-authored milestones; integer math throughout; mission substates are
  reference-only (the case file is campaign state, not finale substate).
- Engine amendment 9: end-anchored milestones anchor to `endsAt` and do not
  scale under extended time; start-anchored offsets do scale.
- Engine amendment 11: `endingId` (`'recovery' | 'containment' | 'failure'`)
  is carried on the finale `SettledOutcome`. Derivation of endingId and the
  earned-why readback live in `endings.ts` (section 02); this section's module
  provides the committed action and cause they derive from.
- Engine amendment 12: every seed designates one finale field-report record,
  OBSERVED and independent, whose authored wait is validator-bounded to
  finaleDuration minus a decision margin, so a request made at first legality
  still leaves room to validate and commit.

The snapshot for comparisons is taken at finale start by the engine lifecycle
and carried outside mission substate (engine-owned, consistent with the branch
machinery). This section triggers that snapshot on START through the existing
lifecycle; it does not implement projections over it.

## Directory layout for this section

    src/engine/missions/finale/
      types.ts          case slots, finale state + saveSchema
      module.ts         MissionModule (schedule, terminal(), evaluate)
      caseBuilder.ts    slot filling, ordering, validation glue (pure)
    test/engine/missions/finale/
      caseBuilder.test.ts
      fieldReport.test.ts
      recognition.test.ts
      settlement.test.ts
      schedule.test.ts

`projections.ts` and `endings.ts` belong to section 02; create nothing for them
here beyond the seams described below.

## Tests first

All engine tests run per seed on the standard fixture seed(s) used by splits 03
to 05, with the walkthrough campaign fixtures (healthy, capacity-constrained,
all-failed) where campaign state matters. Stubs say what to test, not how; use
the existing engine test-double and fixture helpers.

### caseBuilder.test.ts, slot filling and corroboration

- Every record from all three missions is available as a slot candidate
  regardless of mission outcomes (run against the all-failed campaign fixture
  as well as healthy).
- Records the player inspected during play are marked highlighted, driven by
  `inspectedRecords`.
- Corroboration rule for the observation slot: W02 unchecked lists as a
  candidate flagged UNVERIFIED and does not satisfy the slot; W02 with a
  CONFIRMED completed play-time source check qualifies; CONTRADICTED, PENDING,
  and UNKNOWN checks never qualify. Only corroborated candidates are
  attachable.
- Reorder applies only to the three subsystem slots (outlook, flights, bank);
  the root and observation slots expose no ordering.

### caseBuilder.test.ts, validation (the four requirements fixtures per seed)

- Correct case accepted: event-time order C17, F06, B04; root slot holds C17's
  exercise export; observation slot holds a corroborated independent OBSERVED
  record (W02 confirmed, or the field report). `caseValid` becomes true.
- Receipt-time-sorted ordering rejected with the receipt-order reason code.
- An on-time but unrelated source rejected with the unrelated-source reason.
- Missing or uncorroborated independent check rejected.
- Same-run derivatives never pass `isIndependentObservation` (derived-not-
  independent reason).
- Wrong root rejected; any empty slot rejects as incomplete.
- Every rejection carries `{ code, slot }`, leaves all slots editable, and
  permits unlimited further attempts under the clock. Assert the rejection
  codes are exactly the stable strings the Joshua catalog keys on (see
  Rejection codes below); section 03 owns the line text, this section owns the
  codes.

### fieldReport.test.ts

- REQUEST FIELD REPORT is legal only when no corroborated candidate exists;
  illegal (no-op with a structured refusal, not a crash) once one does.
- The request dispatches the engine desk check against the seed-designated
  finale field-report record; the reply joins the corroborated candidate list
  and satisfies the observation slot.
- Slack test: a request made at the first instant of legality resolves within
  the validator-bounded wait and still leaves room to validate and commit
  before `endsAt` (finaleDuration minus the decision margin).
- Available after any combination of mission failures (all-failed fixture).
- A reply that arrives post-settlement is recorded honestly with
  `arrivedAfterSettlement` so the ending screen (section 04) can render the
  pending line; assert the state, not the rendering.

### recognition.test.ts

- The recognition beat keys on the `caseValid` false-to-true finale state
  transition. Assert: the transition is observable exactly once per campaign
  (validate, fail, fix, validate again does not re-fire it; neither does a
  later re-validation after editing a valid case). No new EngineEvent kind
  exists; `emitted` remains the closed union.

### settlement.test.ts

- `committed` moves from null to `'staged' | 'hold' | 'repeat'` through the
  commit action; once set it never changes.
- Cause mapping: staged and hold commits settle with cause `completed`; a
  repeat commit settles `collapsed`; timeout settles `collapsed`; forfeit
  settles `collapsed` (evaluate maps timeout and forfeit to the repeated-order
  path).
- Settlement exactly once: no second settlement from any later wake, action,
  or duplicate commit.
- Commit-vs-timeout race fixture: COMMIT settles synchronously, `terminal()`
  returns non-null the instant `committed` is set, in the same reduce; a
  timeout arriving in the same wake cannot override a committed recovery.
  Drive both orderings through the test-double and assert the committed
  outcome wins.
- `comparisonsRun` is display-only state; incrementing it causes no settlement
  or substate mutation side effects.
- Save/load round trip: `FinaleState` survives the saveSchema unchanged,
  including `lastRejection` and `fieldReportRequested`.

### schedule.test.ts

- Standard duration three minutes; extended six. Start-anchored authored
  offsets scale proportionally under extended time.
- End-anchored milestones (the 30 and 10 second warnings and
  `finaleFinalPhase` at its authored near-end offset) anchor to `endsAt` and
  do NOT scale (amendment 9 carve-out test).
- `finaleFinalPhase` emits exactly once at its scheduled wake.
- Module registration: the finale registers in the mission registry as row 4,
  unlocked when all three debriefs are acknowledged regardless of outcomes
  (the existing engine unlock selector); START materializes the schedule and
  triggers the engine-owned campaign snapshot.

## Implementation

### types.ts

The finale state, verbatim from the plan:

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

Plus the saveSchema entry following the pattern the other mission modules use.
Substate is reference-only: the case file (records, checks, clues, highlights)
is campaign state read through selectors and is never copied into
`FinaleState`. The comparison snapshot lives outside mission substate entirely
(engine-owned); nothing in `types.ts` references it.

Also define here the slot union (`'outlook' | 'flights' | 'bank' | 'root' |
'observation'`) and the rejection-code union so caseBuilder, module, catalog
(section 03), and screens (section 04) share one source of truth.

### Rejection codes

Five stable codes, one per Joshua rejection line family:

- `receipt-order` (the inbox illusion: sorted by receipt time, not event time)
- `unrelated-source` (on time but about something else)
- `derived-not-independent` (same-run derivative offered as observation)
- `wrong-root` (root slot is not the actual parent-chain root, C17's exercise
  export)
- `incomplete` (any slot empty)

`{ code, slot }` is the whole rejection payload; the slot names which slot to
highlight. Section 03 maps each code to an authored line; section 04 renders
the highlight.

### caseBuilder.ts (pure)

Pure functions over campaign selectors and `FinaleState`. Responsibilities:

- Candidate listing per slot from the case-file selector. All records from all
  three missions are candidates whatever the mission outcomes. Inspected
  records carry a highlight flag from `inspectedRecords`.
- Corroboration for the observation slot: a candidate qualifies only if it is
  an independent OBSERVED record with a CONFIRMED completed source check from
  play, or it is the finale field report (itself a desk-check product).
  Uncorroborated independent records list with an UNVERIFIED flag and are not
  attachable. CONTRADICTED, PENDING, UNKNOWN never qualify.
- Ordering: the player's event-time ordering applies to the three subsystem
  slots only.
- `validate(state, selectors)`: the shared validator composition. Event-time
  ordering of the three subsystem slots must match true event times; the root
  slot must be the actual parent-chain root; the observation slot must pass
  `isIndependentObservation` against the seed's run; every slot filled.
  Returns either valid or the first applicable `{ code, slot }`. Unlimited
  attempts; validation never mutates slots.

Suggested signatures (stubs; bodies are the implementer's):

    function listCandidates(slot: FinaleSlot, campaign: CampaignSelectors):
      Array<{ recordId: string; highlighted: boolean;
              unverified?: boolean; attachable: boolean }>

    function validateCase(state: FinaleState, campaign: CampaignSelectors):
      { ok: true } | { ok: false; code: RejectionCode; slot: FinaleSlot }

    function fieldReportLegal(state: FinaleState,
      campaign: CampaignSelectors): boolean

### module.ts

The `MissionModule` implementation:

- Registration as row 4, GLOBAL FAILSAFE, gated by the all-debriefs-
  acknowledged unlock selector. START materializes the schedule and triggers
  the engine-owned campaign snapshot through the existing lifecycle hook.
- Schedule: three minutes standard, six extended. Start-anchored offsets
  scale; the 30 and 10 second warnings and `finaleFinalPhase` are end-anchored
  to `endsAt` per amendment 9 and never scale.
- Actions reduced here: slot select and clear, reorder, VALIDATE (delegates to
  caseBuilder, writes `caseValid` and `lastRejection`), REQUEST FIELD REPORT
  (legality check, dispatch the engine desk check against the seed-designated
  record, set `fieldReportRequested`), RUN COMPARISON bookkeeping
  (`comparisonsRun` increment only; branch execution is section 02's seam),
  COMMIT per choice.
- The recognition beat is a state-key mechanism: the `caseValid`
  false-to-true transition is the observable key the line selectors (section
  03) and shell (section 04) consume. Track whether it has fired so it fires
  exactly once; emit no new EngineEvent.
- Settlement: COMMIT sets `committed` and settles synchronously in the same
  reduce; `terminal()` returns `completed` for staged and hold, `collapsed`
  for repeat; `evaluate` maps timeout and forfeit causes to the collapsed,
  repeated-order path. `endingId` attachment on `SettledOutcome` is wired in
  section 02's `endings.ts`; leave the derivation call site as a clearly named
  seam (a single function import that section 02 fills) so this section's
  tests can assert cause mapping without ending content.
- Gating knowledge kept honest: the module exposes whether a staged commit is
  currently permitted (`caseValid` AND the engine viability result passes),
  but the viability computation itself is split 01 branch machinery read
  through a selector; do not reimplement it here. HOLD is always permitted;
  REPEAT is always permitted (the confirmation dialog is shell-side,
  section 04).
- The finale pause-overlay End Mission confirmation copy (forfeit yields the
  repeated-order ending) is shell content; this module only guarantees the
  forfeit cause mapping that makes the copy true.

## Seams left for later sections

- `projections.ts` and `endings.ts` (section 02): module.ts imports an ending
  derivation hook and the branch projection entry point as named seams; this
  section stubs them minimally (typed, throwing or inert) so its own tests run
  without section 02.
- Joshua lines (section 03): this section emits only stable rejection codes
  and the recognition state key; no text.
- Screens, verbs, glossary, and the full fixture matrix including the three
  ending-reachability scripted fixtures (section 04).

## Done when

`npm test` passes for the five new engine test files on every fixture seed:
the four requirements validation fixtures accept and reject correctly with
stable `{ code, slot }` payloads, corroboration and UNVERIFIED flagging behave
per the rule, the field report is legal only when needed and resolves inside
the bounded wait with commit slack, recognition fires exactly once with no new
event kind, settlement maps causes correctly and exactly once with the
commit-vs-timeout race decided for the commit, and the schedule scales
start-anchored offsets while holding the warnings and `finaleFinalPhase` to
`endsAt`.