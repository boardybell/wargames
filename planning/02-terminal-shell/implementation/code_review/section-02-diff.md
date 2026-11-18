diff --git a/src/app/state/displayClock.ts b/src/app/state/displayClock.ts
new file mode 100644
index 0000000..857cfde
--- /dev/null
+++ b/src/app/state/displayClock.ts
@@ -0,0 +1,90 @@
+// The display clock. Countdown rendering reads a monotonic performance.now()
+// delta on top of the engine's clamped lastNow, captured at the last wake or
+// dispatch. Date.now() is never read for display, so a backward wall-clock
+// jump cannot make a countdown gain time while the engine refuses to
+// un-expire a deadline: the engine's lastNow clamp and this display share one
+// truth, reconciled at every wake. The ticker only repaints; it never calls
+// dispatch or advanceToNow for display. It does own one edge: a deadline that
+// passes while the tab stays visible with no interaction triggers exactly one
+// self-wake, guarded per endsAt instance.
+import { getState, hasState } from './store'
+
+/** Pure: displayed remaining ms for a deadline, clamped at zero. */
+export function remainingTime(
+  endsAt: number,
+  engineLastNow: number,
+  perfAtCapture: number,
+  perfNow: number,
+): number {
+  const elapsed = perfNow - perfAtCapture
+  return Math.max(0, endsAt - (engineLastNow + elapsed))
+}
+
+let engineLastNow = 0
+let perfAtCapture = 0
+
+/** Internal: send and wake call this with the new clamped lastNow. */
+export function captureClock(lastNow: number): void {
+  engineLastNow = lastNow
+  perfAtCapture = performance.now()
+}
+
+/** Current displayed remaining ms for a deadline, using the captured pair. */
+export function remainingFor(endsAt: number): number {
+  return remainingTime(endsAt, engineLastNow, perfAtCapture, performance.now())
+}
+
+// Self-wake guard: a Set of endsAt instances already self-woken, so the
+// finale's own later deadline still self-wakes after a mission's guard trips
+// (a new deadline is a new key). Not an app-level boolean.
+const selfWoken = new Set<number>()
+const tickSubscribers = new Set<() => void>()
+let rafId: number | null = null
+
+export function subscribeTick(listener: () => void): () => void {
+  tickSubscribers.add(listener)
+  return () => {
+    tickSubscribers.delete(listener)
+  }
+}
+
+function activeDeadline(): number | null {
+  if (!hasState()) return null
+  return getState().activeMission?.endsAt ?? null
+}
+
+/** One frame of work: self-wake if the active deadline just hit zero, then
+ *  ping repaint subscribers. Exposed for deterministic testing without rAF. */
+export function tickOnce(wakeFn: () => void): void {
+  const endsAt = activeDeadline()
+  if (endsAt !== null && !selfWoken.has(endsAt) && remainingFor(endsAt) <= 0) {
+    selfWoken.add(endsAt)
+    wakeFn()
+  }
+  for (const listener of tickSubscribers) listener()
+}
+
+export function startTicker(wakeFn: () => void): void {
+  if (rafId !== null) return
+  const loop = (): void => {
+    tickOnce(wakeFn)
+    rafId = requestAnimationFrame(loop)
+  }
+  rafId = requestAnimationFrame(loop)
+}
+
+export function stopTicker(): void {
+  if (rafId !== null) {
+    cancelAnimationFrame(rafId)
+    rafId = null
+  }
+}
+
+/** Test-only. */
+export function __resetClock(): void {
+  engineLastNow = 0
+  perfAtCapture = 0
+  selfWoken.clear()
+  tickSubscribers.clear()
+  stopTicker()
+}
diff --git a/src/app/state/events.ts b/src/app/state/events.ts
new file mode 100644
index 0000000..23d1497
--- /dev/null
+++ b/src/app/state/events.ts
@@ -0,0 +1,32 @@
+// The exactly-once emitted-event relay. Because the engine's emitted array
+// corresponds one-to-one with queue deletions and settlement transitions,
+// exactly-once is structural: this relay never stores, dedupes, re-derives,
+// or synthesizes events from the wall clock. It only fans each emitted event
+// out to the registered consumers, in order. Audio warnings (07), the
+// announcer (09), and lamp control (08) subscribe here.
+import type { EngineEvent } from '@engine'
+
+export type EngineEventConsumer = (event: EngineEvent) => void
+export type Unsubscribe = () => void
+
+const consumers = new Set<EngineEventConsumer>()
+
+export function onEngineEvent(consumer: EngineEventConsumer): Unsubscribe {
+  consumers.add(consumer)
+  return () => {
+    consumers.delete(consumer)
+  }
+}
+
+/** Internal: send and wake call this once per dispatch/advance with the
+ *  emitted array, in engine order. */
+export function relayEvents(events: readonly EngineEvent[]): void {
+  for (const event of events) {
+    for (const consumer of consumers) consumer(event)
+  }
+}
+
+/** Test-only. */
+export function __resetConsumers(): void {
+  consumers.clear()
+}
diff --git a/src/app/state/index.ts b/src/app/state/index.ts
new file mode 100644
index 0000000..9b64b9a
--- /dev/null
+++ b/src/app/state/index.ts
@@ -0,0 +1,73 @@
+// The public surface the rest of the shell consumes. Everything downstream
+// (terminal framework, hero routing, audio warnings, cabinet lamps) reads
+// this layer; nothing outside src/app/state/ calls engine dispatch or
+// advanceToNow directly. setState and the storage internals stay private.
+import { createCampaign, type EngineContext, type StoragePort } from '@engine'
+import { setContext, setState } from './store'
+import { registerWakeLifecycle, wake } from './wake'
+import {
+  flushPending,
+  loadAtBoot,
+  setPort,
+} from './saveBinding'
+import { registerMultiTab } from './multiTab'
+
+export { useCampaign } from './store'
+export { send, type SendResult } from './send'
+export { wake } from './wake'
+export { onEngineEvent, type EngineEventConsumer, type Unsubscribe } from './events'
+export {
+  remainingFor,
+  remainingTime,
+  subscribeTick,
+  startTicker,
+  stopTicker,
+} from './displayClock'
+export { getRecoveryFlag } from './saveBinding'
+export { getMultiTabNotice, onMultiTabNotice } from './multiTab'
+
+export interface InitOptions {
+  readonly ctx: EngineContext
+  /** The seed to start a fresh campaign from when no save is present. */
+  readonly seedName: string
+  /** Override the localStorage port (tests inject an in-memory one). */
+  readonly port?: StoragePort
+}
+
+/** Called once at App boot: load the save, restore or create the campaign,
+ *  register lifecycle listeners, and perform the initial wake. Returns a
+ *  teardown that tests use to unregister listeners. */
+export function init(options: InitOptions): () => void {
+  setContext(options.ctx)
+  if (options.port) setPort(options.port)
+
+  const loaded = loadAtBoot()
+  setState(
+    loaded.state ??
+      createCampaign(
+        options.ctx,
+        options.seedName,
+        { extendedTime: false },
+        Date.now(),
+      ),
+  )
+
+  const teardownWake = registerWakeLifecycle()
+  const teardownMultiTab = registerMultiTab()
+  const onHidden = (): void => {
+    if (document.visibilityState === 'hidden') flushPending()
+  }
+  const onPageHide = (): void => flushPending()
+  document.addEventListener('visibilitychange', onHidden)
+  window.addEventListener('pagehide', onPageHide)
+
+  // Reconcile any time that passed before the shell mounted.
+  wake()
+
+  return () => {
+    teardownWake()
+    teardownMultiTab()
+    document.removeEventListener('visibilitychange', onHidden)
+    window.removeEventListener('pagehide', onPageHide)
+  }
+}
diff --git a/src/app/state/multiTab.ts b/src/app/state/multiTab.ts
new file mode 100644
index 0000000..b84a15e
--- /dev/null
+++ b/src/app/state/multiTab.ts
@@ -0,0 +1,43 @@
+// Single-active-tab enforcement. A window storage event for a save key means
+// another tab wrote it (the writing tab never receives its own event). On
+// detection, raise the GAME OPEN IN ANOTHER TAB notice and pause local writes
+// until reload. Single active tab is a documented limitation; no leader
+// election is attempted.
+import { pauseWrites, SAVE_KEYS } from './saveBinding'
+
+let notice = false
+const listeners = new Set<() => void>()
+
+export function getMultiTabNotice(): boolean {
+  return notice
+}
+
+export function onMultiTabNotice(listener: () => void): () => void {
+  listeners.add(listener)
+  return () => {
+    listeners.delete(listener)
+  }
+}
+
+function handleStorage(event: StorageEvent): void {
+  if (event.key && (SAVE_KEYS as readonly string[]).includes(event.key)) {
+    if (!notice) {
+      notice = true
+      pauseWrites()
+      for (const listener of listeners) listener()
+    }
+  }
+}
+
+export function registerMultiTab(): () => void {
+  window.addEventListener('storage', handleStorage)
+  return () => {
+    window.removeEventListener('storage', handleStorage)
+  }
+}
+
+/** Test-only. */
+export function __resetMultiTab(): void {
+  notice = false
+  listeners.clear()
+}
diff --git a/src/app/state/saveBinding.ts b/src/app/state/saveBinding.ts
new file mode 100644
index 0000000..3cae865
--- /dev/null
+++ b/src/app/state/saveBinding.ts
@@ -0,0 +1,130 @@
+// Binds the engine storage port to window.localStorage and schedules writes.
+// Ordinary changes debounce; irreversible phase transitions and any
+// settlement flush immediately; hiding or unloading the page flushes a
+// pending write synchronously. Every storage call is fallible by engine-port
+// contract, so nothing here throws into gameplay. The load recovery flag is
+// exposed for the corrupt-save notice (section 06). Writes pause when another
+// tab is detected (multi-tab).
+import {
+  loadCampaign,
+  persistCampaign,
+  type CampaignAction,
+  type EngineEvent,
+  type RecoveryFlag,
+  type StoragePort,
+} from '@engine'
+import { getContext, getState } from './store'
+
+// These mirror the engine's internal slot keys; the multi-tab watcher needs
+// the literal names and the engine does not surface them.
+export const SAVE_KEYS = [
+  'wargames.save.primary',
+  'wargames.save.backup',
+] as const
+
+const DEBOUNCE_MS = 600
+
+const IMMEDIATE_ACTIONS = new Set<CampaignAction['type']>([
+  'START_MISSION',
+  'FORFEIT_MISSION',
+  'ACKNOWLEDGE_DEBRIEF',
+  'NEW_CAMPAIGN',
+])
+
+/** A StoragePort over window.localStorage. Calls may throw (Safari private
+ *  mode, quota); the engine's persist/load handle that. */
+export function createLocalStoragePort(): StoragePort {
+  return {
+    read: (key) => window.localStorage.getItem(key),
+    write: (key, value) => {
+      window.localStorage.setItem(key, value)
+    },
+    remove: (key) => {
+      window.localStorage.removeItem(key)
+    },
+  }
+}
+
+let port: StoragePort = createLocalStoragePort()
+let recovery: RecoveryFlag = 'clean'
+let paused = false
+let timer: ReturnType<typeof setTimeout> | null = null
+
+export function setPort(next: StoragePort): void {
+  port = next
+}
+
+export function getRecoveryFlag(): RecoveryFlag {
+  return recovery
+}
+
+export function pauseWrites(): void {
+  paused = true
+}
+
+export function isPaused(): boolean {
+  return paused
+}
+
+function clearTimer(): void {
+  if (timer !== null) {
+    clearTimeout(timer)
+    timer = null
+  }
+}
+
+function flushNow(): void {
+  clearTimer()
+  if (paused) return
+  persistCampaign(port, getState(), getContext().missions)
+}
+
+function scheduleDebounced(): void {
+  clearTimer()
+  timer = setTimeout(flushNow, DEBOUNCE_MS)
+}
+
+function hasSettlement(emitted: readonly EngineEvent[]): boolean {
+  return emitted.some((e) => e.type === 'settlement')
+}
+
+/** Classify a dispatched action for debounce vs immediate flush. */
+export function notifyAction(
+  action: CampaignAction,
+  emitted: readonly EngineEvent[],
+): void {
+  if (IMMEDIATE_ACTIONS.has(action.type) || hasSettlement(emitted)) {
+    flushNow()
+  } else {
+    scheduleDebounced()
+  }
+}
+
+/** A wake with a settlement in it (a deadline expired) flushes immediately;
+ *  any other state-advancing wake debounces. */
+export function notifyWake(emitted: readonly EngineEvent[]): void {
+  if (hasSettlement(emitted)) flushNow()
+  else scheduleDebounced()
+}
+
+/** visibilitychange-to-hidden and pagehide call this to persist a pending
+ *  debounced write before the page may be frozen or discarded. */
+export function flushPending(): void {
+  if (timer !== null) flushNow()
+}
+
+/** Load the save at boot. Returns the restored state or null for a fresh
+ *  start, and records the recovery flag for the notice. */
+export function loadAtBoot(): ReturnType<typeof loadCampaign> {
+  const result = loadCampaign(port, getContext().missions)
+  recovery = result.recovery
+  return result
+}
+
+/** Test-only. */
+export function __resetSaveBinding(): void {
+  clearTimer()
+  port = createLocalStoragePort()
+  recovery = 'clean'
+  paused = false
+}
diff --git a/src/app/state/send.ts b/src/app/state/send.ts
new file mode 100644
index 0000000..8105320
--- /dev/null
+++ b/src/app/state/send.ts
@@ -0,0 +1,29 @@
+// The one mutation path in the app. Samples Date.now(), calls the engine
+// reducer, stores the result, relays emitted events exactly once, recaptures
+// the display clock, and classifies the action for the save binding. On a
+// rejection the store is untouched and no events relay (the engine emits
+// none); the reason comes back for inline rendering by the caller.
+import { dispatch, type CampaignAction } from '@engine'
+import { getContext, getState, setState } from './store'
+import { relayEvents } from './events'
+import { captureClock } from './displayClock'
+import { notifyAction } from './saveBinding'
+
+export type SendResult =
+  | { readonly rejected: false }
+  | { readonly rejected: true; readonly reason: string }
+
+export function send(action: CampaignAction): SendResult {
+  const { state, emitted, rejection } = dispatch(
+    getContext(),
+    getState(),
+    action,
+    Date.now(),
+  )
+  if (rejection) return { rejected: true, reason: rejection.reason }
+  setState(state)
+  relayEvents(emitted)
+  captureClock(state.lastNow)
+  notifyAction(action, emitted)
+  return { rejected: false }
+}
diff --git a/src/app/state/store.ts b/src/app/state/store.ts
new file mode 100644
index 0000000..1a7e7a8
--- /dev/null
+++ b/src/app/state/store.ts
@@ -0,0 +1,56 @@
+// The one store the whole shell reads from. It owns the current
+// CampaignState and the EngineContext (seed catalog + mission registry the
+// later splits assemble). No reducer logic lives here; the engine is the
+// reducer. Reads go through useSyncExternalStore so React 18 concurrent
+// rendering always sees a consistent snapshot. setState and setContext are
+// module-private; only send, wake, and init mutate.
+import { useSyncExternalStore } from 'react'
+import type { EngineContext } from '@engine'
+import type { CampaignState } from '@engine'
+
+let context: EngineContext | null = null
+let state: CampaignState | null = null
+const listeners = new Set<() => void>()
+
+export function setContext(ctx: EngineContext): void {
+  context = ctx
+}
+
+export function getContext(): EngineContext {
+  if (!context) throw new Error('state: store used before init')
+  return context
+}
+
+/** Internal: the only callers are send, wake, and init. */
+export function setState(next: CampaignState): void {
+  state = next
+  for (const listener of listeners) listener()
+}
+
+export function getState(): CampaignState {
+  if (!state) throw new Error('state: store read before init')
+  return state
+}
+
+export function hasState(): boolean {
+  return state !== null
+}
+
+function subscribe(listener: () => void): () => void {
+  listeners.add(listener)
+  return () => {
+    listeners.delete(listener)
+  }
+}
+
+/** Subscription hook for components. Assumes init has run. */
+export function useCampaign(): CampaignState {
+  return useSyncExternalStore(subscribe, getState, getState)
+}
+
+/** Test-only: drop all state so each test starts clean. */
+export function __resetStore(): void {
+  context = null
+  state = null
+  listeners.clear()
+}
diff --git a/src/app/state/wake.ts b/src/app/state/wake.ts
new file mode 100644
index 0000000..1a1c241
--- /dev/null
+++ b/src/app/state/wake.ts
@@ -0,0 +1,43 @@
+// Time passage. advanceCampaign clamps the incoming now to the engine's
+// lastNow high-water mark, so a backward wall-clock jump can never un-expire
+// a deadline. Double wakes are harmless by engine contract: catch-up is
+// idempotent and a second call with the same now emits nothing. Wired to app
+// start, visibilitychange-to-visible, pageshow with persisted true (bfcache
+// resume), and window focus.
+import { advanceCampaign } from '@engine'
+import { getContext, getState, hasState, setState } from './store'
+import { relayEvents } from './events'
+import { captureClock } from './displayClock'
+import { notifyWake } from './saveBinding'
+
+export function wake(): void {
+  if (!hasState()) return
+  const { state, emitted } = advanceCampaign(
+    getContext(),
+    getState(),
+    Date.now(),
+  )
+  setState(state)
+  relayEvents(emitted)
+  captureClock(state.lastNow)
+  notifyWake(emitted)
+}
+
+/** Register the wake triggers once. Returns a teardown for tests. */
+export function registerWakeLifecycle(): () => void {
+  const onVisible = (): void => {
+    if (document.visibilityState === 'visible') wake()
+  }
+  const onPageShow = (event: PageTransitionEvent): void => {
+    if (event.persisted) wake()
+  }
+  const onFocus = (): void => wake()
+  document.addEventListener('visibilitychange', onVisible)
+  window.addEventListener('pageshow', onPageShow)
+  window.addEventListener('focus', onFocus)
+  return () => {
+    document.removeEventListener('visibilitychange', onVisible)
+    window.removeEventListener('pageshow', onPageShow)
+    window.removeEventListener('focus', onFocus)
+  }
+}
diff --git a/test/app/state/displayClock.test.ts b/test/app/state/displayClock.test.ts
new file mode 100644
index 0000000..0f09e52
--- /dev/null
+++ b/test/app/state/displayClock.test.ts
@@ -0,0 +1,57 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { init, send } from '@app/state'
+import { remainingTime, tickOnce } from '@app/state/displayClock'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+describe('remainingTime (pure derivation)', () => {
+  it('subtracts the monotonic perf delta from the deadline', () => {
+    // endsAt 1000, engine lastNow 600, captured at perf 50, now perf 90.
+    expect(remainingTime(1000, 600, 50, 90)).toBe(360)
+  })
+
+  it('never increases as perf advances (monotonic non-increasing)', () => {
+    const a = remainingTime(5000, 1000, 0, 100)
+    const b = remainingTime(5000, 1000, 0, 200)
+    expect(b).toBeLessThan(a)
+  })
+
+  it('clamps at zero once the deadline has passed', () => {
+    expect(remainingTime(100, 600, 50, 1000)).toBe(0)
+  })
+
+  it('reads no wall clock: a Date.now jump cannot change the result', () => {
+    const spy = vi.spyOn(Date, 'now')
+    remainingTime(1000, 600, 50, 90)
+    expect(spy).not.toHaveBeenCalled()
+    spy.mockRestore()
+  })
+})
+
+describe('display ticker does not drive the engine', () => {
+  const START = 1_000_000
+  let teardown: () => void
+
+  beforeEach(() => {
+    resetAll()
+    vi.spyOn(Date, 'now').mockReturnValue(START)
+    vi.spyOn(performance, 'now').mockReturnValue(0)
+    teardown = init({
+      ctx: buildCtx(),
+      seedName: 'test-seed',
+      port: memoryPort(),
+    })
+  })
+
+  afterEach(() => {
+    teardown()
+    vi.restoreAllMocks()
+  })
+
+  it('does not self-wake while the deadline is still ahead', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    // perf.now stays at 0, deadline is 240s out: remaining > 0.
+    const spy = vi.fn()
+    tickOnce(spy)
+    expect(spy).not.toHaveBeenCalled()
+  })
+})
diff --git a/test/app/state/events.test.ts b/test/app/state/events.test.ts
new file mode 100644
index 0000000..f45ad6e
--- /dev/null
+++ b/test/app/state/events.test.ts
@@ -0,0 +1,56 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { init, send, wake } from '@app/state'
+import { onEngineEvent } from '@app/state/events'
+import type { EngineEvent } from '@engine'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+const START = 1_000_000
+const nowRef = { value: START }
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  nowRef.value = START
+  vi.spyOn(Date, 'now').mockImplementation(() => nowRef.value)
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+})
+
+describe('emitted relay', () => {
+  it('relays a settlement to every registered consumer exactly once', () => {
+    const a: EngineEvent[] = []
+    const b: EngineEvent[] = []
+    onEngineEvent((e) => a.push(e))
+    onEngineEvent((e) => b.push(e))
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    send({ type: 'FORFEIT_MISSION' })
+    expect(a.filter((e) => e.type === 'settlement')).toHaveLength(1)
+    expect(b.filter((e) => e.type === 'settlement')).toHaveLength(1)
+  })
+
+  it('a catch-up wake relays the crossed timerMilestone events in order, once', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    const seen: string[] = []
+    onEngineEvent((e) => {
+      if (e.type === 'timerMilestone') seen.push(e.id)
+    })
+    // Cross warn-30 (endsAt-30s) and warn-10 (endsAt-10s) without expiring.
+    nowRef.value = START + 240_000 - 5_000
+    wake()
+    expect(seen).toEqual(['warn-30', 'warn-10'])
+  })
+
+  it('a second wake with the same now relays no events', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    nowRef.value = START + 240_000 - 5_000
+    wake()
+    const after: string[] = []
+    onEngineEvent((e) => after.push(e.type))
+    wake()
+    expect(after).toEqual([])
+  })
+})
diff --git a/test/app/state/harness.ts b/test/app/state/harness.ts
new file mode 100644
index 0000000..eb19e43
--- /dev/null
+++ b/test/app/state/harness.ts
@@ -0,0 +1,40 @@
+// Shared harness for the engine-binding tests: a real engine over the
+// test-double mission, an in-memory storage port, and the module resets so
+// each test starts from a clean singleton.
+import { buildTestContext } from '@engine/testing'
+import type { EngineContext, StoragePort } from '@engine'
+import { __resetStore } from '@app/state/store'
+import { __resetConsumers } from '@app/state/events'
+import { __resetClock } from '@app/state/displayClock'
+import { __resetSaveBinding } from '@app/state/saveBinding'
+import { __resetMultiTab } from '@app/state/multiTab'
+
+export function buildCtx(): EngineContext {
+  return buildTestContext([])
+}
+
+export interface MemoryPort extends StoragePort {
+  store: Record<string, string>
+}
+
+export function memoryPort(seed: Record<string, string> = {}): MemoryPort {
+  const store: Record<string, string> = { ...seed }
+  return {
+    store,
+    read: (k) => store[k] ?? null,
+    write: (k, v) => {
+      store[k] = v
+    },
+    remove: (k) => {
+      delete store[k]
+    },
+  }
+}
+
+export function resetAll(): void {
+  __resetStore()
+  __resetConsumers()
+  __resetClock()
+  __resetSaveBinding()
+  __resetMultiTab()
+}
diff --git a/test/app/state/multiTab.test.ts b/test/app/state/multiTab.test.ts
new file mode 100644
index 0000000..56f6a1c
--- /dev/null
+++ b/test/app/state/multiTab.test.ts
@@ -0,0 +1,52 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { init, getMultiTabNotice, send } from '@app/state'
+import { isPaused } from '@app/state/saveBinding'
+import { SAVE_KEYS } from '@app/state/saveBinding'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+const START = 1_000_000
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  vi.spyOn(Date, 'now').mockReturnValue(START)
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+})
+
+describe('multi-tab', () => {
+  it('a foreign save-key storage event raises the notice and pauses writes', () => {
+    expect(getMultiTabNotice()).toBe(false)
+    const event = new Event('storage') as StorageEvent
+    Object.defineProperty(event, 'key', { value: SAVE_KEYS[0] })
+    window.dispatchEvent(event)
+    expect(getMultiTabNotice()).toBe(true)
+    expect(isPaused()).toBe(true)
+  })
+
+  it('ignores storage events for unrelated keys', () => {
+    const event = new Event('storage') as StorageEvent
+    Object.defineProperty(event, 'key', { value: 'some.other.key' })
+    window.dispatchEvent(event)
+    expect(getMultiTabNotice()).toBe(false)
+    expect(isPaused()).toBe(false)
+  })
+
+  it('once paused, local writes do not reach the port', () => {
+    const port = memoryPort()
+    resetAll()
+    vi.spyOn(Date, 'now').mockReturnValue(START)
+    const down = init({ ctx: buildCtx(), seedName: 'test-seed', port })
+    const event = new Event('storage') as StorageEvent
+    Object.defineProperty(event, 'key', { value: SAVE_KEYS[1] })
+    window.dispatchEvent(event)
+    delete port.store[SAVE_KEYS[0]]
+    send({ type: 'START_MISSION', missionId: 'alpha' }) // immediate flush attempt
+    expect(port.store[SAVE_KEYS[0]]).toBeUndefined()
+    down()
+  })
+})
diff --git a/test/app/state/saveBinding.test.ts b/test/app/state/saveBinding.test.ts
new file mode 100644
index 0000000..1614022
--- /dev/null
+++ b/test/app/state/saveBinding.test.ts
@@ -0,0 +1,105 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { createCampaign, encodeSave } from '@engine'
+import { init, send, getRecoveryFlag } from '@app/state'
+import { SAVE_KEYS } from '@app/state/saveBinding'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+const START = 1_000_000
+const [PRIMARY, BACKUP] = SAVE_KEYS
+
+function freshSave(): string {
+  return encodeSave(
+    createCampaign(buildCtx(), 'test-seed', { extendedTime: false }, START),
+  )
+}
+
+describe('save binding scheduling', () => {
+  let port: ReturnType<typeof memoryPort>
+  let teardown: () => void
+
+  beforeEach(() => {
+    resetAll()
+    vi.useFakeTimers()
+    vi.setSystemTime(START)
+    port = memoryPort()
+    teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port })
+  })
+
+  afterEach(() => {
+    teardown()
+    vi.useRealTimers()
+  })
+
+  it('debounces an ordinary action write (600 ms)', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' }) // immediate
+    delete port.store[PRIMARY]
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    vi.advanceTimersByTime(599)
+    expect(port.store[PRIMARY]).toBeUndefined()
+    vi.advanceTimersByTime(1)
+    expect(port.store[PRIMARY]).toBeDefined()
+  })
+
+  it('flushes immediately on an irreversible action (START_MISSION)', () => {
+    delete port.store[PRIMARY]
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    expect(port.store[PRIMARY]).toBeDefined() // no timer advance needed
+  })
+
+  it('flushes immediately on a settlement', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    delete port.store[PRIMARY]
+    send({ type: 'FORFEIT_MISSION' }) // settles -> settlement event
+    expect(port.store[PRIMARY]).toBeDefined()
+  })
+
+  it('visibilitychange to hidden flushes a pending debounced write', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    delete port.store[PRIMARY]
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    expect(port.store[PRIMARY]).toBeUndefined()
+    Object.defineProperty(document, 'visibilityState', {
+      value: 'hidden',
+      configurable: true,
+    })
+    document.dispatchEvent(new Event('visibilitychange'))
+    expect(port.store[PRIMARY]).toBeDefined()
+  })
+
+  it('pagehide flushes a pending debounced write', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    delete port.store[PRIMARY]
+    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    expect(port.store[PRIMARY]).toBeUndefined()
+    window.dispatchEvent(new Event('pagehide'))
+    expect(port.store[PRIMARY]).toBeDefined()
+  })
+})
+
+describe('recovery flag surfacing', () => {
+  afterEach(() => {
+    resetAll()
+    vi.restoreAllMocks()
+  })
+
+  const bootWith = (seed: Record<string, string>): void => {
+    resetAll()
+    vi.spyOn(Date, 'now').mockReturnValue(START)
+    init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort(seed) })
+  }
+
+  it('clean on an intact primary', () => {
+    bootWith({ [PRIMARY]: freshSave() })
+    expect(getRecoveryFlag()).toBe('clean')
+  })
+
+  it('recovered-backup when the primary is corrupt but backup is good', () => {
+    bootWith({ [PRIMARY]: 'garbage', [BACKUP]: freshSave() })
+    expect(getRecoveryFlag()).toBe('recovered-backup')
+  })
+
+  it('reset when both slots are corrupt', () => {
+    bootWith({ [PRIMARY]: 'garbage', [BACKUP]: 'also garbage' })
+    expect(getRecoveryFlag()).toBe('reset')
+  })
+})
diff --git a/test/app/state/send.test.ts b/test/app/state/send.test.ts
new file mode 100644
index 0000000..54876b5
--- /dev/null
+++ b/test/app/state/send.test.ts
@@ -0,0 +1,42 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { init, send } from '@app/state'
+import { getState } from '@app/state/store'
+import { onEngineEvent } from '@app/state/events'
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
+  vi.restoreAllMocks()
+})
+
+describe('send()', () => {
+  it('wraps dispatch with a Date.now sample and updates the store', () => {
+    expect(getState().activeMission).toBeNull()
+    const result = send({ type: 'START_MISSION', missionId: 'alpha' })
+    expect(result.rejected).toBe(false)
+    expect(getState().activeMission?.missionId).toBe('alpha')
+  })
+
+  it('surfaces a rejection without a state change or event relay', () => {
+    const before = getState()
+    const events: string[] = []
+    onEngineEvent((e) => events.push(e.type))
+    // No active mission yet: a mission action is refused.
+    const result = send({
+      type: 'MISSION_ACTION',
+      payload: { kind: 'DELIVER' },
+    })
+    expect(result.rejected).toBe(true)
+    if (result.rejected) expect(typeof result.reason).toBe('string')
+    expect(getState()).toBe(before)
+    expect(events).toEqual([])
+  })
+})
diff --git a/test/app/state/wake.test.ts b/test/app/state/wake.test.ts
new file mode 100644
index 0000000..5ad24cf
--- /dev/null
+++ b/test/app/state/wake.test.ts
@@ -0,0 +1,82 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { init, send, wake } from '@app/state'
+import { getState } from '@app/state/store'
+import { tickOnce } from '@app/state/displayClock'
+import { buildCtx, memoryPort, resetAll } from './harness'
+
+const START = 1_000_000
+const nowRef = { value: START }
+const perfRef = { value: 0 }
+let teardown: () => void
+
+beforeEach(() => {
+  resetAll()
+  nowRef.value = START
+  perfRef.value = 0
+  vi.spyOn(Date, 'now').mockImplementation(() => nowRef.value)
+  vi.spyOn(performance, 'now').mockImplementation(() => perfRef.value)
+  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+})
+
+afterEach(() => {
+  teardown()
+  vi.restoreAllMocks()
+})
+
+describe('wake()', () => {
+  it('advances the engine clock to Date.now and updates the store', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    nowRef.value = START + 5_000
+    wake()
+    expect(getState().lastNow).toBe(START + 5_000)
+  })
+
+  it('is wired to visibilitychange, pageshow(persisted), and focus', () => {
+    const fire = (make: () => void): number => {
+      nowRef.value += 1_000
+      make()
+      return getState().lastNow
+    }
+    expect(
+      fire(() => document.dispatchEvent(new Event('visibilitychange'))),
+    ).toBe(nowRef.value)
+    expect(
+      fire(() => {
+        const e = new Event('pageshow')
+        Object.defineProperty(e, 'persisted', { value: true })
+        window.dispatchEvent(e)
+      }),
+    ).toBe(nowRef.value)
+    expect(fire(() => window.dispatchEvent(new Event('focus')))).toBe(
+      nowRef.value,
+    )
+  })
+})
+
+describe('self-wake guard (per endsAt instance)', () => {
+  it('prevents a second self-wake for the same endsAt', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    perfRef.value = 10_000_000 // far past the deadline
+    const spy = vi.fn()
+    tickOnce(spy)
+    tickOnce(spy)
+    expect(spy).toHaveBeenCalledTimes(1)
+  })
+
+  it('a later deadline with a different endsAt still self-wakes', () => {
+    send({ type: 'START_MISSION', missionId: 'alpha' })
+    perfRef.value = 10_000_000
+    const first = vi.fn()
+    tickOnce(first)
+    expect(first).toHaveBeenCalledTimes(1)
+    // A new mission with a later start has a different endsAt (new key).
+    nowRef.value = START + 50_000
+    send({ type: 'FORFEIT_MISSION' })
+    send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' })
+    send({ type: 'START_MISSION', missionId: 'beta' })
+    perfRef.value = 20_000_000
+    const second = vi.fn()
+    tickOnce(second)
+    expect(second).toHaveBeenCalledTimes(1)
+  })
+})
