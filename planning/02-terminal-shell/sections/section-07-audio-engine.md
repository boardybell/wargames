# Section 07: Audio Engine

Part of the 02-terminal-shell split of SHALL WE PLAY A GAME?, a WarGames-inspired browser game. This section builds the complete audio subsystem under `src/app/audio/`: a single Web Audio context with disciplined lifecycle, three mix buses, a validated cue manifest, synthesized placeholder sounds, ducking, exclusivity, generation tokens, engine-driven timer warnings, captions, and persisted preferences. Everything here is fallible by design so a broken speaker never breaks the game.

## Background you need

The app is React 18+ on Vite, TypeScript, static build. The shell never invents game state; a headless engine (split 01, `src/engine/`) owns all simulation. Engine calls return `{ state, emitted: EngineEvent[] }` where `emitted` is the ordered list of events materialized during that call. The event union includes `timerMilestone`, `settlement`, `phaseChanged`, `consequenceApplied`, `sourceCheckResolved`, `finaleFinalPhase`, `branchRunCompleted` and friends. Timer milestones (including the 30 and 10 second warnings) are seed-authored scheduled events materialized at mission start. The shell never derives audio thresholds from wall clock. The engine-binding store (section 02) relays `emitted` to registered consumers exactly once per event; this audio engine registers as one such consumer.

Locked product decisions that bind this section: one AudioContext created at boot and resumed synchronously inside user-activation handlers; audio muted by default; a diegetic ENABLE SOUND? Y/N prompt elsewhere in the app flips the same persisted master value the settings switch uses (one backing value, two surfaces); no audio libraries, raw Web Audio only; final voice files arrive from a later media split through a manifest swap, so this split ships a provisional cue set with synthesized recipes covering every required event, and call sites must not change when sources are replaced. House rule: no em-dashes anywhere, including comments and strings.

Asset URLs must be base-aware (the site deploys under a subpath). File-sourced cues resolve URLs through the `urlFor(path)` helper from section 01; never a raw absolute path.

## Dependencies

- section-01-app-scaffold: project tree, jsdom Vitest project under `test/app/**`, `urlFor(path)`.
- section-02-engine-binding: the store's emitted-event relay (audio subscribes to it), screen-change and catch-up notifications for the generation token.

This section blocks section-05-hero-pushin, which needs `resume()` callable synchronously from activation handlers and the activation cue.

## Files

Create:

    src/app/audio/context.ts        AudioContext lifecycle, resume, interruption re-resume
    src/app/audio/buses.ts          effects, voice, ambience GainNodes into master into destination
    src/app/audio/manifest.ts       CueDefinition type, manifest validation, the provisional cue set
    src/app/audio/recipes.ts        typed synth recipes (oscillators, filtered noise, envelopes)
    src/app/audio/player.ts         play/stop, decode paths, ducking, exclusivity, generation token
    src/app/audio/prefs.ts          persisted {master, voice, effects, ambience}, corrupt-read fallback
    src/app/audio/captions.tsx      caption line component rendering transcripts
    src/app/audio/warnings.ts       timerMilestone subscription mapping milestones to warning cues
    src/app/audio/port.ts           thin Web Audio port interface so tests can mock the whole API

    test/app/audio/context.test.ts
    test/app/audio/manifest.test.ts
    test/app/audio/player.test.ts
    test/app/audio/ducking.test.ts
    test/app/audio/prefs.test.ts
    test/app/audio/warnings.test.ts
    test/app/audio/captions.test.tsx

The port module matters: jsdom has no Web Audio. Define a minimal interface (context factory, gain node, buffer source, oscillator, AudioParam surface with `setTargetAtTime`, `cancelScheduledValues`, `linearRampToValueAtTime`, `setValueAtTime`) that production code consumes and tests replace with recording mocks. Keep it thin; it is a seam, not an abstraction layer.

## Tests first (from the TDD plan, block 9)

Write these as stubs with descriptive names before implementation. Web Audio is mocked behind the port in all of them.

Context lifecycle (`context.test.ts`):
- Context is created suspended at boot (factory called with no autoplay assumptions; no resume before activation).
- `resume()` is invoked synchronously when the activation entry point runs (spy asserts the call lands before the handler returns; section 05 re-asserts this in each of its four activation handlers).
- A `statechange` listener is registered that re-resumes after an interruption on the next user gesture.

Manifest validation (`manifest.test.ts`):
- Validation rejects any cue with a null transcript unless the cue is on the whitelisted sub-100ms mechanical-tick list.
- Validation rejects any cue missing the `preload` field.
- Every event in the requirements cue table has a cue entry in the provisional manifest (completeness check over the shipped set).
- Effects cues are marked eager; voice cues are marked lazy.

Decode paths (`player.test.ts`):
- Eager file cues decode at manifest load; lazy cues decode on first play and stay decoded thereafter (spy counts decode calls: lazy cue played twice decodes once).
- Each cue routes through the bus named in its definition.
- Master gain is 0 until audio is enabled.

