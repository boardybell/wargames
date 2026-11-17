# Spec: 04-ground-all-flights

Context: ../requirements.md section "2. GROUND ALL FLIGHTS" plus "Teach the player to
check the source" and the fixture table; ../decisions.md; ../project-manifest.md.

## Purpose

Mission 2. A live air-traffic routing puzzle rendered entirely in terminal characters,
modeled on the film's plotted-economy displays. Mission module against 01, rendered
with 02's character-grid primitives.

## In scope

1. World: four fictional hubs, about eight fictional flights, corridor links, weather
   symbols, arrival queues. Fixed-width character grid with a compact legend. Selected
   flight readout: runway availability, estimated arrival, viable destinations, shown
   adjacent when space permits.
2. Forecast. Imperfect short-range forecast; current conditions and projected storm
   movement in distinct characters with a text legend. Storm track seeded once per
   campaign and advancing on its own timeline regardless of orders. New observations
   post timestamped warnings and show the changed corridor or hub with enough lead
   time to respond.
3. Decisions: land at an available hub, divert, or hold a departure on the ground.
   Opening dilemma: one hub has capacity but sits in the projected storm path, another
   is open with a long queue. Blanket grounding obeys WOPR's directive, improves OPEN
   EXCEPTIONS, worsens congestion, strands passengers.
4. Source discipline: Joshua's all-hubs restriction, the forecast, and field
   observations visually and textually distinct in legend and readout. The player can
   probe a plausible corridor and see the result arrive as a new event before
   committing. Fixture tie-in: F06 (event 21:14:08, receipt 21:14:52, DERIVED from
   C17, run R04) and the separate field report showing local weather and an open
   corridor; the suspiciously early restriction supplies the D-83 clue. The observed
   local weather warning decoy explains a real local restriction.
5. Settlement: every flight reaches a clear final status. Debrief: arrivals,
   diversions, flights held, stranded passengers, unresolved flights. Distinct timeout
   outcome. Consequence emission (disruption raises simulated withdrawal demand).
   Inbound consequence handling (delayed communications reduce initial report
   reliability), applied once and capped.
6. Narrow screens: compact grid plus a fully capable flight list; selection,
   conditions, and every action available from list and keyboard; the map is never
   the only way to play.

## Out of scope

Shell chrome, other missions, media files.

## Provides

Mission module registration, outcome and consequence payloads, F06 and the field
report into the case file, debrief content.

## Needs

01 record model, storm scheduler, settlement; 02 character-grid renderer, command
dispatch, cue hooks (scope tick, two-tone forecast change).

## Decisions and acceptance anchors

Deterministic storm from seed. Verification bullets: an updated forecast arrives
before the affected flight decision and is testable; meaningful success and distinct
timeout; mobile list parity; settled permanence. Four-minute default timer. Full
quality, no rationing. No em-dashes.
