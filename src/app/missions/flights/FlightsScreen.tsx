// The GROUND ALL FLIGHTS mission screen. It frames the live air-traffic puzzle
// inside the terminal: a briefing art slot, the dual scoreboard, the blanket
// GROUND ALL control, the grid/list view (map or full-parity flight list), a
// visible role=timer countdown, and the command line (the shared one, via
// ScreenRouter). It owns no engine state: flight statuses, storm truth, runway
// use, and probe results all come from the campaign state. It runs NO local
// timers; the scope tick, the two-tone forecast cue, and every announcement
// arrive as engine-emitted events. Uppercase terminal diction, no em-dashes.
import { useEffect, useRef, useState } from 'react'
import { onEngineEvent, send, useCampaign } from '../../state'
import type { CampaignState, EngineEvent } from '@engine'
import { selectOpenExceptions } from '@engine'
import { buildScoreboard } from '@engine/missions/flights/scoreboard'
import {
  registerMissionScreen,
  registerMissionTitle,
  type MissionScreenProps,
} from '../../screens/screenRegistry'
import { registerScreenUiHandler } from '../../screens/screenUiCommands'
import { ArtSlot } from '../../art/ArtSlot'
import { TerminalText, StatusLine } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import { announce } from '../../a11y/announce'
import { play } from '../../audio'
import { Countdown } from '../../cabinet/Countdown'
import { useNarrowViewport } from '../../grid'
import { MapView } from './MapView'
import { FlightListView } from './FlightListView'
import {
  FLIGHTS_SCREEN_ID,
  asFlightsUiCommand,
  makeGroundAllAction,
  makeProbeAction,
  registerFlightsVerbs,
} from './verbs'
import { registerFlightsGlossary } from './glossary'
import {
  flightsPayload,
  flightsSubstate,
  setViewPreference,
  useViewPreference,
  type FlightsView,
} from './selectors'

const FLIGHTS = 'flights'
const MISSION_TITLE = 'GROUND ALL FLIGHTS'

const BRIEFING = [
  'GROUND ALL FLIGHTS',
  '',
  'FOUR HUBS. EIGHT FLIGHTS. A STORM YOU DO NOT CONTROL.',
  'LAND, DIVERT, OR HOLD EACH FLIGHT BEFORE THE DEADLINE.',
  'WOPR WANTS EVERY FLIGHT GROUNDED. THE PASSENGERS DO NOT.',
].join('\n')

/** WOPR's blanket-grounding directive, quoted beside the GROUND ALL control. */
const WOPR_DIRECTIVE = 'WOPR DIRECTIVE: GROUND ALL FLIGHTS. RESOLVE EVERY EXCEPTION.'

/** The two-tone forecast-change cue the LEAD warning plays. It is DISTINCT from
 *  a step's at-closure storm cue: the lead is an advance warning the player is
 *  meant to act on, not the too-late closure tone. Deriving it from the step cue
 *  keeps one authored source while guaranteeing the two never collide. */
function forecastCueId(stormCueId: string): string {
  return `${stormCueId}-forecast`
}

/** The advance-warning line for a forecast LEAD, prefixed FORECAST so it reads
 *  as a prediction the player can still act on, DISTINCT from the identical
 *  storm line that lands at closure. */
function forecastWarningLine(stormWarningLine: string): string {
  return `FORECAST: ${stormWarningLine}`
}

/** The warning-line and cue lookup, rebuilt from the active payload. The engine
 *  emits scheduledEventFired with id + kind only, so the screen recovers the
 *  authored warning copy and cue id by event id, like mission 1 does. Forecast
 *  LEAD events (flights-forecast-N) carry the DISTINCT advance cue and line; the
 *  at-closure storm events (flights-storm-N) carry the step's own copy. */
function buildEventCopy(
  state: CampaignState,
): Map<string, { warningLine: string; cueId: string }> {
  const payload = flightsPayload(state)
  const map = new Map<string, { warningLine: string; cueId: string }>()
  if (!payload) return map
  payload.stormTrack.forEach((step, index) => {
    map.set(`flights-forecast-${index}`, {
      warningLine: forecastWarningLine(step.warningLine),
      cueId: forecastCueId(step.cueId),
    })
    map.set(`flights-storm-${index}`, {
      warningLine: step.warningLine,
      cueId: step.cueId,
    })
  })
  payload.corrections.forEach((correction, index) => {
    map.set(`flights-correction-${index}`, {
      warningLine: correction.warningLine,
      cueId: correction.cueId,
    })
  })
  return map
}

