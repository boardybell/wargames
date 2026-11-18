# Section 07 review triage and fixes

Standing directive: full autonomy, no questions. Each finding was triaged and the real defects auto-fixed. Decisions below.

## Auto-fixed

- **H1 (generation token never incremented in prod) + H2 (registerWarnings / preloadEager never bootstrapped).** Added `src/app/audio/mount.ts` exporting `mountAudio()`: it registers warnings on the engine relay, calls `preloadEager()`, and subscribes a lifecycle consumer that `incrementGeneration()` + `drainQueue()` on every `phaseChanged`. Wired `mountAudio()` into `state/index.ts` `init()` (the composition root) with teardown, so the subsystem is live the moment the app boots. `mount.ts` and `warnings.ts` import `onEngineEvent` from `../state/events` (the concrete module, not the barrel) to avoid an eval-time import cycle. Note: `init()` itself is not yet called in production because full App integration (mounting ScreenRouter, calling init) is a deliberate later step; the wiring is correct and ready at the single boot seam.

- **H3 (warning guard over-suppresses repeated milestone ids).** The `registerWarnings` consumer now clears the `fired` guard on `phaseChanged`, so each mission's reused `warn-30`/`warn-10` ids fire again instead of being suppressed for the life of the page. Self-correcting: no external caller must remember `clearWarningGuard()`. New test asserts a phase change between two identical milestone deliveries allows the second to fire.

- **H4 (ducking fights the prefs-owned ambience bus).** Added a dedicated `ambienceDuck` GainNode in series after the ambience bus (`ambience -> ambienceDuck -> master`). Preferences own the ambience bus gain; the player's ducking owns the duck node. `duckAmbience` now ramps the duck node (0.3 duck / 1 restore) and `applyPrefs` never touches it. Two writers, two params, no conflict. New test asserts the prefs-owned ambience bus is never touched by the duck.

- **M1 (per-play node leak).** `source.onended` now `disconnect()`s both the source and its envelope gain. `SourceLike` gained a `disconnect()` method (port + mock).

- **M2 (activeOnBus overwrites tracking for every cue).** Only `exclusive-on-bus` cues register in `activeOnBus` now. The many concurrent one-shots on the effects bus no longer stomp the single tracking slot each keystroke.

- **M3 (oscillators never stopped).** Every source now gets an explicit `source.stop(at + duration + 0.05)` so oscillators terminate and fire `onended` for cleanup, instead of running forever as inaudible live nodes.

- **M4 (statechange listener never removed).** The handler is stored and removed in `__resetContext`; `ContextLike` gained `removeEventListener` (port + mock).

- **L2 (caption live region mount/unmount).** `Captions` now keeps a persistent `aria-live` region and swaps its text (empty when idle, `data-empty="true"`), which announces changes more reliably than toggling the node in and out of the DOM. Tests updated.

- **L3 (transcript chosen by id prefix).** Added an explicit optional `caption?: boolean` to `CueDefinition`; `warn-30`/`warn-10` set it. The caption rule is now a manifest fact (`cue.caption === true || cue.bus === 'voice'`), not a `startsWith('warn')` guess.

## Let go (with rationale)

- **M5 / L1 (file cues: no `urlFor`, `decodeFile` decodes an empty buffer, no real fetch).** File-sourced cues are an explicit forward-dependency owned by the later media split; the shipped manifest is all-synth, so there are zero file cues today. The `player.test.ts` file-cue fixtures deliberately encode already-base-aware URLs (e.g. `/wargames/audio/fx.wav`), so adding `urlFor()` inside `decodeFile` now would double-prefix, and adding a real `fetch()` would introduce untested network code with no asset to load. The decode path is a documented stand-in; the media split replaces its body with `urlFor` + `fetch().arrayBuffer()` when real files land. Deferring is correct scope, not an oversight.

## Verification
- `npx tsc --noEmit`: clean.
- `npx eslint .`: clean.
- `npm test`: 397 passed / 61 files (was 391 / 60). New tests: mount bootstrap (4), ducking duck-node isolation (1), warnings guard-clear on phase change (1).
