diff --git a/src/app/missions/flights/FlightListView.tsx b/src/app/missions/flights/FlightListView.tsx
new file mode 100644
index 0000000..64811c4
--- /dev/null
+++ b/src/app/missions/flights/FlightListView.tsx
@@ -0,0 +1,140 @@
+// The full-parity flight list: every flight as a row, each carrying status,
+// conditions, and the SAME action affordances the grid readout offers, built
+// from the SAME engine legality selectors. Full parity is the rule: anything
+// doable from the grid is doable from the list, which is what keeps the game
+// playable at narrow width where the list is the default. Disabled actions show
+// their inline rejection reason from the typed engine reasons. Selection is the
+// shared state the grid uses, so a row click selects the same flight the map
+// marker would. Uppercase terminal diction, no em-dashes.
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+import { TerminalText } from '../../terminal/TerminalText'
+import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import {
+  destinationOptions,
+  groundControl,
+} from './flightActions'
+import {
+  makeDivertAction,
+  makeGroundAllAction,
+  makeHoldAction,
+  makeLandAction,
+  makeReleaseAction,
+} from './verbs'
+
+export interface FlightListViewProps {
+  readonly payload: FlightsPayload
+  readonly state: FlightsState
+  readonly selectedFlightId: string | null
+  readonly onSelect: (flightId: string) => void
+  /** True once the fleet is grounded, so GROUND ALL renders spent. */
+  readonly grounded: boolean
+}
+
+/** The conditions line for a flight: its origin hub, that hub's open/closed
+ *  truth, and whether the flight's scheduled corridor is storm-closed. Read from
+ *  drained state only. */
+function conditionsFor(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flightId: string,
+): string {
+  const flight = payload.flights.find((f) => f.id === flightId)
+  if (!flight) return ''
+  const originClosed = state.closedHubs.includes(flight.originHubId)
+  const destClosed = state.closedHubs.includes(flight.destinationHubId)
+  return [
+    `ORIGIN ${flight.originHubId}${originClosed ? ' (CLOSED)' : ''}`,
+    `DEST ${flight.destinationHubId}${destClosed ? ' (CLOSED)' : ''}`,
+    `${flight.passengers} PAX`,
+  ].join('  ')
+}
+
+export function FlightListView({
+  payload,
+  state,
+  selectedFlightId,
+  onSelect,
+  grounded,
+}: FlightListViewProps) {
+  return (
+    <div data-testid="flight-list-view">
+      <div className="flight-list-legend">
+        <GlossaryTerm id="flights-corridor" />{' '}
+        <GlossaryTerm id="flights-runway-slot" />{' '}
+        <GlossaryTerm id="flights-arrival-queue" />
+      </div>
+
+      {payload.flights.map((flight) => {
+        const fs = state.flights[flight.id]
+        const status = fs?.status ?? 'scheduled'
+        const selected = flight.id === selectedFlightId
+        const options = destinationOptions(payload, state, flight.id)
+        const ground = groundControl(payload, state, flight.id)
+
+        const actions: ActionBarItem[] = []
+        for (const option of options) {
+          const makeAction =
+            option.kind === 'LAND' ? makeLandAction : makeDivertAction
+          actions.push({
+            label: `${option.kind} ${option.hubId}`,
+            action: makeAction(flight.id, option.hubId),
+            testId: `list-${option.kind}-${flight.id}-${option.hubId}`,
+            disabled: !option.legal,
+            disabledReason: option.reason,
+          })
+        }
+        actions.push({
+          label: 'HOLD',
+          action: makeHoldAction(flight.id),
+          testId: `list-HOLD-${flight.id}`,
+          disabled: !ground.holdLegal,
+          disabledReason: ground.holdReason,
+        })
+        actions.push({
+          label: 'RELEASE',
+          action: makeReleaseAction(flight.id),
+          testId: `list-RELEASE-${flight.id}`,
+          disabled: !ground.releaseLegal,
+          disabledReason: ground.releaseReason,
+        })
+
+        return (
+          <div
+            key={flight.id}
+            data-testid={`flight-row-${flight.id}`}
+            data-selected={selected ? 'true' : 'false'}
+            data-status={status}
+            className={selected ? 'flight-row flight-row-selected' : 'flight-row'}
+          >
+            <button
+              type="button"
+              data-testid={`flight-select-${flight.id}`}
+              aria-pressed={selected}
+              onClick={() => onSelect(flight.id)}
+            >
+              {`${flight.id}  ${status.toUpperCase()}`}
+            </button>
+            <TerminalText dim>{conditionsFor(payload, state, flight.id)}</TerminalText>
+            <ActionBar actions={actions} />
+          </div>
+        )
+      })}
+
+      {/* GROUND ALL is reachable from the list too (full parity). It renders
+          spent and disabled once used. */}
+      <ActionBar
+        actions={[
+          {
+            label: grounded ? 'GROUND ALL (SPENT)' : 'GROUND ALL',
+            action: makeGroundAllAction(),
+            testId: 'list-GROUND-ALL',
+            disabled: grounded,
+            disabledReason: grounded ? 'ALREADY GROUNDED' : undefined,
+          },
+        ]}
+      />
+    </div>
+  )
+}
diff --git a/src/app/missions/flights/FlightsScreen.tsx b/src/app/missions/flights/FlightsScreen.tsx
new file mode 100644
index 0000000..8a45c77
--- /dev/null
+++ b/src/app/missions/flights/FlightsScreen.tsx
@@ -0,0 +1,365 @@
+// The GROUND ALL FLIGHTS mission screen. It frames the live air-traffic puzzle
+// inside the terminal: a briefing art slot, the dual scoreboard, the blanket
+// GROUND ALL control, the grid/list view (map or full-parity flight list), a
+// visible role=timer countdown, and the command line (the shared one, via
+// ScreenRouter). It owns no engine state: flight statuses, storm truth, runway
+// use, and probe results all come from the campaign state. It runs NO local
+// timers; the scope tick, the two-tone forecast cue, and every announcement
+// arrive as engine-emitted events. Uppercase terminal diction, no em-dashes.
+import { useEffect, useRef, useState } from 'react'
+import { onEngineEvent, send, useCampaign } from '../../state'
+import type { CampaignState, EngineEvent } from '@engine'
+import { selectOpenExceptions } from '@engine'
+import { buildScoreboard } from '@engine/missions/flights/scoreboard'
+import {
+  registerMissionScreen,
+  registerMissionTitle,
+  type MissionScreenProps,
+} from '../../screens/screenRegistry'
+import { registerScreenUiHandler } from '../../screens/screenUiCommands'
+import { ArtSlot } from '../../art/ArtSlot'
+import { TerminalText, StatusLine } from '../../terminal/TerminalText'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import { announce } from '../../a11y/announce'
+import { play } from '../../audio'
+import { Countdown } from '../../cabinet/Countdown'
+import { useNarrowViewport } from '../../grid'
+import { MapView } from './MapView'
+import { FlightListView } from './FlightListView'
+import {
+  FLIGHTS_SCREEN_ID,
+  asFlightsUiCommand,
+  makeGroundAllAction,
+  makeProbeAction,
+  registerFlightsVerbs,
+} from './verbs'
+import { registerFlightsGlossary } from './glossary'
+import {
+  flightsPayload,
+  flightsSubstate,
+  getViewPreference,
+  onViewPreference,
+  setViewPreference,
+  type FlightsView,
+} from './selectors'
+
+const FLIGHTS = 'flights'
+const MISSION_TITLE = 'GROUND ALL FLIGHTS'
+
+const BRIEFING = [
+  'GROUND ALL FLIGHTS',
+  '',
+  'FOUR HUBS. EIGHT FLIGHTS. A STORM YOU DO NOT CONTROL.',
+  'LAND, DIVERT, OR HOLD EACH FLIGHT BEFORE THE DEADLINE.',
+  'WOPR WANTS EVERY FLIGHT GROUNDED. THE PASSENGERS DO NOT.',
+].join('\n')
+
+/** WOPR's blanket-grounding directive, quoted beside the GROUND ALL control. */
+const WOPR_DIRECTIVE = 'WOPR DIRECTIVE: GROUND ALL FLIGHTS. RESOLVE EVERY EXCEPTION.'
+
+/** The warning-line and cue lookup, rebuilt from the active payload. The engine
+ *  emits scheduledEventFired with id + kind only, so the screen recovers the
+ *  authored warning copy and cue id by event id, like mission 1 does. */
+function buildEventCopy(
+  state: CampaignState,
+): Map<string, { warningLine: string; cueId: string }> {
+  const payload = flightsPayload(state)
+  const map = new Map<string, { warningLine: string; cueId: string }>()
+  if (!payload) return map
+  payload.stormTrack.forEach((step, index) => {
+    map.set(`flights-storm-${index}`, {
+      warningLine: step.warningLine,
+      cueId: step.cueId,
+    })
+  })
+  payload.corrections.forEach((correction, index) => {
+    map.set(`flights-correction-${index}`, {
+      warningLine: correction.warningLine,
+      cueId: correction.cueId,
+    })
+  })
+  return map
+}
+
+export function FlightsScreen({ missionId }: MissionScreenProps) {
+  const state = useCampaign()
+  const narrow = useNarrowViewport()
+  const [selected, setSelected] = useState<string | null>(null)
+  // Confirmation step for the irreversible fleet grounding.
+  const [confirmGround, setConfirmGround] = useState(false)
+  // Resolved PROBE results, revealed in the corridor readout as they arrive on
+  // the sourceCheckResolved emitted event. Keyed by record id.
+  const [probeResults, setProbeResults] = useState<
+    Record<string, { outcome: string }>
+  >({})
+
+  // The grid/list view: the stored explicit preference wins; otherwise the
+  // viewport default (narrow -> list, wide -> grid).
+  const [viewPref, setViewPref] = useState<FlightsView | null>(getViewPreference())
+  useEffect(() => onViewPreference(() => setViewPref(getViewPreference())), [])
+  const view: FlightsView = viewPref ?? (narrow ? 'list' : 'grid')
+
+  const payload = flightsPayload(state)
+  const substate = flightsSubstate(state)
+
+  const selectedRef = useRef<string | null>(selected)
+  selectedRef.current = selected
+  const payloadRef = useRef(payload)
+  payloadRef.current = payload
+
+  // Register verbs, the view/selection UI handler, and the local glossary on
+  // mount; unregister on unmount. Glossary registration is idempotent.
+  useEffect(() => {
+    registerFlightsGlossary()
+    const unregister = registerFlightsVerbs({
+      selectedFlightId: () => selectedRef.current,
+      payload: () => payloadRef.current,
+    })
+    const unregisterUi = registerScreenUiHandler(FLIGHTS_SCREEN_ID, (detail) => {
+      const ui = asFlightsUiCommand(detail)
+      if (!ui) return
+      if (ui.kind === 'BACK') setSelected(null)
+      else if (ui.kind === 'SELECT') setSelected(ui.flightId)
+      else {
+        setViewPreference(ui.view)
+      }
+    })
+    return () => {
+      unregister()
+      unregisterUi()
+    }
+  }, [])
+
+  // Subscribe to engine events. Storm steps announce the forecast line and play
+  // the scope-tick / forecast cue; the single correction event announces the
+  // coalesced material-change line and plays the two-tone cue; probe replies
+  // (sourceCheckResolved) announce politely and reveal the OBSERVED report. The
+  // shell schedules nothing and never re-coalesces with a timer; the engine
+  // emits exactly one correction event, so one announce() is all it takes.
+  const copyRef = useRef(buildEventCopy(state))
+  copyRef.current = buildEventCopy(state)
+  useEffect(() => {
+    return onEngineEvent((event: EngineEvent) => {
+      if (
+        event.type === 'scheduledEventFired' &&
+        (event.kind === 'flightsStorm' || event.kind === 'flightsCorrection')
+      ) {
+        const copy = copyRef.current.get(event.id)
+        if (copy) {
+          announce(copy.warningLine, 'polite')
+          play(copy.cueId)
+        }
+        return
+      }
+      if (event.type === 'sourceCheckResolved') {
+        setProbeResults((prev) => ({
+          ...prev,
+          [event.recordId]: { outcome: event.outcome },
+        }))
+        announce(
+          `FIELD REPORT ${event.recordId}: ${event.outcome}.`,
+          'polite',
+        )
+      }
+    })
+  }, [])
+
+  const onSelect = (flightId: string): void => setSelected(flightId)
+
+  const grounded = substate?.groundAll ?? false
+  const deadline = state.activeMission?.endsAt ?? null
+  const now = state.lastNow
+
+  if (!payload || !substate) {
+    return (
+      <div
+        data-testid="flights-screen"
+        data-mission-id={missionId}
+        data-view={view}
+        data-pane={narrow ? 'single' : 'two'}
+      >
+        <TerminalText dim>GROUND ALL FLIGHTS STANDING BY.</TerminalText>
+      </div>
+    )
+  }
+
+  const board = buildScoreboard(payload, substate)
+  const openExceptions = selectOpenExceptions(state)
+
+  const onGroundAllConfirmed = (): void => {
+    send(makeGroundAllAction())
+    setConfirmGround(false)
+  }
+
+  // A PROBE affordance for the selected flight's scheduled corridor, if one
+  // exists. PROBE resolves the corridor's field-report record and dispatches
+  // the engine-owned CHECK SOURCE; the result arrives as an emitted event.
+  const selectedFlight = selected
+    ? payload.flights.find((f) => f.id === selected) ?? null
+    : null
+  const selectedCorridor = selectedFlight
+    ? payload.corridors.find(
+        (c) =>
+          (c.fromHubId === selectedFlight.originHubId &&
+            c.toHubId === selectedFlight.destinationHubId) ||
+          (c.toHubId === selectedFlight.originHubId &&
+            c.fromHubId === selectedFlight.destinationHubId),
+      ) ?? null
+    : null
+
+  const onProbe = (): void => {
+    if (!selectedCorridor) return
+    const action = makeProbeAction(payload, selectedCorridor.id)
+    if (action) send(action)
+  }
+
+  return (
+    <div
+      data-testid="flights-screen"
+      data-mission-id={missionId}
+      data-view={view}
+      data-pane={narrow ? 'single' : 'two'}
+    >
+      <ArtSlot id="briefing-flights" />
+      <TerminalText dim>{BRIEFING}</TerminalText>
+
+      {/* The dual scoreboard, both fed from engine scoreboard facts. */}
+      <StatusLine>
+        {`OPEN EXCEPTIONS ${openExceptions}  RESOLVED ${board.resolved} PAX  HELD ${board.heldFlights}  STRANDED ${board.strandedFlights}`}
+      </StatusLine>
+      <div data-testid="dual-scoreboard">
+        <div data-testid="scoreboard-exceptions">
+          <GlossaryTerm id="open-exceptions" /> OPEN: {openExceptions}
+        </div>
+        <div data-testid="scoreboard-passengers">
+          PASSENGERS RESOLVED {board.resolved}, STRANDED {board.tally.stranded}
+        </div>
+      </div>
+
+      {deadline !== null ? (
+        <div className="flights-countdown" data-testid="flights-countdown">
+          <Countdown endsAt={deadline} />
+        </div>
+      ) : null}
+
+      {/* GROUND ALL, placed prominently with WOPR's directive, a confirmation
+          step, and a spent state after use. */}
+      <div className="flights-ground-all" data-testid="ground-all-control">
+        <TerminalText dim>{WOPR_DIRECTIVE}</TerminalText>
+        {grounded ? (
+          <button
+            type="button"
+            data-testid="ground-all-spent"
+            disabled
+          >
+            GROUND ALL (SPENT)
+          </button>
+        ) : confirmGround ? (
+          <div data-testid="ground-all-confirm">
+            <TerminalText>
+              GROUND ALL FLIGHTS IS IRREVERSIBLE. CONFIRM?
+            </TerminalText>
+            <button
+              type="button"
+              data-testid="ground-all-confirm-yes"
+              onClick={onGroundAllConfirmed}
+            >
+              CONFIRM GROUND ALL
+            </button>
+            <button
+              type="button"
+              data-testid="ground-all-confirm-no"
+              onClick={() => setConfirmGround(false)}
+            >
+              CANCEL
+            </button>
+          </div>
+        ) : (
+          <button
+            type="button"
+            data-testid="ground-all-button"
+            onClick={() => setConfirmGround(true)}
+          >
+            GROUND ALL
+          </button>
+        )}
+      </div>
+
+      <div className="flights-view-tabs" role="tablist">
+        <button
+          type="button"
+          role="tab"
+          data-testid="flights-tab-grid"
+          aria-selected={view === 'grid'}
+          onClick={() => setViewPreference('grid')}
+        >
+          MAP
+        </button>
+        <button
+          type="button"
+          role="tab"
+          data-testid="flights-tab-list"
+          aria-selected={view === 'list'}
+          onClick={() => setViewPreference('list')}
+        >
+          LIST
+        </button>
+      </div>
+
+      {/* The selected corridor's PROBE affordance and any revealed field
+          report. CHECK SOURCE stays engine-owned: PROBE dispatches it, the
+          verdict arrives as an emitted event. */}
+      {selectedCorridor ? (
+        <div data-testid="corridor-readout" data-corridor-id={selectedCorridor.id}>
+          <span>
+            CORRIDOR {selectedCorridor.id}{' '}
+            <GlossaryTerm id="flights-field-report" />
+          </span>
+          <button type="button" data-testid="probe-button" onClick={onProbe}>
+            PROBE {selectedCorridor.id}
+          </button>
+          {probeResults[selectedCorridor.fieldReportRecordId] ? (
+            <div
+              data-testid="corridor-report"
+              data-outcome={
+                probeResults[selectedCorridor.fieldReportRecordId]!.outcome
+              }
+            >
+              OBSERVED REPORT:{' '}
+              {probeResults[selectedCorridor.fieldReportRecordId]!.outcome}
+            </div>
+          ) : null}
+        </div>
+      ) : null}
+
+      <div className="flights-body">
+        {view === 'grid' ? (
+          <MapView
+            payload={payload}
+            state={substate}
+            selectedFlightId={selected}
+            onSelect={onSelect}
+            now={now}
+            deadline={deadline}
+          />
+        ) : (
+          <FlightListView
+            payload={payload}
+            state={substate}
+            selectedFlightId={selected}
+            onSelect={onSelect}
+            grounded={grounded}
+          />
+        )}
+      </div>
+    </div>
+  )
+}
+
+/** Register the screen under mission id flights, plus its title. Idempotent for
+ *  tests: the screen registry overwrites a prior registration. */
+export function registerFlightsScreen(): void {
+  registerMissionScreen(FLIGHTS, FlightsScreen)
+  registerMissionTitle(FLIGHTS, MISSION_TITLE)
+  registerFlightsGlossary()
+}
diff --git a/src/app/missions/flights/MapView.tsx b/src/app/missions/flights/MapView.tsx
new file mode 100644
index 0000000..6ef60e6
--- /dev/null
+++ b/src/app/missions/flights/MapView.tsx
@@ -0,0 +1,267 @@
+// The map pane: the character grid of the airspace, the legend, and the
+// selected-flight readout. The grid renders the pure mapModel output. Keyboard
+// selection is MARKER-ONLY: arrow keys cycle through the flight-marker cells in
+// reading order (computed by flightMarkerCells), wrapping at the ends; hub and
+// corridor cells are never selectable. A tap on a flight marker selects it; a
+// tap on an empty, hub, or corridor cell does not change selection. Selection
+// state is owned by FlightsScreen so the list shares it.
+//
+// The readout derives its viable destination set from the ENGINE legality
+// selector (destinationOptions -> routeLegality), never a reimplementation, and
+// shows projected arrival beside the deadline for an airborne flight so the
+// gamble is informed even when the projection lands late.
+import { useMemo } from 'react'
+import { CharacterGrid } from '../../grid'
+import { TerminalText } from '../../terminal/TerminalText'
+import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+import { buildMapModel, flightMarkerCells } from './mapModel'
+import {
+  destinationOptions,
+  groundControl,
+  projectedArrivalAt,
+} from './flightActions'
+import {
+  makeDivertAction,
+  makeHoldAction,
+  makeLandAction,
+  makeReleaseAction,
+} from './verbs'
+
+export interface MapViewProps {
+  readonly payload: FlightsPayload
+  readonly state: FlightsState
+  readonly selectedFlightId: string | null
+  readonly onSelect: (flightId: string) => void
+  /** The drained engine clock the state was last folded to, for projected
+   *  arrival math. Never a wall-clock read. */
+  readonly now: number
+  /** The active deadline in engine time, for the gamble readout. */
+  readonly deadline: number | null
+}
+
+function formatMs(ms: number): string {
+  const totalSeconds = Math.round(ms / 1000)
+  const minutes = Math.floor(totalSeconds / 60)
+  const seconds = totalSeconds % 60
+  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
+}
+
+export function MapView({
+  payload,
+  state,
+  selectedFlightId,
+  onSelect,
+  now,
+  deadline,
+}: MapViewProps) {
+  const model = useMemo(
+    () => buildMapModel(state, payload, selectedFlightId),
+    [state, payload, selectedFlightId],
+  )
+  const markers = useMemo(
+    () => flightMarkerCells(state, payload),
+    [state, payload],
+  )
+
+  // The grid selection cell is the selected flight's marker cell, so the grid
+  // highlights it. Keyboard cycling is marker-only: we translate an arrow move
+  // into the next/previous marker in reading order, never a free cursor.
+  const selectedIndex = markers.findIndex((m) => m.flightId === selectedFlightId)
+  const selection =
+    selectedIndex >= 0
+      ? { row: markers[selectedIndex]!.row, col: markers[selectedIndex]!.col }
+      : null
+
+  const cycle = (delta: number): void => {
+    if (markers.length === 0) return
+    const base = selectedIndex >= 0 ? selectedIndex : delta > 0 ? -1 : 0
+    const next = (base + delta + markers.length) % markers.length
+    onSelect(markers[next]!.flightId)
+  }
+
+  // Grid onSelect gives us a (row, col). Marker-only: select a flight only when
+  // the tapped cell is a marker cell; otherwise ignore. Arrow keys arrive here
+  // too (the grid clamps to a neighbor cell), so we additionally bind keydown
+  // on the wrapper to do reading-order cycling.
+  const onGridSelect = (row: number, col: number): void => {
+    const marker = markers.find((m) => m.row === row && m.col === col)
+    if (marker) onSelect(marker.flightId)
+  }
+
+  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
+    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
+      event.preventDefault()
+      event.stopPropagation()
+      cycle(1)
+    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
+      event.preventDefault()
+      event.stopPropagation()
+      cycle(-1)
+    }
+  }
+
+  return (
+    <div data-testid="map-view">
+      {/* The keydown wrapper enforces marker-only cycling before the grid's own
+          free-cursor handler runs. */}
+      <div data-testid="map-grid-wrap" onKeyDownCapture={onKeyDown}>
+        <CharacterGrid
+          id="flights-map"
+          cells={model.cells}
+          selection={selection}
+          onSelect={onGridSelect}
+          legend={
+            <ul data-testid="map-legend-list" className="flights-legend">
+              {model.legend.map((entry) => (
+                <li
+                  key={entry.id}
+                  data-testid={`legend-${entry.id}`}
+                  data-class-hook={entry.classHook}
+                >
+                  <span className={entry.classHook}>{entry.glyph}</span>{' '}
+                  {entry.label}
+                </li>
+              ))}
+            </ul>
+          }
+        />
+      </div>
+
+      <Readout
+        payload={payload}
+        state={state}
+        selectedFlightId={selectedFlightId}
+        now={now}
+        deadline={deadline}
+      />
+    </div>
+  )
+}
+
+function Readout({
+  payload,
+  state,
+  selectedFlightId,
+  now,
+  deadline,
+}: {
+  readonly payload: FlightsPayload
+  readonly state: FlightsState
+  readonly selectedFlightId: string | null
+  readonly now: number
+  readonly deadline: number | null
+}) {
+  if (selectedFlightId === null) {
+    return (
+      <div data-testid="flight-readout" data-flight-id="">
+        <TerminalText dim>SELECT A FLIGHT TO SEE ITS OPTIONS.</TerminalText>
+      </div>
+    )
+  }
+  const flight = payload.flights.find((f) => f.id === selectedFlightId)
+  const fs = state.flights[selectedFlightId]
+  if (!flight || !fs) {
+    return (
+      <div data-testid="flight-readout" data-flight-id={selectedFlightId}>
+        <TerminalText dim>FLIGHT UNKNOWN.</TerminalText>
+      </div>
+    )
+  }
+
+  const options = destinationOptions(payload, state, selectedFlightId)
+  const ground = groundControl(payload, state, selectedFlightId)
+  const airborne = fs.status === 'airborne'
+
+  // The current hub or position: the hub it is inbound to when routed, else its
+  // origin hub (for a scheduled or held flight) or AIRBORNE when en route with
+  // no destination chosen.
+  const position =
+    fs.inboundHubId ?? (airborne ? 'AIRBORNE (NO DESTINATION)' : flight.originHubId)
+
+  const actions: ActionBarItem[] = []
+  for (const option of options) {
+    const makeAction = option.kind === 'LAND' ? makeLandAction : makeDivertAction
+    actions.push({
+      label: `${option.kind} ${option.hubId}`,
+      action: makeAction(selectedFlightId, option.hubId),
+      testId: `readout-${option.kind}-${option.hubId}`,
+      disabled: !option.legal,
+      disabledReason: option.reason,
+    })
+  }
+  actions.push({
+    label: 'HOLD',
+    action: makeHoldAction(selectedFlightId),
+    testId: 'readout-HOLD',
+    disabled: !ground.holdLegal,
+    disabledReason: ground.holdReason,
+  })
+  actions.push({
+    label: 'RELEASE',
+    action: makeReleaseAction(selectedFlightId),
+    testId: 'readout-RELEASE',
+    disabled: !ground.releaseLegal,
+    disabledReason: ground.releaseReason,
+  })
+
+  return (
+    <div data-testid="flight-readout" data-flight-id={selectedFlightId}>
+      <TerminalText>
+        {[
+          `FLIGHT ${flight.id}  ${fs.status.toUpperCase()}`,
+          `POSITION ${position}`,
+          `${flight.passengers} PASSENGERS`,
+        ].join('\n')}
+      </TerminalText>
+
+      <div data-testid="readout-runways">
+        <GlossaryTerm id="flights-runway-slot" /> FREE:{' '}
+        {options.map((o) => (
+          <span key={o.hubId} data-testid={`readout-runway-${o.hubId}`}>
+            {o.hubId} {o.runwayFree}
+            {'  '}
+          </span>
+        ))}
+      </div>
+
+      {/* The informed-gamble readout: for an airborne flight, projected arrival
+          beside the deadline at EVERY offered destination, so a divert that
+          lands late is visibly a gamble, not auto-corrected away. */}
+      {airborne && deadline !== null ? (
+        <div data-testid="readout-arrivals">
+          {options.map((o) => {
+            const proj = projectedArrivalAt(
+              payload,
+              state,
+              selectedFlightId,
+              o.hubId,
+              now,
+            )
+            if (!proj) return null
+            const late = proj.arrivalAt > deadline
+            return (
+              <div
+                key={o.hubId}
+                data-testid={`readout-arrival-${o.hubId}`}
+                data-late={late ? 'true' : 'false'}
+              >
+                {`${o.kind} ${o.hubId}: ARRIVES T+${formatMs(
+                  proj.arrivalAt - now,
+                )}  DEADLINE T+${formatMs(deadline - now)}`}
+                {late ? '  PAST DEADLINE (GAMBLE)' : ''}
+              </div>
+            )
+          })}
+        </div>
+      ) : null}
+
+      <div data-testid="readout-destinations">
+        <TerminalText dim>VIABLE DESTINATIONS:</TerminalText>
+        <ActionBar actions={actions} />
+      </div>
+    </div>
+  )
+}
diff --git a/src/app/missions/flights/flightActions.ts b/src/app/missions/flights/flightActions.ts
new file mode 100644
index 0000000..a178337
--- /dev/null
+++ b/src/app/missions/flights/flightActions.ts
@@ -0,0 +1,110 @@
+// Shared, pure helpers that shape the per-flight action rows for BOTH the
+// readout panel and the flight list, so the two paths never diverge. These hold
+// NO legality logic of their own: every legal/illegal decision comes from the
+// engine selectors (routeLegality, holdLegality, releaseLegality) imported from
+// src/engine/missions/flights/rules.ts. That is the parity contract: the shell
+// offers exactly what the engine accepts, proven by deepStrictEqual in the
+// readout-parity test.
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+import {
+  divertArrivalAt,
+  flightById,
+  holdLegality,
+  landingArrivalAt,
+  releaseLegality,
+  routeLegality,
+  type RouteReason,
+} from '@engine/missions/flights/rules'
+
+export interface DestinationOption {
+  readonly hubId: string
+  readonly hubName: string
+  /** LAND when the hub is the flight's own destination, DIVERT otherwise. */
+  readonly kind: 'LAND' | 'DIVERT'
+  readonly legal: boolean
+  /** The engine rejection reason when not legal; undefined when legal. */
+  readonly reason?: RouteReason
+  /** Runway slots free at this hub right now (for the readout runway column). */
+  readonly runwayFree: number
+}
+
+/** Every hub as a routing option for a flight, each judged by the ENGINE
+ *  routeLegality selector. LAND for the flight's own destination hub, DIVERT for
+ *  the rest. The viable subset (legal === true) is the readout's offered
+ *  destination set; the parity test compares it against the same selector. */
+export function destinationOptions(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flightId: string,
+): DestinationOption[] {
+  const flight = flightById(payload, flightId)
+  return payload.hubs.map((hub) => {
+    const legality = routeLegality(payload, state, flightId, hub.id)
+    const used = state.runwayUse[hub.id] ?? 0
+    const runwayFree = Math.max(0, hub.runwaySlots - used)
+    return {
+      hubId: hub.id,
+      hubName: hub.name,
+      kind: flight && hub.id === flight.destinationHubId ? 'LAND' : 'DIVERT',
+      legal: legality.legal,
+      reason: legality.legal ? undefined : legality.reason,
+      runwayFree,
+    }
+  })
+}
+
+/** The viable (legal) destination hub ids for a flight, in payload hub order.
+ *  This is exactly the set the engine legality selector accepts. */
+export function viableDestinationHubIds(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flightId: string,
+): string[] {
+  return destinationOptions(payload, state, flightId)
+    .filter((o) => o.legal)
+    .map((o) => o.hubId)
+}
+
+export interface GroundControlRow {
+  readonly holdLegal: boolean
+  readonly holdReason?: string
+  readonly releaseLegal: boolean
+  readonly releaseReason?: string
+}
+
+/** HOLD/RELEASE legality for a flight, straight from the engine selectors. */
+export function groundControl(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flightId: string,
+): GroundControlRow {
+  const h = holdLegality(state, flightId)
+  const r = releaseLegality(payload, state, flightId)
+  return {
+    holdLegal: h.legal,
+    holdReason: h.legal ? undefined : h.reason,
+    releaseLegal: r.legal,
+    releaseReason: r.legal ? undefined : r.reason,
+  }
+}
+
+/** Projected arrival and the on-time baseline for an airborne flight that has
+ *  not yet been routed, at a candidate hub. Used by the readout to show the
+ *  gamble: projected arrival beside the deadline, even when it lands late. Pure
+ *  engine math (landingArrivalAt / divertArrivalAt), evaluated at the drained
+ *  clock the state was last folded to. */
+export function projectedArrivalAt(
+  payload: FlightsPayload,
+  state: FlightsState,
+  flightId: string,
+  hubId: string,
+  now: number,
+): { arrivalAt: number; onTimeAt: number } | null {
+  const flight = flightById(payload, flightId)
+  if (!flight) return null
+  return {
+    arrivalAt: divertArrivalAt(payload, state, flight, hubId, now),
+    onTimeAt: landingArrivalAt(flight, now),
+  }
+}
diff --git a/src/app/missions/flights/glossary.ts b/src/app/missions/flights/glossary.ts
new file mode 100644
index 0000000..ef52339
--- /dev/null
+++ b/src/app/missions/flights/glossary.ts
@@ -0,0 +1,65 @@
+// The six local GROUND ALL FLIGHTS glossary terms. OBSERVED, EXERCISE, and
+// DERIVED are GLOBAL (registered by the shell) and must not be re-registered
+// here. Definitions are plain language for a smart layperson; rendered labels
+// are uppercase terminal diction with no em-dashes. Registration is idempotent
+// so a screen remount never trips the duplicate-id guard.
+import {
+  hasGlossaryEntry,
+  registerGlossaryTerms,
+  type GlossaryEntry,
+} from '../../a11y/glossary'
+
+export const FLIGHTS_LOCAL_GLOSSARY_IDS = [
+  'flights-corridor',
+  'flights-runway-slot',
+  'flights-arrival-queue',
+  'flights-projection',
+  'flights-field-report',
+  'flights-all-hubs-restriction',
+] as const
+
+const ENTRIES: readonly GlossaryEntry[] = [
+  {
+    id: 'flights-corridor',
+    term: 'CORRIDOR',
+    definition:
+      'A protected air lane between two hubs. A flight can only use the corridor that joins its position to the hub it is heading for; if the storm closes that lane, the flight cannot take it.',
+  },
+  {
+    id: 'flights-runway-slot',
+    term: 'RUNWAY SLOT',
+    definition:
+      'One landing space at a hub. A hub has a fixed number; once they are all taken, no more flights can land there until one clears.',
+  },
+  {
+    id: 'flights-arrival-queue',
+    term: 'ARRIVAL QUEUE',
+    definition:
+      'The line of flights waiting to land at a hub. Diverting into a busy hub adds queue delay, so the flight arrives later than a direct landing would.',
+  },
+  {
+    id: 'flights-projection',
+    term: 'PROJECTION',
+    definition:
+      'The forecast of where the storm is expected to go, drawn hatched on the map. It is a prediction, not the current truth, and a mid-mission correction can replace it.',
+  },
+  {
+    id: 'flights-field-report',
+    term: 'FIELD REPORT',
+    definition:
+      'A ground observation of actual conditions on a corridor. A PROBE asks the desk to verify one, and the answer comes back as OBSERVED or disputed.',
+  },
+  {
+    id: 'flights-all-hubs-restriction',
+    term: 'ALL-HUBS RESTRICTION',
+    definition:
+      'A blanket order marking every hub restricted at once. On the map it reads as a single distinct marker, separate from any one storm closure.',
+  },
+]
+
+/** Register the six local terms, once. Idempotent across remounts: already
+ *  present ids are skipped so the duplicate-id guard never throws. */
+export function registerFlightsGlossary(): void {
+  const fresh = ENTRIES.filter((e) => !hasGlossaryEntry(e.id))
+  if (fresh.length > 0) registerGlossaryTerms(fresh)
+}
diff --git a/src/app/missions/flights/mapModel.ts b/src/app/missions/flights/mapModel.ts
new file mode 100644
index 0000000..8c44e90
--- /dev/null
+++ b/src/app/missions/flights/mapModel.ts
@@ -0,0 +1,236 @@
+// The pure character-map projection for GROUND ALL FLIGHTS. No React, no DOM,
+// no timers, no Date. It reads ONLY the drained flights substate plus the
+// immutable payload (and the current selection), and returns the cell matrix
+// the CharacterGrid renders plus the legend the MapView shows. Truth (actual
+// weather from drained state) renders solid; the authored forecast projection
+// renders hatched; the all-hubs restriction marker renders distinct from both.
+//
+// Critical separation contract: this never inspects the engine event queue and
+// never reads undrained truth. A pending (undrained) storm event in the queue
+// does not change the output; only the folded substate (closedHubs,
+// closedCorridors) and the applied-correction index do. The projection layer is
+// payload data (corrections) indexed by state.appliedCorrection, not substate
+// copy.
+//
+// Layout is a collision-free schematic: hubs on the top row, one corridor per
+// row beneath (its own segment, so overlapping edges never clobber each other),
+// then the all-hubs restriction row, then one flight-marker row. Every cell
+// position is a pure function of payload order, so identical payloads map
+// identically.
+import type { GridCell } from '../../grid'
+import type {
+  FlightsPayload,
+} from '@engine/missions/flights/content'
+import type { FlightState, FlightsState } from '@engine/missions/flights/types'
+import { isCorridorOpen, isHubOpen } from '@engine/missions/flights/rules'
+
+/** The per-cell class hooks the grid uses. Each names a theme token carrying at
+ *  most one shadow layer, per the grid contract. Distinct kinds so a test can
+ *  tell current weather (solid) from projection (hatched) from the restriction
+ *  marker without reading color. */
+export const CELL = {
+  empty: 'cell-empty',
+  hubOpen: 'cell-hub-open',
+  hubClosed: 'cell-hub-closed',
+  corridorOpen: 'cell-corridor-open',
+  corridorStorm: 'cell-corridor-storm',
+  corridorProjection: 'cell-corridor-projection',
+  restriction: 'cell-restriction',
+  flight: 'cell-flight',
+  flightSelected: 'cell-flight-selected',
+} as const
+
+/** The characters each kind draws. Solid vs hatched is a glyph difference, not
+ *  a color difference, so the distinction survives a monochrome terminal. */
+const GLYPH = {
+  empty: ' ',
+  hubOpenLeft: '[',
+  hubOpenRight: ']',
+  hubClosedLeft: '{',
+  hubClosedRight: '}',
+  corridorOpen: '-',
+  corridorStorm: '#',
+  corridorProjection: ':',
+  restriction: '!',
+} as const
+
+export interface LegendEntry {
+  readonly id: string
+  readonly glyph: string
+  readonly classHook: string
+  readonly label: string
+}
+
+export interface MapModel {
+  readonly cells: GridCell[][]
+  readonly legend: LegendEntry[]
+}
+
+const GRID_COLS = 20
+/** Column a hub's two-cell bracket starts at. Hubs are spaced four columns
+ *  apart along the top row so up to four brackets fit the canvas. */
+function hubCol(index: number): number {
+  return 1 + index * 4
+}
+
+function blankRow(): GridCell[] {
+  const row: GridCell[] = []
+  for (let c = 0; c < GRID_COLS; c += 1) {
+    row.push({ char: GLYPH.empty, classHook: CELL.empty })
+  }
+  return row
+}
+
+function set(row: GridCell[], col: number, cell: GridCell): void {
+  if (col < 0 || col >= GRID_COLS) return
+  row[col] = cell
+}
+
+/** Whether the corridor's forecast is projected to change (hatched): the
+ *  authored projection corrections NOT yet applied name this corridor. Read
+ *  from payload corrections plus state.appliedCorrection, never from substate
+ *  copy and never from the event queue. */
+function corridorProjectionPending(
+  payload: FlightsPayload,
+  state: FlightsState,
+  corridorId: string,
+): boolean {
+  return payload.corrections
+    .slice(state.appliedCorrection)
+    .some((c) => c.changedId === corridorId)
+}
+
+/** A short status glyph for a flight marker. The status word itself lives in
+ *  the readout and list, not the map, so the map stays fixed-width. */
+function flightGlyph(status: FlightState['status']): string {
+  switch (status) {
+    case 'scheduled':
+      return 'o'
+    case 'airborne':
+      return '*'
+    case 'held':
+    case 'heldFinal':
+      return 'H'
+    case 'landed':
+    case 'landedLate':
+    case 'divertedLanded':
+      return '='
+    case 'stranded':
+      return 'x'
+    default:
+      return '?'
+  }
+}
+
+/** The ordered flight-marker cell positions in reading order (row-major). The
+ *  keyboard cycler in MapView walks exactly this list, so marker-only selection
+ *  is defined here, purely, not in the view. Markers occupy one dedicated row,
+ *  one column each, in authored flight order. */
+export function flightMarkerCells(
+  _state: FlightsState,
+  payload: FlightsPayload,
+): Array<{ flightId: string; row: number; col: number }> {
+  const markerRow = flightRowIndex(payload)
+  return payload.flights.map((f, index) => ({
+    flightId: f.id,
+    row: markerRow,
+    col: 1 + index * 2,
+  }))
+}
+
+/** Row indices derived purely from payload size: hubs on row 0, one row per
+ *  corridor, the restriction on its own row, then the flight-marker row. */
+const HUB_ROW = 0
+function corridorRowIndex(index: number): number {
+  return 1 + index
+}
+function restrictionRowIndex(payload: FlightsPayload): number {
+  return 1 + payload.corridors.length
+}
+function flightRowIndex(payload: FlightsPayload): number {
+  return restrictionRowIndex(payload) + 1
+}
+
+/** The legend, derived from payload data alone (no substate). It enumerates the
+ *  cell kinds a player must distinguish: open and closed hubs, open corridors,
+ *  storm-closed corridors (current weather, solid), projected-change corridors
+ *  (hatched), the all-hubs restriction marker, and the flight statuses. */
+export function buildLegend(payload: FlightsPayload): LegendEntry[] {
+  if (payload.hubs.length === 0) return []
+  return [
+    { id: 'hub-open', glyph: `${GLYPH.hubOpenLeft}${GLYPH.hubOpenRight}`, classHook: CELL.hubOpen, label: 'HUB OPEN' },
+    { id: 'hub-closed', glyph: `${GLYPH.hubClosedLeft}${GLYPH.hubClosedRight}`, classHook: CELL.hubClosed, label: 'HUB CLOSED' },
+    { id: 'corridor-open', glyph: GLYPH.corridorOpen, classHook: CELL.corridorOpen, label: 'CORRIDOR OPEN' },
+    { id: 'corridor-storm', glyph: GLYPH.corridorStorm, classHook: CELL.corridorStorm, label: 'STORM CLOSED (CURRENT, SOLID)' },
+    { id: 'corridor-projection', glyph: GLYPH.corridorProjection, classHook: CELL.corridorProjection, label: 'PROJECTED CHANGE (HATCHED)' },
+    { id: 'restriction', glyph: GLYPH.restriction, classHook: CELL.restriction, label: 'ALL-HUBS RESTRICTION' },
+    { id: 'flight-airborne', glyph: '*', classHook: CELL.flight, label: 'FLIGHT AIRBORNE' },
+    { id: 'flight-held', glyph: 'H', classHook: CELL.flight, label: 'FLIGHT HELD' },
+  ]
+}
+
+/** The pure map projection. */
+export function buildMapModel(
+  state: FlightsState,
+  payload: FlightsPayload,
+  selectedFlightId: string | null,
+): MapModel {
+  const rowCount = flightRowIndex(payload) + 1
+  const cells: GridCell[][] = []
+  for (let r = 0; r < rowCount; r += 1) cells.push(blankRow())
+
+  // Hubs on the top row: a two-cell bracket per hub, open vs closed from
+  // drained truth.
+  payload.hubs.forEach((hub, index) => {
+    const open = isHubOpen(state, hub.id)
+    const left = open ? GLYPH.hubOpenLeft : GLYPH.hubClosedLeft
+    const right = open ? GLYPH.hubOpenRight : GLYPH.hubClosedRight
+    const hook = open ? CELL.hubOpen : CELL.hubClosed
+    const col = hubCol(index)
+    set(cells[HUB_ROW]!, col, { char: left, classHook: hook })
+    set(cells[HUB_ROW]!, col + 1, { char: right, classHook: hook })
+  })
+
+  // One corridor per row: a short horizontal segment, solid when storm-closed
+  // (current weather), hatched when a pending projection correction names it,
+  // open otherwise. Each on its own row so overlapping edges never clobber.
+  payload.corridors.forEach((corridor, index) => {
+    const row = cells[corridorRowIndex(index)]!
+    const stormClosed = !isCorridorOpen(state, corridor.id)
+    const projected = corridorProjectionPending(payload, state, corridor.id)
+    const char = stormClosed
+      ? GLYPH.corridorStorm
+      : projected
+        ? GLYPH.corridorProjection
+        : GLYPH.corridorOpen
+    const hook = stormClosed
+      ? CELL.corridorStorm
+      : projected
+        ? CELL.corridorProjection
+        : CELL.corridorOpen
+    for (let col = 1; col <= 4; col += 1) set(row, col, { char, classHook: hook })
+  })
+
+  // The all-hubs restriction marker, distinct from both weather kinds. It
+  // appears whenever ANY hub is closed by storm truth (the restriction is the
+  // fleet-wide read of the closures).
+  if (state.closedHubs.length > 0) {
+    set(cells[restrictionRowIndex(payload)]!, 1, {
+      char: GLYPH.restriction,
+      classHook: CELL.restriction,
+    })
+  }
+
+  // Flight markers, one per column in a dedicated row, selection-aware.
+  for (const marker of flightMarkerCells(state, payload)) {
+    const fs = state.flights[marker.flightId]
+    if (!fs) continue
+    const selected = marker.flightId === selectedFlightId
+    set(cells[marker.row]!, marker.col, {
+      char: flightGlyph(fs.status),
+      classHook: selected ? CELL.flightSelected : CELL.flight,
+    })
+  }
+
+  return { cells, legend: buildLegend(payload) }
+}
diff --git a/src/app/missions/flights/selectors.ts b/src/app/missions/flights/selectors.ts
new file mode 100644
index 0000000..ac193c9
--- /dev/null
+++ b/src/app/missions/flights/selectors.ts
@@ -0,0 +1,89 @@
+// Read-only selectors over the active campaign for the GROUND ALL FLIGHTS
+// screen, plus the persisted grid/list view preference. Authored truth (hub
+// names, passenger counts, the projection, corridor labels) lives in the
+// immutable seed payload; live status lives in the mission substate. These pull
+// both from the running context and state so the views render whatever payload
+// is active, never a hardcoded one.
+import type { CampaignState } from '@engine'
+import type { MissionModule } from '@engine'
+import { getContext } from '../../state'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+
+const FLIGHTS = 'flights'
+
+/** The immutable authored payload for the active flights mission, or undefined
+ *  when no flights payload is present on the active seed. Callers guard the
+ *  undefined case. */
+export function flightsPayload(state: CampaignState): FlightsPayload | undefined {
+  const seed = getContext().seeds[state.seedName]
+  return seed?.missionPayloads[FLIGHTS] as FlightsPayload | undefined
+}
+
+/** The live flights substate, or null before the mission starts. */
+export function flightsSubstate(state: CampaignState): FlightsState | null {
+  if (state.activeMission?.missionId !== FLIGHTS) return null
+  return (state.activeMission.substate as FlightsState) ?? null
+}
+
+/** The flights mission module from the context: its validate() is the single
+ *  source of truth for whether an action is currently legal. */
+export function flightsModule(): MissionModule<FlightsState> {
+  return getContext().missions[FLIGHTS] as MissionModule<FlightsState>
+}
+
+// ---- Persisted grid/list view preference -------------------------------
+// The user's explicit grid/list choice persists across reloads and wins over
+// the viewport-derived default thereafter. In-memory is the session source of
+// truth (works where localStorage is blocked, e.g. a headless test env);
+// localStorage persists across reloads and a corrupt read falls to no-preference
+// without throwing. Mirrors the audio-prefs persistence pattern.
+export type FlightsView = 'grid' | 'list'
+
+const VIEW_KEY = 'wargames.flights.view'
+
+let viewPref: FlightsView | null | undefined
+const listeners = new Set<() => void>()
+
+function load(): FlightsView | null {
+  if (viewPref !== undefined) return viewPref
+  try {
+    const raw = window.localStorage.getItem(VIEW_KEY)
+    viewPref = raw === 'grid' || raw === 'list' ? raw : null
+  } catch {
+    viewPref = null
+  }
+  return viewPref
+}
+
+/** The stored explicit preference, or null when the user has never chosen. */
+export function getViewPreference(): FlightsView | null {
+  return load()
+}
+
+/** Store the user's explicit grid/list choice. Persists and notifies. */
+export function setViewPreference(view: FlightsView): void {
+  viewPref = view
+  try {
+    window.localStorage.setItem(VIEW_KEY, view)
+  } catch {
+    // In-memory still backs the session.
+  }
+  for (const listener of listeners) listener()
+}
+
+export function onViewPreference(listener: () => void): () => void {
+  listeners.add(listener)
+  return () => listeners.delete(listener)
+}
+
+/** Test-only: forget the stored preference. */
+export function __resetFlightsView(): void {
+  viewPref = undefined
+  try {
+    window.localStorage.removeItem(VIEW_KEY)
+  } catch {
+    // ignore
+  }
+  listeners.clear()
+}
diff --git a/src/app/missions/flights/verbs.ts b/src/app/missions/flights/verbs.ts
new file mode 100644
index 0000000..369bbd9
--- /dev/null
+++ b/src/app/missions/flights/verbs.ts
@@ -0,0 +1,236 @@
+// The GROUND ALL FLIGHTS verb grammar and the shared action builders. Every
+// on-screen button and every typed command routes through the SAME builder, so
+// the command-button identity tests hold by construction: a parsed LAND
+// strict-equals the action the LAND button dispatches, and so on for DIVERT,
+// HOLD, RELEASE, PROBE, GROUND ALL, TRACE, CHECK SOURCE. Diction is uppercase
+// terminal; no em-dashes. The engine validator is the single source of truth
+// for what is currently legal; these builders only shape actions, never judge
+// them.
+//
+// PROBE is corridor-specific sugar for the campaign REQUEST_SOURCE_CHECK: it
+// resolves the corridor's authored field-report record id from the payload
+// (buildTargetRecordId, the engine's own mapper) and dispatches the generic
+// CHECK SOURCE against it. The shell schedules nothing; the desk reply arrives
+// later as a sourceCheckResolved emitted event.
+import type { CampaignAction } from '@engine'
+import {
+  registerScreenVerbs,
+  unregisterScreenVerbs,
+  type ParseResult,
+  type VerbRegistration,
+} from '../../terminal'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import { buildTargetRecordId } from '@engine/missions/flights/rules'
+
+export type MissionAction = Extract<CampaignAction, { type: 'MISSION_ACTION' }>
+
+export const FLIGHTS_SCREEN_ID = 'mission:flights'
+
+/** The view and selection commands the screen owns. GRID / LIST switch the
+ *  view (persisted); SELECT <flight> sets the shared selection; BACK clears it.
+ *  These ride the shell's mission-scoped SCREEN ui command as the detail, so
+ *  the single shared command line dispatches them to the screen's handler. */
+export type FlightsUiCommand =
+  | { readonly kind: 'VIEW'; readonly view: 'grid' | 'list' }
+  | { readonly kind: 'SELECT'; readonly flightId: string }
+  | { readonly kind: 'BACK' }
+
+/** Narrow an opaque SCREEN-command detail back to a FlightsUiCommand. The
+ *  screen's handler calls this; a malformed detail yields null. */
+export function asFlightsUiCommand(detail: unknown): FlightsUiCommand | null {
+  if (typeof detail !== 'object' || detail === null) return null
+  const kind = (detail as { kind?: unknown }).kind
+  if (kind === 'BACK') return { kind: 'BACK' }
+  if (kind === 'VIEW') {
+    const view = (detail as { view?: unknown }).view
+    if (view === 'grid' || view === 'list') return { kind: 'VIEW', view }
+  }
+  if (kind === 'SELECT') {
+    const flightId = (detail as { flightId?: unknown }).flightId
+    if (typeof flightId === 'string') return { kind: 'SELECT', flightId }
+  }
+  return null
+}
+
+function screenUi(detail: FlightsUiCommand): ParseResult {
+  return {
+    kind: 'ui',
+    command: { kind: 'SCREEN', screenId: FLIGHTS_SCREEN_ID, detail },
+  }
+}
+
+// The shared action builders. Both the typed command and the button path call
+// these, so a parsed action is deep-equal to a button action.
+export function makeLandAction(flightId: string, hubId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId, hubId } }
+}
+
+export function makeDivertAction(flightId: string, hubId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId, hubId } }
+}
+
+export function makeHoldAction(flightId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId } }
+}
+
+export function makeReleaseAction(flightId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId } }
+}
+
+export function makeGroundAllAction(): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }
+}
+
+/** TRACE inspects a record (the restriction record, D-83). Campaign action. */
+export function makeTraceAction(recordId: string): CampaignAction {
+  return { type: 'INSPECT_RECORD', recordId }
+}
+
+/** CHECK SOURCE is the engine-owned generic form: a campaign action against a
+ *  record id directly. The verdict is engine-resolved; the shell never computes
+ *  it. */
+export function makeCheckSourceAction(recordId: string): CampaignAction {
+  return { type: 'REQUEST_SOURCE_CHECK', recordId }
+}
+
+/** PROBE is corridor-specific sugar: resolve the corridor's field-report record
+ *  id from the payload, then dispatch the generic CHECK SOURCE against it.
+ *  Returns null for an unknown corridor so the caller renders no affordance. */
+export function makeProbeAction(
+  payload: FlightsPayload,
+  corridorId: string,
+): CampaignAction | null {
+  const recordId = buildTargetRecordId(payload, corridorId)
+  return recordId === null ? null : makeCheckSourceAction(recordId)
+}
+
+function err(message: string): ParseResult {
+  return { kind: 'error', message }
+}
+
+function action(a: CampaignAction): ParseResult {
+  return { kind: 'action', action: a }
+}
+
+export interface FlightsVerbContext {
+  /** The currently selected flight id, for commands that omit it. */
+  readonly selectedFlightId: () => string | null
+  /** The active flights payload, for PROBE's corridor-to-record resolution. */
+  readonly payload: () => FlightsPayload | undefined
+}
+
+/** The verbs that dispatch engine actions, plus the view and selection verbs. */
+export function buildFlightsVerbs(
+  ctx: FlightsVerbContext,
+): readonly VerbRegistration[] {
+  const requireFlight = (explicit: string | undefined): string | null =>
+    explicit ?? ctx.selectedFlightId()
+
+  return [
+    {
+      verb: 'LAND',
+      helpText: 'LAND <FLIGHT> <HUB>   route an airborne flight to its hub',
+      parse: (tokens) => {
+        const flightId = requireFlight(tokens[0])
+        const hubId = tokens[1]
+        if (!flightId) return err('NO FLIGHT SELECTED')
+        if (!hubId) return err('NO HUB SELECTED')
+        return action(makeLandAction(flightId, hubId))
+      },
+    },
+    {
+      verb: 'DIVERT',
+      helpText: 'DIVERT <FLIGHT> <HUB>  route an airborne flight to another hub',
+      parse: (tokens) => {
+        const flightId = requireFlight(tokens[0])
+        const hubId = tokens[1]
+        if (!flightId) return err('NO FLIGHT SELECTED')
+        if (!hubId) return err('NO HUB SELECTED')
+        return action(makeDivertAction(flightId, hubId))
+      },
+    },
+    {
+      verb: 'HOLD',
+      helpText: 'HOLD <FLIGHT>         hold a scheduled flight on the ground',
+      parse: (tokens) => {
+        const flightId = requireFlight(tokens[0])
+        return flightId ? action(makeHoldAction(flightId)) : err('NO FLIGHT SELECTED')
+      },
+    },
+    {
+      verb: 'RELEASE',
+      helpText: 'RELEASE <FLIGHT>      reverse a HOLD while the window is open',
+      parse: (tokens) => {
+        const flightId = requireFlight(tokens[0])
+        return flightId ? action(makeReleaseAction(flightId)) : err('NO FLIGHT SELECTED')
+      },
+    },
+    {
+      verb: 'GROUND',
+      helpText: 'GROUND ALL            blanket-ground the fleet (single use)',
+      parse: (tokens) => {
+        if (tokens[0] !== 'ALL') return err('UNRECOGNIZED COMMAND')
+        return action(makeGroundAllAction())
+      },
+    },
+    {
+      verb: 'PROBE',
+      helpText: 'PROBE <CORRIDOR>      ask the desk to verify a corridor report',
+      parse: (tokens) => {
+        const corridorId = tokens[0]
+        if (!corridorId) return err('NO CORRIDOR SELECTED')
+        const payload = ctx.payload()
+        const probe = payload ? makeProbeAction(payload, corridorId) : null
+        return probe ? action(probe) : err('UNKNOWN CORRIDOR')
+      },
+    },
+    {
+      verb: 'TRACE',
+      helpText: 'TRACE <RECORD>        inspect the restriction record',
+      parse: (tokens) => {
+        const recordId = tokens[0]
+        return recordId ? action(makeTraceAction(recordId)) : err('NO RECORD')
+      },
+    },
+    {
+      verb: 'CHECK',
+      helpText: 'CHECK SOURCE <RECORD> ask the desk to verify a record',
+      parse: (tokens) => {
+        if (tokens[0] !== 'SOURCE') return err('UNRECOGNIZED COMMAND')
+        const recordId = tokens[1]
+        return recordId ? action(makeCheckSourceAction(recordId)) : err('NO RECORD')
+      },
+    },
+    {
+      verb: 'GRID',
+      helpText: 'GRID                  show the character map',
+      parse: () => screenUi({ kind: 'VIEW', view: 'grid' }),
+    },
+    {
+      verb: 'LIST',
+      helpText: 'LIST                  show the flight list',
+      parse: () => screenUi({ kind: 'VIEW', view: 'list' }),
+    },
+    {
+      verb: 'SELECT',
+      helpText: 'SELECT <FLIGHT>       select a flight',
+      parse: (tokens) => {
+        const flightId = tokens[0]
+        return flightId
+          ? screenUi({ kind: 'SELECT', flightId })
+          : err('NO FLIGHT SELECTED')
+      },
+    },
+    {
+      verb: 'BACK',
+      helpText: 'BACK                  clear the selected flight',
+      parse: () => screenUi({ kind: 'BACK' }),
+    },
+  ]
+}
+
+/** Register the flights verbs for the screen scope; returns an unregister. */
+export function registerFlightsVerbs(ctx: FlightsVerbContext): () => void {
+  registerScreenVerbs(FLIGHTS_SCREEN_ID, buildFlightsVerbs(ctx))
+  return () => unregisterScreenVerbs(FLIGHTS_SCREEN_ID)
+}
diff --git a/test/app/missions/flights/MapView.keyboard.test.tsx b/test/app/missions/flights/MapView.keyboard.test.tsx
new file mode 100644
index 0000000..b5bca1d
--- /dev/null
+++ b/test/app/missions/flights/MapView.keyboard.test.tsx
@@ -0,0 +1,126 @@
+// Marker-only selection on the map. Arrow keys cycle the flight markers in
+// reading order, wrapping at the ends; hub and corridor cells are never
+// selectable by keyboard; a tap selects a flight marker only, and a tap on an
+// empty, hub, or corridor cell does not change selection.
+import { useState } from 'react'
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import type { CampaignState, EngineContext } from '@engine'
+import { MapView } from '@app/missions/flights/MapView'
+import { registerFlightsGlossary } from '@app/missions/flights/glossary'
+import { flightMarkerCells } from '@app/missions/flights/mapModel'
+import { FLIGHTS_FIXTURE_PAYLOAD, makeFlightsCtx, flightsSub } from './fixture'
+
+const T0 = 1_000_000
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+function started(ctx: EngineContext): CampaignState {
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, T0).state
+  return state
+}
+
+beforeEach(() => {
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerFlightsGlossary()
+})
+
+afterEach(() => {
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+/** A controlled MapView harness recording the current selection. Selection is
+ *  real component state so a re-render reflects each onSelect, exactly like the
+ *  FlightsScreen owner does. */
+function renderMap(initial: string | null) {
+  const ctx = makeFlightsCtx()
+  const sub = flightsSub(started(ctx))
+  const calls: string[] = []
+  function Harness() {
+    const [selected, setSelected] = useState<string | null>(initial)
+    return (
+      <MapView
+        payload={FLIGHTS_FIXTURE_PAYLOAD}
+        state={sub}
+        selectedFlightId={selected}
+        onSelect={(id) => {
+          calls.push(id)
+          setSelected(id)
+        }}
+        now={T0}
+        deadline={T0 + 240_000}
+      />
+    )
+  }
+  const utils = render(<Harness />)
+  const markers = flightMarkerCells(sub, FLIGHTS_FIXTURE_PAYLOAD)
+  return { ...utils, calls, markers, sub }
+}
+
+describe('marker-only selection', () => {
+  it('arrow keys cycle flight markers only, in reading order (row-major next marker), wrapping at the end', () => {
+    const { calls, markers } = renderMap(null)
+    const grid = screen.getByRole('grid')
+    // First ArrowRight from no selection lands on the first marker.
+    fireEvent.keyDown(grid, { key: 'ArrowRight' })
+    expect(calls[calls.length - 1]).toBe(markers[0]!.flightId)
+    // A sequence of forward moves walks the marker list in reading order and
+    // wraps at the end back to the first.
+    const seen: string[] = []
+    for (let i = 0; i < markers.length; i += 1) {
+      fireEvent.keyDown(grid, { key: 'ArrowRight' })
+      seen.push(calls[calls.length - 1]!)
+    }
+    // After the first landed on markers[0], the next N forward moves cycle
+    // markers[1], markers[2], ..., wrapping to markers[0].
+    const expected = markers.map((m, i) => markers[(i + 1) % markers.length]!.flightId)
+    expect(seen).toEqual(expected)
+  })
+
+  it('hub and corridor cells are never selectable by keyboard', () => {
+    const { calls } = renderMap(null)
+    const grid = screen.getByRole('grid')
+    // Every keyboard move resolves to a FLIGHT marker id, never a hub or
+    // corridor cell. Drive a batch of arrows and assert each call is a flight.
+    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
+      fireEvent.keyDown(grid, { key })
+    }
+    const flightIds = new Set(FLIGHTS_FIXTURE_PAYLOAD.flights.map((f) => f.id))
+    for (const call of calls) expect(flightIds.has(call)).toBe(true)
+  })
+
+  it('tap/click selects flight markers only; taps on empty, hub, or corridor cells do not change selection', () => {
+    const { calls, markers } = renderMap(null)
+    // Tap the first marker cell: it selects that flight.
+    const first = markers[0]!
+    const markerCell = document.getElementById(`flights-map-cell-${first.row}-${first.col}`)!
+    fireEvent.pointerDown(markerCell)
+    expect(calls[calls.length - 1]).toBe(first.flightId)
+
+    const before = calls.length
+    // Tap a hub cell (top row) and a corridor cell (a corridor row): no change.
+    const hubCell = document.getElementById('flights-map-cell-0-1')! // a hub bracket
+    fireEvent.pointerDown(hubCell)
+    const corridorCell = document.getElementById('flights-map-cell-1-1')! // a corridor segment
+    fireEvent.pointerDown(corridorCell)
+    // An empty cell too.
+    const emptyCell = document.getElementById('flights-map-cell-0-19')!
+    fireEvent.pointerDown(emptyCell)
+    expect(calls.length).toBe(before)
+  })
+})
diff --git a/test/app/missions/flights/__snapshots__/mapModel.test.ts.snap b/test/app/missions/flights/__snapshots__/mapModel.test.ts.snap
new file mode 100644
index 0000000..b29caa5
--- /dev/null
+++ b/test/app/missions/flights/__snapshots__/mapModel.test.ts.snap
@@ -0,0 +1,14 @@
+// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html
+
+exports[`mapModel projection > snapshots the cell matrix per state fixture: hubs bracketed, corridors as line characters, flight markers placed 1`] = `
+[
+  " []  []  []  []     ",
+  " ----               ",
+  " ::::               ",
+  " ----               ",
+  " ----               ",
+  " ----               ",
+  "                    ",
+  " o o o o o o o o    ",
+]
+`;
diff --git a/test/app/missions/flights/announcements.test.tsx b/test/app/missions/flights/announcements.test.tsx
new file mode 100644
index 0000000..5eb4e62
--- /dev/null
+++ b/test/app/missions/flights/announcements.test.tsx
@@ -0,0 +1,134 @@
+// Announcements and cues, with fake timers throughout to prove the shell sets
+// NO timers of its own: the projection correction announces exactly once
+// (coalesced, naming the changed corridor), politely, with the two-tone cue;
+// probe results announce politely and reveal the OBSERVED report; and advancing
+// jsdom fake timers without advancing the engine clock fires nothing. Every cue
+// and announcement is driven by an emitted event, never a wall clock.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, wake } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { onAnnounce } from '@app/a11y/announce'
+import * as audio from '@app/audio'
+import { resetAll } from '../../screens/harness'
+import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import { makeFlightsCtx } from './fixture'
+
+const T0 = 1_000_000
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+let teardown: () => void
+let announced: Array<{ text: string; channel: string }>
+let unAnnounce: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerFlightsScreen()
+  announced = []
+  unAnnounce = onAnnounce((text, channel) => announced.push({ text, channel }))
+  teardown = init({
+    ctx: makeFlightsCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'flights' })
+  })
+})
+
+afterEach(() => {
+  unAnnounce()
+  teardown()
+  __resetFlightsView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('announcements and cues', () => {
+  it('the projection correction announces exactly once, coalesced, naming the changed corridor, politely, with the two-tone cue', () => {
+    const playSpy = vi.spyOn(audio, 'play')
+    render(<ScreenRouter />)
+    // Advance the ENGINE clock past the correction at 50s (and the storm at 40s)
+    // so the single material-change event fires.
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 55_000)
+    act(() => {
+      wake()
+    })
+    // The correction warning names the changed corridor (MERIDIAN SABLE) and
+    // announces politely EXACTLY once (the raw sink sees one call for it).
+    const corrections = announced.filter(
+      (a) => a.channel === 'polite' && a.text.includes('MERIDIAN SABLE CLEARS SOONER'),
+    )
+    expect(corrections).toHaveLength(1)
+    // The two-tone correction cue played.
+    expect(playSpy).toHaveBeenCalledWith('tone-correct-1')
+  })
+
+  it('probe results (sourceCheckResolved) announce politely and reveal the OBSERVED report in the corridor readout', () => {
+    render(<ScreenRouter />)
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    const type = (text: string) => {
+      act(() => {
+        fireEvent.change(input, { target: { value: text } })
+        fireEvent.submit(screen.getByTestId('command-form'))
+      })
+    }
+    // Select WX101 (its corridor C-MC maps to field report W02), then PROBE.
+    type('SELECT WX101')
+    fireEvent.click(screen.getByTestId('probe-button'))
+    // No reveal yet: the desk reply is pending.
+    expect(screen.queryByTestId('corridor-report')).toBeNull()
+    // Advance past the desk delay (5s) so the reply resolves as an emitted
+    // event; the shell reveals the OBSERVED report and announces it.
+    announced.length = 0
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 10_000)
+    act(() => {
+      wake()
+    })
+    const report = screen.getByTestId('corridor-report')
+    expect(report).toHaveAttribute('data-outcome', 'CONFIRMED')
+    expect(
+      announced.some((a) => a.channel === 'polite' && /W02|CONFIRMED|FIELD REPORT/.test(a.text)),
+    ).toBe(true)
+  })
+
+  it('scope tick and two-tone cues fire only in response to emitted events; with fake timers advanced and no events, nothing fires', () => {
+    vi.useFakeTimers()
+    const playSpy = vi.spyOn(audio, 'play')
+    render(<ScreenRouter />)
+    // Advance jsdom fake timers WITHOUT advancing the engine clock: no emitted
+    // event, so no cue and no announcement.
+    act(() => {
+      vi.advanceTimersByTime(120_000)
+    })
+    expect(playSpy).not.toHaveBeenCalledWith('tone-storm-1')
+    expect(playSpy).not.toHaveBeenCalledWith('tone-correct-1')
+    expect(announced.some((a) => a.text.includes('MERIDIAN SABLE'))).toBe(false)
+    vi.useRealTimers()
+
+    // Advancing the engine clock fires the storm cue (an emitted event).
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 45_000)
+    act(() => {
+      wake()
+    })
+    expect(playSpy).toHaveBeenCalledWith('tone-storm-1')
+  })
+})
diff --git a/test/app/missions/flights/fixture.ts b/test/app/missions/flights/fixture.ts
new file mode 100644
index 0000000..22cea11
--- /dev/null
+++ b/test/app/missions/flights/fixture.ts
@@ -0,0 +1,185 @@
+// A minimal in-test GROUND ALL FLIGHTS fixture for the shell screens. Four
+// fictional hubs, a handful of flights, a small corridor graph, a short storm
+// track, and one projection correction. This is NOT the authored seed (section
+// 02 writes those); the screens render whatever payload is active, so a handful
+// of hubs and flights prove every view. The records, desk-check table, and clue
+// record mirror the engine flights fixtures (F06 is the all-hubs restriction
+// record that logs the D-83 clue; W02 is the OBSERVED field report a PROBE on
+// the Meridian-Cascade corridor runs CHECK SOURCE against; L09 is the laundered
+// OBSERVED record behind the Meridian-Sable corridor) so TRACE and PROBE have
+// real records and real desk answers to resolve against.
+import type { EngineContext } from '@engine'
+import type { EvidenceRecord } from '@engine'
+import type { SeedDefinition } from '@engine'
+import type {
+  ClueRecordEntry,
+  DeskCheckEntry,
+} from '@engine/missions/types'
+import { buildTestContext } from '@engine/testing'
+import {
+  FLIGHTS_MISSION_ID,
+  flightsSchedule,
+  makeFlightsMission,
+} from '@engine/missions/flights/module'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+import type { CampaignState } from '@engine'
+
+export const FLIGHTS_DURATION_MS = 240_000
+export const FLIGHTS_CLUE_ID = 'clue-D-83'
+/** The all-hubs restriction record (F06 equivalent), engine-owned as a clue
+ *  record. Inspecting it logs D-83 with no mission involvement. */
+export const RESTRICTION_RECORD_ID = 'F06'
+
+/** The evidence records the fixture corridors point at. F06 is the DERIVED
+ *  all-hubs restriction record (TRACE target, clue source); W02 is the OBSERVED
+ *  field report; L09 is the laundered OBSERVED record. */
+export const FLIGHTS_FIXTURE_RECORDS: EvidenceRecord[] = [
+  {
+    id: 'C17',
+    origin: 'EXERCISE',
+    sourceId: 'D83-EXPORT',
+    parentId: null,
+    runId: 'R04',
+    eventTime: 76440,
+    receiptTime: 76445,
+    subsystem: 'flights',
+    body: ['PREVIEW GROUNDING ADVISORY PUBLISHED TO ACTIVE FEED'],
+  },
+  {
+    id: 'F06',
+    origin: 'DERIVED',
+    sourceId: 'FLIGHT-CONTROL',
+    parentId: 'C17',
+    runId: 'R04',
+    eventTime: 76448,
+    receiptTime: 76492,
+    subsystem: 'flights',
+    body: ['ALL HUBS RESTRICTION PER C17'],
+  },
+  {
+    id: 'W02',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-NW',
+    parentId: null,
+    runId: null,
+    eventTime: 76455,
+    receiptTime: 76460,
+    subsystem: 'flights',
+    body: ['LOCAL WEATHER WARNING: NORTHWEST CORRIDOR ONLY'],
+  },
+  {
+    id: 'L09',
+    origin: 'OBSERVED',
+    sourceId: 'RELAY-DESK',
+    parentId: 'F06',
+    runId: null,
+    eventTime: 76500,
+    receiptTime: 76505,
+    subsystem: 'flights',
+    body: ['CONFIRMING RESTRICTION AS RELAYED'],
+  },
+]
+
+/** The desk-check answers for the two field reports. W02 comes back CONFIRMED;
+ *  L09 comes back CONTRADICTED (its OBSERVED label launders R04 provenance).
+ *  delaySeconds is small so a single advance resolves a PROBE. */
+export const FLIGHTS_DESK_CHECKS: DeskCheckEntry[] = [
+  { recordId: 'W02', outcome: 'CONFIRMED', delaySeconds: 5, replyBody: ['FIELD STATION CORROBORATES. OBSERVED AND INDEPENDENT.'] },
+  { recordId: 'L09', outcome: 'CONTRADICTED', delaySeconds: 5, replyBody: ['NO INDEPENDENT SOURCE. RELAYED FROM THE RESTRICTION ONLY.'] },
+]
+
+export const FLIGHTS_CLUE_RECORDS: ClueRecordEntry[] = [
+  { recordId: RESTRICTION_RECORD_ID, clueId: FLIGHTS_CLUE_ID },
+]
+
+/** Four hubs in a fixed authored order (MERIDIAN, CASCADE, SABLE, VERDANT).
+ *  Runway slots are small so capacity rejections bite. MERIDIAN's departure
+ *  window closes at 120 s so RELEASE-after-window can be exercised. Eight
+ *  flights so the list-parity test has the canonical fleet size. */
+export const FLIGHTS_FIXTURE_PAYLOAD: FlightsPayload = {
+  hubs: [
+    { id: 'MERIDIAN', name: 'MERIDIAN FIELD', runwaySlots: 2, lastDepartureOffsetSeconds: 120 },
+    { id: 'CASCADE', name: 'CASCADE PORT', runwaySlots: 1, lastDepartureOffsetSeconds: 200 },
+    { id: 'SABLE', name: 'SABLE STRIP', runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+    { id: 'VERDANT', name: 'VERDANT GATE', runwaySlots: 2, lastDepartureOffsetSeconds: 200 },
+  ],
+  flights: [
+    { id: 'WX101', originHubId: 'MERIDIAN', destinationHubId: 'CASCADE', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 100 },
+    { id: 'WX102', originHubId: 'MERIDIAN', destinationHubId: 'SABLE', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 80 },
+    { id: 'WX103', originHubId: 'CASCADE', destinationHubId: 'VERDANT', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 60 },
+    { id: 'WX104', originHubId: 'SABLE', destinationHubId: 'MERIDIAN', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 40 },
+    { id: 'WX105', originHubId: 'MERIDIAN', destinationHubId: 'VERDANT', departureOffsetSeconds: 10, cruiseSeconds: 60, passengers: 50 },
+    { id: 'WX106', originHubId: 'VERDANT', destinationHubId: 'CASCADE', departureOffsetSeconds: 20, cruiseSeconds: 60, passengers: 70 },
+    { id: 'WX107', originHubId: 'SABLE', destinationHubId: 'VERDANT', departureOffsetSeconds: 30, cruiseSeconds: 60, passengers: 90 },
+    { id: 'WX108', originHubId: 'CASCADE', destinationHubId: 'MERIDIAN', departureOffsetSeconds: 30, cruiseSeconds: 60, passengers: 55 },
+  ],
+  corridors: [
+    { id: 'C-MC', fromHubId: 'MERIDIAN', toHubId: 'CASCADE', fieldReportRecordId: 'W02' },
+    { id: 'C-MS', fromHubId: 'MERIDIAN', toHubId: 'SABLE', fieldReportRecordId: 'L09' },
+    { id: 'C-MV', fromHubId: 'MERIDIAN', toHubId: 'VERDANT', fieldReportRecordId: 'W02' },
+    { id: 'C-CV', fromHubId: 'CASCADE', toHubId: 'VERDANT', fieldReportRecordId: 'L09' },
+    { id: 'C-SM', fromHubId: 'SABLE', toHubId: 'MERIDIAN', fieldReportRecordId: 'W02' },
+  ],
+  queueDelayTable: [0, 30, 90],
+  stormTrack: [
+    {
+      offsetSeconds: 40,
+      closeHubs: [],
+      openHubs: [],
+      closeCorridors: ['C-MS'],
+      openCorridors: [],
+      warningLine: 'STORM CLOSING THE MERIDIAN SABLE CORRIDOR.',
+      cueId: 'tone-storm-1',
+    },
+    {
+      offsetSeconds: 80,
+      closeHubs: ['CASCADE'],
+      openHubs: [],
+      closeCorridors: [],
+      openCorridors: ['C-MS'],
+      warningLine: 'STORM OVER CASCADE PORT. FIELD CLOSED.',
+      cueId: 'tone-storm-2',
+    },
+  ],
+  corrections: [
+    {
+      offsetSeconds: 50,
+      changedId: 'C-MS',
+      affectedFlightId: 'WX102',
+      lastSafeDecisionAtSeconds: 90,
+      warningLine: 'FORECAST CORRECTED. MERIDIAN SABLE CLEARS SOONER.',
+      cueId: 'tone-correct-1',
+    },
+  ],
+  tierThresholds: { full: 400, partial: 260, poor: 140 },
+  latenessThresholdSeconds: 20,
+  leadMarginSeconds: 30,
+  paymentsDelayedTargetHubId: 'MERIDIAN',
+  flightsDisruptedTable: { full: 0, partial: 10, poor: 20, failed: 30 },
+}
+
+/** Build an EngineContext over the fixture payload, records, desk checks, and
+ *  clue record, registering only the flights mission. Mirrors the engine
+ *  module test's buildTestContext usage exactly. */
+export function makeFlightsCtx(
+  payload: FlightsPayload = FLIGHTS_FIXTURE_PAYLOAD,
+): EngineContext {
+  const overrides: Partial<SeedDefinition> = {
+    records: FLIGHTS_FIXTURE_RECORDS,
+    deskChecks: FLIGHTS_DESK_CHECKS,
+    clueRecords: FLIGHTS_CLUE_RECORDS,
+    missionPayloads: { [FLIGHTS_MISSION_ID]: payload },
+    schedules: { [FLIGHTS_MISSION_ID]: [...flightsSchedule(payload)] },
+    missionDurationsMs: { [FLIGHTS_MISSION_ID]: FLIGHTS_DURATION_MS },
+  }
+  return buildTestContext(FLIGHTS_FIXTURE_RECORDS, overrides, {
+    missions: { [FLIGHTS_MISSION_ID]: makeFlightsMission(payload) },
+    missionOrder: [FLIGHTS_MISSION_ID],
+  })
+}
+
+/** Read the live flights substate off a campaign state. */
+export function flightsSub(state: CampaignState): FlightsState {
+  return state.activeMission?.substate as FlightsState
+}
diff --git a/test/app/missions/flights/flow.smoke.test.tsx b/test/app/missions/flights/flow.smoke.test.tsx
new file mode 100644
index 0000000..5a33503
--- /dev/null
+++ b/test/app/missions/flights/flow.smoke.test.tsx
@@ -0,0 +1,134 @@
+// Smoke flows: one keyboard-only routing flow (select a flight, LAND it at a
+// legal hub, observe the status change) and one narrow-width pass confirming
+// the list is the default and that every action reachable on the grid is
+// reachable in the list. Exhaustive passes belong to section 04; this is the
+// basic routing proof plus a settlement/debrief render.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
+import { init, send, wake, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import { FLIGHTS_FIXTURE_PAYLOAD, makeFlightsCtx, flightsSub } from './fixture'
+
+const T0 = 1_000_000
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+let teardown: () => void
+
+function boot(narrow: boolean): void {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(narrow)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerFlightsScreen()
+  teardown = init({
+    ctx: makeFlightsCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'flights' })
+  })
+}
+
+beforeEach(() => {
+  boot(false)
+})
+
+afterEach(() => {
+  teardown()
+  __resetFlightsView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function typeCommand(text: string): void {
+  const input = screen.getByTestId('command-input') as HTMLInputElement
+  act(() => {
+    fireEvent.change(input, { target: { value: text } })
+    fireEvent.submit(screen.getByTestId('command-form'))
+  })
+}
+
+describe('keyboard-only routing flow', () => {
+  it('select a flight, LAND it at a legal hub, observe the status change, all typed', () => {
+    render(<ScreenRouter />)
+    // Advance the engine so WX101 (MERIDIAN->CASCADE, departs 10s) is airborne.
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 15_000)
+    act(() => {
+      wake()
+    })
+    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')
+
+    // Select it and LAND it at its own hub CASCADE (open, a free runway slot).
+    typeCommand('SELECT WX101')
+    typeCommand('LAND WX101 CASCADE')
+    // The flight is now inbound to CASCADE; advance past cruise (60s) so it
+    // lands, and the status changes to a terminal landing.
+    expect(flightsSub(getState()).flights['WX101']?.inboundHubId).toBe('CASCADE')
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 90_000)
+    act(() => {
+      wake()
+    })
+    const status = flightsSub(getState()).flights['WX101']?.status
+    expect(['landed', 'landedLate', 'divertedLanded']).toContain(status)
+  })
+})
+
+describe('narrow-width pass', () => {
+  it('the list is the default at narrow width and every grid action is reachable in the list', () => {
+    teardown()
+    boot(true)
+    render(<ScreenRouter />)
+    // Narrow defaults to the list.
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
+    expect(screen.getByTestId('flight-list-view')).toBeInTheDocument()
+
+    // Advance so flights are airborne, then confirm the list exposes routing,
+    // HOLD, RELEASE, and the blanket GROUND ALL (full parity with the grid).
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 35_000)
+    act(() => {
+      wake()
+    })
+    const anyFlight = FLIGHTS_FIXTURE_PAYLOAD.flights[0]!.id
+    const row = screen.getByTestId(`flight-row-${anyFlight}`)
+    expect(within(row).getByTestId(`list-HOLD-${anyFlight}`)).toBeInTheDocument()
+    expect(within(row).getByTestId(`list-RELEASE-${anyFlight}`)).toBeInTheDocument()
+    // At least one routing affordance exists in the row.
+    const hasRoute = FLIGHTS_FIXTURE_PAYLOAD.hubs.some(
+      (h) =>
+        within(row).queryByTestId(`list-LAND-${anyFlight}-${h.id}`) ||
+        within(row).queryByTestId(`list-DIVERT-${anyFlight}-${h.id}`),
+    )
+    expect(hasRoute).toBe(true)
+    // GROUND ALL is reachable from the list.
+    expect(screen.getByTestId('list-GROUND-ALL')).toBeInTheDocument()
+  })
+})
+
+describe('settlement and debrief', () => {
+  it('forfeiting the mission renders the debrief for the flights mission', () => {
+    render(<ScreenRouter />)
+    act(() => {
+      send({ type: 'FORFEIT_MISSION' })
+    })
+    const debrief = screen.getByTestId('debrief-screen')
+    expect(debrief).toHaveAttribute('data-mission-id', 'flights')
+  })
+})
diff --git a/test/app/missions/flights/glossary.test.tsx b/test/app/missions/flights/glossary.test.tsx
new file mode 100644
index 0000000..6bdfa2d
--- /dev/null
+++ b/test/app/missions/flights/glossary.test.tsx
@@ -0,0 +1,96 @@
+// The local GROUND ALL FLIGHTS glossary: the six local terms register without
+// collision, the global OBSERVED/EXERCISE/DERIVED are present but NOT
+// re-registered by the mission, and re-registering a global id would trip the
+// uniqueness guard. Terms open their definition on hover/focus, matching the
+// shell's glossary conventions.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { registerDefaultVerbs } from '@app/terminal'
+import {
+  hasGlossaryEntry,
+  registerGlossaryTerms,
+} from '@app/a11y/glossary'
+import { resetAll } from '../../screens/harness'
+import { FlightsScreen, registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { FLIGHTS_LOCAL_GLOSSARY_IDS } from '@app/missions/flights/glossary'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import { makeFlightsCtx } from './fixture'
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  registerFlightsScreen()
+  teardown = init({
+    ctx: makeFlightsCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  vi.spyOn(console, 'error').mockImplementation(() => {})
+})
+
+afterEach(() => {
+  teardown()
+  __resetFlightsView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('FlightsScreen glossary', () => {
+  it('registers only the six local terms without collision and does not re-register the global OBSERVED/EXERCISE/DERIVED', () => {
+    for (const id of FLIGHTS_LOCAL_GLOSSARY_IDS) {
+      expect(hasGlossaryEntry(id)).toBe(true)
+    }
+    expect(hasGlossaryEntry('observed')).toBe(true)
+    expect(hasGlossaryEntry('exercise')).toBe(true)
+    expect(hasGlossaryEntry('derived')).toBe(true)
+    // The local ids must not shadow the global ids.
+    expect(FLIGHTS_LOCAL_GLOSSARY_IDS).not.toContain('observed')
+    expect(FLIGHTS_LOCAL_GLOSSARY_IDS).not.toContain('exercise')
+    expect(FLIGHTS_LOCAL_GLOSSARY_IDS).not.toContain('derived')
+  })
+
+  it('re-registering a global id trips the glossary uniqueness guard', () => {
+    // The guard throws in dev on a duplicate id, which is how the shell proves
+    // OBSERVED/EXERCISE/DERIVED are single-sourced globally.
+    expect(() =>
+      registerGlossaryTerms([
+        { id: 'observed', term: 'OBSERVED', definition: 'DUP' },
+      ]),
+    ).toThrow(/duplicate/)
+  })
+
+  it('local terms CORRIDOR / RUNWAY SLOT open their definition on focus from the list copy', () => {
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'flights' })
+    })
+    setNarrow(true)
+    render(<FlightsScreen missionId="flights" />)
+    const list = screen.getByTestId('flight-list-view')
+    const terms = within(list).getAllByTestId('glossary-term')
+    const labels = terms.map((t) => t.textContent)
+    expect(labels).toContain('CORRIDOR')
+    expect(labels).toContain('RUNWAY SLOT')
+    const corridor = terms.find((t) => t.textContent === 'CORRIDOR')!
+    fireEvent.focus(corridor)
+    expect(within(list).getByTestId('glossary-popup')).toBeInTheDocument()
+  })
+})
diff --git a/test/app/missions/flights/listView.test.tsx b/test/app/missions/flights/listView.test.tsx
new file mode 100644
index 0000000..4f1b07a
--- /dev/null
+++ b/test/app/missions/flights/listView.test.tsx
@@ -0,0 +1,247 @@
+// The flight list: full parity with the grid. All eight flights, each with
+// status, conditions, and the SAME action rows (LAND/DIVERT targets, HOLD,
+// RELEASE) built from the engine legality selectors, with inline reasons for
+// disabled actions. Selection syncs both ways with the grid; narrow width
+// defaults to the list; the grid/list toggle persists across a remount via the
+// UI preference store.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { createCampaign, advanceCampaign, dispatch } from '@engine/campaign/engine'
+import type { CampaignState, EngineContext } from '@engine'
+import { FlightListView } from '@app/missions/flights/FlightListView'
+import { registerFlightsGlossary } from '@app/missions/flights/glossary'
+import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import { FLIGHTS_FIXTURE_PAYLOAD, makeFlightsCtx, flightsSub } from './fixture'
+
+const T0 = 1_000_000
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+function stateAt(ctx: EngineContext, atMs: number): CampaignState {
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, T0).state
+  if (atMs > T0) state = advanceCampaign(ctx, state, atMs).state
+  return state
+}
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerFlightsGlossary()
+})
+
+afterEach(() => {
+  __resetFlightsView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('FlightListView', () => {
+  it('lists all eight flights with status and conditions', () => {
+    const ctx = makeFlightsCtx()
+    const sub = flightsSub(stateAt(ctx, T0 + 35_000))
+    render(
+      <FlightListView
+        payload={FLIGHTS_FIXTURE_PAYLOAD}
+        state={sub}
+        selectedFlightId={null}
+        onSelect={() => {}}
+        grounded={false}
+      />,
+    )
+    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
+      const row = screen.getByTestId(`flight-row-${flight.id}`)
+      expect(row).toBeInTheDocument()
+      // Status attribute present.
+      expect(row).toHaveAttribute('data-status')
+      // Conditions carry the origin hub and passenger count.
+      expect(row.textContent).toContain(flight.originHubId)
+      expect(row.textContent).toContain(`${flight.passengers} PAX`)
+    }
+    expect(FLIGHTS_FIXTURE_PAYLOAD.flights).toHaveLength(8)
+  })
+
+  it('each row carries full action rows: LAND/DIVERT targets, HOLD/RELEASE as legal; disabled actions show inline reasons from the typed rejection reasons', () => {
+    const ctx = makeFlightsCtx()
+    const sub = flightsSub(stateAt(ctx, T0 + 35_000))
+    render(
+      <FlightListView
+        payload={FLIGHTS_FIXTURE_PAYLOAD}
+        state={sub}
+        selectedFlightId={null}
+        onSelect={() => {}}
+        grounded={false}
+      />,
+    )
+    // Every flight row offers a LAND/DIVERT affordance per hub plus HOLD and
+    // RELEASE.
+    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
+      const row = screen.getByTestId(`flight-row-${flight.id}`)
+      expect(within(row).getByTestId(`list-HOLD-${flight.id}`)).toBeInTheDocument()
+      expect(within(row).getByTestId(`list-RELEASE-${flight.id}`)).toBeInTheDocument()
+      // One routing affordance per hub (LAND for its own destination, DIVERT
+      // for the rest).
+      let routeButtons = 0
+      for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
+        const land = within(row).queryByTestId(`list-LAND-${flight.id}-${hub.id}`)
+        const divert = within(row).queryByTestId(`list-DIVERT-${flight.id}-${hub.id}`)
+        if (land || divert) routeButtons += 1
+      }
+      expect(routeButtons).toBe(FLIGHTS_FIXTURE_PAYLOAD.hubs.length)
+    }
+    // A disabled action shows an inline reason. A scheduled flight cannot LAND
+    // (NOT AIRBORNE). Render a slightly earlier state (15s) where flights that
+    // depart at 20s/30s are still scheduled, and assert the reason renders.
+    const earlySub = flightsSub(stateAt(ctx, T0 + 15_000))
+    cleanup()
+    render(
+      <FlightListView
+        payload={FLIGHTS_FIXTURE_PAYLOAD}
+        state={earlySub}
+        selectedFlightId={null}
+        onSelect={() => {}}
+        grounded={false}
+      />,
+    )
+    const scheduled = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
+      (f) => earlySub.flights[f.id]?.status === 'scheduled',
+    )!
+    const row = screen.getByTestId(`flight-row-${scheduled.id}`)
+    // Its own destination LAND button is disabled with the engine's NOT
+    // AIRBORNE reason shown inline.
+    const landBtn = within(row).getByTestId(
+      `list-LAND-${scheduled.id}-${scheduled.destinationHubId}`,
+    ) as HTMLButtonElement
+    expect(landBtn.disabled).toBe(true)
+    expect(
+      within(row).getByTestId(
+        `list-LAND-${scheduled.id}-${scheduled.destinationHubId}-reason`,
+      ).textContent,
+    ).toContain('NOT AIRBORNE')
+  })
+
+  it('a WRONG divert is possible (not auto-correct): an airborne flight offers a DIVERT to a hub that is not its destination, enabled', () => {
+    const ctx = makeFlightsCtx()
+    const sub = flightsSub(stateAt(ctx, T0 + 35_000))
+    const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
+      (f) => sub.flights[f.id]?.status === 'airborne',
+    )!
+    render(
+      <FlightListView
+        payload={FLIGHTS_FIXTURE_PAYLOAD}
+        state={sub}
+        selectedFlightId={null}
+        onSelect={() => {}}
+        grounded={false}
+      />,
+    )
+    const row = screen.getByTestId(`flight-row-${airborne.id}`)
+    // A DIVERT to a NON-destination hub exists and is enabled: the player can
+    // route wrong. The engine must accept it (legal routing, wrong strategy).
+    const wrongHub = FLIGHTS_FIXTURE_PAYLOAD.hubs.find(
+      (h) => h.id !== airborne.destinationHubId,
+    )
+    let foundEnabledWrongDivert = false
+    for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
+      if (hub.id === airborne.destinationHubId) continue
+      const btn = within(row).queryByTestId(
+        `list-DIVERT-${airborne.id}-${hub.id}`,
+      ) as HTMLButtonElement | null
+      if (btn && !btn.disabled) foundEnabledWrongDivert = true
+    }
+    expect(wrongHub).toBeTruthy()
+    expect(foundEnabledWrongDivert).toBe(true)
+  })
+
+  it('selection syncs grid -> list and list -> grid through the shared screen state', () => {
+    registerFlightsScreen()
+    teardown = init({
+      ctx: makeFlightsCtx(),
+      seedName: 'test-seed',
+      port: { read: () => null, write: () => {}, remove: () => {} },
+    })
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'flights' })
+    })
+    render(<ScreenRouter />)
+    // Default (wide) is the grid; selecting a flight marker then switching to
+    // the list keeps the same selection.
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    const type = (text: string) => {
+      act(() => {
+        fireEvent.change(input, { target: { value: text } })
+        fireEvent.submit(screen.getByTestId('command-form'))
+      })
+    }
+    type('SELECT WX101')
+    type('LIST')
+    const row = screen.getByTestId('flight-row-WX101')
+    expect(row).toHaveAttribute('data-selected', 'true')
+    // list -> grid: select a different flight from the list, back to the grid,
+    // and the map reflects it (the readout shows the new flight).
+    fireEvent.click(screen.getByTestId('flight-select-WX103'))
+    type('GRID')
+    expect(screen.getByTestId('flight-readout')).toHaveAttribute('data-flight-id', 'WX103')
+    teardown()
+  })
+
+  it('narrow viewport defaults to the list view', () => {
+    setNarrow(true)
+    registerFlightsScreen()
+    teardown = init({
+      ctx: makeFlightsCtx(),
+      seedName: 'test-seed',
+      port: { read: () => null, write: () => {}, remove: () => {} },
+    })
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'flights' })
+    })
+    render(<ScreenRouter />)
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
+    expect(screen.getByTestId('flight-list-view')).toBeInTheDocument()
+    teardown()
+  })
+
+  it('grid/list toggle persists via UI preferences across remount', () => {
+    registerFlightsScreen()
+    teardown = init({
+      ctx: makeFlightsCtx(),
+      seedName: 'test-seed',
+      port: { read: () => null, write: () => {}, remove: () => {} },
+    })
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'flights' })
+    })
+    const first = render(<ScreenRouter />)
+    // Wide default is grid; the player explicitly switches to the list.
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'grid')
+    fireEvent.click(screen.getByTestId('flights-tab-list'))
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
+    first.unmount()
+    // Remount: the explicit list preference persists over the wide default.
+    render(<ScreenRouter />)
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
+    teardown()
+  })
+})
diff --git a/test/app/missions/flights/mapModel.test.ts b/test/app/missions/flights/mapModel.test.ts
new file mode 100644
index 0000000..a7b9817
--- /dev/null
+++ b/test/app/missions/flights/mapModel.test.ts
@@ -0,0 +1,157 @@
+// Pure map-model tests. No DOM. Every FlightsState comes from the REAL engine
+// (createCampaign + dispatch + advanceCampaign over the fixture), never a
+// hand-mutated object, so the drained/undrained separation is tested against
+// the engine's own folding, not a stub.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine'
+import type { CampaignState } from '@engine'
+import { buildMapModel, CELL, flightMarkerCells } from '@app/missions/flights/mapModel'
+import type { FlightsState } from '@engine/missions/flights/types'
+import {
+  FLIGHTS_FIXTURE_PAYLOAD,
+  makeFlightsCtx,
+  flightsSub,
+} from './fixture'
+
+const T0 = 1_000_000
+
+function started(ctx: EngineContext, at = T0): CampaignState {
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, at).state
+  return state
+}
+
+/** All class hooks appearing in a cell matrix. */
+function hooksIn(cells: ReadonlyArray<ReadonlyArray<{ classHook?: string }>>): Set<string> {
+  const set = new Set<string>()
+  for (const row of cells) for (const cell of row) if (cell.classHook) set.add(cell.classHook)
+  return set
+}
+
+describe('mapModel projection', () => {
+  it('snapshots the cell matrix per state fixture: hubs bracketed, corridors as line characters, flight markers placed', () => {
+    const ctx = makeFlightsCtx()
+    const state = started(ctx)
+    const model = buildMapModel(flightsSub(state), FLIGHTS_FIXTURE_PAYLOAD, null)
+    const rendered = model.cells.map((row) => row.map((c) => c.char).join(''))
+    expect(rendered).toMatchSnapshot()
+    // Hubs are bracketed; corridors use line characters; markers are placed.
+    const hooks = hooksIn(model.cells)
+    expect(hooks.has(CELL.hubOpen)).toBe(true)
+    expect(hooks.has(CELL.corridorOpen)).toBe(true)
+    expect(hooks.has(CELL.flight)).toBe(true)
+  })
+
+  it('renders current weather solid and projection hatched, visually distinct cell kinds in the model output', () => {
+    const ctx = makeFlightsCtx()
+    // At mission start, before the correction at 50s is applied, the Meridian
+    // Sable corridor (C-MS, changedId of the pending correction) is hatched.
+    const atStart = buildMapModel(flightsSub(started(ctx)), FLIGHTS_FIXTURE_PAYLOAD, null)
+    expect(hooksIn(atStart.cells).has(CELL.corridorProjection)).toBe(true)
+
+    // Drive to 45s: the storm closed C-MS at 40s (current weather, SOLID) but
+    // the correction at 50s has NOT yet applied, so some corridor renders solid
+    // storm-closed. Solid and hatched are distinct cell kinds.
+    let state = started(ctx)
+    state = advanceCampaign(ctx, state, T0 + 45_000).state
+    const at45 = buildMapModel(flightsSub(state), FLIGHTS_FIXTURE_PAYLOAD, null)
+    const hooks = hooksIn(at45.cells)
+    expect(hooks.has(CELL.corridorStorm)).toBe(true)
+    // The two kinds are not the same class hook (distinct, not color alone).
+    expect(CELL.corridorStorm).not.toEqual(CELL.corridorProjection)
+  })
+
+  it('renders the all-hubs restriction marker distinct from both weather kinds', () => {
+    const ctx = makeFlightsCtx()
+    let state = started(ctx)
+    // The storm closes CASCADE at 80s; after that a hub is closed and the
+    // all-hubs restriction marker appears.
+    state = advanceCampaign(ctx, state, T0 + 85_000).state
+    const model = buildMapModel(flightsSub(state), FLIGHTS_FIXTURE_PAYLOAD, null)
+    const hooks = hooksIn(model.cells)
+    expect(hooks.has(CELL.restriction)).toBe(true)
+    expect(hooks.has(CELL.hubClosed)).toBe(true)
+    expect(CELL.restriction).not.toEqual(CELL.corridorStorm)
+    expect(CELL.restriction).not.toEqual(CELL.corridorProjection)
+  })
+
+  it('marks the selected flight marker with the selection classHook and no other cell', () => {
+    const ctx = makeFlightsCtx()
+    const state = started(ctx)
+    const sub = flightsSub(state)
+    const model = buildMapModel(sub, FLIGHTS_FIXTURE_PAYLOAD, 'WX101')
+    let selectedCount = 0
+    for (const row of model.cells) {
+      for (const cell of row) {
+        if (cell.classHook === CELL.flightSelected) selectedCount += 1
+      }
+    }
+    expect(selectedCount).toBe(1)
+    // Unselected view has zero selection hooks.
+    const none = buildMapModel(sub, FLIGHTS_FIXTURE_PAYLOAD, null)
+    expect(hooksIn(none.cells).has(CELL.flightSelected)).toBe(false)
+  })
+
+  it('produces the legend from payload data alone', () => {
+    const ctx = makeFlightsCtx()
+    const model = buildMapModel(flightsSub(started(ctx)), FLIGHTS_FIXTURE_PAYLOAD, null)
+    const labels = model.legend.map((e) => e.label)
+    expect(labels).toContain('ALL-HUBS RESTRICTION')
+    expect(labels.some((l) => l.includes('CURRENT'))).toBe(true)
+    expect(labels.some((l) => l.includes('HATCHED'))).toBe(true)
+    // Every legend entry carries a distinct class hook and a glyph.
+    expect(new Set(model.legend.map((e) => e.classHook)).size).toBeGreaterThan(1)
+    for (const entry of model.legend) expect(entry.glyph.length).toBeGreaterThan(0)
+  })
+
+  it('reads only drained state plus payload: a pending (undrained) storm event does not change output versus the drained-state snapshot', () => {
+    const ctx = makeFlightsCtx()
+    // Drained to exactly 35s: the storm step at 40s has NOT fired, so it sits
+    // undrained in the queue. The map must look identical to the pristine
+    // just-started map for the corridors the storm will later touch, because
+    // the model never reads the undrained event.
+    let stateUndrained = started(ctx)
+    stateUndrained = advanceCampaign(ctx, stateUndrained, T0 + 35_000).state
+    const undrained: FlightsState = flightsSub(stateUndrained)
+
+    const pristine: FlightsState = flightsSub(started(ctx))
+
+    const a = buildMapModel(undrained, FLIGHTS_FIXTURE_PAYLOAD, null).cells.map((r) =>
+      r.map((c) => `${c.char}|${c.classHook}`).join(','),
+    )
+    const b = buildMapModel(pristine, FLIGHTS_FIXTURE_PAYLOAD, null).cells.map((r) =>
+      r.map((c) => `${c.char}|${c.classHook}`).join(','),
+    )
+    // Flight statuses differ (departures at 10/20/30s have fired by 35s), but
+    // the storm-driven weather cells are unchanged, because no storm event has
+    // folded yet. Prove it by comparing the corridor/hub cells only.
+    expect(undrained.closedCorridors).toEqual([])
+    expect(undrained.closedHubs).toEqual([])
+    expect(pristine.closedCorridors).toEqual([])
+    // The full matrices may differ only in flight glyphs; weather is identical.
+    const weatherOnly = (
+      grid: string[],
+    ): string[] => grid.map((r) => r.replace(/[o*H=x?]/g, '.'))
+    expect(weatherOnly(a)).toEqual(weatherOnly(b))
+  })
+})
+
+describe('flightMarkerCells', () => {
+  it('lists marker positions in reading order (row-major)', () => {
+    const ctx = makeFlightsCtx()
+    const cells = flightMarkerCells(flightsSub(started(ctx)), FLIGHTS_FIXTURE_PAYLOAD)
+    expect(cells.length).toBe(FLIGHTS_FIXTURE_PAYLOAD.flights.length)
+    for (let i = 1; i < cells.length; i += 1) {
+      const prev = cells[i - 1]!
+      const cur = cells[i]!
+      const prevKey = prev.row * 1000 + prev.col
+      const curKey = cur.row * 1000 + cur.col
+      expect(curKey).toBeGreaterThanOrEqual(prevKey)
+    }
+  })
+})
diff --git a/test/app/missions/flights/readoutParity.test.tsx b/test/app/missions/flights/readoutParity.test.tsx
new file mode 100644
index 0000000..a0f9ba3
--- /dev/null
+++ b/test/app/missions/flights/readoutParity.test.tsx
@@ -0,0 +1,186 @@
+// The load-bearing parity test: the destination set the readout OFFERS must
+// strict-equal the set the ENGINE legality selector accepts, using the SAME
+// selector import (routeLegality), compared with deepStrictEqual. No legality
+// logic is duplicated in the shell; the readout calls the engine selector, and
+// this test calls the identical function to build the expected set.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, render, screen, within } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { createCampaign, advanceCampaign, dispatch } from '@engine/campaign/engine'
+import type { CampaignState, EngineContext } from '@engine'
+import { routeLegality } from '@engine/missions/flights/rules'
+import { MapView } from '@app/missions/flights/MapView'
+import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import {
+  FLIGHTS_FIXTURE_PAYLOAD,
+  makeFlightsCtx,
+  flightsSub,
+} from './fixture'
+
+const T0 = 1_000_000
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerFlightsScreen()
+  teardown = init({
+    ctx: makeFlightsCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'flights' })
+  })
+})
+
+afterEach(() => {
+  teardown()
+  __resetFlightsView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+/** Drive a fresh campaign to a chosen time, returning the state. Used to build
+ *  a variety of drained substates (airborne, storm-closed, grounded). */
+function stateAt(ctx: EngineContext, atMs: number): CampaignState {
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, T0).state
+  if (atMs > T0) state = advanceCampaign(ctx, state, atMs).state
+  return state
+}
+
+/** The destination hub ids the readout offers as legal (enabled) LAND/DIVERT
+ *  affordances, read off the rendered buttons. */
+function offeredDestinations(): string[] {
+  const readout = screen.getByTestId('flight-readout')
+  const ids: string[] = []
+  for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
+    for (const kind of ['LAND', 'DIVERT'] as const) {
+      const btn = within(readout).queryByTestId(`readout-${kind}-${hub.id}`)
+      if (btn && !(btn as HTMLButtonElement).disabled) ids.push(hub.id)
+    }
+  }
+  return ids.sort()
+}
+
+describe('readout-validator parity', () => {
+  it('for each state fixture, the offered destination set strict-equals the set the engine legality selector accepts (same selector import)', () => {
+    const ctx = makeFlightsCtx()
+    // A spread of drained states: just started, past the first departures, and
+    // past a storm closure, so routeLegality returns a variety of verdicts.
+    for (const atMs of [T0, T0 + 35_000, T0 + 85_000]) {
+      const state = stateAt(ctx, atMs)
+      const sub = flightsSub(state)
+      // Pick an airborne flight when one exists, else any flight.
+      const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
+        (f) => sub.flights[f.id]?.status === 'airborne',
+      )
+      const flight = airborne ?? FLIGHTS_FIXTURE_PAYLOAD.flights[0]!
+
+      const { unmount } = render(
+        <MapView
+          payload={FLIGHTS_FIXTURE_PAYLOAD}
+          state={sub}
+          selectedFlightId={flight.id}
+          onSelect={() => {}}
+          now={state.lastNow}
+          deadline={state.activeMission?.endsAt ?? null}
+        />,
+      )
+
+      const offered = offeredDestinations()
+      const expected = FLIGHTS_FIXTURE_PAYLOAD.hubs
+        .filter((hub) => routeLegality(FLIGHTS_FIXTURE_PAYLOAD, sub, flight.id, hub.id).legal)
+        .map((hub) => hub.id)
+        .sort()
+      expect(offered).toStrictEqual(expected)
+      unmount()
+    }
+  })
+
+  it('readout shows the selected flight hub, runway availability, and viable destinations', () => {
+    const ctx = makeFlightsCtx()
+    const state = stateAt(ctx, T0 + 35_000)
+    const sub = flightsSub(state)
+    const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
+      (f) => sub.flights[f.id]?.status === 'airborne',
+    )!
+    render(
+      <MapView
+        payload={FLIGHTS_FIXTURE_PAYLOAD}
+        state={sub}
+        selectedFlightId={airborne.id}
+        onSelect={() => {}}
+        now={state.lastNow}
+        deadline={state.activeMission?.endsAt ?? null}
+      />,
+    )
+    const readout = screen.getByTestId('flight-readout')
+    expect(readout).toHaveAttribute('data-flight-id', airborne.id)
+    // Runway availability per hub is shown.
+    expect(within(readout).getByTestId('readout-runways')).toBeInTheDocument()
+    for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
+      expect(within(readout).getByTestId(`readout-runway-${hub.id}`)).toBeInTheDocument()
+    }
+    // The viable destination list is present with at least one enabled option.
+    expect(within(readout).getByTestId('readout-destinations')).toBeInTheDocument()
+    expect(offeredDestinations().length).toBeGreaterThan(0)
+  })
+
+  it('projected arrival renders beside the deadline for airborne flights, including when projected arrival is past the deadline (informed gamble)', () => {
+    const ctx = makeFlightsCtx()
+    // Near the deadline: an airborne flight routed now would arrive past it, so
+    // the readout must still OFFER the destination and mark it a gamble, never
+    // auto-correct it away. Drive close to endsAt (240s) so cruise (60s) pushes
+    // arrival past the deadline.
+    const state = stateAt(ctx, T0 + 200_000)
+    const sub = flightsSub(state)
+    const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
+      (f) => sub.flights[f.id]?.status === 'airborne',
+    )
+    // If none still airborne at 200s, dispatch one into the air via a fresh
+    // early state instead; but with 240s duration and 60s cruise, a flight that
+    // departed at 10s and was never routed is still airborne at 200s.
+    expect(airborne).toBeTruthy()
+    render(
+      <MapView
+        payload={FLIGHTS_FIXTURE_PAYLOAD}
+        state={sub}
+        selectedFlightId={airborne!.id}
+        onSelect={() => {}}
+        now={state.lastNow}
+        deadline={state.activeMission?.endsAt ?? null}
+      />,
+    )
+    const arrivals = screen.getByTestId('readout-arrivals')
+    expect(arrivals).toBeInTheDocument()
+    // At least one destination shows ARRIVES / DEADLINE beside each other.
+    expect(arrivals.textContent).toContain('ARRIVES')
+    expect(arrivals.textContent).toContain('DEADLINE')
+    // And a past-deadline destination is flagged as a gamble, still offered.
+    const gambled = within(arrivals)
+      .queryAllByText(/PAST DEADLINE/)
+    expect(gambled.length).toBeGreaterThan(0)
+  })
+})
diff --git a/test/app/missions/flights/verbs.test.tsx b/test/app/missions/flights/verbs.test.tsx
new file mode 100644
index 0000000..3be4aff
--- /dev/null
+++ b/test/app/missions/flights/verbs.test.tsx
@@ -0,0 +1,171 @@
+// Verb grammar and command-button identity. Every registered verb dispatches
+// the identical action the equivalent on-screen button dispatches (both call
+// the shared builders). GROUND ALL requires confirmation, quotes the WOPR
+// directive, and renders spent after use. PROBE dispatches REQUEST_SOURCE_CHECK
+// with the corridor's field-report record id (no shell scheduling). TRACE
+// dispatches INSPECT_RECORD for the restriction record (no clue state in the
+// shell).
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { parseCommand, registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import {
+  FLIGHTS_SCREEN_ID,
+  makeCheckSourceAction,
+  makeDivertAction,
+  makeGroundAllAction,
+  makeHoldAction,
+  makeLandAction,
+  makeProbeAction,
+  makeReleaseAction,
+  makeTraceAction,
+} from '@app/missions/flights/verbs'
+import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import {
+  FLIGHTS_FIXTURE_PAYLOAD,
+  makeFlightsCtx,
+  flightsSub,
+  RESTRICTION_RECORD_ID,
+} from './fixture'
+
+const T0 = 1_000_000
+
+function setNarrow(narrow: boolean): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width') ? narrow : false,
+    media: q,
+    onchange: null,
+    addEventListener: () => {},
+    removeEventListener: () => {},
+    addListener: () => {},
+    removeListener: () => {},
+    dispatchEvent: () => false,
+  })) as unknown as typeof window.matchMedia
+}
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerFlightsScreen()
+  teardown = init({
+    ctx: makeFlightsCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'flights' })
+  })
+  // Mount the production screen so its verbs and UI handler are registered
+  // (the screen owns verb registration on mount). Tests type into the one
+  // shared command line and click the real controls.
+  render(<ScreenRouter />)
+})
+
+afterEach(() => {
+  teardown()
+  __resetFlightsView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function parse(text: string) {
+  const result = parseCommand(text, FLIGHTS_SCREEN_ID)
+  return result.kind === 'action' ? result.action : null
+}
+
+describe('command-button identity', () => {
+  it('every verb parses to the identical action the equivalent button dispatches', () => {
+    expect(parse('LAND WX101 CASCADE')).toStrictEqual(makeLandAction('WX101', 'CASCADE'))
+    expect(parse('DIVERT WX101 SABLE')).toStrictEqual(makeDivertAction('WX101', 'SABLE'))
+    expect(parse('HOLD WX107')).toStrictEqual(makeHoldAction('WX107'))
+    expect(parse('RELEASE WX107')).toStrictEqual(makeReleaseAction('WX107'))
+    expect(parse('GROUND ALL')).toStrictEqual(makeGroundAllAction())
+    expect(parse('TRACE F06')).toStrictEqual(makeTraceAction('F06'))
+    expect(parse('CHECK SOURCE W02')).toStrictEqual(makeCheckSourceAction('W02'))
+    // PROBE sugar: the typed PROBE resolves the corridor's field-report record
+    // and dispatches the identical CHECK SOURCE the button path builds.
+    expect(parse('PROBE C-MC')).toStrictEqual(
+      makeProbeAction(FLIGHTS_FIXTURE_PAYLOAD, 'C-MC'),
+    )
+    expect(parse('PROBE C-MC')).toStrictEqual(makeCheckSourceAction('W02'))
+  })
+
+  it('view commands parse to mission-scoped SCREEN ui commands, not engine actions', () => {
+    const grid = parseCommand('GRID', FLIGHTS_SCREEN_ID)
+    expect(grid.kind).toBe('ui')
+    const list = parseCommand('LIST', FLIGHTS_SCREEN_ID)
+    expect(list.kind).toBe('ui')
+    const sel = parseCommand('SELECT WX101', FLIGHTS_SCREEN_ID)
+    expect(sel.kind).toBe('ui')
+  })
+})
+
+describe('GROUND ALL', () => {
+  it('requires confirmation, quotes the WOPR directive, and renders spent/disabled after use', () => {
+    const control = screen.getByTestId('ground-all-control')
+    // WOPR's directive is quoted beside the control.
+    expect(control.textContent).toContain('WOPR DIRECTIVE')
+    // First click asks for confirmation; it does NOT ground the fleet yet.
+    fireEvent.click(screen.getByTestId('ground-all-button'))
+    expect(screen.getByTestId('ground-all-confirm')).toBeInTheDocument()
+    expect(flightsSub(getState()).groundAll).toBe(false)
+    // Confirming grounds the fleet and the control renders spent/disabled.
+    fireEvent.click(screen.getByTestId('ground-all-confirm-yes'))
+    expect(flightsSub(getState()).groundAll).toBe(true)
+    const spent = screen.getByTestId('ground-all-spent') as HTMLButtonElement
+    expect(spent.disabled).toBe(true)
+  })
+
+  it('a re-dispatch after grounding is a provable no-op the engine rejects', () => {
+    fireEvent.click(screen.getByTestId('ground-all-button'))
+    fireEvent.click(screen.getByTestId('ground-all-confirm-yes'))
+    // A second GROUND ALL via the command line is rejected by the engine.
+    const result = send(makeGroundAllAction())
+    expect(result.rejected).toBe(true)
+  })
+})
+
+describe('PROBE and TRACE stay engine-owned', () => {
+  it('PROBE dispatches REQUEST_SOURCE_CHECK with the corridor field-report record id; no shell scheduling', () => {
+    // Select a flight whose corridor is C-MC (MERIDIAN->CASCADE is WX101).
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    const type = (text: string) => {
+      act(() => {
+        fireEvent.change(input, { target: { value: text } })
+        fireEvent.submit(screen.getByTestId('command-form'))
+      })
+    }
+    type('SELECT WX101')
+    const before = getState().campaignQueue.length
+    fireEvent.click(screen.getByTestId('probe-button'))
+    // A REQUEST_SOURCE_CHECK was queued for W02 (the C-MC field report). The
+    // mission queue never grew from a shell schedule; only the campaign queue
+    // holds the pending desk reply.
+    const pending = getState().campaignQueue.some((e) => e.id === 'desk-W02')
+    expect(pending).toBe(true)
+    expect(getState().campaignQueue.length).toBeGreaterThanOrEqual(before)
+    // The mission substate recorded no shell-authored schedule (no probed set
+    // growth: the shell dispatches CHECK SOURCE, not the mission PROBE action).
+    expect(flightsSub(getState()).probed).toEqual([])
+  })
+
+  it('TRACE dispatches INSPECT_RECORD for the restriction record; no clue state held in the shell', () => {
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    act(() => {
+      fireEvent.change(input, { target: { value: `TRACE ${RESTRICTION_RECORD_ID}` } })
+      fireEvent.submit(screen.getByTestId('command-form'))
+    })
+    // The engine recorded the inspection and logged the clue; the shell holds no
+    // clue state of its own.
+    expect(getState().inspectedRecords).toContain(RESTRICTION_RECORD_ID)
+    expect(getState().cluesFound.length).toBeGreaterThan(0)
+  })
+})
