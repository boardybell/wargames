// THEATERWIDE TACTICAL WARFARE rules engine (docs/games-design-review.md §13).
// Pure and deterministic given a random source. Every division is accounted
// for: each round returns a structured report whose per-side totals reconcile
// (before - lost + reinforcement = after).
//
// The front is five sectors in a chain. Sector 0 is YOUR capital, sector 4 the
// ENEMY capital. Ownership is always contiguous: you hold 0..edge, the enemy
// holds edge+1..4. A sector only ever holds its owner's divisions.
//
// ROUND ORDER (documented in HOW TO PLAY):
//   1. ALLOCATION. Simultaneous. You place reserve divisions on sectors you hold
//      and, if your order is ADVANCE, into the ASSAULT slot against the
//      contested sector. The enemy moves part of its pool to the sector facing
//      you by its declared doctrine (decided from the start-of-round map, never
//      from your orders) and HOLDS THE REST IN RESERVE for counterattacks.
//   2. YOUR ASSAULT (order ADVANCE). Edge garrison + assault divisions attack the
//      contested sector. Each side adds a 0-3 roll. Higher total wins.
//   3. ENEMY COUNTERATTACK. Strike force = the enemy stack facing your edge
//      minus one division left to hold it, plus its whole reserve. It attacks
//      when the strike force is at least your edge defense (garrison + line or
//      capital bonus) + margin (EASY 3, NORMAL 1, HARD 0). On NORMAL and HARD,
//      in the last three rounds, an enemy losing the armistice count attacks
//      with any strike force of 2 or more.
//   4. REINFORCEMENT. You gain +4; the enemy +3 (EASY) or +4 (NORMAL, HARD).
//      Once, at the end of every round. Both start with 10 in reserve, except
//      the enemy: 12 on NORMAL, 13 on HARD.
//   5. ARMISTICE after round 14: the side holding 3+ of the 5 sectors wins.
//      Five sectors cannot split evenly, so there is no tied armistice.

export type Side = 'US' | 'AI'
export type Difficulty = 'easy' | 'normal' | 'hard'

export const SECTOR_NAMES = ['HOME CAPITAL', 'WESTERN FRONT', 'CENTRAL PLAIN', 'EASTERN FRONT', 'ENEMY CAPITAL'] as const
export const SECTOR_SHORT = ['HOME', 'WEST', 'CENTRAL', 'EAST', 'ENEMY'] as const
export const SECTOR_COUNT = 5
export const US_CAPITAL = 0
export const AI_CAPITAL = 4
/** Your starting reserve. */
export const START_POOL = 10
/** Enemy starting reserve, by difficulty. */
export const AI_START_POOL: Record<Difficulty, number> = { easy: 10, normal: 12, hard: 13 }
export const START_GARRISON = 3
/** Your reinforcement per round. */
export const REINFORCE = 4
/** Enemy reinforcement per round, by difficulty. */
export const AI_REINFORCE: Record<Difficulty, number> = { easy: 3, normal: 4, hard: 4 }
export const MAX_ROUNDS = 14
export const ROLL_MAX = 3 // rolls are 0..3 inclusive
/** Enemy counterattacks when its strike force is at least your edge defense (garrison + bonus) + margin. */
export const COUNTER_MARGIN: Record<Difficulty, number> = { easy: 3, normal: 1, hard: 0 }
/** NORMAL/HARD: rounds from which an enemy losing the armistice count attacks with any strike force >= 2. */
export const DESPERATION_ROUNDS = 3
/** Defender bonus added to the defense total: dug-in line / fortified capital. */
export const LINE_BONUS = 1
export const CAPITAL_BONUS = 3
export const defenseBonus = (sector: number): number => (sector === US_CAPITAL || sector === AI_CAPITAL ? CAPITAL_BONUS : LINE_BONUS)

export interface Sector {
  readonly owner: Side
  /** Divisions of the owner holding this sector. */
  readonly div: number
}

export type EndReason = 'capital-captured' | 'capital-lost' | 'armistice'
export interface Result {
  readonly outcome: 'win' | 'lose'
  readonly reason: EndReason
  readonly usHeld: number
  readonly aiHeld: number
}

export interface State {
  readonly sectors: readonly Sector[]
  readonly usPool: number
  readonly aiPool: number
  /** Round about to be played, 1-based. */
  readonly round: number
  readonly difficulty: Difficulty
  readonly result: Result | null
  readonly lost: { readonly us: number; readonly ai: number }
}

