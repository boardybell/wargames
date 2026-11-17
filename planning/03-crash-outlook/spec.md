# Spec: 03-crash-outlook

Context: ../requirements.md section "1. CRASH OUTLOOK" plus "Teach the player to check
the source" and the fixture table; ../decisions.md; ../project-manifest.md.

## Purpose

Mission 1. A triage puzzle under a real-time deadline: get three essential messages
through before the simulated Outlook inbox goes dark. Implemented as a mission module
against the 01 interface, rendered with 02 primitives.

## In scope

1. Authored content: roughly 10 to 12 invented messages containing genuine priorities,
   plausible decoys, duplicate instructions, and corrections. Sender authority,
   timestamps, and recipient context make every required routing decision reasonable
   under pressure from the message text alone. All names and systems invented.
2. The three required deliveries: a weather correction, a payroll clearance, and a
   directive audit, each with an intended recipient evidenced inside the thread. The
   audit message supplies the D-83 clue.
3. Screens inside the terminal: inbox, message detail, outbox, delivery log. TRACE and
   CHECK SOURCE on consequential records, introduced when the first one appears,
   non-blocking while the deadline runs.
4. Channels. Primary moves fast and degrades in stages at explicit clock milestones;
   backup has fixed capacity that exhausts if the player sends everything plausible.
   Remaining capacity and estimated delivery time always visible. Reading, flagging,
   and queueing are free and safe; dispatching spends capacity.
5. The teaching beat: a high-priority exercise bulletin beside a plainer observed
   weather correction. Original sender, parent record, and a desk confirmation
   distinguish them. Sending the exercise copy consumes capacity and produces a
   receipt; success for that item is correct routing and delivery of the observed
   correction.
6. Commands and buttons for READ M03, SEND M03 BACKUP, flag, queue; buttons expose
   only valid actions.
7. Settlement: a delivery counts only when acknowledged before the deadline. Wrong
   version or recipient spends capacity and lands in the log. Distinct timeout
   outcome. Per-delivery debrief. Consequence emission to the campaign (delayed
   communications reduce initial flight report reliability).
8. Fixture tie-in: Outlook C17 (21:14:00 event, 21:14:05 receipt, EXERCISE, run R04)
   surfaces here and persists into the finale case file.

## Out of scope

Shell chrome, other missions, finale case logic, media files.

## Provides

Mission module registration, settled outcome and consequence payloads, C17 and related
records into the campaign case file, debrief content.

## Needs

01 record model, clock, channel-capacity-friendly action validation, settlement; 02
screens, command dispatch, cue hooks (delivery pip, channel-down falling tone).

## Decisions and acceptance anchors

Deterministic from seed. Verification bullets: decoys and limited capacity tested,
meaningful success path and distinct timeout, mission controls work by tap and typed
command, settled result permanent across reload and debrief reacknowledgment.
Four-minute default timer with extended-time option. Full quality, no rationing.
No em-dashes.
