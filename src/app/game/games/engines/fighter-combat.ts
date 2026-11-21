// FIGHTER COMBAT rules (pure). Design: docs/games-design-review.md §9.
//
// Two aircraft on a 7x7 scope, eight compass headings. Each turn both sides
// pick one action simultaneously; both maneuvers resolve, then guns are
// checked from the post-maneuver geometry. Every action has a stated energy
// cost that must be available BEFORE resolution (same rule for the AI), and
// CLIMB is always available, so there is no energy deadlock.
export const GRID = 7
export const MAX_TURNS = 24
export const MAX_ENERGY = 10
export const MAX_HP = 6
export const GUN_RANGE = 3
/** Half-angle of the forward firing cone, degrees. */
export const CONE_DEG = 45

/** Eight compass headings, clockwise from north. Index is the heading. */
export const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const
export const DIR_NAME = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export type Act = 'LEFT' | 'RIGHT' | 'THROTTLE' | 'CLIMB' | 'DIVE' | 'GUNS'
export const ACTS: readonly Act[] = ['LEFT', 'RIGHT', 'THROTTLE', 'CLIMB', 'DIVE', 'GUNS']

/** Energy needed before the action, and the net change it makes. */
export const COST: Record<Act, { need: number; delta: number }> = {
  LEFT: { need: 1, delta: -1 },
  RIGHT: { need: 1, delta: -1 },
  THROTTLE: { need: 0, delta: +2 },
  CLIMB: { need: 0, delta: +3 },
  DIVE: { need: 2, delta: -2 },
  GUNS: { need: 1, delta: -1 },
}

export interface Fighter {
  readonly x: number
  readonly y: number
  /** Index into DIRS. */
  readonly hdg: number
  readonly energy: number
  readonly hp: number
}

export type Difficulty = 'beginner' | 'veteran'
export type EndReason = 'splash' | 'shot-down' | 'mutual' | 'time'

export interface Scenario {
  readonly id: string
  readonly name: string
  readonly brief: string
  readonly you: Fighter
  readonly foe: Fighter
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'merge',
    name: 'MERGE',
    brief: 'HEAD-ON MERGE FROM OPPOSITE CORNERS. EVEN ENERGY.',
    you: { x: 1, y: 5, hdg: 1, energy: 6, hp: MAX_HP },
    foe: { x: 5, y: 1, hdg: 5, energy: 6, hp: MAX_HP },
  },
  {
    id: 'beam',
    name: 'BEAM',
    brief: 'CROSSING PATHS. BANDIT CLIMBING ACROSS YOUR NOSE.',
    you: { x: 1, y: 1, hdg: 2, energy: 6, hp: MAX_HP },
    foe: { x: 5, y: 5, hdg: 0, energy: 6, hp: MAX_HP },
  },
  {
    id: 'defensive',
    name: 'DEFENSIVE',
    brief: 'BANDIT IN YOUR SIX AT RANGE 3. YOU HOLD MORE ENERGY. BREAK.',
    you: { x: 3, y: 2, hdg: 0, energy: 8, hp: MAX_HP },
    foe: { x: 3, y: 5, hdg: 0, energy: 4, hp: MAX_HP },
  },
  {
    id: 'perch',
    name: 'PERCH',
    brief: 'YOU START BEHIND THE BANDIT, LOW ON ENERGY. IT HAS SPEED TO RUN.',
    you: { x: 2, y: 6, hdg: 0, energy: 3, hp: MAX_HP },
    foe: { x: 4, y: 3, hdg: 1, energy: 8, hp: MAX_HP },
  },
]

export interface Resolution {
  readonly you: Fighter
  readonly foe: Fighter
  readonly foeAct: Act
  /** Damage dealt by each side this turn (0 = missed or did not fire). */
  readonly youHit: number
  readonly foeHit: number
  readonly youFired: boolean
  readonly foeFired: boolean
  /** Turn number that just resolved. */
  readonly turn: number
  readonly end: EndReason | null
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n)

export const range = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/** Bearing from a to b in degrees clockwise from north (screen y grows down). */
export function bearingDeg(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI
  return (deg + 360) % 360
}

/** Angle off the attacker's nose to a cell, degrees 0..180. */
export function offBore(att: Fighter, p: { x: number; y: number }): number {
  const d = Math.abs(bearingDeg(att, p) - att.hdg * 45) % 360
  return d > 180 ? 360 - d : d
}

/** Is the cell inside the attacker's forward firing cone and gun range? */
export function inArc(att: Fighter, p: { x: number; y: number }): boolean {
  const r = range(att, p)
  return r >= 1 && r <= GUN_RANGE && offBore(att, p) <= CONE_DEG + 1e-9
}

/** Gun damage if the defender sits in the attacker's arc: 2 at range 1, else 1. */
export function gunDamage(att: Fighter, def: Fighter): number {
  if (!inArc(att, def)) return 0
  return range(att, def) <= 1 ? 2 : 1
}

/** Eligibility shared by the player and the AI. */
export function canAct(f: Fighter, act: Act): { ok: boolean; reason?: string } {
  const need = COST[act].need
  if (f.energy < need) return { ok: false, reason: `NEEDS ${need} ENERGY (HAVE ${f.energy})` }
  return { ok: true }
}

export const eligibleActs = (f: Fighter): Act[] => ACTS.filter((a) => canAct(f, a).ok)

