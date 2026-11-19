// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { CUE_MANIFEST } from '../../src/app/audio/manifest'
import { JOSHUA_LINES } from '../../src/engine/joshua/lines'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

// The em-dash family: real em-dash, en-dash, and the horizontal bar. The ASCII
// hyphen-minus is allowed (slot ids use it); these three are banned anywhere
// this split authors prose.
const EM_DASH = /[—–―]/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

describe('no em-dash anywhere this split authors', () => {
  it('request files carry no em-dash', () => {
    const requests = walk(join(repoRoot, 'media/requests'))
    for (const f of requests) {
      const text = readFileSync(f, 'utf8')
      expect(EM_DASH.test(text), `${f} has an em-dash`).toBe(false)
    }
  })

  it('discovery and review docs carry no em-dash', () => {
    for (const doc of ['media/DISCOVERY.md', 'media/REVIEWS.md']) {
      const text = readFileSync(join(repoRoot, doc), 'utf8')
      expect(EM_DASH.test(text), `${doc} has an em-dash`).toBe(false)
    }
  })

  it('cue transcripts carry no em-dash (captions read clean)', () => {
    for (const cue of Object.values(CUE_MANIFEST)) {
      if (cue.transcript) expect(EM_DASH.test(cue.transcript), cue.id).toBe(false)
    }
  })

  it('catalog voice text carries no em-dash', () => {
    for (const line of JOSHUA_LINES) {
      expect(EM_DASH.test(line.text), line.id).toBe(false)
    }
  })

  it('media tool sources carry no em-dash', () => {
    const tools = walk(join(repoRoot, 'media/tools'))
    for (const f of tools) {
      const text = readFileSync(f, 'utf8')
      expect(EM_DASH.test(text), `${f} has an em-dash`).toBe(false)
    }
  })
})

describe('gitignore discipline', () => {
  const gi = readFileSync(join(repoRoot, '.gitignore'), 'utf8')
  const lines = gi.split('\n').map((l) => l.trim())

  it('excludes media/src/ and the audition candidates and intake', () => {
    expect(lines).toContain('media/src/')
    expect(lines).toContain('media/audition/')
    expect(lines).toContain('media/intake/')
  })

  it('does not exclude public/ (exported assets stay committed)', () => {
    for (const l of lines) {
      if (!l || l.startsWith('#')) continue
      expect(l).not.toMatch(/^public\/?$/)
      expect(l.startsWith('public/')).toBe(false)
    }
  })
})
