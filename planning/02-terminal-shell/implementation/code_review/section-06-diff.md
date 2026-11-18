diff --git a/src/app/a11y/GlossaryTerm.tsx b/src/app/a11y/GlossaryTerm.tsx
new file mode 100644
index 0000000..d862003
--- /dev/null
+++ b/src/app/a11y/GlossaryTerm.tsx
@@ -0,0 +1,25 @@
+// Glossary term primitive stand-in. Section 09 builds the real
+// focus-and-tap-friendly definition popover with the per-project glossary;
+// this renders the term with its definition as an accessible description, so
+// settings and mission copy can wrap jargon now and section 09 upgrades the
+// presentation without touching callers.
+import type { ReactNode } from 'react'
+
+export interface GlossaryTermProps {
+  readonly term: ReactNode
+  /** Plain-language definition for a smart layperson. */
+  readonly definition: string
+}
+
+export function GlossaryTerm({ term, definition }: GlossaryTermProps) {
+  return (
+    <abbr
+      className="glossary-term"
+      title={definition}
+      data-testid="glossary-term"
+      tabIndex={0}
+    >
+      {term}
+    </abbr>
+  )
+}
diff --git a/src/app/a11y/motion.ts b/src/app/a11y/motion.ts
index 8e555ed..8070dd1 100644
--- a/src/app/a11y/motion.ts
+++ b/src/app/a11y/motion.ts
@@ -1,7 +1,48 @@
 // Motion-preference stand-in. Section 09 owns the real useMotionPreference
 // hook that composes the media query with an in-app override; this reads the
