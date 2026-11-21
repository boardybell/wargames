import { describe, expect, it } from 'vitest'
import {
  aiAllocate,
  asRoll,
  breakthroughChance,
  emptyOrders,
  forces,
  initialState,
  MAX_ROUNDS,
  ordersProblem,
  playRound,
  reconciles,
  resolveBattle,
  scripted,
  type Orders,
  type Sector,
  type State,
} from '@app/game/games/engines/theaterwide-tactical'
import { rng } from '@app/game/games/hooks'

const S = (owner: 'US' | 'AI', div: number): Sector => ({ owner, div })
const make = (sectors: Sector[], extra: Partial<State> = {}): State => ({ ...initialState('normal'), sectors, ...extra })
const rolls = (...r: number[]) => scripted(r.map(asRoll))

describe('theaterwide tactical: combat conserves forces', () => {
  it('13-troop breakthrough transfers all 11 survivors into the captured sector', () => {
    const b = resolveBattle({ attacker: 'US', from: 1, target: 2, edge: 13, assault: 0, stay: 0, defense: 0, bonus: 1, retreatTo: 3, atkRoll: 0, defRoll: 0 })
    expect(b.result).toBe('breakthrough')
    expect(b.lost.attacker).toBe(2)
    expect(b.transferred).toBe(11)
    expect(b.remaining).toEqual({ from: 0, target: 11 })

    // Same case through a full round: the next attack stages from 11, not 1.
    const s = make([S('US', 0), S('US', 13), S('AI', 0), S('AI', 0), S('AI', 0)], { usPool: 0, aiPool: 0 })
    const { state, report } = playRound(s, { ...emptyOrders() }, rolls(0, 0))
    expect(report.assaultBattle?.transferred).toBe(11)
    expect(state.sectors[1]).toEqual(S('US', 0))
    expect(state.sectors[2]).toEqual(S('US', 11))
    expect(reconciles(report.us) && reconciles(report.ai)).toBe(true)
  })

  it('5+5 repulse reporting two losses leaves eight, not six', () => {
    const b = resolveBattle({ attacker: 'US', from: 1, target: 2, edge: 5, assault: 5, stay: 0, defense: 11, bonus: 1, retreatTo: 3, atkRoll: 0, defRoll: 0 })
    expect(b.result).toBe('repulsed')
    expect(b.lost).toEqual({ assault: 2, edge: 0, attacker: 2, defender: 1 })
    expect(b.withdrawn).toBe(8)
    expect(b.remaining).toEqual({ from: 8, target: 10 })

    const s = make([S('US', 0), S('US', 5), S('AI', 11), S('AI', 0), S('AI', 0)], { usPool: 5, aiPool: 0 })
    const { state, report } = playRound(s, { alloc: [0, 0, 0, 0, 0], assault: 5, advance: true }, rolls(0, 0, 0, 0))
    expect(report.us.lost).toBe(2)
    expect(state.sectors[1]!.div).toBe(8)
    expect(report.counter).toBeNull()
    expect(reconciles(report.us)).toBe(true)
  })

  it('casualties hit the assault slot first, then the edge, each once', () => {
    const b = resolveBattle({ attacker: 'US', from: 1, target: 2, edge: 4, assault: 1, stay: 0, defense: 20, bonus: 1, retreatTo: 3, atkRoll: 0, defRoll: 3 })
    expect(b.lost).toMatchObject({ assault: 1, edge: 4, attacker: 5 })
    expect(b.remaining.from).toBe(0)
  })

  it('a breakthrough always keeps one division to occupy the sector', () => {
    const b = resolveBattle({ attacker: 'US', from: 1, target: 2, edge: 1, assault: 0, stay: 0, defense: 0, bonus: 1, retreatTo: 3, atkRoll: 1, defRoll: 0 })
    expect(b.result).toBe('breakthrough')
    expect(b.transferred).toBe(1)
  })

  it('counterattackers are deducted from their origin', () => {
    // You hold 0..1 with one division at the edge; the enemy has 9 facing it.
    const s = make([S('US', 2), S('US', 1), S('AI', 9), S('AI', 0), S('AI', 0)], { usPool: 0, aiPool: 0 })
    const { state, report } = playRound(s, { alloc: [0, 0, 0, 0, 0], assault: 0, advance: false }, rolls(0, 0))
    const c = report.counter!
    expect(c.attacker).toBe('AI')
    expect(c.committed.attacker).toBe(8)
    expect(c.result).toBe('breakthrough')
    expect(state.sectors[2]).toEqual(S('AI', 1)) // origin keeps only the one left behind
    expect(state.sectors[1]!.owner).toBe('AI')
    expect(state.sectors[1]!.div).toBe(8 - c.lost.attacker)
    expect(reconciles(report.us) && reconciles(report.ai)).toBe(true)
  })

  it('totals reconcile over thousands of random rounds', () => {
    const rand = rng(1234)
    for (let game = 0; game < 300; game++) {
      let s = initialState((['easy', 'normal', 'hard'] as const)[game % 3])
      while (!s.result) {
        const o = randomOrders(s, rand)
        const { state, report } = playRound(s, o, rand)
        expect(reconciles(report.us)).toBe(true)
        expect(reconciles(report.ai)).toBe(true)
        for (const sec of state.sectors) expect(sec.div).toBeGreaterThanOrEqual(0)
        // ownership stays contiguous: US prefix then AI suffix
        const owners = state.sectors.map((x) => x.owner).join(',')
        expect(owners).toMatch(/^(US,)*(AI,?)*$|^(US,)*US$/)
        s = state
      }
    }
  })
})

