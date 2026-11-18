# Usage Guide: 03-crash-outlook (Mission 1)

CRASH OUTLOOK, the first real mission of SHALL WE PLAY A GAME?: an inbox-triage
puzzle under a real-time deadline. Twelve messages per seed; three carry genuine
required routings (a weather correction, a payroll clearance, a directive audit).
Route each to its correct desk over degrading communication channels and get the
acknowledgments back before the clock runs out. Decoys, stale superseded
duplicates, and an EXERCISE bulletin waste scarce channel capacity. The lesson is
to check the source, not trust the recipient hints.

## What this split provides

Engine side (`src/engine/missions/outlook/`, registered as mission id `outlook`):
- The pure deterministic `MissionModule` (init/validate/reduce/evaluate/terminal/
  clues/debrief/saveSchema). Deliveries count only when acknowledged before the
  deadline; completion fires on the third correct ack or at the buzzer; tiers
  3/2/1/0 map to full/partial/poor/failed.
- Two channels: primary (unlimited sends, stage-dependent ETA, goes dark at
  stage 2) and backup (hard capacity of five). QUEUE is free; everything is
  evaluated at dispatch. Reading the audit message surfaces the D-83 clue, which
  survives a failed mission.
- Three authored seeds in `src/engine/seeds/catalog.ts` at
  `missionPayloads.outlook`, plus the pure `validateOutlookContent` content
  validator. The fixture seed embeds the C17 / EXERCISE / R04 / 21:14:00 /
  21:14:05 anchors that persist into the finale case file.

Shell side (`src/app/missions/outlook/`): the OutlookScreen with inbox, message
detail, outbox, and delivery-log views; TRACE and engine-owned CHECK SOURCE;
a desk picker (the mission cannot be won without reading evidence); a visible
role=timer countdown; verb and glossary registration; keyboard and narrow-width
support.

## How missions plug in

The screen registers for mission id `outlook` through the shell screen registry,
and the seed carries the authored payload + schedule; the shell renders whatever
mission the campaign phase selects. No new wiring is needed per mission.

## Acceptance (what is proven)

`npm test` runs the full suite (engine node project + app jsdom project), 679
tests. The mission's acceptance gate proves, per seed through the real engine and
module: all four settlement causes; the evidence-reading walkthrough wins tier
full with a real finite backup margin (spends a slot, leaves four); a
send-everything spray AND a trust-the-visible-hints run both lose (the latter
lands one short at partial); the buzzer boundary both sides; proportional
extended-time scaling; a fast-check property suite (no negative capacity, no
superseded-satisfied delivery, exactly one settlement, free queueing); the full
debrief payload; and keyboard-only plus narrow-width passes.

## Status note

This is the engine-and-shell architected mission. It is built and tested but not
yet the live experience: the live standalone game at boardybell.github.io/wargames/
is a separate self-contained build, and the shell-architected campaign (hero ->
menu -> this mission -> debrief) becomes live when the deploy split wires the
shell at the app root.

## Commits
- db8cc84 section 01 (engine module)
- fa82d84 section 02 (content and seeds)
- 298b68f section 03 (mission screens)
- d886816 section 04 (fixtures and acceptance polish)
