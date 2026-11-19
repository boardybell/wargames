// DESERT WARFARE. An armor skirmish run by WOPR across a 9x9 open desert grid.
// You command two tanks against an advancing enemy column of two. Each tank
// gets ONE action per turn: MOVE one square (burns fuel) or FIRE on an enemy
// in range and line-of-sight. Dunes block sight and shots. Gun range is 4;
// a shot inside 2 hits hard. Fuel is finite, so maneuver is a resource. Burn
// the enemy column down to WIN, lose both your tanks to LOSE, run dry in a
// standoff for a STALEMATE. A simple enemy AI closes to range and fires.
import { useCallback, useEffect, useState } from 'react'
import type { GameEntry, GameProps } from './types'

const N = 9
const RANGE = 4
const MAX_TURNS = 30

interface Tank {
  id: number
  x: number
  y: number
  hp: number // 0..3
  fuel: number // move points, you only
  side: 'US' | 'EN'
  acted: boolean
}
type Outcome = 'WIN' | 'LOSE' | 'STALEMATE' | null

interface State {
  tanks: Tank[]
  dunes: string[]
  sel: number
  turn: number
  phase: 'player' | 'enemy'
  outcome: Outcome
  log: string[]
}

const key = (x: number, y: number): string => `${x},${y}`
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const randInt = (n: number): number => Math.floor(Math.random() * n)

const DUNES: readonly string[] = ['3,3', '3,4', '5,5', '5,4', '4,6', '6,2', '2,6']

function initState(): State {
  const tanks: Tank[] = [
    { id: 0, x: 0, y: 7, hp: 3, fuel: 10, side: 'US', acted: false },
    { id: 1, x: 1, y: 8, hp: 3, fuel: 10, side: 'US', acted: false },
    { id: 2, x: 8, y: 1, hp: 3, fuel: 0, side: 'EN', acted: false },
    { id: 3, x: 7, y: 0, hp: 3, fuel: 0, side: 'EN', acted: false },
  ]
  return {
    tanks,
    dunes: [...DUNES],
    sel: 0,
    turn: 1,
    phase: 'player',
    outcome: null,
    log: ['ENEMY ARMOR COLUMN INBOUND FROM THE NORTHEAST. WEAPONS FREE.'],
  }
}

// Bresenham-ish line walk: true if clear sight (no dune strictly between).
function lineClear(a: Tank, b: Tank, dunes: Set<string>): boolean {
  let x0 = a.x
  let y0 = a.y
  const dx = Math.abs(b.x - x0)
  const dy = Math.abs(b.y - y0)
  const sx = x0 < b.x ? 1 : -1
  const sy = y0 < b.y ? 1 : -1
  let err = dx - dy
  // step along the line; ignore the two endpoints, block on any dune between
  for (;;) {
    if (!(x0 === a.x && y0 === a.y) && !(x0 === b.x && y0 === b.y)) {
      if (dunes.has(key(x0, y0))) return false
    }
    if (x0 === b.x && y0 === b.y) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
  return true
}

const live = (ts: Tank[], side: 'US' | 'EN'): Tank[] =>
  ts.filter((t) => t.side === side && t.hp > 0)

function canFire(shooter: Tank, target: Tank, dunes: Set<string>): boolean {
  if (target.hp <= 0) return false
  const r = cheb(shooter, target)
  return r >= 1 && r <= RANGE && lineClear(shooter, target, dunes)
}

// The shot: closer is deadlier, long range can graze or miss.
function shoot(shooter: Tank, target: Tank): { dmg: number; text: string } {
  const r = cheb(shooter, target)
  const roll = randInt(100)
  if (r <= 2) {
    if (roll < 85) return { dmg: 2, text: 'DIRECT HIT.' }
    return { dmg: 1, text: 'HIT.' }
  }
  if (roll < 60) return { dmg: 1, text: 'HIT.' }
  return { dmg: 0, text: 'ROUND SHORT. MISS.' }
}

function checkOutcome(tanks: Tank[], turn: number): Outcome {
  const us = live(tanks, 'US').length
  const en = live(tanks, 'EN').length
  if (us === 0 && en === 0) return 'STALEMATE'
  if (en === 0) return 'WIN'
  if (us === 0) return 'LOSE'
  if (turn >= MAX_TURNS) return 'STALEMATE'
  return null
}

type Dir = 'N' | 'S' | 'E' | 'W'
const DELTA: Record<Dir, { x: number; y: number }> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
}

