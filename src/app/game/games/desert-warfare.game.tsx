// DESERT WARFARE. Two blue tanks against WOPR's two red tanks on a 9x9 desert.
// Rules live in engines/desert-warfare.ts (symmetric line of sight, playable
// final round, TIME LIMIT vs FUEL EXHAUSTED, path-searching enemy, seeded dune
// fields); this module is presentation, records and input.
// Design: docs/games-design-review.md §11.
import { useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, Bar, GameReport, GameResult, GameShell, Panel, Segmented } from './ui/GameShell'
import { GridBoard } from './ui/boards/GridBoard'
import { cue, fmtWLD, newSeed, useEventLog, useGameKeys, useGameRecords, usePhone, type WLD } from './hooks'
import {
  DELTA,
  FUEL,
  LAYOUTS,
  MAX_ARMOR,
  MAX_ROUNDS,
  N,
  RANGE,
  act,
  cellName,
  cheb,
  fireBlock,
  hitChance,
  initState,
  key,
  moveBlock,
  reachable,
  selectTank,
  selectTarget,
  selected,
  tankName,
  type DEvent,
  type DState,
  type Dir,
  type EndReason,
  type PlayerAction,
  type Tank,
} from './engines/desert-warfare'
import './styles/tactical.css'

const COLS = 'ABCDEFGHJ'.split('')
const ROWS = Array.from({ length: N }, (_, i) => String(N - i))

const DIRS: { d: Dir; k: string; label: string; cls: string }[] = [
  { d: 'N', k: 'W', label: 'N', cls: 'ge-n' },
  { d: 'W', k: 'A', label: 'W', cls: 'ge-w' },
  { d: 'E', k: 'D', label: 'E', cls: 'ge-e' },
  { d: 'S', k: 'S', label: 'S', cls: 'ge-s' },
]
const DIR_WORD: Record<Dir, string> = { N: 'north', S: 'south', E: 'east', W: 'west' }

const END_COPY: Record<EndReason, { outcome: 'win' | 'lose' | 'draw'; head: string; reason: (s: DState) => string }> = {
  destroyed: { outcome: 'win', head: 'COLUMN DESTROYED', reason: (s) => `BOTH RED TANKS DESTROYED IN ROUND ${s.round}.` },
  lost: { outcome: 'lose', head: 'ARMOR LOST', reason: (s) => `BOTH BLUE TANKS DESTROYED IN ROUND ${s.round}.` },
  time: { outcome: 'draw', head: 'TIME LIMIT', reason: () => `ROUND ${MAX_ROUNDS} COMPLETED WITH TANKS STILL FIGHTING ON BOTH SIDES.` },
  fuel: { outcome: 'draw', head: 'FUEL EXHAUSTED', reason: () => 'EVERY TANK IS OUT OF FUEL AND NO TANK HAS A SHOT. NOTHING CAN CHANGE.' },
}

const pct = (n: number): string => `${Math.round(n * 100)}%`
const chanceText = (r: number): string => {
  const h = hitChance(r)
  return r <= 2 ? `HIT 100% (${pct(h.heavy)} FOR 2)` : `HIT ${pct(h.hit)} FOR 1`
}
const evKind = (e: DEvent): 'info' | 'good' | 'bad' | 'warn' => {
  if (e.kind === 'destroyed') return e.side === 'EN' ? 'good' : 'bad'
  if (e.kind === 'fire') return e.dmg ? 'good' : 'info'
  if (e.kind === 'enemy' && e.dmg) return 'bad'
  if (e.kind === 'round') return 'warn'
  return 'info'
}

function Pips({ hp }: { hp: number }) {
  return (
    <span className="tg-pips" aria-hidden="true">
      {Array.from({ length: MAX_ARMOR }, (_, i) => (
        <i key={i} className={i < hp ? 'on' : undefined} />
      ))}
    </span>
  )
}

