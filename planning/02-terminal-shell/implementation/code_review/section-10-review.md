# Art slots + tic-tac-toe (section-10) review

Reviewer: deep-implement:code-reviewer. urlFor discipline honored, minimax genuinely optimal (always a 9-move draw, lowest-index tie-break deterministic, boardAfter pure). Real gaps below.

## HIGH
- **1. The deferred preload trigger is never wired.** `preloadSlot(id)` exists but nothing calls it; `ArtSlot` has no effect, so a `deferred` slot is never warmed on its first stable view. The central deferred-loading behavior is absent and untested.
- **2. TicTacToeView done-latch can double-fire across prop changes.** The reveal effect resets `doneFired` on every run (deps `[total, reducedMotion, stepMs]`) while the completion effect reads it (deps include `onDone`). A prop change after completion (e.g. a reducedMotion flip, or an inline onDone identity change) can reset the latch and re-fire `onDone`. Same class as the earlier branch-trace latch.

## MEDIUM
- **3. swapArtSource does no validation.** The media-split mutation is unguarded (though text is structurally preserved, so an image with no description cannot actually arise through swap). Cheap to add a dev guard.
- **4. HeroCrop values are hand-duplicated and the swap test does not assert heroCrop/text survive.** registry.ts copies glass/greetingAnchor from hero/heroCrop.ts by hand (two sources of truth that will drift when the calibration tool refines hero/heroCrop.ts). The swap test asserts only aspectRatio and priority.
- **5. Reserved space relies solely on CSS aspect-ratio.** An engine not honoring aspect-ratio would collapse the slot. Target browsers (GitHub Pages, modern evergreen) all support aspect-ratio, so kept with a documented assumption.

## LOW
- **6.** preloadForMission ignores its missionId (warms all three briefing slots). Matches the plan literally; param kept for future per-mission targeting.
- **7.** The default loader's `new Image()` is not retained, so GC may reclaim it before the prefetch completes.
- **8.** No test enforced the tic-tac-toe zero-import constraint (it is clean by inspection).

## Fixes applied
1: ArtSlot self-triggers `preloadSlot(id)` on mount for deferred slots (accepts an optional loader for testing); test added. 2: TicTacToeView latches on a move-signature and resets `doneFired` only when the signature changes, not on stepMs/reducedMotion; test added that a post-completion prop change does not re-fire onDone. 3: swapArtSource validates the resulting entry in dev. 4: registry heroCrop derives from hero/heroCrop.ts HERO_CROPS (one source of truth); swap test now asserts heroCrop and text survive. 7: the default loader retains the Image until load/error. 8: a source-scan test asserts tictactoe.ts imports nothing from state/engine. 5/6 kept with rationale.
