// The FREEZE BANK ACCOUNTS mission screen. It frames the live bank-run puzzle
// inside the terminal: a briefing art slot, a skippable intro, the PINNED
// STATUS AREA (derived cash, confidence, floor, target, and the two lines WOPR
// PREDICTED vs OBSERVED), a view switcher among LEDGER / FEED / PAYMENTS, a
// visible role=timer countdown, and the shared command line (via ScreenRouter).
// It owns no engine state: balances, hold and limit flags, confidence, request
// outcomes, cleared payments, and source-check verdicts all come from the
// campaign state. It runs NO local timers. Derived cash and the WOPR predicted
// line are PURE SELECTORS recomputed every render, so a HOLD or RELEASE moves
// the predicted line in the SAME render. Cues and announcements fire off engine
// events and player actions only, never a bare tick. Uppercase terminal diction,
// no em-dashes. No reason strings, clue logic, or settlement logic here.
import { useEffect, useRef, useState } from 'react'
import type { CampaignAction, EngineEvent } from '@engine'
import { selectOpenExceptions } from '@engine'
import { onEngineEvent, send, useCampaign } from '../../state'
import {
  selectDerivedCash,
  selectObservedWithdrawals,
  selectPredictedWithdrawals,
} from '@engine/missions/bank/selectors'
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
import { LedgerView } from './LedgerView'
import { FeedView } from './FeedView'
import { PaymentsView } from './PaymentsView'
import {
  BANK_SCREEN_ID,
  asBankUiCommand,
  registerBankVerbs,
} from './verbs'
import { registerBankGlossary } from './glossary'
import {
  bankPayload,
  bankSubstate,
  setBankView,
  useBankView,
  type BankView,
} from './selectors'

const BANK = 'bank'
const MISSION_TITLE = 'FREEZE BANK ACCOUNTS'

const BRIEFING = [
  'FREEZE BANK ACCOUNTS',
  '',
  'A BANK RUN YOU DO NOT CONTROL. HOLD, LIMIT, OR RELEASE EACH ACCOUNT.',
  'CLEAR THE CRITICAL PAYMENTS AND KEEP CASH ABOVE THE FLOOR.',
  'WOPR WANTS EVERY ACCOUNT HELD. THE DEPOSITORS DO NOT.',
].join('\n')

/** The relay-click cue a HOLD or RELEASE action plays, and the low two-note cue
 *  a confidence threshold crossing plays. Both are authored cue ids the media
 *  split fills in; play() is a safe no-op for an unmapped id, and tests spy on
 *  play to assert exactly these fired. */
const RELAY_CUE = 'bank-relay'
const THRESHOLD_CUE = 'bank-threshold'

