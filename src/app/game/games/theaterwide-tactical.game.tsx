// THEATERWIDE TACTICAL WARFARE. A WOPR theater-command simulation. The front is
// a chain of five sectors running from your capital to the enemy capital. Each
// turn you draw divisions from your reserve pool and commit them to sectors;
// the AI opponent commits its own reserves; combat resolves sector by sector and
// the front line shifts. Push the line onto the enemy capital to WIN, lose your
// own to LOSE, grind to exhaustion for a STALEMATE. Blue phosphor throughout.
import { useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

// Sectors are indexed 0..4. Index 0 is YOUR capital, index 4 is the ENEMY
// capital. Control runs on a continuous front line: you hold sectors up to a
// boundary, the enemy holds the rest. frontOwner[i] is 'US' or 'AI'.
type Owner = 'US' | 'AI'
type Outcome = 'win' | 'lose' | 'stalemate' | null

const SECTORS: readonly string[] = [
  'HOME CAPITAL',
  'WESTERN FRONT',
  'CENTRAL PLAIN',
  'EASTERN FRONT',
  'ENEMY CAPITAL',
]

const START_RESERVE = 10
const MAX_TURNS = 14
const REINFORCE = 4 // divisions added to each side's pool per turn

interface Sector {
  owner: Owner
  usDiv: number // player divisions committed and holding here
  aiDiv: number // enemy divisions committed and holding here
}

function initialSectors(): Sector[] {
  return SECTORS.map((_, i) => ({
    owner: i <= 1 ? 'US' : 'AI',
    usDiv: i === 1 ? 3 : 0,
    aiDiv: i === 3 ? 3 : 0,
  }))
}

function roll(max: number): number {
  return Math.floor(Math.random() * max)
}

// The contested sectors are the front edge: the highest US-owned index and the
// lowest AI-owned index are where fighting happens.
function frontIndices(sectors: readonly Sector[]): {
  usEdge: number
  aiEdge: number
} {
  let usEdge = 0
  let aiEdge = sectors.length - 1
  for (let i = 0; i < sectors.length; i++) {
    if (sectors[i]!.owner === 'US') usEdge = i
  }
  for (let i = sectors.length - 1; i >= 0; i--) {
    if (sectors[i]!.owner === 'AI') aiEdge = i
  }
  return { usEdge, aiEdge }
}

function TheaterwideTactical({ onExit }: GameProps) {
  const [sectors, setSectors] = useState<Sector[]>(initialSectors)
  const [reserve, setReserve] = useState(START_RESERVE)
  const [aiReserve, setAiReserve] = useState(START_RESERVE)
  const [pending, setPending] = useState<Record<number, number>>({})
  const [turn, setTurn] = useState(1)
  const [log, setLog] = useState<string[]>([
    'THEATER COMMAND ONLINE. ALLOCATE RESERVES TO THE FRONT.',
  ])
  const [critLog, setCritLog] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)

  const committed = useMemo(
    () => Object.values(pending).reduce((a, b) => a + b, 0),
    [pending],
  )
  const available = reserve - committed

  const { usEdge } = frontIndices(sectors)
  // Sectors you can reinforce: your front edge and any AI sector adjacent to it
  // (where you are pressing). Simplest honest model: your own owned sectors and
  // the single contested enemy sector in front of your edge.
  const pressTarget = Math.min(usEdge + 1, SECTORS.length - 1)

  const reset = (): void => {
    setSectors(initialSectors())
    setReserve(START_RESERVE)
    setAiReserve(START_RESERVE)
    setPending({})
    setTurn(1)
    setLog(['THEATER COMMAND ONLINE. ALLOCATE RESERVES TO THE FRONT.'])
    setCritLog(false)
    setOutcome(null)
  }

  const adjust = (idx: number, delta: number): void => {
    if (outcome) return
    setPending((prev) => {
      const cur = prev[idx] ?? 0
      const next = cur + delta
      if (next < 0) return prev
      const otherTotal =
        Object.entries(prev).reduce(
          (a, [k, v]) => (Number(k) === idx ? a : a + v),
          0,
        )
      if (otherTotal + next > reserve) return prev
      return { ...prev, [idx]: next }
    })
  }

  const resolveTurn = (): void => {
    if (outcome) return
    const next: Sector[] = sectors.map((s) => ({ ...s }))
    const lines: string[] = []
    let crit = false

    // 1) Commit the player's pending divisions to their sectors.
    for (const [k, v] of Object.entries(pending)) {
      const idx = Number(k)
      if (v > 0) next[idx]!.usDiv += v
    }
    if (committed > 0) lines.push(`COMMITTED ${committed} DIVISIONS TO THE LINE.`)

    // 2) AI allocates its reserve. It reinforces its contested edge and probes.
    const aiPool = aiReserve + REINFORCE
    const aiEdgeIdx = frontIndices(next).aiEdge
    // AI splits: bulk to its frontline sector, remainder to the sector behind.
    const aiFrontShare = Math.ceil(aiPool * 0.7)
    next[aiEdgeIdx]!.aiDiv += aiFrontShare
    const aiBack = Math.min(aiEdgeIdx + 1, SECTORS.length - 1)
    next[aiBack]!.aiDiv += aiPool - aiFrontShare
    lines.push(`ENEMY COMMITS ${aiPool} DIVISIONS. FRONT HARDENS.`)

    // 3) Resolve the single contested sector in front of the player's edge.
    const fi = frontIndices(next)
    const contestIdx = Math.min(fi.usEdge + 1, SECTORS.length - 1)
    const contest = next[contestIdx]!

    // Attack strength = player divisions staged at their edge + press commitment
    // at the contested sector. Defense = AI divisions in the contested sector.
    const attackStage = next[fi.usEdge]!.usDiv + contest.usDiv
    const defense = contest.aiDiv
    const atkRoll = roll(4)
    const defRoll = roll(4)
    const atkPower = attackStage + atkRoll
    const defPower = defense + defRoll

    lines.push(
      `BATTLE FOR ${SECTORS[contestIdx]}: ATK ${attackStage}+${atkRoll} vs DEF ${defense}+${defRoll}.`,
    )

    if (atkPower > defPower) {
      // Player breaks through and takes the sector. Losses on both sides.
      const losses = Math.min(contest.usDiv + next[fi.usEdge]!.usDiv, defRoll + 2)
      contest.owner = 'US'
      contest.aiDiv = 0
      // Survivors occupy the captured sector; attrition removes some divisions.
      const survivors = Math.max(1, attackStage - losses)
      next[fi.usEdge]!.usDiv = Math.max(0, next[fi.usEdge]!.usDiv - losses)
      contest.usDiv = Math.max(contest.usDiv, 1)
      void survivors
      crit = true
      lines.push(`BREAKTHROUGH. ${SECTORS[contestIdx]} CAPTURED.`)
    } else if (defPower > atkPower) {
      // Enemy holds and counterattacks: player loses staged divisions. If the
      // player edge sector itself is emptied and under pressure, it can fall.
      const losses = Math.min(attackStage, atkRoll + 2)
      next[fi.usEdge]!.usDiv = Math.max(0, next[fi.usEdge]!.usDiv - losses)
      contest.usDiv = Math.max(0, contest.usDiv - losses)
      contest.aiDiv = Math.max(1, contest.aiDiv - 1)
      lines.push(`ATTACK REPULSED. ${losses} DIVISIONS LOST.`)
      // Counterattack: if the player's edge sector is undefended, the enemy
      // overruns it and pushes the front back. When that edge is the HOME
      // CAPITAL (index 0), the capital itself falls and the theater is lost.
      if (next[fi.usEdge]!.usDiv === 0 && contest.aiDiv >= 3) {
        next[fi.usEdge]!.owner = 'AI'
        next[fi.usEdge]!.aiDiv = Math.max(1, contest.aiDiv - 2)
        crit = true
        lines.push(`ENEMY COUNTERATTACK OVERRUNS ${SECTORS[fi.usEdge]}.`)
      }
    } else {
      lines.push('THE LINE HOLDS. NO GROUND CHANGES HANDS.')
    }

    // 4) Replenish pools.
    const newReserve = available + REINFORCE
    const newAiReserve = 0 // AI spent its whole pool this turn, rebuilds next

    // 5) Outcome checks. Capitals are indices 0 and 4.
    const fin = frontIndices(next)
    let nextOutcome: Outcome = null
    if (next[4]!.owner === 'US') {
      nextOutcome = 'win'
      lines.push('ENEMY CAPITAL TAKEN. THEATER WON.')
    } else if (next[0]!.owner === 'AI') {
      nextOutcome = 'lose'
      lines.push('HOME CAPITAL FALLEN. THEATER LOST.')
    } else if (turn >= MAX_TURNS) {
      // Decide stalemate by who holds more sectors.
      const usHeld = next.filter((s) => s.owner === 'US').length
      const aiHeld = next.length - usHeld
      if (usHeld > aiHeld) {
        nextOutcome = 'win'
        lines.push('ARMISTICE. YOU HOLD MORE GROUND. MARGINAL VICTORY.')
      } else if (aiHeld > usHeld) {
        nextOutcome = 'lose'
        lines.push('ARMISTICE. ENEMY HOLDS MORE GROUND. DEFEAT.')
      } else {
        nextOutcome = 'stalemate'
        lines.push('THE FRONT IS FROZEN. STALEMATE. NO ONE WINS.')
      }
    }
    void fin

    setSectors(next)
    setReserve(nextOutcome ? 0 : newReserve)
    setAiReserve(newAiReserve + REINFORCE)
    setPending({})
    setTurn((t) => t + 1)
    setLog((prev) => [...prev.slice(-6), ...lines])
    setCritLog(crit)
    setOutcome(nextOutcome)
  }

  return (
    <div className="wg-screen" data-testid="game-theaterwide-tactical">
      <div className="wg-out" style={{ overflow: 'auto' }}>
        <div className="wg-big">THEATERWIDE TACTICAL WARFARE</div>
        <div className="wg-dim" style={{ marginBottom: '0.6rem' }}>
          WOPR THEATER SIMULATION // PUSH THE FRONT ONTO THE ENEMY CAPITAL
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
            RESERVE POOL <span className="wg-amber">{available}</span> / {reserve}
          </span>
          <span className="wg-dim">COMMITTED {committed}</span>
          <span className="wg-dim">
            TURN {Math.min(turn, MAX_TURNS)}/{MAX_TURNS}
          </span>
          <span className="wg-dim">ENEMY RESERVE ~{aiReserve}</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${SECTORS.length}, 1fr)`,
            gap: '0.3rem',
            marginBottom: '0.6rem',
          }}
          data-testid="front-map"
        >
          {sectors.map((s, i) => {
            const mine = s.owner === 'US'
            const isCapital = i === 0 || i === 4
            const canReinforce =
              !outcome && (s.owner === 'US' || i === pressTarget)
            const staged = pending[i] ?? 0
            return (
              <div
                key={i}
                style={{
                  border: `1px solid ${
                    mine ? 'rgba(108,182,255,0.6)' : 'rgba(255,92,92,0.5)'
                  }`,
                  padding: '0.35rem',
                  background: mine
                    ? 'rgba(108,182,255,0.08)'
                    : 'rgba(255,92,92,0.06)',
                  fontSize: '0.78em',
                }}
                data-testid={`sector-${i}`}
              >
                <div className={mine ? 'wg-amber' : 'wg-red'}>
                  {isCapital ? '* ' : ''}
                  {SECTORS[i]}
                </div>
                <div className="wg-dim">{mine ? 'HELD' : 'ENEMY'}</div>
                <div>US {s.usDiv}</div>
                <div className="wg-red">AI {s.aiDiv}</div>
                {canReinforce && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.2rem',
                      alignItems: 'center',
                      marginTop: '0.2rem',
                    }}
                  >
                    <button
                      type="button"
                      className="wg-opt"
                      style={{ border: '1px solid rgba(108,182,255,0.4)' }}
                      data-testid={`sector-minus-${i}`}
                      onClick={() => adjust(i, -1)}
                    >
                      -
                    </button>
                    <span className="wg-amber">+{staged}</span>
                    <button
                      type="button"
                      className="wg-opt"
                      style={{ border: '1px solid rgba(108,182,255,0.4)' }}
                      data-testid={`sector-plus-${i}`}
                      onClick={() => adjust(i, 1)}
                    >
                      +
                    </button>
                  </div>
                )}
                {!canReinforce && i === pressTarget && !outcome && (
                  <div className="wg-dim" style={{ marginTop: '0.2rem' }}>
                    CONTESTED
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="wg-dim" style={{ marginBottom: '0.4rem' }}>
          REINFORCE HELD SECTORS OR STAGE AN ASSAULT ON THE CONTESTED SECTOR
          ({SECTORS[pressTarget]}), THEN ADVANCE.
        </div>

        {!outcome && (
          <div className="wg-opts">
            <button
              type="button"
              className="wg-opt wg-amber"
              data-testid="resolve-turn"
              style={{ border: '1px solid rgba(255,184,77,0.5)' }}
              onClick={resolveTurn}
            >
              &gt; EXECUTE TURN (RESOLVE COMBAT)
            </button>
          </div>
        )}

        <div
          className="wg-log"
          data-testid="battle-log"
          style={{ marginTop: '0.8rem', height: 'clamp(5rem,20vh,10rem)' }}
        >
          {log.map((l, i) => (
            <span key={i} className={critLog && i >= log.length - 2 ? 'crit' : undefined}>
              {l}
            </span>
          ))}
        </div>

        {outcome && (
          <div style={{ marginTop: '1rem' }} data-testid="game-result">
            <div
              className={
                outcome === 'win'
                  ? 'wg-big wg-amber'
                  : outcome === 'lose'
                    ? 'wg-big wg-red'
                    : 'wg-big'
              }
            >
              {outcome === 'win'
                ? 'THEATER WON. THE ENEMY CAPITAL IS YOURS.'
                : outcome === 'lose'
                  ? 'THEATER LOST. THE CAPITAL HAS FALLEN.'
                  : 'STALEMATE. THE FRONT IS FROZEN IN PLACE.'}
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

export const entry: GameEntry = {
  id: 'THEATERWIDE TACTICAL WARFARE',
  Component: TheaterwideTactical,
}
