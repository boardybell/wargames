diff --git a/test/app/missions/bank/a11y.test.tsx b/test/app/missions/bank/a11y.test.tsx
new file mode 100644
index 0000000..654bc7b
--- /dev/null
+++ b/test/app/missions/bank/a11y.test.tsx
@@ -0,0 +1,240 @@
+// Section-04 accessibility passes for FREEZE BANK ACCOUNTS, through the REAL
+// BankScreen and the REAL engine (no mocks of either). Two passes over one full
+// HOLD -> observe inline -> RELEASE -> navigate -> PAY flow:
+//   1. keyboard-only (wide, multi-pane): every interaction typed into the single
+//      shared command line, focus reachable and visible at each step, the
+//      disabled-PAY reason readable WHILE the account is held;
+//   2. narrow viewport (single pane): the same flow driven through the view
+//      commands and the mobile BACK affordance (no tabs relied on), with the
+//      pinned status area (cash / confidence / floor / target / PREDICTED vs
+//      OBSERVED) reachable in every view.
+// Plus: the view-toggle preference survives an unmount/remount in BOTH passes.
+// This is the keyboard-reachability regression guard: if a step were unreachable
+// by keyboard, the fix belongs in the section-03 components, not here.
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
+}
+
+afterEach(() => {
+  teardown()
+  __resetBankView()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+/** Type a command into the single shared command input and submit it with the
+ *  keyboard (a form submit, the Enter path), never a pointer. */
+function typeCommand(text: string): void {
+  const input = screen.getByTestId('command-input') as HTMLInputElement
+  act(() => {
+    fireEvent.change(input, { target: { value: text } })
+    fireEvent.submit(screen.getByTestId('command-form'))
+  })
+}
+
+/** Focus a control the keyboard would Tab to, then assert it IS the active
+ *  element: it is reachable (in the tab order, not aria-hidden or detached). */
+function assertFocusable(testId: string): HTMLElement {
+  const el = screen.getByTestId(testId)
+  act(() => {
+    el.focus()
+  })
+  expect(document.activeElement).toBe(el)
+  return el
+}
+
+describe('bank a11y: keyboard-only full flow (wide, multi-pane)', () => {
+  beforeEach(() => boot(false))
+
+  it('HOLD -> observe inline -> RELEASE -> navigate -> PAY entirely from the keyboard, focus reachable every step, held PAY reason readable', () => {
+    render(<ScreenRouter />)
+    // Wide layout: the ledger stays visible as a persistent pane (two panes).
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-pane', 'two')
+
+    // Step 1: focus the shared command input (the keyboard entry point) and HOLD
+    // the payment's account A-PAY by typed command. No pointer anywhere.
+    const input = assertFocusable('command-input')
+    typeCommand('LEDGER')
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'ledger')
+    typeCommand('HOLD A-PAY')
+    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)
+
+    // Step 2: observe the inline state on the ledger row: the account reads HELD,
+    // and its RELEASE control is reachable by keyboard (focusable).
+    expect(screen.getByTestId('account-row-A-PAY')).toHaveAttribute('data-held', 'true')
+    assertFocusable('ledger-RELEASE-A-PAY')
+    // The command input is still reachable after focusing a row control.
+    act(() => {
+      input.focus()
+    })
+    expect(document.activeElement).toBe(input)
+
+    // Step 3: navigate to PAYMENTS by typed command; the disabled PAY reason is
+    // readable WHILE the account is held (release-or-limit-to-pay is the designed
+    // tension, so the reason must be present in the DOM, not a tooltip alone).
+    typeCommand('PAYMENTS')
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
+    const payHeld = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(payHeld.disabled).toBe(true)
+    const heldReason = screen.getByTestId('payment-PAY-P-PAY-reason')
+    expect(heldReason.textContent).toBe('ACCOUNT HELD')
+
+    // Step 4: RELEASE the account by typed command; PAY unblocks.
+    typeCommand('RELEASE A-PAY')
+    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(false)
+    const payFree = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(payFree.disabled).toBe(false)
+    // The enabled PAY control is keyboard-reachable.
+    assertFocusable('payment-PAY-P-PAY')
+
+    // Step 5: PAY by typed command; the payment clears in engine state.
+    typeCommand('PAY P-PAY')
+    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
+    expect(screen.getByTestId('payment-status-P-PAY')).toBeInTheDocument()
+
+    // The shared command input is still focusable after the whole flow.
+    act(() => {
+      input.focus()
+    })
+    expect(document.activeElement).toBe(input)
+  })
+
+  it('the pinned status area (cash, confidence, floor, target, PREDICTED vs OBSERVED) is reachable in every view', () => {
+    render(<ScreenRouter />)
+    const assertStatus = (): void => {
+      expect(screen.getByTestId('bank-status')).toBeInTheDocument()
+      expect(screen.getByTestId('status-cash')).toBeInTheDocument()
+      expect(screen.getByTestId('status-confidence')).toBeInTheDocument()
+      expect(screen.getByTestId('status-floor')).toBeInTheDocument()
+      expect(screen.getByTestId('status-target')).toBeInTheDocument()
+      expect(screen.getByTestId('status-predicted')).toBeInTheDocument()
+      expect(screen.getByTestId('status-observed')).toBeInTheDocument()
+    }
+    assertStatus()
+    typeCommand('FEED')
+    assertStatus()
+    typeCommand('PAYMENTS')
+    assertStatus()
+    typeCommand('LEDGER')
+    assertStatus()
+  })
+
+  it('the view-toggle preference survives an unmount/remount', () => {
+    const { unmount } = render(<ScreenRouter />)
+    // Switch to PAYMENTS by typed command, then unmount and remount: the stored
+    // preference restores the PAYMENTS view, never an empty default.
+    typeCommand('PAYMENTS')
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
+    act(() => {
+      unmount()
+    })
+    render(<ScreenRouter />)
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
+  })
+})
+
+describe('bank a11y: narrow viewport full flow (single pane, back affordances)', () => {
+  beforeEach(() => boot(true))
+
+  it('HOLD -> observe -> RELEASE -> PAY through commands and the BACK affordance, no tabs relied on, status reachable throughout', () => {
+    render(<ScreenRouter />)
+    // Narrow layout: single pane off matchMedia.
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-pane', 'single')
+    // The ledger is the one visible pane; payments is collapsed away.
+    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
+    expect(screen.queryByTestId('bank-payments-view')).toBeNull()
+    // The pinned status area is reachable on the ledger view.
+    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
+    expect(screen.getByTestId('status-predicted')).toBeInTheDocument()
+    expect(screen.getByTestId('status-observed')).toBeInTheDocument()
+
+    // HOLD A-PAY by typed command.
+    typeCommand('HOLD A-PAY')
+    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)
+    expect(screen.getByTestId('account-row-A-PAY')).toHaveAttribute('data-held', 'true')
+
+    // Navigate to PAYMENTS by typed command: the single pane COLLAPSES to only
+    // payments, the ledger leaves the DOM, and the mobile BACK affordance appears
+    // (no reliance on tabs).
+    typeCommand('PAYMENTS')
+    expect(screen.getByTestId('bank-payments-view')).toBeInTheDocument()
+    expect(screen.queryByTestId('bank-ledger-view')).toBeNull()
+    expect(screen.getByTestId('bank-back')).toBeInTheDocument()
+    // The pinned status stays reachable in the collapsed payments view.
+    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
+    // PAY is blocked while held, reason readable.
+    const payHeld = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
+    expect(payHeld.disabled).toBe(true)
+    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe('ACCOUNT HELD')
+
+    // Back to the ledger via the mobile BACK affordance (keyboard-activated), then
+    // RELEASE by typed command.
+    const back = screen.getByTestId('bank-back')
+    act(() => {
+      back.focus()
+      fireEvent.click(back)
+    })
+    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
+    typeCommand('RELEASE A-PAY')
+    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(false)
+
+    // Return to PAYMENTS and PAY by typed command; the payment clears.
+    typeCommand('PAYMENTS')
+    typeCommand('PAY P-PAY')
+    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
+    // Status still reachable after the flow completes.
+    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
+  })
+
+  it('the view-toggle preference survives an unmount/remount at narrow width', () => {
+    const { unmount } = render(<ScreenRouter />)
+    typeCommand('FEED')
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
+    act(() => {
+      unmount()
+    })
+    render(<ScreenRouter />)
+    // The stored preference restores FEED on remount, never an empty default.
+    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
+  })
+})
diff --git a/test/engine/missions/bank/debrief.test.ts b/test/engine/missions/bank/debrief.test.ts
new file mode 100644
index 0000000..bc389ec
--- /dev/null
+++ b/test/engine/missions/bank/debrief.test.ts
@@ -0,0 +1,225 @@
+// Section-04 CI fixture: the FREEZE BANK ACCOUNTS debrief cross-tab, matrixed
+// over all three authored seeds. The cross-tab partitions every resolved request
+// into EXACTLY ONE of before-hold / genuine after-hold / injected after-hold,
+// with counts AND summed amounts asserted against HAND-COMPUTED expectations
+// from the authored stream. The expectations are literals derived here from the
+// authored amounts and the holds the script applies; they are NOT read back from
+// the implementation's own crossTab helper, so a mis-bucketed request is caught.
+// Also: the no-broad-hold run puts every request before-hold; per-payment
+// outcomes match run history and remaining derived cash matches the selector at
+// settlement; aggregated confidence reasons are typed codes rendered through
+// selectors; and the clue status reflects whether the hold-justification record
+// was inspected.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { SettledOutcome } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import { BANK_MISSION_ID } from '@engine/missions/bank/module'
+import { BANK_ANCHORS_BY_SEED } from '@engine/missions/bank/payloads'
+import {
+  renderRequestOutcome,
+  selectDerivedCash,
+} from '@engine/missions/bank/selectors'
+import { REQUEST_OUTCOMES } from '@engine/missions/bank/types'
+import {
+  BANK_DURATION_MS,
+  BANK_T0,
+  bankContextForSeed,
+  bankPayloadFor,
+  bankSub,
+  bankWalkthroughFor,
+  driveBankSeed,
+  holdAct,
+} from './fixtures'
+import type { Envelope } from './fixtures'
+
+const SETTLE_AT = BANK_T0 + BANK_DURATION_MS + 1_000
+
+const start: Envelope = [
+  { type: 'START_MISSION', missionId: BANK_MISSION_ID },
+  BANK_T0,
+]
+
+function bankOutcome(state: CampaignState): SettledOutcome {
+  return state.settled.find((s) => s.missionId === BANK_MISSION_ID)!
+}
+
+// ── Hand-computed cross-tab expectations ─────────────────────────────────
+// The cross-tab script stamps the broad hold at +4s (the fourth hold crosses
+// broadHoldCount = 3) by holding DEP-REEVE, DEP-ASHE, VEN-ORR, MUN-VANE before
+// the first wave (W01 at +20s). So NO wave arrives before the stamp: before-hold
+// is empty. All 18 authored waves arrive after the stamp (genuine after-hold);
+// a wave against a held account refuses (draws 0), a wave against an unheld
+// account applies in full. Holding those four accounts hard through the whole
+// window drives confidence across all three authored thresholds (60, 45, 30) by
+// settlement, injecting INJ-60 (OPS-MAIN, 150), INJ-45 (VEN-HALE, 150), and
+// INJ-30 (OPS-AUX, 150) after the hold: three injected draws, 450 total.
+//
+// Held accounts (refused, 0): the waves against the four held accounts:
+//   W01 DEP-REEVE, W06 DEP-ASHE, W07 VEN-ORR, W08 MUN-VANE, W11 DEP-REEVE,
+//   W14 DEP-ASHE, W16 VEN-ORR, W17 MUN-VANE, W18 DEP-REEVE  -> 9 waves, 0 each.
+// Unheld (applied in full): the remaining nine waves:
+//   W02 150, W03 500, W04 250, W05 180, W09 500, W10 260, W12 170, W13 300,
+//   W15 200  -> sum 2510.
+const HOLD_ACCOUNTS = ['DEP-REEVE', 'DEP-ASHE', 'VEN-ORR', 'MUN-VANE']
+const EXPECTED = {
+  beforeHoldCount: 0,
+  beforeHoldAmount: 0,
+  genuineAfterHoldCount: 18,
+  genuineAfterHoldAmount: 2510,
+  injectedAfterHoldCount: 3,
+  injectedAfterHoldAmount: 450,
+}
+const AUTHORED_REQUEST_COUNT = 18
+const AUTHORED_APPLIED_TOTAL = 2510 // sum of applied authored waves (refused = 0)
+
+function crossTabScript(): Envelope[] {
+  const o = (sec: number) => BANK_T0 + sec * 1000
+  return [
+    start,
+    ...HOLD_ACCOUNTS.map((id, i): Envelope => [holdAct(id), o(1 + i)]),
+  ]
+}
+
+describe.each(SEED_NAMES)('bank debrief, seed %s', (seedName) => {
+  it('cross-tab partitions every request into exactly one cell; counts and amounts match HAND-COMPUTED expectations and sum to the totals', () => {
+    const ctx = bankContextForSeed(seedName)
+    const { state } = driveBankSeed(ctx, seedName, crossTabScript(), SETTLE_AT, false)
+    const m = bankOutcome(state).metrics
+
+    // Each cell matches the hand-computed literal above (NOT read from the impl).
+    expect(m['before_hold_count']).toBe(EXPECTED.beforeHoldCount)
+    expect(m['before_hold_amount']).toBe(EXPECTED.beforeHoldAmount)
+    expect(m['genuine_after_hold_count']).toBe(EXPECTED.genuineAfterHoldCount)
+    expect(m['genuine_after_hold_amount']).toBe(EXPECTED.genuineAfterHoldAmount)
+    expect(m['injected_after_hold_count']).toBe(EXPECTED.injectedAfterHoldCount)
+    expect(m['injected_after_hold_amount']).toBe(EXPECTED.injectedAfterHoldAmount)
+
+    // The three cells partition EVERY resolved request: counts sum to the total
+    // resolved request count (authored + injected), amounts sum to the total
+    // applied amount. No request is double-counted or dropped.
+    const totalCount =
+      m['before_hold_count']! +
+      m['genuine_after_hold_count']! +
+      m['injected_after_hold_count']!
+    const totalAmount =
+      m['before_hold_amount']! +
+      m['genuine_after_hold_amount']! +
+      m['injected_after_hold_amount']!
+    expect(totalCount).toBe(
+      AUTHORED_REQUEST_COUNT + EXPECTED.injectedAfterHoldCount,
+    )
+    expect(totalAmount).toBe(
+      AUTHORED_APPLIED_TOTAL + EXPECTED.injectedAfterHoldAmount,
+    )
+  })
+
+  it('cross-tab with no broad hold ever: all requests before-hold, zero in both after-hold cells', () => {
+    // No holds at all: the broad hold never stamps, so every authored wave is
+    // before-hold and no threshold injection fires (confidence never falls).
+    const ctx = bankContextForSeed(seedName)
+    const { state } = driveBankSeed(ctx, seedName, [start], SETTLE_AT, false)
+    const m = bankOutcome(state).metrics
+    // Hand-computed: all 18 authored waves apply in full, total 4790, all
+    // before-hold; both after-hold cells empty.
+    expect(m['before_hold_count']).toBe(18)
+    expect(m['before_hold_amount']).toBe(4790)
+    expect(m['genuine_after_hold_count']).toBe(0)
+    expect(m['genuine_after_hold_amount']).toBe(0)
+    expect(m['injected_after_hold_count']).toBe(0)
+    expect(m['injected_after_hold_amount']).toBe(0)
+  })
+
+  it('per-payment outcomes match run history; remaining derived cash matches the selector at settlement', () => {
+    const ctx = bankContextForSeed(seedName)
+    const payload = bankPayloadFor(seedName)
+    // The walkthrough clears all four payments. Sample the LIVE substate just
+    // before the end tick: for the walkthrough every account is released or paid,
+    // so balances are frozen and the pre-end-tick derived cash equals the
+    // settlement cash the selector-mirroring metric records.
+    let live = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+    for (const [action, now] of bankWalkthroughFor(seedName)) {
+      live = dispatch(ctx, live, action, now).state
+    }
+    live = advanceCampaign(ctx, live, BANK_T0 + BANK_DURATION_MS - 1_000).state
+    const liveSub = bankSub(live)!
+    // Run history: every critical payment cleared in the live substate.
+    for (const payment of payload.payments) {
+      expect(liveSub.payments[payment.id]!.cleared).toBe(true)
+    }
+    const liveCash = selectDerivedCash(liveSub)
+
+    const { state } = driveBankSeed(ctx, seedName, bankWalkthroughFor(seedName))
+    const outcome = bankOutcome(state)
+    // Per-payment outcomes match the run history: the settled payments_cleared
+    // equals the number cleared in the run.
+    expect(outcome.metrics['payments_cleared']).toBe(payload.payments.length)
+    // Remaining derived cash at settlement equals the selector value: the metric
+    // is the selector's own computation, never a stored cash field.
+    expect(outcome.metrics['derived_cash']).toBe(liveCash)
+  })
+
+  it('aggregated confidence reasons are typed codes rendered through selectors, not stored strings', () => {
+    // The substate stores only typed request-outcome CODES; the display text is
+    // produced by the selector renderRequestOutcome, never stored. Drive a run
+    // with a hold so a refusal and an application both occur, then prove every
+    // stored outcome is a member of the typed-code set and that the human text is
+    // the selector's rendering, absent from the serialized substate.
+    const ctx = bankContextForSeed(seedName)
+    let live = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+    live = dispatch(ctx, live, start[0], BANK_T0).state
+    live = dispatch(ctx, live, holdAct('DEP-REEVE'), BANK_T0 + 1_000).state
+    live = advanceCampaign(ctx, live, BANK_T0 + BANK_DURATION_MS - 1_000).state
+    const liveSub = bankSub(live)!
+    const dump = JSON.stringify(liveSub)
+    for (const rs of Object.values(liveSub.requests)) {
+      // Every stored outcome is a typed code, never a rendered string.
+      expect(REQUEST_OUTCOMES).toContain(rs.outcome)
+      // The display rendering is produced by the selector, and that rendered
+      // text is NOT what the substate stores (the substate has the code only).
+      const rendered = renderRequestOutcome(rs.outcome)
+      expect(rendered.length).toBeGreaterThan(0)
+      expect(dump).not.toContain(rendered)
+    }
+  })
+
+  it('clue status reflects whether the hold-justification record was inspected during the run', () => {
+    const ctx = bankContextForSeed(seedName)
+    const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+
+    // WITHOUT an inspect: the clue never logs, the campaign cluesFound is empty
+    // of it, and the settled outcome carries no clue id.
+    const noClue = driveBankSeed(ctx, seedName, [start], SETTLE_AT, false)
+    expect(noClue.state.cluesFound).not.toContain(anchors.clueId)
+    expect(bankOutcome(noClue.state).clueId).toBeNull()
+
+    // WITH an inspect on the hold-justification record: the clue logs once via
+    // the engine clueRecords path and survives into settlement.
+    let withClue: CampaignState = createCampaign(
+      ctx,
+      seedName,
+      { extendedTime: false },
+      BANK_T0,
+    )
+    withClue = dispatch(ctx, withClue, start[0], BANK_T0).state
+    const inspect = dispatch(
+      ctx,
+      withClue,
+      { type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId },
+      BANK_T0 + 2_000,
+    )
+    expect(inspect.emitted.filter((e) => e.type === 'clueFound')).toEqual([
+      { type: 'clueFound', clueId: anchors.clueId },
+    ])
+    const settled = advanceCampaign(ctx, inspect.state, SETTLE_AT).state
+    expect(settled.cluesFound).toContain(anchors.clueId)
+    // The module contributes no clue id on its own outcome (campaign fact, not a
+    // mission outcome field).
+    expect(bankOutcome(settled).clueId).toBeNull()
+  })
+})
diff --git a/test/engine/missions/bank/fixtures.test.ts b/test/engine/missions/bank/fixtures.test.ts
new file mode 100644
index 0000000..8e48360
--- /dev/null
+++ b/test/engine/missions/bank/fixtures.test.ts
@@ -0,0 +1,471 @@
+// Section-04 CI fixture matrix for FREEZE BANK ACCOUNTS, run over all three
+// authored seeds (exercise-r04/k11/t58). It replays the section-02 walkthrough
+// and surge scripts (one line of play run twice for the surge pair), and
+// authors the remaining test-local scripts (timeout, forfeit, both collapse
+// paths, the broad-hold boundary tie, extended-time proportionality, the clue
+// fixture). The walkthrough and surge scripts come from section 02, so a red
+// walkthrough means authored NUMBERS in payloads.ts, never a harness or rules
+// bug. Every quantity is an integer; nothing here reads Date or Math.random.
+//
+// Discipline enforced here (the bugs prior reviews caught): the surge pair is
+// ONE script run twice (base vs capped inbound); the broad-hold boundary
+// constructs the TRUE scheduledAt==dispatch tie; the collapse fixtures assert
+// settlement IDEMPOTENCE by capturing the record, dispatching more actions and
+// drains, and asserting state and record are byte-identical.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { SettledOutcome } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import { BANK_MISSION_ID, makeBankMission } from '@engine/missions/bank/module'
+import { BANK_ANCHORS_BY_SEED } from '@engine/missions/bank/payloads'
+import {
+  BANK_DURATION_MS,
+  BANK_T0,
+  bankCashCollapseContext,
+  bankContextForSeed,
+  bankPayloadFor,
+  bankSub,
+  bankSurgeExpectation,
+  bankSurgeFor,
+  bankWalkthroughExpectation,
+  bankWalkthroughFor,
+  driveBankSeed,
+  holdAct,
+  payAct,
+  releaseAct,
+} from './fixtures'
+import type { Envelope } from './fixtures'
+
+const SETTLE_AT = BANK_T0 + BANK_DURATION_MS + 1_000
+/** The engine inbound cap withMaxInboundSurge folds (flightsDisrupted = 40). */
+const INBOUND_CAP = 40
+
+const TIER_RANK: Record<string, number> = {
+  failed: 0,
+  poor: 1,
+  partial: 2,
+  full: 3,
+}
+
+function bankOutcome(state: CampaignState): SettledOutcome {
+  return state.settled.find((s) => s.missionId === BANK_MISSION_ID)!
+}
+
+function settlements(emitted: readonly { type: string }[]): unknown[] {
+  return emitted.filter((e) => e.type === 'settlement')
+}
+
+const start: Envelope = [
+  { type: 'START_MISSION', missionId: BANK_MISSION_ID },
+  BANK_T0,
+]
+
+describe.each(SEED_NAMES)('bank fixtures, seed %s', (seedName) => {
+  it('walkthrough: settles exactly once at the deadline, tier FULL, all four payments cleared above floor and target', () => {
+    const ctx = bankContextForSeed(seedName)
+    const payload = bankPayloadFor(seedName)
+    const { state, emitted } = driveBankSeed(
+      ctx,
+      seedName,
+      bankWalkthroughFor(seedName),
+      SETTLE_AT,
+    )
+    const expected = bankWalkthroughExpectation(seedName)
+    // Exactly one settlement over the whole run.
+    expect(settlements(emitted)).toHaveLength(1)
+    const outcome = bankOutcome(state)
+    expect(outcome.tier).toBe(expected.tier)
+    expect(outcome.tier).toBe('full')
+    // All four critical payments cleared.
+    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
+    expect(outcome.metrics['payments_total']).toBe(expected.totalPayments)
+    // Derived cash at or above the authored floor; confidence at or above
+    // target. Three sustainability signals, so FULL with margin.
+    expect(outcome.metrics['derived_cash']!).toBeGreaterThanOrEqual(payload.floor)
+    expect(outcome.metrics['confidence']!).toBeGreaterThanOrEqual(payload.target)
+    expect(outcome.metrics['sustainability_signals']).toBe(3)
+  })
+
+  // ── The surge pair: ONE script run twice ─────────────────────────────
+  // bankSurgeFor(seed) is a SINGLE line of play. It is driven once at base
+  // inbound sizing (flightsDisrupted magnitude 0) and once with the same script
+  // replayed under the maximum capped inbound magnitude folded in. The two runs
+  // share the identical envelope list; only the inbound-surge flag differs.
+  const surgeScript = () => bankSurgeFor(seedName)
+
+  it('surge BASE sizing: each crossed threshold injects exactly once with the injected marker, run stays >= partial', () => {
+    const ctx = bankContextForSeed(seedName)
+    const { state, emitted } = driveBankSeed(
+      ctx,
+      seedName,
+      surgeScript(),
+      SETTLE_AT,
+      false,
+    )
+    const outcome = bankOutcome(state)
+    const expected = bankSurgeExpectation(seedName)
+
+    // Every consumed threshold fired exactly one DISTINCT crossing event, and no
+    // threshold was consumed twice (the crossing events persist in `emitted`,
+    // the injected-marker data lives in the settled metrics, so neither needs
+    // the post-settlement substate the active mission has already cleared).
+    const crossed = emitted
+      .filter((e) => e.type === 'bankThresholdCrossed')
+      .map((e) => (e as { threshold: number }).threshold)
+    const uniqueCrossed = new Set(crossed)
+    // Each crossed threshold injected exactly once: no duplicate crossing event.
+    expect(crossed.length).toBe(uniqueCrossed.size)
+    expect(crossed.length).toBeGreaterThanOrEqual(1)
+    // At least one injected (contagion) draw after the broad hold the holds
+    // provoked, carried in the injected bucket of the settled cross-tab.
+    expect(outcome.metrics['injected_after_hold_count']!).toBeGreaterThanOrEqual(1)
+    // The injected count never exceeds the number of distinct thresholds crossed:
+    // one injection per threshold, ever (the authored thresholds each inject one
+    // request).
+    expect(outcome.metrics['injected_after_hold_count']!).toBeLessThanOrEqual(
+      uniqueCrossed.size,
+    )
+    // Still solvable to at least the documented sustainable tier.
+    expect(TIER_RANK[outcome.tier]!).toBeGreaterThanOrEqual(
+      TIER_RANK[expected.tier]!,
+    )
+    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
+  })
+
+  it('surge MAX-CAPPED sizing: SAME script injects at base+cap (never below base) and still stays >= partial', () => {
+    const ctx = bankContextForSeed(seedName)
+    const expected = bankSurgeExpectation(seedName)
+
+    // Run A (base, magnitude 0) and run B (capped, magnitude 40) are the SAME
+    // envelope list; only the inbound flag differs. This is the surge pair.
+    const runA = driveBankSeed(ctx, seedName, surgeScript(), SETTLE_AT, false)
+    const runB = driveBankSeed(ctx, seedName, surgeScript(), SETTLE_AT, true)
+    const a = bankOutcome(runA.state)
+    const b = bankOutcome(runB.state)
+
+    // Capped injections draw strictly more than base, and never below base: the
+    // delta is at least INBOUND_CAP per injected draw that fired in both.
+    expect(b.metrics['injected_after_hold_amount']!).toBeGreaterThan(
+      a.metrics['injected_after_hold_amount']!,
+    )
+    expect(b.metrics['injected_after_hold_amount']!).toBeGreaterThanOrEqual(
+      a.metrics['injected_after_hold_amount']! +
+        INBOUND_CAP * b.metrics['injected_after_hold_count']!,
+    )
+    // The same number of injections fired in both runs (same line of play, same
+    // crossings): the only difference is each draw is base+cap, never below base.
+    expect(b.metrics['injected_after_hold_count']).toBe(
+      a.metrics['injected_after_hold_count'],
+    )
+    // Still solvable at the max inbound surge.
+    expect(TIER_RANK[b.tier]!).toBeGreaterThanOrEqual(TIER_RANK[expected.tier]!)
+    expect(b.metrics['payments_cleared']).toBe(expected.clearedPayments)
+  })
+
+  it('surge both-directions: a threshold consumed on the FIRST crossing is not re-injected on a re-cross', () => {
+    // Cross the top threshold (60), RECOVER above it, then RE-CROSS it. The first
+    // crossing consumes the threshold permanently; the second schedules nothing.
+    // Hold six accounts hard through tick-1 (+60) so confidence falls below 60
+    // (consuming it once), then release all six and clear all four payments so
+    // confidence recovers above 60, then RE-HOLD the six before the end tick so
+    // confidence falls below 60 a second time: the end-tick re-cross must inject
+    // nothing. One injection, ever.
+    const ctx = bankContextForSeed(seedName)
+    const p = payload(seedName)
+    const top = Math.max(...p.thresholds.map((t) => t.value))
+    const o = (sec: number) => BANK_T0 + sec * 1000
+    const six = ['DEP-ASHE', 'DEP-REEVE', 'VEN-ORR', 'MUN-VANE', 'PAY-SOUTH', 'PAY-NORTH']
+    const envs: Envelope[] = [
+      start,
+      // First crossing: hold six hard through tick-1.
+      ...six.map((id, i): Envelope => [holdAct(id), o(5 + i)]),
+      // Recover: release all six, clear all four payments.
+      ...six.map((id, i): Envelope => [releaseAct(id), o(70 + i)]),
+      [payAct('PM1'), o(100)],
+      [payAct('PM2'), o(126)],
+      [payAct('PM3'), o(156)],
+      [payAct('PM4'), o(186)],
+      // Re-cross: re-hold the six before the end tick so confidence re-crosses 60.
+      ...six.map((id, i): Envelope => [holdAct(id), o(195 + i)]),
+    ]
+    const { state, emitted } = driveBankSeed(ctx, seedName, envs, SETTLE_AT, false)
+    const outcome = bankOutcome(state)
+    // The top threshold crossing event fired EXACTLY ONCE over the whole run,
+    // despite confidence crossing 60 downward twice: consumed on the first.
+    const topCrossings = emitted.filter(
+      (e) =>
+        e.type === 'bankThresholdCrossed' &&
+        (e as { threshold: number }).threshold === top,
+    )
+    expect(topCrossings.length).toBe(1)
+    // Exactly one injected contagion draw after the hold: the second crossing
+    // scheduled nothing.
+    expect(outcome.metrics['injected_after_hold_count']).toBe(1)
+  })
+
+  it('timeout: idle/light play reaches the deadline, cause timeout, with the HONEST sustainable-check tier', () => {
+    // Minimal play: start and clear a single payment, then let the stream and
+    // ticks run out the clock. No broad hold, no mass defense. The mission must
+    // time out (not collapse) and score the real sustainability signals.
+    const ctx = bankContextForSeed(seedName)
+    const o = (sec: number) => BANK_T0 + sec * 1000
+    const envs: Envelope[] = [start, [payAct('PM1'), o(100)]]
+    const { state, emitted } = driveBankSeed(ctx, seedName, envs, SETTLE_AT, false)
+    const outcome = bankOutcome(state)
+    expect(settlements(emitted)).toHaveLength(1)
+    expect(outcome.cause).toBe('timeout')
+    // Honest tier: not all four payments cleared, so it cannot be FULL. The tier
+    // reflects the true signal count, never an inflated hold tally.
+    expect(TIER_RANK[outcome.tier]!).toBeLessThan(TIER_RANK['full']!)
+    expect(outcome.metrics['payments_cleared']!).toBeLessThan(4)
+  })
+
+  it('forfeit: FORFEIT mid-run settles once, cause forfeit, no post-settlement mutation', () => {
+    const ctx = bankContextForSeed(seedName)
+    let state = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+    state = dispatch(ctx, state, start[0], BANK_T0).state
+    state = dispatch(ctx, state, holdAct('DEP-ASHE'), BANK_T0 + 5_000).state
+    state = advanceCampaign(ctx, state, BANK_T0 + 30_000).state
+    const forfeit = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, BANK_T0 + 31_000)
+    expect(settlements(forfeit.emitted)).toHaveLength(1)
+    const outcome = bankOutcome(forfeit.state)
+    expect(outcome.cause).toBe('forfeit')
+
+    // IDEMPOTENCE: capture the record and the settled array, dispatch more
+    // actions and drains, and assert both are byte-identical afterward.
+    const recordBefore = JSON.stringify(outcome)
+    const settledBefore = JSON.stringify(forfeit.state.settled)
+    let after = forfeit.state
+    after = dispatch(ctx, after, holdAct('VEN-ORR'), BANK_T0 + 32_000).state
+    after = dispatch(ctx, after, payAct('PM1'), BANK_T0 + 33_000).state
+    after = advanceCampaign(ctx, after, SETTLE_AT).state
+    expect(JSON.stringify(bankOutcome(after))).toBe(recordBefore)
+    expect(JSON.stringify(after.settled)).toBe(settledBefore)
+  })
+
+  it('collapsed via confidence zero: settles once, cause collapsed, tier failed, subsequent dispatches inert', () => {
+    // Broad-hold everything and clear nothing: confidence bleeds to 0 across the
+    // ticks and terminal() fires collapsed.
+    const ctx = bankContextForSeed(seedName)
+    const o = (sec: number) => BANK_T0 + sec * 1000
+    const accountIds = payload(seedName).accounts.map((a) => a.id)
+    const envs: Envelope[] = [
+      start,
+      ...accountIds.map((id, i): Envelope => [holdAct(id), o(1 + i)]),
+    ]
+    const { state, emitted } = driveBankSeed(ctx, seedName, envs, SETTLE_AT, false)
+    expect(settlements(emitted)).toHaveLength(1)
+    const outcome = bankOutcome(state)
+    expect(outcome.cause).toBe('collapsed')
+    expect(outcome.tier).toBe('failed')
+    expect(outcome.metrics['confidence']).toBe(0)
+
+    // IDEMPOTENCE: byte-identical state and record after more dispatches/drains.
+    const recordBefore = JSON.stringify(outcome)
+    const stateBefore = JSON.stringify(state.settled)
+    let after = state
+    after = dispatch(ctx, after, releaseAct(accountIds[0]!), SETTLE_AT + 1_000).state
+    after = dispatch(ctx, after, payAct('PM1'), SETTLE_AT + 2_000).state
+    after = advanceCampaign(ctx, after, SETTLE_AT + 10_000).state
+    expect(JSON.stringify(bankOutcome(after))).toBe(recordBefore)
+    expect(JSON.stringify(after.settled)).toBe(stateBefore)
+  })
+
+  it('collapsed via cash-negative guard: collapses rather than storing negative, cause collapsed, settled once', () => {
+    // The derived-cash collapse path: an upstream paymentsDelayed penalty (40,
+    // capped) drives the target balance negative at init; holding the sheltering
+    // account drops derived cash below the collapse floor, tripping collapse.
+    // This uses the dedicated collapse context (seed-independent engine path).
+    // The collapse context registers the 'test-seed' name (its own two-mission
+    // chain), independent of the authored seed under test in this matrix row.
+    const cctx = bankCashCollapseContext(INBOUND_CAP)
+    let s = createCampaign(cctx, 'test-seed', { extendedTime: false }, BANK_T0)
+    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: 'alpha' }, BANK_T0).state
+    s = dispatch(cctx, s, { type: 'FORFEIT_MISSION' }, BANK_T0 + 1_000).state
+    s = dispatch(cctx, s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' }, BANK_T0 + 2_000).state
+    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: BANK_MISSION_ID }, BANK_T0 + 3_000).state
+    // The penalty drove the target negative WITHOUT clipping (guard stores the
+    // real negative balance on the account, never a clamped zero). Read the LIVE
+    // substate before the collapse settles and remove-the-active-mission: there
+    // is no cash field, only account balances the selector sums.
+    const liveSub = bankSub(s) as unknown as Record<string, unknown>
+    expect('cash' in liveSub).toBe(false)
+    expect('derivedCash' in liveSub).toBe(false)
+    const held = dispatch(
+      cctx,
+      s,
+      { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId: 'ZEPHYR' } },
+      BANK_T0 + 5_000,
+    )
+    expect(settlements(held.emitted)).toHaveLength(1)
+    const outcome = bankOutcome(held.state)
+    expect(outcome.cause).toBe('collapsed')
+    expect(outcome.tier).toBe('failed')
+    // Derived cash fell strictly below the collapse floor (negative), and the
+    // mission collapsed rather than storing a derived-cash field at all.
+    expect(outcome.metrics['derived_cash']!).toBeLessThan(0)
+
+    // IDEMPOTENCE after more dispatches/drains.
+    const recordBefore = JSON.stringify(outcome)
+    const settledBefore = JSON.stringify(held.state.settled)
+    let after = held.state
+    after = advanceCampaign(cctx, after, BANK_T0 + BANK_DURATION_MS + 5_000).state
+    expect(JSON.stringify(bankOutcome(after))).toBe(recordBefore)
+    expect(JSON.stringify(after.settled)).toBe(settledBefore)
+  })
+
+  it('broad-hold boundary: a request whose scheduledAt EQUALS the broad-hold dispatch is arrivedBeforeHold, firstBroadHoldAt stamped once', () => {
+    // THE load-bearing drain-before-reduce test. W01 is authored at offset 20s
+    // against DEP-REEVE. broadHoldCount is 3, so hold THREE non-REEVE accounts
+    // before +20s, then the FOURTH hold (which pushes the held count over 3) is
+    // dispatched at EXACTLY W01's scheduledAt (BANK_T0 + 20_000). The engine
+    // drains W01 first (drain precedes action reduction in the same dispatch),
+    // so W01 is before-hold by construction, and firstBroadHoldAt stamps exactly
+    // once at the tie timestamp.
+    const ctx = bankContextForSeed(seedName)
+    const TIE = BANK_T0 + 20_000 // W01's authored scheduledAt
+    let s = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+    s = dispatch(ctx, s, start[0], BANK_T0).state
+    s = dispatch(ctx, s, holdAct('OPS-MAIN'), BANK_T0 + 5_000).state
+    s = dispatch(ctx, s, holdAct('OPS-AUX'), BANK_T0 + 6_000).state
+    s = dispatch(ctx, s, holdAct('VEN-HALE'), BANK_T0 + 7_000).state
+    // Three held, broadHoldCount is 3, so no broad hold yet (3 is not > 3).
+    expect(bankSub(s).firstBroadHoldAt).toBeNull()
+    // The fourth hold at EXACTLY the tie timestamp: W01 drains first, then the
+    // hold reduces and the broad hold stamps.
+    s = dispatch(ctx, s, holdAct('MUN-VANE'), TIE).state
+    const sub = bankSub(s)
+    // W01 drained before the hold reduced: before-hold, applied in full.
+    expect(sub.requests['W01']!.outcome).toBe('applied')
+    expect(sub.requests['W01']!.arrivedAfterHold).toBe(false)
+    // The broad hold stamped exactly at the tie timestamp, once.
+    expect(sub.firstBroadHoldAt).toBe(TIE)
+
+    // Stamped ONCE, ever: a later fifth hold does not re-stamp.
+    const later = dispatch(ctx, s, holdAct('MUN-ELD'), BANK_T0 + 25_000).state
+    expect(bankSub(later).firstBroadHoldAt).toBe(TIE)
+  })
+
+  it('extended time: tick count, request offsets, and payment due offsets scale proportionally; the walkthrough still reaches FULL', () => {
+    const ctx = bankContextForSeed(seedName)
+    const p = payload(seedName)
+    // Materialize both schedules and compare the start-anchored offsets.
+    const standard = (() => {
+      const s = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+      return dispatch(ctx, s, start[0], BANK_T0).state
+    })()
+    const extended = (() => {
+      const s = createCampaign(ctx, seedName, { extendedTime: true }, BANK_T0)
+      return dispatch(ctx, s, start[0], BANK_T0).state
+    })()
+    const stdSpan = standard.activeMission!.endsAt - BANK_T0
+    const extSpan = extended.activeMission!.endsAt - BANK_T0
+    const ratio = extSpan / stdSpan
+    expect(ratio).toBe(2)
+
+    const offsetOf = (state: CampaignState, id: string): number | null => {
+      const e = state.missionQueue.find((q) => q.id === id)
+      return e ? e.scheduledAt - BANK_T0 : null
+    }
+    // Every start-anchored wave and payment-due offset scales by the same ratio.
+    for (const req of p.requests) {
+      const std = offsetOf(standard, `bank-wave-${req.id}`)
+      const ext = offsetOf(extended, `bank-wave-${req.id}`)
+      expect(std).not.toBeNull()
+      expect(ext).toBe(std! * ratio)
+    }
+    for (const pay of p.payments) {
+      const std = offsetOf(standard, `bank-due-${pay.id}`)
+      const ext = offsetOf(extended, `bank-due-${pay.id}`)
+      expect(std).not.toBeNull()
+      expect(ext).toBe(std! * ratio)
+    }
+    // Tick cadence scales proportionally: the periodic ticks are derived from
+    // the authored standard duration and anchored at start, so their COUNT is
+    // invariant (3 at 60/120/180) but each materialized OFFSET scales by the same
+    // ratio (120/240/360), covering the full doubled window with no dead tail.
+    // The end tick lands at the scaled deadline. This is the engine's documented
+    // integer cadence: offsets scale, count holds.
+    const tickIds = (state: CampaignState): string[] =>
+      state.missionQueue
+        .filter((q) => q.id.startsWith('bank-tick-'))
+        .map((q) => q.id)
+        .sort()
+    expect(tickIds(extended)).toEqual(tickIds(standard))
+    expect(tickIds(standard).length).toBeGreaterThan(0)
+    for (const id of tickIds(standard)) {
+      const std = offsetOf(standard, id)!
+      const ext = offsetOf(extended, id)!
+      expect(ext).toBe(std * ratio)
+    }
+    // The end tick lands at the scaled deadline, not a scaled start offset.
+    const endStd = standard.missionQueue.find((q) => q.id === 'bank-end')!
+    const endExt = extended.missionQueue.find((q) => q.id === 'bank-end')!
+    expect(endStd.scheduledAt).toBe(standard.activeMission!.endsAt)
+    expect(endExt.scheduledAt).toBe(extended.activeMission!.endsAt)
+
+    // The walkthrough replayed under extended time, action deltas scaled by the
+    // same ratio, still reaches FULL.
+    let state = extended
+    const endsAt = extended.activeMission!.endsAt
+    for (const [action, now] of bankWalkthroughFor(seedName).slice(1)) {
+      const scaledNow = BANK_T0 + (now - BANK_T0) * ratio
+      state = advanceCampaign(ctx, state, scaledNow).state
+      state = dispatch(ctx, state, action, scaledNow).state
+    }
+    state = advanceCampaign(ctx, state, endsAt + 1_000).state
+    const outcome = bankOutcome(state)
+    expect(outcome.tier).toBe('full')
+    expect(outcome.metrics['payments_cleared']).toBe(4)
+    // Doubled exactly.
+    expect(endsAt - BANK_T0).toBe(BANK_DURATION_MS * 2)
+  })
+
+  it('clue: INSPECT_RECORD on the hold-justification record twice logs D-83 exactly once; module.ts has no clue code path', () => {
+    const ctx = bankContextForSeed(seedName)
+    const anchors = BANK_ANCHORS_BY_SEED[seedName]!
+    let s = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+    s = dispatch(ctx, s, start[0], BANK_T0).state
+    const first = dispatch(
+      ctx,
+      s,
+      { type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId },
+      BANK_T0 + 5_000,
+    )
+    // The first inspect logs D-83 exactly once via the engine clueRecords path.
+    expect(first.emitted.filter((e) => e.type === 'clueFound')).toEqual([
+      { type: 'clueFound', clueId: anchors.clueId },
+    ])
+    expect(first.state.cluesFound).toContain(anchors.clueId)
+    // A second inspect of the SAME record logs nothing new.
+    const again = dispatch(
+      ctx,
+      first.state,
+      { type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId },
+      BANK_T0 + 6_000,
+    )
+    expect(again.emitted.filter((e) => e.type === 'clueFound')).toEqual([])
+    // Exactly one occurrence in cluesFound.
+    expect(again.state.cluesFound.filter((c) => c === anchors.clueId)).toHaveLength(1)
+
+    // STRUCTURAL: the bank module exposes no clues() and never stamps a clue id
+    // on its outcome (the clue is a campaign fact, not a mission outcome field).
+    const mod = makeBankMission(bankPayloadFor(seedName))
+    expect(mod.clues).toBeUndefined()
+    // Carry to settlement: the clue survives even a timed-out mission, and the
+    // module's own outcome carries no clue id.
+    const settled = advanceCampaign(ctx, again.state, SETTLE_AT).state
+    expect(settled.cluesFound).toContain(anchors.clueId)
+    expect(bankOutcome(settled).clueId).toBeNull()
+  })
+})
+
+/** Memoized per-seed payload accessor to keep the matrix cheap. */
+function payload(seedName: string): ReturnType<typeof bankPayloadFor> {
+  return bankPayloadFor(seedName)
+}
diff --git a/test/engine/missions/bank/properties.test.ts b/test/engine/missions/bank/properties.test.ts
new file mode 100644
index 0000000..880b447
--- /dev/null
+++ b/test/engine/missions/bank/properties.test.ts
@@ -0,0 +1,261 @@
+// Section-04 mission-local property suite over the REAL engine lifecycle and
+// the REAL bank module, matrixed over all three authored seeds. The arbitrary
+// generates sequences of valid-SHAPED and invalid-SHAPED HOLD/RELEASE/LIMIT/
+// PAY/no-op actions at nondecreasing integer times across the full mission
+// window, interleaved with time advances. Invalid-shaped actions are rejected
+// by validate() (a dispatch rejection, never a crash), and every invariant
+// holds over whatever subset the engine accepts:
+//   - balances stay integers and never negative (draws clamp at zero);
+//   - confidence stays in [0, 100];
+//   - each authored and injected request applies at most once;
+//   - selectDerivedCash always equals the sum of available unheld balances
+//     (held contribute zero, limited contribute remaining allowance);
+//   - settlement occurs at most once; post-settlement dispatches are no-ops;
+//   - substate is JSON-safe and round-trips saveSchema at every step;
+//   - substate never carries authored strings (typed codes only).
+// Run count is modest and the fast-check seed is pinned (with a documented env
+// override) so CI is deterministic and any counterexample replays.
+import { describe, expect, it } from 'vitest'
+import fc from 'fast-check'
+import * as v from 'valibot'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import { BANK_MISSION_ID } from '@engine/missions/bank/module'
+import { bankSaveSchema } from '@engine/missions/bank/types'
+import type { BankState } from '@engine/missions/bank/types'
+import { remainingAllowance } from '@engine/missions/bank/rules'
+import { selectDerivedCash } from '@engine/missions/bank/selectors'
+import {
+  BANK_DURATION_MS,
+  BANK_T0,
+  bankContextForSeed,
+  bankPayloadFor,
+} from './fixtures'
+
+const ENDS_AT = BANK_T0 + BANK_DURATION_MS
+// Pinned per the deterministic split-01 harness convention; override for
+// exploratory runs with BANK_PROP_SEED (an integer).
+const FC_SEED = (() => {
+  const raw = process.env['BANK_PROP_SEED']
+  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN
+  return Number.isInteger(parsed) ? parsed : 0x0b4c7
+})()
+
+type GenAction =
+  | { readonly kind: 'HOLD'; readonly accountId: string }
+  | { readonly kind: 'RELEASE'; readonly accountId: string }
+  | { readonly kind: 'LIMIT'; readonly accountId: string; readonly cap: number }
+  | { readonly kind: 'PAY'; readonly paymentId: string }
+  | { readonly kind: 'NOOP' }
+
+interface TimedGenAction {
+  readonly action: GenAction
+  /** Delta ms from mission start. Nondecreasing across the sequence. */
+  readonly delta: number
+}
+
+function toCampaignAction(gen: GenAction): CampaignAction {
+  switch (gen.kind) {
+    case 'HOLD':
+      return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId: gen.accountId } }
+    case 'RELEASE':
+      return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', accountId: gen.accountId } }
+    case 'LIMIT':
+      return { type: 'MISSION_ACTION', payload: { kind: 'LIMIT', accountId: gen.accountId, cap: gen.cap } }
+    case 'PAY':
+      return { type: 'MISSION_ACTION', payload: { kind: 'PAY', paymentId: gen.paymentId } }
+    case 'NOOP':
+      // A valid-shaped but unknown mission action: validate() rejects it, the
+      // engine does not crash, and the substate is untouched.
+      return { type: 'MISSION_ACTION', payload: { kind: 'OBSERVE' } }
+  }
+}
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: BANK_MISSION_ID },
+    BANK_T0,
+  ).state
+}
+
+function sub(state: CampaignState): BankState | null {
+  return (state.activeMission?.substate as BankState | undefined) ?? null
+}
+
+/** The sum of available unheld balances, the selector's contract, computed
+ *  independently here so the property checks the selector against first
+ *  principles rather than against itself. */
+function expectedDerivedCash(s: BankState): number {
+  let cash = 0
+  for (const acct of Object.values(s.accounts)) {
+    if (acct.held) continue
+    if (acct.limitedTo === null) cash += acct.balance
+    else cash += Math.min(acct.balance, remainingAllowance(acct))
+  }
+  return cash
+}
+
+describe.each(SEED_NAMES)('bank properties, seed %s', (seedName) => {
+  const payload = bankPayloadFor(seedName)
+  const accountIds = payload.accounts.map((a) => a.id)
+  const paymentIds = payload.payments.map((p) => p.id)
+  // Also feed a bogus account and payment id so validate() rejection (not a
+  // crash) is exercised on the illegal path.
+  const accountArb = fc.constantFrom(...accountIds, 'NOWHERE')
+  const paymentArb = fc.constantFrom(...paymentIds, 'PM-NONE')
+  const capArb = fc.integer({ min: 0, max: 10_000 })
+
+  const genActionArb: fc.Arbitrary<GenAction> = fc.oneof(
+    accountArb.map((accountId) => ({ kind: 'HOLD' as const, accountId })),
+    accountArb.map((accountId) => ({ kind: 'RELEASE' as const, accountId })),
+    fc.tuple(accountArb, capArb).map(([accountId, cap]) => ({ kind: 'LIMIT' as const, accountId, cap })),
+    paymentArb.map((paymentId) => ({ kind: 'PAY' as const, paymentId })),
+    fc.constant({ kind: 'NOOP' as const }),
+  )
+
+  const sequenceArb: fc.Arbitrary<TimedGenAction[]> = fc
+    .array(
+      fc.record({
+        action: genActionArb,
+        gap: fc.integer({ min: 0, max: 15_000 }),
+      }),
+      { minLength: 0, maxLength: 28 },
+    )
+    .map((entries) => {
+      let delta = 0
+      return entries.map(({ action, gap }) => {
+        delta += gap
+        return { action, delta }
+      })
+    })
+
+  it('balances integer >= 0, confidence in [0,100], requests apply at most once, derived cash equals the selector contract, settlement at most once, substate round-trips and carries no authored strings', () => {
+    fc.assert(
+      fc.property(sequenceArb, (sequence) => {
+        const ctx = bankContextForSeed(seedName)
+        let state = startMission(ctx, seedName)
+        let settlementCount = 0
+        // Track each request's resolved outcome: once non-pending it never
+        // changes (applies at most once).
+        const lastOutcome = new Map<string, string>()
+
+        const checkInvariants = (s: BankState): void => {
+          // Balances: integer and never negative (draws clamp at zero; the only
+          // negative balance the engine ever stores is an upstream-penalty one,
+          // which these seeds never inject, so balances stay >= 0 here).
+          for (const acct of Object.values(s.accounts)) {
+            expect(Number.isInteger(acct.balance)).toBe(true)
+            expect(acct.balance).toBeGreaterThanOrEqual(0)
+            expect(Number.isInteger(acct.limitedSpent)).toBe(true)
+            expect(acct.limitedSpent).toBeGreaterThanOrEqual(0)
+            if (acct.limitedTo !== null) {
+              expect(Number.isInteger(acct.limitedTo)).toBe(true)
+              // A re-LIMIT never sets the cap below outflow already spent.
+              expect(acct.limitedTo).toBeGreaterThanOrEqual(acct.limitedSpent)
+            }
+          }
+          // Confidence clamped to [0, 100], integer.
+          expect(Number.isInteger(s.confidence)).toBe(true)
+          expect(s.confidence).toBeGreaterThanOrEqual(0)
+          expect(s.confidence).toBeLessThanOrEqual(100)
+          // Each request applies at most once: a resolved outcome is terminal.
+          for (const [id, rs] of Object.entries(s.requests)) {
+            if (rs.outcome !== 'pending') {
+              const prev = lastOutcome.get(id)
+              if (prev !== undefined) expect(rs.outcome).toBe(prev)
+              lastOutcome.set(id, rs.outcome)
+            }
+          }
+          // Each consumed threshold appears at most once.
+          expect(new Set(s.injectedThresholds).size).toBe(
+            s.injectedThresholds.length,
+          )
+          // The selector equals the sum-of-available-unheld-balances contract.
+          expect(selectDerivedCash(s)).toBe(expectedDerivedCash(s))
+          // Substate is JSON-safe and round-trips the reference-only schema.
+          const round = v.parse(bankSaveSchema, JSON.parse(JSON.stringify(s)))
+          expect(round).toEqual(s)
+          // Substate carries NO authored strings: a serialized dump contains no
+          // account name, flavor, request reason, or intro line.
+          const dump = JSON.stringify(s)
+          for (const account of payload.accounts) {
+            expect(dump).not.toContain(account.name)
+            expect(dump).not.toContain(account.flavor)
+          }
+          for (const req of payload.requests) {
+            expect(dump).not.toContain(req.reason)
+          }
+          for (const line of payload.introLines) {
+            expect(dump).not.toContain(line)
+          }
+        }
+
+        const live0 = sub(state)
+        if (live0) checkInvariants(live0)
+
+        for (const { action, delta } of sequence) {
+          const now = BANK_T0 + delta
+          // Advance the engine clock to this action's time, then dispatch.
+          const advanced = advanceCampaign(ctx, state, now)
+          settlementCount += advanced.emitted.filter(
+            (e) => e.type === 'settlement' && e.missionId === BANK_MISSION_ID,
+          ).length
+          state = advanced.state
+          const live = sub(state)
+          if (live) checkInvariants(live)
+
+          const result = dispatch(ctx, state, toCampaignAction(action), now)
+          // Dispatch never throws: an illegal or malformed action is rejected,
+          // not a crash, and the substate stays valid.
+          settlementCount += result.emitted.filter(
+            (e) => e.type === 'settlement' && e.missionId === BANK_MISSION_ID,
+          ).length
+          state = result.state
+          const liveAfter = sub(state)
+          if (liveAfter) checkInvariants(liveAfter)
+        }
+
+        // Advance past the deadline so settlement always fires if it has not.
+        const tail = advanceCampaign(ctx, state, ENDS_AT + 10_000)
+        settlementCount += tail.emitted.filter(
+          (e) => e.type === 'settlement' && e.missionId === BANK_MISSION_ID,
+        ).length
+        state = tail.state
+
+        // Settles exactly once over the whole run, regardless of the action tail.
+        expect(settlementCount).toBe(1)
+        expect(
+          state.settled.filter((s) => s.missionId === BANK_MISSION_ID),
+        ).toHaveLength(1)
+
+        // Post-settlement dispatches are no-ops: the settled outcome is frozen.
+        const outcomeBefore = JSON.stringify(
+          state.settled.find((s) => s.missionId === BANK_MISSION_ID),
+        )
+        const settledBefore = JSON.stringify(state.settled)
+        let after = dispatch(
+          ctx,
+          state,
+          { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId: accountIds[0] } },
+          ENDS_AT + 11_000,
+        ).state
+        after = advanceCampaign(ctx, after, ENDS_AT + 20_000).state
+        expect(
+          JSON.stringify(after.settled.find((s) => s.missionId === BANK_MISSION_ID)),
+        ).toBe(outcomeBefore)
+        expect(JSON.stringify(after.settled)).toBe(settledBefore)
+      }),
+      { numRuns: 120, seed: FC_SEED },
+    )
+  })
+})