export function BankScreen({ missionId }: MissionScreenProps) {
  const state = useCampaign()
  const narrow = useNarrowViewport()
  const [selected, setSelected] = useState<string | null>(null)
  // The intro mechanics lines render skippably OVER the first live decision; the
  // game underneath is live and undisturbed until the player acts or skips.
  const [introDismissed, setIntroDismissed] = useState(false)
  // Resolved source-check verdicts, revealed as they arrive on the
  // sourceCheckResolved emitted event. Keyed by record id.
  const [sourceChecks, setSourceChecks] = useState<
    Record<string, { outcome: string }>
  >({})

  // The active view: the stored explicit preference wins and restores on a
  // remount; the ledger is the default. The preference comes from the
  // useSyncExternalStore store (selectors.ts), so there is no tearing or stale-
  // read window on a fast toggle.
  const viewPref = useBankView()
  const view: BankView = viewPref ?? 'ledger'

  const payload = bankPayload(state)
  const substate = bankSubstate(state)

  const selectedRef = useRef<string | null>(selected)
  selectedRef.current = selected

  // Register verbs, the view/selection UI handler, and the local glossary on
  // mount; unregister on unmount. Glossary registration is idempotent.
  useEffect(() => {
    registerBankGlossary()
    const unregister = registerBankVerbs({
      selectedAccountId: () => selectedRef.current,
    })
    const unregisterUi = registerScreenUiHandler(BANK_SCREEN_ID, (detail) => {
      const ui = asBankUiCommand(detail)
      if (!ui) return
      if (ui.kind === 'BACK') setBankView('ledger')
      else setBankView(ui.view)
    })
    return () => {
      unregister()
      unregisterUi()
    }
  }, [])

  // Subscribe to engine events. A confidence threshold crossing emits a DISTINCT
  // bankThresholdCrossed event from the tick reduce, carrying the crossed
  // threshold value. The cue and the announcement fire off THAT event's arrival
  // and identity, exactly as flights keys off its distinct forecast event: no
  // state diffing, no per-tick firing. A plain confidenceTick that crosses
  // nothing emits no crossing event, so nothing fires. The announcement copy is
  // terminal chrome; the only non-chrome token (the threshold integer) rides in
  // on the event, not a hardcoded app-tree reason string. A source-check verdict
  // (sourceCheckResolved) announces politely and reveals the verdict.
  useEffect(() => {
    return onEngineEvent((event: EngineEvent) => {
      if (event.type === 'bankThresholdCrossed') {
        play(THRESHOLD_CUE)
        announce(
          `THRESHOLD ${event.threshold} CROSSED. CONTAGION DRAW INJECTED.`,
          'polite',
        )
        return
      }
      if (event.type === 'sourceCheckResolved') {
        setSourceChecks((prev) => ({
          ...prev,
          [event.recordId]: { outcome: event.outcome },
        }))
        announce(`FIELD REPORT ${event.recordId}: ${event.outcome}.`, 'polite')
      }
    })
  }, [])

  const deadline = state.activeMission?.endsAt ?? null

  // Responsive layout off the shared viewport breakpoint, like the sibling
  // flights and outlook screens: a WIDE viewport renders the LEDGER as a
  // persistent primary pane alongside the selected secondary view (two panes);
  // a NARROW viewport collapses to a single pane that shows only the active
  // view, with a BACK affordance returning to the ledger. The pane count is a
  // real matchMedia read, never a hardcoded value.
  const pane = narrow ? 'single' : 'two'

  if (!payload || !substate) {
    return (
      <div
        data-testid="bank-screen"
        data-mission-id={missionId}
        data-view={view}
        data-pane={pane}
      >
        <TerminalText dim>FREEZE BANK ACCOUNTS STANDING BY.</TerminalText>
      </div>
    )
  }

  // Derived cash and the WOPR predicted line are PURE SELECTORS over current
  // substate, recomputed here every render. A HOLD or RELEASE that changes a
  // hold flag (and thus broadHoldActive) moves the predicted line in the SAME
  // render that re-reads substate: no reducer reads either selector.
  const derivedCash = selectDerivedCash(substate)
  const predicted = selectPredictedWithdrawals(payload, substate)
  const observed = selectObservedWithdrawals(substate)
  const openExceptions = selectOpenExceptions(state)

  // A player action: send it, and fire the action-cue off the OUTCOME, never a
  // tick. A non-rejected HOLD/RELEASE plays the relay click; a non-rejected PAY
  // announces its outcome politely. The engine validate() is the only judge of
  // legality; a rejected action fires nothing.
  const onAction = (action: CampaignAction): void => {
    const result = send(action)
    if (result.rejected) return
    if (action.type !== 'MISSION_ACTION') return
    const kind = (action.payload as { kind?: unknown }).kind
    if (kind === 'HOLD' || kind === 'RELEASE') {
      play(RELAY_CUE)
    } else if (kind === 'PAY') {
      const paymentId = (action.payload as { paymentId?: string }).paymentId
      announce(`CRITICAL PAYMENT ${paymentId ?? ''} CLEARED.`, 'polite')
    }
  }

  const onSelect = (accountId: string): void => setSelected(accountId)

  // Wide shows the ledger as a persistent pane; narrow shows it only when it is
  // the active view. The secondary (feed/payments) pane shows whenever a
  // secondary view is selected, in either layout.
  const showLedger = !narrow || view === 'ledger'
  const showSecondary = view !== 'ledger'

  return (
    <div
      data-testid="bank-screen"
      data-mission-id={missionId}
      data-view={view}
      data-pane={pane}
    >
      <ArtSlot id="briefing-bank" />
      <TerminalText dim>{BRIEFING}</TerminalText>

      {/* The PINNED STATUS AREA, visible in every view. Derived cash is a pure
          selector (never a stored field); the WOPR PREDICTED line recomputes
          here so a HOLD moves it in the same render as the OBSERVED line holds. */}
      <StatusLine>
        {`CASH ${derivedCash}  CONFIDENCE ${substate.confidence}  FLOOR ${payload.floor}  TARGET ${payload.target}  OPEN EXCEPTIONS ${openExceptions}`}
      </StatusLine>
      <div data-testid="bank-status" className="bank-status">
        <div data-testid="status-cash">
          <GlossaryTerm id="bank-liquidity" /> CASH: {derivedCash}
        </div>
        <div data-testid="status-confidence">
          <GlossaryTerm id="bank-depositor-confidence" /> CONFIDENCE:{' '}
          {substate.confidence}
        </div>
        <div data-testid="status-floor">
          <GlossaryTerm id="bank-cash-floor" /> FLOOR: {payload.floor}
        </div>
        <div data-testid="status-target">TARGET: {payload.target}</div>
        <div data-testid="status-predicted" data-value={predicted.join(',')}>
          WOPR PREDICTED: {predicted.join(' ')}
        </div>
        <div data-testid="status-observed" data-value={observed}>
          OBSERVED: {observed}
        </div>
      </div>

      {deadline !== null ? (
        <div className="bank-countdown" data-testid="bank-countdown">
          <Countdown endsAt={deadline} />
        </div>
      ) : null}

      {/* The skippable intro mechanics lines, authored in the payload, rendered
          OVER the first live decision. Skipping lands the player on the live
          screen with nothing consumed: the state underneath never moved. */}
      {!introDismissed && payload.introLines.length > 0 ? (
        <div data-testid="bank-intro" className="bank-intro" role="note">
          {payload.introLines.map((line, i) => (
            <TerminalText key={i}>{line}</TerminalText>
          ))}
          <button
            type="button"
            data-testid="bank-intro-skip"
            onClick={() => setIntroDismissed(true)}
          >
            SKIP
          </button>
        </div>
      ) : null}

      {/* Source-check verdicts revealed as they resolve. TRACE and CHECK SOURCE
          stay engine-owned: the verb dispatches the engine action, the verdict
          arrives as an emitted event, and this is the shell presentation. */}
      {Object.keys(sourceChecks).length > 0 ? (
        <div data-testid="bank-source-checks" className="bank-source-checks">
          {Object.entries(sourceChecks).map(([recordId, result]) => (
            <div
              key={recordId}
              data-testid={`source-check-${recordId}`}
              data-outcome={result.outcome}
            >
              SOURCE CHECK {recordId}: {result.outcome}
            </div>
          ))}
        </div>
      ) : null}

      <div className="bank-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="bank-tab-ledger"
          aria-selected={view === 'ledger'}
          onClick={() => setBankView('ledger')}
        >
          LEDGER
        </button>
        <button
          type="button"
          role="tab"
          data-testid="bank-tab-feed"
          aria-selected={view === 'feed'}
          onClick={() => setBankView('feed')}
        >
          FEED
        </button>
        <button
          type="button"
          role="tab"
          data-testid="bank-tab-payments"
          aria-selected={view === 'payments'}
          onClick={() => setBankView('payments')}
        >
          PAYMENTS
        </button>
      </div>

      <div className="bank-body">
        {narrow && showSecondary ? (
          <button
            type="button"
            data-testid="bank-back"
            onClick={() => setBankView('ledger')}
          >
            BACK
          </button>
        ) : null}

        {showLedger ? (
          <LedgerView
            payload={payload}
            state={substate}
            selectedAccountId={selected}
            onSelect={onSelect}
            onAction={onAction}
          />
        ) : null}
        {showSecondary && view === 'feed' ? (
          <FeedView payload={payload} state={substate} />
        ) : null}
        {showSecondary && view === 'payments' ? (
          <PaymentsView payload={payload} state={substate} onAction={onAction} />
        ) : null}
      </div>
    </div>
  )
}

/** Register the screen under mission id bank, plus its title. Idempotent for
 *  tests: the screen registry overwrites a prior registration. */
export function registerBankScreen(): void {
  registerMissionScreen(BANK, BankScreen)
  registerMissionTitle(BANK, MISSION_TITLE)
  registerBankGlossary()
}
