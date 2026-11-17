# Interview: 07-art-audio-pipeline

2026-11-17. Mode: autonomous (Bond: "no more questions just build it and
do what you think is best"). Prior Bond directives bind hard here: all
visuals through the chatgpt/codex lane, NO local image generation
(Darkroom excluded), highest model tier at full effort, Joshua sounds
like the film WOPR or authentic early-80s synthesis.

Q1: What if discovery shows codex cannot emit image files?
A: Escalation ladder, honestly reported at each rung: (1) codex exec
with workspace-write generating and saving images directly, if the tool
exists. (2) Semi-automated ChatGPT.app handoff: this split writes
numbered prompt files and a watched intake folder; the app does the
generating (still the chatgpt lane, per Bond's wording "codex cli or
the chat gpt app"); AppleScript automation attempted first, manual
paste as the backstop with a single consolidated request file so Bond
spends minutes, not hours, if it comes to that. (3) The requirements'
handoff bundle (generation requests, contact sheet, paste-ready
critique prompt) with placeholders shipping, stated plainly in the
README. Local generation is never used at any rung.

Q2: Voice pipeline specifics?
A: Audition per the requirements: two reads of SHALL WE PLAY A GAME?
plus one failsafe line, rendered through two candidate chains (macOS
say with a classic voice; espeak-ng formant synthesis), both processed
identically (flatten pitch, band-pass 300 to 3000 Hz, light bitcrush,
normalize). Pick the chain closest to the film's flat, evenly weighted
register; render the full clip set from the Joshua line catalog
(split 06) keyed by voiceClipId; label AI-generated voice in settings
(already in the shell). codex critiques the written voice direction and
the cue list; if the lane accepts audio attachments at review time,
send the reel, otherwise record that the listening checks were local
ears only.

Q3: Art set size and formats?
A: The requirements' surface table verbatim: three hero compositions
plus a portrait companion, rack and bezel, relay scene, runway and
radar, bank operations, failsafe wall, countdown insert, hero return,
and the after-action ending stills. Generate at 2x display size,
export AVIF with JPEG fallback via sharp or squoosh-cli at build-
integrated sizes, hero under 350 KB, others under 200 KB, total art
budget 2.5 MB. HeroCrop glass-rect metadata authored per final hero
image against the split 02 interface.

Q4: Review loop mechanics?
A: Contact sheet (labeled grid montage via ImageMagick) with desktop
and phone crops and live-copy markers; codex exec -i contact-sheet.png
with the critique brief (strongest hero, weak images, contemporary or
implausible hardware, edits by asset name); regenerate failures; lock
the set; record rounds in the README. The website screenshot review
belongs to split 08 and reuses this lane.
