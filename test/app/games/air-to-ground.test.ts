import { describe, expect, it } from 'vitest'
import {
  RATING_MAX,
  createMission,
  flySortie,
  nextEscalation,
  odds,
  sortieRolls,
  type Mission,
} from '@app/game/games/engines/air-to-ground'

const MISS = { loss: 100, hit: 100 } // aircraft survives, ordnance misses
const CLEAN_HIT = { loss: 100, hit: 1 } // survives, hits
const byName = (m: Mission, kind: string) => m.targets.find((t) => t.kind === kind)!

describe('air-to-ground odds (review §12 reproduced numbers)', () => {
  const ref = createMission(0)
  const radar = byName(ref, 'radar')
  it('RADAR SITE BRAVO: HIGH loses 31% and hits 55% for 1; LOW loses 59% and hits 75% for 2', () => {
    expect(radar.sam).toBe(20)
    expect(radar.aaa).toBe(55)
    expect(odds(radar, 'HIGH')).toEqual({ loss: 31, hit: 55, damage: 1 })
    expect(odds(radar, 'LOW')).toEqual({ loss: 59, hit: 75, damage: 2 })
  })
  it('resolution uses the displayed numbers: roll <= LOSS loses, roll <= HIT hits', () => {
    const o = odds(radar, 'HIGH')
    expect(flySortie(ref, radar.id, 'HIGH', { loss: o.loss, hit: 100 }).lostAircraft).toBe(true)
    expect(flySortie(ref, radar.id, 'HIGH', { loss: o.loss + 1, hit: 100 }).lostAircraft).toBe(false)
    expect(flySortie(ref, radar.id, 'HIGH', { loss: 100, hit: o.hit }).hit).toBe(true)
    expect(flySortie(ref, radar.id, 'HIGH', { loss: 100, hit: o.hit + 1 }).hit).toBe(false)
  })
  it('loss chance is clamped to the rating range', () => {
    expect(odds({ sam: 95, aaa: 95 }, 'HIGH').loss).toBe(RATING_MAX)
  })
})

describe('air-to-ground resolution', () => {
  it('ordnance can hit even when the aircraft is lost', () => {
    const m = createMission(0)
    const r = flySortie(m, 0, 'LOW', { loss: 1, hit: 1 })
    expect(r.lostAircraft).toBe(true)
    expect(r.hit).toBe(true)
    expect(r.mission.aircraft).toBe(5)
    expect(r.mission.targets[0]!.destroyed).toBe(true)
  })

  it('a successful destroying run with no loss reports success, never loss (review: whole report painted red)', () => {
    const r = flySortie(createMission(0), 0, 'LOW', CLEAN_HIT)
    expect(r.destroyed).toBe(true)
    expect(r.events.some((e) => e.kind === 'loss')).toBe(false)
    expect(r.events.filter((e) => e.kind === 'success').length).toBeGreaterThan(0)
  })

  it('destroying the last target with the last aircraft wins (ordnance counts)', () => {
    let m = createMission(0)
    m = { ...m, aircraft: 1, targets: m.targets.map((t) => (t.id === 0 ? t : { ...t, damage: t.toughness, destroyed: true })) }
    const r = flySortie(m, 0, 'LOW', { loss: 1, hit: 1 })
    expect(r.mission.outcome).toBe('win')
    expect(r.mission.reason).toBe('all-destroyed')
  })

  it('losing the last aircraft without clearing the targets fails with a typed reason', () => {
    const m = { ...createMission(0), aircraft: 1 }
    const r = flySortie(m, 2, 'HIGH', { loss: 1, hit: 100 })
    expect(r.mission.outcome).toBe('lose')
    expect(r.mission.reason).toBe('flight-lost')
    expect(r.mission.lost).toBe(1)
  })

  it('a destroyed target or finished mission cannot be flown', () => {
    const m = flySortie(createMission(0), 0, 'LOW', CLEAN_HIT).mission
    expect(flySortie(m, 0, 'LOW', CLEAN_HIT).mission).toBe(m)
  })
})

