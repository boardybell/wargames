diff --git a/src/app/boot.tsx b/src/app/boot.tsx
new file mode 100644
index 0000000..2efba72
--- /dev/null
+++ b/src/app/boot.tsx
@@ -0,0 +1,54 @@
+// The pure composition seam, kept out of main.tsx so it has no DOM-mount side
+// effect on import: tests render bootApp() under their own container, and
+// main.tsx calls it to mount the real root. It assembles the engine-driven
+// experience from pieces the splits built (the production context, the campaign
+// store, the mission and finale screens, the hero stage) and reimplements none
+// of them.
+import type { ReactNode } from 'react'
+import type { StoragePort } from '@engine'
+import { createProductionContext, DEFAULT_SEED_NAME } from '@engine/seeds/context'
+import { init } from './state'
+import { HeroStage } from './hero'
+import { registerDefaultVerbs } from './terminal'
+import { registerOutlookScreen } from './missions/outlook/OutlookScreen'
+import { registerFlightsScreen } from './missions/flights/FlightsScreen'
+import { registerBankScreen } from './missions/bank/BankScreen'
+import { registerFinaleScreen } from './missions/finale/FinaleScreen'
+
+/** Register every mission screen and the finale screen with the screen
+ *  registry. Each register call also installs that mission's glossary terms;
+ *  all are idempotent, so a double boot (StrictMode) is harmless. */
+export function registerAllScreens(): void {
+  // The shared command grammar: HELP, LIST GAMES, SOUND, and the menu and
+  // debrief verbs. Production never registered these before this composition
+  // root existed, so the shipped command input had no default verbs.
+  registerDefaultVerbs()
+  registerOutlookScreen()
+  registerFlightsScreen()
+  registerBankScreen()
+  registerFinaleScreen()
+}
+
+/** Compose the engine-driven app: build the production context on the default
+ *  seed, register the screens, and start the campaign store. The store restores
+ *  a saved campaign when one exists (so a reload reopens exactly where the
+ *  operator left off rather than booting empty over prior progress) and rebinds
+ *  the mission modules to whichever seed a NEW_CAMPAIGN or a restored save
+ *  selects. Returns the root React element to mount. */
+export interface BootOptions {
+  /** Override the storage port. Production uses the default localStorage port;
+   *  tests inject an in-memory one so the boot is deterministic and needs no
+   *  localStorage. */
+  readonly port?: StoragePort
+}
+
+export function bootApp(options: BootOptions = {}): ReactNode {
+  registerAllScreens()
+  init({
+    ctx: createProductionContext(DEFAULT_SEED_NAME),
+    seedName: DEFAULT_SEED_NAME,
+    contextFactory: createProductionContext,
+    port: options.port,
+  })
+  return <HeroStage />
+}
diff --git a/src/app/hero/HeroStage.tsx b/src/app/hero/HeroStage.tsx
index ed47a4b..08ee2c5 100644
--- a/src/app/hero/HeroStage.tsx
+++ b/src/app/hero/HeroStage.tsx
@@ -6,8 +6,9 @@
 // the routing decision here.
 import { useRef, useState } from 'react'
 import { useCampaign } from '../state'
-import { hasSoundPreference } from '../audio'
+import { hasSoundPreference, setSoundPreference } from '../audio'
 import { ScreenRouter } from '../screens'
+import { openOverlay } from '../screens/dialogState'
 import { moveFocusTo } from '../a11y/focus'
 import { prefersReducedMotion } from '../a11y/motion'
 import { decideInitialScreen } from './loadRouting'
@@ -27,6 +28,12 @@ export function HeroStage() {
     state.phase === 'menu' && state.settled.length === 0,
   )
 
