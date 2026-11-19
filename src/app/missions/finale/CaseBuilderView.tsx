// The GLOBAL FAILSAFE case builder view. Five slots rendered from FinaleState;
// every record from all three missions is a candidate regardless of outcome.
// SELECT attaches a record to a slot by keyboard AND by tap through the SAME
// action builder, so the two paths produce identical state. The three subsystem
// slots expose MOVE UP/DOWN reorder controls; the root and observation slots do
// not. VALIDATE dispatches the engine verb; on rejection the failing slot is
// highlighted and the JOSHUA rejection line renders, with slots still editable.
// The observation slot lists corroborated candidates as attachable and
// uncorroborated independent candidates flagged UNVERIFIED and not attachable.
// REQUEST FIELD REPORT renders only while legal and shows a dispatched status
// after use. NO engine logic here: listing, legality, and validation are all
// engine-owned; this view renders results and routes the shared action builders.
import type { CampaignAction } from '@engine'
import type { FinaleState, FinaleSlot } from '@engine/missions/finale/types'
import { FINALE_SLOTS, SUBSYSTEM_SLOTS } from '@engine/missions/finale/types'
import {
  listCandidates,
  fieldReportLegal,
  type SlotCandidate,
} from '@engine/missions/finale/caseBuilder'
import type { FinaleCaseFile } from '@engine/missions/finale/types'
import type { JoshuaLine } from '@engine/joshua/lines'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import {
  makeClearAction,
  makeReorderAction,
  makeRequestFieldReportAction,
  makeSelectAction,
  makeValidateAction,
  moveWithin,
  type FinaleCaseFileRef,
} from './verbs'

const SLOT_LABELS: Readonly<Record<FinaleSlot, string>> = {
  outlook: 'OUTLOOK',
  flights: 'FLIGHTS',
  bank: 'BANK',
  root: 'ROOT',
  observation: 'OBSERVATION',
}

export interface CaseBuilderViewProps {
  readonly finaleState: FinaleState
  /** The static plus live case-file facts: the engine graph the module closes
   *  over, plus the live sourceChecks / inspectedRecords the shell threads. */
  readonly caseFile: FinaleCaseFile
  /** The reference half the action builders carry into VALIDATE / REQUEST. */
  readonly caseFileRef: FinaleCaseFileRef
  /** Whether REQUEST FIELD REPORT has already been dispatched (retires once the
   *  reply joins the list; this reflects the fieldReportRequested flag). */
  readonly fieldReportRequested: boolean
  /** The resolved JOSHUA rejection line for the current lastRejection, or null
   *  when there is none (graceful absence). Resolved by the screen via the
   *  catalog selectors; never synthesized here. */
  readonly rejectionLine: JoshuaLine | null
  readonly onAction: (action: CampaignAction) => void
}

/** A candidate's rendered label with its flags. UNVERIFIED and inspected drive
 *  data attributes the tests and the styling key off. */
function candidateTestId(slot: FinaleSlot, recordId: string): string {
  return `finale-candidate-${slot}-${recordId}`
}

