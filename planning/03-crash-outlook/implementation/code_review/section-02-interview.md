# Section 02 review triage

Standing directive: full autonomy. All HIGH and MEDIUM findings are real and get fixed; LOWs too (cheap). The validator negative suite, verbatim anchors, and real-module solvability harness are sound and stay.

## Fix
- **H1 + H2 (audit vs bulletin record; evidence contradiction).** Separate the two anchors: `bulletinRecordId` stays the EXERCISE/CONTRADICTED decoy record (C17-equiv); the audit message gets its OWN distinct export record that resolves to a NON-contradicted outcome, so a player who reads the evidence and runs CHECK SOURCE on the audit's record gets a signal consistent with routing it to AUDIT_DESK. Keep the run R04 + export-feed reference in the audit BODY (that is the D-83 clue vector; the clue fires from reading, not from the deskCheck). The validator's AUDIT_EXPORT_REF and BULLETIN_TRACE rules now key off DIFFERENT records. Prefer reusing an existing non-EXERCISE seed record (DERIVED or OBSERVED) for the audit to preserve the seed's record-provenance count invariant (1 EXERCISE / 2 DERIVED / 2 OBSERVED); if that is infeasible, adjust the seed records minimally and update the seed-validation test with care. SeedAnchors stays the single per-seed source of truth, now with separate audit and bulletin record ids.
- **H3 (vacuous margin).** Make the difficulty-contract margin load-bearing: drive the walkthrough (or a dedicated solvability scenario) down a path that actually spends backup capacity (e.g. advance so the primary has slowed/darkened and at least one required route must go on backup), and assert `backupRemaining < 5 AND >= 1` at settlement, proving the viable path leaves a real but finite margin. Do not hand-tune tuning to force it; if no viable path consumes backup, the tuning/content is too loose and must be re-authored.
- **M1.** BULLETIN_TRACE must actually walk the record graph: follow parentId to the C17-equiv, confirm EXERCISE origin, and confirm the deskChecks outcome is CONTRADICTED. Add a negative test (bulletin pointing at a CONFIRMED record fails).
- **M2.** Replace/augment the adversarial fixture with a "trust the visible hints" run that routes each message to the desk its `to`/sender line suggests and still settles below tier 3, proving the decoys defeat a naive player. Keep a spray variant too if useful.
- **M3.** Add negative tests for the authoring spot checks (break the payroll-desk-in-body, the weather CONFIRMED citation, the bulletin EXERCISE/CONTRADICTED resolution, the misleading hint, and a verbatim anchor) so copy-edit rot fails loudly.
- **L1.** Spread `seed.missionPayloads` and override only `outlook` in the test context builder.
- **L2.** Thread the mission duration into the validator and assert every stage offset is strictly inside it.
- **L3.** Wire OUTLOOK_DESKS into the payroll spot check or drop it.

## Done when
Engine project green again with the strengthened tests genuinely load-bearing (no vacuous/circular assertions), tsc + eslint clean on the engine files, no regression to the pre-existing engine tests, and the source-checking lesson internally consistent (reading evidence + CHECK SOURCE never tells the player to NOT route a required message).
