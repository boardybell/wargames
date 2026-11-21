// THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE. A twelve-turn deterrence
// simulation over five linked regions: DEPLOY, DEFEND or HOLD each turn against
// a WOPR whose declared posture follows a persistent escalation level. Rules
// live in engines/theaterwide-biochem.ts (pure, fixture-tested).
// Design: docs/games-design-review.md §14.
import { useMemo, useRef, useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, Bar, GameReport, GameResult, GameShell, Panel, type Metric } from './ui/GameShell'
import { cue, fmtWLD, newSeed, rng, useEventLog, useGameKeys, useGameRecords, usePhone, type WLD } from './hooks'
import {
  AI_DECON_AT,
  CEASEFIRE_MARGIN,
  DECAY,
  MAX_ESCALATION,
  MAX_TURNS,
  REGION_NAMES,
  REGION_SHORT,
  REGION_SIDE,
  RESTRAINT_TURNS,
  SPREAD_FROM,
  START_POP,
  SURVIVE_AT,
  actionProblem,
  damageOf,
  debrief,
  eligibleTargets,
  headline,
  initialState,
  playTurn,
  posture,
  spreadPlan,
  type ActionKind,
  type State,
  type TurnReport,
} from './engines/theaterwide-biochem'
import './styles/theaterwide-biochem.css'

const SLUG = 'theaterwide-biochem'
const KINDS: readonly ActionKind[] = ['DEPLOY', 'DEFEND', 'HOLD']
const sideName = (i: number): string => (REGION_SIDE[i] === 'US' ? 'FRIENDLY' : REGION_SIDE[i] === 'AI' ? 'ENEMY' : 'NEUTRAL')
const sideClass = (i: number): string => (REGION_SIDE[i] === 'US' ? 'is-us' : REGION_SIDE[i] === 'AI' ? 'is-ai' : 'is-n')
const pct = (x: number): string => `${Math.round(x * 100)}%`
const names = (ts: readonly number[]): string => ts.map((t) => REGION_NAMES[t]).join(' + ')