Ducking and stop discipline (`ducking.test.ts`):
- Voice start ramps the ambience bus down via `setTargetAtTime(0.3, t, 0.05)`.
- Voice end restores ambience with the 0.3 time constant.
- `cancelScheduledValues` precedes every re-ramp (mock AudioParam records the full call sequence; assert ordering, not just presence).
- A micro-fade precedes every `stop()` call; no source is ever stopped at full gain.

Exclusivity and staleness (`player.test.ts` continued):
- Playing a voice cue kills the prior voice line (exclusive-on-bus policy).
- The generation token increments on screen change and on catch-up wake; a queued cue holding a stale token drops silently when its turn comes.

Timer warnings (`warnings.test.ts`):
- A relayed `timerMilestone` event fires its warning cue exactly once; replaying or double-delivering the same milestone id does not fire twice.
- No warning fires from any wall-clock or ticker path; the only trigger is the emitted event.

Preferences (`prefs.test.ts`):
- `{master, voice, effects, ambience}` round-trip through persistence; toggles persist.
- A corrupt stored value falls back to the muted defaults without throwing.
- One master value: the module exposes a single backing preference that both the diegetic prompt and the settings switch read and write (assert both code paths hit the same key).

Captions and fallibility (`captions.test.tsx`, plus a resilience test in `player.test.ts`):
- The caption component renders the transcript of any playing voice or warning cue regardless of whether audio is enabled or the context exists.
- Every public entry point (play, stop, resume, decode) swallows failures (no context, decode rejection, interruption) and never throws into gameplay; nothing in the API returns a promise gameplay must await.

## Implementation

### Cue manifest schema

    interface CueDefinition {
      id: string
      source: { kind: 'synth', recipe: RecipeId } |
              { kind: 'file', url: string }        // base-aware URL via urlFor
      bus: 'effects' | 'voice' | 'ambience'
      gain: number
      transcript: string | null                    // null only for sub-100ms
                                                   // mechanical ticks
      policy: 'exclusive-on-bus' | 'queue' | 'drop-if-stale'
      preload: 'eager' | 'lazy'                    // effects eager; voice lazy
                                                   // (decode on first play,
                                                   // then keep) to bound PCM
                                                   // memory on phones
    }

Validation runs at manifest load (and in a unit test): transcript required unless whitelisted as a sub-100ms tick, preload required, bus and policy drawn from the unions. The provisional manifest ships synthesized recipes for every event in the requirements table: key ticks for type-in, activation cue, menu select blip, two-tone confirm and reject, timer warning tones, settlement stingers, ambience hum, static bursts, and a placeholder voice cue per voiced line with its transcript filled in. The later media split swaps `source` entries to file URLs and adds voice recordings without touching any call site; make the manifest the only file it needs to edit.

### Context lifecycle

One AudioContext created at boot in the suspended state. `resume()` exported and documented as safe to call synchronously from any user-gesture handler; it must not be wrapped in anything async before the underlying `context.resume()` fires (iOS requires the call inside the gesture). Register a `statechange` listener: if the context drops to suspended or interrupted after having been running (iOS phone call, Siri, backgrounding), arm a one-shot that re-resumes on the next user gesture. Master gain stays at 0 until the persisted master preference says enabled, so resuming the context is always safe regardless of mute state.

### Buses and preferences

Three GainNodes (effects, voice, ambience) feed a master GainNode into destination. Preferences `{master, voice, effects, ambience}` persist to localStorage; corrupt or missing reads fall to defaults, and the default is muted. The master preference is one value with two consumers: the diegetic ENABLE SOUND? prompt (section 05) and the settings switch (section 06) both read and write it through this module's API. Export plain getters/setters plus a subscription so React surfaces stay in sync.

### Playback and synthesis

File cues marked eager pre-decode on manifest load; lazy cues decode on first play and cache the decoded buffer. Synth cues are built from typed recipes: square and triangle oscillators for taps, blips, and two-tone cues; filtered-noise buffers for hum and static. Every synthesized or file sound wraps in an envelope: 5 ms attack, 30 to 100 ms release. A micro-fade (gain ramp to zero over a few ms) precedes every `stop()` so nothing clicks.

Ducking: when a voice cue starts, ramp the ambience bus with `setTargetAtTime(0.3, t, 0.05)`; when the voice ends, restore with a 0.3 time constant; always call `cancelScheduledValues` before scheduling a new ramp so overlapping voice lines cannot stack stale automation. Voice is exclusive: starting a voice cue micro-fades and stops any prior voice source.

Generation token: a module-level integer incremented on screen change and on catch-up wake (section 02 exposes both signals). Queued cues capture the token at enqueue; when dequeued they compare and drop silently on mismatch. This is what keeps a pile of stale blips from a backgrounded tab replaying on return.

### Timer warnings

