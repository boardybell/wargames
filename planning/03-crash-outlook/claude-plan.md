# Implementation Plan: 03-crash-outlook

Mission 1 of SHALL WE PLAY A GAME?: CRASH OUTLOOK, an inbox triage puzzle
under a real-time deadline. Self-contained prose for an implementer with no
prior context; code appears only as types, signatures, and trees.

## 1. Context

The game is a React/Vite static site. A headless deterministic engine
(src/engine/, split 01) owns all state: missions plug in as pure
MissionModule implementations (init, schedule, validate, reduce, evaluate,
debrief, saveSchema) receiving seed payloads and folded consequences, never
touching wall clock or RNG directly; dispatch returns { state, emitted:
EngineEvent[] }; timer milestones are seed-authored scheduled events; all sim
quantities are integers. The shell (src/app/, split 02) provides screen
registration keyed by mission id, terminal primitives (TerminalText,
MenuRows, StatusLine, ActionBar, DetailPane, CommandInput with a pinned
verb-first grammar and per-screen verb registration), glossary term
registration, art slot briefing-outlook, audio cue hooks, and accessibility
services. Authored content lives in SeedDefinition.missionPayloads.outlook
per seed (three curated seeds; the fixture seed embeds record C17, EXERCISE,
run R04, event 21:14:00, receipt 21:14:05).

This split delivers: the outlook mission module (engine side), the mission
screen set (shell side), authored content for all three seeds, verb and
glossary registrations, cue mappings, and walkthrough coverage.

## 2. Directory layout

    src/engine/missions/outlook/
      types.ts          message, channel, mission-state types + valibot schema
      content.ts        payload type the seeds satisfy; content validators
      module.ts         the MissionModule implementation
      rules.ts          channel math, delivery evaluation, tiering (pure)
    src/app/missions/outlook/
      OutlookScreen.tsx mission screen: view switching, command registration
      InboxView.tsx     list with sender, subject, receipt time, flag marks
      MessageView.tsx   detail: body lines, TRACE, CHECK SOURCE, actions
      OutboxView.tsx    queue contents, channel capacity and ETA readouts
      DeliveryLogView.tsx
      verbs.ts          READ/FLAG/QUEUE/SEND/TRACE/CHECK SOURCE registrations
      glossary.ts       mission jargon registrations (CHANNEL, CAPACITY, ETA,
                        DELIVERY RECEIPT, EXERCISE BULLETIN)
    seeds: authored outlook payloads inside each SeedDefinition
    test/engine/missions/outlook/   rules, module lifecycle, content checks
    test/app/missions/outlook/      screen behavior with the real engine

## 3. Mission state and types (engine side)

    interface OutlookMessage {
      id: string              // 'M01'..'M12'
      from: string            // sender authority line
      to: string | null       // visible recipient hint, may be absent
      subject: string
      body: string[]          // evidence lives here
      recordId: string | null // link into the evidence graph (C17 etc.)
      requiredKind: 'weather' | 'payroll' | 'audit' | null
      correctRecipient: DeskId | null   // authored truth for evaluation
      supersededBy: string | null       // the correction chain
    }

    interface OutlookState {
      messages: ...           // read/flag marks per message id
      queue: QueuedSend[]     // message, channel, position
      sends: SendRecord[]     // spent capacity, acks, failures
      primaryStage: 0 | 1 | 2 // full, slowed, dark
      backupRemaining: number
      deliveredRequired: ...  // per requiredKind: delivered state + correctness
    }

The payload type for seeds carries the twelve messages, channel tuning
(backup capacity five, primary ETAs per stage, backup ETA), and stage-change
offsets. Desk-check outcomes do NOT live here: they stay in the shared
SeedDefinition deskChecks table keyed by record id (engine-owned; review
finding 1). A content validator (run by seed validation tests) asserts:
exactly one NON-SUPERSEDED message with a non-null correctRecipient per
requiredKind (duplicates modeled as superseded); evidence fields present;
the audit message's record id carries the R04 export reference and the
bulletin's TRACE reaches C17 (two separate assertions); supersession chains
resolve; all tuning integers; and two solvability invariants per seed: the
adversarial send-everything fixture provably fails while the walkthrough
provably reaches tier 3 with margin.

## 4. Rules (pure, engine side)

- Channel math: SEND validates capacity and stage (dark primary rejects with
  reason), spends capacity, computes acknowledgment time from authored ETA at
  the current stage, and asks the engine to schedule the acknowledgment
  event. QUEUE holds a send without spending; dispatching from the queue is a
  SEND. FLAG and READ toggle marks; READ also emits the clue when the audit
  message is first read.
- Delivery evaluation: an acknowledgment event before endsAt marks the send
  acknowledged; evaluation of a required delivery checks message version
  (not superseded), correct recipient desk, and acknowledgment. Wrong
  version or recipient still spends capacity and logs.
- Stage changes: scheduled events flip primaryStage and surface warning
  lines plus the falling-tone cue through emitted scheduledEventFired events.
- Tiering: evaluate(state, cause) counts correct acknowledged required
  deliveries: 3 full, 2 partial, 1 poor, 0 failed; completed fires early
  when all three are acknowledged; timeout and forfeit evaluate the same
  way. Consequence commsDelayed magnitude from an authored tier table.
- Debrief payload: per-delivery outcomes, capacity spent on decoys, clue
  found flag.

## 5. Screen (shell side)

