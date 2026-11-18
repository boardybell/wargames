diff --git a/src/app/a11y/announce.ts b/src/app/a11y/announce.ts
new file mode 100644
index 0000000..48a9342
--- /dev/null
+++ b/src/app/a11y/announce.ts
@@ -0,0 +1,28 @@
+// Announcement stand-in. Section 09 owns the real aria-live regions mounted
+// at the app root; this section consumes a narrow announce() so screens can
+// report changes. Until section 09 wires the regions, announcements fan out
+// to any registered sink (the test spies on this).
+export type AnnounceChannel = 'polite' | 'assertive'
+
+export type AnnounceSink = (text: string, channel: AnnounceChannel) => void
+
+const sinks = new Set<AnnounceSink>()
+
+export function onAnnounce(sink: AnnounceSink): () => void {
+  sinks.add(sink)
+  return () => {
+    sinks.delete(sink)
+  }
+}
+
+export function announce(
+  text: string,
+  channel: AnnounceChannel = 'polite',
+): void {
+  for (const sink of sinks) sink(text, channel)
+}
+
+/** Test-only. */
+export function __resetAnnounce(): void {
+  sinks.clear()
+}
diff --git a/src/app/a11y/focus.ts b/src/app/a11y/focus.ts
new file mode 100644
index 0000000..e7c3a51
--- /dev/null
+++ b/src/app/a11y/focus.ts
@@ -0,0 +1,9 @@
+// Focus management stand-in. Section 09 refines the heading-vs-input choice
+// and the roving details; this section needs to move focus to a new screen
+// root on every screen change.
+export function moveFocusTo(element: HTMLElement | null): void {
+  if (!element) return
+  // A screen root is programmatically focusable via tabindex -1 (set by the
+  // router); focus it so assistive tech lands on the new screen.
+  element.focus()
+}
diff --git a/src/app/a11y/keyHandler.ts b/src/app/a11y/keyHandler.ts
new file mode 100644
index 0000000..49c2cd0
--- /dev/null
+++ b/src/app/a11y/keyHandler.ts
@@ -0,0 +1,29 @@
+// The shared key-handler guard. Section 09 owns the a11y spine and will
+// refine these; this section needs the bail conditions now, so they live here
+// as the real implementation. A key event is ignored when it targets an
+// editable element (so typing in the command input never triggers menu
+// shortcuts), when a modifier is held (browser and OS shortcuts win), or
+// while an IME composition is in progress.
+export interface KeyLike {
+  readonly key: string
+  readonly ctrlKey?: boolean
+  readonly metaKey?: boolean
+  readonly altKey?: boolean
+  readonly isComposing?: boolean
+  readonly target?: EventTarget | null
+}
+
+function isEditableTarget(target: EventTarget | null | undefined): boolean {
+  if (!(target instanceof HTMLElement)) return false
+  if (target.isContentEditable) return true
+  const tag = target.tagName
+  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
+}
+
+/** True when a screen/menu shortcut handler should act on this key. */
+export function shouldHandleKey(event: KeyLike): boolean {
+  if (event.ctrlKey || event.metaKey || event.altKey) return false
+  if (event.isComposing) return false
+  if (isEditableTarget(event.target ?? null)) return false
+  return true
+}
diff --git a/src/app/screens/DebriefScreen.tsx b/src/app/screens/DebriefScreen.tsx
new file mode 100644
index 0000000..56864d6
--- /dev/null
+++ b/src/app/screens/DebriefScreen.tsx
@@ -0,0 +1,36 @@
+// The debrief frame. ACKNOWLEDGE (the button here, or the ACKNOWLEDGE command
+// routed through the ScreenRouter) dispatches ACKNOWLEDGE_DEBRIEF; returning to
+// the menu happens through the resulting engine phase change, never local
+// navigation. The fourth-row unlock follows from the engine once all three
+// debriefs are acknowledged.
+import { useCampaign } from '../state'
+import { ActionBar } from '../terminal/ActionBar'
+import { TerminalText } from '../terminal/TerminalText'
+import { pendingDebrief } from './pendingDebrief'
+
+export function DebriefScreen() {
+  const state = useCampaign()
+  const pending = pendingDebrief(state)
+  if (!pending) {
+    return <TerminalText>NO DEBRIEF PENDING</TerminalText>
+  }
+  return (
+    <div data-testid="debrief-screen" data-mission-id={pending.missionId}>
+      <TerminalText>
+        {`DEBRIEF: ${pending.missionId.toUpperCase()}  TIER ${pending.tier.toUpperCase()}`}
+      </TerminalText>
+      <ActionBar
+        actions={[
+          {
+            label: 'ACKNOWLEDGE',
+            action: {
+              type: 'ACKNOWLEDGE_DEBRIEF',
+              missionId: pending.missionId,
+            },
+            testId: 'acknowledge-button',
+          },
+        ]}
+      />
+    </div>
+  )
+}
diff --git a/src/app/screens/FallbackMissionFrame.tsx b/src/app/screens/FallbackMissionFrame.tsx
new file mode 100644
index 0000000..a56928a
--- /dev/null
+++ b/src/app/screens/FallbackMissionFrame.tsx
@@ -0,0 +1,36 @@
+// A plain mission frame rendered until a mission split registers its own
+// screen. It shows the mission title and status and an ActionBar from engine
+// generics (FORFEIT is always available), so this split is fully operable
+// against the test-double mission before any mission split lands.
+import { useCampaign } from '../state'
+import { ActionBar } from '../terminal/ActionBar'
+import { TerminalText, StatusLine } from '../terminal/TerminalText'
+import { resolveMissionTitle } from './screenRegistry'
+
+export function FallbackMissionFrame({
+  missionId,
+}: {
+  readonly missionId: string
+}) {
+  const state = useCampaign()
+  const active = state.activeMission
+  return (
+    <div data-testid="mission-frame" data-mission-id={missionId}>
+      <TerminalText>{resolveMissionTitle(missionId)}</TerminalText>
+      <StatusLine>
+        {active
+          ? `MISSION IN PROGRESS`
+          : `MISSION ${missionId.toUpperCase()} INACTIVE`}
+      </StatusLine>
+      <ActionBar
+        actions={[
+          {
+            label: 'FORFEIT',
+            action: { type: 'FORFEIT_MISSION' },
+            testId: 'forfeit-button',
+          },
+        ]}
+      />
+    </div>
+  )
+}
diff --git a/src/app/screens/MenuScreen.tsx b/src/app/screens/MenuScreen.tsx
new file mode 100644
index 0000000..2d3baae
--- /dev/null
+++ b/src/app/screens/MenuScreen.tsx
@@ -0,0 +1,64 @@
+// The main menu: a fixed greeting over the engine's menu rows. The fourth
+// row (GLOBAL FAILSAFE, the finale) is included by the engine's unlock
+// selector only after every mission debrief is acknowledged, so it is absent
+// from the DOM until then. Selecting an unsettled mission starts it;
+// selecting a settled one opens its record (the engine-provided outcome).
+import { useState } from 'react'
+import { getMissionOrder, send, useCampaign } from '../state'
+import { selectMenuRows, selectSettledOutcome } from '@engine'
+import { MenuRows, type MenuRowItem } from '../terminal/MenuRows'
+import { TerminalText } from '../terminal/TerminalText'
+import { resolveMissionTitle } from './screenRegistry'
+
+const FINALE_ID = 'finale'
+const GREETING = [
+  'GREETINGS PROFESSOR FALKEN',
+  '',
+  'SHALL WE PLAY A GAME?',
+  '',
+].join('\n')
+
+function labelFor(missionId: string): string {
+  return missionId === FINALE_ID ? 'GLOBAL FAILSAFE' : resolveMissionTitle(missionId)
+}
+
+export function MenuScreen() {
+  const state = useCampaign()
+  const order = getMissionOrder()
+  const menu = selectMenuRows(state, order, FINALE_ID)
+  const [recordFor, setRecordFor] = useState<string | null>(null)
+
+  const rows: MenuRowItem[] = menu.rows.map((row) => ({
+    id: row.missionId,
+    label: labelFor(row.missionId),
+  }))
+
+  const onSelect = (id: string): void => {
+    const settled = state.settled.some((s) => s.missionId === id)
+    if (settled) {
+      setRecordFor(id)
+      return
+    }
+    // The finale is a mission module too (split 06 registers it under
+    // FINALE_ID); selectMenuRows surfaces it as a row, so START_MISSION is the
+    // correct entry. Until split 06 lands the engine rejects it as an unknown
+    // mission, harmlessly.
+    send({ type: 'START_MISSION', missionId: id })
+  }
+
+  const record = recordFor ? selectSettledOutcome(state, recordFor) : null
+
+  return (
+    <div data-testid="menu-screen">
+      <TerminalText>{GREETING}</TerminalText>
+      <MenuRows rows={rows} onSelect={onSelect} />
+      {record && (
+        <div data-testid="record-view" data-mission-id={record.missionId}>
+          <TerminalText dim>
+            {`RECORD: ${record.missionId.toUpperCase()}  TIER ${record.tier.toUpperCase()}  CAUSE ${record.cause.toUpperCase()}`}
+          </TerminalText>
+        </div>
+      )}
+    </div>
+  )
+}
diff --git a/src/app/screens/ScreenRouter.tsx b/src/app/screens/ScreenRouter.tsx
new file mode 100644
index 0000000..39c98f3
--- /dev/null
+++ b/src/app/screens/ScreenRouter.tsx
@@ -0,0 +1,131 @@
+// Maps the engine phase to a screen and layers settings/help as overlays
+// (local UI state, not engine phases). On every screen change it moves focus
+// to the new screen root (section 09 refines the heading-vs-input choice).
+// A shared CommandInput at the foot is wired to the active screen id so the
+// grammar resolves screen verbs correctly, and its UI commands open overlays
+// or acknowledge a debrief.
+import { useEffect, useRef, useState } from 'react'
+import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
+import { getState, send, useCampaign } from '../state'
+import { moveFocusTo } from '../a11y/focus'
+import { CommandInput } from '../terminal/CommandInput'
+import type { LocalUiCommand } from '../terminal/commandGrammar'
+import { MenuScreen } from './MenuScreen'
+import { DebriefScreen } from './DebriefScreen'
+import { FallbackMissionFrame } from './FallbackMissionFrame'
+import { resolveMissionScreen } from './screenRegistry'
+import { pendingDebrief } from './pendingDebrief'
+import { handleCapturedKey } from './inputStack'
+import type { CampaignState } from '@engine'
+
+export type OverlayId = 'settings' | 'help'
+
+export function screenIdForState(state: CampaignState): string {
+  switch (state.phase) {
+    case 'menu':
+      return 'menu'
+    case 'mission':
+      return `mission:${state.activeMission?.missionId ?? ''}`
+    case 'debrief':
+      return 'debrief'
+    case 'finale':
+      return 'finale'
+    default:
+      return 'menu'
+  }
+}
+
+export interface ScreenRouterProps {
+  readonly onListGames?: () => void
+  readonly onSetSound?: (on: boolean) => void
+}
+
+export function ScreenRouter({ onListGames, onSetSound }: ScreenRouterProps) {
+  const state = useCampaign()
+  const screenId = screenIdForState(state)
+  const [overlay, setOverlay] = useState<OverlayId | null>(null)
+  const rootRef = useRef<HTMLDivElement>(null)
+
+  useEffect(() => {
+    moveFocusTo(rootRef.current)
+  }, [screenId])
+
+  const handleUiCommand = (command: LocalUiCommand): void => {
+    switch (command.kind) {
+      case 'OPEN_HELP':
+        setOverlay('help')
+        break
+      case 'OPEN_SETTINGS':
+        setOverlay('settings')
+        break
+      case 'CLOSE_OVERLAY':
+        setOverlay(null)
+        break
+      case 'ACKNOWLEDGE': {
+        const pending = pendingDebrief(getState())
+        if (pending) {
+          send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: pending.missionId })
+        }
+        break
+      }
+      case 'LIST_GAMES':
+        onListGames?.()
+        break
+      case 'SET_SOUND':
+        onSetSound?.(command.on)
+        break
+    }
+  }
+
+  // Capture-phase: resolve precedence before the event reaches the screen's
+  // own handlers, so a running type-in or an active prompt swallows the key.
+  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
+    if (handleCapturedKey(event.nativeEvent) === 'consumed') {
+      event.preventDefault()
+      event.stopPropagation()
+    }
+  }
+
+  return (
+    <div
+      className="screen-root"
+      data-testid="screen-root"
+      data-active-screen={screenId}
+      tabIndex={-1}
+      ref={rootRef}
+      onKeyDownCapture={onKeyDownCapture}
+    >
+      <ActiveScreen screenId={screenId} state={state} />
+      <CommandInput activeScreen={screenId} onUiCommand={handleUiCommand} />
+      {overlay !== null && (
+        <div data-testid="overlay-slot" data-overlay={overlay} />
+      )}
+    </div>
+  )
+}
+
+function ActiveScreen({
+  screenId,
+  state,
+}: {
+  readonly screenId: string
+  readonly state: CampaignState
+}) {
+  if (screenId === 'menu') return <MenuScreen />
+  if (screenId === 'debrief') return <DebriefScreen />
+  if (screenId.startsWith('mission:')) {
+    const missionId = state.activeMission?.missionId ?? ''
+    const Registered = resolveMissionScreen(missionId)
+    // Keyed by mission id so a mission-to-mission change remounts rather than
+    // reusing the previous mission's component state.
+    if (Registered) return <Registered key={missionId} missionId={missionId} />
+    return <FallbackMissionFrame key={missionId} missionId={missionId} />
+  }
+  // finale and any other phase get the plain fallback frame until their
+  // own split lands.
+  return (
+    <div data-testid="screen-fallback" data-screen-id={screenId}>
+      {`[ ${screenId} ]`}
+    </div>
+  )
+}
diff --git a/src/app/screens/index.ts b/src/app/screens/index.ts
new file mode 100644
index 0000000..f25709e
--- /dev/null
+++ b/src/app/screens/index.ts
@@ -0,0 +1,18 @@
+export { ScreenRouter, screenIdForState, type OverlayId } from './ScreenRouter'
+export { MenuScreen } from './MenuScreen'
+export { DebriefScreen } from './DebriefScreen'
+export { FallbackMissionFrame } from './FallbackMissionFrame'
+export {
+  registerMissionScreen,
+  resolveMissionScreen,
+  hasMissionScreen,
+  registerMissionTitle,
+  resolveMissionTitle,
+  type MissionScreen,
+  type MissionScreenProps,
+} from './screenRegistry'
+export {
+  resolvePrecedence,
+  type PrecedenceState,
+  type PrecedenceResult,
+} from './precedence'
diff --git a/src/app/screens/inputStack.ts b/src/app/screens/inputStack.ts
new file mode 100644
index 0000000..62e808e
--- /dev/null
+++ b/src/app/screens/inputStack.ts
@@ -0,0 +1,81 @@
+// The live wiring of the precedence stack. A capture-phase key handler at the
+// screen root runs resolvePrecedence FIRST, so a higher layer (an open dialog,
+// an active diegetic prompt, or a running type-in) swallows a key before it
+// can reach the screen's own handlers (MenuRows, etc). Section 05 plugs the
+// sound prompt into setPrompt and the greeting type-in into setTypeIn; section
+// 06 toggles setDialogOpen. Until then the state is empty and keys pass
+// straight through to the screen, preserving menu navigation.
+import { resolvePrecedence } from './precedence'
+import type { KeyLike } from '../a11y/keyHandler'
+
+let dialogOpen = false
+let promptAnswerKeys: readonly string[] | null = null
+let promptOnAnswer: ((key: string) => void) | null = null
+let typeInRunning = false
+let typeInComplete: (() => void) | null = null
+
+export function setDialogOpen(open: boolean): void {
+  dialogOpen = open
+}
+
+export function setPrompt(
+  answerKeys: readonly string[],
+  onAnswer: (key: string) => void,
+): void {
+  promptAnswerKeys = answerKeys
+  promptOnAnswer = onAnswer
+}
+
+export function clearPrompt(): void {
+  promptAnswerKeys = null
+  promptOnAnswer = null
+}
+
+export function setTypeIn(running: boolean, complete: (() => void) | null): void {
+  typeInRunning = running
+  typeInComplete = complete
+}
+
+function toKeyLike(event: KeyboardEvent): KeyLike {
+  return {
+    key: event.key,
+    ctrlKey: event.ctrlKey,
+    metaKey: event.metaKey,
+    altKey: event.altKey,
+    isComposing: event.isComposing,
+    target: event.target,
+  }
+}
+
+/** Resolve a key against the stack. Returns 'consumed' when a higher layer
+ *  handled it (the caller should preventDefault and stop propagation so the
+ *  screen never sees it), or 'pass' to let it reach screen handlers. */
+export function handleCapturedKey(event: KeyboardEvent): 'consumed' | 'pass' {
+  const result = resolvePrecedence(
+    { dialogOpen, promptAnswerKeys, typeInRunning },
+    toKeyLike(event),
+  )
+  switch (result.kind) {
+    case 'prompt-answer':
+      promptOnAnswer?.(result.key)
+      return 'consumed'
+    case 'complete-type-in':
+      typeInComplete?.()
+      return 'consumed'
+    case 'dialog':
+      // A native modal dialog owns the keys; swallow from the screen.
+      return 'consumed'
+    default:
+      // 'screen' and 'ignore' fall through to the screen's own handlers.
+      return 'pass'
+  }
+}
+
+/** Test-only. */
+export function __resetInputStack(): void {
+  dialogOpen = false
+  promptAnswerKeys = null
+  promptOnAnswer = null
+  typeInRunning = false
+  typeInComplete = null
+}
diff --git a/src/app/screens/pendingDebrief.ts b/src/app/screens/pendingDebrief.ts
new file mode 100644
index 0000000..16f5916
--- /dev/null
+++ b/src/app/screens/pendingDebrief.ts
@@ -0,0 +1,12 @@
+// The one place that decides which debrief is pending, so the ACKNOWLEDGE
+// button (DebriefScreen) and the ACKNOWLEDGE command (ScreenRouter) provably
+// target the same mission: the first settled mission not yet acknowledged.
+import type { CampaignState, SettledOutcome } from '@engine'
+
+export function pendingDebrief(state: CampaignState): SettledOutcome | null {
+  return (
+    state.settled.find(
+      (s) => !state.acknowledgedDebriefs.includes(s.missionId),
+    ) ?? null
+  )
+}
diff --git a/src/app/screens/precedence.ts b/src/app/screens/precedence.ts
new file mode 100644
index 0000000..b3f3d7e
--- /dev/null
+++ b/src/app/screens/precedence.ts
@@ -0,0 +1,44 @@
+// The input precedence stack, resolved as a pure function so every collision
+// case is unit-testable. Top wins:
+//   1. An open native dialog consumes all keys (the stack yields; showModal
+//      traps keys at the browser level).
+//   2. An active diegetic prompt consumes only its answer keys; other keys
+//      fall through to the layers below.
+//   3. A running type-in swallows any non-consumed key and completes.
+//   4. Menu and screen shortcuts (gated by the shared key-handler bail).
+//   5. Global shortcuts (also screen-gated here).
+// The sound prompt (section 05) plugs into layer 2 as a generic prompt; the
+// type-in completion API comes from section 03.
+import { shouldHandleKey, type KeyLike } from '../a11y/keyHandler'
+
+export interface PrecedenceState {
+  readonly dialogOpen: boolean
+  /** The prompt's answer keys, or null when no prompt is active. */
+  readonly promptAnswerKeys: readonly string[] | null
+  readonly typeInRunning: boolean
+}
+
+export type PrecedenceResult =
+  | { readonly kind: 'dialog' }
+  | { readonly kind: 'prompt-answer'; readonly key: string }
+  | { readonly kind: 'complete-type-in' }
+  | { readonly kind: 'screen' }
+  | { readonly kind: 'ignore' }
+
+export function resolvePrecedence(
+  state: PrecedenceState,
+  event: KeyLike,
+): PrecedenceResult {
+  if (state.dialogOpen) return { kind: 'dialog' }
+  if (state.promptAnswerKeys) {
+    if (state.promptAnswerKeys.includes(event.key)) {
+      return { kind: 'prompt-answer', key: event.key }
+    }
+    // A non-answer key during a prompt falls through to the layers below.
+  }
+  if (state.typeInRunning) return { kind: 'complete-type-in' }
+  // Screen and global shortcuts honor the shared bail (editable target, held
+  // modifier, IME composition).
+  if (!shouldHandleKey(event)) return { kind: 'ignore' }
+  return { kind: 'screen' }
+}
diff --git a/src/app/screens/screenRegistry.ts b/src/app/screens/screenRegistry.ts
new file mode 100644
index 0000000..02033dc
--- /dev/null
+++ b/src/app/screens/screenRegistry.ts
@@ -0,0 +1,45 @@
+// Mission screens and titles are registered by mission splits (03 to 06).
+// Until one lands, resolveMissionScreen returns the plain fallback frame and
+// resolveMissionTitle falls back to the upper-cased id, so this split is fully
+// testable against the engine's test-double mission.
+import type { ComponentType } from 'react'
+
+export interface MissionScreenProps {
+  readonly missionId: string
+}
+
+export type MissionScreen = ComponentType<MissionScreenProps>
+
+const missionScreens = new Map<string, MissionScreen>()
+const missionTitles = new Map<string, string>()
+
+export function registerMissionScreen(
+  missionId: string,
+  component: MissionScreen,
+): void {
+  missionScreens.set(missionId, component)
+}
+
+export function hasMissionScreen(missionId: string): boolean {
+  return missionScreens.has(missionId)
+}
+
+export function resolveMissionScreen(
+  missionId: string,
+): MissionScreen | null {
+  return missionScreens.get(missionId) ?? null
+}
+
+export function registerMissionTitle(missionId: string, title: string): void {
+  missionTitles.set(missionId, title)
+}
+
+export function resolveMissionTitle(missionId: string): string {
+  return missionTitles.get(missionId) ?? missionId.toUpperCase()
+}
+
+/** Test-only. */
+export function __resetScreenRegistry(): void {
+  missionScreens.clear()
+  missionTitles.clear()
+}
diff --git a/src/app/state/index.ts b/src/app/state/index.ts
index 82cf553..75f9082 100644
--- a/src/app/state/index.ts
+++ b/src/app/state/index.ts
@@ -12,7 +12,7 @@ import {
 } from './saveBinding'
 import { registerMultiTab } from './multiTab'
 
