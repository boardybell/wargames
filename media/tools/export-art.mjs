// Export a selected source image to AVIF (primary) plus JPEG (fallback) into
// public/art/, sized to a target. Committed, no heredocs. Usage:
//   node media/tools/export-art.mjs <src.png> <slotName> <width> <height> [avifQuality]
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { statSync } from 'node:fs'

const [, , src, slot, wArg, hArg, qArg] = process.argv
if (!src || !slot || !wArg || !hArg) {
  console.error('usage: export-art.mjs <src> <slot> <width> <height> [avifQuality]')
  process.exit(1)
}
const width = Number(wArg)
const height = Number(hArg)
const avifQuality = qArg ? Number(qArg) : 48

mkdirSync('public/art', { recursive: true })

const base = sharp(src).resize(width, height, { fit: 'cover', position: 'centre' })

const avifPath = `public/art/${slot}.avif`
const jpgPath = `public/art/${slot}.jpg`

await base.clone().avif({ quality: avifQuality, effort: 6 }).toFile(avifPath)
await base.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(jpgPath)

const kb = (p) => Math.round(statSync(p).size / 1024)
console.log(`${avifPath}: ${kb(avifPath)} KB (${width}x${height})`)
console.log(`${jpgPath}: ${kb(jpgPath)} KB`)
