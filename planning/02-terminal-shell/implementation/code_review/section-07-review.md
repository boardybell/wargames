# Audio Engine (section-07) review

Reviewer: deep-implement:code-reviewer subagent. Full suite was green (391) but several load-bearing requirements were wired only in tests, plus real leak/correctness defects.

## HIGH
- **H1.** `incrementGeneration()` has zero production call sites. The staleness guard is dead; backgrounded-tab stale cues are unguarded. Plan requires increment on screen change and catch-up wake.
- **H2.** `registerWarnings()` is never called in `src/`; no timer warning fires in the shipped game. Same dead-wiring for `preloadEager()`.
- **H3.** Warning `fired` guard keyed on reusable milestone label ('warn-30'/'warn-10'); `clearWarningGuard()` never called -> second mission's warnings permanently suppressed.
- **H4.** Ducking restore ramps ambience gain to hardcoded `1`, but the ambience BUS gain is owned by prefs (`applyPrefs`). Two writers to one AudioParam: un-duck stomps the user's ambience level, and a prefs change mid-voice stomps the duck ramp.

## MEDIUM
- **M1.** Envelope/source gains created per `play()` are never `disconnect()`-ed in `onended`. Non-exclusive cues (key-tick per keystroke) leak thousands of nodes.
- **M2.** `activeOnBus` keyed by bus overwrites tracking for every cue regardless of policy; only one source per bus is ever trackable.
- **M3.** Oscillator cues use `setTargetAtTime(0, ...)` (asymptotic, never 0) and never `.stop()` -> oscillators run forever as live nodes. (HIGH-ish for oscillators.)
- **M4.** `statechange` listener never removed (no app-lifecycle teardown). Minor.
- **M5.** File branch consumes `cue.source.url` raw (no `urlFor`) and `decodeFile` decodes `new ArrayBuffer(0)` (no real fetch). The media-split seam is a trap as written.

## LOW
- **L1.** `decodeAudioData(new ArrayBuffer(0))` would reject on a real browser; decode-count tests pass for the wrong reason.
- **L2.** Captions conditionally mount/unmount the live region; rapid cue changes may drop SR announcements. Prefer a persistent live region with swapped text.
- **L3.** Transcript chosen via `cueId.startsWith('warn')` string coupling; use the manifest, not the id prefix.
- **L4.** No mute bypass found. Single-master contract holds. Good.

## Bottom line
H1-H4 and M1/M3 block. The module compiles and tests pass, but warning subscription, generation increments, and eager preload are never bootstrapped; the guard over-suppresses; oscillator/one-shot sources leak; ducking fights prefs.
