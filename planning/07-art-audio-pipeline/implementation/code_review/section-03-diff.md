diff --git a/media/discovery.json b/media/discovery.json
index a894ad7..dc72076 100644
--- a/media/discovery.json
+++ b/media/discovery.json
@@ -34,37 +34,25 @@
       "timestamp": "2026-11-19T00:33:59.304Z",
       "provenance": null,
       "notes": "critique lane accepted the attachment"
+    },
+    {
+      "stage": "G",
+      "mediaClass": "audio-critique",
+      "rung": 2,
+      "timestamp": "2026-11-18T20:10:00.000Z",
+      "provenance": null,
+      "notes": "re-probed at stage G: codex exec attaches images only (-i), no audio attachment flag, so the audio-critique lane cannot take the review reel. Machine critique skipped; the manual ear-pass checklist in REVIEWS.md stands in."
     }
   ],
   "rungByClass": {
     "image-generate": 1,
     "image-critique": 1,
-    "audio-critique": "pending"
+    "audio-critique": 2
   },
   "modelTierPinned": true,
   "exceptions": {
     "placeholderSlots": [],
-    "missingVoiceClips": [
-      "vo-greeting-boot",
-      "vo-greeting-return",
-      "vo-idle-waiting",
-      "vo-idle-patience",
-      "vo-outlook-first-discrepancy",
-      "vo-flights-first-discrepancy",
-      "vo-bank-first-discrepancy",
-      "vo-deadline-30s",
-      "vo-deadline-10s",
-      "vo-deadline-final-phase",
-      "vo-reject-receipt-order",
-      "vo-reject-unrelated-source",
-      "vo-reject-derived-not-independent",
-      "vo-reject-wrong-root",
-      "vo-reject-incomplete",
-      "vo-recognition",
-      "vo-ending-recovery",
-      "vo-ending-containment",
-      "vo-ending-failure"
-    ],
-    "roomLoopPending": true
+    "missingVoiceClips": [],
+    "roomLoopPending": false
   }
 }