function playerMove(s: State, dir: Dir): State {
  if (s.outcome || s.phase !== 'player') return s
  const sel = s.tanks.find((t) => t.id === s.sel)
  if (!sel || sel.hp <= 0 || sel.acted || sel.fuel <= 0) return s
  const d = DELTA[dir]
  const nx = sel.x + d.x
  const ny = sel.y + d.y
  const dunes = new Set(s.dunes)
  const log: string[] = []
  if (
    nx < 0 ||
    nx >= N ||
    ny < 0 ||
    ny >= N ||
    dunes.has(key(nx, ny)) ||
    s.tanks.some((t) => t.id !== sel.id && t.hp > 0 && t.x === nx && t.y === ny)
  ) {
    return { ...s, log: [...s.log.slice(-6), `TANK ${sel.id + 1}: PATH BLOCKED.`] }
  }
  const tanks = s.tanks.map((t) =>
    t.id === sel.id ? { ...t, x: nx, y: ny, fuel: t.fuel - 1, acted: true } : t,
  )
  log.push(`TANK ${sel.id + 1} ROLLS ${dir}. FUEL ${sel.fuel - 1}.`)
  return advancePhase({ ...s, tanks, log: [...s.log.slice(-6), ...log] })
}

function playerFire(s: State, targetId: number): State {
  if (s.outcome || s.phase !== 'player') return s
  const sel = s.tanks.find((t) => t.id === s.sel)
  const tgt = s.tanks.find((t) => t.id === targetId)
  if (!sel || !tgt || sel.hp <= 0 || sel.acted) return s
  const dunes = new Set(s.dunes)
  if (!canFire(sel, tgt, dunes)) {
    return { ...s, log: [...s.log.slice(-6), `TANK ${sel.id + 1}: NO SHOT ON ENEMY ${tgt.id - 1}.`] }
  }
  const res = shoot(sel, tgt)
  const tanks = s.tanks.map((t) => {
    if (t.id === sel.id) return { ...t, acted: true }
    if (t.id === tgt.id) return { ...t, hp: Math.max(0, t.hp - res.dmg) }
    return t
  })
  const log = [`TANK ${sel.id + 1} FIRES ON ENEMY ${tgt.id - 1}. ${res.text}`]
  const killed = tanks.find((t) => t.id === tgt.id)!
  if (killed.hp <= 0) log.push(`ENEMY ${tgt.id - 1} BREWED UP.`)
  return advancePhase({ ...s, tanks, log: [...s.log.slice(-6), ...log] })
}

function playerHold(s: State): State {
  if (s.outcome || s.phase !== 'player') return s
  const sel = s.tanks.find((t) => t.id === s.sel)
  if (!sel || sel.hp <= 0 || sel.acted) return s
  const tanks = s.tanks.map((t) => (t.id === sel.id ? { ...t, acted: true } : t))
  return advancePhase({ ...s, tanks, log: [...s.log.slice(-6), `TANK ${sel.id + 1} HOLDS POSITION.`] })
}

// After a player tank acts: pick the next un-acted live US tank, or if all have
// acted, hand the turn to the enemy.
function advancePhase(s: State): State {
  const outcome = checkOutcome(s.tanks, s.turn)
  if (outcome) return { ...s, outcome, log: [...s.log, outcomeLine(outcome)] }
  const pending = live(s.tanks, 'US').filter((t) => !t.acted)
  if (pending.length > 0) {
    return { ...s, sel: pending[0]!.id }
  }
  return enemyTurn(s)
}

