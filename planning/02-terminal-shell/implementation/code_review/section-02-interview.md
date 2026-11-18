# Review Triage: 02-terminal-shell / section-02-engine-binding

Mode: autonomous. The reviewer confirmed the hard invariants hold
structurally (exactly-once relay, monotonic display clock, pause
enforcement, per-deadline guard, no external engine access, useSyncExternalStore
soundness) and found one real bug. Dispositions:

## Fixed
- **HIGH (rejection path swallowed advance).** dispatch advances time BEFORE
  reducing, so a rejected action can still move the clock and emit
  timerMilestone/settlement events (a deadline expiring in the gap). send
  returned early and discarded all of it, so a settlement at the deadline
  boundary during a rejected command was lost (no audio/lamps/announcer, no
  immediate save flush). Fixed: send now applies the advanced state, relays
  emitted, and recaptures the clock on EVERY path, then reports the rejection
  with a settlement-aware notifyWake. New test: a rejectable action past the
  deadline relays the timeout settlement and advances lastNow.
- **MED (self-wake Set leak).** tickOnce now prunes every guard key except
  the current active deadline, bounding the Set to at most one entry. The
  settled-yet-active mission (engine keeps activeMission until the debrief is
  acknowledged) still fires exactly once; new test runs tickOnce ten times
  and asserts a single wake.
- **MED (notifyWake debounce churn).** A storm of lifecycle wakes was
  restarting the debounce timer and could starve a pending write. notifyWake
  now coalesces (schedules only if none pending) so the original ordinary-
  action window is honored; new test fires wakes mid-window and asserts the
  write still lands at 600 ms.
- **LOW (duplicated SAVE_KEYS).** PRIMARY_KEY/BACKUP_KEY are now exported from
  @engine (single source of truth) and imported here; the public-surface pin
  was updated. A key change can no longer silently break the multi-tab guard.
- **LOW (ignored PersistResult).** flushNow records the result; getLastSaveOk
  exposes it so the shell can warn on a failing save rather than losing data
  silently.

## Documented / declined
- **LOW (getState throws before init).** Deliberate loud failure, consistent
  with main.tsx's missing-#root throw; the App boot calls init before render.
- **LOW (flushPending no-op without a pending timer).** Matches the plan's
  wording ("flush any pending debounced write"); immediate-flush actions have
  already persisted, so there is nothing to lose.

## Verification
tsc 0, eslint 0, 264 tests green (both projects in one run).
