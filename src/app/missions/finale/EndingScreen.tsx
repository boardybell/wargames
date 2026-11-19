// The GLOBAL FAILSAFE ending screen. Reads the settled finale SettledOutcome and
// renders the outcome per endingId: the correct art slot (ending-recovery with
// hero-return for the recovery ending, ending-containment, ending-failure), the
// earned-why readback from endings.ts VERBATIM (never synthesized here), the
// final JOSHUA line with its voice cue and the ending cue, the pending field
// report line when a reply arrived post-settlement, and the fresh-campaign offer
// wired to NEW_CAMPAIGN. NO engine logic and NO authored readback strings
// manufactured in this tree: deriveEarnedWhy supplies every readback line, the
// catalog supplies the line, and the art/audio come from the shell primitives.
import { useEffect, useRef } from 'react'
import type { CampaignState, SettledOutcome } from '@engine'
import { send } from '../../state'
import {
  deriveEarnedWhy,
  type EndingId,
} from '@engine/missions/finale/endings'
import {
  projectHold,
  projectRepeat,
  computeStaged,
} from '@engine/missions/finale/projections'
import type { BranchProjection } from '@engine'
import { selectLine } from '@engine/joshua/selectors'
import type { ArtSlotId } from '../../art/types'
import { ArtSlot } from '../../art/ArtSlot'
import { TerminalText } from '../../terminal/TerminalText'
import { play } from '../../audio'
import { announce } from '../../a11y/announce'
import { openOverlay } from '../../screens/dialogState'
import { buildFinaleSnapshot, provedSlotsFromOutcome } from './selectors'
import type { FinaleState } from '@engine/missions/finale/types'
import { FINALE_SLOTS } from '@engine/missions/finale/types'

/** The ending voice-cue ids split 07 fills. play() is a safe no-op for an
 *  unmapped id; tests spy on play to assert exactly these fired. The final line
 *  cue keys off the resolved catalog line's voiceClipId; the ending cue is the
 *  per-ending ambience sting. */
const ENDING_CUE: Readonly<Record<EndingId, string>> = {
  recovery: 'finale-ending-recovery',
  containment: 'finale-ending-containment',
  failure: 'finale-ending-failure',
}

const ENDING_ART: Readonly<Record<EndingId, ArtSlotId>> = {
  recovery: 'ending-recovery',
  containment: 'ending-containment',
  failure: 'ending-failure',
}

export interface EndingScreenProps {
  readonly state: CampaignState
  /** The settled finale outcome (missionId 'finale'); carries the endingId. */
  readonly outcome: SettledOutcome
  /** The finale substate captured at settlement, retained only for its caseValid
   *  flag. The proved-slot set the earned-why readback names comes from the
   *  outcome's persisted per-slot bits (proved_<slot>), not from these live
   *  slots, so the readback is faithful whether the substate is present (commit)
   *  or gone (return navigation after settlement). */
  readonly finaleState?: FinaleState
  readonly fieldReportId: string
}

/** Reconstruct a minimal finale state for the earned-why readback from the
 *  settled outcome when the live substate is gone. The slots mirror the REAL
 *  persisted proved-slot bits (proved_<slot>), so a slot reads filled here only
 *  if the player actually proved it at settlement. Reference-only, no authored
 *  copy; the earned-why still reads the proved set off the outcome bits. */
function finaleStateFromOutcome(outcome: SettledOutcome): FinaleState {
  const caseValid = (outcome.metrics['case_valid'] ?? 0) === 1
  const proved = new Set(provedSlotsFromOutcome(outcome))
  const slotValue = (slot: (typeof FINALE_SLOTS)[number]): string | null =>
    proved.has(slot) ? 'x' : null
  return {
    slots: {
      outlook: slotValue('outlook'),
      flights: slotValue('flights'),
      bank: slotValue('bank'),
      root: slotValue('root'),
      observation: slotValue('observation'),
    },
    ordering: [],
    caseValid,
    lastRejection: null,
    comparisonsRun: outcome.metrics['comparisons_run'] ?? 0,
    fieldReportRequested: (outcome.metrics['field_report_requested'] ?? 0) === 1,
    committed: null,
  }
}

