// Rung-2 request writer. Emits one numbered self-contained request file per
// art slot (media/requests/NN-slot.md) plus the consolidated paste file
// (media/requests/ALL-REQUESTS.md) that is the primary rung-2 path: a human
// pastes each block into ChatGPT.app in order, attaches the reference, and
// drops the returned image into media/intake/ under the NN-slot.ext name the
// intake watcher expects. Minutes, not an afternoon.
//
// No heredocs: every string is a committed template in this file. No
// em-dashes anywhere, including the prompt bodies. The slot targets come from
// media/slot-dimensions.json so pixel sizes live in exactly one place.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, '..')
const requestsDir = join(mediaDir, 'requests')
const dims = JSON.parse(readFileSync(join(mediaDir, 'slot-dimensions.json'), 'utf8'))

// The art-direction preamble, prepended to every request so each file stands
// alone. One voice, period-accurate 1983, photographic, no text baked on any
// screen (the live game draws over the glass).
export const PREAMBLE = [
  'ART DIRECTION (applies to every request below).',
  '',
  'SHALL WE PLAY A GAME? is a WarGames-inspired browser game set in 1983.',
  'Every image is photographic and cinematic, period-accurate to 1983, never',
  'modern. Palette: deep navy-black shadow, cold electric-blue CRT glow, amber',
  'and green indicator lamps, faint scanlines. Mood: a dim NORAD-style',
  'underground command room, brutalist early-80s hardware, deep shadow at the',
  'frame edges. No lens flares, no modern UI, no visible modern text.',
  '',
  'ATTACH THE REFERENCE: attach planning/reference/crt-reference.jpg to every',
  'request. Match its CRT glass tone, border glow, and scanline feel exactly.',
].join('\n')

// The dark-readout constraint. REQUIRED verbatim in the countdown-insert and
// failsafe-wall requests because those slots sit under live game numbers; the
// generated art must leave those readout zones dark and empty.
export const DARK_READOUT =
  'DARK READOUT CONSTRAINT: leave every readout surface DARK and EMPTY wherever ' +
  'the game draws live numbers. No baked-in digits, clocks, counters, or labels ' +
  'on any screen or panel the live countdown and status text will overlay. A ' +
  'faint unlit glass or an off indicator only.'

// Slot art-direction bodies, in paste order. The dark-readout slots carry the
// constraint inline. Bodies are short and specific; the preamble carries the
// shared palette and reference-attachment rule.
const SLOT_BODIES = {
  'hero-desktop':
    'The opening hero, landscape. The WOPR supercomputer in a dim 1983 command ' +
    'room, a chunky CRT terminal roughly centered, its glass DARK navy-black with ' +
    'a thin luminous blue-white border. Keep the center screen clean and dark so a ' +
    'camera pushes straight into it; environment darkens at the edges. No text on ' +
    'the glass.',
  'hero-portrait':
    'A portrait reframe of the SAME hero scene for phones. Same WOPR command room, ' +
    'same CRT terminal centered in the upper-middle third, more headroom and floor. ' +
    'Glass DARK and empty. No text on the glass.',
  'hero-return':
    'The returning-session hero: the same WOPR command room, slightly warmer and ' +
    'settled, as if the machine has been left running. CRT glass DARK and empty, ' +
    'center clean for the live greeting. No text on the glass.',
  'menu-rack':
    'A wide low backdrop rack of blinking early-80s indicator panels and reel-to-reel ' +
    'tape drives, 4 to 1, for behind the main menu. Deep shadow, amber and green ' +
    'lamps, no screens showing text.',
  'bezel-texture':
    'A seamless square tiling texture of brushed dark charcoal metal with recessed ' +
    'bolt heads and panel seams, for the terminal bezel. Even lighting, no focal ' +
    'point, tiles cleanly edge to edge.',
  'countdown-insert':
    'A narrow 3 to 1 insert strip of a 1983 cabinet readout band that sits under the ' +
    'live countdown. ' + DARK_READOUT,
  'briefing-outlook':
    'A 4 to 3 briefing panel: a period weather-outlook chart on a backlit command-room ' +
    'board, legible as a chart but with no live numbers. Soft CRT glow.',
  'briefing-flights':
    'A 4 to 3 briefing panel: a 1983 flight-status board on a backlit command-room ' +
    'board, the rows suggested but no live numbers. Soft CRT glow.',
  'briefing-bank':
    'A 4 to 3 briefing panel: a ledger-and-balances board on a backlit command-room ' +
    'board, columns suggested but no live numbers. Soft CRT glow.',
  'failsafe-wall':
    'An ultrawide 21 to 9 global failsafe wall of maps and status panels revealed ' +
    'behind the terminal. Cold blue glow, deep shadow. ' + DARK_READOUT,
  'ending-recovery':
    'A 16 to 9 ending still: the command room calmed, lamps settling to steady green, ' +
    'the machine standing down. Hopeful but spare. No text on screens.',
  'ending-containment':
    'A 16 to 9 ending still: the crisis held, lamps amber and steady, a cost in the ' +
    'air. Tense stillness. No text on screens.',
  'ending-failure':
    'A 16 to 9 ending still: the room gone to red warning light and deep shadow, the ' +
    'only winning move not to play. Bleak. No text on screens.',
}

