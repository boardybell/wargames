// Original terminal card tiles shared by the five card games. Crisp rectangular
// tiles with a readable rank and suit, a reserved badge slot (HELD / PASS /
// selection) that never changes tile width, and distinct focus, selection,
// eligibility and disabled states. Red suits stay red by convention; ownership
// comes from the hand panel, not suit color.
import type { ReactNode } from 'react'

export type Suit = '♠' | '♥' | '♦' | '♣'
export interface PlayingCard {
  readonly rank: string
  readonly suit: Suit | string
}

const SUIT_NAME: Record<string, string> = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const RANK_NAME: Record<string, string> = {
  A: 'ace',
  K: 'king',
  Q: 'queen',
  J: 'jack',
  T: 'ten',
  '10': 'ten',
}

export function cardName(c: PlayingCard): string {
  return `${RANK_NAME[c.rank] ?? c.rank} of ${SUIT_NAME[c.suit] ?? c.suit}`
}
export const isRedSuit = (s: string): boolean => s === '♥' || s === '♦'

export interface CardTileProps {
  readonly card?: PlayingCard
  readonly faceDown?: boolean
  /** Persistent selected state (amber border + badge). */
  readonly selected?: boolean
  /** Badge text in the reserved slot, e.g. HELD, PASS, NEW. */
  readonly badge?: string
  /** Legal to act on now (subtle highlight). */
  readonly eligible?: boolean
  /** Informational emphasis, e.g. melded or winning card. */
  readonly mark?: 'meld' | 'win' | 'last' | 'none'
  readonly onClick?: () => void
  readonly disabled?: boolean
  readonly size?: 'sm' | 'md' | 'lg'
  readonly testId?: string
  readonly label?: string
  readonly footer?: ReactNode
}

export function CardTile(p: CardTileProps) {
  const size = p.size ?? 'md'
  const cls = [
    'gs-card',
    `gs-card-${size}`,
    p.faceDown ? 'gs-card-back' : '',
    p.card && !p.faceDown && isRedSuit(p.card.suit) ? 'gs-card-red' : '',
    p.selected ? 'is-selected' : '',
    p.eligible ? 'is-eligible' : '',
    p.mark && p.mark !== 'none' ? `is-${p.mark}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const name = p.faceDown || !p.card ? 'face-down card' : cardName(p.card)
  const body = (
    <>
      <span className="gs-card-badge" aria-hidden={!p.badge}>
        {p.badge ?? ''}
      </span>
      {p.faceDown || !p.card ? (
        <span className="gs-card-back-pattern" aria-hidden="true" />
      ) : (
        <>
          <span className="gs-card-rank">{p.card.rank === 'T' ? '10' : p.card.rank}</span>
          <span className="gs-card-suit">{p.card.suit}</span>
        </>
      )}
      {p.footer}
    </>
  )
  if (p.onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={p.onClick}
        disabled={p.disabled}
        aria-pressed={p.selected}
        aria-label={p.label ?? `${name}${p.badge ? `, ${p.badge.toLowerCase()}` : ''}`}
        data-testid={p.testId}
      >
        {body}
      </button>
    )
  }
  return (
    <span className={cls} role="img" aria-label={p.label ?? name} data-testid={p.testId}>
      {body}
    </span>
  )
}

/** A labeled row of cards. Wraps in a stable grid; `label` names the owner. */
export function CardHand({
  label,
  total,
  children,
  testId,
  inactiveReason,
  compact,
}: {
  label?: ReactNode
  total?: ReactNode
  children: ReactNode
  testId?: string
  inactiveReason?: string
  compact?: boolean
}) {
  return (
    <section className={`gs-hand${compact ? ' gs-hand-compact' : ''}`} data-testid={testId}>
      {(label || total !== undefined) && (
        <header className="gs-hand-head">
          {label && <span className="gs-hand-label">{label}</span>}
          {total !== undefined && <span className="gs-hand-total">{total}</span>}
        </header>
      )}
      <div className="gs-hand-cards">{children}</div>
      {inactiveReason && <p className="gs-hand-reason">{inactiveReason}</p>}
    </section>
  )
}

/** Group cards by suit in a stable order, keeping original indices. */
export function groupBySuit<C extends PlayingCard>(cards: readonly C[], order: readonly string[] = ['♠', '♥', '♣', '♦']): { suit: string; items: { card: C; index: number }[] }[] {
  return order
    .map((suit) => ({ suit, items: cards.map((card, index) => ({ card, index })).filter((x) => x.card.suit === suit) }))
    .filter((g) => g.items.length > 0)
}

export type Seat = 'N' | 'E' | 'S' | 'W'
export interface TrickSeat {
  readonly name: string
  readonly card?: PlayingCard
  readonly winner?: boolean
  readonly active?: boolean
  readonly lead?: boolean
  readonly note?: ReactNode
}

/** Four-seat trick area (Hearts, Bridge). North on top, South at the bottom. */
export function TrickTable({ seats, center, testId }: { seats: Record<Seat, TrickSeat>; center?: ReactNode; testId?: string }) {
  const seat = (k: Seat) => {
    const s = seats[k]
    return (
      <div className={`gs-seat gs-seat-${k}${s.active ? ' is-active' : ''}${s.winner ? ' is-winner' : ''}`}>
        <span className="gs-seat-name">
          {s.name}
          {s.lead ? ' · LEAD' : ''}
          {s.active ? ' ◂' : ''}
        </span>
        {s.card ? (
          <CardTile card={s.card} size="sm" mark={s.winner ? 'win' : 'none'} badge={s.winner ? 'WINS' : undefined} />
        ) : (
          <span className="gs-card gs-card-sm gs-card-empty" aria-label={`${s.name}: no card`} role="img" />
        )}
        {s.note && <span className="gs-seat-note">{s.note}</span>}
      </div>
    )
  }
  return (
    <div className="gs-trick" data-testid={testId}>
      {seat('N')}
      {seat('W')}
      <div className="gs-trick-center">{center}</div>
      {seat('E')}
      {seat('S')}
    </div>
  )
}
