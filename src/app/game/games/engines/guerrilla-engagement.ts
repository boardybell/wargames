// GUERRILLA ENGAGEMENT rules (pure). Design: docs/games-design-review.md §10.
//
// One command = one trooper moves one square (or HOLDs), then the guerrilla
// cell maneuvers, then observation is recomputed, then exactly ONE contact
// phase resolves: every unit adjacent to an enemy fires once, simultaneously,
// for one point of health. Invalid moves are rejected without spending time.
export const N = 8
export const MAX_TURNS = 30
export const HOLD_TARGET = 2
export const MAX_HP = 2
export const SIGHT = 2
export const HOLD_SIGHT = 3
export const CELL_SIZE = 5
/** Guerrillas react to troopers within this distance. */
export const ALERT = 3
/** Troopers engage observed hostiles out to this range; guerrillas only adjacent. */
export const TROOP_RANGE = 2

export interface Pos {
  readonly x: number
  readonly y: number
}
export interface Trooper extends Pos {
  readonly id: number
  readonly hp: number
}
export interface Guerrilla extends Pos {
  readonly id: number
  readonly hp: number
  /** Last observed position and the command it was observed on. */
  readonly seen: { readonly x: number; readonly y: number; readonly turn: number } | null
}
export type Move = 'N' | 'S' | 'E' | 'W' | 'HOLD'
export type EndReason = 'elimination' | 'objective' | 'patrol-lost' | 'time'

export interface GState {
  readonly seed: number
  readonly troops: readonly Trooper[]
  readonly cell: readonly Guerrilla[]
  readonly sel: number
  readonly obj: Pos
  /** Consecutive end-of-command checks with a trooper on the objective. */
  readonly held: number
  /** Command about to be issued (1-based). */
  readonly turn: number
  /** Cells observed after the last command (keys "x,y"). */
  readonly observed: readonly string[]
  readonly end: EndReason | null
}

export type GEventKind = 'move' | 'hold' | 'spot' | 'shot' | 'down' | 'objective' | 'end'
export interface GEvent {
  readonly kind: GEventKind
  readonly text: string
  /** Shots: who fired at whom and the health change. */
  readonly shot?: { readonly attacker: string; readonly target: string; readonly from: number; readonly to: number }
}

export const DELTA: Record<Move, Pos> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  HOLD: { x: 0, y: 0 },
}

export const key = (x: number, y: number): string => `${x},${y}`
export const cheb = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const COLS = 'ABCDEFGH'
export const cellName = (p: Pos): string => `${COLS[p.x]}${N - p.y}`
export const tName = (t: { id: number }): string => `T${t.id + 1}`
export const gName = (g: { id: number }): string => `G${g.id + 1}`
const alive = <T extends { hp: number }>(xs: readonly T[]): T[] => xs.filter((x) => x.hp > 0)

/** mulberry32 step, pure: returns the next value and seed. */
function rand(seed: number): [number, number] {
  const a = (seed + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a]
}

/** Cells observed by the live troopers; `holder` sees HOLD_SIGHT this command. */
export function observe(troops: readonly Trooper[], holder: number | null): Set<string> {
  const out = new Set<string>()
  for (const t of alive(troops)) {
    const r = t.id === holder ? HOLD_SIGHT : SIGHT
    for (let y = t.y - r; y <= t.y + r; y++)
      for (let x = t.x - r; x <= t.x + r; x++) if (x >= 0 && y >= 0 && x < N && y < N) out.add(key(x, y))
  }
  return out
}

function markSeen(cell: readonly Guerrilla[], obs: Set<string>, turn: number): Guerrilla[] {
  return cell.map((g) => (g.hp > 0 && obs.has(key(g.x, g.y)) ? { ...g, seen: { x: g.x, y: g.y, turn } } : g))
}

