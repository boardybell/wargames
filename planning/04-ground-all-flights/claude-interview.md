# Interview: 04-ground-all-flights

2026-11-17. Mode: autonomous (Bond: "no more questions just build it and do
what you think is best"). Self-answered with reasoning recorded.

Q1: Map dimensions and world size?
A: Fixed-width grid about 36 x 14 cells desktop, compact about 24 x 10 under
the breakpoint. Four hubs (invented three-letter codes per seed), eight
flights, corridor links drawn with line characters, weather symbols from a
small legend set (current conditions solid, projected storm hatched,
restriction marker distinct from both). Rationale: readable at phone scale
per the shell grid rules, roomy enough for four hubs and visible corridors.

Q2: Turn structure vs continuous time?
A: Continuous real-time against the mission clock with scheduled events
(storm advancement steps, forecast updates, arrival queue ticks). Player
actions are instant dispatches (LAND, DIVERT, HOLD) validated against
current state. Rationale: requirements demand a live puzzle with timestamped
warnings and lead time, which the engine's event schedule gives for free.

Q3: Flight resolution rules?
A: Each flight has fuel-free simplified legality: it can land at its
scheduled hub if a runway slot is open and the hub is not storm-closed,
divert to any hub connected by an open corridor (arrival joins that hub's
queue with authored delay), or hold on the ground if not yet departed.
Storm closure of a hub or corridor is deterministic from the seeded track.
Every flight reaches a final status: landed, diverted-landed, held-on-
ground, stranded (airborne with no legal hub when the clock ends or caught
by closure). Queue length adds authored integer delay per position.

Q4: The blanket-grounding trap mechanics?
A: A GROUND ALL order exists as one action (it is WOPR's directive). Taking
it holds every undeparted flight and refuses new departures: OPEN
EXCEPTIONS falls sharply, passenger outcomes worsen (stranded and delayed
counts rise as queues and closures catch airborne flights with fewer
options), and the debrief names the trade. Declining it and routing
selectively is the skill path.

Q5: Forecast imperfection?
A: The seeded storm track is truth; the forecast shown is an authored
projection that differs from truth at one or two authored points per seed.
A mid-mission observation event corrects the projection with enough lead
time to reroute (the requirements' updated-forecast-before-decision test
hangs on this event). Corridor probe: PROBE <corridor> schedules a
field-report event revealing true corridor state as an OBSERVED record.

Q6: Success tiers and consequences?
A: Score from integer passenger outcomes: landed on time, landed late,
diverted, held, stranded. Tier full when no stranded and at most one held
beyond need; partial, poor, failed by authored thresholds. Consequence out:
flightsDisrupted magnitude by tier. Consequence in: commsDelayed reduces
initial forecast reliability (widens the authored projection error);
paymentsDelayed (from an early bank mission) delays one ground crew,
shrinking a hub's runway slots early on. The suspiciously early all-hubs
restriction record (F06 surface, DERIVED from C17, receipt 21:14:52) is in
the briefing feed; TRACE shows its run R04 parentage; it carries the D-83
clue.
