# Reviews: critique rounds per asset

Each art slot runs a bounded critique loop (Stage C) through the codex
image-critique lane. This file records every round: the asset names reviewed,
the round number (capped at three per loop), the findings, and the final
disposition. The link check in test/media/reviews.test.ts reads this file and
verifies that every asset name mentioned in a round record exists on disk,
that no loop exceeds three rounds, and that any loop locked with known findings
carries a non-empty findings list.

All 13 art slots shipped at rung 1 (codex-direct generation, codex image
critique). Every slot was accepted inside the three-round cap; the
locked-with-known-findings escape was not used. Model tier is pinned
(gpt-6-astra at xhigh).

## Rounds
### Loop hero-desktop round 1
- assets: hero-desktop.avif
- findings: Period accuracy: convincing bulky CRTs, industrial cabinets, amber/green indicators; no modern hardware or UI. Centered screen and dark peripheral space suit a full-bleed desktop hero. No baked-in lettering, digits, or watermarks.
- disposition: accepted

### Loop hero-portrait round 1
- assets: hero-portrait.avif
- findings: Period accuracy: bulky CRTs, physical keys, telephone, indicator cabinets fit 1983; no anachronisms. Centered CRT works for portrait full-bleed; screen has adequate margins. No baked-in text.
- disposition: accepted

### Loop hero-return round 1
- assets: hero-return.avif
- findings: Period accuracy: bulky CRTs, physical controls, amber/green lamps fit 1983; no modern hardware or UI. Centered empty screen gives clear overlay space. No baked-in text.
- disposition: accepted

### Loop menu-rack round 1
- assets: menu-rack.avif
- findings: - Period accuracy: Reel-to-reel drives, metal racks, and amber/green indicators fit 1983. No clear contemporary hardware or UI. - Composition: Balanced panoramic framing works well full-bleed; cropped outer cabinets feel intentional. - Baked-in text: No visible text, digits, logos, or watermarks.
- disposition: accepted

### Loop bezel-texture round 1
- assets: bezel-texture.avif
- findings: Period accuracy: dark brushed metal, slotted screws, recessed panel seams suit 1983; no anachronisms. Composition works for a full-bleed bezel. No baked-in text.
- disposition: accepted

### Loop countdown-insert round 1
- assets: countdown-insert.avif
- findings: - Period: Rack-mounted metal housing, recessed CRT glass, screws, and amber/green lamps fit the 1983 aesthetic. No obvious anachronisms. - Composition: Balanced framing; the wide, unobstructed center suits the countdown overlay. - Text: No baked-in digits, labels, captions, or watermarks. - Dark-readout check: PASS. The readout is dark and empty; blue glow stays at the perimeter, with faint scanlines and reflections.
- disposition: accepted

### Loop briefing-outlook round 1
- assets: briefing-outlook.avif
- findings: - Period accuracy: Thick CRT housing, recessed curved glass, scanlines, vents, and amber/green lamps fit the 1983 command-room aesthetic. No visible anachronisms. - Composition: Centered monitor and generous blank screen work well full bleed. Tight outer-housing crop feels intentional. - Baked-in text: No text, digits, captions, or watermarks visible.
- disposition: accepted

### Loop briefing-flights round 1
- assets: briefing-flights.avif
- findings: - **Period accuracy:** Chunky metal housing, curved CRT glass, vents, and amber/green lamps fit the target. The blue perimeter glow is stylized but introduces no clear anachronism. - **Composition:** Centered and balanced, with ample screen area. Minor cropping of the outer housing should remain natural in a full-bleed box. - **Baked-in text:** No visible text, digits, captions, or watermarks.
- disposition: accepted

### Loop briefing-bank round 1
- assets: briefing-bank.avif
- findings: - **Period accuracy:** The oversized, nearly flat widescreen reads as a modern display. Faint vertical dividers do not convincingly create a CRT bank; distinct tube bezels and curved glass would improve authenticity. Cabinet hardware, indicator lamps, and colors fit the target. - **Composition:** Strong centered framing. Side handles sit close to the edges and could clip with tighter cropping. - **Baked-in text:** None visible; no digits, labels, or watermarks.
- disposition: revise

