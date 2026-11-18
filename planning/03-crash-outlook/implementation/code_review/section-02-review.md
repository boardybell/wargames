# CRASH OUTLOOK content + seeds (section-02) review

Reviewer: deep-implement:code-reviewer. Validator 9-code negative suite is solid, the solvability tests DO drive the real module (createCampaign/dispatch/advanceCampaign), the adversarial run genuinely loses (tier poor), anchors appear verbatim, integer/diction/invented-names/reference-only all pass. But the difficulty contract and the source-checking lesson are undermined.

## HIGH
- **H1. Audit and bulletin collapsed onto the SAME anchor record.** payloads.ts sets exportRecordId === bulletinRecordId per seed (C17/C17, A09/A09, E22/E22); M05 (audit) and M06 (bulletin) both carry recordId C17. The spec forbids conflating the audit-export and bulletin-trace assertions; the validator's AUDIT_EXPORT_REF and BULLETIN_TRACE rules now key off one identical record and are the same check.
- **H2. The audit required routing contradicts its own evidence.** M05 must be routed to AUDIT_DESK to win, but its recordId C17 resolves in deskChecks to CONTRADICTED/EXERCISE. A player who reads evidence and runs CHECK SOURCE (the mission's whole lesson) gets a "contradicted / exercise artifact" signal on the exact record the required win cites, while the bulletin M06 (same record) is the thing they must NOT route. Same CHECK SOURCE result, opposite correct actions. The weather side is consistent (M01 -> W02 CONFIRMED/OBSERVED); the audit side inverts the contract.
- **H3. The spare-backup-slot margin assertion is vacuous.** The walkthrough routes all three required messages on primary at stage 0 and never issues a backup send, so backupRemaining is always exactly 5; `>= 1` can never fail. The spec made this margin the difficulty contract; as written it proves nothing about tightness.

## MEDIUM
- **M1. BULLETIN_TRACE is pointer equality**, not a trace: it checks recordId === anchor, never walks parentId, never checks EXERCISE origin, never consults the deskChecks outcome. A bulletin pointing at a CONFIRMED record would pass. The EXERCISE/CONTRADICTED property is only a happy-path spot check with no negative test.
- **M2. The adversarial fixture sprays to one hardcoded desk** (tier poor, valid "below 3" proof) but is degenerate: it never drives a "trust the visible hints" run, which is the decoy trap the content was authored for (M02 hint AUDIT DESK, M04 to:null). It proves engine math, not that the decoys defeat a naive player.
- **M3. The authoring spot checks have no negative tests** (payroll body names desk, weather cites CONFIRMED record, bulletin EXERCISE/CONTRADICTED, misleading hint, verbatim anchors) — only happy paths; several are not validator rules, so copy-edit rot fails silently.

## LOW
- **L1.** fixtures.ts overrides missionPayloads with { outlook } only vs the real four-key map; prefer spreading seed.missionPayloads.
- **L2.** Stage-offset validation checks > 0 and strictly increasing but never "inside mission duration" (no duration passed in); an offset of 9999 would pass.
- **L3.** OUTLOOK_DESKS is exported but unused (payroll spot check hardcodes PAYROLL_DESK).

## Bottom line
Fix H1/H2 by giving the audit its own distinct, non-contradicted export record (separate from the bulletin's C17-equivalent), so reading the evidence and CHECK SOURCE stay consistent with the required routing and the two validator assertions are independent; keep R04/export in the audit body for the clue. Fix H3 so the margin test exercises a path that actually consumes backup capacity. Then M1 (walk the trace + provenance + deskCheck outcome), M2 (trust-the-hints adversarial), M3 (negative spot-check tests), and the LOWs.