export interface Orders {
  /** Divisions from the pool to each sector you hold (index = sector). */
  readonly alloc: readonly number[]
  /** Divisions from the pool into the ASSAULT slot (ADVANCE only). */
  readonly assault: number
  readonly advance: boolean
}

export function initialState(difficulty: Difficulty = 'normal'): State {
  return {
    sectors: [
      { owner: 'US', div: 0 },
      { owner: 'US', div: START_GARRISON },
      { owner: 'AI', div: 0 },
      { owner: 'AI', div: START_GARRISON },
      { owner: 'AI', div: 0 },
    ],
    usPool: START_POOL,
    aiPool: AI_START_POOL[difficulty],
    round: 1,
    difficulty,
    result: null,
    lost: { us: 0, ai: 0 },
  }
}

export const emptyOrders = (): Orders => ({ alloc: [0, 0, 0, 0, 0], assault: 0, advance: true })

/** Your edge (highest sector you hold) and the contested sector in front of it. */
export function front(sectors: readonly Sector[]): { edge: number; contested: number } {
  let edge = -1
  for (let i = 0; i < sectors.length; i++) if (sectors[i]!.owner === 'US') edge = i
  return { edge, contested: Math.min(edge + 1, SECTOR_COUNT - 1) }
}

export const held = (sectors: readonly Sector[], side: Side): number => sectors.filter((s) => s.owner === side).length
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** Total divisions a side has on the map plus in its pool. */
export function forces(s: State, side: Side): number {
  return sum(s.sectors.filter((x) => x.owner === side).map((x) => x.div)) + (side === 'US' ? s.usPool : s.aiPool)
}

export function committed(o: Orders): number {
  return sum(o.alloc) + o.assault
}

/** Why orders are not executable, or null when they are. */
export function ordersProblem(s: State, o: Orders): string | null {
  if (s.result) return 'THE CAMPAIGN IS OVER'
  if (o.alloc.length !== SECTOR_COUNT) return 'BAD ORDERS'
  if (o.alloc.some((n) => n < 0 || !Number.isInteger(n)) || o.assault < 0 || !Number.isInteger(o.assault)) return 'BAD ORDERS'
  if (committed(o) > s.usPool) return 'NOT ENOUGH RESERVE'
  if (o.alloc.some((n, i) => n > 0 && s.sectors[i]!.owner !== 'US')) return 'YOU CAN ONLY REINFORCE SECTORS YOU HOLD'
  if (!o.advance && o.assault > 0) return 'ASSAULT DIVISIONS NEED AN ADVANCE ORDER'
  const { edge } = front(s.sectors)
  if (o.advance && s.sectors[edge]!.div + o.alloc[edge]! + o.assault === 0) return 'NO DIVISIONS TO ADVANCE: ADD ASSAULT DIVISIONS OR HOLD'
  return null
}

// ---------------------------------------------------------------- enemy doctrine
export interface Doctrine {
  readonly name: string
  readonly summary: string
}
export const DOCTRINES: Record<Difficulty, Doctrine> = {
  easy: { name: 'FORWARD SCREEN', summary: '70% OF ITS POOL TO THE SECTOR FACING YOU, 30% HELD IN RESERVE' },
  normal: { name: 'DEFENSE IN DEPTH', summary: '40% OF ITS POOL TO THE SECTOR FACING YOU, 60% HELD IN RESERVE FOR COUNTERATTACKS' },
  hard: {
    name: 'MATCHED RESPONSE',
    summary: 'ENOUGH TO THE SECTOR FACING YOU TO COVER YOUR EDGE GARRISON + RESERVE + 3, THE REST HELD IN RESERVE',
  },
}

/**
 * Enemy allocation for this round, decided from the start-of-round map and the
 * public numbers only (never from your pending orders).
 */
export function aiAllocate(s: State): number[] {
  const alloc = [0, 0, 0, 0, 0]
  const { edge, contested } = front(s.sectors)
  let toFront: number
  if (s.difficulty === 'easy') toFront = Math.ceil(s.aiPool * 0.7)
  else if (s.difficulty === 'normal') toFront = Math.ceil(s.aiPool * 0.4)
  else {
    // Cover your largest possible attack (edge + whole reserve + top roll).
    const need = s.sectors[edge]!.div + s.usPool + ROLL_MAX - defenseBonus(contested) - s.sectors[contested]!.div
    toFront = Math.max(0, Math.min(s.aiPool, need))
  }
  alloc[contested] = alloc[contested]! + toFront
  return alloc
}

