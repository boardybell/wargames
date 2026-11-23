// FIGHTER COMBAT. A simultaneous-turn dogfight on a 7x7 scope against a WOPR
// bandit. Rules live in engines/fighter-combat.ts (energy gates, firing arc,
// AI policies, end reasons); this module is presentation, records and input.
// Design: docs/games-design-review.md §9.
import { useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, GameReport, GameResult, GameShell, Panel, Segmented } from './ui/GameShell'
import { GridBoard } from './ui/boards/GridBoard'
import { cue, fmtWLD, useEventLog, useGameKeys, useGameRecords, usePhone, type WLD } from './hooks'
import {
  ACTS,
  COST,
  DIRS,
  DIR_NAME,
  GRID,
  GUN_RANGE,
  MAX_ENERGY,
  MAX_HP,
  MAX_TURNS,
  SCENARIOS,
  canAct,
  foePolicy,
  gunDamage,
  inArc,
  range,
  resolveTurn,
  type Act,
  type Difficulty,
  type EndReason,
  type Fighter,
} from './engines/fighter-combat'
import './styles/tactical.css'

const COLS = 'ABCDEFG'.split('')
const cellName = (x: number, y: number): string => `${COLS[x]}${y + 1}`

const ACT_INFO: Record<Act, { key: string; label: string; effect: string }> = {
  LEFT: { key: 'A', label: 'BANK LEFT', effect: '45° L, MOVE 1' },
  RIGHT: { key: 'D', label: 'BANK RIGHT', effect: '45° R, MOVE 1' },
  THROTTLE: { key: 'W', label: 'THROTTLE', effect: 'MOVE 2' },
  CLIMB: { key: 'C', label: 'CLIMB', effect: 'STAY, RECOVER' },
  DIVE: { key: 'X', label: 'DIVE', effect: 'MOVE 3' },
  GUNS: { key: 'F', label: 'GUNS', effect: 'STAY, FIRE' },
}
const costText = (a: Act): string => {
  const d = COST[a].delta
  return d > 0 ? `+${d} E` : `${d} E`
}

const END_COPY: Record<EndReason, { outcome: 'win' | 'lose' | 'draw'; head: string; reason: string }> = {
  splash: { outcome: 'win', head: 'SPLASH ONE', reason: 'BANDIT INTEGRITY REACHED ZERO.' },
  'shot-down': { outcome: 'lose', head: 'AIRCRAFT DOWN', reason: 'YOUR INTEGRITY REACHED ZERO.' },
  mutual: { outcome: 'draw', head: 'MUTUAL DESTRUCTION', reason: 'BOTH AIRCRAFT FIRED IN THE SAME TURN AND BOTH WENT DOWN.' },
  time: { outcome: 'draw', head: 'TIME EXPIRED', reason: `${MAX_TURNS} TURNS FLOWN WITH BOTH AIRCRAFT STILL AIRBORNE.` },
}

interface Match {
  readonly scenario: string
  readonly you: Fighter
  readonly foe: Fighter
  /** Turn about to be flown (1-based). */
  readonly turn: number
  readonly end: EndReason | null
  readonly session: string
  readonly lastFoe: Act | null
}

const scenarioOf = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!
let sessionCounter = 0
function newMatch(id: string): Match {
  const sc = scenarioOf(id)
  sessionCounter += 1
  return { scenario: sc.id, you: sc.you, foe: sc.foe, turn: 1, end: null, session: `${sc.id}-${Date.now()}-${sessionCounter}`, lastFoe: null }
}

// ------------------------------------------------------------ scope graphics
/** Original vector marker. Player: solid delta. Bandit: outlined swept wing. */
function Aircraft({ f, side }: { f: Fighter; side: 'you' | 'foe' }) {
  return (
    <svg className={`fc-craft fc-${side}`} viewBox="-10 -10 20 20" aria-hidden="true" style={{ transform: `rotate(${f.hdg * 45}deg)` }}>
      {side === 'you' ? (
        <path d="M0,-9 L7,7 L0,3.5 L-7,7 Z" />
      ) : (
        <path d="M0,-9 L2,-2 L8,5 L2,3 L0,8 L-2,3 L-8,5 L-2,-2 Z" />
      )}
    </svg>
  )
}

/** Nose line with range ticks at 1, 2 and 3 squares (the range guide). */
function NoseLine({ f, side }: { f: Fighter; side: 'you' | 'foe' }) {
  const [dx, dy] = DIRS[f.hdg]!
  const cx = f.x + 0.5
  const cy = f.y + 0.5
  const tx = -dy
  const ty = dx
  const n = Math.hypot(tx, ty)
  return (
    <g className={`fc-nose fc-nose-${side}`}>
      <line x1={cx} y1={cy} x2={cx + dx * GUN_RANGE} y2={cy + dy * GUN_RANGE} />
      {[1, 2, 3].map((r) => (
        <line
          key={r}
          x1={cx + dx * r - (tx / n) * 0.18}
          y1={cy + dy * r - (ty / n) * 0.18}
          x2={cx + dx * r + (tx / n) * 0.18}
          y2={cy + dy * r + (ty / n) * 0.18}
        />
      ))}
    </g>
  )
}

