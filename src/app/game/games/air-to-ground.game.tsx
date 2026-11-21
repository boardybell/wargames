// AIR-TO-GROUND ACTIONS. Lock one of six defended targets and fly it HIGH
// (SAM threat) or LOW (AAA threat) until every target is destroyed or the
// flight of six is lost. The LOSS / HIT / DAMAGE numbers shown for each profile
// come from the same odds() function the sortie resolution uses. Target order
// has consequences (radar, command bunker) and missions are seeded so RETRY
// MISSION replays the same ratings and dice. Rules: engines/air-to-ground.ts
// (design: docs/games-design-review.md §12).
import { useEffect, useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, GameReport, GameResult, GameShell, Panel, type EventKind as ShellKind } from './ui/GameShell'
import { cue, fmtWLD, newSeed, useEventLog, useGameKeys, useGameRecords, type WLD } from './hooks'
import {
  COMMAND_AAA_RISE,
  START_AIRCRAFT,
  type EventKind,
  type Mission,
  type Profile,
  type Target,
  commandEscalatesAfter,
  createMission,
  destroyedCount,
  effectText,
  flySortie,
  nextEscalation,
  odds,
} from './engines/air-to-ground'
import './styles/air-to-ground.css'

const KIND_LABEL: Record<Target['kind'], string> = {
  radar: 'EARLY-WARNING RADAR',
  sam: 'MISSILE BATTERY',
  armor: 'GROUND FORCES',
  command: 'COMMAND POST',
  fuel: 'LOGISTICS',
  airfield: 'AIR BASE',
}
const TONE: Record<EventKind, ShellKind> = { procedure: 'info', success: 'good', loss: 'bad', effect: 'warn' }
const missionSeed = (): number => (newSeed() % 90000) + 10000