export function CaseBuilderView({
  finaleState,
  caseFile,
  caseFileRef,
  fieldReportRequested,
  rejectionLine,
  onAction,
}: CaseBuilderViewProps) {
  const rejection = finaleState.lastRejection
  const canRequestFieldReport = fieldReportLegal(finaleState, caseFile)

  // The effective subsystem ordering the MOVE buttons operate over: the explicit
  // ordering when set, otherwise the filled subsystem record ids in slot order.
  // Matches the FinaleScreen verb context so a button and a typed MOVE agree.
  const effectiveOrdering: readonly string[] =
    finaleState.ordering.length > 0
      ? finaleState.ordering
      : SUBSYSTEM_SLOTS.map((s) => finaleState.slots[s]).filter(
          (id): id is string => id !== null,
        )

  return (
    <div data-testid="finale-case-builder">
      <div className="finale-case-legend">
        <GlossaryTerm id="finale-case" /> <GlossaryTerm id="finale-root-source" />
      </div>

      {FINALE_SLOTS.map((slot) => {
        const filled = finaleState.slots[slot]
        const candidates = listCandidates(slot, caseFile)
        const isSubsystem = (SUBSYSTEM_SLOTS as readonly string[]).includes(slot)
        const rejected = rejection?.slot === slot
        return (
          <div
            key={slot}
            data-testid={`finale-slot-${slot}`}
            data-filled={filled ?? ''}
            data-rejected={rejected ? 'true' : 'false'}
            className={rejected ? 'finale-slot finale-slot-rejected' : 'finale-slot'}
          >
            <TerminalText>{`${SLOT_LABELS[slot]} SLOT: ${filled ?? 'EMPTY'}`}</TerminalText>

            {/* Reorder controls on the three subsystem slots ONLY. */}
            {isSubsystem && filled !== null ? (
              <div
                className="finale-reorder"
                data-testid={`finale-reorder-${slot}`}
              >
                <button
                  type="button"
                  data-testid={`finale-move-up-${slot}`}
                  disabled={moveWithin(effectiveOrdering, filled, 'up') === null}
                  onClick={() => {
                    const next = moveWithin(effectiveOrdering, filled, 'up')
                    if (next) onAction(makeReorderAction(next))
                  }}
                >
                  MOVE UP
                </button>
                <button
                  type="button"
                  data-testid={`finale-move-down-${slot}`}
                  disabled={
                    moveWithin(effectiveOrdering, filled, 'down') === null
                  }
                  onClick={() => {
                    const next = moveWithin(effectiveOrdering, filled, 'down')
                    if (next) onAction(makeReorderAction(next))
                  }}
                >
                  MOVE DOWN
                </button>
              </div>
            ) : null}

            {/* Candidate list for this slot. A tap SELECTs; the same action a
                typed SELECT builds. UNVERIFIED candidates are not attachable. */}
            <ul className="finale-candidates" data-testid={`finale-candidates-${slot}`}>
              {candidates.map((candidate: SlotCandidate) => {
                const selected = filled === candidate.recordId
                return (
                  <li
                    key={candidate.recordId}
                    data-testid={candidateTestId(slot, candidate.recordId)}
                    data-highlighted={candidate.highlighted ? 'true' : 'false'}
                    data-unverified={candidate.unverified ? 'true' : 'false'}
                    data-attachable={candidate.attachable ? 'true' : 'false'}
                    className={
                      candidate.highlighted
                        ? 'finale-candidate finale-candidate-inspected'
                        : 'finale-candidate'
                    }
                  >
                    <button
                      type="button"
                      data-testid={`finale-attach-${slot}-${candidate.recordId}`}
                      aria-pressed={selected}
                      disabled={!candidate.attachable}
                      onClick={() =>
                        onAction(makeSelectAction(slot, candidate.recordId))
                      }
                    >
                      {candidate.recordId}
                    </button>
                    {candidate.unverified ? (
                      <span
                        className="finale-unverified"
                        data-testid={`finale-unverified-${candidate.recordId}`}
                      >
                        UNVERIFIED
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>

            {filled !== null ? (
              <button
                type="button"
                data-testid={`finale-clear-${slot}`}
                onClick={() => onAction(makeClearAction(slot))}
              >
                CLEAR
              </button>
            ) : null}
          </div>
        )
      })}

      {/* REQUEST FIELD REPORT: renders only while legal (no corroborated
          candidate exists). After the request, a dispatched/pending status
          shows and the control retires once the reply corroborates. */}
      {canRequestFieldReport && !fieldReportRequested ? (
        <button
          type="button"
          data-testid="finale-request-field-report"
          onClick={() => onAction(makeRequestFieldReportAction(caseFileRef))}
        >
          REQUEST FIELD REPORT
        </button>
      ) : null}
      {fieldReportRequested && canRequestFieldReport ? (
        <div data-testid="finale-field-report-pending" role="status">
          FIELD REPORT REQUESTED. AWAITING THE DESK REPLY.
        </div>
      ) : null}

      <button
        type="button"
        data-testid="finale-validate"
        onClick={() => onAction(makeValidateAction(caseFileRef))}
      >
        VALIDATE
      </button>

      {/* The rejection readback: the failing slot is highlighted above; here the
          JOSHUA line for lastRejection.code renders. Slots stay editable. */}
      {rejection !== null ? (
        <div
          data-testid="finale-rejection"
          data-code={rejection.code}
          data-slot={rejection.slot}
          role="status"
        >
          {rejectionLine ? (
            <TerminalText>{rejectionLine.text}</TerminalText>
          ) : (
            <TerminalText dim>{`CASE REJECTED AT ${SLOT_LABELS[rejection.slot]}`}</TerminalText>
          )}
        </div>
      ) : null}

      {finaleState.caseValid ? (
        <div data-testid="finale-case-valid" role="status">
          <TerminalText>CASE CERTIFIED.</TerminalText>
        </div>
      ) : null}
    </div>
  )
}