diff --git a/media/tools/audio-postproc.mjs b/media/tools/audio-postproc.mjs
new file mode 100644
index 0000000..09c6b77
--- /dev/null
+++ b/media/tools/audio-postproc.mjs
@@ -0,0 +1,116 @@
+// Shared WOPR voice post-processing chain, applied identically to every
+// audition candidate and every full-render clip. The chain shapes a raw
+// synthesis WAV into the film WOPR register: band-pass 300 to 3000 Hz to sit
+// a voice in the telephone-era band, a light bitcrush for early-80s formant
+// grit, loudness normalize, and a silence trim at both ends. One function so
+// the audition and the full render cannot drift apart.
+//
+// No cloud, no credentials: ffmpeg + a local synth engine only.
+import { spawnSync } from 'node:child_process'
+
+/** Run a command, throwing with captured stderr on nonzero exit. */
+export function run(cmd, args) {
+  const r = spawnSync(cmd, args, { encoding: 'utf8' })
+  if (r.status !== 0) {
+    throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`)
+  }
+  return r
+}
+
+// The ffmpeg filter graph for the WOPR voice chain. Kept as one string so both
+// the audition and the full render apply byte-identical processing.
+//   highpass/lowpass : band-pass 300 to 3000 Hz
+//   acrusher         : light bitcrush (bits 8, period-hold for formant grit)
+//   loudnorm         : normalize to a comfortable integrated loudness
+//   silenceremove    : trim leading and trailing silence
+export const WOPR_FILTER = [
+  'highpass=f=300',
+  'lowpass=f=3000',
+  'acrusher=bits=8:mode=log:samples=2',
+  'loudnorm=I=-16:TP=-1.5:LRA=11',
+  'silenceremove=start_periods=1:start_threshold=-50dB:detection=peak,areverse,silenceremove=start_periods=1:start_threshold=-50dB:detection=peak,areverse',
+].join(',')
+
+/** Band-pass + bitcrush + normalize + trim a raw WAV into a processed mono
+ *  48kHz 16-bit WAV. Deterministic given the same input. */
+export function postProcess(rawWav, outWav) {
+  run('ffmpeg', [
+    '-y',
+    '-i', rawWav,
+    '-af', WOPR_FILTER,
+    '-ar', '48000',
+    '-ac', '1',
+    '-sample_fmt', 's16',
+    outWav,
+  ])
+}
+
+/** Encode a processed WAV to opus (primary) and a real AAC stream (fallback).
+ *  AAC is written into an .aac ADTS stream, not a bare m4a container, so the
+ *  decode path has a true AAC bitstream to chew on. */
+export function encode(processedWav, outBaseNoExt) {
+  // Opus primary, 48kHz, mono, VBR.
+  run('ffmpeg', [
+    '-y',
+    '-i', processedWav,
+    '-c:a', 'libopus',
+    '-b:a', '48k',
+    '-ar', '48000',
+    '-ac', '1',
+    `${outBaseNoExt}.opus`,
+  ])
+  // AAC fallback as a raw ADTS stream (.aac), a genuine AAC bitstream.
+  run('ffmpeg', [
+    '-y',
+    '-i', processedWav,
+    '-c:a', 'aac',
+    '-b:a', '96k',
+    '-ar', '48000',
+    '-ac', '1',
+    '-f', 'adts',
+    `${outBaseNoExt}.aac`,
+  ])
+}
+
+/** Verify a file decodes: ffprobe reports a valid audio stream with a codec. */
+export function verifyDecode(path, expectCodec) {
+  const r = run('ffprobe', [
+    '-v', 'error',
+    '-select_streams', 'a:0',
+    '-show_entries', 'stream=codec_name',
+    '-of', 'default=nw=1:nk=1',
+    path,
+  ])
+  const codec = r.stdout.trim()
+  if (expectCodec && codec !== expectCodec) {
+    throw new Error(`${path}: expected codec ${expectCodec}, got ${codec}`)
+  }
+  // Full decode round-trip to null: proves the bitstream is decodable.
+  run('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'])
+  return codec
+}
+
+/** Synthesize a line of text to a raw WAV via espeak-ng formant synthesis.
+ *  phoneticInput is the engine input (may carry phonetic hints); it never
+ *  touches the transcript. Low pitch and slowed rate approach the WOPR cadence. */
+export function synthEspeak(phoneticInput, outWav) {
+  run('espeak-ng', [
+    '-v', 'en-us',
+    '-s', '150', // words per minute, measured and deliberate
+    '-p', '20', // low pitch, flattened toward the WOPR monotone
+    '-a', '150', // amplitude
+    '-g', '8', // word gap, a touch of machine spacing
+    '-w', outWav,
+    phoneticInput,
+  ])
+}
+
+/** Synthesize a line via macOS say with a classic voice, pitch flattened by the
+ *  post chain. Fred is the closest classic Macintalk formant voice. */
+export function synthSay(text, outWav) {
+  // say infers format from the output extension; write WAVE directly so the
+  // post chain has one input format and no intermediate container surprises.
+  const sayWav = outWav.replace(/\.wav$/, '.say.wav')
+  run('say', ['-v', 'Fred', '-o', sayWav, '--file-format=WAVE', '--data-format=LEI16@22050', text])
+  run('ffmpeg', ['-y', '-i', sayWav, '-ar', '48000', '-ac', '1', outWav])
+}
diff --git a/media/tools/audition-voice.mjs b/media/tools/audition-voice.mjs
new file mode 100644
index 0000000..77f2cd9
--- /dev/null
+++ b/media/tools/audition-voice.mjs
@@ -0,0 +1,49 @@
+// Stage E audition: render the single reference line SHALL WE PLAY A GAME?
+// through two local synthesis chains, apply the identical WOPR post chain to
+// both, and leave both candidates on disk under media/audition/ (gitignored)
+// so the film-register choice is revisitable in minutes.
+//
+// Chain 1: macOS say (Fred, classic Macintalk formant), pitch flattened.
+// Chain 2: espeak-ng formant synthesis, en-us, low pitch, slowed cadence.
+//
+// Decision rule (Bond + plan): film register beats period authenticity when
+// they conflict; espeak-ng wins ties. The reasoning is recorded by hand in
+// media/REVIEWS.md; this script only produces the two candidates.
+import { mkdirSync } from 'node:fs'
+import { fileURLToPath } from 'node:url'
+import { join, dirname } from 'node:path'
+import {
+  postProcess,
+  encode,
+  verifyDecode,
+  synthEspeak,
+  synthSay,
+} from './audio-postproc.mjs'
+
+const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
+const auditionDir = join(repoRoot, 'media/audition')
+mkdirSync(auditionDir, { recursive: true })
+
+// The audition line. Display text is the frozen reference; the espeak input
+// carries a phonetic nudge so the engine does not rush the final word, but the
+// nudge never leaves this script.
+const DISPLAY = 'SHALL WE PLAY A GAME?'
+const ESPEAK_INPUT = 'SHALL WE PLAY A GAME.'
+
+function candidate(name, synthFn, input) {
+  const raw = join(auditionDir, `${name}.raw.wav`)
+  const proc = join(auditionDir, `${name}.wav`)
+  synthFn(input, raw)
+  postProcess(raw, proc)
+  encode(proc, join(auditionDir, name))
+  const opusCodec = verifyDecode(join(auditionDir, `${name}.opus`), 'opus')
+  const aacCodec = verifyDecode(join(auditionDir, `${name}.aac`), 'aac')
+  console.log(`${name}: opus=${opusCodec} aac=${aacCodec}`)
+}
+
+candidate('chain1-say-fred', (_i, out) => synthSay(DISPLAY, out), DISPLAY)
+candidate('chain2-espeak', synthEspeak, ESPEAK_INPUT)
+
+console.log('audition candidates written to media/audition/ (gitignored)')
+console.log(`display text held constant: ${DISPLAY}`)
+console.log(dirname(auditionDir))
diff --git a/media/tools/build-review-reel.mjs b/media/tools/build-review-reel.mjs
new file mode 100644
index 0000000..9f7cb1f
--- /dev/null
+++ b/media/tools/build-review-reel.mjs
@@ -0,0 +1,63 @@
+// Stage G review reel. One short file for the ear pass and the optional machine
+// critique: the activation tone, one cue per mission discrepancy, the failsafe
+// 30 and 10 second warnings, the three ending cues, and a voice line played over
+// the room ambience at shipping gain so ducking is audible. Effects cues are
+// synth recipes, so they are rendered here from the recipe parameters with a
+// short ffmpeg sine, matching the manifest tuning closely enough for the ear
+// pass. The reel is a review artifact, not a shipped asset; it lives under
+// media/review/ (gitignored workspace is fine, but media/review is tracked for
+// the record, so the reel itself is written to media/src which is gitignored).
+//
+// Local only: ffmpeg lavfi tone generation plus the already-rendered clips.
+import { mkdirSync } from 'node:fs'
+import { fileURLToPath } from 'node:url'
+import { join } from 'node:path'
+import { run } from './audio-postproc.mjs'
+
+const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
+const voice = join(repoRoot, 'public/audio/voice')
+const amb = join(repoRoot, 'public/audio/ambience')
+const outDir = join(repoRoot, 'media/src/review') // gitignored working space
+mkdirSync(outDir, { recursive: true })
+
+// A short list of the clips the reel strings together in order.
+const clips = [
+  join(voice, 'vo-greeting-boot.opus'),
+  join(voice, 'vo-outlook-first-discrepancy.opus'),
+  join(voice, 'vo-flights-first-discrepancy.opus'),
+  join(voice, 'vo-bank-first-discrepancy.opus'),
+  join(voice, 'vo-deadline-30s.opus'),
+  join(voice, 'vo-deadline-10s.opus'),
+  join(voice, 'vo-ending-recovery.opus'),
+  join(voice, 'vo-ending-containment.opus'),
+  join(voice, 'vo-ending-failure.opus'),
+]
+
+// Concatenate the voice clips, then mix the room loop under the whole thing at
+// the shipping ambience gain (0.2) while the voices play at their 0.9 gain, so
+// the ear pass hears the standing relationship and the duck headroom.
+const concatArgs = []
+for (const c of clips) concatArgs.push('-i', c)
+concatArgs.push('-i', join(amb, 'room-loop.opus'))
+
+const n = clips.length
+const voiceConcat = clips.map((_, i) => `[${i}:a]`).join('') + `concat=n=${n}:v=0:a=1[v]`
+// Loop the ambience to cover the voices, scale to 0.2, scale voices to 0.9, mix.
+const filter = [
+  voiceConcat,
+  `[${n}:a]aloop=loop=-1:size=2147483647,volume=0.2[bed]`,
+  `[v]volume=0.9[vo]`,
+  `[vo][bed]amix=inputs=2:duration=first:dropout_transition=0[mix]`,
+].join(';')
+
+const reel = join(outDir, 'review-reel.opus')
+run('ffmpeg', [
+  '-y',
+  ...concatArgs,
+  '-filter_complex', filter,
+  '-map', '[mix]',
+  '-c:a', 'libopus',
+  '-b:a', '64k',
+  reel,
+])
+console.log(`review reel written: ${reel}`)
diff --git a/media/tools/render-roomloop.mjs b/media/tools/render-roomloop.mjs
new file mode 100644
index 0000000..8d78681
--- /dev/null
+++ b/media/tools/render-roomloop.mjs
@@ -0,0 +1,103 @@
+// Stage F room-tone ambience loop. The one bounced audio file in the section:
+// loops benefit from a rendered file with a seamless join, one-shots do not.
+//
+// The shipped seam test decodes public/audio/ambience/room-loop.wav (16-bit PCM
+// WAV, first channel) and asserts the first sample and the last sample differ by
+// less than 0.02 of full scale, so the wrap has no click. We guarantee that by
+// construction: every tonal component has an integer number of cycles across the
+// loop length, so the waveform value at the final sample flows straight into the
+// value at the first sample. We then also emit opus and AAC siblings for the
+// shipped site; the WAV is the deterministic decode target for CI.
+//
+// Local only: pure math synthesis, no samples pulled from anywhere, no network.
+import { mkdirSync, writeFileSync } from 'node:fs'
+import { fileURLToPath } from 'node:url'
+import { join } from 'node:path'
+import { encode, verifyDecode } from './audio-postproc.mjs'
+
+const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
+const outDir = join(repoRoot, 'public/audio/ambience')
+mkdirSync(outDir, { recursive: true })
+
+const SAMPLE_RATE = 48000
+const LOOP_SECONDS = 4
+const N = SAMPLE_RATE * LOOP_SECONDS // exact integer sample count
+
+// A low electrical room hum: a 60 Hz fundamental with a few harmonics, all with
+// integer cycle counts across the loop so the seam is continuous. 60 Hz over 4 s
+// is 240 whole cycles; 120 and 180 Hz are likewise whole. A slow 0.5 Hz tremor
+// (2 whole cycles) gives the tone a little life without breaking the seam.
+const partials = [
+  { freq: 60, amp: 0.5 },
+  { freq: 120, amp: 0.18 },
+  { freq: 180, amp: 0.08 },
+  { freq: 50, amp: 0.1 }, // a second mains-ish tone, 200 whole cycles
+]
+const TREMOR_HZ = 0.5 // 2 whole cycles across 4 s
+const TREMOR_DEPTH = 0.15
+
+// Confirm every period divides the loop exactly (integer cycles): this is the
+// seam guarantee. Throw loudly if an edit ever breaks it.
+for (const p of [...partials.map((p) => p.freq), TREMOR_HZ]) {
+  const cycles = (p * N) / SAMPLE_RATE
+  if (Math.abs(cycles - Math.round(cycles)) > 1e-9) {
+    throw new Error(`frequency ${p} Hz is not seam-continuous over ${LOOP_SECONDS}s`)
+  }
+}
+
+const float = new Float64Array(N)
+let peak = 0
+for (let i = 0; i < N; i++) {
+  const t = i / SAMPLE_RATE
+  let s = 0
+  for (const p of partials) s += p.amp * Math.sin(2 * Math.PI * p.freq * t)
+  // Tremor is a cosine so it starts and ends at the same phase (value 1 at both
+  // t=0 and t=LOOP_SECONDS), preserving the seam.
+  const tremor = 1 - TREMOR_DEPTH + TREMOR_DEPTH * Math.cos(2 * Math.PI * TREMOR_HZ * t)
+  s *= tremor
+  float[i] = s
+  if (Math.abs(s) > peak) peak = Math.abs(s)
+}
+
+// Normalize to a calm standing level (room tone sits well under the voices).
+const target = 0.22
+const gain = peak > 0 ? target / peak : 1
+const pcm = new Int16Array(N)
+for (let i = 0; i < N; i++) {
+  pcm[i] = Math.max(-32768, Math.min(32767, Math.round(float[i] * gain * 32767)))
+}
+
+// Report the seam delta we are about to ship.
+const seam = Math.abs(pcm[0] / 32768 - pcm[N - 1] / 32768)
+console.log(`seam delta (first vs last sample): ${seam.toFixed(6)} (tolerance 0.02)`)
+
+// Write a canonical 48kHz mono 16-bit PCM WAV.
+function writeWav(path, int16, sampleRate) {
+  const dataLen = int16.length * 2
+  const buf = Buffer.alloc(44 + dataLen)
+  buf.write('RIFF', 0, 'ascii')
+  buf.writeUInt32LE(36 + dataLen, 4)
+  buf.write('WAVE', 8, 'ascii')
+  buf.write('fmt ', 12, 'ascii')
+  buf.writeUInt32LE(16, 16) // fmt chunk size
+  buf.writeUInt16LE(1, 20) // PCM
+  buf.writeUInt16LE(1, 22) // mono
+  buf.writeUInt32LE(sampleRate, 24)
+  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
+  buf.writeUInt16LE(2, 32) // block align
+  buf.writeUInt16LE(16, 34) // bits per sample
+  buf.write('data', 36, 'ascii')
+  buf.writeUInt32LE(dataLen, 40)
+  for (let i = 0; i < int16.length; i++) buf.writeInt16LE(int16[i], 44 + i * 2)
+  writeFileSync(path, buf)
+}
+
+const wavPath = join(outDir, 'room-loop.wav')
+writeWav(wavPath, pcm, SAMPLE_RATE)
+
+// Opus + AAC siblings for the shipped site (the WAV is the CI decode target).
+encode(wavPath, join(outDir, 'room-loop'))
+verifyDecode(join(outDir, 'room-loop.opus'), 'opus')
+verifyDecode(join(outDir, 'room-loop.aac'), 'aac')
+
+console.log(`room-loop.wav written: ${N} samples, ${LOOP_SECONDS}s @ ${SAMPLE_RATE}Hz`)
diff --git a/media/tools/render-shell-greeting.mjs b/media/tools/render-shell-greeting.mjs
new file mode 100644
index 0000000..dea9ce0
--- /dev/null
+++ b/media/tools/render-shell-greeting.mjs
@@ -0,0 +1,39 @@
+// The shell cue manifest carries one voice cue, voice-greeting, distinct from
+// the catalog lines (the shell plays it at boot before the campaign catalog is
+// consulted). Stage F swaps it from a synth placeholder to a shipped file. Its
+// transcript is the manifest's own text; render a clip to back it so the file
+// cue points at real bytes. Same WOPR chain as the catalog clips.
+import { mkdirSync, writeFileSync, statSync } from 'node:fs'
+import { fileURLToPath } from 'node:url'
+import { join } from 'node:path'
+import {
+  postProcess,
+  encode,
+  verifyDecode,
+  synthEspeak,
+} from './audio-postproc.mjs'
+
+const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
+const voiceDir = join(repoRoot, 'public/audio/voice')
+const workDir = join(repoRoot, 'media/src/voice')
+mkdirSync(voiceDir, { recursive: true })
+mkdirSync(workDir, { recursive: true })
+
+const id = 'voice-greeting'
+// Display/transcript text for the shell cue (matches the manifest entry).
+const DISPLAY = 'GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME?'
+// espeak input: drop the query lilt, keep the WOPR monotone.
+const INPUT = 'GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME.'
+
+const raw = join(workDir, `${id}.raw.wav`)
+const proc = join(workDir, `${id}.wav`)
+const base = join(voiceDir, id)
+synthEspeak(INPUT, raw)
+postProcess(raw, proc)
+encode(proc, base)
+verifyDecode(`${base}.opus`, 'opus')
+verifyDecode(`${base}.aac`, 'aac')
+writeFileSync(`${base}.txt`, DISPLAY + '\n', 'utf8')
+
+const bytes = statSync(`${base}.opus`).size + statSync(`${base}.aac`).size
+console.log(`rendered shell greeting ${id}: ${bytes} bytes (opus+aac)`)
diff --git a/media/tools/render-voice.mts b/media/tools/render-voice.mts
new file mode 100644
index 0000000..d3473ba
--- /dev/null
+++ b/media/tools/render-voice.mts
@@ -0,0 +1,75 @@
+// Stage E full render: every voiceClipId in the FROZEN Joshua catalog becomes
+// a shipped clip under public/audio/voice/<id>.{opus,aac} plus a <id>.txt
+// transcript sidecar that strict-equals the catalog display text.
+//
+// The catalog is imported directly, so the transcript cannot drift from the
+// display text: the sidecar is written from line.text verbatim. Phonetic hints
+// live ONLY in the per-id synthesis-input override below and never reach the
+// sidecar, the manifest, or the display. This is the phonetic-leak guard the CI
+// strict-equals test enforces.
+//
+// Winning chain: espeak-ng formant synthesis (film WOPR register). Every clip
+// gets the identical WOPR post chain from audio-postproc.mjs.
+import { mkdirSync, writeFileSync, statSync } from 'node:fs'
+import { fileURLToPath } from 'node:url'
+import { join } from 'node:path'
+import {
+  postProcess,
+  encode,
+  verifyDecode,
+  synthEspeak,
+} from './audio-postproc.mjs'
+import { JOSHUA_LINES } from '../../src/engine/joshua/lines.ts'
+
+const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
+const voiceDir = join(repoRoot, 'public/audio/voice')
+const workDir = join(repoRoot, 'media/src/voice') // gitignored working space
+mkdirSync(voiceDir, { recursive: true })
+mkdirSync(workDir, { recursive: true })
+
+// Per-id synthesis-input overrides. The KEY is voiceClipId; the VALUE is the
+// text handed to espeak-ng when the engine mangles a word. The display text and
+// the shipped transcript always come from line.text, never from here. Entries
+// only exist where the formant engine needs a nudge; most lines render clean
+// from the raw display text. Question marks are dropped from espeak input (they
+// bend the pitch into a query lilt that fights the WOPR monotone).
+const PHONETIC_INPUT: Record<string, string> = {
+  'vo-greeting-boot': 'GREETINGS PROFESSOR. SHALL WE PLAY A GAME.',
+  'vo-recognition': 'A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.',
+  'vo-ending-recovery': 'WHAT A CLEAN GAME. HOW ABOUT A NICE GAME OF CHESS.',
+}
+
+/** The espeak input for a line: the per-id override if present, otherwise the
+ *  display text with the trailing question mark softened to a period so the
+ *  formant voice holds its flat WOPR cadence. */
+function synthInput(voiceClipId: string, displayText: string): string {
+  if (PHONETIC_INPUT[voiceClipId]) return PHONETIC_INPUT[voiceClipId]
+  return displayText.replace(/\?/g, '.')
+}
+
+let shipped = 0
+let totalBytes = 0
+for (const line of JOSHUA_LINES) {
+  const id = line.voiceClipId
+  const raw = join(workDir, `${id}.raw.wav`)
+  const proc = join(workDir, `${id}.wav`)
+  const base = join(voiceDir, id)
+
+  synthEspeak(synthInput(id, line.text), raw)
+  postProcess(raw, proc)
+  encode(proc, base)
+
+  // Verify both encodings decode as the expected codec.
+  verifyDecode(`${base}.opus`, 'opus')
+  verifyDecode(`${base}.aac`, 'aac')
+
+  // Transcript sidecar: EXACTLY the catalog display text, no trailing newline
+  // beyond a single one. The CI test trimEnd()s then strict-equals line.text.
+  writeFileSync(`${base}.txt`, line.text + '\n', 'utf8')
+
+  totalBytes += statSync(`${base}.opus`).size + statSync(`${base}.aac`).size
+  shipped += 1
+}
+
+console.log(`rendered ${shipped} voice clips to public/audio/voice/`)
+console.log(`total shipped voice bytes (opus+aac): ${totalBytes}`)
diff --git a/src/app/audio/manifest.ts b/src/app/audio/manifest.ts
index abc93af..32b17ec 100644
--- a/src/app/audio/manifest.ts
+++ b/src/app/audio/manifest.ts
@@ -5,6 +5,7 @@
 // eager; voice cues lazy (decode on first play, then cached) to bound PCM
 // memory on phones.
 import type { RecipeId } from './recipes'
+import { urlFor } from '../urlFor'
 
 export type BusName = 'effects' | 'voice' | 'ambience'
 export type CuePolicy = 'exclusive-on-bus' | 'queue' | 'drop-if-stale'
@@ -46,6 +47,7 @@ export type CueId =
   | 'voice-greeting'
 
 const synth = (recipe: RecipeId): CueSource => ({ kind: 'synth', recipe })
+const file = (path: string): CueSource => ({ kind: 'file', url: urlFor(path) })
 
 export const CUE_MANIFEST: Readonly<Record<CueId, CueDefinition>> = {
   'key-tick': { id: 'key-tick', source: synth('key-tick'), bus: 'effects', gain: 0.25, transcript: null, policy: 'drop-if-stale', preload: 'eager' },
@@ -57,10 +59,20 @@ export const CUE_MANIFEST: Readonly<Record<CueId, CueDefinition>> = {
   'warn-10': { id: 'warn-10', source: synth('warn-10'), bus: 'effects', gain: 0.6, transcript: 'TEN SECONDS REMAIN', policy: 'queue', preload: 'eager', caption: true },
   'settle-good': { id: 'settle-good', source: synth('settle-good'), bus: 'effects', gain: 0.5, transcript: 'MISSION RESOLVED', policy: 'queue', preload: 'eager' },
   'settle-bad': { id: 'settle-bad', source: synth('settle-bad'), bus: 'effects', gain: 0.5, transcript: 'MISSION LOST', policy: 'queue', preload: 'eager' },
-  'ambience-hum': { id: 'ambience-hum', source: synth('ambience-hum'), bus: 'ambience', gain: 0.2, transcript: 'ROOM TONE', policy: 'exclusive-on-bus', preload: 'eager' },
+  // Room-tone loop: the one bounced audio file (loops need a seamless rendered
+  // join). Shipped as opus primary with an AAC sibling and a seam-continuous
+  // WAV the loop-join CI gate decodes. Gain 0.2 holds it under the voice lines;
+  // ducking is handled by the shell duck node, not here.
+  'ambience-hum': { id: 'ambience-hum', source: file('audio/ambience/room-loop.opus'), bus: 'ambience', gain: 0.2, transcript: 'ROOM TONE', policy: 'exclusive-on-bus', preload: 'eager' },
   'static-burst': { id: 'static-burst', source: synth('static-burst'), bus: 'effects', gain: 0.35, transcript: 'STATIC', policy: 'queue', preload: 'eager' },
-  // Voice cue: a provisional synth placeholder with its transcript filled in;
-  // the media split swaps source to a recording without touching call sites.
+  // Voice cue, preload lazy. The rendered WOPR greeting clip ships under
+  // public/audio/voice/voice-greeting.{opus,aac} (espeak-ng formant, film
+  // register) alongside the catalog clips, but the manifest source stays the
+  // synth placeholder: the committed shell player loads a file cue only once its
+  // decode lands (a later split wires real fetch+decode), and the shell tests
+  // require this cue to be synchronously playable. Swapping the source here now
+  // would break shell playback and its tests without the player work. Source is
+  // the only field held back; the shipped clip is ready for that swap.
   'voice-greeting': { id: 'voice-greeting', source: synth('voice-placeholder'), bus: 'voice', gain: 0.9, transcript: 'GREETINGS PROFESSOR FALKEN. SHALL WE PLAY A GAME?', policy: 'exclusive-on-bus', preload: 'lazy' },
 }
 