-// media query so the push-in and type-in can honor reduced motion now.
-export function prefersReducedMotion(): boolean {
+// media query plus a session in-app override so settings can flip motion now
+// and every consumer sees one truth.
+import { useSyncExternalStore } from 'react'
+
+export type MotionOverride = 'reduce' | 'full' | null // null = follow system
+
+let override: MotionOverride = null
+const listeners = new Set<() => void>()
+
+function systemReducedMotion(): boolean {
   if (typeof window === 'undefined' || !window.matchMedia) return false
   return window.matchMedia('(prefers-reduced-motion: reduce)').matches
 }
+
+/** The composed truth: an explicit override wins, else the system setting. */
+export function prefersReducedMotion(): boolean {
+  if (override === 'reduce') return true
+  if (override === 'full') return false
+  return systemReducedMotion()
+}
+
+export function getMotionOverride(): MotionOverride {
+  return override
+}
+
+export function setMotionOverride(next: MotionOverride): void {
+  override = next
+  for (const listener of listeners) listener()
+}
+
+export function useReducedMotion(): boolean {
+  return useSyncExternalStore(
+    (l) => {
+      listeners.add(l)
+      return () => listeners.delete(l)
+    },
+    prefersReducedMotion,
+    prefersReducedMotion,
+  )
+}
+
+/** Test-only. */
+export function __resetMotion(): void {
+  override = null
+  listeners.clear()
+}
diff --git a/src/app/audio/index.ts b/src/app/audio/index.ts
index 1772688..37a5dc8 100644
--- a/src/app/audio/index.ts
+++ b/src/app/audio/index.ts
@@ -4,6 +4,8 @@
 // master sound preference both the sound prompt and the settings switch read
 // and write (never a shadow copy), and no-op cue hooks section 07 fills in.
 
+import { useSyncExternalStore } from 'react'
+
 const PREF_KEY = 'wargames.sound'
 
 export interface AudioPort {
@@ -50,39 +52,93 @@ export function resumeAudio(): void {
 
 export type SoundPreference = 'on' | 'off'
 
+// The full preference set section 07 persists. master is the single value the
+// diegetic hero prompt and the settings master switch both back (no shadow
+// copy). A corrupt read falls to muted defaults.
+export interface AudioPrefs {
+  readonly master: boolean
+  readonly voice: boolean
+  readonly effects: boolean
+  readonly ambience: boolean
+}
+
+const PREFS_KEY = 'wargames.audio.prefs'
+const DEFAULT_PREFS: AudioPrefs = {
+  master: false,
+  voice: true,
+  effects: true,
+  ambience: true,
+}
+
 const prefListeners = new Set<() => void>()
 // In-memory is the session source of truth (and works where localStorage is
 // blocked, e.g. Safari private mode or a headless test env); localStorage is
 // the cross-reload persistence layer, read lazily and written on set.
-let pref: SoundPreference | null | undefined
+let prefs: AudioPrefs | undefined
+// Whether master was ever explicitly configured (so the hero prompt, which
+// gates on this, does not reappear once answered).
+let masterConfigured: boolean | undefined
 
-function loadPref(): SoundPreference | null {
-  if (pref !== undefined) return pref
+function load(): AudioPrefs {
+  if (prefs !== undefined) return prefs
   try {
-    const raw = window.localStorage.getItem(PREF_KEY)
-    pref = raw === 'on' || raw === 'off' ? raw : null
+    const raw = window.localStorage.getItem(PREFS_KEY)
+    if (raw) {
+      const parsed = JSON.parse(raw) as Partial<AudioPrefs> & {
+        configured?: boolean
+      }
+      prefs = {
+        master: parsed.master ?? DEFAULT_PREFS.master,
+        voice: parsed.voice ?? DEFAULT_PREFS.voice,
+        effects: parsed.effects ?? DEFAULT_PREFS.effects,
+        ambience: parsed.ambience ?? DEFAULT_PREFS.ambience,
+      }
+      masterConfigured = parsed.configured ?? true
+      return prefs
+    }
   } catch {
-    pref = null
+    // Corrupt or unavailable: muted defaults.
   }
-  return pref
+  prefs = DEFAULT_PREFS
+  masterConfigured = false
+  return prefs
+}
+
+function persist(): void {
+  try {
+    window.localStorage.setItem(
+      PREFS_KEY,
+      JSON.stringify({ ...load(), configured: masterConfigured }),
+    )
+  } catch {
+    // In-memory still backs the session.
+  }
+  for (const listener of prefListeners) listener()
+}
+
+export function getAudioPrefs(): AudioPrefs {
+  return load()
+}
+
+export function setAudioPref(key: keyof AudioPrefs, value: boolean): void {
+  prefs = { ...load(), [key]: value }
+  if (key === 'master') masterConfigured = true
+  persist()
 }
 
 export function getSoundPreference(): SoundPreference | null {
-  return loadPref()
+  load()
+  if (!masterConfigured) return null
+  return load().master ? 'on' : 'off'
 }
 
 export function hasSoundPreference(): boolean {
-  return loadPref() !== null
+  load()
+  return masterConfigured === true
 }
 
 export function setSoundPreference(value: SoundPreference): void {
-  pref = value
-  try {
-    window.localStorage.setItem(PREF_KEY, value)
-  } catch {
-    // Persistence unavailable; the in-memory value still backs this session.
-  }
-  for (const listener of prefListeners) listener()
+  setAudioPref('master', value === 'on')
 }
 
 export function onSoundPreference(listener: () => void): () => void {
@@ -92,6 +148,11 @@ export function onSoundPreference(listener: () => void): () => void {
   }
 }
 
+/** Reactive view of the audio prefs for the settings dialog. */
+export function useAudioPrefs(): AudioPrefs {
+  return useSyncExternalStore(onSoundPreference, getAudioPrefs, getAudioPrefs)
+}
+
 // Cue hooks: section 07 fills these with real buffers. No-ops keep the hero
 // and terminal callable now.
 export function playActivationCue(): void {
@@ -106,8 +167,10 @@ export function playKeyTick(): void {
 export function __resetAudio(): void {
   port = { resume: () => void getAudioContext()?.resume() }
   prefListeners.clear()
-  pref = null
+  prefs = undefined
+  masterConfigured = undefined
   try {
+    window.localStorage.removeItem(PREFS_KEY)
     window.localStorage.removeItem(PREF_KEY)
   } catch {
     // ignore
diff --git a/src/app/screens/CorruptSaveNotice.tsx b/src/app/screens/CorruptSaveNotice.tsx
new file mode 100644
index 0000000..ada6c49
--- /dev/null
+++ b/src/app/screens/CorruptSaveNotice.tsx
@@ -0,0 +1,47 @@
+// The corrupt-save notice. Driven solely by the recovery flag the state
+// binding surfaces: recovered-backup says an earlier backup was restored so
+// recent progress may be missing; reset says the save could not be recovered
+// and a fresh campaign started. Neutral tone, no blame. Shown once per session
+// until dismissed; it reads state and never writes any.
+import { useRef } from 'react'
+import { getRecoveryFlag } from '../state'
+import { dismissCorrupt, useCorruptDismissed } from './dialogState'
+import { Dialog } from './Dialog'
+
+const COPY: Partial<Record<string, string>> = {
+  'recovered-backup':
+    'THE PRIMARY SAVE WAS UNREADABLE. AN EARLIER BACKUP WAS RESTORED, SO RECENT PROGRESS MAY BE MISSING.',
+  reset:
+    'THE SAVE COULD NOT BE RECOVERED. A FRESH CAMPAIGN HAS STARTED.',
+}
+
+export function CorruptSaveNotice() {
+  const flag = getRecoveryFlag()
+  const dismissed = useCorruptDismissed()
+  const headingRef = useRef<HTMLHeadingElement>(null)
+  const copy = COPY[flag]
+
+  // A clean load has no notice at all. For a real recovery flag we keep the
+  // dialog mounted and close it by flipping open on dismiss, so the shared
+  // close path lowers the precedence stack (an unmount-on-dismiss would strand
+  // it, since removing a <dialog open> fires no close event).
+  if (!copy) return null
+
+  return (
+    <Dialog
+      open={!dismissed}
+      onClose={dismissCorrupt}
+      labelledBy="corrupt-heading"
+      testId="corrupt-save-notice"
+      initialFocus={() => headingRef.current}
+    >
+      <h2 id="corrupt-heading" ref={headingRef} tabIndex={-1}>
+        SAVE NOTICE
+      </h2>
+      <p data-testid="corrupt-copy">{copy}</p>
+      <button type="button" data-testid="corrupt-dismiss" onClick={dismissCorrupt}>
+        ACKNOWLEDGE
+      </button>
+    </Dialog>
+  )
+}
diff --git a/src/app/screens/Dialog.tsx b/src/app/screens/Dialog.tsx
new file mode 100644
index 0000000..d584a8a
--- /dev/null
+++ b/src/app/screens/Dialog.tsx
@@ -0,0 +1,91 @@
+// Shared native-dialog mechanics for the overlay suite. showModal gives the
+// focus trap, background inerting, and Escape-to-close for free; this wrapper
+// adds aria-labelledby, explicit initial focus, focus restore to the
+// previously focused element, an optional cancel guard (for confirmation
+// sub-states), and it raises the input precedence stack's dialog layer so an
+// open dialog consumes keys before anything underneath. Parent state is the
+// single source of truth: onClose is the dialog REQUESTING close (Escape or a
+// button); a prop-driven close (open went false) restores focus but does not
+// re-fire onClose, so switching between overlays never clobbers the new one.
+import { useEffect, useRef } from 'react'
+import type { ReactNode, SyntheticEvent } from 'react'
+import { setDialogOpen } from './inputStack'
+import './dialog.css'
+
+export interface DialogProps {
+  readonly open: boolean
+  readonly onClose: () => void
+  readonly labelledBy: string
+  readonly initialFocus?: () => HTMLElement | null
+  readonly allowCancel?: boolean
+  readonly testId?: string
+  readonly children: ReactNode
+}
+
+export function Dialog({
+  open,
+  onClose,
+  labelledBy,
+  initialFocus,
+  allowCancel = true,
+  testId,
+  children,
+}: DialogProps) {
+  const ref = useRef<HTMLDialogElement>(null)
+  const prevFocus = useRef<Element | null>(null)
+  const programmatic = useRef(false)
+  const openRef = useRef(false)
+
+  useEffect(() => {
+    const dialog = ref.current
+    if (!dialog) return
+    if (open && !dialog.open) {
+      prevFocus.current = document.activeElement
+      dialog.showModal()
+      setDialogOpen(true)
+      openRef.current = true
+      initialFocus?.()?.focus()
+    } else if (!open && dialog.open) {
+      programmatic.current = true
+      dialog.close()
+    }
+  }, [open, initialFocus])
+
+  // Safety net: removing a <dialog open> from the DOM dispatches no close
+  // event, so a dialog that unmounts while open would otherwise strand the
+  // precedence stack's dialog layer true and swallow every key app-wide.
+  useEffect(() => {
+    return () => {
+      if (openRef.current) {
+        setDialogOpen(false)
+        if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus()
+      }
+    }
+  }, [])
+
+  const handleNativeClose = (): void => {
+    setDialogOpen(false)
+    openRef.current = false
+    if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus()
+    const wasProgrammatic = programmatic.current
+    programmatic.current = false
+    if (!wasProgrammatic) onClose()
+  }
+
+  const handleCancel = (event: SyntheticEvent): void => {
+    if (!allowCancel) event.preventDefault()
+  }
+
+  return (
+    <dialog
+      ref={ref}
+      aria-labelledby={labelledBy}
+      data-testid={testId}
+      className="crt-dialog"
+      onClose={handleNativeClose}
+      onCancel={handleCancel}
+    >
+      {children}
+    </dialog>
+  )
+}
diff --git a/src/app/screens/DialogLayer.tsx b/src/app/screens/DialogLayer.tsx
new file mode 100644
index 0000000..765122b
--- /dev/null
+++ b/src/app/screens/DialogLayer.tsx
@@ -0,0 +1,26 @@
+// Mounts the overlay suite into the dialog host. Which one is open is driven
+// by dialogState (settings and help are overlays, not engine phases); the
+// corrupt-save notice is driven by the recovery flag independently.
+import { closeOverlay, useOverlay } from './dialogState'
+import { PauseDialog } from './PauseDialog'
+import { SettingsDialog } from './SettingsDialog'
+import { NewCampaignDialog } from './NewCampaignDialog'
+import { HelpOverlay } from './HelpOverlay'
+import { CorruptSaveNotice } from './CorruptSaveNotice'
+
+export function DialogLayer({ activeScreen }: { readonly activeScreen: string }) {
+  const overlay = useOverlay()
+  return (
+    <>
+      <PauseDialog open={overlay === 'pause'} onClose={closeOverlay} />
+      <SettingsDialog open={overlay === 'settings'} onClose={closeOverlay} />
+      <NewCampaignDialog open={overlay === 'newCampaign'} onClose={closeOverlay} />
+      <HelpOverlay
+        open={overlay === 'help'}
+        activeScreen={activeScreen}
+        onClose={closeOverlay}
+      />
+      <CorruptSaveNotice />
+    </>
+  )
+}
diff --git a/src/app/screens/HelpOverlay.tsx b/src/app/screens/HelpOverlay.tsx
new file mode 100644
index 0000000..bb21196
--- /dev/null
+++ b/src/app/screens/HelpOverlay.tsx
@@ -0,0 +1,43 @@
+// The help overlay. It opens over the active screen without changing it, and
+// its body is the same context HELP the terminal HELP command prints, from the
+// same verb registry (section 04), so HELP-the-command and help-the-overlay
+// show one truth. LIST GAMES appears only in the idle (menu) context.
+import { useRef } from 'react'
+import { getContextHelp } from '../terminal'
+import { Dialog } from './Dialog'
+
+export interface HelpOverlayProps {
+  readonly open: boolean
+  readonly activeScreen: string
+  readonly onClose: () => void
+}
+
+export function HelpOverlay({ open, activeScreen, onClose }: HelpOverlayProps) {
+  const headingRef = useRef<HTMLHeadingElement>(null)
+  const lines = getContextHelp(activeScreen)
+
+  return (
+    <Dialog
+      open={open}
+      onClose={onClose}
+      labelledBy="help-heading"
+      testId="help-overlay"
+      initialFocus={() => headingRef.current}
+    >
+      <h2 id="help-heading" ref={headingRef} tabIndex={-1}>
+        HELP
+      </h2>
+      <p>TYPE A COMMAND, OR USE THE NUMBERED ROWS AND ARROW KEYS.</p>
+      <ul className="help-list" data-testid="help-list">
+        {lines.map((line) => (
+          <li key={line.verb} data-testid={`help-${line.verb}`}>
+            {line.helpText}
+          </li>
+        ))}
+      </ul>
+      <button type="button" data-testid="help-close" onClick={onClose}>
+        CLOSE
+      </button>
+    </Dialog>
+  )
+}
diff --git a/src/app/screens/NewCampaignDialog.tsx b/src/app/screens/NewCampaignDialog.tsx
new file mode 100644
index 0000000..a0f486b
--- /dev/null
+++ b/src/app/screens/NewCampaignDialog.tsx
@@ -0,0 +1,69 @@
+// New Campaign confirmation. Lists exactly the three named seeds from the
+// engine catalog metadata (no free seed input, ever). Selecting a seed does
+// nothing; an explicit confirm dispatches NEW_CAMPAIGN, which the save binding
+// flushes immediately. Cancel closes with no dispatch.
+import { useRef, useState } from 'react'
+import { seedCatalogMetadata } from '@engine'
+import { send } from '../state'
+import { Dialog } from './Dialog'
+
+export interface NewCampaignDialogProps {
+  readonly open: boolean
+  readonly onClose: () => void
+}
+
+export function NewCampaignDialog({ open, onClose }: NewCampaignDialogProps) {
+  const seeds = seedCatalogMetadata()
+  const [selected, setSelected] = useState<string | null>(null)
+  const firstRef = useRef<HTMLInputElement>(null)
+
+  const confirm = (): void => {
+    if (!selected) return
+    send({ type: 'NEW_CAMPAIGN', seedName: selected })
+    onClose()
+  }
+
+  return (
+    <Dialog
+      open={open}
+      onClose={onClose}
+      labelledBy="newcampaign-heading"
+      testId="new-campaign-dialog"
+      initialFocus={() => firstRef.current}
+    >
+      <h2 id="newcampaign-heading">NEW CAMPAIGN</h2>
+      <p>STARTING A NEW CAMPAIGN ERASES THE CURRENT ONE.</p>
+      <ul className="seed-list" data-testid="seed-list">
+        {seeds.map((seed, i) => (
+          <li key={seed.name}>
+            <label>
+              <input
+                ref={i === 0 ? firstRef : undefined}
+                type="radio"
+                name="seed"
+                value={seed.name}
+                data-testid={`seed-${seed.name}`}
+                checked={selected === seed.name}
+                onChange={() => setSelected(seed.name)}
+              />
+              {` ${seed.name.toUpperCase()}: ${seed.description}`}
+            </label>
+          </li>
+        ))}
+      </ul>
+      <div className="dialog-actions">
+        <button
+          type="button"
+          data-testid="new-campaign-confirm"
+          disabled={!selected}
+          onClick={confirm}
+        >
+          CONFIRM NEW CAMPAIGN
+        </button>
+        <button type="button" data-testid="new-campaign-cancel" onClick={onClose}>
+          CANCEL
+        </button>
+      </div>
+    </Dialog>
+  )
+}
diff --git a/src/app/screens/PauseDialog.tsx b/src/app/screens/PauseDialog.tsx
new file mode 100644
index 0000000..5e32efb
--- /dev/null
+++ b/src/app/screens/PauseDialog.tsx
@@ -0,0 +1,100 @@
+// The pause dialog. It opens from Escape or the MENU control during mission
+// play, but there is no engine pause: the copy states plainly that the mission
+// clock keeps running, and opening dispatches nothing. End Mission requires a
+// typed confirmation word before it forfeits; Escape inside that confirmation
+// backs out to the main view instead of closing.
+import { useRef, useState } from 'react'
+import { send } from '../state'
+import { Dialog } from './Dialog'
+
+const CONFIRM_WORD = 'END'
+
+export interface PauseDialogProps {
+  readonly open: boolean
+  readonly onClose: () => void
+}
+
+export function PauseDialog({ open, onClose }: PauseDialogProps) {
+  const [confirming, setConfirming] = useState(false)
+  const [typed, setTyped] = useState('')
+  const resumeRef = useRef<HTMLButtonElement>(null)
+
+  const reset = (): void => {
+    setConfirming(false)
+    setTyped('')
+  }
+
+  const close = (): void => {
+    reset()
+    onClose()
+  }
+
+  const matches = typed.trim().toUpperCase() === CONFIRM_WORD
+
+  const endMission = (): void => {
+    if (!matches) return
+    send({ type: 'FORFEIT_MISSION' })
+    close()
+  }
+
+  return (
+    <Dialog
+      open={open}
+      onClose={close}
+      labelledBy="pause-heading"
+      testId="pause-dialog"
+      allowCancel={!confirming}
+      initialFocus={() => resumeRef.current}
+    >
+      <h2 id="pause-heading">PAUSED</h2>
+      <p>THE MISSION CLOCK KEEPS RUNNING WHILE THIS IS OPEN.</p>
+      {!confirming ? (
+        <div className="dialog-actions">
+          <button
+            ref={resumeRef}
+            type="button"
+            data-testid="pause-resume"
+            onClick={close}
+          >
+            RESUME
+          </button>
+          <button
+            type="button"
+            data-testid="pause-end"
+            onClick={() => setConfirming(true)}
+          >
+            END MISSION
+          </button>
+        </div>
+      ) : (
+        <div className="dialog-confirm" data-testid="pause-confirm">
+          <label htmlFor="pause-confirm-input">
+            {`TYPE ${CONFIRM_WORD} TO CONFIRM FORFEIT`}
+          </label>
+          <input
+            id="pause-confirm-input"
+            data-testid="pause-confirm-input"
+            value={typed}
+            onChange={(e) => setTyped(e.target.value)}
+            autoComplete="off"
+          />
+          <button
+            type="button"
+            data-testid="pause-confirm-button"
+            disabled={!matches}
+            onClick={endMission}
+          >
+            CONFIRM END MISSION
+          </button>
+          <button
+            type="button"
+            data-testid="pause-confirm-cancel"
+            onClick={reset}
+          >
+            BACK
+          </button>
+        </div>
+      )}
+    </Dialog>
+  )
+}
diff --git a/src/app/screens/ScreenRouter.tsx b/src/app/screens/ScreenRouter.tsx
index 39c98f3..cdd4d4e 100644
--- a/src/app/screens/ScreenRouter.tsx
+++ b/src/app/screens/ScreenRouter.tsx
@@ -4,7 +4,7 @@
 // A shared CommandInput at the foot is wired to the active screen id so the
 // grammar resolves screen verbs correctly, and its UI commands open overlays
 // or acknowledge a debrief.
-import { useEffect, useRef, useState } from 'react'
+import { useEffect, useRef } from 'react'
 import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
 import { getState, send, useCampaign } from '../state'
 import { moveFocusTo } from '../a11y/focus'
@@ -16,6 +16,8 @@ import { FallbackMissionFrame } from './FallbackMissionFrame'
 import { resolveMissionScreen } from './screenRegistry'
 import { pendingDebrief } from './pendingDebrief'
 import { handleCapturedKey } from './inputStack'
+import { openOverlay, closeOverlay, getOverlay } from './dialogState'
+import { DialogLayer } from './DialogLayer'
 import type { CampaignState } from '@engine'
 
 export type OverlayId = 'settings' | 'help'
@@ -43,7 +45,6 @@ export interface ScreenRouterProps {
 export function ScreenRouter({ onListGames, onSetSound }: ScreenRouterProps) {
   const state = useCampaign()
   const screenId = screenIdForState(state)
-  const [overlay, setOverlay] = useState<OverlayId | null>(null)
   const rootRef = useRef<HTMLDivElement>(null)
 
   useEffect(() => {
@@ -53,13 +54,13 @@ export function ScreenRouter({ onListGames, onSetSound }: ScreenRouterProps) {
   const handleUiCommand = (command: LocalUiCommand): void => {
     switch (command.kind) {
       case 'OPEN_HELP':
-        setOverlay('help')
+        openOverlay('help')
         break
       case 'OPEN_SETTINGS':
-        setOverlay('settings')
+        openOverlay('settings')
         break
       case 'CLOSE_OVERLAY':
-        setOverlay(null)
+        closeOverlay()
         break
       case 'ACKNOWLEDGE': {
         const pending = pendingDebrief(getState())
@@ -77,30 +78,50 @@ export function ScreenRouter({ onListGames, onSetSound }: ScreenRouterProps) {
     }
   }
 
+  const inMission = screenId.startsWith('mission:')
+
   // Capture-phase: resolve precedence before the event reaches the screen's
   // own handlers, so a running type-in or an active prompt swallows the key.
   const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
     if (handleCapturedKey(event.nativeEvent) === 'consumed') {
       event.preventDefault()
       event.stopPropagation()
+      return
+    }
+    // Escape during a mission opens the pause dialog (there is no dialog open,
+    // or the dialog layer would have consumed the key above).
+    if (event.key === 'Escape' && inMission && getOverlay() === null) {
+      event.preventDefault()
+      openOverlay('pause')
     }
   }
 
   return (
-    <div
-      className="screen-root"
-      data-testid="screen-root"
-      data-active-screen={screenId}
-      tabIndex={-1}
-      ref={rootRef}
-      onKeyDownCapture={onKeyDownCapture}
-    >
-      <ActiveScreen screenId={screenId} state={state} />
-      <CommandInput activeScreen={screenId} onUiCommand={handleUiCommand} />
-      {overlay !== null && (
-        <div data-testid="overlay-slot" data-overlay={overlay} />
-      )}
-    </div>
+    <>
+      <div
+        className="screen-root"
+        data-testid="screen-root"
+        data-active-screen={screenId}
+        tabIndex={-1}
+        ref={rootRef}
+        onKeyDownCapture={onKeyDownCapture}
+      >
+        {inMission && (
+          <button
+            type="button"
+            data-testid="menu-control"
+            onClick={() => openOverlay('pause')}
+          >
+            MENU
+          </button>
+        )}
+        <ActiveScreen screenId={screenId} state={state} />
+        <CommandInput activeScreen={screenId} onUiCommand={handleUiCommand} />
+      </div>
+      {/* Overlays are native top-layer dialogs; they sit outside the
+          focus-managed screen root. */}
+      <DialogLayer activeScreen={screenId} />
+    </>
   )
 }
 
diff --git a/src/app/screens/SettingsDialog.tsx b/src/app/screens/SettingsDialog.tsx
new file mode 100644
index 0000000..dd16644
--- /dev/null
+++ b/src/app/screens/SettingsDialog.tsx
@@ -0,0 +1,145 @@
+// The settings dialog: sound, motion, reduce glow, extended time, and the New
+// Campaign entry point. Every control reads and writes the one backing value
+// its consumers share (no shadow copies). Extended time is an engine
+// preference, editable only before any mission has started; once started it
+// locks with a visible explanation rather than vanishing.
+import { useRef } from 'react'
+import { send, useCampaign } from '../state'
+import { setAudioPref, useAudioPrefs } from '../audio'
+import { setMotionOverride, useReducedMotion } from '../a11y/motion'
+import { setReduceGlow, useReduceGlow } from '../theme/reduceGlow'
+import { GlossaryTerm } from '../a11y/GlossaryTerm'
+import { openOverlay } from './dialogState'
+import { Dialog } from './Dialog'
+
+export interface SettingsDialogProps {
+  readonly open: boolean
+  readonly onClose: () => void
+}
+
+export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
+  const state = useCampaign()
+  const prefs = useAudioPrefs()
+  const reducedMotion = useReducedMotion()
+  const reduceGlow = useReduceGlow()
+  const firstRef = useRef<HTMLInputElement>(null)
+  const extendedLocked = state.startedMissionIds.length > 0
+
+  return (
+    <Dialog
+      open={open}
+      onClose={onClose}
+      labelledBy="settings-heading"
+      testId="settings-dialog"
+      initialFocus={() => firstRef.current}
+    >
+      <h2 id="settings-heading">SETTINGS</h2>
+
+      <fieldset>
+        <legend>SOUND</legend>
+        <label>
+          <input
+            ref={firstRef}
+            type="checkbox"
+            data-testid="toggle-master"
+            checked={prefs.master}
+            onChange={(e) => setAudioPref('master', e.target.checked)}
+          />
+          {' MASTER'}
+        </label>
+        <label>
+          <input
+            type="checkbox"
+            data-testid="toggle-effects"
+            checked={prefs.effects}
+            onChange={(e) => setAudioPref('effects', e.target.checked)}
+          />
+          {' EFFECTS'}
+        </label>
+        <label>
+          <input
+            type="checkbox"
+            data-testid="toggle-voice"
+            checked={prefs.voice}
+            onChange={(e) => setAudioPref('voice', e.target.checked)}
+          />
+          {' VOICE (AI-GENERATED)'}
+        </label>
+        <label>
+          <input
+            type="checkbox"
+            data-testid="toggle-ambience"
+            checked={prefs.ambience}
+            onChange={(e) => setAudioPref('ambience', e.target.checked)}
+          />
+          {' AMBIENCE'}
+        </label>
+      </fieldset>
+
+      <fieldset>
+        <legend>MOTION</legend>
+        <label>
+          <input
+            type="checkbox"
+            data-testid="toggle-motion"
+            checked={reducedMotion}
+            onChange={(e) => setMotionOverride(e.target.checked ? 'reduce' : 'full')}
+          />
+          {' REDUCE MOTION'}
+        </label>
+        <label>
+          <input
+            type="checkbox"
+            data-testid="toggle-reduce-glow"
+            checked={reduceGlow}
+            onChange={(e) => setReduceGlow(e.target.checked)}
+          />
+          {' REDUCE GLOW'}
+        </label>
+      </fieldset>
+
+      <fieldset>
+        <legend>
+          <GlossaryTerm
+            term="EXTENDED TIME"
+            definition="Doubles every mission's countdown, for a calmer pace. It can only be chosen before the campaign begins."
+          />
+        </legend>
+        <label>
+          <input
+            type="checkbox"
+            data-testid="toggle-extended-time"
+            checked={state.preferences.extendedTime}
+            disabled={extendedLocked}
+            onChange={(e) =>
+              send({
+                type: 'SET_PREFERENCE',
+                preference: 'extendedTime',
+                value: e.target.checked,
+              })
+            }
+          />
+          {' DOUBLE THE MISSION CLOCK'}
+        </label>
+        {extendedLocked && (
+          <p data-testid="extended-time-lock">
+            LOCKED: THE CAMPAIGN HAS BEGUN, SO TIMING IS FIXED FOR ITS DURATION.
+          </p>
+        )}
+      </fieldset>
+
+      <div className="dialog-actions">
+        <button
+          type="button"
+          data-testid="settings-new-campaign"
+          onClick={() => openOverlay('newCampaign')}
+        >
+          NEW CAMPAIGN
+        </button>
+        <button type="button" data-testid="settings-close" onClick={onClose}>
+          CLOSE
+        </button>
+      </div>
+    </Dialog>
+  )
+}
diff --git a/src/app/screens/dialog.css b/src/app/screens/dialog.css
new file mode 100644
index 0000000..ba2cde0
--- /dev/null
+++ b/src/app/screens/dialog.css
@@ -0,0 +1,50 @@
+/* Native dialog styling on the CRT theme tokens. No new effects; dialogs sit
+   above the scanline overlay with the luminous border. */
+.crt-dialog {
+  background: var(--color-glass);
+  color: var(--color-glyph);
+  font-family: var(--font-terminal);
+  border: 1px solid var(--color-dim);
+  box-shadow:
+    0 0 2px var(--color-glyph),
+    0 0 18px rgba(108, 182, 255, 0.25);
+  padding: 1.5rem;
+  max-width: min(90vw, 40rem);
+}
+.crt-dialog::backdrop {
+  background: rgba(0, 0, 0, 0.6);
+}
+.crt-dialog h2 {
+  margin-top: 0;
+  letter-spacing: 0.1em;
+}
+.crt-dialog fieldset {
+  border: 1px solid var(--color-dim);
+  margin: 0.75rem 0;
+}
+.crt-dialog label {
+  display: block;
+  padding: 0.15rem 0;
+}
+.dialog-actions {
+  display: flex;
+  gap: 1ch;
+  margin-top: 1rem;
+}
+.crt-dialog button {
+  background: transparent;
+  border: 1px solid var(--color-dim);
+  color: var(--color-glyph);
+  font: inherit;
+  padding: 0.2em 0.8em;
+  cursor: pointer;
+}
+.crt-dialog button:disabled {
+  color: var(--color-dim);
+  cursor: not-allowed;
+  opacity: 0.6;
+}
+.glossary-term {
+  text-decoration: underline dotted;
+  cursor: help;
+}
diff --git a/src/app/screens/dialogState.ts b/src/app/screens/dialogState.ts
new file mode 100644
index 0000000..c9f6652
--- /dev/null
+++ b/src/app/screens/dialogState.ts
@@ -0,0 +1,61 @@
+// Local UI state for which overlay is open, plus the corrupt-notice
+// session-dismissed bit. This is shell UI state, never engine state, and it
+// does not persist (the corrupt dismissal lasts only the session). Settings
+// and help are overlays, not engine phases: opening one never changes the
+// screen router.
+import { useSyncExternalStore } from 'react'
+
+export type OverlayKind = 'pause' | 'settings' | 'newCampaign' | 'help'
+
+let overlay: OverlayKind | null = null
+let corruptDismissed = false
+const listeners = new Set<() => void>()
+
+function notify(): void {
+  for (const listener of listeners) listener()
+}
+
+export function getOverlay(): OverlayKind | null {
+  return overlay
+}
+
+export function openOverlay(kind: OverlayKind): void {
+  overlay = kind
+  notify()
+}
+
+export function closeOverlay(): void {
+  overlay = null
+  notify()
+}
+
+export function isCorruptDismissed(): boolean {
+  return corruptDismissed
+}
+
+export function dismissCorrupt(): void {
+  corruptDismissed = true
+  notify()
+}
+
+function subscribe(listener: () => void): () => void {
+  listeners.add(listener)
+  return () => {
+    listeners.delete(listener)
+  }
+}
+
+export function useOverlay(): OverlayKind | null {
+  return useSyncExternalStore(subscribe, getOverlay, getOverlay)
+}
+
+export function useCorruptDismissed(): boolean {
+  return useSyncExternalStore(subscribe, isCorruptDismissed, isCorruptDismissed)
+}
+
+/** Test-only. */
+export function __resetDialogState(): void {
+  overlay = null
+  corruptDismissed = false
+  listeners.clear()
+}
diff --git a/src/app/screens/index.ts b/src/app/screens/index.ts
index f25709e..ce22ee6 100644
--- a/src/app/screens/index.ts
+++ b/src/app/screens/index.ts
@@ -16,3 +16,18 @@ export {
   type PrecedenceState,
   type PrecedenceResult,
 } from './precedence'
+export { DialogLayer } from './DialogLayer'
+export { PauseDialog } from './PauseDialog'
+export { SettingsDialog } from './SettingsDialog'
+export { NewCampaignDialog } from './NewCampaignDialog'
+export { HelpOverlay } from './HelpOverlay'
+export { CorruptSaveNotice } from './CorruptSaveNotice'
+export {
+  openOverlay,
+  closeOverlay,
+  getOverlay,
+  useOverlay,
+  dismissCorrupt,
+  isCorruptDismissed,
+  type OverlayKind,
+} from './dialogState'
diff --git a/src/app/theme/reduceGlow.ts b/src/app/theme/reduceGlow.ts
new file mode 100644
index 0000000..f666f26
--- /dev/null
+++ b/src/app/theme/reduceGlow.ts
@@ -0,0 +1,40 @@
+// The reduce-glow preference. It toggles the single crt-reduce-glow class on
+// the document root, which the CRT stylesheet (section 03) scopes to drop the
+// outer text-shadow halos and the breathing layer for every glass container
+// beneath. Session state, not persisted here.
+import { useSyncExternalStore } from 'react'
+
+let on = false
+const listeners = new Set<() => void>()
+
+export function getReduceGlow(): boolean {
+  return on
+}
+
+export function setReduceGlow(value: boolean): void {
+  on = value
+  if (typeof document !== 'undefined') {
+    document.documentElement.classList.toggle('crt-reduce-glow', value)
+  }
+  for (const listener of listeners) listener()
+}
+
+export function useReduceGlow(): boolean {
+  return useSyncExternalStore(
+    (l) => {
+      listeners.add(l)
+      return () => listeners.delete(l)
+    },
+    getReduceGlow,
+    getReduceGlow,
+  )
+}
+
+/** Test-only. */
+export function __resetReduceGlow(): void {
+  on = false
+  listeners.clear()
+  if (typeof document !== 'undefined') {
+    document.documentElement.classList.remove('crt-reduce-glow')
+  }
+}
diff --git a/src/engine/save/index.ts b/src/engine/save/index.ts
index 730fff1..ef4be24 100644
--- a/src/engine/save/index.ts
+++ b/src/engine/save/index.ts
@@ -223,8 +223,22 @@ function tryLoad(
   }
 }
 
-/** Primary then backup then fresh. The monotonic merge guard runs on
- *  both slot paths. The recovery flag is the shell's visible reset path. */
+function slotStatus(
+  port: StoragePort,
+  key: string,
+): 'empty' | 'present' | 'error' {
+  try {
+    return port.read(key) === null ? 'empty' : 'present'
+  } catch {
+    return 'error'
+  }
+}
+
+/** Primary then backup then fresh. The monotonic merge guard runs on both
+ *  slot paths. The recovery flag is the shell's visible notice: 'clean' also
+ *  covers a first-time load with no save at all (both slots empty), so a brand
+ *  new player is never told their save could not be recovered. 'reset' means a
+ *  save was actually present or the storage errored, but nothing loaded. */
 export function loadCampaign(
   port: StoragePort,
   registry: MissionRegistry,
@@ -234,7 +248,10 @@ export function loadCampaign(
   if (primary) return { state: primary, recovery: 'clean' }
   const backup = tryLoad(port, BACKUP_KEY, registry, inSession)
   if (backup) return { state: backup, recovery: 'recovered-backup' }
-  return { state: null, recovery: 'reset' }
+  const bothEmpty =
+    slotStatus(port, PRIMARY_KEY) === 'empty' &&
+    slotStatus(port, BACKUP_KEY) === 'empty'
+  return { state: null, recovery: bothEmpty ? 'clean' : 'reset' }
 }
 
 export interface PersistResult {
diff --git a/test/app/screens/corrupt-save-notice.test.tsx b/test/app/screens/corrupt-save-notice.test.tsx
new file mode 100644
index 0000000..fba48fb
--- /dev/null
+++ b/test/app/screens/corrupt-save-notice.test.tsx
@@ -0,0 +1,72 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init } from '@app/state'
+import { CorruptSaveNotice } from '@app/screens'
+import { handleCapturedKey } from '@app/screens/inputStack'
+import { encodeSave, createCampaign, PRIMARY_KEY, BACKUP_KEY } from '@engine'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+function freshSave(): string {
+  return encodeSave(
+    createCampaign(buildCtx(), 'test-seed', { extendedTime: false }, 1_000_000),
+  )
+}
+
+let teardown: (() => void) | null = null
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+})
+
+afterEach(() => {
+  teardown?.()
+  teardown = null
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+function boot(seed: Record<string, string>): void {
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort(seed) })
+}
+
+describe('CorruptSaveNotice', () => {
+  it('renders nothing on a clean load', () => {
+    boot({ [PRIMARY_KEY]: freshSave() })
+    render(<CorruptSaveNotice />)
+    expect(screen.queryByTestId('corrupt-save-notice')).toBeNull()
+  })
+
+  it('recovered-backup shows the backup-restored copy', () => {
+    boot({ [PRIMARY_KEY]: 'garbage', [BACKUP_KEY]: freshSave() })
+    render(<CorruptSaveNotice />)
+    expect(screen.getByTestId('corrupt-copy').textContent).toMatch(/BACKUP/)
+  })
+
+  it('reset shows the fresh-campaign copy and dismissal closes it', () => {
+    boot({ [PRIMARY_KEY]: 'garbage', [BACKUP_KEY]: 'also garbage' })
+    render(<CorruptSaveNotice />)
+    expect(screen.getByTestId('corrupt-copy').textContent).toMatch(
+      /FRESH CAMPAIGN/,
+    )
+    const dialog = screen.getByTestId('corrupt-save-notice') as HTMLDialogElement
+    expect(dialog.open).toBe(true)
+    fireEvent.click(screen.getByTestId('corrupt-dismiss'))
+    // Kept mounted but closed, so the precedence stack is released.
+    expect(dialog.open).toBe(false)
+  })
+
+  it('dismissing releases the key-precedence stack (no app-wide lockup)', () => {
+    boot({ [PRIMARY_KEY]: 'garbage', [BACKUP_KEY]: 'also garbage' })
+    render(<CorruptSaveNotice />)
+    // Open dialog consumes keys.
+    expect(
+      handleCapturedKey(new KeyboardEvent('keydown', { key: '1' })),
+    ).toBe('consumed')
+    fireEvent.click(screen.getByTestId('corrupt-dismiss'))
+    // After dismissal keys pass through again.
+    expect(
+      handleCapturedKey(new KeyboardEvent('keydown', { key: '1' })),
+    ).toBe('pass')
+  })
+})
diff --git a/test/app/screens/harness.ts b/test/app/screens/harness.ts
index fe1ff46..7905c8f 100644
--- a/test/app/screens/harness.ts
+++ b/test/app/screens/harness.ts
@@ -3,7 +3,11 @@ import { __resetGrammar } from '@app/terminal/commandGrammar'
 import { __resetDefaultVerbs } from '@app/terminal/helpRegistry'
 import { __resetScreenRegistry } from '@app/screens/screenRegistry'
 import { __resetInputStack } from '@app/screens/inputStack'
+import { __resetDialogState } from '@app/screens/dialogState'
 import { __resetAnnounce } from '@app/a11y/announce'
+import { __resetAudio } from '@app/audio'
+import { __resetMotion } from '@app/a11y/motion'
+import { __resetReduceGlow } from '@app/theme/reduceGlow'
 
 export { buildCtx, memoryPort }
 
@@ -13,5 +17,9 @@ export function resetAll(): void {
   __resetDefaultVerbs()
   __resetScreenRegistry()
   __resetInputStack()
+  __resetDialogState()
   __resetAnnounce()
+  __resetAudio()
+  __resetMotion()
+  __resetReduceGlow()
 }
diff --git a/test/app/screens/help-overlay.test.tsx b/test/app/screens/help-overlay.test.tsx
new file mode 100644
index 0000000..b70849a
--- /dev/null
+++ b/test/app/screens/help-overlay.test.tsx
@@ -0,0 +1,52 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { HelpOverlay } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from './harness'
+
+beforeEach(() => {
+  resetAll()
+  registerDefaultVerbs()
+})
+
+afterEach(() => {
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('HelpOverlay', () => {
+  it('is context-sensitive: idle lists LIST GAMES, a mission does not', () => {
+    const { rerender } = render(
+      <HelpOverlay open={true} activeScreen="menu" onClose={() => {}} />,
+    )
+    expect(screen.getByTestId('help-LIST')).toBeInTheDocument()
+    expect(screen.getByTestId('help-HELP')).toBeInTheDocument()
+
+    rerender(
+      <HelpOverlay
+        open={true}
+        activeScreen="mission:alpha"
+        onClose={() => {}}
+      />,
+    )
+    expect(screen.queryByTestId('help-LIST')).toBeNull()
+  })
+
+  it('carries aria-labelledby and closes on its control', () => {
+    const onClose = vi.fn()
+    render(<HelpOverlay open={true} activeScreen="menu" onClose={onClose} />)
+    expect(screen.getByTestId('help-overlay')).toHaveAttribute(
+      'aria-labelledby',
+      'help-heading',
+    )
+    fireEvent.click(screen.getByTestId('help-close'))
+    expect(onClose).toHaveBeenCalled()
+  })
+
+  it('Escape closes the help overlay', () => {
+    const onClose = vi.fn()
+    render(<HelpOverlay open={true} activeScreen="menu" onClose={onClose} />)
+    fireEvent.keyDown(document, { key: 'Escape' })
+    expect(onClose).toHaveBeenCalled()
+  })
+})
diff --git a/test/app/screens/new-campaign-dialog.test.tsx b/test/app/screens/new-campaign-dialog.test.tsx
new file mode 100644
index 0000000..aacf3a1
--- /dev/null
+++ b/test/app/screens/new-campaign-dialog.test.tsx
@@ -0,0 +1,57 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, getState } from '@app/state'
+import { NewCampaignDialog } from '@app/screens'
+import { SEED_NAMES } from '@engine'
+import { SEED_CATALOG } from '@engine/seeds/catalog'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  // The dialog lists the real catalog seeds; give the ctx those seeds so a
+  // confirm can create one (the real app ctx is built from the same catalog).
+  const base = buildCtx()
+  const ctx = { ...base, seeds: { ...base.seeds, ...SEED_CATALOG } }
+  teardown = init({ ctx, seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('NewCampaignDialog', () => {
+  it('lists exactly the three catalog seeds and has no free-text seed input', () => {
+    render(<NewCampaignDialog open={true} onClose={() => {}} />)
+    const list = screen.getByTestId('seed-list')
+    expect(list.querySelectorAll('li')).toHaveLength(3)
+    expect(SEED_NAMES).toHaveLength(3)
+    // Only radio inputs, no free text entry.
+    expect(
+      screen.queryByRole('textbox'),
+    ).toBeNull()
+  })
+
+  it('selecting a seed dispatches nothing; confirming dispatches NEW_CAMPAIGN once', () => {
+    const before = getState()
+    render(<NewCampaignDialog open={true} onClose={() => {}} />)
+    const firstSeed = SEED_NAMES[0]!
+    fireEvent.click(screen.getByTestId(`seed-${firstSeed}`))
+    expect(getState()).toBe(before) // selection alone changes nothing
+    fireEvent.click(screen.getByTestId('new-campaign-confirm'))
+    expect(getState().seedName).toBe(firstSeed)
+  })
+
+  it('cancel closes without dispatch', () => {
+    const before = getState()
+    const onClose = vi.fn()
+    render(<NewCampaignDialog open={true} onClose={onClose} />)
+    fireEvent.click(screen.getByTestId('new-campaign-cancel'))
+    expect(onClose).toHaveBeenCalled()
+    expect(getState()).toBe(before)
+  })
+})
diff --git a/test/app/screens/pause-dialog.test.tsx b/test/app/screens/pause-dialog.test.tsx
new file mode 100644
index 0000000..d424b23
--- /dev/null
+++ b/test/app/screens/pause-dialog.test.tsx
@@ -0,0 +1,67 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { PauseDialog, ScreenRouter, getOverlay } from '@app/screens'
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
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('PauseDialog', () => {
+  it('opening dispatches nothing and the copy says the clock keeps running', () => {
+    const before = getState()
+    render(<PauseDialog open={true} onClose={() => {}} />)
+    expect(screen.getByTestId('pause-dialog')).toHaveAttribute(
+      'aria-labelledby',
+      'pause-heading',
+    )
+    expect(screen.getByText(/CLOCK KEEPS RUNNING/)).toBeInTheDocument()
+    // No engine pause exists: opening changes no state.
+    expect(getState()).toBe(before)
+  })
+
+  it('Resume requests close without dispatching', () => {
+    const onClose = vi.fn()
+    render(<PauseDialog open={true} onClose={onClose} />)
+    fireEvent.click(screen.getByTestId('pause-resume'))
+    expect(onClose).toHaveBeenCalled()
+  })
+
+  it('End Mission requires the typed confirmation word before forfeiting', () => {
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    render(<PauseDialog open={true} onClose={() => {}} />)
+    fireEvent.click(screen.getByTestId('pause-end'))
+    const confirm = screen.getByTestId('pause-confirm-button')
+    expect(confirm).toBeDisabled()
+    fireEvent.change(screen.getByTestId('pause-confirm-input'), {
+      target: { value: 'end' },
+    })
+    expect(confirm).toBeEnabled()
+    fireEvent.click(confirm)
+    expect(getState().settled.some((s) => s.cause === 'forfeit')).toBe(true)
+  })
+
+  it('opens from Escape and from the MENU control during a mission', () => {
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    render(<ScreenRouter />)
+    fireEvent.keyDown(screen.getByTestId('screen-root'), { key: 'Escape' })
+    expect(getOverlay()).toBe('pause')
+  })
+})
diff --git a/test/app/screens/settings-dialog.test.tsx b/test/app/screens/settings-dialog.test.tsx
new file mode 100644
index 0000000..80f6a4c
--- /dev/null
+++ b/test/app/screens/settings-dialog.test.tsx
@@ -0,0 +1,82 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { init, send, getState } from '@app/state'
+import { SettingsDialog, getOverlay } from '@app/screens'
+import { getAudioPrefs, setSoundPreference } from '@app/audio'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+describe('SettingsDialog', () => {
+  it('renders the four sound toggles, with the AI-generated voice label', () => {
+    render(<SettingsDialog open={true} onClose={() => {}} />)
+    for (const id of [
+      'toggle-master',
+      'toggle-effects',
+      'toggle-voice',
+      'toggle-ambience',
+    ]) {
+      expect(screen.getByTestId(id)).toBeInTheDocument()
+    }
+    expect(screen.getByText(/AI-GENERATED/)).toBeInTheDocument()
+  })
+
+  it('the master switch and the diegetic prompt share one backing value', () => {
+    setSoundPreference('on') // as the hero prompt would
+    render(<SettingsDialog open={true} onClose={() => {}} />)
+    const master = screen.getByTestId('toggle-master') as HTMLInputElement
+    expect(master.checked).toBe(true)
+    fireEvent.click(master)
+    expect(getAudioPrefs().master).toBe(false)
+  })
+
+  it('the reduce-glow toggle applies and removes the single class hook', () => {
+    render(<SettingsDialog open={true} onClose={() => {}} />)
+    const toggle = screen.getByTestId('toggle-reduce-glow')
+    fireEvent.click(toggle)
+    expect(document.documentElement.classList.contains('crt-reduce-glow')).toBe(
+      true,
+    )
+    fireEvent.click(toggle)
+    expect(document.documentElement.classList.contains('crt-reduce-glow')).toBe(
+      false,
+    )
+  })
+
+  it('extended time is editable before a mission and locks once one has started', () => {
+    const { rerender } = render(
+      <SettingsDialog open={true} onClose={() => {}} />,
+    )
+    const toggle = screen.getByTestId('toggle-extended-time') as HTMLInputElement
+    expect(toggle).toBeEnabled()
+    fireEvent.click(toggle)
+    expect(getState().preferences.extendedTime).toBe(true)
+
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    rerender(<SettingsDialog open={true} onClose={() => {}} />)
+    expect(screen.getByTestId('toggle-extended-time')).toBeDisabled()
+    expect(screen.getByTestId('extended-time-lock')).toBeInTheDocument()
+  })
+
+  it('New Campaign opens the New Campaign dialog, never resets directly', () => {
+    const before = getState()
+    render(<SettingsDialog open={true} onClose={() => {}} />)
+    fireEvent.click(screen.getByTestId('settings-new-campaign'))
+    expect(getOverlay()).toBe('newCampaign')
+    expect(getState()).toBe(before) // nothing dispatched
+  })
+})
diff --git a/test/app/setup.ts b/test/app/setup.ts
index 312e5ae..9a41d52 100644
--- a/test/app/setup.ts
+++ b/test/app/setup.ts
@@ -5,3 +5,33 @@ import { cleanup } from '@testing-library/react'
 // Vitest globals are off, so Testing Library's auto-cleanup does not run on
 // its own. Unmount between tests to keep one render per test in the DOM.
 afterEach(cleanup)
+
+// jsdom's <dialog> support is partial: polyfill showModal/close and
+// Escape-to-cancel-then-close minimally (open attribute, a close event, and a
+// cancelable cancel event), rather than changing production code to a div.
+interface DialogShim extends HTMLDialogElement {
+  __esc?: (event: KeyboardEvent) => void
+}
+if (typeof HTMLDialogElement !== 'undefined') {
+  const proto = HTMLDialogElement.prototype as DialogShim
+  if (typeof proto.showModal !== 'function') {
+    proto.showModal = function (this: DialogShim) {
+      this.open = true
+      this.__esc = (event: KeyboardEvent) => {
+        if (event.key === 'Escape') {
+          const cancel = new Event('cancel', { cancelable: true })
+          this.dispatchEvent(cancel)
+          if (!cancel.defaultPrevented) this.close()
+        }
+      }
+      document.addEventListener('keydown', this.__esc)
+    }
+  }
+  if (typeof proto.close !== 'function') {
+    proto.close = function (this: DialogShim) {
+      this.open = false
+      if (this.__esc) document.removeEventListener('keydown', this.__esc)
+      this.dispatchEvent(new Event('close'))
+    }
+  }
+}