function TheaterwideBiochem({ onExit }: GameProps) {
  const rec = useGameRecords(SLUG)
  const [game, setGame] = useState<{ state: State; id: number }>(() => ({ state: initialState(), id: newSeed() }))
  const rand = useRef(rng(game.id))
  const [kind, setKind] = useState<ActionKind>('HOLD')
  const [target, setTarget] = useState<number | null>(null)
  const [inspect, setInspect] = useState(1)
  const [last, setLast] = useState<TurnReport | null>(null)
  const log = useEventLog()
  const phone = usePhone()

  const s = game.state
  const action = { kind, target: kind === 'HOLD' ? null : target }
  const problem = actionProblem(s, action)
  const eligible = useMemo(() => (kind === 'HOLD' ? [] : eligibleTargets(kind)), [kind])
  const pos = posture(s.escalation)
  // Spread under current conditions, with your pending DEFEND applied.
  const defendedNow = s.regions.map((_, i) => kind === 'DEFEND' && target === i)
  const plan = spreadPlan(
    s.regions.map((r) => r.contam),
    defendedNow,
  )

  const restart = (): void => {
    const id = newSeed()
    rand.current = rng(id)
    setGame({ state: initialState(), id })
    setKind('HOLD')
    setTarget(null)
    setInspect(1)
    setLast(null)
    log.reset()
  }

  const chooseKind = (k: ActionKind): void => {
    if (s.result) return
    if (k === 'DEPLOY' && s.usStock <= 0) return cue.deny()
    setKind(k)
    // Keep the inspected region as the target when it is eligible.
    setTarget(k !== 'HOLD' && eligibleTargets(k).includes(inspect) ? inspect : null)
    cue.select()
  }
  const pickRegion = (i: number): void => {
    setInspect(i)
    if (!s.result && kind !== 'HOLD' && eligibleTargets(kind).includes(i)) setTarget(i)
    cue.select()
  }

  const execute = (): void => {
    if (problem) return cue.deny()
    const { state, report } = playTurn(s, action, rand.current)
    setGame((g) => ({ ...g, state }))
    setLast(report)
    setKind('HOLD')
    setTarget(null)

    const ev: { text: string; kind?: 'info' | 'good' | 'bad' | 'warn' }[] = []
    const you = report.us
    ev.push({
      text:
        you.kind === 'HOLD'
          ? `TURN ${report.turn}. YOU HOLD. NO AGENT RELEASED.`
          : you.kind === 'DEFEND'
            ? `TURN ${report.turn}. YOU DEFEND ${REGION_NAMES[you.target!]}: SCRUBBED -${report.scrubs.find((x) => x.by === 'US')?.amount ?? 0}, INCOMING HALVED, SPREAD BLOCKED.`
            : `TURN ${report.turn}. YOU DEPLOY ON ${REGION_NAMES[you.target!]}.`,
      kind: you.kind === 'DEPLOY' ? 'warn' : 'info',
    })
    for (const d of report.deployments) {
      ev.push({
        text: `${d.by === 'US' ? 'YOUR AGENT' : 'WOPR AGENT'} ON ${REGION_NAMES[d.target]}: +${d.applied}${d.halved ? ` (HALVED FROM ${d.rolled} BY DEFENSE)` : ''}.`,
        kind: d.by === 'AI' ? 'bad' : 'warn',
      })
    }
    for (const sc of report.scrubs.filter((x) => x.by === 'AI')) ev.push({ text: `WOPR DECONTAMINATES ${REGION_NAMES[sc.target]} (-${sc.amount}).` })
    if (report.ai.every((a) => a.kind === 'HOLD')) ev.push({ text: `WOPR HOLDS (${report.posture.name}).` })
    const spreadTotal = report.spread.reduce((a, b) => a + b.amount, 0)
    if (spreadTotal) ev.push({ text: `SPREAD MOVED ${spreadTotal} CONTAMINATION BETWEEN NEIGHBORS.` })
    ev.push({
      text: `CASUALTIES: FRIENDLY -${report.damage.us}, ENEMY -${report.damage.ai}. ESCALATION ${report.escalation.before} → ${report.escalation.after}.`,
      kind: report.damage.us > report.damage.ai ? 'bad' : 'info',
    })
    if (state.result) ev.push({ text: headline(state.result), kind: state.result.outcome === 'win' ? 'good' : state.result.outcome === 'lose' ? 'bad' : 'warn' })
    log.push(...ev)

    if (state.result) {
      const o = state.result.outcome
      if (o === 'win') cue.win()
      else if (o === 'lose') cue.lose()
      else cue.draw()
      rec.recordOnce(String(game.id), () => {
        rec.tally('wld', o)
        rec.update<number>('bestPop', (p) => Math.max(p ?? 0, state.usPop))
      })
    } else if (report.escalation.after >= 4 && report.escalation.before < 4) cue.alarm()
    else if (report.deployments.some((d) => d.by === 'AI')) cue.hit()
    else if (report.deployments.length) cue.boom()
    else cue.tick()
  }

  useGameKeys((k) => {
    if (k === 'ArrowLeft' || k === 'ArrowUp') return setInspect((i) => Math.max(0, i - 1)), true
    if (k === 'ArrowRight' || k === 'ArrowDown') return setInspect((i) => Math.min(4, i + 1)), true
    if (s.result) return
    if (k === '1') return chooseKind('DEPLOY'), true
    if (k === '2') return chooseKind('DEFEND'), true
    if (k === '3') return chooseKind('HOLD'), true
    if (k === 't' || k === 'T') return pickRegion(inspect), true
    if (k === 'x' || k === 'X') return execute(), true
  })

  // ---------------------------------------------------------------- view
  const record = rec.get<WLD | undefined>('wld', undefined)
  const best = rec.get<number | undefined>('bestPop', undefined)
  const turnShown = Math.min(s.turn, MAX_TURNS)
  const metrics: Metric[] = [
    { label: 'TURN', value: `${turnShown}/${MAX_TURNS}` },
    { label: 'STOCKPILE', value: s.usStock, tone: 'amber' },
    { label: 'ENEMY STOCKPILE', value: s.aiStock, tone: 'red' },
    { label: 'ESCALATION', value: `${s.escalation}/${MAX_ESCALATION}`, tone: s.escalation >= 3 ? 'red' : 'normal' },
    { label: 'RECORD', value: fmtWLD(record), tone: 'dim' },
    ...(best !== undefined ? [{ label: 'BEST POP', value: best, tone: 'dim' as const }] : []),
  ]

  const phase = s.result
    ? 'CONFLICT OVER'
    : kind === 'HOLD'
      ? `TURN ${s.turn}/${MAX_TURNS}. SURVIVE AT ${SURVIVE_AT} OR MORE. CHOOSE DEPLOY, DEFEND OR HOLD.`
      : target === null
        ? `TURN ${s.turn}. ${kind}: SELECT A TARGET REGION.`
        : `TURN ${s.turn}. ${kind} ${REGION_NAMES[target]}. EXECUTE TURN.`

  const help = (
    <>
      <p>
        FIVE LINKED REGIONS. YOU HOLD NORTH BASIN AND HOME HEARTLAND; THE ENEMY HOLDS ENEMY HEARTLAND AND SOUTH FRONTIER; THE
        CENTRAL CORRIDOR IS NEUTRAL. EACH SIDE STARTS WITH {START_POP} POPULATION.
      </p>
      <ul>
        <li>SURVIVE AT {SURVIVE_AT} OR MORE. A SIDE BELOW {SURVIVE_AT} HAS COLLAPSED: ENEMY ONLY = WIN, YOU ONLY = LOSS, BOTH = MUTUAL COLLAPSE (LOSS).</li>
        <li>
          CEASEFIRE AFTER TURN {MAX_TURNS}: A POPULATION LEAD OF MORE THAN {CEASEFIRE_MARGIN} WINS FOR THAT SIDE; OTHERWISE PARITY (DRAW).
          SURVIVING ALONE DOES NOT WIN.
        </li>
        <li>DEPLOY (SPENDS 1 STOCKPILE): +40 TO +59 CONTAMINATION ON AN ENEMY OR NEUTRAL REGION.</li>
        <li>
          DEFEND A FRIENDLY OR NEUTRAL REGION FOR ONE TURN: SCRUBS 25 TO 39, HALVES ANY AGENT DEPLOYED INTO IT THAT TURN, AND IT
          NEITHER RECEIVES NOR SENDS SPREAD. NO STOCKPILE NEEDED.
        </li>
        <li>
          TURN ORDER: DEFENSES, DEPLOYMENTS, SPREAD (EVERY UNDEFENDED REGION AT {SPREAD_FROM}+ ADDS LEVEL/6 TO EACH UNDEFENDED NEIGHBOR),
          DECAY (-{DECAY} UNDEFENDED), CASUALTIES (LEVEL/12 PER REGION A SIDE HOLDS).
        </li>
        <li>
          ESCALATION (0-{MAX_ESCALATION}) PERSISTS: +2 WHEN YOU DEPLOY, +1 WHEN WOPR DEPLOYS, -1 AFTER {RESTRAINT_TURNS} CONSECUTIVE
          TURNS WITHOUT YOUR DEPLOYMENT. IT SETS WOPR'S DECLARED POSTURE FOR THE NEXT TURN: CALM 5%, WARY 15%, GUARDED 35% STRIKE
          CHANCE ON THE CORRIDOR; HOSTILE 60% ON HOME HEARTLAND; RETALIATORY 85-95% SALVO ON HOME HEARTLAND AND NORTH BASIN. WHEN IT
          DOES NOT STRIKE IT DECONTAMINATES ITS WORST REGION AT {AI_DECON_AT}+. A LOW POSTURE IS NOT A GUARANTEE.
        </li>
        <li>WOPR CHOOSES AT THE SAME TIME AS YOU, FROM THE START-OF-TURN MAP. IT NEVER SEES YOUR CHOICE.</li>
        <li>KEYS: 1 DEPLOY, 2 DEFEND, 3 HOLD, ARROWS INSPECT, T TARGET INSPECTED REGION, X EXECUTE.</li>
      </ul>
    </>
  )

  const popPanel = (
    <Panel title="POPULATION · SURVIVE AT 40 OR MORE" className="bc-pop">
      <Bar label="FRIENDLY" value={s.usPop} max={START_POP} tone={s.usPop < SURVIVE_AT ? 'red' : 'normal'} marker={SURVIVE_AT} markerLabel="Survival line 40" />
      <Bar label="ENEMY" value={s.aiPop} max={START_POP} tone="red" marker={SURVIVE_AT} markerLabel="Survival line 40" />
      <p className="bc-note">
        AMBER MARK = {SURVIVE_AT}. CEASEFIRE NEEDS A LEAD OF MORE THAN {CEASEFIRE_MARGIN}. NOW:{' '}
        {s.usPop === s.aiPop ? 'EVEN' : s.usPop > s.aiPop ? `YOU LEAD BY ${s.usPop - s.aiPop}` : `ENEMY LEADS BY ${s.aiPop - s.usPop}`}.
      </p>
    </Panel>
  )

  const posturePanel = (
    <Panel title="WOPR DECLARED POSTURE" className="bc-posture">
      <div className="bc-esc" role="meter" aria-label="Escalation" aria-valuemin={0} aria-valuemax={MAX_ESCALATION} aria-valuenow={s.escalation}>
        {Array.from({ length: MAX_ESCALATION }, (_, i) => (
          <span key={i} className={`bc-pip${i < s.escalation ? ' is-on' : ''}`} />
        ))}
        <span className="bc-esc-label">
          {pos.name} · {s.escalation}/{MAX_ESCALATION}
        </span>
      </div>
      <p>
        {s.aiStock > 0
          ? `${pct(pos.strike)} STRIKE CHANCE ON ${names(pos.targets)}${pos.targets.length > 1 ? ' (SALVO)' : ''}. OTHERWISE DECON ITS WORST REGION AT ${AI_DECON_AT}+, OR HOLD.`
          : `ENEMY STOCKPILE EMPTY. IT CAN ONLY DECONTAMINATE OR HOLD.`}
      </p>
      <p className="bc-note">
        RESTRAINT {s.restraint}/{RESTRAINT_TURNS}: {RESTRAINT_TURNS - s.restraint} MORE TURN{RESTRAINT_TURNS - s.restraint === 1 ? '' : 'S'} WITHOUT DEPLOYING LOWERS ESCALATION.
        DEPLOYING RAISES IT BY 2.
      </p>
    </Panel>
  )

  const spreadOut = (i: number) => plan.filter((p) => p.from === i)
  const spreadIn = (i: number) => plan.filter((p) => p.to === i)
  const linkAt = (i: number) => ({
    right: plan.find((p) => p.from === i && p.to === i + 1)?.amount ?? 0,
    left: plan.find((p) => p.from === i + 1 && p.to === i)?.amount ?? 0,
  })

  const chain = (
    <div className="bc-chain-wrap">
      <ol className="bc-chain" aria-label="Regions, linked in a chain" data-testid="region-map">
        {s.regions.map((r, i) => {
          const isTarget = target === i && kind !== 'HOLD'
          const canTarget = !s.result && eligible.includes(i)
          const link = i < 4 ? linkAt(i) : null
          return (
            <li key={i} className="bc-li">
              <button
                type="button"
                className={`bc-node ${sideClass(i)}${inspect === i ? ' is-inspect' : ''}${isTarget ? ' is-target' : ''}${canTarget ? ' is-eligible' : ''}`}
                aria-pressed={inspect === i}
                aria-label={`${REGION_NAMES[i]}, ${sideName(i).toLowerCase()}, contamination ${r.contam}${isTarget ? `, ${kind} target` : ''}`}
                onClick={() => pickRegion(i)}
                data-testid={`region-${i}`}
              >
                <span className="bc-node-name">{REGION_SHORT[i]}</span>
                <span className="bc-node-side">{sideName(i)}</span>
                <span className="bc-cbar" aria-hidden="true">
                  <span className={`bc-cfill${r.contam >= 70 ? ' is-hot' : r.contam >= 30 ? ' is-warm' : ''}`} style={{ width: `${r.contam}%` }} />
                </span>
                <span className="bc-node-num">{r.contam}</span>
                <span className="bc-node-mark">
                  {isTarget ? (kind === 'DEFEND' ? 'DEFEND' : 'TARGET') : r.defended ? 'DECON LAST' : canTarget ? 'ELIGIBLE' : ''}
                </span>
              </button>
              {link && (
                <span className="bc-link" aria-hidden="true">
                  <span className={`bc-flow bc-fwd${link.right ? '' : ' is-off'}`}>{link.right || 0}</span>
                  <span className={`bc-flow bc-back${link.left ? '' : ' is-off'}`}>{link.left || 0}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="bc-legend">CONTAMINATION 0-100 PER REGION. ARROWS: SPREAD EXPECTED NEXT TURN FROM CURRENT LEVELS (BEFORE NEW AGENTS).</p>
    </div>
  )

  const ir = s.regions[inspect]!
  const out = spreadOut(inspect)
  const inn = spreadIn(inspect)
  const inspector = (
    <Panel title="SELECTED REGION" className="bc-inspector">
      <div className="bc-insp-head">
        <span className={`bc-${sideClass(inspect)}`}>{REGION_NAMES[inspect]}</span>
        <span className="bc-tag">{sideName(inspect)}</span>
      </div>
      <Bar label="CONTAM" value={ir.contam} max={100} tone={ir.contam >= 70 ? 'red' : ir.contam >= 30 ? 'amber' : 'normal'} />
      <p>
        {REGION_SIDE[inspect] === 'N'
          ? 'NEUTRAL: COSTS NO POPULATION, BUT SPREADS BOTH WAYS.'
          : `COSTS ${sideName(inspect) === 'FRIENDLY' ? 'YOU' : 'THE ENEMY'} ${damageOf(ir.contam)} POPULATION PER TURN AT THIS LEVEL.`}
      </p>
      <p>
        SPREAD OUT: {out.length ? out.map((p) => `+${p.amount} TO ${REGION_SHORT[p.to]}`).join(', ') : `NONE (UNDER ${SPREAD_FROM} OR DEFENDED)`}. IN:{' '}
        {inn.length ? inn.map((p) => `+${p.amount} FROM ${REGION_SHORT[p.from]}`).join(', ') : 'NONE'}.
      </p>
      <p className="bc-note">
        {kind === 'DEFEND' && target === inspect
          ? 'DEFENSE ORDERED: SCRUB 25-39, INCOMING AGENT HALVED, NO SPREAD IN OR OUT THIS TURN.'
          : ir.defended
            ? 'WAS DEFENDED LAST TURN. DEFENSE LASTS ONE TURN.'
            : 'NOT DEFENDED.'}
      </p>
    </Panel>
  )

  const actionPanel = !s.result && (
    <Panel title="YOUR ACTION" className="bc-action">
      <ActionBar label="Action">
        {KINDS.map((k, n) => (
          <Action
            key={k}
            onClick={() => chooseKind(k)}
            pressed={kind === k}
            disabled={k === 'DEPLOY' && s.usStock <= 0}
            reason={k === 'DEPLOY' && s.usStock <= 0 ? 'STOCKPILE EMPTY' : undefined}
            shortcut={String(n + 1)}
            testId={`action-${k.toLowerCase()}`}
          >
            {k}
          </Action>
        ))}
      </ActionBar>
      <p className="bc-note">
        {kind === 'DEPLOY'
          ? `SPENDS 1 OF ${s.usStock} AGENTS. +40-59 ON THE TARGET. RAISES ESCALATION BY 2.`
          : kind === 'DEFEND'
            ? 'ONE TURN: SCRUB 25-39, HALVE INCOMING AGENT, BLOCK SPREAD.'
            : 'NO ACTION. COUNTS TOWARD RESTRAINT.'}
      </p>
      {kind !== 'HOLD' && (
        <div className="bc-targets" role="group" aria-label={`${kind} target`}>
          <span className="bc-sub">TARGET ({kind === 'DEPLOY' ? 'ENEMY OR NEUTRAL' : 'FRIENDLY OR NEUTRAL'})</span>
          <ActionBar label="Targets">
            {eligible.map((i) => (
              <Action key={i} onClick={() => pickRegion(i)} pressed={target === i} testId={`target-${i}`}>
                {REGION_NAMES[i]}
              </Action>
            ))}
          </ActionBar>
        </div>
      )}
      <ActionBar label="Execute">
        <Action variant="primary" onClick={execute} disabled={!!problem} reason={problem ?? undefined} shortcut="X" testId="execute-turn">
          EXECUTE TURN {s.turn}
        </Action>
      </ActionBar>
    </Panel>
  )

  const result = s.result && (
    <GameResult
      outcome={s.result.outcome}
      headline={headline(s.result)}
      reason={
        <ul className="bc-debrief">
          {debrief(s).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      }
      metrics={[
        { label: 'FRIENDLY', value: s.result.usPop, tone: s.result.usPop < SURVIVE_AT ? 'red' : 'normal' },
        { label: 'ENEMY', value: s.result.aiPop, tone: 'red' },
        { label: 'PEAK ESCALATION', value: s.peakEscalation },
        { label: 'RECORD', value: fmtWLD(record) },
      ]}
    >
      <Action variant="primary" onClick={restart} testId="play-again" autoFocus>
        NEW SIMULATION
      </Action>
      <Action onClick={onExit}>EXIT TO GAMES</Action>
    </GameResult>
  )

  const lastPanel = last && (
    <Panel title={`TURN ${last.turn} CASUALTIES`} className="bc-last">
      <p>
        FRIENDLY -{last.damage.us} · ENEMY -{last.damage.ai} · ESCALATION {last.escalation.before} → {last.escalation.after}
      </p>
    </Panel>
  )

  return (
    <GameShell
      slug={SLUG}
      title="THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE"
      objective={`SURVIVE AT ${SURVIVE_AT} OR MORE. AT CEASEFIRE (TURN ${MAX_TURNS}) A LEAD OF MORE THAN ${CEASEFIRE_MARGIN} WINS.`}
      phase={phase}
      phaseTone={s.result ? (s.result.outcome === 'win' ? 'amber' : s.result.outcome === 'lose' ? 'red' : 'normal') : 'amber'}
      metrics={metrics}
      help={help}
      onRestart={restart}
      inProgress={s.turn > 1 && !s.result}
      restartLabel="NEW SIMULATION"
      onExit={onExit}
      layout="board"
      announce={log.events[log.events.length - 1]?.text}
      side={
        <>
          {!phone && result}
          {!phone && actionPanel}
          {posturePanel}
        </>
      }
      report={
        <>
          {lastPanel}
          <GameReport events={log.events.length ? log.events : [{ id: 0, text: `DETERRENCE WATCH ACTIVE. WOPR POSTURE ${pos.name}.` }]} />
        </>
      }
    >
      {popPanel}
      {chain}
      {/* Phone: action, target and EXECUTE stay together right under the regions. */}
      {phone && result}
      {phone && actionPanel}
      {inspector}
    </GameShell>
  )
}

export const entry: GameEntry = {
  id: 'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE',
  Component: TheaterwideBiochem,
}
