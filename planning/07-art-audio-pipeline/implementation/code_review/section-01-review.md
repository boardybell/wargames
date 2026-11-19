# Media discovery + tools (section-01) review

Reviewer: deep-implement:code-reviewer. FIX-THEN-SHIP. The provenance gate, the two primary drift gates (dimensions, catalog-parity), and the calibration math are real and honest — the foundation is sound. But three gated tests lie by construction (they stay green after their exception is pulled with no asset shipped), which is precisely the failure this section exists to prevent, and a fourth gate cannot grow.

## HIGH (the gate lies)
- **H1. base-url.test.ts has no fail-when-exception-removed property.** It type-checks placeholderSlots strings and greps imageSource(...) literals; nothing cross-references the REAL registry slot set against the exception list, so a de-excepted slot with no image shipped stays green. FIX: import the real registry, enumerate every ArtSlotId entry, and for each slot NOT on placeholderSlots assert its resolved source.kind === 'image' AND its urlFor()-resolved URL starts with BASE (no raw absolute). Mirror the dimensions.test.ts gate exactly (iterate ALL slots, fail on !present && !excepted).
- **H2. The phonetic-leak guard is a tautology** (`expect(line.text).toBe(line.text)`), skipping excepted ids and comparing nothing for the rest — it can never fail even with the exception list emptied. FIX: for every voiceClipId NOT excepted, locate the registered file cue / shipped transcript and assert transcript === catalog line.text; a de-excepted id with no cue/transcript must throw.
- **H3. The opus/AAC check is vacuous and fake.** It only enters the body for file+voice cues (all voice cues are synth placeholders now, so never), is keyed on the manifest not the exception list, and asserts `aac.endsWith('.aac')` on a string rewrite (always true, never checks the file exists). FIX: drive it off the catalog-minus-exceptions set; require each de-excepted voice clip to carry a file source with a real .opus primary AND assert the sibling .aac exists on disk (existsSync).

## MEDIUM
- **M1. memory-budget cannot grow.** decodedEstimate returns the same constant whether the file exists or not, so the sum is effectively one worst-case clip forever and can never breach as section 03 adds eager files. FIX: count one worst-case estimate PER eager file cue (the loop already visits them) so the total actually grows against the 8 MB ceiling.
- **M2. provenance runtime sanity is substring-fragile.** The sanity verdict scans codex stdout with `text.includes('PASS')`, so a reply like "I cannot bypass safety" false-passes. FIX: exact-token match (trimmed stdout === 'PASS', or the last word is PASS). (The provenance.mjs checklist itself is solid and honestly unit-tested — this is only the runtime feeder.)
- **M3. .gitignore divergence.** The plan lists root .gitignore under Modify and the hygiene test asserts media/src/ + media/audition/ + media/intake/ are ignored, but the diff only DELETES media/.gitignore and relies on pre-existing root rules. Include the root .gitignore change in this section (or note it landed earlier), and confirm no stray probe artifacts land outside media/src/.

## LOW
- L1. discovery.json sets image-generate rung 1 while the plan's seeded template showed all pending — internally consistent and honest (a real rung-1 probe ran), no fix.
- L2. overlay-zones.json _comment references a module contact-sheet.mjs does not read; cosmetic.
- L3. calibrate.html imports ./calibrate-core.js with no build step shown; the never-shipped page will not run until the .ts is compiled. Note it or make it loadable (per done-means-working), but it is outside the CI gate.

## PASS (verified honest)
Dimensions gate parses the real ArtSlotId union (exactly 13, no strays) and fails on !present && !excepted. Catalog-parity imports the real JOSHUA_LINES, existsSync-checks clips, fails on neither-rendered-nor-excepted, rejects stale exceptions; 19 exception ids match 19 catalog entries. calibrate-core delegates to the real computeGlassRect (no reimplementation) with exact-fraction + exact-overlay-pixel assertions. provenance.mjs fails each branch, unit-tested for not-a-raster/trivial-dims/absent-verdict/failing-verdict, and a rung-1 record with any hole is rejected. loop-join keyed on roomLoopPending. No em-dashes; dark-readout text present verbatim in the countdown-insert + failsafe-wall requests.

## Bottom line
Fix-then-ship. Rewrite H1/H2/H3 to iterate the real registry/catalog-minus-exception set and assert existence on disk (and PROVE each fails when an exception is pulled with no asset), fix M1 so the memory sum grows, tighten M2 to an exact-token sanity match, reconcile M3. Then it lands.
