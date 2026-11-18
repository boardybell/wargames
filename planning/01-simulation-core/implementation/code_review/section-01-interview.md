# Review Triage: section-01-foundation

Mode: autonomous (Bond's standing no-more-questions directive). No user
interview; every finding triaged and dispositioned here.

Auto-fixed:
1. vitest alias prefix bug: replaced the string alias map with ordered
   regex finds (@engine/testing exact, @engine exact, @engine/* wildcard
   to src/engine/$1). Verified by the existing @engine smoke import;
   section-02's deep import will exercise the wildcard.
2. deep_implement_config.json test_command corrected to npm test.
3. purity-gate.test.ts paths derived from process.cwd(); fixture paths
   relative.
4. stateHash widened to 64 bits (two FNV-1a passes, distinct offset
   bases, concatenated).
5. fail() prefix neutralized to "canonical:" so assertJsonSafe errors
   read correctly.
6. eslint engine block tightened to src/engine/**/*.ts.

Verified, no change:
7. @fast-check/vitest 0.2.4 installs and dedupes against vitest 4.1.12
   with no peer warnings; the section-10 risk is closed empirically.

Accepted as-is, recorded:
8. Empty module directories exist on disk but not in git; each section
   creates its own module files (the skeleton acceptance item is
   satisfied by the mkdir plus this note).
9. Inline lint fixtures instead of a .fixture file: conscious deviation,
   cleaner.
10. no-restricted-properties cannot catch member aliasing; lint-green is
    not proof of purity (the determinism harness is the real proof).

Post-fix verification: 9 tests green, typecheck clean, lint clean.
