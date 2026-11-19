// FIGHTER COMBAT. A turn-based dogfight run by WOPR: you versus a hostile
// fighter on a 7x7 tactical grid. Each turn you point your nose (heading),
// then THROTTLE/CLIMB/DIVE to trade energy for position, or GUNS when the
// bandit sits in your forward cone at range. The enemy AI turns into you,
// manages its own energy, and fires when it owns the solution. Burn him down
// to WIN, eat too many rounds to LOSE, run both of you dry to STALEMATE.
import { useCallback, useEffect, useState } from 'react'
import type { GameEntry, GameProps } from './types'

const GRID = 7
// Eight compass headings, clockwise from north. Index is the heading.
const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const
const DIR_NAME = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

type Act = 'LEFT' | 'RIGHT' | 'THROTTLE' | 'CLIMB' | 'DIVE' | 'GUNS'
type Outcome = 'WIN' | 'LOSE' | 'STALEMATE' | null

interface Fighter {
  x: number
  y: number
  hdg: number // index into DIRS
  energy: number // airspeed/altitude pool, 0..10
  hp: number // integrity, 0..6
}

interface State {
  you: Fighter
  foe: Fighter
  turn: number
  outcome: Outcome
  log: string[]
}

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n

function initState(): State {
  return {
    you: { x: 1, y: 5, hdg: 1, energy: 6, hp: 6 },
    foe: { x: 5, y: 1, hdg: 5, energy: 6, hp: 6 },
    turn: 1,
    outcome: null,
    log: ['BANDIT ON RADAR. MERGE IN PROGRESS.'],
  }
}

// Angle off the attacker nose to the defender, in heading steps (0..4).
function offBore(att: Fighter, def: Fighter): number {
  const dx = def.x - att.x
  const dy = def.y - att.y
  if (dx === 0 && dy === 0) return 4
  let best = 8
  for (let h = 0; h < 8; h++) {
    const [hx, hy] = DIRS[h]!
    // dot-ish alignment: does this heading point at the target
    const aligned = Math.sign(hx) === Math.sign(dx) && Math.sign(hy) === Math.sign(dy)
    if (!aligned) continue
    const diff = Math.min((h - att.hdg + 8) % 8, (att.hdg - h + 8) % 8)
    if (diff < best) best = diff
  }
  if (best === 8) {
    // fall back to pure heading delta toward target bearing
    const bearing = bearingTo(att, def)
    best = Math.min((bearing - att.hdg + 8) % 8, (att.hdg - bearing + 8) % 8)
  }
  return best
}

function bearingTo(from: Fighter, to: Fighter): number {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  let best = 0
  let bd = 99
  for (let h = 0; h < 8; h++) {
    const [hx, hy] = DIRS[h]!
    const d = Math.abs(hx - dx) + Math.abs(hy - dy)
    if (d < bd) {
      bd = d
      best = h
    }
  }
  return best
}

const range = (a: Fighter, b: Fighter): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

// A clean gun solution: bandit in the forward cone (off-bore <=1) within 3.
function hasGuns(att: Fighter, def: Fighter): boolean {
  return offBore(att, def) <= 1 && range(att, def) <= 3 && range(att, def) >= 1
}

function advance(f: Fighter): Fighter {
  const [dx, dy] = DIRS[f.hdg]!
  return { ...f, x: clamp(f.x + dx, 0, GRID - 1), y: clamp(f.y + dy, 0, GRID - 1) }
}

// Apply one maneuver to a fighter, returning the new fighter. Pure.
function maneuver(f: Fighter, act: Act): Fighter {
  switch (act) {
    case 'LEFT':
      return advance({ ...f, hdg: (f.hdg + 7) % 8, energy: clamp(f.energy - 1, 0, 10) })
    case 'RIGHT':
      return advance({ ...f, hdg: (f.hdg + 1) % 8, energy: clamp(f.energy - 1, 0, 10) })
    case 'THROTTLE':
      // straight and fast: build energy, cover ground
      return advance(advance({ ...f, energy: clamp(f.energy + 2, 0, 10) }))
    case 'CLIMB':
      return { ...f, energy: clamp(f.energy + 3, 0, 10) }
    case 'DIVE':
      // trade altitude for a hard repositioning jump along heading
      return advance(advance(advance({ ...f, energy: clamp(f.energy - 2, 0, 10) })))
    case 'GUNS':
      return { ...f, energy: clamp(f.energy - 1, 0, 10) }
  }
}

