# Section 02: Engine Binding (src/app/state/)

## Purpose

Build the single bridge between the headless engine (split 01, src/engine/) and
the React shell: a thin store that owns the current CampaignState, one mutation
path (send), one time-passage path (wake), an exactly-once relay for engine
events, a display clock that cannot be fooled by wall-clock jumps, a per-deadline
self-wake guard, the localStorage save binding with debounce and immediate-flush
rules, recovery-flag surfacing, and a multi-tab notice. Everything downstream
(terminal framework, hero routing, audio warnings, cabinet lamps) consumes this
layer; it never invents game state.

## Dependencies

- section-01-app-scaffold must be complete: the src/app tree exists, the jsdom
  Vitest project runs test/app/**, Testing Library dev deps are installed, and
  the App shell skeleton mounts.
- The engine from split 01 is a hard prerequisite, including its contract
  amendments: dispatch and advanceToNow return { state, emitted: EngineEvent[] },
  CampaignState carries startedMissionIds and a lastNow high-water mark, the
  save layer exposes pure encode/decode/migrate plus a storage port interface
  and a recovery flag, and the test-double mission is importable from the
  @engine/testing entry point (excluded from the production bundle).

This section blocks sections 04, 05, 06, 07, and 08. It can be built in
parallel with section-03-crt-theme, section-09-a11y-glossary, and
section-10-art-slots-extras.

## Engine contract (background you need, copied here)

The engine is pure TypeScript. All player-driven mutation goes through
dispatch(state, action, now); all time passage goes through
advanceToNow(state, rawNow). Both clamp the incoming now to
max(rawNow, state.lastNow) so a backward wall-clock jump can never un-expire a
deadline, and both return:

    { state: CampaignState, emitted: EngineEvent[] }

emitted is the ordered list of events materialized during that call,
corresponding one-to-one with queue deletions and settlement transitions, so
exactly-once downstream consumption is structural. EngineEvent is a JSON-safe
discriminated union: missionStarted, scheduledEventFired, timerMilestone,
settlement, phaseChanged, consequenceApplied, sourceCheckResolved,
debriefAcknowledged, finaleFinalPhase, branchRunCompleted, campaignReset.

Timer milestones (including the 30 and 10 second warnings) are seed-authored
scheduled events materialized at mission start inside the engine. The shell
never derives thresholds from the wall clock; it only relays timerMilestone
events as they arrive in emitted.

The save layer: payload { version: 1, state } under key 'wargames.save.primary',
backup under 'wargames.save.backup' written only after a confirmed good primary
write. The engine exposes encode/decode/migrate and a storage port type whose
every call is fallible (Safari private mode, quota); QuotaExceededError drops
the backup slot and retries once. The load result carries a recovery flag:
'clean' | 'recovered-backup' | 'reset'.

Rejected actions: dispatch surfaces rejection results (the engine refuses the
action and returns unchanged state plus a reason). The binding must hand that
reason back to the caller for inline rendering; it must not update subscribers
as if state changed.

## Files

Create:

- src/app/state/store.ts          the store, useCampaign, subscription plumbing
- src/app/state/send.ts           send(action) wrapping dispatch
- src/app/state/wake.ts           wake() plus lifecycle wiring
- src/app/state/events.ts         emitted-event relay and consumer registry
- src/app/state/displayClock.ts   remaining-time derivation and rAF ticker
- src/app/state/saveBinding.ts    storage port binding, debounce, flush rules
- src/app/state/multiTab.ts       storage-event listener and notice state
- src/app/state/index.ts          public surface for the rest of the shell

Create tests (jsdom project, fake timers where noted, real engine with the
test-double mission from @engine/testing):

- test/app/state/send.test.ts
- test/app/state/events.test.ts
- test/app/state/wake.test.ts
- test/app/state/displayClock.test.ts
- test/app/state/saveBinding.test.ts
- test/app/state/multiTab.test.ts

## Tests first (TDD block 3)

Write these before implementation. The engine is real in these tests; drive it
through the test-double mission (deliver N of M tokens before a deadline). Use
vi.useFakeTimers for debounce and ticker tests; stub performance.now and
Date.now independently where the display-clock tests need them to diverge.

    // send.test.ts
    describe('send()', () => {
      it('wraps dispatch with a Date.now() sample and updates the store')
      it('surfaces a rejection result to the caller without a state change
          or subscriber notification')
    })

    // events.test.ts
    describe('emitted relay', () => {
      it('a dispatch producing settlement plus consequenceApplied relays
          both events, in order, exactly once each, to every registered
          consumer')
      it('a catch-up wake crossing three milestones relays three ordered
          timerMilestone events once')
      it('a second wake with the same now relays no events')
    })

    // wake.test.ts
    describe('wake()', () => {
      it('calls advanceToNow with Date.now() and updates the store')
      it('is wired to app start, visibilitychange-to-visible,
          pageshow with persisted=true, and focus')
      it('self-wake guard keys per endsAt instance: after a mission
          deadline trips the guard, a later finale deadline with a
          different endsAt still self-wakes')
      it('the guard prevents a second self-wake for the same endsAt')
    })

    // displayClock.test.ts
    describe('display clock', () => {
      it('remaining time derives from the engine clamped lastNow plus a
          performance.now() delta captured at the last wake or dispatch')
      it('a backward Date.now() jump between wakes never increases the
          displayed remaining time')
      it('the ticker never calls dispatch or advanceToNow for display')
      it('clamps displayed remaining at zero')
    })

    // saveBinding.test.ts  (fake timers)
    describe('save binding', () => {
      it('ordinary actions debounce writes within the 500 to 800 ms window')
      it('settlement events and START_MISSION, FORFEIT_MISSION,
          ACKNOWLEDGE_DEBRIEF, NEW_CAMPAIGN actions write through
          immediately')
      it('visibilitychange to hidden flushes a pending debounced write')
      it('pagehide flushes a pending debounced write')
      it('recovery flag recovered-backup and reset propagate to the
          exposed notice state; clean does not')
    })

    // multiTab.test.ts
    describe('multi-tab', () => {
      it('a storage event for a save key from another tab raises the
          GAME OPEN IN ANOTHER TAB notice and pauses local writes')
      it('local writes made by this tab do not trigger the notice
          (storage events do not fire in the writing tab; simulate the
          foreign write by dispatching a StorageEvent)')
    })

## Implementation

### Store and hook (store.ts)

One thin external store holding the current CampaignState, exposed through
useSyncExternalStore so React 18 concurrent rendering reads a consistent
snapshot. No reducer logic lives here; the engine is the reducer.

    function useCampaign(): CampaignState     // subscription hook
    function getState(): CampaignState        // non-hook read for bindings
    function setState(next: CampaignState): void   // internal only

setState is not exported from index.ts. The only callers are send and wake.

### send (send.ts)

    function send(action: EngineAction): SendResult
      // Samples now = Date.now(), calls engine dispatch(state, action, now),
      // stores the returned state, relays emitted (events.ts), notifies the
      // save binding (so it can classify the action for debounce vs flush),
      // and returns the rejection result, if any, for inline rendering by
      // the caller. The ONLY mutation path in the app.

SendResult carries the engine's rejection reason when the action was refused;
on rejection the store is not updated and no events relay (the engine emits
none). Callers like ActionBar and CommandInput (section 04) render the reason
inline; this section only guarantees it comes back.

### wake (wake.ts)

    function wake(): void
      // advanceToNow(state, Date.now()), store update, emitted relay,
      // save-binding notification (settlement in emitted triggers an
      // immediate flush).

Wire wake() to: app start (after load), visibilitychange when
document.visibilityState becomes visible, pageshow with event.persisted true
(bfcache resume), and window focus. Each listener registers once at binding
init. Double wakes are harmless by engine contract (catch-up is idempotent;
the second call emits nothing), which the events test asserts.

### Emitted relay (events.ts)

A tiny consumer registry:

    type EngineEventConsumer = (event: EngineEvent) => void
    function onEngineEvent(consumer: EngineEventConsumer): Unsubscribe

After every successful dispatch or advanceToNow, iterate the returned emitted
array in order and invoke every consumer per event. Because emitted entries
correspond one-to-one with engine queue deletions, exactly-once is structural:
the relay never stores, dedupes, or re-derives events, and never synthesizes
events from wall-clock observation. Later sections subscribe here: audio timer
warnings (07), the announcer (09), LampController (08). This section ships the
registry and its tests only.

### Display clock (displayClock.ts)

The repaint ticker runs requestAnimationFrame while the document is visible
and suspends when hidden. It re-renders countdown displays only; it never
calls dispatch or advanceToNow for display purposes.

Derivation: at every wake or dispatch, capture the pair
(engineLastNow = state.lastNow, perfAtCapture = performance.now()). Displayed
remaining time for a deadline endsAt is

    remaining = max(0, endsAt - (engineLastNow + (performance.now() - perfAtCapture)))

evaluated on monotonic rAF timestamps. Date.now() is never read for display,
so a backward wall-clock jump cannot make the countdown gain time while the
engine refuses to un-expire; the engine's lastNow clamp and the display share
one truth, reconciled at every wake.

Expose a hook or subscribe function the countdown components (section 08) can
consume; keep the derivation itself a pure, unit-testable function of
(endsAt, engineLastNow, perfAtCapture, perfNow).

### Self-wake guard

Edge case owned here: if the ticker observes the active deadline passed while
the tab stayed visible with no interaction, it calls wake() exactly once,
guarded PER endsAt INSTANCE. Implement the guard as a seen-deadline key (for
example a Set of endsAt values or deadline instance ids), not an app-level
boolean, so the finale's own later deadline still self-wakes after a mission's
guard has tripped. The guard resets naturally because a new deadline has a new
key.

### Save binding (saveBinding.ts)

Bind the engine storage port to window.localStorage. Scheduling rules:

- Ordinary state changes debounce writes 500 to 800 ms during play (pick one
  value in the window, document it, and test against it with fake timers).
- Immediate flush, bypassing the debounce, on: any settlement event in
  emitted, and the actions START_MISSION, FORFEIT_MISSION,
  ACKNOWLEDGE_DEBRIEF, NEW_CAMPAIGN (irreversible phase transitions).
- visibilitychange to hidden and pagehide flush any pending debounced write
  synchronously.

Every storage call is fallible by engine-port contract; failures must never
throw into gameplay. The binding exposes the load result's recovery flag
('clean' | 'recovered-backup' | 'reset') as readable state so the corrupt-save
notice (section 06) can render it; this section only exposes it.

### Multi-tab (multiTab.ts)

A window storage-event listener watches the save keys
('wargames.save.primary', 'wargames.save.backup'). A storage event for those
keys means another tab wrote them (the writing tab never receives its own
event). On detection: set a notice state the UI renders as GAME OPEN IN
ANOTHER TAB and pause all local writes until reload. Single-active-tab is a
documented limitation; do not attempt leader election.

### Public surface (index.ts)

Export exactly: useCampaign, send, wake, onEngineEvent, the display-clock
subscribe/hook and pure derivation, the recovery-flag accessor, the multi-tab
notice accessor, and an init function the App boot (section 01 scaffold) calls
once to load the save, create or restore the campaign, register lifecycle
listeners, and perform the initial wake. Keep setState and the storage
internals private.

## Definition of done

All six test files green under the jsdom Vitest project in one npm test run
alongside the engine's node project; no section-04-or-later component imports
are needed to pass them; the only engine entry points touched are the public
API and @engine/testing; no code outside src/app/state/ calls engine dispatch
or advanceToNow directly.
## As Built (section-02 implementation)

Built and committed. 264 tests green (both projects, one `npm test`); tsc and eslint clean.

- Eight modules under src/app/state/: store (useSyncExternalStore, holds the ctx + state), send (the one mutation path), wake (advanceCampaign, wired to visibility/pageshow/focus), events (exactly-once relay), displayClock (performance.now-derived remaining + per-endsAt self-wake guard), saveBinding (debounce/immediate-flush/pagehide-flush + recovery flag + pause + getLastSaveOk), multiTab, index (init + public surface).
- The engine threads a ctx, so the store holds an EngineContext; the plan's advanceToNow is the engine's advanceCampaign. SAVE_KEYS import PRIMARY_KEY/BACKUP_KEY from @engine (now exported) as the single source of truth.
- Review fixes: send applies the pre-reduce advance (state + emitted) even on rejection so a deadline-boundary settlement is never swallowed; the self-wake Set is pruned to the current deadline; notifyWake coalesces to avoid starving a pending write under lifecycle churn; PersistResult is surfaced via getLastSaveOk.
- Test note: an "ordinary" (debounced) action must be a non-completing MISSION_ACTION; SET_PREFERENCE is rejected mid-mission and schedules no write.
