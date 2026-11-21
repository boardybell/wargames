// DESERT WARFARE rules (pure). Design: docs/games-design-review.md §11.
//
// Two blue tanks against two red tanks on a 9x9 desert. Each round both blue
// tanks act once (MOVE one square, FIRE, or HOLD), then WOPR's tanks act.
// Both sides use the same rules by default: four-way movement, one square per
// action, one fuel per move, ten fuel each, gun range 4, and a symmetric line
// of sight that dunes block. Round MAX_ROUNDS is fully playable; the TIME
// LIMIT is checked only after WOPR completes it. FUEL EXHAUSTED is a separate
// ending: every tank is out of fuel and no tank has a shot.
export const N = 9
export const RANGE = 4
export const MAX_ROUNDS = 30
export const FUEL = 10
export const MAX_ARMOR = 3

export type Side = 'US' | 'EN'
export interface Tank {
  readonly id: number
  readonly side: Side
  readonly x: number
  readonly y: number
  readonly hp: number
  readonly fuel: number
  readonly acted: boolean
}
export interface Pos {
  readonly x: number
  readonly y: number
}
export type Dir = 'N' | 'S' | 'E' | 'W'
export const DELTA: Record<Dir, Pos> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
}
export type EndReason = 'destroyed' | 'lost' | 'time' | 'fuel'

export interface DState {
  readonly layout: string
  readonly dunes: readonly string[]
  readonly tanks: readonly Tank[]
  /** Selected blue tank id. */
  readonly sel: number
  /** Selected red target id. */
  readonly target: number
  readonly round: number
  readonly end: EndReason | null
  /** RNG state for shot rolls (reproducible per seed). */
  readonly rng: number
}

export type DEventKind = 'move' | 'hold' | 'fire' | 'destroyed' | 'enemy' | 'round' | 'end'
export interface DEvent {
  readonly kind: DEventKind
  readonly side: Side
  readonly text: string
  readonly dmg?: number
}

export const key = (x: number, y: number): string => `${x},${y}`
export const cheb = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const COLS = 'ABCDEFGHJ'
export const cellName = (p: Pos): string => `${COLS[p.x]}${N - p.y}`
export const tankName = (t: { id: number; side: Side }): string => (t.side === 'US' ? `T${t.id + 1}` : `E${t.id - 1}`)
const live = (ts: readonly Tank[], side: Side): Tank[] => ts.filter((t) => t.side === side && t.hp > 0)

/** mulberry32 step, pure. */
export function rand(seed: number): [number, number] {
  const a = (seed + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a]
}

// ------------------------------------------------------------------ terrain
export const START: readonly Omit<Tank, 'acted'>[] = [
  { id: 0, side: 'US', x: 0, y: 7, hp: MAX_ARMOR, fuel: FUEL },
  { id: 1, side: 'US', x: 1, y: 8, hp: MAX_ARMOR, fuel: FUEL },
  { id: 2, side: 'EN', x: 8, y: 1, hp: MAX_ARMOR, fuel: FUEL },
  { id: 3, side: 'EN', x: 7, y: 0, hp: MAX_ARMOR, fuel: FUEL },
]

/** The original shipped dune field (kept as CLASSIC). */
export const CLASSIC_DUNES: readonly string[] = ['3,3', '3,4', '5,5', '5,4', '4,6', '6,2', '2,6']

/** Every passable cell reachable from `from` (4-neighbour, dunes block). */
function reach(from: Pos, dunes: ReadonlySet<string>): Set<string> {
  const seen = new Set([key(from.x, from.y)])
  const q: Pos[] = [from]
  while (q.length) {
    const p = q.shift()!
    for (const d of Object.values(DELTA)) {
      const nx = p.x + d.x
      const ny = p.y + d.y
      const k = key(nx, ny)
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || dunes.has(k) || seen.has(k)) continue
      seen.add(k)
      q.push({ x: nx, y: ny })
    }
  }
  return seen
}

/**
 * Deterministic dune field from a seed: 7–9 dunes in the middle band, never
 * next to a start position, and every start connected to every other.
 */
