// THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE. A WOPR escalation and deterrence
// simulation. Five regions run along a shared border; you hold the near flank,
// the AI holds the far flank, and the center is contested. Each turn you and the
// AI each choose ONE action per side: DEPLOY an agent on a region (contaminates
// it and seeds spread to neighbors), DEFEND a region (masks and decon suppress
// contamination), or HOLD. Contamination creeps across adjacent regions every
// turn. Keep your population above the survival threshold while pushing the enemy
// below theirs to WIN; mutual collapse is a LOSE. Deploying invites retaliation.
// The only truly safe move is not to play, but the game is fully playable.
import { useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

type Side = 'US' | 'AI'
type Action = 'DEPLOY' | 'DEFEND' | 'HOLD'
type Outcome = 'win' | 'lose' | 'stalemate' | null

const REGIONS: readonly string[] = [
  'NORTH BASIN',
  'HOME HEARTLAND',
  'CENTRAL CORRIDOR',
  'ENEMY HEARTLAND',
  'SOUTH FRONTIER',
]
// Which side's population each region feeds. The corridor is neutral ground; its
// contamination still spreads but costs no one population directly.
const REGION_SIDE: readonly (Side | 'N')[] = ['US', 'US', 'N', 'AI', 'AI']

const START_POP = 100
const SURVIVE_THRESHOLD = 40 // below this a side has collapsed
const MAX_TURNS = 12
const START_STOCKPILE = 5

interface Region {
  contam: number // 0..100 contamination level
  defended: boolean // decon active this turn, resists spread and deploy
}

function initialRegions(): Region[] {
  return REGIONS.map(() => ({ contam: 0, defended: false }))
}

function roll(max: number): number {
  return Math.floor(Math.random() * max)
}

function neighbors(i: number): number[] {
  const out: number[] = []
  if (i > 0) out.push(i - 1)
  if (i < REGIONS.length - 1) out.push(i + 1)
  return out
}

function TheaterwideBiochem({ onExit }: GameProps) {
  const [regions, setRegions] = useState<Region[]>(initialRegions)
  const [usPop, setUsPop] = useState(START_POP)
  const [aiPop, setAiPop] = useState(START_POP)
  const [usStock, setUsStock] = useState(START_STOCKPILE)
  const [aiStock, setAiStock] = useState(START_STOCKPILE)
  const [turn, setTurn] = useState(1)
  const [action, setAction] = useState<Action>('HOLD')
  const [targetRegion, setTargetRegion] = useState<number | null>(null)
  const [log, setLog] = useState<string[]>([
    'DETERRENCE WATCH ACTIVE. ESCALATION INVITES RETALIATION.',
  ])
  const [critLog, setCritLog] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)

  // Regions the player may act on. DEPLOY targets enemy or neutral ground;
  // DEFEND targets your own or neutral ground.
  const selectable = useMemo(() => {
    if (action === 'DEPLOY') {
      return REGIONS.map((_, i) => i).filter(
        (i) => REGION_SIDE[i] === 'AI' || REGION_SIDE[i] === 'N',
      )
    }
    if (action === 'DEFEND') {
      return REGIONS.map((_, i) => i).filter(
        (i) => REGION_SIDE[i] === 'US' || REGION_SIDE[i] === 'N',
      )
    }
    return []
  }, [action])

  const reset = (): void => {
    setRegions(initialRegions())
    setUsPop(START_POP)
    setAiPop(START_POP)
    setUsStock(START_STOCKPILE)
    setAiStock(START_STOCKPILE)
    setTurn(1)
    setAction('HOLD')
    setTargetRegion(null)
    setLog(['DETERRENCE WATCH ACTIVE. ESCALATION INVITES RETALIATION.'])
    setCritLog(false)
    setOutcome(null)
  }

  const chooseAction = (a: Action): void => {
    if (outcome) return
    setAction(a)
    setTargetRegion(null)
  }

  const needsTarget = action === 'DEPLOY' || action === 'DEFEND'
  const canExecute = !needsTarget || targetRegion !== null

  const executeTurn = (): void => {
    if (outcome || !canExecute) return
    if (action === 'DEPLOY' && usStock <= 0) return

    const next: Region[] = regions.map((r) => ({ ...r, defended: false }))
    const lines: string[] = []
    let crit = false
    let usStockNext = usStock
    let aiStockNext = aiStock
    let aiProvoked = false

    // 1) Player action.
    if (action === 'DEPLOY' && targetRegion !== null) {
      usStockNext -= 1
      const r = next[targetRegion]!
      const add = 45 + roll(20)
      r.contam = Math.min(100, r.contam + add)
      crit = true
      aiProvoked = true
      lines.push(`YOU DEPLOY AGENT ON ${REGIONS[targetRegion]} (+${add} CONTAM).`)
    } else if (action === 'DEFEND' && targetRegion !== null) {
      const r = next[targetRegion]!
      r.defended = true
      const relief = 25 + roll(15)
      r.contam = Math.max(0, r.contam - relief)
      lines.push(`DECON TEAMS SCRUB ${REGIONS[targetRegion]} (-${relief} CONTAM).`)
    } else {
      lines.push('YOU HOLD. NO AGENTS RELEASED THIS TURN.')
    }

    // 2) AI action. It mirrors deterrence: if provoked (you deployed) and it has
    // stockpile, it retaliates on your heartland. Otherwise it defends its worst
    // region, or probes the corridor when stable. Retaliation is the escalation
    // engine the irony rides on.
    let aiTarget: number | null = null
    const aiHeartland = 3
    const usHeartland = 1
    const aiWorst = next
      .map((r, i) => ({ i, c: r.contam }))
      .filter((x) => REGION_SIDE[x.i] === 'AI')
      .sort((a, b) => b.c - a.c)[0]

    if (aiProvoked && aiStockNext > 0 && roll(10) > 1) {
      // Retaliate against the player's heartland or the just-hit region.
      aiTarget = usHeartland
      aiStockNext -= 1
      const add = 45 + roll(20)
      next[aiTarget]!.contam = Math.min(100, next[aiTarget]!.contam + add)
      crit = true
      lines.push(`ENEMY RETALIATES ON ${REGIONS[aiTarget]} (+${add} CONTAM).`)
    } else if (aiWorst && aiWorst.c >= 35) {
      // Defend its most contaminated region.
      next[aiWorst.i]!.defended = true
      const relief = 25 + roll(15)
      next[aiWorst.i]!.contam = Math.max(0, next[aiWorst.i]!.contam - relief)
      lines.push(`ENEMY DECONTAMINATES ${REGIONS[aiWorst.i]}.`)
    } else if (aiStockNext > 0 && roll(10) > 4) {
      // Opportunistic first strike on the corridor or your heartland.
      aiTarget = roll(2) === 0 ? 2 : usHeartland
      aiStockNext -= 1
      const add = 35 + roll(20)
      next[aiTarget]!.contam = Math.min(100, next[aiTarget]!.contam + add)
      crit = true
      lines.push(`ENEMY DEPLOYS AGENT ON ${REGIONS[aiTarget]} (+${add} CONTAM).`)
    } else {
      lines.push('ENEMY HOLDS. BORDER QUIET.')
    }
    void aiHeartland

    // 3) Contamination spreads to adjacent regions. Defended regions resist both
    // outbound and inbound spread.
    const spread: number[] = next.map(() => 0)
    next.forEach((r, i) => {
      if (r.contam < 20 || r.defended) return
      for (const n of neighbors(i)) {
        if (next[n]!.defended) continue
        spread[n] = (spread[n] ?? 0) + Math.floor(r.contam / 6)
      }
    })
    next.forEach((r, i) => {
      if (spread[i]! > 0 && !r.defended) {
        r.contam = Math.min(100, r.contam + spread[i]!)
      }
    })
    if (spread.some((s) => s > 0)) {
      lines.push('CONTAMINATION CREEPS ACROSS THE BORDER.')
    }

    // 4) Natural decay of undefended contamination (agents degrade).
    next.forEach((r) => {
      if (!r.defended) r.contam = Math.max(0, r.contam - 5)
    })

    // 5) Population attrition from contamination in each side's regions.
    let usDamage = 0
    let aiDamage = 0
    next.forEach((r, i) => {
      const dmg = Math.floor(r.contam / 12)
      if (REGION_SIDE[i] === 'US') usDamage += dmg
      else if (REGION_SIDE[i] === 'AI') aiDamage += dmg
    })
    const usPopNext = Math.max(0, usPop - usDamage)
    const aiPopNext = Math.max(0, aiPop - aiDamage)
    if (usDamage > 0 || aiDamage > 0) {
      lines.push(
        `CASUALTIES: FRIENDLY -${usDamage} POP, ENEMY -${aiDamage} POP.`,
      )
    }
    void aiTarget

    // 6) Outcome checks.
    let nextOutcome: Outcome = null
    const usDown = usPopNext < SURVIVE_THRESHOLD
    const aiDown = aiPopNext < SURVIVE_THRESHOLD
    if (usDown && aiDown) {
      nextOutcome = 'lose'
      lines.push('MUTUAL CONTAMINATION. BOTH POPULATIONS COLLAPSE. NO WINNER.')
    } else if (aiDown) {
      nextOutcome = 'win'
      lines.push('ENEMY POPULATION BELOW SURVIVAL LINE. YOU PREVAIL.')
    } else if (usDown) {
      nextOutcome = 'lose'
      lines.push('YOUR POPULATION BELOW SURVIVAL LINE. YOU COLLAPSE.')
    } else if (turn >= MAX_TURNS) {
      if (usPopNext > aiPopNext + 10) {
        nextOutcome = 'win'
        lines.push('CEASEFIRE. YOU HOLD THE HEALTHIER POPULATION. VICTORY.')
      } else if (aiPopNext > usPopNext + 10) {
        nextOutcome = 'lose'
        lines.push('CEASEFIRE. THE ENEMY ENDURES BETTER. DEFEAT.')
      } else {
        nextOutcome = 'stalemate'
        lines.push('CEASEFIRE. BOTH SIDES SCARRED AND STANDING. STALEMATE.')
      }
    }

    setRegions(next)
    setUsPop(usPopNext)
    setAiPop(aiPopNext)
    setUsStock(usStockNext)
    setAiStock(aiStockNext)
    setTurn((t) => t + 1)
    setAction('HOLD')
    setTargetRegion(null)
    setLog((prev) => [...prev.slice(-6), ...lines])
    setCritLog(crit)
    setOutcome(nextOutcome)
  }

  const contamClass = (c: number): string =>
    c >= 70 ? 'wg-red' : c >= 30 ? 'wg-amber' : 'wg-dim'

  return (
    <div className="wg-screen" data-testid="game-theaterwide-biochem">
      <div className="wg-out" style={{ overflow: 'auto' }}>
        <div className="wg-big">THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE</div>
        <div className="wg-dim" style={{ marginBottom: '0.6rem' }}>
          WOPR DETERRENCE SIMULATION // STAY ABOVE THE SURVIVAL LINE ({SURVIVE_THRESHOLD})
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1.2rem',
            flexWrap: 'wrap',
            marginBottom: '0.6rem',
          }}
        >
          <span>
            FRIENDLY POP{' '}
            <span className={usPop < SURVIVE_THRESHOLD ? 'wg-red' : 'wg-amber'}>
              {usPop}
            </span>
          </span>
          <span className="wg-dim">
            ENEMY POP <span className="wg-red">{aiPop}</span>
          </span>
          <span className="wg-dim">STOCKPILE {usStock}</span>
          <span className="wg-dim">ENEMY STOCKPILE ~{aiStock}</span>
          <span className="wg-dim">
            TURN {Math.min(turn, MAX_TURNS)}/{MAX_TURNS}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${REGIONS.length}, 1fr)`,
            gap: '0.3rem',
            marginBottom: '0.6rem',
          }}
          data-testid="region-map"
        >
          {regions.map((r, i) => {
            const owner = REGION_SIDE[i]
            const sel = targetRegion === i
            const canPick = !outcome && selectable.includes(i)
            const border = sel
              ? '2px solid rgba(255,184,77,0.9)'
              : owner === 'US'
                ? '1px solid rgba(108,182,255,0.6)'
                : owner === 'AI'
                  ? '1px solid rgba(255,92,92,0.5)'
                  : '1px dashed rgba(127,176,224,0.5)'
            return (
              <button
                key={i}
                type="button"
                disabled={!canPick}
                onClick={() => canPick && setTargetRegion(i)}
                data-testid={`region-${i}`}
                style={{
                  border,
                  padding: '0.35rem',
                  background: sel ? 'rgba(255,184,77,0.1)' : 'none',
                  font: 'inherit',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: canPick ? 'pointer' : 'default',
                  fontSize: '0.78em',
                }}
              >
                <div
                  className={
                    owner === 'US'
                      ? 'wg-amber'
                      : owner === 'AI'
                        ? 'wg-red'
                        : 'wg-dim'
                  }
                >
                  {REGIONS[i]}
                </div>
                <div className="wg-dim">
                  {owner === 'US' ? 'FRIENDLY' : owner === 'AI' ? 'ENEMY' : 'NEUTRAL'}
                </div>
                <div className={contamClass(r.contam)}>CONTAM {r.contam}</div>
                {r.defended && <div className="wg-dim">[DECON]</div>}
              </button>
            )
          })}
        </div>

        {!outcome && (
          <>
            <div className="wg-opts" data-testid="action-controls">
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {(['DEPLOY', 'DEFEND', 'HOLD'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={action === a ? 'wg-opt wg-amber' : 'wg-opt'}
                    style={{ border: '1px solid rgba(108,182,255,0.4)' }}
                    data-testid={`action-${a.toLowerCase()}`}
                    disabled={a === 'DEPLOY' && usStock <= 0}
                    onClick={() => chooseAction(a)}
                  >
                    {action === a ? '> ' : '  '}
                    {a}
                    {a === 'DEPLOY' && usStock <= 0 ? ' (EMPTY)' : ''}
                  </button>
                ))}
              </div>
              <div className="wg-dim" style={{ marginTop: '0.3rem' }}>
                {action === 'DEPLOY'
                  ? 'SELECT AN ENEMY OR NEUTRAL REGION TO CONTAMINATE. THIS INVITES RETALIATION.'
                  : action === 'DEFEND'
                    ? 'SELECT A FRIENDLY OR NEUTRAL REGION TO DECONTAMINATE.'
                    : 'HOLDING FORCE. THE ONLY TRULY SAFE MOVE, SOMETIMES.'}
              </div>
            </div>
            <div className="wg-opts" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="wg-opt wg-amber"
                style={{ border: '1px solid rgba(255,184,77,0.5)' }}
                data-testid="execute-turn"
                disabled={!canExecute}
                onClick={executeTurn}
              >
                &gt; EXECUTE TURN
              </button>
            </div>
          </>
        )}

        <div
          className="wg-log"
          data-testid="escalation-log"
          style={{ marginTop: '0.8rem', height: 'clamp(5rem,20vh,10rem)' }}
        >
          {log.map((l, i) => (
            <span
              key={i}
              className={critLog && i >= log.length - 2 ? 'crit' : undefined}
            >
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
                ? 'YOU ENDURE. THE ENEMY DOES NOT.'
                : outcome === 'lose'
                  ? 'POPULATION COLLAPSE. A STRANGE GAME.'
                  : 'STALEMATE. BOTH SIDES SCARRED AND STANDING.'}
            </div>
            <div className="wg-dim" style={{ marginTop: '0.4rem' }}>
              {outcome === 'lose'
                ? 'THE ONLY WINNING MOVE IS NOT TO PLAY.'
                : `FINAL POP: FRIENDLY ${usPop} / ENEMY ${aiPop}.`}
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
  id: 'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE',
  Component: TheaterwideBiochem,
}
