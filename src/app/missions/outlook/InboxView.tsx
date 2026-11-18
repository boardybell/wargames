// The inbox list: one row per authored message, showing the sender authority
// line, subject, receipt time, and the flag mark. Selection opens the message
// detail. Bodies are never shown here; read/flag marks come from the mission
// substate, authored subject/from come from the seed payload. The receipt time
// is the record's REAL receiptTime from the evidence graph (never fabricated
// from the row index); a message with no record shows a neutral placeholder.
// Uppercase terminal diction, no em-dashes.
import type { OutlookState } from '@engine/missions/outlook/types'
import type { OutlookPayload } from '@engine/missions/outlook/content'
import { MenuRows, type MenuRowItem } from '../../terminal/MenuRows'

export interface InboxViewProps {
  readonly payload: OutlookPayload
  readonly substate: OutlookState | null
  readonly onOpen: (messageId: string) => void
  /** The record-sourced receipt clock for a message, or null when the message
   *  carries no record (a decoy). The screen resolves it from the graph. */
  readonly receiptTimeFor: (messageId: string) => string | null
}

const NO_RECEIPT = '--:--:--'

export function InboxView({ payload, substate, onOpen, receiptTimeFor }: InboxViewProps) {
  const rows: MenuRowItem[] = payload.messages.map((message) => {
    const mark = substate?.messages[message.id]
    const flag = mark?.flagged ? '[F] ' : '    '
    const read = mark?.read ? ' ' : '*'
    return {
      id: message.id,
      label: `${read}${flag}${message.from}  ${message.subject}`,
    }
  })

  return (
    <div data-testid="inbox-view">
      <MenuRows rows={rows} onSelect={onOpen} />
      <div className="inbox-manifest">
        {payload.messages.map((message) => {
          const mark = substate?.messages[message.id]
          const receipt = receiptTimeFor(message.id) ?? NO_RECEIPT
          return (
            <div
              key={message.id}
              data-testid={`inbox-row-${message.id}`}
              data-flagged={mark?.flagged ? 'true' : 'false'}
              data-read={mark?.read ? 'true' : 'false'}
            >
              {`${receipt}  ${message.from}  ${message.subject}${
                mark?.flagged ? '  FLAGGED' : ''
              }`}
            </div>
          )
        })}
      </div>
    </div>
  )
}
