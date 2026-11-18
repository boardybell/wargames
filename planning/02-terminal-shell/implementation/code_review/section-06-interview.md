# Review Triage: 02-terminal-shell / section-06-overlays-settings

Mode: autonomous. The reviewer confirmed the loadCampaign empty/present/error
distinction, pause (no faked engine pause, typed forfeit, Escape-backs-out),
settings (single master backing value, extended-time lock, reduce-glow class),
new-campaign (three seeds, no free input), help (context-sensitive), precedence
(open dialog consumes keys), and the no-em-dash / no-raw-path / dispatch-allowlist
rules. Dispositions:

## Fixed
- **HIGH (dialogOpen stranded true -> app-wide key lockup).** CorruptSaveNotice
  dismissed by UNMOUNTING, and removing a <dialog open> fires no close event, so
  setDialogOpen(false) never ran and the precedence stack consumed every key
  forever. Fixed two ways: (1) CorruptSaveNotice now stays mounted and closes by
  flipping open on dismiss, so the shared close path lowers the stack; (2) the
  Dialog wrapper gained an unmount cleanup that releases the stack and restores
  focus if it unmounts while open, so no future self-unmounting dialog can
  strand it. New regression test: dismissing the notice returns the captured
  key path from consumed to pass.
- **MED (dialog.css never imported).** Imported in Dialog.tsx (the one component
  every overlay routes through), so the suite is styled in the browser.
- **MED (dialogs inside the screen root).** DialogLayer is now a sibling of the
  screen-root div (outside the focus-managed root), matching the plan's intent
  that overlays sit outside the screen root. The App.tsx dialog-host slot is for
  the ctx-gated live boot.
- **LOW (COPY typing).** Typed as Partial<Record<string,string>>.

## Documented
- **LOW (initialFocus in effect deps).** The open/!open guards make the
  re-renders harmless no-ops; left as is.

## Verification
tsc 0, eslint 0, 361 tests green, build clean.
