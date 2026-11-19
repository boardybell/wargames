// Shared WOPR voice post-processing chain, applied identically to every
// audition candidate and every full-render clip. The chain shapes a raw
// synthesis WAV into the film WOPR register: band-pass 300 to 3000 Hz to sit
// a voice in the telephone-era band, a light bitcrush for early-80s formant
// grit, loudness normalize, and a silence trim at both ends. One function so
// the audition and the full render cannot drift apart.
//
// No cloud, no credentials: ffmpeg + a local synth engine only.
import { spawnSync } from 'node:child_process'

/** Run a command, throwing with captured stderr on nonzero exit. */
export function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`)
  }
  return r
}

// The ffmpeg filter graph for the WOPR voice chain. Kept as one string so both
// the audition and the full render apply byte-identical processing.
//   highpass/lowpass : band-pass 300 to 3000 Hz
//   acrusher         : light bitcrush (bits 8, period-hold for formant grit)
//   loudnorm         : normalize to a comfortable integrated loudness
//   silenceremove    : trim leading and trailing silence
export const WOPR_FILTER = [
  'highpass=f=300',
  'lowpass=f=3000',
  'acrusher=bits=8:mode=log:samples=2',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  'silenceremove=start_periods=1:start_threshold=-50dB:detection=peak,areverse,silenceremove=start_periods=1:start_threshold=-50dB:detection=peak,areverse',
].join(',')

/** Band-pass + bitcrush + normalize + trim a raw WAV into a processed mono
 *  48kHz 16-bit WAV. Deterministic given the same input. */
export function postProcess(rawWav, outWav) {
  run('ffmpeg', [
    '-y',
    '-i', rawWav,
    '-af', WOPR_FILTER,
    '-ar', '48000',
    '-ac', '1',
    '-sample_fmt', 's16',
    outWav,
  ])
}

/** Encode a processed WAV to opus (primary) and a real AAC stream (fallback).
 *  AAC is written into an .aac ADTS stream, not a bare m4a container, so the
 *  decode path has a true AAC bitstream to chew on. */
export function encode(processedWav, outBaseNoExt) {
  // Opus primary, 48kHz, mono, VBR.
  run('ffmpeg', [
    '-y',
    '-i', processedWav,
    '-c:a', 'libopus',
    '-b:a', '48k',
    '-ar', '48000',
    '-ac', '1',
    `${outBaseNoExt}.opus`,
  ])
  // AAC fallback as a raw ADTS stream (.aac), a genuine AAC bitstream.
  run('ffmpeg', [
    '-y',
    '-i', processedWav,
    '-c:a', 'aac',
    '-b:a', '96k',
    '-ar', '48000',
    '-ac', '1',
    '-f', 'adts',
    `${outBaseNoExt}.aac`,
  ])
}

/** Verify a file decodes: ffprobe reports a valid audio stream with a codec. */
export function verifyDecode(path, expectCodec) {
  const r = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name',
    '-of', 'default=nw=1:nk=1',
    path,
  ])
  const codec = r.stdout.trim()
  if (expectCodec && codec !== expectCodec) {
    throw new Error(`${path}: expected codec ${expectCodec}, got ${codec}`)
  }
  // Full decode round-trip to null: proves the bitstream is decodable.
  run('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'])
  return codec
}

/** Synthesize a line of text to a raw WAV via espeak-ng formant synthesis.
 *  phoneticInput is the engine input (may carry phonetic hints); it never
 *  touches the transcript. Low pitch and slowed rate approach the WOPR cadence. */
export function synthEspeak(phoneticInput, outWav) {
  run('espeak-ng', [
    '-v', 'en-us',
    '-s', '150', // words per minute, measured and deliberate
    '-p', '20', // low pitch, flattened toward the WOPR monotone
    '-a', '150', // amplitude
    '-g', '8', // word gap, a touch of machine spacing
    '-w', outWav,
    phoneticInput,
  ])
}

/** Synthesize a line via macOS say with a classic voice, pitch flattened by the
 *  post chain. Fred is the closest classic Macintalk formant voice. */
export function synthSay(text, outWav) {
  // say infers format from the output extension; write WAVE directly so the
  // post chain has one input format and no intermediate container surprises.
  const sayWav = outWav.replace(/\.wav$/, '.say.wav')
  run('say', ['-v', 'Fred', '-o', sayWav, '--file-format=WAVE', '--data-format=LEI16@22050', text])
  run('ffmpeg', ['-y', '-i', sayWav, '-ar', '48000', '-ac', '1', outWav])
}