function randomOrders(s: State, rand: () => number): Orders {
  const alloc = [0, 0, 0, 0, 0]
  let pool = s.usPool
  const advance = rand() < 0.7
  let assault = 0
  while (pool > 0) {
    const r = rand()
    if (r < 0.3) break
    if (advance && r < 0.6) assault++
    else {
      const owned = s.sectors.map((x, i) => (x.owner === 'US' ? i : -1)).filter((i) => i >= 0)
      alloc[owned[Math.floor(rand() * owned.length)]!]!++
    }
    pool--
  }
  const o = { alloc, assault, advance }
  return ordersProblem(s, o) ? { alloc, assault: 0, advance: false } : o
}

describe('theaterwide tactical: economy and victory', () => {
  it('reinforces each pool exactly once per round; the enemy commits only what it shows', () => {
    const s = initialState('normal')
    expect(s.aiPool).toBe(10)
    expect(aiAllocate(s).reduce((a, b) => a + b, 0)).toBe(10)
    const { state, report } = playRound(s, { alloc: [0, 3, 0, 0, 0], assault: 0, advance: false }, rolls(0))
    expect(report.reinforced).toEqual({ us: 4, ai: 4 })
    expect(state.usPool).toBe(10 - 3 + 4)
    expect(state.aiPool).toBe(4)
  })

  it('capital captured is a typed win', () => {
    const s = make([S('US', 0), S('US', 0), S('US', 0), S('US', 9), S('AI', 0)], { aiPool: 0, usPool: 0 })
    const { state } = playRound(s, emptyOrders(), rolls(0, 0))
    expect(state.result).toMatchObject({ outcome: 'win', reason: 'capital-captured', usHeld: 5 })
  })

  it('capital lost is a typed loss', () => {
    const s = make([S('US', 0), S('AI', 9), S('AI', 0), S('AI', 0), S('AI', 0)], { aiPool: 0, usPool: 0 })
    const { state } = playRound(s, { alloc: [0, 0, 0, 0, 0], assault: 0, advance: false }, rolls(0, 0))
    expect(state.result).toMatchObject({ outcome: 'lose', reason: 'capital-lost', usHeld: 0 })
  })

  it('armistice after round 14 goes to the 3-sector majority; no tie exists', () => {
    const base = { round: MAX_ROUNDS, usPool: 0, aiPool: 0 }
    const win = playRound(make([S('US', 5), S('US', 5), S('US', 5), S('AI', 9), S('AI', 0)], base), { alloc: [0, 0, 0, 0, 0], assault: 0, advance: false }, rolls(0, 3))
    expect(win.state.result).toMatchObject({ outcome: 'win', reason: 'armistice', usHeld: 3, aiHeld: 2 })
    const lose = playRound(make([S('US', 5), S('US', 5), S('AI', 5), S('AI', 0), S('AI', 0)], base), { alloc: [0, 0, 0, 0, 0], assault: 0, advance: false }, rolls(0))
    expect(lose.state.result).toMatchObject({ outcome: 'lose', reason: 'armistice', usHeld: 2, aiHeld: 3 })
  })

  it('no result before the final round', () => {
    const { state } = playRound(initialState(), { alloc: [0, 0, 0, 0, 0], assault: 0, advance: false }, rolls(0))
    expect(state.result).toBeNull()
    expect(state.round).toBe(2)
  })
})