function advance(f: Fighter): Fighter {
  const [dx, dy] = DIRS[f.hdg]!
  return { ...f, x: clamp(f.x + dx, 0, GRID - 1), y: clamp(f.y + dy, 0, GRID - 1) }
}

/**
 * Apply one maneuver. Throws if the action is not eligible: callers must gate
 * with canAct first (the engine never clamps a cost away).
 */
export function maneuver(f: Fighter, act: Act): Fighter {
  if (!canAct(f, act).ok) throw new Error(`ineligible ${act} at energy ${f.energy}`)
  const e = clamp(f.energy + COST[act].delta, 0, MAX_ENERGY)
  switch (act) {
    case 'LEFT':
      return advance({ ...f, hdg: (f.hdg + 7) % 8, energy: e })
    case 'RIGHT':
      return advance({ ...f, hdg: (f.hdg + 1) % 8, energy: e })
    case 'THROTTLE':
      return advance(advance({ ...f, energy: e }))
    case 'CLIMB':
      return { ...f, energy: e }
    case 'DIVE':
      return advance(advance(advance({ ...f, energy: e })))
    case 'GUNS':
      // Hold the aircraft steady on the target: no displacement.
      return { ...f, energy: e }
  }
}

/** Heading index closest to the bearing from a to b. */
export function headingToward(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.round(bearingDeg(a, b) / 45) % 8
}

/** BEGINNER: the original chase policy, now under the shared eligibility rule. */
export function chasePolicy(foe: Fighter, you: Fighter): Act {
  if (canAct(foe, 'GUNS').ok && inArc(foe, you)) return 'GUNS'
  if (foe.energy <= 1) return 'CLIMB'
  const want = headingToward(foe, you)
  if (foe.hdg === want) {
    if (range(foe, you) > GUN_RANGE) return 'THROTTLE'
    return canAct(foe, 'DIVE').ok ? 'DIVE' : 'THROTTLE'
  }
  const toLeft = (foe.hdg - want + 8) % 8
  const toRight = (want - foe.hdg + 8) % 8
  return toLeft <= toRight ? 'LEFT' : 'RIGHT'
}

/**
 * VETERAN: evaluates every eligible action against every eligible reply.
 * Each candidate position is scored for gun damage dealt, exposure to the
 * player's guns this turn and next, follow-up firing position and energy
 * reserve, blending the average reply with the worst one. Deterministic (ties broken by action order).
 */
export function veteranPolicy(foe: Fighter, you: Fighter): Act {
  const mine = eligibleActs(foe)
  const theirs = eligibleActs(you)
  let best: Act = mine[0] ?? 'CLIMB'
  let bestScore = -Infinity
  for (const a of mine) {
    const f2 = maneuver(foe, a)
    let total = 0
    let worst = Infinity
    for (const b of theirs) {
      const y2 = maneuver(you, b)
      const dealt = a === 'GUNS' ? gunDamage(f2, y2) : 0
      const taken = b === 'GUNS' ? gunDamage(y2, f2) : 0
      // Next turn: can either side bring guns to bear without moving?
      const nextOffense = inArc(f2, y2) ? 1 : 0
      const nextExposure = inArc(y2, f2) ? 1 : 0
      const r = range(f2, y2)
      const closure = r > GUN_RANGE ? -0.25 * (r - GUN_RANGE) : 0
      const v = 3 * dealt - 3 * taken + 0.9 * nextOffense - 1.1 * nextExposure + closure
      total += v
      worst = Math.min(worst, v)
    }
    const avg = total / Math.max(1, theirs.length)
    const energyTerm = 0.08 * f2.energy - (f2.energy < 2 ? 0.6 : 0)
    // Cautious blend: the player is not random, so weigh the worst reply.
    const score = 0.4 * avg + 0.6 * worst + energyTerm
    if (score > bestScore + 1e-9) {
      bestScore = score
      best = a
    }
  }
  return best
}

export function foePolicy(d: Difficulty, foe: Fighter, you: Fighter): Act {
  return d === 'beginner' ? chasePolicy(foe, you) : veteranPolicy(foe, you)
}

/**
 * Resolve one simultaneous turn. Both actions must already be eligible.
 * Guns are checked after both maneuvers. The end check runs mutual
 * destruction first, then single kills, then the clock after turn MAX_TURNS.
 */
export function resolveTurn(you0: Fighter, foe0: Fighter, act: Act, fAct: Act, turn: number): Resolution {
  let you = maneuver(you0, act)
  let foe = maneuver(foe0, fAct)
  const youHit = act === 'GUNS' ? gunDamage(you, foe) : 0
  const foeHit = fAct === 'GUNS' ? gunDamage(foe, you) : 0
  you = { ...you, hp: clamp(you.hp - foeHit, 0, MAX_HP) }
  foe = { ...foe, hp: clamp(foe.hp - youHit, 0, MAX_HP) }
  let end: EndReason | null = null
  if (you.hp <= 0 && foe.hp <= 0) end = 'mutual'
  else if (foe.hp <= 0) end = 'splash'
  else if (you.hp <= 0) end = 'shot-down'
  else if (turn >= MAX_TURNS) end = 'time'
  return { you, foe, foeAct: fAct, youHit, foeHit, youFired: act === 'GUNS', foeFired: fAct === 'GUNS', turn, end }
}

/** Every cell inside a fighter's firing arc (for the scope overlay). */
export function arcCells(f: Fighter): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (inArc(f, { x, y })) out.push({ x, y })
  return out
}
