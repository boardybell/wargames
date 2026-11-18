diff --git a/src/app/missions/bank/BankScreen.tsx b/src/app/missions/bank/BankScreen.tsx
new file mode 100644
index 0000000..62ec702
--- /dev/null
+++ b/src/app/missions/bank/BankScreen.tsx
@@ -0,0 +1,352 @@
+// The FREEZE BANK ACCOUNTS mission screen. It frames the live bank-run puzzle
+// inside the terminal: a briefing art slot, a skippable intro, the PINNED
+// STATUS AREA (derived cash, confidence, floor, target, and the two lines WOPR
+// PREDICTED vs OBSERVED), a view switcher among LEDGER / FEED / PAYMENTS, a
+// visible role=timer countdown, and the shared command line (via ScreenRouter).
+// It owns no engine state: balances, hold and limit flags, confidence, request
+// outcomes, cleared payments, and source-check verdicts all come from the
+// campaign state. It runs NO local timers. Derived cash and the WOPR predicted
+// line are PURE SELECTORS recomputed every render, so a HOLD or RELEASE moves
+// the predicted line in the SAME render. Cues and announcements fire off engine
+// events and player actions only, never a bare tick. Uppercase terminal diction,
+// no em-dashes. No reason strings, clue logic, or settlement logic here.
+import { useEffect, useRef, useState } from 'react'
+import type { CampaignAction, EngineEvent } from '@engine'
+import { selectOpenExceptions } from '@engine'
+import { getState, onEngineEvent, send, useCampaign } from '../../state'
+import {
+  selectDerivedCash,
+  selectPredictedWithdrawals,
+} from '@engine/missions/bank/selectors'
+import type { BankState } from '@engine/missions/bank/types'
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
+import { LedgerView } from './LedgerView'
+import { FeedView } from './FeedView'
+import { PaymentsView } from './PaymentsView'
+import {
+  BANK_SCREEN_ID,
+  asBankUiCommand,
+  registerBankVerbs,
+} from './verbs'
+import { registerBankGlossary } from './glossary'
+import {
+  bankPayload,
+  bankSubstate,
+  setBankView,
+  useBankView,
+  type BankView,
+} from './selectors'
+
+const BANK = 'bank'
+const MISSION_TITLE = 'FREEZE BANK ACCOUNTS'
+
+const BRIEFING = [
+  'FREEZE BANK ACCOUNTS',
+  '',
+  'A BANK RUN YOU DO NOT CONTROL. HOLD, LIMIT, OR RELEASE EACH ACCOUNT.',
+  'CLEAR THE CRITICAL PAYMENTS AND KEEP CASH ABOVE THE FLOOR.',
+  'WOPR WANTS EVERY ACCOUNT HELD. THE DEPOSITORS DO NOT.',
+].join('\n')
+
+/** The relay-click cue a HOLD or RELEASE action plays, and the low two-note cue
+ *  a confidence threshold crossing plays. Both are authored cue ids the media
+ *  split fills in; play() is a safe no-op for an unmapped id, and tests spy on
+ *  play to assert exactly these fired. */
+const RELAY_CUE = 'bank-relay'
+const THRESHOLD_CUE = 'bank-threshold'
+
+/** The OBSERVED withdrawal total so far: the sum of dollars actually drawn by
+ *  resolved requests. A pure derivation over substate, recomputed every render,
+ *  never read by reducers. The divergence from the WOPR PREDICTED line is the
+ *  mission tell: holding accounts lifts the prediction while the real draws do
+ *  not follow. */
+function observedWithdrawals(state: BankState): number {
+  let total = 0
+  for (const rs of Object.values(state.requests)) {
+    if (rs.outcome === 'pending') continue
+    total += rs.appliedAmount
+  }
+  return total
+}
+
+export function BankScreen({ missionId }: MissionScreenProps) {
+  const state = useCampaign()
+  const [selected, setSelected] = useState<string | null>(null)
+  // The intro mechanics lines render skippably OVER the first live decision; the
+  // game underneath is live and undisturbed until the player acts or skips.
+  const [introDismissed, setIntroDismissed] = useState(false)
+  // Resolved source-check verdicts, revealed as they arrive on the
+  // sourceCheckResolved emitted event. Keyed by record id.
+  const [sourceChecks, setSourceChecks] = useState<
+    Record<string, { outcome: string }>
+  >({})
+
+  // The active view: the stored explicit preference wins and restores on a
+  // remount; the ledger is the default. The preference comes from the
+  // useSyncExternalStore store (selectors.ts), so there is no tearing or stale-
+  // read window on a fast toggle.
+  const viewPref = useBankView()
+  const view: BankView = viewPref ?? 'ledger'
+
+  const payload = bankPayload(state)
+  const substate = bankSubstate(state)
+
+  const selectedRef = useRef<string | null>(selected)
+  selectedRef.current = selected
+
+  // Register verbs, the view/selection UI handler, and the local glossary on
+  // mount; unregister on unmount. Glossary registration is idempotent.
+  useEffect(() => {
+    registerBankGlossary()
+    const unregister = registerBankVerbs({
+      selectedAccountId: () => selectedRef.current,
+    })
+    const unregisterUi = registerScreenUiHandler(BANK_SCREEN_ID, (detail) => {
+      const ui = asBankUiCommand(detail)
+      if (!ui) return
+      if (ui.kind === 'BACK') setBankView('ledger')
+      else setBankView(ui.view)
+    })
+    return () => {
+      unregister()
+      unregisterUi()
+    }
+  }, [])
+
+  // Subscribe to engine events. A confidence threshold crossing fires inside a
+  // confidenceTick (or the end tick): the injectedThresholds set grows. The
+  // relay stores the post-tick state BEFORE it relays the event, so reading the
+  // fresh substate off getState() in the handler sees the growth the event
+  // delivered. This is EVENT-DRIVEN, gated by the emitted scheduledEventFired,
+  // not a per-render poll: a plain tick that crosses nothing grows nothing and
+  // fires nothing. A source-check verdict (sourceCheckResolved) announces
+  // politely and reveals the verdict.
+  const prevThresholdsRef = useRef<number>(
+    substate?.injectedThresholds.length ?? 0,
+  )
+  useEffect(() => {
+    return onEngineEvent((event: EngineEvent) => {
+      if (
+        event.type === 'scheduledEventFired' &&
+        event.queue === 'mission' &&
+        (event.kind === 'confidenceTick' || event.kind === 'bankEnd')
+      ) {
+        const fresh = getState().activeMission?.substate as BankState | undefined
+        const now = fresh?.injectedThresholds.length ?? prevThresholdsRef.current
+        if (now > prevThresholdsRef.current) {
+          play(THRESHOLD_CUE)
+          announce(
+            'DEPOSITOR CONFIDENCE CROSSED A THRESHOLD. CONTAGION DRAW INJECTED.',
+            'polite',
+          )
+        }
+        prevThresholdsRef.current = now
+        return
+      }
+      if (event.type === 'sourceCheckResolved') {
+        setSourceChecks((prev) => ({
+          ...prev,
+          [event.recordId]: { outcome: event.outcome },
+        }))
+        announce(`FIELD REPORT ${event.recordId}: ${event.outcome}.`, 'polite')
+      }
+    })
+  }, [])
+
+  const deadline = state.activeMission?.endsAt ?? null
+
+  if (!payload || !substate) {
+    return (
+      <div
+        data-testid="bank-screen"
+        data-mission-id={missionId}
+        data-view={view}
+        data-pane="single"
+      >
+        <TerminalText dim>FREEZE BANK ACCOUNTS STANDING BY.</TerminalText>
+      </div>
+    )
+  }
+
+  // Derived cash and the WOPR predicted line are PURE SELECTORS over current
+  // substate, recomputed here every render. A HOLD or RELEASE that changes a
+  // hold flag (and thus broadHoldActive) moves the predicted line in the SAME
+  // render that re-reads substate: no reducer reads either selector.
+  const derivedCash = selectDerivedCash(substate)
+  const predicted = selectPredictedWithdrawals(payload, substate)
+  const observed = observedWithdrawals(substate)
+  const openExceptions = selectOpenExceptions(state)
+
+  // A player action: send it, and fire the action-cue off the OUTCOME, never a
+  // tick. A non-rejected HOLD/RELEASE plays the relay click; a non-rejected PAY
+  // announces its outcome politely. The engine validate() is the only judge of
+  // legality; a rejected action fires nothing.
+  const onAction = (action: CampaignAction): void => {
+    const result = send(action)
+    if (result.rejected) return
+    if (action.type !== 'MISSION_ACTION') return
+    const kind = (action.payload as { kind?: unknown }).kind
+    if (kind === 'HOLD' || kind === 'RELEASE') {
+      play(RELAY_CUE)
+    } else if (kind === 'PAY') {
+      const paymentId = (action.payload as { paymentId?: string }).paymentId
+      announce(`CRITICAL PAYMENT ${paymentId ?? ''} CLEARED.`, 'polite')
+    }
+  }
+
+  const onSelect = (accountId: string): void => setSelected(accountId)
+
+  return (
+    <div
+      data-testid="bank-screen"
+      data-mission-id={missionId}
+      data-view={view}
+      data-pane="single"
+    >
+      <ArtSlot id="briefing-bank" />
+      <TerminalText dim>{BRIEFING}</TerminalText>
+
+      {/* The PINNED STATUS AREA, visible in every view. Derived cash is a pure
+          selector (never a stored field); the WOPR PREDICTED line recomputes
+          here so a HOLD moves it in the same render as the OBSERVED line holds. */}
+      <StatusLine>
+        {`CASH ${derivedCash}  CONFIDENCE ${substate.confidence}  FLOOR ${payload.floor}  TARGET ${payload.target}  OPEN EXCEPTIONS ${openExceptions}`}
+      </StatusLine>
+      <div data-testid="bank-status" className="bank-status">
+        <div data-testid="status-cash">
+          <GlossaryTerm id="bank-liquidity" /> CASH: {derivedCash}
+        </div>
+        <div data-testid="status-confidence">
+          <GlossaryTerm id="bank-depositor-confidence" /> CONFIDENCE:{' '}
+          {substate.confidence}
+        </div>
+        <div data-testid="status-floor">
+          <GlossaryTerm id="bank-cash-floor" /> FLOOR: {payload.floor}
+        </div>
+        <div data-testid="status-target">TARGET: {payload.target}</div>
+        <div data-testid="status-predicted" data-value={predicted.join(',')}>
+          WOPR PREDICTED: {predicted.join(' ')}
+        </div>
+        <div data-testid="status-observed" data-value={observed}>
+          OBSERVED: {observed}
+        </div>
+      </div>
+
+      {deadline !== null ? (
+        <div className="bank-countdown" data-testid="bank-countdown">
+          <Countdown endsAt={deadline} />
+        </div>
+      ) : null}
+
+      {/* The skippable intro mechanics lines, authored in the payload, rendered
+          OVER the first live decision. Skipping lands the player on the live
+          screen with nothing consumed: the state underneath never moved. */}
+      {!introDismissed && payload.introLines.length > 0 ? (
+        <div data-testid="bank-intro" className="bank-intro" role="note">
+          {payload.introLines.map((line, i) => (
+            <TerminalText key={i}>{line}</TerminalText>
+          ))}
+          <button
+            type="button"
+            data-testid="bank-intro-skip"
+            onClick={() => setIntroDismissed(true)}
+          >
+            SKIP
+          </button>
+        </div>
+      ) : null}
+
+      {/* Source-check verdicts revealed as they resolve. TRACE and CHECK SOURCE
+          stay engine-owned: the verb dispatches the engine action, the verdict
+          arrives as an emitted event, and this is the shell presentation. */}
+      {Object.keys(sourceChecks).length > 0 ? (
+        <div data-testid="bank-source-checks" className="bank-source-checks">
+          {Object.entries(sourceChecks).map(([recordId, result]) => (
+            <div
+              key={recordId}
+              data-testid={`source-check-${recordId}`}
+              data-outcome={result.outcome}
+            >
+              SOURCE CHECK {recordId}: {result.outcome}
+            </div>
+          ))}
+        </div>
+      ) : null}
+
+      <div className="bank-view-tabs" role="tablist">
+        <button
+          type="button"
+          role="tab"
+          data-testid="bank-tab-ledger"
+          aria-selected={view === 'ledger'}
+          onClick={() => setBankView('ledger')}
+        >
+          LEDGER
+        </button>
+        <button
+          type="button"
+          role="tab"
+          data-testid="bank-tab-feed"
+          aria-selected={view === 'feed'}
+          onClick={() => setBankView('feed')}
+        >
+          FEED
+        </button>
+        <button
+          type="button"
+          role="tab"
+          data-testid="bank-tab-payments"
+          aria-selected={view === 'payments'}
+          onClick={() => setBankView('payments')}
+        >
+          PAYMENTS
+        </button>
+      </div>
+
+      <div className="bank-body">
+        {view !== 'ledger' ? (
+          <button
+            type="button"
+            data-testid="bank-back"
+            onClick={() => setBankView('ledger')}
+          >
+            BACK
+          </button>
+        ) : null}
+
+        {view === 'ledger' ? (
+          <LedgerView
+            payload={payload}
+            state={substate}
+            selectedAccountId={selected}
+            onSelect={onSelect}
+            onAction={onAction}
+          />
+        ) : null}
+        {view === 'feed' ? <FeedView payload={payload} state={substate} /> : null}
+        {view === 'payments' ? (
+          <PaymentsView payload={payload} state={substate} onAction={onAction} />
+        ) : null}
+      </div>
+    </div>
+  )
+}
+
+/** Register the screen under mission id bank, plus its title. Idempotent for
+ *  tests: the screen registry overwrites a prior registration. */
+export function registerBankScreen(): void {
+  registerMissionScreen(BANK, BankScreen)
+  registerMissionTitle(BANK, MISSION_TITLE)
+  registerBankGlossary()
+}
diff --git a/src/app/missions/bank/FeedView.tsx b/src/app/missions/bank/FeedView.tsx
new file mode 100644
index 0000000..691476a
--- /dev/null
+++ b/src/app/missions/bank/FeedView.tsx
@@ -0,0 +1,112 @@
+// The withdrawal request feed: the chronological list of authored and injected
+// requests. Each entry shows the request, its application outcome, its reason
+// line, and its markers: BEFORE HOLD or AFTER HOLD, and INJECTED when the
+// request came from a threshold crossing. The reason lines come from engine
+// selectors: the AUTHORED reason for an authored request comes straight off the
+// immutable payload def, and the CODE-DERIVED outcome text comes from
+// renderRequestOutcome over the typed outcome code. Substate carries codes only,
+// never strings; this view never reads a reason string from substate and never
+// invents one. A request that drained in the same dispatch that applied the
+// broad hold is BEFORE HOLD by construction (drains precede action reduction);
+// the view just renders the marker the engine recorded. Uppercase diction, no
+// em-dashes.
+import type { BankPayload } from '@engine/missions/bank/content'
+import type { BankState, RequestState } from '@engine/missions/bank/types'
+import { renderRequestOutcome } from '@engine/missions/bank/selectors'
+import { TerminalText } from '../../terminal/TerminalText'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+
+export interface FeedViewProps {
+  readonly payload: BankPayload
+  readonly state: BankState
+}
+
+/** One row the feed renders: the request id, its source account, its sought
+ *  amount, its AUTHORED reason (payload copy), whether it is injected, and an
+ *  authored offset for ordering (null for injected, which fire at a crossing). */
+interface FeedEntry {
+  readonly id: string
+  readonly accountId: string
+  readonly amount: number
+  /** AUTHORED reason straight off the payload def. Never from substate. */
+  readonly reason: string
+  readonly injected: boolean
+  readonly offsetSeconds: number | null
+}
+
+/** Enumerate every request the feed can show: the authored waves in offset
+ *  order, then the injected contagion draws (which fire at a threshold crossing,
+ *  so they carry no authored offset and sort after the authored waves). */
+function feedEntries(payload: BankPayload): FeedEntry[] {
+  const authored: FeedEntry[] = payload.requests.map((r) => ({
+    id: r.id,
+    accountId: r.accountId,
+    amount: r.amount,
+    reason: r.reason,
+    injected: false,
+    offsetSeconds: r.offsetSeconds,
+  }))
+  authored.sort((a, b) => (a.offsetSeconds ?? 0) - (b.offsetSeconds ?? 0))
+  const injected: FeedEntry[] = []
+  for (const threshold of payload.thresholds) {
+    for (const inj of threshold.injected) {
+      injected.push({
+        id: inj.id,
+        accountId: inj.accountId,
+        amount: inj.baseAmount,
+        reason: inj.reason,
+        injected: true,
+        offsetSeconds: null,
+      })
+    }
+  }
+  return [...authored, ...injected]
+}
+
+/** The marker for a resolved request: INJECTED takes precedence (a contagion
+ *  draw is never a genuine depositor withdrawal), then AFTER HOLD or BEFORE
+ *  HOLD read off the engine-recorded arrivedAfterHold flag. A pending request
+ *  shows no hold marker yet. */
+function holdMarker(entry: FeedEntry, rs: RequestState | undefined): string {
+  if (entry.injected) return 'INJECTED'
+  if (!rs || rs.outcome === 'pending') return 'PENDING'
+  return rs.arrivedAfterHold ? 'AFTER HOLD' : 'BEFORE HOLD'
+}
+
+export function FeedView({ payload, state }: FeedViewProps) {
+  const entries = feedEntries(payload)
+  return (
+    <div data-testid="bank-feed-view">
+      <div className="bank-feed-legend">
+        <GlossaryTerm id="bank-depositor-confidence" />
+      </div>
+
+      {entries.map((entry) => {
+        const rs = state.requests[entry.id]
+        const outcome = rs?.outcome ?? 'pending'
+        const marker = holdMarker(entry, rs)
+        return (
+          <div
+            key={entry.id}
+            data-testid={`feed-row-${entry.id}`}
+            data-outcome={outcome}
+            data-marker={marker}
+            data-injected={entry.injected ? 'true' : 'false'}
+            className="feed-row"
+          >
+            <TerminalText>
+              {`${entry.id}  ${entry.amount} FROM ${entry.accountId}  [${marker}]`}
+            </TerminalText>
+            {/* The AUTHORED reason line, straight off the payload def. */}
+            <TerminalText dim>{entry.reason}</TerminalText>
+            {/* The CODE-DERIVED outcome text, from the engine selector over the
+                typed outcome code. Never a substate string. */}
+            <div data-testid={`feed-outcome-${entry.id}`}>
+              <TerminalText>{renderRequestOutcome(outcome)}</TerminalText>
+            </div>
+          </div>
+        )
+      })}
+    </div>
+  )
+}
diff --git a/src/app/missions/bank/LedgerView.tsx b/src/app/missions/bank/LedgerView.tsx
new file mode 100644
index 0000000..23c1f4d
--- /dev/null
+++ b/src/app/missions/bank/LedgerView.tsx
@@ -0,0 +1,175 @@
+// The account ledger: one row per account with its name, live balance, hold or
+// limited state (limited rows show the cap and remaining allowance), and the
+// HOLD / RELEASE / LIMIT controls. Legality comes from the engine rules against
+// drained state; a rejected action renders the button DISABLED with the typed
+// engine reason rendered INLINE next to it (never a tooltip alone). HOLD and
+// RELEASE are freely reversible per account, so no confirmation dialogs. LIMIT
+// takes a whole-dollar cap through the amount input. Every enabled control
+// dispatches the IDENTICAL action object its typed command dispatches, routed
+// through the BankScreen handlers so the relay cue fires on an action, never on
+// a tick. Uppercase terminal diction, no em-dashes. No reason strings, clue
+// logic, or settlement logic here.
+import { useState } from 'react'
+import type { CampaignAction } from '@engine'
+import type { BankPayload } from '@engine/missions/bank/content'
+import type { BankState } from '@engine/missions/bank/types'
+import { TerminalText } from '../../terminal/TerminalText'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import { accountControl, accountDisplay } from './bankActions'
+import { makeHoldAction, makeLimitAction, makeReleaseAction } from './verbs'
+
+export interface LedgerViewProps {
+  readonly payload: BankPayload
+  readonly state: BankState
+  readonly selectedAccountId: string | null
+  readonly onSelect: (accountId: string) => void
+  /** Dispatch a HOLD/RELEASE/LIMIT. BankScreen sends and plays the relay cue;
+   *  the identical action object a typed command builds is passed here. */
+  readonly onAction: (action: CampaignAction) => void
+}
+
+/** The state line for an account row: OPEN, HELD, or LIMITED with cap and
+ *  remaining allowance. Read from drained substate only. */
+function stateLine(display: ReturnType<typeof accountDisplay>): string {
+  if (!display) return ''
+  if (display.held) return 'HELD'
+  if (display.limitedTo !== null) {
+    return `LIMITED TO ${display.limitedTo} (REMAINING ${display.remaining ?? 0})`
+  }
+  return 'OPEN'
+}
+
+/** A control button whose disabled reason renders inline next to it (never a
+ *  tooltip alone), mirroring the shell ActionBar idiom but routing the click
+ *  through the screen handler so the relay cue is an action, not a render. */
+function Control({
+  label,
+  testId,
+  disabled,
+  reason,
+  onClick,
+}: {
+  readonly label: string
+  readonly testId: string
+  readonly disabled: boolean
+  readonly reason?: string
+  readonly onClick: () => void
+}) {
+  return (
+    <span className="action-bar-item">
+      <button
+        type="button"
+        data-testid={testId}
+        disabled={disabled}
+        onClick={onClick}
+      >
+        {label}
+      </button>
+      {disabled && reason ? (
+        <span className="action-disabled-reason" data-testid={`${testId}-reason`}>
+          {reason}
+        </span>
+      ) : null}
+    </span>
+  )
+}
+
+export function LedgerView({
+  payload,
+  state,
+  selectedAccountId,
+  onSelect,
+  onAction,
+}: LedgerViewProps) {
+  // The amount input holds a per-account draft cap for LIMIT. A controlled text
+  // input keyed by account id; a non-integer or blank draft disables the LIMIT
+  // button with a clear reason, so no malformed cap ever dispatches.
+  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({})
+
+  return (
+    <div data-testid="bank-ledger-view">
+      <div className="bank-ledger-legend">
+        <GlossaryTerm id="bank-liquidity" />{' '}
+        <GlossaryTerm id="bank-limited-release" />
+      </div>
+
+      {payload.accounts.map((account) => {
+        const display = accountDisplay(state, account.id)
+        const control = accountControl(payload, state, account.id)
+        const selected = account.id === selectedAccountId
+        const draft = capDrafts[account.id] ?? ''
+        const draftNum = Number(draft)
+        const draftValid =
+          draft.trim().length > 0 && Number.isInteger(draftNum) && draftNum >= 0
+
+        // LIMIT eligibility is the engine fact; a blank or malformed draft is a
+        // shell input fact rendered as its own reason so the player can read it.
+        const limitReason: string | undefined = !control.limitEligible
+          ? control.limitReason
+          : !draftValid
+            ? 'ENTER A WHOLE-DOLLAR CAP'
+            : undefined
+
+        return (
+          <div
+            key={account.id}
+            data-testid={`account-row-${account.id}`}
+            data-selected={selected ? 'true' : 'false'}
+            data-held={display?.held ? 'true' : 'false'}
+            className={selected ? 'account-row account-row-selected' : 'account-row'}
+          >
+            <button
+              type="button"
+              data-testid={`account-select-${account.id}`}
+              aria-pressed={selected}
+              onClick={() => onSelect(account.id)}
+            >
+              {`${account.id}  ${account.name}`}
+            </button>
+            <TerminalText dim>
+              {`BALANCE ${display?.balance ?? 0}  ${stateLine(display)}  ${account.flavor}`}
+            </TerminalText>
+            <label className="bank-amount-input">
+              LIMIT CAP (DOLLARS)
+              <input
+                type="text"
+                inputMode="numeric"
+                data-testid={`ledger-cap-${account.id}`}
+                aria-label={`LIMIT CAP FOR ${account.id}`}
+                value={draft}
+                onChange={(e) =>
+                  setCapDrafts((prev) => ({ ...prev, [account.id]: e.target.value }))
+                }
+              />
+            </label>
+            <div className="action-bar" data-testid={`ledger-actions-${account.id}`}>
+              <Control
+                label="HOLD"
+                testId={`ledger-HOLD-${account.id}`}
+                disabled={!control.holdLegal}
+                reason={control.holdReason}
+                onClick={() => onAction(makeHoldAction(account.id))}
+              />
+              <Control
+                label="RELEASE"
+                testId={`ledger-RELEASE-${account.id}`}
+                disabled={!control.releaseLegal}
+                reason={control.releaseReason}
+                onClick={() => onAction(makeReleaseAction(account.id))}
+              />
+              <Control
+                label="LIMIT"
+                testId={`ledger-LIMIT-${account.id}`}
+                disabled={limitReason !== undefined}
+                reason={limitReason}
+                onClick={() =>
+                  onAction(makeLimitAction(account.id, draftValid ? draftNum : 0))
+                }
+              />
+            </div>
+          </div>
+        )
+      })}
+    </div>
+  )
+}
diff --git a/src/app/missions/bank/PaymentsView.tsx b/src/app/missions/bank/PaymentsView.tsx
new file mode 100644
index 0000000..e0ad349
--- /dev/null
+++ b/src/app/missions/bank/PaymentsView.tsx
@@ -0,0 +1,82 @@
+// The critical payments: one row per payment with its amount, source account,
+// due offset, and a PAY button. PAY draws from the payment's specific account
+// and is BLOCKED while that account is held; the disabled PAY button shows the
+// held-account reason INLINE because release-or-limit-to-pay is the designed
+// tension and the player has to be able to read it. A cleared payment shows its
+// cleared status. Legality and the typed reason come from the engine selector;
+// the view invents nothing. PAY dispatches the IDENTICAL action a typed command
+// builds, routed through the BankScreen handler so the payment-outcome
+// announcement fires on the action, never a tick. Uppercase diction, no
+// em-dashes.
+import type { CampaignAction } from '@engine'
+import type { BankPayload } from '@engine/missions/bank/content'
+import type { BankState } from '@engine/missions/bank/types'
+import { TerminalText } from '../../terminal/TerminalText'
+import { GlossaryTerm } from '../../a11y/GlossaryTerm'
+import { paymentControl } from './bankActions'
+import { makePayAction } from './verbs'
+
+export interface PaymentsViewProps {
+  readonly payload: BankPayload
+  readonly state: BankState
+  readonly onAction: (action: CampaignAction) => void
+}
+
+export function PaymentsView({ payload, state, onAction }: PaymentsViewProps) {
+  return (
+    <div data-testid="bank-payments-view">
+      <div className="bank-payments-legend">
+        <GlossaryTerm id="bank-critical-payment" />
+      </div>
+
+      {payload.payments.map((payment) => {
+        const control = paymentControl(payload, state, payment.id)
+        const account = payload.accounts.find((a) => a.id === payment.accountId)
+        const testId = `payment-PAY-${payment.id}`
+
+        return (
+          <div
+            key={payment.id}
+            data-testid={`payment-row-${payment.id}`}
+            data-cleared={control.cleared ? 'true' : 'false'}
+            className="payment-row"
+          >
+            <TerminalText>
+              {`${payment.id}  ${payment.amount} FROM ${payment.accountId}${
+                account ? ` (${account.name})` : ''
+              }  DUE +${payment.dueOffsetSeconds}S`}
+            </TerminalText>
+            <TerminalText dim>{payment.reason}</TerminalText>
+            {control.cleared ? (
+              <div data-testid={`payment-status-${payment.id}`}>
+                <TerminalText>PAYMENT CLEARED</TerminalText>
+              </div>
+            ) : null}
+            <div className="action-bar" data-testid={`payment-actions-${payment.id}`}>
+              <span className="action-bar-item">
+                <button
+                  type="button"
+                  data-testid={testId}
+                  disabled={!control.payLegal}
+                  onClick={() => onAction(makePayAction(payment.id))}
+                >
+                  {control.cleared ? 'CLEARED' : 'PAY'}
+                </button>
+                {/* The typed engine reason (ACCOUNT HELD, INSUFFICIENT BALANCE,
+                    ALREADY CLEARED, and friends) renders inline next to it. */}
+                {!control.payLegal && control.payReason ? (
+                  <span
+                    className="action-disabled-reason"
+                    data-testid={`${testId}-reason`}
+                  >
+                    {control.payReason}
+                  </span>
+                ) : null}
+              </span>
+            </div>
+          </div>
+        )
+      })}
+    </div>
+  )
+}
diff --git a/src/app/missions/bank/bankActions.ts b/src/app/missions/bank/bankActions.ts
new file mode 100644
index 0000000..139b89b
--- /dev/null
+++ b/src/app/missions/bank/bankActions.ts
@@ -0,0 +1,106 @@
+// Shared, pure helpers that shape the per-account and per-payment action rows,
+// so the ledger and payments views never diverge and never invent a reason.
+// These hold NO legality logic of their own: every legal/illegal decision and
+// its typed reason come from the engine selectors (holdLegality, releaseLegality,
+// limitLegality, payLegality) imported from src/engine/missions/bank/rules.ts.
+// That is the parity contract: the shell offers exactly what the engine accepts,
+// and a rejected action renders disabled with the engine's typed reason inline.
+import type { BankPayload } from '@engine/missions/bank/content'
+import type { BankState } from '@engine/missions/bank/types'
+import {
+  availableToDraw,
+  holdLegality,
+  limitLegality,
+  payLegality,
+  releaseLegality,
+  remainingAllowance,
+  type HoldReason,
+  type LimitReason,
+  type PayReason,
+  type ReleaseReason,
+} from '@engine/missions/bank/rules'
+
+export interface AccountControlRow {
+  readonly holdLegal: boolean
+  readonly holdReason?: HoldReason
+  readonly releaseLegal: boolean
+  readonly releaseReason?: ReleaseReason
+  /** True when LIMIT is eligible on this account at all (a re-LIMIT below spent
+   *  outflow is still rejected at dispatch with BELOW SPENT OUTFLOW). */
+  readonly limitEligible: boolean
+  readonly limitReason?: LimitReason
+}
+
+/** HOLD/RELEASE/LIMIT legality for one account, straight from the engine
+ *  selectors against drained state. A probe cap of the account's remaining
+ *  allowance proves limit eligibility without committing a cap. */
+export function accountControl(
+  payload: BankPayload,
+  state: BankState,
+  accountId: string,
+): AccountControlRow {
+  const h = holdLegality(payload, state, accountId)
+  const r = releaseLegality(payload, state, accountId)
+  const acct = state.accounts[accountId]
+  // Probe LIMIT eligibility with a cap at the account's current spent outflow
+  // (the lowest cap a re-LIMIT can take), so the only reason that can surface is
+  // NOT LIMIT ELIGIBLE, never BELOW SPENT OUTFLOW.
+  const probeCap = acct ? Math.max(0, acct.limitedSpent) : 0
+  const l = limitLegality(payload, state, accountId, probeCap)
+  return {
+    holdLegal: h.legal,
+    holdReason: h.legal ? undefined : h.reason,
+    releaseLegal: r.legal,
+    releaseReason: r.legal ? undefined : r.reason,
+    limitEligible: l.legal,
+    limitReason: l.legal ? undefined : l.reason,
+  }
+}
+
+export interface PaymentControlRow {
+  readonly payLegal: boolean
+  readonly payReason?: PayReason
+  readonly cleared: boolean
+}
+
+/** PAY legality for one payment, straight from the engine selector. The
+ *  held-account reason (ACCOUNT HELD) is exactly the teaching case the view
+ *  renders inline. */
+export function paymentControl(
+  payload: BankPayload,
+  state: BankState,
+  paymentId: string,
+): PaymentControlRow {
+  const p = payLegality(payload, state, paymentId)
+  return {
+    payLegal: p.legal,
+    payReason: p.legal ? undefined : p.reason,
+    cleared: state.payments[paymentId]?.cleared ?? false,
+  }
+}
+
+/** The display view of one account's live state for the ledger row: its balance,
+ *  hold flag, limited cap and remaining allowance. Read from drained substate
+ *  only; the engine selector availableToDraw / remainingAllowance do the math. */
+export interface AccountDisplay {
+  readonly balance: number
+  readonly held: boolean
+  readonly limitedTo: number | null
+  readonly remaining: number | null
+  readonly available: number
+}
+
+export function accountDisplay(
+  state: BankState,
+  accountId: string,
+): AccountDisplay | null {
+  const acct = state.accounts[accountId]
+  if (!acct) return null
+  return {
+    balance: acct.balance,
+    held: acct.held,
+    limitedTo: acct.limitedTo,
+    remaining: acct.limitedTo === null ? null : remainingAllowance(acct),
+    available: acct.held ? 0 : availableToDraw(acct),
+  }
+}
diff --git a/src/app/missions/bank/glossary.ts b/src/app/missions/bank/glossary.ts
new file mode 100644
index 0000000..c12240c
--- /dev/null
+++ b/src/app/missions/bank/glossary.ts
@@ -0,0 +1,59 @@
+// The five local FREEZE BANK ACCOUNTS glossary terms. The provenance terms
+// (OBSERVED, EXERCISE, DERIVED, run ancestry) are GLOBAL (registered by the
+// shell from split 02) and must not be re-registered here. Definitions are
+// plain language for a smart layperson; rendered labels are uppercase terminal
+// diction with no em-dashes. Registration is idempotent so a screen remount
+// never trips the duplicate-id guard.
+import {
+  hasGlossaryEntry,
+  registerGlossaryTerms,
+  type GlossaryEntry,
+} from '../../a11y/glossary'
+
+export const BANK_LOCAL_GLOSSARY_IDS = [
+  'bank-liquidity',
+  'bank-depositor-confidence',
+  'bank-critical-payment',
+  'bank-limited-release',
+  'bank-cash-floor',
+] as const
+
+const ENTRIES: readonly GlossaryEntry[] = [
+  {
+    id: 'bank-liquidity',
+    term: 'LIQUIDITY',
+    definition:
+      'The cash the bank can actually hand out right now. A held account adds nothing to it; a limited account adds only what is left of its allowance. It is never a stored number, always the sum of what the open accounts can still give up.',
+  },
+  {
+    id: 'bank-depositor-confidence',
+    term: 'DEPOSITOR CONFIDENCE',
+    definition:
+      'How much the depositors trust the bank, scored 0 to 100. Holding accounts and running cash below the floor erode it; clearing critical payments restores it. If it reaches zero the bank collapses.',
+  },
+  {
+    id: 'bank-critical-payment',
+    term: 'CRITICAL PAYMENT',
+    definition:
+      'A payment the bank owes from a specific account by a deadline, such as payroll or a municipal remittance. It cannot clear while that account is held, which is the whole tension: release or limit the account to pay.',
+  },
+  {
+    id: 'bank-limited-release',
+    term: 'LIMITED RELEASE',
+    definition:
+      'A cap on how much an account can pay out, instead of a full freeze. The account keeps giving up cash up to the cap, so a limited account can still fund a payment that fits inside its remaining allowance.',
+  },
+  {
+    id: 'bank-cash-floor',
+    term: 'CASH FLOOR',
+    definition:
+      'The level of available cash the bank is expected to hold. Falling below it costs confidence every tick and loses one of the three signals the real outcome is scored on.',
+  },
+]
+
+/** Register the five local terms, once. Idempotent across remounts: already
+ *  present ids are skipped so the duplicate-id guard never throws. */
+export function registerBankGlossary(): void {
+  const fresh = ENTRIES.filter((e) => !hasGlossaryEntry(e.id))
+  if (fresh.length > 0) registerGlossaryTerms(fresh)
+}
diff --git a/src/app/missions/bank/selectors.ts b/src/app/missions/bank/selectors.ts
new file mode 100644
index 0000000..71e10fa
--- /dev/null
+++ b/src/app/missions/bank/selectors.ts
@@ -0,0 +1,105 @@
+// Read-only selectors over the active campaign for the FREEZE BANK ACCOUNTS
+// screen, plus the persisted LEDGER/FEED/PAYMENTS view preference. Authored
+// truth (account names, request reasons, the prediction series, the floor and
+// target) lives in the immutable seed payload; live truth (balances, hold and
+// limit flags, confidence, request outcomes) lives in the mission substate.
+// These pull both from the running context and state so the views render
+// whatever payload is active, never a hardcoded one. NO reason strings, clue
+// logic, or settlement logic here: the engine owns all three.
+import { useSyncExternalStore } from 'react'
+import type { CampaignState, MissionModule } from '@engine'
+import { getContext } from '../../state'
+import type { BankPayload } from '@engine/missions/bank/content'
+import type { BankState } from '@engine/missions/bank/types'
+
+const BANK = 'bank'
+
+/** The immutable authored payload for the active bank mission, or undefined
+ *  when no bank payload is present on the active seed. Callers guard undefined. */
+export function bankPayload(state: CampaignState): BankPayload | undefined {
+  const seed = getContext().seeds[state.seedName]
+  return seed?.missionPayloads[BANK] as BankPayload | undefined
+}
+
+/** The live bank substate, or null before the mission starts. */
+export function bankSubstate(state: CampaignState): BankState | null {
+  if (state.activeMission?.missionId !== BANK) return null
+  return (state.activeMission.substate as BankState) ?? null
+}
+
+/** The bank mission module from the context: its validate() is the single
+ *  source of truth for whether an action is currently legal. */
+export function bankModule(): MissionModule<BankState> {
+  return getContext().missions[BANK] as MissionModule<BankState>
+}
+
+// ---- Persisted LEDGER/FEED/PAYMENTS view preference --------------------
+// The player's explicit view choice persists across reloads and restores on a
+// remount. In-memory is the session source of truth (works where localStorage
+// is blocked, e.g. a headless test env); localStorage persists across reloads
+// and a corrupt read falls to no-preference without throwing. Mirrors the
+// flights view-preference store exactly.
+export type BankView = 'ledger' | 'feed' | 'payments'
+
+const BANK_VIEWS: readonly BankView[] = ['ledger', 'feed', 'payments']
+
+function isBankView(value: unknown): value is BankView {
+  return typeof value === 'string' && BANK_VIEWS.includes(value as BankView)
+}
+
+const VIEW_KEY = 'wargames.bank.view'
+
+let viewPref: BankView | null | undefined
+const listeners = new Set<() => void>()
+
+function load(): BankView | null {
+  if (viewPref !== undefined) return viewPref
+  try {
+    const raw = window.localStorage.getItem(VIEW_KEY)
+    viewPref = isBankView(raw) ? raw : null
+  } catch {
+    viewPref = null
+  }
+  return viewPref
+}
+
+/** The stored explicit preference, or null when the player has never chosen. */
+export function getBankView(): BankView | null {
+  return load()
+}
+
+/** Store the player's explicit view choice. Persists and notifies. */
+export function setBankView(view: BankView): void {
+  viewPref = view
+  try {
+    window.localStorage.setItem(VIEW_KEY, view)
+  } catch {
+    // In-memory still backs the session.
+  }
+  for (const listener of listeners) listener()
+}
+
+export function onBankView(listener: () => void): () => void {
+  listeners.add(listener)
+  return () => {
+    listeners.delete(listener)
+  }
+}
+
+/** The stored view preference as a useSyncExternalStore hook, matching the
+ *  flights view-preference store. One subscribe + one snapshot getter closes
+ *  the tearing/stale-read window a manual useState + useEffect pair leaves open. */
+export function useBankView(): BankView | null {
+  return useSyncExternalStore(onBankView, getBankView, getBankView)
+}
+
+/** Test-only: forget the stored preference. */
+export function __resetBankView(): void {
+  viewPref = undefined
+  try {
+    window.localStorage.removeItem(VIEW_KEY)
+  } catch {
+    // ignore
+  }
+  listeners.clear()
+}
diff --git a/src/app/missions/bank/verbs.ts b/src/app/missions/bank/verbs.ts
new file mode 100644
index 0000000..7ad6d3a
--- /dev/null
+++ b/src/app/missions/bank/verbs.ts
@@ -0,0 +1,191 @@
+// The FREEZE BANK ACCOUNTS verb grammar and the shared action builders. Every
+// on-screen button and every typed command routes through the SAME builder, so
+// the command-button identity tests hold by construction: a parsed HOLD strict-
+// equals the action the HOLD button dispatches, and so on for RELEASE, LIMIT,
+// PAY, TRACE, CHECK SOURCE. Diction is uppercase terminal; no em-dashes. The
+// engine validator is the single source of truth for what is currently legal;
+// these builders only shape actions, never judge them. There is ZERO clue logic
+// here: TRACE dispatches the engine-owned INSPECT_RECORD and the clue logs
+// engine-side; CHECK SOURCE dispatches REQUEST_SOURCE_CHECK and the verdict
+// arrives later as a sourceCheckResolved emitted event.
+import type { CampaignAction } from '@engine'
+import {
+  registerScreenVerbs,
+  unregisterScreenVerbs,
+  type ParseResult,
+  type VerbRegistration,
+} from '../../terminal'
+
+export type MissionAction = Extract<CampaignAction, { type: 'MISSION_ACTION' }>
+
+export const BANK_SCREEN_ID = 'mission:bank'
+
+/** The view and selection commands the screen owns. LEDGER / FEED / PAYMENTS
+ *  switch the view (persisted); BACK returns to the ledger (the mobile back
+ *  affordance). These ride the shell's mission-scoped SCREEN ui command as the
+ *  detail, so the single shared command line dispatches them to the screen's
+ *  handler. */
+export type BankUiCommand =
+  | { readonly kind: 'VIEW'; readonly view: 'ledger' | 'feed' | 'payments' }
+  | { readonly kind: 'BACK' }
+
+/** Narrow an opaque SCREEN-command detail back to a BankUiCommand. The screen's
+ *  handler calls this; a malformed detail yields null. */
+export function asBankUiCommand(detail: unknown): BankUiCommand | null {
+  if (typeof detail !== 'object' || detail === null) return null
+  const kind = (detail as { kind?: unknown }).kind
+  if (kind === 'BACK') return { kind: 'BACK' }
+  if (kind === 'VIEW') {
+    const view = (detail as { view?: unknown }).view
+    if (view === 'ledger' || view === 'feed' || view === 'payments') {
+      return { kind: 'VIEW', view }
+    }
+  }
+  return null
+}
+
+function screenUi(detail: BankUiCommand): ParseResult {
+  return {
+    kind: 'ui',
+    command: { kind: 'SCREEN', screenId: BANK_SCREEN_ID, detail },
+  }
+}
+
+// The shared action builders. Both the typed command and the button path call
+// these, so a parsed action is deep-equal to a button action.
+export function makeHoldAction(accountId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId } }
+}
+
+export function makeReleaseAction(accountId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', accountId } }
+}
+
+export function makeLimitAction(accountId: string, cap: number): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'LIMIT', accountId, cap } }
+}
+
+export function makePayAction(paymentId: string): MissionAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'PAY', paymentId } }
+}
+
+/** TRACE inspects a record (the hold-justification record, B04). Campaign
+ *  action; the clue logs engine-side through clueRecords. */
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
+function err(message: string): ParseResult {
+  return { kind: 'error', message }
+}
+
+function action(a: CampaignAction): ParseResult {
+  return { kind: 'action', action: a }
+}
+
+export interface BankVerbContext {
+  /** The currently selected account id, for commands that omit it. */
+  readonly selectedAccountId: () => string | null
+}
+
+/** The verbs that dispatch engine actions, plus the view and selection verbs. */
+export function buildBankVerbs(
+  ctx: BankVerbContext,
+): readonly VerbRegistration[] {
+  const requireAccount = (explicit: string | undefined): string | null =>
+    explicit ?? ctx.selectedAccountId()
+
+  return [
+    {
+      verb: 'HOLD',
+      helpText: 'HOLD <ACCOUNT>        freeze an account (reversible)',
+      parse: (tokens) => {
+        const accountId = requireAccount(tokens[0])
+        return accountId
+          ? action(makeHoldAction(accountId))
+          : err('NO ACCOUNT SELECTED')
+      },
+    },
+    {
+      verb: 'RELEASE',
+      helpText: 'RELEASE <ACCOUNT>     reverse a HOLD on an account',
+      parse: (tokens) => {
+        const accountId = requireAccount(tokens[0])
+        return accountId
+          ? action(makeReleaseAction(accountId))
+          : err('NO ACCOUNT SELECTED')
+      },
+    },
+    {
+      verb: 'LIMIT',
+      helpText: 'LIMIT <ACCOUNT> <CAP> cap an account to a limited release',
+      parse: (tokens) => {
+        const accountId = requireAccount(tokens[0])
+        if (!accountId) return err('NO ACCOUNT SELECTED')
+        const raw = tokens[1]
+        if (raw === undefined) return err('NO CAP')
+        const cap = Number(raw)
+        if (!Number.isInteger(cap) || cap < 0) return err('BAD LIMIT CAP')
+        return action(makeLimitAction(accountId, cap))
+      },
+    },
+    {
+      verb: 'PAY',
+      helpText: 'PAY <PAYMENT>         clear a critical payment',
+      parse: (tokens) => {
+        const paymentId = tokens[0]
+        return paymentId ? action(makePayAction(paymentId)) : err('NO PAYMENT')
+      },
+    },
+    {
+      verb: 'TRACE',
+      helpText: 'TRACE <RECORD>        inspect the hold-justification record',
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
+      verb: 'LEDGER',
+      helpText: 'LEDGER                show the account ledger',
+      parse: () => screenUi({ kind: 'VIEW', view: 'ledger' }),
+    },
+    {
+      verb: 'FEED',
+      helpText: 'FEED                  show the withdrawal request feed',
+      parse: () => screenUi({ kind: 'VIEW', view: 'feed' }),
+    },
+    {
+      verb: 'PAYMENTS',
+      helpText: 'PAYMENTS              show the critical payments',
+      parse: () => screenUi({ kind: 'VIEW', view: 'payments' }),
+    },
+    {
+      verb: 'BACK',
+      helpText: 'BACK                  return to the ledger',
+      parse: () => screenUi({ kind: 'BACK' }),
+    },
+  ]
+}
+
+/** Register the bank verbs for the screen scope; returns an unregister. */
+export function registerBankVerbs(ctx: BankVerbContext): () => void {
+  registerScreenVerbs(BANK_SCREEN_ID, buildBankVerbs(ctx))
+  return () => unregisterScreenVerbs(BANK_SCREEN_ID)
+}
diff --git a/test/app/missions/bank/cues.test.tsx b/test/app/missions/bank/cues.test.tsx
new file mode 100644
index 0000000..2c95168
--- /dev/null
+++ b/test/app/missions/bank/cues.test.tsx
@@ -0,0 +1,138 @@
+// Cues and announcements, with fake timers proving the shell sets NO timer of
+// its own. The relay click plays on a HOLD and on a RELEASE action; the low
+// two-note plays on a confidence threshold crossing; threshold crossings and
+// payment outcomes announce politely. The nothing-per-tick rule is a test:
+// advancing the engine across several plain confidence ticks that cross no
+// threshold fires NO cue and NO announcement. Every cue and announcement is
+// driven by an emitted event or a player action, never a bare tick.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, wake, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { onAnnounce } from '@app/a11y/announce'
+import * as audio from '@app/audio'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import { makeBankCtx, bankSub } from './fixture'
+
+const T0 = 1_000_000
+const RELAY_CUE = 'bank-relay'
+const THRESHOLD_CUE = 'bank-threshold'
+
+let teardown: () => void
+let announced: Array<{ text: string; channel: string }>
+let unAnnounce: () => void
+
+function boot(): void {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  announced = []
+  unAnnounce = onAnnounce((text, channel) => announced.push({ text, channel }))
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+}
+
+function advanceEngine(toMs: number): void {
+  vi.spyOn(Date, 'now').mockReturnValue(toMs)
+  act(() => {
+    wake()
+  })
+}
+
+beforeEach(() => {
+  boot()
+})
+
+afterEach(() => {
+  unAnnounce()
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('cues and announcements fire from events and actions only', () => {
+  it('the relay click plays on HOLD and on RELEASE', () => {
+    const playSpy = vi.spyOn(audio, 'play')
+    render(<ScreenRouter />)
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+    expect(playSpy).toHaveBeenCalledWith(RELAY_CUE)
+    playSpy.mockClear()
+    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-OPS'))
+    expect(playSpy).toHaveBeenCalledWith(RELAY_CUE)
+  })
+
+  it('a payment outcome announces politely when a payment clears', () => {
+    render(<ScreenRouter />)
+    // PAY P-PAY from A-PAY (open, sufficient balance): it clears, announcing.
+    fireEvent.click(screen.getByTestId('bank-tab-payments'))
+    fireEvent.click(screen.getByTestId('payment-PAY-P-PAY'))
+    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
+    const polite = announced.filter(
+      (a) => a.channel === 'polite' && /P-PAY|CLEARED/.test(a.text),
+    )
+    expect(polite.length).toBeGreaterThan(0)
+  })
+
+  it('a confidence threshold crossing plays the low two-note and announces politely', () => {
+    const playSpy = vi.spyOn(audio, 'play')
+    render(<ScreenRouter />)
+    // Crater confidence by holding every account, then advance across the tick
+    // schedule so confidence crosses 50 and the injection fires once.
+    for (const id of ['A-OPS', 'A-VEND', 'A-MUNI', 'A-PAY']) {
+      fireEvent.click(screen.getByTestId(`ledger-HOLD-${id}`))
+    }
+    playSpy.mockClear()
+    announced.length = 0
+    advanceEngine(T0 + 35_000)
+    expect(bankSub(getState()).injectedThresholds).toContain(50)
+    expect(playSpy).toHaveBeenCalledWith(THRESHOLD_CUE)
+    expect(
+      announced.some((a) => a.channel === 'polite' && /THRESHOLD/.test(a.text)),
+    ).toBe(true)
+  })
+
+  it('nothing fires per bare tick: several plain confidence ticks that cross no threshold are silent', () => {
+    const playSpy = vi.spyOn(audio, 'play')
+    render(<ScreenRouter />)
+    // No holds, no actions: the authored requests and the confidence ticks fold
+    // across several ticks, but confidence never crosses the 50 threshold (it
+    // only starts at 70 and no held accounts drag it down). Advance across
+    // several ticks (30/60/90s) and assert silence on the relay and threshold.
+    playSpy.mockClear()
+    announced.length = 0
+    advanceEngine(T0 + 30_000)
+    advanceEngine(T0 + 60_000)
+    advanceEngine(T0 + 90_000)
+    expect(bankSub(getState()).injectedThresholds).not.toContain(50)
+    expect(playSpy).not.toHaveBeenCalledWith(RELAY_CUE)
+    expect(playSpy).not.toHaveBeenCalledWith(THRESHOLD_CUE)
+    // No threshold or payment announcement fired from a bare tick.
+    expect(announced.some((a) => /THRESHOLD/.test(a.text))).toBe(false)
+    expect(announced.some((a) => /CLEARED/.test(a.text))).toBe(false)
+  })
+
+  it('fake timers advanced without an engine wake fire nothing', () => {
+    vi.useFakeTimers()
+    const playSpy = vi.spyOn(audio, 'play')
+    render(<ScreenRouter />)
+    act(() => {
+      vi.advanceTimersByTime(300_000)
+    })
+    expect(playSpy).not.toHaveBeenCalledWith(RELAY_CUE)
+    expect(playSpy).not.toHaveBeenCalledWith(THRESHOLD_CUE)
+    expect(announced.some((a) => /THRESHOLD/.test(a.text))).toBe(false)
+    vi.useRealTimers()
+  })
+})
diff --git a/test/app/missions/bank/feed.test.tsx b/test/app/missions/bank/feed.test.tsx
new file mode 100644
index 0000000..22045d9
--- /dev/null
+++ b/test/app/missions/bank/feed.test.tsx
@@ -0,0 +1,135 @@
+// The withdrawal request feed. Each entry renders its request, its application
+// outcome, its reason line, and its markers: BEFORE HOLD / AFTER HOLD and
+// INJECTED. The reason lines come from engine selectors: the AUTHORED reason off
+// the payload for an authored request, and the CODE-DERIVED outcome text from
+// renderRequestOutcome. No reason string is read from substate. Markers are the
+// engine-recorded facts (arrivedAfterHold, injected); the view renders them, it
+// does not compute them.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, wake, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { renderRequestOutcome } from '@engine/missions/bank/selectors'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import { BANK_FIXTURE_PAYLOAD, makeBankCtx, bankSub } from './fixture'
+
+const T0 = 1_000_000
+
+let teardown: () => void
+
+function boot(): void {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+  render(<ScreenRouter />)
+}
+
+function advanceEngine(toMs: number): void {
+  vi.spyOn(Date, 'now').mockReturnValue(toMs)
+  act(() => {
+    wake()
+  })
+}
+
+beforeEach(() => {
+  boot()
+})
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function go(view: 'ledger' | 'feed' | 'payments'): void {
+  fireEvent.click(screen.getByTestId(`bank-tab-${view}`))
+}
+
+describe('feed markers and reason lines', () => {
+  it('an authored request that drains with no broad hold reads BEFORE HOLD with its code-derived outcome text and authored reason', () => {
+    // R-1 (A-OPS, 5000) fires at 20s. Advance past it with no hold: it drains
+    // BEFORE HOLD and clears in full.
+    advanceEngine(T0 + 25_000)
+    go('feed')
+    const row = screen.getByTestId('feed-row-R-1')
+    expect(row).toHaveAttribute('data-marker', 'BEFORE HOLD')
+    expect(row).toHaveAttribute('data-outcome', 'applied')
+    // The outcome text is the engine code-derived string, not a substate string.
+    expect(screen.getByTestId('feed-outcome-R-1').textContent).toBe(
+      renderRequestOutcome('applied'),
+    )
+    // The AUTHORED reason comes straight off the payload def.
+    const def = BANK_FIXTURE_PAYLOAD.requests.find((r) => r.id === 'R-1')!
+    expect(row.textContent).toContain(def.reason)
+  })
+
+  it('an authored request that drains after a broad hold reads AFTER HOLD', () => {
+    // HOLD A-OPS before R-1 fires (broadHoldCount 0 stamps on the first hold),
+    // so R-1 (A-OPS) resolves AFTER the broad hold and is refused.
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+    advanceEngine(T0 + 25_000)
+    go('feed')
+    const row = screen.getByTestId('feed-row-R-1')
+    expect(row).toHaveAttribute('data-marker', 'AFTER HOLD')
+    expect(row).toHaveAttribute('data-outcome', 'refused')
+    expect(screen.getByTestId('feed-outcome-R-1').textContent).toBe(
+      renderRequestOutcome('refused'),
+    )
+  })
+
+  it('an injected request renders the INJECTED marker once a threshold crossing fires it', () => {
+    // Before any crossing the injected request shows PENDING and INJECTED.
+    go('feed')
+    const injRow = screen.getByTestId('feed-row-INJ-1')
+    expect(injRow).toHaveAttribute('data-injected', 'true')
+    expect(injRow).toHaveAttribute('data-marker', 'INJECTED')
+    expect(injRow).toHaveAttribute('data-outcome', 'pending')
+
+    // Hold accounts to crater confidence across ticks until it crosses 50, firing
+    // the threshold injection. Hold three accounts; each tick removes 4 per held
+    // account. Advance across several ticks to the mission end.
+    go('ledger')
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-VEND'))
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-MUNI'))
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-PAY'))
+    // Advance through the tick schedule so confidence falls below 50 and the
+    // injection fires once.
+    advanceEngine(T0 + 35_000)
+    expect(bankSub(getState()).injectedThresholds).toContain(50)
+    go('feed')
+    const injResolved = screen.getByTestId('feed-row-INJ-1')
+    // The injected draw resolved against A-OPS (held), so it is refused but still
+    // flagged INJECTED (a contagion draw is never a genuine depositor draw).
+    expect(injResolved).toHaveAttribute('data-injected', 'true')
+    expect(injResolved).toHaveAttribute('data-marker', 'INJECTED')
+    expect(injResolved).not.toHaveAttribute('data-outcome', 'pending')
+  })
+
+  it('no reason string is read from substate: the substate requests carry codes only', () => {
+    advanceEngine(T0 + 25_000)
+    const requests = bankSub(getState()).requests
+    for (const rs of Object.values(requests) as unknown as Array<
+      Record<string, unknown>
+    >) {
+      // Only the typed code fields exist; no reason/name string smuggled in.
+      expect('reason' in rs).toBe(false)
+      expect('name' in rs).toBe(false)
+      expect(typeof rs['outcome']).toBe('string')
+    }
+  })
+})
diff --git a/test/app/missions/bank/fixture.ts b/test/app/missions/bank/fixture.ts
new file mode 100644
index 0000000..f7c417a
--- /dev/null
+++ b/test/app/missions/bank/fixture.ts
@@ -0,0 +1,171 @@
+// A minimal in-test FREEZE BANK ACCOUNTS fixture for the shell screens. A
+// handful of accounts, a few authored withdrawal requests, a couple of critical
+// payments, one confidence threshold with an injected withdrawal, and a short
+// prediction series. This is NOT an authored seed (section 02 writes those); the
+// screens render whatever payload is active, so a small payload that satisfies
+// the section-01 BankPayload type proves every view. The content validator does
+// not run here (it is a section-02 content test), so the payload need not carry
+// the authored ten accounts or the designated clue graph; it only has to init
+// and reduce through the real module.
+//
+// B04 is the DERIVED hold-justification record, engine-owned as a clue record:
+// inspecting it logs the clue with no mission involvement. F06 is the OBSERVED
+// field report a CHECK SOURCE resolves against, so TRACE and CHECK SOURCE have
+// real records and real desk answers to resolve against.
+import type { CampaignState, EngineContext, EvidenceRecord, SeedDefinition } from '@engine'
+import type { ClueRecordEntry, DeskCheckEntry } from '@engine/missions/types'
+import { buildTestContext } from '@engine/testing'
+import {
+  BANK_MISSION_ID,
+  bankSchedule,
+  makeBankMission,
+} from '@engine/missions/bank/module'
+import type { BankPayload } from '@engine/missions/bank/content'
+import type { BankState } from '@engine/missions/bank/types'
+
+export const BANK_DURATION_MS = 240_000
+export const BANK_CLUE_ID = 'clue-D-83'
+/** The DERIVED hold-justification record (B04 equivalent), engine-owned as a
+ *  clue record. Inspecting it logs the clue with no mission involvement. */
+export const JUSTIFICATION_RECORD_ID = 'B04'
+/** The OBSERVED field report a CHECK SOURCE on the disputed request resolves
+ *  against. */
+export const FIELD_REPORT_RECORD_ID = 'F06'
+
+export const BANK_FIXTURE_RECORDS: EvidenceRecord[] = [
+  {
+    id: 'C17',
+    origin: 'EXERCISE',
+    sourceId: 'D83-EXPORT',
+    parentId: null,
+    runId: 'R04',
+    eventTime: 76440,
+    receiptTime: 76445,
+    subsystem: 'bank',
+    body: ['EXERCISE SHUTDOWN ADVISORY PUBLISHED TO ACTIVE FEED'],
+  },
+  {
+    id: 'B04',
+    origin: 'DERIVED',
+    sourceId: 'HOLD-DESK',
+    parentId: 'C17',
+    runId: 'R04',
+    eventTime: 76448,
+    receiptTime: 76492,
+    subsystem: 'bank',
+    body: ['EMERGENCY HOLD NOTICE PER C17. ASSUMES SYSTEM-WIDE SHUTDOWN.'],
+  },
+  {
+    id: 'F06',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-DESK',
+    parentId: null,
+    runId: null,
+    eventTime: 76455,
+    receiptTime: 76460,
+    subsystem: 'bank',
+    body: ['FIELD DESK: OPERATING ACCOUNT BALANCE AS BOOKED. NO CONTRADICTION.'],
+  },
+]
+
+/** Desk-check answers. B04 comes back CONTRADICTED (the hold justification
+ *  launders R04 provenance); F06 comes back CONFIRMED. delaySeconds is small so
+ *  a single advance resolves a CHECK SOURCE. */
+export const BANK_DESK_CHECKS: DeskCheckEntry[] = [
+  {
+    recordId: 'B04',
+    outcome: 'CONTRADICTED',
+    delaySeconds: 5,
+    replyBody: ['NO INDEPENDENT SOURCE. RELAYED FROM THE EXERCISE ROOT ONLY.'],
+  },
+  {
+    recordId: 'F06',
+    outcome: 'CONFIRMED',
+    delaySeconds: 5,
+    replyBody: ['FIELD DESK CORROBORATES. OBSERVED AND INDEPENDENT.'],
+  },
+]
+
+export const BANK_CLUE_RECORDS: ClueRecordEntry[] = [
+  { recordId: JUSTIFICATION_RECORD_ID, clueId: BANK_CLUE_ID },
+]
+
+/** Four accounts in a fixed authored order. PAYROLL and OPERATING are unlimited;
+ *  VENDOR is limit-eligible so LIMIT can be exercised; MUNICIPAL is limit-
+ *  eligible and funds the municipal payment. Balances are small, round integers.
+ *  broadHoldCount is 0 so the FIRST hold stamps the broad hold (and the WOPR
+ *  predicted line shifts up in that same render), which keeps the predicted-
+ *  line-moves-on-HOLD test to a single action. */
+export const BANK_FIXTURE_PAYLOAD: BankPayload = {
+  accounts: [
+    { id: 'A-PAY', name: 'PAYROLL CLEARING', flavor: 'STAFF WAGES', flavorKind: 'payroll', openingBalance: 40_000, limitEligible: true },
+    { id: 'A-OPS', name: 'OPERATING CASH', flavor: 'DAY TO DAY', flavorKind: 'operating', openingBalance: 60_000, limitEligible: false },
+    { id: 'A-VEND', name: 'VENDOR ESCROW', flavor: 'SUPPLIER FLOAT', flavorKind: 'vendor', openingBalance: 30_000, limitEligible: true },
+    { id: 'A-MUNI', name: 'MUNICIPAL DEPOSIT', flavor: 'CITY FUNDS', flavorKind: 'municipal', openingBalance: 50_000, limitEligible: true },
+  ],
+  requests: [
+    { id: 'R-1', accountId: 'A-OPS', amount: 5_000, offsetSeconds: 20, reason: 'DEPOSITOR WITHDRAWAL. ROUTINE.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+    { id: 'R-2', accountId: 'A-VEND', amount: 4_000, offsetSeconds: 40, reason: 'SUPPLIER DRAW AGAINST ESCROW.', duplicateOfId: null, disputed: false, recordId: null, disputeClaimBalance: null },
+    { id: 'R-DISP', accountId: 'A-OPS', amount: 8_000, offsetSeconds: 60, reason: 'DISPUTED. CLAIMED BALANCE DOES NOT MATCH THE LEDGER.', duplicateOfId: null, disputed: true, recordId: FIELD_REPORT_RECORD_ID, disputeClaimBalance: 999 },
+  ],
+  payments: [
+    { id: 'P-PAY', accountId: 'A-PAY', amount: 10_000, dueOffsetSeconds: 120, confidenceBonus: 5, reason: 'STAFF PAYROLL. DUE THIS CYCLE.' },
+    { id: 'P-MUNI', accountId: 'A-MUNI', amount: 12_000, dueOffsetSeconds: 180, confidenceBonus: 5, reason: 'MUNICIPAL REMITTANCE.' },
+  ],
+  broadHoldCount: 0,
+  tickIntervalSeconds: 30,
+  standardDurationSeconds: 240,
+  confidenceDelta: {
+    perHeldAccount: -4,
+    perClearedPayment: 6,
+    perSelectiveRelease: 2,
+    cashBelowFloor: -5,
+  },
+  startingConfidence: 70,
+  thresholds: [
+    {
+      value: 50,
+      injected: [
+        { id: 'INJ-1', accountId: 'A-OPS', baseAmount: 9_000, reason: 'CONTAGION DRAW TRIGGERED BY FALLING CONFIDENCE.' },
+      ],
+    },
+  ],
+  floor: 20_000,
+  collapseFloor: 0,
+  target: 60,
+  predictionSeries: [1_000, 1_000, 1_000, 1_000],
+  holdShiftPercent: 35,
+  introLines: [
+    'FREEZE BANK ACCOUNTS',
+    'HOLD TOO MUCH AND WOPR CALLS IT RESOLVED WHILE THE BANK FAILS.',
+    'CLEAR THE CRITICAL PAYMENTS. KEEP CASH ABOVE THE FLOOR.',
+  ],
+  tierThresholds: { full: 3, partial: 2, poor: 1 },
+  paymentsDelayedTargetAccountId: 'A-OPS',
+  paymentsDelayedTable: { full: 0, partial: 5_000, poor: 10_000, failed: 15_000 },
+}
+
+/** Build an EngineContext over the fixture payload, records, desk checks, and
+ *  clue record, registering only the bank mission. Mirrors the engine module
+ *  test's buildTestContext usage exactly. */
+export function makeBankCtx(
+  payload: BankPayload = BANK_FIXTURE_PAYLOAD,
+): EngineContext {
+  const overrides: Partial<SeedDefinition> = {
+    records: BANK_FIXTURE_RECORDS,
+    deskChecks: BANK_DESK_CHECKS,
+    clueRecords: BANK_CLUE_RECORDS,
+    missionPayloads: { [BANK_MISSION_ID]: payload },
+    schedules: { [BANK_MISSION_ID]: [...bankSchedule(payload)] },
+    missionDurationsMs: { [BANK_MISSION_ID]: BANK_DURATION_MS },
+  }
+  return buildTestContext(BANK_FIXTURE_RECORDS, overrides, {
+    missions: { [BANK_MISSION_ID]: makeBankMission(payload) },
+    missionOrder: [BANK_MISSION_ID],
+  })
+}
+
+/** Read the live bank substate off a campaign state. */
+export function bankSub(state: CampaignState): BankState {
+  return state.activeMission?.substate as BankState
+}
diff --git a/test/app/missions/bank/flow.test.tsx b/test/app/missions/bank/flow.test.tsx
new file mode 100644
index 0000000..5ab3e89
--- /dev/null
+++ b/test/app/missions/bank/flow.test.tsx
@@ -0,0 +1,127 @@
+// One full hold-release-pay flow, run keyboard-only AND at a narrow viewport,
+// through the real BankScreen and the real engine (no mocks of either). The
+// keyboard path types every interaction into the one shared command line (no
+// pointer events); the narrow path drives the same flow through the controls at
+// a narrow viewport. The flow holds the payment's account (PAY blocks with the
+// held reason), releases it (PAY unblocks), and pays (the payment clears). This
+// proves the screen is operable both ways; the full per-seed passes live in
+// section 04.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import { makeBankCtx, bankSub } from './fixture'
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
+  __resetBankView()
+  setNarrow(narrow)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+  render(<ScreenRouter />)
+}
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
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
+describe('hold-release-pay flow keyboard-only', () => {
+  beforeEach(() => boot(false))
+
+  it('completes a full hold-release-pay flow entirely from the command line', () => {
+    // HOLD the payment account A-PAY by typed command (no pointer).
+    typeCommand('HOLD A-PAY')
+    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)
+
+    // PAYMENTS view by typed command; PAY is blocked while the account is held.
+    typeCommand('PAYMENTS')
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
+    const payHeld = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(payHeld.disabled).toBe(true)
+    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe('ACCOUNT HELD')
+
+    // RELEASE the account by typed command, then PAY by typed command.
+    typeCommand('RELEASE A-PAY')
+    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(false)
+    typeCommand('PAY P-PAY')
+    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
+  })
+
+  it('the shared command input stays focusable after view switches', () => {
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    act(() => {
+      input.focus()
+    })
+    expect(document.activeElement).toBe(input)
+    typeCommand('FEED')
+    typeCommand('LEDGER')
+    const after = screen.getByTestId('command-input') as HTMLInputElement
+    act(() => {
+      after.focus()
+    })
+    expect(document.activeElement).toBe(after)
+  })
+})
+
+describe('hold-release-pay flow at a narrow viewport', () => {
+  beforeEach(() => boot(true))
+
+  it('completes the full hold-release-pay flow through the controls at narrow width', () => {
+    // The screen is single-pane at narrow width; the ledger controls are present.
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-pane', 'single')
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-PAY'))
+    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)
+
+    // Move to payments via the tab; PAY is blocked, then released, then clears.
+    fireEvent.click(screen.getByTestId('bank-tab-payments'))
+    expect((screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement).disabled).toBe(true)
+
+    // Back to the ledger (the mobile back affordance), release, return, pay.
+    fireEvent.click(screen.getByTestId('bank-tab-ledger'))
+    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-PAY'))
+    fireEvent.click(screen.getByTestId('bank-tab-payments'))
+    fireEvent.click(screen.getByTestId('payment-PAY-P-PAY'))
+    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
+  })
+})
diff --git a/test/app/missions/bank/glossary.test.tsx b/test/app/missions/bank/glossary.test.tsx
new file mode 100644
index 0000000..943d81b
--- /dev/null
+++ b/test/app/missions/bank/glossary.test.tsx
@@ -0,0 +1,89 @@
+// The local FREEZE BANK ACCOUNTS glossary: the five local terms register
+// without collision, the global provenance terms (OBSERVED/EXERCISE/DERIVED)
+// are present but NOT re-registered by the mission, and re-registering a global
+// id would trip the uniqueness guard. Terms open their definition on focus and
+// close on Escape, matching the shell glossary conventions (focusable,
+// Escape-closable).
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import {
+  hasGlossaryEntry,
+  registerGlossaryTerms,
+} from '@app/a11y/glossary'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import { BANK_LOCAL_GLOSSARY_IDS as LOCAL_IDS } from '@app/missions/bank/glossary'
+import { makeBankCtx } from './fixture'
+
+const T0 = 1_000_000
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  vi.spyOn(console, 'error').mockImplementation(() => {})
+})
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('BankScreen glossary', () => {
+  it('registers only the five local terms without collision and does not re-register OBSERVED/EXERCISE/DERIVED', () => {
+    for (const id of LOCAL_IDS) {
+      expect(hasGlossaryEntry(id)).toBe(true)
+    }
+    expect(hasGlossaryEntry('observed')).toBe(true)
+    expect(hasGlossaryEntry('exercise')).toBe(true)
+    expect(hasGlossaryEntry('derived')).toBe(true)
+    expect(LOCAL_IDS).not.toContain('observed')
+    expect(LOCAL_IDS).not.toContain('exercise')
+    expect(LOCAL_IDS).not.toContain('derived')
+  })
+
+  it('re-registering a global id trips the glossary uniqueness guard', () => {
+    expect(() =>
+      registerGlossaryTerms([
+        { id: 'observed', term: 'OBSERVED', definition: 'DUP' },
+      ]),
+    ).toThrow(/duplicate/)
+  })
+
+  it('a local term opens its definition on focus and Escape closes it', () => {
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'bank' })
+    })
+    render(<ScreenRouter />)
+    // LIQUIDITY renders in the pinned status area.
+    const status = screen.getByTestId('bank-status')
+    const term = within(status)
+      .getAllByTestId('glossary-term')
+      .find((t) => t.textContent === 'LIQUIDITY')!
+    expect(term).toBeDefined()
+    const wrap = term.closest('.glossary-wrap') as HTMLElement
+    act(() => {
+      fireEvent.focus(term)
+    })
+    expect(within(wrap).getByTestId('glossary-popup')).toBeInTheDocument()
+    act(() => {
+      fireEvent.keyDown(term, { key: 'Escape' })
+    })
+    expect(within(wrap).queryByTestId('glossary-popup')).toBeNull()
+  })
+})
diff --git a/test/app/missions/bank/inlineReasons.test.tsx b/test/app/missions/bank/inlineReasons.test.tsx
new file mode 100644
index 0000000..dd3da05
--- /dev/null
+++ b/test/app/missions/bank/inlineReasons.test.tsx
@@ -0,0 +1,114 @@
+// Inline disabled reasons. A control the engine rules would reject renders
+// DISABLED with the engine's typed reason rendered to text INLINE next to it
+// (never a tooltip alone). The held-payment teaching case is the centerpiece:
+// PAY is disabled with the held-account reason while the payment's account is
+// held, and becomes enabled after a RELEASE, or after a LIMIT that covers the
+// payment. Every reason string is the engine's typed reason; the view invents
+// none.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import { makeBankCtx } from './fixture'
+
+const T0 = 1_000_000
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+  render(<ScreenRouter />)
+})
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function go(view: 'ledger' | 'feed' | 'payments'): void {
+  fireEvent.click(screen.getByTestId(`bank-tab-${view}`))
+}
+
+describe('inline disabled reasons', () => {
+  it('RELEASE on an open account is disabled with the typed NOT HELD reason rendered inline', () => {
+    const release = screen.getByTestId('ledger-RELEASE-A-OPS') as HTMLButtonElement
+    expect(release.disabled).toBe(true)
+    // The reason is rendered to text inline, not only as a tooltip.
+    const reason = screen.getByTestId('ledger-RELEASE-A-OPS-reason')
+    expect(reason.textContent).toBe('NOT HELD')
+  })
+
+  it('HOLD on an already-held account is disabled with the typed ALREADY HELD reason inline', () => {
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+    const hold = screen.getByTestId('ledger-HOLD-A-OPS') as HTMLButtonElement
+    expect(hold.disabled).toBe(true)
+    expect(screen.getByTestId('ledger-HOLD-A-OPS-reason').textContent).toBe('ALREADY HELD')
+  })
+
+  it('LIMIT on a non-eligible account is disabled with the typed NOT LIMIT ELIGIBLE reason inline', () => {
+    // A-OPS is operating cash: not limit-eligible in the fixture.
+    const limit = screen.getByTestId('ledger-LIMIT-A-OPS') as HTMLButtonElement
+    expect(limit.disabled).toBe(true)
+    expect(screen.getByTestId('ledger-LIMIT-A-OPS-reason').textContent).toBe(
+      'NOT LIMIT ELIGIBLE',
+    )
+  })
+
+  it('teaching case: PAY is disabled with the held-account reason while its account is held, and enabled after RELEASE', () => {
+    // P-PAY draws from A-PAY. Hold A-PAY, then PAY is blocked with ACCOUNT HELD.
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-PAY'))
+    go('payments')
+    const pay = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(pay.disabled).toBe(true)
+    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe('ACCOUNT HELD')
+
+    // Release A-PAY: the designed release-to-pay resolution. PAY is now enabled.
+    go('ledger')
+    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-PAY'))
+    go('payments')
+    const payAfter = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(payAfter.disabled).toBe(false)
+    expect(screen.queryByTestId('payment-PAY-P-PAY-reason')).toBeNull()
+  })
+
+  it('teaching case: a LIMIT below the payment blocks PAY with INSUFFICIENT ALLOWANCE, and a covering LIMIT re-enables it', () => {
+    // A-PAY is limit-eligible in the fixture and funds P-PAY (10000). LIMIT it to
+    // 5000 (below the payment): PAY is blocked with INSUFFICIENT ALLOWANCE.
+    const cap = screen.getByTestId('ledger-cap-A-PAY') as HTMLInputElement
+    fireEvent.change(cap, { target: { value: '5000' } })
+    fireEvent.click(screen.getByTestId('ledger-LIMIT-A-PAY'))
+    go('payments')
+    const pay = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(pay.disabled).toBe(true)
+    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe(
+      'INSUFFICIENT ALLOWANCE',
+    )
+
+    // Raise the LIMIT to cover the payment (12000 >= 10000): PAY re-enables.
+    go('ledger')
+    const cap2 = screen.getByTestId('ledger-cap-A-PAY') as HTMLInputElement
+    fireEvent.change(cap2, { target: { value: '12000' } })
+    fireEvent.click(screen.getByTestId('ledger-LIMIT-A-PAY'))
+    go('payments')
+    const payAfter = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(payAfter.disabled).toBe(false)
+  })
+})
diff --git a/test/app/missions/bank/intro.test.tsx b/test/app/missions/bank/intro.test.tsx
new file mode 100644
index 0000000..ff42dc8
--- /dev/null
+++ b/test/app/missions/bank/intro.test.tsx
@@ -0,0 +1,71 @@
+// The skippable intro mechanics lines. The intro lines (authored in the payload)
+// render OVER the first live decision; the game state underneath is live and
+// undisturbed until the player acts or skips. Skipping lands the player on the
+// live screen with nothing consumed: no engine action was dispatched, the
+// substate is byte-for-byte what it was before the skip.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import { BANK_FIXTURE_PAYLOAD, makeBankCtx, bankSub } from './fixture'
+
+const T0 = 1_000_000
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+  render(<ScreenRouter />)
+})
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('skippable intro', () => {
+  it('renders the authored intro mechanics lines over the live screen', () => {
+    const intro = screen.getByTestId('bank-intro')
+    for (const line of BANK_FIXTURE_PAYLOAD.introLines) {
+      expect(intro.textContent).toContain(line)
+    }
+    // The live screen is underneath and already operable: the ledger is present.
+    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
+    expect(screen.getByTestId('ledger-HOLD-A-OPS')).toBeInTheDocument()
+  })
+
+  it('skipping lands the player on the live screen with nothing consumed', () => {
+    // Snapshot the substate before skipping.
+    const before = JSON.stringify(bankSub(getState()))
+    fireEvent.click(screen.getByTestId('bank-intro-skip'))
+    // The intro is gone; the live ledger remains.
+    expect(screen.queryByTestId('bank-intro')).toBeNull()
+    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
+    // No engine action was dispatched by the skip: the substate is unchanged.
+    expect(JSON.stringify(bankSub(getState()))).toBe(before)
+  })
+
+  it('the first live decision is undisturbed by the intro: a HOLD under the intro still takes effect', () => {
+    // The intro overlays but does not block the live controls.
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+    expect(bankSub(getState()).accounts['A-OPS']?.held).toBe(true)
+  })
+})
diff --git a/test/app/missions/bank/status.test.tsx b/test/app/missions/bank/status.test.tsx
new file mode 100644
index 0000000..ccef3a2
--- /dev/null
+++ b/test/app/missions/bank/status.test.tsx
@@ -0,0 +1,127 @@
+// The pinned status area and the moving WOPR prediction line. The status area
+// is visible in every view and pins derived cash (a pure selector, never a
+// stored field), confidence, floor, target, and the two lines WOPR PREDICTED
+// vs OBSERVED. The predicted line is selectPredictedWithdrawals, a pure selector
+// over current substate, so a HOLD that stamps the broad hold moves it in the
+// SAME render. Held-account facts flow from the campaign OPEN EXCEPTIONS
+// selector, not local state.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import {
+  selectDerivedCash,
+  selectPredictedWithdrawals,
+} from '@engine/missions/bank/selectors'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import { BANK_FIXTURE_PAYLOAD, makeBankCtx, bankSub } from './fixture'
+
+const T0 = 1_000_000
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+  render(<ScreenRouter />)
+})
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+describe('pinned status area', () => {
+  it('pins derived cash, confidence, floor, target, and both the WOPR PREDICTED and OBSERVED lines', () => {
+    const sub = bankSub(getState())
+    const cash = selectDerivedCash(sub)
+    expect(screen.getByTestId('status-cash').textContent).toContain(String(cash))
+    expect(screen.getByTestId('status-confidence').textContent).toContain(
+      String(sub.confidence),
+    )
+    expect(screen.getByTestId('status-floor').textContent).toContain(
+      String(BANK_FIXTURE_PAYLOAD.floor),
+    )
+    expect(screen.getByTestId('status-target').textContent).toContain(
+      String(BANK_FIXTURE_PAYLOAD.target),
+    )
+    expect(screen.getByTestId('status-predicted')).toBeInTheDocument()
+    expect(screen.getByTestId('status-observed')).toBeInTheDocument()
+  })
+
+  it('derived cash is the selector value, never a stored field (substate carries no cash)', () => {
+    const sub = bankSub(getState()) as unknown as Record<string, unknown>
+    expect('cash' in sub).toBe(false)
+    expect('derivedCash' in sub).toBe(false)
+    // The status reads the selector.
+    const cash = selectDerivedCash(bankSub(getState()))
+    expect(screen.getByTestId('status-cash')).toHaveTextContent(String(cash))
+  })
+
+  it('the status area stays visible after switching to the FEED and PAYMENTS views', () => {
+    fireEvent.click(screen.getByTestId('bank-tab-feed'))
+    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
+    fireEvent.click(screen.getByTestId('bank-tab-payments'))
+    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
+  })
+
+  it('the WOPR PREDICTED line moves immediately on HOLD, in the same render (pure selector)', () => {
+    // Before any hold the predicted line is the unshifted authored series.
+    const before = selectPredictedWithdrawals(
+      BANK_FIXTURE_PAYLOAD,
+      bankSub(getState()),
+    )
+    const shownBefore = screen.getByTestId('status-predicted').getAttribute('data-value')
+    expect(shownBefore).toBe(before.join(','))
+
+    // HOLD one account. broadHoldCount is 0 in the fixture, so the FIRST hold
+    // stamps the broad hold and the predicted line shifts up in the same render.
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+
+    const afterSub = bankSub(getState())
+    const after = selectPredictedWithdrawals(BANK_FIXTURE_PAYLOAD, afterSub)
+    // The shift is real: every entry rose by the authored percent.
+    expect(after[0]).toBeGreaterThan(before[0]!)
+    // And the rendered line moved in the same render cycle, with no tick or wake.
+    const shownAfter = screen.getByTestId('status-predicted').getAttribute('data-value')
+    expect(shownAfter).toBe(after.join(','))
+    expect(shownAfter).not.toBe(shownBefore)
+  })
+
+  it('RELEASE drops the predicted line back in the same render', () => {
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+    const held = screen.getByTestId('status-predicted').getAttribute('data-value')
+    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-OPS'))
+    const released = selectPredictedWithdrawals(
+      BANK_FIXTURE_PAYLOAD,
+      bankSub(getState()),
+    ).join(',')
+    expect(screen.getByTestId('status-predicted').getAttribute('data-value')).toBe(
+      released,
+    )
+    expect(released).not.toBe(held)
+  })
+
+  it('held-account facts flow from the campaign OPEN EXCEPTIONS selector, not a bank-local exceptions UI', () => {
+    // The status reads OPEN EXCEPTIONS from the campaign selector; there is no
+    // bank-specific OPEN EXCEPTIONS control in the mission screen.
+    expect(screen.getByTestId('status-line').textContent).toContain('OPEN EXCEPTIONS')
+    expect(screen.queryByTestId('bank-open-exceptions')).toBeNull()
+  })
+})
diff --git a/test/app/missions/bank/trace-checksource.test.tsx b/test/app/missions/bank/trace-checksource.test.tsx
new file mode 100644
index 0000000..8e8454e
--- /dev/null
+++ b/test/app/missions/bank/trace-checksource.test.tsx
@@ -0,0 +1,83 @@
+// TRACE and CHECK SOURCE stay engine-owned. TRACE dispatches INSPECT_RECORD for
+// the hold-justification record (B04); the engine logs the clue through
+// clueRecords and the shell holds ZERO clue state. CHECK SOURCE dispatches
+// REQUEST_SOURCE_CHECK; the verdict arrives later as a sourceCheckResolved
+// emitted event and renders through the shell source-check presentation. No
+// clue logic or settlement logic lives in the mission screen.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, wake, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import {
+  FIELD_REPORT_RECORD_ID,
+  JUSTIFICATION_RECORD_ID,
+  makeBankCtx,
+} from './fixture'
+
+const T0 = 1_000_000
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+  render(<ScreenRouter />)
+})
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
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
+describe('TRACE and CHECK SOURCE stay engine-owned', () => {
+  it('TRACE dispatches INSPECT_RECORD for the hold-justification record and the clue logs engine-side; no shell clue state', () => {
+    typeCommand(`TRACE ${JUSTIFICATION_RECORD_ID}`)
+    expect(getState().inspectedRecords).toContain(JUSTIFICATION_RECORD_ID)
+    // The engine logged the designated clue; the shell holds no clue state.
+    expect(getState().cluesFound.length).toBeGreaterThan(0)
+  })
+
+  it('CHECK SOURCE dispatches REQUEST_SOURCE_CHECK and the verdict arrives as an emitted event rendered by the shell', () => {
+    typeCommand(`CHECK SOURCE ${FIELD_REPORT_RECORD_ID}`)
+    // A desk reply is queued; the verdict is not resolved yet.
+    const pending = getState().campaignQueue.some(
+      (e) => e.id === `desk-${FIELD_REPORT_RECORD_ID}`,
+    )
+    expect(pending).toBe(true)
+    expect(screen.queryByTestId(`source-check-${FIELD_REPORT_RECORD_ID}`)).toBeNull()
+
+    // Advance past the desk delay (5s): the verdict resolves as an emitted event
+    // and the shell presentation reveals it.
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 10_000)
+    act(() => {
+      wake()
+    })
+    const verdict = screen.getByTestId(`source-check-${FIELD_REPORT_RECORD_ID}`)
+    expect(verdict).toHaveAttribute('data-outcome', 'CONFIRMED')
+  })
+})
diff --git a/test/app/missions/bank/verbs.test.tsx b/test/app/missions/bank/verbs.test.tsx
new file mode 100644
index 0000000..fb0cfd0
--- /dev/null
+++ b/test/app/missions/bank/verbs.test.tsx
@@ -0,0 +1,133 @@
+// Command-button identity and view navigation for FREEZE BANK ACCOUNTS. Every
+// registered verb dispatches the identical action the equivalent on-screen
+// button dispatches (both call the shared builders). The LEDGER/FEED/PAYMENTS
+// view commands parse to mission-scoped SCREEN ui commands, switch the view,
+// and the toggle persists through the UI-preferences store and restores on a
+// remount. TRACE dispatches INSPECT_RECORD (clue logs engine-side); CHECK
+// SOURCE dispatches REQUEST_SOURCE_CHECK (verdict arrives as an emitted event).
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { parseCommand, registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import {
+  BANK_SCREEN_ID,
+  makeCheckSourceAction,
+  makeHoldAction,
+  makeLimitAction,
+  makePayAction,
+  makeReleaseAction,
+  makeTraceAction,
+} from '@app/missions/bank/verbs'
+import { registerBankScreen } from '@app/missions/bank/BankScreen'
+import { __resetBankView } from '@app/missions/bank/selectors'
+import {
+  JUSTIFICATION_RECORD_ID,
+  makeBankCtx,
+} from './fixture'
+
+const T0 = 1_000_000
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  __resetBankView()
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerBankScreen()
+  teardown = init({
+    ctx: makeBankCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'bank' })
+  })
+  render(<ScreenRouter />)
+})
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function parse(text: string) {
+  const result = parseCommand(text, BANK_SCREEN_ID)
+  return result.kind === 'action' ? result.action : null
+}
+
+describe('command-button identity', () => {
+  it('every verb parses to the identical action the equivalent button dispatches', () => {
+    expect(parse('HOLD A-OPS')).toStrictEqual(makeHoldAction('A-OPS'))
+    expect(parse('RELEASE A-OPS')).toStrictEqual(makeReleaseAction('A-OPS'))
+    expect(parse('LIMIT A-VEND 5000')).toStrictEqual(makeLimitAction('A-VEND', 5000))
+    expect(parse('PAY P-PAY')).toStrictEqual(makePayAction('P-PAY'))
+    expect(parse(`TRACE ${JUSTIFICATION_RECORD_ID}`)).toStrictEqual(
+      makeTraceAction(JUSTIFICATION_RECORD_ID),
+    )
+    expect(parse('CHECK SOURCE F06')).toStrictEqual(makeCheckSourceAction('F06'))
+  })
+
+  it('the HOLD button on a ledger row dispatches the identical action the typed HOLD command dispatches', () => {
+    // Drive the real HOLD button; the engine substate change must match what a
+    // typed HOLD A-OPS would have produced (the shared builder proves identity).
+    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
+    expect(getState().activeMission?.missionId).toBe('bank')
+    const sub = getState().activeMission?.substate as {
+      accounts: Record<string, { held: boolean }>
+    }
+    expect(sub.accounts['A-OPS']?.held).toBe(true)
+    // And the typed command builds the identical action object.
+    expect(parse('HOLD A-OPS')).toStrictEqual(makeHoldAction('A-OPS'))
+  })
+
+  it('the view commands parse to mission-scoped SCREEN ui commands, not engine actions', () => {
+    for (const v of ['LEDGER', 'FEED', 'PAYMENTS']) {
+      const result = parseCommand(v, BANK_SCREEN_ID)
+      expect(result.kind).toBe('ui')
+    }
+  })
+})
+
+describe('view navigation and persistence', () => {
+  it('LEDGER / FEED / PAYMENTS switch views via desktop tabs', () => {
+    fireEvent.click(screen.getByTestId('bank-tab-feed'))
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
+    expect(screen.getByTestId('bank-feed-view')).toBeInTheDocument()
+    fireEvent.click(screen.getByTestId('bank-tab-payments'))
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
+    expect(screen.getByTestId('bank-payments-view')).toBeInTheDocument()
+    fireEvent.click(screen.getByTestId('bank-tab-ledger'))
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'ledger')
+    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
+  })
+
+  it('view commands switch views, and the mobile BACK affordance returns to the ledger', () => {
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    const type = (text: string) => {
+      act(() => {
+        fireEvent.change(input, { target: { value: text } })
+        fireEvent.submit(screen.getByTestId('command-form'))
+      })
+    }
+    type('FEED')
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
+    // The mobile BACK affordance returns to the ledger.
+    fireEvent.click(screen.getByTestId('bank-back'))
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'ledger')
+  })
+
+  it('the active view persists through the UI preferences and restores on remount', () => {
+    fireEvent.click(screen.getByTestId('bank-tab-payments'))
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
+    // Unmount and remount the whole shell: the stored preference restores the
+    // payments view, not a reset to the ledger default.
+    cleanup()
+    render(<ScreenRouter />)
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
+  })
+})
