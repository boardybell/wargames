# Code Review: 02-terminal-shell / section-05-hero-pushin

Reviewer: deep-implement code-reviewer subagent (adversarial).

Confirmed correct: glass-rect cover geometry (all cases, object-position,
frozen-safe); push-in animates only transform/opacity, will-change scoped and
cleared; HeroScene accessible name + decorative photo + sound control outside
the button; soundPrompt prompt-layer registration; audio resume port injectable
and single in-memory+localStorage preference; urlFor routing; no em-dashes; no
engine dispatch in the hero tree.

Findings:
- HIGH: hero units not connected (no App/stage wiring), wake-on-arrival untested. FIXED via HeroStage + integration tests; wake handled by init, documented.
- MED: onFinish could never fire (WAAPI). FIXED (safety net). soundPrompt duplicated answer. FIXED (single answer + latch).
- LOW: ended routed to hero. FIXED (to engine). resize recompute missing. FIXED.
- Documented: live App/main boot is ctx-gated (missions, splits 03-06); module-level push-in guard; pointerUp+click double resume.

See section-05-interview.md for dispositions.
