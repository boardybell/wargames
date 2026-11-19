// The GLOBAL FAILSAFE finale mission screen. It frames the last puzzle inside
// the terminal: a briefing with the failsafe-wall art and a START control, then
// the three-view layout (CASE builder, COMPARISON, DECISION) with the incident
// log, the five-slot shortlist, and the always-reachable countdown chrome with
// the countdown-insert art. finaleFinalPhase drives the cabinet red alarm (the
// split-02 LampController already keys the alarm off the event) and a relay-pulse
// cue through the shell audio. View switching by CASE / COMPARISON / DECISION
// commands, tabs, and mobile back, with the active view persisted and restored on
// return navigation; the last comparison result and slot contents reappear rather
// than an empty state. The recognition beat (caseValid false-to-true) renders its
// JOSHUA line and fires its voice cue exactly once. Once the finale settles, the
// screen short-circuits to the EndingScreen. It owns NO engine state: slots,
// validity, projections, and endings are all engine-owned; it renders results.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CampaignAction, EngineEvent } from '@engine'
import { onEngineEvent, send, useCampaign } from '../../state'
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
import { selectLine, eventKeyFor } from '@engine/joshua/selectors'
import type { JoshuaLine } from '@engine/joshua/lines'
import { CaseBuilderView } from './CaseBuilderView'
import { ComparisonView, computeComparison, type ComparisonResult } from './ComparisonView'
import { DecisionView } from './DecisionView'
import { EndingScreen } from './EndingScreen'
import {
  FINALE_SCREEN_ID,
  asFinaleUiCommand,
  registerFinaleVerbs,
  type FinaleCaseFileRef,
} from './verbs'
import { registerFinaleGlossary } from './glossary'
import {
  buildDisplayCaseFile,
  buildFinaleSnapshot,
  caseFileRefFrom,
  finaleOpenExceptions,
  finalePayload,
  finaleSubstate,
  setFinaleView,
  settledFinale,
  useFinaleView,
  type FinaleView,
} from './selectors'
import type {
  FinaleState,
  FinaleSlot,
  CommitChoice,
} from '@engine/missions/finale/types'
import { SUBSYSTEM_SLOTS } from '@engine/missions/finale/types'

const FINALE = 'finale'
const MISSION_TITLE = 'GLOBAL FAILSAFE'

const BRIEFING = [
  'GLOBAL FAILSAFE',
  '',
  'ONE DRILL ORDER STARTED ALL OF IT. PROVE IT.',
  'BUILD THE CASE, PROJECT THE THREE ORDERS, AND COMMIT ONE BEFORE THE CLOCK RUNS OUT.',
  'THE ONLY WINNING MOVE MAY NOT BE TO PLAY.',
].join('\n')

/** The relay-pulse cue the final phase plays, and the recognition cue the
 *  caseValid false-to-true transition plays. Authored cue ids split 07 fills;
 *  play() is a safe no-op for an unmapped id and tests spy on play. */
const RELAY_PULSE_CUE = 'finale-relay-pulse'
const RECOGNITION_CUE = 'finale-recognition'

