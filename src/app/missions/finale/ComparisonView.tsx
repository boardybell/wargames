// The GLOBAL FAILSAFE comparison view. RUN COMPARISON (gated on caseValid) asks
// the engine for the three branch projections over the frozen finale snapshot;
// the view renders three PROJECTION-badged columns (REPEAT D-83, HOLD AND
// VERIFY, STAGED RECOVERY), stacked at narrow widths. Each column plays its
// authored BranchStep trace through the shared playBranchTrace primitive
// (skippable, instant under reduced motion, readable after skip). The STAGED
// column renders the SAME StagedComputation object the DecisionView viability
// panel reads, so a panel and a column can never contradict: one computation,
// rendered twice. NO engine logic here: runProjections and traceFor are
// engine-owned pure transforms; this view renders their results.
import type { BranchProjection } from '@engine'
import {
  runProjections,
  traceFor,
  type BranchId,
  type FinaleSnapshot,
  type StagedComputation,
} from '@engine/missions/finale/projections'
import { PlayBranchTrace } from '../../grid/playBranchTrace'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import { makeRunComparisonAction } from './verbs'
import type { CampaignAction } from '@engine'

export interface ComparisonResult {
  readonly repeat: BranchProjection
  readonly hold: BranchProjection
  readonly staged: StagedComputation
}

/** Build the three branch results from a frozen snapshot. Pure and
 *  deterministic: the same snapshot renders strictly-equal figures every call,
 *  and the single StagedComputation feeds both this view and the decision
 *  panel. The screen holds the result and passes it to both views. */
export function computeComparison(snapshot: FinaleSnapshot): ComparisonResult {
  return runProjections(snapshot)
}

const COLUMN_LABEL: Readonly<Record<BranchId, string>> = {
  repeat: 'REPEAT D-83',
  hold: 'HOLD AND VERIFY',
  staged: 'STAGED RECOVERY',
}

const FIGURE_KEYS: readonly (keyof BranchProjection)[] = [
  'openExceptions',
  'deliveries',
  'passengers',
  'payments',
  'confidence',
]

const FIGURE_LABEL: Readonly<Record<keyof BranchProjection, string>> = {
  openExceptions: 'OPEN EXCEPTIONS',
  deliveries: 'DELIVERIES',
  passengers: 'PASSENGERS',
  payments: 'PAYMENTS',
  confidence: 'CONFIDENCE',
}

function ProjectionColumn({
  branch,
  projection,
  snapshot,
}: {
  readonly branch: BranchId
  readonly projection: BranchProjection
  readonly snapshot: FinaleSnapshot
}) {
  const steps = traceFor(branch, snapshot)
  return (
    <div
      className="finale-column"
      data-testid={`finale-column-${branch}`}
      data-branch={branch}
    >
      <TerminalText>{COLUMN_LABEL[branch]}</TerminalText>
      <div className="finale-figures">
        {FIGURE_KEYS.map((key) => (
          <div
            key={key}
            className="finale-figure"
            data-testid={`finale-figure-${branch}-${key}`}
            data-value={projection[key]}
          >
            <span className="finale-badge" data-testid={`finale-projection-badge-${branch}-${key}`}>
              <GlossaryTerm id="finale-projection" />
            </span>{' '}
            {FIGURE_LABEL[key]}: {projection[key]}
          </div>
        ))}
      </div>
      <PlayBranchTrace steps={steps} />
    </div>
  )
}

export interface ComparisonViewProps {
  readonly caseValid: boolean
  readonly snapshot: FinaleSnapshot
  /** The computed comparison, held by the screen so it freezes at the snapshot
   *  used and survives return navigation. Null before RUN COMPARISON. */
  readonly result: ComparisonResult | null
  readonly comparisonsRun: number
  readonly onAction: (action: CampaignAction) => void
}

export function ComparisonView({
  caseValid,
  snapshot,
  result,
  comparisonsRun,
  onAction,
}: ComparisonViewProps) {
  return (
    <div data-testid="finale-comparison">
      <button
        type="button"
        data-testid="finale-run-comparison"
        disabled={!caseValid}
        onClick={() => onAction(makeRunComparisonAction())}
      >
        RUN COMPARISON
      </button>
      {!caseValid ? (
        <TerminalText dim>CERTIFY THE CASE BEFORE PROJECTING THE ORDERS.</TerminalText>
      ) : null}

      {result !== null ? (
        <>
          <TerminalText dim>{`COMPARISONS RUN ${comparisonsRun}`}</TerminalText>
          <div className="finale-columns" data-testid="finale-columns">
            <ProjectionColumn
              branch="repeat"
              projection={result.repeat}
              snapshot={snapshot}
            />
            <ProjectionColumn
              branch="hold"
              projection={result.hold}
              snapshot={snapshot}
            />
            {/* The STAGED column reads result.staged.projection, the SAME object
                the DecisionView viability panel's companion figures read. */}
            <ProjectionColumn
              branch="staged"
              projection={result.staged.projection}
              snapshot={snapshot}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