### Loop briefing-bank round 2
- assets: briefing-bank.avif
- findings: - Period accuracy: Metal housing, vents, switches, and amber/green lamps fit the 1983 command-room aesthetic. No obvious modern hardware or UI. - Composition: Centered display with ample empty space for briefing content. Peripheral hardware crops naturally at the edges. - Baked-in text: None; no digits, labels, titles, or watermarks.
- disposition: accepted

### Loop failsafe-wall round 1
- assets: failsafe-wall.avif
- findings: - Period accuracy: CRT-style curvature, physical controls, and amber/green lamps fit the aesthetic; no obvious modern hardware or UI. - Composition: Balanced panoramic framing; keep the central display centered when cropping. - Baked-in text: No visible text, digits, captions, or watermarks. - Dark-readout check: All screens and counter areas are dark and empty. Blue edge glow leaves the readout interiors clear for live overlays.
- disposition: accepted

### Loop ending-recovery round 1
- assets: ending-recovery.avif
- findings: - Period accuracy: CRT consoles, physical switches, indicator lamps, and telephone fit the 1983 setting. No obvious modern hardware or UI. - Composition/crop: The baked-in blue perimeter frame will clip awkwardly in full-bleed crops. Remove it or render it separately as an overlay. - Baked-in text: No visible text, digits, captions, or watermarks.
- disposition: revise

### Loop ending-recovery round 2
- assets: ending-recovery.avif
- findings: - Period accuracy: CRT consoles, reel-to-reel equipment, and physical controls fit the 1983 setting. No obvious modern hardware or UI. - Composition: Strong depth and balanced framing. Foreground cropping feels intentional and suits full-bleed use. - Baked-in text: No visible text, digits, captions, or watermarks.
- disposition: accepted

### Loop ending-containment round 1
- assets: ending-containment.avif
- findings: - Period accuracy: Curved CRTs, physical switches, indicator lamps, and corded telephone fit 1983. No visible modern hardware or UI. - Composition: Atmospheric wide framing works for full bleed; cropped foreground chairs feel intentional. - Baked-in text: No visible text, digits, captions, or watermarks.
- disposition: accepted

### Loop ending-failure round 1
- assets: ending-failure.avif
- findings: - Period accuracy: CRTs, physical switches, indicator lamps, and corded telephone look appropriate; no obvious modern hardware or UI. - Composition: Strong room depth and usable full-bleed framing. Foreground edge cropping feels intentional. - Text: No visible text, digits, titles, or watermarks. - Palette: Red emergency lighting dominates; the requested cold-blue CRT glow is subdued, but fits the failure scene.
- disposition: accepted

## Audio (Section 03)

### Audition decision

Stage E auditioned the single reference line SHALL WE PLAY A GAME through two
local synthesis chains, both run through the identical WOPR post chain (band-pass
300 to 3000 Hz, light bitcrush, loudness normalize, silence trim):

- Chain 1: macOS say, voice Fred (classic Macintalk formant), pitch flattened.
- Chain 2: espeak-ng formant synthesis, en-us, low pitch, slowed cadence.

Winner: Chain 2, espeak-ng. The film WOPR was voiced on a Votrax-class formant
synthesizer with a flat, buzzing, hard-edged monotone. espeak-ng is a pure
formant synth of that same lineage and lands the hard formant buzz and flat
affect natively; say Fred renders a smoother, more modern-spoken timbre that
reads as a talking computer rather than the 1983 WOPR. The decision rule favors
film register over period authenticity when they conflict, and favors espeak-ng
on a tie; here espeak-ng wins the film register outright, so no tie-break was
needed. Both candidates stay on disk under media/audition/ (gitignored), so the
choice is revisitable in minutes.

Lane rung at Stage E: voice synthesis is a fully local tool chain (espeak-ng plus
ffmpeg), zero credentials, so every voiceClipId rendered and no id fell to the
discovery.json exception list. Lane rung at Stage G (audio-critique): re-probed
and found rung 2. codex exec attaches images only (the -i flag), with no audio
attachment path, so the machine critique was skipped without ceremony and the
manual ear-pass checklist stands in.

