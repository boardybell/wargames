# Review Triage: section-08-save

Mode: autonomous (standing no-more-questions directive). The round-2 review
was strong and largely correct; all three HIGHs were real violations of the
section's core promise (no load path can unsettle a mission or roll a
campaign backward). Dispositions below.

## Fixed

- **HIGH 1 (cross-lineage settleSeq).** Removed `bySettleOrder`. The merge
  is now by source priority, not by seq: when the live session is present
  it is authoritative, and a loaded save may only ADD settlement facts for
  missions the session never settled. settleSeq is kept only as a
  within-lineage stamp (ordering + the settleCounter floor), never compared
  across sources. New test: in-session wins at an EQUAL settleSeq.

- **HIGH 2 (discarded live state).** mergeGuard now bases the result on the
  in-session state when present (`const base = inSession ?? loaded`); the
  loaded save contributes only additive settled facts and unioned markers.
  A stale backup can no longer replace the live rng, clock, queues, or
  active mission. Fresh boot (inSession null) still bases on loaded and runs
  self-consistency.

- **HIGH 3 (quota corruption).** persistCampaign snapshots the prior good
  primary, double-buffers it into backup before overwriting, and on total
  failure restores the prior primary so the slot is never left torn.

- **MED 4 (backup strategy).** Switched to a true double buffer: the prior
  good primary moves into backup before the new primary is written, so
  backup trails one generation and offers real rollback. Documented in the
  function comment. New test asserts the trailing-generation invariant.

- **MED 5 (write-side substate).** persistCampaign now round-trips the
  payload through decodeSave (which composes the mission saveSchema) and
  reports INVALID STATE before writing. New test: a broken substate is
  rejected at write, and the primary slot is never touched.

- **MED 6 (version pin).** savePayloadSchema.version is now
  `v.literal(CURRENT_VERSION)`; a mis-versioned post-migration envelope
  fails at parse.

- **LOW 9 (counter regression).** mergeGuard lifts settleCounter above the
  highest imported settleSeq. New test.

- **LOW 10 (strict schemas).** All closed schemas in state.ts are now
  v.strictObject; the only opaque slots (scheduled-event payload, mission
  substate) remain v.unknown VALUES inside closed key sets.

## Conscious deviations (not fixed, documented)

- **MED 7 / MED 8 (file and test-file split).** The plan named seven source
  files and six test files. Shipped as one cohesive index.ts and one
  save.test.ts. Every function the plan isolated is individually exported
  from @engine/save, so section-10's fc.commands suite can import mergeGuard
  directly — the testability the split existed to protect is intact. The
  substantive coverage the split implied was added regardless: composed-codec
  loader fallthrough, merge idempotence, and the equal-seq collision. The
  file-count deviation is organizational and recorded here rather than
  absorbed silently.

- **LOW 11.** Informational; decodeSave deliberately composes only the one
  live substate, consistent with the plan. No settled substate exists to
  validate. No change.

## Post-fix verification

tsc --noEmit: 0 errors. eslint: 0. Tests: 183 green (was 176; +7 net new
covering equal-seq, additive-load, idempotence, counter floor,
double-buffer, prior-restore, write-side substate, composed-codec
fallthrough). A confirming adversarial review was run on the final diff.

## Confirming review (round 3)

A third adversarial pass confirmed all three HIGH fixes hold under a manual
walk (equal-seq, additive, quota-twice, non-quota-throw, idempotence both
branches) and found no new HIGH. Two MEDs addressed:

- **MED-1 (additive side-effect skew).** A loaded save adding a settled
  mission the session never saw inserted the outcome but not its clue into
  cluesFound. Fixed: mergeGuard now folds cluesFound as a monotonic union
  over the merged settled set, so an imported outcome's clue is always
  recorded. New test proves the fold derives from the outcome, not from
  copying the loaded clue list. (Consequence markers were already covered by
  the existing appliedConsequences union.)

- **MED-2 (double full-parse on persist).** persist validated by round-
  tripping the whole 64 KB payload through decodeSave. Fixed: extracted
  validateActiveSubstate() and call it directly, composing only the active
  mission schema — the one thing encodeSave leaves opaque. decodeSave reuses
  the same helper. Cheaper on the shell's hide/pagehide flush path.

- **LOW-1.** Documented the per-key atomic-write assumption on the
  StoragePort interface (the persist rollback relies on it; localStorage
  satisfies it). LOW-2 confirmed clean, no action.

Final: tsc 0, eslint 0, 184 tests green.