// The enemy picks a maneuver: get guns if it can, else turn into you and
// keep energy honest.
function foeAct(foe: Fighter, you: Fighter): Act {
  if (hasGuns(foe, you) && foe.energy >= 1) return 'GUNS'
  if (foe.energy <= 1) return 'CLIMB'
  const want = bearingTo(foe, you)
  if (foe.hdg === want) {
    const r = range(foe, you)
    return r > 3 ? 'THROTTLE' : 'DIVE'
  }
  // turn the short way toward the target bearing
  const toLeft = (foe.hdg - want + 8) % 8
  const toRight = (want - foe.hdg + 8) % 8
  return toLeft <= toRight ? 'LEFT' : 'RIGHT'
}

function resolve(s: State, act: Act): State {
  if (s.outcome) return s
  const log: string[] = []
  const fAct = foeAct(s.foe, s.you)

  let you = maneuver(s.you, act)
  let foe = maneuver(s.foe, fAct)

  // Gunnery is checked AFTER both maneuver, from the post-move geometry.
  let youHp = you.hp
  let foeHp = foe.hp

  if (act === 'GUNS') {
    if (hasGuns(you, foe) && you.energy >= 0) {
      const r = range(you, foe)
      const dmg = r <= 1 ? 2 : 1
      foeHp = clamp(foeHp - dmg, 0, 6)
      log.push(`GUNS GUNS GUNS. HITS ON BANDIT (${dmg}).`)
    } else {
      log.push('TRIGGER DOWN. NO SOLUTION. ROUNDS WASTED.')
    }
  } else {
    log.push(`YOU: ${act}. HDG ${DIR_NAME[you.hdg]}.`)
  }

  if (fAct === 'GUNS') {
    if (hasGuns(foe, you)) {
      const r = range(foe, you)
      const dmg = r <= 1 ? 2 : 1
      youHp = clamp(youHp - dmg, 0, 6)
      log.push(`WARNING: BANDIT GUNS. YOU TAKE HITS (${dmg}).`)
    } else {
      log.push('BANDIT FIRES WIDE.')
    }
  } else {
    log.push(`BANDIT: ${fAct}.`)
  }

  you = { ...you, hp: youHp }
  foe = { ...foe, hp: foeHp }

  let outcome: Outcome = null
  if (foe.hp <= 0 && you.hp <= 0) outcome = 'STALEMATE'
  else if (foe.hp <= 0) outcome = 'WIN'
  else if (you.hp <= 0) outcome = 'LOSE'
  else if (s.turn >= 24) outcome = 'STALEMATE'
  else if (you.energy <= 0 && foe.energy <= 0) {
    // both bled out of energy: no one can press the fight
    outcome = 'STALEMATE'
  }

  if (outcome === 'WIN') log.push('SPLASH ONE. BANDIT DESTROYED.')
  else if (outcome === 'LOSE') log.push('EJECT EJECT. YOU ARE DOWN.')
  else if (outcome === 'STALEMATE') log.push('FUEL AND AMMO SPENT. FIGHT BROKEN OFF.')

  return {
    you,
    foe,
    turn: s.turn + 1,
    outcome,
    log: [...s.log.slice(-5), ...log],
  }
}

function Bar({ label, value, max, amber }: { label: string; value: number; max: number; amber?: boolean }) {
  const cells = Array.from({ length: max }, (_, i) => i < value)
  return (
    <div style={{ display: 'flex', gap: '0.6ch', alignItems: 'baseline' }}>
      <span className="wg-dim" style={{ width: '8ch', display: 'inline-block' }}>
        {label}
      </span>
      <span className={amber ? 'wg-amber' : undefined}>
        {cells.map((on) => (on ? '█' : '░')).join('')}
      </span>
      <span className="wg-dim">
        {value}/{max}
      </span>
    </div>
  )
}

const ACTS: { act: Act; key: string; desc: string }[] = [
  { act: 'LEFT', key: 'A', desc: 'BANK LEFT' },
  { act: 'RIGHT', key: 'D', desc: 'BANK RIGHT' },
  { act: 'THROTTLE', key: 'W', desc: 'THROTTLE UP (ENERGY ++)' },
  { act: 'CLIMB', key: 'C', desc: 'CLIMB (ENERGY +++)' },
  { act: 'DIVE', key: 'X', desc: 'DIVE (CLOSE FAST)' },
  { act: 'GUNS', key: 'F', desc: 'GUNS' },
]

