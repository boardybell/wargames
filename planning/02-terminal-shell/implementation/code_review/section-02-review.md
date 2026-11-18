# Code Review: 02-terminal-shell / section-02-engine-binding

Reviewer: deep-implement code-reviewer subagent (adversarial).

Confirmed structurally sound: exactly-once relay (emitted = queue
deletions, never stored/deduped/synthesized), display-clock purity (no
Date.now; backward wall-clock jump cannot increase remaining), self-wake
per-endsAt guard, multi-tab pause enforced in flushNow, useSyncExternalStore
with no tearing, and no engine dispatch/advance outside src/app/state.

Findings:
- HIGH: send dropped the pre-reduce advance (state + emitted) on rejection;
  a settlement at the deadline boundary during a rejected action was lost.
  FIXED.
- MED: self-wake Set grew unbounded. FIXED (prune to current deadline).
- MED: notifyWake restarted the debounce on every lifecycle wake (starvation
  under focus churn). FIXED (coalesce).
- LOW: duplicated SAVE_KEYS (two sources of truth). FIXED (export from @engine).
- LOW: PersistResult ignored. FIXED (getLastSaveOk).
- LOW: getState-before-init throw; flushPending no-op. Documented/declined.

See section-02-interview.md for dispositions.
