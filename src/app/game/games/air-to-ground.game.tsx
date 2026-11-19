// AIR-TO-GROUND ACTIONS. A WOPR strike-mission simulation. You command a flight
// of attack aircraft and must destroy a set of defended ground targets before
// your airframes are shot down. Each sortie you pick a target and an attack
// profile: HIGH exposes you to long-range SAMs but keeps you above the guns; LOW
// hugs the deck to dodge radar but flies into a wall of AAA. Risk against reward,
// turn by turn, in blue phosphor.
import { useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

interface Target {
  readonly id: number
  readonly name: string
  // Defenses: sam threatens HIGH profiles, aaa threatens LOW profiles. Values
  // are rough hit percentages against the matching profile.
  readonly sam: number
  readonly aaa: number
  readonly toughness: number // hits of damage required to destroy
}

interface TargetState extends Target {
  damage: number
  destroyed: boolean
}

type Profile = 'HIGH' | 'LOW'
type Outcome = 'win' | 'lose' | null

const START_AIRCRAFT = 6

const TARGET_DEFS: readonly Target[] = [
  { id: 0, name: 'RADAR SITE BRAVO', sam: 20, aaa: 55, toughness: 2 },
  { id: 1, name: 'SAM BATTERY GRID-7', sam: 65, aaa: 30, toughness: 2 },
  { id: 2, name: 'ARMOR COLUMN', sam: 25, aaa: 60, toughness: 3 },
  { id: 3, name: 'COMMAND BUNKER', sam: 55, aaa: 45, toughness: 3 },
  { id: 4, name: 'FUEL DEPOT', sam: 35, aaa: 50, toughness: 2 },
  { id: 5, name: 'AIRFIELD VECTOR-9', sam: 50, aaa: 40, toughness: 3 },
]

function freshTargets(): TargetState[] {
  return TARGET_DEFS.map((t) => ({ ...t, damage: 0, destroyed: false }))
}

// Returns an integer 1..100 inclusive.
function roll(): number {
  return Math.floor(Math.random() * 100) + 1
}

interface Report {
  readonly lines: readonly string[]
  readonly crit: boolean
}

function AirToGround({ onExit }: GameProps) {
  const [targets, setTargets] = useState<TargetState[]>(freshTargets)
  const [aircraft, setAircraft] = useState(START_AIRCRAFT)
  const [sortie, setSortie] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)

  const remaining = useMemo(
    () => targets.filter((t) => !t.destroyed).length,
    [targets],
  )

  const reset = (): void => {
    setTargets(freshTargets())
    setAircraft(START_AIRCRAFT)
    setSortie(1)
    setSelected(null)
    setReport(null)
    setOutcome(null)
  }

  const flySortie = (profile: Profile): void => {
    if (outcome || selected === null) return
    const tgt = targets.find((t) => t.id === selected)
    if (!tgt || tgt.destroyed) return

    const lines: string[] = []
    let crit = false

    // The threat that matters for this profile. HIGH walks into SAMs, LOW into
    // flak. The off-profile defense still contributes a token amount.
    const threat =
      profile === 'HIGH'
        ? tgt.sam + Math.floor(tgt.aaa / 5)
        : tgt.aaa + Math.floor(tgt.sam / 5)

    lines.push(`SORTIE ${sortie}: ${profile} PROFILE AGAINST ${tgt.name}.`)
    lines.push(
      profile === 'HIGH'
        ? `ABOVE THE GUNS. SAM ENVELOPE HOT (${tgt.sam}%).`
        : `IN THE WEEDS. AAA WALL AHEAD (${tgt.aaa}%).`,
    )

    // Did the defenses down the aircraft? One roll against the profile threat.
    const defenseRoll = roll()
    let lost = false
    if (defenseRoll <= threat) {
      lost = true
      crit = true
      lines.push(
        profile === 'HIGH'
          ? 'MISSILE LOCK. AIRCRAFT HIT. PILOT PUNCHING OUT.'
          : 'TRACERS EVERYWHERE. AIRCRAFT HIT. GOING DOWN.',
      )
    } else {
      lines.push('DEFENSES EVADED. RUN IS CLEAN.')
    }

    // Ordnance effect. LOW runs are more accurate (closer, longer on-target);
    // HIGH runs trade accuracy for survivability. A downed aircraft may still
    // have pickled its load, so damage is rolled independently.
    const hitChance = profile === 'LOW' ? 75 : 55
    const ordnanceRoll = roll()
    let dmg = 0
    if (ordnanceRoll <= hitChance) {
      dmg = profile === 'LOW' ? 2 : 1
      lines.push(
        profile === 'LOW'
          ? 'BOMBS ON TARGET. DIRECT HIT.'
          : 'ORDNANCE AWAY. TARGET STRUCK.',
      )
    } else {
      lines.push('ORDNANCE WIDE. NO EFFECT ON TARGET.')
    }

    // Apply damage.
    let destroyedNow = false
    const nextTargets = targets.map((t) => {
      if (t.id !== tgt.id || dmg === 0) return t
      const damage = t.damage + dmg
      const destroyed = damage >= t.toughness
      if (destroyed) destroyedNow = true
      return { ...t, damage, destroyed }
    })
    if (destroyedNow) {
      crit = true
      lines.push(`${tgt.name} DESTROYED.`)
    }

    const nextAircraft = lost ? aircraft - 1 : aircraft
    const nextRemaining = nextTargets.filter((t) => !t.destroyed).length

    // Resolve outcome. Win if every target is down. Lose if no airframes remain.
    let nextOutcome: Outcome = null
    if (nextRemaining === 0) {
      nextOutcome = 'win'
      lines.push('ALL TARGETS NEUTRALIZED. MISSION COMPLETE.')
    } else if (nextAircraft <= 0) {
      nextOutcome = 'lose'
      lines.push('FLIGHT DESTROYED. NO AIRCRAFT REMAIN. MISSION FAILED.')
    }

    setTargets(nextTargets)
    setAircraft(nextAircraft)
    setReport({ lines, crit })
    setOutcome(nextOutcome)
    setSortie((s) => s + 1)
    if (nextOutcome || (nextTargets.find((t) => t.id === tgt.id)?.destroyed ?? false)) {
      setSelected(null)
    }
  }

  const selectedTarget =
    selected !== null ? targets.find((t) => t.id === selected) : undefined

  return (
    <div className="wg-screen" data-testid="game-air-to-ground">
      <div className="wg-out" style={{ overflow: 'auto' }}>
        <div className="wg-big">AIR-TO-GROUND ACTIONS</div>
        <div className="wg-dim" style={{ marginBottom: '0.6rem' }}>
          WOPR STRIKE SIMULATION // DESTROY ALL TARGETS BEFORE THE FLIGHT IS LOST
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1.4rem',
            flexWrap: 'wrap',
            marginBottom: '0.6rem',
          }}
        >
          <span>
            AIRCRAFT{' '}
            <span className={aircraft <= 2 ? 'wg-red' : 'wg-amber'}>
              {'#'.repeat(Math.max(0, aircraft))}
              {aircraft === 0 ? 'NONE' : ''} ({aircraft})
            </span>
          </span>
          <span className="wg-dim">SORTIE {sortie}</span>
          <span className="wg-dim">TARGETS LEFT {remaining}</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '0.4rem',
            marginBottom: '0.6rem',
          }}
          data-testid="target-list"
        >
          {targets.map((t) => {
            const isSel = t.id === selected && !t.destroyed
            const cls = [
              'wg-opt',
              t.destroyed ? 'wg-dim' : '',
              isSel ? 'wg-amber' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={t.id}
                type="button"
                className={cls}
                disabled={t.destroyed || !!outcome}
                onClick={() => setSelected(t.id)}
                style={{ width: '100%', border: '1px solid rgba(108,182,255,0.3)' }}
              >
                {isSel ? '> ' : '  '}
                {t.destroyed ? '[DOWN] ' : ''}
                {t.name}
                {'\n'}
                {t.destroyed
                  ? '      DESTROYED'
                  : `      SAM ${t.sam}%  AAA ${t.aaa}%  HP ${t.toughness - t.damage}/${t.toughness}`}
              </button>
            )
          })}
        </div>

        {!outcome && (
          <div className="wg-opts" data-testid="profile-controls">
            {selectedTarget ? (
              <>
                <div className="wg-amber">
                  TARGET LOCKED: {selectedTarget.name}. CHOOSE ATTACK PROFILE.
                </div>
                <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="wg-opt"
                    style={{ border: '1px solid rgba(108,182,255,0.4)' }}
                    data-testid="attack-high"
                    onClick={() => flySortie('HIGH')}
                  >
                    &gt; HIGH ALTITUDE (SAM RISK, SAFER FROM GUNS)
                  </button>
                  <button
                    type="button"
                    className="wg-opt"
                    style={{ border: '1px solid rgba(108,182,255,0.4)' }}
                    data-testid="attack-low"
                    onClick={() => flySortie('LOW')}
                  >
                    &gt; LOW LEVEL (AAA RISK, BETTER ACCURACY)
                  </button>
                </div>
              </>
            ) : (
              <div className="wg-dim">SELECT A TARGET TO BEGIN THE RUN.</div>
            )}
          </div>
        )}

        {report && (
          <div
            className="wg-log"
            data-testid="sortie-report"
            style={{ marginTop: '0.8rem', height: 'auto' }}
          >
            {report.lines.map((l, i) => (
              <span key={i} className={report.crit ? 'crit' : undefined}>
                {l}
              </span>
            ))}
          </div>
        )}

        {outcome && (
          <div style={{ marginTop: '1rem' }} data-testid="game-result">
            <div className={outcome === 'win' ? 'wg-big wg-amber' : 'wg-big wg-red'}>
              {outcome === 'win'
                ? 'MISSION ACCOMPLISHED. ALL TARGETS DESTROYED.'
                : 'MISSION FAILED. FLIGHT ATTRITED TO ZERO.'}
            </div>
            <div className="wg-dim" style={{ marginTop: '0.4rem' }}>
              {outcome === 'win'
                ? `TARGETS CLEARED WITH ${aircraft} AIRCRAFT STILL FLYING.`
                : 'A STRANGE GAME. THE ONLY WINNING MOVE IS TO FLY SMARTER.'}
            </div>
            <div className="wg-opts" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="wg-opt wg-amber"
                data-testid="play-again"
                onClick={reset}
                autoFocus
              >
                &gt; PLAY AGAIN
              </button>
            </div>
          </div>
        )}

        <div className="wg-opts" style={{ marginTop: '1.2rem' }}>
          <button
            type="button"
            className="wg-opt"
            data-testid="game-exit"
            onClick={onExit}
          >
            &gt; EXIT TO GAMES
          </button>
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'AIR-TO-GROUND ACTIONS', Component: AirToGround }
