import { describe, expect, it } from 'vitest'
import {
  HOLD_SIGHT,
  HOLD_TARGET,
  MAX_TURNS,
  SIGHT,
  command,
  contact,
  cycle,
  initState,
  observe,
  select,
  type GState,
  type Guerrilla,
  type Trooper,
} from '@app/game/games/engines/guerrilla-engagement'

const T = (id: number, x: number, y: number, hp = 2): Trooper => ({ id, x, y, hp })
const G = (id: number, x: number, y: number, hp = 2): Guerrilla => ({ id, x, y, hp, seen: null })
function state(troops: Trooper[], cell: Guerrilla[], extra: Partial<GState> = {}): GState {
  return {
    seed: 1,
    troops,
    cell,
    sel: troops[0]!.id,
    obj: { x: 7, y: 0 },
    held: 0,
    turn: 1,
    observed: [...observe(troops, null)],
    end: null,
    ...extra,
  }
}

describe('guerrilla: one contact phase per command (review §10 finding 1)', () => {
  it('a lone trooper and a lone hostile in contact each lose exactly one health per command', () => {
    const s = state([T(0, 3, 3)], [G(0, 4, 3)])
    const r = command(s, 'HOLD')
    if (!r.ok) throw new Error(r.reason)
    expect(r.state.troops[0]!.hp).toBe(1)
    expect(r.state.cell[0]!.hp).toBe(1)
    const shots = r.events.filter((e) => e.kind === 'shot')
    expect(shots.map((e) => e.shot)).toEqual([
      { attacker: 'T1', target: 'G1', from: 2, to: 1 },
      { attacker: 'G1', target: 'T1', from: 2, to: 1 },
    ])
  })
  it('contact is simultaneous: a unit destroyed in the phase still fires', () => {
    const c = contact([T(0, 3, 3, 1)], [G(0, 4, 3, 1)])
    expect(c.troops[0]!.hp).toBe(0)
    expect(c.cell[0]!.hp).toBe(0)
  })
  it('troopers engage at range 2; hostiles only when adjacent', () => {
    const c = contact([T(0, 3, 3)], [G(0, 5, 3)])
    expect(c.cell[0]!.hp).toBe(1)
    expect(c.troops[0]!.hp).toBe(2)
  })
})

describe('guerrilla: HOLD extends observation (review §10 finding 2)', () => {
  it(`radius ${SIGHT} normally, ${HOLD_SIGHT} for the holding trooper`, () => {
    const t = [T(0, 0, 7)]
    expect(observe(t, null).has('3,4')).toBe(false)
    expect(observe(t, 0).has('3,4')).toBe(true)
    const s = state(t, [G(0, 3, 4)])
    const moved = command(s, 'N')
    const held = command(s, 'HOLD')
    if (!moved.ok || !held.ok) throw new Error('rejected')
    // the hostile at distance 3 is only spotted by holding
    expect(held.state.cell[0]!.seen).not.toBeNull()
    expect(held.events.some((e) => e.kind === 'spot')).toBe(true)
  })
})

describe('guerrilla: invalid moves are rejected without advancing time (review §10 finding 4)', () => {
  it('edge of map', () => {
    const s = state([T(0, 0, 7)], [G(0, 2, 4)])
    const r = command(s, 'W')
    expect(r).toEqual({ ok: false, reason: 'EDGE OF MAP' })
  })
  it('friendly trooper in the way', () => {
    const s = state([T(0, 0, 7), T(1, 1, 7)], [G(0, 6, 1)])
    const r = command(s, 'E')
    expect(r).toEqual({ ok: false, reason: 'T2 IN THE WAY' })
  })
})

describe('guerrilla: victory reasons are stored (review §10 finding 5)', () => {
  it('objective hold wins with hostiles alive', () => {
    const s = state([T(0, 7, 1)], [G(0, 0, 7)], { held: 0 })
    const a = command(s, 'N')
    if (!a.ok) throw new Error(a.reason)
    expect(a.state.held).toBe(1)
    expect(a.state.end).toBeNull()
    const b = command(a.state, 'HOLD')
    if (!b.ok) throw new Error(b.reason)
    expect(b.state.held).toBe(HOLD_TARGET)
    expect(b.state.end).toBe('objective')
    expect(b.state.cell.some((g) => g.hp > 0)).toBe(true)
  })
  it('elimination', () => {
    const s = state([T(0, 3, 3), T(1, 3, 4)], [G(0, 4, 3, 1)])
    const r = command(s, 'HOLD')
    if (!r.ok) throw new Error(r.reason)
    expect(r.state.end).toBe('elimination')
  })
  it('patrol lost and time', () => {
    const lost = command(state([T(0, 3, 3, 1)], [G(0, 4, 3), G(1, 4, 4)]), 'HOLD')
    if (!lost.ok) throw new Error(lost.reason)
    expect(lost.state.end).toBe('patrol-lost')
    const time = command(state([T(0, 0, 7)], [G(0, 7, 3)], { turn: MAX_TURNS }), 'HOLD')
    if (!time.ok) throw new Error(time.reason)
    expect(time.state.end).toBe('time')
    const early = command(state([T(0, 0, 7)], [G(0, 7, 3)], { turn: MAX_TURNS - 1 }), 'HOLD')
    if (!early.ok) throw new Error(early.reason)
    expect(early.state.end).toBeNull()
  })
})

describe('guerrilla: intel and selection', () => {
  it('a hostile that leaves observation keeps a last-known position', () => {
    const s = state([T(0, 0, 7)], [G(0, 3, 4)])
    const held = command(s, 'HOLD')
    if (!held.ok) throw new Error(held.reason)
    const g = held.state.cell[0]!
    expect(g.seen).toEqual({ x: g.x, y: g.y, turn: 1 })
  })
  it('selection is free and skips downed troopers', () => {
    const s = state([T(0, 0, 7), T(1, 1, 7, 0), T(2, 0, 6)], [G(0, 6, 1)])
    expect(select(s, 1).sel).toBe(0)
    expect(cycle(s, 1).sel).toBe(2)
    expect(cycle(s, -1).sel).toBe(2)
    expect(cycle(s, 1).turn).toBe(1)
  })
  it('seeded spawns are reproducible and clear of the patrol', () => {
    expect(initState(42)).toEqual(initState(42))
    const s = initState(7)
    for (const g of s.cell) for (const t of s.troops) expect(Math.max(Math.abs(g.x - t.x), Math.abs(g.y - t.y))).toBeGreaterThanOrEqual(3)
  })
})
