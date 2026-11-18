diff --git a/test/app/missions/flights/keyboardOnly.test.tsx b/test/app/missions/flights/keyboardOnly.test.tsx
new file mode 100644
index 0000000..643755b
--- /dev/null
+++ b/test/app/missions/flights/keyboardOnly.test.tsx
@@ -0,0 +1,189 @@
+// A keyboard-only full routing flow through the real FlightsScreen and the real
+// engine (no mocks of either). Every interaction is typed into the one shared
+// command line ScreenRouter renders at the foot of the mission screen: there are
+// NO pointer events anywhere in the flow. The flow selects a flight, reads its
+// conditions off the readout, routes it to a legal hub, advances engine time
+// past its arrival via a keyboard-driven wake, and observes the flight resolve
+// in the scoreboard. Fake timers prove no LOCAL timer drives the cues or the
+// resolution: only an engine-clock advance folds the arrival. Focus stays sane
+// after view switches. The glossary check proves a local term (CORRIDOR) and a
+// shell-global term (OPEN EXCEPTIONS) are focusable and Escape-closable.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
+import { init, send, wake, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import { FLIGHTS_FIXTURE_PAYLOAD, makeFlightsCtx, flightsSub } from './fixture'
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
+beforeEach(() => {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(false)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerFlightsScreen()
+  teardown = init({
+    ctx: makeFlightsCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'flights' })
+  })
+})
+
+afterEach(() => {
+  teardown()
+  __resetFlightsView()
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
+/** Advance the engine clock by setting Date.now and waking: a keyboard-path
+ *  event, no pointer, no local timer. */
+function advanceEngine(toMs: number): void {
+  vi.spyOn(Date, 'now').mockReturnValue(toMs)
+  act(() => {
+    wake()
+  })
+}
+
+describe('keyboard-only routing flow', () => {
+  it('completes one full routing flow keyboard-only: select, read conditions, route, advance, resolve in the scoreboard', () => {
+    render(<ScreenRouter />)
+    // WX101 (MERIDIAN -> CASCADE) departs at 10s; advance so it is airborne.
+    advanceEngine(T0 + 15_000)
+    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')
+
+    // SELECT it with a typed command (no pointer). The readout reveals its
+    // conditions: flight id, position, passengers, and the viable destinations.
+    typeCommand('SELECT WX101')
+    const readout = screen.getByTestId('flight-readout')
+    expect(readout).toHaveAttribute('data-flight-id', 'WX101')
+    expect(readout.textContent).toContain('FLIGHT WX101')
+    expect(within(readout).getByTestId('readout-destinations')).toBeInTheDocument()
+
+    // Route it to its own hub CASCADE with a typed LAND command.
+    typeCommand('LAND WX101 CASCADE')
+    expect(flightsSub(getState()).flights['WX101']?.inboundHubId).toBe('CASCADE')
+
+    // Advance the engine past cruise (60s) so the arrival folds (keyboard wake,
+    // no pointer): the flight resolves to a terminal landing.
+    advanceEngine(T0 + 90_000)
+    const status = flightsSub(getState()).flights['WX101']?.status
+    expect(['landed', 'landedLate', 'divertedLanded']).toContain(status)
+    // The resolution is reflected in the live scoreboard: at least one flight
+    // has landed, so landedFlights is non-zero in the passenger line.
+    const scoreboard = screen.getByTestId('scoreboard-passengers')
+    expect(scoreboard.textContent).toMatch(/PASSENGERS RESOLVED \d+/)
+    expect(flightsSub(getState()).runwayUse['CASCADE']).toBeGreaterThanOrEqual(1)
+  })
+
+  it('no LOCAL timer drives the resolution: fake timers advanced without an engine wake fold nothing', () => {
+    vi.useFakeTimers()
+    render(<ScreenRouter />)
+    // With fake timers and NO engine-clock advance, advancing jsdom timers does
+    // not depart or fold any flight: every flight is still scheduled.
+    act(() => {
+      vi.advanceTimersByTime(300_000)
+    })
+    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
+      expect(flightsSub(getState()).flights[flight.id]?.status).toBe('scheduled')
+    }
+    vi.useRealTimers()
+    // Only an engine-clock advance moves the flights: now WX101 departs.
+    advanceEngine(T0 + 15_000)
+    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')
+  })
+
+  it('focus stays sane after view switches: the shared command input remains focusable', () => {
+    render(<ScreenRouter />)
+    const input = screen.getByTestId('command-input') as HTMLInputElement
+    act(() => {
+      input.focus()
+    })
+    expect(document.activeElement).toBe(input)
+
+    // Switch grid -> list -> grid entirely by typed commands; the shared input
+    // is never stranded.
+    typeCommand('LIST')
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
+    typeCommand('GRID')
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'grid')
+
+    const inputAfter = screen.getByTestId('command-input') as HTMLInputElement
+    act(() => {
+      inputAfter.focus()
+    })
+    expect(document.activeElement).toBe(inputAfter)
+  })
+
+  it('the global OPEN EXCEPTIONS glossary term is focusable and Escape closes it', () => {
+    render(<ScreenRouter />)
+    // The global OPEN EXCEPTIONS term renders in the dual scoreboard.
+    const scoreboard = screen.getByTestId('scoreboard-exceptions')
+    const globalTerm = within(scoreboard).getByTestId('glossary-term')
+    expect(globalTerm.textContent).toContain('OPEN EXCEPTIONS')
+    const wrap = globalTerm.closest('.glossary-wrap') as HTMLElement
+    act(() => {
+      fireEvent.focus(globalTerm)
+    })
+    expect(within(wrap).getByTestId('glossary-popup')).toBeInTheDocument()
+    // Escape closes while focused.
+    act(() => {
+      fireEvent.keyDown(globalTerm, { key: 'Escape' })
+    })
+    expect(within(wrap).queryByTestId('glossary-popup')).toBeNull()
+  })
+
+  it('the local CORRIDOR glossary term is focusable and Escape closes it', () => {
+    render(<ScreenRouter />)
+    // The local CORRIDOR term renders in the flight list copy. Switch to the
+    // list view by a typed command (keyboard), then focus CORRIDOR.
+    typeCommand('LIST')
+    const list = screen.getByTestId('flight-list-view')
+    const corridor = within(list)
+      .getAllByTestId('glossary-term')
+      .find((t) => t.textContent === 'CORRIDOR')!
+    expect(corridor).toBeDefined()
+    const corridorWrap = corridor.closest('.glossary-wrap') as HTMLElement
+    act(() => {
+      fireEvent.focus(corridor)
+    })
+    expect(within(corridorWrap).getByTestId('glossary-popup')).toBeInTheDocument()
+    act(() => {
+      fireEvent.keyDown(corridor, { key: 'Escape' })
+    })
+    expect(within(corridorWrap).queryByTestId('glossary-popup')).toBeNull()
+  })
+})
diff --git a/test/app/missions/flights/narrowWidth.test.tsx b/test/app/missions/flights/narrowWidth.test.tsx
new file mode 100644
index 0000000..f7ca481
--- /dev/null
+++ b/test/app/missions/flights/narrowWidth.test.tsx
@@ -0,0 +1,186 @@
+// The narrow-width single-pane pass through the real FlightsScreen and the real
+// engine. At narrow width the screen is single-pane and defaults to the full
+// flight LIST, which carries full parity with the grid: every land, divert,
+// hold, release, and the blanket GROUND ALL is reachable from the list, with
+// selection reachable both from a list row and from the keyboard SELECT command.
+// A BACK affordance (the keyboard command) clears the selection. The StatusLine
+// and the role=timer countdown stay visible in every view the screen can show at
+// narrow width (the list, and the grid when explicitly toggled). Narrow width is
+// driven by the same matchMedia mock the other flights app tests use.
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
+import { init, send, wake, getState } from '@app/state'
+import { ScreenRouter } from '@app/screens'
+import { registerDefaultVerbs } from '@app/terminal'
+import { resetAll } from '../../screens/harness'
+import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
+import { __resetFlightsView } from '@app/missions/flights/selectors'
+import { FLIGHTS_FIXTURE_PAYLOAD, makeFlightsCtx, flightsSub } from './fixture'
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
+function boot(): void {
+  resetAll()
+  __resetFlightsView()
+  setNarrow(true)
+  vi.spyOn(Date, 'now').mockReturnValue(T0)
+  registerDefaultVerbs()
+  registerFlightsScreen()
+  teardown = init({
+    ctx: makeFlightsCtx(),
+    seedName: 'test-seed',
+    port: { read: () => null, write: () => {}, remove: () => {} },
+  })
+  act(() => {
+    send({ type: 'START_MISSION', missionId: 'flights' })
+  })
+}
+
+beforeEach(() => {
+  boot()
+})
+
+afterEach(() => {
+  teardown()
+  __resetFlightsView()
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
+function advanceEngine(toMs: number): void {
+  vi.spyOn(Date, 'now').mockReturnValue(toMs)
+  act(() => {
+    wake()
+  })
+}
+
+describe('narrow-width single-pane', () => {
+  it('narrow viewport is single-pane and defaults to the full flight LIST', () => {
+    render(<ScreenRouter />)
+    const flightsScreen = screen.getByTestId('flights-screen')
+    expect(flightsScreen).toHaveAttribute('data-pane', 'single')
+    expect(flightsScreen).toHaveAttribute('data-view', 'list')
+    expect(screen.getByTestId('flight-list-view')).toBeInTheDocument()
+  })
+
+  it('full list parity: every land/divert/hold/release action row and GROUND ALL is present, plus a per-hub routing affordance', () => {
+    render(<ScreenRouter />)
+    // Advance so flights are airborne (routing affordances enabled).
+    advanceEngine(T0 + 35_000)
+    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
+      const row = screen.getByTestId(`flight-row-${flight.id}`)
+      expect(within(row).getByTestId(`list-HOLD-${flight.id}`)).toBeInTheDocument()
+      expect(within(row).getByTestId(`list-RELEASE-${flight.id}`)).toBeInTheDocument()
+      // One routing affordance (LAND for its own destination, DIVERT for the
+      // rest) per hub: full parity with the grid readout.
+      let routeButtons = 0
+      for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
+        const land = within(row).queryByTestId(`list-LAND-${flight.id}-${hub.id}`)
+        const divert = within(row).queryByTestId(`list-DIVERT-${flight.id}-${hub.id}`)
+        if (land || divert) routeButtons += 1
+      }
+      expect(routeButtons).toBe(FLIGHTS_FIXTURE_PAYLOAD.hubs.length)
+    }
+    // GROUND ALL is reachable from the list.
+    expect(screen.getByTestId('list-GROUND-ALL')).toBeInTheDocument()
+  })
+
+  it('a full routing flow completes in the list view at narrow width (airborne flight -> LAND -> resolves)', () => {
+    render(<ScreenRouter />)
+    advanceEngine(T0 + 35_000)
+    // WX101 (MERIDIAN -> CASCADE) is airborne at 35s. LAND it from the list row.
+    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')
+    const row = screen.getByTestId('flight-row-WX101')
+    const landBtn = within(row).getByTestId('list-LAND-WX101-CASCADE') as HTMLButtonElement
+    expect(landBtn.disabled).toBe(false)
+    fireEvent.click(landBtn)
+    expect(flightsSub(getState()).flights['WX101']?.inboundHubId).toBe('CASCADE')
+    // The arrival (routed 35s + 60s cruise = 95s) folds on the next scheduled
+    // wake after it. Advance past the MERIDIAN window event at 120s so the fold
+    // runs and the flight resolves to a terminal landing.
+    advanceEngine(T0 + 130_000)
+    const status = flightsSub(getState()).flights['WX101']?.status
+    expect(['landed', 'landedLate', 'divertedLanded']).toContain(status)
+  })
+
+  it('selection works from the list row AND from the keyboard SELECT command; BACK clears it', () => {
+    render(<ScreenRouter />)
+    // Select from a list row click.
+    fireEvent.click(screen.getByTestId('flight-select-WX103'))
+    expect(screen.getByTestId('flight-row-WX103')).toHaveAttribute('data-selected', 'true')
+    // Re-select a different flight from the keyboard SELECT command.
+    typeCommand('SELECT WX105')
+    expect(screen.getByTestId('flight-row-WX105')).toHaveAttribute('data-selected', 'true')
+    expect(screen.getByTestId('flight-row-WX103')).toHaveAttribute('data-selected', 'false')
+    // BACK clears the selection (the keyboard back affordance).
+    typeCommand('BACK')
+    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
+      expect(screen.getByTestId(`flight-row-${flight.id}`)).toHaveAttribute(
+        'data-selected',
+        'false',
+      )
+    }
+  })
+
+  it('GROUND ALL from the list routes through the confirmation control and renders single-use after', () => {
+    render(<ScreenRouter />)
+    // The list GROUND ALL and the dedicated control both exist; use the control
+    // for the confirmation flow, then confirm the list affordance renders spent.
+    expect(screen.getByTestId('list-GROUND-ALL')).toBeInTheDocument()
+    fireEvent.click(screen.getByTestId('ground-all-button'))
+    expect(screen.getByTestId('ground-all-confirm')).toBeInTheDocument()
+    expect(flightsSub(getState()).groundAll).toBe(false)
+    fireEvent.click(screen.getByTestId('ground-all-confirm-yes'))
+    expect(flightsSub(getState()).groundAll).toBe(true)
+    // Single-use: the dedicated control renders spent/disabled, and the list
+    // GROUND ALL renders disabled too.
+    expect((screen.getByTestId('ground-all-spent') as HTMLButtonElement).disabled).toBe(true)
+    const listGround = screen.getByTestId('list-GROUND-ALL') as HTMLButtonElement
+    expect(listGround.disabled).toBe(true)
+  })
+
+  it('StatusLine and the countdown stay visible in the list view AND after toggling to the grid at narrow width', () => {
+    render(<ScreenRouter />)
+    // List view: StatusLine and the role=timer countdown both present.
+    expect(screen.getByTestId('status-line')).toBeInTheDocument()
+    expect(screen.getByTestId('flights-countdown')).toBeInTheDocument()
+    expect(within(screen.getByTestId('flights-countdown')).getByRole('timer')).toBeInTheDocument()
+
+    // Toggle to the grid at narrow width (a typed command); the status line and
+    // countdown remain visible (they live in the screen frame, above the view).
+    typeCommand('GRID')
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'grid')
+    expect(screen.getByTestId('status-line')).toBeInTheDocument()
+    expect(screen.getByTestId('flights-countdown')).toBeInTheDocument()
+    expect(within(screen.getByTestId('flights-countdown')).getByRole('timer')).toBeInTheDocument()
+
+    // Back to the list: still visible.
+    typeCommand('LIST')
+    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
+    expect(screen.getByTestId('status-line')).toBeInTheDocument()
+    expect(screen.getByTestId('flights-countdown')).toBeInTheDocument()
+  })
+})
diff --git a/test/engine/missions/flights/debrief.test.ts b/test/engine/missions/flights/debrief.test.ts
new file mode 100644
index 0000000..4cad7fd
--- /dev/null
+++ b/test/engine/missions/flights/debrief.test.ts
@@ -0,0 +1,186 @@
+// Section-04 CI fixture: the debrief payload content per end cause. The debrief
+// reports arrivals (resolved / on time / late / diverted), diversions, flights
+// held, STRANDED passengers, and unresolved (stranded) flights, each on its own
+// line; it names the GROUND ALL trade when taken; and its clue flag reflects the
+// settled outcome's clue id. The engine-owned D-83 clue (via clueRecords,
+// amendment 8) is asserted on the campaign cluesFound path, with and without an
+// INSPECT_RECORD on the designated restriction record, logged exactly once; the
+// module itself contributes no clue code. Walkthrough and adversarial debriefs
+// differ in their outcome lines. All three authored seeds.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { DebriefPayload } from '@engine/missions/types'
+import type { SettledOutcome } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import { FLIGHTS_ANCHORS_BY_SEED } from '@engine/missions/flights/payloads'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  groundAllAtStartFor,
+  runScript,
+  walkthroughFor,
+} from './fixtures/index'
+
+const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
+const SETTLE_AT = ENDS_AT + 1_000
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+function flightsOutcome(state: CampaignState): SettledOutcome {
+  return state.settled.find((s) => s.missionId === 'flights')!
+}
+
+function debriefFor(ctx: EngineContext, outcome: SettledOutcome): DebriefPayload {
+  return ctx.missions['flights']!.debrief!(outcome)
+}
+
+/** The debrief line asserting a per-category count, matched by prefix. */
+function lineStarting(debrief: DebriefPayload, prefix: string): string {
+  return debrief.lines.find((l) => l.startsWith(prefix))!
+}
+
+describe.each(SEED_NAMES)('flights debrief fixture: %s', (seedName) => {
+  it('debrief carries arrivals, diversions, held and heldFinal counts, stranded passengers, and unresolved flights for each end cause', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+
+    // Cause 1: completed (the walkthrough). Every soul resolved, nothing held
+    // or stranded.
+    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
+    const walkOutcome = flightsOutcome(walk.state)
+    expect(walkOutcome.cause).toBe('completed')
+    const walkDebrief = debriefFor(ctx, walkOutcome)
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    // Arrivals: a RESOLVED line and the on-time/late/diverted breakdown line.
+    expect(lineStarting(walkDebrief, 'RESOLVED ')).toBe(`RESOLVED ${total} PASSENGERS`)
+    const arrivalsLine = lineStarting(walkDebrief, 'ON TIME ')
+    // Diversions appear in the arrivals breakdown line (the forced DIVERT).
+    expect(arrivalsLine).toContain('DIVERTED ')
+    expect(walkOutcome.metrics['diverted_passengers']!).toBeGreaterThan(0)
+    // Held and stranded lines present, both zero for the clean walkthrough.
+    expect(lineStarting(walkDebrief, 'HELD ')).toBe('HELD 0 FLIGHTS, 0 PASSENGERS')
+    expect(lineStarting(walkDebrief, 'STRANDED ')).toBe('STRANDED 0 FLIGHTS, 0 PASSENGERS')
+
+    // Cause 2: timeout with strandings. Leave everyone airborne (no routing) so
+    // every flight strands at the deadline; the stranded line reports them.
+    const timeoutRun = advanceCampaign(ctx, startMission(ctx, seedName), SETTLE_AT)
+    const timeoutOutcome = flightsOutcome(timeoutRun.state)
+    expect(timeoutOutcome.cause).toBe('timeout')
+    const timeoutDebrief = debriefFor(ctx, timeoutOutcome)
+    const strandLine = lineStarting(timeoutDebrief, 'STRANDED ')
+    expect(strandLine).toContain(`${timeoutOutcome.metrics['stranded_flights']} FLIGHTS`)
+    expect(strandLine).toContain(`${timeoutOutcome.metrics['stranded_passengers']} PASSENGERS`)
+    expect(timeoutOutcome.metrics['stranded_flights']!).toBeGreaterThan(0)
+
+    // Cause 3: forfeit with a held flight, so the HELD (heldFinal) line is
+    // non-zero. HOLD the first flight, forfeit mid-run.
+    let state = startMission(ctx, seedName)
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: payload.flights[0]!.id } },
+      FLIGHTS_T0 + 1_000,
+    ).state
+    state = advanceCampaign(ctx, state, FLIGHTS_T0 + 60_000).state
+    const forfeit = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, FLIGHTS_T0 + 61_000)
+    const forfeitOutcome = flightsOutcome(forfeit.state)
+    expect(forfeitOutcome.cause).toBe('forfeit')
+    const forfeitDebrief = debriefFor(ctx, forfeitOutcome)
+    const heldLine = lineStarting(forfeitDebrief, 'HELD ')
+    expect(forfeitOutcome.metrics['held_flights']).toBe(1)
+    expect(heldLine).toContain('1 FLIGHTS')
+    expect(heldLine).toContain(`${payload.flights[0]!.passengers} PASSENGERS`)
+
+    // Cause 4: GROUND ALL (blanket). Names the trade, every flight heldFinal.
+    const grounded = runScript(ctx, seedName, groundAllAtStartFor(seedName), { settleAt: SETTLE_AT })
+    const groundedOutcome = flightsOutcome(grounded.state)
+    const groundedDebrief = debriefFor(ctx, groundedOutcome)
+    expect(groundedDebrief.lines).toContain('GROUND ALL FLIGHTS WAS ORDERED')
+    expect(lineStarting(groundedDebrief, 'HELD ')).toBe(
+      `HELD ${payload.flights.length} FLIGHTS, ${total} PASSENGERS`,
+    )
+  })
+
+  it('clue status reflects whether the restriction record was inspected (engine clueRecords path, module contributes no clue)', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const anchors = FLIGHTS_ANCHORS_BY_SEED[seedName]!
+
+    // WITHOUT an INSPECT_RECORD: the clue never logs; the campaign cluesFound is
+    // empty of it and the settled outcome carries no clue id, so the debrief
+    // flag reads NOT FOUND.
+    const noClue = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
+    expect(noClue.state.cluesFound).not.toContain(anchors.clueId)
+    const noClueOutcome = flightsOutcome(noClue.state)
+    expect(noClueOutcome.clueId).toBeNull()
+    expect(debriefFor(ctx, noClueOutcome).lines).toContain('CLUE NOT FOUND')
+
+    // WITH an INSPECT_RECORD on the designated restriction record: the clue logs
+    // exactly once via the engine clueRecords path, before settlement, and
+    // survives into the post-mission campaign state.
+    let state = startMission(ctx, seedName)
+    const inspect = dispatch(
+      ctx,
+      state,
+      { type: 'INSPECT_RECORD', recordId: anchors.restrictionRecordId },
+      FLIGHTS_T0 + 2_000,
+    )
+    const clueEvents = inspect.emitted.filter((e) => e.type === 'clueFound')
+    expect(clueEvents).toEqual([{ type: 'clueFound', clueId: anchors.clueId }])
+    expect(inspect.state.cluesFound).toContain(anchors.clueId)
+    // A second inspect logs nothing new (exactly once).
+    const again = dispatch(
+      ctx,
+      inspect.state,
+      { type: 'INSPECT_RECORD', recordId: anchors.restrictionRecordId },
+      FLIGHTS_T0 + 3_000,
+    )
+    expect(again.emitted.filter((e) => e.type === 'clueFound')).toEqual([])
+    // Carry to settlement: the clue survives even a failed (timeout) mission.
+    state = advanceCampaign(ctx, again.state, SETTLE_AT).state
+    expect(state.cluesFound).toContain(anchors.clueId)
+    // The module contributes no clue code: its evaluate stamps no clue id on the
+    // outcome (the clue is a campaign fact, not a mission outcome field).
+    expect(flightsOutcome(state).clueId).toBeNull()
+    expect(ctx.missions['flights']!.clues).toBeUndefined()
+  })
+
+  it('walkthrough and adversarial (blanket-grounding) debriefs differ in their outcome lines', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
+    const grounded = runScript(ctx, seedName, groundAllAtStartFor(seedName), { settleAt: SETTLE_AT })
+    const walkOutcome = flightsOutcome(walk.state)
+    const groundedOutcome = flightsOutcome(grounded.state)
+    const walkDebrief = debriefFor(ctx, walkOutcome)
+    const groundedDebrief = debriefFor(ctx, groundedOutcome)
+
+    // The two debriefs differ: different headline tier/cause, different resolved
+    // and held lines, and only the grounding names the trade.
+    expect(walkDebrief.lines).not.toEqual(groundedDebrief.lines)
+    expect(walkDebrief.headline).not.toBe(groundedDebrief.headline)
+    expect(lineStarting(walkDebrief, 'RESOLVED ')).not.toBe(
+      lineStarting(groundedDebrief, 'RESOLVED '),
+    )
+    expect(lineStarting(walkDebrief, 'HELD ')).not.toBe(
+      lineStarting(groundedDebrief, 'HELD '),
+    )
+    expect(groundedDebrief.lines).toContain('GROUND ALL FLIGHTS WAS ORDERED')
+    expect(walkDebrief.lines).not.toContain('GROUND ALL FLIGHTS WAS ORDERED')
+  })
+})
diff --git a/test/engine/missions/flights/extendedTime.test.ts b/test/engine/missions/flights/extendedTime.test.ts
new file mode 100644
index 0000000..5e94770
--- /dev/null
+++ b/test/engine/missions/flights/extendedTime.test.ts
@@ -0,0 +1,152 @@
+// Section-04 CI fixture: extended time (the accessibility time option) scales
+// every scheduled kind PROPORTIONALLY. Departures, arrivals, storm events,
+// corrections, desk-check replies, and the hub last-departure (window) offsets
+// all scale by the SAME factor, derived from the materialized endsAt (ratio and
+// order, never absolute magic numbers); the end-anchored settle tick lands at
+// the scaled deadline. The walkthrough still reaches full tier at the longer
+// duration (action times scaled by the same ratio), and the correction lead
+// margin survives doubling. All three seeds.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  walkthroughFor,
+} from './fixtures/index'
+
+function startMission(
+  ctx: EngineContext,
+  seedName: string,
+  extendedTime: boolean,
+): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+/** The materialized start-offset (ms from T0) of a scheduled event by id. */
+function offsetOf(state: CampaignState, id: string): number | null {
+  const event = state.missionQueue.find((e) => e.id === id)
+  return event ? event.scheduledAt - FLIGHTS_T0 : null
+}
+
+describe.each(SEED_NAMES)('flights extended-time fixture: %s', (seedName) => {
+  it('all scheduled kinds scale proportionally under extended time', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const standard = startMission(ctx, seedName, false)
+    const extended = startMission(ctx, seedName, true)
+
+    // The ratio is derived from the materialized deadline, not a hard-coded 2.
+    const standardSpan = standard.activeMission!.endsAt - FLIGHTS_T0
+    const extendedSpan = extended.activeMission!.endsAt - FLIGHTS_T0
+    const ratio = extendedSpan / standardSpan
+    expect(ratio).toBeGreaterThan(1)
+    expect(extendedSpan).toBe(FLIGHTS_DURATION_MS * ratio)
+
+    // Every start-anchored scheduled id scales by the SAME ratio: departures,
+    // storm steps, forecast leads, the correction, and the hub windows.
+    const startAnchoredIds: string[] = [
+      ...payload.flights.map((f) => `flights-depart-${f.id}`),
+      ...payload.stormTrack.map((_, i) => `flights-storm-${i}`),
+      ...payload.stormTrack
+        .map((s, i) =>
+          s.closeCorridors.length > 0 || s.closeHubs.length > 0
+            ? `flights-forecast-${i}`
+            : null,
+        )
+        .filter((id): id is string => id !== null),
+      ...payload.corrections.map((_, i) => `flights-correction-${i}`),
+      ...payload.hubs.map((h) => `flights-window-${h.id}`),
+    ]
+    for (const id of startAnchoredIds) {
+      const std = offsetOf(standard, id)
+      const ext = offsetOf(extended, id)
+      expect(std).not.toBeNull()
+      expect(ext).not.toBeNull()
+      expect(ext).toBe(std! * ratio)
+    }
+
+    // The arrival offsets scale too: a flight's departure scales by the ratio,
+    // its cruise is in-flight time scaled by the clock, so the whole arrival
+    // offset scales proportionally (checked via the depart offsets above, the
+    // only authored arrival driver on the schedule).
+
+    // The end-anchored settle tick lands at the scaled deadline (endsAt), not a
+    // scaled start offset: it materializes as endsAt - 0.
+    const tickStd = standard.missionQueue.find((e) => e.id === 'flights-tick')!
+    const tickExt = extended.missionQueue.find((e) => e.id === 'flights-tick')!
+    expect(tickStd.scheduledAt).toBe(standard.activeMission!.endsAt)
+    expect(tickExt.scheduledAt).toBe(extended.activeMission!.endsAt)
+
+    // Order is preserved under scaling: the standard and extended schedules fire
+    // their ids in the same relative order (scaling is monotonic).
+    const orderOf = (state: CampaignState): string[] =>
+      [...state.missionQueue]
+        .sort((a, b) =>
+          a.scheduledAt !== b.scheduledAt
+            ? a.scheduledAt - b.scheduledAt
+            : a.id < b.id
+              ? -1
+              : 1,
+        )
+        .map((e) => e.id)
+    expect(orderOf(extended)).toEqual(orderOf(standard))
+  })
+
+  it('the walkthrough still reaches full tier with time doubled', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    let state = startMission(ctx, seedName, true)
+    const endsAt = state.activeMission!.endsAt
+    const ratio = (endsAt - FLIGHTS_T0) / FLIGHTS_DURATION_MS
+    // Replay the walkthrough action envelopes (skip the START prefix, already
+    // dispatched) with each delta from T0 scaled by the SAME ratio.
+    const envelopes = walkthroughFor(seedName).slice(1)
+    for (const [action, now] of envelopes) {
+      const scaledNow = FLIGHTS_T0 + (now - FLIGHTS_T0) * ratio
+      state = advanceCampaign(ctx, state, scaledNow).state
+      state = dispatch(ctx, state, action, scaledNow).state
+    }
+    const advanced = advanceCampaign(ctx, state, endsAt + 1_000)
+    const flights = advanced.state.settled.find((s) => s.missionId === 'flights')!
+    expect(flights.tier).toBe('full')
+    expect(flights.metrics['resolved_passengers']).toBe(total)
+    // Doubled: the extended window is exactly twice the standard.
+    expect(endsAt - FLIGHTS_T0).toBe(FLIGHTS_DURATION_MS * 2)
+  })
+
+  it('the correction lead margin survives doubling', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const extended = startMission(ctx, seedName, true)
+    const ratio = (extended.activeMission!.endsAt - FLIGHTS_T0) / FLIGHTS_DURATION_MS
+    // For each authored correction, the scaled correction offset still lands at
+    // least the scaled lead margin before the scaled last-safe-decision, so the
+    // forecast reaches the player with genuine decision room at the longer
+    // duration. Proportional arithmetic, not an absolute offset.
+    payload.corrections.forEach((correction, i) => {
+      const correctionAt = offsetOf(extended, `flights-correction-${i}`)!
+      const scaledLastSafe = correction.lastSafeDecisionAtSeconds * 1000 * ratio
+      const scaledLeadMargin = payload.leadMarginSeconds * 1000 * ratio
+      expect(correctionAt).toBeLessThanOrEqual(scaledLastSafe - scaledLeadMargin)
+      // And the scaled correction offset is exactly the authored offset scaled.
+      expect(correctionAt).toBe(correction.offsetSeconds * 1000 * ratio)
+    })
+  })
+})
diff --git a/test/engine/missions/flights/fixtures.buzzer.test.ts b/test/engine/missions/flights/fixtures.buzzer.test.ts
new file mode 100644
index 0000000..28c3cc6
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.buzzer.test.ts
@@ -0,0 +1,209 @@
+// Section-04 CI fixture: the buzzer boundary at endsAt, built from the authored
+// ETA/cruise arithmetic through the real engine's settle-tick interleave (never
+// by poking the queue). An arrival computed EXACTLY at endsAt folds and lands
+// before the timeout settlement guard runs in the same advance; the same
+// arrival one tick later (endsAt + 1) never folds, leaves the flight airborne,
+// and it strands at timeout. A landing whose queue delay pushes it past the
+// authored lateness threshold settles as landedLate, exactly once. All seeds.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import { corridorBetween } from '@engine/missions/flights/rules'
+import type { FlightsState } from '@engine/missions/flights/types'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  flightsSub,
+} from './fixtures/index'
+
+const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
+const SETTLE_AT = ENDS_AT + 1_000
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+function land(flightId: string, hubId: string) {
+  return { type: 'MISSION_ACTION' as const, payload: { kind: 'LAND', flightId, hubId } }
+}
+
+function flightsSettled(state: CampaignState) {
+  return state.settled.find((s) => s.missionId === 'flights')!
+}
+
+/** Make a flight airborne (advance past its departure), then return the state
+ *  and the flight. The first authored flight departs early and crosses an open
+ *  corridor to an open hub, so a LAND is always legal. */
+function airborneFirst(
+  ctx: EngineContext,
+  seedName: string,
+  payload: FlightsPayload,
+): { state: CampaignState; flightId: string; hubId: string; cruiseMs: number } {
+  const flight = payload.flights[0]!
+  let state = startMission(ctx, seedName)
+  state = advanceCampaign(
+    ctx,
+    state,
+    FLIGHTS_T0 + (flight.departureOffsetSeconds + 1) * 1000,
+  ).state
+  expect((flightsSub(state) as FlightsState).flights[flight.id]!.status).toBe('airborne')
+  return {
+    state,
+    flightId: flight.id,
+    hubId: flight.destinationHubId,
+    cruiseMs: flight.cruiseSeconds * 1000,
+  }
+}
+
+describe.each(SEED_NAMES)('flights buzzer boundary: %s', (seedName) => {
+  it('arrival exactly at endsAt lands and counts before the timeout guard', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const { state, flightId, hubId, cruiseMs } = airborneFirst(ctx, seedName, payload)
+    // Dispatch so the computed arrival stamp (routeAt + cruise) equals endsAt.
+    const routeAt = ENDS_AT - cruiseMs
+    const routed = dispatch(ctx, state, land(flightId, hubId), routeAt).state
+    const sub = flightsSub(routed) as FlightsState
+    expect(sub.flights[flightId]!.arrivalAt).toBe(ENDS_AT)
+    // A single advance past the deadline: the flights-tick at endsAt folds the
+    // arrival, THEN the timeout guard settles. The flight landed (not stranded).
+    const advanced = advanceCampaign(ctx, routed, SETTLE_AT)
+    const settlements = advanced.emitted.filter(
+      (e) => e.type === 'settlement' && e.missionId === 'flights',
+    )
+    expect(settlements).toHaveLength(1)
+    const finalSub = flightsSub(advanced.state)
+    // The mission settled, so the live substate is gone; read the settled
+    // outcome: the flight's passengers are resolved, proving it counted.
+    void finalSub
+    const flights = flightsSettled(advanced.state)
+    const flight = payload.flights[0]!
+    expect(flights.metrics['resolved_passengers']!).toBeGreaterThanOrEqual(
+      flight.passengers,
+    )
+    expect(flights.metrics['stranded_passengers']!).toBeLessThanOrEqual(
+      payload.flights.reduce((n, f) => n + f.passengers, 0) - flight.passengers,
+    )
+  })
+
+  it('arrival one tick after endsAt leaves the flight airborne and it strands at timeout', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const { state, flightId, hubId, cruiseMs } = airborneFirst(ctx, seedName, payload)
+    // One tick later than the on-boundary route: arrival at endsAt + 1.
+    const routeAt = ENDS_AT - cruiseMs + 1
+    const routed = dispatch(ctx, state, land(flightId, hubId), routeAt).state
+    const sub = flightsSub(routed) as FlightsState
+    expect(sub.flights[flightId]!.arrivalAt).toBe(ENDS_AT + 1)
+    const advanced = advanceCampaign(ctx, routed, SETTLE_AT)
+    expect(
+      advanced.emitted.some((e) => e.type === 'settlement' && e.missionId === 'flights'),
+    ).toBe(true)
+    const flights = flightsSettled(advanced.state)
+    const flight = payload.flights[0]!
+    // The flight never folded: it stranded at timeout. Its passengers are in the
+    // stranded bucket, not resolved.
+    expect(flights.metrics['stranded_passengers']!).toBeGreaterThanOrEqual(
+      flight.passengers,
+    )
+  })
+
+  it('late landing past the authored threshold settles as landedLate, settled once', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // A DIVERT into a hub whose arrival queue already has enough occupancy to
+    // draw a positional delay past the lateness threshold lands LATE. The queue
+    // delay table's deepest entry exceeds the lateness threshold by authoring.
+    const maxQueueDelay = Math.max(...payload.queueDelayTable)
+    expect(maxQueueDelay).toBeGreaterThan(payload.latenessThresholdSeconds)
+    // Only a LAND at a flight's OWN destination can be landedLate (a divert to
+    // another hub is divertedLanded). So pick a "late" flight that lands at its
+    // destination, and pre-fill THAT destination's early queue positions with
+    // diverts from other eligible airborne flights, so the late flight takes the
+    // deepest positional delay on its own-destination landing.
+    const deepIndex = payload.queueDelayTable.length - 1
+
+    let state = startMission(ctx, seedName)
+    // Advance so the earliest flights are airborne.
+    state = advanceCampaign(ctx, state, FLIGHTS_T0 + 85_000).state
+    const sub0 = flightsSub(state) as FlightsState
+    // Candidate late flights: airborne, landing at a destination hub with enough
+    // slots to hold the pre-fill plus this landing, and with at least deepIndex
+    // OTHER airborne flights able to reach that same hub to fill the queue.
+    const airborneFlights = payload.flights.filter(
+      (f) => sub0.flights[f.id]!.status === 'airborne',
+    )
+    let late = airborneFlights[0]!
+    let fillers = [] as typeof airborneFlights
+    for (const candidate of airborneFlights) {
+      const destHub = payload.hubs.find((h) => h.id === candidate.destinationHubId)!
+      if (destHub.runwaySlots <= deepIndex) continue
+      const others = airborneFlights.filter(
+        (f) =>
+          f.id !== candidate.id &&
+          f.originHubId !== destHub.id &&
+          corridorBetween(payload, f.originHubId, destHub.id) !== null,
+      )
+      if (others.length >= deepIndex) {
+        late = candidate
+        fillers = others.slice(0, deepIndex)
+        break
+      }
+    }
+    const targetHub = payload.hubs.find((h) => h.id === late.destinationHubId)!
+    expect(fillers.length).toBe(deepIndex)
+    for (const f of fillers) {
+      state = dispatch(
+        ctx,
+        state,
+        { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId: f.id, hubId: targetHub.id } },
+        FLIGHTS_T0 + 85_000,
+      ).state
+    }
+    const beforeUsed = (flightsSub(state) as FlightsState).runwayUse[targetHub.id] ?? 0
+    expect(beforeUsed).toBe(deepIndex)
+    // LAND the late flight at its OWN destination: it takes the deepest queue
+    // position, pushing its arrival past the lateness threshold -> landedLate.
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId: late.id, hubId: targetHub.id } },
+      FLIGHTS_T0 + 85_000,
+    ).state
+    const lateSub = flightsSub(state) as FlightsState
+    const lateFs = lateSub.flights[late.id]!
+    expect(lateFs.inboundHubId).toBe(targetHub.id)
+    // The computed arrival exceeds the no-queue on-time baseline by the deepest
+    // delay, which is past the lateness threshold.
+    const delayMs = lateFs.arrivalAt! - lateFs.onTimeAt!
+    expect(delayMs).toBe(maxQueueDelay * 1000)
+    // Settle and confirm the flight resolves exactly once as landedLate: its
+    // passengers land in the LATE bucket, and resolving twice is impossible.
+    const advanced = advanceCampaign(ctx, state, SETTLE_AT)
+    const flights = flightsSettled(advanced.state)
+    expect(flights.metrics['late_passengers']!).toBeGreaterThanOrEqual(
+      late.passengers,
+    )
+    // Settled exactly once: a single settlement event for the mission.
+    expect(
+      advanced.emitted.filter(
+        (e) => e.type === 'settlement' && e.missionId === 'flights',
+      ),
+    ).toHaveLength(1)
+  })
+})
diff --git a/test/engine/missions/flights/fixtures.forfeit.test.ts b/test/engine/missions/flights/fixtures.forfeit.test.ts
new file mode 100644
index 0000000..4ebfc2d
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.forfeit.test.ts
@@ -0,0 +1,122 @@
+// Section-04 CI fixture: the forfeit settlement cause. A forfeit mid-flight
+// evaluates the aggregate AS-IS: landed flights stay landed, held flights count
+// as held, airborne flights strand (the real consequence of abandoning them),
+// but flights that never departed are NOT synthetically stranded. The tier is
+// the aggregate at forfeit time, and the debrief reports the unresolved
+// (airborne-then-stranded) flights. All three seeds.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import { tierFromResolved } from '@engine/missions/flights/rules'
+import {
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+} from './fixtures/index'
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+function land(flightId: string, hubId: string) {
+  return {
+    type: 'MISSION_ACTION' as const,
+    payload: { kind: 'LAND', flightId, hubId },
+  }
+}
+
+function flightsSettled(state: CampaignState) {
+  return state.settled.find((s) => s.missionId === 'flights')!
+}
+
+describe.each(SEED_NAMES)('flights forfeit fixture: %s', (seedName) => {
+  it('forfeit evaluates as-is mid-flight: no synthetic stranding beyond current state, tier from the aggregate at forfeit time', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const sorted = [...payload.flights].sort(
+      (a, b) => a.departureOffsetSeconds - b.departureOffsetSeconds,
+    )
+    // Land the four earliest flights cleanly (routed at departure+2, each lands
+    // at departure+42, all by 82s); then forfeit at a time when at least one
+    // flight is airborne and the LAST flight (departs 120) is still SCHEDULED.
+    let state = startMission(ctx, seedName)
+    const landed = sorted.slice(0, 4)
+    for (const flight of landed) {
+      const at = FLIGHTS_T0 + (flight.departureOffsetSeconds + 2) * 1000
+      state = advanceCampaign(ctx, state, at).state
+      state = dispatch(ctx, state, land(flight.id, flight.destinationHubId), at).state
+    }
+    // Forfeit at 100s: the four early flights have landed; flights departing at
+    // 50/70/80 are airborne and un-routed; the flight departing at 120 has NOT
+    // departed yet (still SCHEDULED), so it is never synthetically stranded.
+    const forfeitAt = FLIGHTS_T0 + 100_000
+    state = advanceCampaign(ctx, state, forfeitAt).state
+    const result = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, forfeitAt + 1_000)
+    const flights = flightsSettled(result.state)
+    expect(flights.cause).toBe('forfeit')
+
+    // The two cleanly-landed flights are credited, their passengers resolved.
+    const landedPax = landed.reduce((n, f) => n + f.passengers, 0)
+    expect(flights.metrics['resolved_passengers']!).toBeGreaterThanOrEqual(landedPax)
+    expect(flights.metrics['landed_flights']!).toBeGreaterThanOrEqual(2)
+
+    // No synthetic departures: a scheduled flight that never departed contributes
+    // NOTHING to resolved, stranded, or held (it is neither airborne nor held),
+    // so conservation across resolved + stranded + held is LESS than the full
+    // fleet. The still-scheduled souls are simply not aggregated.
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    const aggregated =
+      flights.metrics['resolved_passengers']! +
+      flights.metrics['stranded_passengers']! +
+      flights.metrics['held_passengers']!
+    expect(aggregated).toBeLessThan(total)
+    expect(aggregated).toBeGreaterThan(0)
+
+    // Tier is the aggregate resolved figure at forfeit time, no earlier or later.
+    const expectedTier = tierFromResolved(
+      flights.metrics['resolved_passengers']!,
+      payload.tierThresholds,
+    )
+    expect(flights.tier).toBe(expectedTier)
+    expect(Number.isInteger(flights.metrics['resolved_passengers'])).toBe(true)
+  })
+
+  it('debrief after forfeit reports unresolved flights', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // Forfeit with at least one airborne-then-stranded flight: no routing,
+    // forfeit at 45s so the early departures are airborne and strand.
+    let state = startMission(ctx, seedName)
+    const forfeitAt = FLIGHTS_T0 + 45_000
+    state = advanceCampaign(ctx, state, forfeitAt).state
+    const result = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, forfeitAt + 1_000)
+    const outcome = flightsSettled(result.state)
+    expect(outcome.cause).toBe('forfeit')
+    expect(outcome.metrics['stranded_flights']!).toBeGreaterThan(0)
+
+    const module = ctx.missions['flights']!
+    const debrief = module.debrief!(outcome)
+    // The debrief names the stranded (unresolved) flights as a count and their
+    // passengers: a line reporting the strand.
+    const strandLine = debrief.lines.find((l) => l.startsWith('STRANDED '))
+    expect(strandLine).toBeDefined()
+    expect(strandLine).toContain(`${outcome.metrics['stranded_flights']} FLIGHTS`)
+    expect(strandLine).toContain(`${outcome.metrics['stranded_passengers']} PASSENGERS`)
+    // Headline carries the forfeit cause.
+    expect(debrief.headline).toContain('FORFEIT')
+    void payload
+  })
+})
diff --git a/test/engine/missions/flights/fixtures.groundAll.test.ts b/test/engine/missions/flights/fixtures.groundAll.test.ts
new file mode 100644
index 0000000..edbe05a
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.groundAll.test.ts
@@ -0,0 +1,163 @@
+// Section-04 CI fixture: the blanket-grounding thesis. GROUND ALL holds every
+// scheduled flight, blocks later departures and individual releases, is single
+// use (a re-dispatch is a typed rejection, state unchanged), and does NOT early
+// complete (the clock runs to endsAt). At the grounding, WOPR's OPEN EXCEPTIONS
+// tally falls sharply (every held flight is a resolved exception) while the real
+// passenger aggregate worsens against the walkthrough baseline, and the debrief
+// names the trade. All three seeds, driven through the real engine lifecycle.
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import { buildScoreboard } from '@engine/missions/flights/scoreboard'
+import type { FlightsState } from '@engine/missions/flights/types'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  flightsSub,
+  groundAllAtStartFor,
+  runScript,
+  walkthroughFor,
+} from './fixtures/index'
+
+const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
+const SETTLE_AT = ENDS_AT + 1_000
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+function groundAll() {
+  return { type: 'MISSION_ACTION' as const, payload: { kind: 'GROUND_ALL' } }
+}
+
+function flightsSettled(state: CampaignState) {
+  return state.settled.find((s) => s.missionId === 'flights')!
+}
+
+describe.each(SEED_NAMES)('flights GROUND ALL fixture: %s', (seedName) => {
+  it('GROUND ALL holds every scheduled flight and blocks departures and releases thereafter', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    let state = startMission(ctx, seedName)
+    state = dispatch(ctx, state, groundAll(), FLIGHTS_T0).state
+    const sub = flightsSub(state) as FlightsState
+    // Every flight was scheduled at t0, so every one is now held.
+    for (const flight of payload.flights) {
+      expect(sub.flights[flight.id]!.status).toBe('held')
+    }
+    // Advancing past every scheduled departure never launches a held flight:
+    // they stay held, nobody goes airborne.
+    const advanced = advanceCampaign(ctx, state, FLIGHTS_T0 + 130_000).state
+    const laterSub = flightsSub(advanced) as FlightsState
+    for (const flight of payload.flights) {
+      expect(['held', 'heldFinal']).toContain(laterSub.flights[flight.id]!.status)
+    }
+    // An individual RELEASE after grounding is a typed rejection, state intact.
+    const release = dispatch(
+      ctx,
+      advanced,
+      { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId: payload.flights[0]!.id } },
+      FLIGHTS_T0 + 131_000,
+    )
+    expect(release.rejection).toBeDefined()
+    expect(release.rejection!.reason).toBe('GROUNDED')
+  })
+
+  it('re-dispatch of GROUND ALL rejects as a provable no-op', () => {
+    const ctx = flightsContextForSeed(seedName)
+    let state = startMission(ctx, seedName)
+    state = dispatch(ctx, state, groundAll(), FLIGHTS_T0).state
+    const before = state
+    const second = dispatch(ctx, state, groundAll(), FLIGHTS_T0 + 1_000)
+    expect(second.rejection).toBeDefined()
+    expect(second.rejection!.reason).toBe('ALREADY GROUNDED')
+    // State unchanged by the rejected re-dispatch (substate strict-deep-equal).
+    expect(flightsSub(second.state)).toStrictEqual(flightsSub(before))
+  })
+
+  it('GROUND ALL does not early-complete; the clock runs to endsAt', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { state, emitted } = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
+      settleAt: SETTLE_AT,
+    })
+    const settlements = emitted.filter(
+      (e) => e.type === 'settlement' && e.missionId === 'flights',
+    )
+    expect(settlements).toHaveLength(1)
+    // The clock ran to the deadline: the cause is timeout, not completed. A
+    // grounded fleet never triggers early completion.
+    expect(settlements[0]).toMatchObject({ cause: 'timeout' })
+    // And no settlement fired BEFORE the deadline: sampling mid-run at 130s
+    // (past every departure) the mission is still live.
+    const mid = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
+      settleAt: FLIGHTS_T0 + 130_000,
+    })
+    expect(mid.state.phase).toBe('mission')
+    expect(mid.state.settled.some((s) => s.missionId === 'flights')).toBe(false)
+    void state
+  })
+
+  it('open exceptions fall sharply at the grounding while the passenger aggregate worsens vs the walkthrough baseline', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // Scoreboard immediately BEFORE the grounding (at t0, all scheduled) and
+    // immediately AFTER (all held): held flights jump from 0 to the full fleet,
+    // the WOPR-resolved exception count the campaign subtracts.
+    let state = startMission(ctx, seedName)
+    const beforeBoard = buildScoreboard(payload, flightsSub(state) as FlightsState)
+    expect(beforeBoard.heldFlights).toBe(0)
+    state = dispatch(ctx, state, groundAll(), FLIGHTS_T0).state
+    const afterBoard = buildScoreboard(payload, flightsSub(state) as FlightsState)
+    expect(afterBoard.heldFlights).toBe(payload.flights.length)
+    expect(afterBoard.grounded).toBe(true)
+
+    // Final evaluate vs the walkthrough baseline: grounding resolves ZERO real
+    // passengers (the worst) while the walkthrough resolves every soul.
+    const grounded = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
+      settleAt: SETTLE_AT,
+    })
+    const groundedOutcome = flightsSettled(grounded.state)
+    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
+    const walkOutcome = flightsSettled(walk.state)
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    expect(groundedOutcome.metrics['resolved_passengers']).toBe(0)
+    expect(groundedOutcome.tier).toBe('failed')
+    expect(walkOutcome.metrics['resolved_passengers']).toBe(total)
+    expect(walkOutcome.tier).toBe('full')
+    // The WOPR tally diverges from the truth: grounding posts the maximum
+    // held-flight tally yet the worst real outcome.
+    expect(groundedOutcome.metrics['held_flights']).toBe(payload.flights.length)
+    expect(walkOutcome.metrics['held_flights']).toBe(0)
+  })
+
+  it('debrief names the GROUND ALL trade when taken', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { state } = runScript(ctx, seedName, groundAllAtStartFor(seedName), {
+      settleAt: SETTLE_AT,
+    })
+    const outcome = flightsSettled(state)
+    const module = ctx.missions['flights']!
+    const debrief = module.debrief!(outcome)
+    expect(debrief.lines).toContain('GROUND ALL FLIGHTS WAS ORDERED')
+    // A walkthrough that never grounds does NOT carry the line (the trade is
+    // reported only when taken).
+    const walk = runScript(ctx, seedName, walkthroughFor(seedName), { settleAt: SETTLE_AT })
+    const walkDebrief = module.debrief!(flightsSettled(walk.state))
+    expect(walkDebrief.lines).not.toContain('GROUND ALL FLIGHTS WAS ORDERED')
+  })
+})
diff --git a/test/engine/missions/flights/fixtures.maxConsequence.test.ts b/test/engine/missions/flights/fixtures.maxConsequence.test.ts
new file mode 100644
index 0000000..45e2ab2
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.maxConsequence.test.ts
@@ -0,0 +1,123 @@
+// Section-04 CI fixture: the max-consequence fold. With the capped inbound
+// consequences folded (commsDelayed widening the projection divergence by its
+// capped magnitude, paymentsDelayed removing one runway slot at the pinned
+// target hub), the base walkthrough still reaches at least PARTIAL, and the
+// authored alternate still reaches FULL. Consequence folding is order
+// independent: the folded substate is identical across any permutation of the
+// inbound consequence set. All three authored seeds.
+import { describe, expect, it } from 'vitest'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { SettledOutcome } from '@engine/campaign/types'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  alternateFor,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  flightsSub,
+  runScript,
+  walkthroughFor,
+} from './fixtures/index'
+
+const TIER_RANK: Record<string, number> = {
+  failed: 0,
+  poor: 1,
+  partial: 2,
+  full: 3,
+}
+
+const SETTLE_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000
+
+function tierOf(state: CampaignState): string {
+  return state.settled.find((s) => s.missionId === 'flights')!.tier
+}
+
+/** A settled bank outcome carrying the two capped inbound consequences in a
+ *  given order, so a START_MISSION folds them into flights init. */
+function seedWithConsequences(
+  state: CampaignState,
+  order: Array<'paymentsDelayed' | 'commsDelayed'>,
+): CampaignState {
+  const byKind = {
+    paymentsDelayed: { id: 'cq-max-pay', kind: 'paymentsDelayed' as const, magnitude: 40 },
+    commsDelayed: { id: 'cq-max-comms', kind: 'commsDelayed' as const, magnitude: 40 },
+  }
+  const outcome: SettledOutcome = {
+    missionId: 'bank',
+    cause: 'completed',
+    tier: 'failed',
+    settleSeq: 0,
+    metrics: {},
+    clueId: null,
+    consequences: order.map((k) => byKind[k]),
+  }
+  return { ...state, settled: [outcome] }
+}
+
+describe.each(SEED_NAMES)('flights max-consequence fixture: %s', (seedName) => {
+  it('base walkthrough under capped commsDelayed plus paymentsDelayed still reaches at least partial tier', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { state } = runScript(ctx, seedName, walkthroughFor(seedName), {
+      settleAt: SETTLE_AT,
+      maxConsequences: true,
+    })
+    const tier = tierOf(state)
+    expect(TIER_RANK[tier]!).toBeGreaterThanOrEqual(TIER_RANK['partial']!)
+  })
+
+  it('authored full-tier alternate walkthrough wins at maximum penalty', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    const { state } = runScript(ctx, seedName, alternateFor(seedName), {
+      settleAt: SETTLE_AT,
+      maxConsequences: true,
+    })
+    const flights = state.settled.find((s) => s.missionId === 'flights')!
+    expect(flights.tier).toBe('full')
+    expect(flights.metrics['resolved_passengers']).toBe(total)
+    expect(Number.isInteger(flights.metrics['resolved_passengers'])).toBe(true)
+  })
+
+  it('consequence folding is order-independent: folded substate strict-deep-equals across orders', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const orders: Array<Array<'paymentsDelayed' | 'commsDelayed'>> = [
+      ['paymentsDelayed', 'commsDelayed'],
+      ['commsDelayed', 'paymentsDelayed'],
+    ]
+    const foldedSubstates: FlightsState[] = orders.map((order) =>
+      startAndReadSub(ctx, seedName, order),
+    )
+    expect(foldedSubstates[0]).toStrictEqual(foldedSubstates[1])
+    // The fold genuinely took effect: a runway slot is phantom-occupied at the
+    // pinned hub and the projection divergence widened. Integer facts.
+    const pinned = (flightsPayloadFor(seedName) as FlightsPayload)
+      .paymentsDelayedTargetHubId
+    expect(foldedSubstates[0]!.runwayUse[pinned]).toBe(1)
+    expect(Number.isInteger(foldedSubstates[0]!.projectionDivergence)).toBe(true)
+    expect(foldedSubstates[0]!.projectionDivergence).toBeGreaterThan(0)
+  })
+})
+
+/** Create a campaign, seed the bank consequences in `order`, start the flights
+ *  mission through the real engine, and read the folded substate. */
+function startAndReadSub(
+  ctx: EngineContext,
+  seedName: string,
+  order: Array<'paymentsDelayed' | 'commsDelayed'>,
+): FlightsState {
+  const base = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  const seeded = seedWithConsequences(base, order)
+  const started = dispatch(
+    ctx,
+    seeded,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+  return flightsSub(started) as FlightsState
+}
diff --git a/test/engine/missions/flights/fixtures.separation.test.ts b/test/engine/missions/flights/fixtures.separation.test.ts
new file mode 100644
index 0000000..408eb89
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.separation.test.ts
@@ -0,0 +1,87 @@
+// Section-04 CI fixture: the same-second separation guard, re-asserted against
+// the final SHIPPED seeds as a direct fixture (independent of the validator's
+// own tests, validator invariant 4). No storm close or open event shares a
+// scheduledAt with any arrival it could affect, per seed: every seed's storm
+// steps are walked against every computable arrival (authored and
+// walkthrough-derived) and asserted at least one second apart. Also: the drain
+// order (scheduledAt, id) is deterministic across a replayed storm-heavy window.
+import { describe, expect, it } from 'vitest'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import {
+  authoredArrivals,
+  stormArrivalCollisions,
+} from '@engine/missions/flights/content'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import {
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  lastArrivalOffsetSeconds,
+  runScript,
+  scriptArrivals,
+  walkthroughFor,
+} from './fixtures/index'
+
+describe.each(SEED_NAMES)('flights separation fixture: %s', (seedName) => {
+  it('no storm close or open shares a scheduledAt with any arrival it could affect', () => {
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // The authored baseline arrivals: every flight straight to its destination.
+    expect(
+      stormArrivalCollisions(payload.stormTrack, authoredArrivals(payload)),
+    ).toEqual([])
+    // And the walkthrough-derived arrivals (the real routed stamps, including
+    // the forced divert's queued arrival) also clear every storm transition.
+    const ctx = flightsContextForSeed(seedName)
+    const arrivals = scriptArrivals(
+      ctx,
+      seedName,
+      walkthroughFor(seedName),
+      FLIGHTS_T0 + (lastArrivalOffsetSeconds(payload) - 5) * 1000,
+    )
+    expect(arrivals.length).toBe(payload.flights.length)
+    expect(stormArrivalCollisions(payload.stormTrack, arrivals)).toEqual([])
+    // Every storm step offset is at least one whole second from each storm
+    // transition it carries vs the authored arrivals it could touch (the guard
+    // is integer seconds, so this is a hard >= 1 separation).
+    for (const step of payload.stormTrack) {
+      const touchedHubs = new Set([...step.closeHubs, ...step.openHubs])
+      const touchedCorridors = new Set([
+        ...step.closeCorridors,
+        ...step.openCorridors,
+      ])
+      for (const arrival of authoredArrivals(payload)) {
+        const affects =
+          touchedHubs.has(arrival.hubId) ||
+          (arrival.corridorId !== null &&
+            touchedCorridors.has(arrival.corridorId))
+        if (!affects) continue
+        expect(Math.abs(step.offsetSeconds - arrival.offsetSeconds)).toBeGreaterThanOrEqual(1)
+      }
+    }
+  })
+
+  it('drain order (scheduledAt, id) is deterministic across a replayed storm-heavy window', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const settleAt = FLIGHTS_T0 + 240_000 + 1_000
+    // Replay the walkthrough twice through the real engine across the full
+    // storm-heavy window and compare the emitted scheduledEventFired sequences:
+    // the engine drains by (scheduledAt, id), so the id-ordered fire sequence is
+    // byte-for-byte identical on a replay.
+    const firstRun = runScript(ctx, seedName, walkthroughFor(seedName), {
+      settleAt,
+    })
+    const secondRun = runScript(ctx, seedName, walkthroughFor(seedName), {
+      settleAt,
+    })
+    const fires = (emitted: typeof firstRun.emitted) =>
+      emitted
+        .filter((e) => e.type === 'scheduledEventFired')
+        .map((e) => ({ id: (e as { id: string }).id, kind: (e as { kind: string }).kind }))
+    const firstFires = fires(firstRun.emitted)
+    const secondFires = fires(secondRun.emitted)
+    expect(firstFires).toStrictEqual(secondFires)
+    // The sequence actually carried the storm transitions (storm-heavy window).
+    expect(firstFires.some((f) => f.kind === 'flightsStorm')).toBe(true)
+    expect(firstFires.some((f) => f.kind === 'flightsForecast')).toBe(true)
+  })
+})
diff --git a/test/engine/missions/flights/fixtures.timeout.test.ts b/test/engine/missions/flights/fixtures.timeout.test.ts
new file mode 100644
index 0000000..9da1994
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.timeout.test.ts
@@ -0,0 +1,144 @@
+// Section-04 CI fixture: the timeout settlement cause. At the deadline, a due
+// arrival (scheduledAt <= endsAt) folds and lands BEFORE the timeout settlement
+// guard runs in the same advance; unresolved airborne flights strand and held
+// flights become heldFinal; and evaluate(timeout) aggregates the stranded
+// passengers with integer math and the correct resolved tier. All three seeds,
+// built through the real engine lifecycle (no queue poking).
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import {
+  tierFromResolved,
+} from '@engine/missions/flights/rules'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+} from './fixtures/index'
+
+const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
+const SETTLE_AT = ENDS_AT + 1_000
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+function land(flightId: string, hubId: string) {
+  return {
+    type: 'MISSION_ACTION' as const,
+    payload: { kind: 'LAND', flightId, hubId },
+  }
+}
+
+function flightsSettled(state: CampaignState) {
+  return state.settled.find((s) => s.missionId === 'flights')!
+}
+
+describe.each(SEED_NAMES)('flights timeout fixture: %s', (seedName) => {
+  it('at endsAt, a due arrival resolves before the settlement guard', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // Route one airborne flight so its arrival stamp lands EXACTLY at endsAt:
+    // dispatch at endsAt - cruise, landing at endsAt. The flights-tick at endsAt
+    // folds it before the timeout guard runs in the same advance.
+    const flight = payload.flights[0]! // departs 10s, open -> east, open corridor
+    let state = startMission(ctx, seedName)
+    // Advance so the flight is airborne.
+    state = advanceCampaign(ctx, state, FLIGHTS_T0 + (flight.departureOffsetSeconds + 1) * 1000).state
+    const routeAt = ENDS_AT - flight.cruiseSeconds * 1000
+    state = dispatch(ctx, state, land(flight.id, flight.destinationHubId), routeAt).state
+    // A single advance PAST the deadline: the arrival at endsAt folds, then the
+    // timeout guard settles. The flight is landed (resolved), not stranded.
+    const advanced = advanceCampaign(ctx, state, SETTLE_AT)
+    const settlements = advanced.emitted.filter(
+      (e) => e.type === 'settlement' && e.missionId === 'flights',
+    )
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'timeout' })
+    const flights = flightsSettled(advanced.state)
+    // The one due arrival counted: its passengers are resolved, not stranded.
+    expect(flights.metrics['resolved_passengers']!).toBeGreaterThanOrEqual(
+      flight.passengers,
+    )
+  })
+
+  it('unresolved airborne flights strand and held flights become heldFinal at timeout', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    let state = startMission(ctx, seedName)
+    // HOLD the first flight at t0 (before it departs). Leave every other flight
+    // un-routed, so they go airborne and never land.
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: payload.flights[0]!.id } },
+      FLIGHTS_T0 + 1_000,
+    ).state
+    const advanced = advanceCampaign(ctx, state, SETTLE_AT)
+    const settlements = advanced.emitted.filter(
+      (e) => e.type === 'settlement' && e.missionId === 'flights',
+    )
+    expect(settlements[0]).toMatchObject({ cause: 'timeout' })
+    const flights = flightsSettled(advanced.state)
+    // The held flight became heldFinal (counts as held); the seven airborne
+    // flights stranded. No flight landed.
+    expect(flights.metrics['held_flights']).toBe(1)
+    expect(flights.metrics['stranded_flights']).toBe(payload.flights.length - 1)
+    expect(flights.metrics['landed_flights']).toBe(0)
+    // The held flight's passengers are held, the rest stranded; integer sums.
+    const heldPax = payload.flights[0]!.passengers
+    const strandedPax = payload.flights
+      .slice(1)
+      .reduce((n, f) => n + f.passengers, 0)
+    expect(flights.metrics['held_passengers']).toBe(heldPax)
+    expect(flights.metrics['stranded_passengers']).toBe(strandedPax)
+    expect(Number.isInteger(flights.metrics['stranded_passengers'])).toBe(true)
+  })
+
+  it('evaluate(timeout) aggregates stranded passengers with integer math and the correct tier', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // Route only the earliest-departing half of the fleet to their
+    // destinations; leave the rest airborne so they strand. This yields a
+    // partial/poor tier the authored thresholds pin.
+    let state = startMission(ctx, seedName)
+    const sorted = [...payload.flights].sort(
+      (a, b) => a.departureOffsetSeconds - b.departureOffsetSeconds,
+    )
+    const routed = sorted.slice(0, 2) // the two earliest, both land cleanly
+    for (const flight of routed) {
+      const at = FLIGHTS_T0 + (flight.departureOffsetSeconds + 2) * 1000
+      state = advanceCampaign(ctx, state, at).state
+      state = dispatch(ctx, state, land(flight.id, flight.destinationHubId), at).state
+    }
+    const advanced = advanceCampaign(ctx, state, SETTLE_AT)
+    const flights = flightsSettled(advanced.state)
+    expect(advanced.emitted.some((e) => e.type === 'settlement')).toBe(true)
+    const resolved = flights.metrics['resolved_passengers']!
+    const expectedTier = tierFromResolved(resolved, payload.tierThresholds)
+    expect(flights.tier).toBe(expectedTier)
+    // Resolved + stranded + held equals the whole fleet's souls (integer
+    // conservation: no passenger is lost or double-counted).
+    const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+    const sum =
+      flights.metrics['resolved_passengers']! +
+      flights.metrics['stranded_passengers']! +
+      flights.metrics['held_passengers']!
+    expect(sum).toBe(total)
+    expect(Number.isInteger(resolved)).toBe(true)
+  })
+})
diff --git a/test/engine/missions/flights/fixtures.walkthrough.test.ts b/test/engine/missions/flights/fixtures.walkthrough.test.ts
new file mode 100644
index 0000000..ff9f85b
--- /dev/null
+++ b/test/engine/missions/flights/fixtures.walkthrough.test.ts
@@ -0,0 +1,174 @@
+// Section-04 CI fixture: the evidence-reading walkthrough reaches the FULL
+// success tier with margin under the real storm track, for every authored
+// seed. The script comes from section 02 (walkthroughFor) and is only replayed
+// here. Also proves the single coalesced correction material-change event fires
+// exactly once, and that early completion is gated on the LAST flight turning
+// terminal (a held flight does not count; a heldFinal flight does).
+import { describe, expect, it } from 'vitest'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { SEED_NAMES } from '@engine/seeds/catalog'
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import type { FlightsState } from '@engine/missions/flights/types'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  flightsSub,
+  runScript,
+  walkthroughFor,
+} from './fixtures/index'
+
+const SETTLE_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS + 1_000
+
+const TERMINAL = new Set([
+  'landed',
+  'landedLate',
+  'divertedLanded',
+  'stranded',
+  'heldFinal',
+])
+
+function flightsSettled(state: CampaignState) {
+  return state.settled.find((s) => s.missionId === 'flights')!
+}
+
+function totalPassengers(payload: FlightsPayload): number {
+  return payload.flights.reduce((n, f) => n + f.passengers, 0)
+}
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+describe.each(SEED_NAMES)('flights walkthrough fixture: %s', (seedName) => {
+  it('walkthrough script reaches full tier under the real storm track with margin', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    const { state, emitted } = runScript(ctx, seedName, walkthroughFor(seedName), {
+      settleAt: SETTLE_AT,
+    })
+    const settlements = emitted.filter(
+      (e) => e.type === 'settlement' && e.missionId === 'flights',
+    )
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
+
+    const flights = flightsSettled(state)
+    const total = totalPassengers(payload)
+    expect(flights.tier).toBe('full')
+    // Full tier with MARGIN: every soul resolved, zero stranded, and the
+    // resolved figure sits at or above the full threshold with room to spare
+    // over partial (the margin the authoring guarantees).
+    expect(flights.metrics['resolved_passengers']).toBe(total)
+    expect(Number.isInteger(flights.metrics['resolved_passengers'])).toBe(true)
+    expect(flights.metrics['stranded_passengers']).toBe(0)
+    expect(flights.metrics['held_passengers']).toBe(0)
+    expect(flights.metrics['resolved_passengers']!).toBeGreaterThanOrEqual(
+      payload.tierThresholds.full,
+    )
+    expect(flights.metrics['resolved_passengers']!).toBeGreaterThan(
+      payload.tierThresholds.partial,
+    )
+    // All eight flights terminal with a real landing (on time, late, or
+    // diverted); none stranded or held.
+    expect(flights.metrics['landed_flights']).toBe(payload.flights.length)
+    expect(flights.metrics['held_flights']).toBe(0)
+    expect(flights.metrics['stranded_flights']).toBe(0)
+  })
+
+  it('walkthrough emits the coalesced correction material-change event exactly once', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const { emitted } = runScript(ctx, seedName, walkthroughFor(seedName), {
+      settleAt: SETTLE_AT,
+    })
+    // The authored projection correction fires as a single scheduledEventFired
+    // (kind flightsCorrection). One correction authored per seed, so exactly
+    // one coalesced material-change event reaches the shell: no re-fire, no
+    // duplicate.
+    const corrections = emitted.filter(
+      (e) => e.type === 'scheduledEventFired' && e.kind === 'flightsCorrection',
+    )
+    expect(corrections).toHaveLength(1)
+  })
+
+  it('early completion fires when the last flight turns terminal, not before; held does not count but heldFinal does', () => {
+    const ctx = flightsContextForSeed(seedName)
+    const payload = flightsPayloadFor(seedName) as FlightsPayload
+    // Sample the LIVE walkthrough substate at a mid-run time when at least one
+    // flight is still non-terminal (scheduled, airborne, or held): the mission
+    // has NOT early-completed, so it is still active with live substate.
+    const lastDeparture = Math.max(
+      ...payload.flights.map((f) => f.departureOffsetSeconds),
+    )
+    const sampleAt = FLIGHTS_T0 + (lastDeparture - 1) * 1000
+    const mid = runScript(ctx, seedName, walkthroughFor(seedName), {
+      settleAt: sampleAt,
+    })
+    expect(mid.state.phase).toBe('mission')
+    const sub = flightsSub(mid.state) as FlightsState
+    const statuses = Object.values(sub.flights).map((f) => f.status)
+    const nonTerminal = statuses.filter((s) => !TERMINAL.has(s))
+    expect(nonTerminal.length).toBeGreaterThan(0)
+    // No settlement has fired while a flight is still non-terminal.
+    expect(
+      mid.state.settled.some((s) => s.missionId === 'flights'),
+    ).toBe(false)
+
+    // A held flight alone never early-completes: HOLD a scheduled flight at t0
+    // and land everyone else, then sample BEFORE the origin-hub departure
+    // window closes (200s). The held flight is still `held` (non-terminal), so
+    // the mission stays live: held does not count toward all-terminal.
+    const minWindow = Math.min(
+      ...payload.hubs.map((h) => h.lastDepartureOffsetSeconds),
+    )
+    const beforeWindow = FLIGHTS_T0 + (minWindow - 5) * 1000
+    const heldRun = (): CampaignState => {
+      let state = startMission(ctx, seedName)
+      const firstFlight = payload.flights[0]!
+      state = dispatch(
+        ctx,
+        state,
+        { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: firstFlight.id } },
+        FLIGHTS_T0 + 1_000,
+      ).state
+      // Land everyone else so only the held flight is non-terminal.
+      for (const flight of payload.flights.slice(1)) {
+        const at = FLIGHTS_T0 + (flight.departureOffsetSeconds + 2) * 1000
+        state = dispatch(
+          ctx,
+          state,
+          { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId: flight.id, hubId: flight.destinationHubId } },
+          at,
+        ).state
+      }
+      return advanceCampaign(ctx, state, beforeWindow).state
+    }
+    const held = heldRun()
+    // Before the origin window closes, the held flight is still `held` (not
+    // heldFinal): a non-terminal flight the mission waits on.
+    expect(held.phase).toBe('mission')
+    const heldSub = flightsSub(held) as FlightsState
+    expect(heldSub.flights[payload.flights[0]!.id]!.status).toBe('held')
+    expect(held.settled.some((s) => s.missionId === 'flights')).toBe(false)
+
+    // At the deadline, timeout folds the held flight to heldFinal (terminal) and
+    // the mission settles: heldFinal counts toward all-terminal.
+    const settled = advanceCampaign(ctx, held, SETTLE_AT).state
+    expect(settled.settled.some((s) => s.missionId === 'flights')).toBe(true)
+    const flights = flightsSettled(settled)
+    expect(flights.metrics['held_flights']).toBe(1)
+  })
+})
diff --git a/test/engine/missions/flights/fixtures/index.ts b/test/engine/missions/flights/fixtures/index.ts
new file mode 100644
index 0000000..e25df8a
--- /dev/null
+++ b/test/engine/missions/flights/fixtures/index.ts
@@ -0,0 +1,32 @@
+// The section-04 GROUND ALL FLIGHTS fixtures directory. The walkthrough,
+// alternate full-tier, adversarial, and blanket-grounding scripts already live
+// in test/engine/missions/flights/fixtures.ts (section 02 authored them and
+// solvability.test.ts drives them). This directory re-exports those EXACT
+// scripts and helpers, per the section-04 file layout, rather than forking
+// them: one source of truth for the solvability proofs that both the
+// solvability suite and the CI fixture matrix replay. If a fixture fails, the
+// fix belongs in the seed or the rules, never a fixture-local patch.
+//
+// A fixture script is a deterministic ordered list of [CampaignAction, now]
+// envelopes replayed through the real engine lifecycle (START_MISSION, then
+// interleaved dispatch/advance). The loaders below take a seed name so a
+// describe.each matrix over SEED_NAMES pulls the right script per seed; the
+// scripts read the live authored payload, so they move with the three seeds.
+export type { Envelope, RunResult } from '../fixtures'
+export {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  adversarialGroundAllFor,
+  alternateFor,
+  driveFlightsSeed,
+  flightsContextForSeed,
+  flightsPayloadFor,
+  flightsSub,
+  groundAllAtStartFor,
+  lastArrivalOffsetSeconds,
+  scriptArrivals,
+  walkthroughFor,
+  withMaxConsequences,
+} from '../fixtures'
+
+export { runScript } from '../helpers/runScript'
diff --git a/test/engine/missions/flights/helpers/runScript.ts b/test/engine/missions/flights/helpers/runScript.ts
new file mode 100644
index 0000000..4ac4436
--- /dev/null
+++ b/test/engine/missions/flights/helpers/runScript.ts
@@ -0,0 +1,78 @@
+// The drained-state replay helper for the section-04 fixtures. runScript
+// replays a scripted sequence of timed [CampaignAction, now] envelopes through
+// the REAL engine lifecycle, ALWAYS advancing to each step's time before the
+// dispatch, so every decision lands against drained state exactly as real play
+// does (the drain-then-reduce ordering the rules were tested with in section
+// 01). It returns the final campaign state plus every emitted event, so a
+// fixture can assert settlement causes, clue events, and scheduled fires
+// without re-deriving them.
+//
+// A script envelope IS already [action, now]; advancing to `now` first before
+// dispatching mirrors dispatch's own advance-then-reduce, but makes the drain
+// explicit and lets a fixture insert a bare advance step by repeating a time.
+// Do NOT batch dispatches at a single time unless the script explicitly encodes
+// a same-call race; the solvability scripts never do.
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { EngineEvent } from '@engine/campaign/types'
+import { FLIGHTS_T0, withMaxConsequences } from '../fixtures'
+import type { Envelope, RunResult } from '../fixtures'
+
+export interface RunScriptOptions {
+  /** Advance past this absolute ms after the last envelope, so unrouted
+   *  airborne flights strand and the mission settles. Null leaves the mission
+   *  live at the last envelope's time (used to sample mid-run substate). */
+  readonly settleAt?: number | null
+  /** Seed the folded inbound consequences that remove one runway slot at the
+   *  pinned hub and widen the projection divergence, driving the max-penalty
+   *  fixtures. */
+  readonly maxConsequences?: boolean
+  /** The mission-start wall time the campaign is created at. Integer. */
+  readonly t0?: number
+}
+
+/** Replay a script over an authored seed with drained-state discipline:
+ *  advance to each envelope's time, then dispatch there. Returns the final
+ *  state and all emitted events. */
+export function runScript(
+  ctx: EngineContext,
+  seedName: string,
+  envelopes: Envelope[],
+  options: RunScriptOptions = {},
+): RunResult {
+  const t0 = options.t0 ?? FLIGHTS_T0
+  const settleAt = options.settleAt === undefined ? null : options.settleAt
+  let state: CampaignState = createCampaign(
+    ctx,
+    seedName,
+    { extendedTime: false },
+    t0,
+  )
+  if (options.maxConsequences) state = withMaxConsequences(state)
+  const emitted: EngineEvent[] = []
+  for (const [action, now] of envelopes) {
+    // Drain to this step's time first so the decision lands against drained
+    // state, then reduce the action at the same time. dispatch itself advances
+    // to `now` before reducing, so a bare advance here is redundant for the
+    // common case; it only matters when a prior envelope settled the mission
+    // (advance keeps the lifecycle moving) or a fixture repeats a time to force
+    // an explicit drain. Keeping it explicit documents the discipline.
+    const drained = advanceCampaign(ctx, state, now)
+    state = drained.state
+    emitted.push(...drained.emitted)
+    const result = dispatch(ctx, state, action, now)
+    state = result.state
+    emitted.push(...result.emitted)
+  }
+  if (settleAt !== null) {
+    const advanced = advanceCampaign(ctx, state, settleAt)
+    state = advanced.state
+    emitted.push(...advanced.emitted)
+  }
+  return { state, emitted }
+}
diff --git a/test/engine/missions/flights/properties.test.ts b/test/engine/missions/flights/properties.test.ts
new file mode 100644
index 0000000..3097b3a
--- /dev/null
+++ b/test/engine/missions/flights/properties.test.ts
@@ -0,0 +1,244 @@
+// Section-04 mission-local property suite over the REAL engine lifecycle and
+// the REAL flights module. The arbitrary generates sequences of valid-SHAPED
+// actions (LAND, DIVERT, HOLD, RELEASE, GROUND_ALL, PROBE) at nondecreasing
+// integer times inside the mission window, over the authored seed's flight and
+// hub ids. Invalid-shaped actions are rejected by validate() (surfaced as
+// dispatch rejections), never a crash, and every invariant holds over whatever
+// subset the engine accepts:
+//   - runway slot occupancy never goes negative (and never exceeds capacity);
+//   - statuses only move forward along the lifecycle (terminal states absorb);
+//   - every flight settles exactly once (a terminal status never changes);
+//   - substate stays JSON-safe and round-trips saveSchema at every step;
+//   - reducers never fold the projection (projectionDivergence is invariant
+//     after init; appliedCorrection is a monotone storm-event counter, never
+//     moved by a player action).
+// Run count is modest (200) and the fast-check seed is pinned for a
+// deterministic CI harness that replays any counterexample.
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
+import type { FlightsPayload } from '@engine/missions/flights/content'
+import { flightsSaveSchema } from '@engine/missions/flights/types'
+import type { FlightStatus, FlightsState } from '@engine/missions/flights/types'
+import {
+  FLIGHTS_DURATION_MS,
+  FLIGHTS_T0,
+  flightsContextForSeed,
+  flightsPayloadFor,
+} from './fixtures/index'
+
+const ENDS_AT = FLIGHTS_T0 + FLIGHTS_DURATION_MS
+const FC_SEED = 0x0f117 // pinned per the deterministic split-01 harness convention
+
+const TERMINAL = new Set<FlightStatus>([
+  'landed',
+  'landedLate',
+  'divertedLanded',
+  'stranded',
+  'heldFinal',
+])
+
+/** The forward-rank of each status: a status may only move to a rank >= its
+ *  own, with the sole legal regression RELEASE (held -> scheduled) handled
+ *  explicitly. Terminal states share the top rank and never change. */
+const RANK: Record<FlightStatus, number> = {
+  scheduled: 0,
+  airborne: 1,
+  held: 1,
+  heldFinal: 2,
+  landed: 2,
+  landedLate: 2,
+  divertedLanded: 2,
+  stranded: 2,
+}
+
+type GenAction =
+  | { readonly kind: 'LAND'; readonly flightId: string; readonly hubId: string }
+  | { readonly kind: 'DIVERT'; readonly flightId: string; readonly hubId: string }
+  | { readonly kind: 'HOLD'; readonly flightId: string }
+  | { readonly kind: 'RELEASE'; readonly flightId: string }
+  | { readonly kind: 'GROUND_ALL' }
+  | { readonly kind: 'PROBE'; readonly corridorId: string }
+
+interface TimedGenAction {
+  readonly action: GenAction
+  /** Delta ms from mission start. Nondecreasing across the sequence. */
+  readonly delta: number
+}
+
+function toCampaignAction(gen: GenAction): CampaignAction {
+  switch (gen.kind) {
+    case 'LAND':
+      return { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId: gen.flightId, hubId: gen.hubId } }
+    case 'DIVERT':
+      return { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId: gen.flightId, hubId: gen.hubId } }
+    case 'HOLD':
+      return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId: gen.flightId } }
+    case 'RELEASE':
+      return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId: gen.flightId } }
+    case 'GROUND_ALL':
+      return { type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }
+    case 'PROBE':
+      return { type: 'MISSION_ACTION', payload: { kind: 'PROBE', corridorId: gen.corridorId } }
+  }
+}
+
+function startMission(ctx: EngineContext, seedName: string): CampaignState {
+  const created = createCampaign(ctx, seedName, { extendedTime: false }, FLIGHTS_T0)
+  return dispatch(
+    ctx,
+    created,
+    { type: 'START_MISSION', missionId: 'flights' },
+    FLIGHTS_T0,
+  ).state
+}
+
+function sub(state: CampaignState): FlightsState | null {
+  return (state.activeMission?.substate as FlightsState | undefined) ?? null
+}
+
+describe.each(SEED_NAMES)('flights rules properties: %s', (seedName) => {
+  const payload = flightsPayloadFor(seedName) as FlightsPayload
+  const flightIds = payload.flights.map((f) => f.id)
+  const hubIds = payload.hubs.map((h) => h.id)
+  const corridorIds = payload.corridors.map((c) => c.id)
+  // Also feed some invalid-shaped ids so validate() rejection (not a crash) is
+  // exercised: a bogus flight id and a bogus hub id.
+  const flightArb = fc.constantFrom(...flightIds, 'ZZ99')
+  const hubArb = fc.constantFrom(...hubIds, 'NOWHERE')
+  const corridorArb = fc.constantFrom(...corridorIds, 'C-NONE')
+
+  const genActionArb: fc.Arbitrary<GenAction> = fc.oneof(
+    fc.tuple(flightArb, hubArb).map(([flightId, hubId]) => ({ kind: 'LAND' as const, flightId, hubId })),
+    fc.tuple(flightArb, hubArb).map(([flightId, hubId]) => ({ kind: 'DIVERT' as const, flightId, hubId })),
+    flightArb.map((flightId) => ({ kind: 'HOLD' as const, flightId })),
+    flightArb.map((flightId) => ({ kind: 'RELEASE' as const, flightId })),
+    fc.constant({ kind: 'GROUND_ALL' as const }),
+    corridorArb.map((corridorId) => ({ kind: 'PROBE' as const, corridorId })),
+  )
+
+  const sequenceArb: fc.Arbitrary<TimedGenAction[]> = fc
+    .array(
+      fc.record({
+        action: genActionArb,
+        gap: fc.integer({ min: 0, max: 20_000 }),
+      }),
+      { minLength: 0, maxLength: 36 },
+    )
+    .map((entries) => {
+      let delta = 0
+      return entries.map(({ action, gap }) => {
+        delta += gap
+        return { action, delta }
+      })
+    })
+
+  it('never negative runway capacity, never credits an unresolved flight, never settles twice, holding invariants hold; invalid actions rejected not crashing', () => {
+    fc.assert(
+      fc.property(sequenceArb, (sequence) => {
+        const ctx = flightsContextForSeed(seedName)
+        let state = startMission(ctx, seedName)
+        let settlementCount = 0
+        // Track the last-seen status per flight to prove forward-only motion and
+        // exactly-once terminal settlement.
+        const lastStatus = new Map<string, FlightStatus>()
+        // Track projection-fold invariants from the init substate.
+        const initSub = sub(state)!
+        const initDivergence = initSub.projectionDivergence
+        let lastAppliedCorrection = initSub.appliedCorrection
+
+        const checkInvariants = (s: FlightsState): void => {
+          // Runway occupancy: never negative, never above the hub's capacity.
+          for (const hub of payload.hubs) {
+            const used = s.runwayUse[hub.id] ?? 0
+            expect(used).toBeGreaterThanOrEqual(0)
+            expect(Number.isInteger(used)).toBe(true)
+            expect(used).toBeLessThanOrEqual(hub.runwaySlots)
+          }
+          // Per-flight: forward-only motion, terminal absorption, no unresolved
+          // credit (a terminal landing always has an inbound hub and arrival).
+          for (const [id, fs] of Object.entries(s.flights)) {
+            const prev = lastStatus.get(id)
+            if (prev !== undefined && prev !== fs.status) {
+              // A terminal status never changes (settles exactly once).
+              expect(TERMINAL.has(prev)).toBe(false)
+              // The only legal regression is RELEASE: held -> scheduled.
+              if (RANK[fs.status] < RANK[prev]) {
+                expect(prev).toBe('held')
+                expect(fs.status).toBe('scheduled')
+              }
+            }
+            // A credited landing is never an unresolved flight: a landed status
+            // carries a real inbound hub and arrival stamp.
+            if (
+              fs.status === 'landed' ||
+              fs.status === 'landedLate' ||
+              fs.status === 'divertedLanded'
+            ) {
+              expect(fs.inboundHubId).not.toBeNull()
+              expect(fs.arrivalAt).not.toBeNull()
+              expect(Number.isInteger(fs.arrivalAt)).toBe(true)
+            }
+            lastStatus.set(id, fs.status)
+          }
+          // Projection-fold invariants: reducers never fold the projection.
+          // projectionDivergence is set once at init and never moves; the
+          // applied-correction counter is monotone non-decreasing (storm-event
+          // driven only, never a player action).
+          expect(s.projectionDivergence).toBe(initDivergence)
+          expect(s.appliedCorrection).toBeGreaterThanOrEqual(lastAppliedCorrection)
+          lastAppliedCorrection = s.appliedCorrection
+          // JSON-safe and round-trips the reference-only save schema.
+          const round = v.parse(flightsSaveSchema, JSON.parse(JSON.stringify(s)))
+          expect(round).toEqual(s)
+        }
+
+        for (const { action, delta } of sequence) {
+          const now = FLIGHTS_T0 + delta
+          const result = dispatch(ctx, state, toCampaignAction(action), now)
+          // Dispatch never throws: an invalid-shaped action is rejected, not a
+          // crash, and leaves the substate intact.
+          settlementCount += result.emitted.filter(
+            (e) => e.type === 'settlement' && e.missionId === 'flights',
+          ).length
+          state = result.state
+          const live = sub(state)
+          if (live) checkInvariants(live)
+        }
+
+        // Advance past the deadline so settlement always fires if it has not.
+        const advanced = advanceCampaign(ctx, state, ENDS_AT + 10_000)
+        settlementCount += advanced.emitted.filter(
+          (e) => e.type === 'settlement' && e.missionId === 'flights',
+        ).length
+        state = advanced.state
+
+        // Settles exactly once over the whole run, regardless of the action tail.
+        expect(settlementCount).toBe(1)
+        expect(
+          state.settled.filter((s) => s.missionId === 'flights'),
+        ).toHaveLength(1)
+        // Conservation at settlement: every soul lands in exactly one bucket.
+        const outcome = state.settled.find((s) => s.missionId === 'flights')!
+        const total = payload.flights.reduce((n, f) => n + f.passengers, 0)
+        const bucketed =
+          outcome.metrics['on_time_passengers']! +
+          outcome.metrics['late_passengers']! +
+          outcome.metrics['diverted_passengers']! +
+          outcome.metrics['stranded_passengers']! +
+          outcome.metrics['held_passengers']!
+        expect(bucketed).toBe(total)
+      }),
+      { numRuns: 200, seed: FC_SEED },
+    )
+  })
+})