export function seededDunes(seed: number): string[] {
  let s = seed >>> 0
  for (let attempt = 0; attempt < 200; attempt++) {
    let r: number
    ;[r, s] = rand(s)
    const count = 7 + Math.floor(r * 3)
    const dunes = new Set<string>()
    let guard = 0
    while (dunes.size < count && guard++ < 500) {
      ;[r, s] = rand(s)
      const x = 1 + Math.floor(r * (N - 2))
      ;[r, s] = rand(s)
      const y = 1 + Math.floor(r * (N - 2))
      if (START.some((t) => cheb(t, { x, y }) <= 1)) continue
      dunes.add(key(x, y))
    }
    const r0 = reach(START[0]!, dunes)
    if (START.every((t) => r0.has(key(t.x, t.y)))) return [...dunes].sort()
  }
  return [...CLASSIC_DUNES]
}

export interface Layout {
  readonly id: string
  readonly name: string
  readonly seed: number | null
}
export const LAYOUTS: readonly Layout[] = [
  { id: 'classic', name: 'CLASSIC', seed: null },
  { id: 'seed-1983', name: 'FIELD 1983', seed: 1983 },
  { id: 'seed-0614', name: 'FIELD 0614', seed: 614 },
  { id: 'seed-2600', name: 'FIELD 2600', seed: 2600 },
]
export function layoutDunes(id: string): string[] {
  const l = LAYOUTS.find((x) => x.id === id) ?? LAYOUTS[0]!
  return l.seed === null ? [...CLASSIC_DUNES] : seededDunes(l.seed)
}

export function initState(layout: string, seed: number): DState {
  return {
    layout,
    dunes: layoutDunes(layout),
    tanks: START.map((t) => ({ ...t, acted: false })),
    sel: 0,
    target: 2,
    round: 1,
    end: null,
    rng: seed >>> 0,
  }
}

// ------------------------------------------------------------ line of sight
interface Frac {
  n: number
  d: number
}
const lt = (a: Frac, b: Frac): boolean => a.n * b.d < b.n * a.d
const frac = (n: number, d: number): Frac => (d < 0 ? { n: -n, d: -d } : { n, d })

/**
 * Symmetric line of sight between cell centres. The segment is blocked by any
 * dune whose open interior it crosses. Where the segment passes exactly
 * through a grid corner, it is blocked only if BOTH cells flanking that corner
 * are dunes (a closed diagonal gap); touching one dune's corner does not
 * block. Endpoints are ignored. Exact integer arithmetic, so the result is
 * identical in both directions.
 */
export function lineClear(a: Pos, b: Pos, dunes: ReadonlySet<string>): boolean {
  // Work in doubled coordinates: cell centre = 2c + 1, cell spans [2c, 2c+2].
  const ax = 2 * a.x + 1
  const ay = 2 * a.y + 1
  const dx = 2 * (b.x - a.x)
  const dy = 2 * (b.y - a.y)
  const axisInterval = (start: number, delta: number, lo: number, hi: number): [Frac, Frac] | null => {
    if (delta === 0) return start > lo && start < hi ? [frac(0, 1), frac(1, 1)] : null
    const t1 = frac(lo - start, delta)
    const t2 = frac(hi - start, delta)
    return lt(t1, t2) ? [t1, t2] : [t2, t1]
  }
  for (const k of dunes) {
    const [cx, cy] = k.split(',').map(Number) as [number, number]
    if ((cx === a.x && cy === a.y) || (cx === b.x && cy === b.y)) continue
    const ix = axisInterval(ax, dx, 2 * cx, 2 * cx + 2)
    const iy = axisInterval(ay, dy, 2 * cy, 2 * cy + 2)
    if (!ix || !iy) continue
    // open intervals intersected with [0,1]
    const lo = [ix[0], iy[0], frac(0, 1)].reduce((m, f) => (lt(m, f) ? f : m))
    const hi = [ix[1], iy[1], frac(1, 1)].reduce((m, f) => (lt(f, m) ? f : m))
    if (lt(lo, hi)) return false
  }
  // Exact corner passes.
  if (dx !== 0 && dy !== 0) {
    const sx = Math.sign(dx)
    const sy = Math.sign(dy)
    const steps = Math.abs(b.x - a.x)
    for (let i = 1; i <= steps; i++) {
      // grid line X = a.x + (sx>0 ? i : 1 - i) in cell units → doubled 2X
      const gx = sx > 0 ? a.x + i : a.x + 1 - i
      const num = (2 * gx - ax) * dy // = (2gy - ay) * dx at the crossing
      if ((num + ay * dx) % (2 * dx) !== 0) continue
      const gy = (num + ay * dx) / (2 * dx)
      if (!Number.isInteger(gy)) continue
      const f1 = key(gx - (sx > 0 ? 0 : 1), gy - (sy > 0 ? 1 : 0))
      const f2 = key(gx - (sx > 0 ? 1 : 0), gy - (sy > 0 ? 0 : 1))
      if (dunes.has(f1) && dunes.has(f2)) return false
    }
  }
  return true
}

