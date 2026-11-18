// The message detail pane: authored body lines, then the action controls.
// Opening a message dispatches READ (the engine emits the audit clue on the
// first read of the audit message; the view does nothing extra). Actions go
// through the shared ActionBar with inline disabled reasons pulled from the
// engine validator, so an illegal SEND reads as unavailable with cause stated
// before any attempt. TRACE renders the record through the shared record
// detail with OBSERVED/EXERCISE/DERIVED glossary terms; CHECK SOURCE renders a
// pending line then the resolved reply from the emitted event. Uppercase
// terminal diction, no em-dashes.
import type {
  DeskId,
  OutlookMessage,
  OutlookState,
} from '@engine/missions/outlook/types'
import type { MissionModule, RecordGraph, SourceCheckOutcome } from '@engine'
import { trace } from '@engine'
import { TerminalText, DetailPane } from '../../terminal/TerminalText'
import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import {
  makeReadAction,
  makeFlagAction,
  makeQueueAction,
  makeSendAction,
  makeTraceAction,
  makeCheckSourceAction,
} from './verbs'

export interface SourceCheckView {
  readonly pending: boolean
  readonly outcome: SourceCheckOutcome | null
  readonly arrivedAfterSettlement: boolean
  readonly replyLines: readonly string[]
}

export interface MessageViewProps {
  readonly message: OutlookMessage
  readonly substate: OutlookState | null
  readonly module: MissionModule<OutlookState>
  readonly graph: RecordGraph
  /** True once the player TRACEd this record and the detail is open. */
  readonly traced: boolean
  readonly sourceCheck: SourceCheckView | null
  readonly onBack: () => void
  /** The candidate desks the player can route to. Authored desk set, in a
   *  fixed order; the authored correctRecipient is NEVER singled out, so a
   *  mouse-only player must read the evidence to pick the right desk. */
  readonly desks: readonly DeskId[]
  /** The desk the player has selected in the picker, or null when none is
   *  chosen yet. A SEND dispatches exactly this, so the button path can route
   *  WRONG and never auto-delivers the authored answer. */
  readonly chosenDesk: DeskId | null
  readonly onChooseDesk: (desk: DeskId | null) => void
}

function disabledFor(
  module: MissionModule<OutlookState>,
  substate: OutlookState | null,
  action: { readonly payload: unknown },
): { disabled: boolean; reason?: string } {
  if (!substate) return { disabled: false }
  const verdict = module.validate(substate, action.payload)
  return verdict.valid
    ? { disabled: false }
    : { disabled: true, reason: verdict.reason }
}

function originGlossary(origin: 'OBSERVED' | 'EXERCISE' | 'DERIVED') {
  const id = origin.toLowerCase()
  return <GlossaryTerm id={id} />
}

