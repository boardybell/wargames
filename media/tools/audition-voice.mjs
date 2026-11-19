// Stage E audition: render the single reference line SHALL WE PLAY A GAME?
// through two local synthesis chains, apply the identical WOPR post chain to
// both, and leave both candidates on disk under media/audition/ (gitignored)
// so the film-register choice is revisitable in minutes.
//
// Chain 1: macOS say (Fred, classic Macintalk formant), pitch flattened.
// Chain 2: espeak-ng formant synthesis, en-us, low pitch, slowed cadence.
//
// Decision rule (Bond + plan): film register beats period authenticity when
// they conflict; espeak-ng wins ties. The reasoning is recorded by hand in
// media/REVIEWS.md; this script only produces the two candidates.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
  postProcess,
  encode,
  verifyDecode,
  synthEspeak,
  synthSay,
} from './audio-postproc.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const auditionDir = join(repoRoot, 'media/audition')
mkdirSync(auditionDir, { recursive: true })

// The audition line. Display text is the frozen reference; the espeak input
// carries a phonetic nudge so the engine does not rush the final word, but the
// nudge never leaves this script.
const DISPLAY = 'SHALL WE PLAY A GAME?'
const ESPEAK_INPUT = 'SHALL WE PLAY A GAME.'

function candidate(name, synthFn, input) {
  const raw = join(auditionDir, `${name}.raw.wav`)
  const proc = join(auditionDir, `${name}.wav`)
  synthFn(input, raw)
  postProcess(raw, proc)
  encode(proc, join(auditionDir, name))
  const opusCodec = verifyDecode(join(auditionDir, `${name}.opus`), 'opus')
  const aacCodec = verifyDecode(join(auditionDir, `${name}.aac`), 'aac')
  console.log(`${name}: opus=${opusCodec} aac=${aacCodec}`)
}

candidate('chain1-say-fred', (_i, out) => synthSay(DISPLAY, out), DISPLAY)
candidate('chain2-espeak', synthEspeak, ESPEAK_INPUT)

console.log('audition candidates written to media/audition/ (gitignored)')
console.log(`display text held constant: ${DISPLAY}`)
console.log(dirname(auditionDir))