function ScopeOverlay({ you, foe }: { you: Fighter; foe: Fighter }) {
  return (
    <svg className="tg-overlay" viewBox={`0 0 ${GRID} ${GRID}`} preserveAspectRatio="none" aria-hidden="true">
      <NoseLine f={foe} side="foe" />
      <NoseLine f={you} side="you" />
    </svg>
  )
}

function StatusRow({ name, f, tone, note }: { name: string; f: Fighter; tone: 'you' | 'foe'; note: string }) {
  return (
    <div className={`fc-row fc-row-${tone}`} data-testid={`fc-status-${tone}`}>
      <span className="fc-row-name">{name}</span>
      <span className="fc-row-item">
        HDG <b>{DIR_NAME[f.hdg]}</b>
      </span>
      <span className="fc-row-item">
        ENERGY <b>{f.energy}/{MAX_ENERGY}</b>
      </span>
      <span className="fc-row-item">
        INTEG <b>{f.hp}/{MAX_HP}</b>
      </span>
      <span className="fc-row-note">{note}</span>
    </div>
  )
}

function FighterCombat({ onExit }: GameProps) {
  const rec = useGameRecords('fighter-combat')
  const log = useEventLog()
  const [difficulty, setDifficulty] = useState<Difficulty>('veteran')
  const [m, setM] = useState<Match>(() => newMatch(SCENARIOS[0]!.id))
  const [announce, setAnnounce] = useState('')
  const sc = scenarioOf(m.scenario)
  const recKey = `${m.scenario}:${difficulty}`

  const restart = (scenario = m.scenario): void => {
    setM(newMatch(scenario))
    log.reset()
    setAnnounce('')
  }

  const fly = (act: Act): void => {
    if (m.end) return
    const gate = canAct(m.you, act)
    if (!gate.ok) {
      cue.deny()
      setAnnounce(`${ACT_INFO[act].label} UNAVAILABLE: ${gate.reason}`)
      return
    }
    const fAct = foePolicy(difficulty, m.foe, m.you)
    const r = resolveTurn(m.you, m.foe, act, fAct, m.turn)
    const ev: { text: string; kind?: 'info' | 'good' | 'bad' | 'warn' }[] = [
      { text: `T${m.turn}: YOU ${ACT_INFO[act].label} → ${cellName(r.you.x, r.you.y)} HDG ${DIR_NAME[r.you.hdg]} E${r.you.energy}.` },
      { text: `BANDIT ${ACT_INFO[fAct].label} → ${cellName(r.foe.x, r.foe.y)} HDG ${DIR_NAME[r.foe.hdg]} E${r.foe.energy}.` },
    ]
    if (r.youFired)
      ev.push(
        r.youHit > 0
          ? { text: `YOUR GUNS HIT AT RANGE ${range(r.you, r.foe)}: BANDIT INTEGRITY -${r.youHit}.`, kind: 'good' }
          : { text: 'YOUR GUNS MISSED: BANDIT LEFT THE ARC DURING THE MANEUVER.', kind: 'warn' },
      )
    if (r.foeFired)
      ev.push(
        r.foeHit > 0
          ? { text: `BANDIT GUNS HIT YOU AT RANGE ${range(r.you, r.foe)}: INTEGRITY -${r.foeHit}.`, kind: 'bad' }
          : { text: 'BANDIT FIRED AND MISSED.', kind: 'info' },
      )
    if (r.end) {
      const c = END_COPY[r.end]
      ev.push({ text: `${c.head}. ${c.reason}`, kind: c.outcome === 'win' ? 'good' : c.outcome === 'lose' ? 'bad' : 'warn' })
      rec.recordOnce(m.session, () => {
        rec.tally(recKey, c.outcome)
        if (c.outcome === 'win') rec.update<number>(`best:${recKey}`, (p) => (p === undefined ? r.turn : Math.min(p, r.turn)))
      })
      if (c.outcome === 'win') cue.win()
      else if (c.outcome === 'lose') cue.lose()
      else cue.draw()
    } else if (r.youHit || r.foeHit) cue.hit()
    else cue.select()
    log.push(...ev)
    setAnnounce(ev.map((e) => e.text).join(' '))
    setM({ ...m, you: r.you, foe: r.foe, turn: m.turn + 1, end: r.end, lastFoe: fAct })
  }

  const phone = usePhone()
  useGameKeys((k) => {
    const key = k.toLowerCase()
    if (m.end) return false
    const act = ACTS.find((a) => ACT_INFO[a].key.toLowerCase() === key)
    if (!act) return false
    fly(act)
    return true
  })

  const youArc = inArc(m.you, m.foe)
  const foeArc = inArc(m.foe, m.you)
  const rng = range(m.you, m.foe)
  const record = rec.get<WLD | undefined>(recKey, undefined)
  const best = rec.get<number | undefined>(`best:${recKey}`, undefined)
  const turnShown = Math.min(m.end ? m.turn - 1 : m.turn, MAX_TURNS)

  const cellLabel = (x: number, y: number): string => {
    const parts = [cellName(x, y)]
    if (m.you.x === x && m.you.y === y) parts.push(`YOUR AIRCRAFT, HEADING ${DIR_NAME[m.you.hdg]}`)
    if (m.foe.x === x && m.foe.y === y) parts.push(`BANDIT, HEADING ${DIR_NAME[m.foe.hdg]}`)
    if (inArc(m.you, { x, y })) parts.push('IN YOUR ARC')
    if (inArc(m.foe, { x, y })) parts.push('IN BANDIT ARC')
    return parts.join(', ')
  }

  const endCopy = m.end ? END_COPY[m.end] : null
  const nextScenario = SCENARIOS[(SCENARIOS.findIndex((s) => s.id === m.scenario) + 1) % SCENARIOS.length]!

  const side = endCopy ? (
    <GameResult
      outcome={endCopy.outcome}
      headline={endCopy.head}
      reason={endCopy.reason}
      metrics={[
        { label: 'TURNS', value: `${Math.min(m.turn - 1, MAX_TURNS)}/${MAX_TURNS}` },
        { label: 'YOU', value: `${m.you.hp}/${MAX_HP}` },
        { label: 'BANDIT', value: `${m.foe.hp}/${MAX_HP}` },
      ]}
      testId="fc-result"
    >
      <Action variant="primary" onClick={() => restart()} testId="fc-again" autoFocus>
        RETRY {sc.name}
      </Action>
      <Action onClick={() => restart(nextScenario.id)}>NEXT: {nextScenario.name}</Action>
    </GameResult>
  ) : (
    <Panel title="YOUR MANEUVER">
      <div className="fc-bank" role="group" aria-label="Maneuvers" data-testid="fc-controls">
        {ACTS.map((a) => {
          const gate = canAct(m.you, a)
          const info = ACT_INFO[a]
          return (
            <Action
              key={a}
              onClick={() => fly(a)}
              disabled={!gate.ok}
              reason={gate.reason}
              variant={a === 'GUNS' && youArc ? 'primary' : a === 'CLIMB' && m.you.energy < 2 ? 'primary' : 'secondary'}
              shortcut={info.key}
              testId={`fc-act-${a.toLowerCase()}`}
              label={`${info.label}: ${info.effect}, ${costText(a)}`}
            >
              <span className="fc-act">
                <span>{info.label}</span>
                <small>
                  {info.effect} · {costText(a)}
                </small>
              </span>
            </Action>
          )
        })}
      </div>
      <p className="tg-note">CLIMB IS ALWAYS AVAILABLE. THE BANDIT FOLLOWS THE SAME ENERGY RULES.</p>
    </Panel>
  )

  return (
    <GameShell
      slug="fighter-combat"
      title="FIGHTER COMBAT"
      objective={`${sc.name}: ${sc.brief}`}
      phase={m.end ? 'ENGAGEMENT OVER' : `TURN ${turnShown}/${MAX_TURNS} · CHOOSE A MANEUVER`}
      phaseTone={m.end ? 'dim' : 'amber'}
      metrics={[
        { label: 'TURN', value: `${turnShown}/${MAX_TURNS}` },
        { label: 'RANGE', value: rng },
        { label: 'RECORD', value: fmtWLD(record), tone: 'dim', title: 'Wins-losses-draws in this scenario at this AI level' },
        { label: 'BEST WIN', value: best ? `${best} TURNS` : '—', tone: 'dim' },
      ]}
      toolbar={
        <>
          <Segmented
            label="SCENARIO"
            value={m.scenario}
            options={SCENARIOS.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => restart(v)}
            testId="fc-scenario"
          />
          <Segmented
            label="AI"
            value={difficulty}
            options={[
              { value: 'beginner', label: 'BEGINNER' },
              { value: 'veteran', label: 'VETERAN' },
            ]}
            onChange={(v) => {
              setDifficulty(v)
              restart()
            }}
            testId="fc-difficulty"
          />
        </>
      }
      help={
        <>
          <p>BRING THE BANDIT&apos;S INTEGRITY FROM 6 TO 0 WITHIN {MAX_TURNS} TURNS. BOTH AIRCRAFT CHOOSE AT THE SAME TIME.</p>
          <ul>
            <li>ORDER OF A TURN: BOTH MANEUVERS RESOLVE, THEN GUNS ARE CHECKED FROM THE NEW POSITIONS.</li>
            <li>FIRING ARC: WITHIN 45° OF THE NOSE AND RANGE 1–3 (SQUARES, DIAGONALS COUNT 1). RANGE 1 HITS FOR 2, RANGE 2–3 FOR 1.</li>
            <li>GUNS HOLDS YOUR AIRCRAFT STEADY. TARGET IN ARC MEANS THE BANDIT IS IN YOUR ARC NOW; IT MAY MANEUVER OUT BEFORE THE ROUNDS ARRIVE.</li>
            <li>ENERGY MUST BE AVAILABLE BEFORE THE ACTION: BANK 1 (−1), DIVE 2 (−2), GUNS 1 (−1). THROTTLE (+2) AND CLIMB (+3) ARE FREE, SO THERE IS NO ENERGY DEADLOCK.</li>
            <li>ENDINGS: SPLASH (WIN), SHOT DOWN (LOSS), MUTUAL DESTRUCTION OR TIME EXPIRED (DRAW). THERE IS NO AMMUNITION LIMIT.</li>
            <li>AIRCRAFT STOP AT THE SCOPE EDGE. BOTH AIRCRAFT MAY SHARE A SQUARE (RANGE 0: NO SHOT).</li>
            <li>AI: BEGINNER TURNS INTO YOU AND FIRES WHEN ALIGNED. VETERAN THINKS TWO TURNS AHEAD: EVERY LEGAL MOVE AGAINST EVERY REPLY YOU COULD MAKE, SCORED FOR DAMAGE, EXPOSURE AND ENERGY. NEITHER SEES YOUR CHOICE.</li>
            <li>SCENARIOS ARE FIXED STARTS, SO RECORDS COMPARE THE SAME PROBLEM. KEYS: A/D BANK · W THROTTLE · C CLIMB · X DIVE · F GUNS.</li>
          </ul>
        </>
      }
      onRestart={() => restart()}
      inProgress={!m.end && m.turn > 1}
      restartLabel="RESTART SCENARIO"
      onExit={onExit}
      side={phone ? undefined : side}
      report={<GameReport events={log.events} />}
      announce={announce}
    >
      <GridBoard
        cols={GRID}
        rows={GRID}
        maxPx={600}
        className="tg-board fc-scope"
        ariaLabel="Tactical scope"
        testId="fc-scope"
        colLabels={COLS}
        rowLabels={Array.from({ length: GRID }, (_, i) => String(i + 1))}
        label={cellLabel}
        state={(x, y) => ({
          inRange: inArc(m.you, { x, y }),
          terrain: inArc(m.foe, { x, y }) ? 'threat' : undefined,
        })}
        cell={(x, y) => (
          <>
            {m.foe.x === x && m.foe.y === y && <Aircraft f={m.foe} side="foe" />}
            {m.you.x === x && m.you.y === y && <Aircraft f={m.you} side="you" />}
          </>
        )}
        overlay={<ScopeOverlay you={m.you} foe={m.foe} />}
      />
      <div className="fc-status">
        <StatusRow name="YOU" f={m.you} tone="you" note={youArc ? 'TARGET IN ARC' : 'NO TARGET IN ARC'} />
        <StatusRow name="BANDIT" f={m.foe} tone="foe" note={foeArc ? 'HAS YOU IN ARC' : 'NO SHOT ON YOU'} />
      </div>
      {/* Phone: the decision sits right under the telemetry, ahead of the explanation. */}
      {phone && side}
      {!m.end && (
      <p className={`tg-note${youArc ? ' gs-tone-amber' : ''}`} data-testid="fc-solution">
        {youArc
          ? `TARGET IN ARC AT RANGE ${rng} (${gunDamage(m.you, m.foe)} DAMAGE IF IT STAYS). GUNS ARE CHECKED AFTER BOTH AIRCRAFT MANEUVER; THE BANDIT MAY LEAVE THE ARC.`
          : 'BLUE SQUARES ARE YOUR ARC, RED-HATCHED SQUARES THE BANDIT ARC; TICKS ON EACH NOSE LINE MARK RANGE 1–3. GUNS ARE CHECKED AFTER BOTH AIRCRAFT MANEUVER.'}
        {m.lastFoe ? ` LAST BANDIT ACTION: ${ACT_INFO[m.lastFoe].label}.` : ''}
      </p>
      )}
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'FIGHTER COMBAT', Component: FighterCombat }