OutlookScreen registers with the shell screen registry for mission id
'outlook' and registers its verbs on mount. Four views switched by list
selection and commands (INBOX, OUTBOX, LOG implicit via navigation controls);
mobile gets single-pane navigation with back affordances; desktop shows
inbox beside detail. All actions render through ActionBar buttons exposing
only currently valid actions (the engine validator is the truth; buttons for
invalid sends render disabled with the rejection reason on attempt).
StatusLine shows primary stage, backup remaining, and next ETA. The
briefing still (art slot briefing-outlook) frames the mission start text.
TRACE and CHECK SOURCE render through the shared record-detail affordances
with glossary terms (OBSERVED, EXERCISE, DERIVED) active. Delivery and
channel events announce through the polite live region via emitted events;
the 30 and 10 second warnings are engine milestones.

## 6. Content authoring

Fixture seed: twelve messages per the interview mix, written so every
required routing decision is decidable from in-message evidence under time
pressure: sender authority lines name desks, the payroll thread carries an
approval chain, the weather correction cites a field observation record, the
audit message references run R04 and the export feed (the D-83 clue), the
bulletin repeats the correction's claim with EXERCISE provenance. Seeds two
and three: same structure, different incident flavor, validated by the same
content validator. All copy uppercase terminal diction, no em-dashes,
invented names only.

## 7. Testing strategy notes

Engine (node project): rules unit tests (capacity, stages, acknowledgment
timing, supersession, tiering per cause); module lifecycle through the engine
with the fixture payload (start, stage events fire in order, SEND schedules
acks, early completion, timeout, forfeit); content validator across all three
seeds; walkthrough fixture reaches tier 3; a capacity-exhaustion fixture
proves spray-and-pray fails; determinism via the split 01 harness (the
mission joins the fc.commands action set through its module registration).
Shell (jsdom project): view navigation and list parity, button-command
identity for every verb, disabled-state rendering with rejection reasons,
TRACE/CHECK SOURCE flows, capacity and stage readouts, announcements on
stage change, mobile single-pane behavior, glossary terms open.

## 8. Risks

Content is the schedule risk, not code: twelve messages times three seeds of
authored evidence. Mitigation: the content validator turns authoring
mistakes into CI failures, and the walkthrough fixtures prove solvability
mechanically. Interface risk is low: every contract this plan uses already
survived the split 01 and 02 reviews.

## 9. Review integrations (revision 2, 2026-11-17)

From reviews/iteration-1-opus.md; dispositions in
claude-integration-notes.md. Binding corrections:

1. CHECK SOURCE is engine-owned. The mission renders the control and the
   results; the action is REQUEST_SOURCE_CHECK on the campaign queue;
   authored outcomes live in the shared SeedDefinition deskChecks table
   keyed by record id; replies arrive as sourceCheckResolved emitted events
   (arrivedAfterSettlement supported). The mission draws no randomness.
2. Clue emission (engine amendment, second block in split 01): MissionModule
   gains optional clues(state): ClueId[]; after every reduce the engine
   merges new ids into cluesFound monotonically and emits clueFound events.
   Reading the audit message logs the D-83 clue immediately and survives a
   failed mission. The outlook module exposes audit-read and
   audit-delivered flags in substate; clues() derives from them.
3. The TRACE flow dispatches INSPECT_RECORD so inspected records highlight
   in the finale case file.
4. Buzzer tie-break: acknowledgment events with scheduledAt <= endsAt drain
   before the timeout settlement guard in the same advanceToNow; three acks
   at the buzzer settle as completed, not timeout. Boundary fixture
   included in the module tests. (Mechanism note, amendment 7 to split 01:
   early completion is signaled by the module's terminal(state) selector
   returning 'completed' when the third correct acknowledgment is marked;
   the engine polls terminal() after every reduce and drain.)
5. QUEUE stores (messageId, channel) only; stage, capacity, and ETA are
   evaluated at dispatch; dispatching to a dark primary rejects with the
   reason, costs nothing, and leaves the item queued. Queueing is always
   safe, as the requirements demand.
6. Primary channel model: unlimited send count while not dark;
   stage-dependent ETA is the scarcity mechanism alongside backup's hard
   five-send capacity. The two solvability invariants in section 3's
   validator are the difficulty contract.
7. Clock: the mission always ends at endsAt or early completion. Dark
   primary is a stage; backup remains usable to the deadline, and the
   stage-2 warning line says so.
8. Substate is reference-only (ids, marks, send records); authored message
   bodies live exclusively in the immutable seed payload (byte-budget
   discipline). The saveSchema validates the reference shape.
9. Navigation: INBOX, OUTBOX, and LOG are registered view commands with
   persistent tabs on desktop and back affordances on mobile single-pane.
10. Invalid sends render disabled with the rejection reason inline (not on
    attempt). Recipient hints on stale duplicates are deliberately
    misleading; the authoring notes say so.
11. Glossary: OBSERVED, EXERCISE, DERIVED come from the global glossary;
    only channel jargon (CHANNEL, CAPACITY, ETA, DELIVERY RECEIPT,
    EXERCISE BULLETIN) registers locally.
12. Testing scope: the mission ships its own property tests over its rules;
    entry into the campaign-level fc.commands suite is claimed only if that
    harness accepts additional mission modules. An extended-time test
    asserts the three stage changes scale proportionally and tier 3 stays
    reachable at eight minutes.
