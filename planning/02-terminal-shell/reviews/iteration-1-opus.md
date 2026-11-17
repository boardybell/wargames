# Opus Review

**Model:** claude-opus (opus-plan-reviewer subagent)
**Generated:** 2026-11-17T23:11:43Z

---

# Architectural Review: 02-terminal-shell (claude-plan.md)

Reviewed against claude-spec.md, claude-research.md, claude-interview.md, the project manifest, and the engine plan at 01-simulation-core/claude-plan.md (rev 2). This is a strong, coherent plan. The engine binding discipline is correct, the CRT research is sound, and the accessibility spine is unusually complete for a game shell. The issues below are the gaps worth closing before implementation.

## Engine-contract mismatches (highest priority)

**1. The plan invents an "event bus" the engine does not promise.** Section 3 and the audio/a11y sections lean heavily on "engine-produced events from drains (timer milestones, settlement, lamp transitions)" delivered "exactly once per engine event." But the engine plan nowhere describes an event-emission channel. The engine plan exposes pure functions returning new state (dispatch, advanceToNow) and pure selectors. There is no event stream. advanceToNow in the engine "drains both queues... deleting each event as it is processed" and returns state; it does not return a list of what it drained. This is a real contract hole. Right now the shell has two options and the plan does not pick one:
   - Diff consecutive states (compare prev vs next selectors) to synthesize events. This is fragile for "fires exactly once" because a reload mid-drain, or a coalesced catch-up that crosses three milestones at once, produces ambiguous diffs.
   - Require the engine to return a drained-event list from dispatch/advanceToNow. This is a change to split 01's public API.

   This needs to be resolved as an explicit engine-contract amendment, not assumed. Recommend: ask split 01 to have dispatch and advanceToNow return `{ state, emitted: EngineEvent[] }` where emitted is the ordered list of milestone/settlement/lamp events materialized during that call. This keeps "exactly once" structural (tied to the same drain that deletes the queue event) instead of reconstructed by the shell.

**2. "lamp transitions" and "timer milestones" are shell concepts, not engine concepts.** The engine plan emits nothing named "lamp transition." LampController (section 8) is told to map "engine events (phase change, settlement, branch run, finale final phase)." Phase change is observable (state.phase), settlement is observable (settled array grows), but "finale final phase event" and "timer milestones" (section 9 timer warning cues) have no named source in the engine. Milestones in particular: who defines the milestone schedule, the shell or the engine? If the shell, it is guessing at wall-clock boundaries, which the plan explicitly forbids. If the engine, the engine must emit them. Pin this down.

**3. `selectMenuRows` unlock timing vs the shell's "hidden fourth row."** The shell must actually dispatch ACKNOWLEDGE_DEBRIEF from the debrief screen. The plan mentions ACKNOWLEDGE_DEBRIEF nowhere in the shell's screen/primitive list. The debrief frame (section 6, screens/) needs an explicit "acknowledge" affordance wired to that action, or the finale never unlocks. Add it.

**4. Branch animation "step trace" format is undefined at the seam.** runBranch returns "a short step trace the shell can animate and skip". The shell plan's grid and cabinet sections never describe consuming it. The shape of the step trace (what each step contains, how the grid maps it) is an interface the shell must define now so 06 can fill it, exactly like art slots and cue manifest. Define a `BranchStepTrace` consumption interface.

## Footguns and edge cases

**5. The repaint-ticker self-wake (section 3) can double-fire or thrash.** The guard must be per-deadline (per endsAt instance), not a single app-level "settled" flag, or the finale's expiry will not self-wake because the mission-level guard already tripped. Specify the guard keys on the current active endsAt.

**6. Date.now() is non-monotonic; the engine clamps, but the shell's display clock does not.** If the wall clock jumps backward, the displayed countdown jumps backward or gains time while the engine refuses to un-expire. Clamp the display clock to the same high-water mark, or derive display remaining from the last engine-clamped now plus a performance.now() delta. rAF timestamps (monotonic) are the right source for the smooth display, reconciled to engine state on each wake. Mixing rAF scheduling with Date.now() values is the bug.

**7. localStorage writes from multiple tabs will corrupt or resurrect state.** Two tabs of the same game: Tab B flushes stale state on pagehide, overwriting A's progress. The engine's monotonic-merge guard protects loads, not a live second tab writing primary. Add a `storage` event listener showing a "game open in another tab" notice, or a BroadcastChannel lock. At least name the single-tab assumption as a known limitation.

