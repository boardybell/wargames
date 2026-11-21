import { describe, expect, it } from 'vitest'
import {
  ACTS,
  MAX_TURNS,
  SCENARIOS,
  canAct,
  chasePolicy,
  eligibleActs,
  foePolicy,
  inArc,
  maneuver,
  resolveTurn,
  veteranPolicy,
  type Fighter,
} from '@app/game/games/engines/fighter-combat'

const F = (x: number, y: number, hdg: number, energy = 6, hp = 6): Fighter => ({ x, y, hdg, energy, hp })

describe('fighter combat: energy is enforced before resolution (review §9 bug 1)', () => {
  it('GUNS at zero energy is ineligible and cannot inflict damage', () => {
    const you = F(3, 4, 0, 0)
    const foe = F(3, 2, 0)
    expect(inArc(you, foe)).toBe(true)
    expect(canAct(you, 'GUNS')).toEqual({ ok: false, reason: 'NEEDS 1 ENERGY (HAVE 0)' })
    expect(() => resolveTurn(you, foe, 'GUNS', 'CLIMB', 1)).toThrow()
  })

  it('turning needs 1 and diving needs 2; CLIMB and THROTTLE are always available', () => {
    expect(canAct(F(0, 0, 0, 0), 'LEFT').ok).toBe(false)
    expect(canAct(F(0, 0, 0, 0), 'RIGHT').ok).toBe(false)
    expect(canAct(F(0, 0, 0, 1), 'DIVE').ok).toBe(false)
    expect(canAct(F(0, 0, 0, 2), 'DIVE').ok).toBe(true)
    expect(eligibleActs(F(0, 0, 0, 0))).toEqual(['THROTTLE', 'CLIMB'])
    expect(maneuver(F(3, 3, 0, 0), 'CLIMB').energy).toBe(3)
  })

  it('every AI choice is eligible under the same rule, at every energy level', () => {
    for (let e = 0; e <= 10; e++)
      for (const d of ['beginner', 'veteran'] as const)
        for (const sc of SCENARIOS) {
          const foe = { ...sc.foe, energy: e }
          expect(canAct(foe, foePolicy(d, foe, sc.you)).ok).toBe(true)
        }
  })

  it('a successful shot at energy 1 spends that energy', () => {
    const r = resolveTurn(F(3, 4, 0, 1), F(3, 3, 4, 6), 'GUNS', 'CLIMB', 1)
    expect(r.youHit).toBe(2)
    expect(r.you.energy).toBe(0)
  })
})

describe('fighter combat: ending reasons (review §9 bug 2)', () => {
  it('mutual destruction is its own reason', () => {
    const r = resolveTurn(F(3, 4, 0, 5, 1), F(3, 3, 4, 5, 1), 'GUNS', 'GUNS', 3)
    expect(r.end).toBe('mutual')
  })
  it('time expires only after turn 24 resolves', () => {
    const you = F(0, 6, 0)
    const foe = F(6, 0, 4)
    expect(resolveTurn(you, foe, 'CLIMB', 'CLIMB', MAX_TURNS - 1).end).toBeNull()
    expect(resolveTurn(you, foe, 'CLIMB', 'CLIMB', MAX_TURNS).end).toBe('time')
  })
  it('zero energy on both sides is not an ending: recovery exists', () => {
    const r = resolveTurn(F(0, 6, 0, 0), F(6, 0, 4, 0), 'CLIMB', 'THROTTLE', 5)
    expect(r.end).toBeNull()
  })
  it('splash and shot-down', () => {
    expect(resolveTurn(F(3, 4, 0, 5), F(3, 3, 0, 5, 1), 'GUNS', 'CLIMB', 2).end).toBe('splash')
    expect(resolveTurn(F(3, 4, 0, 5, 1), F(3, 3, 4, 5), 'CLIMB', 'GUNS', 2).end).toBe('shot-down')
  })
})

describe('fighter combat: simultaneous gun resolution (review §9 bug 3)', () => {
  it('a target in arc before the turn can escape by maneuvering', () => {
    const you = F(3, 5, 0)
    const foe = F(3, 3, 0)
    expect(inArc(you, foe)).toBe(true)
    // Bandit dives 3 squares north, out of range 3.
    const r = resolveTurn(you, foe, 'GUNS', 'DIVE', 1)
    expect(r.youFired).toBe(true)
    expect(r.youHit).toBe(0)
  })
})

describe('fighter combat: AI', () => {
  it('BEGINNER keeps the old chase policy: fires when aligned, turns toward you otherwise', () => {
    expect(chasePolicy(F(3, 3, 0), F(3, 1, 0))).toBe('GUNS')
    expect(chasePolicy(F(3, 3, 0), F(5, 3, 0))).toBe('RIGHT')
    expect(chasePolicy(F(3, 3, 0, 1), F(0, 6, 0))).toBe('CLIMB')
  })
  it('VETERAN does not fly into the player gun arc when a safer move exists', () => {
    // Bandit directly ahead of the player, facing away: chasing would hold course.
    const you = F(3, 6, 0, 6)
    const foe = F(3, 4, 0, 6)
    const a = veteranPolicy(foe, you)
    expect(ACTS).toContain(a)
    const after = maneuver(foe, a)
    expect(inArc(you, after)).toBe(false)
  })
  it('VETERAN takes a clean shot from a stable position', () => {
    // Player at zero energy can only CLIMB (stay) or THROTTLE (straight 2).
    expect(veteranPolicy(F(3, 3, 4, 6), F(3, 4, 4, 0))).toBe('GUNS')
  })
  it('every scenario starts with both aircraft on the scope and deterministic', () => {
    for (const sc of SCENARIOS) {
      for (const f of [sc.you, sc.foe]) {
        expect(f.x).toBeGreaterThanOrEqual(0)
        expect(f.x).toBeLessThan(7)
      }
      expect(veteranPolicy(sc.foe, sc.you)).toBe(veteranPolicy(sc.foe, sc.you))
    }
  })
})
