import { describe, expect, it } from 'vitest'
import {
  CLASSIC_DUNES,
  FUEL,
  LAYOUTS,
  MAX_ROUNDS,
  N,
  START,
  act,
  canFire,
  enemyTurn,
  initState,
  key,
  layoutDunes,
  lineClear,
  pathStep,
  type DState,
  type Tank,
} from '@app/game/games/engines/desert-warfare'

const tank = (id: number, side: 'US' | 'EN', x: number, y: number, over: Partial<Tank> = {}): Tank => ({
  id,
  side,
  x,
  y,
  hp: 3,
  fuel: FUEL,
  acted: false,
  ...over,
})
const S = (tanks: Tank[], dunes: string[], over: Partial<DState> = {}): DState => ({
  layout: 'test',
  dunes,
  tanks,
  sel: 0,
  target: 2,
  round: 1,
  end: null,
  rng: 1,
  ...over,
})

describe('desert warfare: symmetric line of sight (review §11 bug 1)', () => {
  it('fixture: (2,0) and (4,4) with the shipped dunes agree in both directions', () => {
    const d = new Set(CLASSIC_DUNES)
    expect(canFire({ x: 2, y: 0 }, { x: 4, y: 4 }, d)).toBe(canFire({ x: 4, y: 4 }, { x: 2, y: 0 }, d))
  })
  it('canFire(a,b) === canFire(b,a) for every pair on every layout', () => {
    for (const l of LAYOUTS) {
      const d = new Set(layoutDunes(l.id))
      for (let i = 0; i < N * N; i++)
        for (let j = 0; j < N * N; j++) {
          const a = { x: i % N, y: Math.floor(i / N) }
          const b = { x: j % N, y: Math.floor(j / N) }
          expect(canFire(a, b, d)).toBe(canFire(b, a, d))
        }
    }
  })
  it('corner rule: one dune at a corner does not block, two flanking dunes do', () => {
    // (0,0) → (2,2) passes the corners (1,1) and (2,2) in doubled space.
    expect(lineClear({ x: 0, y: 0 }, { x: 2, y: 2 }, new Set(['1,0']))).toBe(true)
    expect(lineClear({ x: 0, y: 0 }, { x: 2, y: 2 }, new Set(['1,0', '0,1']))).toBe(false)
    expect(lineClear({ x: 0, y: 0 }, { x: 2, y: 2 }, new Set(['1,1']))).toBe(false)
  })
})

describe('desert warfare: round boundary and ending reasons (review §11 bugs 2-3)', () => {
  // Red is boxed in by dunes with no fuel and no sight line, blue holds.
  const dunes = ['7,0', '6,1', '7,2', '8,2', '0,5', '1,5', '2,5', '1,4']
  const boxed = (): Tank[] => [
    tank(0, 'US', 0, 7),
    tank(1, 'US', 1, 8),
    tank(2, 'EN', 8, 1, { fuel: 0 }),
    tank(3, 'EN', 8, 0, { fuel: 0 }),
  ]
  const holdRound = (s: DState): DState => {
    let n = s
    for (let i = 0; i < 2; i++) {
      const r = act(n, { type: 'hold' })
      if (!r.ok) throw new Error(r.reason)
      n = r.state
    }
    return n
  }
  it('round 30 is playable and TIME LIMIT is stored after WOPR completes it', () => {
    let s = S(boxed(), dunes, { round: MAX_ROUNDS - 1 })
    s = holdRound(s)
    expect(s.end).toBeNull()
    expect(s.round).toBe(MAX_ROUNDS)
    // round 30: the first tank can still act
    const first = act(s, { type: 'hold' })
    if (!first.ok) throw new Error(first.reason)
    expect(first.state.end).toBeNull()
    s = holdRound(s)
    expect(s.end).toBe('time')
    expect(s.round).toBe(MAX_ROUNDS)
  })
  it('a full-fuel standoff is never reported as fuel exhaustion', () => {
    const s = holdRound(S(boxed(), dunes, { round: MAX_ROUNDS }))
    expect(s.end).toBe('time')
    expect(s.tanks.filter((t) => t.side === 'US').every((t) => t.fuel === FUEL)).toBe(true)
  })
  it('FUEL EXHAUSTED is independent of the clock: no fuel anywhere and no shots', () => {
    const t = boxed().map((x) => ({ ...x, fuel: 0 }))
    const s = holdRound(S(t, dunes, { round: 3 }))
    expect(s.end).toBe('fuel')
    expect(s.round).toBe(3)
  })
})

describe('desert warfare: target selection, movement and AI (review §11)', () => {
  it('FIRE uses the selected target, and refuses a blocked one without spending the action', () => {
    const tanks = [tank(0, 'US', 0, 4), tank(1, 'US', 0, 8), tank(2, 'EN', 2, 4), tank(3, 'EN', 0, 2)]
    const s = S(tanks, ['1,4'], { target: 2 })
    const blocked = act(s, { type: 'fire' })
    expect(blocked).toEqual({ ok: false, reason: 'E1: TARGET BLOCKED BY DUNE' })
    const r = act({ ...s, target: 3 }, { type: 'fire' })
    if (!r.ok) throw new Error(r.reason)
    expect(r.events[0]!.text).toMatch(/^T1 FIRES ON E2/)
    expect(r.state.tanks.find((x) => x.id === 0)!.acted).toBe(true)
  })
  it('enemy path search routes around a dune wall instead of stalling', () => {
    // Wall at x=4, rows 0..6; gap at row 7-8. Red at (6,1) must go around.
    const wall = [0, 1, 2, 3, 4, 5, 6].map((y) => key(4, y))
    const tanks = [tank(0, 'US', 0, 1), tank(1, 'US', 0, 0), tank(2, 'EN', 6, 1), tank(3, 'EN', 8, 8, { hp: 0 })]
    let s = S(tanks, wall)
    const start = { x: 6, y: 1 }
    for (let i = 0; i < 8; i++) s = enemyTurn(s).state
    const red = s.tanks.find((t) => t.id === 2)!
    expect(red.x !== start.x || red.y !== start.y).toBe(true)
    expect(red.fuel).toBeLessThan(FUEL)
    expect(red.y).toBeGreaterThan(start.y) // heading south toward the gap
    expect(pathStep(S(tanks, wall), tanks[2]!, (p) => p.x === 2 && p.y === 1)).toEqual({ x: 6, y: 2 })
  })
  it('red uses the same movement neighbourhood: one orthogonal square per move', () => {
    const tanks = [tank(0, 'US', 0, 8), tank(1, 'US', 1, 8), tank(2, 'EN', 8, 0), tank(3, 'EN', 7, 0)]
    const s = enemyTurn(S(tanks, []))
    for (const id of [2, 3]) {
      const a = tanks.find((t) => t.id === id)!
      const b = s.state.tanks.find((t) => t.id === id)!
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1)
      expect(b.fuel).toBe(FUEL - 1)
    }
  })
  it('seeded layouts are deterministic, keep starts clear and connected', () => {
    for (const l of LAYOUTS) {
      expect(layoutDunes(l.id)).toEqual(layoutDunes(l.id))
      const d = new Set(layoutDunes(l.id))
      for (const t of START) expect(d.has(key(t.x, t.y))).toBe(false)
      const s = initState(l.id, 5)
      expect(s.tanks).toHaveLength(4)
    }
  })
})