/** Range and sight only (no armor / alive check): symmetric by construction. */
export function canFire(a: Pos, b: Pos, dunes: ReadonlySet<string>): boolean {
  const r = cheb(a, b)
  return r >= 1 && r <= RANGE && lineClear(a, b, dunes)
}

export function fireBlock(a: Pos, b: Pos, dunes: ReadonlySet<string>): string | null {
  const r = cheb(a, b)
  if (r > RANGE) return `OUT OF RANGE (${r} > ${RANGE})`
  if (r < 1) return 'SAME SQUARE'
  if (!lineClear(a, b, dunes)) return 'TARGET BLOCKED BY DUNE'
  return null
}

/** Hit model: range 1–2 always hits (85% for 2, else 1); range 3–4 hits 60% for 1. */
export function hitChance(r: number): { hit: number; heavy: number } {
  if (r <= 2) return { hit: 1, heavy: 0.85 }
  if (r <= RANGE) return { hit: 0.6, heavy: 0 }
  return { hit: 0, heavy: 0 }
}
export function expectedDamage(r: number): number {
  const h = hitChance(r)
  return h.heavy * 2 + (h.hit - h.heavy) * 1
}
function roll(r: number, rng: number): { dmg: number; rng: number; text: string } {
  const [v, next] = rand(rng)
  const h = hitChance(r)
  if (v < h.heavy) return { dmg: 2, rng: next, text: 'DIRECT HIT' }
  if (v < h.hit) return { dmg: 1, rng: next, text: 'HIT' }
  return { dmg: 0, rng: next, text: 'MISS' }
}

// ------------------------------------------------------------------ movement
export function blocked(s: DState, x: number, y: number, self: number): string | null {
  if (x < 0 || y < 0 || x >= N || y >= N) return 'EDGE OF MAP'
  if (s.dunes.includes(key(x, y))) return 'DUNE'
  const t = s.tanks.find((o) => o.id !== self && o.hp > 0 && o.x === x && o.y === y)
  if (t) return `${tankName(t)} IN THE WAY`
  return null
}

export function moveBlock(s: DState, dir: Dir): string | null {
  const t = selected(s)
  if (!t) return 'NO TANK READY'
  if (t.acted) return `${tankName(t)} HAS ACTED`
  if (t.fuel <= 0) return 'NO FUEL'
  return blocked(s, t.x + DELTA[dir].x, t.y + DELTA[dir].y, t.id)
}

export function reachable(s: DState, t: Tank): Pos[] {
  if (t.acted || t.fuel <= 0 || t.hp <= 0) return []
  return Object.values(DELTA)
    .map((d) => ({ x: t.x + d.x, y: t.y + d.y }))
    .filter((p) => !blocked(s, p.x, p.y, t.id))
}

export const selected = (s: DState): Tank | undefined => s.tanks.find((t) => t.id === s.sel && t.side === 'US' && t.hp > 0)