describe('air-to-ground target order', () => {
  it('destroyed radar cuts SAM by 10 on remaining targets only, clamped at 0, base kept', () => {
    let m = createMission(0)
    m = { ...m, targets: m.targets.map((t) => (t.kind === 'fuel' ? { ...t, sam: 4 } : t)) }
    const before = m.targets
    const after = flySortie(m, 0, 'LOW', CLEAN_HIT).mission
    for (const t of after.targets) {
      const b = before.find((x) => x.id === t.id)!
      if (t.kind === 'radar') expect(t.sam).toBe(b.sam)
      else if (t.kind === 'fuel') expect(t.sam).toBe(0)
      else expect(t.sam).toBe(b.sam - 10)
      expect(t.baseSam).toBe(b.baseSam)
    }
  })

  it('a surviving command bunker raises AAA +5 after sorties 3 and 6, not otherwise', () => {
    let m = createMission(0)
    const aaa0 = byName(m, 'armor').aaa
    expect(nextEscalation(m)).toBe(3)
    m = flySortie(m, 2, 'HIGH', MISS).mission // sortie 1
    m = flySortie(m, 2, 'HIGH', MISS).mission // sortie 2
    expect(byName(m, 'armor').aaa).toBe(aaa0)
    const r3 = flySortie(m, 2, 'HIGH', MISS) // sortie 3
    expect(r3.events.some((e) => e.kind === 'effect')).toBe(true)
    m = r3.mission
    expect(byName(m, 'armor').aaa).toBe(aaa0 + 5)
    expect(nextEscalation(m)).toBe(6)
    m = flySortie(m, 2, 'HIGH', MISS).mission // 4
    m = flySortie(m, 2, 'HIGH', MISS).mission // 5
    expect(byName(m, 'armor').aaa).toBe(aaa0 + 5)
    m = flySortie(m, 2, 'HIGH', MISS).mission // 6
    expect(byName(m, 'armor').aaa).toBe(aaa0 + 10)
    expect(nextEscalation(m)).toBeNull()
  })

  it('destroying the bunker by sortie 3 prevents the rise; ratings clamp at 95', () => {
    let m = createMission(0)
    m = flySortie(m, 3, 'LOW', CLEAN_HIT).mission
    m = flySortie(m, 3, 'LOW', CLEAN_HIT).mission
    expect(byName(m, 'command').destroyed).toBe(true)
    const aaa = byName(m, 'armor').aaa
    m = flySortie(m, 2, 'HIGH', MISS).mission
    expect(byName(m, 'armor').aaa).toBe(aaa)
    expect(nextEscalation(m)).toBeNull()

    let c = createMission(0)
    c = { ...c, sortie: 3, targets: c.targets.map((t) => (t.kind === 'armor' ? { ...t, aaa: 93 } : t)) }
    expect(byName(flySortie(c, 0, 'HIGH', MISS).mission, 'armor').aaa).toBe(95)
  })
})

describe('air-to-ground seeds', () => {
  it('the same seed gives the same ratings and dice; replaying the same choices gives the same mission', () => {
    expect(createMission(4242)).toEqual(createMission(4242))
    expect(sortieRolls(4242, 3)).toEqual(sortieRolls(4242, 3))
    const play = (seed: number) => {
      let m = createMission(seed)
      for (let i = 0; i < 30 && !m.outcome; i++) {
        const t = m.targets.find((x) => !x.destroyed)!
        m = flySortie(m, t.id, i % 2 ? 'HIGH' : 'LOW').mission
      }
      return m
    }
    expect(play(777)).toEqual(play(777))
  })
  it('seeded ratings stay within 5..85 and differ between seeds', () => {
    const a = createMission(1)
    const b = createMission(2)
    for (const t of [...a.targets, ...b.targets]) {
      expect(t.sam).toBeGreaterThanOrEqual(5)
      expect(t.aaa).toBeLessThanOrEqual(85)
    }
    expect(a.targets.map((t) => t.sam + t.aaa)).not.toEqual(b.targets.map((t) => t.sam + t.aaa))
  })
  it('dice are 1..100', () => {
    for (let s = 1; s < 200; s++) {
      const d = sortieRolls(99, s)
      for (const v of [d.loss, d.hit]) expect(v >= 1 && v <= 100).toBe(true)
    }
  })
})
