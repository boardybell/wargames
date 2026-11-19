// GIN RUMMY. A real hand against one WOPR opponent. Ten-card hands, draw from
// the stock or the discard pile, correct meld detection (sets and runs) with a
// best-partition deadwood count, KNOCK when deadwood <= 10, GIN at 0, and the
// hand is scored with the standard knock / gin / undercut rules. The AI draws
// the discard only when it lowers its deadwood, discards its highest unmelded
// card, and knocks once it is legal. PLAY AGAIN, EXIT.
import { useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

const SUITS = ['♠', '♥', '♦', '♣'] as const
const RANKS = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
] as const
type Suit = (typeof SUITS)[number]
type Rank = (typeof RANKS)[number]

interface Card {
  readonly rank: Rank
  readonly suit: Suit
  readonly id: string
}

// Rank order for runs (A low); deadwood value caps face cards at 10.
const rankOrder = (r: Rank): number => RANKS.indexOf(r)
const cardValue = (r: Rank): number => {
  const i = RANKS.indexOf(r)
  return i >= 9 ? 10 : i + 1 // 10/J/Q/K -> 10, else pip (A=1)
}

function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS)
    for (const rank of RANKS) deck.push({ rank, suit, id: `${rank}${suit}` })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  return deck
}

// ---- meld / deadwood ----
// Enumerate every valid meld (3+ set, or 3+ consecutive run in one suit) as a
// list of card ids, then choose the non-overlapping subset that minimizes the
// deadwood sum. Ten cards is tiny, so an exhaustive best-partition search is
// instant and exactly correct.
function allMelds(hand: readonly Card[]): string[][] {
  const melds: string[][] = []
  // Sets: 3 or 4 of a rank.
  for (const rank of RANKS) {
    const same = hand.filter((c) => c.rank === rank)
    if (same.length >= 3) {
      if (same.length === 4) {
        melds.push(same.map((c) => c.id))
        // every 3-subset of the 4 is also a legal set
        for (let drop = 0; drop < 4; drop++) {
          melds.push(same.filter((_, i) => i !== drop).map((c) => c.id))
        }
      } else {
        melds.push(same.map((c) => c.id))
      }
    }
  }
  // Runs: consecutive ranks in a suit, every length >= 3.
  for (const suit of SUITS) {
    const inSuit = hand
      .filter((c) => c.suit === suit)
      .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank))
    let run: Card[] = []
    const flush = (): void => {
      for (let start = 0; start < run.length; start++) {
        for (let end = start + 2; end < run.length; end++) {
          melds.push(run.slice(start, end + 1).map((c) => c.id))
        }
      }
    }
    for (const c of inSuit) {
      const last = run[run.length - 1]
      if (!last) run = [c]
      else if (rankOrder(c.rank) === rankOrder(last.rank) + 1) run.push(c)
      else {
        flush()
        run = [c]
      }
    }
    flush()
  }
  return melds
}

interface Analysis {
  readonly deadwood: number
  readonly meldIds: Set<string>
}

// Minimum deadwood over all non-overlapping meld choices.
function analyze(hand: readonly Card[]): Analysis {
  const melds = allMelds(hand)
  const valueById = new Map<string, number>()
  for (const c of hand) valueById.set(c.id, cardValue(c.rank))
  const totalValue = hand.reduce((s, c) => s + cardValue(c.rank), 0)

  let best = { dead: totalValue, used: new Set<string>() }
  // Depth-first over melds: take or skip each, never reusing a card.
  const search = (i: number, used: Set<string>, saved: number): void => {
    const remaining = totalValue - saved
    if (remaining < best.dead) best = { dead: remaining, used: new Set(used) }
    for (let j = i; j < melds.length; j++) {
      const m = melds[j]!
      if (m.some((id) => used.has(id))) continue
      const add = m.reduce((s, id) => s + (valueById.get(id) ?? 0), 0)
      for (const id of m) used.add(id)
      search(j + 1, used, saved + add)
      for (const id of m) used.delete(id)
    }
  }
  search(0, new Set<string>(), 0)
  return { deadwood: best.dead, meldIds: best.used }
}