// The enemy column: each live enemy tank fires if it has a shot, otherwise
// closes one square toward the nearest US tank (chebyshev greedy).
function enemyTurn(s: State): State {
  let tanks = s.tanks.map((t) => ({ ...t }))
  const dunes = new Set(s.dunes)
  const log: string[] = ['-- ENEMY COLUMN ACTS --']
  for (const en of tanks.filter((t) => t.side === 'EN' && t.hp > 0)) {
    const targets = tanks.filter((t) => t.side === 'US' && t.hp > 0)
    if (targets.length === 0) break
    // Prefer to fire.
    const shootable = targets
      .filter((t) => canFire(en, t, dunes))
      .sort((a, b) => cheb(en, a) - cheb(en, b))
    if (shootable.length > 0) {
      const tgt = shootable[0]!
      const res = shoot(en, tgt)
      const ref = tanks.find((t) => t.id === tgt.id)!
      ref.hp = Math.max(0, ref.hp - res.dmg)
      log.push(`ENEMY ${en.id - 1} FIRES ON TANK ${tgt.id + 1}. ${res.text}`)
      if (ref.hp <= 0) log.push(`TANK ${tgt.id + 1} KNOCKED OUT.`)
      continue
    }
    // Otherwise advance toward the nearest US tank.
    const near = targets.slice().sort((a, b) => cheb(en, a) - cheb(en, b))[0]!
    const dx = Math.sign(near.x - en.x)
    const dy = Math.sign(near.y - en.y)
    const cand: Array<{ x: number; y: number }> = [
      { x: en.x + dx, y: en.y + dy },
      { x: en.x + dx, y: en.y },
      { x: en.x, y: en.y + dy },
    ]
    for (const c of cand) {
      if (
        c.x < 0 ||
        c.x >= N ||
        c.y < 0 ||
        c.y >= N ||
        (c.x === en.x && c.y === en.y) ||
        dunes.has(key(c.x, c.y)) ||
        tanks.some((t) => t.id !== en.id && t.hp > 0 && t.x === c.x && t.y === c.y)
      )
        continue
      en.x = c.x
      en.y = c.y
      log.push(`ENEMY ${en.id - 1} ADVANCES TO ${c.x},${c.y}.`)
      break
    }
  }
  // Reset acted flags; refuel nothing (enemy does not use fuel).
  tanks = tanks.map((t) => ({ ...t, acted: false }))
  const outcome = checkOutcome(tanks, s.turn + 1)
  const base: State = {
    ...s,
    tanks,
    turn: s.turn + 1,
    phase: 'player',
    sel: live(tanks, 'US')[0]?.id ?? s.sel,
    log: [...s.log.slice(-4), ...log],
  }
  if (outcome) return { ...base, outcome, log: [...base.log, outcomeLine(outcome)] }
  return base
}

function outcomeLine(o: Outcome): string {
  if (o === 'WIN') return 'WOPR: ENEMY COLUMN DESTROYED. ENGAGEMENT WON.'
  if (o === 'LOSE') return 'WOPR: ARMOR LOST. ENGAGEMENT FAILED.'
  if (o === 'STALEMATE') return 'WOPR: FUEL EXHAUSTED. STANDOFF. STALEMATE.'
  return ''
}

const DIRS: { d: Dir; k: string; label: string }[] = [
  { d: 'N', k: 'W', label: 'NORTH' },
  { d: 'S', k: 'S', label: 'SOUTH' },
  { d: 'W', k: 'A', label: 'WEST' },
  { d: 'E', k: 'D', label: 'EAST' },
]

