diff --git a/planning/02-terminal-shell/implementation/deep_implement_config.json b/planning/02-terminal-shell/implementation/deep_implement_config.json
index 8f6d3cd..40becc9 100644
--- a/planning/02-terminal-shell/implementation/deep_implement_config.json
+++ b/planning/02-terminal-shell/implementation/deep_implement_config.json
@@ -38,6 +38,10 @@
     "section-05-hero-pushin": {
       "status": "complete",
       "commit_hash": "af56030"
+    },
+    "section-06-overlays-settings": {
+      "status": "complete",
+      "commit_hash": "ea9f484"
     }
   },
   "pre_commit": {
diff --git a/src/app/audio/buses.ts b/src/app/audio/buses.ts
new file mode 100644
index 0000000..2b4863b
--- /dev/null
+++ b/src/app/audio/buses.ts
@@ -0,0 +1,67 @@
+// Three mix buses (effects, voice, ambience) into a master gain into the
+// destination. Master gain stays at 0 until the prefs say enabled, and each
+// bus gain follows its own pref, so resuming the context is always safe
+// regardless of mute state.
+import { getAudioContext } from './context'
+import { getAudioPrefs, onAudioPrefs } from './prefs'
+import type { GainLike } from './port'
+
+export type BusName = 'effects' | 'voice' | 'ambience'
+
+interface Buses {
+  readonly master: GainLike
+  readonly effects: GainLike
+  readonly voice: GainLike
+  readonly ambience: GainLike
+}
+
+let buses: Buses | null = null
+let unsubscribe: (() => void) | null = null
+
+function applyPrefs(): void {
+  if (!buses) return
+  const prefs = getAudioPrefs()
+  buses.master.gain.value = prefs.master ? 1 : 0
+  buses.effects.gain.value = prefs.effects ? 1 : 0
+  buses.voice.gain.value = prefs.voice ? 1 : 0
+  buses.ambience.gain.value = prefs.ambience ? 1 : 0
+}
+
+export function getBuses(): Buses | null {
+  if (buses) return buses
+  const ctx = getAudioContext()
+  if (!ctx) return null
+  const master = ctx.createGain()
+  master.connect(ctx.destination)
+  const bus = (): GainLike => {
+    const g = ctx.createGain()
+    g.connect(master)
+    return g
+  }
+  buses = { master, effects: bus(), voice: bus(), ambience: bus() }
+  applyPrefs()
+  unsubscribe = onAudioPrefs(applyPrefs)
+  return buses
+}
+
+export function busFor(name: BusName): GainLike | null {
+  const b = getBuses()
+  return b ? b[name] : null
+}
+
+export function masterBus(): GainLike | null {
+  const b = getBuses()
+  return b ? b.master : null
+}
+
+export function ambienceBus(): GainLike | null {
+  const b = getBuses()
+  return b ? b.ambience : null
+}
+
+/** Test-only. */
+export function __resetBuses(): void {
+  unsubscribe?.()
+  unsubscribe = null
+  buses = null
+}
diff --git a/src/app/audio/captions.tsx b/src/app/audio/captions.tsx
new file mode 100644
index 0000000..b7dd3e4
--- /dev/null
+++ b/src/app/audio/captions.tsx
@@ -0,0 +1,20 @@
+// Renders the transcript of the currently playing voice or warning cue,
+// whether or not audio is enabled or the context ever existed, so a muted
+// player still reads the line. The announcer (section 09) receives the same
+// text through an optional callback rather than a hard dependency.
+import { useSyncExternalStore } from 'react'
+import { getPlayingTranscript, onPlayingTranscript } from './player'
+
+export function Captions() {
+  const transcript = useSyncExternalStore(
+    onPlayingTranscript,
+    getPlayingTranscript,
+    getPlayingTranscript,
+  )
+  if (!transcript) return null
+  return (
+    <p className="captions" data-testid="caption" aria-live="polite">
+      {transcript}
+    </p>
+  )
+}
diff --git a/src/app/audio/context.ts b/src/app/audio/context.ts
new file mode 100644
index 0000000..26e5529
--- /dev/null
+++ b/src/app/audio/context.ts
@@ -0,0 +1,80 @@
+// AudioContext lifecycle. One context, created suspended at boot. resume() is
+// safe to call synchronously from any user-gesture handler (iOS requires the
+// call inside the gesture, so nothing async wraps the underlying resume). A
+// statechange listener re-arms a one-shot gesture resume after an interruption
+// (phone call, Siri, backgrounding). Master gain stays at 0 until the prefs say
+// enabled, so resuming is always safe regardless of mute state.
+import {
+  browserAudioPort,
+  type ContextLike,
+  type WebAudioPort,
+} from './port'
+
+let port: WebAudioPort = browserAudioPort
+let context: ContextLike | null = null
+let created = false
+let reGesture: (() => void) | null = null
+
+export function setAudioPortImpl(next: WebAudioPort): void {
+  port = next
+}
+
+export function getPort(): WebAudioPort {
+  return port
+}
+
+function armGestureReresume(): void {
+  if (reGesture || typeof document === 'undefined') return
+  const onGesture = (): void => {
+    disarmGestureReresume()
+    resumeAudio()
+  }
+  reGesture = onGesture
+  document.addEventListener('pointerdown', onGesture, { once: true })
+  document.addEventListener('keydown', onGesture, { once: true })
+}
+
+function disarmGestureReresume(): void {
+  if (!reGesture || typeof document === 'undefined') return
+  document.removeEventListener('pointerdown', reGesture)
+  document.removeEventListener('keydown', reGesture)
+  reGesture = null
+}
+
+export function getAudioContext(): ContextLike | null {
+  if (!created) {
+    created = true
+    context = port.create()
+    if (context) {
+      context.addEventListener('statechange', () => {
+        if (context && context.state !== 'running') armGestureReresume()
+      })
+    }
+  }
+  return context
+}
+
+export function resumeAudio(): void {
+  const ctx = getAudioContext()
+  if (!ctx) return
+  disarmGestureReresume()
+  try {
+    // Must fire synchronously inside the gesture; swallow any failure.
+    void ctx.resume()
+  } catch {
+    // A dead context never breaks gameplay.
+  }
+}
+
+export function nowSeconds(): number {
+  const ctx = getAudioContext()
+  return ctx ? port.now(ctx) : 0
+}
+
+/** Test-only. */
+export function __resetContext(): void {
+  disarmGestureReresume()
+  port = browserAudioPort
+  context = null
+  created = false
+}
diff --git a/src/app/audio/index.ts b/src/app/audio/index.ts
index 37a5dc8..5a7ea79 100644
--- a/src/app/audio/index.ts
+++ b/src/app/audio/index.ts
@@ -1,178 +1,89 @@
-// Minimal audio stand-in. Section 07 builds the real AudioContext graph and
-// cues; this provides exactly what the hero scene (section 05) and settings
-// (section 06) consume: a resume port spied in tests, a single persisted
-// master sound preference both the sound prompt and the settings switch read
-// and write (never a shadow copy), and no-op cue hooks section 07 fills in.
-
-import { useSyncExternalStore } from 'react'
-
-const PREF_KEY = 'wargames.sound'
-
-export interface AudioPort {
-  /** Resume the (boot-suspended) AudioContext. Must be called synchronously
-   *  inside a user-gesture handler. */
-  resume(): void
-}
-
-// A real-browser port lazily creates one suspended AudioContext. Tests inject
-// a spy port via setAudioPort.
-let port: AudioPort = {
-  resume: () => {
-    void getAudioContext()?.resume()
-  },
-}
-
-let ctx: AudioContext | null = null
-let ctxTried = false
-
-function getAudioContext(): AudioContext | null {
-  if (ctxTried) return ctx
-  ctxTried = true
-  const Ctor =
-    typeof window !== 'undefined'
-      ? (window.AudioContext ??
-        (window as unknown as { webkitAudioContext?: typeof AudioContext })
-          .webkitAudioContext)
-      : undefined
-  if (Ctor) {
-    ctx = new Ctor()
-    // Created suspended; resumed only on a user gesture.
-    void ctx.suspend?.()
-  }
-  return ctx
-}
-
-export function setAudioPort(next: AudioPort): void {
-  port = next
-}
-
-export function resumeAudio(): void {
-  port.resume()
-}
-
-export type SoundPreference = 'on' | 'off'
-
-// The full preference set section 07 persists. master is the single value the
-// diegetic hero prompt and the settings master switch both back (no shadow
-// copy). A corrupt read falls to muted defaults.
-export interface AudioPrefs {
-  readonly master: boolean
-  readonly voice: boolean
-  readonly effects: boolean
-  readonly ambience: boolean
-}
-
-const PREFS_KEY = 'wargames.audio.prefs'
-const DEFAULT_PREFS: AudioPrefs = {
-  master: false,
-  voice: true,
-  effects: true,
-  ambience: true,
-}
-
-const prefListeners = new Set<() => void>()
-// In-memory is the session source of truth (and works where localStorage is
-// blocked, e.g. Safari private mode or a headless test env); localStorage is
-// the cross-reload persistence layer, read lazily and written on set.
-let prefs: AudioPrefs | undefined
-// Whether master was ever explicitly configured (so the hero prompt, which
-// gates on this, does not reappear once answered).
-let masterConfigured: boolean | undefined
-
-function load(): AudioPrefs {
-  if (prefs !== undefined) return prefs
-  try {
-    const raw = window.localStorage.getItem(PREFS_KEY)
-    if (raw) {
-      const parsed = JSON.parse(raw) as Partial<AudioPrefs> & {
-        configured?: boolean
-      }
-      prefs = {
-        master: parsed.master ?? DEFAULT_PREFS.master,
-        voice: parsed.voice ?? DEFAULT_PREFS.voice,
-        effects: parsed.effects ?? DEFAULT_PREFS.effects,
-        ambience: parsed.ambience ?? DEFAULT_PREFS.ambience,
-      }
-      masterConfigured = parsed.configured ?? true
-      return prefs
-    }
-  } catch {
-    // Corrupt or unavailable: muted defaults.
-  }
-  prefs = DEFAULT_PREFS
-  masterConfigured = false
-  return prefs
-}
-
-function persist(): void {
-  try {
-    window.localStorage.setItem(
-      PREFS_KEY,
-      JSON.stringify({ ...load(), configured: masterConfigured }),
-    )
-  } catch {
-    // In-memory still backs the session.
-  }
-  for (const listener of prefListeners) listener()
-}
-
-export function getAudioPrefs(): AudioPrefs {
-  return load()
-}
-
-export function setAudioPref(key: keyof AudioPrefs, value: boolean): void {
-  prefs = { ...load(), [key]: value }
-  if (key === 'master') masterConfigured = true
-  persist()
-}
-
-export function getSoundPreference(): SoundPreference | null {
-  load()
-  if (!masterConfigured) return null
-  return load().master ? 'on' : 'off'
-}
-
-export function hasSoundPreference(): boolean {
-  load()
-  return masterConfigured === true
-}
-
-export function setSoundPreference(value: SoundPreference): void {
-  setAudioPref('master', value === 'on')
-}
-
-export function onSoundPreference(listener: () => void): () => void {
-  prefListeners.add(listener)
-  return () => {
-    prefListeners.delete(listener)
-  }
-}
-
-/** Reactive view of the audio prefs for the settings dialog. */
-export function useAudioPrefs(): AudioPrefs {
-  return useSyncExternalStore(onSoundPreference, getAudioPrefs, getAudioPrefs)
-}
-
-// Cue hooks: section 07 fills these with real buffers. No-ops keep the hero
-// and terminal callable now.
+// The audio subsystem public surface. Sections 05 and 06 consume the prefs
+// and resume; later sections consume play/warnings/captions. The content
+// (recorded voice and effect files) arrives from the media split through a
+// manifest swap without touching any call site.
+export {
+  resumeAudio,
+  getAudioContext,
+  nowSeconds,
+  setAudioPortImpl as setAudioPort,
+  __resetContext,
+} from './context'
+export type {
+  WebAudioPort,
+  ContextLike,
+  ContextState,
+  ParamLike,
+  GainLike,
+  SourceLike,
+  OscillatorLike,
+  BufferLike,
+} from './port'
+export { browserAudioPort } from './port'
+
+export {
+  getAudioPrefs,
+  setAudioPref,
+  useAudioPrefs,
+  getSoundPreference,
+  hasSoundPreference,
+  setSoundPreference,
+  onAudioPrefs,
+  type AudioPrefs,
+  type SoundPreference,
+  __resetPrefs,
+} from './prefs'
+
+export {
+  CUE_MANIFEST,
+  validateManifest,
+  REQUIRED_CUE_IDS,
+  SILENT_TICK_IDS,
+  type CueDefinition,
+  type CueId,
+  type BusName,
+} from './manifest'
+
+export {
+  play,
+  enqueue,
+  drainQueue,
+  incrementGeneration,
+  currentGeneration,
+  preloadEager,
+  decodeCountFor,
+  stopBus,
+  getPlayingTranscript,
+  onPlayingTranscript,
+  __resetPlayer,
+} from './player'
+
+export { getBuses, busFor, masterBus, ambienceBus, __resetBuses } from './buses'
+export { registerWarnings, clearWarningGuard, __resetWarnings } from './warnings'
+export { Captions } from './captions'
+
+import { play } from './player'
+import { __resetContext } from './context'
+import { __resetPrefs } from './prefs'
+import { __resetBuses } from './buses'
+import { __resetPlayer } from './player'
+import { __resetWarnings } from './warnings'
+
+/** Fire the activation cue (section 05 plays this when the push-in finishes). */
 export function playActivationCue(): void {
-  // section 07
+  play('activation')
 }
 
+/** Fire a key-tick cue (the type-in hook calls this per revealed character). */
 export function playKeyTick(): void {
-  // section 07
+  play('key-tick')
 }
 
-/** Test-only. */
+/** Test-only: reset the whole subsystem. */
 export function __resetAudio(): void {
-  port = { resume: () => void getAudioContext()?.resume() }
-  prefListeners.clear()
-  prefs = undefined
-  masterConfigured = undefined
-  try {
-    window.localStorage.removeItem(PREFS_KEY)
-    window.localStorage.removeItem(PREF_KEY)
-  } catch {
-    // ignore
-  }
+  __resetWarnings()
+  __resetPlayer()
+  __resetBuses()
+  __resetContext()
+  __resetPrefs()
 }
diff --git a/src/app/audio/manifest.ts b/src/app/audio/manifest.ts
new file mode 100644
index 0000000..a150880
--- /dev/null
+++ b/src/app/audio/manifest.ts
@@ -0,0 +1,115 @@
+// The cue manifest: the single file the media split edits to swap synth
+// recipes for recorded files. Validation runs at load and in a unit test:
+// transcript required unless the cue is a whitelisted sub-100ms mechanical
+// tick, preload required, bus and policy from the unions. Effects cues are
+// eager; voice cues lazy (decode on first play, then cached) to bound PCM
+// memory on phones.
+import type { RecipeId } from './recipes'
+
+export type BusName = 'effects' | 'voice' | 'ambience'
+export type CuePolicy = 'exclusive-on-bus' | 'queue' | 'drop-if-stale'
+export type Preload = 'eager' | 'lazy'
+
+export type CueSource =
+  | { readonly kind: 'synth'; readonly recipe: RecipeId }
+  | { readonly kind: 'file'; readonly url: string }
+
+export interface CueDefinition {
+  readonly id: string
+  readonly source: CueSource
+  readonly bus: BusName
+  readonly gain: number
+  readonly transcript: string | null
+  readonly policy: CuePolicy
+  readonly preload: Preload
+}
+
+// Cues allowed a null transcript: sub-100ms mechanical ticks only.
+export const SILENT_TICK_IDS: ReadonlySet<string> = new Set(['key-tick', 'menu-blip'])
+
+export type CueId =
+  | 'key-tick'
+  | 'activation'
+  | 'menu-blip'
+  | 'confirm'
+  | 'reject'
+  | 'warn-30'
+  | 'warn-10'
+  | 'settle-good'
+  | 'settle-bad'
+  | 'ambience-hum'
+  | 'static-burst'
+  | 'voice-greeting'
+
+const synth = (recipe: RecipeId): CueSource => ({ kind: 'synth', recipe })
+
+export const CUE_MANIFEST: Readonly<Record<CueId, CueDefinition>> = {
+  'key-tick': { id: 'key-tick', source: synth('key-tick'), bus: 'effects', gain: 0.25, transcript: null, policy: 'drop-if-stale', preload: 'eager' },
+  activation: { id: 'activation', source: synth('activation'), bus: 'effects', gain: 0.5, transcript: 'TERMINAL ACTIVATED', policy: 'queue', preload: 'eager' },
+  'menu-blip': { id: 'menu-blip', source: synth('menu-blip'), bus: 'effects', gain: 0.3, transcript: null, policy: 'drop-if-stale', preload: 'eager' },
+  confirm: { id: 'confirm', source: synth('confirm'), bus: 'effects', gain: 0.4, transcript: 'CONFIRMED', policy: 'queue', preload: 'eager' },
+  reject: { id: 'reject', source: synth('reject'), bus: 'effects', gain: 0.4, transcript: 'REJECTED', policy: 'queue', preload: 'eager' },
+  'warn-30': { id: 'warn-30', source: synth('warn-30'), bus: 'effects', gain: 0.5, transcript: 'THIRTY SECONDS REMAIN', policy: 'queue', preload: 'eager' },
+  'warn-10': { id: 'warn-10', source: synth('warn-10'), bus: 'effects', gain: 0.6, transcript: 'TEN SECONDS REMAIN', policy: 'queue', preload: 'eager' },
+  'settle-good': { id: 'settle-good', source: synth('settle-good'), bus: 'effects', gain: 0.5, transcript: 'MISSION RESOLVED', policy: 'queue', preload: 'eager' },
+  'settle-bad': { id: 'settle-bad', source: synth('settle-bad'), bus: 'effects', gain: 0.5, transcript: 'MISSION LOST', policy: 'queue', preload: 'eager' },
+  'ambience-hum': { id: 'ambience-hum', source: synth('ambience-hum'), bus: 'ambience', gain: 0.2, transcript: 'ROOM TONE', policy: 'exclusive-on-bus', preload: 'eager' },
+  'static-burst': { id: 'static-burst', source: synth('static-burst'), bus: 'effects', gain: 0.35, transcript: 'STATIC', policy: 'queue', preload: 'eager' },
+  // Voice cue: a provisional synth placeholder with its transcript filled in;
+  // the media split swaps source to a recording without touching call sites.
+  'voice-greeting': { id: 'voice-greeting', source: synth('voice-placeholder'), bus: 'voice', gain: 0.9, transcript: 'GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME?', policy: 'exclusive-on-bus', preload: 'lazy' },
+}
+
+export interface ManifestError {
+  readonly id: string
+  readonly reason: string
+}
+
+const BUSES: ReadonlySet<string> = new Set(['effects', 'voice', 'ambience'])
+const POLICIES: ReadonlySet<string> = new Set([
+  'exclusive-on-bus',
+  'queue',
+  'drop-if-stale',
+])
+const PRELOADS: ReadonlySet<string> = new Set(['eager', 'lazy'])
+
+/** Validate every cue. Returns the list of violations (empty when valid). */
+export function validateManifest(
+  manifest: Readonly<Record<string, CueDefinition>>,
+): ManifestError[] {
+  const errors: ManifestError[] = []
+  for (const cue of Object.values(manifest)) {
+    if (cue.transcript === null && !SILENT_TICK_IDS.has(cue.id)) {
+      errors.push({ id: cue.id, reason: 'null transcript on a non-tick cue' })
+    }
+    if (!PRELOADS.has(cue.preload)) {
+      errors.push({ id: cue.id, reason: 'missing or invalid preload' })
+    }
+    if (!BUSES.has(cue.bus)) {
+      errors.push({ id: cue.id, reason: 'invalid bus' })
+    }
+    if (!POLICIES.has(cue.policy)) {
+      errors.push({ id: cue.id, reason: 'invalid policy' })
+    }
+    if (cue.source.kind === 'file' && !cue.source.url) {
+      errors.push({ id: cue.id, reason: 'file cue missing url' })
+    }
+  }
+  return errors
+}
+
+/** The engine events that must each have a cue. */
+export const REQUIRED_CUE_IDS: readonly CueId[] = [
+  'key-tick',
+  'activation',
+  'menu-blip',
+  'confirm',
+  'reject',
+  'warn-30',
+  'warn-10',
+  'settle-good',
+  'settle-bad',
+  'ambience-hum',
+  'static-burst',
+  'voice-greeting',
+]
diff --git a/src/app/audio/player.ts b/src/app/audio/player.ts
new file mode 100644
index 0000000..58ce982
--- /dev/null
+++ b/src/app/audio/player.ts
@@ -0,0 +1,229 @@
+// Playback: decode paths, synthesis, ducking, exclusivity, the generation
+// token, and the playing-transcript state captions read. Every public entry
+// swallows failure and returns synchronously; gameplay never awaits audio and
+// a dead speaker never throws into the game.
+import { getAudioContext, nowSeconds } from './context'
+import { ambienceBus, busFor } from './buses'
+import { RECIPES, type Recipe } from './recipes'
+import {
+  CUE_MANIFEST,
+  type CueDefinition,
+  type CueId,
+} from './manifest'
+import type { BufferLike, GainLike, SourceLike } from './port'
+
+const DUCK_LEVEL = 0.3
+const DUCK_TC = 0.05
+const ATTACK = 0.005
+const MICRO_FADE = 0.008
+
+type Manifest = Readonly<Record<string, CueDefinition>>
+
+const decoded = new Map<string, BufferLike>()
+const decodeInFlight = new Set<string>()
+const decodeCounts = new Map<string, number>()
+const activeOnBus = new Map<string, { source: SourceLike; gain: GainLike }>()
+
+let generation = 0
+const queue: { cueId: string; token: number; manifest: Manifest }[] = []
+
+// Caption state: the transcript of the currently playing voice/warning cue.
+let playingTranscript: string | null = null
+const captionListeners = new Set<() => void>()
+
+export function getPlayingTranscript(): string | null {
+  return playingTranscript
+}
+
+export function onPlayingTranscript(listener: () => void): () => void {
+  captionListeners.add(listener)
+  return () => captionListeners.delete(listener)
+}
+
+function setTranscript(text: string | null): void {
+  playingTranscript = text
+  for (const l of captionListeners) l()
+}
+
+export function incrementGeneration(): void {
+  generation += 1
+}
+
+export function currentGeneration(): number {
+  return generation
+}
+
+function countDecode(id: string): void {
+  decodeCounts.set(id, (decodeCounts.get(id) ?? 0) + 1)
+}
+
+export function decodeCountFor(id: string): number {
+  return decodeCounts.get(id) ?? 0
+}
+
+/** Eager file cues decode at manifest load. */
+export function preloadEager(manifest: Manifest = CUE_MANIFEST): void {
+  const ctx = getAudioContext()
+  if (!ctx) return
+  for (const cue of Object.values(manifest)) {
+    if (cue.preload === 'eager' && cue.source.kind === 'file') {
+      void decodeFile(cue).catch(() => {})
+    }
+  }
+}
+
+async function decodeFile(cue: CueDefinition): Promise<BufferLike | null> {
+  if (cue.source.kind !== 'file') return null
+  if (decoded.has(cue.id)) return decoded.get(cue.id)!
+  if (decodeInFlight.has(cue.id)) return null // a decode is already running
+  const ctx = getAudioContext()
+  if (!ctx) return null
+  decodeInFlight.add(cue.id)
+  try {
+    countDecode(cue.id)
+    const buffer = await ctx.decodeAudioData(new ArrayBuffer(0))
+    decoded.set(cue.id, buffer)
+    return buffer
+  } catch {
+    return null
+  } finally {
+    decodeInFlight.delete(cue.id)
+  }
+}
+
+function envelope(ctx: NonNullable<ReturnType<typeof getAudioContext>>, gainValue: number, startAt: number, ms: number): GainLike {
+  const g = ctx.createGain()
+  g.gain.setValueAtTime(0, startAt)
+  g.gain.linearRampToValueAtTime(gainValue, startAt + ATTACK)
+  const end = startAt + ms / 1000
+  g.gain.setTargetAtTime(0, Math.max(startAt, end - 0.03), 0.03)
+  return g
+}
+
+function buildSynth(recipe: Recipe, startAt: number): SourceLike | null {
+  const ctx = getAudioContext()
+  if (!ctx) return null
+  if (recipe.kind === 'osc' || recipe.kind === 'two-tone') {
+    const osc = ctx.createOscillator()
+    osc.type = recipe.wave
+    const freq = recipe.kind === 'osc' ? recipe.freq : recipe.freqA
+    osc.frequency.setValueAtTime(freq, startAt)
+    if (recipe.kind === 'two-tone') {
+      osc.frequency.setValueAtTime(recipe.freqB, startAt + recipe.ms / 2000)
+    }
+    return osc
+  }
+  // noise: a short filtered-noise buffer source.
+  const length = Math.max(1, Math.floor(recipe.ms * 44.1))
+  const buffer = ctx.createBuffer(1, length, 44100)
+  const data = buffer.getChannelData(0)
+  for (let i = 0; i < data.length; i++) data[i] = (i % 7) / 7 - 0.5
+  const src = ctx.createBufferSource()
+  src.buffer = buffer
+  return src
+}
+
+function microStop(entry: { source: SourceLike; gain: GainLike }, at: number): void {
+  try {
+    entry.gain.gain.cancelScheduledValues(at)
+    entry.gain.gain.setTargetAtTime(0, at, MICRO_FADE)
+    entry.source.stop(at + MICRO_FADE * 3)
+  } catch {
+    // ignore
+  }
+}
+
+function duckAmbience(start: boolean, at: number): void {
+  const amb = ambienceBus()
+  if (!amb) return
+  amb.gain.cancelScheduledValues(at)
+  amb.gain.setTargetAtTime(start ? DUCK_LEVEL : 1, at, DUCK_TC)
+}
+
+/** Play a cue now. Returns synchronously; failure resolves to silence. */
+export function play(cueId: string, manifest: Manifest = CUE_MANIFEST): void {
+  try {
+    const cue = manifest[cueId]
+    if (!cue) return
+    // Captions render even when audio is off or absent.
+    if (cue.bus === 'voice' || cueId.startsWith('warn')) {
+      setTranscript(cue.transcript)
+    }
+    const ctx = getAudioContext()
+    const bus = busFor(cue.bus)
+    if (!ctx || !bus) return
+    const at = nowSeconds()
+
+    // Exclusive-on-bus: micro-fade and stop any prior source on this bus.
+    if (cue.policy === 'exclusive-on-bus') {
+      const prior = activeOnBus.get(cue.bus)
+      if (prior) microStop(prior, at)
+    }
+
+    const source =
+      cue.source.kind === 'synth'
+        ? buildSynth(RECIPES[cue.source.recipe], at)
+        : (() => {
+            const cached = decoded.get(cue.id)
+            if (!cached) {
+              void decodeFile(cue).catch(() => {})
+              return null
+            }
+            const s = ctx.createBufferSource()
+            s.buffer = cached
+            return s
+          })()
+    if (!source) return
+
+    const gain = envelope(ctx, cue.gain, at, 240)
+    source.connect(gain)
+    gain.connect(bus)
+
+    if (cue.bus === 'voice') duckAmbience(true, at)
+    source.onended = (): void => {
+      if (cue.bus === 'voice') duckAmbience(false, nowSeconds())
+      if (activeOnBus.get(cue.bus)?.source === source) {
+        activeOnBus.delete(cue.bus)
+      }
+    }
+    activeOnBus.set(cue.bus, { source, gain })
+    source.start(at)
+  } catch {
+    // Silence, never an exception into gameplay.
+  }
+}
+
+/** Enqueue a cue with the current generation token; stale ones drop on drain. */
+export function enqueue(cueId: string, manifest: Manifest = CUE_MANIFEST): void {
+  queue.push({ cueId, token: generation, manifest })
+}
+
+export function drainQueue(): void {
+  const pending = queue.splice(0, queue.length)
+  for (const item of pending) {
+    if (item.token !== generation) continue // stale: drop silently
+    play(item.cueId, item.manifest)
+  }
+}
+
+export function stopBus(busName: CueDefinition['bus']): void {
+  const entry = activeOnBus.get(busName)
+  if (entry) {
+    microStop(entry, nowSeconds())
+    activeOnBus.delete(busName)
+  }
+}
+
+export const KNOWN_CUES: readonly CueId[] = Object.keys(CUE_MANIFEST) as CueId[]
+
+/** Test-only. */
+export function __resetPlayer(): void {
+  decoded.clear()
+  decodeInFlight.clear()
+  decodeCounts.clear()
+  activeOnBus.clear()
+  queue.length = 0
+  generation = 0
+  playingTranscript = null
+  captionListeners.clear()
+}
diff --git a/src/app/audio/port.ts b/src/app/audio/port.ts
new file mode 100644
index 0000000..b6b066b
--- /dev/null
+++ b/src/app/audio/port.ts
@@ -0,0 +1,82 @@
+// A thin Web Audio seam. jsdom has no Web Audio, so production code consumes
+// this port and tests replace it with a recording mock. It is a seam, not an
+// abstraction layer: the shapes mirror the real API closely.
+
+export interface ParamLike {
+  value: number
+  setValueAtTime(value: number, when: number): void
+  setTargetAtTime(target: number, when: number, timeConstant: number): void
+  linearRampToValueAtTime(value: number, when: number): void
+  cancelScheduledValues(when: number): void
+}
+
+export interface GainLike {
+  readonly gain: ParamLike
+  connect(destination: unknown): void
+  disconnect(): void
+}
+
+export interface SourceLike {
+  connect(destination: unknown): void
+  start(when?: number): void
+  stop(when?: number): void
+  onended: (() => void) | null
+  buffer?: unknown
+}
+
+export interface OscillatorLike extends SourceLike {
+  readonly frequency: ParamLike
+  type: string
+}
+
+export interface BufferLike {
+  readonly length: number
+  getChannelData(channel: number): Float32Array
+}
+
+export type ContextState =
+  | 'suspended'
+  | 'running'
+  | 'closed'
+  | 'interrupted'
+
+export interface ContextLike {
+  readonly state: ContextState
+  readonly currentTime: number
+  readonly destination: unknown
+  resume(): Promise<void>
+  suspend(): Promise<void>
+  createGain(): GainLike
+  createBufferSource(): SourceLike
+  createOscillator(): OscillatorLike
+  createBuffer(channels: number, length: number, sampleRate: number): BufferLike
+  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>
+  addEventListener(type: string, listener: () => void): void
+}
+
+export interface WebAudioPort {
+  /** Create a context, or null where Web Audio is unavailable. */
+  create(): ContextLike | null
+  /** The port's notion of "now" in seconds, for scheduling. */
+  now(context: ContextLike): number
+}
+
+// The real-browser port. Returns null when the constructor is missing.
+export const browserAudioPort: WebAudioPort = {
+  create() {
+    if (typeof window === 'undefined') return null
+    const Ctor =
+      window.AudioContext ??
+      (window as unknown as { webkitAudioContext?: typeof AudioContext })
+        .webkitAudioContext
+    if (!Ctor) return null
+    try {
+      return new Ctor() as unknown as ContextLike
+    } catch {
+      return null
+    }
+  },
+  now(context) {
+    return context.currentTime
+  },
+}
diff --git a/src/app/audio/prefs.ts b/src/app/audio/prefs.ts
new file mode 100644
index 0000000..99208f7
--- /dev/null
+++ b/src/app/audio/prefs.ts
@@ -0,0 +1,114 @@
+// Persisted audio preferences. One backing value per field; master is the
+// single value the diegetic ENABLE SOUND? prompt (section 05) and the settings
+// switch (section 06) both read and write. In-memory is the session source of
+// truth (works where localStorage is blocked, e.g. private mode or a headless
+// test env); localStorage persists across reloads and a corrupt read falls to
+// muted defaults without throwing.
+import { useSyncExternalStore } from 'react'
+
+const PREFS_KEY = 'wargames.audio.prefs'
+
+export interface AudioPrefs {
+  readonly master: boolean
+  readonly voice: boolean
+  readonly effects: boolean
+  readonly ambience: boolean
+}
+
+const DEFAULT_PREFS: AudioPrefs = {
+  master: false,
+  voice: true,
+  effects: true,
+  ambience: true,
+}
+
+let prefs: AudioPrefs | undefined
+let masterConfigured: boolean | undefined
+const listeners = new Set<() => void>()
+
+function load(): AudioPrefs {
+  if (prefs !== undefined) return prefs
+  try {
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
+  } catch {
+    // Corrupt or unavailable: muted defaults.
+  }
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
+  for (const listener of listeners) listener()
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
+}
+
+export type SoundPreference = 'on' | 'off'
+
+export function getSoundPreference(): SoundPreference | null {
+  load()
+  if (!masterConfigured) return null
+  return load().master ? 'on' : 'off'
+}
+
+export function hasSoundPreference(): boolean {
+  load()
+  return masterConfigured === true
+}
+
+export function setSoundPreference(value: SoundPreference): void {
+  setAudioPref('master', value === 'on')
+}
+
+export function onAudioPrefs(listener: () => void): () => void {
+  listeners.add(listener)
+  return () => {
+    listeners.delete(listener)
+  }
+}
+
+export function useAudioPrefs(): AudioPrefs {
+  return useSyncExternalStore(onAudioPrefs, getAudioPrefs, getAudioPrefs)
+}
+
+/** Test-only. */
+export function __resetPrefs(): void {
+  prefs = undefined
+  masterConfigured = undefined
+  listeners.clear()
+  try {
+    window.localStorage.removeItem(PREFS_KEY)
+  } catch {
+    // ignore
+  }
+}
diff --git a/src/app/audio/recipes.ts b/src/app/audio/recipes.ts
new file mode 100644
index 0000000..22be207
--- /dev/null
+++ b/src/app/audio/recipes.ts
@@ -0,0 +1,44 @@
+// Typed synth recipes. Provisional sounds for every event: square and
+// triangle oscillators for taps, blips, and two-tone cues; filtered noise for
+// hum and static. The media split later swaps file sources in; these keep
+// every call site sounding without a single recording.
+
+export type RecipeId =
+  | 'key-tick'
+  | 'activation'
+  | 'menu-blip'
+  | 'confirm'
+  | 'reject'
+  | 'warn-30'
+  | 'warn-10'
+  | 'settle-good'
+  | 'settle-bad'
+  | 'ambience-hum'
+  | 'static-burst'
+  | 'voice-placeholder'
+
+export type Recipe =
+  | { readonly kind: 'osc'; readonly wave: OscillatorType; readonly freq: number; readonly ms: number }
+  | {
+      readonly kind: 'two-tone'
+      readonly wave: OscillatorType
+      readonly freqA: number
+      readonly freqB: number
+      readonly ms: number
+    }
+  | { readonly kind: 'noise'; readonly ms: number; readonly lowpass: number }
+
+export const RECIPES: Readonly<Record<RecipeId, Recipe>> = {
+  'key-tick': { kind: 'osc', wave: 'square', freq: 1800, ms: 18 },
+  activation: { kind: 'two-tone', wave: 'triangle', freqA: 220, freqB: 660, ms: 320 },
+  'menu-blip': { kind: 'osc', wave: 'square', freq: 880, ms: 60 },
+  confirm: { kind: 'two-tone', wave: 'triangle', freqA: 660, freqB: 990, ms: 160 },
+  reject: { kind: 'two-tone', wave: 'square', freqA: 330, freqB: 180, ms: 200 },
+  'warn-30': { kind: 'osc', wave: 'triangle', freq: 440, ms: 260 },
+  'warn-10': { kind: 'osc', wave: 'triangle', freq: 620, ms: 320 },
+  'settle-good': { kind: 'two-tone', wave: 'triangle', freqA: 523, freqB: 784, ms: 400 },
+  'settle-bad': { kind: 'two-tone', wave: 'square', freqA: 196, freqB: 131, ms: 420 },
+  'ambience-hum': { kind: 'noise', ms: 1600, lowpass: 220 },
+  'static-burst': { kind: 'noise', ms: 180, lowpass: 6000 },
+  'voice-placeholder': { kind: 'osc', wave: 'square', freq: 300, ms: 260 },
+}
diff --git a/src/app/audio/warnings.ts b/src/app/audio/warnings.ts
new file mode 100644
index 0000000..4891eab
--- /dev/null
+++ b/src/app/audio/warnings.ts
@@ -0,0 +1,37 @@
+// Timer warnings. The only trigger is a relayed timerMilestone engine event;
+// nothing here reads Date.now, performance.now, or the repaint ticker. The
+// relay delivers each materialized event exactly once, so exactly-once is
+// structural, but a per-id guard still blocks a defensive double-delivery.
+// The guard clears on a mission boundary (clearWarningGuard) so the same
+// milestone id fires again next mission.
+import { onEngineEvent } from '../state'
+import { play } from './player'
+import type { EngineEvent } from '@engine'
+
+const MILESTONE_CUE: Readonly<Record<string, string>> = {
+  'warn-30': 'warn-30',
+  'warn-10': 'warn-10',
+}
+
+const fired = new Set<string>()
+
+export function registerWarnings(): () => void {
+  return onEngineEvent((event: EngineEvent) => {
+    if (event.type !== 'timerMilestone') return
+    const cueId = MILESTONE_CUE[event.id]
+    if (!cueId || fired.has(event.id)) return
+    fired.add(event.id)
+    play(cueId)
+  })
+}
+
+/** Clear the per-id guard at a mission boundary so a recurring milestone id
+ *  warns again. */
+export function clearWarningGuard(): void {
+  fired.clear()
+}
+
+/** Test-only. */
+export function __resetWarnings(): void {
+  fired.clear()
+}
diff --git a/test/app/audio/captions.test.tsx b/test/app/audio/captions.test.tsx
new file mode 100644
index 0000000..21240f9
--- /dev/null
+++ b/test/app/audio/captions.test.tsx
@@ -0,0 +1,33 @@
+import { afterEach, beforeEach, describe, expect, it } from 'vitest'
+import { act, cleanup, render, screen } from '@testing-library/react'
+import { Captions, play } from '@app/audio'
+import { resetAudio } from './harness'
+
+beforeEach(resetAudio)
+afterEach(() => {
+  cleanup()
+  resetAudio()
+})
+
+describe('Captions', () => {
+  it('renders the transcript of a playing voice cue even with no audio context', () => {
+    // No mock audio installed: jsdom has no Web Audio, so there is no context,
+    // yet a muted player must still read the line.
+    render(<Captions />)
+    expect(screen.queryByTestId('caption')).toBeNull()
+    act(() => {
+      play('voice-greeting')
+    })
+    expect(screen.getByTestId('caption').textContent).toMatch(
+      /GREETINGS PROFESSOR FALKEN/,
+    )
+  })
+
+  it('renders a warning cue transcript', () => {
+    render(<Captions />)
+    act(() => {
+      play('warn-10')
+    })
+    expect(screen.getByTestId('caption').textContent).toMatch(/TEN SECONDS/)
+  })
+})
diff --git a/test/app/audio/context.test.ts b/test/app/audio/context.test.ts
new file mode 100644
index 0000000..cc70263
--- /dev/null
+++ b/test/app/audio/context.test.ts
@@ -0,0 +1,35 @@
+import { afterEach, beforeEach, describe, expect, it } from 'vitest'
+import { getAudioContext, resumeAudio } from '@app/audio'
+import { installMockAudio, resetAudio, type MockContext } from './harness'
+
+let ctx: MockContext
+
+beforeEach(() => {
+  resetAudio()
+  ctx = installMockAudio('suspended').ctx
+})
+
+afterEach(resetAudio)
+
+describe('audio context lifecycle', () => {
+  it('is created suspended with no resume before activation', () => {
+    const created = getAudioContext()
+    expect(created?.state).toBe('suspended')
+    expect(ctx.resumeSpy).not.toHaveBeenCalled()
+  })
+
+  it('resumeAudio resumes synchronously', () => {
+    getAudioContext()
+    resumeAudio()
+    expect(ctx.resumeSpy).toHaveBeenCalledTimes(1)
+  })
+
+  it('re-resumes after an interruption on the next user gesture', () => {
+    getAudioContext() // registers the statechange listener
+    ctx.setState('suspended')
+    ctx.fire('statechange') // arms the one-shot gesture resume
+    expect(ctx.resumeSpy).not.toHaveBeenCalled()
+    document.dispatchEvent(new Event('pointerdown'))
+    expect(ctx.resumeSpy).toHaveBeenCalledTimes(1)
+  })
+})
diff --git a/test/app/audio/ducking.test.ts b/test/app/audio/ducking.test.ts
new file mode 100644
index 0000000..b08113f
--- /dev/null
+++ b/test/app/audio/ducking.test.ts
@@ -0,0 +1,59 @@
+import { afterEach, beforeEach, describe, expect, it } from 'vitest'
+import { play } from '@app/audio'
+import { installMockAudio, resetAudio, type MockContext } from './harness'
+
+let ctx: MockContext
+
+beforeEach(() => {
+  resetAudio()
+  ctx = installMockAudio('running').ctx
+})
+
+afterEach(resetAudio)
+
+// Bus gains are created in order: master, effects, voice, ambience.
+function ambienceGain() {
+  return ctx.gains[3]!.gain
+}
+
+describe('ducking', () => {
+  it('a voice start ramps the ambience bus down to 0.3 over 0.05', () => {
+    play('voice-greeting')
+    const target = ambienceGain().calls.find((c) => c.m === 'setTargetAtTime')
+    expect(target?.args[0]).toBe(0.3)
+    expect(target?.args[2]).toBe(0.05)
+  })
+
+  it('cancelScheduledValues precedes the duck ramp', () => {
+    play('voice-greeting')
+    const calls = ambienceGain().calls
+    const cancelAt = calls.findIndex((c) => c.m === 'cancelScheduledValues')
+    const rampAt = calls.findIndex(
+      (c) => c.m === 'setTargetAtTime' && c.args[0] === 0.3,
+    )
+    expect(cancelAt).toBeGreaterThanOrEqual(0)
+    expect(cancelAt).toBeLessThan(rampAt)
+  })
+
+  it('voice end restores the ambience bus with the 0.3 time constant', () => {
+    play('voice-greeting')
+    const voiceSource = ctx.sources[0]!
+    voiceSource.onended?.()
+    const restore = ambienceGain().calls.find(
+      (c) => c.m === 'setTargetAtTime' && c.args[0] === 1,
+    )
+    expect(restore).toBeDefined()
+  })
+
+  it('a micro-fade precedes every stop (no source stopped at full gain)', () => {
+    play('voice-greeting')
+    const firstEnvelope = ctx.gains[4]!.gain // the first cue envelope gain
+    const firstSource = ctx.sources[0]!
+    play('voice-greeting') // exclusive: micro-fades and stops the prior
+    const fade = firstEnvelope.calls.find(
+      (c) => c.m === 'setTargetAtTime' && c.args[0] === 0,
+    )
+    expect(fade).toBeDefined()
+    expect(firstSource.stopped).toBe(true)
+  })
+})
diff --git a/test/app/audio/harness.ts b/test/app/audio/harness.ts
new file mode 100644
index 0000000..619e601
--- /dev/null
+++ b/test/app/audio/harness.ts
@@ -0,0 +1,133 @@
+import { vi } from 'vitest'
+import { setAudioPort, __resetAudio } from '@app/audio'
+import type {
+  ContextLike,
+  ContextState,
+  GainLike,
+  ParamLike,
+  SourceLike,
+  WebAudioPort,
+} from '@app/audio'
+
+export interface RecordedParam extends ParamLike {
+  value: number
+  calls: { m: string; args: number[] }[]
+}
+
+export function makeParam(): RecordedParam {
+  const calls: { m: string; args: number[] }[] = []
+  return {
+    value: 1,
+    calls,
+    setValueAtTime(v, t) {
+      this.value = v
+      calls.push({ m: 'setValueAtTime', args: [v, t] })
+    },
+    setTargetAtTime(target, t, tc) {
+      calls.push({ m: 'setTargetAtTime', args: [target, t, tc] })
+    },
+    linearRampToValueAtTime(v, t) {
+      this.value = v
+      calls.push({ m: 'linearRampToValueAtTime', args: [v, t] })
+    },
+    cancelScheduledValues(t) {
+      calls.push({ m: 'cancelScheduledValues', args: [t] })
+    },
+  }
+}
+
+export interface RecordedGain extends GainLike {
+  gain: RecordedParam
+}
+
+export interface RecordedSource extends SourceLike {
+  started: boolean
+  stopped: boolean
+}
+
+export interface MockContext extends ContextLike {
+  gains: RecordedGain[]
+  sources: RecordedSource[]
+  resumeSpy: ReturnType<typeof vi.fn>
+  decodeSpy: ReturnType<typeof vi.fn>
+  fire(type: string): void
+  setState(state: ContextState): void
+}
+
+export function makeMockContext(initial: ContextState = 'suspended'): MockContext {
+  const gains: RecordedGain[] = []
+  const sources: RecordedSource[] = []
+  const listeners: Record<string, () => void> = {}
+  const resumeSpy = vi.fn(() => Promise.resolve())
+  const decodeSpy = vi.fn(() =>
+    Promise.resolve({ length: 1, getChannelData: () => new Float32Array(1) }),
+  )
+  let state = initial
+  const makeGain = (): RecordedGain => {
+    const g: RecordedGain = { gain: makeParam(), connect: () => {}, disconnect: () => {} }
+    gains.push(g)
+    return g
+  }
+  const makeSource = (): RecordedSource => {
+    const s: RecordedSource = {
+      onended: null,
+      started: false,
+      stopped: false,
+      connect: () => {},
+      start: () => {
+        s.started = true
+      },
+      stop: () => {
+        s.stopped = true
+      },
+    }
+    sources.push(s)
+    return s
+  }
+  const ctx: MockContext = {
+    get state() {
+      return state
+    },
+    currentTime: 0,
+    destination: {},
+    resume: resumeSpy,
+    suspend: () => Promise.resolve(),
+    createGain: makeGain,
+    createBufferSource: makeSource,
+    createOscillator: () =>
+      Object.assign(makeSource(), { frequency: makeParam(), type: 'sine' }),
+    createBuffer: (_c, length) => ({
+      length,
+      getChannelData: () => new Float32Array(length),
+    }),
+    decodeAudioData: decodeSpy as unknown as ContextLike['decodeAudioData'],
+    addEventListener: (type, cb) => {
+      listeners[type] = cb
+    },
+    gains,
+    sources,
+    resumeSpy,
+    decodeSpy,
+    fire: (type) => listeners[type]?.(),
+    setState: (s) => {
+      state = s
+    },
+  }
+  return ctx
+}
+
+export function installMockAudio(
+  initial: ContextState = 'suspended',
+): { ctx: MockContext; port: WebAudioPort } {
+  const ctx = makeMockContext(initial)
+  const port: WebAudioPort = {
+    create: () => ctx,
+    now: (c) => c.currentTime,
+  }
+  setAudioPort(port)
+  return { ctx, port }
+}
+
+export function resetAudio(): void {
+  __resetAudio()
+}
diff --git a/test/app/audio/manifest.test.ts b/test/app/audio/manifest.test.ts
new file mode 100644
index 0000000..ba2be89
--- /dev/null
+++ b/test/app/audio/manifest.test.ts
@@ -0,0 +1,55 @@
+import { describe, expect, it } from 'vitest'
+import {
+  CUE_MANIFEST,
+  REQUIRED_CUE_IDS,
+  validateManifest,
+  type CueDefinition,
+} from '@app/audio'
+
+const base: CueDefinition = {
+  id: 'x',
+  source: { kind: 'synth', recipe: 'confirm' },
+  bus: 'effects',
+  gain: 0.5,
+  transcript: 'OK',
+  policy: 'queue',
+  preload: 'eager',
+}
+
+describe('manifest validation', () => {
+  it('rejects a null transcript on a non-tick cue', () => {
+    const errors = validateManifest({ x: { ...base, transcript: null } })
+    expect(errors.some((e) => e.reason.includes('transcript'))).toBe(true)
+  })
+
+  it('accepts a null transcript on a whitelisted sub-100ms tick', () => {
+    const errors = validateManifest({
+      'key-tick': { ...base, id: 'key-tick', transcript: null },
+    })
+    expect(errors).toEqual([])
+  })
+
+  it('rejects a missing preload field', () => {
+    // Build without preload rather than deleting a readonly field.
+    const { preload: _preload, ...withoutPreload } = base
+    const errors = validateManifest({ x: withoutPreload as CueDefinition })
+    expect(errors.some((e) => e.reason.includes('preload'))).toBe(true)
+  })
+
+  it('the shipped manifest validates clean', () => {
+    expect(validateManifest(CUE_MANIFEST)).toEqual([])
+  })
+
+  it('every required event has a cue', () => {
+    for (const id of REQUIRED_CUE_IDS) {
+      expect(CUE_MANIFEST[id]).toBeDefined()
+    }
+  })
+
+  it('effects cues are eager and voice cues are lazy', () => {
+    for (const cue of Object.values(CUE_MANIFEST)) {
+      if (cue.bus === 'effects') expect(cue.preload).toBe('eager')
+      if (cue.bus === 'voice') expect(cue.preload).toBe('lazy')
+    }
+  })
+})
diff --git a/test/app/audio/player.test.ts b/test/app/audio/player.test.ts
new file mode 100644
index 0000000..3858335
--- /dev/null
+++ b/test/app/audio/player.test.ts
@@ -0,0 +1,110 @@
+import { afterEach, beforeEach, describe, expect, it } from 'vitest'
+import {
+  play,
+  enqueue,
+  drainQueue,
+  incrementGeneration,
+  preloadEager,
+  decodeCountFor,
+  masterBus,
+  resumeAudio,
+  setAudioPref,
+  type CueDefinition,
+} from '@app/audio'
+import { installMockAudio, resetAudio, type MockContext } from './harness'
+
+const fileManifest: Readonly<Record<string, CueDefinition>> = {
+  eagerFx: {
+    id: 'eagerFx',
+    source: { kind: 'file', url: '/wargames/audio/fx.wav' },
+    bus: 'effects',
+    gain: 0.5,
+    transcript: 'FX',
+    policy: 'queue',
+    preload: 'eager',
+  },
+  lazyVoice: {
+    id: 'lazyVoice',
+    source: { kind: 'file', url: '/wargames/audio/v.wav' },
+    bus: 'voice',
+    gain: 0.9,
+    transcript: 'V',
+    policy: 'exclusive-on-bus',
+    preload: 'lazy',
+  },
+}
+
+describe('decode paths', () => {
+  let ctx: MockContext
+  beforeEach(() => {
+    resetAudio()
+    ctx = installMockAudio('running').ctx
+  })
+  afterEach(resetAudio)
+
+  it('eager file cues decode at manifest load', () => {
+    preloadEager(fileManifest)
+    expect(decodeCountFor('eagerFx')).toBe(1)
+  })
+
+  it('a lazy cue played twice decodes once', () => {
+    play('lazyVoice', fileManifest)
+    play('lazyVoice', fileManifest)
+    expect(decodeCountFor('lazyVoice')).toBe(1)
+  })
+
+  it('master gain is 0 until audio is enabled', () => {
+    play('confirm')
+    expect(masterBus()?.gain.value).toBe(0)
+    void ctx
+  })
+
+  it('enabling audio lifts the master gain', () => {
+    play('confirm')
+    setAudioPref('master', true)
+    expect(masterBus()?.gain.value).toBe(1)
+  })
+})
+
+describe('exclusivity and generation token', () => {
+  let ctx: MockContext
+  beforeEach(() => {
+    resetAudio()
+    ctx = installMockAudio('running').ctx
+  })
+  afterEach(resetAudio)
+
+  it('a new voice cue kills the prior voice line', () => {
+    play('voice-greeting')
+    const first = ctx.sources[0]!
+    play('voice-greeting')
+    expect(first.stopped).toBe(true)
+  })
+
+  it('a queued cue with a stale generation token drops on drain', () => {
+    enqueue('confirm')
+    incrementGeneration() // screen change or catch-up wake
+    const before = ctx.sources.length
+    drainQueue()
+    expect(ctx.sources.length).toBe(before) // dropped silently
+  })
+
+  it('a queued cue with a current token plays on drain', () => {
+    const before = ctx.sources.length
+    enqueue('confirm')
+    drainQueue()
+    expect(ctx.sources.length).toBeGreaterThan(before)
+  })
+})
+
+describe('resilience', () => {
+  beforeEach(resetAudio)
+  afterEach(resetAudio)
+
+  it('every entry point swallows a missing context without throwing', () => {
+    // No mock installed: jsdom has no Web Audio, so there is no context.
+    expect(() => play('confirm')).not.toThrow()
+    expect(() => resumeAudio()).not.toThrow()
+    expect(() => drainQueue()).not.toThrow()
+  })
+})
diff --git a/test/app/audio/prefs.test.ts b/test/app/audio/prefs.test.ts
new file mode 100644
index 0000000..f9581d0
--- /dev/null
+++ b/test/app/audio/prefs.test.ts
@@ -0,0 +1,51 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import {
+  getAudioPrefs,
+  setAudioPref,
+  getSoundPreference,
+  setSoundPreference,
+} from '@app/audio'
+import { resetAudio } from './harness'
+
+beforeEach(resetAudio)
+afterEach(() => {
+  resetAudio()
+  vi.restoreAllMocks()
+})
+
+describe('audio preferences', () => {
+  it('toggles round-trip through the single backing store', () => {
+    expect(getAudioPrefs().effects).toBe(true)
+    setAudioPref('effects', false)
+    expect(getAudioPrefs().effects).toBe(false)
+    setAudioPref('ambience', false)
+    expect(getAudioPrefs().ambience).toBe(false)
+  })
+
+  it('defaults to muted master', () => {
+    expect(getAudioPrefs().master).toBe(false)
+    expect(getSoundPreference()).toBeNull()
+  })
+
+  it('a corrupt stored value falls back to muted defaults without throwing', () => {
+    // A localStorage that returns garbage for the prefs key.
+    vi.stubGlobal('window', {
+      ...globalThis.window,
+      localStorage: {
+        getItem: () => '{ not json',
+        setItem: () => {},
+        removeItem: () => {},
+      },
+    })
+    resetAudio()
+    expect(() => getAudioPrefs()).not.toThrow()
+    expect(getAudioPrefs().master).toBe(false)
+  })
+
+  it('one master value backs both the prompt and the settings switch', () => {
+    setSoundPreference('on') // the diegetic hero prompt path
+    expect(getAudioPrefs().master).toBe(true)
+    setAudioPref('master', false) // the settings switch path
+    expect(getSoundPreference()).toBe('off')
+  })
+})
diff --git a/test/app/audio/warnings.test.ts b/test/app/audio/warnings.test.ts
new file mode 100644
index 0000000..4ea7e49
--- /dev/null
+++ b/test/app/audio/warnings.test.ts
@@ -0,0 +1,42 @@
+import { afterEach, beforeEach, describe, expect, it } from 'vitest'
+import { registerWarnings } from '@app/audio'
+import { relayEvents, __resetConsumers } from '@app/state/events'
+import { installMockAudio, resetAudio, type MockContext } from './harness'
+
+let ctx: MockContext
+let unregister: () => void
+
+beforeEach(() => {
+  resetAudio()
+  __resetConsumers()
+  ctx = installMockAudio('running').ctx
+  unregister = registerWarnings()
+})
+
+afterEach(() => {
+  unregister()
+  __resetConsumers()
+  resetAudio()
+})
+
+describe('timer warnings', () => {
+  it('a relayed timerMilestone fires its warning cue exactly once', () => {
+    const before = ctx.sources.length
+    relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
+    expect(ctx.sources.length).toBeGreaterThan(before)
+    const after = ctx.sources.length
+    // Double-delivering the same milestone id does not fire a second time.
+    relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
+    expect(ctx.sources.length).toBe(after)
+  })
+
+  it('no warning fires without an emitted event (no wall-clock path)', () => {
+    expect(ctx.sources.length).toBe(0)
+  })
+
+  it('a non-warning event fires no cue', () => {
+    const before = ctx.sources.length
+    relayEvents([{ type: 'debriefAcknowledged', missionId: 'alpha' }])
+    expect(ctx.sources.length).toBe(before)
+  })
+})
diff --git a/test/app/hero/harness.ts b/test/app/hero/harness.ts
index 8422b9a..12d4dd8 100644
--- a/test/app/hero/harness.ts
+++ b/test/app/hero/harness.ts
@@ -1,12 +1,13 @@
 import { vi } from 'vitest'
-import { setAudioPort, __resetAudio } from '@app/audio'
+import { __resetAudio } from '@app/audio'
 import { __resetPushIn } from '@app/hero'
 import { __resetInputStack } from '@app/screens/inputStack'
+import { installMockAudio } from '../audio/harness'
 
+/** Install a mock audio context and return the spy its resume() routes to. */
 export function spyResume(): ReturnType<typeof vi.fn> {
-  const resume = vi.fn()
-  setAudioPort({ resume })
-  return resume
+  const { ctx } = installMockAudio('suspended')
+  return ctx.resumeSpy
 }
 
 export function resetHero(): void {