type Phase = 'draw' | 'discard' | 'done'
type Who = 'YOU' | 'WOPR'

interface State {
  stock: Card[]
  discard: Card[]
  you: Card[]
  ai: Card[]
  phase: Phase
  turn: Who
  // Final-hand bookkeeping.
  result: string
  youScore: number
  aiScore: number
}

function fresh(): State {
  const deck = freshDeck()
  const you: Card[] = []
  const ai: Card[] = []
  for (let i = 0; i < 10; i++) {
    you.push(deck.pop()!)
    ai.push(deck.pop()!)
  }
  const discard = [deck.pop()!]
  return {
    stock: deck,
    discard,
    you,
    ai,
    phase: 'draw',
    turn: 'YOU',
    result: '',
    youScore: 0,
    aiScore: 0,
  }
}

const sortHand = (h: readonly Card[]): Card[] =>
  [...h].sort((a, b) =>
    a.suit === b.suit
      ? rankOrder(a.rank) - rankOrder(b.rank)
      : SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit),
  )

// ---- scoring ----
// Knock: knocker deadwood subtracted from opponent deadwood. Gin: +25 bonus and
// no lay-off. Undercut: if the defender's deadwood is <= the knocker's (non-gin
// knock), defender scores the difference plus a 25 bonus.
function scoreKnock(
  knocker: Who,
  knockerDead: number,
  oppDead: number,
  gin: boolean,
): { youScore: number; aiScore: number; result: string } {
  if (gin) {
    const pts = oppDead + 25
    return knocker === 'YOU'
      ? { youScore: pts, aiScore: 0, result: `GIN. YOU SCORE ${pts}.` }
      : { youScore: 0, aiScore: pts, result: `WOPR GOES GIN. WOPR SCORES ${pts}.` }
  }
  const diff = oppDead - knockerDead
  if (diff > 0) {
    return knocker === 'YOU'
      ? { youScore: diff, aiScore: 0, result: `YOU KNOCK. YOU SCORE ${diff}.` }
      : { youScore: 0, aiScore: diff, result: `WOPR KNOCKS. WOPR SCORES ${diff}.` }
  }
  // Undercut: opponent was equal or better.
  const pts = knockerDead - oppDead + 25
  return knocker === 'YOU'
    ? { youScore: 0, aiScore: pts, result: `UNDERCUT. WOPR SCORES ${pts}.` }
    : { youScore: pts, aiScore: 0, result: `UNDERCUT. YOU SCORE ${pts}.` }
}

function CardSpan({ card, meld }: { card: Card; meld?: boolean }) {
  const red = card.suit === '♥' || card.suit === '♦'
  const cls = [meld ? 'wg-amber' : red ? 'wg-red' : undefined]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls || undefined}>
      [{card.rank}
      {card.suit}]
    </span>
  )
}

