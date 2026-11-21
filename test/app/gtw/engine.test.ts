import { describe, expect, it } from 'vitest'
import {
  arsenal,
  buy,
  deserialize,
  endQuarter,
  fire,
  fullResponse,
  intercept,
  INTERCEPT_RANGE,
  liveTracks,
  newGame,
  popFrac,
  serialize,
  startCrisis,
  step,
  eta,
  type GState,
} from '@app/game/gtw/engine'

/** Run the crisis clock until it resolves (or a safety cap). */
function runCrisis(s: GState, act?: (s: GState) => void): void {
  for (let i = 0; i < 4000 && s.phase === 'crisis'; i++) {
    act?.(s)
    step(s, 0.5)
  }
}

/** Defend with interceptors only; never fire. */
function defendOnly(s: GState): void {
  for (const k of liveTracks(s)) {
    if (k.side !== s.player || true) {
      if (k.side === s.enemy && k.real && !k.abmTried && eta(s, k) <= INTERCEPT_RANGE) intercept(s, k.id)
    }
  }
}

describe('GLOBAL THERMONUCLEAR WAR engine', () => {
  it('starts in 1983 with both arsenals and the strategy phase', () => {
    const s = newGame('US', 1)
    expect(s.phase).toBe('strategy')
    expect(s.year).toBe(1983)
    expect(arsenal(s, 'US').icbm).toBe(40)
    expect(arsenal(s, 'SU').slbm).toBe(32)
    expect(popFrac(s, 'US')).toBe(1)
  })

  it('a false alarm that the player holds fire through costs nothing and lowers tension', () => {
    const s = newGame('US', 7)
    s.tension = 40
    startCrisis(s, 'ghost')
    runCrisis(s)
    expect(s.phase).toBe('strategy')
    expect(s.detonations).toBe(0)
    expect(popFrac(s, 'US')).toBe(1)
    expect(s.stats.alarmsHeld).toBe(1)
    expect(s.tension).toBeLessThan(44)
    expect(s.turn).toBe(2)
  })

  it('firing during a false alarm turns it into a real exchange', () => {
    const s = newGame('US', 11)
    startCrisis(s, 'ghost')
    step(s, 20)
    expect(fire(s, 'us-min', 'su-koz')).toBeNull()
    expect(s.crisis!.playerFired).toBe(true)
    runCrisis(s)
    expect(s.detonations).toBeGreaterThan(0)
  })

  it('a limited strike on one silo draws a limited answer and the game goes on', () => {
    const s = newGame('US', 3)
    expect(fire(s, 'us-min', 'su-uzh')).toBeNull()
    expect(s.phase).toBe('crisis')
    runCrisis(s)
    expect(s.over).toBeNull()
    expect(s.phase).toBe('strategy')
    // The answer was counterforce: no city lost people.
    expect(popFrac(s, 'US')).toBe(1)
    expect(s.detonations).toBeLessThan(6)
  })

  it('hitting the enemy capital brings an all-out answer that ends the game', () => {
    const s = newGame('US', 5)
    fire(s, 'us-war', 'su-mos')
    runCrisis(s)
    expect(s.over).not.toBeNull()
    expect(s.phase).toBe('over')
  })

  it('a full response ends in a lost game', () => {
    const s = newGame('SU', 9)
    expect(fullResponse(s)).toBeGreaterThan(40)
    runCrisis(s)
    expect(s.over).not.toBeNull()
  })

  it('budget buys change the forces and refuse when broke', () => {
    const s = newGame('US', 2)
    s.budget = 10
    expect(buy(s, 'abm')).toBeNull()
    expect(s.abm.US).toBe(7)
    expect(buy(s, 'ssbn')).toBeNull()
    expect(arsenal(s, 'US').slbm).toBe(48)
    expect(buy(s, 'ssbn')).toBe('INSUFFICIENT FUNDS.')
  })

  it('is open-ended: careful play survives decades across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = newGame(seed % 2 ? 'US' : 'SU', seed)
      for (let q = 0; q < 80 && !s.over; q++) {
        while (s.tension > 25 && buy(s, 'diplomacy') === null) {
          /* talk */
        }
        while (buy(s, 'abm') === null) {
          /* defend */
        }
        endQuarter(s)
        runCrisis(s, defendOnly)
      }
      expect(s.over, `seed ${seed}`).toBeNull()
      expect(s.year).toBeGreaterThanOrEqual(2002)
    }
  })

  it('saves and resumes exactly, including the random stream', () => {
    const a = newGame('US', 42)
    endQuarter(a)
    const b = deserialize(serialize(a))!
    expect(b).toEqual(a)
    endQuarter(a)
    endQuarter(b)
    expect(serialize(b)).toBe(serialize(a))
    expect(deserialize('{bad')).toBeNull()
    expect(deserialize(null)).toBeNull()
  })
})
