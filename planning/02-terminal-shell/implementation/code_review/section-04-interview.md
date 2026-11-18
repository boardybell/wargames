# Review Triage: 02-terminal-shell / section-04-terminal-framework

Mode: autonomous. The reviewer confirmed grammar normalization/shadowing/
collision, command-button identity, the pure precedence ordering, MenuRows
identical-action, the DOM-absent fourth row, phase mapping, engine-driven
return-to-menu, and the no-em-dash/no-raw-path/no-external-dispatch rules.
Dispositions:

## Fixed
- **HIGH-1 (precedence never wired live).** resolvePrecedence was a tested
  pure function with no live consumer, so MenuRows' own keydown would have let
  pressing 1 during a type-in select a row. Added src/app/screens/inputStack.ts
  (dialog/prompt/type-in state + handleCapturedKey) and a capture-phase handler
  on the ScreenRouter screen root that resolves precedence FIRST and stops
  propagation when a higher layer consumes, so the key never reaches MenuRows.
  Section 05 plugs the sound prompt (setPrompt) and greeting type-in (setTypeIn)
  into it. New test: a running type-in swallows 1, completing it with no row
  selected.
- **HIGH-3 (mission screen not keyed).** Added key={missionId} to the mission
  and fallback frames so a mission-to-mission change remounts.
- **MED-1 (registerDefaultVerbs not idempotent, false comment).** Guarded with
  a module flag; a second call is a no-op. Added __resetDefaultVerbs for tests
  and corrected the comment.
- **MED-3 (unbounded command output).** Capped at MAX_OUTPUT_LINES (100).
- **MED-4 (duplicated pending-debrief logic).** Extracted pendingDebrief(state);
  DebriefScreen and the ScreenRouter ACKNOWLEDGE command both use it, so the
  button and command provably target the same debrief.
- **LOW (digit parse / empty message).** MenuRows uses /^[1-9]$/; the
  empty-input parse returns a clean UNRECOGNIZED COMMAND.

## Documented / declined
- **HIGH-2 (finale START_MISSION).** Not a bug: the engine returns
  fail('UNKNOWN MISSION') (a rejection, never a throw), and the finale IS a
  mission module that split 06 registers under FINALE_ID; selectMenuRows
  surfaces it as a row, so START_MISSION is the correct entry. Clarifying
  comment added; it rejects harmlessly until split 06.
- **MED-2 (focus assertion couples to the stand-in).** moveFocusTo is a
  section-09 stand-in; the exact-equality assertion is acceptable for now and
  section 09 owns the heading-vs-input refinement.

## Verification
tsc 0, eslint 0, 314 tests green, build clean.
