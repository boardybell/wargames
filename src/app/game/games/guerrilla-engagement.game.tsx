// GUERRILLA ENGAGEMENT. A three-trooper patrol against a hidden guerrilla cell
// on an 8x8 grid. Rules live in engines/guerrilla-engagement.ts (one contact
// phase per command, HOLD observation bonus, rejected invalid moves, typed
// victory reasons); this module is presentation, records and input.
// Design: docs/games-design-review.md §10.
import { useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, Bar, GameReport, GameResult, GameShell, Panel } from './ui/GameShell'
import { GridBoard } from './ui/boards/GridBoard'
import { cue, fmtWLD, newSeed, useEventLog, useGameKeys, useGameRecords, type WLD } from './hooks'
import {
  ALERT,
  CELL_SIZE,
  DELTA,
  HOLD_SIGHT,
  HOLD_TARGET,
  MAX_HP,
  MAX_TURNS,
  N,
  SIGHT,
  TROOP_RANGE,
  cellName,
  cheb,
  command,
  cycle,
  gName,
  initState,
  key,
  moveBlock,
  select,
  tName,
  type EndReason,
  type GEvent,
  type GState,
  type Move,
} from './engines/guerrilla-engagement'
import './styles/tactical.css'

const COLS = 'ABCDEFGH'.split('')
const ROWS = Array.from({ length: N }, (_, i) => String(N - i))

const MOVES: { m: Move; k: string; label: string; cls: string }[] = [
  { m: 'N', k: 'W', label: 'N', cls: 'ge-n' },
  { m: 'W', k: 'A', label: 'W', cls: 'ge-w' },
  { m: 'HOLD', k: 'H', label: 'HOLD', cls: 'ge-h' },
  { m: 'E', k: 'D', label: 'E', cls: 'ge-e' },
  { m: 'S', k: 'S', label: 'S', cls: 'ge-s' },
]

const END_COPY: Record<EndReason, { outcome: 'win' | 'lose' | 'draw'; head: string }> = {
  objective: { outcome: 'win', head: 'OBJECTIVE HELD' },
  elimination: { outcome: 'win', head: 'CELL ELIMINATED' },
  'patrol-lost': { outcome: 'lose', head: 'PATROL LOST' },
  time: { outcome: 'draw', head: 'TIME EXPIRED' },
}

function endReason(s: GState): string {
  const left = s.cell.filter((g) => g.hp > 0).length
  switch (s.end) {
    case 'objective':
      return `A TROOPER HELD THE OBJECTIVE FOR ${HOLD_TARGET} CONSECUTIVE COMMANDS. ${left} HOSTILE${left === 1 ? '' : 'S'} STILL IN THE FIELD.`
    case 'elimination':
      return `ALL ${CELL_SIZE} HOSTILES ELIMINATED.`
    case 'patrol-lost':
      return 'ALL THREE TROOPERS ARE DOWN.'
    case 'time':
      return `${MAX_TURNS} COMMANDS USED WITHOUT HOLDING THE OBJECTIVE OR CLEARING THE CELL.`
    default:
      return ''
  }
}

const evKind = (e: GEvent): 'info' | 'good' | 'bad' | 'warn' => {
  if (e.kind === 'shot') return e.shot!.attacker.startsWith('T') ? 'good' : 'bad'
  if (e.kind === 'down') return e.text.startsWith('G') ? 'good' : 'bad'
  if (e.kind === 'spot' || e.kind === 'objective') return 'warn'
  return 'info'
}

