diff --git a/planning/02-terminal-shell/implementation/code_review/section-08-diff.md b/planning/02-terminal-shell/implementation/code_review/section-08-diff.md
new file mode 100644
index 0000000..57d6957
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-08-diff.md
@@ -0,0 +1,1243 @@
+diff --git a/planning/02-terminal-shell/implementation/deep_implement_config.json b/planning/02-terminal-shell/implementation/deep_implement_config.json
+index 40becc9..5792a8e 100644
+--- a/planning/02-terminal-shell/implementation/deep_implement_config.json
++++ b/planning/02-terminal-shell/implementation/deep_implement_config.json
+@@ -42,6 +42,10 @@
+     "section-06-overlays-settings": {
+       "status": "complete",
+       "commit_hash": "ea9f484"
++    },
++    "section-07-audio-engine": {
++      "status": "complete",
++      "commit_hash": "87ab1ed"
+     }
+   },
+   "pre_commit": {
+diff --git a/src/app/cabinet/Countdown.tsx b/src/app/cabinet/Countdown.tsx
+new file mode 100644
+index 0000000..f8c4124
+--- /dev/null
++++ b/src/app/cabinet/Countdown.tsx
+@@ -0,0 +1,59 @@
++// The deadline display. Dot-matrix numerals (styled spans in the Glass TTY
++// font, no images) on wide layouts, swapped for an in-terminal countdown line
++// below the shared breakpoint; exactly one is in the DOM at a time. Remaining
++// time is endsAt minus the section-02 repaint clock, clamped at zero. This
++// never reads Date.now(): the display clock's monotonic performance.now delta
++// on top of the engine's clamped lastNow is the whole defense against a
++// backward wall-clock jump, and routing around it would reopen that hole. The
++// countdown never feeds the announcer; milestone readouts come from engine
++// timerMilestone events, not this display.
++import { useEffect, useReducer } from 'react'
++import { remainingFor, subscribeTick } from '../state'
++import { useNarrowViewport } from '../grid'
++import './cabinet.css'
++
++export interface CountdownProps {
++  /** The active deadline in engine time. */
++  readonly endsAt: number
++}
++
++function format(remainingMs: number): string {
++  const totalSeconds = Math.ceil(remainingMs / 1000)
++  const minutes = Math.floor(totalSeconds / 60)
++  const seconds = totalSeconds % 60
++  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
++}
++
++export function Countdown({ endsAt }: CountdownProps) {
++  const [, repaint] = useReducer((n: number) => n + 1, 0)
++  const narrow = useNarrowViewport()
++
++  // Repaint on each display tick; remaining time is recomputed fresh so it is
++  // never a stale cached snapshot.
++  useEffect(() => subscribeTick(repaint), [])
++
++  const text = format(remainingFor(endsAt))
++
++  if (narrow) {
++    return (
++      <span className="countdown-line" role="timer" data-testid="countdown-line">
++        T MINUS {text}
++      </span>
++    )
++  }
++
++  return (
++    <span
++      className="countdown-dotmatrix"
++      role="timer"
++      data-testid="countdown-dotmatrix"
++      aria-label={`T minus ${text}`}
++    >
++      {text.split('').map((ch, i) => (
++        <span className="countdown-digit" aria-hidden="true" key={i}>
++          {ch}
++        </span>
++      ))}
++    </span>
++  )
++}
+diff --git a/src/app/cabinet/LampBanks.tsx b/src/app/cabinet/LampBanks.tsx
+new file mode 100644
+index 0000000..45cd8d7
+--- /dev/null
++++ b/src/app/cabinet/LampBanks.tsx
+@@ -0,0 +1,54 @@
++// The lamp matrices. Reads a LampController's state through a subscription and
++// renders amber dot banks plus a restrained red alarm cluster. Idle banks
++// breathe (one opacity tween) unless reduced motion is set, in which case they
++// are static. Transition classes animate opacity only, consistent with the CRT
++// stack's no-animated-filters rule. The red alarm is paired with a text label
++// per the status-color rule and lights only when the controller's alarm is on.
++import { useSyncExternalStore } from 'react'
++import { useReducedMotion } from '../a11y/motion'
++import type { LampController, LampBanksState } from './LampController'
++import './cabinet.css'
++
++export function useLampBanks(controller: LampController): LampBanksState {
++  return useSyncExternalStore(
++    controller.subscribe,
++    controller.getState,
++    controller.getState,
++  )
++}
++
++export interface LampBanksProps {
++  readonly controller: LampController
++}
++
++export function LampBanks({ controller }: LampBanksProps) {
++  const state = useLampBanks(controller)
++  const reduced = useReducedMotion()
++  const idleClass = reduced ? 'lamp-bank' : 'lamp-bank lamp-breathe'
++
++  return (
++    <div className="lamp-banks" data-testid="lamp-banks">
++      <div
++        className={idleClass}
++        data-testid="lamp-bank-phase"
++        data-phase={state.phase}
++      />
++      <div
++        className={idleClass}
++        data-testid="lamp-bank-settlement"
++        data-settlement={state.settlement ?? 'none'}
++      />
++      <div
++        className={idleClass}
++        data-testid="lamp-bank-branch"
++        data-active={state.branchComplete ? 'true' : 'false'}
++      />
++      {state.alarm ? (
++        <div className="lamp-alarm" data-testid="lamp-alarm" role="status">
++          <span className="lamp-alarm-dot" aria-hidden="true" />
++          <span className="lamp-alarm-label">DEFCON 1</span>
++        </div>
++      ) : null}
++    </div>
++  )
++}
+diff --git a/src/app/cabinet/LampController.ts b/src/app/cabinet/LampController.ts
+new file mode 100644
+index 0000000..0032c17
+--- /dev/null
++++ b/src/app/cabinet/LampController.ts
+@@ -0,0 +1,79 @@
++// Maps engine events to lamp-bank states. Pure mapping, no timers, no wall
++// clock: the only input is the section-02 emitted relay, which delivers each
++// EngineEvent exactly once in order, so exactly-once bank changes are
++// structural. Every event kind not listed below is ignored and leaves bank
++// state untouched. The red alarm keys exclusively to finaleFinalPhase.
++import { onEngineEvent } from '../state/events'
++import type { CampaignPhase, EngineEvent, OutcomeTier } from '@engine'
++
++export type PhaseLamp = CampaignPhase | 'idle'
++export type SettlementLamp = 'good' | 'bad' | null
++
++export interface LampBanksState {
++  readonly phase: PhaseLamp
++  readonly settlement: SettlementLamp
++  readonly branchComplete: boolean
++  readonly alarm: boolean
++}
++
++export const INITIAL_LAMP_STATE: LampBanksState = {
++  phase: 'idle',
++  settlement: null,
++  branchComplete: false,
++  alarm: false,
++}
++
++// A failed or poor outcome lights the bad lamp; a full or partial one the good
++// lamp. The bad settlement never touches the alarm; only the finale does.
++function settlementLampFor(tier: OutcomeTier): SettlementLamp {
++  return tier === 'failed' || tier === 'poor' ? 'bad' : 'good'
++}
++
++export class LampController {
++  private state: LampBanksState = INITIAL_LAMP_STATE
++  private readonly listeners = new Set<() => void>()
++  private unsubscribe: (() => void) | null = null
++
++  getState = (): LampBanksState => this.state
++
++  subscribe = (listener: () => void): (() => void) => {
++    this.listeners.add(listener)
++    return () => this.listeners.delete(listener)
++  }
++
++  /** Subscribe to the engine relay. Returns a teardown that also disposes. */
++  register(): () => void {
++    this.unsubscribe = onEngineEvent((event) => this.apply(event))
++    return () => this.dispose()
++  }
++
++  dispose(): void {
++    this.unsubscribe?.()
++    this.unsubscribe = null
++  }
++
++  private set(next: LampBanksState): void {
++    this.state = next
++    for (const listener of this.listeners) listener()
++  }
++
++  private apply(event: EngineEvent): void {
++    switch (event.type) {
++      case 'phaseChanged':
++        this.set({ ...this.state, phase: event.to })
++        break
++      case 'settlement':
++        this.set({ ...this.state, settlement: settlementLampFor(event.tier) })
++        break
++      case 'branchRunCompleted':
++        this.set({ ...this.state, branchComplete: true })
++        break
++      case 'finaleFinalPhase':
++        this.set({ ...this.state, alarm: true })
++        break
++      default:
++        // Every other event kind leaves bank state untouched.
++        break
++    }
++  }
++}
+diff --git a/src/app/cabinet/Readouts.tsx b/src/app/cabinet/Readouts.tsx
+new file mode 100644
+index 0000000..d196871
+--- /dev/null
++++ b/src/app/cabinet/Readouts.tsx
+@@ -0,0 +1,44 @@
++// OPEN EXCEPTIONS beside SERVICE OUTCOMES, each labeled so a player watches the
++// two diverge: WOPR's tally of forced-inactivity resolutions against the real
++// damage the same orders produced. The divergence is the game's thesis. The
++// panel is a plain selector-driven render off useCampaign(); Readouts itself is
++// pure presentation so the divergence is trivially testable.
++import { useCampaign } from '../state'
++import { selectOpenExceptions, selectServiceOutcomes } from '@engine'
++import { GlossaryTerm } from '../a11y/GlossaryTerm'
++import './cabinet.css'
++
++export interface ReadoutsProps {
++  readonly openExceptions: number
++  readonly serviceOutcomes: number
++}
++
++export function Readouts({ openExceptions, serviceOutcomes }: ReadoutsProps) {
++  return (
++    <div className="cabinet-readouts" data-testid="cabinet-readouts">
++      <div className="readout" data-testid="readout-open-exceptions">
++        <span className="readout-label">
++          <GlossaryTerm
++            term="OPEN EXCEPTIONS"
++            definition="Cases WOPR counts as resolved because no one acted on them before the deadline. A rising number here is the machine calling inaction a result."
++          />
++        </span>
++        <span className="readout-value">{openExceptions}</span>
++      </div>
++      <div className="readout" data-testid="readout-service-outcomes">
++        <span className="readout-label">SERVICE OUTCOMES</span>
++        <span className="readout-value">{serviceOutcomes}</span>
++      </div>
++    </div>
++  )
++}
++
++export function ReadoutsPanel() {
++  const state = useCampaign()
++  return (
++    <Readouts
++      openExceptions={selectOpenExceptions(state)}
++      serviceOutcomes={selectServiceOutcomes(state)}
++    />
++  )
++}
+diff --git a/src/app/cabinet/cabinet.css b/src/app/cabinet/cabinet.css
+new file mode 100644
+index 0000000..298caab
+--- /dev/null
++++ b/src/app/cabinet/cabinet.css
+@@ -0,0 +1,104 @@
++/* Cabinet chrome: amber lamp banks, the exceptions/outcomes readouts, and the
++   countdown. Every transition animates opacity only, consistent with the CRT
++   stack's no-animated-filters rule. The red alarm is restrained and always
++   paired with a text label per the status-color rule. */
++.lamp-banks {
++  display: flex;
++  gap: 0.75rem;
++  align-items: center;
++}
++
++.lamp-bank {
++  width: 4rem;
++  height: 1.5rem;
++  border-radius: 2px;
++  background:
++    radial-gradient(
++        circle at 6px 6px,
++        var(--color-amber, #ffb84d) 0 2px,
++        transparent 3px
++      )
++      0 0 / 12px 12px;
++  background-color: #2a2b24;
++  opacity: 0.85;
++}
++
++/* One opacity tween; no filters. Removed entirely under reduced motion. */
++.lamp-breathe {
++  animation: lamp-breathe 5s ease-in-out infinite;
++}
++
++@keyframes lamp-breathe {
++  0%,
++  100% {
++    opacity: 0.7;
++  }
++  50% {
++    opacity: 1;
++  }
++}
++
++.lamp-alarm {
++  display: inline-flex;
++  align-items: center;
++  gap: 0.4rem;
++}
++
++.lamp-alarm-dot {
++  width: 0.75rem;
++  height: 0.75rem;
++  border-radius: 50%;
++  background: var(--color-red, #ff5c5c);
++}
++
++.lamp-alarm-label {
++  color: var(--color-red, #ff5c5c);
++  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
++  letter-spacing: 0.1em;
++}
++
++.cabinet-readouts {
++  display: flex;
++  gap: 2rem;
++  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
++}
++
++.readout {
++  display: flex;
++  flex-direction: column;
++  gap: 0.25rem;
++}
++
++.readout-label {
++  color: var(--color-dim, #7fb0e0);
++  font-size: 0.8em;
++  letter-spacing: 0.08em;
++}
++
++.readout-value {
++  color: var(--color-glyph, #6cb6ff);
++  font-size: 1.6em;
++}
++
++.countdown-dotmatrix {
++  display: inline-flex;
++  gap: 0.15em;
++  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
++  color: var(--color-amber, #ffb84d);
++  font-size: 2.2em;
++  text-shadow: 0 0 6px var(--color-amber, #ffb84d);
++}
++
++.crt-reduce-glow .countdown-dotmatrix {
++  text-shadow: 0 0 1px var(--color-amber, #ffb84d);
++}
++
++.countdown-digit {
++  width: 1ch;
++  text-align: center;
++}
++
++.countdown-line {
++  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
++  color: var(--color-amber, #ffb84d);
++}
+diff --git a/src/app/cabinet/index.ts b/src/app/cabinet/index.ts
+new file mode 100644
+index 0000000..0fc2e85
+--- /dev/null
++++ b/src/app/cabinet/index.ts
+@@ -0,0 +1,16 @@
++// The cabinet package surface: lamp banks behind a controller, the exceptions
++// and outcomes readouts, and the countdown chrome.
++export {
++  LampController,
++  INITIAL_LAMP_STATE,
++  type LampBanksState,
++  type PhaseLamp,
++  type SettlementLamp,
++} from './LampController'
++export { LampBanks, useLampBanks, type LampBanksProps } from './LampBanks'
++export {
++  Readouts,
++  ReadoutsPanel,
++  type ReadoutsProps,
++} from './Readouts'
++export { Countdown, type CountdownProps } from './Countdown'
+diff --git a/src/app/grid/CharacterGrid.tsx b/src/app/grid/CharacterGrid.tsx
+new file mode 100644
+index 0000000..0400c4c
+--- /dev/null
++++ b/src/app/grid/CharacterGrid.tsx
+@@ -0,0 +1,128 @@
++// A fixed-width character grid rendered as DOM text rows, not canvas. Pure
++// function of props: identical props produce identical markup and nothing
++// scrolls or animates in the base state. Glow is a single container-level
++// class; cells never carry a shadow layer of their own. The only thing that
++// may transition is the selection highlight, and only when motion is allowed.
++import type { ReactNode } from 'react'
++import { useReducedMotion } from '../a11y/motion'
++import { shouldHandleKey } from '../a11y/keyHandler'
++import { useNarrowViewport } from './useNarrow'
++import './grid.css'
++
++export interface GridCell {
++  readonly char: string
++  /** One per-cell class hook; the theme token it names carries at most one
++   *  shadow layer so the grid never stacks glows. */
++  readonly classHook?: string
++}
++
++export interface GridSelection {
++  readonly row: number
++  readonly col: number
++}
++
++export interface CharacterGridProps {
++  readonly cells: readonly (readonly GridCell[])[]
++  readonly legend?: ReactNode
++  readonly selection?: GridSelection | null
++  readonly onSelect?: (row: number, col: number) => void
++  /** Force compact pitch; otherwise it follows the narrow breakpoint. */
++  readonly compact?: boolean
++}
++
++const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
++  ArrowUp: [-1, 0],
++  ArrowDown: [1, 0],
++  ArrowLeft: [0, -1],
++  ArrowRight: [0, 1],
++}
++
++function clamp(value: number, max: number): number {
++  if (value < 0) return 0
++  if (value > max) return max
++  return value
++}
++
++export function CharacterGrid({
++  cells,
++  legend,
++  selection = null,
++  onSelect,
++  compact,
++}: CharacterGridProps) {
++  const reduced = useReducedMotion()
++  const narrow = useNarrowViewport()
++  const isCompact = compact === true || narrow
++
++  const rows = cells.length
++  const cols = cells[0]?.length ?? 0
++
++  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
++    const delta = ARROWS[event.key]
++    if (!delta || !shouldHandleKey(event)) return
++    if (!onSelect || rows === 0 || cols === 0) return
++    event.preventDefault()
++    const base = selection ?? { row: 0, col: 0 }
++    const nextRow = clamp(base.row + delta[0], rows - 1)
++    const nextCol = clamp(base.col + delta[1], cols - 1)
++    onSelect(nextRow, nextCol)
++  }
++
++  const containerClass = [
++    'char-grid',
++    'char-grid-glow',
++    isCompact ? 'char-grid-compact' : '',
++  ]
++    .filter(Boolean)
++    .join(' ')
++
++  return (
++    <div className="char-grid-wrap" data-testid="character-grid">
++      <div
++        className={containerClass}
++        role="grid"
++        tabIndex={0}
++        data-compact={isCompact ? 'true' : undefined}
++        onKeyDown={onKeyDown}
++      >
++        {cells.map((row, r) => (
++          <div className="char-row" role="row" key={r}>
++            {row.map((cell, c) => {
++              const selected =
++                selection?.row === r && selection?.col === c
++              const cellClass = [
++                'char-cell',
++                cell.classHook ?? '',
++                narrow ? 'char-cell-tap' : '',
++                selected ? 'char-cell-selected' : '',
++                selected && !reduced ? 'char-cell-anim' : '',
++              ]
++                .filter(Boolean)
++                .join(' ')
++              return (
++                <span
++                  key={c}
++                  className={cellClass}
++                  role="gridcell"
++                  aria-selected={selected || undefined}
++                  data-row={r}
++                  data-col={c}
++                  onPointerDown={
++                    onSelect ? () => onSelect(r, c) : undefined
++                  }
++                >
++                  {cell.char}
++                </span>
++              )
++            })}
++          </div>
++        ))}
++      </div>
++      {legend ? (
++        <div className="char-grid-legend" data-testid="grid-legend">
++          {legend}
++        </div>
++      ) : null}
++    </div>
++  )
++}
+diff --git a/src/app/grid/constants.ts b/src/app/grid/constants.ts
+new file mode 100644
+index 0000000..a75bca5
+--- /dev/null
++++ b/src/app/grid/constants.ts
+@@ -0,0 +1,4 @@
++// The one width breakpoint shared by the grid's compact mode and the cabinet
++// countdown chrome. Below it the grid tightens pitch and widens tap targets,
++// and the countdown swaps dot-matrix numerals for an in-terminal line.
++export const COMPACT_BREAKPOINT_PX = 640
+diff --git a/src/app/grid/grid.css b/src/app/grid/grid.css
+new file mode 100644
+index 0000000..729d176
+--- /dev/null
++++ b/src/app/grid/grid.css
+@@ -0,0 +1,69 @@
++/* The character grid. Glow lives at the container level only (one layer); no
++   cell carries a shadow of its own. The selection highlight is the only thing
++   that transitions, and only when the motion-allowed class is present. No
++   filters, no per-cell animation, so a finale-scale grid stays cheap. */
++.char-grid-wrap {
++  display: inline-flex;
++  flex-direction: column;
++  gap: 0.5rem;
++}
++
++.char-grid {
++  display: inline-flex;
++  flex-direction: column;
++  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
++  color: var(--color-glyph, #6cb6ff);
++  background: var(--color-glass, #050a14);
++  line-height: 1.1;
++  outline: none;
++}
++
++/* The single container-level glow layer. */
++.char-grid-glow {
++  text-shadow: 0 0 6px var(--color-glyph, #6cb6ff);
++}
++
++.crt-reduce-glow .char-grid-glow {
++  text-shadow: 0 0 1px var(--color-glyph, #6cb6ff);
++}
++
++.char-grid-compact {
++  letter-spacing: -0.02em;
++  line-height: 1;
++}
++
++.char-row {
++  display: flex;
++}
++
++.char-cell {
++  display: inline-block;
++  min-width: 1ch;
++  text-align: center;
++  /* No shadow here: the glow is the container's job. */
++}
++
++/* Narrow screens widen the effective tap target to ~44px via padding. */
++.char-cell-tap {
++  padding: 0.75rem 0.5rem;
++  min-width: 44px;
++  min-height: 44px;
++}
++
++.char-cell-selected {
++  color: var(--color-glass, #050a14);
++  background: var(--color-focus, #9fd8ff);
++}
++
++/* Transition only when motion is allowed. Opacity and color only, no filters. */
++.char-cell-anim {
++  transition:
++    background-color 120ms ease,
++    color 120ms ease;
++}
++
++.char-grid-legend {
++  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
++  color: var(--color-dim, #7fb0e0);
++  font-size: 0.85em;
++}
+diff --git a/src/app/grid/index.ts b/src/app/grid/index.ts
+new file mode 100644
+index 0000000..5f1fba9
+--- /dev/null
++++ b/src/app/grid/index.ts
+@@ -0,0 +1,14 @@
++// The grid package surface: the character grid, the branch-trace playback, the
++// shared compact breakpoint, and the narrow-viewport hook the cabinet reuses.
++export {
++  CharacterGrid,
++  type CharacterGridProps,
++  type GridCell,
++  type GridSelection,
++} from './CharacterGrid'
++export {
++  PlayBranchTrace,
++  type PlayBranchTraceProps,
++} from './playBranchTrace'
++export { COMPACT_BREAKPOINT_PX } from './constants'
++export { useNarrowViewport } from './useNarrow'
+diff --git a/src/app/grid/playBranchTrace.tsx b/src/app/grid/playBranchTrace.tsx
+new file mode 100644
+index 0000000..63a7234
+--- /dev/null
++++ b/src/app/grid/playBranchTrace.tsx
+@@ -0,0 +1,92 @@
++// Branch-trace playback. Renders BranchStep entries sequentially at a
++// watchable pace with one timer and no animation library. Under reduced motion
++// playback is instant (all steps present at once); a SKIP control jumps to the
++// final state; every step's results stay readable after a skip. An empty array
++// renders a stable terminal state without throwing. Split 06 authors the real
++// step content; split 01 owns the BranchStep type.
++import { useEffect, useRef, useState } from 'react'
++import type { BranchStep } from '@engine'
++import { useReducedMotion } from '../a11y/motion'
++import './grid.css'
++
++export interface PlayBranchTraceProps {
++  readonly steps: readonly BranchStep[]
++  /** Milliseconds between revealed steps (one timer, not an animation lib). */
++  readonly stepMs?: number
++  readonly onDone?: () => void
++}
++
++const DEFAULT_STEP_MS = 400
++
++export function PlayBranchTrace({
++  steps,
++  stepMs = DEFAULT_STEP_MS,
++  onDone,
++}: PlayBranchTraceProps) {
++  const reduced = useReducedMotion()
++  const [revealed, setRevealed] = useState(() =>
++    reduced || steps.length <= 1 ? steps.length : 1,
++  )
++  const doneFired = useRef(false)
++
++  useEffect(() => {
++    if (reduced || steps.length <= 1) {
++      setRevealed(steps.length)
++      return
++    }
++    setRevealed(1)
++    let count = 1
++    let timer: ReturnType<typeof setTimeout>
++    const tick = (): void => {
++      count += 1
++      setRevealed(count)
++      if (count < steps.length) timer = setTimeout(tick, stepMs)
++    }
++    timer = setTimeout(tick, stepMs)
++    return () => clearTimeout(timer)
++  }, [steps, reduced, stepMs])
++
++  useEffect(() => {
++    if (revealed >= steps.length && !doneFired.current) {
++      doneFired.current = true
++      onDone?.()
++    }
++  }, [revealed, steps.length, onDone])
++
++  const skip = (): void => setRevealed(steps.length)
++  const complete = revealed >= steps.length
++
++  return (
++    <div className="branch-trace" data-testid="branch-trace">
++      {steps.length === 0 ? (
++        <p className="branch-trace-empty" data-testid="branch-trace-empty">
++          NO BRANCH DATA
++        </p>
++      ) : (
++        <ol className="branch-trace-steps">
++          {steps.slice(0, revealed).map((s) => (
++            <li
++              className="branch-trace-step"
++              data-testid="branch-step"
++              data-step={s.step}
++              key={s.step}
++            >
++              <span className="branch-step-label">{s.label}</span>
++              <span className="branch-step-detail">{s.detail}</span>
++            </li>
++          ))}
++        </ol>
++      )}
++      {!complete ? (
++        <button
++          type="button"
++          className="branch-trace-skip"
++          data-testid="branch-skip"
++          onClick={skip}
++        >
++          SKIP
++        </button>
++      ) : null}
++    </div>
++  )
++}
+diff --git a/src/app/grid/useNarrow.ts b/src/app/grid/useNarrow.ts
+new file mode 100644
+index 0000000..029037b
+--- /dev/null
++++ b/src/app/grid/useNarrow.ts
+@@ -0,0 +1,34 @@
++// A narrow-viewport hook driven by the shared breakpoint. jsdom provides a
++// matchMedia stub in tests (mocked per case); outside a browser it reports
++// not-narrow so server-free renders never throw.
++import { useSyncExternalStore } from 'react'
++import { COMPACT_BREAKPOINT_PX } from './constants'
++
++const QUERY = `(max-width: ${COMPACT_BREAKPOINT_PX}px)`
++
++function mql(): MediaQueryList | null {
++  if (typeof window === 'undefined' || !window.matchMedia) return null
++  return window.matchMedia(QUERY)
++}
++
++function isNarrow(): boolean {
++  return mql()?.matches ?? false
++}
++
++export function useNarrowViewport(): boolean {
++  return useSyncExternalStore(
++    (listener) => {
++      const m = mql()
++      if (!m) return () => {}
++      // Older Safari exposes addListener rather than addEventListener.
++      if (m.addEventListener) {
++        m.addEventListener('change', listener)
++        return () => m.removeEventListener('change', listener)
++      }
++      m.addListener(listener)
++      return () => m.removeListener(listener)
++    },
++    isNarrow,
++    () => false,
++  )
++}
+diff --git a/test/app/cabinet/countdown.test.tsx b/test/app/cabinet/countdown.test.tsx
+new file mode 100644
+index 0000000..20a40f9
+--- /dev/null
++++ b/test/app/cabinet/countdown.test.tsx
+@@ -0,0 +1,103 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { act, cleanup, render, screen } from '@testing-library/react'
++import { Countdown } from '@app/cabinet'
++import { captureClock, tickOnce, __resetClock } from '@app/state/displayClock'
++import { onAnnounce, __resetAnnounce } from '@app/a11y/announce'
++
++function mockMedia(narrow: boolean): void {
++  window.matchMedia = vi.fn((q: string) => ({
++    matches: q.includes('max-width') ? narrow : false,
++    media: q,
++    onchange: null,
++    addEventListener: () => {},
++    removeEventListener: () => {},
++    addListener: () => {},
++    removeListener: () => {},
++    dispatchEvent: () => false,
++  })) as unknown as typeof window.matchMedia
++}
++
++beforeEach(() => {
++  __resetClock()
++  __resetAnnounce()
++  mockMedia(false)
++})
++afterEach(() => {
++  cleanup()
++  __resetClock()
++  __resetAnnounce()
++  vi.restoreAllMocks()
++})
++
++describe('Countdown', () => {
++  it('carries role="timer"', () => {
++    captureClock(0)
++    render(<Countdown endsAt={60_000} />)
++    expect(screen.getByRole('timer')).toBeInTheDocument()
++  })
++
++  it('renders dot-matrix numerals on wide layouts, the line below the breakpoint', () => {
++    captureClock(0)
++    const { unmount } = render(<Countdown endsAt={60_000} />)
++    expect(screen.getByTestId('countdown-dotmatrix')).toBeInTheDocument()
++    expect(screen.queryByTestId('countdown-line')).toBeNull()
++    unmount()
++
++    mockMedia(true)
++    render(<Countdown endsAt={60_000} />)
++    expect(screen.getByTestId('countdown-line')).toBeInTheDocument()
++    expect(screen.queryByTestId('countdown-dotmatrix')).toBeNull()
++  })
++
++  it('a deadline already passed displays zero, never a negative', () => {
++    // Captured engine time is past the deadline.
++    captureClock(70_000)
++    render(<Countdown endsAt={60_000} />)
++    expect(screen.getByTestId('countdown-dotmatrix')).toHaveTextContent('00:00')
++  })
++
++  it('never increases on a backward wall-clock jump (it never reads Date.now)', () => {
++    let t = 1000
++    vi.spyOn(performance, 'now').mockImplementation(() => t)
++    // The display reads only the engine's captured lastNow plus a monotonic
++    // performance delta; Date.now going backward must not reach it.
++    vi.spyOn(Date, 'now').mockReturnValue(500)
++    captureClock(0)
++    render(<Countdown endsAt={60_000} />)
++    const readings: string[] = []
++    const read = (): void => {
++      readings.push(
++        screen.getByTestId('countdown-dotmatrix').textContent ?? '',
++      )
++    }
++    read()
++    for (const next of [2000, 3000, 4000]) {
++      t = next
++      // Simulate a backward system clock between repaints.
++      vi.spyOn(Date, 'now').mockReturnValue(100)
++      act(() => {
++        tickOnce(() => {})
++      })
++      read()
++    }
++    const asSeconds = readings.map((r) => {
++      const [m, s] = r.split(':').map(Number)
++      return m! * 60 + s!
++    })
++    for (let i = 1; i < asSeconds.length; i++) {
++      expect(asSeconds[i]!).toBeLessThanOrEqual(asSeconds[i - 1]!)
++    }
++  })
++
++  it('produces no announcements from the ticker path', () => {
++    const sink = vi.fn()
++    onAnnounce(sink)
++    captureClock(0)
++    render(<Countdown endsAt={60_000} />)
++    act(() => {
++      tickOnce(() => {})
++      tickOnce(() => {})
++    })
++    expect(sink).not.toHaveBeenCalled()
++  })
++})
+diff --git a/test/app/cabinet/lampController.test.ts b/test/app/cabinet/lampController.test.ts
+new file mode 100644
+index 0000000..49450a9
+--- /dev/null
++++ b/test/app/cabinet/lampController.test.ts
+@@ -0,0 +1,76 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { LampController, INITIAL_LAMP_STATE } from '@app/cabinet'
++import { relayEvents, __resetConsumers } from '@app/state/events'
++import type { EngineEvent } from '@engine'
++
++let controller: LampController
++let teardown: () => void
++
++beforeEach(() => {
++  __resetConsumers()
++  controller = new LampController()
++  teardown = controller.register()
++})
++afterEach(() => {
++  teardown()
++  __resetConsumers()
++})
++
++const settlement = (tier: 'full' | 'failed'): EngineEvent => ({
++  type: 'settlement',
++  missionId: 'alpha',
++  cause: tier === 'failed' ? 'timeout' : 'completed',
++  tier,
++})
++
++describe('LampController mapping', () => {
++  it('phaseChanged moves the phase bank', () => {
++    relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
++    expect(controller.getState().phase).toBe('mission')
++  })
++
++  it('settlement lights the good or bad settlement lamp by tier', () => {
++    relayEvents([settlement('full')])
++    expect(controller.getState().settlement).toBe('good')
++    relayEvents([settlement('failed')])
++    expect(controller.getState().settlement).toBe('bad')
++  })
++
++  it('branchRunCompleted lights the branch bank', () => {
++    relayEvents([{ type: 'branchRunCompleted', branch: 'staged' }])
++    expect(controller.getState().branchComplete).toBe(true)
++  })
++
++  it('finaleFinalPhase raises the alarm', () => {
++    relayEvents([{ type: 'finaleFinalPhase' }])
++    expect(controller.getState().alarm).toBe(true)
++  })
++
++  it('no event leaves bank state untouched', () => {
++    expect(controller.getState()).toEqual(INITIAL_LAMP_STATE)
++    // An ignored event kind changes nothing.
++    relayEvents([{ type: 'clueFound', clueId: 'x' }])
++    expect(controller.getState()).toEqual(INITIAL_LAMP_STATE)
++  })
++
++  it('the red alarm activates only on finaleFinalPhase, not on a failed settlement', () => {
++    relayEvents([settlement('failed')])
++    expect(controller.getState().alarm).toBe(false)
++    relayEvents([
++      { type: 'phaseChanged', from: 'mission', to: 'debrief' },
++      { type: 'branchRunCompleted', branch: 'staged' },
++    ])
++    expect(controller.getState().alarm).toBe(false)
++  })
++
++  it('changes once per relevant event in an ordered batch (consequenceApplied is ignored)', () => {
++    const changes = vi.fn()
++    controller.subscribe(changes)
++    relayEvents([
++      settlement('full'),
++      { type: 'consequenceApplied', consequenceId: 'c1', targetMissionId: 'beta' },
++    ])
++    expect(changes).toHaveBeenCalledTimes(1)
++    expect(controller.getState().settlement).toBe('good')
++  })
++})
+diff --git a/test/app/cabinet/readouts.test.tsx b/test/app/cabinet/readouts.test.tsx
+new file mode 100644
+index 0000000..093dd4a
+--- /dev/null
++++ b/test/app/cabinet/readouts.test.tsx
+@@ -0,0 +1,52 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { act, cleanup, render, screen } from '@testing-library/react'
++import { Readouts, ReadoutsPanel } from '@app/cabinet'
++import { init, send, getState } from '@app/state'
++import { buildCtx, memoryPort, resetAll } from '../state/harness'
++
++describe('Readouts (pure)', () => {
++  afterEach(cleanup)
++
++  it('renders both labeled values so the divergence reads', () => {
++    render(<Readouts openExceptions={9} serviceOutcomes={30} />)
++    expect(screen.getByTestId('readout-open-exceptions')).toHaveTextContent('9')
++    expect(screen.getByTestId('readout-service-outcomes')).toHaveTextContent('30')
++    // OPEN EXCEPTIONS is a glossary term.
++    expect(screen.getByTestId('glossary-term')).toHaveTextContent(
++      'OPEN EXCEPTIONS',
++    )
++  })
++})
++
++describe('ReadoutsPanel (real engine, selectors diverge)', () => {
++  let teardown: () => void
++  beforeEach(() => {
++    resetAll()
++    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
++    teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
++  })
++  afterEach(() => {
++    teardown()
++    vi.restoreAllMocks()
++    cleanup()
++  })
++
++  it('shows forced-inactivity resolutions diverging from real service cost', () => {
++    act(() => {
++      send({ type: 'START_MISSION', missionId: 'alpha' })
++    })
++    const endsAt = getState().activeMission!.endsAt
++    // Let the deadline pass with no delivery: alpha settles by timeout, so WOPR
++    // counts the forced-inactivity resolution while real service cost climbs.
++    vi.spyOn(Date, 'now').mockReturnValue(endsAt + 60_000)
++    act(() => {
++      send({ type: 'START_MISSION', missionId: 'beta' }) // rejected; pre-advance settles alpha
++    })
++    render(<ReadoutsPanel />)
++    const open = screen.getByTestId('readout-open-exceptions')
++    const service = screen.getByTestId('readout-service-outcomes')
++    // Baseline 12 minus 3 resolved = 9; service cost 3 * 10 = 30. They diverge.
++    expect(open).toHaveTextContent('9')
++    expect(service).toHaveTextContent('30')
++  })
++})
+diff --git a/test/app/grid/characterGrid.test.tsx b/test/app/grid/characterGrid.test.tsx
+new file mode 100644
+index 0000000..18b8a8b
+--- /dev/null
++++ b/test/app/grid/characterGrid.test.tsx
+@@ -0,0 +1,139 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { cleanup, fireEvent, render, screen } from '@testing-library/react'
++import { CharacterGrid, type GridCell } from '@app/grid'
++import { setMotionOverride, __resetMotion } from '@app/a11y/motion'
++
++function mockMedia({ narrow = false, reduce = false } = {}): void {
++  window.matchMedia = vi.fn((q: string) => ({
++    matches: q.includes('max-width')
++      ? narrow
++      : q.includes('reduced-motion')
++        ? reduce
++        : false,
++    media: q,
++    onchange: null,
++    addEventListener: () => {},
++    removeEventListener: () => {},
++    addListener: () => {},
++    removeListener: () => {},
++    dispatchEvent: () => false,
++  })) as unknown as typeof window.matchMedia
++}
++
++function grid(chars: string[][], hooks: Record<string, string> = {}): GridCell[][] {
++  return chars.map((row, r) =>
++    row.map((char, c) => {
++      const hook = hooks[`${r},${c}`]
++      return hook ? { char, classHook: hook } : { char }
++    }),
++  )
++}
++
++beforeEach(() => {
++  __resetMotion()
++  mockMedia()
++})
++afterEach(() => {
++  cleanup()
++  __resetMotion()
++  vi.restoreAllMocks()
++})
++
++describe('CharacterGrid', () => {
++  it('is a pure function of props: identical props, identical markup', () => {
++    const cells = grid([
++      ['A', 'B'],
++      ['C', 'D'],
++    ])
++    const first = render(<CharacterGrid cells={cells} />)
++    const htmlA = first.container.innerHTML
++    first.unmount()
++    const second = render(<CharacterGrid cells={cells} />)
++    expect(second.container.innerHTML).toBe(htmlA)
++  })
++
++  it('arrow keys move the selection and fire the callback with the coordinate', () => {
++    const onSelect = vi.fn()
++    const cells = grid([
++      ['A', 'B', 'C'],
++      ['D', 'E', 'F'],
++    ])
++    render(
++      <CharacterGrid
++        cells={cells}
++        selection={{ row: 0, col: 1 }}
++        onSelect={onSelect}
++      />,
++    )
++    const g = screen.getByRole('grid')
++    fireEvent.keyDown(g, { key: 'ArrowRight' })
++    expect(onSelect).toHaveBeenLastCalledWith(0, 2)
++    fireEvent.keyDown(g, { key: 'ArrowDown' })
++    expect(onSelect).toHaveBeenLastCalledWith(1, 1)
++  })
++
++  it('does not move selection past the edges', () => {
++    const onSelect = vi.fn()
++    render(
++      <CharacterGrid
++        cells={grid([['A', 'B']])}
++        selection={{ row: 0, col: 0 }}
++        onSelect={onSelect}
++      />,
++    )
++    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowUp' })
++    expect(onSelect).toHaveBeenLastCalledWith(0, 0)
++  })
++
++  it('tapping a cell selects it', () => {
++    const onSelect = vi.fn()
++    render(<CharacterGrid cells={grid([['A', 'B']])} onSelect={onSelect} />)
++    const cells = screen.getAllByRole('gridcell')
++    fireEvent.pointerDown(cells[1]!)
++    expect(onSelect).toHaveBeenCalledWith(0, 1)
++  })
++
++  it('reaches a 44px tap target via padding on narrow screens', () => {
++    mockMedia({ narrow: true })
++    render(<CharacterGrid cells={grid([['A']])} />)
++    expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-tap')
++  })
++
++  it('applies the compact class under the width breakpoint', () => {
++    mockMedia({ narrow: true })
++    render(<CharacterGrid cells={grid([['A']])} />)
++    expect(screen.getByRole('grid')).toHaveClass('char-grid-compact')
++    expect(screen.getByRole('grid')).toHaveAttribute('data-compact', 'true')
++  })
++
++  it('renders a per-cell class hook on its element', () => {
++    render(<CharacterGrid cells={grid([['A', 'B']], { '0,1': 'danger' })} />)
++    expect(screen.getAllByRole('gridcell')[1]).toHaveClass('danger')
++  })
++
++  it('applies glow only at the container; no cell carries a shadow class', () => {
++    render(<CharacterGrid cells={grid([['A', 'B']])} />)
++    expect(screen.getByRole('grid')).toHaveClass('char-grid-glow')
++    for (const cell of screen.getAllByRole('gridcell')) {
++      expect(cell).not.toHaveClass('char-grid-glow')
++    }
++  })
++
++  it('renders the legend slot when provided', () => {
++    render(
++      <CharacterGrid cells={grid([['A']])} legend={<span>KEY: A=alpha</span>} />,
++    )
++    expect(screen.getByTestId('grid-legend')).toHaveTextContent('KEY: A=alpha')
++  })
++
++  it('selection highlight transitions only when motion is allowed', () => {
++    const cells = grid([['A', 'B']])
++    const { rerender } = render(
++      <CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />,
++    )
++    expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-anim')
++    setMotionOverride('reduce')
++    rerender(<CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />)
++    expect(screen.getAllByRole('gridcell')[0]).not.toHaveClass('char-cell-anim')
++  })
++})
+diff --git a/test/app/grid/playBranchTrace.test.tsx b/test/app/grid/playBranchTrace.test.tsx
+new file mode 100644
+index 0000000..d1464ec
+--- /dev/null
++++ b/test/app/grid/playBranchTrace.test.tsx
+@@ -0,0 +1,59 @@
++import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
++import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
++import { PlayBranchTrace } from '@app/grid'
++import { setMotionOverride, __resetMotion } from '@app/a11y/motion'
++import type { BranchStep } from '@engine'
++
++const STEPS: BranchStep[] = [
++  { step: 1, label: 'SPOOL', detail: 'routes loaded' },
++  { step: 2, label: 'SOLVE', detail: 'no win found' },
++  { step: 3, label: 'HALT', detail: 'the only move is not to play' },
++]
++
++beforeEach(() => {
++  __resetMotion()
++})
++afterEach(() => {
++  cleanup()
++  __resetMotion()
++  vi.useRealTimers()
++})
++
++describe('PlayBranchTrace', () => {
++  it('reveals steps sequentially at a watchable pace', () => {
++    vi.useFakeTimers()
++    render(<PlayBranchTrace steps={STEPS} stepMs={400} />)
++    expect(screen.getAllByTestId('branch-step')).toHaveLength(1)
++    act(() => {
++      vi.advanceTimersByTime(400)
++    })
++    expect(screen.getAllByTestId('branch-step')).toHaveLength(2)
++    act(() => {
++      vi.advanceTimersByTime(400)
++    })
++    expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
++  })
++
++  it('skip jumps to the final state with every result readable', () => {
++    vi.useFakeTimers()
++    render(<PlayBranchTrace steps={STEPS} stepMs={400} />)
++    fireEvent.click(screen.getByTestId('branch-skip'))
++    const rendered = screen.getAllByTestId('branch-step')
++    expect(rendered).toHaveLength(3)
++    expect(screen.getByText('the only move is not to play')).toBeInTheDocument()
++    expect(screen.queryByTestId('branch-skip')).toBeNull()
++  })
++
++  it('under reduced motion every step is present at once', () => {
++    setMotionOverride('reduce')
++    render(<PlayBranchTrace steps={STEPS} />)
++    expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
++    expect(screen.queryByTestId('branch-skip')).toBeNull()
++  })
++
++  it('an empty steps array renders a stable terminal state without throwing', () => {
++    expect(() => render(<PlayBranchTrace steps={[]} />)).not.toThrow()
++    expect(screen.getByTestId('branch-trace-empty')).toBeInTheDocument()
++    expect(screen.queryByTestId('branch-skip')).toBeNull()
++  })
++})
diff --git a/planning/02-terminal-shell/implementation/code_review/section-08-interview.md b/planning/02-terminal-shell/implementation/code_review/section-08-interview.md
new file mode 100644
index 0000000..aef793b
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-08-interview.md
@@ -0,0 +1,26 @@
+# Section 08 review triage and fixes
+
+Standing directive: full autonomy, no questions. Constraints and determinism passed clean; fixed the real lifecycle/integration defects, documented the let-gos.
+
+## Auto-fixed
+
+- **H1 + H2 (PlayBranchTrace rewind + stale done-latch).** The reveal effect now keys on a content signature (`steps.map(s => s.step).join('|')`) instead of the array reference, so an inline-array prop no longer rewinds an in-flight trace. `doneFired` resets at the top of that effect, so a new sequence re-arms onDone. Added two tests: a fresh array of identical content does not rewind, and onDone fires once per completed sequence (twice across two sequences).
+
+- **M1 (LampController double-subscribe leak).** `register()` now calls `dispose()` before resubscribing, so a double register (React 18 StrictMode double-invoke or re-mount) never leaves two live subscriptions. Test added: registering twice then relaying an event notifies once.
+
+- **M2 (no stable-instance pattern).** Added `useLampController()` (useRef one instance, register in an effect with cleanup) and exported it, so callers never do `new LampController()` in a render body. Test added: the controller survives a parent re-render and keeps lamp state.
+
+- **M3 (grid keyboard a11y).** Each cell now carries a deterministic `id` and the grid sets `aria-activedescendant` to the selected cell, so an AT user has an active descendant to follow. The id base is a prop (default `wg-grid`) rather than `useId`, because `useId` increments across renders and would break the provable-purity guarantee (identical props => identical markup); a prop-derived base keeps the render pure. Tests added for activedescendant present/absent.
+
+- **M5 (ReadoutsPanel reactivity, not a defect but worth proving).** Added a test that settles a mission after mount and asserts the panel updates live (12 -> 9 open, 0 -> 30 service) via the useCampaign store subscription.
+
+## Let go (with rationale, documented in code)
+
+- **M4.** Countdown trusts captureClock() ran before mount; real boot wakes via init(). Added a precondition comment; the zero clamp keeps it safe before any capture.
+- **L1.** Tap padding tracks a physically narrow (touch) viewport, not the `compact` pitch override. Intentional; commented.
+- **L2.** Alarm uses role=status (polite) not role=alert. The plan asked for restraint; defensible.
+- **L3.** Countdown role=timer is not a live region, by design: the plan forbids countdown announcements.
+- **L4.** useNarrow server/client snapshot mismatch is an SSR hazard only; this is a static no-SSR app.
+
+## Verification
+- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npm test`: 433 passed / 67 files (was 425 / 66). New tests: grid activedescendant (2), branch-trace stability + onDone re-fire (2), lamp double-register (1), useLampController stability + alarm (2), readouts reactivity (1), minus consolidation.
diff --git a/planning/02-terminal-shell/implementation/code_review/section-08-review.md b/planning/02-terminal-shell/implementation/code_review/section-08-review.md
new file mode 100644
index 0000000..33f342d
--- /dev/null
+++ b/planning/02-terminal-shell/implementation/code_review/section-08-review.md
@@ -0,0 +1,23 @@
+# Cabinet + Grid (section-08) review
+
+Reviewer: deep-implement:code-reviewer. Hard constraints (no Date.now, opacity-only transitions, container-only glow, alarm-only-via-finaleFinalPhase, pure render) are all honored and the backward-wall-clock defense is sound. Defects are in lifecycle/integration contracts the section deferred to callers without guarding.
+
+## HIGH
+- **H1. PlayBranchTrace rewinds on unstable `steps` props.** The reveal effect depends on the `steps` array reference; a caller passing an inline array (`steps={[...]}`) gives a new identity every parent render, so the effect re-fires and resets playback to step 1 mid-trace.
+- **H2. `doneFired` never resets for a new sequence.** The latch stays true forever, so onDone never fires for a second/replayed branch.
+
+## MEDIUM
+- **M1. LampController.register() leaks on double-subscribe.** It overwrites `this.unsubscribe` without disposing the prior subscription; React 18 StrictMode double-invoke (or re-mount without teardown) double-applies every event.
+- **M2. No stable-instance pattern for LampController.** The one component that consumes it ships no useRef/useMemo guidance; a caller doing `new LampController()` in render body thrashes subscriptions and resets lamp state every render.
+- **M3. Grid keyboard a11y has no aria-activedescendant.** Selection moves visually and sets aria-selected on a cell that never receives focus; an AT user has nothing to follow.
+- **M4 (doc).** Countdown trusts captureClock() was called before mount (set by send/wake); the precondition is unasserted. Real integration calls it at boot. Documented, not code-fixed.
+- **M5 (no defect here).** ReadoutsPanel reactivity depends on section-02's store (useCampaign is a useSyncExternalStore); added a reactivity test for confidence.
+
+## LOW
+- **L1.** CharacterGrid tap class keys off `narrow` not `isCompact`, so forcing `compact` prop gives compact pitch without the 44px tap padding. Intentional: tap targets track physical narrow screens, compact is a pitch override. Kept, documented.
+- **L2.** Alarm uses role=status (polite) vs role=alert (assertive). Defensible; the plan asked for restraint. Kept.
+- **L3.** Countdown role=timer is not a live region. The plan explicitly forbids countdown announcements. Correct by intent. Kept.
+- **L4.** useNarrow getServerSnapshot/getSnapshot mismatch is a latent SSR hydration hazard. This is a static GitHub Pages app with no SSR. Moot. Kept.
+
+## Fixes applied
+H1+H2 (content-signature effect key + doneFired reset), M1 (dispose before resubscribe), M2 (added `useLampController` stable hook + test), M3 (aria-activedescendant + per-cell ids via useId). Added ReadoutsPanel reactivity test. Rest let go with rationale above.
diff --git a/planning/02-terminal-shell/implementation/deep_implement_config.json b/planning/02-terminal-shell/implementation/deep_implement_config.json
index 40becc9..5792a8e 100644
--- a/planning/02-terminal-shell/implementation/deep_implement_config.json
+++ b/planning/02-terminal-shell/implementation/deep_implement_config.json
@@ -42,6 +42,10 @@
     "section-06-overlays-settings": {
       "status": "complete",
       "commit_hash": "ea9f484"
+    },
+    "section-07-audio-engine": {
+      "status": "complete",
+      "commit_hash": "87ab1ed"
     }
   },
   "pre_commit": {
diff --git a/planning/02-terminal-shell/sections/section-08-cabinet-grid.md b/planning/02-terminal-shell/sections/section-08-cabinet-grid.md
index f7d9127..2648b36 100644
--- a/planning/02-terminal-shell/sections/section-08-cabinet-grid.md
+++ b/planning/02-terminal-shell/sections/section-08-cabinet-grid.md
@@ -260,4 +260,42 @@ No dispatch calls, no Date.now() reads, no wall-clock-derived thresholds
 anywhere in these two packages. Red alarm reachable only through
 finaleFinalPhase. Grid render provably pure (identical props, identical
 markup). playBranchTrace exported and exercised against BranchStep arrays
-from the real engine types.
\ No newline at end of file
+from the real engine types.
+
+## Implementation notes (as built)
+
+Final suite 433 tests green; both packages shipped as planned.
+
+Files as built match the Files list, plus `src/app/grid/constants.ts`
+(COMPACT_BREAKPOINT_PX = 640), `src/app/grid/useNarrow.ts` (useNarrowViewport),
+`src/app/grid/grid.css`, `src/app/cabinet/cabinet.css`, and the review-added
+test `test/app/cabinet/lampBanks.test.tsx`.
+
+Decisions and shapes:
+
+- The grid reuses `useReducedMotion` (a11y/motion) and `shouldHandleKey`
+  (a11y/keyHandler). `PlayBranchTrace` is a component taking `steps` as props
+  with a SKIP control; reveal is one `setTimeout` chain, keyed by a content
+  signature so an inline-array prop does not rewind an in-flight trace.
+- `useNarrowViewport` drives both the compact pitch and the 44px tap padding
+  via `matchMedia`; the `compact` prop forces pitch only (tap padding tracks a
+  physically narrow viewport).
+- Glow is one container-level class (`char-grid-glow`); cells carry no shadow.
+  Selection transitions via `char-cell-anim` only when motion is allowed. Each
+  cell has a deterministic id (base from an optional `id` prop, default
+  `wg-grid`, not `useId`, to keep the render pure) and the grid sets
+  `aria-activedescendant` to the selected cell.
+- `LampController` is a class consuming `onEngineEvent`; `register()` disposes
+  any prior subscription first. `useLampController()` is the stable-instance
+  hook callers use (one instance, registered in an effect with cleanup). The
+  alarm lamp lights only on `finaleFinalPhase` and is paired with a DEFCON 1
+  text label.
+- `Readouts` is pure presentation (numeric props); `ReadoutsPanel` wires
+  `useCampaign` + `selectOpenExceptions`/`selectServiceOutcomes`. OPEN
+  EXCEPTIONS is wrapped in the section-06 `GlossaryTerm` stand-in.
+- `Countdown` reads `remainingFor(endsAt)` and repaints on `subscribeTick`
+  (a `useReducer` force-update, not a `useSyncExternalStore` snapshot, since
+  remaining changes every call). It never reads Date.now; the backward-wall-
+  clock defense is the display clock's monotonic performance delta over the
+  engine's clamped lastNow. Dot-matrix numerals wide, in-terminal line narrow,
+  exactly one in the DOM, `role="timer"`.
\ No newline at end of file
diff --git a/src/app/cabinet/Countdown.tsx b/src/app/cabinet/Countdown.tsx
new file mode 100644
index 0000000..141aa24
--- /dev/null
+++ b/src/app/cabinet/Countdown.tsx
@@ -0,0 +1,62 @@
+// The deadline display. Dot-matrix numerals (styled spans in the Glass TTY
+// font, no images) on wide layouts, swapped for an in-terminal countdown line
+// below the shared breakpoint; exactly one is in the DOM at a time. Remaining
+// time is endsAt minus the section-02 repaint clock, clamped at zero. This
+// never reads Date.now(): the display clock's monotonic performance.now delta
+// on top of the engine's clamped lastNow is the whole defense against a
+// backward wall-clock jump, and routing around it would reopen that hole. The
+// countdown never feeds the announcer; milestone readouts come from engine
+// timerMilestone events, not this display.
+import { useEffect, useReducer } from 'react'
+import { remainingFor, subscribeTick } from '../state'
+import { useNarrowViewport } from '../grid'
+import './cabinet.css'
+
+export interface CountdownProps {
+  /** The active deadline in engine time. */
+  readonly endsAt: number
+}
+
+function format(remainingMs: number): string {
+  const totalSeconds = Math.ceil(remainingMs / 1000)
+  const minutes = Math.floor(totalSeconds / 60)
+  const seconds = totalSeconds % 60
+  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
+}
+
+// Precondition: the display clock has been captured at least once (send/wake
+// call captureClock, and init() wakes at boot). Before any capture the clock
+// reads from zero; the clamp keeps that a floor, never a negative.
+export function Countdown({ endsAt }: CountdownProps) {
+  const [, repaint] = useReducer((n: number) => n + 1, 0)
+  const narrow = useNarrowViewport()
+
+  // Repaint on each display tick; remaining time is recomputed fresh so it is
+  // never a stale cached snapshot.
+  useEffect(() => subscribeTick(repaint), [])
+
+  const text = format(remainingFor(endsAt))
+
+  if (narrow) {
+    return (
+      <span className="countdown-line" role="timer" data-testid="countdown-line">
+        T MINUS {text}
+      </span>
+    )
+  }
+
+  return (
+    <span
+      className="countdown-dotmatrix"
+      role="timer"
+      data-testid="countdown-dotmatrix"
+      aria-label={`T minus ${text}`}
+    >
+      {text.split('').map((ch, i) => (
+        <span className="countdown-digit" aria-hidden="true" key={i}>
+          {ch}
+        </span>
+      ))}
+    </span>
+  )
+}
diff --git a/src/app/cabinet/LampBanks.tsx b/src/app/cabinet/LampBanks.tsx
new file mode 100644
index 0000000..fa545f0
--- /dev/null
+++ b/src/app/cabinet/LampBanks.tsx
@@ -0,0 +1,66 @@
+// The lamp matrices. Reads a LampController's state through a subscription and
+// renders amber dot banks plus a restrained red alarm cluster. Idle banks
+// breathe (one opacity tween) unless reduced motion is set, in which case they
+// are static. Transition classes animate opacity only, consistent with the CRT
+// stack's no-animated-filters rule. The red alarm is paired with a text label
+// per the status-color rule and lights only when the controller's alarm is on.
+import { useEffect, useRef, useSyncExternalStore } from 'react'
+import { useReducedMotion } from '../a11y/motion'
+import { LampController, type LampBanksState } from './LampController'
+import './cabinet.css'
+
+/** The stable-instance pattern for a LampController: one instance for the life
+ *  of the component, registered on mount and disposed on unmount. Callers use
+ *  this rather than `new LampController()` in a render body, which would thrash
+ *  subscriptions and reset lamp state on every render. */
+export function useLampController(): LampController {
+  const ref = useRef<LampController | null>(null)
+  if (ref.current === null) ref.current = new LampController()
+  const controller = ref.current
+  useEffect(() => controller.register(), [controller])
+  return controller
+}
+
+export function useLampBanks(controller: LampController): LampBanksState {
+  return useSyncExternalStore(
+    controller.subscribe,
+    controller.getState,
+    controller.getState,
+  )
+}
+
+export interface LampBanksProps {
+  readonly controller: LampController
+}
+
+export function LampBanks({ controller }: LampBanksProps) {
+  const state = useLampBanks(controller)
+  const reduced = useReducedMotion()
+  const idleClass = reduced ? 'lamp-bank' : 'lamp-bank lamp-breathe'
+
+  return (
+    <div className="lamp-banks" data-testid="lamp-banks">
+      <div
+        className={idleClass}
+        data-testid="lamp-bank-phase"
+        data-phase={state.phase}
+      />
+      <div
+        className={idleClass}
+        data-testid="lamp-bank-settlement"
+        data-settlement={state.settlement ?? 'none'}
+      />
+      <div
+        className={idleClass}
+        data-testid="lamp-bank-branch"
+        data-active={state.branchComplete ? 'true' : 'false'}
+      />
+      {state.alarm ? (
+        <div className="lamp-alarm" data-testid="lamp-alarm" role="status">
+          <span className="lamp-alarm-dot" aria-hidden="true" />
+          <span className="lamp-alarm-label">DEFCON 1</span>
+        </div>
+      ) : null}
+    </div>
+  )
+}
diff --git a/src/app/cabinet/LampController.ts b/src/app/cabinet/LampController.ts
new file mode 100644
index 0000000..1aa1f1c
--- /dev/null
+++ b/src/app/cabinet/LampController.ts
@@ -0,0 +1,82 @@
+// Maps engine events to lamp-bank states. Pure mapping, no timers, no wall
+// clock: the only input is the section-02 emitted relay, which delivers each
+// EngineEvent exactly once in order, so exactly-once bank changes are
+// structural. Every event kind not listed below is ignored and leaves bank
+// state untouched. The red alarm keys exclusively to finaleFinalPhase.
+import { onEngineEvent } from '../state/events'
+import type { CampaignPhase, EngineEvent, OutcomeTier } from '@engine'
+
+export type PhaseLamp = CampaignPhase | 'idle'
+export type SettlementLamp = 'good' | 'bad' | null
+
+export interface LampBanksState {
+  readonly phase: PhaseLamp
+  readonly settlement: SettlementLamp
+  readonly branchComplete: boolean
+  readonly alarm: boolean
+}
+
+export const INITIAL_LAMP_STATE: LampBanksState = {
+  phase: 'idle',
+  settlement: null,
+  branchComplete: false,
+  alarm: false,
+}
+
+// A failed or poor outcome lights the bad lamp; a full or partial one the good
+// lamp. The bad settlement never touches the alarm; only the finale does.
+function settlementLampFor(tier: OutcomeTier): SettlementLamp {
+  return tier === 'failed' || tier === 'poor' ? 'bad' : 'good'
+}
+
+export class LampController {
+  private state: LampBanksState = INITIAL_LAMP_STATE
+  private readonly listeners = new Set<() => void>()
+  private unsubscribe: (() => void) | null = null
+
+  getState = (): LampBanksState => this.state
+
+  subscribe = (listener: () => void): (() => void) => {
+    this.listeners.add(listener)
+    return () => this.listeners.delete(listener)
+  }
+
+  /** Subscribe to the engine relay. Returns a teardown that also disposes.
+   *  Disposes any prior subscription first so a double register (React 18
+   *  StrictMode double-invoke, or a re-mount) never double-applies events. */
+  register(): () => void {
+    this.dispose()
+    this.unsubscribe = onEngineEvent((event) => this.apply(event))
+    return () => this.dispose()
+  }
+
+  dispose(): void {
+    this.unsubscribe?.()
+    this.unsubscribe = null
+  }
+
+  private set(next: LampBanksState): void {
+    this.state = next
+    for (const listener of this.listeners) listener()
+  }
+
+  private apply(event: EngineEvent): void {
+    switch (event.type) {
+      case 'phaseChanged':
+        this.set({ ...this.state, phase: event.to })
+        break
+      case 'settlement':
+        this.set({ ...this.state, settlement: settlementLampFor(event.tier) })
+        break
+      case 'branchRunCompleted':
+        this.set({ ...this.state, branchComplete: true })
+        break
+      case 'finaleFinalPhase':
+        this.set({ ...this.state, alarm: true })
+        break
+      default:
+        // Every other event kind leaves bank state untouched.
+        break
+    }
+  }
+}
diff --git a/src/app/cabinet/Readouts.tsx b/src/app/cabinet/Readouts.tsx
new file mode 100644
index 0000000..d196871
--- /dev/null
+++ b/src/app/cabinet/Readouts.tsx
@@ -0,0 +1,44 @@
+// OPEN EXCEPTIONS beside SERVICE OUTCOMES, each labeled so a player watches the
+// two diverge: WOPR's tally of forced-inactivity resolutions against the real
+// damage the same orders produced. The divergence is the game's thesis. The
+// panel is a plain selector-driven render off useCampaign(); Readouts itself is
+// pure presentation so the divergence is trivially testable.
+import { useCampaign } from '../state'
+import { selectOpenExceptions, selectServiceOutcomes } from '@engine'
+import { GlossaryTerm } from '../a11y/GlossaryTerm'
+import './cabinet.css'
+
+export interface ReadoutsProps {
+  readonly openExceptions: number
+  readonly serviceOutcomes: number
+}
+
+export function Readouts({ openExceptions, serviceOutcomes }: ReadoutsProps) {
+  return (
+    <div className="cabinet-readouts" data-testid="cabinet-readouts">
+      <div className="readout" data-testid="readout-open-exceptions">
+        <span className="readout-label">
+          <GlossaryTerm
+            term="OPEN EXCEPTIONS"
+            definition="Cases WOPR counts as resolved because no one acted on them before the deadline. A rising number here is the machine calling inaction a result."
+          />
+        </span>
+        <span className="readout-value">{openExceptions}</span>
+      </div>
+      <div className="readout" data-testid="readout-service-outcomes">
+        <span className="readout-label">SERVICE OUTCOMES</span>
+        <span className="readout-value">{serviceOutcomes}</span>
+      </div>
+    </div>
+  )
+}
+
+export function ReadoutsPanel() {
+  const state = useCampaign()
+  return (
+    <Readouts
+      openExceptions={selectOpenExceptions(state)}
+      serviceOutcomes={selectServiceOutcomes(state)}
+    />
+  )
+}
diff --git a/src/app/cabinet/cabinet.css b/src/app/cabinet/cabinet.css
new file mode 100644
index 0000000..298caab
--- /dev/null
+++ b/src/app/cabinet/cabinet.css
@@ -0,0 +1,104 @@
+/* Cabinet chrome: amber lamp banks, the exceptions/outcomes readouts, and the
+   countdown. Every transition animates opacity only, consistent with the CRT
+   stack's no-animated-filters rule. The red alarm is restrained and always
+   paired with a text label per the status-color rule. */
+.lamp-banks {
+  display: flex;
+  gap: 0.75rem;
+  align-items: center;
+}
+
+.lamp-bank {
+  width: 4rem;
+  height: 1.5rem;
+  border-radius: 2px;
+  background:
+    radial-gradient(
+        circle at 6px 6px,
+        var(--color-amber, #ffb84d) 0 2px,
+        transparent 3px
+      )
+      0 0 / 12px 12px;
+  background-color: #2a2b24;
+  opacity: 0.85;
+}
+
+/* One opacity tween; no filters. Removed entirely under reduced motion. */
+.lamp-breathe {
+  animation: lamp-breathe 5s ease-in-out infinite;
+}
+
+@keyframes lamp-breathe {
+  0%,
+  100% {
+    opacity: 0.7;
+  }
+  50% {
+    opacity: 1;
+  }
+}
+
+.lamp-alarm {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+}
+
+.lamp-alarm-dot {
+  width: 0.75rem;
+  height: 0.75rem;
+  border-radius: 50%;
+  background: var(--color-red, #ff5c5c);
+}
+
+.lamp-alarm-label {
+  color: var(--color-red, #ff5c5c);
+  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
+  letter-spacing: 0.1em;
+}
+
+.cabinet-readouts {
+  display: flex;
+  gap: 2rem;
+  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
+}
+
+.readout {
+  display: flex;
+  flex-direction: column;
+  gap: 0.25rem;
+}
+
+.readout-label {
+  color: var(--color-dim, #7fb0e0);
+  font-size: 0.8em;
+  letter-spacing: 0.08em;
+}
+
+.readout-value {
+  color: var(--color-glyph, #6cb6ff);
+  font-size: 1.6em;
+}
+
+.countdown-dotmatrix {
+  display: inline-flex;
+  gap: 0.15em;
+  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
+  color: var(--color-amber, #ffb84d);
+  font-size: 2.2em;
+  text-shadow: 0 0 6px var(--color-amber, #ffb84d);
+}
+
+.crt-reduce-glow .countdown-dotmatrix {
+  text-shadow: 0 0 1px var(--color-amber, #ffb84d);
+}
+
+.countdown-digit {
+  width: 1ch;
+  text-align: center;
+}
+
+.countdown-line {
+  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
+  color: var(--color-amber, #ffb84d);
+}
diff --git a/src/app/cabinet/index.ts b/src/app/cabinet/index.ts
new file mode 100644
index 0000000..7672872
--- /dev/null
+++ b/src/app/cabinet/index.ts
@@ -0,0 +1,21 @@
+// The cabinet package surface: lamp banks behind a controller, the exceptions
+// and outcomes readouts, and the countdown chrome.
+export {
+  LampController,
+  INITIAL_LAMP_STATE,
+  type LampBanksState,
+  type PhaseLamp,
+  type SettlementLamp,
+} from './LampController'
+export {
+  LampBanks,
+  useLampBanks,
+  useLampController,
+  type LampBanksProps,
+} from './LampBanks'
+export {
+  Readouts,
+  ReadoutsPanel,
+  type ReadoutsProps,
+} from './Readouts'
+export { Countdown, type CountdownProps } from './Countdown'
diff --git a/src/app/grid/CharacterGrid.tsx b/src/app/grid/CharacterGrid.tsx
new file mode 100644
index 0000000..0fc5f86
--- /dev/null
+++ b/src/app/grid/CharacterGrid.tsx
@@ -0,0 +1,142 @@
+// A fixed-width character grid rendered as DOM text rows, not canvas. Pure
+// function of props: identical props produce identical markup and nothing
+// scrolls or animates in the base state. Glow is a single container-level
+// class; cells never carry a shadow layer of their own. The only thing that
+// may transition is the selection highlight, and only when motion is allowed.
+import type { ReactNode } from 'react'
+import { useReducedMotion } from '../a11y/motion'
+import { shouldHandleKey } from '../a11y/keyHandler'
+import { useNarrowViewport } from './useNarrow'
+import './grid.css'
+
+export interface GridCell {
+  readonly char: string
+  /** One per-cell class hook; the theme token it names carries at most one
+   *  shadow layer so the grid never stacks glows. */
+  readonly classHook?: string
+}
+
+export interface GridSelection {
+  readonly row: number
+  readonly col: number
+}
+
+export interface CharacterGridProps {
+  readonly cells: readonly (readonly GridCell[])[]
+  readonly legend?: ReactNode
+  readonly selection?: GridSelection | null
+  readonly onSelect?: (row: number, col: number) => void
+  /** Force compact pitch; otherwise it follows the narrow breakpoint. */
+  readonly compact?: boolean
+  /** Base id for per-cell ids and aria-activedescendant. Deterministic so the
+   *  render stays pure; pass a unique value when more than one grid is on the
+   *  page. */
+  readonly id?: string
+}
+
+const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
+  ArrowUp: [-1, 0],
+  ArrowDown: [1, 0],
+  ArrowLeft: [0, -1],
+  ArrowRight: [0, 1],
+}
+
+function clamp(value: number, max: number): number {
+  if (value < 0) return 0
+  if (value > max) return max
+  return value
+}
+
+export function CharacterGrid({
+  cells,
+  legend,
+  selection = null,
+  onSelect,
+  compact,
+  id = 'wg-grid',
+}: CharacterGridProps) {
+  const reduced = useReducedMotion()
+  const narrow = useNarrowViewport()
+  const isCompact = compact === true || narrow
+  const cellId = (r: number, c: number): string => `${id}-cell-${r}-${c}`
+
+  const rows = cells.length
+  const cols = cells[0]?.length ?? 0
+  const activeDescendant =
+    selection && selection.row >= 0 && selection.col >= 0
+      ? cellId(selection.row, selection.col)
+      : undefined
+
+  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
+    const delta = ARROWS[event.key]
+    if (!delta || !shouldHandleKey(event)) return
+    if (!onSelect || rows === 0 || cols === 0) return
+    event.preventDefault()
+    const base = selection ?? { row: 0, col: 0 }
+    const nextRow = clamp(base.row + delta[0], rows - 1)
+    const nextCol = clamp(base.col + delta[1], cols - 1)
+    onSelect(nextRow, nextCol)
+  }
+
+  const containerClass = [
+    'char-grid',
+    'char-grid-glow',
+    isCompact ? 'char-grid-compact' : '',
+  ]
+    .filter(Boolean)
+    .join(' ')
+
+  return (
+    <div className="char-grid-wrap" data-testid="character-grid">
+      <div
+        className={containerClass}
+        role="grid"
+        tabIndex={0}
+        data-compact={isCompact ? 'true' : undefined}
+        aria-activedescendant={activeDescendant}
+        onKeyDown={onKeyDown}
+      >
+        {cells.map((row, r) => (
+          <div className="char-row" role="row" key={r}>
+            {row.map((cell, c) => {
+              const selected =
+                selection?.row === r && selection?.col === c
+              const cellClass = [
+                'char-cell',
+                cell.classHook ?? '',
+                // Tap padding tracks a physically narrow (touch) viewport, not
+                // the compact prop, which is only a pitch override.
+                narrow ? 'char-cell-tap' : '',
+                selected ? 'char-cell-selected' : '',
+                selected && !reduced ? 'char-cell-anim' : '',
+              ]
+                .filter(Boolean)
+                .join(' ')
+              return (
+                <span
+                  key={c}
+                  id={cellId(r, c)}
+                  className={cellClass}
+                  role="gridcell"
+                  aria-selected={selected || undefined}
+                  data-row={r}
+                  data-col={c}
+                  onPointerDown={
+                    onSelect ? () => onSelect(r, c) : undefined
+                  }
+                >
+                  {cell.char}
+                </span>
+              )
+            })}
+          </div>
+        ))}
+      </div>
+      {legend ? (
+        <div className="char-grid-legend" data-testid="grid-legend">
+          {legend}
+        </div>
+      ) : null}
+    </div>
+  )
+}
diff --git a/src/app/grid/constants.ts b/src/app/grid/constants.ts
new file mode 100644
index 0000000..a75bca5
--- /dev/null
+++ b/src/app/grid/constants.ts
@@ -0,0 +1,4 @@
+// The one width breakpoint shared by the grid's compact mode and the cabinet
+// countdown chrome. Below it the grid tightens pitch and widens tap targets,
+// and the countdown swaps dot-matrix numerals for an in-terminal line.
+export const COMPACT_BREAKPOINT_PX = 640
diff --git a/src/app/grid/grid.css b/src/app/grid/grid.css
new file mode 100644
index 0000000..729d176
--- /dev/null
+++ b/src/app/grid/grid.css
@@ -0,0 +1,69 @@
+/* The character grid. Glow lives at the container level only (one layer); no
+   cell carries a shadow of its own. The selection highlight is the only thing
+   that transitions, and only when the motion-allowed class is present. No
+   filters, no per-cell animation, so a finale-scale grid stays cheap. */
+.char-grid-wrap {
+  display: inline-flex;
+  flex-direction: column;
+  gap: 0.5rem;
+}
+
+.char-grid {
+  display: inline-flex;
+  flex-direction: column;
+  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
+  color: var(--color-glyph, #6cb6ff);
+  background: var(--color-glass, #050a14);
+  line-height: 1.1;
+  outline: none;
+}
+
+/* The single container-level glow layer. */
+.char-grid-glow {
+  text-shadow: 0 0 6px var(--color-glyph, #6cb6ff);
+}
+
+.crt-reduce-glow .char-grid-glow {
+  text-shadow: 0 0 1px var(--color-glyph, #6cb6ff);
+}
+
+.char-grid-compact {
+  letter-spacing: -0.02em;
+  line-height: 1;
+}
+
+.char-row {
+  display: flex;
+}
+
+.char-cell {
+  display: inline-block;
+  min-width: 1ch;
+  text-align: center;
+  /* No shadow here: the glow is the container's job. */
+}
+
+/* Narrow screens widen the effective tap target to ~44px via padding. */
+.char-cell-tap {
+  padding: 0.75rem 0.5rem;
+  min-width: 44px;
+  min-height: 44px;
+}
+
+.char-cell-selected {
+  color: var(--color-glass, #050a14);
+  background: var(--color-focus, #9fd8ff);
+}
+
+/* Transition only when motion is allowed. Opacity and color only, no filters. */
+.char-cell-anim {
+  transition:
+    background-color 120ms ease,
+    color 120ms ease;
+}
+
+.char-grid-legend {
+  font-family: var(--font-terminal, 'Glass TTY VT220', 'VT323', monospace);
+  color: var(--color-dim, #7fb0e0);
+  font-size: 0.85em;
+}
diff --git a/src/app/grid/index.ts b/src/app/grid/index.ts
new file mode 100644
index 0000000..5f1fba9
--- /dev/null
+++ b/src/app/grid/index.ts
@@ -0,0 +1,14 @@
+// The grid package surface: the character grid, the branch-trace playback, the
+// shared compact breakpoint, and the narrow-viewport hook the cabinet reuses.
+export {
+  CharacterGrid,
+  type CharacterGridProps,
+  type GridCell,
+  type GridSelection,
+} from './CharacterGrid'
+export {
+  PlayBranchTrace,
+  type PlayBranchTraceProps,
+} from './playBranchTrace'
+export { COMPACT_BREAKPOINT_PX } from './constants'
+export { useNarrowViewport } from './useNarrow'
diff --git a/src/app/grid/playBranchTrace.tsx b/src/app/grid/playBranchTrace.tsx
new file mode 100644
index 0000000..6fd37f6
--- /dev/null
+++ b/src/app/grid/playBranchTrace.tsx
@@ -0,0 +1,101 @@
+// Branch-trace playback. Renders BranchStep entries sequentially at a
+// watchable pace with one timer and no animation library. Under reduced motion
+// playback is instant (all steps present at once); a SKIP control jumps to the
+// final state; every step's results stay readable after a skip. An empty array
+// renders a stable terminal state without throwing. Split 06 authors the real
+// step content; split 01 owns the BranchStep type.
+import { useEffect, useRef, useState } from 'react'
+import type { BranchStep } from '@engine'
+import { useReducedMotion } from '../a11y/motion'
+import './grid.css'
+
+export interface PlayBranchTraceProps {
+  readonly steps: readonly BranchStep[]
+  /** Milliseconds between revealed steps (one timer, not an animation lib). */
+  readonly stepMs?: number
+  readonly onDone?: () => void
+}
+
+const DEFAULT_STEP_MS = 400
+
+export function PlayBranchTrace({
+  steps,
+  stepMs = DEFAULT_STEP_MS,
+  onDone,
+}: PlayBranchTraceProps) {
+  const reduced = useReducedMotion()
+  // A content signature keyed to the steps, not the array identity: a caller
+  // passing an inline array gives a new reference every render, which must not
+  // rewind an in-flight trace. Only a change of actual step content restarts.
+  const signature = steps.map((s) => s.step).join('|')
+  const [revealed, setRevealed] = useState(() =>
+    reduced || steps.length <= 1 ? steps.length : 1,
+  )
+  const doneFired = useRef(false)
+
+  useEffect(() => {
+    // A new sequence (or a motion-preference flip) is the only thing that
+    // restarts playback and re-arms the done latch.
+    doneFired.current = false
+    if (reduced || steps.length <= 1) {
+      setRevealed(steps.length)
+      return
+    }
+    setRevealed(1)
+    let count = 1
+    let timer: ReturnType<typeof setTimeout>
+    const tick = (): void => {
+      count += 1
+      setRevealed(count)
+      if (count < steps.length) timer = setTimeout(tick, stepMs)
+    }
+    timer = setTimeout(tick, stepMs)
+    return () => clearTimeout(timer)
+    // Keyed by the content signature, not the steps reference, so an inline
+    // array prop does not rewind an in-flight trace.
+  }, [signature, reduced, stepMs])
+
+  useEffect(() => {
+    if (revealed >= steps.length && steps.length > 0 && !doneFired.current) {
+      doneFired.current = true
+      onDone?.()
+    }
+  }, [revealed, steps.length, onDone])
+
+  const skip = (): void => setRevealed(steps.length)
+  const complete = revealed >= steps.length
+
+  return (
+    <div className="branch-trace" data-testid="branch-trace">
+      {steps.length === 0 ? (
+        <p className="branch-trace-empty" data-testid="branch-trace-empty">
+          NO BRANCH DATA
+        </p>
+      ) : (
+        <ol className="branch-trace-steps">
+          {steps.slice(0, revealed).map((s) => (
+            <li
+              className="branch-trace-step"
+              data-testid="branch-step"
+              data-step={s.step}
+              key={s.step}
+            >
+              <span className="branch-step-label">{s.label}</span>
+              <span className="branch-step-detail">{s.detail}</span>
+            </li>
+          ))}
+        </ol>
+      )}
+      {!complete ? (
+        <button
+          type="button"
+          className="branch-trace-skip"
+          data-testid="branch-skip"
+          onClick={skip}
+        >
+          SKIP
+        </button>
+      ) : null}
+    </div>
+  )
+}
diff --git a/src/app/grid/useNarrow.ts b/src/app/grid/useNarrow.ts
new file mode 100644
index 0000000..029037b
--- /dev/null
+++ b/src/app/grid/useNarrow.ts
@@ -0,0 +1,34 @@
+// A narrow-viewport hook driven by the shared breakpoint. jsdom provides a
+// matchMedia stub in tests (mocked per case); outside a browser it reports
+// not-narrow so server-free renders never throw.
+import { useSyncExternalStore } from 'react'
+import { COMPACT_BREAKPOINT_PX } from './constants'
+
+const QUERY = `(max-width: ${COMPACT_BREAKPOINT_PX}px)`
+
+function mql(): MediaQueryList | null {
+  if (typeof window === 'undefined' || !window.matchMedia) return null
+  return window.matchMedia(QUERY)
+}
+
+function isNarrow(): boolean {
+  return mql()?.matches ?? false
+}
+
+export function useNarrowViewport(): boolean {
+  return useSyncExternalStore(
+    (listener) => {
+      const m = mql()
+      if (!m) return () => {}
+      // Older Safari exposes addListener rather than addEventListener.
+      if (m.addEventListener) {
+        m.addEventListener('change', listener)
+        return () => m.removeEventListener('change', listener)
+      }
+      m.addListener(listener)
+      return () => m.removeListener(listener)
+    },
+    isNarrow,
+    () => false,
+  )
+}
diff --git a/test/app/cabinet/countdown.test.tsx b/test/app/cabinet/countdown.test.tsx
new file mode 100644
index 0000000..20a40f9
--- /dev/null
+++ b/test/app/cabinet/countdown.test.tsx
@@ -0,0 +1,103 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, render, screen } from '@testing-library/react'
+import { Countdown } from '@app/cabinet'
+import { captureClock, tickOnce, __resetClock } from '@app/state/displayClock'
+import { onAnnounce, __resetAnnounce } from '@app/a11y/announce'
+
+function mockMedia(narrow: boolean): void {
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
+  __resetClock()
+  __resetAnnounce()
+  mockMedia(false)
+})
+afterEach(() => {
+  cleanup()
+  __resetClock()
+  __resetAnnounce()
+  vi.restoreAllMocks()
+})
+
+describe('Countdown', () => {
+  it('carries role="timer"', () => {
+    captureClock(0)
+    render(<Countdown endsAt={60_000} />)
+    expect(screen.getByRole('timer')).toBeInTheDocument()
+  })
+
+  it('renders dot-matrix numerals on wide layouts, the line below the breakpoint', () => {
+    captureClock(0)
+    const { unmount } = render(<Countdown endsAt={60_000} />)
+    expect(screen.getByTestId('countdown-dotmatrix')).toBeInTheDocument()
+    expect(screen.queryByTestId('countdown-line')).toBeNull()
+    unmount()
+
+    mockMedia(true)
+    render(<Countdown endsAt={60_000} />)
+    expect(screen.getByTestId('countdown-line')).toBeInTheDocument()
+    expect(screen.queryByTestId('countdown-dotmatrix')).toBeNull()
+  })
+
+  it('a deadline already passed displays zero, never a negative', () => {
+    // Captured engine time is past the deadline.
+    captureClock(70_000)
+    render(<Countdown endsAt={60_000} />)
+    expect(screen.getByTestId('countdown-dotmatrix')).toHaveTextContent('00:00')
+  })
+
+  it('never increases on a backward wall-clock jump (it never reads Date.now)', () => {
+    let t = 1000
+    vi.spyOn(performance, 'now').mockImplementation(() => t)
+    // The display reads only the engine's captured lastNow plus a monotonic
+    // performance delta; Date.now going backward must not reach it.
+    vi.spyOn(Date, 'now').mockReturnValue(500)
+    captureClock(0)
+    render(<Countdown endsAt={60_000} />)
+    const readings: string[] = []
+    const read = (): void => {
+      readings.push(
+        screen.getByTestId('countdown-dotmatrix').textContent ?? '',
+      )
+    }
+    read()
+    for (const next of [2000, 3000, 4000]) {
+      t = next
+      // Simulate a backward system clock between repaints.
+      vi.spyOn(Date, 'now').mockReturnValue(100)
+      act(() => {
+        tickOnce(() => {})
+      })
+      read()
+    }
+    const asSeconds = readings.map((r) => {
+      const [m, s] = r.split(':').map(Number)
+      return m! * 60 + s!
+    })
+    for (let i = 1; i < asSeconds.length; i++) {
+      expect(asSeconds[i]!).toBeLessThanOrEqual(asSeconds[i - 1]!)
+    }
+  })
+
+  it('produces no announcements from the ticker path', () => {
+    const sink = vi.fn()
+    onAnnounce(sink)
+    captureClock(0)
+    render(<Countdown endsAt={60_000} />)
+    act(() => {
+      tickOnce(() => {})
+      tickOnce(() => {})
+    })
+    expect(sink).not.toHaveBeenCalled()
+  })
+})
diff --git a/test/app/cabinet/lampBanks.test.tsx b/test/app/cabinet/lampBanks.test.tsx
new file mode 100644
index 0000000..d3e1440
--- /dev/null
+++ b/test/app/cabinet/lampBanks.test.tsx
@@ -0,0 +1,55 @@
+import { afterEach, beforeEach, describe, expect, it } from 'vitest'
+import { useReducer } from 'react'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { LampBanks, useLampController } from '@app/cabinet'
+import { relayEvents, __resetConsumers } from '@app/state/events'
+
+function Harness() {
+  const controller = useLampController()
+  const [, force] = useReducer((n: number) => n + 1, 0)
+  return (
+    <div>
+      <button data-testid="force" onClick={force}>
+        force
+      </button>
+      <LampBanks controller={controller} />
+    </div>
+  )
+}
+
+beforeEach(() => {
+  __resetConsumers()
+})
+afterEach(() => {
+  cleanup()
+  __resetConsumers()
+})
+
+describe('useLampController stable instance', () => {
+  it('survives parent re-renders and keeps lamp state', () => {
+    render(<Harness />)
+    act(() => {
+      relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
+    })
+    expect(screen.getByTestId('lamp-bank-phase')).toHaveAttribute(
+      'data-phase',
+      'mission',
+    )
+    // A parent re-render must not reset the controller or its lamp state.
+    fireEvent.click(screen.getByTestId('force'))
+    expect(screen.getByTestId('lamp-bank-phase')).toHaveAttribute(
+      'data-phase',
+      'mission',
+    )
+  })
+
+  it('raises the alarm with a paired text label only on finaleFinalPhase', () => {
+    render(<Harness />)
+    expect(screen.queryByTestId('lamp-alarm')).toBeNull()
+    act(() => {
+      relayEvents([{ type: 'finaleFinalPhase' }])
+    })
+    const alarm = screen.getByTestId('lamp-alarm')
+    expect(alarm).toHaveTextContent('DEFCON 1')
+  })
+})
diff --git a/test/app/cabinet/lampController.test.ts b/test/app/cabinet/lampController.test.ts
new file mode 100644
index 0000000..701706b
--- /dev/null
+++ b/test/app/cabinet/lampController.test.ts
@@ -0,0 +1,87 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { LampController, INITIAL_LAMP_STATE } from '@app/cabinet'
+import { relayEvents, __resetConsumers } from '@app/state/events'
+import type { EngineEvent } from '@engine'
+
+let controller: LampController
+let teardown: () => void
+
+beforeEach(() => {
+  __resetConsumers()
+  controller = new LampController()
+  teardown = controller.register()
+})
+afterEach(() => {
+  teardown()
+  __resetConsumers()
+})
+
+const settlement = (tier: 'full' | 'failed'): EngineEvent => ({
+  type: 'settlement',
+  missionId: 'alpha',
+  cause: tier === 'failed' ? 'timeout' : 'completed',
+  tier,
+})
+
+describe('LampController mapping', () => {
+  it('phaseChanged moves the phase bank', () => {
+    relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
+    expect(controller.getState().phase).toBe('mission')
+  })
+
+  it('settlement lights the good or bad settlement lamp by tier', () => {
+    relayEvents([settlement('full')])
+    expect(controller.getState().settlement).toBe('good')
+    relayEvents([settlement('failed')])
+    expect(controller.getState().settlement).toBe('bad')
+  })
+
+  it('branchRunCompleted lights the branch bank', () => {
+    relayEvents([{ type: 'branchRunCompleted', branch: 'staged' }])
+    expect(controller.getState().branchComplete).toBe(true)
+  })
+
+  it('finaleFinalPhase raises the alarm', () => {
+    relayEvents([{ type: 'finaleFinalPhase' }])
+    expect(controller.getState().alarm).toBe(true)
+  })
+
+  it('no event leaves bank state untouched', () => {
+    expect(controller.getState()).toEqual(INITIAL_LAMP_STATE)
+    // An ignored event kind changes nothing.
+    relayEvents([{ type: 'clueFound', clueId: 'x' }])
+    expect(controller.getState()).toEqual(INITIAL_LAMP_STATE)
+  })
+
+  it('the red alarm activates only on finaleFinalPhase, not on a failed settlement', () => {
+    relayEvents([settlement('failed')])
+    expect(controller.getState().alarm).toBe(false)
+    relayEvents([
+      { type: 'phaseChanged', from: 'mission', to: 'debrief' },
+      { type: 'branchRunCompleted', branch: 'staged' },
+    ])
+    expect(controller.getState().alarm).toBe(false)
+  })
+
+  it('registering twice does not double-apply events (prior subscription disposed)', () => {
+    const changes = vi.fn()
+    controller.subscribe(changes)
+    // beforeEach already registered once; a second register must dispose the
+    // first so the relay does not fan out to two live subscriptions.
+    const second = controller.register()
+    relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
+    expect(changes).toHaveBeenCalledTimes(1)
+    second()
+  })
+
+  it('changes once per relevant event in an ordered batch (consequenceApplied is ignored)', () => {
+    const changes = vi.fn()
+    controller.subscribe(changes)
+    relayEvents([
+      settlement('full'),
+      { type: 'consequenceApplied', consequenceId: 'c1', targetMissionId: 'beta' },
+    ])
+    expect(changes).toHaveBeenCalledTimes(1)
+    expect(controller.getState().settlement).toBe('good')
+  })
+})
diff --git a/test/app/cabinet/readouts.test.tsx b/test/app/cabinet/readouts.test.tsx
new file mode 100644
index 0000000..cc6f231
--- /dev/null
+++ b/test/app/cabinet/readouts.test.tsx
@@ -0,0 +1,71 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, render, screen } from '@testing-library/react'
+import { Readouts, ReadoutsPanel } from '@app/cabinet'
+import { init, send, getState } from '@app/state'
+import { buildCtx, memoryPort, resetAll } from '../state/harness'
+
+describe('Readouts (pure)', () => {
+  afterEach(cleanup)
+
+  it('renders both labeled values so the divergence reads', () => {
+    render(<Readouts openExceptions={9} serviceOutcomes={30} />)
+    expect(screen.getByTestId('readout-open-exceptions')).toHaveTextContent('9')
+    expect(screen.getByTestId('readout-service-outcomes')).toHaveTextContent('30')
+    // OPEN EXCEPTIONS is a glossary term.
+    expect(screen.getByTestId('glossary-term')).toHaveTextContent(
+      'OPEN EXCEPTIONS',
+    )
+  })
+})
+
+describe('ReadoutsPanel (real engine, selectors diverge)', () => {
+  let teardown: () => void
+  beforeEach(() => {
+    resetAll()
+    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
+    teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
+  })
+  afterEach(() => {
+    teardown()
+    vi.restoreAllMocks()
+    cleanup()
+  })
+
+  it('shows forced-inactivity resolutions diverging from real service cost', () => {
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    const endsAt = getState().activeMission!.endsAt
+    // Let the deadline pass with no delivery: alpha settles by timeout, so WOPR
+    // counts the forced-inactivity resolution while real service cost climbs.
+    vi.spyOn(Date, 'now').mockReturnValue(endsAt + 60_000)
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'beta' }) // rejected; pre-advance settles alpha
+    })
+    render(<ReadoutsPanel />)
+    const open = screen.getByTestId('readout-open-exceptions')
+    const service = screen.getByTestId('readout-service-outcomes')
+    // Baseline 12 minus 3 resolved = 9; service cost 3 * 10 = 30. They diverge.
+    expect(open).toHaveTextContent('9')
+    expect(service).toHaveTextContent('30')
+  })
+
+  it('re-renders live when the campaign state changes after mount', () => {
+    render(<ReadoutsPanel />)
+    // Baseline before any settlement: 12 open exceptions, 0 service cost.
+    expect(screen.getByTestId('readout-open-exceptions')).toHaveTextContent('12')
+    expect(screen.getByTestId('readout-service-outcomes')).toHaveTextContent('0')
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'alpha' })
+    })
+    const endsAt = getState().activeMission!.endsAt
+    vi.spyOn(Date, 'now').mockReturnValue(endsAt + 60_000)
+    act(() => {
+      send({ type: 'START_MISSION', missionId: 'beta' })
+    })
+    // useCampaign is a live store subscription, so the panel updates without a
+    // re-mount: open exceptions fall to 9 and service cost climbs to 30.
+    expect(screen.getByTestId('readout-open-exceptions')).toHaveTextContent('9')
+    expect(screen.getByTestId('readout-service-outcomes')).toHaveTextContent('30')
+  })
+})
diff --git a/test/app/grid/characterGrid.test.tsx b/test/app/grid/characterGrid.test.tsx
new file mode 100644
index 0000000..12c6f36
--- /dev/null
+++ b/test/app/grid/characterGrid.test.tsx
@@ -0,0 +1,165 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { CharacterGrid, type GridCell } from '@app/grid'
+import { setMotionOverride, __resetMotion } from '@app/a11y/motion'
+
+function mockMedia({ narrow = false, reduce = false } = {}): void {
+  window.matchMedia = vi.fn((q: string) => ({
+    matches: q.includes('max-width')
+      ? narrow
+      : q.includes('reduced-motion')
+        ? reduce
+        : false,
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
+function grid(chars: string[][], hooks: Record<string, string> = {}): GridCell[][] {
+  return chars.map((row, r) =>
+    row.map((char, c) => {
+      const hook = hooks[`${r},${c}`]
+      return hook ? { char, classHook: hook } : { char }
+    }),
+  )
+}
+
+beforeEach(() => {
+  __resetMotion()
+  mockMedia()
+})
+afterEach(() => {
+  cleanup()
+  __resetMotion()
+  vi.restoreAllMocks()
+})
+
+describe('CharacterGrid', () => {
+  it('is a pure function of props: identical props, identical markup', () => {
+    const cells = grid([
+      ['A', 'B'],
+      ['C', 'D'],
+    ])
+    const first = render(<CharacterGrid cells={cells} />)
+    const htmlA = first.container.innerHTML
+    first.unmount()
+    const second = render(<CharacterGrid cells={cells} />)
+    expect(second.container.innerHTML).toBe(htmlA)
+  })
+
+  it('arrow keys move the selection and fire the callback with the coordinate', () => {
+    const onSelect = vi.fn()
+    const cells = grid([
+      ['A', 'B', 'C'],
+      ['D', 'E', 'F'],
+    ])
+    render(
+      <CharacterGrid
+        cells={cells}
+        selection={{ row: 0, col: 1 }}
+        onSelect={onSelect}
+      />,
+    )
+    const g = screen.getByRole('grid')
+    fireEvent.keyDown(g, { key: 'ArrowRight' })
+    expect(onSelect).toHaveBeenLastCalledWith(0, 2)
+    fireEvent.keyDown(g, { key: 'ArrowDown' })
+    expect(onSelect).toHaveBeenLastCalledWith(1, 1)
+  })
+
+  it('does not move selection past the edges', () => {
+    const onSelect = vi.fn()
+    render(
+      <CharacterGrid
+        cells={grid([['A', 'B']])}
+        selection={{ row: 0, col: 0 }}
+        onSelect={onSelect}
+      />,
+    )
+    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowUp' })
+    expect(onSelect).toHaveBeenLastCalledWith(0, 0)
+  })
+
+  it('tapping a cell selects it', () => {
+    const onSelect = vi.fn()
+    render(<CharacterGrid cells={grid([['A', 'B']])} onSelect={onSelect} />)
+    const cells = screen.getAllByRole('gridcell')
+    fireEvent.pointerDown(cells[1]!)
+    expect(onSelect).toHaveBeenCalledWith(0, 1)
+  })
+
+  it('reaches a 44px tap target via padding on narrow screens', () => {
+    mockMedia({ narrow: true })
+    render(<CharacterGrid cells={grid([['A']])} />)
+    expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-tap')
+  })
+
+  it('applies the compact class under the width breakpoint', () => {
+    mockMedia({ narrow: true })
+    render(<CharacterGrid cells={grid([['A']])} />)
+    expect(screen.getByRole('grid')).toHaveClass('char-grid-compact')
+    expect(screen.getByRole('grid')).toHaveAttribute('data-compact', 'true')
+  })
+
+  it('renders a per-cell class hook on its element', () => {
+    render(<CharacterGrid cells={grid([['A', 'B']], { '0,1': 'danger' })} />)
+    expect(screen.getAllByRole('gridcell')[1]).toHaveClass('danger')
+  })
+
+  it('applies glow only at the container; no cell carries a shadow class', () => {
+    render(<CharacterGrid cells={grid([['A', 'B']])} />)
+    expect(screen.getByRole('grid')).toHaveClass('char-grid-glow')
+    for (const cell of screen.getAllByRole('gridcell')) {
+      expect(cell).not.toHaveClass('char-grid-glow')
+    }
+  })
+
+  it('renders the legend slot when provided', () => {
+    render(
+      <CharacterGrid cells={grid([['A']])} legend={<span>KEY: A=alpha</span>} />,
+    )
+    expect(screen.getByTestId('grid-legend')).toHaveTextContent('KEY: A=alpha')
+  })
+
+  it('points aria-activedescendant at the selected cell for AT users', () => {
+    render(
+      <CharacterGrid
+        cells={grid([
+          ['A', 'B'],
+          ['C', 'D'],
+        ])}
+        selection={{ row: 1, col: 0 }}
+      />,
+    )
+    const g = screen.getByRole('grid')
+    const active = g.getAttribute('aria-activedescendant')
+    expect(active).toBeTruthy()
+    const selectedCell = screen.getAllByRole('gridcell').find(
+      (c) => c.getAttribute('aria-selected') === 'true',
+    )
+    expect(selectedCell?.id).toBe(active)
+  })
+
+  it('has no aria-activedescendant when nothing is selected', () => {
+    render(<CharacterGrid cells={grid([['A']])} />)
+    expect(screen.getByRole('grid')).not.toHaveAttribute(
+      'aria-activedescendant',
+    )
+  })
+
+  it('selection highlight transitions only when motion is allowed', () => {
+    const cells = grid([['A', 'B']])
+    const { rerender } = render(
+      <CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />,
+    )
+    expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-anim')
+    setMotionOverride('reduce')
+    rerender(<CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />)
+    expect(screen.getAllByRole('gridcell')[0]).not.toHaveClass('char-cell-anim')
+  })
+})
diff --git a/test/app/grid/playBranchTrace.test.tsx b/test/app/grid/playBranchTrace.test.tsx
new file mode 100644
index 0000000..3365053
--- /dev/null
+++ b/test/app/grid/playBranchTrace.test.tsx
@@ -0,0 +1,94 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
+import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
+import { PlayBranchTrace } from '@app/grid'
+import { setMotionOverride, __resetMotion } from '@app/a11y/motion'
+import type { BranchStep } from '@engine'
+
+const STEPS: BranchStep[] = [
+  { step: 1, label: 'SPOOL', detail: 'routes loaded' },
+  { step: 2, label: 'SOLVE', detail: 'no win found' },
+  { step: 3, label: 'HALT', detail: 'the only move is not to play' },
+]
+
+beforeEach(() => {
+  __resetMotion()
+})
+afterEach(() => {
+  cleanup()
+  __resetMotion()
+  vi.useRealTimers()
+})
+
+describe('PlayBranchTrace', () => {
+  it('reveals steps sequentially at a watchable pace', () => {
+    vi.useFakeTimers()
+    render(<PlayBranchTrace steps={STEPS} stepMs={400} />)
+    expect(screen.getAllByTestId('branch-step')).toHaveLength(1)
+    act(() => {
+      vi.advanceTimersByTime(400)
+    })
+    expect(screen.getAllByTestId('branch-step')).toHaveLength(2)
+    act(() => {
+      vi.advanceTimersByTime(400)
+    })
+    expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
+  })
+
+  it('skip jumps to the final state with every result readable', () => {
+    vi.useFakeTimers()
+    render(<PlayBranchTrace steps={STEPS} stepMs={400} />)
+    fireEvent.click(screen.getByTestId('branch-skip'))
+    const rendered = screen.getAllByTestId('branch-step')
+    expect(rendered).toHaveLength(3)
+    expect(screen.getByText('the only move is not to play')).toBeInTheDocument()
+    expect(screen.queryByTestId('branch-skip')).toBeNull()
+  })
+
+  it('under reduced motion every step is present at once', () => {
+    setMotionOverride('reduce')
+    render(<PlayBranchTrace steps={STEPS} />)
+    expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
+    expect(screen.queryByTestId('branch-skip')).toBeNull()
+  })
+
+  it('a parent re-render with a fresh array of the same content does not rewind', () => {
+    vi.useFakeTimers()
+    const { rerender } = render(
+      <PlayBranchTrace steps={STEPS} stepMs={400} />,
+    )
+    act(() => {
+      vi.advanceTimersByTime(400)
+    })
+    expect(screen.getAllByTestId('branch-step')).toHaveLength(2)
+    // A new array identity with identical step content (what an inline prop
+    // produces every render) must not reset playback to step 1.
+    rerender(
+      <PlayBranchTrace steps={STEPS.map((s) => ({ ...s }))} stepMs={400} />,
+    )
+    expect(screen.getAllByTestId('branch-step')).toHaveLength(2)
+  })
+
+  it('fires onDone once when a sequence completes, and again for a new sequence', () => {
+    vi.useFakeTimers()
+    const onDone = vi.fn()
+    const { rerender } = render(
+      <PlayBranchTrace steps={STEPS} stepMs={400} onDone={onDone} />,
+    )
+    act(() => {
+      vi.advanceTimersByTime(800)
+    })
+    expect(onDone).toHaveBeenCalledTimes(1)
+    const next: BranchStep[] = [{ step: 9, label: 'NEW', detail: 'run two' }]
+    rerender(<PlayBranchTrace steps={next} stepMs={400} onDone={onDone} />)
+    act(() => {
+      vi.advanceTimersByTime(400)
+    })
+    expect(onDone).toHaveBeenCalledTimes(2)
+  })
+
+  it('an empty steps array renders a stable terminal state without throwing', () => {
+    expect(() => render(<PlayBranchTrace steps={[]} />)).not.toThrow()
+    expect(screen.getByTestId('branch-trace-empty')).toBeInTheDocument()
+    expect(screen.queryByTestId('branch-skip')).toBeNull()
+  })
+})
