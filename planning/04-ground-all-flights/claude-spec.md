# Complete Specification: 04-ground-all-flights

Synthesis of spec.md, claude-research.md, and claude-interview.md
(self-answered under Bond's autonomy directive). 2026-11-17. Upstream:
../requirements.md section 2. GROUND ALL FLIGHTS plus the fixture table;
binding contracts from splits 01 and 02 (rev 2 plans plus amendments).

## What this is

Mission 2: a live air-traffic routing puzzle rendered entirely in terminal
characters. Four fictional hubs, eight fictional flights, corridor links, a
seeded storm advancing on its own timeline, an imperfect forecast, and
WOPR's tempting all-hubs restriction. Pure MissionModule against the engine;
screen composed from the shell's CharacterGrid plus list-parity views.

## World model

- Grid about 36 x 14 cells desktop, 24 x 10 compact, with a legend: hubs
  (three-letter invented codes), corridor line characters, current weather
  solid symbols, projected storm hatched symbols, restriction marker
  distinct from both, flight markers with selection highlight.
- Four hubs with integer runway slots and arrival queues (authored per
  seed); eight flights each with scheduled origin, destination, departure
  offset, and status; corridors connecting hubs, each open or closed by the
  storm track.
- Seeded storm track: SeedDefinition.stormTrack, deterministic truth,
  advancing via scheduled events. The displayed forecast is an authored
  projection differing from truth at one or two authored points per seed; a
  mid-mission observation event corrects the projection with lead time to
  respond (timestamped warning, two-tone cue, changed corridor or hub
  highlighted).
- Opening dilemma authored per seed: one hub has capacity but sits in the
  projected storm path; another stays open with a long queue.

## Actions

LAND <flight> <hub>, DIVERT <flight> <hub>, HOLD <flight>, PROBE <corridor>,
GROUND ALL, TRACE <record>, CHECK SOURCE <record>, HELP; buttons expose the
same validated actions, including per-flight action rows in the list view.
- Legality: land requires an open hub with a free slot reached by an open
  corridor; divert joins the target queue with authored positional delay;
  hold applies only before departure; all validations are engine-side with
  reason codes.
- PROBE schedules a field-report event revealing true corridor state as an
  OBSERVED record (evidence for play and the finale).
- GROUND ALL is WOPR's directive as one action: holds every undeparted
  flight and blocks departures. OPEN EXCEPTIONS falls sharply; passenger
  outcomes worsen as closures catch airborne flights with fewer options.
  The dual scoreboard makes the trade visible immediately.

## Records and the clue

The briefing feed carries the all-hubs restriction record (fixture: F06,
DERIVED from C17, run R04, event 21:14:08, receipt 21:14:52) beside an
OBSERVED field report showing local weather and an open corridor, plus the
observed local weather warning decoy (W02) explaining a real local
restriction. TRACE distinguishes them; the suspiciously early restriction
(event time minutes before its receipt, stamped R04) is the D-83 clue,
logged when the player traces it.

## Settlement

- Every flight ends in a final status: landed on time, landed late,
  diverted-landed, held on ground, stranded. Integer passenger counts per
  flight (authored) aggregate the outcome.
- Tiers by authored thresholds: full (no stranded, minimal unnecessary
  holds), partial, poor, failed. Early completion when all eight flights
  reach final status before the deadline; otherwise timeout evaluation at
  the deadline; forfeit anytime.
- Debrief: arrivals, diversions, flights held, stranded passengers,
  unresolved flights, the GROUND ALL trade if taken, clue status.
- Consequences out: flightsDisrupted magnitude by tier. Consequences in:
  commsDelayed widens the authored projection error (reduced initial report
  reliability); paymentsDelayed removes one runway slot at one hub for an
  authored early window (delayed ground staffing).

## Screens

Grid view (CharacterGrid): map, legend, selected-flight readout adjacent
when space permits (hub, runway availability, ETA, viable destinations).
List view (mandatory parity): all eight flights with status, conditions,
and full action rows; selection syncs with the grid; keyboard and tap
complete on both. Narrow screens default to the list with the compact grid
one toggle away; the grid is never the only way to play. Briefing still in
art slot briefing-flights. Glossary registrations: CORRIDOR, RUNWAY SLOT,
ARRIVAL QUEUE, PROJECTION, FIELD REPORT, ALL-HUBS RESTRICTION.

## Timer and events

Four minutes standard, eight extended. Seed-authored schedule: storm
advancement steps, forecast correction event(s), queue ticks, departure
readiness events, timer milestones including 30 and 10 second warnings.
Scope tick cue on fresh observations; two-tone cue on material forecast
change.

## Acceptance anchors

- Updated forecast arrives before the affected flight decision and is
  testable; the walkthrough reaches full tier; a distinct timeout outcome
  exists; the blanket-grounding fixture shows exceptions falling while
  passenger outcomes worsen.
- Six-order chronology preserved (story records fixed per seed); settled
  permanence; keyboard-only and mobile playthroughs; command-button
  identity on every verb.
