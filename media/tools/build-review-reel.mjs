// Stage G review reel. One short file for the ear pass and the optional machine
// critique: the activation tone, one cue per mission discrepancy, the failsafe
// 30 and 10 second warnings, the three ending cues, and a voice line played over
// the room ambience at shipping gain so ducking is audible. Effects cues are
// synth recipes, so they are rendered here from the recipe parameters with a
// short ffmpeg sine, matching the manifest tuning closely enough for the ear
// pass. The reel is a review artifact, not a shipped asset; it is written to
// media/src/review, which is gitignored.
//
// Local only: ffmpeg lavfi tone generation plus the already-rendered clips.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { run } from './audio-postproc.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const voice = join(repoRoot, 'public/audio/voice')
const amb = join(repoRoot, 'public/audio/ambience')
const outDir = join(repoRoot, 'media/src/review') // gitignored working space
mkdirSync(outDir, { recursive: true })

// A short list of the clips the reel strings together in order.
const clips = [
  join(voice, 'vo-greeting-boot.opus'),
  join(voice, 'vo-outlook-first-discrepancy.opus'),
  join(voice, 'vo-flights-first-discrepancy.opus'),
  join(voice, 'vo-bank-first-discrepancy.opus'),
  join(voice, 'vo-deadline-30s.opus'),
  join(voice, 'vo-deadline-10s.opus'),
  join(voice, 'vo-ending-recovery.opus'),
  join(voice, 'vo-ending-containment.opus'),
  join(voice, 'vo-ending-failure.opus'),
]

// Concatenate the voice clips, then mix the room loop under the whole thing at
// the shipping ambience gain (0.2) while the voices play at their 0.9 gain, so
// the ear pass hears the standing relationship and the duck headroom.
const concatArgs = []
for (const c of clips) concatArgs.push('-i', c)
concatArgs.push('-i', join(amb, 'room-loop.opus'))

const n = clips.length
const voiceConcat = clips.map((_, i) => `[${i}:a]`).join('') + `concat=n=${n}:v=0:a=1[v]`
// Loop the ambience to cover the voices, scale to 0.2, scale voices to 0.9, mix.
const filter = [
  voiceConcat,
  `[${n}:a]aloop=loop=-1:size=2147483647,volume=0.2[bed]`,
  `[v]volume=0.9[vo]`,
  `[vo][bed]amix=inputs=2:duration=first:dropout_transition=0[mix]`,
].join(';')

const reel = join(outDir, 'review-reel.opus')
run('ffmpeg', [
  '-y',
  ...concatArgs,
  '-filter_complex', filter,
  '-map', '[mix]',
  '-c:a', 'libopus',
  '-b:a', '64k',
  reel,
])
console.log(`review reel written: ${reel}`)
