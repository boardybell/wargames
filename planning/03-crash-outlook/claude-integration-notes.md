# Integration Notes: Opus review of 03-crash-outlook plan

All 14 findings plus the smaller notes integrated; none rejected. Finding 2
produces one further engine-contract amendment (applied to split 01's plan
and section files, dated 2026-11-17, second amendment block):

Engine amendment (finding 2): MissionModule gains an optional pure selector
clues(state: S): ClueId[]. After every mission reduce, the engine lifecycle
polls it and monotonically merges new ids into CampaignState.cluesFound,
emitting a clueFound EngineEvent per new id. Reading the audit message
therefore logs the clue immediately, surviving failed missions, with
reducers staying pure and campaign state engine-owned. clueFound joins the
EngineEvent union (section-05-campaign and section-10 import surface).

Plan integrations:
1. CHECK SOURCE corrected to engine ownership: the mission renders the
   control and results only; REQUEST_SOURCE_CHECK dispatches to the
   campaign queue; outcomes live in the shared SeedDefinition deskChecks
   table keyed by record id; the outlook payload references record ids and
   the duplicated per-message desk-check field is deleted; results arrive
   via sourceCheckResolved emitted events.
3. TRACE flow dispatches INSPECT_RECORD; tested.
4. Tie-break pinned: acks with scheduledAt <= endsAt drain before the
   timeout guard in the same advanceToNow, so all-three-at-the-buzzer
   settles as completed; boundary fixture added.
5. QUEUE pinned: stores (messageId, channel); stage, capacity, and ETA
   evaluated at dispatch; dispatch to dark primary rejects with reason at
   zero cost and the item stays queued; test added.
6. Primary model pinned: unlimited send count while not dark; scarcity
   comes from stage-dependent ETA against the deadline plus backup's hard
   capacity of five. Content-validator invariants added: per seed, the
   adversarial send-everything fixture fails and the walkthrough reaches
   tier 3 with margin.
7. Validator invariant added: exactly one non-superseded message with
   non-null correctRecipient per requiredKind; duplicates superseded.
8. Clock pinned: mission ends at endsAt or early completion; dark primary
   is a stage; backup lives to the deadline; the stage-2 warning line tells
   the player backup remains.
9. Substate is reference-only (ids, marks, send records); authored bodies
   stay in the seed payload.
11. Two separate validator assertions: audit record id carries the R04
    export reference; bulletin TRACE reaches C17.
12. Navigation pinned: INBOX, OUTBOX, LOG as shell-registered view commands
    plus persistent desktop tabs and mobile back affordances.
14. Invalid sends render disabled with the reason inline.
Smaller notes: misleading-hint authoring note added; global glossary terms
consumed (only channel jargon registered locally); fc.commands claim scoped
to mission-local property tests; extended-time proportional stage test
added.