// Paste order: hero first, then supporting, then endings. Also the order the
// numbered files get.
export const SLOT_ORDER = [
  'hero-desktop',
  'hero-portrait',
  'hero-return',
  'menu-rack',
  'bezel-texture',
  'countdown-insert',
  'briefing-outlook',
  'briefing-flights',
  'briefing-bank',
  'failsafe-wall',
  'ending-recovery',
  'ending-containment',
  'ending-failure',
]

function pad(n) {
  return String(n).padStart(2, '0')
}

/** Build the per-slot request body (preamble + target size + art direction +
 *  attachment and filename instructions). Pure string assembly, returned so a
 *  test can inspect it without touching disk. */
export function buildRequest(slot, index) {
  const d = dims.slots[slot]
  if (!d) throw new Error(`request-writer: no dimensions for slot "${slot}"`)
  const nn = pad(index)
  const lines = [
    `# Request ${nn}: ${slot}`,
    '',
    PREAMBLE,
    '',
    `TARGET SIZE: ${d.targetW} by ${d.targetH} pixels (2x), aspect from the slot table.`,
    '',
    'ART DIRECTION FOR THIS SLOT:',
    SLOT_BODIES[slot],
    '',
    'DELIVER: one image. Save or export it, then drop it into media/intake/ named',
    `exactly ${nn}-${slot}.png (or .jpg / .webp). The intake watcher matches that`,
    'name and files it under media/src/. Attach planning/reference/crt-reference.jpg.',
    '',
  ]
  return lines.join('\n')
}

/** Write all numbered request files and the consolidated ALL-REQUESTS.md. */
export function writeAllRequests() {
  mkdirSync(requestsDir, { recursive: true })
  const consolidated = [
    '# ALL REQUESTS: the primary rung-2 paste path',
    '',
    'Paste each block below into ChatGPT.app in order, attach',
    'planning/reference/crt-reference.jpg to each, and save the returned image',
    'into media/intake/ under the NN-slot.ext filename named in each block',
    '(for example 01-hero-desktop.png). The intake watcher files matches into',
    'media/src/ and prints the outstanding checklist. Filename convention:',
    'NN-slot.ext where NN is the two-digit request number and slot is the slot id.',
    '',
  ]
  SLOT_ORDER.forEach((slot, i) => {
    const index = i + 1
    const body = buildRequest(slot, index)
    const nn = pad(index)
    writeFileSync(join(requestsDir, `${nn}-${slot}.md`), body, 'utf8')
    consolidated.push('---', '', body)
  })
  writeFileSync(join(requestsDir, 'ALL-REQUESTS.md'), consolidated.join('\n'), 'utf8')
  return { count: SLOT_ORDER.length }
}

// Allow `node request-writer.mjs` to regenerate the files.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = writeAllRequests()
  console.log(`wrote ${r.count} numbered requests plus ALL-REQUESTS.md`)
}