function GinRummy({ onExit }: GameProps) {
  const [st, setSt] = useState<State>(() => fresh())
  const [sel, setSel] = useState<string | null>(null)

  const youSorted = useMemo(() => sortHand(st.you), [st.you])
  const youAnal = useMemo(() => analyze(st.you), [st.you])
  const aiAnal = useMemo(() => analyze(st.ai), [st.ai])
  const topDiscard = st.discard[st.discard.length - 1]

  // ---- AI turn: draw (prefer discard only if it helps), then discard highest
  // unmelded card, and knock when legal. Runs synchronously after your discard.
  const runAi = (base: State): State => {
    const s: State = {
      ...base,
      stock: [...base.stock],
      discard: [...base.discard],
      ai: [...base.ai],
    }
    const top = s.discard[s.discard.length - 1]
    const curDead = analyze(s.ai).deadwood
    let drew: Card | undefined
    if (top) {
      const withDiscard = analyze([...s.ai, top]).deadwood
      if (withDiscard < curDead) {
        drew = s.discard.pop()
      }
    }
    if (!drew) {
      if (s.stock.length === 0) {
        s.phase = 'done'
        s.result = 'STOCK EXHAUSTED. HAND IS A WASH.'
        return s
      }
      drew = s.stock.pop()
    }
    if (drew) s.ai.push(drew)

    // Choose the discard that leaves the lowest deadwood; break ties by dumping
    // the highest-value unmelded card.
    let bestIdx = 0
    let bestDead = Infinity
    let bestVal = -1
    for (let i = 0; i < s.ai.length; i++) {
      const trial = s.ai.filter((_, j) => j !== i)
      const d = analyze(trial).deadwood
      const v = cardValue(s.ai[i]!.rank)
      if (d < bestDead || (d === bestDead && v > bestVal)) {
        bestDead = d
        bestVal = v
        bestIdx = i
      }
    }
    const tossed = s.ai[bestIdx]!
    s.ai = s.ai.filter((_, j) => j !== bestIdx)
    s.discard.push(tossed)

    const finalAnal = analyze(s.ai)
    if (finalAnal.deadwood <= 10) {
      const gin = finalAnal.deadwood === 0
      const youDead = analyze(s.you).deadwood
      const sc = scoreKnock('WOPR', finalAnal.deadwood, youDead, gin)
      return {
        ...s,
        phase: 'done',
        youScore: sc.youScore,
        aiScore: sc.aiScore,
        result: sc.result,
      }
    }
    return { ...s, phase: 'draw', turn: 'YOU' }
  }

  const drawFrom = (source: 'stock' | 'discard'): void => {
    if (st.phase !== 'draw' || st.turn !== 'YOU') return
    const s: State = {
      ...st,
      stock: [...st.stock],
      discard: [...st.discard],
      you: [...st.you],
    }
    if (source === 'stock') {
      if (s.stock.length === 0) {
        setSt({ ...s, phase: 'done', result: 'STOCK EXHAUSTED. HAND IS A WASH.' })
        return
      }
      s.you.push(s.stock.pop()!)
    } else {
      const top = s.discard.pop()
      if (!top) return
      s.you.push(top)
    }
    setSt({ ...s, phase: 'discard' })
  }

  const discardCard = (id: string): void => {
    if (st.phase !== 'discard' || st.turn !== 'YOU') return
    const card = st.you.find((c) => c.id === id)
    if (!card) return
    const you = st.you.filter((c) => c.id !== id)
    const afterDiscard: State = {
      ...st,
      you,
      discard: [...st.discard, card],
      phase: 'draw',
      turn: 'WOPR',
    }
    setSel(null)
    // Pass to the AI immediately.
    setSt(runAi(afterDiscard))
  }

  const knock = (): void => {
    if (st.phase !== 'discard' || st.turn !== 'YOU' || !sel) return
    const card = st.you.find((c) => c.id === sel)
    if (!card) return
    const you = st.you.filter((c) => c.id !== sel)
    const anal = analyze(you)
    if (anal.deadwood > 10) return // not legal; UI disables, guard anyway
    const gin = anal.deadwood === 0
    const aiDead = analyze(st.ai).deadwood
    const sc = scoreKnock('YOU', anal.deadwood, aiDead, gin)
    setSel(null)
    setSt({
      ...st,
      you,
      discard: [...st.discard, card],
      phase: 'done',
      youScore: sc.youScore,
      aiScore: sc.aiScore,
      result: sc.result,
    })
  }

  // Can you knock with the currently selected card as the discard?
  const knockDeadIfDiscard = useMemo(() => {
    if (st.phase !== 'discard' || !sel) return null
    const trial = st.you.filter((c) => c.id !== sel)
    if (trial.length !== 10) return null
    return analyze(trial).deadwood
  }, [st.phase, st.you, sel])

  const canKnock = knockDeadIfDiscard !== null && knockDeadIfDiscard <= 10

  const playAgain = (): void => {
    setSt(fresh())
    setSel(null)
  }

  const cardMelded = (id: string): boolean => youAnal.meldIds.has(id)

  return (
    <div className="wg-screen" data-testid="game-gin-rummy">
      <div className="wg-out">
        <div className="wg-dim">WOPR GIN RUMMY</div>
        <div className="wg-dim" style={{ marginBottom: '0.5rem' }}>
          STOCK {st.stock.length}   YOUR DEADWOOD {youAnal.deadwood}
          {st.phase === 'done' ? `   AI DEADWOOD ${aiAnal.deadwood}` : ''}
        </div>

        <div style={{ marginBottom: '0.4rem' }}>
          <span className="wg-amber">WOPR  </span>
          {st.ai.map((c, i) =>
            st.phase === 'done' ? (
              <span key={c.id}>
                {' '}
                <CardSpan card={c} meld={aiAnal.meldIds.has(c.id)} />
              </span>
            ) : (
              <span key={i} className="wg-dim">
                {' '}
                [??]
              </span>
            ),
          )}
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <span className="wg-amber">DISC  </span>
          {topDiscard ? (
            <span> <CardSpan card={topDiscard} /></span>
          ) : (
            <span className="wg-dim"> (EMPTY)</span>
          )}
          <span className="wg-dim">
            {' '}
            ({st.discard.length} IN PILE)
          </span>
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <div className="wg-amber" style={{ marginBottom: '0.2rem' }}>
            YOUR HAND (AMBER = MELDED)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.15rem' }}>
            {youSorted.map((c) => {
              const selected = sel === c.id
              const clickable = st.phase === 'discard' && st.turn === 'YOU'
              return (
                <button
                  key={c.id}
                  type="button"
                  className={selected ? 'wg-opt wg-amber' : 'wg-opt'}
                  style={{
                    border: selected ? '1px solid var(--amber)' : '1px solid transparent',
                  }}
                  disabled={!clickable}
                  onClick={() => setSel(c.id)}
                  data-testid={`gin-card-${c.id}`}
                >
                  <CardSpan card={c} meld={cardMelded(c.id)} />
                </button>
              )
            })}
          </div>
        </div>

        {st.phase === 'done' && (
          <div
            className={
              st.youScore > st.aiScore
                ? 'wg-big wg-amber'
                : st.aiScore > st.youScore
                  ? 'wg-big wg-red'
                  : 'wg-big'
            }
            style={{ marginBottom: '0.4rem' }}
          >
            {st.result}
          </div>
        )}
        {st.phase === 'done' && (
          <div className="wg-dim" style={{ marginBottom: '0.4rem' }}>
            SCORE  YOU {st.youScore}  /  WOPR {st.aiScore}
          </div>
        )}

        <div className="wg-opts">
          {st.phase === 'draw' && st.turn === 'YOU' && (
            <>
              <button
                type="button"
                className="wg-opt"
                onClick={() => drawFrom('stock')}
                data-testid="gin-draw-stock"
                autoFocus
              >
                &gt; DRAW FROM STOCK
              </button>
              <button
                type="button"
                className="wg-opt"
                onClick={() => drawFrom('discard')}
                data-testid="gin-draw-discard"
                disabled={!topDiscard}
              >
                &gt; TAKE DISCARD{topDiscard ? ` (${topDiscard.rank}${topDiscard.suit})` : ''}
              </button>
            </>
          )}
          {st.phase === 'discard' && st.turn === 'YOU' && (
            <>
              <button
                type="button"
                className="wg-opt"
                onClick={() => sel && discardCard(sel)}
                disabled={!sel}
                data-testid="gin-discard"
              >
                &gt; DISCARD SELECTED
              </button>
              <button
                type="button"
                className="wg-opt wg-amber"
                onClick={knock}
                disabled={!canKnock}
                data-testid="gin-knock"
              >
                &gt; {knockDeadIfDiscard === 0 ? 'GIN' : 'KNOCK'}
                {canKnock ? ` (DEADWOOD ${knockDeadIfDiscard})` : ' (DEADWOOD > 10)'}
              </button>
            </>
          )}
          {st.phase === 'done' && (
            <button
              type="button"
              className="wg-opt"
              onClick={playAgain}
              data-testid="gin-again"
              autoFocus
            >
              &gt; PLAY AGAIN
            </button>
          )}
          <button
            type="button"
            className="wg-opt wg-amber"
            onClick={onExit}
            data-testid="game-exit"
          >
            &gt; EXIT
          </button>
        </div>

        <div className="wg-hint">
          DRAW, THEN SELECT A CARD TO DISCARD. KNOCK AT DEADWOOD 10 OR LESS, GIN
          AT 0.
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'GIN RUMMY', Component: GinRummy }
