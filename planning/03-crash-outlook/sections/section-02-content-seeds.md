# Section 02: Content and Seeds

Authored outlook mission payloads for all three curated seeds, the content validator that turns authoring mistakes into CI failures, and the integration of those payloads into each SeedDefinition. This section is content plus validation logic only. The mission module, rules, and types it validates against come from section-01-module-rules; the screens that render this content come from section-03-screen-views and are not needed here.

## Background

CRASH OUTLOOK is mission 1 of a React/Vite terminal game. A headless deterministic engine (src/engine/) owns all state; missions are pure MissionModule implementations receiving seed payloads. Authored content lives in SeedDefinition.missionPayloads.outlook per seed. There are three curated seeds. The fixture seed embeds these canonical anchors: record C17, EXERCISE provenance, run R04, event time 21:14:00, receipt time 21:14:05. Seeds two and three mirror the fixture seed's structure with different incident flavor and their own equivalent record ids.

The mission: an inbox triage puzzle under a real-time deadline. Twelve messages arrive; three carry required routings (weather, payroll, audit), the rest are decoys, stale duplicates, and an exercise bulletin. The player routes messages over a primary channel (unlimited send count, stage-dependent ETA, goes dark at stage 2) and a backup channel (hard capacity of five sends, fixed ETA). Correct play requires reading evidence inside message bodies, not trusting recipient hints.

Section-01 provides the types this content must satisfy, notably:

    interface OutlookMessage {
      id: string              // 'M01'..'M12'
      from: string            // sender authority line
      to: string | null       // visible recipient hint, may be absent
      subject: string
      body: string[]          // evidence lives here
      recordId: string | null // link into the evidence graph (C17 etc.)
      requiredKind: 'weather' | 'payroll' | 'audit' | null
      correctRecipient: DeskId | null   // authored truth for evaluation
      supersededBy: string | null       // the correction chain
    }

The payload type (declared in src/engine/missions/outlook/content.ts by section-01, or declared here if section-01 left it stubbed) carries the twelve messages, channel tuning (backup capacity five, primary ETAs per stage, backup ETA), and stage-change offsets. All tuning values are integers; the engine has no floats anywhere.

One binding architectural rule from plan review: desk-check outcomes (what CHECK SOURCE returns for a record) do NOT live in the outlook payload. They live in the shared SeedDefinition deskChecks table keyed by record id, which is engine-owned. This section authors deskChecks entries for the records its messages reference, but in that shared table, not inside missionPayloads.outlook.

## Files

Create or modify:

- src/engine/missions/outlook/content.ts: payload type (if not finalized by section-01) and the content validator functions. The validator is pure and exported so tests and seed validation both call it.
- Seed definition files (wherever splits 01/02 placed the three SeedDefinition objects, likely src/engine/seeds/ or src/content/seeds/; locate with a grep for SeedDefinition before writing): add missionPayloads.outlook to each of the three seeds and add deskChecks entries for every recordId referenced by outlook messages.
- test/engine/missions/outlook/content.test.ts: validator and authoring tests.
- test/engine/missions/outlook/solvability.test.ts: the two solvability invariants per seed, run through the real module lifecycle from section-01.

## Tests first

All engine-side, node Vitest project. Write these before authoring content; they define done.

Content validator suite, parameterized over all three seeds (test.each over the seed list):

- Exactly one NON-SUPERSEDED message with a non-null correctRecipient per requiredKind (weather, payroll, audit). Duplicates of a required message are modeled as superseded, so superseded messages may also carry correctRecipient; only the live head of each chain counts.
- Twelve messages exactly, ids M01 through M12, unique.
- The audit message's recordId carries the R04 export reference (seed-equivalent run id for seeds two and three). This is one assertion.
- The bulletin's TRACE reaches C17 (or the seed-equivalent record). This is a separate assertion; do not merge the two.
- Supersession chains resolve acyclically: every supersededBy points at an existing message id, no cycles, chains terminate at a live message.
- All channel tuning values are integers: backup capacity (must equal 5), primary ETA per stage, backup ETA, the three stage-change offsets. Stage offsets strictly increasing and inside the mission duration.
- Every non-null recordId appearing in the messages has a corresponding entry in the shared SeedDefinition deskChecks table.
- Required messages carry non-empty body evidence (evidence fields present per the structural checklist below).