function DesertWarfare({ onExit }: GameProps) {
  const rec = useGameRecords('desert-warfare')
  const log = useEventLog()
  const phone = usePhone()
  const [s, setS] = useState<DState>(() => initState(LAYOUTS[0]!.id, newSeed()))
  const [session, setSession] = useState(() => `dw-${Date.now()}`)
  const [announce, setAnnounce] = useState('')
  const layout = LAYOUTS.find((l) => l.id === s.layout) ?? LAYOUTS[0]!

  const restart = (layoutId = s.layout): void => {
    const seed = newSeed()
    setS(initState(layoutId, seed))
    setSession(`dw-${Date.now()}-${seed}`)
    log.reset()
    setAnnounce('')
  }

  const run = (a: PlayerAction): void => {
    const r = act(s, a)
    if (!r.ok) {
      cue.deny()
      setAnnounce(`REJECTED: ${r.reason}.`)
      log.push({ text: `ORDER REJECTED: ${r.reason}. NO TIME SPENT.`, kind: 'warn' })
      return
    }
    const ev = r.events.map((e) => ({ text: e.text, kind: evKind(e) }))
    const n = r.state
    if (n.end) {
      const c = END_COPY[n.end]
      ev.push({ text: `${c.head}. ${c.reason(n)}`, kind: c.outcome === 'win' ? 'good' : c.outcome === 'lose' ? 'bad' : 'warn' })
      rec.recordOnce(session, () => {
        rec.tally(`record:${n.layout}`, c.outcome)
        if (c.outcome === 'win') rec.update<number>(`best:${n.layout}`, (p) => (p === undefined ? n.round : Math.min(p, n.round)))
      })
      if (c.outcome === 'win') cue.win()
      else if (c.outcome === 'lose') cue.lose()
      else cue.draw()
    } else if (r.events.some((e) => e.dmg)) cue.hit()
    else if (r.events.some((e) => e.kind === 'enemy')) cue.tick()
    else cue.select()
    log.push(...ev)
    setAnnounce(ev.map((e) => e.text).join(' '))
    setS(n)
  }
  const pickTank = (id: number): void => {
    const n = selectTank(s, id)
    if (n !== s) cue.select()
    setS(n)
  }
  const pickTarget = (id: number): void => {
    const n = selectTarget(s, id)
    if (n !== s) cue.select()
    setS(n)
  }

  const dunes = new Set(s.dunes)
  const me = selected(s)
  const enemies = s.tanks.filter((t) => t.side === 'EN')
  const blues = s.tanks.filter((t) => t.side === 'US')
  const liveEnemies = enemies.filter((t) => t.hp > 0)
  const target = liveEnemies.find((t) => t.id === s.target)
  const fireWhy = s.end
    ? 'ENGAGEMENT OVER'
    : !me || me.acted
      ? 'NO TANK READY'
      : !target
        ? 'NO TARGET'
        : fireBlock(me, target, dunes)
  const reach = new Map<string, Dir>()
  if (me && !s.end)
    for (const d of DIRS) if (!moveBlock(s, d.d)) reach.set(key(me.x + DELTA[d.d].x, me.y + DELTA[d.d].y), d.d)

  useGameKeys((k) => {
    if (s.end) return false
    const kk = k.toLowerCase()
    const d = DIRS.find((x) => x.k.toLowerCase() === kk)
    if (d) run({ type: 'move', dir: d.d })
    else if (kk === 'f') run({ type: 'fire' })
    else if (kk === 'h') run({ type: 'hold' })
    else if (kk === '1' || kk === '2') pickTank(Number(kk) - 1)
    else if (kk === 't') {
      const i = liveEnemies.findIndex((t) => t.id === s.target)
      const nx = liveEnemies[(i + 1) % Math.max(1, liveEnemies.length)]
      if (nx) pickTarget(nx.id)
    } else return false
    return true
  })

  const onCell = (x: number, y: number): void => {
    if (s.end) return
    const t = s.tanks.find((tt) => tt.hp > 0 && tt.x === x && tt.y === y)
    if (t?.side === 'US') return t.acted ? cue.deny() : pickTank(t.id)
    if (t?.side === 'EN') return pickTarget(t.id)
    const d = reach.get(key(x, y))
    if (d) return run({ type: 'move', dir: d })
    cue.deny()
  }

  const cellLabel = (x: number, y: number): string => {
    const p = [cellName({ x, y })]
    const t = s.tanks.find((tt) => tt.hp > 0 && tt.x === x && tt.y === y)
    if (t)
      p.push(
        `${t.side === 'US' ? 'BLUE TANK' : 'RED TANK'} ${tankName(t)}, ARMOR ${t.hp} OF ${MAX_ARMOR}, FUEL ${t.fuel}${t.id === s.sel ? ', SELECTED' : ''}${t.id === s.target ? ', TARGETED' : ''}`,
      )
    if (dunes.has(key(x, y))) p.push('DUNE, BLOCKS SIGHT AND MOVEMENT')
    if (reach.has(key(x, y))) p.push('MOVE HERE')
    return p.join(', ')
  }

  const tankCell = (t: Tank) => (
    <span
      className={`tg-tank ${t.side === 'US' ? 'mine' : 'theirs'}${t.id === s.sel && !s.end ? ' is-sel' : ''}${t.acted ? ' is-acted' : ''}${t.id === s.target && t.side === 'EN' ? ' is-target' : ''}`}
    >
      <span>{tankName(t)}</span>
      <Pips hp={t.hp} />
    </span>
  )

  const overlay =
    me && !s.end ? (
      <svg className="tg-overlay" viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" aria-hidden="true">
        {liveEnemies.map((e) => {
          const why = fireBlock(me, e, dunes)
          const cls = why === null ? 'is-clear' : why.startsWith('OUT') ? 'is-far' : 'is-blocked'
          return (
            <line
              key={e.id}
              className={`dw-line ${cls}${e.id === s.target ? ' is-target' : ''}`}
              x1={me.x + 0.5}
              y1={me.y + 0.5}
              x2={e.x + 0.5}
              y2={e.y + 0.5}
            />
          )
        })}
      </svg>
    ) : null

  const record = rec.get<WLD | undefined>(`record:${s.layout}`, undefined)
  const best = rec.get<number | undefined>(`best:${s.layout}`, undefined)
  const endCopy = s.end ? END_COPY[s.end] : null
  const nextLayout = LAYOUTS[(LAYOUTS.findIndex((l) => l.id === s.layout) + 1) % LAYOUTS.length]!

  const decision = endCopy ? (
    <GameResult
      outcome={endCopy.outcome}
      headline={endCopy.head}
      reason={endCopy.reason(s)}
      metrics={[
        { label: 'ROUND', value: `${s.round}/${MAX_ROUNDS}` },
        { label: 'BLUE ARMOR', value: blues.reduce((a, t) => a + t.hp, 0) },
        { label: 'RED ARMOR', value: enemies.reduce((a, t) => a + t.hp, 0) },
      ]}
      testId="dw-result"
    >
      <Action variant="primary" onClick={() => restart()} testId="dw-again" autoFocus>
        RETRY {layout.name}
      </Action>
      <Action onClick={() => restart(nextLayout.id)}>NEXT: {nextLayout.name}</Action>
    </GameResult>
  ) : (
    <Panel title={me ? `ORDERS FOR ${tankName(me)} AT ${cellName(me)}` : 'ORDERS'}>
      <div className="ge-pad" role="group" aria-label="Move orders" data-testid="dw-controls">
        {DIRS.map((d) => {
          const why = moveBlock(s, d.d)
          return (
            <span key={d.d} className={d.cls}>
              <Action
                onClick={() => run({ type: 'move', dir: d.d })}
                disabled={!!why}
                reason={why ?? undefined}
                shortcut={d.k}
                testId={`dw-move-${d.d.toLowerCase()}`}
                label={`Move ${DIR_WORD[d.d]}, 1 fuel`}
              >
                {d.label}
              </Action>
            </span>
          )
        })}
        <span className="ge-h">
          <Action onClick={() => run({ type: 'hold' })} shortcut="H" testId="dw-hold" label="Hold position">
            HOLD
          </Action>
        </span>
      </div>
      <div className="gs-actions" style={{ marginTop: 8 }}>
        <Action
          variant="primary"
          onClick={() => run({ type: 'fire' })}
          disabled={!!fireWhy}
          reason={fireWhy ?? undefined}
          shortcut="F"
          testId="dw-fire"
        >
          FIRE ON {target ? tankName(target) : '—'}
        </Action>
      </div>
    </Panel>
  )

  const side = (
    <>
      {!s.end && <div className="dw-turn">ROUND {s.round}/{MAX_ROUNDS} · BOTH TANKS ACT, THEN WOPR</div>}
      <div className="tg-cards dw-cards" role="group" aria-label="Your tanks">
        {blues.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tg-card${t.hp <= 0 ? ' is-out' : ''}`}
            aria-pressed={t.id === s.sel && t.hp > 0 && !s.end}
            disabled={t.hp <= 0 || t.acted || !!s.end}
            onClick={() => pickTank(t.id)}
            data-testid={`dw-tank-${t.id + 1}`}
          >
            <span className="tg-card-head">
              <span>
                {tankName(t)} · {t.hp > 0 ? cellName(t) : 'DESTROYED'}
              </span>
              {t.hp > 0 && <span className={`tg-card-tag ${t.acted ? 'is-done' : 'is-ready'}`}>{t.acted ? 'ACTED' : 'READY'}</span>}
            </span>
            <Bar label="ARMOR" value={t.hp} max={MAX_ARMOR} tone={t.hp < MAX_ARMOR ? 'red' : 'normal'} />
            <Bar label="FUEL" value={t.fuel} max={FUEL} tone={t.fuel <= 2 ? 'amber' : 'normal'} />
          </button>
        ))}
      </div>
      {decision}
      <div className="tg-cards dw-cards" role="group" aria-label="Targets">
        {enemies.map((e) => {
          const r = me ? cheb(me, e) : null
          const why = me && e.hp > 0 ? fireBlock(me, e, dunes) : null
          return (
            <button
              key={e.id}
              type="button"
              className="tg-card is-enemy"
              aria-pressed={e.id === s.target && e.hp > 0}
              disabled={e.hp <= 0 || !!s.end}
              onClick={() => pickTarget(e.id)}
              data-testid={`dw-target-${e.id - 1}`}
            >
              <span className="tg-card-head">
                <span>
                  {tankName(e)} · {e.hp > 0 ? cellName(e) : 'DESTROYED'}
                </span>
                {e.id === s.target && e.hp > 0 && <span className="tg-card-tag is-ready">TARGET</span>}
              </span>
              <Bar label="ARMOR" value={e.hp} max={MAX_ARMOR} tone="red" />
              <span className="tg-card-line">
                FUEL {e.fuel}/{FUEL}
                {e.hp > 0 && r !== null && me ? ` · RANGE ${r} · ${why ?? chanceText(r)}` : ''}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )

  return (
    <GameShell
      slug="desert-warfare"
      title="DESERT WARFARE"
      objective={`DESTROY BOTH RED TANKS WITHIN ${MAX_ROUNDS} ROUNDS. BOTH TANKS ACT, THEN WOPR.`}
      phase={s.end ? 'ENGAGEMENT OVER' : `ROUND ${s.round}/${MAX_ROUNDS} · ${me ? `${tankName(me)} TO ACT` : 'WOPR ACTING'}`}
      phaseTone={s.end ? 'dim' : 'amber'}
      metrics={[
        { label: 'ROUND', value: `${s.round}/${MAX_ROUNDS}` },
        { label: 'RED TANKS', value: `${liveEnemies.length}/2`, tone: 'red' },
        { label: 'RECORD', value: fmtWLD(record), tone: 'dim', title: `Wins-losses-draws on ${layout.name}` },
        { label: 'BEST WIN', value: best ? `ROUND ${best}` : '—', tone: 'dim' },
      ]}
      toolbar={
        <Segmented
          label="MAP"
          value={s.layout}
          options={LAYOUTS.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(v) => restart(v)}
          testId="dw-layout"
        />
      }
      help={
        <>
          <p>EACH ROUND BOTH BLUE TANKS ACT ONCE, IN ANY ORDER, THEN WOPR&apos;S TWO RED TANKS ACT. ROUND {MAX_ROUNDS} IS PLAYED IN FULL.</p>
          <ul>
            <li>ACTIONS: MOVE ONE SQUARE NORTH, SOUTH, EAST OR WEST (1 FUEL), FIRE AT THE SELECTED TARGET, OR HOLD.</li>
            <li>FAIR DEFAULT: RED USES THE SAME RULES: FOUR-WAY MOVES, ONE SQUARE PER ACTION, {FUEL} FUEL, SAME GUN AND SIGHT.</li>
            <li>GUN RANGE {RANGE} SQUARES (DIAGONALS COUNT 1). RANGE 1–2 ALWAYS HITS: 85% FOR 2 ARMOR, OTHERWISE 1. RANGE 3–4 HITS 60% FOR 1. EVERY TANK HAS {MAX_ARMOR} ARMOR.</li>
            <li>SIGHT: A STRAIGHT LINE BETWEEN SQUARE CENTRES. A DUNE BLOCKS IT IF THE LINE CROSSES THE DUNE. A LINE THROUGH A CORNER IS BLOCKED ONLY WHEN DUNES SIT ON BOTH SIDES OF THAT CORNER. SIGHT IS ALWAYS MUTUAL.</li>
            <li>LINES ON THE MAP: AMBER = SHOT AVAILABLE, RED DASHED = BLOCKED BY DUNE, GREY DOTTED = OUT OF RANGE.</li>
            <li>RED FIRES WHEN IT HAS A SHOT (BEST HIT CHANCE FIRST), OTHERWISE DRIVES THE SHORTEST ROUTE AROUND DUNES TO A FIRING POSITION.</li>
            <li>ENDINGS: COLUMN DESTROYED (WIN), ARMOR LOST (LOSS), TIME LIMIT AFTER ROUND {MAX_ROUNDS} OR FUEL EXHAUSTED WHEN NO TANK CAN MOVE OR SHOOT (DRAWS).</li>
            <li>MAPS: CLASSIC IS THE ORIGINAL FIELD; THE OTHERS ARE FIXED SEEDED FIELDS, SO RECORDS COMPARE THE SAME TERRAIN. SHOT ROLLS VARY.</li>
            <li>KEYS: W/A/S/D MOVE · F FIRE · H HOLD · 1/2 SELECT TANK · T NEXT TARGET. ON THE MAP: CLICK A BLUE TANK, A RED TANK TO TARGET, OR A MARKED SQUARE TO MOVE.</li>
          </ul>
        </>
      }
      onRestart={() => restart()}
      inProgress={!s.end && (s.round > 1 || s.tanks.some((t) => t.acted))}
      restartLabel="RESTART MAP"
      onExit={onExit}
      side={phone ? undefined : side}
      report={<GameReport events={log.events} />}
      announce={announce}
    >
      <GridBoard
        cols={N}
        rows={N}
        maxPx={620}
        className="tg-board dw-map"
        ariaLabel="Desert map"
        testId="dw-map"
        colLabels={COLS}
        rowLabels={ROWS}
        label={cellLabel}
        onActivate={onCell}
        state={(x, y) => {
          const t = s.tanks.find((tt) => tt.hp > 0 && tt.x === x && tt.y === y)
          return {
            terrain: dunes.has(key(x, y)) ? 'dune' : undefined,
            legal: reach.has(key(x, y)),
            selected: !!t && !s.end && (t.id === s.sel || t.id === s.target),
          }
        }}
        cell={(x, y) => {
          const t = s.tanks.find((tt) => tt.hp > 0 && tt.x === x && tt.y === y)
          return t ? tankCell(t) : null
        }}
        overlay={overlay}
      />
      {/* Phone: tank, orders and target sit directly under the map; legend after. */}
      {phone && side}
      <ul className="tg-legend" aria-label="Legend">
        <li>
          <span className="tg-swatch" style={{ background: 'rgba(200,150,70,0.6)' }} /> DUNE: BLOCKS MOVES AND SIGHT
        </li>
        <li>
          <span className="tg-swatch" style={{ borderRadius: '50%', background: 'rgba(255,184,77,0.75)', width: 10, height: 10 }} /> REACHABLE THIS ACTION
        </li>
        <li>T1/T2 BLUE · E1/E2 RED · PIPS = ARMOR</li>
      </ul>
      {me && reachable(s, me).length === 0 && !s.end && (
        <p className="tg-note">{tankName(me)} CANNOT MOVE: {me.fuel <= 0 ? 'NO FUEL' : 'EVERY ADJACENT SQUARE IS BLOCKED'}.</p>
      )}
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'DESERT WARFARE', Component: DesertWarfare }
