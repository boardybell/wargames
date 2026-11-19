// The GLOBAL FAILSAFE decision view. Three commit controls with their gating
// rendered plainly: STAGED RECOVERY shows the per-threshold pass/fail list
// beside the control and enables only when caseValid AND viability pass; HOLD
// AND VERIFY is always enabled; REPEAT D-83 is always enabled behind its
// confirmation. Each commit raises a native confirmation dialog; REPEAT's quotes
// its own projection figures. Cancel leaves state untouched; confirm dispatches
// COMMIT and the engine settles synchronously. NO engine logic here:
// stagedEligible and the projections are engine-owned; this view renders the
// gating result and routes the shared commit builder.
import { useEffect, useRef, useState } from 'react'
import type { CampaignAction } from '@engine'
import type { CommitChoice } from '@engine/missions/finale/types'
import { stagedEligible } from '@engine/missions/finale/endings'
import type { BranchProjection } from '@engine'
import type { StagedComputation } from '@engine/missions/finale/projections'
import { Dialog } from '../../screens/Dialog'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import { makeCommitAction, type CommitSnapshotRef } from './verbs'

export interface DecisionViewProps {
  readonly caseValid: boolean
  /** The single StagedComputation whose .projection the comparison STAGED column
   *  also reads, and whose .viability drives the threshold panel here. */
  readonly staged: StagedComputation | null
  /** The REPEAT projection, quoted verbatim in its confirmation. */
  readonly repeatProjection: BranchProjection | null
  readonly onAction: (action: CampaignAction) => void
  /** The reference-only settled-metrics snapshot a STAGED commit carries so the
   *  ENGINE recomputes the viability win gate at commit. */
  readonly commitSnapshot: CommitSnapshotRef
  /** A typed COMMIT routed here opens the SAME confirmation gate the button
   *  raises. Non-null requests the dialog for that choice; onRequestHandled
   *  clears it once the dialog has been opened (so a dismiss then re-type works). */
  readonly requestedCommit?: CommitChoice | null
  readonly onRequestHandled?: () => void
}

const CHOICE_LABEL: Readonly<Record<CommitChoice, string>> = {
  staged: 'STAGED RECOVERY',
  hold: 'HOLD AND VERIFY',
  repeat: 'REPEAT D-83',
}

export function DecisionView({
  caseValid,
  staged,
  repeatProjection,
  onAction,
  commitSnapshot,
  requestedCommit = null,
  onRequestHandled,
}: DecisionViewProps) {
  const [confirming, setConfirming] = useState<CommitChoice | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const viability = staged?.viability ?? null
  const stagedOpen = staged !== null && stagedEligible(caseValid, staged.viability)

  const ask = (choice: CommitChoice): void => setConfirming(choice)

  // A typed COMMIT routed in opens the same dialog the button raises. Open the
  // gate for the requested choice, then clear the request so a later cancel and
  // re-type reopens it.
  useEffect(() => {
    if (requestedCommit !== null) {
      setConfirming(requestedCommit)
      onRequestHandled?.()
    }
  }, [requestedCommit, onRequestHandled])
  const cancel = (): void => setConfirming(null)
  const confirm = (): void => {
    if (confirming === null) return
    const choice = confirming
    setConfirming(null)
    onAction(makeCommitAction(choice, commitSnapshot))
  }

  const confirmBody = (): string => {
    if (confirming === 'repeat' && repeatProjection) {
      return `REPEAT D-83 PROJECTS DELIVERIES AT ${repeatProjection.deliveries}, PASSENGERS AT ${repeatProjection.passengers}, OPEN EXCEPTIONS AT ${repeatProjection.openExceptions}. THIS SETTLES THE FINALE ON THE REPEATED ORDER AND COLLAPSES SERVICE.`
    }
    if (confirming === 'staged' && staged) {
      return `STAGED RECOVERY PROJECTS PASSENGERS AT ${staged.projection.passengers} AND OPEN EXCEPTIONS AT ${staged.projection.openExceptions}. THIS SETTLES THE FINALE.`
    }
    if (confirming === 'hold') {
      return 'HOLD AND VERIFY FREEZES THE DAMAGE WHERE IT STANDS AND SETTLES THE FINALE.'
    }
    return 'THIS SETTLES THE FINALE.'
  }

  return (
    <div data-testid="finale-decision">
      <div className="finale-commit finale-commit-staged">
        <button
          type="button"
          data-testid="finale-commit-staged"
          disabled={!stagedOpen}
          onClick={() => ask('staged')}
        >
          {CHOICE_LABEL.staged}
        </button>
        {/* Per-threshold pass/fail beside the control. The companion figures are
            the SAME object the comparison STAGED column reads. */}
        <div
          className="finale-viability"
          data-testid="finale-viability-panel"
          data-pass={viability?.pass ? 'true' : 'false'}
        >
          <TerminalText dim>
            <GlossaryTerm id="finale-viability-threshold" /> VIABILITY
          </TerminalText>
          {viability ? (
            <ul className="finale-thresholds">
              {viability.thresholds.map((t) => (
                <li
                  key={t.id}
                  data-testid={`finale-threshold-${t.id}`}
                  data-pass={t.pass ? 'true' : 'false'}
                >
                  {`${t.id.toUpperCase()}: ${t.actual} OF ${t.required} ${t.pass ? 'PASS' : 'FAIL'}`}
                </li>
              ))}
            </ul>
          ) : (
            <TerminalText dim>RUN THE COMPARISON TO READ VIABILITY.</TerminalText>
          )}
          {staged ? (
            <div className="finale-viability-figures">
              <div
                data-testid="finale-viability-figure-passengers"
                data-value={staged.projection.passengers}
              >
                PASSENGERS: {staged.projection.passengers}
              </div>
              <div
                data-testid="finale-viability-figure-openExceptions"
                data-value={staged.projection.openExceptions}
              >
                OPEN EXCEPTIONS: {staged.projection.openExceptions}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="finale-commit finale-commit-hold">
        <button
          type="button"
          data-testid="finale-commit-hold"
          onClick={() => ask('hold')}
        >
          {CHOICE_LABEL.hold}
        </button>
      </div>

      <div className="finale-commit finale-commit-repeat">
        <button
          type="button"
          data-testid="finale-commit-repeat"
          onClick={() => ask('repeat')}
        >
          {CHOICE_LABEL.repeat}
        </button>
      </div>

      <Dialog
        open={confirming !== null}
        onClose={cancel}
        labelledBy="finale-confirm-heading"
        testId="finale-commit-confirm"
        initialFocus={() => confirmRef.current}
      >
        <h2 id="finale-confirm-heading">
          {confirming ? `CONFIRM ${CHOICE_LABEL[confirming]}` : 'CONFIRM'}
        </h2>
        <p data-testid="finale-confirm-body">{confirmBody()}</p>
        <div className="dialog-actions">
          <button
            ref={confirmRef}
            type="button"
            data-testid="finale-confirm-yes"
            onClick={confirm}
          >
            CONFIRM
          </button>
          <button
            type="button"
            data-testid="finale-confirm-no"
            onClick={cancel}
          >
            CANCEL
          </button>
        </div>
      </Dialog>
    </div>
  )
}
