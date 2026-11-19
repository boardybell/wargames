// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
// The provenance checklist is a .mjs tool, imported directly so the schema
// test enforces it as code, not prose.
// @ts-expect-error - .mjs tool has no type declarations
import { checkProvenance, provenanceBlock } from '../../media/tools/provenance.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const discovery = JSON.parse(
  readFileSync(join(repoRoot, 'media/discovery.json'), 'utf8'),
)

const MEDIA_CLASSES = ['image-generate', 'image-critique', 'audio-critique']
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

describe('discovery.json schema (CI fails on a prose-only record)', () => {
  it('parses and carries the required top-level shape', () => {
    expect(Array.isArray(discovery.probes)).toBe(true)
    expect(typeof discovery.rungByClass).toBe('object')
    expect(typeof discovery.modelTierPinned).toBe('boolean')
    expect(typeof discovery.exceptions).toBe('object')
  })

  it('has a rung-by-class map covering every media class', () => {
    for (const cls of MEDIA_CLASSES) {
      expect(discovery.rungByClass).toHaveProperty(cls)
    }
  })

  it('carries the three exception lists that gate the suite', () => {
    expect(Array.isArray(discovery.exceptions.placeholderSlots)).toBe(true)
    expect(Array.isArray(discovery.exceptions.missingVoiceClips)).toBe(true)
    expect(typeof discovery.exceptions.roomLoopPending).toBe('boolean')
  })

  it('every probe record matches the schema: stage, mediaClass, rung, ISO timestamp, provenance field', () => {
    for (const p of discovery.probes) {
      expect(typeof p.stage).toBe('string')
      expect(MEDIA_CLASSES).toContain(p.mediaClass)
      expect([1, 2, 3]).toContain(p.rung)
      expect(p.timestamp).toMatch(ISO)
      // provenance is present as a field (object for rung 1, null otherwise).
      expect('provenance' in p).toBe(true)
    }
  })

  it('a rung-1 image-generate record REQUIRES a complete provenance block and is rejected if any field is missing or failed', () => {
    // Provenance is raster-specific (decode, format, dimensions, sanity), so it
    // is required for the image-generate lane only. The critique lanes
    // (image-critique, audio-critique) prove reachability by accepting an
    // attachment and returning a verdict; they carry no raster to provenance,
    // so their rung-1 records legitimately hold a null provenance block.
    const genRung1 = discovery.probes.filter(
      (x: { rung: number; mediaClass: string }) =>
        x.rung === 1 && x.mediaClass === 'image-generate',
    )
    // The generation lane must have at least one real provenanced rung-1 record.
    expect(genRung1.length).toBeGreaterThan(0)
    for (const p of genRung1) {
      expect(p.provenance).not.toBeNull()
      // Reconstruct the record shape the checklist validates and assert it
      // would have passed. A rung-1 record with a hole must not exist.
      const rebuilt = {
        decoded: true,
        format: p.provenance.format,
        width: p.provenance.width,
        height: p.provenance.height,
        sanityVerdict: p.provenance.sanityVerdict,
      }
      expect(checkProvenance(rebuilt).ok).toBe(true)
    }
  })
})

describe('provenance checklist (enforced in code, unit-tested every branch)', () => {
  const good = {
    decoded: true,
    format: 'png',
    width: 1536,
    height: 1024,
    sanityVerdict: 'pass',
  }

  it('passes a fabricated good record', () => {
    const r = checkProvenance(good)
    expect(r.ok).toBe(true)
    expect(r.failures).toEqual([])
  })

  it('rejects a record that did not decode as a raster', () => {
    const r = checkProvenance({ ...good, decoded: false, format: 'txt' })
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/raster/)
  })

  it('rejects a non-raster format', () => {
    const r = checkProvenance({ ...good, format: 'svg' })
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/format/)
  })

  it('rejects trivial dimensions (shorter side below the minimum)', () => {
    const r = checkProvenance({ ...good, width: 64, height: 64 })
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/trivial/)
  })

  it('rejects an absent sanity verdict', () => {
    const r = checkProvenance({ ...good, sanityVerdict: null })
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/absent/)
  })

  it('rejects a failing sanity verdict', () => {
    const r = checkProvenance({ ...good, sanityVerdict: 'fail' })
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/did not pass/)
  })

  it('provenanceBlock emits exactly the four stable fields', () => {
    const b = provenanceBlock(good)
    expect(Object.keys(b).sort()).toEqual(['format', 'height', 'sanityVerdict', 'width'])
  })
})
