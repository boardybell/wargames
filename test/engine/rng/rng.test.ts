import { describe, expect, it } from 'vitest'
import { forkStream, nextInt, rngFromSeed } from '@engine/rng'
import type { RngState } from '@engine/rng'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

function drawSequence(start: RngState, count: number): number[] {
  const out: number[] = []
  let rng = start
  for (let i = 0; i < count; i++) {
    const [value, next] = nextInt(rng, 0, 999_999)
    out.push(value)
    rng = next
  }
  return out
}

describe('rngFromSeed', () => {
  it('yields identical draw sequences for identical seeds', () => {
    expect(drawSequence(rngFromSeed(1984), 32)).toEqual(
      drawSequence(rngFromSeed(1984), 32),
    )
  })

  it('yields different sequences for different seeds', () => {
    expect(drawSequence(rngFromSeed(1), 16)).not.toEqual(
      drawSequence(rngFromSeed(2), 16),
    )
  })

  it('produces JSON-safe state', () => {
    const rng = rngFromSeed(7)
    const roundTripped = JSON.parse(JSON.stringify(rng)) as RngState
    expect(roundTripped).toEqual(rng)
  })
})

describe('nextInt', () => {
  it('is inclusive of both bounds and never outside the range', () => {
    let rng = rngFromSeed(3)
    const seen = new Set<number>()
    for (let i = 0; i < 400; i++) {
      const [value, next] = nextInt(rng, 1, 6)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(6)
      expect(Number.isInteger(value)).toBe(true)
      seen.add(value)
      rng = next
    }
    expect(seen.has(1)).toBe(true)
    expect(seen.has(6)).toBe(true)
  })

  it('returns a new state and never mutates the input', () => {
    const rng = rngFromSeed(11)
    const before = JSON.parse(JSON.stringify(rng)) as RngState
    const [, next] = nextInt(rng, 0, 100)
    expect(next).not.toBe(rng)
    expect(rng).toEqual(before)
  })

  it('works on a deep-frozen state in strict mode and returns a fresh object', () => {
    const rng = deepFreeze(rngFromSeed(13))
    const run = () => nextInt(rng, 0, 100)
    expect(run).not.toThrow()
    const [, next] = run()
    expect(Object.isFrozen(next)).toBe(false)
    expect(next).not.toBe(rng)
    expect(next.words).not.toBe(rng.words)
  })

  it('rejects invalid bounds and degenerate ranges behave sanely', () => {
    const rng = rngFromSeed(17)
    expect(() => nextInt(rng, 5, 2)).toThrow(/invalid bounds/)
    expect(() => nextInt(rng, 0.5, 2)).toThrow(/invalid bounds/)
    const [value] = nextInt(rng, 7, 7)
    expect(value).toBe(7)
  })

  it('continues the exact sequence after a JSON round trip', () => {
    const rng = rngFromSeed(21)
    const full = drawSequence(rng, 20)
    const prefix = drawSequence(rng, 10)
    let mid = rng
    for (let i = 0; i < 10; i++) {
      const [, next] = nextInt(mid, 0, 999_999)
      mid = next
    }
    const revived = JSON.parse(JSON.stringify(mid)) as RngState
    const suffix = drawSequence(revived, 10)
    expect([...prefix, ...suffix]).toEqual(full)
  })
})

describe('forkStream', () => {
  it('is deterministic for equal inputs', () => {
    const base = rngFromSeed(99)
    expect(drawSequence(forkStream(base, 2), 16)).toEqual(
      drawSequence(forkStream(base, 2), 16),
    )
  })

  it('never mutates its input', () => {
    const base = deepFreeze(rngFromSeed(99))
    const before = JSON.parse(JSON.stringify(base)) as RngState
    forkStream(base, 3)
    expect(base).toEqual(before)
  })

  it('separates streams: no shared contiguous window between forked sequences', () => {
    const base = rngFromSeed(1234)
    const windows = (seq: number[]) => {
      const set = new Set<string>()
      for (let i = 0; i + 4 <= seq.length; i++) {
        set.add(seq.slice(i, i + 4).join(','))
      }
      return set
    }
    const pairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 5],
    ]
    for (const [i, j] of pairs) {
      const a = windows(drawSequence(forkStream(base, i), 256))
      const b = windows(drawSequence(forkStream(base, j), 256))
      const shared = [...b].filter((w) => a.has(w))
      expect(shared, `streams ${i} and ${j}`).toHaveLength(0)
    }
  })

  it('fork at index zero is a plain clone of the current position', () => {
    const base = rngFromSeed(55)
    expect(drawSequence(forkStream(base, 0), 8)).toEqual(
      drawSequence(base, 8),
    )
  })

  it('rejects negative and fractional stream indexes', () => {
    const base = rngFromSeed(55)
    expect(() => forkStream(base, -1)).toThrow(/non-negative integer/)
    expect(() => forkStream(base, 1.5)).toThrow(/non-negative integer/)
  })
})

describe('boundary hardening', () => {
  it('rejects non-finite seeds loudly at the boundary', () => {
    expect(() => rngFromSeed(NaN)).toThrow(/finite/)
    expect(() => rngFromSeed(Infinity)).toThrow(/finite/)
  })

  it('rejects corrupt state shapes before they reach the library', () => {
    expect(() => nextInt({ words: [1] }, 0, 9)).toThrow(/corrupt state/)
    expect(() =>
      nextInt({ words: [1, 2, NaN, 4] }, 0, 9),
    ).toThrow(/corrupt state/)
  })
})