-export { useCampaign } from './store'
+export { useCampaign, getMissionOrder, getState } from './store'
 export { send, type SendResult } from './send'
 export { wake } from './wake'
 export { onEngineEvent, type EngineEventConsumer, type Unsubscribe } from './events'
diff --git a/src/app/state/store.ts b/src/app/state/store.ts
index 1a7e7a8..df2a314 100644
--- a/src/app/state/store.ts
+++ b/src/app/state/store.ts
@@ -21,6 +21,11 @@ export function getContext(): EngineContext {
   return context
 }
 
+/** The mission order the menu renders in, from the active context. */
+export function getMissionOrder(): readonly string[] {
+  return getContext().missionOrder
+}
+
 /** Internal: the only callers are send, wake, and init. */
 export function setState(next: CampaignState): void {
   state = next
diff --git a/src/app/terminal/ActionBar.tsx b/src/app/terminal/ActionBar.tsx
new file mode 100644
index 0000000..0e141e3
--- /dev/null
+++ b/src/app/terminal/ActionBar.tsx
@@ -0,0 +1,45 @@
+// Buttons that dispatch engine actions through send(), rendering the engine's
+// rejection reason inline next to the control (never a toast or dialog).
+import { useState } from 'react'
+import { send } from '../state'
+import type { CampaignAction } from '@engine'
+import './terminal.css'
+
+export interface ActionBarItem {
+  readonly label: string
+  readonly action: CampaignAction
+  readonly testId?: string
+}
+
+export function ActionBar({ actions }: { readonly actions: readonly ActionBarItem[] }) {
+  const [rejection, setRejection] = useState<string | null>(null)
+
+  const run = (action: CampaignAction): void => {
+    const result = send(action)
+    setRejection(result.rejected ? result.reason : null)
+  }
+
+  return (
+    <div className="action-bar" data-testid="action-bar">
+      {actions.map((item) => (
+        <button
+          key={item.label}
+          type="button"
+          data-testid={item.testId ?? `action-${item.label}`}
+          onClick={() => run(item.action)}
+        >
+          {item.label}
+        </button>
+      ))}
+      {rejection !== null && (
+        <span
+          className="action-rejection"
+          role="alert"
+          data-testid="action-rejection"
+        >
+          {`INVALID: ${rejection}`}
+        </span>
+      )}
+    </div>
+  )
+}
diff --git a/src/app/terminal/CommandInput.tsx b/src/app/terminal/CommandInput.tsx
new file mode 100644
index 0000000..e437e1e
--- /dev/null
+++ b/src/app/terminal/CommandInput.tsx
@@ -0,0 +1,63 @@
+// The command line. Parses input to the same typed engine action a button
+// would dispatch, a local UI command (overlays), or an error line. Unknown
+// input prints UNRECOGNIZED COMMAND; an engine rejection prints INVALID with
+// the engine reason. Both render as terminal output, never a dialog.
+import { useState } from 'react'
+import type { FormEvent } from 'react'
+import { send } from '../state'
+import { parseCommand, type LocalUiCommand } from './commandGrammar'
+import './terminal.css'
+
+export interface CommandInputProps {
+  readonly activeScreen: string
+  readonly onUiCommand: (command: LocalUiCommand) => void
+}
+
+// Keep a bounded scrollback so a long campaign cannot grow the output forever.
+const MAX_OUTPUT_LINES = 100
+
+export function CommandInput({ activeScreen, onUiCommand }: CommandInputProps) {
+  const [value, setValue] = useState('')
+  const [output, setOutput] = useState<readonly string[]>([])
+
+  const appendLine = (line: string): void => {
+    setOutput((lines) => [...lines, line].slice(-MAX_OUTPUT_LINES))
+  }
+
+  const submit = (event: FormEvent): void => {
+    event.preventDefault()
+    if (value.trim().length === 0) return
+    const result = parseCommand(value, activeScreen)
+    if (result.kind === 'error') {
+      appendLine(result.message)
+    } else if (result.kind === 'ui') {
+      onUiCommand(result.command)
+    } else {
+      const sent = send(result.action)
+      if (sent.rejected) appendLine(`INVALID: ${sent.reason}`)
+    }
+    setValue('')
+  }
+
+  return (
+    <form className="command-line" onSubmit={submit} data-testid="command-form">
+      <label className="command-line">
+        <span aria-hidden="true">{'>'}</span>
+        <input
+          type="text"
+          value={value}
+          onChange={(e) => setValue(e.target.value)}
+          data-testid="command-input"
+          aria-label="command input"
+          autoComplete="off"
+          spellCheck={false}
+        />
+      </label>
+      <div className="command-output" data-testid="command-output">
+        {output.map((line, i) => (
+          <div key={`${i}-${line}`}>{line}</div>
+        ))}
+      </div>
+    </form>
+  )
+}
diff --git a/src/app/terminal/MenuRows.tsx b/src/app/terminal/MenuRows.tsx
new file mode 100644
index 0000000..7b60822
--- /dev/null
+++ b/src/app/terminal/MenuRows.tsx
@@ -0,0 +1,82 @@
+// Numbered rows selectable by numeric key, arrow keys plus Enter, or tap. All
+// three paths resolve to a single onSelect(id) callback, so the action the
+// parent dispatches is identical by construction. The hidden fourth row is
+// simply not passed in until the engine unlock selector includes it, so it is
+// absent from the DOM when locked, not merely hidden.
+import { useState } from 'react'
+import type { KeyboardEvent } from 'react'
+import { shouldHandleKey } from '../a11y/keyHandler'
+import './terminal.css'
+
+export interface MenuRowItem {
+  readonly id: string
+  readonly label: string
+}
+
+export interface MenuRowsProps {
+  readonly rows: readonly MenuRowItem[]
+  readonly onSelect: (id: string) => void
+}
+
+export function MenuRows({ rows, onSelect }: MenuRowsProps) {
+  const [selected, setSelected] = useState(0)
+
+  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
+    if (
+      !shouldHandleKey({
+        key: event.key,
+        ctrlKey: event.ctrlKey,
+        metaKey: event.metaKey,
+        altKey: event.altKey,
+        isComposing: event.nativeEvent.isComposing,
+        target: event.target,
+      })
+    ) {
+      return
+    }
+    if (/^[1-9]$/.test(event.key)) {
+      const digit = Number(event.key)
+      if (digit <= rows.length) {
+        event.preventDefault()
+        onSelect(rows[digit - 1]!.id)
+      }
+      return
+    }
+    if (event.key === 'ArrowDown') {
+      event.preventDefault()
+      setSelected((s) => Math.min(rows.length - 1, s + 1))
+    } else if (event.key === 'ArrowUp') {
+      event.preventDefault()
+      setSelected((s) => Math.max(0, s - 1))
+    } else if (event.key === 'Enter') {
+      event.preventDefault()
+      const row = rows[selected]
+      if (row) onSelect(row.id)
+    }
+  }
+
+  return (
+    <ul
+      className="menu-rows"
+      role="menu"
+      tabIndex={0}
+      onKeyDown={onKeyDown}
+      data-testid="menu-rows"
+    >
+      {rows.map((row, i) => (
+        <li key={row.id}>
+          <button
+            type="button"
+            className="menu-row"
+            role="menuitem"
+            data-selected={i === selected ? 'true' : 'false'}
+            data-testid={`menu-row-${row.id}`}
+            onClick={() => onSelect(row.id)}
+          >
+            {`${i + 1}. ${row.label}`}
+          </button>
+        </li>
+      ))}
+    </ul>
+  )
+}
diff --git a/src/app/terminal/TerminalText.tsx b/src/app/terminal/TerminalText.tsx
new file mode 100644
index 0000000..0017e71
--- /dev/null
+++ b/src/app/terminal/TerminalText.tsx
@@ -0,0 +1,36 @@
+import type { ReactNode } from 'react'
+import './terminal.css'
+
+/** A styled text block respecting the terminal rhythm (pre/output semantics,
+ *  CRT theme tokens). dim renders secondary text. */
+export function TerminalText({
+  children,
+  dim,
+}: {
+  readonly children: ReactNode
+  readonly dim?: boolean
+}) {
+  return (
+    <pre className="terminal-text" data-dim={dim ? 'true' : 'false'}>
+      {children}
+    </pre>
+  )
+}
+
+/** A single-line status readout. */
+export function StatusLine({ children }: { readonly children: ReactNode }) {
+  return (
+    <div className="terminal-status" role="status" data-testid="status-line">
+      {children}
+    </div>
+  )
+}
+
+/** A secondary detail region. */
+export function DetailPane({ children }: { readonly children: ReactNode }) {
+  return (
+    <div className="terminal-detail" data-testid="detail-pane">
+      {children}
+    </div>
+  )
+}
diff --git a/src/app/terminal/commandGrammar.ts b/src/app/terminal/commandGrammar.ts
new file mode 100644
index 0000000..d544c35
--- /dev/null
+++ b/src/app/terminal/commandGrammar.ts
@@ -0,0 +1,97 @@
+// The command line grammar. Input is normalized (trim, collapse internal
+// whitespace, upper-case), verb-first. Verbs are registered by the shell and
+// by screens (missions register per-screen verbs); an active screen's verbs
+// shadow shell verbs. A colliding registration in the same scope throws at
+// registration time so a mission cannot silently stomp a shell verb. Parsing
+// yields the same typed engine action a button would dispatch, a local UI
+// command (overlays), or an error line.
+import type { CampaignAction } from '@engine'
+
+export type LocalUiCommand =
+  | { readonly kind: 'OPEN_HELP' }
+  | { readonly kind: 'OPEN_SETTINGS' }
+  | { readonly kind: 'CLOSE_OVERLAY' }
+  | { readonly kind: 'LIST_GAMES' }
+  | { readonly kind: 'ACKNOWLEDGE' }
+  | { readonly kind: 'SET_SOUND'; readonly on: boolean }
+
+export type ParseResult =
+  | { readonly kind: 'action'; readonly action: CampaignAction }
+  | { readonly kind: 'ui'; readonly command: LocalUiCommand }
+  | { readonly kind: 'error'; readonly message: string }
+
+export interface VerbRegistration {
+  readonly verb: string
+  parse(tokens: readonly string[]): ParseResult
+  readonly helpText: string
+}
+
+const shellVerbs = new Map<string, VerbRegistration>()
+const screenVerbs = new Map<string, Map<string, VerbRegistration>>()
+
+export function normalizeCommand(raw: string): string[] {
+  const collapsed = raw.trim().replace(/\s+/g, ' ').toUpperCase()
+  return collapsed.length === 0 ? [] : collapsed.split(' ')
+}
+
+export function registerShellVerb(reg: VerbRegistration): void {
+  const verb = reg.verb.toUpperCase()
+  if (shellVerbs.has(verb)) {
+    throw new Error(`command: shell verb ${verb} already registered`)
+  }
+  shellVerbs.set(verb, { ...reg, verb })
+}
+
+export function registerScreenVerbs(
+  screenId: string,
+  regs: readonly VerbRegistration[],
+): void {
+  const scope = screenVerbs.get(screenId) ?? new Map<string, VerbRegistration>()
+  for (const reg of regs) {
+    const verb = reg.verb.toUpperCase()
+    if (scope.has(verb)) {
+      throw new Error(
+        `command: screen verb ${verb} already registered on ${screenId}`,
+      )
+    }
+    scope.set(verb, { ...reg, verb })
+  }
+  screenVerbs.set(screenId, scope)
+}
+
+/** Active-screen verbs shadow shell verbs. */
+export function resolveVerb(
+  verb: string,
+  activeScreen: string,
+): VerbRegistration | null {
+  const upper = verb.toUpperCase()
+  return screenVerbs.get(activeScreen)?.get(upper) ?? shellVerbs.get(upper) ?? null
+}
+
+export function parseCommand(raw: string, activeScreen: string): ParseResult {
+  const tokens = normalizeCommand(raw)
+  if (tokens.length === 0) {
+    return { kind: 'error', message: 'UNRECOGNIZED COMMAND' }
+  }
+  const [verb, ...args] = tokens
+  const reg = resolveVerb(verb!, activeScreen)
+  if (!reg) {
+    return { kind: 'error', message: `UNRECOGNIZED COMMAND: ${tokens.join(' ')}` }
+  }
+  return reg.parse(args)
+}
+
+/** The verbs visible in HELP for a screen: its own plus the shell verbs it
+ *  does not shadow, in a stable order. */
+export function verbsForScreen(activeScreen: string): VerbRegistration[] {
+  const own = screenVerbs.get(activeScreen) ?? new Map()
+  const merged = new Map<string, VerbRegistration>(shellVerbs)
+  for (const [verb, reg] of own) merged.set(verb, reg)
+  return [...merged.values()].sort((a, b) => (a.verb < b.verb ? -1 : 1))
+}
+
+/** Test-only. */
+export function __resetGrammar(): void {
+  shellVerbs.clear()
+  screenVerbs.clear()
+}
diff --git a/src/app/terminal/helpRegistry.ts b/src/app/terminal/helpRegistry.ts
new file mode 100644
index 0000000..6f0b777
--- /dev/null
+++ b/src/app/terminal/helpRegistry.ts
@@ -0,0 +1,87 @@
+// Context-sensitive HELP and the default verb set. HELP lists exactly the
+// verbs valid on the active screen (its own plus the unshadowed shell verbs).
+// LIST GAMES is registered only on the menu screen, so it appears in idle
+// HELP and nowhere else: when a mission is active the phase screen is not the
+// menu, so the verb is simply out of scope.
+import {
+  registerScreenVerbs,
+  registerShellVerb,
+  verbsForScreen,
+  type ParseResult,
+  type VerbRegistration,
+} from './commandGrammar'
+
+export interface HelpLine {
+  readonly verb: string
+  readonly helpText: string
+}
+
+export function getContextHelp(activeScreen: string): HelpLine[] {
+  return verbsForScreen(activeScreen).map((reg) => ({
+    verb: reg.verb,
+    helpText: reg.helpText,
+  }))
+}
+
+const ok = (command: ParseResult): ParseResult => command
+
+const SHELL_VERBS: VerbRegistration[] = [
+  {
+    verb: 'HELP',
+    helpText: 'HELP           list the commands available here',
+    parse: () => ok({ kind: 'ui', command: { kind: 'OPEN_HELP' } }),
+  },
+  {
+    verb: 'SETTINGS',
+    helpText: 'SETTINGS       open settings',
+    parse: () => ok({ kind: 'ui', command: { kind: 'OPEN_SETTINGS' } }),
+  },
+  {
+    verb: 'SOUND',
+    helpText: 'SOUND ON|OFF   toggle sound',
+    parse: (tokens) => {
+      const arg = tokens[0]
+      if (arg === 'ON') return { kind: 'ui', command: { kind: 'SET_SOUND', on: true } }
+      if (arg === 'OFF') return { kind: 'ui', command: { kind: 'SET_SOUND', on: false } }
+      return { kind: 'error', message: 'SOUND EXPECTS ON OR OFF' }
+    },
+  },
+]
+
+const MENU_VERBS: VerbRegistration[] = [
+  {
+    verb: 'LIST',
+    helpText: 'LIST GAMES     list the games this machine knows',
+    parse: (tokens) =>
+      tokens[0] === 'GAMES'
+        ? { kind: 'ui', command: { kind: 'LIST_GAMES' } }
+        : { kind: 'error', message: 'DID YOU MEAN LIST GAMES' },
+  },
+]
+
+const DEBRIEF_VERBS: VerbRegistration[] = [
+  {
+    verb: 'ACKNOWLEDGE',
+    helpText: 'ACKNOWLEDGE    acknowledge this debrief',
+    parse: () => ({ kind: 'ui', command: { kind: 'ACKNOWLEDGE' } }),
+  },
+]
+
+let defaultsRegistered = false
+
+/** Register the built-in shell and screen verbs. Idempotent: a second call
+ *  (HMR, a repeated init, StrictMode) is a no-op rather than a collision
+ *  throw. The grammar reset in tests clears the registries; call
+ *  __resetDefaultVerbs alongside it so the guard re-arms. */
+export function registerDefaultVerbs(): void {
+  if (defaultsRegistered) return
+  for (const reg of SHELL_VERBS) registerShellVerb(reg)
+  registerScreenVerbs('menu', MENU_VERBS)
+  registerScreenVerbs('debrief', DEBRIEF_VERBS)
+  defaultsRegistered = true
+}
+
+/** Test-only: re-arm the idempotence guard after __resetGrammar. */
+export function __resetDefaultVerbs(): void {
+  defaultsRegistered = false
+}
diff --git a/src/app/terminal/index.ts b/src/app/terminal/index.ts
new file mode 100644
index 0000000..bc88996
--- /dev/null
+++ b/src/app/terminal/index.ts
@@ -0,0 +1,20 @@
+export { TerminalText, StatusLine, DetailPane } from './TerminalText'
+export { MenuRows, type MenuRowItem, type MenuRowsProps } from './MenuRows'
+export { ActionBar, type ActionBarItem } from './ActionBar'
+export { CommandInput, type CommandInputProps } from './CommandInput'
+export {
+  parseCommand,
+  normalizeCommand,
+  registerShellVerb,
+  registerScreenVerbs,
+  resolveVerb,
+  verbsForScreen,
+  type VerbRegistration,
+  type ParseResult,
+  type LocalUiCommand,
+} from './commandGrammar'
+export {
+  getContextHelp,
+  registerDefaultVerbs,
+  type HelpLine,
+} from './helpRegistry'
diff --git a/src/app/terminal/terminal.css b/src/app/terminal/terminal.css
new file mode 100644
index 0000000..7c3855b
--- /dev/null
+++ b/src/app/terminal/terminal.css
@@ -0,0 +1,75 @@
+/* Structural terminal layout only; color and type come from the CRT theme
+   custom properties. Left-aligned column, generous row rhythm. */
+.terminal-text {
+  margin: 0;
+  white-space: pre-wrap;
+  font-family: var(--font-terminal);
+  color: var(--color-glyph);
+}
+.terminal-text[data-dim='true'] {
+  color: var(--color-dim);
+}
+
+.menu-rows {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+}
+.menu-rows li {
+  margin: 0;
+}
+.menu-row {
+  display: block;
+  width: 100%;
+  text-align: left;
+  background: transparent;
+  border: 0;
+  color: var(--color-glyph);
+  font: inherit;
+  padding: 0.1em 0;
+  cursor: pointer;
+}
+.menu-row[data-selected='true'] {
+  color: var(--color-focus);
+}
+.menu-row[data-selected='true']::before {
+  content: '> ';
+}
+.menu-row[data-selected='false']::before {
+  content: '  ';
+}
+
+.action-bar {
+  display: flex;
+  gap: 1ch;
+  flex-wrap: wrap;
+  align-items: baseline;
+}
+.action-bar button {
+  background: transparent;
+  border: 1px solid var(--color-dim);
+  color: var(--color-glyph);
+  font: inherit;
+  padding: 0.1em 0.6em;
+  cursor: pointer;
+}
+.action-rejection {
+  color: var(--color-amber);
+}
+
+.command-line {
+  display: flex;
+  gap: 1ch;
+  align-items: baseline;
+}
+.command-line input {
+  flex: 1;
+  background: transparent;
+  border: 0;
+  border-bottom: 1px solid var(--color-dim);
+  color: var(--color-glyph);
+  font: inherit;
+}
+.command-output div {
+  color: var(--color-dim);
+}
diff --git a/test/app/screens/debriefScreen.test.tsx b/test/app/screens/debriefScreen.test.tsx
new file mode 100644
index 0000000..7079a89
--- /dev/null
+++ b/test/app/screens/debriefScreen.test.tsx
@@ -0,0 +1,62 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { DebriefScreen, MenuScreen, ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function settle(missionId: string): void {
+  act(() => {
+    send({ type: 'START_MISSION', missionId })
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+  })
+}
+
+describe('DebriefScreen', () => {
+  it('the ACKNOWLEDGE button dispatches ACKNOWLEDGE_DEBRIEF and returns to menu', () => {
+    settle('alpha')
+    expect(getState().phase).toBe('debrief')
+    render(<DebriefScreen />)
+    fireEvent.click(screen.getByTestId('acknowledge-button'))
+    expect(getState().acknowledgedDebriefs).toContain('alpha')
+    expect(getState().phase).toBe('menu')
+  })
+
+  it('the ACKNOWLEDGE command also acknowledges the debrief', () => {
+    settle('alpha')
+    render(<ScreenRouter />)
+    expect(screen.getByTestId('debrief-screen')).toBeInTheDocument()
+    const input = screen.getByTestId('command-input')
+    fireEvent.change(input, { target: { value: 'acknowledge' } })
+    fireEvent.submit(screen.getByTestId('command-form'))
+    expect(getState().acknowledgedDebriefs).toContain('alpha')
+  })
+
+  it('after the third acknowledgment the menu shows the fourth row', () => {
+    for (const missionId of ['alpha', 'beta', 'gamma']) {
+      settle(missionId)
+      act(() => {
+        send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId })
+      })
+    }
+    render(<MenuScreen />)
+    expect(screen.getByTestId('menu-row-finale')).toBeInTheDocument()
+  })
+})
diff --git a/test/app/screens/harness.ts b/test/app/screens/harness.ts
new file mode 100644
index 0000000..fe1ff46
--- /dev/null
+++ b/test/app/screens/harness.ts
@@ -0,0 +1,17 @@
+import { buildCtx, memoryPort, resetAll as resetState } from '../state/harness'
+import { __resetGrammar } from '@app/terminal/commandGrammar'
+import { __resetDefaultVerbs } from '@app/terminal/helpRegistry'
+import { __resetScreenRegistry } from '@app/screens/screenRegistry'
+import { __resetInputStack } from '@app/screens/inputStack'
+import { __resetAnnounce } from '@app/a11y/announce'
+
+export { buildCtx, memoryPort }
+
+export function resetAll(): void {
+  resetState()
+  __resetGrammar()
+  __resetDefaultVerbs()
+  __resetScreenRegistry()
+  __resetInputStack()
+  __resetAnnounce()
+}
diff --git a/test/app/screens/menuScreen.test.tsx b/test/app/screens/menuScreen.test.tsx
new file mode 100644
index 0000000..71a5f4e
--- /dev/null
+++ b/test/app/screens/menuScreen.test.tsx
@@ -0,0 +1,70 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { MenuScreen, registerMissionTitle } from '@app/screens'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerMissionTitle('alpha', 'CRASH OUTLOOK')
+  registerMissionTitle('beta', 'GROUND ALL FLIGHTS')
+  registerMissionTitle('gamma', 'FREEZE BANK ACCOUNTS')
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function settleAndAck(missionId: string): void {
+  act(() => {
+    send({ type: 'START_MISSION', missionId })
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId })
+  })
+}
+
+describe('MenuScreen', () => {
+  it('renders the greeting and the three mission rows', () => {
+    render(<MenuScreen />)
+    const text = screen.getByTestId('menu-screen').textContent ?? ''
+    expect(text).toContain('GREETINGS PROFESSOR FALKEN')
+    expect(text).toContain('SHALL WE PLAY A GAME?')
+    expect(text).toContain('1. CRASH OUTLOOK')
+    expect(text).toContain('2. GROUND ALL FLIGHTS')
+    expect(text).toContain('3. FREEZE BANK ACCOUNTS')
+  })
+
+  it('selecting an unsettled mission dispatches START_MISSION', () => {
+    render(<MenuScreen />)
+    fireEvent.click(screen.getByTestId('menu-row-alpha'))
+    expect(getState().activeMission?.missionId).toBe('alpha')
+  })
+
+  it('the fourth row is absent until all three debriefs are acknowledged', () => {
+    render(<MenuScreen />)
+    expect(screen.queryByTestId('menu-row-finale')).toBeNull()
+    settleAndAck('alpha')
+    settleAndAck('beta')
+    expect(screen.queryByTestId('menu-row-finale')).toBeNull()
+    settleAndAck('gamma')
+    expect(screen.getByTestId('menu-row-finale')).toBeInTheDocument()
+  })
+
+  it('selecting a settled mission opens its record view', () => {
+    settleAndAck('alpha')
+    render(<MenuScreen />)
+    fireEvent.click(screen.getByTestId('menu-row-alpha'))
+    expect(screen.getByTestId('record-view')).toHaveAttribute(
+      'data-mission-id',
+      'alpha',
+    )
+  })
+})
diff --git a/test/app/screens/precedence.test.ts b/test/app/screens/precedence.test.ts
new file mode 100644
index 0000000..ca9c7b5
--- /dev/null
+++ b/test/app/screens/precedence.test.ts
@@ -0,0 +1,64 @@
+import { describe, expect, it } from 'vitest'
+import {
+  resolvePrecedence,
+  type PrecedenceState,
+} from '@app/screens/precedence'
+import type { KeyLike } from '@app/a11y/keyHandler'
+
+const base: PrecedenceState = {
+  dialogOpen: false,
+  promptAnswerKeys: null,
+  typeInRunning: false,
+}
+const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({
+  key: k,
+  ...extra,
+})
+
+describe('input precedence stack (top wins)', () => {
+  it('an open dialog consumes every key', () => {
+    expect(resolvePrecedence({ ...base, dialogOpen: true }, key('1'))).toEqual({
+      kind: 'dialog',
+    })
+  })
+
+  it('a prompt consumes its answer keys; other keys fall through', () => {
+    const state = { ...base, promptAnswerKeys: ['Y', 'N'] }
+    expect(resolvePrecedence(state, key('Y'))).toEqual({
+      kind: 'prompt-answer',
+      key: 'Y',
+    })
+    expect(resolvePrecedence(state, key('X'))).toEqual({ kind: 'screen' })
+  })
+
+  it('Y during the sound prompt answers it and does not skip a running type-in', () => {
+    const state = { ...base, promptAnswerKeys: ['Y', 'N'], typeInRunning: true }
+    expect(resolvePrecedence(state, key('Y'))).toEqual({
+      kind: 'prompt-answer',
+      key: 'Y',
+    })
+  })
+
+  it('pressing 1 during a type-in completes it and is swallowed (no row select)', () => {
+    expect(
+      resolvePrecedence({ ...base, typeInRunning: true }, key('1')),
+    ).toEqual({ kind: 'complete-type-in' })
+  })
+
+  it('menu shortcuts are ignored while an editable target is focused', () => {
+    const input = document.createElement('input')
+    expect(resolvePrecedence(base, key('1', { target: input }))).toEqual({
+      kind: 'ignore',
+    })
+  })
+
+  it('a held modifier bails out of screen shortcuts', () => {
+    expect(resolvePrecedence(base, key('1', { ctrlKey: true }))).toEqual({
+      kind: 'ignore',
+    })
+  })
+
+  it('a plain key reaches screen shortcuts', () => {
+    expect(resolvePrecedence(base, key('1'))).toEqual({ kind: 'screen' })
+  })
+})
diff --git a/test/app/screens/screenRouter.test.tsx b/test/app/screens/screenRouter.test.tsx
new file mode 100644
index 0000000..2048683
--- /dev/null
+++ b/test/app/screens/screenRouter.test.tsx
@@ -0,0 +1,80 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { ScreenRouter, registerMissionScreen } from '@app/screens'
+import { setTypeIn } from '@app/screens/inputStack'
+import { registerDefaultVerbs } from '@app/terminal'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+const deliver = () =>
+  send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+
+describe('ScreenRouter phase mapping', () => {
+  it('renders menu, then mission, then debrief as the engine phase changes', () => {
+    render(<ScreenRouter />)
+    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    expect(screen.getByTestId('mission-frame')).toBeInTheDocument()
+    act(() => {
+      deliver()
+      deliver()
+      deliver()
+    })
+    expect(screen.getByTestId('debrief-screen')).toBeInTheDocument()
+  })
+
+  it('renders the fallback frame for an unregistered mission', () => {
+    render(<ScreenRouter />)
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    expect(screen.getByTestId('mission-frame')).toBeInTheDocument()
+  })
+
+  it('mounts a registered mission screen keyed by its id', () => {
+    registerMissionScreen('alpha', ({ missionId }) => (
+      <div data-testid="custom-mission">{`CUSTOM ${missionId}`}</div>
+    ))
+    render(<ScreenRouter />)
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    expect(screen.getByTestId('custom-mission')).toHaveTextContent(
+      'CUSTOM alpha',
+    )
+  })
+
+  it('moves focus to the new screen root', () => {
+    render(<ScreenRouter />)
+    expect(document.activeElement).toBe(screen.getByTestId('screen-root'))
+  })
+
+  it('a running type-in swallows a menu key: 1 completes it, no row selected', () => {
+    // The precedence stack is wired live: the capture handler at the screen
+    // root resolves precedence before MenuRows can act.
+    const complete = vi.fn()
+    setTypeIn(true, complete)
+    render(<ScreenRouter />)
+    fireEvent.keyDown(screen.getByTestId('screen-root'), { key: '1' })
+    expect(complete).toHaveBeenCalledTimes(1)
+    // The menu row was not selected, so no mission started.
+    expect(getState().activeMission).toBeNull()
+  })
+})
diff --git a/test/app/terminal/commandGrammar.test.ts b/test/app/terminal/commandGrammar.test.ts
new file mode 100644
index 0000000..1a27af4
--- /dev/null
+++ b/test/app/terminal/commandGrammar.test.ts
@@ -0,0 +1,75 @@
+import { beforeEach, describe, expect, it } from 'vitest'
+import {
+  __resetGrammar,
+  normalizeCommand,
+  parseCommand,
+  registerScreenVerbs,
+  registerShellVerb,
+} from '@app/terminal/commandGrammar'
+
+beforeEach(() => __resetGrammar())
+
+describe('normalize', () => {
+  it('trims, collapses internal whitespace, and upper-cases', () => {
+    expect(normalizeCommand('  read   m03 ')).toEqual(['READ', 'M03'])
+    expect(normalizeCommand('')).toEqual([])
+    expect(normalizeCommand('   ')).toEqual([])
+  })
+})
+
+describe('parse', () => {
+  it('resolves a shell verb verb-first', () => {
+    registerShellVerb({
+      verb: 'HELP',
+      helpText: 'h',
+      parse: () => ({ kind: 'ui', command: { kind: 'OPEN_HELP' } }),
+    })
+    expect(parseCommand('help', 'menu')).toEqual({
+      kind: 'ui',
+      command: { kind: 'OPEN_HELP' },
+    })
+  })
+
+  it('an active-screen mission verb shadows the shell verb', () => {
+    registerShellVerb({
+      verb: 'READ',
+      helpText: 'shell',
+      parse: () => ({ kind: 'ui', command: { kind: 'OPEN_HELP' } }),
+    })
+    registerScreenVerbs('mission:alpha', [
+      {
+        verb: 'READ',
+        helpText: 'mission',
+        parse: () => ({ kind: 'error', message: 'MISSION READ' }),
+      },
+    ])
+    expect(parseCommand('read x', 'mission:alpha')).toEqual({
+      kind: 'error',
+      message: 'MISSION READ',
+    })
+    // On a screen without the mission verb, the shell verb resolves.
+    expect(parseCommand('read x', 'menu').kind).toBe('ui')
+  })
+
+  it('a colliding registration throws at registration time', () => {
+    registerShellVerb({
+      verb: 'HELP',
+      helpText: 'h',
+      parse: () => ({ kind: 'error', message: 'x' }),
+    })
+    expect(() =>
+      registerShellVerb({
+        verb: 'HELP',
+        helpText: 'h2',
+        parse: () => ({ kind: 'error', message: 'y' }),
+      }),
+    ).toThrow(/already registered/)
+  })
+
+  it('unknown input renders UNRECOGNIZED COMMAND with the normalized input', () => {
+    expect(parseCommand('frobnicate now', 'menu')).toEqual({
+      kind: 'error',
+      message: 'UNRECOGNIZED COMMAND: FROBNICATE NOW',
+    })
+  })
+})
diff --git a/test/app/terminal/commandInput.test.tsx b/test/app/terminal/commandInput.test.tsx
new file mode 100644
index 0000000..a7558aa
--- /dev/null
+++ b/test/app/terminal/commandInput.test.tsx
@@ -0,0 +1,85 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init } from '@app/state'
+import {
+  CommandInput,
+  parseCommand,
+  registerScreenVerbs,
+  registerDefaultVerbs,
+} from '@app/terminal'
+import type { CampaignAction } from '@engine'
+import { buildCtx, memoryPort, resetAll } from '../screens/harness'
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  registerDefaultVerbs()
+  // A verb that maps to an engine action, for rejection and identity tests.
+  registerScreenVerbs('menu', [
+    {
+      verb: 'DELIVER',
+      helpText: 'DELIVER   deliver a token',
+      parse: () => ({
+        kind: 'action',
+        action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
+      }),
+    },
+    {
+      verb: 'QUIT',
+      helpText: 'QUIT   forfeit',
+      parse: () => ({
+        kind: 'action',
+        action: { type: 'FORFEIT_MISSION' },
+      }),
+    },
+  ])
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+  cleanup()
+})
+
+function type(text: string): void {
+  const input = screen.getByTestId('command-input')
+  fireEvent.change(input, { target: { value: text } })
+  fireEvent.submit(screen.getByTestId('command-form'))
+}
+
+describe('CommandInput', () => {
+  it('prints UNRECOGNIZED COMMAND for unparseable input', () => {
+    render(<CommandInput activeScreen="menu" onUiCommand={() => {}} />)
+    type('frobnicate now')
+    expect(screen.getByTestId('command-output').textContent).toContain(
+      'UNRECOGNIZED COMMAND: FROBNICATE NOW',
+    )
+  })
+
+  it('prints INVALID with the engine reason for a rejected action', () => {
+    render(<CommandInput activeScreen="menu" onUiCommand={() => {}} />)
+    // No active mission on the menu: MISSION_ACTION is rejected.
+    type('deliver')
+    expect(screen.getByTestId('command-output').textContent).toMatch(
+      /^INVALID: /,
+    )
+  })
+
+  it('routes a UI command to the handler', () => {
+    const onUiCommand = vi.fn()
+    render(<CommandInput activeScreen="menu" onUiCommand={onUiCommand} />)
+    type('help')
+    expect(onUiCommand).toHaveBeenCalledWith({ kind: 'OPEN_HELP' })
+  })
+
+  it('command-button identity: the parsed action equals the button action', () => {
+    // The QUIT verb and a FORFEIT ActionBar button produce the identical
+    // engine action value.
+    const parsed = parseCommand('quit', 'menu')
+    const buttonAction: CampaignAction = { type: 'FORFEIT_MISSION' }
+    expect(parsed).toEqual({ kind: 'action', action: buttonAction })
+  })
+})
diff --git a/test/app/terminal/helpRegistry.test.ts b/test/app/terminal/helpRegistry.test.ts
new file mode 100644
index 0000000..ebf11fe
--- /dev/null
+++ b/test/app/terminal/helpRegistry.test.ts
@@ -0,0 +1,36 @@
+import { beforeEach, describe, expect, it } from 'vitest'
+import { __resetGrammar } from '@app/terminal/commandGrammar'
+import {
+  __resetDefaultVerbs,
+  getContextHelp,
+  registerDefaultVerbs,
+} from '@app/terminal/helpRegistry'
+
+beforeEach(() => {
+  __resetGrammar()
+  __resetDefaultVerbs()
+  registerDefaultVerbs()
+})
+
+describe('context HELP', () => {
+  it('lists the verbs valid on the active screen', () => {
+    const verbs = getContextHelp('menu').map((h) => h.verb)
+    expect(verbs).toContain('HELP')
+    expect(verbs).toContain('SETTINGS')
+    expect(verbs).toContain('LIST')
+  })
+
+  it('LIST GAMES appears only in idle (menu) help, nowhere else', () => {
+    expect(getContextHelp('menu').some((h) => h.verb === 'LIST')).toBe(true)
+    expect(getContextHelp('mission:alpha').some((h) => h.verb === 'LIST')).toBe(
+      false,
+    )
+    expect(getContextHelp('debrief').some((h) => h.verb === 'LIST')).toBe(false)
+  })
+
+  it('the debrief screen exposes ACKNOWLEDGE in its help', () => {
+    expect(getContextHelp('debrief').some((h) => h.verb === 'ACKNOWLEDGE')).toBe(
+      true,
+    )
+  })
+})
diff --git a/test/app/terminal/menuRows.test.tsx b/test/app/terminal/menuRows.test.tsx
new file mode 100644
index 0000000..504f1a6
--- /dev/null
+++ b/test/app/terminal/menuRows.test.tsx
@@ -0,0 +1,44 @@
+import { afterEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { MenuRows, type MenuRowItem } from '@app/terminal'
+
+afterEach(cleanup)
+
+const rows3: MenuRowItem[] = [
+  { id: 'a', label: 'CRASH OUTLOOK' },
+  { id: 'b', label: 'GROUND ALL FLIGHTS' },
+  { id: 'c', label: 'FREEZE BANK ACCOUNTS' },
+]
+
+describe('MenuRows selection', () => {
+  it('numeric, arrows+Enter, and tap all select the same id', () => {
+    const onSelect = vi.fn()
+    render(<MenuRows rows={rows3} onSelect={onSelect} />)
+    const list = screen.getByTestId('menu-rows')
+    fireEvent.keyDown(list, { key: '1' }) // numeric -> a
+    fireEvent.keyDown(list, { key: 'Enter' }) // selected index 0 -> a
+    fireEvent.click(screen.getByTestId('menu-row-a')) // tap -> a
+    expect(onSelect).toHaveBeenCalledTimes(3)
+    expect(onSelect.mock.calls.every((c) => c[0] === 'a')).toBe(true)
+  })
+
+  it('arrow keys move the selection before Enter commits', () => {
+    const onSelect = vi.fn()
+    render(<MenuRows rows={rows3} onSelect={onSelect} />)
+    const list = screen.getByTestId('menu-rows')
+    fireEvent.keyDown(list, { key: 'ArrowDown' })
+    fireEvent.keyDown(list, { key: 'Enter' })
+    expect(onSelect).toHaveBeenCalledWith('b')
+  })
+
+  it('a fourth row appears only when passed and is selectable by every path', () => {
+    const onSelect = vi.fn()
+    const rows4 = [...rows3, { id: 'finale', label: 'GLOBAL FAILSAFE' }]
+    render(<MenuRows rows={rows4} onSelect={onSelect} />)
+    const list = screen.getByTestId('menu-rows')
+    expect(screen.getByTestId('menu-row-finale')).toBeInTheDocument()
+    fireEvent.keyDown(list, { key: '4' })
+    fireEvent.click(screen.getByTestId('menu-row-finale'))
+    expect(onSelect.mock.calls.filter((c) => c[0] === 'finale')).toHaveLength(2)
+  })
+})
