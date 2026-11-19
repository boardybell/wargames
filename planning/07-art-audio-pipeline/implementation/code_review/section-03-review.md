# Audio pipeline (section-03) review

Reviewer: deep-implement:code-reviewer. SHIP. Went in hostile; the gates held. This is the honest form section-01's review demanded, and the section-01 HIGHs (H1/H2/H3) plus the M1 budget-can't-grow defect are all closed here. (The by-ear voice sign-off is the human's at the deploy browser pass; a reviewer cannot hear the clips.)

## VERIFIED HONEST
- Gates bite on real assets: missingVoiceClips is [] and roomLoopPending false, so none of the four gates are in recorded-skip mode. catalog-parity iterates the real JOSHUA_LINES and existsSync-checks all 19 .opus (hard obligation, fails on a de-excepted id with no file); audio-manifest existsSync-asserts both .opus primary AND sibling .aac for all 19 (the real H3 fix, no endsWith tautology); memory-budget adds a worst case PER eager file cue (M1 fix) with ambience-hum now an eager file, under the 8 MB ceiling; loop-join decodes the real room-loop.wav deterministically and checks seam delta <= 0.02 (reported 0.00293).
- Phonetic-leak guard real: the test reads the on-disk .txt sidecar and strict-equals the catalog text; the two phonetically-nudged clips (vo-recognition, vo-ending-recovery) ship DISPLAY-text transcripts, not their espeak question-mark-stripped inputs. No phonetics in any transcript or the manifest.
- voice-greeting hold-back honest: voice-greeting is a SHELL cue, not one of the 19 catalog voiceClipIds, so leaving its source synth (the committed shell player needs it synchronously playable until a later split wires fetch+decode) leaves no catalog clip unshipped and blanks no gate. All 19 catalog clips are file-sourced and on disk. Documented inline.
- Discovery honesty: audio-critique recorded rung 2 (codex has no audio attachment path) with a manual ear-pass checklist — a real rung-2 record, not a faked rung-1; weakens no mechanical gate. roomLoopPending false backed by a real shipped loop.
- Manifest scope: only source/gain/preload fields changed; shell ducking untouched; ambience-hum swapped to the file loop (eager); voice lazy, effects eager. No em-dashes.

## LOW (addressed)
- L1 (fixed): build-review-reel.mjs header comment contradiction trimmed.
- L2 (fixed): memory-budget ASSUMED_MAX_SECONDS bumped 6 -> 8 so the worst-case estimate never undercounts the ~7s discrepancy lines.
- L3: reviews.test asset search scope is correct as-is (the gitignored reel is deliberately not asset-checked); no change.

## Outcome
espeak-ng formant synthesis won on film register (Votrax-class lineage, hard flat buzz) over macOS say Fred. All 19 catalog voiceClipIds shipped as opus primary + real AAC + display-text transcript sidecar; room-tone loop seam-continuous; total audio 2.80 MB, eager decoded estimate ~1.1 MB under the 8 MB ceiling. Full suite 1458, media 52, tsc + eslint clean. By-ear voice sign-off deferred to the deploy pass (review reel built).
