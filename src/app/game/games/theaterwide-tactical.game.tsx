// THEATERWIDE TACTICAL WARFARE. A five-sector front from your capital to the
// enemy capital. Each round you place reserve divisions and choose ADVANCE or
// HOLD; the enemy places its pool by a declared doctrine; one assault and at
// most one counterattack resolve. Rules live in engines/theaterwide-tactical.ts
// (pure, force-conserving, fixture-tested). Design: docs/games-design-review.md §13.
import { useMemo, useRef, useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameReport, GameResult, GameShell, Panel, Segmented, type Metric } from './ui/GameShell'
import { cue, fmtWLD, newSeed, rng, useEventLog, useGameKeys, useGameRecords, usePhone, type WLD } from './hooks'
import {
  AI_CAPITAL,
  AI_REINFORCE,
  AI_START_POOL,
  COUNTER_MARGIN,
  DESPERATION_ROUNDS,
  CAPITAL_BONUS,
  DOCTRINES,
  LINE_BONUS,
  MAX_ROUNDS,
  REINFORCE,
  SECTOR_NAMES,
  SECTOR_SHORT,
  START_POOL,
  US_CAPITAL,
  committed,
  emptyOrders,
  front,
  held,
  initialState,
  ordersProblem,
  playRound,
  preview,
  reconciles,
  type BattleReport,
  type Difficulty,
  type Orders,
  type Result,
  type RoundReport,
  type State,
} from './engines/theaterwide-tactical'
import './styles/theaterwide-tactical.css'

const SLUG = 'theaterwide-tactical'
const DIFFS: readonly { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'EASY' },
  { value: 'normal', label: 'NORMAL' },
  { value: 'hard', label: 'HARD' },
]

function resultText(r: Result): { headline: string; reason: string } {
  switch (r.reason) {
    case 'capital-captured':
      return { headline: 'ENEMY CAPITAL CAPTURED. THEATER WON.', reason: 'YOUR ASSAULT TOOK THE ENEMY CAPITAL.' }
    case 'capital-lost':
      return { headline: 'HOME CAPITAL LOST. THEATER LOST.', reason: 'AN ENEMY COUNTERATTACK OVERRAN YOUR CAPITAL.' }
    case 'armistice':
      return r.outcome === 'win'
        ? { headline: `ARMISTICE. YOU HOLD ${r.usHeld} OF 5 SECTORS.`, reason: `ROUND ${MAX_ROUNDS} ENDED WITH BOTH CAPITALS STANDING. THE MAJORITY OF SECTORS DECIDES: YOURS.` }
        : { headline: `ARMISTICE. THE ENEMY HOLDS ${r.aiHeld} OF 5 SECTORS.`, reason: `ROUND ${MAX_ROUNDS} ENDED WITH BOTH CAPITALS STANDING. THE MAJORITY OF SECTORS DECIDES: THEIRS.` }
  }
}

function battleLine(b: BattleReport): string {
  const who = b.attacker === 'US' ? 'YOUR ASSAULT ON' : 'ENEMY COUNTERATTACK ON'
  const atk = b.committed.assault ? `${b.committed.edge}+${b.committed.assault}` : `${b.committed.attacker}`
  const head = `${who} ${SECTOR_NAMES[b.target]}: ${atk} +${b.atkRoll} = ${b.atkPower} VS ${b.committed.defender} +${b.bonus} +${b.defRoll} = ${b.defPower}.`
  if (b.result === 'breakthrough') {
    const fell = b.retreated ? ` ${b.retreated} FELL BACK TO ${SECTOR_NAMES[b.retreatTo!]}.` : ''
    return `${head} BREAKTHROUGH. ATTACKER LOST ${b.lost.attacker}, DEFENDER LOST ${b.lost.defender}.${fell} ${b.transferred} ADVANCE INTO ${SECTOR_NAMES[b.target]}.`
  }
  const res = b.result === 'repulsed' ? 'REPULSED' : 'LINE HOLDS'
  return `${head} ${res}. ATTACKER LOST ${b.lost.attacker}, DEFENDER LOST ${b.lost.defender}. ${b.withdrawn} WITHDRAW TO ${SECTOR_NAMES[b.from]}.`
}