export interface CounterPlan {
  /** Divisions in the enemy stack facing your edge. */
  readonly stack: number
  /** Enemy reserve that joins the strike. */
  readonly reserve: number
  /** stack - 1 (left to hold) + reserve. */
  readonly strike: number
  /** Your edge garrison + defense bonus. */
  readonly defense: number
  /** Strike force needed under the normal rule. */
  readonly threshold: number
  readonly desperate: boolean
  readonly attacks: boolean
}

/**
 * Whether the enemy counterattacks your edge, from public numbers only.
 * `round` is the round being played.
 */
export function counterPlan(
  sectors: readonly Sector[],
  aiReserve: number,
  difficulty: Difficulty,
  round: number,
): CounterPlan {
  const { edge, contested } = front(sectors)
  const stack = contested > edge ? sectors[contested]!.div : 0
  const reserve = Math.max(0, aiReserve)
  const strike = Math.max(0, stack - 1) + reserve
  const defense = sectors[edge]!.div + defenseBonus(edge)
  const threshold = defense + COUNTER_MARGIN[difficulty]
  const desperate =
    difficulty !== 'easy' && round > MAX_ROUNDS - DESPERATION_ROUNDS && held(sectors, 'AI') * 2 < SECTOR_COUNT
  const attacks = contested > edge && strike >= 2 && (strike >= threshold || desperate)
  return { stack, reserve, strike, defense, threshold, desperate, attacks }
}

// ---------------------------------------------------------------- combat
export interface BattleInput {
  readonly attacker: Side
  /** Sector the attack starts from. */
  readonly from: number
  /** Sector attacked. */
  readonly target: number
  /** Garrison divisions from the origin taking part. */
  readonly edge: number
  /** Fresh divisions from the reserve pool taking part (assault slot). */
  readonly assault: number
  /** Origin divisions that stay behind. */
  readonly stay: number
  readonly defense: number
  /** Fixed defender bonus (line +1, capital +3). */
  readonly bonus: number
  /** Sector defenders fall back to on a breakthrough; null = no retreat (capital). */
  readonly retreatTo: number | null
  readonly atkRoll: number
  readonly defRoll: number
}

export interface BattleReport {
  readonly attacker: Side
  readonly from: number
  readonly target: number
  readonly result: 'breakthrough' | 'repulsed' | 'held'
  readonly atkRoll: number
  readonly defRoll: number
  readonly atkPower: number
  readonly defPower: number
  readonly bonus: number
  readonly retreatTo: number | null
  readonly committed: { readonly edge: number; readonly assault: number; readonly attacker: number; readonly defender: number }
  readonly lost: { readonly assault: number; readonly edge: number; readonly attacker: number; readonly defender: number }
  /** Attacker survivors moved into the captured sector. */
  readonly transferred: number
  /** Attacker survivors returned to the origin. */
  readonly withdrawn: number
  /** Defender survivors that fell back to retreatTo after a breakthrough. */
  readonly retreated: number
  /** Divisions in each sector after the battle. */
  readonly remaining: { readonly from: number; readonly target: number }
}

/**
 * Resolve one battle. Casualties are allocated to the assault slot first, then
 * the edge garrison, each once.
 *  Defense total = defenders + bonus (+1 line, +3 capital) + roll.
 *  BREAKTHROUGH (attack > defense): attacker loses 2 + defense roll (always
 *    keeping one division), all attacker survivors move into the captured
 *    sector. Half the defenders (rounded up) are destroyed; the rest fall back
 *    one sector toward their capital, or are destroyed if there is nowhere to go.
 *  REPULSED (defense > attack): attacker loses 2 + defense roll (up to all),
 *    defender loses 1 if it has 2 or more, attacker survivors withdraw.
 *  HELD (equal): each side loses 1 if it can; attacker survivors withdraw.
 */
