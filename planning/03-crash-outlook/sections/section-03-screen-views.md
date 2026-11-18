# Section 03: Screen Views (src/app/missions/outlook/)

## Objective

Build the shell-side mission screen set for CRASH OUTLOOK, mission id `outlook`: the OutlookScreen registration, four views (inbox, message detail, outbox, delivery log), TRACE and CHECK SOURCE flows, ActionBar wiring with inline disabled reasons, StatusLine readouts, verb and glossary registrations, the briefing art slot, and cue and announcement wiring driven entirely by engine-emitted events.

## Background You Need

The game is a React/Vite static site. A headless deterministic engine (`src/engine/`, built in an earlier split) owns all state. Missions are pure MissionModule implementations; `dispatch` returns `{ state, emitted: EngineEvent[] }`. The shell (`src/app/`, also prior work) provides:

- A screen registry keyed by mission id. OutlookScreen registers under `outlook`.
- Terminal primitives: `TerminalText`, `MenuRows`, `StatusLine`, `ActionBar`, `DetailPane`, `CommandInput` with a pinned verb-first grammar and per-screen verb registration.
- Glossary term registration (global terms already exist; screens may register local terms).
- Art slots; this mission uses `briefing-outlook` to frame the mission start text.
- Audio cue hooks and accessibility services including a polite live region for announcements.

The engine-side outlook module (section-01-module-rules, a hard dependency of this section) provides the mission state (`OutlookState` with read/flag marks, `queue`, `sends`, `primaryStage` 0/1/2, `backupRemaining`, `deliveredRequired`), the channel rules, and the actions this screen dispatches. Key engine contracts this screen consumes but does not own:

- READ, FLAG, QUEUE, SEND are mission actions validated by the engine; the engine validator is the single source of truth for what is currently legal.
- QUEUE stores `(messageId, channel)` only; stage, capacity, and ETA are evaluated at dispatch time. Queueing is always safe. Dispatching to a dark primary rejects with a reason, costs nothing, and leaves the item queued.
- Primary channel: unlimited send count while not dark; stage-dependent ETA. Backup channel: hard five-send capacity.
- Stage changes, acknowledgments, and the 30 and 10 second warnings arrive as engine milestone events (`scheduledEventFired` and acknowledgment events). The screen never runs local timers for any of this.
- CHECK SOURCE is engine-owned: the screen renders the control and the results, but the action is `REQUEST_SOURCE_CHECK` on the campaign queue; replies arrive as `sourceCheckResolved` emitted events (`arrivedAfterSettlement` supported). Authored outcomes live in the shared SeedDefinition deskChecks table; the screen draws no randomness and reads no outcome table directly.
- TRACE dispatches `INSPECT_RECORD` so inspected records highlight in the finale case file.
- Reading the audit message triggers clue emission engine-side (`clueFound`); the screen does nothing special beyond dispatching READ.

Authored message bodies live exclusively in the immutable seed payload (`SeedDefinition.missionPayloads.outlook`); mission substate is reference-only (ids, marks, send records). The screen reads bodies from the payload and marks from state.

Style constraints for all rendered copy: uppercase terminal diction, no em-dashes.

## Files to Create

    src/app/missions/outlook/
      OutlookScreen.tsx     mission screen: view switching, command registration,
                            screen-registry registration for mission id 'outlook'
      InboxView.tsx         list with sender, subject, receipt time, flag marks
      MessageView.tsx       detail: body lines, TRACE, CHECK SOURCE, actions
      OutboxView.tsx        queue contents, channel capacity and ETA readouts
      DeliveryLogView.tsx   send records, acknowledgments, failures
      verbs.ts              READ/FLAG/QUEUE/SEND/TRACE/CHECK SOURCE registrations
      glossary.ts           local jargon registrations (CHANNEL, CAPACITY, ETA,
                            DELIVERY RECEIPT, EXERCISE BULLETIN)
    test/app/missions/outlook/
      navigation.test.tsx
      actions.test.tsx
      trace-checksource.test.tsx
      status-announce.test.tsx
      glossary.test.tsx

Test file grouping may vary; the coverage below is what matters. All screen tests run in the app jsdom Vitest project with the real engine and the real outlook module loaded with the fixture seed (the fixture seed embeds record C17, EXERCISE provenance, run R04, event 21:14:00, receipt 21:14:05).

## Tests First (TDD block 5)

Write these as failing tests before implementing. Stubs describe what to assert, not how.

Navigation (navigation.test.tsx):