export function MessageView({
  message,
  substate,
  module,
  graph,
  traced,
  sourceCheck,
  onBack,
  desks,
  chosenDesk,
  onChooseDesk,
}: MessageViewProps) {
  const readAction = makeReadAction(message.id)
  const flagAction = makeFlagAction(message.id)
  const queuePrimary = makeQueueAction(message.id, 'primary')
  const queueBackup = makeQueueAction(message.id, 'backup')
  // The SEND dispatches the desk the PLAYER chose, never the authored answer.
  // A null choice means no desk picked; the engine logs it as NO DESK.
  const sendPrimary = makeSendAction(message.id, 'primary', chosenDesk)
  const sendBackup = makeSendAction(message.id, 'backup', chosenDesk)

  const sendPrimaryState = disabledFor(module, substate, sendPrimary)
  const sendBackupState = disabledFor(module, substate, sendBackup)
  const queuePrimaryState = disabledFor(module, substate, queuePrimary)
  const queueBackupState = disabledFor(module, substate, queueBackup)

  const actions: ActionBarItem[] = [
    { label: 'READ', action: readAction },
    { label: 'FLAG', action: flagAction },
    {
      label: 'QUEUE PRIMARY',
      action: queuePrimary,
      testId: 'action-QUEUE PRIMARY',
      disabled: queuePrimaryState.disabled,
      disabledReason: queuePrimaryState.reason,
    },
    {
      label: 'QUEUE BACKUP',
      action: queueBackup,
      testId: 'action-QUEUE BACKUP',
      disabled: queueBackupState.disabled,
      disabledReason: queueBackupState.reason,
    },
    {
      label: 'SEND',
      action: sendPrimary,
      testId: 'action-SEND',
      disabled: sendPrimaryState.disabled,
      disabledReason: sendPrimaryState.reason,
    },
    {
      label: 'SEND BACKUP',
      action: sendBackup,
      testId: 'action-SEND-backup',
      disabled: sendBackupState.disabled,
      disabledReason: sendBackupState.reason,
    },
  ]
  if (message.recordId !== null) {
    actions.push({
      label: 'TRACE',
      action: makeTraceAction(message.recordId),
      testId: 'action-TRACE',
    })
    // CHECK SOURCE is a campaign action (REQUEST_SOURCE_CHECK), not a mission
    // action, so the mission validate() does not judge it; the engine does on
    // dispatch. It stays enabled and reports any rejection inline via ActionBar.
    actions.push({
      label: 'CHECK SOURCE',
      action: makeCheckSourceAction(message.recordId),
      testId: 'action-CHECK SOURCE',
    })
  }

  const traceResult =
    traced && message.recordId !== null ? trace(graph, message.recordId) : null

  return (
    <DetailPane>
      <div data-testid="message-view" data-message-id={message.id}>
        <TerminalText>
          {[
            `FROM: ${message.from}`,
            `TO: ${message.to ?? 'UNROUTED'}`,
            `SUBJECT: ${message.subject}`,
            '',
            ...message.body,
          ].join('\n')}
        </TerminalText>
        {message.requiredKind === 'audit' ? (
          <div className="message-note">
            THIS CARRIES AN <GlossaryTerm id="outlook-exercise-bulletin" />.
          </div>
        ) : null}

        <div
          className="desk-picker"
          data-testid="desk-picker"
          role="radiogroup"
          aria-label="route to desk"
        >
          <span className="desk-picker-label">ROUTE TO:</span>
          {desks.map((desk) => (
            <button
              key={desk}
              type="button"
              role="radio"
              aria-checked={chosenDesk === desk}
              data-testid={`desk-choice-${desk}`}
              data-chosen={chosenDesk === desk ? 'true' : 'false'}
              onClick={() => onChooseDesk(chosenDesk === desk ? null : desk)}
            >
              {desk}
            </button>
          ))}
        </div>

        <ActionBar actions={actions} />

        {traceResult && traceResult.found ? (
          <div
            data-testid="record-detail"
            data-record-id={traceResult.recordId}
          >
            <TerminalText dim>
              {[
                `RECORD ${traceResult.recordId}`,
                `ORIGIN ${traceResult.origin}`,
                `RUN ${traceResult.runId ?? 'NONE'}`,
                `EVENT ${traceResult.eventTime}`,
                `RECEIPT ${traceResult.receiptTime}`,
              ].join('\n')}
            </TerminalText>
            <div className="record-origin">
              ORIGIN: {originGlossary(traceResult.origin)}
            </div>
            {traceResult.parent ? (
              <div className="record-parent">
                PARENT {traceResult.parent.id} ORIGIN{' '}
                {originGlossary(traceResult.parent.origin)}
              </div>
            ) : null}
          </div>
        ) : null}

        {sourceCheck ? (
          sourceCheck.pending ? (
            <div data-testid="source-check-pending">
              <TerminalText dim>SOURCE CHECK PENDING. DESK NOTIFIED.</TerminalText>
            </div>
          ) : sourceCheck.outcome ? (
            <div
              data-testid="source-check-result"
              data-outcome={sourceCheck.outcome}
            >
              <TerminalText>
                {[
                  `SOURCE CHECK: ${sourceCheck.outcome}`,
                  sourceCheck.outcome === 'CONTRADICTED'
                    ? 'MARKER: >> CONTRADICTED BY DESK <<'
                    : sourceCheck.outcome === 'CONFIRMED'
                      ? 'MARKER: ++ CONFIRMED BY DESK ++'
                      : `MARKER: .. ${sourceCheck.outcome} ..`,
                  ...sourceCheck.replyLines,
                  sourceCheck.arrivedAfterSettlement
                    ? 'NOTE: REPLY ARRIVED AFTER SETTLEMENT.'
                    : '',
                ]
                  .filter((l) => l.length > 0)
                  .join('\n')}
              </TerminalText>
            </div>
          ) : null
        ) : null}

        <button type="button" data-testid="message-back" onClick={onBack}>
          BACK
        </button>
      </div>
    </DetailPane>
  )
}
