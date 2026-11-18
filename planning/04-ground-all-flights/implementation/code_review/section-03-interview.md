# Section 03 triage (flights map screen)

Full autonomy. The wrong-divert rule, mapModel purity, list parity, PROBE/TRACE ownership, single CommandInput, role=timer countdown, and the real-engine tests are correct and stay. Fix the forecast-warning miss and the parity/fiction issues.

## Fix
- H1: subscribe FlightsScreen to the `flightsForecast` (FORECAST_EVENT_KIND) scheduled event; announce its warningLine (polite) and play its two-tone forecast-change cue as an ADVANCE warning, distinct from the at-closure `flightsStorm` warning. Add a test that advances to just past the forecast offset but before the storm offset and asserts the early warning + cue fired (it should currently be absent). This is the mission's teach-the-player-to-check-the-forecast mechanic; make it reach the player.
- M1: derive the gamble readout's projected-arrival / deadline T+ figures from the same clock the role=timer Countdown uses (re-render on the display tick) so they do not visibly disagree between folds.
- M2: comment the capture-phase-stopPropagation dependency on CharacterGrid's bubble handler in MapView so the marker-only cycling coupling is explicit.
- M3: reuse useSyncExternalStore for the view-preference store (match audio/prefs) instead of manual useState + useEffect, to avoid a tearing/stale-read window.
- L1: FlightListView's conditions line must show the real inbound target (inboundHubId) for a diverted flight, matching the map/readout, not the authored destination.
- L2: drop or correct the misleading `data-pane="two"` attribute (the body renders a single view at a time).
- L3: light the ALL-HUBS RESTRICTION marker only on the actual blanket all-hubs restriction state (the F06/D-83 fiction), not whenever any single hub is storm-closed; update the mapModel test to the tighter semantics.

## Done when
App project green with the forecast-lead warning genuinely reaching the player (new test proves the early warning+cue), the readout clock consistent, the list/map parity aligned for diverted flights, the restriction marker matching its own definition, tsc + eslint clean, no regressions.
