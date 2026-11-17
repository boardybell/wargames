# Complete Specification: 03-crash-outlook

Synthesis of spec.md, claude-research.md, and claude-interview.md
(self-answered under Bond's autonomy directive). 2026-11-17. Upstream:
../requirements.md section 1. CRASH OUTLOOK plus the fixture table; binding
contracts from ../01-simulation-core/claude-plan.md (rev 2 + amendments) and
../02-terminal-shell/claude-plan.md (rev 2).

## What this is

Mission 1: a triage puzzle under a real-time deadline. The simulated Outlook
inbox is going dark in stages; the player must get three essential messages
through on scarce channel capacity before it does, by reading evidence inside
the messages rather than trusting priority flags. Implemented as a pure
MissionModule against the split 01 engine plus a mission screen composed from
split 02 primitives.

## Mission shape

- Twelve authored messages in the fixture seed (payloads live in
  SeedDefinition.missionPayloads.outlook; seeds two and three repeat the
  structure with different content): three required deliveries (weather
  correction to the field forecast desk, payroll clearance to the bank
  operations desk, directive audit to the exercise control desk), the D-83
  exercise bulletin decoy (surface of record C17, EXERCISE, run R04), two
  authority-bearing wrong-scope decoys, two stale duplicates of required
  messages with wrong recipients, one superseding correction, three routine
  noise messages.
- Channels: PRIMARY degrades in three authored stages at explicit clock
  milestones (full, slowed, dark), each stage change a scheduled event with a
  timestamped terminal warning and a falling-tone cue. BACKUP has a fixed
  capacity of five sends, constant slow ETA, never degrades. Remaining
  capacity and ETA always visible. All numbers integers, authored per seed.
- Actions (buttons and typed commands dispatch identical engine actions):
  READ, FLAG, QUEUE <id> <channel>, SEND <id> <channel>, TRACE,
  CHECK SOURCE, HELP. Read, flag, queue are free and always safe; SEND spends
  capacity, produces a delivery-log entry, and counts only when the
  simulation acknowledges delivery before the deadline (ETA puts the
  acknowledgment event on the schedule; a send whose acknowledgment would
  land after the deadline is still accepted and visibly fails in the log).
- Teaching beat: the exercise bulletin and the plainer observed weather
  correction sit adjacent in the inbox. TRACE shows EXERCISE/R04 vs OBSERVED
  field origin; CHECK SOURCE on the bulletin returns CONTRADICTED after its
  authored wait; the desk confirmation on the correction returns CONFIRMED.
  Sending the bulletin consumes capacity and produces a receipt; mission
  success for that item requires delivering the observed correction to the
  right desk.
- Screens inside the mission (composed from shell primitives): inbox list
  (sender, subject, receipt time, flags), message detail with TRACE and
  CHECK SOURCE controls and glossary terms, outbox/queue view, delivery log.
  Mobile: single-pane navigation between the four views, list parity per
  shell rules.

## Settlement and consequences

- Success evaluation at settlement (completed early only if all three
  required deliveries acknowledged; otherwise timeout at the deadline or
  forfeit): tier = count of required deliveries acknowledged with correct
  version and recipient (3 full, 2 partial, 1 poor, 0 failed).
- Debrief: the three deliveries reported individually (delivered correctly,
  delivered wrong version or recipient, undelivered), plus capacity spent on
  decoys. The audit message supplies the D-83 clue (clue emission when it was
  delivered or read; reading it suffices to log the clue in the case file,
  delivering it correctly strengthens the finale evidence highlight).
- Consequence emitted: commsDelayed with authored integer magnitude scaling
  inversely with tier; folded by the engine (canonical order, aggregate cap)
  into later missions (reduces initial flight report reliability).
- Records contributed to the campaign case file: C17 (EXERCISE, R04, event
  21:14:00, receipt 21:14:05) surfaced through the bulletin's TRACE, the
  observed correction's OBSERVED record, and completed source checks.
- OPEN EXCEPTIONS interplay: letting the inbox go dark with messages unsent
  reduces WOPR's open-exception count (forced inactivity reads as resolution)
  while the real service outcome (essential deliveries) worsens; the dual
  scoreboard shows the divergence during play.

## Timer and events

Four-minute standard mission (eight extended), materialized by the engine.
Seed-authored schedule: stage-change events for the primary channel,
delivery-acknowledgment events created dynamically by SEND (engine schedules
them from authored ETA), desk-reply events from CHECK SOURCE on the campaign
queue, and the standard timer milestones including 30 and 10 second warnings.

## Acceptance anchors

- Meaningful success path (walkthrough fixture reaches tier 3) and a distinct
  timeout outcome; decoys and limited capacity testable (spending backup
  capacity on all plausible messages exhausts it before the three required
  deliveries complete).
- Wrong version or recipient consumes capacity and appears in the delivery
  log; the correct observed correction, not the exercise copy, satisfies the
  weather item.
- All controls work by tap and typed command with identical dispatched
  actions; settled permanence per engine rules; mission playable
  keyboard-only and at mobile widths.
