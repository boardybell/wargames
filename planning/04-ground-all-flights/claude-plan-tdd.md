# TDD Plan: 04-ground-all-flights

Companion to claude-plan.md revision 2; same section numbering. Engine
tests in the node project; screen tests in jsdom with the real engine.
Stubs say what to test, not how.

## 3. Types and reference-only split

- saveSchema round-trips substate; schema rejects authored content
  (hub names, passenger counts, projection data) in substate.
- Status lifecycle type guard: statuses only move forward
  (scheduled -> airborne or held; held -> scheduled-release path only
  while window open; terminal states absorb).

## 4. Rules

- Legality tables: LAND and DIVERT (hub open, slot free, corridor open,
  flight airborne, all at drained state); HOLD only while scheduled;
  RELEASE only while held and window open; typed rejection reasons.
- HOLD/RELEASE window: held becomes heldFinal when last-departure passes;
  same-call race (HOLD dispatched with now past the departure event's
  scheduledAt) resolves by drain-then-reduce; test both orders.
- GROUND ALL: single-use (re-dispatch provable no-op); holds all
  scheduled; blocks departures and releases; does NOT early-complete;
  exceptions fall sharply while passenger aggregate worsens (fixture).
- Arrival rules: arrival <= endsAt lands (late past threshold); arrival
  computed past endsAt leaves airborne and strands at timeout; buzzer
  boundary fixture (arrival exactly at endsAt lands and counts before the
  timeout guard; one tick later strands).
- Storm application: truth events close and open; reducers never read
  projection (spy or structural proof); display model never reads
  undrained truth; correction event replaces projection and emits one
  material-change event.
- PROBE: dispatches REQUEST_SOURCE_CHECK against the corridor's field
  report record; reply resolves from the shared deskChecks table as an
  OBSERVED record; mission schedules nothing (no mission-queue writes
  from PROBE).
- Clue: inspecting the restriction record (INSPECT_RECORD) logs the D-83
  clue via the engine clueRecords path exactly once; the module has no
  clue code.
- Early completion: fires only when all eight flights terminal; verify
  heldFinal counts and held does not.
- evaluate per cause including the widened union (completed via
  terminal() when all terminal early, timeout, forfeit); tier thresholds;
  consequence flightsDisrupted by tier.
- Inbound consequences: commsDelayed widens divergence by capped
  magnitude; paymentsDelayed removes one slot at the seed-named hub for
  the authored window; order-independent across permutations (property).

## 5. Content validator (per seed)

- The six invariants from plan section 5 as named tests: structure,
  solvability (walkthrough full tier; max-consequence variant at least
  partial plus the authored full-tier alternate), correction lead margin
  arithmetic, storm/arrival one-second separation, record assertions
  (restriction ancestry, W02 independence, deskChecks coverage,
  clueRecords entry), integers and target-hub existence.

## 6. Map and screens

- mapModel: pure snapshot tests per state fixture (hubs, corridors,
  weather solid vs hatched vs restriction marker, flight markers,
  selection classHook).
- Keyboard: arrow cycling visits flight markers only, in reading order;
  no empty-cell selection; tap selects markers only.
- Readout-validator parity: offered destinations strict-equal accepted
  destinations across fixtures; projected arrival renders beside the
  deadline.
- Grid-list selection sync both directions; list carries full action
  rows; narrow default list; toggle persists.
- Command-button identity for all verbs; GROUND ALL confirmation and
  single-use rendering; inline disabled reasons.
- Correction announces once, coalesced, naming the changed corridor or
  hub; probe results announce politely; scope tick and two-tone cues from
  emitted events only (fake timers prove no local timers).
- Keyboard-only and narrow-width passes for one full routing flow.

## 7. Cross-cutting

- Extended time: all scheduled kinds scale proportionally; full tier and
  lead margin survive doubling.
- Mission-local properties: no negative slots, statuses forward-only,
  settled once, substate JSON-safe.
- Walkthrough, max-consequence, timeout, forfeit, blanket-grounding
  fixtures per seed in CI.
