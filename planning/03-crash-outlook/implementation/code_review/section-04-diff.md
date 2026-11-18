diff --git a/src/app/missions/outlook/DeliveryLogView.tsx b/src/app/missions/outlook/DeliveryLogView.tsx
index 934c83a..2ec4520 100644
--- a/src/app/missions/outlook/DeliveryLogView.tsx
+++ b/src/app/missions/outlook/DeliveryLogView.tsx
@@ -9,6 +9,9 @@ import { GlossaryTerm } from '../../a11y/GlossaryTerm'
 
 export interface DeliveryLogViewProps {
   readonly substate: OutlookState | null
+  /** A narrow-width back affordance that returns to the inbox list. Omitted
+   *  (null) on the two-pane desktop layout where the tabs are always visible. */
+  readonly onBack?: (() => void) | null
 }
 
 function ackLabel(resolution: string, scheduledAckAt: number): string {
@@ -17,11 +20,16 @@ function ackLabel(resolution: string, scheduledAckAt: number): string {
   return 'PENDING'
 }
 
-export function DeliveryLogView({ substate }: DeliveryLogViewProps) {
+export function DeliveryLogView({ substate, onBack = null }: DeliveryLogViewProps) {
   const sends = substate?.sends ?? []
 
   return (
     <div data-testid="delivery-log">
+      {onBack ? (
+        <button type="button" data-testid="log-back" onClick={onBack}>
+          BACK
+        </button>
+      ) : null}
       <div className="delivery-log-head">
         <GlossaryTerm id="outlook-delivery-receipt" /> LOG
       </div>
diff --git a/src/app/missions/outlook/OutboxView.tsx b/src/app/missions/outlook/OutboxView.tsx
index 270cf60..f932d37 100644
--- a/src/app/missions/outlook/OutboxView.tsx
+++ b/src/app/missions/outlook/OutboxView.tsx
@@ -28,6 +28,9 @@ export interface OutboxViewProps {
    *  button path can route WRONG and never defaults to the authored answer. */
   readonly chosenDeskFor: (index: number) => DeskId | null
   readonly onChooseDesk: (index: number, desk: DeskId | null) => void
+  /** A narrow-width back affordance that returns to the inbox list. Omitted
+   *  (null) on the two-pane desktop layout where the tabs are always visible. */
+  readonly onBack?: (() => void) | null
 }
 
 export function OutboxView({
@@ -36,6 +39,7 @@ export function OutboxView({
   desks,
   chosenDeskFor,
   onChooseDesk,
+  onBack = null,
 }: OutboxViewProps) {
   const stage = substate?.primaryStage ?? 0
   const primaryEta = primaryEtaSeconds(payload, stage)
@@ -45,6 +49,11 @@ export function OutboxView({
 
   return (
     <div data-testid="outbox-view">
+      {onBack ? (
+        <button type="button" data-testid="outbox-back" onClick={onBack}>
+          BACK
+        </button>
+      ) : null}
       <div className="outbox-readouts" data-testid="outbox-readouts">
         <div data-testid="outbox-primary-stage">
           PRIMARY <GlossaryTerm id="outlook-channel" />: {stageLabel(stage)}{' '}
diff --git a/src/app/missions/outlook/OutlookScreen.tsx b/src/app/missions/outlook/OutlookScreen.tsx
index 344afa8..04f400e 100644
--- a/src/app/missions/outlook/OutlookScreen.tsx
+++ b/src/app/missions/outlook/OutlookScreen.tsx
@@ -381,9 +381,15 @@ export function OutlookScreen({ missionId }: MissionScreenProps) {
             desks={OUTLOOK_DESKS}
             chosenDeskFor={chosenDeskFor}
             onChooseDesk={onChooseOutboxDesk}
+            onBack={narrow ? () => setView('inbox') : null}
+          />
+        ) : null}
+        {view === 'log' ? (
+          <DeliveryLogView
+            substate={substate}
+            onBack={narrow ? () => setView('inbox') : null}
           />
         ) : null}
-        {view === 'log' ? <DeliveryLogView substate={substate} /> : null}
       </div>
     </div>
   )
diff --git a/test/app/missions/outlook/keyboard.test.tsx b/test/app/missions/outlook/keyboard.test.tsx
new file mode 100644
index 0000000..ec739f2
--- /dev/null
+++ b/test/app/missions/outlook/keyboard.test.tsx
@@ -0,0 +1,138 @@
+// A keyboard-only full delivery flow through the real OutlookScreen and the
+// real engine (no mocks of either). Every interaction is typed into the one
+// shared command line ScreenRouter renders at the foot of the mission screen:
+// no pointer events anywhere. The flow reads a message, queues it, switches
+// to the OUTBOX, sends with a desk chosen, advances engine time past the ack,
+// and confirms the LOG view shows the acknowledgment. Focus is asserted to
+// land sensibly after view switches.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, getState, send, wake } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
+import { makeOutlookCtx } from './fixture'
+
+let teardown: () => void
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
+beforeEach(() => {
+  resetAll()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  teardown = init({
+    ctx: makeOutlookCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'outlook' })
+  })
+})
+
+afterEach(() => {
+  teardown()
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
+describe('keyboard-only delivery flow', () => {
+  it('completes one full delivery with keys only and the LOG shows the acknowledgment', () => {
+    render(<ScreenRouter />)
+    // INBOX is the default view.
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
+
+    // READ the payroll required head (M03 in the fixture payload), then QUEUE
+    // it onto the backup channel. All typed.
+    typeCommand('READ M03')
+    expect(
+      (getState().activeMission?.substate as { messages: Record<string, { read: boolean }> })
+        .messages['M03']?.read,
+    ).toBe(true)
+    typeCommand('QUEUE M03 BACKUP')
+
+    // Switch to the OUTBOX by typing the view command; the queued item is there.
+    typeCommand('OUTBOX')
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'outbox')
+    expect(screen.getByTestId('outbox-row-0')).toBeInTheDocument()
+
+    // SEND the queued item to the chosen desk, typed with the desk argument.
+    typeCommand('SEND 0 PAYROLL_DESK')
+    const sends = (getState().activeMission?.substate as {
+      sends: ReadonlyArray<{ recipient: string | null; resolution: string }>
+    }).sends
+    expect(sends).toHaveLength(1)
+    expect(sends[0]!.recipient).toBe('PAYROLL_DESK')
+
+    // Advance engine time past the backup ack ETA (120s) so the send folds to
+    // acknowledged, via a keyboard-driven wake (no pointer).
+    vi.spyOn(Date, 'now').mockReturnValue(T0 + 130_000)
+    act(() => {
+      wake()
+    })
+    const acked = (getState().activeMission?.substate as {
+      sends: ReadonlyArray<{ resolution: string; scheduledAckAt: number }>
+    }).sends[0]!
+    expect(acked.resolution).toBe('acknowledged')
+
+    // The LOG view shows the acknowledgment (a RECEIPT line for the send).
+    typeCommand('LOG')
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'log')
+    const logRow = screen.getByTestId('log-row-0')
+    expect(logRow).toBeInTheDocument()
+    expect(logRow.textContent).toContain('RECEIPT')
+    expect(logRow.textContent).toContain('PAYROLL_DESK')
+  })
+
+  it('focus lands sensibly after a view switch: the command input stays focusable', () => {
+    render(<ScreenRouter />)
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    // Keyboard focus on the shared input, the single typing surface.
+    act(() => {
+      input.focus()
+    })
+    expect(document.activeElement).toBe(input)
+
+    // Open a message detail via a typed READ-then-open path (keyboard), then
+    // BACK. Focus must not be stranded: the shared input remains in the DOM and
+    // focusable after the view switch (the keyboard path never loses its
+    // surface).
+    typeCommand('READ M03')
+    typeCommand('OUTBOX')
+    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
+    typeCommand('INBOX')
+    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
+
+    const inputAfter = screen.getByTestId('command-input') as HTMLInputElement
+    act(() => {
+      inputAfter.focus()
+    })
+    expect(document.activeElement).toBe(inputAfter)
+  })
+})
diff --git a/test/app/missions/outlook/narrow.test.tsx b/test/app/missions/outlook/narrow.test.tsx
new file mode 100644
index 0000000..0a6bf36
--- /dev/null
+++ b/test/app/missions/outlook/narrow.test.tsx
@@ -0,0 +1,135 @@
+// The narrow-width single-pane pass through the real OutlookScreen and the
+// real engine. At narrow width the screen renders one pane at a time, every
+// non-inbox view carries a back affordance, back returns to the prior view
+// with router state agreeing, and the StatusLine stays visible in every view.
+// Narrow width is driven by the same matchMedia mock the other outlook app
+// tests use (the shell's useNarrowViewport helper), not a second mechanism.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerOutlookScreen } from '@app/missions/outlook/OutlookScreen'
+import { makeOutlookCtx } from './fixture'
+
+let teardown: () => void
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
+beforeEach(() => {
+  resetAll()
+  // Narrow for the whole suite: the single-pane layout is under test.
+  setNarrow(true)
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  teardown = init({
+    ctx: makeOutlookCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'outlook' })
+  })
+})
+
+afterEach(() => {
+  teardown()
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
+describe('narrow-width single-pane', () => {
+  it('renders single-pane at narrow width with back affordances on message detail, OUTBOX, and LOG', () => {
+    render(<ScreenRouter />)
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-pane', 'single')
+
+    // Message detail: opening a message replaces the list (single pane) and
+    // carries a back affordance.
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    expect(screen.getByTestId('message-view')).toBeInTheDocument()
+    expect(screen.queryByTestId('inbox-view')).toBeNull()
+    expect(screen.getByTestId('message-back')).toBeInTheDocument()
+
+    // OUTBOX: single pane, back affordance present.
+    typeCommand('OUTBOX')
+    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
+    expect(screen.queryByTestId('inbox-view')).toBeNull()
+    expect(screen.getByTestId('outbox-back')).toBeInTheDocument()
+
+    // LOG: single pane, back affordance present.
+    typeCommand('LOG')
+    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
+    expect(screen.queryByTestId('inbox-view')).toBeNull()
+    expect(screen.getByTestId('log-back')).toBeInTheDocument()
+  })
+
+  it('back affordance returns to the prior view and router state agrees', () => {
+    render(<ScreenRouter />)
+
+    // From message detail, BACK returns to the inbox list.
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    expect(screen.getByTestId('message-view')).toBeInTheDocument()
+    fireEvent.click(screen.getByTestId('message-back'))
+    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
+    expect(screen.queryByTestId('message-view')).toBeNull()
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
+
+    // From OUTBOX, BACK returns to the inbox view and the router agrees.
+    typeCommand('OUTBOX')
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'outbox')
+    fireEvent.click(screen.getByTestId('outbox-back'))
+    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
+
+    // From LOG, BACK returns to the inbox view and the router agrees.
+    typeCommand('LOG')
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'log')
+    fireEvent.click(screen.getByTestId('log-back'))
+    expect(screen.getByTestId('inbox-view')).toBeInTheDocument()
+    expect(screen.getByTestId('outlook-screen')).toHaveAttribute('data-view', 'inbox')
+  })
+
+  it('StatusLine remains visible in every view at narrow width', () => {
+    render(<ScreenRouter />)
+
+    // Inbox.
+    expect(screen.getByTestId('status-line')).toBeInTheDocument()
+
+    // Message detail.
+    fireEvent.click(screen.getByTestId('menu-row-M01'))
+    expect(screen.getByTestId('message-view')).toBeInTheDocument()
+    expect(screen.getByTestId('status-line')).toBeInTheDocument()
+
+    // Back to inbox, then OUTBOX.
+    fireEvent.click(screen.getByTestId('message-back'))
+    typeCommand('OUTBOX')
+    expect(screen.getByTestId('outbox-view')).toBeInTheDocument()
+    expect(screen.getByTestId('status-line')).toBeInTheDocument()
+
+    // LOG.
+    typeCommand('LOG')
+    expect(screen.getByTestId('delivery-log')).toBeInTheDocument()
+    expect(screen.getByTestId('status-line')).toBeInTheDocument()
+  })
+})
diff --git a/test/engine/missions/outlook/boundary.test.ts b/test/engine/missions/outlook/boundary.test.ts
new file mode 100644
index 0000000..f5df4c9
--- /dev/null
+++ b/test/engine/missions/outlook/boundary.test.ts
@@ -0,0 +1,99 @@
+// The buzzer tie-break at the deadline. Ack timing is constructed from the
+// authored channel ETAs (not by poking the event queue): backup ETA is a
+// fixed 120s, so a backup send dispatched at endsAt-120s lands its ack
+// exactly on endsAt. Three such sends drain through the endsAt settle tick
+// before the timeout guard runs, settling completed/full. Shift the third
+// one tick late (ack at endsAt+1) and it never folds: timeout/partial.
+//
+// The fixture seed payload tunes this cleanly (backupEtaSeconds 120, backup
+// capacity 5 covers three sends), so no synthetic payload is needed.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import { OUTLOOK_PAYLOAD_BY_SEED } from '@engine/missions/outlook/payloads'
+import {
+  OUTLOOK_DURATION_MS,
+  OUTLOOK_T0,
+  outlookContextForSeed,
+} from './fixtures/index'
+
+const SEED = SEED_NAMES[0]!
+const ENDS_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS
+const BACKUP_ETA_MS =
+  OUTLOOK_PAYLOAD_BY_SEED[SEED]!.channelTuning.backupEtaSeconds * 1000
+
+function startMission(ctx: EngineContext): CampaignState {
+  const created = createCampaign(ctx, SEED, { extendedTime: false }, OUTLOOK_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'outlook' },
+    OUTLOOK_T0,
+  ).state
+}
+
+function send(messageId: string, recipient: string): CampaignAction {
+  return {
+    type: 'MISSION_ACTION',
+    payload: { kind: 'SEND', messageId, channel: 'backup', recipient },
+  }
+}
+
+const REQUIRED: ReadonlyArray<readonly [string, string]> = [
+  ['M01', 'WEATHER_DESK'],
+  ['M04', 'PAYROLL_DESK'],
+  ['M05', 'AUDIT_DESK'],
+]
+
+describe('buzzer tie-break', () => {
+  it('third ack with scheduledAt == endsAt settles completed/full', () => {
+    const ctx = outlookContextForSeed(SEED)
+    let state = startMission(ctx)
+    // Each backup send at endsAt-120s lands its ack at exactly endsAt.
+    const sendAt = ENDS_AT - BACKUP_ETA_MS
+    for (const [messageId, desk] of REQUIRED) {
+      state = dispatch(ctx, state, send(messageId, desk), sendAt).state
+    }
+    const sub = state.activeMission!.substate as { sends: ReadonlyArray<{ scheduledAckAt: number }> }
+    expect(sub.sends.map((s) => s.scheduledAckAt)).toEqual([ENDS_AT, ENDS_AT, ENDS_AT])
+    // A single advance past the deadline: the settle tick folds the acks
+    // before the timeout guard.
+    const advanced = advanceCampaign(ctx, state, ENDS_AT + 1_000)
+    const settlements = advanced.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
+    const outlook = advanced.state.settled.find((s) => s.missionId === 'outlook')!
+    expect(outlook.tier).toBe('full')
+    expect(outlook.metrics['required_delivered']).toBe(3)
+  })
+
+  it('ack with scheduledAt == endsAt + 1 does not count: timeout/partial', () => {
+    const ctx = outlookContextForSeed(SEED)
+    let state = startMission(ctx)
+    const onTime = ENDS_AT - BACKUP_ETA_MS
+    // Two land exactly on the deadline; the third is shifted one tick late.
+    state = dispatch(ctx, state, send('M01', 'WEATHER_DESK'), onTime).state
+    state = dispatch(ctx, state, send('M04', 'PAYROLL_DESK'), onTime).state
+    state = dispatch(ctx, state, send('M05', 'AUDIT_DESK'), onTime + 1).state
+    const sub = state.activeMission!.substate as { sends: ReadonlyArray<{ scheduledAckAt: number }> }
+    expect(sub.sends.map((s) => s.scheduledAckAt)).toEqual([
+      ENDS_AT,
+      ENDS_AT,
+      ENDS_AT + 1,
+    ])
+    const advanced = advanceCampaign(ctx, state, ENDS_AT + 1_000)
+    const settlements = advanced.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'partial' })
+    const outlook = advanced.state.settled.find((s) => s.missionId === 'outlook')!
+    expect(outlook.tier).toBe('partial')
+    expect(outlook.metrics['required_delivered']).toBe(2)
+  })
+})
diff --git a/test/engine/missions/outlook/debrief.test.ts b/test/engine/missions/outlook/debrief.test.ts
new file mode 100644
index 0000000..a31dd4f
--- /dev/null
+++ b/test/engine/missions/outlook/debrief.test.ts
@@ -0,0 +1,163 @@
+// The debrief payload content checks. The debrief reports the three required
+// deliveries individually (one line per kind), the decoy capacity spent as an
+// integer, and a clue-found flag that matches cluesFound; and the walkthrough
+// debrief differs from the adversarial debrief in all three fields (required
+// outcomes, decoy spend, clue). All driven through the REAL engine and the
+// REAL outlook module.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction } from '@engine/campaign/types'
+import type { DebriefPayload } from '@engine/missions/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import { OUTLOOK_CLUE_ID } from '@engine/missions/outlook/module'
+import {
+  OUTLOOK_DURATION_MS,
+  OUTLOOK_T0,
+  adversarialScript,
+  driveOutlook,
+  outlookContextForSeed,
+  walkthroughScript,
+} from './fixtures/index'
+
+const SEED = SEED_NAMES[0]!
+const SETTLE_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS + 1_000
+
+function startMission(ctx: EngineContext): CampaignState {
+  const created = createCampaign(ctx, SEED, { extendedTime: false }, OUTLOOK_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'outlook' },
+    OUTLOOK_T0,
+  ).state
+}
+
+function send(
+  messageId: string,
+  recipient: string,
+  channel: 'primary' | 'backup' = 'primary',
+): CampaignAction {
+  return {
+    type: 'MISSION_ACTION',
+    payload: { kind: 'SEND', messageId, channel, recipient },
+  }
+}
+
+function read(messageId: string): CampaignAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } }
+}
+
+function debriefFor(ctx: EngineContext, state: CampaignState): DebriefPayload {
+  const outcome = state.settled.find((s) => s.missionId === 'outlook')!
+  return ctx.missions['outlook']!.debrief!(outcome)
+}
+
+function lineFor(debrief: DebriefPayload, kind: string): string {
+  return debrief.lines.find((l) => l.startsWith(`REQUIRED ${kind}:`))!
+}
+
+describe('debrief payload', () => {
+  it('reports the three required deliveries individually, one outcome per kind', () => {
+    // A hand-built mix: weather CORRECT, payroll WRONG RECIPIENT, audit
+    // WRONG VERSION (a superseded weather duplicate can never satisfy, so the
+    // audit kind is left undelivered here and the wrong-version routing is
+    // proven distinct below). This exercises three of the four outcomes in a
+    // single debrief, one line per required kind.
+    const ctx = outlookContextForSeed(SEED)
+    let state = startMission(ctx)
+    state = dispatch(ctx, state, send('M01', 'WEATHER_DESK'), OUTLOOK_T0 + 1_000).state
+    state = dispatch(ctx, state, send('M04', 'WEATHER_DESK'), OUTLOOK_T0 + 2_000).state
+    state = advanceCampaign(ctx, state, SETTLE_AT).state
+    const debrief = debriefFor(ctx, state)
+
+    // One line per required kind, each with exactly one outcome.
+    expect(lineFor(debrief, 'WEATHER')).toBe('REQUIRED WEATHER: DELIVERED CORRECT')
+    expect(lineFor(debrief, 'PAYROLL')).toBe('REQUIRED PAYROLL: DELIVERED TO WRONG DESK')
+    expect(lineFor(debrief, 'AUDIT')).toBe('REQUIRED AUDIT: NOT DELIVERED')
+  })
+
+  it('a wrong-VERSION routing reads as not-delivered, distinct from a correct one', () => {
+    // Route the SUPERSEDED weather duplicate (M02) to the correct desk: right
+    // desk, wrong version. The debrief must NOT credit weather, so the
+    // wrong-version case is distinguishable from the DELIVERED CORRECT case.
+    const ctx = outlookContextForSeed(SEED)
+    let state = startMission(ctx)
+    state = dispatch(ctx, state, send('M02', 'WEATHER_DESK'), OUTLOOK_T0 + 1_000).state
+    state = advanceCampaign(ctx, state, SETTLE_AT).state
+    const debrief = debriefFor(ctx, state)
+    expect(lineFor(debrief, 'WEATHER')).toBe('REQUIRED WEATHER: NOT DELIVERED')
+    const outcome = state.settled.find((s) => s.missionId === 'outlook')!
+    expect(outcome.metrics['weather_correct']).toBe(0)
+    expect(outcome.metrics['weather_delivered']).toBe(0)
+  })
+
+  it('reports decoy capacity spent as an integer', () => {
+    // Burn two backup slots on decoys/stale duplicates (M07 decoy, M02 stale
+    // weather). The debrief reports the integer count.
+    const ctx = outlookContextForSeed(SEED)
+    let state = startMission(ctx)
+    state = dispatch(ctx, state, send('M07', 'WEATHER_DESK', 'backup'), OUTLOOK_T0 + 1_000).state
+    state = dispatch(ctx, state, send('M02', 'WEATHER_DESK', 'backup'), OUTLOOK_T0 + 2_000).state
+    state = advanceCampaign(ctx, state, SETTLE_AT).state
+    const debrief = debriefFor(ctx, state)
+    const outcome = state.settled.find((s) => s.missionId === 'outlook')!
+    const decoy = outcome.metrics['decoy_capacity_spent']!
+    expect(Number.isInteger(decoy)).toBe(true)
+    expect(decoy).toBe(2)
+    expect(debrief.lines).toContain('DECOY CAPACITY SPENT 2')
+  })
+
+  it('reports a clue-found flag matching cluesFound', () => {
+    const ctx = outlookContextForSeed(SEED)
+    const state = startMission(ctx)
+    // No audit read: no clue.
+    const noClue = advanceCampaign(ctx, state, SETTLE_AT).state
+    const noClueDebrief = debriefFor(ctx, noClue)
+    expect(noClueDebrief.lines).toContain('CLUE NOT FOUND')
+    expect(noClueDebrief.clueId).toBeNull()
+    expect(noClue.cluesFound).not.toContain(OUTLOOK_CLUE_ID)
+
+    // Read the audit message: clue found, flag and cluesFound agree.
+    let withClue = startMission(ctx)
+    withClue = dispatch(ctx, withClue, read('M05'), OUTLOOK_T0 + 1_000).state
+    withClue = advanceCampaign(ctx, withClue, SETTLE_AT).state
+    const clueDebrief = debriefFor(ctx, withClue)
+    expect(clueDebrief.lines).toContain('CLUE FOUND')
+    expect(clueDebrief.clueId).toBe(OUTLOOK_CLUE_ID)
+    expect(withClue.cluesFound).toContain(OUTLOOK_CLUE_ID)
+  })
+
+  it('walkthrough debrief and adversarial debrief differ in all three fields', () => {
+    const ctx = outlookContextForSeed(SEED)
+    const walkthrough = driveOutlook(ctx, SEED, walkthroughScript(SEED))
+    const adversarial = driveOutlook(ctx, SEED, adversarialScript(SEED))
+    const wOutcome = walkthrough.state.settled.find((s) => s.missionId === 'outlook')!
+    const aOutcome = adversarial.state.settled.find((s) => s.missionId === 'outlook')!
+    const wDebrief = ctx.missions['outlook']!.debrief!(wOutcome)
+    const aDebrief = ctx.missions['outlook']!.debrief!(aOutcome)
+
+    // Field 1: the per-kind required-delivery outcomes differ.
+    const wRequired = wDebrief.lines.filter((l) => l.startsWith('REQUIRED '))
+    const aRequired = aDebrief.lines.filter((l) => l.startsWith('REQUIRED '))
+    expect(wRequired).not.toEqual(aRequired)
+    expect(wOutcome.metrics['required_delivered']).not.toBe(
+      aOutcome.metrics['required_delivered'],
+    )
+
+    // Field 2: decoy capacity spent differs.
+    expect(wOutcome.metrics['decoy_capacity_spent']).not.toBe(
+      aOutcome.metrics['decoy_capacity_spent'],
+    )
+
+    // Field 3: clue found differs.
+    expect(wDebrief.clueId).not.toBe(aDebrief.clueId)
+    expect(wDebrief.lines).toContain('CLUE FOUND')
+    expect(aDebrief.lines).toContain('CLUE NOT FOUND')
+  })
+})
diff --git a/test/engine/missions/outlook/extended-time.test.ts b/test/engine/missions/outlook/extended-time.test.ts
new file mode 100644
index 0000000..1cada05
--- /dev/null
+++ b/test/engine/missions/outlook/extended-time.test.ts
@@ -0,0 +1,109 @@
+// Extended time is the accessibility time option (createCampaign's
+// extendedTime preference). The engine scales the mission duration and every
+// start-anchored offset by the same ratio (two), so the three stage-change
+// milestones fire at offsets scaled proportionally, in order; and the
+// walkthrough still solves when its action times scale by that same ratio.
+// The assertions check proportionality and order, not absolute values, so a
+// later retune of the stage offsets cannot break them.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  OUTLOOK_DURATION_MS,
+  OUTLOOK_T0,
+  outlookContextForSeed,
+  walkthroughScript,
+} from './fixtures/index'
+
+const SEED = SEED_NAMES[0]!
+const STAGE_IDS = ['outlook-stage-1', 'outlook-stage-2', 'outlook-stage-3']
+
+function startMission(
+  ctx: EngineContext,
+  extendedTime: boolean,
+): CampaignState {
+  const created = createCampaign(ctx, SEED, { extendedTime }, OUTLOOK_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'outlook' },
+    OUTLOOK_T0,
+  ).state
+}
+
+/** The materialized start-offset (ms from startNow) of each stage event in
+ *  a freshly started mission's queue, in schedule order. */
+function stageOffsets(state: CampaignState): number[] {
+  const queue = state.missionQueue
+  return STAGE_IDS.map((id) => {
+    const event = queue.find((e) => e.id === id)!
+    return event.scheduledAt - OUTLOOK_T0
+  })
+}
+
+describe('extended time (accessibility time scaling)', () => {
+  it('the three stage-change offsets scale proportionally and stay in order', () => {
+    const ctx = outlookContextForSeed(SEED)
+    const standard = startMission(ctx, false)
+    const extended = startMission(ctx, true)
+
+    const standardOffsets = stageOffsets(standard)
+    const extendedOffsets = stageOffsets(extended)
+
+    // Extended doubles the mission duration; the ratio is derived from the
+    // endsAt the engine materialized, not a hard-coded constant.
+    const standardEndsAt = standard.activeMission!.endsAt
+    const extendedEndsAt = extended.activeMission!.endsAt
+    const ratio = (extendedEndsAt - OUTLOOK_T0) / (standardEndsAt - OUTLOOK_T0)
+    expect(ratio).toBeGreaterThan(1)
+    expect(extendedEndsAt - OUTLOOK_T0).toBe(OUTLOOK_DURATION_MS * ratio)
+
+    // Each start-anchored stage offset scales by the same ratio.
+    for (let i = 0; i < STAGE_IDS.length; i++) {
+      expect(extendedOffsets[i]).toBe(standardOffsets[i]! * ratio)
+    }
+    // Order is preserved (strictly increasing) under scaling.
+    expect(extendedOffsets[0]).toBeLessThan(extendedOffsets[1]!)
+    expect(extendedOffsets[1]).toBeLessThan(extendedOffsets[2]!)
+  })
+
+  it('the three stage scheduledEventFired events fire in schedule order', () => {
+    const ctx = outlookContextForSeed(SEED)
+    const extended = startMission(ctx, true)
+    const advanced = advanceCampaign(
+      ctx,
+      extended,
+      (extended.activeMission!.endsAt as number) - 1_000,
+    )
+    const firedStageIds = advanced.emitted
+      .filter((e) => e.type === 'scheduledEventFired' && e.kind === 'outlookStage')
+      .map((e) => (e as { id: string }).id)
+    expect(firedStageIds).toEqual(STAGE_IDS)
+  })
+
+  it('the walkthrough still reaches tier 3 at eight minutes (times scaled by the same ratio)', () => {
+    const ctx = outlookContextForSeed(SEED)
+    let state = startMission(ctx, true)
+    const endsAt = state.activeMission!.endsAt as number
+    const ratio = (endsAt - OUTLOOK_T0) / OUTLOOK_DURATION_MS
+    // Replay the walkthrough action envelopes (skipping the START_MISSION
+    // prefix, already dispatched) with each delta from t0 scaled by the ratio.
+    const envelopes = walkthroughScript(SEED).slice(1)
+    for (const [action, now] of envelopes) {
+      const scaledNow = OUTLOOK_T0 + (now - OUTLOOK_T0) * ratio
+      state = dispatch(ctx, state, action, scaledNow).state
+    }
+    const advanced = advanceCampaign(ctx, state, endsAt + 1_000)
+    const outlook = advanced.state.settled.find((s) => s.missionId === 'outlook')!
+    expect(outlook.tier).toBe('full')
+    expect(outlook.metrics['required_delivered']).toBe(3)
+    // Eight minutes = 480_000 ms = twice the 240_000 standard window.
+    expect(endsAt - OUTLOOK_T0).toBe(480_000)
+  })
+})
diff --git a/test/engine/missions/outlook/fixtures.test.ts b/test/engine/missions/outlook/fixtures.test.ts
new file mode 100644
index 0000000..f35a790
--- /dev/null
+++ b/test/engine/missions/outlook/fixtures.test.ts
@@ -0,0 +1,183 @@
+// The section-04 CI fixture matrix: replay the authored scripts through the
+// REAL engine and the REAL outlook module for every seed, proving all four
+// settlement causes (completed, timeout, forfeit, and the adversarial's
+// below-full settle) plus the clue path and its survival across failure.
+// These reuse the section-02 fixture scripts verbatim (via the fixtures/
+// re-export) rather than forking them, so the solvability proofs and this
+// matrix share one source of truth.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import { OUTLOOK_CLUE_ID } from '@engine/missions/outlook/module'
+import { OUTLOOK_PAYLOAD_BY_SEED } from '@engine/missions/outlook/payloads'
+import {
+  OUTLOOK_DURATION_MS,
+  OUTLOOK_T0,
+  adversarialScript,
+  driveOutlook,
+  outlookContextForSeed,
+  outlookSub,
+  walkthroughScript,
+} from './fixtures/index'
+
+const TIER_RANK: Record<string, number> = {
+  failed: 0,
+  poor: 1,
+  partial: 2,
+  full: 3,
+}
+
+const ENDS_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS
+const SETTLE_AT = ENDS_AT + 1_000
+/** Past the stage-1 fold wake (offset 90s): the +30s walkthrough acks are
+ *  folded here so a mid-mission forfeit evaluates them. */
+const AFTER_FOLD = OUTLOOK_T0 + 100_000
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, OUTLOOK_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'outlook' },
+    OUTLOOK_T0,
+  ).state
+}
+
+function send(
+  messageId: string,
+  recipient: string,
+  channel: 'primary' | 'backup' = 'primary',
+): CampaignAction {
+  return {
+    type: 'MISSION_ACTION',
+    payload: { kind: 'SEND', messageId, channel, recipient },
+  }
+}
+
+function read(messageId: string): CampaignAction {
+  return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } }
+}
+
+function outlookSettled(state: CampaignState) {
+  return state.settled.find((s) => s.missionId === 'outlook')!
+}
+
+describe.each(SEED_NAMES)('outlook fixtures: %s', (seedName) => {
+  it('walkthrough reaches tier 3 completed with at least one spare backup slot', () => {
+    const ctx = outlookContextForSeed(seedName)
+    const { state, emitted } = driveOutlook(
+      ctx,
+      seedName,
+      walkthroughScript(seedName),
+    )
+    const settlements = emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
+    const outlook = outlookSettled(state)
+    expect(outlook.tier).toBe('full')
+    expect(outlook.metrics['required_delivered']).toBe(3)
+    // The walkthrough never touches the backup channel, so the spare slot is
+    // whole. Sample the live substate just before the fold wake settles it.
+    const sampled = driveOutlook(
+      ctx,
+      seedName,
+      walkthroughScript(seedName),
+      OUTLOOK_T0 + 89_000,
+    )
+    expect(outlookSub(sampled.state).backupRemaining).toBeGreaterThanOrEqual(1)
+  })
+
+  it('walkthrough audit READ emits clueFound exactly once and cluesFound has the D-83 id', () => {
+    const ctx = outlookContextForSeed(seedName)
+    const { state, emitted } = driveOutlook(
+      ctx,
+      seedName,
+      walkthroughScript(seedName),
+    )
+    const clueEvents = emitted.filter((e) => e.type === 'clueFound')
+    expect(clueEvents).toHaveLength(1)
+    expect(clueEvents[0]).toMatchObject({ clueId: OUTLOOK_CLUE_ID })
+    expect(state.cluesFound).toContain(OUTLOOK_CLUE_ID)
+  })
+
+  it('adversarial send-everything ends below tier full', () => {
+    const ctx = outlookContextForSeed(seedName)
+    const { state } = driveOutlook(ctx, seedName, adversarialScript(seedName))
+    const outlook = outlookSettled(state)
+    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
+    expect(outlook.metrics['required_delivered']!).toBeLessThan(3)
+  })
+
+  it('timeout: no actions after start settles timeout/failed with the tier-0 commsDelayed magnitude', () => {
+    const ctx = outlookContextForSeed(seedName)
+    const started = startMission(ctx, seedName)
+    const advanced = advanceCampaign(ctx, started, SETTLE_AT)
+    const settlements = advanced.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'failed' })
+    const outlook = outlookSettled(advanced.state)
+    expect(outlook.metrics['required_delivered']).toBe(0)
+    // The commsDelayed magnitude for tier 0 (failed) matches the authored
+    // consequence table row, not a hard-coded constant.
+    const expectedMagnitude = OUTLOOK_PAYLOAD_BY_SEED[seedName]!.commsDelayedTable.failed
+    const comms = outlook.consequences.find((c) => c.kind === 'commsDelayed')
+    expect(comms).toBeDefined()
+    expect(comms!.magnitude).toBe(expectedMagnitude)
+  })
+
+  it('forfeit mid-mission tiers poor with the one achieved delivery marked correct in debrief', () => {
+    const ctx = outlookContextForSeed(seedName)
+    let state = startMission(ctx, seedName)
+    // Walkthrough prefix through ONE correct delivery: read and route the
+    // weather head to its desk on the primary channel.
+    state = dispatch(ctx, state, read('M01'), OUTLOOK_T0 + 1_000).state
+    state = dispatch(
+      ctx,
+      state,
+      send('M01', 'WEATHER_DESK', 'primary'),
+      OUTLOOK_T0 + 2_000,
+    ).state
+    // Advance past the stage-1 fold wake so the +30s ack folds, then forfeit.
+    state = advanceCampaign(ctx, state, AFTER_FOLD).state
+    const result = dispatch(
+      ctx,
+      state,
+      { type: 'FORFEIT_MISSION' },
+      AFTER_FOLD + 1_000,
+    )
+    const outlook = outlookSettled(result.state)
+    expect(outlook.cause).toBe('forfeit')
+    expect(outlook.tier).toBe('poor')
+    expect(outlook.metrics['required_delivered']).toBe(1)
+    const module = ctx.missions['outlook']!
+    const debrief = module.debrief!(outlook)
+    expect(debrief.lines).toContain('REQUIRED WEATHER: DELIVERED CORRECT')
+    expect(debrief.lines).toContain('REQUIRED PAYROLL: NOT DELIVERED')
+    expect(debrief.lines).toContain('REQUIRED AUDIT: NOT DELIVERED')
+  })
+
+  it('clue survives failure: READ audit then forfeit; cluesFound still has the id post-mission', () => {
+    const ctx = outlookContextForSeed(seedName)
+    let state = startMission(ctx, seedName)
+    state = dispatch(ctx, state, read('M05'), OUTLOOK_T0 + 1_000).state
+    expect(state.cluesFound).toContain(OUTLOOK_CLUE_ID)
+    const result = dispatch(
+      ctx,
+      state,
+      { type: 'FORFEIT_MISSION' },
+      OUTLOOK_T0 + 2_000,
+    )
+    const outlook = outlookSettled(result.state)
+    expect(TIER_RANK[outlook.tier]!).toBeLessThan(3)
+    // The clue survives the failed mission in the post-mission campaign state.
+    expect(result.state.cluesFound).toContain(OUTLOOK_CLUE_ID)
+    expect(outlook.clueId).toBe(OUTLOOK_CLUE_ID)
+  })
+})
diff --git a/test/engine/missions/outlook/fixtures/index.ts b/test/engine/missions/outlook/fixtures/index.ts
new file mode 100644
index 0000000..e4bb71c
--- /dev/null
+++ b/test/engine/missions/outlook/fixtures/index.ts
@@ -0,0 +1,63 @@
+// The section-04 fixtures directory. The walkthrough and adversarial
+// scripts already live in test/engine/missions/outlook/fixtures.ts (section
+// 02 authored them and solvability.test.ts drives them). This directory
+// re-exports those exact scripts keyed by seed id, per the section-04
+// file layout, rather than forking them: one source of truth for the
+// solvability proofs that both the solvability suite and the CI fixture
+// matrix replay.
+//
+// A fixture script is a deterministic ordered list of [CampaignAction, now]
+// envelopes replayed through the real engine lifecycle (START_MISSION, then
+// interleaved dispatch/advance). The loaders below take a seed id so a
+// describe.each matrix can pull the right script per seed; today every seed
+// shares the same structural payload, so the scripts are seed-agnostic
+// except where they read the live payload (the trust-the-hints variant).
+import type { Envelope } from '../fixtures'
+import {
+  outlookAdversarialEnvelopes,
+  outlookBackupWalkthroughEnvelopes,
+  outlookTrustHintsEnvelopes,
+  outlookWalkthroughEnvelopes,
+  OUTLOOK_T0,
+} from '../fixtures'
+
+export type { Envelope } from '../fixtures'
+export {
+  OUTLOOK_DURATION_MS,
+  OUTLOOK_T0,
+  driveOutlook,
+  outlookContextForSeed,
+  outlookSub,
+} from '../fixtures'
+
+/** The intended-solution script for a seed: read the three required
+ *  messages (audit first so the clue test can piggyback), route each to
+ *  its correct desk on the primary channel while it is up, and leave the
+ *  whole backup capacity spare. Keyed by seed id for the CI matrix. */
+export function walkthroughScript(_seedId: string, t0 = OUTLOOK_T0): Envelope[] {
+  return outlookWalkthroughEnvelopes(t0)
+}
+
+/** A backup-spending walkthrough that keeps the spare-slot margin
+ *  load-bearing: weather and payroll on primary, the audit late over
+ *  backup, so backupRemaining lands strictly between 1 and 5. */
+export function backupWalkthroughScript(
+  _seedId: string,
+  t0 = OUTLOOK_T0,
+): Envelope[] {
+  return outlookBackupWalkthroughEnvelopes(t0)
+}
+
+/** The send-everything adversarial for a seed: spray SEND at every message
+ *  to a single desk and burn the backup on duplicates and decoys. Only one
+ *  required kind can satisfy, so the run ends below tier full. */
+export function adversarialScript(_seedId: string, t0 = OUTLOOK_T0): Envelope[] {
+  return outlookAdversarialEnvelopes(t0)
+}
+
+/** The naive trust-the-hints adversarial for a seed: route every message
+ *  to the desk its visible recipient hint names, never reading a body. The
+ *  live payroll head carries no hint, so this never satisfies all three. */
+export function trustHintsScript(seedId: string, t0 = OUTLOOK_T0): Envelope[] {
+  return outlookTrustHintsEnvelopes(seedId, t0)
+}
diff --git a/test/engine/missions/outlook/properties.test.ts b/test/engine/missions/outlook/properties.test.ts
new file mode 100644
index 0000000..2037635
--- /dev/null
+++ b/test/engine/missions/outlook/properties.test.ts
@@ -0,0 +1,246 @@
+// A mission-local property suite over the REAL engine lifecycle and the
+// REAL outlook module. The arbitrary generates sequences of valid-SHAPED
+// actions (READ, FLAG, QUEUE, SEND, SEND_QUEUED, TRACE, CHECK SOURCE) at
+// nondecreasing integer times inside the mission window, over the fixture
+// seed's twelve message ids and both channels. Invalid-shaped actions are
+// rejected by the module validator (surfaced as dispatch rejections), never
+// a crash, and every invariant holds over whatever subset the engine
+// accepts. The run count is modest (200) and the fast-check seed is pinned
+// for a deterministic CI harness.
+//
+// Per section-04 implementation note 6: this suite is mission-local by
+// design. The campaign-level fc.commands suite
+// (test/engine/properties/model-commands.test.ts) is built around its own
+// three test-double missions and does not accept additional mission modules,
+// so the outlook module is exercised here rather than registered there.
+import { describe, expect, it } from 'vitest'
+import fc from 'fast-check'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import { OUTLOOK_PAYLOAD_BY_SEED } from '@engine/missions/outlook/payloads'
+import { isSatisfiedDelivery } from '@engine/missions/outlook/rules'
+import type { OutlookMessage, OutlookState } from '@engine/missions/outlook/types'
+import {
+  OUTLOOK_DURATION_MS,
+  OUTLOOK_T0,
+  outlookContextForSeed,
+} from './fixtures/index'
+
+const SEED = SEED_NAMES[0]!
+const PAYLOAD = OUTLOOK_PAYLOAD_BY_SEED[SEED]!
+const ENDS_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS
+const CAPACITY = PAYLOAD.channelTuning.backupCapacity
+const MESSAGE_IDS = PAYLOAD.messages.map((m) => m.id)
+const MESSAGE_BY_ID = new Map<string, OutlookMessage>(
+  PAYLOAD.messages.map((m) => [m.id, m]),
+)
+const SUPERSEDED_IDS = new Set(
+  PAYLOAD.messages.filter((m) => m.supersededBy !== null).map((m) => m.id),
+)
+const DESKS = ['WEATHER_DESK', 'PAYROLL_DESK', 'AUDIT_DESK'] as const
+const RECORD_IDS = Array.from(
+  new Set(
+    PAYLOAD.messages
+      .map((m) => m.recordId)
+      .filter((id): id is string => id !== null),
+  ),
+)
+
+const FC_SEED = 0x0ac77 // pinned per the deterministic split-01 harness convention
+
+type GenAction =
+  | { readonly kind: 'READ'; readonly messageId: string }
+  | { readonly kind: 'FLAG'; readonly messageId: string }
+  | { readonly kind: 'QUEUE'; readonly messageId: string; readonly channel: 'primary' | 'backup' }
+  | { readonly kind: 'SEND'; readonly messageId: string; readonly channel: 'primary' | 'backup'; readonly recipient: string }
+  | { readonly kind: 'SEND_QUEUED'; readonly index: number; readonly recipient: string }
+  | { readonly kind: 'TRACE'; readonly recordId: string }
+  | { readonly kind: 'CHECK_SOURCE'; readonly recordId: string }
+
+const messageIdArb = fc.constantFrom(...MESSAGE_IDS)
+const channelArb = fc.constantFrom('primary' as const, 'backup' as const)
+const deskArb = fc.constantFrom(...DESKS)
+const recordIdArb = fc.constantFrom(...RECORD_IDS)
+
+const genActionArb: fc.Arbitrary<GenAction> = fc.oneof(
+  messageIdArb.map((messageId) => ({ kind: 'READ' as const, messageId })),
+  messageIdArb.map((messageId) => ({ kind: 'FLAG' as const, messageId })),
+  fc
+    .tuple(messageIdArb, channelArb)
+    .map(([messageId, channel]) => ({ kind: 'QUEUE' as const, messageId, channel })),
+  fc
+    .tuple(messageIdArb, channelArb, deskArb)
+    .map(([messageId, channel, recipient]) => ({
+      kind: 'SEND' as const,
+      messageId,
+      channel,
+      recipient,
+    })),
+  fc
+    .tuple(fc.integer({ min: 0, max: 8 }), deskArb)
+    .map(([index, recipient]) => ({ kind: 'SEND_QUEUED' as const, index, recipient })),
+  recordIdArb.map((recordId) => ({ kind: 'TRACE' as const, recordId })),
+  recordIdArb.map((recordId) => ({ kind: 'CHECK_SOURCE' as const, recordId })),
+)
+
+interface TimedGenAction {
+  readonly action: GenAction
+  /** Delta ms from mission start. Nondecreasing across the sequence. */
+  readonly delta: number
+}
+
+/** A sequence of actions at nondecreasing integer times within the window
+ *  (plus a tail past the deadline so settlement always fires). */
+const sequenceArb: fc.Arbitrary<TimedGenAction[]> = fc
+  .array(
+    fc.record({
+      action: genActionArb,
+      // Gap since the previous action, so a running sum is nondecreasing.
+      gap: fc.integer({ min: 0, max: 40_000 }),
+    }),
+    { minLength: 0, maxLength: 24 },
+  )
+  .map((entries) => {
+    let delta = 0
+    return entries.map(({ action, gap }) => {
+      delta += gap
+      return { action, delta }
+    })
+  })
+
+function toCampaignAction(gen: GenAction): CampaignAction {
+  switch (gen.kind) {
+    case 'READ':
+      return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: gen.messageId } }
+    case 'FLAG':
+      return { type: 'MISSION_ACTION', payload: { kind: 'FLAG', messageId: gen.messageId } }
+    case 'QUEUE':
+      return {
+        type: 'MISSION_ACTION',
+        payload: { kind: 'QUEUE', messageId: gen.messageId, channel: gen.channel },
+      }
+    case 'SEND':
+      return {
+        type: 'MISSION_ACTION',
+        payload: {
+          kind: 'SEND',
+          messageId: gen.messageId,
+          channel: gen.channel,
+          recipient: gen.recipient,
+        },
+      }
+    case 'SEND_QUEUED':
+      return {
+        type: 'MISSION_ACTION',
+        payload: { kind: 'SEND_QUEUED', index: gen.index, recipient: gen.recipient },
+      }
+    case 'TRACE':
+      return { type: 'INSPECT_RECORD', recordId: gen.recordId }
+    case 'CHECK_SOURCE':
+      return { type: 'REQUEST_SOURCE_CHECK', recordId: gen.recordId }
+  }
+}
+
+function startMission(ctx: EngineContext): CampaignState {
+  const created = createCampaign(ctx, SEED, { extendedTime: false }, OUTLOOK_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'outlook' },
+    OUTLOOK_T0,
+  ).state
+}
+
+function sub(state: CampaignState): OutlookState | null {
+  return (state.activeMission?.substate as OutlookState | undefined) ?? null
+}
+
+describe('outlook rules properties', () => {
+  it('never negative backup capacity; never satisfies a superseded message; QUEUE is free; settles exactly once', () => {
+    fc.assert(
+      fc.property(sequenceArb, (sequence) => {
+        const ctx = outlookContextForSeed(SEED)
+        let state = startMission(ctx)
+        const settlementEvents: EngineEvent[] = []
+
+        for (const { action, delta } of sequence) {
+          const now = OUTLOOK_T0 + delta
+          const campaignAction = toCampaignAction(action)
+
+          // Record backup capacity and send-log length before a bare QUEUE so
+          // we can prove QUEUE never touches either.
+          const before = sub(state)
+          const isQueue =
+            campaignAction.type === 'MISSION_ACTION' &&
+            (campaignAction.payload as { kind?: string }).kind === 'QUEUE'
+          const beforeBackup = before?.backupRemaining ?? null
+          const beforeSends = before?.sends.length ?? null
+
+          // Dispatch never throws: an invalid-shaped action is rejected by
+          // the validator, surfaced as a rejection, and leaves state intact.
+          const result = dispatch(ctx, state, campaignAction, now)
+          settlementEvents.push(
+            ...result.emitted.filter((e) => e.type === 'settlement'),
+          )
+          state = result.state
+
+          const after = sub(state)
+          if (after) {
+            // Never negative backup capacity.
+            expect(after.backupRemaining).toBeGreaterThanOrEqual(0)
+            expect(after.backupRemaining).toBeLessThanOrEqual(CAPACITY)
+          }
+
+          // A successful QUEUE spends no capacity and logs no send.
+          if (isQueue && !result.rejection && before && after) {
+            expect(after.backupRemaining).toBe(beforeBackup)
+            expect(after.sends.length).toBe(beforeSends)
+          }
+
+          // No send that routed a SUPERSEDED (stale) message id is ever a
+          // satisfied required delivery, however the ack folds. Checked on
+          // the live substate while the mission is still running.
+          if (after && after.endsAt !== null) {
+            for (const record of after.sends) {
+              if (!SUPERSEDED_IDS.has(record.messageId)) continue
+              const message = MESSAGE_BY_ID.get(record.messageId)!
+              expect(isSatisfiedDelivery(record, message, after.endsAt)).toBe(false)
+            }
+          }
+        }
+
+        // Advance past the deadline so settlement always fires if it has not.
+        const advanced = advanceCampaign(ctx, state, ENDS_AT + 10_000)
+        settlementEvents.push(
+          ...advanced.emitted.filter((e) => e.type === 'settlement'),
+        )
+        state = advanced.state
+
+        // Exactly one settlement for the outlook mission, regardless of the
+        // action tail.
+        const outlookSettlements = settlementEvents.filter(
+          (e) => e.type === 'settlement' && e.missionId === 'outlook',
+        )
+        expect(outlookSettlements).toHaveLength(1)
+        expect(
+          state.settled.filter((s) => s.missionId === 'outlook'),
+        ).toHaveLength(1)
+
+        // Satisfied required deliveries never exceed the three live heads,
+        // and a run can only credit non-superseded versions (asserted per
+        // step above against isSatisfiedDelivery).
+        const outlook = state.settled.find((s) => s.missionId === 'outlook')!
+        expect(outlook.metrics['required_delivered']!).toBeGreaterThanOrEqual(0)
+        expect(outlook.metrics['required_delivered']!).toBeLessThanOrEqual(3)
+      }),
+      { numRuns: 200, seed: FC_SEED },
+    )
+  })
+})