function allocText(alloc: readonly number[], assault = 0): string {
  const parts = alloc.map((n, i) => (n > 0 ? `+${n} ${SECTOR_SHORT[i]}` : '')).filter(Boolean)
  if (assault > 0) parts.push(`ASSAULT ${assault}`)
  return parts.length ? parts.join(', ') : 'NOTHING'
}

/** Fresh orders default to HOLD: advancing is always an explicit choice. */
const holdOrders = (): Orders => ({ ...emptyOrders(), advance: false })

const pct = (x: number): string => `${Math.round(x * 100)}%`

interface Game {
  readonly state: State
  readonly id: number
}

function TheaterwideTactical({ onExit }: GameProps) {
  const rec = useGameRecords(SLUG)
  const [difficulty, setDifficulty] = useState<Difficulty>(() => rec.get<Difficulty>('difficulty', 'normal'))
  const [game, setGame] = useState<Game>(() => ({ state: initialState(difficulty), id: newSeed() }))
  const rand = useRef(rng(game.id))
  const [orders, setOrders] = useState<Orders>(holdOrders)
  const [selected, setSelected] = useState(() => front(game.state.sectors).contested)
  const [last, setLast] = useState<RoundReport | null>(null)
  const log = useEventLog()
  const phone = usePhone()

  const s = game.state
  const { edge, contested } = front(s.sectors)
  const used = committed(orders)
  const available = s.usPool - used
  const problem = ordersProblem(s, orders)
  const pv = useMemo(() => preview(s, orders), [s, orders])
  const doctrine = DOCTRINES[s.difficulty]
  const pendingDiff = difficulty !== s.difficulty

  const restart = (d: Difficulty = difficulty): void => {
    const id = newSeed()
    rand.current = rng(id)
    const st = initialState(d)
    setGame({ state: st, id })
    setOrders(holdOrders())
    setSelected(front(st.sectors).contested)
    setLast(null)
    log.reset()
  }

  const chooseDifficulty = (d: Difficulty): void => {
    setDifficulty(d)
    rec.update<Difficulty>('difficulty', () => d)
    cue.select()
    // Before the first round there is nothing to lose: apply now.
    if (s.round === 1 && used === 0 && !s.result) restart(d)
  }

  // ---------------------------------------------------------------- orders
  const canAdd = (i: number): boolean =>
    !s.result && available > 0 && (s.sectors[i]!.owner === 'US' || (i === contested && orders.advance))
  const amountAt = (i: number): number => (s.sectors[i]!.owner === 'US' ? orders.alloc[i]! : i === contested ? orders.assault : 0)
  const setAt = (i: number, n: number): void => {
    setOrders((o) => {
      if (s.sectors[i]!.owner === 'US') {
        const alloc = o.alloc.slice()
        alloc[i] = n
        return { ...o, alloc }
      }
      return i === contested ? { ...o, assault: n } : o
    })
  }
  const adjust = (i: number, d: number): void => {
    const cur = amountAt(i)
    if (d > 0 && !canAdd(i)) return cue.deny()
    if (d < 0 && cur === 0) return cue.deny()
    setAt(i, cur + d)
    cue.select()
  }
  const commitAll = (i: number): void => {
    if (!canAdd(i)) return cue.deny()
    setAt(i, amountAt(i) + available)
    cue.select()
  }
  const clear = (): void => {
    setOrders((o) => ({ ...emptyOrders(), advance: o.advance }))
    cue.tick()
  }
  const setAdvance = (advance: boolean): void => {
    if (s.result) return
    setOrders((o) => ({ ...o, advance, assault: advance ? o.assault : 0 }))
    cue.select()
  }

  // ---------------------------------------------------------------- execute
  const execute = (): void => {
    if (problem) return cue.deny()
    const { state, report } = playRound(s, orders, rand.current)
    setGame((g) => ({ ...g, state }))
    setLast(report)
    setOrders(holdOrders())
    setSelected(front(state.sectors).contested)

    const ev: { text: string; kind?: 'info' | 'good' | 'bad' | 'warn' }[] = [
      { text: `ROUND ${report.round}. YOU: ${report.advance ? 'ADVANCE' : 'HOLD'}, ${allocText(report.usAlloc, report.assault)}.` },
      { text: `ENEMY ${doctrine.name}: ${allocText(report.aiAlloc)}.`, kind: 'warn' },
    ]
    if (report.assaultBattle) ev.push({ text: battleLine(report.assaultBattle), kind: report.assaultBattle.result === 'breakthrough' ? 'good' : 'bad' })
    else ev.push({ text: 'NO ASSAULT. YOUR LINE HOLDS POSITION.' })
    if (report.counter) ev.push({ text: battleLine(report.counter), kind: report.counter.result === 'breakthrough' ? 'bad' : 'good' })
    if (report.reinforced.us) ev.push({ text: `REINFORCEMENTS: YOU +${report.reinforced.us}, ENEMY +${report.reinforced.ai}. YOUR RESERVE ${state.usPool}, ENEMY RESERVE ${state.aiPool}.` })
    if (state.result) {
      const t = resultText(state.result)
      ev.push({ text: t.headline, kind: state.result.outcome === 'win' ? 'good' : 'bad' })
    }
    log.push(...ev)

    // One cue per committed event: the decisive one.
    if (state.result) {
      if (state.result.outcome === 'win') cue.win()
      else cue.lose()
      const outcome = state.result.outcome
      rec.recordOnce(String(game.id), () => rec.tally(`wld-${s.difficulty}`, outcome))
    } else if (report.counter?.result === 'breakthrough') cue.alarm()
    else if (report.assaultBattle?.result === 'breakthrough') cue.boom()
    else if (report.assaultBattle || report.counter) cue.hit()
    else cue.tick()
  }

  // ---------------------------------------------------------------- keys
  useGameKeys((k) => {
    if (k === 'ArrowLeft') return setSelected((i) => Math.max(0, i - 1)), true
    if (k === 'ArrowRight') return setSelected((i) => Math.min(4, i + 1)), true
    if (s.result) return
    if (k === '+' || k === '=') return adjust(selected, 1), true
    if (k === '-' || k === '_') return adjust(selected, -1), true
    if (k === 'x' || k === 'X') return execute(), true
    if (k === 'a' || k === 'A') return setAdvance(true), true
    if (k === 'h' || k === 'H') return setAdvance(false), true
    if (k === 'c' || k === 'C') return clear(), true
  })

  // ---------------------------------------------------------------- view
  const record = rec.get<WLD | undefined>(`wld-${s.difficulty}`, undefined)
  const metrics: Metric[] = [
    { label: 'ROUND', value: `${Math.min(s.round, MAX_ROUNDS)}/${MAX_ROUNDS}` },
    { label: 'RESERVE', value: `${available}/${s.usPool}`, tone: 'amber', title: 'Unassigned / total reserve divisions' },
    { label: 'ENEMY RESERVE', value: s.aiPool, tone: 'red' },
    { label: 'SECTORS', value: `${held(s.sectors, 'US')}/5`, title: 'Sectors you hold' },
    { label: 'LOSSES', value: `${s.lost.us}/${s.lost.ai}`, title: 'Divisions lost: yours / enemy' },
    { label: `RECORD ${s.difficulty.toUpperCase()}`, value: fmtWLD(record), tone: 'dim' },
  ]

  const phase = s.result
    ? 'CAMPAIGN OVER'
    : available > 0
      ? `ROUND ${s.round}. PLACE ${available} RESERVE DIVISION${available === 1 ? '' : 'S'} (OPTIONAL), CHOOSE ADVANCE OR HOLD, THEN EXECUTE.`
      : `ROUND ${s.round}. RESERVE PLACED. EXECUTE ROUND.`

  const help = (
    <>
      <p>
        FIVE SECTORS RUN FROM YOUR HOME CAPITAL (LEFT) TO THE ENEMY CAPITAL (RIGHT). YOU HOLD A CONTINUOUS BLOCK FROM YOUR
        CAPITAL TO YOUR EDGE; THE SECTOR IN FRONT OF YOUR EDGE IS CONTESTED.
      </p>
      <ul>
        <li>WIN: CAPTURE THE ENEMY CAPITAL. LOSE: YOUR CAPITAL IS OVERRUN.</li>
        <li>
          ARMISTICE AFTER ROUND {MAX_ROUNDS}: WHOEVER HOLDS 3 OR MORE OF THE 5 SECTORS WINS. FIVE SECTORS CANNOT SPLIT EVENLY, SO
          THERE IS NO TIE. YOU START WITH 2.
        </li>
        <li>
          EACH ROUND: (1) PLACE RESERVE ON SECTORS YOU HOLD, OR INTO THE ASSAULT SLOT ON THE CONTESTED SECTOR. UNPLACED RESERVE
          CARRIES OVER. AT THE SAME TIME THE ENEMY MOVES PART OF ITS POOL TO THE SECTOR FACING YOU BY ITS DOCTRINE, FROM THE
          START-OF-ROUND MAP, AND HOLDS THE REST IN RESERVE.
        </li>
        <li>
          (2) ADVANCE: YOUR EDGE GARRISON PLUS ASSAULT DIVISIONS ATTACK. ATTACK = DIVISIONS + ROLL 0-3. DEFENSE = DIVISIONS +{' '}
          {LINE_BONUS} (LINE) OR +{CAPITAL_BONUS} (CAPITAL) + ROLL 0-3. HIGHER TOTAL WINS; EQUAL HOLDS.
        </li>
        <li>
          BREAKTHROUGH: ATTACKER LOSES 2 + THE DEFENSE ROLL (ALWAYS KEEPING 1). EVERY SURVIVOR MOVES INTO THE CAPTURED SECTOR.
          HALF THE DEFENDERS (ROUNDED UP) ARE DESTROYED, THE REST FALL BACK ONE SECTOR; A CAPITAL'S DEFENDERS HAVE NOWHERE TO GO.
        </li>
        <li>
          REPULSED: ATTACKER LOSES 2 + THE DEFENSE ROLL, DEFENDER LOSES 1 IF IT HAS 2 OR MORE. HELD (EQUAL): EACH LOSES 1.
          SURVIVORS WITHDRAW TO YOUR EDGE. CASUALTIES COME FROM THE ASSAULT SLOT FIRST, THEN THE GARRISON, EACH COUNTED ONCE.
        </li>
        <li>
          (3) COUNTERATTACK: THE ENEMY STRIKE FORCE IS ITS STACK FACING YOUR EDGE (LESS 1 LEFT TO HOLD IT) PLUS ITS WHOLE
          RESERVE. IT ATTACKS WHEN THAT REACHES YOUR EDGE DEFENSE (GARRISON + LINE OR CAPITAL BONUS) + {COUNTER_MARGIN.easy}{' '}
          (EASY), {COUNTER_MARGIN.normal} (NORMAL) OR {COUNTER_MARGIN.hard} (HARD), SAME COMBAT RULES. ON NORMAL AND HARD, IN THE
          LAST {DESPERATION_ROUNDS} ROUNDS, AN ENEMY THAT WOULD LOSE THE ARMISTICE ATTACKS WITH ANY STRIKE FORCE OF 2 OR MORE.
        </li>
        <li>
          (4) REINFORCEMENT, ONCE AT THE END OF EVERY ROUND: YOU +{REINFORCE}; ENEMY +{AI_REINFORCE.easy} (EASY),{' '}
          +{AI_REINFORCE.normal} (NORMAL), +{AI_REINFORCE.hard} (HARD).
        </li>
        <li>
          DIFFICULTY CHANGES THE ENEMY'S STARTING RESERVE ({AI_START_POOL.easy} / {AI_START_POOL.normal} / {AI_START_POOL.hard}{' '}
          AGAINST YOUR {START_POOL}), REINFORCEMENTS, DOCTRINE AND COUNTERATTACK MARGIN. NOTHING HIDDEN. EASY:{' '}
          {DOCTRINES.easy.summary}. NORMAL: {DOCTRINES.normal.summary}. HARD: {DOCTRINES.hard.summary}.
        </li>
        <li>KEYS: LEFT/RIGHT SELECT SECTOR, + / - ADJUST, A ADVANCE, H HOLD, C CLEAR, X EXECUTE. ORDERS START EACH ROUND AS HOLD.</li>
      </ul>
    </>
  )

  const sel = s.sectors[selected]!
  const selMine = sel.owner === 'US'
  const selRole =
    selected === edge
      ? 'YOUR EDGE. ITS GARRISON LEADS ANY ADVANCE AND FACES ANY COUNTERATTACK.'
      : selected === contested
        ? 'CONTESTED. THE TARGET OF AN ADVANCE THIS ROUND.'
        : selMine
          ? 'YOUR REAR. DIVISIONS HERE DO NOT FIGHT UNTIL IT BECOMES THE EDGE.'
          : 'ENEMY REAR. NOT REACHABLE UNTIL THE FRONT ADVANCES.'
  const slotLabel = selMine ? 'REINFORCE GARRISON' : selected === contested ? 'ASSAULT DIVISIONS' : null
  const amount = amountAt(selected)
  const addReason = s.result
    ? 'CAMPAIGN OVER'
    : available === 0
      ? 'NO RESERVE LEFT'
      : !selMine && !orders.advance
        ? 'ORDER IS HOLD'
        : undefined

  const inspector = (
    <Panel title="SELECTED SECTOR" className="tt-inspector">
      <div className="tt-insp-head">
        <span className={selMine ? 'tt-us' : 'tt-ai'}>{SECTOR_NAMES[selected]}</span>
        <span className="tt-insp-tags">
          {(selected === US_CAPITAL || selected === AI_CAPITAL) && <span className="tt-tag">CAPITAL +{CAPITAL_BONUS} DEF</span>}
          {selected === edge && <span className="tt-tag tt-tag-edge">EDGE</span>}
          {selected === contested && <span className="tt-tag tt-tag-contest">CONTESTED</span>}
        </span>
      </div>
      <p className="tt-insp-line">
        {selMine ? 'HELD BY YOU' : 'HELD BY ENEMY'} · {sel.div} DIVISION{sel.div === 1 ? '' : 'S'}
        {selected === contested && pv.defenseAdded > 0 ? ` (+${pv.defenseAdded} BY ENEMY DOCTRINE THIS ROUND)` : ''}
      </p>
      <p className="tt-insp-line tt-dim">{selRole}</p>
      {slotLabel ? (
        <div className="tt-stepper" role="group" aria-label={`${slotLabel}, ${SECTOR_NAMES[selected]}`}>
          <span className="tt-step-label">{slotLabel}</span>
          <div className="tt-step-row">
            <Action
              onClick={() => adjust(selected, -1)}
              disabled={amount === 0 || !!s.result}
              label={`Remove one division from ${SECTOR_NAMES[selected]}`}
              testId={`sector-minus-${selected}`}
            >
              −
            </Action>
            <output className="tt-step-value" aria-live="off">
              +{amount}
            </output>
            <Action
              onClick={() => adjust(selected, 1)}
              disabled={!canAdd(selected)}
              label={`Add one division to ${SECTOR_NAMES[selected]}`}
              testId={`sector-plus-${selected}`}
            >
              +
            </Action>
            <Action onClick={() => commitAll(selected)} disabled={!canAdd(selected)} testId="commit-all">
              COMMIT ALL
            </Action>
          </div>
          {addReason && <span className="gs-reason">{addReason}</span>}
        </div>
      ) : (
        <p className="tt-insp-line tt-dim">NO ORDERS POSSIBLE HERE.</p>
      )}
    </Panel>
  )

  const frontMap = (
    <div className="tt-front-wrap">
      <ol className="tt-front" aria-label="Front, your capital to enemy capital" data-testid="front-map">
        {s.sectors.map((x, i) => {
          const mine = x.owner === 'US'
          const pend = amountAt(i)
          const label = `${SECTOR_NAMES[i]}, ${mine ? 'yours' : 'enemy'}, ${x.div} divisions${pend ? `, ${pend} ordered` : ''}${
            i === edge ? ', your edge' : ''
          }${i === contested ? ', contested' : ''}`
          return (
            <li key={i} className="tt-node-li">
              <button
                type="button"
                className={`tt-node ${mine ? 'is-us' : 'is-ai'}${i === selected ? ' is-selected' : ''}${i === contested ? ' is-contested' : ''}${
                  i === edge ? ' is-edge' : ''
                }`}
                aria-pressed={i === selected}
                aria-label={label}
                onClick={() => {
                  setSelected(i)
                  cue.select()
                }}
                data-testid={`sector-${i}`}
              >
                <span className="tt-node-name">{SECTOR_SHORT[i]}</span>
                <span className="tt-node-owner">{i === 0 || i === 4 ? 'CAPITAL' : mine ? 'YOURS' : 'ENEMY'}</span>
                <span className="tt-node-div">{x.div}</span>
                <span className="tt-node-pend">{pend ? `+${pend}` : ' '}</span>
                <span className="tt-node-mark">{i === edge ? 'EDGE' : i === contested ? 'CONTEST' : ' '}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="tt-axis" aria-hidden="true">
        <span className="tt-us">YOU</span>
        <span>FRONT LINE BETWEEN {SECTOR_SHORT[edge]} AND {SECTOR_SHORT[contested]}</span>
        <span className="tt-ai">ENEMY</span>
      </div>
    </div>
  )

  const previewPanel = !s.result && (
    <Panel title="BATTLE PREVIEW" className="tt-preview">
      {orders.advance ? (
        <>
          <p>
            ADVANCE ON {SECTOR_NAMES[contested]}: EDGE {pv.edgeForce} + ASSAULT {pv.assault} = <b>{pv.force}</b>, PLUS ROLL 0-3 →{' '}
            <b>
              {pv.atkMin}-{pv.atkMax}
            </b>
            .
          </p>
          <p>
            DEFENSE: {pv.defenseNow} HELD + {pv.defenseAdded} BY DOCTRINE + {pv.bonus} {contested === AI_CAPITAL ? 'CAPITAL' : 'LINE'} ={' '}
            <b>{pv.defense}</b>, PLUS ROLL 0-3 →{' '}
            <b>
              {pv.defMin}-{pv.defMax}
            </b>
            .
          </p>
          <p className={pv.chance >= 0.5 ? 'tt-us' : 'tt-ai'}>BREAKTHROUGH CHANCE {pct(pv.chance)}.</p>
        </>
      ) : (
        <p>
          HOLD: NO ASSAULT. YOUR EDGE DEFENSE {pv.counter.defense} (GARRISON {pv.edgeForce} + BONUS). ENEMY STRIKE FORCE{' '}
          {pv.counter.strike} ({pv.counter.stack} FACING YOU + {pv.counter.reserve} RESERVE).{' '}
          {pv.counter.attacks
            ? pv.counter.desperate && pv.counter.strike < pv.counter.threshold
              ? 'ENEMY WILL COUNTERATTACK: IT IS LOSING THE ARMISTICE COUNT.'
              : `ENEMY WILL COUNTERATTACK (THRESHOLD ${pv.counter.threshold}).`
            : `NO COUNTERATTACK UNLESS ITS STRIKE FORCE REACHES ${pv.counter.threshold}.`}
        </p>
      )}
      <p className="tt-dim">
        ENEMY DOCTRINE {doctrine.name}: {allocText(pv.aiAlloc)} THIS ROUND.
      </p>
    </Panel>
  )

  const ordersPanel = !s.result && (
    <Panel title="ORDERS">
      <ActionBar label="Order">
        <Action onClick={() => setAdvance(true)} pressed={orders.advance} shortcut="A" testId="order-advance">
          ADVANCE
        </Action>
        <Action onClick={() => setAdvance(false)} pressed={!orders.advance} shortcut="H" testId="order-hold">
          HOLD
        </Action>
      </ActionBar>
    </Panel>
  )

  const executePanel = !s.result && (
    <Panel title={`EXECUTE ROUND ${s.round}`}>
      <p className="tt-dim tt-orders-sum">
        PLACED: {allocText(orders.alloc, orders.assault)}. {available > 0 ? `${available} UNPLACED, CARRIES OVER.` : 'RESERVE FULLY PLACED.'}
      </p>
      <ActionBar label="Clear orders">
        <Action onClick={clear} disabled={used === 0} reason={used === 0 ? 'NOTHING PLACED' : undefined} testId="clear-orders" shortcut="C">
          CLEAR ALL ORDERS
        </Action>
      </ActionBar>
      <ActionBar label="Execute">
        <Action variant="primary" onClick={execute} disabled={!!problem} reason={problem ?? undefined} shortcut="X" testId="resolve-turn">
          EXECUTE ROUND {s.round}
        </Action>
      </ActionBar>
    </Panel>
  )

  const result = s.result && (
    <GameResult
      outcome={s.result.outcome}
      headline={resultText(s.result).headline}
      reason={resultText(s.result).reason}
      metrics={[
        { label: 'SECTORS', value: `${s.result.usHeld}-${s.result.aiHeld}` },
        { label: 'ROUNDS', value: s.round - 1 },
        { label: 'LOST', value: `${s.lost.us}/${s.lost.ai}`, title: 'Divisions lost: yours / enemy' },
        { label: 'RECORD', value: fmtWLD(record) },
      ]}
    >
      <Action variant="primary" onClick={() => restart()} testId="play-again" autoFocus>
        NEW CAMPAIGN
      </Action>
      <Action onClick={onExit}>EXIT TO GAMES</Action>
    </GameResult>
  )

  const ledger = last && (last.assaultBattle || last.counter) && (
    <Panel title={`ROUND ${last.round} LEDGER`} className="tt-ledger">
      {[last.assaultBattle, last.counter].filter((b): b is BattleReport => !!b).map((b) => (
        <table key={b.attacker} className="tt-table">
          <caption>
            {b.attacker === 'US' ? 'ASSAULT' : 'COUNTERATTACK'} · {SECTOR_SHORT[b.target]} · {b.result.toUpperCase()}
          </caption>
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">{b.attacker === 'US' ? 'YOU' : 'ENEMY'}</th>
              <th scope="col">{b.attacker === 'US' ? 'ENEMY' : 'YOU'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">COMMITTED</th>
              <td>{b.committed.attacker}</td>
              <td>{b.committed.defender}</td>
            </tr>
            <tr>
              <th scope="row">LOST</th>
              <td>{b.lost.attacker}</td>
              <td>{b.lost.defender}</td>
            </tr>
            <tr>
              <th scope="row">{b.result === 'breakthrough' ? 'ADVANCED / FELL BACK' : 'WITHDREW'}</th>
              <td>{b.result === 'breakthrough' ? b.transferred : b.withdrawn}</td>
              <td>{b.result === 'breakthrough' ? b.retreated : '-'}</td>
            </tr>
            <tr>
              <th scope="row">REMAINING IN PLACE</th>
              <td>{b.result === 'breakthrough' ? b.remaining.target : b.remaining.from}</td>
              <td>{b.result === 'breakthrough' ? 0 : b.remaining.target}</td>
            </tr>
          </tbody>
        </table>
      ))}
      <p className="tt-dim">
        TOTAL FORCES · YOU {last.us.before} − {last.us.lost} + {last.us.reinforced} = {last.us.after} · ENEMY {last.ai.before} −{' '}
        {last.ai.lost} + {last.ai.reinforced} = {last.ai.after} · {reconciles(last.us) && reconciles(last.ai) ? 'RECONCILED' : 'MISMATCH'}
      </p>
    </Panel>
  )

  return (
    <GameShell
      slug={SLUG}
      title="THEATERWIDE TACTICAL WARFARE"
      objective={`TAKE THE ENEMY CAPITAL, OR HOLD 3 OF 5 SECTORS WHEN ROUND ${MAX_ROUNDS} ENDS.`}
      phase={phase}
      phaseTone={s.result ? (s.result.outcome === 'win' ? 'amber' : 'red') : 'amber'}
      metrics={metrics}
      help={help}
      onRestart={() => restart()}
      inProgress={s.round > 1 && !s.result}
      restartLabel="NEW CAMPAIGN"
      onExit={onExit}
      layout="board"
      toolbar={
        <>
          <Segmented label="ENEMY" value={difficulty} options={DIFFS} onChange={chooseDifficulty} testId="difficulty" />
          {pendingDiff && <span className="tt-note">APPLIES ON NEW CAMPAIGN</span>}
        </>
      }
      announce={log.events[log.events.length - 1]?.text}
      side={
        phone ? undefined : (
          <>
            {result}
            {ordersPanel}
            {previewPanel}
            {executePanel}
          </>
        )
      }
      report={
        <>
          {ledger}
          <GameReport events={log.events.length ? log.events : [{ id: 0, text: `THEATER COMMAND ONLINE. ENEMY DOCTRINE: ${doctrine.name}.` }]} />
        </>
      }
    >
      {frontMap}
      {phone ? (
        // Phone: one top-down decision path. Order type, then allocation, then
        // the preview the player checks before EXECUTE.
        <>
          {result}
          {ordersPanel}
          {inspector}
          {previewPanel}
          {executePanel}
        </>
      ) : (
        inspector
      )}
    </GameShell>
  )
}

export const entry: GameEntry = {
  id: 'THEATERWIDE TACTICAL WARFARE',
  Component: TheaterwideTactical,
}