- All four views reachable: INBOX, OUTBOX, and LOG are registered view commands; typing each command switches the view; message detail opens from inbox list selection.
- Desktop shows persistent tabs for the three list views and renders inbox beside detail (two panes).
- Narrow viewport: router state asserts single-pane; opening a message replaces the list; a back affordance returns to the list. Assert on router/view state, not pixel layout.
- Mobile keyboard-only pass: one full delivery flow (navigate inbox, open message, QUEUE, switch to OUTBOX, SEND, confirm the log entry) completed entirely via keyboard. (This pass is re-run as an acceptance anchor in section-04; land the first version here.)

Actions and ActionBar (actions.test.tsx):

- Command-button identity for every verb: for READ, FLAG, QUEUE, SEND, TRACE, CHECK SOURCE, the action produced by parsing the typed command strict-equals the action the corresponding ActionBar button dispatches.
- ActionBar exposes only currently valid actions as enabled; invalid sends render disabled with the rejection reason inline (visible without attempting the action). Cover both reasons: backup capacity exhausted (drive backupRemaining to zero through real SENDs) and dark primary (advance the engine clock past the stage-2 milestone).
- FLAG toggles the flag mark shown in the inbox list row.

TRACE and CHECK SOURCE (trace-checksource.test.tsx):

- TRACE on a message with a recordId dispatches `INSPECT_RECORD` for that record and renders the record through the shared record-detail affordances.
- CHECK SOURCE dispatches `REQUEST_SOURCE_CHECK`; the pending state renders; the result renders from the `sourceCheckResolved` emitted event, never from local computation.
- CONTRADICTED on the bulletin and CONFIRMED on the weather correction render distinctly (distinct text or marker, not color alone).
- A `sourceCheckResolved` event with `arrivedAfterSettlement` set still renders without crashing.

StatusLine and announcements (status-announce.test.tsx):

- StatusLine shows primary stage, backup remaining, and next ETA, read from engine-state selectors only; after a real SEND, backup remaining decrements in the readout; after a stage milestone fires, the stage readout and primary ETA update.
- Stage-change warning lines surface through the polite live region when the engine emits the stage `scheduledEventFired` events; the stage-2 (dark) warning states backup remains usable to the deadline.
- 30 and 10 second warnings announce when the engine milestones fire and ONLY then: assert no `setTimeout`/`setInterval`-driven announcement by advancing jsdom fake timers without advancing the engine clock and observing silence.
- Delivery acknowledgments announce through the polite region from emitted events.
- Falling-tone cue hook fires on stage-change events (assert the cue hook invocation, mock the audio layer).

Glossary (glossary.test.tsx):

- OBSERVED, EXERCISE, and DERIVED terms open the global glossary entries from within TRACE/CHECK SOURCE result rendering (these are globally registered; the mission must not re-register them).
- Local terms CHANNEL, CAPACITY, ETA, DELIVERY RECEIPT, EXERCISE BULLETIN are registered without collision and open from StatusLine/OutboxView copy.

## Implementation Details

### OutlookScreen.tsx

Registers with the shell screen registry for mission id `outlook`. On mount, registers the mission verbs from `verbs.ts` with the per-screen verb registration and the local glossary terms from `glossary.ts`; both unregister on unmount. Holds the current view (`inbox` default, `outbox`, `log`, plus a selected-message detail state) and the selected message id. The briefing still renders through art slot `briefing-outlook` framing the mission start text.

Layout: desktop renders inbox beside detail in two panes with persistent INBOX/OUTBOX/LOG tabs; mobile renders single-pane with back affordances. Use whatever responsive mechanism the shell established in split 02; the tests assert on router/view state, so keep view state inspectable.

Subscribes to engine-emitted events and routes them: stage `scheduledEventFired` events to the polite live region and the falling-tone cue hook; the 30 and 10 second warning milestones to the live region; acknowledgment events to the live region and the delivery log; `sourceCheckResolved` to the MessageView result area. No local timers anywhere in this directory.

### InboxView.tsx

MenuRows list of the twelve messages: sender authority line, subject, receipt time, flag mark. Selection opens MessageView for that id. Read bodies come from the seed payload; read/flag marks from mission state. Flagged rows show the mark.

### MessageView.tsx

Detail pane for the selected message: body lines via TerminalText, plus actions. Opening a message dispatches READ (first READ of the audit message triggers the engine-side clue; the view does nothing extra). Actions rendered through ActionBar: FLAG, QUEUE (to primary or backup), SEND, TRACE (when recordId is non-null), CHECK SOURCE (when recordId is non-null). TRACE dispatches `INSPECT_RECORD` and renders through the shared record-detail affordances with glossary terms OBSERVED, EXERCISE, DERIVED active. CHECK SOURCE dispatches `REQUEST_SOURCE_CHECK`, shows a pending line, and renders the reply from the `sourceCheckResolved` event; CONFIRMED and CONTRADICTED results are visually and textually distinct. Recipient hints on stale duplicates are authored to mislead; the view renders them verbatim with no corrective styling.

