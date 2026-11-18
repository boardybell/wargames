// The outbox: queue contents and the channel readouts. Each queued item shows
// its message, target channel, and position; a SEND dispatches the engine
// SEND_QUEUED action. A rejection (dark primary) renders its reason and the
// item stays queued, matching the engine contract. ETA figures come from the
// authored tuning through selectors, never computed locally. CHANNEL,
// CAPACITY, and ETA carry their glossary terms. Uppercase terminal diction, no
// em-dashes.
import type { DeskId, OutlookState } from '@engine/missions/outlook/types'
import type { OutlookPayload } from '@engine/missions/outlook/content'
import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import { makeSendQueuedAction } from './verbs'
import {
  backupEtaSeconds,
  primaryEtaSeconds,
  stageLabel,
} from './selectors'

export interface OutboxViewProps {
  readonly payload: OutlookPayload
  readonly substate: OutlookState | null
  /** The candidate desks a queued item may route to, in a fixed order. The
   *  authored correctRecipient is never singled out: the player chooses. */
  readonly desks: readonly DeskId[]
  /** The desk the player chose for the queued item at this position, or null
   *  when none is chosen yet. A SEND dispatches exactly this, so the outbox
   *  button path can route WRONG and never defaults to the authored answer. */
  readonly chosenDeskFor: (index: number) => DeskId | null
  readonly onChooseDesk: (index: number, desk: DeskId | null) => void
  /** A narrow-width back affordance that returns to the inbox list. Omitted
   *  (null) on the two-pane desktop layout where the tabs are always visible. */
  readonly onBack?: (() => void) | null
}

export function OutboxView({
  payload,
  substate,
  desks,
  chosenDeskFor,
  onChooseDesk,
  onBack = null,
}: OutboxViewProps) {
  const stage = substate?.primaryStage ?? 0
  const primaryEta = primaryEtaSeconds(payload, stage)
  const backupEta = backupEtaSeconds(payload)
  const backupRemaining = substate?.backupRemaining ?? payload.channelTuning.backupCapacity
  const queue = substate?.queue ?? []

  return (
    <div data-testid="outbox-view">
      {onBack ? (
        <button type="button" data-testid="outbox-back" onClick={onBack}>
          BACK
        </button>
      ) : null}
      <div className="outbox-readouts" data-testid="outbox-readouts">
        <div data-testid="outbox-primary-stage">
          PRIMARY <GlossaryTerm id="outlook-channel" />: {stageLabel(stage)}{' '}
          <GlossaryTerm id="outlook-eta" />{' '}
          {primaryEta === null ? 'DARK' : `${primaryEta}S`}
        </div>
        <div data-testid="outbox-backup-remaining">
          BACKUP <GlossaryTerm id="outlook-capacity" />: {backupRemaining}{' '}
          <GlossaryTerm id="outlook-eta" /> {backupEta}S
        </div>
      </div>

      {queue.length === 0 ? (
        <TerminalText dim>QUEUE EMPTY.</TerminalText>
      ) : (
        <div className="outbox-queue">
          {queue.map((item, index) => {
            const recipient = chosenDeskFor(index)
            const sendAction = makeSendQueuedAction(index, recipient)
            const actions: ActionBarItem[] = [
              {
                label: `SEND ${index}`,
                action: sendAction,
                testId: `outbox-send-${index}`,
              },
            ]
            return (
              <div key={index} data-testid={`outbox-row-${index}`}>
                <TerminalText>
                  {`${index}. ${item.messageId}  ${item.channel.toUpperCase()}  ${
                    recipient ?? 'NO DESK'
                  }`}
                </TerminalText>
                <div
                  className="desk-picker"
                  data-testid={`outbox-desk-picker-${index}`}
                  role="radiogroup"
                  aria-label="route to desk"
                >
                  <span className="desk-picker-label">ROUTE TO:</span>
                  {desks.map((desk) => (
                    <button
                      key={desk}
                      type="button"
                      role="radio"
                      aria-checked={recipient === desk}
                      data-testid={`outbox-desk-choice-${index}-${desk}`}
                      data-chosen={recipient === desk ? 'true' : 'false'}
                      onClick={() =>
                        onChooseDesk(index, recipient === desk ? null : desk)
                      }
                    >
                      {desk}
                    </button>
                  ))}
                </div>
                <ActionBar actions={actions} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