Subscribe to the store's emitted-event relay. On `timerMilestone`, look up the cue mapped to that milestone id and play it. Because the relay delivers each engine event exactly once per materialization, exactly-once here is structural, but still guard per milestone instance id so a defensive replay cannot double-fire. No code in this module reads Date.now(), performance.now(), or the repaint ticker to decide when a warning plays.

### Captions

A caption line component renders the transcript of any currently playing voice or warning cue. It renders from the cue's transcript field whether or not audio is enabled or the context ever existed, so a muted player still reads the line. The announcer (section 09) receives the same text; this module exposes the playing-transcript state, it does not call the announcer directly if section 09 is not yet landed (wire it behind an optional callback).

### Resilience

Every public call wraps its body so failure (no context in jsdom or ancient browsers, decode error, interruption mid-play) resolves to silence, never an exception into gameplay. Nothing in gameplay awaits any audio promise. This is the invariant that makes the whole section safe to ship with placeholder sounds.

## Definition of done

All block-9 tests green under the jsdom Vitest project in one `npm test` run alongside the engine's node project. The provisional manifest validates and covers the requirements cue table. The audible-by-ear checks (ducking, levels, iOS interruption recovery) belong to the manual smoke checklist owned by section 10 and the split-08 Playwright pass; do not block this section on them.

## Implementation notes (as built)

All nine source modules and all seven test files shipped as planned. The full suite is green at 391 tests (up from 361), including every block-9 behavior above.

Deviations and decisions worth recording:

- The port seam (`port.ts`) is a two-method `WebAudioPort { create(): ContextLike | null; now(context): number }`. Production uses `browserAudioPort` (returns null when `window.AudioContext`/`webkitAudioContext` is missing); tests inject a recording mock via `setAudioPort`. The barrel re-exports the port value types (`ContextLike`, `ContextState`, `ParamLike`, `GainLike`, `SourceLike`, `OscillatorLike`, `BufferLike`) so the test harness and later sections type their mocks without deep imports.
- Master mute is a single value. `getSoundPreference()`/`setSoundPreference('on'|'off')` (the diegetic prompt path) and `setAudioPref('master', boolean)` (the settings switch path) read and write the same `master` field, confirmed by a prefs test asserting both surfaces move one value.
- jsdom on Node 26 exposes no `window.localStorage`, so prefs use an in-memory session store as the source of truth and mirror to `localStorage` when present. Corrupt JSON falls back to muted defaults without throwing.
- Lazy decode is guarded by an in-flight map so a cue played twice while its first decode is pending still decodes exactly once (spy-verified).
- `voice-greeting` transcript is "GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME?"; warning cues carry spoken-count transcripts (for example "TEN SECONDS"). The `Captions` component renders the playing transcript with `data-testid="caption"` and reads it even when no context exists.
- The hero test harness (`test/app/hero/harness.ts`) `spyResume()` was updated to the new port model: it installs a mock context via `installMockAudio` and returns that context's `resume` spy, since `resumeAudio()` now routes through `getAudioContext().resume()`.

File map as built matches the Files section, plus one module added during code-review integration: `src/app/audio/mount.ts` (the `mountAudio()` bootstrap) and its `test/app/audio/mount.test.ts`.

## Code-review fixes (as applied)

The section-07 review surfaced several load-bearing requirements that were correct in the module but not yet bootstrapped, plus real leak/correctness defects. All were fixed before commit (final suite 397 tests):

- Added `src/app/audio/mount.ts` (`mountAudio()`): registers warnings on the engine relay, pre-decodes eager cues, and advances the generation token on every `phaseChanged`. Wired into `state/index.ts` `init()` with teardown, so the subsystem goes live at the single boot seam. (`init()` is itself called only once full App integration lands; the wiring is ready.) To avoid an eval-time import cycle, `mount.ts` and `warnings.ts` import `onEngineEvent` from `../state/events` directly.
- Warning guard now clears on `phaseChanged` inside the `registerWarnings` consumer, so each mission's reused `warn-30`/`warn-10` ids fire again instead of being suppressed for the page lifetime.
- Ducking moved off the prefs-owned ambience bus onto a dedicated `ambienceDuck` node in series (`ambience -> ambienceDuck -> master`). Preferences own the bus gain; the player owns the duck node. No two-writer conflict.
- Per-play source and envelope nodes are now `disconnect()`-ed in `onended`, every source gets an explicit scheduled `stop()` (oscillators no longer run forever), and only `exclusive-on-bus` cues register in the bus-tracking map.
- The `statechange` listener is now removable (`ContextLike.removeEventListener`), captions use a persistent live region (text swapped, not mounted/unmounted), and the caption rule reads an explicit `caption?: boolean` manifest flag instead of an id prefix.
- Deferred (forward-dependency): file-cue `urlFor` + real `fetch` in `decodeFile` stays a documented stand-in for the later media split; the shipped manifest is all-synth.