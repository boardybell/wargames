// BRIDGE: DECLARER PRACTICE. Choose a contract for a seeded deal, then play
// South and the face-up dummy North against a partner-aware East/West defense.
// Undoubled, non-vulnerable duplicate scoring with a breakdown. REPLAY DEAL
// tries the same cards at a different contract; NEW DEAL shuffles.
// Rules, scoring and defense live in engines/bridge.ts (pure, tested).
// Design: docs/games-design-review.md §5.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameReport, GameResult, GameShell, Panel } from './ui/GameShell'
import { CardHand, CardTile, TrickTable, groupBySuit, type TrickSeat } from './ui/cards/CardTile'
import { cue, fmtWLD, newSeed, useEventLog, useGameKeys, useGameRecords, useTimers, type WLD } from './hooks'
import {
  SEAT_NAME,
  STRAIN_NAME,
  SUITS,
  contractLabel,
  deal,
  defView,
  defend,
  hcp,
  isOver,
  legalCards,
  playCard,
  scoreContract,
  startPlay,
  tricksDone,
  type Card,
  type PlayState,
  type Seat,
  type Strain,
} from './engines/bridge'
import './styles/bridge.css'

const STRAINS: readonly Strain[] = ['♣', '♦', '♥', '♠', 'NT']
const STRAIN_KEY: Record<string, Strain> = { c: '♣', d: '♦', h: '♥', s: '♠', n: 'NT' }
const AI_MS = 450
const HOLD_MS = 1200
const short = (c: Card): string => `${c.rank}${c.suit}`

interface Deal {
  readonly seed: number
  readonly no: number
  readonly attempt: number
}