export function initState(seed: number): GState {
  const troops: Trooper[] = [
    { id: 0, x: 0, y: 7, hp: MAX_HP },
    { id: 1, x: 1, y: 7, hp: MAX_HP },
    { id: 2, x: 0, y: 6, hp: MAX_HP },
  ]
  const obj: Pos = { x: 7, y: 0 }
  const taken = new Set([key(obj.x, obj.y)])
  const cell: Guerrilla[] = []
  let s = seed >>> 0
  let guard = 0
  while (cell.length < CELL_SIZE && guard++ < 1000) {
    let r: number
    ;[r, s] = rand(s)
    const x = 2 + Math.floor(r * (N - 2))
    ;[r, s] = rand(s)
    const y = Math.floor(r * (N - 2))
    if (taken.has(key(x, y)) || troops.some((t) => cheb(t, { x, y }) < 3)) continue
    taken.add(key(x, y))
    cell.push({ id: cell.length, x, y, hp: MAX_HP, seen: null })
  }
  const obs = observe(troops, null)
  return { seed, troops, cell: markSeen(cell, obs, 0), sel: 0, obj, held: 0, turn: 1, observed: [...obs], end: null }
}

/** Why the selected trooper cannot make this move, or null if it can. */
export function moveBlock(s: GState, move: Move): string | null {
  if (s.end) return 'ENGAGEMENT OVER'
  const t = s.troops.find((x) => x.id === s.sel && x.hp > 0)
  if (!t) return 'NO TROOPER SELECTED'
  if (move === 'HOLD') return null
  const d = DELTA[move]
  const nx = t.x + d.x
  const ny = t.y + d.y
  if (nx < 0 || ny < 0 || nx >= N || ny >= N) return 'EDGE OF MAP'
  const mate = s.troops.find((o) => o.hp > 0 && o.x === nx && o.y === ny)
  if (mate) return `${tName(mate)} IN THE WAY`
  if (s.cell.some((g) => g.hp > 0 && g.x === nx && g.y === ny)) return 'HOSTILE IN THAT SQUARE'
  return null
}

/** Guerrillas within ALERT of a trooper close one square (8-neighbour); others hold. */
export function guerrillaMove(troops: readonly Trooper[], cell: readonly Guerrilla[]): Guerrilla[] {
  const live = alive(troops)
  const occ = new Set([...live.map((t) => key(t.x, t.y)), ...cell.filter((g) => g.hp > 0).map((g) => key(g.x, g.y))])
  return cell.map((g) => {
    if (g.hp <= 0 || live.length === 0) return g
    const near = live.slice().sort((a, b) => cheb(a, g) - cheb(b, g) || a.id - b.id)[0]!
    const d = cheb(near, g)
    if (d > ALERT || d <= 1) return g
    const nx = g.x + Math.sign(near.x - g.x)
    const ny = g.y + Math.sign(near.y - g.y)
    if (occ.has(key(nx, ny))) return g
    occ.delete(key(g.x, g.y))
    occ.add(key(nx, ny))
    return { ...g, x: nx, y: ny }
  })
}

/**
 * The single contact phase. Targets are chosen from the health at the start
 * of the phase (lowest health, then lowest number) and every shot lands at
 * once, so a unit destroyed in this phase still fires.
 */
export function contact(
  troops: readonly Trooper[],
  cell: readonly Guerrilla[],
): { troops: Trooper[]; cell: Guerrilla[]; events: GEvent[] } {
  const t = troops.map((x) => ({ ...x }))
  const c = cell.map((x) => ({ ...x }))
  const events: GEvent[] = []
  const pick = <T extends Pos & { id: number; hp: number }>(from: Pos, pool: T[], reach: number): T | undefined =>
    pool
      .filter((p) => p.hp > 0 && cheb(p, from) <= reach)
      .sort((a, b) => cheb(a, from) - cheb(b, from) || a.hp - b.hp || a.id - b.id)[0]
  const shots: { attacker: string; side: 'T' | 'G'; targetId: number }[] = []
  for (const tr of t) if (tr.hp > 0) {
    const g = pick(tr, c, TROOP_RANGE)
    if (g) shots.push({ attacker: tName(tr), side: 'T', targetId: g.id })
  }
  for (const g of c) if (g.hp > 0) {
    const tr = pick(g, t, 1)
    if (tr) shots.push({ attacker: gName(g), side: 'G', targetId: tr.id })
  }
  for (const sh of shots) {
    const target = sh.side === 'T' ? c.find((g) => g.id === sh.targetId)! : t.find((x) => x.id === sh.targetId)!
    const from = target.hp
    const to = Math.max(0, from - 1)
    ;(target as { hp: number }).hp = to
    const tn = sh.side === 'T' ? gName(target) : tName(target)
    events.push({
      kind: 'shot',
      text: `${sh.attacker} FIRES ON ${tn} AT ${cellName(target)}: HEALTH ${from}→${to}.`,
      shot: { attacker: sh.attacker, target: tn, from, to },
    })
  }
  for (const g of c) if (g.hp <= 0 && cell.find((o) => o.id === g.id)!.hp > 0) events.push({ kind: 'down', text: `${gName(g)} ELIMINATED AT ${cellName(g)}.` })
  for (const x of t) if (x.hp <= 0 && troops.find((o) => o.id === x.id)!.hp > 0) events.push({ kind: 'down', text: `${tName(x)} IS DOWN AT ${cellName(x)}.` })
  return { troops: t, cell: c, events }
}

