# Code Review: 02-terminal-shell / section-04-terminal-framework

Reviewer: deep-implement code-reviewer subagent (adversarial).

Confirmed sound: grammar normalization + verb-first + screen-shadows-shell +
same-scope collision throw; command-button identity (uniform mechanism);
precedence pure-function ordering and both pinned collisions; MenuRows
single-callback identical action; DOM-absent fourth row; phase->screen
mapping; return-to-menu via engine phase; fourth-row-after-third-ack driven
through the real engine; no em-dashes; no raw asset paths; no engine dispatch
outside src/app/state.

Findings:
- HIGH: precedence stack never wired into a live handler (MenuRows bypassed it). FIXED (inputStack + capture handler + live test).
- HIGH: mission screen not keyed by id. FIXED.
- HIGH: finale START_MISSION. Not a bug (rejection-safe; finale is a split-06 mission module). Documented.
- MED: registerDefaultVerbs non-idempotent + false comment. FIXED.
- MED: duplicated pending-debrief logic. FIXED (shared helper).
- MED: unbounded command output. FIXED (cap).
- MED: focus assertion fragile. Documented (section 09 refines).
- LOW: digit parse via Number(); empty-input message. FIXED.

See section-04-interview.md for dispositions.
