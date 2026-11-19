# Section 01 triage (media discovery + tools)

The gate honesty IS this section's product. The three lying gates and the non-growing budget must be made real; the honest gates (dimensions, catalog-parity, provenance checklist, calibration) stay.

## Fix
- H1 base-url.test.ts: rewrite to mirror the dimensions gate. Import the REAL art registry; enumerate every ArtSlotId; for each slot NOT on discovery.json placeholderSlots, assert its registry source.kind === 'image' AND its urlFor()/BASE_URL-resolved URL starts with BASE (no raw absolute). Placeholder-sourced (excepted) slots pass. A slot pulled off the exception list with no image source must FAIL.
- H2 phonetic-leak (audio-manifest.test.ts): replace the `expect(line.text).toBe(line.text)` tautology. For every catalog voiceClipId NOT on missingVoiceClips, find the registered file cue / shipped transcript and assert transcript strict-equals the catalog display text; a de-excepted id with no registered cue/transcript must throw.
- H3 opus/AAC (audio-manifest.test.ts): drive off the catalog-minus-exceptions set (same source as catalog-parity), not the manifest. For each de-excepted voice clip require a file source with a real .opus primary AND assert the sibling .aac file exists on disk via existsSync. Remove the `aac.endsWith('.aac')` string-rewrite tautology.
- M1 memory-budget.test.ts: count one worst-case decoded estimate PER eager FILE cue (not a single collapsed constant) so the total grows as section 03 adds eager files and can breach the ceiling.
- M2 probe-discovery.mjs: the runtime sanity verdict must be an exact-token match (trimmed codex stdout === 'PASS', or the last whitespace-token is PASS), not `.includes('PASS')`, so a reply containing PASS as a substring does not false-pass.
- M3 .gitignore: ensure THIS section's diff establishes the root .gitignore rules for media/src/, media/intake/, media/audition/ (add them if the diff only deleted media/.gitignore and relied on pre-existing root content), and confirm the probe writes only under media/src/ (no stray artifacts outside the ignored paths).
- L3 calibrate.html: add a one-line note (or a tiny build/run instruction) so the never-shipped calibration page is actually launchable, honoring done-means-working; it is outside CI so keep it minimal.

## Re-prove
After the rewrite, PROVE the fail-when-exception-removed property for base-url, phonetic-leak, and opus/AAC specifically (pull one exception, assert the test goes red with no shipped asset, restore) — the same way dimensions/catalog-parity were already proven.

## Done when
base-url / phonetic-leak / opus-AAC each FAIL when their exception is pulled without a shipped asset; memory-budget grows per eager file; the sanity verdict is exact-token; the root .gitignore rules are in this section's diff; full npm test + tsc + eslint green.
