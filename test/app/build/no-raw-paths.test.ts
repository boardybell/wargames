// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const appDir = join(repoRoot, 'src/app')
const fontsDir = join(repoRoot, 'public/fonts')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

// A deliberately dumb and loud scanner: the only sanctioned path to an
// asset URL is urlFor. A hit is fixed by rewriting the source through
// urlFor, never by widening this list. Every quote class includes the
// backtick, and the fetch/new URL/concatenation forms are covered, because
// dynamic audio (section 07) and art (section 10) URLs are written as
// template literals and concatenations, and those are exactly the forms a
// quote-only scanner waves through.
const Q = '["\'`]' // single, double, or backtick
const RAW_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: 'src=.../', re: new RegExp(`src\\s*=\\s*\\{?\\s*${Q}\\s*/`) },
  { label: 'href=.../', re: new RegExp(`href\\s*=\\s*\\{?\\s*${Q}\\s*/`) },
  { label: 'url(/', re: new RegExp(`url\\(\\s*${Q}?\\s*/`) },
  { label: 'fetch(.../', re: new RegExp(`fetch\\(\\s*${Q}\\s*/`) },
  { label: 'new URL(.../', re: new RegExp(`new URL\\(\\s*${Q}\\s*/`) },
  // Any string or template literal naming an asset dir, regardless of quote.
  { label: 'literal /fonts|/audio|/art|/assets', re: new RegExp(`${Q}/(?:fonts|audio|art|assets)/`) },
  // A bare leading-slash literal being concatenated: '/' + 'fonts/...'.
  { label: 'slash literal concatenation', re: new RegExp(`${Q}/${Q}\\s*\\+`) },
]

const EXTERNAL_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  '://', // any scheme-based absolute origin in app source is suspect
]

describe('no raw asset paths under src/app', () => {
  const files = walk(appDir).filter((f) => /\.(ts|tsx|css)$/.test(f))

  it('every source file references assets only through urlFor', () => {
    const violations: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const { label, re } of RAW_PATTERNS) {
        if (re.test(text)) violations.push(`${file}: ${label}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('no app source references an external font or asset origin', () => {
    const violations: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const origin of EXTERNAL_ORIGINS) {
        if (text.includes(origin)) violations.push(`${file}: ${origin}`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('the scanner has teeth', () => {
  const hits = (s: string) => RAW_PATTERNS.some((p) => p.re.test(s))

  it('catches backtick, concatenation, and single-quote raw asset paths', () => {
    expect(hits('fetch(`/audio/x.wav`)')).toBe(true)
    expect(hits('new URL(`/art/x.png`)')).toBe(true)
    expect(hits('const f = `/fonts/x.woff2`')).toBe(true)
    expect(hits('<img src={`/foo`} />')).toBe(true)
    expect(hits("<a href='/bar'>")).toBe(true)
    expect(hits("const u = '/' + 'fonts/x'")).toBe(true)
  })

  it('leaves the sanctioned urlFor forms clean', () => {
    expect(hits("urlFor('audio/cue.wav')")).toBe(false)
    expect(hits('src={urlFor(`art/${id}.png`)}')).toBe(false)
    expect(hits("const rel = path.startsWith('/') ? path.slice(1) : path")).toBe(
      false,
    )
  })
})

describe('self-hosted fonts are present', () => {
  it('both woff2 faces exist under public/fonts', () => {
    const names = readdirSync(fontsDir)
    expect(names).toContain('glass-tty-vt220.woff2')
    expect(names).toContain('vt323.woff2')
  })

  it('index.html references no external origin', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8')
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
  })
})