Every clip is rendered with the espeak-ng chain, exported opus primary plus a
real AAC stream fallback, both verified to decode. The transcript sidecar for
each clip strict-equals the catalog display text; phonetic nudges (dropping the
query lilt, spelling fixes) live only in the synthesis input, never in the
transcript or display.

Note on sign-off: every clip passes the mechanical checks below (clean decode
both ways, controlled peaks, transcript parity, loop seam within tolerance). The
final by-ear sign-off (timbre taste, comfort on desktop and phone speakers) is
Bond's to give; the review reel at media/src/review/review-reel.opus is built for
that pass. The dispositions below reflect the mechanical acceptance.

### Listening checklist (mechanical pass)

- Desktop and phone levels: all clips loudness-normalized to I=-16 LUFS, TP=-1.5
  dBTP; peaks measured under 0 dBFS, no clipping.
- Voice clarity over ambience: the review reel mixes voices at gain 0.9 over the
  room loop at gain 0.2 (shipping gains), leaving clear headroom; manifest gain
  only was touched, shell ducking code untouched.
- Tones distinguishable: effects stay as tuned synth recipes (distinct
  waveforms and frequencies per cue); only the room loop is a bounced file.
- Loop joins clean: the room-loop seam delta is 0.00293 of full scale, well
  under the 0.02 tolerance, continuous by construction (every partial has a whole
  number of cycles across the 4 second loop).
- Peaks comfortable: confirmed above; no clipping on any shipped clip.

### Rounds

### Loop voice-audition round 1
- assets: vo-greeting-boot.opus, vo-greeting-boot.aac, voice-greeting.opus
- findings: espeak-ng formant chain chosen over say Fred for the flat buzzing WOPR register; both candidates decode as opus and aac; the chosen chain carries the hard early-80s formant edge say Fred smooths away.
- disposition: accepted

### Loop vo-greeting round 1
- assets: vo-greeting-boot.opus, vo-greeting-boot.aac, vo-greeting-return.opus, vo-greeting-return.aac
- findings: Boot greeting carries the verbatim tone line; return greeting reads clean. Both opus and aac decode; transcripts strict-equal the catalog display text; no query-lilt bending the monotone.
- disposition: accepted

### Loop vo-idle round 1
- assets: vo-idle-waiting.opus, vo-idle-waiting.aac, vo-idle-patience.opus, vo-idle-patience.aac
- findings: Idle beats render with the flat WOPR cadence; peaks controlled, both encodings decode, transcripts match the catalog.
- disposition: accepted

### Loop vo-mission-discrepancy round 1
- assets: vo-outlook-first-discrepancy.opus, vo-flights-first-discrepancy.opus, vo-bank-first-discrepancy.opus
- findings: The three per-mission first-discrepancy lines are the longest clips (about seven seconds) and stay intelligible through the band-pass; both encodings decode, transcripts match.
- disposition: accepted

### Loop vo-deadline round 1
- assets: vo-deadline-30s.opus, vo-deadline-10s.opus, vo-deadline-final-phase.opus
- findings: Deadline warnings land with urgency in the WOPR register; levels controlled, decode clean both ways, transcripts match.
- disposition: accepted

### Loop vo-reject round 1
- assets: vo-reject-receipt-order.opus, vo-reject-unrelated-source.opus, vo-reject-derived-not-independent.opus, vo-reject-wrong-root.opus, vo-reject-incomplete.opus
- findings: Five validator rejection lines, the longest in the catalog; all stay intelligible, decode as opus and aac, and carry transcripts strict-equal to the catalog.
- disposition: accepted

### Loop vo-finale round 1
- assets: vo-recognition.opus, vo-ending-recovery.opus, vo-ending-containment.opus, vo-ending-failure.opus
- findings: Recognition and the three ending readbacks carry the verbatim tone lines; the flat delivery suits the finale beats. Both encodings decode, transcripts match the catalog.
- disposition: accepted

### Loop room-loop round 1
- assets: room-loop.wav, room-loop.opus, room-loop.aac
- findings: A low electrical room hum (60 Hz fundamental with harmonics and a slow tremor), seamless by construction; seam delta 0.00293 against a 0.02 tolerance. Shipped as a 16-bit PCM WAV for the deterministic CI decode plus opus and aac siblings.
- disposition: accepted