export type CommandResult =
  | { readonly ok: false; readonly reason: string }
  | { readonly ok: true; readonly state: GState; readonly events: GEvent[] }

/** Issue one command for the selected trooper. */
export function command(s: GState, move: Move): CommandResult {
  const block = moveBlock(s, move)
  if (block) return { ok: false, reason: block }
  const sel = s.troops.find((t) => t.id === s.sel)!
  const events: GEvent[] = []
  const d = DELTA[move]
  let troops: Trooper[] = s.troops.map((t) => (t.id === sel.id ? { ...t, x: t.x + d.x, y: t.y + d.y } : t))
  if (move === 'HOLD') events.push({ kind: 'hold', text: `${tName(sel)} HOLDS AT ${cellName(sel)}: OBSERVATION RADIUS ${HOLD_SIGHT} THIS COMMAND.` })
  else events.push({ kind: 'move', text: `${tName(sel)} MOVES ${move} TO ${cellName({ x: sel.x + d.x, y: sel.y + d.y })}.` })

  // Guerrillas maneuver, then the patrol observes.
  let cell = guerrillaMove(troops, s.cell)
  const obs = observe(troops, move === 'HOLD' ? sel.id : null)
  const before = new Set(s.cell.filter((g) => g.hp > 0 && s.observed.includes(key(g.x, g.y))).map((g) => g.id))
  cell = markSeen(cell, obs, s.turn)
  for (const g of cell)
    if (g.hp > 0 && obs.has(key(g.x, g.y)) && !before.has(g.id)) events.push({ kind: 'spot', text: `${gName(g)} SPOTTED AT ${cellName(g)}.` })

  // One contact phase.
  const c = contact(troops, cell)
  troops = c.troops
  cell = c.cell
  events.push(...c.events)

  const onObj = alive(troops).some((t) => t.x === s.obj.x && t.y === s.obj.y)
  const held = onObj ? s.held + 1 : 0
  if (onObj) events.push({ kind: 'objective', text: `OBJECTIVE HOLD ${Math.min(held, HOLD_TARGET)}/${HOLD_TARGET}.` })
  else if (s.held > 0) events.push({ kind: 'objective', text: `OBJECTIVE HOLD BROKEN: 0/${HOLD_TARGET}.` })

  let end: EndReason | null = null
  if (alive(troops).length === 0) end = 'patrol-lost'
  else if (alive(cell).length === 0) end = 'elimination'
  else if (held >= HOLD_TARGET) end = 'objective'
  else if (s.turn >= MAX_TURNS) end = 'time'

  let nextSel = s.sel
  if (!alive(troops).some((t) => t.id === nextSel)) nextSel = alive(troops)[0]?.id ?? s.sel
  return {
    ok: true,
    events,
    state: { ...s, troops, cell, sel: nextSel, held, turn: s.turn + 1, observed: [...obs], end },
  }
}

/** Select a trooper directly (no time passes). */
export function select(s: GState, id: number): GState {
  return s.troops.some((t) => t.id === id && t.hp > 0) ? { ...s, sel: id } : s
}

/** Cycle selection through live troopers (no time passes). */
export function cycle(s: GState, dir: 1 | -1): GState {
  const live = alive(s.troops)
  if (live.length === 0) return s
  const i = live.findIndex((t) => t.id === s.sel)
  return { ...s, sel: live[(i + dir + live.length) % live.length]!.id }
}