Substate shape tests (shared with section-01's saveSchema; add here only if section-01 did not):

- saveSchema round-trips reference-only substate; schema rejects any attempt to embed message bodies in the save (byte-budget discipline: substate is ids, marks, send records only; bodies live exclusively in the immutable seed payload).

Solvability invariants, per seed, through the real engine and module:

- Adversarial send-everything fixture: a scripted run that sprays sends at every message without reading evidence provably ends below tier 3. Drive the module lifecycle (init, dispatch SEND actions until capacity and stages block further progress, advance to timeout, evaluate) and assert the tier.
- Walkthrough fixture: a scripted action log that reads the evidence, routes the three required messages to their correct recipients on viable channels, provably reaches tier 3 (all three correct acknowledged deliveries) with margin, defined as at least one spare backup slot remaining at settlement.

Authoring spot checks on the fixture seed (assertions over the authored data, not prose review):

- The payroll thread's approval chain names the correct desk inside body lines (assert the correctRecipient desk string appears in the body of the live payroll message).
- The weather correction cites a field observation record (assert its recordId is non-null and its deskChecks outcome is the confirming one).
- The bulletin repeats the correction's claim with EXERCISE provenance (assert its recordId resolves through the deskChecks table to an EXERCISE-provenance outcome reaching C17).
- Misleading recipient hints are present on stale duplicates: at least one superseded duplicate of a required message carries a to hint that differs from the authored correctRecipient. This is deliberate design, confirmed in review; the test locks it in so a future cleanup pass does not "fix" it.
- The fixture anchors are present verbatim where they belong: C17, EXERCISE, R04, 21:14:00 event time, 21:14:05 receipt time.

Run equivalent structural spot checks for seeds two and three against their own equivalent anchors (parameterize where possible; hardcode the per-seed expected record ids in a small table at the top of the test file).

## Implementation

### 1. Payload type and validator (content.ts)

If section-01 finalized OutlookPayload, use it. Otherwise declare it here:

    interface OutlookPayload {
      messages: OutlookMessage[]        // exactly twelve
      tuning: {
        backupCapacity: number          // always 5
        primaryEtaByStage: [number, number]  // stages 0 and 1; stage 2 is dark
        backupEta: number
        stageOffsets: [number, number, number] // offsets from mission start
      }
      tierConsequence: ...              // commsDelayed magnitude per tier
    }

    function validateOutlookContent(
      payload: OutlookPayload,
      deskChecks: DeskChecksTable,
      anchors: SeedAnchors              // per-seed expected record/run ids
    ): ContentError[]                   // empty array means valid

Return a list of structured errors rather than throwing, so the test output names every authoring mistake in one run. Each check from the test list above is one validator rule. The solvability invariants are NOT validator rules; they run as fixture tests because they need the module lifecycle.

### 2. Authoring the fixture seed (twelve messages)

Write the messages so every required routing decision is decidable from in-message evidence under time pressure. Structural mix:

- M-weather pair: a stale weather advisory (superseded) with a misleading recipient hint, and its correction citing a field observation record. The correction is the live required weather message; its body cites the observation record id, and the deskChecks entry for that record confirms it as OBSERVED.
- M-payroll thread: two or three messages forming an approval chain; the live head carries the approval evidence naming the correct desk in its body. Earlier thread entries are superseded decoys.
- M-audit message: references run R04 and the export feed. This body is the D-83 clue vector; reading it triggers the clue via the module's clues() selector (section-01 behavior; this section only guarantees the authored reference is present and the recordId is correct).
- Exercise bulletin: repeats the weather correction's claim but with EXERCISE provenance; its TRACE chain reaches record C17, and CHECK SOURCE on it returns CONTRADICTED via the deskChecks table while the real correction returns CONFIRMED.
- Remaining slots: plausible decoys with sender authority lines that name desks, some with recipient hints, none with requiredKind. They must be tempting enough that the adversarial fixture spends capacity on them.

Copy rules: all uppercase terminal diction, no em-dashes anywhere, invented names only (no real people, places, or institutions). Sender authority lines name desks so the inbox list alone suggests (sometimes wrongly) a routing.

### 3. Seeds two and three

Same structural mix, different incident flavor, their own record ids and run ids standing in for C17 and R04. Define each seed's anchors in one place (the SeedAnchors object passed to the validator) so the validator and the tests share a single source of truth. The content validator runs unchanged across all three.

### 4. deskChecks entries

For every recordId referenced by an outlook message in a given seed, add an entry to that seed's shared deskChecks table: the bulletin's chain yields CONTRADICTED with EXERCISE provenance reaching C17 (or equivalent); the weather correction's observation record yields CONFIRMED with OBSERVED provenance; the audit record carries the R04 export reference. The table schema is owned by the engine (split 01); this section only populates rows.

### 5. SeedDefinition integration

Attach each payload at missionPayloads.outlook on its SeedDefinition. Seed validation tests (the existing per-seed validation pass from split 01, plus the new validator here) must run the outlook content validator for every seed. Wire that by exporting validateOutlookContent and calling it from the content test suite parameterized over the seed list; if split 01 established a central seed-validation registry, also register the validator there.

### 6. Walkthrough and adversarial scripts

Author the two scripted action logs per seed as fixture data (an ordered list of mission actions with advance offsets), stored next to the solvability tests. These scripts are reused by section-04-fixtures-polish for its CI fixture matrix; keep them exported from a shared fixture module (for example test/engine/missions/outlook/fixtures.ts) rather than inlined in one test file. The walkthrough must route all three required messages correctly with at least one backup slot spare; the adversarial script must send indiscriminately and fail. Do not hand-tune tuning values to make these pass; if an invariant fails, the content or tuning is wrong and must be re-authored, because these two invariants are the difficulty contract for the whole mission.

## Dependencies

- section-01-module-rules must be complete: types, rules, module registration, clues() selector, and the saveSchema. The solvability tests drive that module through the engine.
- Splits 01 and 02 (engine and shell) are prerequisites of the whole mission split; this section additionally touches the shared SeedDefinition files and deskChecks table from split 01.
- section-04-fixtures-polish consumes the walkthrough and adversarial scripts authored here; export them cleanly.

## Done when

npm test passes with: the content validator green across all three seeds, every authoring spot check green, the adversarial fixture below tier 3 and the walkthrough at tier 3 with a spare backup slot for each seed, and no message body bytes present in any saveSchema round-trip.