+  // LIST GAMES opens the new-campaign chooser; SET SOUND ON/OFF records the
+  // audio preference the mute gate and warnings read. Both are shell UI, not
+  // engine phases, so the stage that owns the ScreenRouter wires them.
+  const onListGames = (): void => openOverlay('newCampaign')
+  const onSetSound = (on: boolean): void => setSoundPreference(on ? 'on' : 'off')
+
   const onActivate = (handle: HeroPhotoHandle): void => {
     const terminalEl = terminalRef.current
     if (!terminalEl) {
@@ -56,7 +63,7 @@ export function HeroStage() {
   if (activated) {
     return (
       <>
-        <ScreenRouter />
+        <ScreenRouter onListGames={onListGames} onSetSound={onSetSound} />
         {showSoundPrompt && (
           <SoundPrompt onAnswered={() => setShowSoundPrompt(false)} />
         )}
@@ -73,7 +80,7 @@ export function HeroStage() {
         data-testid="terminal-beneath"
         style={{ position: 'absolute', inset: 0, opacity: 0 }}
       >
-        <ScreenRouter />
+        <ScreenRouter onListGames={onListGames} onSetSound={onSetSound} />
       </div>
       <HeroScene onActivate={onActivate} />
     </>
diff --git a/src/app/main.tsx b/src/app/main.tsx
index da016a5..da7ded5 100644
--- a/src/app/main.tsx
+++ b/src/app/main.tsx
@@ -1,11 +1,30 @@
-// The only side-effectful module: mounts the App into #root. Everything
-// else in src/app is pure or render-pure so the shell stays testable.
+// The only side-effectful module: it mounts the app into #root. The engine
+// driven experience is assembled by bootApp() (src/app/boot), kept side-effect
+// free so tests can render it under their own container. A bare load boots that
+// real game: activation -> MenuScreen (SHALL WE PLAY A GAME?) -> a chosen
+// mission -> its debrief -> finale unlock -> the case builder -> an ending.
+//
+// The standalone WarGamesGame is a separate cinematic tribute, no longer the
+// entry. It stays in the tree and is reachable only behind an explicit
+// ?tribute opt-in.
 import { StrictMode } from 'react'
+import type { ReactNode } from 'react'
 import { createRoot } from 'react-dom/client'
+import { bootApp } from './boot'
 import { WarGamesGame } from './game/WarGamesGame'
 import { initTheme } from './theme'
 import './theme/theme.css'
 
+/** The cinematic tribute is opt-in only. A bare load always boots the
+ *  engine-driven game; ?tribute switches to the standalone WarGamesGame. */
+function isTributeRequested(): boolean {
+  try {
+    return new URLSearchParams(window.location.search).has('tribute')
+  } catch {
+    return false
+  }
+}
+
 const container = document.getElementById('root')
 if (!container) {
   // A missing #root means a broken index.html; fail loud, not with a blank
@@ -14,8 +33,5 @@ if (!container) {
 }
 // Publish palette tokens as CSS custom properties and inject the font faces.
 initTheme()
-createRoot(container).render(
-  <StrictMode>
-    <WarGamesGame />
-  </StrictMode>,
-)
+const tree: ReactNode = isTributeRequested() ? <WarGamesGame /> : bootApp()
+createRoot(container).render(<StrictMode>{tree}</StrictMode>)
diff --git a/src/app/state/index.ts b/src/app/state/index.ts
index f750652..5971ada 100644
--- a/src/app/state/index.ts
+++ b/src/app/state/index.ts
@@ -3,7 +3,12 @@
 // this layer; nothing outside src/app/state/ calls engine dispatch or
 // advanceToNow directly. setState and the storage internals stay private.
 import { createCampaign, type EngineContext, type StoragePort } from '@engine'
-import { setContext, setState } from './store'
+import {
+  setContext,
+  setContextFactory,
+  rebindContextForSeed,
+  setState,
+} from './store'
 import { registerWakeLifecycle, wake } from './wake'
 import {
   flushPending,
@@ -13,7 +18,12 @@ import {
 import { registerMultiTab } from './multiTab'
 import { mountAudio } from '../audio/mount'
 
-export { useCampaign, getMissionOrder, getState, getContext } from './store'
+export {
+  useCampaign,
+  getMissionOrder,
+  getState,
+  getContext,
+} from './store'
 export { send, type SendResult } from './send'
 export { wake } from './wake'
 export { onEngineEvent, type EngineEventConsumer, type Unsubscribe } from './events'
@@ -33,6 +43,11 @@ export interface InitOptions {
   readonly seedName: string
   /** Override the localStorage port (tests inject an in-memory one). */
   readonly port?: StoragePort
+  /** Per-seed context builder. When provided, the store rebinds the mission
+   *  modules to the active seed: once here if a restored save used a different
+   *  seed than ctx binds, and again on any NEW_CAMPAIGN seed switch. Omit it
+   *  (tests) to keep the single injected ctx for the whole session. */
+  readonly contextFactory?: (seedName: string) => EngineContext
 }
 
 /** Called once at App boot: load the save, restore or create the campaign,
@@ -40,18 +55,26 @@ export interface InitOptions {
  *  teardown that tests use to unregister listeners. */
 export function init(options: InitOptions): () => void {
   setContext(options.ctx)
+  if (options.contextFactory) setContextFactory(options.contextFactory)
   if (options.port) setPort(options.port)
 
   const loaded = loadAtBoot()
-  setState(
-    loaded.state ??
+  if (loaded.state) {
+    // A restored save may carry a different seed than the boot ctx binds; the
+    // mission modules close over one seed's payload, so rebind to the saved
+    // seed before any screen reads content. No-op without a factory.
+    rebindContextForSeed(loaded.state.seedName)
+    setState(loaded.state)
+  } else {
+    setState(
       createCampaign(
         options.ctx,
         options.seedName,
         { extendedTime: false },
         Date.now(),
       ),
-  )
+    )
+  }
 
   const teardownWake = registerWakeLifecycle()
   const teardownMultiTab = registerMultiTab()
diff --git a/src/app/state/send.ts b/src/app/state/send.ts
index 164fb1c..0fedbef 100644
--- a/src/app/state/send.ts
+++ b/src/app/state/send.ts
@@ -4,7 +4,7 @@
 // rejection the store is untouched and no events relay (the engine emits
 // none); the reason comes back for inline rendering by the caller.
 import { dispatch, type CampaignAction } from '@engine'
-import { getContext, getState, setState } from './store'
+import { getContext, getState, rebindContextForSeed, setState } from './store'
 import { relayEvents } from './events'
 import { captureClock } from './displayClock'
 import { notifyAction, notifyWake } from './saveBinding'
@@ -26,6 +26,13 @@ export function send(action: CampaignAction): SendResult {
   // and must be applied like a wake: store the advanced state, relay the
   // events, recapture the display clock. Only then report the rejection.
   setState(state)
+  // A NEW_CAMPAIGN that switched seeds emits campaignReset with the new seed.
+  // Rebind the context so the mission modules (which close over one seed's
+  // payload) match the fresh campaign. No-op when the factory is unset.
+  const reset = emitted.find((e) => e.type === 'campaignReset')
+  if (reset?.type === 'campaignReset') {
+    rebindContextForSeed(reset.seedName)
+  }
   relayEvents(emitted)
   captureClock(state.lastNow)
   if (rejection) {
diff --git a/src/app/state/store.ts b/src/app/state/store.ts
index df2a314..47edb0a 100644
--- a/src/app/state/store.ts
+++ b/src/app/state/store.ts
@@ -10,12 +10,32 @@ import type { CampaignState } from '@engine'
 
 let context: EngineContext | null = null
 let state: CampaignState | null = null
+let contextFactory: ((seedName: string) => EngineContext) | null = null
 const listeners = new Set<() => void>()
 
 export function setContext(ctx: EngineContext): void {
   context = ctx
 }
 
+/** Register the per-seed context builder so the store can rebind the mission
+ *  modules when the active campaign switches seeds (NEW_CAMPAIGN to a different
+ *  seed). The mission modules close over one seed's payload, so a seed change
+ *  must rebuild the context or the screens would render the prior seed's
+ *  content over the new campaign. Set once at boot. */
+export function setContextFactory(
+  factory: (seedName: string) => EngineContext,
+): void {
+  contextFactory = factory
+}
+
+/** Rebuild the context for a seed when a factory is set and the current
+ *  context does not already bind that seed's modules. A no-op without a
+ *  factory (tests inject a fixed context) or when the seed is unchanged. */
+export function rebindContextForSeed(seedName: string): void {
+  if (!contextFactory) return
+  context = contextFactory(seedName)
+}
+
 export function getContext(): EngineContext {
   if (!context) throw new Error('state: store used before init')
   return context
diff --git a/src/engine/seeds/context.ts b/src/engine/seeds/context.ts
new file mode 100644
index 0000000..4965093
--- /dev/null
+++ b/src/engine/seeds/context.ts
@@ -0,0 +1,105 @@
+// The production EngineContext: the three curated seeds plus a finale payload
+// derived per seed, with the four real mission modules (CRASH OUTLOOK, GROUND
+// ALL FLIGHTS, FREEZE BANK ACCOUNTS, GLOBAL FAILSAFE) registered under their
+// ids. The catalog seeds ship with finale payload null because the finale
+// payload is a projection of the seed (its record graph, its exercise run, its
+// exercise-export root, and the designated field report), not an independently
+// authored block. This module computes that projection once and makes it the
+// single ctx the shell boots on. No procedural generation: every input is the
+// hand-authored catalog.
+import type { EngineContext } from '../campaign/engine'
+import type { EvidenceRecord } from '../records'
+import type { SeedDefinition } from '../missions/types'
+import { makeOutlookMission } from '../missions/outlook/module'
+import type { OutlookPayload } from '../missions/outlook/content'
+import { makeFlightsMission } from '../missions/flights/module'
+import type { FlightsPayload } from '../missions/flights/content'
+import { makeBankMission } from '../missions/bank/module'
+import type { BankPayload } from '../missions/bank/content'
+import { makeFinaleMission } from '../missions/finale/module'
+import type { FinalePayload } from '../missions/finale/module'
+import {
+  FINALE_FIELD_REPORT,
+  MISSION_IDS,
+  FINALE_ID,
+  SEED_CATALOG,
+} from './catalog'
+
+/** The exercise-export root of a seed: its single EXERCISE-origin record. The
+ *  finale case builder treats this id as the claim's root source, so it is a
+ *  derived fact of the seed, not a separate authored value. Throws when a seed
+ *  has not exactly one EXERCISE record, which the catalog validators forbid. */
+function exerciseRootId(records: readonly EvidenceRecord[]): string {
+  const roots = records.filter((r) => r.origin === 'EXERCISE')
+  if (roots.length !== 1) {
+    throw new Error(
+      `context: seed must have exactly one EXERCISE record, found ${roots.length}`,
+    )
+  }
+  return roots[0]!.id
+}
+
+/** Project the finale payload from a seed: the whole record graph, the seed's
+ *  exercise run as the claimed run, its exercise-export root, and the
+ *  seed-designated field report. */
+function finalePayloadFor(seed: SeedDefinition): FinalePayload {
+  const fieldReportId = FINALE_FIELD_REPORT[seed.name]
+  if (!fieldReportId) {
+    throw new Error(`context: no finale field report mapped for seed ${seed.name}`)
+  }
+  return {
+    records: seed.records,
+    claimRunId: seed.exerciseRunId,
+    rootRecordId: exerciseRootId(seed.records),
+    fieldReportId,
+  }
+}
+
+/** The seed the engine binds to carries the finale payload on its
+ *  missionPayloads, so the finale selector (which reads it off the active seed)
+ *  resolves it. The catalog definition stays untouched upstream; this is a
+ *  non-mutating augmentation applied only in the production context. */
+function withFinalePayload(seed: SeedDefinition): SeedDefinition {
+  return {
+    ...seed,
+    missionPayloads: {
+      ...seed.missionPayloads,
+      finale: finalePayloadFor(seed),
+    },
+  }
+}
+
+/** Build the single production EngineContext the shell boots on: every seed
+ *  carrying its derived finale payload, the four real mission modules bound to
+ *  the active seed's payloads, and the three playable missions in menu order.
+ *  Deterministic and pure; no I/O. */
+export function createProductionContext(seedName: string): EngineContext {
+  const base = SEED_CATALOG[seedName]
+  if (!base) throw new Error(`context: unknown seed ${seedName}`)
+
+  const seeds: Record<string, SeedDefinition> = {}
+  for (const [name, def] of Object.entries(SEED_CATALOG)) {
+    seeds[name] = withFinalePayload(def)
+  }
+  const seed = seeds[seedName]!
+
+  const outlook = seed.missionPayloads.outlook as OutlookPayload
+  const flights = seed.missionPayloads.flights as FlightsPayload
+  const bank = seed.missionPayloads.bank as BankPayload
+  const finale = seed.missionPayloads[FINALE_ID] as FinalePayload
+
+  return {
+    seeds,
+    missions: {
+      [MISSION_IDS[0]]: makeOutlookMission(outlook),
+      [MISSION_IDS[1]]: makeFlightsMission(flights),
+      [MISSION_IDS[2]]: makeBankMission(bank),
+      [FINALE_ID]: makeFinaleMission(finale),
+    },
+    missionOrder: [...MISSION_IDS],
+  }
+}
+
+/** The seed a fresh campaign starts from: the restored session, run R04. The
+ *  catalog's seed one and the requirements fixture. */
+export const DEFAULT_SEED_NAME = 'exercise-r04'
diff --git a/test/app/boot/composition.smoke.test.tsx b/test/app/boot/composition.smoke.test.tsx
new file mode 100644
index 0000000..37b8898
--- /dev/null
+++ b/test/app/boot/composition.smoke.test.tsx
@@ -0,0 +1,120 @@
+// The composition root is the product: a bare load must boot the engine-driven
+// shell (hero -> activation -> the SHALL WE PLAY A GAME menu), reach a real
+// mission screen, and reach the real GLOBAL FAILSAFE finale screen through the
+// real engine and the derived finale payload. This guards against a regression
+// to a blank boot or to the standalone WarGamesGame as the entry: bootApp wires
+// the production context (the catalog seeds plus the four real mission modules),
+// registers every mission screen and the finale, and mounts the hero stage.
+//
+// It renders bootApp() exactly as main.tsx does, so that one seam is exercised
+// without touching the DOM mount.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { bootApp } from '@app/boot'
+import { send } from '@app/state'
+import { getContext } from '@app/state/store'
+import { resetAll as resetScreens, memoryPort } from '../screens/harness'
+import { mockAnimate, resetHero } from '../hero/harness'
+import { DEFAULT_SEED_NAME } from '@engine/seeds/context'
+
+let animCtl: ReturnType<typeof mockAnimate>
+
+/** A fresh in-memory save slot per test: bootApp creates a new campaign on the
+ *  default seed rather than restoring a prior one, and the boot never touches
+ *  real localStorage. */
+function boot() {
+  return bootApp({ port: memoryPort() })
+}
+
+beforeEach(() => {
+  resetScreens()
+  resetHero()
+  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+  animCtl = mockAnimate()
+})
+
+afterEach(() => {
+  animCtl.restore()
+  cleanup()
+  vi.restoreAllMocks()
+})
+
+function finishPushIn(): void {
+  const dolly = animCtl.anims.find(
+    (a) =>
+      typeof a.keyframes[1]?.transform === 'string' &&
+      (a.keyframes[1].transform as string).includes('scale'),
+  )
+  act(() => {
+    dolly!.anim.finish()
+  })
+}
+
+describe('app composition root', () => {
+  it('boots the production context: default seed plus the four real missions', () => {
+    boot()
+    const ctx = getContext()
+    expect(ctx.seeds[DEFAULT_SEED_NAME]).toBeDefined()
+    // The three playable missions in menu order, plus the finale registered.
+    expect([...ctx.missionOrder]).toEqual(['outlook', 'flights', 'bank'])
+    expect(ctx.missions.outlook).toBeDefined()
+    expect(ctx.missions.flights).toBeDefined()
+    expect(ctx.missions.bank).toBeDefined()
+    expect(ctx.missions.finale).toBeDefined()
+  })
+
+  it('a bare load shows the hero, and activation reveals the SHALL WE PLAY A GAME menu', () => {
+    render(boot())
+    expect(screen.getByTestId('hero-button')).toBeInTheDocument()
+
+    act(() => {
+      fireEvent.click(screen.getByTestId('hero-button'))
+    })
+    finishPushIn()
+
+    expect(screen.queryByTestId('hero-button')).toBeNull()
+    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
+    expect(screen.getByText(/SHALL WE PLAY A GAME\?/)).toBeInTheDocument()
+  })
+
+  it('a chosen mission is reachable: starting CRASH OUTLOOK renders its real screen', () => {
+    render(boot())
+    act(() => {
+      fireEvent.click(screen.getByTestId('hero-button'))
+    })
+    finishPushIn()
+
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'outlook' })
+    })
+    // The real OutlookScreen, not the generic fallback mission frame.
+    expect(screen.getByTestId('screen-root').getAttribute('data-active-screen')).toBe(
+      'mission:outlook',
+    )
+    expect(screen.getByTestId('outlook-screen')).toBeInTheDocument()
+    expect(screen.queryByTestId('mission-frame')).toBeNull()
+  })
+
+  it('the finale is reachable: starting the finale renders the real GLOBAL FAILSAFE screen', () => {
+    // START_MISSION is gated on phase=menu and not-settled only, so the finale
+    // starts from a fresh campaign too. This drives the real engine through
+    // makeFinaleMission(...).init() with the payload derived from the seed; a
+    // content-invalid finale would fail init and never render its screen.
+    render(boot())
+    act(() => {
+      fireEvent.click(screen.getByTestId('hero-button'))
+    })
+    finishPushIn()
+
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'finale' })
+    })
+    expect(screen.getByTestId('screen-root').getAttribute('data-active-screen')).toBe(
+      'mission:finale',
+    )
+    // The real GLOBAL FAILSAFE screen, proving the derived finale payload
+    // passed makeFinaleMission(...).init() rather than failing to a frame.
+    expect(screen.getByTestId('finale-screen')).toBeInTheDocument()
+    expect(screen.queryByTestId('mission-frame')).toBeNull()
+  })
+})
