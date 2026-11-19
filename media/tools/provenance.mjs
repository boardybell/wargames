// The rung-1 provenance checklist. A file appearing on disk does NOT grant
// rung 1 on its own: this checklist must pass first. It decodes the candidate
// as a real raster, confirms the dimensions are nontrivial, and confirms a
// critique-lane sanity verdict is present and passing. The function is pure
// over its input record so every failing branch is directly unit-testable;
// the probe builds the record (decoding with sharp, running the sanity pass)
// and hands it here for the verdict.
//
// No heredocs, no DOM, no network: the checklist is arithmetic and string
// checks over a plain object. The shipped site never runs this; it is a
// build-time gate only.

/** The minimum shorter side (in pixels) a real generation must have. A
 *  handful of improvised pixels will not clear this. */
export const MIN_SHORTER_SIDE = 512

/** Raster formats a genuine generation decodes as. Anything else (svg, a text
 *  file renamed, an animated placeholder) fails the format check. */
export const RASTER_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp', 'avif', 'tiff'])

/**
 * A provenance record, as assembled by the probe:
 *   {
 *     format: 'png',          // what the decoder reported
 *     width: 1536,            // decoded pixel width
 *     height: 1024,           // decoded pixel height
 *     decoded: true,          // the decoder returned real raster metadata
 *     sanityVerdict: 'pass',  // critique-lane verdict: 'pass' | 'fail' | null
 *   }
 */

/** Run the checklist. Returns { ok, failures }: ok is true only when every
 *  check passes; failures names each failed check so the probe can log the
 *  exact reason and the schema test can assert the record was rejected. */
export function checkProvenance(record) {
  const failures = []
  if (!record || typeof record !== 'object') {
    return { ok: false, failures: ['no record'] }
  }
  // 1. Decodes as a real raster.
  if (record.decoded !== true) {
    failures.push('not decoded as a raster')
  }
  const fmt = typeof record.format === 'string' ? record.format.toLowerCase() : ''
  if (!RASTER_FORMATS.has(fmt)) {
    failures.push('format is not a known raster')
  }
  // 2. Dimensions nontrivial.
  const w = Number(record.width)
  const h = Number(record.height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    failures.push('dimensions missing or nonpositive')
  } else if (Math.min(w, h) < MIN_SHORTER_SIDE) {
    failures.push('dimensions trivial (shorter side below minimum)')
  }
  // 3. Sanity verdict present and passing.
  if (record.sanityVerdict == null) {
    failures.push('sanity verdict absent')
  } else if (record.sanityVerdict !== 'pass') {
    failures.push('sanity verdict did not pass')
  }
  return { ok: failures.length === 0, failures }
}

/** Build the compact provenance block written into discovery.json for a
 *  passing rung-1 record. Only the four stable fields the schema test asserts.
 */
export function provenanceBlock(record) {
  return {
    format: String(record.format).toLowerCase(),
    width: Number(record.width),
    height: Number(record.height),
    sanityVerdict: record.sanityVerdict,
  }
}