export function FinaleScreen({ missionId }: MissionScreenProps) {
  const state = useCampaign()
  const narrow = useNarrowViewport()

  // The active view: the stored explicit preference wins and restores on a
  // remount; the case builder is the default. From the useSyncExternalStore
  // store so there is no tearing on a fast toggle.
  const viewPref = useFinaleView()
  const view: FinaleView = viewPref ?? 'case'

  // The final phase alarm, driven by the finaleFinalPhase engine event.
  const [finalPhase, setFinalPhase] = useState(false)

  // A typed COMMIT routes through the SAME confirmation gate the DecisionView
  // button raises. The UI handler (registered once on mount) sets this request
  // through a ref-backed setter; DecisionView opens its dialog for the choice and
  // clears the request once the player confirms or cancels.
  const [requestedCommit, setRequestedCommit] = useState<CommitChoice | null>(
    null,
  )
  const setRequestedCommitRef = useRef(setRequestedCommit)
  setRequestedCommitRef.current = setRequestedCommit

  const payload = finalePayload(state)
  const substate = finaleSubstate(state)
  const settled = settledFinale(state)

  // Last-known finale substate, retained across settlement so the EndingScreen
  // can name the proved slots after the engine deletes the active substate.
  const lastFinaleRef = useRef<FinaleState | null>(substate)
  if (substate) lastFinaleRef.current = substate

  // The frozen comparison snapshot, memoized on its real inputs (the live
  // substate, the campaign state carrying the settled baseline and
  // open-exceptions baseline, and the field-report id). Stable across the
  // countdown-tick rerenders so it is not JSON-cloned and deep-frozen anew every
  // render; recomputed only when one of those inputs actually changes.
  const snapshot = useMemo(
    () =>
      substate && payload
        ? buildFinaleSnapshot(substate, state, payload.fieldReportId)
        : null,
    [substate, state, payload],
  )

  // Recognition latch: the caseValid false-to-true transition fires the JOSHUA
  // line and voice cue exactly once. Tracked across renders off the previous
  // caseValid, mirroring the engine's derived (not persisted) recognition beat.
  const prevCaseValid = useRef<boolean>(substate?.caseValid ?? false)

  const stateRef = useRef(state)
  stateRef.current = state

  // The designated field-report record id the REQUEST FIELD REPORT verb issues
  // the engine desk check against. Ref-backed so the once-on-mount verb
  // registration always reads the live payload.
  const fieldReportIdRef = useRef<string>(payload?.fieldReportId ?? '')
  fieldReportIdRef.current = payload?.fieldReportId ?? ''

  const caseFileRef = (): FinaleCaseFileRef => caseFileRefFrom(stateRef.current)
  const slotsRef = useRef<FinaleState['slots'] | null>(substate?.slots ?? null)
  slotsRef.current = substate?.slots ?? null

  // The effective subsystem ordering the MOVE verb operates over: the explicit
  // ordering when it is set, otherwise the three filled subsystem record ids in
  // canonical slot order (outlook, flights, bank). Reordering a slot the player
  // has not yet explicitly ordered still behaves intuitively.
  const effectiveOrdering = (): readonly string[] => {
    const explicit = substate?.ordering ?? []
    if (explicit.length > 0) return explicit
    const slots = slotsRef.current
    if (!slots) return []
    return SUBSYSTEM_SLOTS.map((slot) => slots[slot]).filter(
      (id): id is string => id !== null,
    )
  }
  const orderingRef = useRef<() => readonly string[]>(effectiveOrdering)
  orderingRef.current = effectiveOrdering

  // Register verbs, the view UI handler, and the local glossary on mount.
  useEffect(() => {
    registerFinaleGlossary()
    const unregister = registerFinaleVerbs({
      caseFile: () => caseFileRef(),
      ordering: () => orderingRef.current(),
      recordForSlot: (slot: FinaleSlot) =>
        (slotsRef.current?.[slot] ?? null) as string | null,
      fieldReportId: () => fieldReportIdRef.current,
    })
    const unregisterUi = registerScreenUiHandler(FINALE_SCREEN_ID, (detail) => {
      const ui = asFinaleUiCommand(detail)
      if (!ui) return
      if (ui.kind === 'BACK') {
        setFinaleView('case')
        return
      }
      if (ui.kind === 'COMMIT') {
        // Surface the confirmation on the decision view, then request the gate.
        setFinaleView('decision')
        setRequestedCommitRef.current(ui.choice)
        return
      }
      setFinaleView(ui.view)
    })
    return () => {
      unregister()
      unregisterUi()
    }
  }, [])

  // Subscribe to engine events. The end-anchored warnings (timerMilestone with
  // id warn-30 / warn-10) and the finaleFinalPhase event each resolve a JOSHUA
  // line through the catalog and announce it; finaleFinalPhase also lights the
  // red alarm and plays the relay-pulse cue. The warnings are end-anchored by
  // the engine and never scaled; the screen adds nothing of its own to timing.
  useEffect(() => {
    return onEngineEvent((event: EngineEvent) => {
      if (event.type === 'timerMilestone') {
        const key = eventKeyFor({ id: event.id })
        if (key) {
          const line = selectLine(key)
          if (line) announce(line.text, 'assertive')
        }
        return
      }
      if (event.type === 'finaleFinalPhase') {
        setFinalPhase(true)
        play(RELAY_PULSE_CUE)
        const key = eventKeyFor({ kind: 'finaleFinalPhase' })
        if (key) {
          const line = selectLine(key)
          if (line) announce(line.text, 'assertive')
        }
      }
    })
  }, [])

  // The recognition beat: on a render where caseValid went false to true, render
  // the line and fire the voice cue exactly once.
  const [recognitionLine, setRecognitionLine] = useState<JoshuaLine | null>(null)
  useEffect(() => {
    const nowValid = substate?.caseValid ?? false
    if (nowValid && !prevCaseValid.current) {
      const line = selectLine('finale.recognition', { recognized: true })
      if (line) {
        setRecognitionLine(line)
        play(line.voiceClipId || RECOGNITION_CUE)
        announce(line.text, 'assertive')
      } else {
        play(RECOGNITION_CUE)
      }
    }
    prevCaseValid.current = nowValid
  }, [substate?.caseValid])

  const onAction = (action: CampaignAction): void => {
    send(action)
  }

  // ---- Settled: show the ending. The screen stays mounted through COMMIT; the
  //      moment a settled finale outcome exists it renders the EndingScreen. ----
  if (settled && payload) {
    return (
      <div data-testid="finale-screen" data-mission-id={missionId} data-settled="true">
        <EndingScreen
          state={state}
          outcome={settled}
          finaleState={lastFinaleRef.current ?? undefined}
          fieldReportId={payload.fieldReportId}
        />
      </div>
    )
  }

  // ---- Briefing: before the finale is active, render failsafe-wall + START. ----
  if (!substate || !payload) {
    return (
      <div
        data-testid="finale-screen"
        data-mission-id={missionId}
        data-view={view}
        data-phase="briefing"
      >
        <ArtSlot id="failsafe-wall" />
        <TerminalText dim>{BRIEFING}</TerminalText>
        <button
          type="button"
          data-testid="finale-start"
          onClick={() => send({ type: 'START_MISSION', missionId: FINALE })}
        >
          START
        </button>
      </div>
    )
  }

  const deadline = state.activeMission?.endsAt ?? null
  const openExceptions = finaleOpenExceptions(state)
  const displayCaseFile = buildDisplayCaseFile(state, payload)
  // Non-null here: the briefing guard above returned when substate or payload
  // was absent, which is exactly when the memo yields null.
  const activeSnapshot = snapshot!

  // The comparison result is DERIVED from comparisonsRun, not held imperatively:
  // the settled baseline and open-exceptions baseline are immutable after finale
  // start, so recomputing over the current snapshot yields the SAME frozen
  // figures every time (determinism). Deriving this way means a RUN COMPARISON
  // dispatched through the shared command line and one through a button both
  // light the columns, and the columns reappear on return navigation for free.
  const comparison: ComparisonResult | null =
    substate.comparisonsRun > 0 ? computeComparison(activeSnapshot) : null

  const rejectionLine: JoshuaLine | null = substate.lastRejection
    ? selectLine(`finale.reject.${substate.lastRejection.code}`)
    : null

  const pane = narrow ? 'single' : 'two'

  return (
    <div
      data-testid="finale-screen"
      data-mission-id={missionId}
      data-view={view}
      data-pane={pane}
      data-final-phase={finalPhase ? 'true' : 'false'}
    >
      <ArtSlot id="failsafe-wall" />
      <TerminalText dim>{BRIEFING}</TerminalText>

      <StatusLine>
        {`OPEN EXCEPTIONS ${openExceptions}  CASE ${substate.caseValid ? 'CERTIFIED' : 'OPEN'}  COMPARISONS ${substate.comparisonsRun}`}
      </StatusLine>

      {/* The incident log: the case-file records with inspected ones highlighted,
          an always-present reference beside the shortlist. */}
      <div data-testid="finale-incident-log" className="finale-incident-log">
        <TerminalText dim>INCIDENT LOG</TerminalText>
        <ul>
          {displayCaseFile.graph.records.map((record) => {
            const inspected = state.inspectedRecords.includes(record.id)
            return (
              <li
                key={record.id}
                data-testid={`finale-log-${record.id}`}
                data-highlighted={inspected ? 'true' : 'false'}
                className={inspected ? 'finale-log-inspected' : undefined}
              >
                {record.id}
              </li>
            )
          })}
        </ul>
      </div>

      {/* The evidence shortlist: the five slots summarized, reachable in reach. */}
      <div data-testid="finale-shortlist" className="finale-shortlist">
        <TerminalText dim>EVIDENCE SHORTLIST</TerminalText>
        <ul>
          {(['outlook', 'flights', 'bank', 'root', 'observation'] as const).map(
            (slot) => (
              <li key={slot} data-testid={`finale-shortlist-${slot}`}>
                {`${slot.toUpperCase()}: ${substate.slots[slot] ?? 'EMPTY'}`}
              </li>
            ),
          )}
        </ul>
      </div>

      {/* The deadline, always in reach as countdown chrome with its art slot. */}
      {deadline !== null ? (
        <div
          className="finale-countdown"
          data-testid="finale-countdown"
          data-alarm={finalPhase ? 'true' : 'false'}
        >
          <ArtSlot id="countdown-insert" />
          <Countdown endsAt={deadline} />
        </div>
      ) : null}

      {/* The recognition beat line, once. */}
      {recognitionLine ? (
        <div data-testid="finale-recognition-line" role="status">
          <TerminalText>{recognitionLine.text}</TerminalText>
        </div>
      ) : null}

      <div className="finale-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="finale-tab-case"
          aria-selected={view === 'case'}
          onClick={() => setFinaleView('case')}
        >
          CASE
        </button>
        <button
          type="button"
          role="tab"
          data-testid="finale-tab-comparison"
          aria-selected={view === 'comparison'}
          onClick={() => setFinaleView('comparison')}
        >
          COMPARISON
        </button>
        <button
          type="button"
          role="tab"
          data-testid="finale-tab-decision"
          aria-selected={view === 'decision'}
          onClick={() => setFinaleView('decision')}
        >
          DECISION
        </button>
      </div>

      <div className="finale-body">
        {narrow && view !== 'case' ? (
          <button
            type="button"
            data-testid="finale-back"
            onClick={() => setFinaleView('case')}
          >
            BACK
          </button>
        ) : null}

        {view === 'case' ? (
          <CaseBuilderView
            finaleState={substate}
            caseFile={displayCaseFile}
            caseFileRef={caseFileRefFrom(state)}
            fieldReportRequested={substate.fieldReportRequested}
            rejectionLine={rejectionLine}
            onAction={onAction}
          />
        ) : null}
        {view === 'comparison' ? (
          <ComparisonView
            caseValid={substate.caseValid}
            snapshot={activeSnapshot}
            result={comparison}
            comparisonsRun={substate.comparisonsRun}
            onAction={onAction}
          />
        ) : null}
        {view === 'decision' ? (
          <DecisionView
            caseValid={substate.caseValid}
            staged={comparison?.staged ?? null}
            repeatProjection={comparison?.repeat ?? null}
            onAction={onAction}
            commitSnapshot={{
              settled: activeSnapshot.settled,
              openExceptionsBaseline: activeSnapshot.openExceptionsBaseline,
            }}
            requestedCommit={requestedCommit}
            onRequestHandled={() => setRequestedCommit(null)}
          />
        ) : null}
      </div>

      {/* A glossary anchor so the four terms are active wherever the screen is. */}
      <div className="finale-glossary-anchor" hidden aria-hidden="true">
        <GlossaryTerm id="finale-case" />
        <GlossaryTerm id="finale-root-source" />
        <GlossaryTerm id="finale-projection" />
        <GlossaryTerm id="finale-viability-threshold" />
      </div>
    </div>
  )
}

/** Register the screen under mission id finale, plus its title. Idempotent for
 *  tests: the screen registry overwrites a prior registration. */
export function registerFinaleScreen(): void {
  registerMissionScreen(FINALE, FinaleScreen)
  registerMissionTitle(FINALE, MISSION_TITLE)
  registerFinaleGlossary()
}

export { SUBSYSTEM_SLOTS }
