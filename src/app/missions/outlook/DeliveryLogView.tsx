// The delivery log: a chronological render over the send records in mission
// state. Each row shows the dispatch time, channel, recipient, and the
// acknowledgment state (receipt time, PENDING, or REJECTED with reason). Pure
// render, no engine calls. DELIVERY RECEIPT carries its glossary term.
// Uppercase terminal diction, no em-dashes.
import type { OutlookState } from '@engine/missions/outlook/types'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'

export interface DeliveryLogViewProps {
  readonly substate: OutlookState | null
  /** A narrow-width back affordance that returns to the inbox list. Omitted
   *  (null) on the two-pane desktop layout where the tabs are always visible. */
  readonly onBack?: (() => void) | null
}

function ackLabel(resolution: string, scheduledAckAt: number): string {
  if (resolution === 'acknowledged') return `RECEIPT ${scheduledAckAt}`
  if (resolution === 'rejected') return 'REJECTED'
  return 'PENDING'
}

export function DeliveryLogView({ substate, onBack = null }: DeliveryLogViewProps) {
  const sends = substate?.sends ?? []

  return (
    <div data-testid="delivery-log">
      {onBack ? (
        <button type="button" data-testid="log-back" onClick={onBack}>
          BACK
        </button>
      ) : null}
      <div className="delivery-log-head">
        <GlossaryTerm id="outlook-delivery-receipt" /> LOG
      </div>
      {sends.length === 0 ? (
        <TerminalText dim>NO SENDS DISPATCHED.</TerminalText>
      ) : (
        sends.map((record, index) => (
          <div key={index} data-testid={`log-row-${index}`}>
            <TerminalText>
              {[
                `${index}.`,
                `SENT ${record.sentAt}`,
                record.channel.toUpperCase(),
                record.recipient ?? 'NO DESK',
                ackLabel(record.resolution, record.scheduledAckAt),
              ].join('  ')}
            </TerminalText>
          </div>
        ))
      )}
    </div>
  )
}
