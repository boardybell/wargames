# Section 10 review triage and fixes

Standing directive: full autonomy, no questions. Fixed the two HIGH items and the correctness/dedup mediums; kept the low-severity items with rationale.

## Auto-fixed

- **H1 (deferred preload trigger missing).** ArtSlot now self-triggers `preloadSlot(id)` on mount for `deferred` slots only (eager slots are warmed at boot, on-mission-select by preloadForMission). It accepts an optional `loader` for test injection. Tests added: a deferred slot warms its loader on view; eager and on-mission-select slots do not.

- **H2 (TicTacToeView done-latch double-fire).** The view now latches on a move-signature and resets `doneFired` only when the signature changes (a new game), not on a stepMs/reducedMotion change. The reveal effect keys on the signature; the completion guard also requires total > 0. Test added: a reducedMotion flip after completion does not re-fire onDone.

- **M3 (swapArtSource unvalidated).** swapArtSource now validates the resulting entry in dev (import.meta.env.DEV) before committing it.

- **M4 (HeroCrop duplication + unasserted preservation).** The registry's hero crops now derive from hero/heroCrop.ts `HERO_CROPS` (one source of truth; no hand-copied numbers to drift when the calibration tool refines them). The swap test now asserts heroCrop and text survive a source swap.

- **L7 (Image not retained).** The default loader retains each prefetch Image in an in-flight set until load/error so GC cannot reclaim it mid-fetch.

- **L8 (zero-import constraint untested).** A source-scan test asserts tictactoe.ts imports nothing from app state or the engine.

## Let go (with rationale)
- **M5.** Reserved space uses CSS aspect-ratio; all target browsers (modern evergreen, GitHub Pages) support it. A padding-top fallback conflicts with the absolute-filled children; kept with the documented modern-browser assumption.
- **L6.** preloadForMission ignores missionId by design (it warms all three briefing slots); the param is kept for future per-mission targeting.

## Verification
- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npm test`: 496 passed / 76 files (was 490). New tests: deferred-preload trigger (3), heroCrop/text swap preservation (2), view no-double-fire (1), tic-tac-toe zero-import scan (1).