function GuerrillaEngagement({ onExit }: GameProps) {
  const rec = useGameRecords('guerrilla-engagement')
  const log = useEventLog()
  const [s, setS] = useState<GState>(() => initState(newSeed()))
  const [session, setSession] = useState(() => `ge-${Date.now()}`)
  const [announce, setAnnounce] = useState('')

  const restart = (seed = newSeed()): void => {
    setS(initState(seed))
    setSession(`ge-${Date.now()}-${seed}`)
    log.reset()
    setAnnounce('')
  }

  const order = (m: Move): void => {
    const r = command(s, m)
    if (!r.ok) {
      cue.deny()
      setAnnounce(`${tName({ id: s.sel })} CANNOT MOVE: ${r.reason}. NO TIME SPENT.`)
      log.push({ text: `${tName({ id: s.sel })} ${m === 'HOLD' ? 'HOLD' : `MOVE ${m}`} REJECTED: ${r.reason}. NO TIME SPENT.`, kind: 'warn' })
      return
    }
    const ev = r.events.map((e) => ({ text: e.text, kind: evKind(e) }))
    const n = r.state
    if (n.end) {
      const c = END_COPY[n.end]
      ev.push({ text: `${c.head}. ${endReason(n)}`, kind: c.outcome === 'win' ? 'good' : c.outcome === 'lose' ? 'bad' : 'warn' })
      rec.recordOnce(session, () => {
        rec.tally('record', c.outcome)
        rec.tally(`by:${n.end}`, c.outcome)
        if (c.outcome === 'win') rec.update<number>('best', (p) => (p === undefined ? s.turn : Math.min(p, s.turn)))
      })
      if (c.outcome === 'win') cue.win()
      else if (c.outcome === 'lose') cue.lose()
      else cue.draw()
    } else if (r.events.some((e) => e.kind === 'shot')) cue.hit()
    else if (r.events.some((e) => e.kind === 'spot')) cue.tick()
    else cue.select()
    log.push(...ev)
    setAnnounce(ev.map((e) => e.text).join(' '))
    setS(n)
  }
  const pick = (id: number): void => {
    const n = select(s, id)
    if (n !== s && n.sel !== s.sel) cue.select()
    setS(n)
  }

  useGameKeys((k) => {
    if (s.end) return false
    const kk = k.toLowerCase()
    if (kk === '[' || kk === 'q' || kk === ']' || kk === 'e') {
      const n = cycle(s, kk === '[' || kk === 'q' ? -1 : 1)
      if (n.sel !== s.sel) cue.select()
      setS(n)
      return true
    }
    if (kk === '1' || kk === '2' || kk === '3') {
      pick(Number(kk) - 1)
      return true
    }
    const mv = MOVES.find((x) => x.k.toLowerCase() === kk)
    if (mv) {
      order(mv.m)
      return true
    }
    return false
  })

  const obs = new Set(s.observed)
  const sel = s.troops.find((t) => t.id === s.sel && t.hp > 0)
  const legal = new Map<string, Move>()
  if (sel && !s.end)
    for (const m of ['N', 'S', 'E', 'W'] as const)
      if (!moveBlock(s, m)) legal.set(key(sel.x + DELTA[m].x, sel.y + DELTA[m].y), m)
  const liveT = s.troops.filter((t) => t.hp > 0)
  const down = s.cell.filter((g) => g.hp <= 0).length
  const visible = s.cell.filter((g) => g.hp > 0 && obs.has(key(g.x, g.y)))
  const ghosts = s.cell.filter((g) => g.hp > 0 && g.seen && !obs.has(key(g.seen.x, g.seen.y)) && !obs.has(key(g.x, g.y)))
  const onObj = liveT.find((t) => t.x === s.obj.x && t.y === s.obj.y)
  const record = rec.get<WLD | undefined>('record', undefined)
  const best = rec.get<number | undefined>('best', undefined)
  const turnShown = Math.min(s.turn, MAX_TURNS)

  const onCell = (x: number, y: number): void => {
    if (s.end) return
    const t = liveT.find((tt) => tt.x === x && tt.y === y)
    if (t) return pick(t.id)
    const m = legal.get(key(x, y))
    if (m) return order(m)
    cue.deny()
  }

  const cellLabel = (x: number, y: number): string => {
    const p = [cellName({ x, y })]
    const t = liveT.find((tt) => tt.x === x && tt.y === y)
    if (t) p.push(`TROOPER ${t.id + 1}, HEALTH ${t.hp} OF ${MAX_HP}${t.id === s.sel ? ', SELECTED' : ''}`)
    const g = visible.find((gg) => gg.x === x && gg.y === y)
    if (g) p.push(`HOSTILE ${g.id + 1}, HEALTH ${g.hp} OF ${MAX_HP}`)
    const gh = ghosts.filter((gg) => gg.seen!.x === x && gg.seen!.y === y)
    for (const gg of gh) p.push(`HOSTILE ${gg.id + 1} LAST SEEN HERE ON COMMAND ${gg.seen!.turn}`)
    if (x === s.obj.x && y === s.obj.y) p.push(`OBJECTIVE, HOLD ${s.held} OF ${HOLD_TARGET}`)
    if (legal.has(key(x, y))) p.push('MOVE HERE')
    p.push(obs.has(key(x, y)) ? 'OBSERVED' : 'NOT OBSERVED')
    return p.join(', ')
  }

  const cellContent = (x: number, y: number) => {
    const t = liveT.find((tt) => tt.x === x && tt.y === y)
    const g = visible.find((gg) => gg.x === x && gg.y === y)
    const gh = ghosts.find((gg) => gg.seen!.x === x && gg.seen!.y === y)
    const isObj = x === s.obj.x && y === s.obj.y
    return (
      <>
        {isObj && (t || g) && <span className="tg-obj">OBJ</span>}
        {t ? (
          <span className={`tg-unit mine${t.id === s.sel ? ' is-sel' : ''}${t.hp < MAX_HP ? ' hurt' : ''}`}>{t.id + 1}</span>
        ) : g ? (
          <span className={`tg-unit theirs${g.hp < MAX_HP ? ' hurt' : ''}`}>
            <span>{gName(g)}</span>
          </span>
        ) : gh ? (
          <span className="tg-unit ghost" title="Last known position">
            <span>{gName(gh)}?</span>
            <span>T{gh.seen!.turn}</span>
          </span>
        ) : isObj ? (
          <span className="tg-objx">X</span>
        ) : null}
      </>
    )
  }

  const endCopy = s.end ? END_COPY[s.end] : null
  const side = endCopy ? (
    <GameResult
      outcome={endCopy.outcome}
      headline={endCopy.head}
      reason={endReason(s)}
      metrics={[
        { label: 'COMMANDS', value: `${s.turn - 1}/${MAX_TURNS}` },
        { label: 'TROOPERS', value: `${liveT.length}/3` },
        { label: 'HOSTILES DOWN', value: `${down}/${CELL_SIZE}` },
      ]}
      testId="ge-result"
    >
      <Action variant="primary" onClick={() => restart()} testId="ge-again" autoFocus>
        NEW PATROL
      </Action>
      <Action onClick={() => restart(s.seed)}>RETRY SAME MAP</Action>
    </GameResult>
  ) : (
    <Panel title={sel ? `ORDERS FOR TROOPER ${sel.id + 1} AT ${cellName(sel)}` : 'ORDERS'}>
      <div className="ge-pad" role="group" aria-label="Move orders" data-testid="ge-controls">
        {MOVES.map((mv) => {
          const why = moveBlock(s, mv.m)
          return (
            <span key={mv.m} className={mv.cls}>
              <Action
                onClick={() => order(mv.m)}
                disabled={!!why}
                reason={why ?? undefined}
                shortcut={mv.k}
                                testId={`ge-${mv.m.toLowerCase()}`}
                label={mv.m === 'HOLD' ? `Hold: observation radius ${HOLD_SIGHT}` : `Move ${({ N: 'north', S: 'south', E: 'east', W: 'west' } as const)[mv.m as 'N']}`}
              >
                {mv.label}
              </Action>
            </span>
          )
        })}
      </div>
      <p className="tg-note">
        HOLD WIDENS THIS TROOPER&apos;S OBSERVATION FROM {SIGHT} TO {HOLD_SIGHT} SQUARES FOR THE COMMAND. SELECTING A TROOPER COSTS NO TIME. BLOCKED MOVES ARE REJECTED AND COST NO TIME.
      </p>
    </Panel>
  )

  return (
    <GameShell
      slug="guerrilla-engagement"
      title="GUERRILLA ENGAGEMENT"
      objective={`HOLD THE OBJECTIVE X FOR ${HOLD_TARGET} CONSECUTIVE COMMANDS OR ELIMINATE ALL ${CELL_SIZE} HOSTILES WITHIN ${MAX_TURNS} COMMANDS.`}
      phase={s.end ? 'ENGAGEMENT OVER' : `COMMAND ${turnShown}/${MAX_TURNS} · ORDERS FOR TROOPER ${s.sel + 1}`}
      phaseTone={s.end ? 'dim' : 'amber'}
      metrics={[
        { label: 'COMMAND', value: `${turnShown}/${MAX_TURNS}` },
        { label: 'OBJECTIVE HOLD', value: `${s.held}/${HOLD_TARGET}`, tone: s.held > 0 ? 'amber' : 'normal' },
        { label: 'HOSTILES DOWN', value: `${down}/${CELL_SIZE}` },
        { label: 'RECORD', value: fmtWLD(record), tone: 'dim' },
        { label: 'BEST WIN', value: best ? `${best} CMDS` : '—', tone: 'dim' },
      ]}
      help={
        <>
          <p>EACH COMMAND ORDERS ONE TROOPER: MOVE ONE SQUARE NORTH, SOUTH, EAST OR WEST, OR HOLD. THEN THE CELL MOVES AND ONE CONTACT PHASE RESOLVES.</p>
          <ul>
            <li>WIN: A TROOPER ENDS {HOLD_TARGET} CONSECUTIVE COMMANDS ON X (OBJECTIVE HOLD {HOLD_TARGET}/{HOLD_TARGET}), OR ALL {CELL_SIZE} HOSTILES ARE DOWN. LOSE: ALL THREE TROOPERS DOWN. DRAW: {MAX_TURNS} COMMANDS PASS.</li>
            <li>OBSERVATION: EVERY TROOPER SEES {SIGHT} SQUARES (DIAGONALS COUNT 1). A HOLDING TROOPER SEES {HOLD_SIGHT} FOR THAT COMMAND. HATCHED SQUARES ARE NOT OBSERVED.</li>
            <li>INTEL: A RED G IS SEEN NOW. A DASHED &quot;G?&quot; IS A LAST KNOWN POSITION WITH THE COMMAND IT WAS SEEN ON; THE HOSTILE MAY HAVE MOVED.</li>
            <li>CONTACT: ONCE PER COMMAND, SIMULTANEOUSLY. EACH TROOPER FIRES AT THE NEAREST HOSTILE WITHIN {TROOP_RANGE}; EACH HOSTILE FIRES AT AN ADJACENT TROOPER. EVERY SHOT REMOVES 1 HEALTH. EVERY UNIT HAS {MAX_HP}.</li>
            <li>THE CELL HOLDS POSITION UNTIL A TROOPER COMES WITHIN {ALERT}, THEN CLOSES ONE SQUARE A COMMAND (DIAGONALS ALLOWED). NO TERRAIN OR COVER IS MODELLED.</li>
            <li>TURN LIMIT: THE FASTEST OBJECTIVE ROUTE TAKES 14 COMMANDS; {MAX_TURNS} LEAVES ROOM TO DETOUR OR HUNT THE CELL.</li>
            <li>KEYS: W/A/S/D MOVE · H HOLD · 1/2/3 SELECT TROOPER · [ ] OR Q/E CYCLE. ON THE MAP: CLICK A TROOPER TO SELECT, A MARKED SQUARE TO MOVE.</li>
          </ul>
        </>
      }
      onRestart={() => restart()}
      inProgress={!s.end && s.turn > 1}
      restartLabel="NEW PATROL"
      onExit={onExit}
      side={side}
      report={<GameReport events={log.events} />}
      announce={announce}
    >
      <div className="ge-layout">
        <GridBoard
          cols={N}
          rows={N}
          maxPx={520}
          className="tg-board ge-map"
          ariaLabel="Patrol map"
          testId="ge-map"
          colLabels={COLS}
          rowLabels={ROWS}
          label={cellLabel}
          onActivate={onCell}
          state={(x, y) => ({
            fog: !obs.has(key(x, y)),
            selected: !!sel && sel.x === x && sel.y === y,
            legal: legal.has(key(x, y)),
            inRange: !!sel && !s.end && cheb(sel, { x, y }) <= SIGHT,
            terrain: x === s.obj.x && y === s.obj.y ? 'objective' : undefined,
          })}
          cell={cellContent}
        />
        <div className="ge-beside">
          <div className="ge-hold" data-testid="ge-hold">
            OBJECTIVE HOLD <b>{s.held}/{HOLD_TARGET}</b>
            <div className="tg-card-line">
              X AT {cellName(s.obj)} · {onObj ? `TROOPER ${onObj.id + 1} ON X` : 'UNOCCUPIED'}
            </div>
          </div>
          <div className="tg-cards" role="group" aria-label="Troopers">
            {s.troops.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tg-card${t.hp <= 0 ? ' is-out' : ''}`}
                aria-pressed={t.id === s.sel && t.hp > 0}
                disabled={t.hp <= 0 || !!s.end}
                onClick={() => pick(t.id)}
                data-testid={`ge-trooper-${t.id + 1}`}
              >
                <span className="tg-card-head">
                  <span>TROOPER {t.id + 1}</span>
                  <span className="tg-card-line">{t.hp > 0 ? cellName(t) : 'DOWN'}</span>
                </span>
                <Bar label="HEALTH" value={t.hp} max={MAX_HP} tone={t.hp < MAX_HP ? 'red' : 'normal'} />
              </button>
            ))}
          </div>
          <ul className="tg-legend" aria-label="Legend">
            <li>
              <span className="tg-swatch" style={{ background: 'rgba(60,120,80,0.25)' }} /> OBSERVED
            </li>
            <li>
              <span className="tg-swatch" style={{ background: 'repeating-linear-gradient(45deg,#03080f 0 3px,#1c2c48 3px 6px)' }} /> NOT OBSERVED
            </li>
            <li>
              <span className="tg-swatch" style={{ border: '2px solid rgba(255,184,77,0.6)' }} /> SELECTED TROOPER&apos;S VIEW
            </li>
            <li>G = HOSTILE NOW · G? = LAST KNOWN</li>
          </ul>
        </div>
      </div>
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'GUERRILLA ENGAGEMENT', Component: GuerrillaEngagement }