export function resolveBattle(b: BattleInput): BattleReport {
  const force = b.edge + b.assault
  const atkPower = force + b.atkRoll
  const defPower = b.defense + b.bonus + b.defRoll
  const result: BattleReport['result'] = atkPower > defPower ? 'breakthrough' : defPower > atkPower ? 'repulsed' : 'held'
  let atkLoss: number
  let defLoss: number
  if (result === 'breakthrough') {
    atkLoss = Math.min(Math.max(force - 1, 0), 2 + b.defRoll)
    defLoss = b.retreatTo === null ? b.defense : Math.ceil(b.defense / 2)
  } else if (result === 'repulsed') {
    atkLoss = Math.min(force, 2 + b.defRoll)
    defLoss = b.defense >= 2 ? 1 : 0
  } else {
    atkLoss = Math.min(force, 1)
    defLoss = Math.min(b.defense, 1)
  }
  const lostAssault = Math.min(b.assault, atkLoss)
  const lostEdge = atkLoss - lostAssault
  const survivors = force - atkLoss
  const broke = result === 'breakthrough'
  const retreated = broke ? b.defense - defLoss : 0
  return {
    attacker: b.attacker,
    from: b.from,
    target: b.target,
    result,
    atkRoll: b.atkRoll,
    defRoll: b.defRoll,
    atkPower,
    defPower,
    bonus: b.bonus,
    retreatTo: b.retreatTo,
    committed: { edge: b.edge, assault: b.assault, attacker: force, defender: b.defense },
    lost: { assault: lostAssault, edge: lostEdge, attacker: atkLoss, defender: defLoss },
    transferred: broke ? survivors : 0,
    withdrawn: broke ? 0 : survivors,
    retreated,
    remaining: {
      from: b.stay + (broke ? 0 : survivors),
      target: broke ? survivors : b.defense - defLoss,
    },
  }
}

/** Chance (0..1) that attack force beats defense (incl. bonus) with two uniform 0..3 rolls. */
export function breakthroughChance(force: number, defense: number): number {
  let wins = 0
  for (let a = 0; a <= ROLL_MAX; a++) for (let d = 0; d <= ROLL_MAX; d++) if (force + a > defense + d) wins++
  return wins / ((ROLL_MAX + 1) * (ROLL_MAX + 1))
}

export const rollDie = (rand: () => number): number => Math.floor(rand() * (ROLL_MAX + 1))

// ---------------------------------------------------------------- round
export interface SideLedger {
  readonly before: number
  readonly lost: number
  readonly reinforced: number
  readonly after: number
}
export interface RoundReport {
  readonly round: number
  readonly usAlloc: readonly number[]
  readonly aiAlloc: readonly number[]
  readonly assault: number
  readonly advance: boolean
  readonly assaultBattle: BattleReport | null
  readonly counter: BattleReport | null
  readonly reinforced: { readonly us: number; readonly ai: number }
  readonly us: SideLedger
  readonly ai: SideLedger
  readonly result: Result | null
}

export function preview(s: State, o: Orders) {
  const { edge, contested } = front(s.sectors)
  const ai = aiAllocate(s)
  const edgeForce = s.sectors[edge]!.div + o.alloc[edge]!
  const force = o.advance ? edgeForce + o.assault : 0
  const defenders = s.sectors[contested]!.div + ai[contested]!
  const bonus = defenseBonus(contested)
  const defense = defenders + bonus
  return {
    edge,
    contested,
    edgeForce,
    assault: o.advance ? o.assault : 0,
    force,
    defenseNow: s.sectors[contested]!.div,
    defenseAdded: ai[contested]!,
    defenders,
    bonus,
    defense,
    atkMin: force,
    atkMax: force + ROLL_MAX,
    defMin: defense,
    defMax: defense + ROLL_MAX,
    chance: o.advance && force > 0 ? breakthroughChance(force, defense) : 0,
    /** Counterattack plan if you HOLD (or your assault does not break through). */
    counter: counterPlan(
      s.sectors.map((x, i) => ({ owner: x.owner, div: x.div + (x.owner === 'US' ? o.alloc[i]! : ai[i]!) })),
      s.aiPool - sum(ai),
      s.difficulty,
      s.round,
    ),
    aiAlloc: ai,
  }
}

/**
 * Play one round. `rand` supplies the rolls (assault: attack then defense;
 * counterattack: attack then defense). Throws on invalid orders.
 */
