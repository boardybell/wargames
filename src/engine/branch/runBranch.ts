// The zero-player branch runner. A branch run clones the frozen snapshot,
// forks its own RNG stream, steps a fixed scripted policy through the SAME
// reducers live play uses (dispatch from section-05), records a compact
// step trace, and projects integer service metrics from the clone's end
// state. Running a branch never touches the frozen snapshot or live state,
// and the same branch on the same snapshot is bit-identical every time.
import { forkStream } from '../rng'
import { dispatch } from '../campaign/engine'
import type { EngineContext } from '../campaign/engine'
import type { CampaignState } from '../campaign/state'
import { deepClone } from './snapshot'
import type { FrozenCampaignState } from './snapshot'
import {
  BRANCH_INDEX,
  VIABILITY_THRESHOLDS,
} from './types'
import type {
  BranchKind,
  BranchProjection,
  BranchResult,
  BranchStep,
  StagedViability,
  ViabilityThreshold,
} from './types'

// Branch time is discrete step counts; each step's synthetic now is derived
// from the snapshot's lastNow plus a fixed offset and exists only inside the
// clone. Small offsets keep steps inside the mission deadline.
const STEP_MS = 1000

interface ScriptStep {
  readonly payload: unknown
  readonly label: string
  readonly detail: string
}

function intOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

/** Sum each settled metric and compare to its integer threshold. Pure over
 *  the snapshot's settled outcomes; returns the per-threshold detail so the
 *  shell and split 06 can show why staged recovery is or is not viable. */
export function computeViability(snap: FrozenCampaignState): StagedViability {
  const totals: Record<string, number> = {}
  for (const outcome of snap.settled) {
    for (const key of Object.keys(outcome.metrics)) {
      totals[key] = (totals[key] ?? 0) + outcome.metrics[key]!
    }
  }
  const thresholds: ViabilityThreshold[] = VIABILITY_THRESHOLDS.map((t) => {
    const actual = totals[t.key] ?? 0
    return { key: t.key, actual, threshold: t.max, pass: actual <= t.max }
  })
  return { viable: thresholds.every((t) => t.pass), thresholds }
}

// The three scripted policies. SPLIT-06 SEAM: split 06 replaces these with
// the real finale policies (pure transforms over settled metrics plus the
// exception selector). Here they are fixed zero-player scripts against the
// permanent test-double mission, authored so their end states genuinely
// differ, which is what the distinctness guarantee is proven against.
function policyScript(
  kind: BranchKind,
  viability: StagedViability,
): readonly ScriptStep[] {
  switch (kind) {
    case 'REPEAT_D83':
      // Escalation: act on the decoy as if genuine, then force a response.
      // Burns capacity on a false alarm.
      return [
        {
          payload: { kind: 'DECOY' },
          label: 'ESCALATE',
          detail: 'Act on the decoy as if the emergency were real',
        },
        {
          payload: { kind: 'DELIVER' },
          label: 'FORCE',
          detail: 'Push a forced response under the assumed emergency',
        },
      ]
    case 'HOLD_AND_VERIFY':
      // Passive: withhold action pending verification; let deadlines run.
      return [
        {
          payload: { kind: 'READ_AUDIT' },
          label: 'VERIFY',
          detail: 'Withhold action and read the audit trail first',
        },
      ]
    case 'STAGED_RECOVERY':
      // Measured: act in stages gated by viability, avoiding the decoy.
      return viability.viable
        ? [
            {
              payload: { kind: 'DELIVER' },
              label: 'STAGE 1',
              detail: 'Deliver the first verified tranche',
            },
            {
              payload: { kind: 'DELIVER' },
              label: 'STAGE 2',
              detail: 'Advance recovery; thresholds remain satisfied',
            },
          ]
        : [
            {
              payload: { kind: 'DELIVER' },
              label: 'STAGE 1 (CONSTRAINED)',
              detail: 'Capacity thresholds breached; hold at one stage',
            },
          ]
  }
}

/** SPLIT-06 SEAM: honest-but-simple integer projection over the test-double
 *  mission's end state. Split 06 fills the real computation by pulling
 *  mission selectors; the fields and their integer/JSON-safe contract are
 *  fixed here. Values must differ across the three policies so the
 *  distinctness guarantee is meaningful. */
function project(
  snap: FrozenCampaignState,
  endState: CampaignState,
): BranchProjection {
  const substate = (endState.activeMission?.substate ?? {}) as Record<
    string,
    unknown
  >
  const delivered = intOr(substate['delivered'], 0)
  const goal = intOr(substate['goal'], 3)
  const decoySent = substate['decoySent'] === true
  // Clamp at zero so split 06 inherits a safe contract: confidence and
  // passengers are never negative regardless of policy or goal.
  const openExceptions = Math.max(0, snap.openExceptionsBaseline - delivered)
  const passengers = Math.max(0, delivered * 1000 - (decoySent ? 500 : 0))
  const payments = delivered * 250 + (decoySent ? 0 : 100)
  const confidence = Math.max(
    0,
    100 - (decoySent ? 40 : 0) - (goal - delivered) * 10,
  )
  return { openExceptions, deliveries: delivered, passengers, payments, confidence }
}

/** Run one zero-player branch against a frozen snapshot. Pure: the frozen
 *  snapshot is never passed to a reducer, and the result is JSON-safe and
 *  reproducible. */
export function runBranch(
  ctx: EngineContext,
  snap: FrozenCampaignState,
  kind: BranchKind,
): BranchResult {
  const viability = computeViability(snap)
  // Clone first: an unfrozen working copy. Reducers run only on the clone;
  // forking the RNG off the snapshot's state gives this branch its own
  // 2^64-separated stream, so branch order never changes the result.
  const cloned = deepClone(snap as CampaignState)
  // forkStream returns an RngState with a readonly words array; the campaign
  // state's rng carries a mutable one, so materialize a fresh array.
  const forked = forkStream(cloned.rng, BRANCH_INDEX[kind])
  let current: CampaignState = {
    ...cloned,
    rng: { words: [...forked.words] },
  }
  const steps = policyScript(kind, viability)
  const trace: BranchStep[] = []
  steps.forEach((scripted, i) => {
    const now = snap.lastNow + (i + 1) * STEP_MS
    const result = dispatch(
      ctx,
      current,
      { type: 'MISSION_ACTION', payload: scripted.payload },
      now,
    )
    // A rejected action would otherwise be a silent no-op that still records
    // a trace step and skews the projection with zero signal. The scaffold
    // policies assume a live active mission; fail loud if that breaks (e.g.
    // a branch run on a post-settlement snapshot). Split 06's real policies,
    // which don't dispatch mission actions at all, bypass this path.
    if (result.rejection) {
      throw new Error(
        `branch policy produced an invalid action: ${result.rejection.reason}`,
      )
    }
    current = result.state
    trace.push({ step: i, label: scripted.label, detail: scripted.detail })
  })
  const projection = project(snap, current)
  return { kind, projection, trace, viability }
}
