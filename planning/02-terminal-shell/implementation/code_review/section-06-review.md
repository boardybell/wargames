# Code Review: 02-terminal-shell / section-06-overlays-settings

Reviewer: deep-implement code-reviewer subagent (adversarial).

Confirmed: loadCampaign empty-vs-present-vs-error (existing save guarantees
preserved); pause (no faked pause, typed forfeit, Escape backs out of confirm,
opens from Escape + MENU); settings single-master-backing + extended-time lock
+ reduce-glow class + New Campaign opens dialog; new-campaign three seeds no
free input; help context-sensitive; precedence dialog-layer consumes keys; no
em-dashes; no raw asset paths; dispatch allowlist (FORFEIT/NEW_CAMPAIGN/
SET_PREFERENCE only).

Findings:
- HIGH: CorruptSaveNotice unmount-on-dismiss stranded dialogOpen true -> app-wide
  key lockup on the real recovery path. FIXED (keep-mounted close + Dialog
  unmount safety net + regression test).
- MED: dialog.css never imported. FIXED. Dialogs mounted inside screen root
  instead of outside. FIXED (sibling).
- LOW: COPY typing; initialFocus effect dep. Fixed/documented.

See section-06-interview.md for dispositions.