**8. The 500 to 800 ms debounce can lose the final state on hard navigation.** The forfeit action and START_MISSION should flush immediately (irreversible phase transitions), not debounce. The plan only names settlement as an immediate flush. Add phase-transition actions to the immediate-flush set.

**9. AudioContext resume synchronously for all four input paths.** Activation fires from click, tap, Enter, AND Space. Verify resume is in the actual event handler synchronously for all four input paths, not deferred via requestAnimationFrame. Make the test assert resume() was called synchronously in each.

**10. "Any key completes the type-in" collides with menu shortcuts and the Y/N sound prompt.** If the type-in is running and the user presses "1", does it complete the type-in or select row one? If the sound prompt shows, does "Y" answer it or skip the type-in? Define a strict input-precedence stack between (dialog, Y/N prompt, type-in skip, menu shortcut, global).

**11. `prefers-reduced-motion` change mid-push-in.** State that in-flight animations complete; only subsequent ones honor the new preference.

**12. Portrait/desktop crop swap during push-in.** If orientation changes during the push-in, currentSrc changes and the running animation targets stale geometry. Either lock orientation handling during the 700 ms window (ignore and finish) or recompute and restart. Pick one.

## Missing considerations

**13. Command grammar is underspecified.** No tokenization rule, case-sensitivity rule, or namespace resolution between shell and mission verb sets. Define: verb namespace resolution, case-folding, and the exact rejection string format. Without a grammar, "identical engine actions from command and button" is untestable.

**14. The glossary/hover-definition and web-output-cache house rules are absent.** Per the operator's global Web UI Rules: (a) cache outputs and never greet a return with an empty state (arguably satisfied by save-resume; state the mapping explicitly), and (b) hover definitions for every technical term (OPEN EXCEPTIONS, TRACE, CHECK SOURCE, DERIVED/OBSERVED/EXERCISE, independent corroboration, STAGED RECOVERY are exactly such terms). The plan should add a glossary/term-definition primitive (focusable, tap-friendly, Escape-closes) or explicitly record a decision that diegetic HELP replaces it. Right now it is a silent omission of a global rule.

**15. Font loading failure path.** Is VT323 self-hosted or fetched from Google (external request, against the no-tracking posture)? Self-host VT323 too, or the fallback is a network dependency. State it.

**16. Extended-time lock timing.** The shell must derive "has any mission ever started" from state; verify the derivation is total, or add an observable campaign-begun marker to the engine.

**17. `inert` / background-countdown interaction with the pause dialog.** Confirm the live regions are siblings of the dialog, not descendants of screen roots, so assertive announcements still fire while a modal is open. Make explicit.

**18. Seed selection in New Campaign.** Confirm the dialog presents exactly the three named seeds with descriptions and no free seed input.

## Performance

**19. The character grid as DOM text rows at finale scale.** A large grid of individually-shadowed spans is a known repaint cost under the breathing-glow animation. Cap per-cell shadow layering or apply the glow to the grid container rather than per cell; include a grid-size figure in the manual perf smoke.

**20. file-cue "pre-decoded on manifest load" with no budget.** Decoding all voice lines up front holds them as PCM in memory. Add a decode strategy: effects eager, voice lazy; add `preload: 'eager' | 'lazy'` per cue so split 07 can tune without touching call sites.

## Smaller items

**21. Contrast at the vignette's darkest point.** The AA check was done against flat #050A14; measure at the vignette's worst case.

**22. Announcer coalescing rule.** Assertive channel never coalesces; polite coalesces. Define what happens to rapid distinct strings (concatenate, queue, or latest-wins).

**23. Y/N prompt and settings master toggle must share one backing value.** List master as the single persisted value behind both controls.

**24. Test-double mission coupling.** The engine plan keeps the test-double in test/engine/ but does not export it for downstream consumers. If it lives only there, the shell cannot import it. Add an explicit engine export or a shared test fixture path.

## Summary

The blocking items before coding are the engine-contract gaps: the event-emission channel (1), milestone ownership (2), the branch step-trace interface (4), and ACKNOWLEDGE_DEBRIEF wiring (3). Next tier: input precedence (10), display-clock monotonicity (6), multi-tab save hazard (7), command grammar (13). The missing hover-glossary (14) is a standing house-rule violation worth a deliberate decision rather than silent omission.
