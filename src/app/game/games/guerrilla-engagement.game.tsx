// GUERRILLA ENGAGEMENT. An asymmetric small-unit hunt run by WOPR. You lead a
// three-man patrol across an 8x8 jungle grid toward an objective. The enemy is
// a hidden guerrilla cell: you cannot see them until a trooper spots them (or
// walks into an ambush). Each turn you pick a trooper and MOVE one square or
// HOLD to scan; adjacent guerrillas are revealed and you trade fire. Reach and
// hold the objective OR wipe the cell to WIN. Lose every trooper to LOSE. Let
// the clock run out short of the objective and it is a STALEMATE.
import { useCallback, useEffect, useState } from 'react'
import type { GameEntry, GameProps } from './types'

const N = 8
const MAX_TURNS = 26

interface Pos {
  x: number
  y: number
}
interface Trooper extends Pos {
  id: number
  hp: number // 0..2
}
interface Guerrilla extends Pos {
  id: number
  hp: number // 0..2
  seen: boolean
}
type Outcome = 'WIN' | 'LOSE' | 'STALEMATE' | null

interface State {
  troops: Trooper[]
  cell: Guerrilla[]
  sel: number // selected trooper id
  obj: Pos
  held: number // consecutive turns a trooper has held the objective
  turn: number
  outcome: Outcome
  log: string[]
}

const key = (x: number, y: number): string => `${x},${y}`
const cheb = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const randInt = (n: number): number => Math.floor(Math.random() * n)

function initState(): State {
  const troops: Trooper[] = [
    { id: 0, x: 0, y: 7, hp: 2 },
    { id: 1, x: 1, y: 7, hp: 2 },
    { id: 2, x: 0, y: 6, hp: 2 },
  ]
  const obj: Pos = { x: 7, y: 0 }
  // Scatter four guerrillas in the far/middle field, clear of the start.
  const cell: Guerrilla[] = []
  const taken = new Set(troops.map((t) => key(t.x, t.y)))
  taken.add(key(obj.x, obj.y))
  let id = 0
  while (cell.length < 4) {
    const x = 2 + randInt(N - 2)
    const y = randInt(N - 2)
    if (taken.has(key(x, y))) continue
    taken.add(key(x, y))
    cell.push({ id: id++, x, y, hp: 2, seen: false })
  }
  return {
    troops,
    cell,
    sel: 0,
    obj,
    held: 0,
    turn: 1,
    outcome: null,
    log: ['PATROL INSERTED. OBJECTIVE: NORTHEAST CORNER. CELL STRENGTH UNKNOWN.'],
  }
}

// A trooper at p reveals any guerrilla within line-of-sight range 2.
function spotFrom(p: Pos, cell: Guerrilla[]): Guerrilla[] {
  return cell.map((g) => (g.hp > 0 && cheb(p, g) <= 2 ? { ...g, seen: true } : g))
}

const alive = <T extends { hp: number }>(xs: T[]): T[] => xs.filter((x) => x.hp > 0)

// Resolve adjacent (range 1) firefights between troopers and guerrillas after
// a move. Both sides in contact take a hit; outnumbered side takes extra.
function firefight(
  troops: Trooper[],
  cell: Guerrilla[],
  log: string[],
): { troops: Trooper[]; cell: Guerrilla[] } {
  const t = troops.map((x) => ({ ...x }))
  const c = cell.map((x) => ({ ...x }))
  for (const g of c) {
    if (g.hp <= 0) continue
    const inContact = t.filter((tr) => tr.hp > 0 && cheb(tr, g) <= 1)
    if (inContact.length === 0) continue
    g.seen = true
    // Troopers volley the guerrilla.
    g.hp = Math.max(0, g.hp - inContact.length)
    // Guerrilla fires back at the nearest trooper (ambush bonus if unseen move).
    const target = inContact[randInt(inContact.length)]!
    const ref = t.find((x) => x.id === target.id)!
    ref.hp = Math.max(0, ref.hp - 1)
    if (g.hp <= 0) log.push(`GUERRILLA DOWN AT ${g.x},${g.y}.`)
    else log.push(`CONTACT AT ${g.x},${g.y}. FIRE EXCHANGED.`)
    if (ref.hp <= 0) log.push(`TROOPER ${ref.id + 1} IS DOWN.`)
  }
  return { troops: t, cell: c }
}

