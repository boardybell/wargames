// OPEN EXCEPTIONS beside SERVICE OUTCOMES, each labeled so a player watches the
// two diverge: WOPR's tally of forced-inactivity resolutions against the real
// damage the same orders produced. The divergence is the game's thesis. The
// panel is a plain selector-driven render off useCampaign(); Readouts itself is
// pure presentation so the divergence is trivially testable.
import { useCampaign } from '../state'
import { selectOpenExceptions, selectServiceOutcomes } from '@engine'
import { GlossaryTerm } from '../a11y/GlossaryTerm'
import './cabinet.css'

export interface ReadoutsProps {
  readonly openExceptions: number
  readonly serviceOutcomes: number
}

export function Readouts({ openExceptions, serviceOutcomes }: ReadoutsProps) {
  return (
    <div className="cabinet-readouts" data-testid="cabinet-readouts">
      <div className="readout" data-testid="readout-open-exceptions">
        <span className="readout-label">
          <GlossaryTerm
            term="OPEN EXCEPTIONS"
            definition="Cases WOPR counts as resolved because no one acted on them before the deadline. A rising number here is the machine calling inaction a result."
          />
        </span>
        <span className="readout-value">{openExceptions}</span>
      </div>
      <div className="readout" data-testid="readout-service-outcomes">
        <span className="readout-label">SERVICE OUTCOMES</span>
        <span className="readout-value">{serviceOutcomes}</span>
      </div>
    </div>
  )
}

export function ReadoutsPanel() {
  const state = useCampaign()
  return (
    <Readouts
      openExceptions={selectOpenExceptions(state)}
      serviceOutcomes={selectServiceOutcomes(state)}
    />
  )
}
