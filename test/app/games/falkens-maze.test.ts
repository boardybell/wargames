import { describe, expect, it } from 'vitest'
import {
  DIRS,
  SIZES,
  START,
  efficiency,
  exitOf,
  generate,
  hintFrom,
  isOpen,
  openDirs,
  recordKey,
  samePos,
  shortestMoves,
  shortestPath,
  tryMove,
  type Maze,
  type Pos,
} from '@app/game/games/engines/falkens-maze'

function reachable(m: Maze): number {
  const seen = new Set<string>(['0,0'])
  const q: Pos[] = [START]
  while (q.length) {
    const p = q.pop()!
    for (const d of openDirs(m, p)) {
      const r = tryMove(m, p, d)
      const k = `${r.pos.c},${r.pos.r}`
      if (!seen.has(k)) {
        seen.add(k)
        q.push(r.pos)
      }
    }
  }
  return seen.size
}

describe('falkens maze engine', () => {
  it('same seed and size carve the same maze; different seeds differ', () => {
    expect(generate(1234, 11)).toEqual(generate(1234, 11))
    expect(generate(1234, 11).cells).not.toEqual(generate(1235, 11).cells)
  })

  it('every size is a perfect maze: all cells connected, exactly n*n-1 passages, closed border', () => {
    for (const { n } of Object.values(SIZES)) {
      for (const seed of [1, 42, 99999]) {
        const m = generate(seed, n)
        expect(reachable(m)).toBe(n * n)
        let open = 0
        for (let r = 0; r < n; r++)
          for (let c = 0; c < n; c++) {
            const p = { c, r }
            if (isOpen(m, p, 'e')) open++
            if (isOpen(m, p, 's')) open++
            if (r === 0) expect(isOpen(m, p, 'n')).toBe(false)
            if (c === 0) expect(isOpen(m, p, 'w')).toBe(false)
            if (r === n - 1) expect(isOpen(m, p, 's')).toBe(false)
            if (c === n - 1) expect(isOpen(m, p, 'e')).toBe(false)
          }
        expect(open).toBe(n * n - 1)
      }
    }
  })

  it('a move into a wall is refused and leaves the position unchanged (review: UP at a north-walled start)', () => {
    const m = generate(7, 11)
    const r = tryMove(m, START, 'n')
    expect(r.ok).toBe(false)
    expect(r.pos).toEqual(START)
    const open = openDirs(m, START)
    expect(open.length).toBeGreaterThan(0)
    for (const d of DIRS) expect(tryMove(m, START, d).ok).toBe(open.includes(d))
  })

  it('walls are consistent from both sides', () => {
    const m = generate(31337, 15)
    for (let r = 0; r < 15; r++)
      for (let c = 0; c < 15; c++) {
        const p = { c, r }
        if (c < 14) expect(isOpen(m, p, 'e')).toBe(isOpen(m, { c: c + 1, r }, 'w'))
        if (r < 14) expect(isOpen(m, p, 's')).toBe(isOpen(m, { c, r: r + 1 }, 'n'))
      }
  })

  it('shortest route is a legal walk from start to exit, and following hints walks it exactly', () => {
    const m = generate(2024, 11)
    const path = shortestPath(m, START, exitOf(m))
    expect(path[0]).toEqual(START)
    expect(path[path.length - 1]).toEqual(exitOf(m))
    expect(shortestMoves(m)).toBe(path.length - 1)
    let p = START
    let steps = 0
    while (!samePos(p, exitOf(m))) {
      const d = hintFrom(m, p)!
      const r = tryMove(m, p, d)
      expect(r.ok).toBe(true)
      p = r.pos
      steps++
      expect(p).toEqual(path[steps])
    }
    expect(steps).toBe(shortestMoves(m))
    expect(hintFrom(m, exitOf(m))).toBeNull()
  })

  it('efficiency is shortest over moves, 100 for a perfect run', () => {
    expect(efficiency(20, 20)).toBe(100)
    expect(efficiency(40, 20)).toBe(50)
    expect(efficiency(30, 20)).toBe(67)
    expect(efficiency(0, 20)).toBe(0)
  })

  it('records are keyed by size and seed', () => {
    expect(recordKey('small', 5)).toBe('best:small:5')
    expect(recordKey('large', 5)).not.toBe(recordKey('small', 5))
  })
})