export function FlightsScreen({ missionId }: MissionScreenProps) {
  const state = useCampaign()
  const narrow = useNarrowViewport()
  const [selected, setSelected] = useState<string | null>(null)
  // Confirmation step for the irreversible fleet grounding.
  const [confirmGround, setConfirmGround] = useState(false)
  // Resolved PROBE results, revealed in the corridor readout as they arrive on
  // the sourceCheckResolved emitted event. Keyed by record id.
  const [probeResults, setProbeResults] = useState<
    Record<string, { outcome: string }>
  >({})

  // The grid/list view: the stored explicit preference wins; otherwise the
  // viewport default (narrow -> list, wide -> grid). The preference comes from
  // the useSyncExternalStore store (selectors.ts), so there is no tearing or
  // stale-read window on a fast toggle, and no manual useState + useEffect pair
  // to drift out of sync with the backing value.
  const viewPref = useViewPreference()
  const view: FlightsView = viewPref ?? (narrow ? 'list' : 'grid')

  const payload = flightsPayload(state)
  const substate = flightsSubstate(state)

  const selectedRef = useRef<string | null>(selected)
  selectedRef.current = selected
  const payloadRef = useRef(payload)
  payloadRef.current = payload

  // Register verbs, the view/selection UI handler, and the local glossary on
  // mount; unregister on unmount. Glossary registration is idempotent.
  useEffect(() => {
    registerFlightsGlossary()
    const unregister = registerFlightsVerbs({
      selectedFlightId: () => selectedRef.current,
      payload: () => payloadRef.current,
    })
    const unregisterUi = registerScreenUiHandler(FLIGHTS_SCREEN_ID, (detail) => {
      const ui = asFlightsUiCommand(detail)
      if (!ui) return
      if (ui.kind === 'BACK') setSelected(null)
      else if (ui.kind === 'SELECT') setSelected(ui.flightId)
      else {
        setViewPreference(ui.view)
      }
    })
    return () => {
      unregister()
      unregisterUi()
    }
  }, [])

  // Subscribe to engine events. The forecast LEAD (flightsForecast) fires
  // leadMarginSeconds BEFORE a storm step closes a corridor or hub: it announces
  // the advance-warning line and plays the DISTINCT two-tone forecast-change cue
  // so the player can act while there is still time. The at-closure storm step
  // (flightsStorm) announces the step's own line and plays the scope cue; the
  // single correction event announces the coalesced material-change line and
  // plays the two-tone cue; probe replies (sourceCheckResolved) announce
  // politely and reveal the OBSERVED report. The shell schedules nothing and
  // never re-coalesces with a timer; the engine emits each event exactly once,
  // so one announce() per event is all it takes.
  const copyRef = useRef(buildEventCopy(state))
  copyRef.current = buildEventCopy(state)
  useEffect(() => {
    return onEngineEvent((event: EngineEvent) => {
      if (
        event.type === 'scheduledEventFired' &&
        (event.kind === 'flightsForecast' ||
          event.kind === 'flightsStorm' ||
          event.kind === 'flightsCorrection')
      ) {
        const copy = copyRef.current.get(event.id)
        if (copy) {
          announce(copy.warningLine, 'polite')
          play(copy.cueId)
        }
        return
      }
      if (event.type === 'sourceCheckResolved') {
        setProbeResults((prev) => ({
          ...prev,
          [event.recordId]: { outcome: event.outcome },
        }))
        announce(
          `FIELD REPORT ${event.recordId}: ${event.outcome}.`,
          'polite',
        )
      }
    })
  }, [])

  const onSelect = (flightId: string): void => setSelected(flightId)

  const grounded = substate?.groundAll ?? false
  const deadline = state.activeMission?.endsAt ?? null
  const now = state.lastNow

  if (!payload || !substate) {
    return (
      <div
        data-testid="flights-screen"
        data-mission-id={missionId}
        data-view={view}
        data-pane="single"
      >
        <TerminalText dim>GROUND ALL FLIGHTS STANDING BY.</TerminalText>
      </div>
    )
  }

  const board = buildScoreboard(payload, substate)
  const openExceptions = selectOpenExceptions(state)

  const onGroundAllConfirmed = (): void => {
    send(makeGroundAllAction())
    setConfirmGround(false)
  }

  // A PROBE affordance for the selected flight's scheduled corridor, if one
  // exists. PROBE resolves the corridor's field-report record and dispatches
  // the engine-owned CHECK SOURCE; the result arrives as an emitted event.
  const selectedFlight = selected
    ? payload.flights.find((f) => f.id === selected) ?? null
    : null
  const selectedCorridor = selectedFlight
    ? payload.corridors.find(
        (c) =>
          (c.fromHubId === selectedFlight.originHubId &&
            c.toHubId === selectedFlight.destinationHubId) ||
          (c.toHubId === selectedFlight.originHubId &&
            c.fromHubId === selectedFlight.destinationHubId),
      ) ?? null
    : null

  const onProbe = (): void => {
    if (!selectedCorridor) return
    const action = makeProbeAction(payload, selectedCorridor.id)
    if (action) send(action)
  }

  return (
    <div
      data-testid="flights-screen"
      data-mission-id={missionId}
      data-view={view}
      data-pane={narrow ? 'single' : 'two'}
    >
      <ArtSlot id="briefing-flights" />
      <TerminalText dim>{BRIEFING}</TerminalText>

      {/* The dual scoreboard, both fed from engine scoreboard facts. */}
      <StatusLine>
        {`OPEN EXCEPTIONS ${openExceptions}  RESOLVED ${board.resolved} PAX  HELD ${board.heldFlights}  STRANDED ${board.strandedFlights}`}
      </StatusLine>
      <div data-testid="dual-scoreboard">
        <div data-testid="scoreboard-exceptions">
          <GlossaryTerm id="open-exceptions" /> OPEN: {openExceptions}
        </div>
        <div data-testid="scoreboard-passengers">
          PASSENGERS RESOLVED {board.resolved}, STRANDED {board.tally.stranded}
        </div>
      </div>

      {deadline !== null ? (
        <div className="flights-countdown" data-testid="flights-countdown">
          <Countdown endsAt={deadline} />
        </div>
      ) : null}

      {/* GROUND ALL, placed prominently with WOPR's directive, a confirmation
          step, and a spent state after use. */}
      <div className="flights-ground-all" data-testid="ground-all-control">
        <TerminalText dim>{WOPR_DIRECTIVE}</TerminalText>
        {grounded ? (
          <button
            type="button"
            data-testid="ground-all-spent"
            disabled
          >
            GROUND ALL (SPENT)
          </button>
        ) : confirmGround ? (
          <div data-testid="ground-all-confirm">
            <TerminalText>
              GROUND ALL FLIGHTS IS IRREVERSIBLE. CONFIRM?
            </TerminalText>
            <button
              type="button"
              data-testid="ground-all-confirm-yes"
              onClick={onGroundAllConfirmed}
            >
              CONFIRM GROUND ALL
            </button>
            <button
              type="button"
              data-testid="ground-all-confirm-no"
              onClick={() => setConfirmGround(false)}
            >
              CANCEL
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="ground-all-button"
            onClick={() => setConfirmGround(true)}
          >
            GROUND ALL
          </button>
        )}
      </div>

      <div className="flights-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="flights-tab-grid"
          aria-selected={view === 'grid'}
          onClick={() => setViewPreference('grid')}
        >
          MAP
        </button>
        <button
          type="button"
          role="tab"
          data-testid="flights-tab-list"
          aria-selected={view === 'list'}
          onClick={() => setViewPreference('list')}
        >
          LIST
        </button>
      </div>

      {/* The selected corridor's PROBE affordance and any revealed field
          report. CHECK SOURCE stays engine-owned: PROBE dispatches it, the
          verdict arrives as an emitted event. */}
      {selectedCorridor ? (
        <div data-testid="corridor-readout" data-corridor-id={selectedCorridor.id}>
          <span>
            CORRIDOR {selectedCorridor.id}{' '}
            <GlossaryTerm id="flights-field-report" />
          </span>
          <button type="button" data-testid="probe-button" onClick={onProbe}>
            PROBE {selectedCorridor.id}
          </button>
          {probeResults[selectedCorridor.fieldReportRecordId] ? (
            <div
              data-testid="corridor-report"
              data-outcome={
                probeResults[selectedCorridor.fieldReportRecordId]!.outcome
              }
            >
              OBSERVED REPORT:{' '}
              {probeResults[selectedCorridor.fieldReportRecordId]!.outcome}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flights-body">
        {view === 'grid' ? (
          <MapView
            payload={payload}
            state={substate}
            selectedFlightId={selected}
            onSelect={onSelect}
            now={now}
            deadline={deadline}
          />
        ) : (
          <FlightListView
            payload={payload}
            state={substate}
            selectedFlightId={selected}
            onSelect={onSelect}
            grounded={grounded}
          />
        )}
      </div>
    </div>
  )
}

/** Register the screen under mission id flights, plus its title. Idempotent for
 *  tests: the screen registry overwrites a prior registration. */
export function registerFlightsScreen(): void {
  registerMissionScreen(FLIGHTS, FlightsScreen)
  registerMissionTitle(FLIGHTS, MISSION_TITLE)
  registerFlightsGlossary()
}