/** First step of a shortest 4-neighbour path from `from` to any goal cell. */
export function pathStep(s: DState, from: Tank, goal: (p: Pos) => boolean): Pos | null {
  const start = key(from.x, from.y)
  const prev = new Map<string, string>([[start, '']])
  const q: Pos[] = [from]
  while (q.length) {
    const p = q.shift()!
    const pk = key(p.x, p.y)
    if (pk !== start && goal(p)) {
      let k = pk
      while (prev.get(k) !== start) k = prev.get(k)!
      const [x, y] = k.split(',').map(Number) as [number, number]
      return { x, y }
    }
    for (const d of Object.values(DELTA)) {
      const nx = p.x + d.x
      const ny = p.y + d.y
      const nk = key(nx, ny)
      if (prev.has(nk) || blocked(s, nx, ny, from.id)) continue
      prev.set(nk, pk)
      q.push({ x: nx, y: ny })
    }
  }
  return null
}

// ------------------------------------------------------------------ actions
export type PlayerAction = { type: 'move'; dir: Dir } | { type: 'fire' } | { type: 'hold' }
export type ActResult =
  | { readonly ok: false; readonly reason: string }
  | { readonly ok: true; readonly state: DState; readonly events: DEvent[] }

function outcome(tanks: readonly Tank[]): EndReason | null {
  if (live(tanks, 'EN').length === 0) return 'destroyed'
  if (live(tanks, 'US').length === 0) return 'lost'
  return null
}

function fuelDeadlock(tanks: readonly Tank[], dunes: ReadonlySet<string>): boolean {
  const all = tanks.filter((t) => t.hp > 0)
  if (all.some((t) => t.fuel > 0)) return false
  for (const a of all) for (const b of all) if (a.side !== b.side && canFire(a, b, dunes)) return false
  return true
}

/** One blue tank acts. When both blue tanks have acted, WOPR's turn runs. */
export function act(s: DState, a: PlayerAction): ActResult {
  if (s.end) return { ok: false, reason: 'ENGAGEMENT OVER' }
  const me = selected(s)
  if (!me) return { ok: false, reason: 'NO TANK SELECTED' }
  if (me.acted) return { ok: false, reason: `${tankName(me)} HAS ACTED THIS ROUND` }
  const dunes = new Set(s.dunes)
  const events: DEvent[] = []
  let tanks = s.tanks.slice()
  let rng = s.rng
  if (a.type === 'move') {
    const why = moveBlock(s, a.dir)
    if (why) return { ok: false, reason: why }
    const to = { x: me.x + DELTA[a.dir].x, y: me.y + DELTA[a.dir].y }
    tanks = tanks.map((t) => (t.id === me.id ? { ...t, ...to, fuel: t.fuel - 1, acted: true } : t))
    events.push({ kind: 'move', side: 'US', text: `${tankName(me)} MOVES ${a.dir} TO ${cellName(to)}. FUEL ${me.fuel - 1}/${FUEL}.` })
  } else if (a.type === 'fire') {
    const tgt = s.tanks.find((t) => t.id === s.target && t.side === 'EN' && t.hp > 0)
    if (!tgt) return { ok: false, reason: 'NO TARGET SELECTED' }
    const why = fireBlock(me, tgt, dunes)
    if (why) return { ok: false, reason: `${tankName(tgt)}: ${why}` }
    const r = cheb(me, tgt)
    const res = roll(r, rng)
    rng = res.rng
    const hp = Math.max(0, tgt.hp - res.dmg)
    tanks = tanks.map((t) => (t.id === me.id ? { ...t, acted: true } : t.id === tgt.id ? { ...t, hp } : t))
    events.push({
      kind: 'fire',
      side: 'US',
      dmg: res.dmg,
      text: `${tankName(me)} FIRES ON ${tankName(tgt)} AT RANGE ${r}: ${res.text}${res.dmg ? `, ARMOR ${tgt.hp}→${hp}` : ''}.`,
    })
    if (hp <= 0) events.push({ kind: 'destroyed', side: 'EN', text: `${tankName(tgt)} DESTROYED AT ${cellName(tgt)}.` })
  } else {
    tanks = tanks.map((t) => (t.id === me.id ? { ...t, acted: true } : t))
    events.push({ kind: 'hold', side: 'US', text: `${tankName(me)} HOLDS AT ${cellName(me)}.` })
  }
  let next: DState = { ...s, tanks, rng }
  const end = outcome(tanks)
  if (end) return { ok: true, state: { ...next, end }, events }
  // keep a live target selected
  if (!tanks.some((t) => t.id === next.target && t.hp > 0)) next = { ...next, target: live(tanks, 'EN')[0]!.id }
  const pending = live(tanks, 'US').filter((t) => !t.acted)
  if (pending.length > 0) return { ok: true, state: { ...next, sel: pending[0]!.id }, events }
  const e = enemyTurn(next)
  return { ok: true, state: e.state, events: [...events, ...e.events] }
}