function projectionFor(
  endingId: EndingId,
  snapshot: Parameters<typeof deriveEarnedWhy>[1],
): BranchProjection {
  if (endingId === 'recovery') return computeStaged(snapshot).projection
  if (endingId === 'containment') return projectHold(snapshot)
  return projectRepeat(snapshot)
}

export function EndingScreen({
  state,
  outcome,
  finaleState,
  fieldReportId,
}: EndingScreenProps) {
  const endingId: EndingId = outcome.endingId ?? 'failure'
  const effectiveFinaleState = finaleState ?? finaleStateFromOutcome(outcome)
  // The proved-slot set comes from the outcome's persisted per-slot bits, so the
  // readback names exactly what the player proved at settlement regardless of
  // whether the live substate survived.
  const provedSlots = provedSlotsFromOutcome(outcome)
  const snapshot = buildFinaleSnapshot(
    effectiveFinaleState,
    state,
    fieldReportId,
    provedSlots,
  )
  const projection = projectionFor(endingId, snapshot)
  const why = deriveEarnedWhy(endingId, snapshot, projection)
  const line = selectLine('finale.ending', { endingId })

  // A field-report reply that arrived AFTER settlement renders honestly as the
  // pending line: it did not land in time, so the ending reads it as pending.
  const pendingFieldReport = state.sourceChecks.some(
    (c) => c.recordId === fieldReportId && c.arrivedAfterSettlement === true,
  )

  // Fire the final line's voice cue and the ending ambience cue exactly once on
  // mount; announce the final line assertively so it is never dropped.
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    play(ENDING_CUE[endingId])
    if (line) {
      play(line.voiceClipId)
      announce(line.text, 'assertive')
    }
  }, [endingId, line])

  return (
    <div data-testid="finale-ending" data-ending-id={endingId}>
      <ArtSlot id={ENDING_ART[endingId]} />
      {endingId === 'recovery' ? <ArtSlot id="hero-return" /> : null}

      <TerminalText>{`FINALE SETTLED: ${endingId.toUpperCase()}`}</TerminalText>

      {/* The final JOSHUA line, rendered from the catalog (graceful absence when
          the key does not resolve). */}
      {line ? (
        <div data-testid="finale-ending-line">
          <TerminalText>{line.text}</TerminalText>
        </div>
      ) : null}

      {/* The earned-why readback, rendered VERBATIM from endings.ts. */}
      <div data-testid="finale-earned-why">
        <ul data-testid="finale-shaping-outcomes">
          {why.shapingOutcomes.map((text, i) => (
            <li key={i}>
              <TerminalText>{text}</TerminalText>
            </li>
          ))}
        </ul>
        <ul data-testid="finale-proved-evidence">
          {why.provedEvidence.map((text, i) => (
            <li key={i}>
              <TerminalText>{text}</TerminalText>
            </li>
          ))}
        </ul>
        <div data-testid="finale-projected-vs-actual">
          <TerminalText>{why.projectedVsActual}</TerminalText>
        </div>
        {why.unresolved ? (
          <ul data-testid="finale-unresolved">
            {why.unresolved.map((text, i) => (
              <li key={i}>
                <TerminalText>{text}</TerminalText>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {pendingFieldReport ? (
        <div data-testid="finale-ending-field-report-pending" role="status">
          <TerminalText dim>
            THE FIELD REPORT REPLY ARRIVED AFTER THE DECISION. IT DID NOT CORROBORATE IN TIME.
          </TerminalText>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="finale-new-campaign"
        onClick={() => openOverlay('newCampaign')}
      >
        NEW CAMPAIGN
      </button>
      {/* A direct wiring for a headless pass: dispatch the reset without the
          overlay (the overlay path confirms; this is the plumbing the overlay
          ultimately calls through NEW_CAMPAIGN). */}
      <button
        type="button"
        data-testid="finale-new-campaign-confirm"
        hidden
        onClick={() => {
          const first = state.seedName
          send({ type: 'NEW_CAMPAIGN', seedName: first })
        }}
      >
        CONFIRM NEW CAMPAIGN
      </button>
    </div>
  )
}
