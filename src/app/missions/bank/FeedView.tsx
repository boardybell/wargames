// The withdrawal request feed: the chronological list of authored and injected
// requests. Each entry shows the request, its application outcome, its reason
// line, and its markers: BEFORE HOLD or AFTER HOLD, and INJECTED when the
// request came from a threshold crossing. The reason lines come from engine
// selectors: the AUTHORED reason for an authored request comes straight off the
// immutable payload def, and the CODE-DERIVED outcome text comes from
// renderRequestOutcome over the typed outcome code. Substate carries codes only,
// never strings; this view never reads a reason string from substate and never
// invents one. A request that drained in the same dispatch that applied the
// broad hold is BEFORE HOLD by construction (drains precede action reduction);
// the view just renders the marker the engine recorded. Uppercase diction, no
// em-dashes.
import type { BankPayload } from '@engine/missions/bank/content'
import type { BankState, RequestState } from '@engine/missions/bank/types'
import { renderRequestOutcome } from '@engine/missions/bank/selectors'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'

export interface FeedViewProps {
  readonly payload: BankPayload
  readonly state: BankState
}

/** One row the feed renders: the request id, its source account, its sought
 *  amount, its AUTHORED reason (payload copy), whether it is injected, and an
 *  authored offset for ordering (null for injected, which fire at a crossing). */
interface FeedEntry {
  readonly id: string
  readonly accountId: string
  readonly amount: number
  /** AUTHORED reason straight off the payload def. Never from substate. */
  readonly reason: string
  readonly injected: boolean
  readonly offsetSeconds: number | null
}

/** Enumerate every request the feed can show: the authored waves in offset
 *  order, then the injected contagion draws (which fire at a threshold crossing,
 *  so they carry no authored offset and sort after the authored waves). */
function feedEntries(payload: BankPayload): FeedEntry[] {
  const authored: FeedEntry[] = payload.requests.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    amount: r.amount,
    reason: r.reason,
    injected: false,
    offsetSeconds: r.offsetSeconds,
  }))
  authored.sort((a, b) => (a.offsetSeconds ?? 0) - (b.offsetSeconds ?? 0))
  const injected: FeedEntry[] = []
  for (const threshold of payload.thresholds) {
    for (const inj of threshold.injected) {
      injected.push({
        id: inj.id,
        accountId: inj.accountId,
        amount: inj.baseAmount,
        reason: inj.reason,
        injected: true,
        offsetSeconds: null,
      })
    }
  }
  return [...authored, ...injected]
}

/** The marker for a resolved request: INJECTED takes precedence (a contagion
 *  draw is never a genuine depositor withdrawal), then AFTER HOLD or BEFORE
 *  HOLD read off the engine-recorded arrivedAfterHold flag. A pending request
 *  shows no hold marker yet. */
function holdMarker(entry: FeedEntry, rs: RequestState | undefined): string {
  if (entry.injected) return 'INJECTED'
  if (!rs || rs.outcome === 'pending') return 'PENDING'
  return rs.arrivedAfterHold ? 'AFTER HOLD' : 'BEFORE HOLD'
}

export function FeedView({ payload, state }: FeedViewProps) {
  const entries = feedEntries(payload)
  return (
    <div data-testid="bank-feed-view">
      <div className="bank-feed-legend">
        <GlossaryTerm id="bank-depositor-confidence" />
      </div>

      {entries.map((entry) => {
        const rs = state.requests[entry.id]
        const outcome = rs?.outcome ?? 'pending'
        const marker = holdMarker(entry, rs)
        return (
          <div
            key={entry.id}
            data-testid={`feed-row-${entry.id}`}
            data-outcome={outcome}
            data-marker={marker}
            data-injected={entry.injected ? 'true' : 'false'}
            className="feed-row"
          >
            <TerminalText>
              {`${entry.id}  ${entry.amount} FROM ${entry.accountId}  [${marker}]`}
            </TerminalText>
            {/* The AUTHORED reason line, straight off the payload def. */}
            <TerminalText dim>{entry.reason}</TerminalText>
            {/* The CODE-DERIVED outcome text, from the engine selector over the
                typed outcome code. Never a substate string. */}
            <div data-testid={`feed-outcome-${entry.id}`}>
              <TerminalText>{renderRequestOutcome(outcome)}</TerminalText>
            </div>
          </div>
        )
      })}
    </div>
  )
}