function DesertWarfare({ onExit }: GameProps) {
  const [s, setS] = useState<State>(initState)
  const move = useCallback((d: Dir) => setS((p) => playerMove(p, d)), [])
  const fire = useCallback((id: number) => setS((p) => playerFire(p, id)), [])
  const hold = useCallback(() => setS((p) => playerHold(p)), [])
  const reset = useCallback(() => setS(initState()), [])
  const cycle = useCallback(() => {
    setS((p) => {
      const avail = live(p.tanks, 'US').filter((t) => !t.acted)
      if (avail.length === 0) return p
      const idx = avail.findIndex((t) => t.id === p.sel)
      const next = avail[(idx + 1) % avail.length]!
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
      if (k === 'h') {
        e.preventDefault()
        hold()
        return
      }
      if (k === 'f') {
        e.preventDefault()
        // fire on the first enemy with a shot
        const sel = s.tanks.find((t) => t.id === s.sel)
        if (sel) {
          const dunes = new Set(s.dunes)
          const tgt = s.tanks.find((t) => t.side === 'EN' && canFire(sel, t, dunes))
          if (tgt) fire(tgt.id)
        }
        return
      }
      const found = DIRS.find((x) => x.k.toLowerCase() === k)
      if (found) {
        e.preventDefault()
        move(found.d)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s, move, fire, hold, reset, cycle])

  const dunes = new Set(s.dunes)
  const sel = s.tanks.find((t) => t.id === s.sel)
  const firable = sel
    ? s.tanks.filter((t) => t.side === 'EN' && canFire(sel, t, dunes))
    : []

  const glyph = (x: number, y: number): { ch: string; cls?: string } => {
    const t = s.tanks.find((tt) => tt.hp > 0 && tt.x === x && tt.y === y)
    if (t) {
      if (t.side === 'US') return { ch: String(t.id + 1), cls: t.id === s.sel ? 'wg-amber' : undefined }
      return { ch: 'E', cls: 'wg-red' }
    }
    if (dunes.has(key(x, y))) return { ch: '^', cls: 'wg-dim' }
    return { ch: '·', cls: 'wg-dim' }
  }

  const usTanks = s.tanks.filter((t) => t.side === 'US')
  const enLeft = live(s.tanks, 'EN').length

  return (
    <div className="wg-screen" data-testid="game-desert-warfare">
      <div className="wg-out" style={{ gap: '0.3rem' }}>
        <div className="wg-amber wg-big">DESERT WARFARE</div>
        <div className="wg-dim">
          WOPR ARMOR SKIRMISH. TURN {s.turn}/{MAX_TURNS}. 1-2 = YOUR TANKS. E =
          ENEMY. ^ = DUNE (BLOCKS SIGHT).
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
              ENEMY TANKS: <span className="wg-red">{enLeft}/2</span>
            </div>
            <div className="wg-dim">SELECTED: TANK {s.sel + 1}</div>
            {usTanks.map((t) => (
              <div key={t.id} className={t.hp <= 0 ? 'wg-dim' : t.id === s.sel ? 'wg-amber' : undefined}>
                T{t.id + 1}: {t.hp <= 0 ? 'KNOCKED OUT' : `ARMOR ${'█'.repeat(t.hp)}${'░'.repeat(3 - t.hp)} FUEL ${t.fuel}`}
                {t.acted && t.hp > 0 ? ' [ACTED]' : ''}
              </div>
            ))}
            <div className={firable.length > 0 ? 'wg-amber' : 'wg-dim'} style={{ marginTop: '0.3rem' }}>
              {firable.length > 0 ? `>>> ${firable.length} TARGET(S) IN RANGE <<<` : 'NO TARGET IN RANGE'}
            </div>
          </div>
        </div>

        <div className="wg-log" style={{ height: '6rem', marginTop: '0.4rem' }}>
          {s.log.slice(-6).map((l, i) => (
            <span
              key={i}
              className={l.includes('KNOCKED') || l.includes('LOST') || l.includes('FIRES ON TANK') ? 'crit' : undefined}
            >
              {l}
            </span>
          ))}
        </div>

        {!s.outcome ? (
          <div className="wg-opts" data-testid="dw-controls">
            <button type="button" className="wg-opt" onClick={cycle}>
              &gt; [TAB] SELECT NEXT TANK
            </button>
            {DIRS.map((dd) => (
              <button key={dd.d} type="button" className="wg-opt" onClick={() => move(dd.d)}>
                &gt; [{dd.k}] MOVE {dd.label}
              </button>
            ))}
            {firable.map((t) => (
              <button key={t.id} type="button" className="wg-opt wg-amber" onClick={() => fire(t.id)}>
                &gt; [F] FIRE ON ENEMY {t.id - 1} (RNG {sel ? cheb(sel, t) : '-'})
              </button>
            ))}
            <button type="button" className="wg-opt" onClick={hold}>
              &gt; [H] HOLD / PASS TANK
            </button>
          </div>
        ) : (
          <div className="wg-opts">
            <div
              className={
                s.outcome === 'WIN' ? 'wg-big wg-amber' : s.outcome === 'LOSE' ? 'wg-big wg-red' : 'wg-big'
              }
            >
              {s.outcome === 'WIN'
                ? 'YOU WIN. COLUMN DESTROYED.'
                : s.outcome === 'LOSE'
                  ? 'YOU LOSE. ARMOR KNOCKED OUT.'
                  : 'STALEMATE. STANDOFF IN THE SAND.'}
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

export const entry: GameEntry = { id: 'DESERT WARFARE', Component: DesertWarfare }