function FighterCombat({ onExit }: GameProps) {
  const [s, setS] = useState<State>(initState)

  const act = useCallback(
    (a: Act) => setS((prev) => resolve(prev, a)),
    [],
  )
  const reset = useCallback(() => setS(initState()), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase()
      if (s.outcome) {
        if (k === 'enter' || k === ' ') reset()
        return
      }
      const found = ACTS.find((x) => x.key.toLowerCase() === k)
      if (found) {
        e.preventDefault()
        act(found.act)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s.outcome, act, reset])

  const youGuns = hasGuns(s.you, s.foe)
  const foeGuns = hasGuns(s.foe, s.you)

  const cell = (x: number, y: number): string => {
    if (s.you.x === x && s.you.y === y && s.foe.x === x && s.foe.y === y) return '#'
    if (s.you.x === x && s.you.y === y) return 'A'
    if (s.foe.x === x && s.foe.y === y) return 'V'
    return '·'
  }

  return (
    <div className="wg-screen" data-testid="game-fighter-combat">
      <div className="wg-out" style={{ gap: '0.3rem' }}>
        <div className="wg-amber wg-big">FIGHTER COMBAT</div>
        <div className="wg-dim">
          WOPR AIR COMBAT SIMULATION. TURN {s.turn}. A = YOU. V = BANDIT.
        </div>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
          <pre style={{ margin: 0, lineHeight: 1.2, letterSpacing: '0.4ch' }}>
            {Array.from({ length: GRID }, (_, y) =>
              Array.from({ length: GRID }, (_, x) => cell(x, y)).join(' '),
            ).join('\n')}
          </pre>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div className="wg-dim">YOUR SHIP</div>
            <Bar label="INTEG" value={s.you.hp} max={6} />
            <Bar label="ENERGY" value={s.you.energy} max={10} />
            <div>
              HDG <span className="wg-amber">{DIR_NAME[s.you.hdg]}</span>{'  '}
              RNG <span className="wg-amber">{range(s.you, s.foe)}</span>
            </div>
            <div className={youGuns ? 'wg-amber' : 'wg-dim'}>
              {youGuns ? '>>> GUN SOLUTION: FIRE <<<' : 'NO GUN SOLUTION'}
            </div>
            <div className="wg-dim" style={{ marginTop: '0.4rem' }}>
              BANDIT
            </div>
            <Bar label="INTEG" value={s.foe.hp} max={6} amber />
            <Bar label="ENERGY" value={s.foe.energy} max={10} amber />
            <div className={foeGuns ? 'wg-red' : 'wg-dim'}>
              {foeGuns ? '!!! BANDIT HAS SOLUTION !!!' : 'BANDIT OFF YOUR SIX'}
            </div>
          </div>
        </div>

        <div className="wg-log" style={{ height: '6rem', marginTop: '0.4rem' }}>
          {s.log.slice(-6).map((l, i) => (
            <span key={i} className={l.includes('WARNING') || l.includes('EJECT') ? 'crit' : undefined}>
              {l}
            </span>
          ))}
        </div>

        {!s.outcome ? (
          <div className="wg-opts" data-testid="fc-controls">
            {ACTS.map((a) => (
              <button
                key={a.act}
                type="button"
                className={a.act === 'GUNS' && youGuns ? 'wg-opt wg-amber' : 'wg-opt'}
                onClick={() => act(a.act)}
              >
                &gt; [{a.key}] {a.desc}
              </button>
            ))}
          </div>
        ) : (
          <div className="wg-opts">
            <div
              className={s.outcome === 'WIN' ? 'wg-big wg-amber' : s.outcome === 'LOSE' ? 'wg-big wg-red' : 'wg-big'}
            >
              {s.outcome === 'WIN'
                ? 'YOU WIN. BANDIT SPLASHED.'
                : s.outcome === 'LOSE'
                  ? 'YOU LOSE. AIRCRAFT DOWN.'
                  : 'STALEMATE. BOTH FIGHTERS WINCHESTER.'}
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

export const entry: GameEntry = { id: 'FIGHTER COMBAT', Component: FighterCombat }
