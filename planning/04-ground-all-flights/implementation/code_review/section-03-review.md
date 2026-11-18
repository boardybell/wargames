# GROUND ALL FLIGHTS map screen (section-03) review

Reviewer: deep-implement:code-reviewer. The core is faithful to the mission-1 template and the engine contracts: wrong-divert is reachable (offered set strict-equals routeLegality acceptance, no auto-correct), mapModel is pure over drained substate (undrained-truth test is the strongest in the suite), list parity + grid<->list sync, PROBE/TRACE engine-owned, single shared CommandInput, Countdown role=timer, no wall-clock reads, non-circular tests through the real engine. One real gameplay miss and several smaller issues.

## HIGH
- **H1. The forecast LEAD warning is dropped.** The engine emits a `flightsForecast` (FORECAST_EVENT_KIND) scheduled event `leadMarginSeconds` before each storm step closes a corridor/hub, carrying warningLine + cueId — the whole advance-warning mechanic (and the spec's key property, just wired in section 01). But FlightsScreen only subscribes to `flightsStorm`/`flightsCorrection`; `flightsForecast` is never handled, so the advance warning and its two-tone cue never reach the player and the storm warning only fires at closure (too late to act). No test covers the lead, so the miss is invisible. Subscribe to it, announce + cue the lead, and add a test that advances to just past the forecast offset (before the storm offset) and asserts the early warning fired.

## MEDIUM
- **M1. Stale `now` in the gamble readout.** The projected-arrival / deadline T+ figures recompute from `state.lastNow`, which only updates on a fold, so between folds they visibly disagree with the live role=timer countdown. Derive both from the same source (re-render the readout on the display tick, or compute off the display clock).
- **M2. Marker-only keyboard cycling depends on an implicit capture-phase-vs-bubble ordering** with CharacterGrid's own handler. It works (and the keyboard test would catch a regression) but is un-commented; document the dependency.
- **M3. The view-preference store is a hand-rolled copy of audio/prefs** (manual useState + useEffect) instead of useSyncExternalStore, risking a tearing/stale-read window on fast toggles. Reuse the useSyncExternalStore pattern.

## LOW
- **L1.** FlightListView's conditions line always shows the authored destination even after a DIVERT (the map/readout correctly use inboundHubId) — the two parity surfaces disagree for diverted flights. Show the real inbound target.
- **L2.** `data-pane={narrow ? 'single' : 'two'}` advertises two panes but the body renders exactly one view at a time (copied from outlook). Drop or correct the misleading attribute.
- **L3.** The restriction marker lights whenever ANY hub is storm-closed (`closedHubs.length > 0`), conflating a single-hub storm closure with the blanket ALL-HUBS restriction the glossary term and the D-83 clue are about. Gate the restriction glyph on the actual all-hubs restriction state, not any storm closure.

## Bottom line
Fix H1 (wire the forecast-lead warning + cue + test — it is the gameplay property this mission exists to teach and it is currently dead at the shell), then M1-M3 and the LOWs (L1 and L3 matter for parity and the clue fiction).
