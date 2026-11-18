# Code Review: section-08-save

Reviewer: deep-implement code-reviewer subagent (adversarial pass on the
post-fix diff). Two review rounds ran. Round 1 drove the first-settlement
sequencing and self-consistency work; round 2 (recorded here) found three
genuine HIGH correctness holes that the first pass had not closed.

## Findings (round 2)

### HIGH 1 — settleSeq not comparable across save lineages
`bySettleOrder` picked the lower `settleSeq`, but `settleSeq` is a
per-lineage counter (`state.settleCounter`). A loaded save and the live
session are divergent lineages, so two first-settlements both carry seq 0.
The `<=` tie-break plus seed-from-loaded ordering let the STALE outcome win
the common equal-seq case. First-settlement-wins was defeasible.

### HIGH 2 — mergeGuard discarded the in-session live state
The result spread `...loaded`, so a stale backup's activeMission, rng,
lastNow, and queues replaced the live session's. A single corrupt primary
handed control of the entire live campaign to a stale backup.

### HIGH 3 — quota retry could leave a torn/garbage primary with no backup
On QuotaExceeded the code removed backup and retried; if the retry also
failed it returned ok:false but left whatever the failed first write had
deposited in primary, and backup was already gone. No rollback.

### MED 4 — backup written as the current payload (no real rollback)
After any persist, primary and backup were byte-identical, so backup could
never recover an older state — only a torn write.

### MED 5 — encodeSave did not compose the mission saveSchema
A structurally broken substate was written, read-back-confirmed by string
equality, and reported ok; corruption surfaced only as a silent reset next
session.

### MED 6 — post-migration version not pinned
`savePayloadSchema.version` accepted any integer, so a migration that wrote
the wrong version would validate and load.

### MED 7 — single index.ts, not the plan's 7-file layout
### MED 8 — single save.test.ts, not the plan's 6 named test files; two
required cases (composed-codec loader fallthrough, merge idempotence) were
absent.

### LOW 9 — settleCounter could regress below an imported settleSeq
### LOW 10 — closed schemas were v.object, not strictObject
### LOW 11 — decodeSave composes only the active substate (informational)

See section-08-interview.md for dispositions.
