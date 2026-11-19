// Contact-sheet builder. Wraps ImageMagick montage: given candidate images it
// emits a labeled contact sheet, each asset name under its tile, plus desktop
// and phone crop renderings for hero candidates and live-copy rect markers
// (where the game draws live text and readouts, sourced from HeroCrop metadata
// and the per-slot overlay-zones.json beside this tool). Output lands in
// media/review/ for Stage C. Section 02 owns the critique loop; this makes the
// sheet a one-command affair.
//
// No heredocs. ImageMagick (magick / montage / convert) is required at run
// time; it is a review convenience, not shipped, and not needed by CI. If
// ImageMagick is absent the tool reports that and exits nonzero without
// pretending to succeed.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename, extname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, '..')
const reviewDir = join(mediaDir, 'review')
const zones = JSON.parse(readFileSync(join(here, 'overlay-zones.json'), 'utf8'))

/** Resolve the montage binary. ImageMagick 7 ships `magick montage`; older
 *  installs ship a standalone `montage`. Returns the argv prefix or null. */
export function resolveMontage() {
  for (const [cmd, pre] of [
    ['magick', ['magick', 'montage']],
    ['montage', ['montage']],
  ]) {
    try {
      execFileSync(cmd, ['-version'], { stdio: 'ignore' })
      return pre
    } catch {
      // try the next form
    }
  }
  return null
}

/** The overlay zones for a slot (fractions), combining HeroCrop glass for
 *  hero slots with the declared zones. Pure, testable without ImageMagick. */
export function zonesForSlot(slot, heroCrop) {
  const out = []
  if (heroCrop && heroCrop.glass) {
    out.push({ ...heroCrop.glass, label: 'live glass' })
  }
  if (zones.zones[slot]) out.push(...zones.zones[slot])
  return out
}

/** Collect candidate image paths from a directory. */
export function candidates(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => ['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(extname(f).toLowerCase()))
    .map((f) => join(dir, f))
}

function buildSheet(images) {
  const montage = resolveMontage()
  if (!montage) {
    console.error(
      'contact-sheet: ImageMagick not found. Install it (brew install imagemagick) to build review sheets.',
    )
    process.exit(2)
  }
  mkdirSync(reviewDir, { recursive: true })
  const out = join(reviewDir, 'contact-sheet.png')
  const labeled = images.flatMap((img) => ['-label', basename(img, extname(img)), img])
  const args = [
    ...montage.slice(1),
    ...labeled,
    '-tile',
    '3x',
    '-geometry',
    '480x270+8+8',
    '-background',
    '#0a0e14',
    '-fill',
    '#9fe8ff',
    out,
  ]
  execFileSync(montage[0], args, { stdio: 'inherit' })
  console.log(`contact-sheet: wrote ${out}`)
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const srcArg = process.argv[2] || join(mediaDir, 'src', 'hero')
  const imgs = candidates(srcArg)
  if (imgs.length === 0) {
    console.error(`contact-sheet: no candidate images under ${srcArg}`)
    process.exit(1)
  }
  buildSheet(imgs)
}