// The guerrilla turn: each live guerrilla sidles toward the nearest trooper if
// one is within 3, otherwise holds in cover. They do not leave the map.
function guerrillaMove(troops: Trooper[], cell: Guerrilla[]): Guerrilla[] {
  const live = alive(troops)
  if (live.length === 0) return cell
  const occupied = new Set(cell.filter((g) => g.hp > 0).map((g) => key(g.x, g.y)))
  return cell.map((g) => {
    if (g.hp <= 0) return g
    let near: Trooper | null = null
    let nd = 99
    for (const t of live) {
      const d = cheb(t, g)
      if (d < nd) {
        nd = d
        near = t
      }
    }
    if (!near || nd > 3 || nd <= 1) return g // hold in cover or already in contact
    const dx = Math.sign(near.x - g.x)
    const dy = Math.sign(near.y - g.y)
    const nx = g.x + dx
    const ny = g.y + dy
    if (nx < 0 || nx >= N || ny < 0 || ny >= N) return g
    if (occupied.has(key(nx, ny))) return g
    occupied.delete(key(g.x, g.y))
    occupied.add(key(nx, ny))
    return { ...g, x: nx, y: ny }
  })
}

type Move = 'N' | 'S' | 'E' | 'W' | 'HOLD'
const DELTA: Record<Move, Pos> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  HOLD: { x: 0, y: 0 },
}

function resolve(s: State, move: Move): State {
  if (s.outcome) return s
  const log: string[] = []
  const sel = s.troops.find((t) => t.id === s.sel)
  if (!sel || sel.hp <= 0) return s

  // 1. Move the selected trooper.
  const d = DELTA[move]
  const nx = sel.x + d.x
  const ny = sel.y + d.y
  const blocked =
    nx < 0 ||
    nx >= N ||
    ny < 0 ||
    ny >= N ||
    s.troops.some((t) => t.id !== sel.id && t.hp > 0 && t.x === nx && t.y === ny)
  let troops = s.troops.map((t) =>
    t.id === sel.id && !blocked ? { ...t, x: nx, y: ny } : t,
  )
  if (move === 'HOLD') log.push(`TROOPER ${sel.id + 1} SCANS.`)
  else if (blocked) log.push(`TROOPER ${sel.id + 1} BLOCKED.`)
  else log.push(`TROOPER ${sel.id + 1} MOVES ${move}.`)

  // 2. Spotting from every live trooper.
  let cell = s.cell
  for (const t of alive(troops)) cell = spotFrom(t, cell)

  // 3. Firefight after the player's move.
  ;({ troops, cell } = firefight(troops, cell, log))

  // 4. Guerrillas maneuver, then contact again (their ambush step).
  cell = guerrillaMove(troops, cell)
  for (const t of alive(troops)) cell = spotFrom(t, cell)
  ;({ troops, cell } = firefight(troops, cell, log))

  // 5. Objective hold tracking.
  const onObj = alive(troops).some((t) => t.x === s.obj.x && t.y === s.obj.y)
  const held = onObj ? s.held + 1 : 0
  if (onObj) log.push(`OBJECTIVE HELD (${held}/2).`)

  // 6. Outcomes.
  let outcome: Outcome = null
  const troopsLeft = alive(troops).length
  const cellLeft = alive(cell).length
  if (troopsLeft === 0) outcome = 'LOSE'
  else if (cellLeft === 0) outcome = 'WIN'
  else if (held >= 2) outcome = 'WIN'
  else if (s.turn >= MAX_TURNS) outcome = 'STALEMATE'

  if (outcome === 'WIN') log.push('WOPR: OBJECTIVE SECURED. ENGAGEMENT WON.')
  else if (outcome === 'LOSE') log.push('WOPR: PATROL LOST. ENGAGEMENT FAILED.')
  else if (outcome === 'STALEMATE') log.push('WOPR: TIME. PATROL WITHDRAWS. STALEMATE.')

  // Keep selection on a live trooper.
  let nextSel = s.sel
  if (!alive(troops).some((t) => t.id === nextSel)) {
    nextSel = alive(troops)[0]?.id ?? s.sel
  }

  return {
    troops,
    cell,
    sel: nextSel,
    obj: s.obj,
    held,
    turn: s.turn + 1,
    outcome,
    log: [...s.log.slice(-5), ...log],
  }
}

const MOVES: { m: Move; k: string; label: string }[] = [
  { m: 'N', k: 'W', label: 'NORTH' },
  { m: 'S', k: 'S', label: 'SOUTH' },
  { m: 'W', k: 'A', label: 'WEST' },
  { m: 'E', k: 'D', label: 'EAST' },
  { m: 'HOLD', k: 'H', label: 'HOLD / SCAN' },
]