describe('theaterwide tactical: orders and doctrine', () => {
  it('rejects bad orders with a reason', () => {
    const s = initialState()
    expect(ordersProblem(s, { alloc: [0, 0, 0, 0, 0], assault: 11, advance: true })).toBe('NOT ENOUGH RESERVE')
    expect(ordersProblem(s, { alloc: [0, 0, 1, 0, 0], assault: 0, advance: true })).toBe('YOU CAN ONLY REINFORCE SECTORS YOU HOLD')
    expect(ordersProblem(s, { alloc: [0, 0, 0, 0, 0], assault: 1, advance: false })).toBe('ASSAULT DIVISIONS NEED AN ADVANCE ORDER')
    const empty = make([S('US', 0), S('US', 0), S('AI', 0), S('AI', 3), S('AI', 0)])
    expect(ordersProblem(empty, { alloc: [0, 0, 0, 0, 0], assault: 0, advance: true })).toBe('NO DIVISIONS TO ADVANCE: ADD ASSAULT DIVISIONS OR HOLD')
    expect(ordersProblem(s, emptyOrders())).toBeNull()
  })

  it('difficulty changes the visible enemy allocation policy', () => {
    const a = (d: 'easy' | 'normal' | 'hard') => aiAllocate(initialState(d))
    expect(a('easy')).toEqual([0, 0, 7, 3, 0])
    expect(a('normal')).toEqual([0, 0, 4, 6, 0])
    expect(a('hard')).toEqual([0, 0, 10, 0, 0])
    // HARD covers your visible maximum (edge 2 + reserve 0 + roll 3 - line bonus 1 - 2 held = 2) and banks the rest.
    const s = { ...make([S('US', 0), S('US', 2), S('AI', 2), S('AI', 0), S('AI', 0)], { usPool: 0, aiPool: 10 }), difficulty: 'hard' as const }
    expect(aiAllocate(s)).toEqual([0, 0, 2, 8, 0])
  })

  it('difficulty changes the counterattack margin', () => {
    const at = (d: 'easy' | 'normal' | 'hard') => {
      const s = { ...make([S('US', 5), S('US', 2), S('AI', 5), S('AI', 0), S('AI', 0)], { usPool: 0, aiPool: 0 }), difficulty: d }
      return playRound(s, { alloc: [0, 0, 0, 0, 0], assault: 0, advance: false }, rolls(0, 0)).report.counter !== null
    }
    expect(at('easy')).toBe(false)
    expect(at('normal')).toBe(true)
    expect(at('hard')).toBe(true)
  })

  it('breakthrough chance covers the 0-3 roll range', () => {
    expect(breakthroughChance(10, 6)).toBe(1)
    expect(breakthroughChance(3, 6)).toBe(0)
    expect(breakthroughChance(5, 5)).toBeCloseTo(6 / 16)
  })

  it('forces counts map plus pool', () => {
    expect(forces(initialState(), 'US')).toBe(13)
    expect(forces(initialState(), 'AI')).toBe(13)
  })
})

describe('theaterwide tactical: defense bonus and retreat', () => {
  it('half the defenders fall back one sector on a breakthrough; capitals fight to the last', () => {
    const b = resolveBattle({ attacker: 'US', from: 1, target: 2, edge: 12, assault: 0, stay: 0, defense: 5, bonus: 1, retreatTo: 3, atkRoll: 0, defRoll: 0 })
    expect(b.result).toBe('breakthrough')
    expect(b.lost.defender).toBe(3)
    expect(b.retreated).toBe(2)
    const cap = resolveBattle({ attacker: 'US', from: 3, target: 4, edge: 12, assault: 0, stay: 0, defense: 5, bonus: 3, retreatTo: null, atkRoll: 0, defRoll: 0 })
    expect(cap.lost.defender).toBe(5)
    expect(cap.retreated).toBe(0)
  })

  it('retreating defenders join the sector behind in a full round', () => {
    const s = make([S('US', 0), S('US', 12), S('AI', 5), S('AI', 1), S('AI', 0)], { usPool: 0, aiPool: 0 })
    const { state, report } = playRound(s, emptyOrders(), rolls(0, 0))
    expect(state.sectors[3]).toEqual(S('AI', 3))
    expect(reconciles(report.ai)).toBe(true)
  })
})
