import { describe, expect, it } from 'vitest'
import { urlFor } from '@app/urlFor'

// import.meta.env.BASE_URL is '/' under the test runner; the join logic is
// what matters here (the subpath smoke lives in built-html.test.ts).
describe('urlFor', () => {
  it('joins without a double slash whether or not the input leads with /', () => {
    expect(urlFor('fonts/glass-tty.woff2')).toBe('/fonts/glass-tty.woff2')
    expect(urlFor('/fonts/glass-tty.woff2')).toBe('/fonts/glass-tty.woff2')
  })

  it('returns base-relative URLs for nested paths', () => {
    expect(urlFor('audio/cue.wav')).toBe('/audio/cue.wav')
    expect(urlFor('art/wopr/frame-01.png')).toBe('/art/wopr/frame-01.png')
  })

  it('handles empty and root inputs (BASE_URL always ends in a slash)', () => {
    // Vite guarantees a trailing slash on BASE_URL; under the test runner it
    // is '/'. Empty and bare-root inputs resolve to the base root, never a
    // double slash.
    expect(urlFor('')).toBe('/')
    expect(urlFor('/')).toBe('/')
  })

  it('is a pure string function (no DOM)', () => {
    const before = urlFor('fonts/x.woff2')
    const after = urlFor('fonts/x.woff2')
    expect(after).toBe(before)
    expect(typeof urlFor('x')).toBe('string')
  })
})