### OutboxView.tsx

Queue contents (message, target channel, position), channel readouts: primary stage with its current-stage ETA (or DARK), backup remaining count and backup ETA. SEND from the queue dispatches the engine SEND action; a rejection (dark primary) renders its reason and the item stays queued, matching the engine contract. ETA figures come from engine selectors over the authored tuning, never computed locally.

### DeliveryLogView.tsx

Chronological send records: dispatch time, channel, acknowledgment time or pending, failures with reasons. Pure render over `sends` in mission state.

### verbs.ts

Registers READ, FLAG, QUEUE, SEND, TRACE, CHECK SOURCE with the CommandInput verb-first grammar, plus the INBOX, OUTBOX, LOG view commands. Each verb parser must produce the exact same action object the matching ActionBar button dispatches; factor action construction into shared helpers so the identity tests pass by construction. Export something like:

    export function registerOutlookVerbs(registry: VerbRegistry, ctx: OutlookScreenContext): Unregister
    // builds actions via the same makeReadAction / makeSendAction / ... helpers
    // the ActionBar buttons use

### glossary.ts

Registers only the five local terms: CHANNEL, CAPACITY, ETA, DELIVERY RECEIPT, EXERCISE BULLETIN. Definitions in plain language for a smart layperson, uppercase terminal diction in rendered labels. Do NOT register OBSERVED, EXERCISE, or DERIVED; those are global.

### ActionBar discipline

The engine validator is the truth. Buttons for currently invalid actions render disabled with the rejection reason inline next to or inside the button, visible before any attempt. Reasons come from the engine's validation output (backup exhausted, dark primary), not duplicated client-side logic; if the shell validator API returns a reason string, render it verbatim.

### StatusLine

Shows primary stage (FULL / SLOWED / DARK), backup remaining, next ETA. All three from selectors over engine state. Updates are reactive to dispatch results and emitted events; no polling.

## Dependencies

- section-01-module-rules must be complete: this screen dispatches its actions and renders its state, and the tests drive the real module through the real engine with the fixture seed.
- Prior splits 01 (engine) and 02 (shell primitives, screen registry, glossary, art slots, cue hooks, live region) are prerequisites of the whole plan and are assumed present.
- section-02-content-seeds is NOT required: the fixture seed payload shipped with section-01's test fixtures is enough for these tests. Do not duplicate or author seed content here.
- section-04-fixtures-polish will re-run the keyboard-only and narrow-width passes as acceptance anchors; build them honestly here.

## Definition of Done

All tests in `test/app/missions/outlook/` pass in the jsdom project via `npm test`. Four views reachable by command and by tab/selection on desktop, single-pane with back on mobile. Every verb has command-button identity. TRACE and CHECK SOURCE flow through `INSPECT_RECORD` and `REQUEST_SOURCE_CHECK` with results rendered from emitted events. Disabled sends show inline reasons. StatusLine, announcements, and cues are driven exclusively by engine state and engine milestones. Glossary terms open correctly with no duplicate registrations. All copy uppercase terminal diction with no em-dashes.
## Implementation notes (as built)

Files: src/app/missions/outlook/{OutlookScreen,InboxView,MessageView,OutboxView}.tsx,
{verbs,selectors,glossary}.ts; shell extensions src/app/terminal/{commandGrammar,
ActionBar}.ts, src/app/screens/{ScreenRouter,screenUiCommands(new)}.ts, state
barrel getContext re-export; tests under test/app/missions/outlook/. App project
311 tests; full suite green; tsc + eslint clean.

CHECK SOURCE stays engine-owned (the screen reads engine-resolved state.sourceChecks
/ campaignQueue and renders arrivedAfterSettlement, never computes a verdict);
disabled action reasons come straight from the module validate(). Code-review
fixes applied before commit: removed the screen's private command form (it
collided with the shell's shared CommandInput through ScreenRouter) and wired the
INBOX/OUTBOX/LOG/BACK view commands through a new mission-scoped SCREEN UI command
(LocalUiCommand variant + per-screen UI-handler registry); replaced the SEND
button's hidden auto-route-to-correct-recipient with a real desk picker so a wrong
route is clickable and the mission cannot be won without reading the evidence
(test-proven); added a visible role=timer countdown driven by the display clock;
sourced the inbox receipt time from the record's real receiptTime; typed the
payload as OutlookPayload | undefined; keyed the ack-announce dedupe on a stable
send identity; and dropped the global data-action attribute from the shared ActionBar.
