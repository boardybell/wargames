# Integration Notes: Opus review of 04-ground-all-flights plan

All findings integrated; the plan is rewritten as revision 2 rather than
patched, because the review judged the draft pre-rev-2 maturity. Key
decisions made in the rewrite:

- A1/A2: CHECK SOURCE engine-owned as in outlook. PROBE collapses into the
  same engine mechanism: PROBE <corridor> is sugar for REQUEST_SOURCE_CHECK
  against the corridor's authored field-report record; the authored offset
  lives in the shared deskChecks table; the reply is the OBSERVED record,
  landing in campaign sourceChecks (usable in the finale) and revealed in
  the readout. The mission schedules nothing and draws nothing.
- A3/A4: TRACE dispatches INSPECT_RECORD; the flights module's reduce sets
  restrictionInspected when the restriction record is inspected; clues()
  derives from it; one action, two consequences.
- A5: buzzer tie-break stated (arrivals at scheduledAt <= endsAt resolve
  before the timeout guard); boundary fixture added.
- B1/B2: HOLD before departure is reversible via RELEASE until the
  flight's last-departure offset passes; a held flight becomes final
  (heldFinal) only when that window closes. GROUND ALL is a single-use,
  irreversible fleet action that holds all scheduled flights and blocks
  departures and releases; it does NOT trigger early completion; the clock
  runs to endsAt so the congestion consequences play out. Early completion
  fires only when every flight is in a terminal status (landed,
  landedLate, divertedLanded, stranded, heldFinal). OPEN EXCEPTIONS reads
  module-exposed held/grounded facts through the campaign selector; the
  drop applies per held flight, which under GROUND ALL means all at once.
- B3: validator invariants: per-seed walkthrough reaches full tier under
  the real storm; readout-offered destinations strict-equal
  validator-accepted destinations across state fixtures.
- B4: arrival-time rule: dispatches are legal regardless of projected
  arrival; a computed arrival <= endsAt lands (late past the authored
  threshold); an arrival > endsAt leaves the flight airborne and it
  strands at timeout. Stated in rules and the readout shows projected
  arrival vs deadline.
- B5: HOLD and RELEASE legality evaluated against drained state; same-call
  races resolve by drain-then-reduce ordering; test added.
- B6: authored leadMargin (30 s standard, scaled under extended time);
  validator asserts correction scheduledAt <= lastSafeDecisionAt -
  leadMargin per seed.
- B7: solvability-under-max-consequence fixture per seed; paymentsDelayed
  target hub named in seed data (deterministic across mission orders).
- B8: validator forces at least 1 s separation between any storm
  close/open event and any arrival event it could affect.
- C1: keyboard model: arrow keys cycle flight markers only (next marker in
  reading order), never empty cells; tap selects any flight marker; hub
  and corridor cells are not selectable targets.
- C2: the correction announces as one coalesced polite message naming the
  changed corridor or hub.
- C3: the grid/list view toggle persists with UI preferences.
- D2: property claim scoped to mission-local tests.
- D3: extended-time test: all scheduled kinds scale proportionally; full
  tier and the lead margin survive doubling.
- E: substate is reference-only (statuses, held flags, probe and
  inspection flags, groundAll flag, applied-correction index); hub names,
  authored projection, passenger counts stay in the payload. GROUND ALL
  re-dispatch rejected as no-op. Global glossary consumed for provenance
  terms. W02 independence asserted in the validator. decisions.md exists
  at planning/decisions.md; provenance line corrected.