function BridgeGame({ onExit }: GameProps) {
  const rec = useGameRecords('bridge')
  const timers = useTimers()
  const log = useEventLog()
  const [d, setD] = useState<Deal>(() => ({ seed: newSeed(), no: 1, attempt: 1 }))
  const [level, setLevel] = useState(3)
  const [strain, setStrain] = useState<Strain>('NT')
  const [ps, setPs] = useState<PlayState | null>(null)
  const [session, setSession] = useState({ total: 0, deals: 0 })
  const psRef = useRef(ps)
  psRef.current = ps

  const hands = useMemo(() => deal(d.seed), [d.seed])
  const phase: 'bid' | 'play' | 'done' = !ps ? 'bid' : isOver(ps) ? 'done' : 'play'
  const score = ps ? scoreContract(ps.level, ps.strain, ps.ns) : null

  const finish = (s: PlayState): void => {
    const sc = scoreContract(s.level, s.strain, s.ns)
    rec.recordOnce(`${d.seed}-${d.attempt}`, () => {
      rec.tally('contracts', sc.made ? 'win' : 'lose')
      rec.update<number>('best', (p) => Math.max(p ?? -Infinity, sc.total))
    })
    setSession((x) => ({ total: x.total + sc.total, deals: x.deals + 1 }))
    log.push({
      text: `${contractLabel(s.level, s.strain)} ${sc.made ? 'MADE' : `DOWN ${sc.need - sc.tricks}`} WITH ${s.ns} TRICKS: ${sc.total > 0 ? '+' : ''}${sc.total}.`,
      kind: sc.made ? 'good' : 'bad',
    })
    if (sc.made) cue.win()
    else cue.lose()
  }

  const commit = (prev: PlayState, next: PlayState): void => {
    setPs(next)
    const lt = next.lastTrick
    if (lt && lt !== prev.lastTrick) {
      log.push({
        text: `TRICK ${lt.no}: ${lt.plays.map((p) => `${p.seat} ${short(p.card)}`).join(' · ')}. ${lt.why}`,
        kind: lt.winner === 'N' || lt.winner === 'S' ? 'good' : 'bad',
      })
      if (!(lt.winner === 'N' || lt.winner === 'S')) cue.tick()
    }
    if (isOver(next) && !isOver(prev)) finish(next)
  }

  // Defenders play on a short timer; a completed trick holds on the table first.
  useEffect(() => {
    if (!ps || isOver(ps) || ps.turn === 'N' || ps.turn === 'S') return
    const justClosed = ps.trick.length === 0 && ps.lastTrick !== null
    timers.later(() => {
      const prev = psRef.current
      if (!prev || isOver(prev) || prev.turn === 'N' || prev.turn === 'S') return
      const ch = defend(defView(prev, prev.turn))
      cue.card()
      commit(prev, playCard(prev, prev.turn, ch.card, `${SEAT_NAME[prev.turn]} ${ch.why}.`))
    }, justClosed ? HOLD_MS : AI_MS)
    return timers.clear
  }, [ps])

  const bid = (): void => {
    if (phase !== 'bid') return
    cue.select()
    log.push({ text: `DEAL ${d.no}${d.attempt > 1 ? ` (REPLAY ${d.attempt})` : ''}: CONTRACT ${contractLabel(level, strain)} BY SOUTH. NEED ${6 + level} TRICKS. WEST LEADS.` })
    setPs(startPlay(hands, level, strain))
  }

  const humanPlay = (seat: Seat, c: Card): void => {
    if (!ps || phase !== 'play' || ps.turn !== seat) return
    if (!legalCards(ps.hands[seat], ps.trick).some((x) => x.id === c.id)) {
      cue.deny()
      return
    }
    cue.card()
    commit(ps, playCard(ps, seat, c))
  }

  const replay = (): void => {
    timers.clear()
    setPs(null)
    setD((x) => ({ ...x, attempt: x.attempt + 1 }))
    log.push({ text: `REPLAY DEAL ${d.no}: SAME CARDS. CHOOSE A DIFFERENT CONTRACT.` })
  }
  const newDeal = (): void => {
    timers.clear()
    setPs(null)
    setD((x) => ({ seed: newSeed(), no: x.no + 1, attempt: 1 }))
  }
  const restart = (): void => {
    timers.clear()
    log.reset()
    setPs(null)
    setSession({ total: 0, deals: 0 })
    setD({ seed: newSeed(), no: 1, attempt: 1 })
  }

  useGameKeys((k) => {
    const key = k.toLowerCase()
    if (phase === 'bid') {
      if (/^[1-7]$/.test(key)) {
        setLevel(Number(key))
        cue.select()
        return true
      }
      if (STRAIN_KEY[key]) {
        setStrain(STRAIN_KEY[key]!)
        cue.select()
        return true
      }
      if (key === 'b') {
        bid()
        return true
      }
    }
    if (phase === 'done') {
      if (key === 'r') {
        replay()
        return true
      }
      if (key === 'x') {
        newDeal()
        return true
      }
    }
    return false
  })

  // ---------------------------------------------------------------- view
  const active: Seat | null = phase === 'play' && ps && (ps.turn === 'N' || ps.turn === 'S') ? ps.turn : null
  const legal = useMemo(() => (active && ps ? new Set(legalCards(ps.hands[active], ps.trick).map((c) => c.id)) : new Set<string>()), [active, ps])
  const need = 6 + (ps?.level ?? level)
  const preview = scoreContract(level, strain, 6 + level)
  const down1 = scoreContract(level, strain, 5 + level)

  const seatHand = (seat: 'N' | 'S') => {
    const cards = ps ? ps.hands[seat] : hands[seat]
    const isActive = active === seat
    const label =
      seat === 'N'
        ? `NORTH · DUMMY${phase === 'bid' ? ' · SHOWN FOR PRACTICE' : ''}${isActive ? ' · PLAY FROM NORTH' : ''}`
        : `SOUTH · YOU, DECLARER${isActive ? ' · PLAY FROM SOUTH' : ''}`
    return (
      <div className={`br-hand${isActive ? ' is-active' : ''}`} data-testid={`bridge-hand-${seat.toLowerCase()}`}>
        <CardHand
          label={label}
          total={phase === 'bid' ? `${hcp(cards)} HCP` : undefined}
          inactiveReason={phase === 'play' && !isActive ? (ps && ps.turn !== seat && active ? `PLAY FROM ${SEAT_NAME[active]}.` : ps && !active ? `${SEAT_NAME[ps.turn]} TO PLAY.` : undefined) : undefined}
        >
          {groupBySuit(cards, SUITS).map((g) => (
            <div key={g.suit} className="gs-suitgroup" role="group" aria-label={`${SEAT_NAME[seat]} ${STRAIN_NAME[g.suit as Strain]}`}>
              {g.items.map(({ card: c }) => {
                const ok = isActive && legal.has(c.id)
                return phase === 'bid' ? (
                  <CardTile key={c.id} card={c} size="sm" testId={`bridge-${seat.toLowerCase()}-${c.id}`} />
                ) : (
                  <CardTile
                    key={c.id}
                    card={c}
                    eligible={ok}
                    disabled={!ok}
                    onClick={() => humanPlay(seat, c)}
                    testId={`bridge-${seat.toLowerCase()}-${c.id}`}
                    label={`${c.rank} of ${STRAIN_NAME[c.suit].toLowerCase()}, from ${SEAT_NAME[seat].toLowerCase()}`}
                  />
                )
              })}
            </div>
          ))}
          {cards.length === 0 && <span className="gs-hand-reason">NO CARDS LEFT.</span>}
        </CardHand>
      </div>
    )
  }

  // Trick table: trick in progress, else the completed trick until your next play.
  const showing = ps && ps.trick.length > 0 ? { plays: ps.trick, done: false } : { plays: ps?.lastTrick?.plays ?? [], done: !!ps?.lastTrick }
  const lt = ps?.lastTrick ?? null
  const seatInfo = (s: Seat): TrickSeat => {
    const p = showing.plays.find((x) => x.seat === s)
    const n = ps ? ps.hands[s].length : 13
    const voids = ps?.voids[s] ?? []
    return {
      name: s === 'S' ? 'SOUTH' : s === 'N' ? 'NORTH' : `${SEAT_NAME[s]} · ${n}`,
      card: p?.card,
      winner: showing.done && lt?.winner === s,
      active: phase === 'play' && ps?.turn === s,
      lead: showing.plays[0]?.seat === s,
      note: voids.length ? `VOID ${voids.join('')}` : undefined,
    }
  }
  const center = (
    <div className="br-center">
      {phase === 'bid' ? (
        <span>CHOOSE A CONTRACT</span>
      ) : showing.done && lt ? (
        <>
          <strong>
            TRICK {lt.no} TO {lt.winner === 'N' || lt.winner === 'S' ? 'YOU' : 'DEFENSE'}
          </strong>
          <span>{lt.why}</span>
        </>
      ) : (
        <span>
          {ps ? contractLabel(ps.level, ps.strain) : ''} · TRICK {ps ? tricksDone(ps) + 1 : 1}/13
        </span>
      )}
    </div>
  )

  const contractPicker = (
    <Panel title={d.attempt > 1 ? `REPLAY DEAL ${d.no}: PICK A NEW CONTRACT` : 'YOUR CONTRACT'}>
      <div className="br-levels" role="group" aria-label="Contract level">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button
            key={n}
            type="button"
            className="gs-btn br-pick"
            aria-pressed={level === n}
            aria-label={`Level ${n}: ${6 + n} tricks`}
            onClick={() => {
              setLevel(n)
              cue.select()
            }}
            data-testid={`bridge-level-${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="br-strains" role="group" aria-label="Trump strain">
        {STRAINS.map((t) => (
          <button
            key={t}
            type="button"
            className={`gs-btn br-pick${t === '♥' || t === '♦' ? ' br-red' : ''}`}
            aria-pressed={strain === t}
            onClick={() => {
              setStrain(t)
              cue.select()
            }}
            data-testid={`bridge-trump-${t === 'NT' ? 'nt' : t}`}
          >
            {t === 'NT' ? 'NO TRUMP' : `${t} ${STRAIN_NAME[t]}`}
          </button>
        ))}
      </div>
      <dl className="br-preview" data-testid="bridge-preview">
        <div>
          <dt>NEED</dt>
          <dd>{6 + level} TRICKS</dd>
        </div>
        <div>
          <dt>IF MADE</dt>
          <dd className="gs-tone-good">
            +{preview.total} {preview.lines.find((l) => /GAME|PARTSCORE/.test(l.label))!.label.replace(' BONUS', '')}
            {level >= 6 ? ' + SLAM' : ''}
          </dd>
        </div>
        <div>
          <dt>EACH DOWN</dt>
          <dd className="gs-tone-red">{down1.total}</dd>
        </div>
      </dl>
      <ActionBar>
        <Action variant="primary" onClick={bid} testId="bridge-confirm-bid" shortcut="B">
          PLAY {contractLabel(level, strain)}
        </Action>
      </ActionBar>
    </Panel>
  )

  const contractPanel = ps && (
    <Panel title={`CONTRACT ${contractLabel(ps.level, ps.strain)} · ${STRAIN_NAME[ps.strain]}`}>
      <dl className="br-preview">
        <div>
          <dt>YOUR TRICKS</dt>
          <dd>
            {ps.ns}/{need}
          </dd>
        </div>
        <div>
          <dt>DEFENSE</dt>
          <dd className={ps.ew > 13 - need ? 'gs-tone-red' : undefined}>
            {ps.ew}/{14 - need}
          </dd>
        </div>
        <div>
          <dt>IF MADE</dt>
          <dd>+{scoreContract(ps.level, ps.strain, need).total}</dd>
        </div>
      </dl>
    </Panel>
  )

  const lastPanel = lt && (
    <Panel title={`LAST TRICK · ${lt.no}/13`}>
      <div className="br-last" data-testid="bridge-last-trick">
        {lt.plays.map((p) => (
          <span key={p.seat} className="br-last-play">
            <CardTile card={p.card} size="sm" mark={p.seat === lt.winner ? 'win' : 'none'} badge={p.seat === lt.winner ? 'WINS' : undefined} />
            {p.seat}
          </span>
        ))}
      </div>
      <p data-testid="bridge-last-why">{lt.why}</p>
      {lt.notes.length > 0 && (
        <ul className="br-notes">
          {lt.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Panel>
  )

  const result = phase === 'done' && ps && score && (
    <GameResult
      outcome={score.made ? 'win' : 'lose'}
      headline={score.made ? `${contractLabel(ps.level, ps.strain)} MADE` : `${contractLabel(ps.level, ps.strain)} DOWN ${score.need - score.tricks}`}
      reason={`YOU TOOK ${score.tricks} OF 13 TRICKS; THE CONTRACT NEEDED ${score.need}.`}
      testId="bridge-outcome"
    >
      <table className="br-score" data-testid="bridge-score">
        <tbody>
          {score.lines.map((l) => (
            <tr key={l.label}>
              <th scope="row">{l.label}</th>
              <td className={l.points < 0 ? 'gs-tone-red' : undefined}>{l.points > 0 ? `+${l.points}` : l.points}</td>
            </tr>
          ))}
          <tr className="br-score-total">
            <th scope="row">DEAL SCORE</th>
            <td>{score.total > 0 ? `+${score.total}` : score.total}</td>
          </tr>
        </tbody>
      </table>
      <Action variant="primary" onClick={replay} testId="bridge-replay" shortcut="R">
        REPLAY DEAL
      </Action>
      <Action onClick={newDeal} testId="bridge-again" shortcut="X">
        NEW DEAL
      </Action>
    </GameResult>
  )

  const best = rec.get<number | undefined>('best', undefined)
  let phaseText: string
  if (phase === 'bid') phaseText = `CHOOSE LEVEL AND STRAIN · ${contractLabel(level, strain)} NEEDS ${6 + level} TRICKS`
  else if (phase === 'done') phaseText = score?.made ? 'CONTRACT MADE' : 'CONTRACT DEFEATED'
  else if (active) phaseText = `PLAY FROM ${SEAT_NAME[active]}${ps!.trick.length ? ` · FOLLOW ${STRAIN_NAME[ps!.trick[0]!.card.suit]} IF ABLE` : ' · YOUR LEAD'}`
  else phaseText = `${SEAT_NAME[ps!.turn]} TO PLAY`

  return (
    <GameShell
      slug="bridge"
      title="BRIDGE · DECLARER PRACTICE"
      layout="table"
      objective="DECLARE FROM SOUTH WITH NORTH AS DUMMY. CHOOSE A CONTRACT, THEN TAKE THE TRICKS IT NEEDS."
      phase={phaseText}
      phaseTone={phase === 'play' && !active ? 'dim' : 'amber'}
      metrics={[
        { label: 'DEAL', value: d.attempt > 1 ? `${d.no} · TRY ${d.attempt}` : d.no },
        { label: 'CONTRACT', value: ps ? contractLabel(ps.level, ps.strain) : '—' },
        { label: 'TRICKS', value: ps ? `${ps.ns}/${need}` : '—', tone: ps && ps.ns >= need ? 'good' : 'normal' },
        { label: 'SESSION', value: session.deals ? `${session.total > 0 ? '+' : ''}${session.total}` : '0', tone: session.total < 0 ? 'red' : 'normal' },
        { label: 'MADE-DOWN', value: fmtWLD(rec.get<WLD | undefined>('contracts', undefined)), tone: 'dim' },
        { label: 'BEST', value: best === undefined ? '—' : `${best > 0 ? '+' : ''}${best}`, tone: 'dim' },
      ]}
      help={
        <>
          <p>DECLARER PRACTICE, NOT A FULL BRIDGE GAME: YOU NAME THE CONTRACT AND THE DEFENDERS PASS. THERE IS NO AUCTION, DOUBLING OR VULNERABILITY.</p>
          <ul>
            <li>YOU ARE SOUTH. NORTH IS YOUR DUMMY: ITS HAND IS SHOWN BEFORE YOU CHOOSE, AS IF PARTNER HAD DESCRIBED IT IN THE AUCTION.</li>
            <li>A CONTRACT OF LEVEL N NEEDS 6 + N TRICKS. THE STRAIN IS TRUMP, OR NO TRUMP.</li>
            <li>WEST LEADS. FOLLOW THE LED SUIT IF YOU CAN; OTHERWISE PLAY ANY CARD. THE HIGHEST TRUMP WINS, ELSE THE HIGHEST CARD OF THE LED SUIT.</li>
            <li>YOU PLAY BOTH SOUTH AND NORTH: THE ACTIVE HAND IS LABELED PLAY FROM NORTH OR PLAY FROM SOUTH.</li>
            <li>SCORING (UNDOUBLED, NOT VULNERABLE): CLUBS/DIAMONDS 20 A TRICK, HEARTS/SPADES 30, NO TRUMP 40 + 30. 100+ CONTRACT POINTS = GAME (+300), ELSE PARTSCORE (+50). SMALL SLAM +500, GRAND SLAM +1000. OVERTRICKS AT TRICK VALUE. EACH UNDERTRICK -50.</li>
            <li>REPLAY DEAL PLAYS THE SAME CARDS AT A NEW CONTRACT. NEW DEAL SHUFFLES.</li>
            <li>DEFENDERS SEE ONLY THEIR OWN HAND, DUMMY AND PLAYED CARDS. THEY DUCK WHEN PARTNER IS SAFELY WINNING, KEEP TRUMPS FOR RUFFS AND TRACK SHOWN VOIDS.</li>
            <li>KEYS: 1-7 LEVEL · C D H S N STRAIN · B PLAY CONTRACT · R REPLAY · X NEW DEAL.</li>
          </ul>
        </>
      }
      onRestart={restart}
      inProgress={phase === 'play' || session.deals > 0}
      restartLabel="NEW SESSION"
      onExit={() => {
        timers.clear()
        onExit()
      }}
      side={
        <>
          {result}
          {phase === 'bid' && contractPicker}
          {phase !== 'bid' && contractPanel}
          {lastPanel}
        </>
      }
      report={<GameReport events={log.events} />}
      announce={log.events[log.events.length - 1]?.text}
    >
      <div className={`br-compass${phase === 'bid' ? ' is-bid' : ''}`}>
        {seatHand('N')}
        <TrickTable
          seats={{ N: seatInfo('N'), E: seatInfo('E'), S: seatInfo('S'), W: seatInfo('W') }}
          center={center}
          testId="bridge-table"
        />
        {seatHand('S')}
      </div>
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'BRIDGE', Component: BridgeGame }