/** WOPR's tanks act in order, then the round closes. */
export function enemyTurn(s0: DState): { state: DState; events: DEvent[] } {
  let s = s0
  const dunes = new Set(s.dunes)
  const events: DEvent[] = []
  for (const id of live(s.tanks, 'EN').map((t) => t.id)) {
    const en = s.tanks.find((t) => t.id === id)!
    if (en.hp <= 0) continue
    const targets = live(s.tanks, 'US')
    if (targets.length === 0) break
    const shots = targets
      .filter((t) => canFire(en, t, dunes))
      .sort((a, b) => expectedDamage(cheb(en, b)) - expectedDamage(cheb(en, a)) || a.hp - b.hp || a.id - b.id)
    if (shots.length) {
      const tgt = shots[0]!
      const r = cheb(en, tgt)
      const res = roll(r, s.rng)
      const hp = Math.max(0, tgt.hp - res.dmg)
      s = { ...s, rng: res.rng, tanks: s.tanks.map((t) => (t.id === tgt.id ? { ...t, hp } : t)) }
      events.push({
        kind: 'enemy',
        side: 'EN',
        dmg: res.dmg,
        text: `${tankName(en)} FIRES ON ${tankName(tgt)} AT RANGE ${r}: ${res.text}${res.dmg ? `, ARMOR ${tgt.hp}→${hp}` : ''}.`,
      })
      if (hp <= 0) events.push({ kind: 'destroyed', side: 'US', text: `${tankName(tgt)} DESTROYED AT ${cellName(tgt)}.` })
      continue
    }
    if (en.fuel <= 0) {
      events.push({ kind: 'enemy', side: 'EN', text: `${tankName(en)} HOLDS: NO FUEL.` })
      continue
    }
    // Shortest path to any square with a shot; else toward the nearest tank.
    const firing = (p: Pos): boolean => targets.some((t) => canFire(p, t, dunes))
    const step =
      pathStep(s, en, firing) ??
      pathStep(s, en, (p) => targets.some((t) => cheb(p, t) <= 1))
    if (!step) {
      events.push({ kind: 'enemy', side: 'EN', text: `${tankName(en)} HOLDS: NO ROUTE.` })
      continue
    }
    s = { ...s, tanks: s.tanks.map((t) => (t.id === en.id ? { ...t, ...step, fuel: t.fuel - 1 } : t)) }
    events.push({ kind: 'enemy', side: 'EN', text: `${tankName(en)} MOVES TO ${cellName(step)}. FUEL ${en.fuel - 1}/${FUEL}.` })
  }
  const tanks = s.tanks.map((t) => ({ ...t, acted: false }))
  const end = outcome(tanks) ?? (s.round >= MAX_ROUNDS ? 'time' : fuelDeadlock(tanks, dunes) ? 'fuel' : null)
  const liveUS = live(tanks, 'US')
  const target = tanks.some((t) => t.id === s.target && t.hp > 0) ? s.target : (live(tanks, 'EN')[0]?.id ?? s.target)
  const state: DState = {
    ...s,
    tanks,
    end,
    target,
    sel: liveUS[0]?.id ?? s.sel,
    round: end ? s.round : s.round + 1,
  }
  if (!end) events.push({ kind: 'round', side: 'US', text: `ROUND ${state.round}: BOTH TANKS READY.` })
  return { state, events }
}

export function selectTank(s: DState, id: number): DState {
  const t = s.tanks.find((x) => x.id === id && x.side === 'US' && x.hp > 0 && !x.acted)
  return t ? { ...s, sel: id } : s
}
export function selectTarget(s: DState, id: number): DState {
  const t = s.tanks.find((x) => x.id === id && x.side === 'EN' && x.hp > 0)
  return t ? { ...s, target: id } : s
}