export function playRound(s: State, o: Orders, rand: () => number): { state: State; report: RoundReport } {
  const problem = ordersProblem(s, o)
  if (problem) throw new Error(problem)
  const usBefore = forces(s, 'US')
  const aiBefore = forces(s, 'AI')
  const aiAlloc = aiAllocate(s)

  // 1. Allocation.
  const sec = s.sectors.map((x, i) => ({ owner: x.owner, div: x.div + (x.owner === 'US' ? o.alloc[i]! : aiAlloc[i]!) }))
  let usPool = s.usPool - committed(o)
  let aiPool = s.aiPool - sum(aiAlloc)
  let usLost = 0
  let aiLost = 0
  let result: Result | null = null

  // 2. Your assault.
  let assaultBattle: BattleReport | null = null
  const f0 = front(sec)
  if (o.advance) {
    assaultBattle = resolveBattle({
      attacker: 'US',
      from: f0.edge,
      target: f0.contested,
      edge: sec[f0.edge]!.div,
      assault: o.assault,
      stay: 0,
      defense: sec[f0.contested]!.div,
      bonus: defenseBonus(f0.contested),
      retreatTo: f0.contested < AI_CAPITAL ? f0.contested + 1 : null,
      atkRoll: rollDie(rand),
      defRoll: rollDie(rand),
    })
    usLost += assaultBattle.lost.attacker
    aiLost += assaultBattle.lost.defender
    sec[f0.edge]!.div = assaultBattle.remaining.from
    sec[f0.contested]!.div = assaultBattle.remaining.target
    if (assaultBattle.result === 'breakthrough') {
      sec[f0.contested]!.owner = 'US'
      if (assaultBattle.retreatTo !== null) sec[assaultBattle.retreatTo]!.div += assaultBattle.retreated
    }
  } else {
    // A HOLD order leaves the assault slot empty (validated above).
  }
  if (sec[AI_CAPITAL]!.owner === 'US') result = { outcome: 'win', reason: 'capital-captured', usHeld: 0, aiHeld: 0 }

  // 3. Enemy counterattack against your (possibly new) edge.
  let counter: BattleReport | null = null
  if (!result) {
    const f1 = front(sec)
    const enemy = sec[f1.contested]!.div
    const garrison = sec[f1.edge]!.div
    const plan = counterPlan(sec, aiPool, s.difficulty, s.round)
    if (plan.attacks) {
      const stay = Math.min(1, enemy)
      aiPool -= plan.reserve
      counter = resolveBattle({
        attacker: 'AI',
        from: f1.contested,
        target: f1.edge,
        edge: enemy - stay,
        assault: plan.reserve,
        stay,
        defense: garrison,
        bonus: defenseBonus(f1.edge),
        retreatTo: f1.edge > US_CAPITAL ? f1.edge - 1 : null,
        atkRoll: rollDie(rand),
        defRoll: rollDie(rand),
      })
      aiLost += counter.lost.attacker
      usLost += counter.lost.defender
      sec[f1.contested]!.div = counter.remaining.from
      sec[f1.edge]!.div = counter.remaining.target
      if (counter.result === 'breakthrough') {
        sec[f1.edge]!.owner = 'AI'
        if (counter.retreatTo !== null) sec[counter.retreatTo]!.div += counter.retreated
      }
      if (sec[US_CAPITAL]!.owner === 'AI') result = { outcome: 'lose', reason: 'capital-lost', usHeld: 0, aiHeld: 0 }
    }
  }

  // 4. Reinforcement: once per round, both sides, same moment.
  const reinforced = result ? { us: 0, ai: 0 } : { us: REINFORCE, ai: AI_REINFORCE[s.difficulty] }
  usPool += reinforced.us
  aiPool += reinforced.ai

  // 5. Armistice.
  if (!result && s.round >= MAX_ROUNDS) {
    const us = held(sec, 'US')
    result = { outcome: us * 2 > SECTOR_COUNT ? 'win' : 'lose', reason: 'armistice', usHeld: 0, aiHeld: 0 }
  }
  if (result) result = { ...result, usHeld: held(sec, 'US'), aiHeld: held(sec, 'AI') }

  const state: State = {
    sectors: sec,
    usPool,
    aiPool,
    round: s.round + 1,
    difficulty: s.difficulty,
    result,
    lost: { us: s.lost.us + usLost, ai: s.lost.ai + aiLost },
  }
  const report: RoundReport = {
    round: s.round,
    usAlloc: o.alloc.slice(),
    aiAlloc,
    assault: o.assault,
    advance: o.advance,
    assaultBattle,
    counter,
    reinforced,
    us: { before: usBefore, lost: usLost, reinforced: reinforced.us, after: forces(state, 'US') },
    ai: { before: aiBefore, lost: aiLost, reinforced: reinforced.ai, after: forces(state, 'AI') },
    result,
  }
  return { state, report }
}

/** True when the ledger reconciles: before - lost + reinforced = after. */
export const reconciles = (l: SideLedger): boolean => l.before - l.lost + l.reinforced === l.after

/** A random source that replays fixed values (for fixtures). */
export function scripted(values: readonly number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}
/** Value that rollDie maps to the given 0..3 roll. */
export const asRoll = (r: number): number => (r + 0.5) / (ROLL_MAX + 1)