function usePhone(): boolean {
  const q = '(max-width: 760px)'
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(q)
    if (!mq) return
    const on = (): void => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

function Rating({ label, value, base }: { label: string; value: number; base: number }) {
  const d = value - base
  return (
    <span className="atg-rating">
      <span className="atg-rating-label">{label}</span> {value}%
      {d !== 0 && (
        <span className={`atg-delta ${d < 0 ? 'atg-down' : 'atg-up'}`} title={`${label} was ${base}% at mission start`}>
          {d > 0 ? `+${d}` : d}
        </span>
      )}
    </span>
  )
}

function TargetCard({ t, locked, disabled, onPick, hotkey }: { t: Target; locked: boolean; disabled: boolean; onPick: () => void; hotkey: number }) {
  const effect = effectText(t.kind)
  const hp = t.toughness - t.damage
  return (
    <button
      type="button"
      className={`atg-card${locked ? ' is-locked' : ''}${t.destroyed ? ' is-down' : ''}`}
      aria-pressed={locked}
      disabled={disabled}
      onClick={onPick}
      data-testid={`target-${t.id}`}
      aria-keyshortcuts={String(hotkey)}
      aria-label={`${t.name}. ${t.destroyed ? 'Destroyed' : `SAM ${t.sam} percent, AAA ${t.aaa} percent, ${hp} of ${t.toughness} structure`}${locked ? '. Locked' : ''}`}
    >
      <span className="atg-card-head">
        <span className="atg-name">
          <kbd className="atg-key">{hotkey}</kbd> {t.name}
        </span>
        {locked && <span className="atg-locked">LOCKED</span>}
        {t.destroyed && <span className="atg-down-tag">DESTROYED</span>}
      </span>
      <span className="atg-kind">{KIND_LABEL[t.kind]}</span>
      {!t.destroyed && (
        <span className="atg-stats">
          <Rating label="SAM" value={t.sam} base={t.baseSam} />
          <Rating label="AAA" value={t.aaa} base={t.baseAaa} />
          <span className="atg-hp" aria-hidden="true">
            {Array.from({ length: t.toughness }, (_, i) => (
              <span key={i} className={i < hp ? 'atg-pip' : 'atg-pip is-spent'} />
            ))}
          </span>
        </span>
      )}
      {effect && <span className={`atg-effect${t.destroyed ? ' is-spent' : ''}`}>{t.destroyed ? (t.kind === 'radar' ? 'EFFECT APPLIED: SAM CUT.' : 'EFFECT ENDED.') : effect}</span>}
    </button>
  )
}

function ProfilePanel({ m, t, fly }: { m: Mission; t: Target; fly: (p: Profile) => void }) {
  const hp = t.toughness - t.damage
  const escalates = commandEscalatesAfter(m.sortie) && nextEscalation(m) === m.sortie
  return (
    <Panel title={`ATTACK PROFILE · ${t.name}`} className="atg-profile">
      <div className="atg-profiles" data-testid="profile-controls">
        {(['HIGH', 'LOW'] as const).map((p) => {
          const o = odds(t, p)
          return (
            <div key={p} className="atg-prof">
              <div className="atg-prof-name">{p === 'HIGH' ? 'HIGH ALTITUDE' : 'LOW LEVEL'}</div>
              <div className="atg-prof-sub">{p === 'HIGH' ? 'FACES SAM + 1/5 AAA' : 'FACES AAA + 1/5 SAM'}</div>
              <dl className="atg-odds">
                <div>
                  <dt>LOSS CHANCE</dt>
                  <dd className="atg-loss">{o.loss}%</dd>
                </div>
                <div>
                  <dt>HIT CHANCE</dt>
                  <dd>{o.hit}%</dd>
                </div>
                <div>
                  <dt>DAMAGE</dt>
                  <dd>
                    {o.damage}
                    <span className="atg-of"> OF {hp} LEFT</span>
                  </dd>
                </div>
              </dl>
              <Action variant="primary" onClick={() => fly(p)} testId={p === 'HIGH' ? 'attack-high' : 'attack-low'} shortcut={p === 'HIGH' ? 'H' : 'L'}>
                FLY {p}
              </Action>
            </div>
          )
        })}
      </div>
      <p className="atg-note">LOSS AND HIT ARE ROLLED SEPARATELY: ORDNANCE CAN STILL HIT WHEN THE AIRCRAFT IS LOST.</p>
      {escalates && (
        <p className="atg-note atg-warn">AFTER THIS SORTIE THE STANDING COMMAND BUNKER RAISES AAA +{COMMAND_AAA_RISE} ON ALL REMAINING TARGETS.</p>
      )}
    </Panel>
  )
}

function AirToGround({ onExit }: GameProps) {
  const rec = useGameRecords('air-to-ground')
  const log = useEventLog<ShellKind>()
  const phone = usePhone()
  const [m, setM] = useState<Mission>(() => createMission(missionSeed()))
  const [selected, setSelected] = useState<number | null>(null)
  const [runId, setRunId] = useState(1)

  const sel = selected !== null ? m.targets.find((t) => t.id === selected && !t.destroyed) : undefined
  const remaining = m.targets.length - destroyedCount(m)
  const esc = nextEscalation(m)
  const record = rec.get<WLD | undefined>('missions', undefined)
  const best = rec.get<number | null>(`best:${m.seed}`, null)

  const begin = (seed: number, text: string): void => {
    setM(createMission(seed))
    setSelected(null)
    setRunId((n) => n + 1)
    log.reset()
    log.push({ text })
    cue.tick()
  }
  const retry = (): void => begin(m.seed, `MISSION #${m.seed} RESET. SAME RATINGS, SAME DICE.`)
  const fresh = (): void => begin(missionSeed(), 'NEW MISSION ORDERS RECEIVED.')

  const pick = (id: number): void => {
    const t = m.targets.find((x) => x.id === id)
    if (m.outcome || !t || t.destroyed) return
    cue.select()
    setSelected(id)
  }

  const fly = (p: Profile): void => {
    if (!sel || m.outcome) return
    const r = flySortie(m, sel.id, p)
    setM(r.mission)
    log.push(...r.events.map((e) => ({ text: e.text, kind: TONE[e.kind] })))
    if (r.destroyed || r.mission.outcome) setSelected(null)
    const end = r.mission.outcome
    if (end) {
      const after = r.mission
      if (end === 'win') cue.win()
      else cue.lose()
      rec.recordOnce(`${after.seed}:${runId}`, () => {
        rec.tally('missions', end)
        if (end === 'win') rec.update<number | null>(`best:${after.seed}`, (b) => (b == null || after.aircraft > b ? after.aircraft : b))
      })
    } else if (r.lostAircraft) cue.hit()
    else if (r.destroyed) cue.boom()
    else cue.select()
  }

  useGameKeys((k) => {
    const key = k.toLowerCase()
    if (m.outcome) {
      if (key === 'r') {
        retry()
        return true
      }
      if (key === 'n') {
        fresh()
        return true
      }
      return false
    }
    if (/^[1-6]$/.test(key)) {
      pick(Number(key) - 1)
      return true
    }
    if (sel && (key === 'h' || key === 'l')) {
      fly(key === 'h' ? 'HIGH' : 'LOW')
      return true
    }
    return false
  })

  const profile = sel && !m.outcome ? <ProfilePanel m={m} t={sel} fly={fly} /> : null
  const flown = m.sortie - 1

  const result = m.outcome ? (
    <GameResult
      outcome={m.outcome}
      headline={m.outcome === 'win' ? 'MISSION COMPLETE' : 'MISSION FAILED'}
      reason={
        m.reason === 'all-destroyed'
          ? `ALL ${m.targets.length} TARGETS DESTROYED WITH ${m.aircraft} OF ${START_AIRCRAFT} AIRCRAFT RETURNING.`
          : `LAST AIRCRAFT LOST. ${remaining} TARGET${remaining === 1 ? '' : 'S'} STILL STANDING.`
      }
      metrics={[
        { label: 'DESTROYED', value: `${destroyedCount(m)}/${m.targets.length}` },
        { label: 'SORTIES', value: flown },
        { label: 'HITS', value: `${m.hits}/${flown}` },
        { label: 'AIRCRAFT LOST', value: m.lost, tone: m.lost > 0 ? 'red' : 'normal' },
        { label: 'BEST THIS MISSION', value: best == null ? '—' : `${best} RETURNED`, tone: 'dim' },
      ]}
      testId="game-result"
    >
      <Action variant="primary" onClick={retry} testId="play-again" shortcut="R">
        RETRY MISSION
      </Action>
      <Action onClick={fresh} testId="new-mission" shortcut="N">
        NEW MISSION
      </Action>
    </GameResult>
  ) : null

  const idle = !sel && !m.outcome ? (
    <Panel title="ATTACK PROFILE">
      <p>LOCK A TARGET TO SEE LOSS CHANCE, HIT CHANCE AND DAMAGE FOR BOTH PROFILES.</p>
      <p className="atg-note">KEYS 1-6 LOCK A TARGET · H FLIES HIGH · L FLIES LOW.</p>
    </Panel>
  ) : null

  const lastEv = log.events[log.events.length - 1]

  return (
    <GameShell
      slug="air-to-ground"
      title="AIR-TO-GROUND ACTIONS"
      objective="DESTROY ALL SIX TARGETS BEFORE THE FLIGHT IS LOST."
      phase={
        m.outcome
          ? m.outcome === 'win'
            ? 'MISSION COMPLETE'
            : 'MISSION FAILED'
          : sel
            ? `${sel.name} LOCKED. CHOOSE PROFILE.`
            : 'SELECT A TARGET'
      }
      phaseTone={m.outcome === 'lose' ? 'red' : 'amber'}
      metrics={[
        { label: 'AIRCRAFT', value: `${m.aircraft}/${START_AIRCRAFT}`, tone: m.aircraft <= 2 ? 'red' : 'normal' },
        { label: 'SORTIE', value: m.outcome ? flown : m.sortie },
        { label: 'TARGETS LEFT', value: remaining },
        { label: 'NEXT AAA RISE', value: esc == null ? 'NONE' : `AFTER ${esc}`, tone: esc == null ? 'dim' : 'amber', title: 'Command bunker escalation' },
        { label: 'MISSION', value: `#${m.seed}`, tone: 'dim', title: 'Mission seed: retry replays the same ratings and dice' },
        { label: 'W-L', value: fmtWLD(record), tone: 'dim' },
      ]}
      help={
        <>
          <p>LOCK A TARGET, THEN FLY ONE SORTIE AT IT, HIGH OR LOW. DESTROY ALL SIX TARGETS BEFORE ALL SIX AIRCRAFT ARE LOST.</p>
          <ul>
            <li>HIGH FACES THE SAM RATING PLUS ONE FIFTH OF THE AAA RATING. LOW FACES THE AAA RATING PLUS ONE FIFTH OF THE SAM RATING.</li>
            <li>HIGH HITS 55% OF THE TIME FOR 1 DAMAGE. LOW HITS 75% OF THE TIME FOR 2 DAMAGE.</li>
            <li>THE PROFILE PANEL SHOWS THE EXACT LOSS CHANCE, HIT CHANCE AND DAMAGE THE SORTIE WILL USE.</li>
            <li>LOSS AND HIT ARE TWO SEPARATE ROLLS. A LOST AIRCRAFT CAN STILL DAMAGE ITS TARGET, AND IF THAT DESTROYS THE LAST TARGET THE MISSION IS WON.</li>
            <li>DESTROYING RADAR SITE BRAVO CUTS SAM BY 10 ON EVERY REMAINING TARGET.</li>
            <li>WHILE THE COMMAND BUNKER STANDS, AAA RISES BY 5 ON EVERY REMAINING TARGET AFTER SORTIES 3 AND 6.</li>
            <li>RATINGS STAY BETWEEN 0 AND 95. CARDS SHOW CHANGES FROM THE MISSION START (E.G. -10).</li>
            <li>EACH MISSION NUMBER FIXES THE RATINGS AND THE DICE FOR EVERY SORTIE. RETRY MISSION REPLAYS IT; NEW MISSION DRAWS ANOTHER.</li>
            <li>KEYS: 1-6 LOCK · H HIGH · L LOW · R RETRY · N NEW (AFTER THE MISSION ENDS).</li>
          </ul>
        </>
      }
      onRestart={retry}
      inProgress={m.sortie > 1 && !m.outcome}
      restartLabel="RETRY MISSION"
      onExit={onExit}
      side={
        <>
          {result}
          {!phone && (profile ?? idle)}
          {phone && idle}
        </>
      }
      report={<GameReport events={log.events} title="SORTIE REPORT" />}
      announce={lastEv?.text}
    >
      <div className="atg-targets" data-testid="target-list" role="group" aria-label="Targets">
        {m.targets.map((t, i) => (
          <div key={t.id} className="atg-slot">
            <TargetCard t={t} locked={sel?.id === t.id} disabled={t.destroyed || !!m.outcome} onPick={() => pick(t.id)} hotkey={i + 1} />
            {phone && sel?.id === t.id && profile}
          </div>
        ))}
      </div>
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'AIR-TO-GROUND ACTIONS', Component: AirToGround }
