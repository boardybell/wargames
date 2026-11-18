import { describe, expect, it } from 'vitest'
import { assertJsonSafe, canonicalStringify, stateHash } from './canonical'

describe('canonical stringify', () => {
  it('sorts keys recursively so insertion order cannot matter', () => {
    const a = { outer: { b: 2, a: 1 }, list: [{ y: 2, x: 1 }] }
    const b = { list: [{ x: 1, y: 2 }], outer: { a: 1, b: 2 } }
    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
    expect(stateHash(a)).toBe(stateHash(b))
  })

  it('normalizes minus zero to zero', () => {
    expect(canonicalStringify({ n: -0 })).toBe(canonicalStringify({ n: 0 }))
    expect(canonicalStringify({ n: -0 })).not.toContain('-0')
  })

  it('hashes a fixed fixture deterministically', () => {
    const fixture = { seed: 'one', values: [3, 1, 2], flags: { live: true } }
    expect(stateHash(fixture)).toBe(stateHash(fixture))
  })

  it('throws loudly on JSON-unsafe values with a path', () => {
    expect(() => canonicalStringify({ a: { b: NaN } })).toThrow(/\.a\.b/)
    expect(() => canonicalStringify({ n: Infinity })).toThrow(/non-finite/)
    expect(() => canonicalStringify({ u: undefined })).toThrow(/undefined/)
    expect(() => canonicalStringify(new Map())).toThrow(/non-plain/)
    expect(() => canonicalStringify(new Set())).toThrow(/non-plain/)
    expect(() => canonicalStringify(new Date(0))).toThrow(/non-plain/)
    expect(() => assertJsonSafe({ deep: [{ bad: () => 1 }] })).toThrow(/function/)
  })

  it('accepts plain JSON-safe state', () => {
    expect(() =>
      assertJsonSafe({ a: [1, 'two', true, null], b: { c: 0 } }),
    ).not.toThrow()
  })
})
