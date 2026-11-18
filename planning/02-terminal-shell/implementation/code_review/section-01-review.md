# Code Review: 02-terminal-shell / section-01-app-scaffold

Reviewer: deep-implement code-reviewer subagent.

Verified correct: config isolation (engine project untouched), additive
tsconfig, runtime deps limited to react/react-dom, fonts present, no
em-dashes, no external origins, overlay router model, extensible App root.

Findings:
- HIGH-1: no-raw-paths scanner failed open on backtick templates and
  concatenation (the forms sections 07/10 will use). FIXED.
- MED-2: urlFor empty/root inputs untested. FIXED.
- LOW-6: main.tsx silently no-ops on missing #root. FIXED.
- Confirmed-correct (no change): coverage scoped to src/engine; React plugin
  global is a node no-op; built-html non-vacuous.

See section-01-interview.md for dispositions.