function GuerrillaEngagement({ onExit }: GameProps) {
  const [s, setS] = useState<State>(initState)
  const move = useCallback((m: Move) => setS((p) => resolve(p, m)), [])
  const reset = useCallback(() => setS(initState()), [])
  const cycle = useCallback(() => {
    setS((p) => {
      const live = alive(p.troops)
      if (live.length === 0) return p
      const idx = live.findIndex((t) => t.id === p.sel)
      const next = live[(idx + 1) % live.length]!
      return { ...p, sel: next.id }
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase()
      if (s.outcome) {
        if (k === 'enter' || k === ' ') reset()
        return
      }
      if (k === 'tab') {
        e.preventDefault()
        cycle()
        return
      }
      const found = MOVES.find((x) => x.k.toLowerCase() === k)
      if (found) {
        e.preventDefault()
        move(found.m)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s.outcome, move, reset, cycle])

  const glyph = (x: number, y: number): { ch: string; cls?: string } => {
    const t = s.troops.find((tr) => tr.hp > 0 && tr.x === x && tr.y === y)
    if (t) return { ch: String(t.id + 1), cls: t.id === s.sel ? 'wg-amber' : undefined }
    const g = s.cell.find((gg) => gg.hp > 0 && gg.seen && gg.x === x && gg.y === y)
    if (g) return { ch: 'G', cls: 'wg-red' }
    if (s.obj.x === x && s.obj.y === y) return { ch: 'X', cls: 'wg-amber' }
    return { ch: '·', cls: 'wg-dim' }
  }

  const troopsLeft = alive(s.troops).length
  const cellSeen = s.cell.filter((g) => g.hp > 0 && g.seen).length

  return (
    <div className="wg-screen" data-testid="game-guerrilla-engagement">
      <div className="wg-out" style={{ gap: '0.3rem' }}>
        <div className="wg-amber wg-big">GUERRILLA ENGAGEMENT</div>
        <div className="wg-dim">
          WOPR COUNTERINSURGENCY SIM. TURN {s.turn}/{MAX_TURNS}. 1-3 = TROOPERS. X =
          OBJECTIVE. G = SPOTTED HOSTILE.
        </div>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${N}, 1.4ch)`,
              lineHeight: 1.25,
              letterSpacing: '0.2ch',
            }}
          >
            {Array.from({ length: N }, (_, y) =>
              Array.from({ length: N }, (_, x) => {
                const g = glyph(x, y)
                return (
                  <span key={key(x, y)} className={g.cls}>
                    {g.ch}
                  </span>
                )
              }),
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div>
              TROOPERS UP: <span className="wg-amber">{troopsLeft}/3</span>
            </div>
            <div>
              HOSTILES SPOTTED: <span className="wg-red">{cellSeen}</span>
            </div>
            <div className="wg-dim">SELECTED: TROOPER {s.sel + 1}</div>
            {s.troops.map((t) => (
              <div key={t.id} className={t.hp <= 0 ? 'wg-dim' : t.id === s.sel ? 'wg-amber' : undefined}>
                T{t.id + 1}: {t.hp <= 0 ? 'KIA' : `${'█'.repeat(t.hp)}${'░'.repeat(2 - t.hp)}`}
              </div>
            ))}
            <div className="wg-dim" style={{ marginTop: '0.3rem' }}>
              [TAB] NEXT TROOPER
            </div>
          </div>
        </div>

        <div className="wg-log" style={{ height: '6rem', marginTop: '0.4rem' }}>
          {s.log.slice(-6).map((l, i) => (
            <span key={i} className={l.includes('DOWN') || l.includes('LOST') ? 'crit' : undefined}>
              {l}
            </span>
          ))}
        </div>

        {!s.outcome ? (
          <div className="wg-opts" data-testid="ge-controls">
            <button type="button" className="wg-opt" onClick={cycle}>
              &gt; [TAB] SELECT NEXT TROOPER
            </button>
            {MOVES.map((mv) => (
              <button key={mv.m} type="button" className="wg-opt" onClick={() => move(mv.m)}>
                &gt; [{mv.k}] {mv.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="wg-opts">
            <div
              className={
                s.outcome === 'WIN' ? 'wg-big wg-amber' : s.outcome === 'LOSE' ? 'wg-big wg-red' : 'wg-big'
              }
            >
              {s.outcome === 'WIN'
                ? 'YOU WIN. SECTOR CLEARED.'
                : s.outcome === 'LOSE'
                  ? 'YOU LOSE. PATROL WIPED OUT.'
                  : 'STALEMATE. OBJECTIVE NOT SECURED.'}
            </div>
            <button type="button" className="wg-opt wg-amber" onClick={reset} autoFocus>
              &gt; PLAY AGAIN
            </button>
          </div>
        )}

        <button
          type="button"
          className="wg-opt"
          data-testid="game-exit"
          onClick={onExit}
          style={{ marginTop: '0.6rem' }}
        >
          &gt; EXIT TO GAMES
        </button>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'GUERRILLA ENGAGEMENT', Component: GuerrillaEngagement }
