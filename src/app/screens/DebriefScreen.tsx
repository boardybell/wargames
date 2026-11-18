// The debrief frame. ACKNOWLEDGE (the button here, or the ACKNOWLEDGE command
// routed through the ScreenRouter) dispatches ACKNOWLEDGE_DEBRIEF; returning to
// the menu happens through the resulting engine phase change, never local
// navigation. The fourth-row unlock follows from the engine once all three
// debriefs are acknowledged.
import { useCampaign } from '../state'
import { ActionBar } from '../terminal/ActionBar'
import { TerminalText } from '../terminal/TerminalText'
import { pendingDebrief } from './pendingDebrief'

export function DebriefScreen() {
  const state = useCampaign()
  const pending = pendingDebrief(state)
  if (!pending) {
    return <TerminalText>NO DEBRIEF PENDING</TerminalText>
  }
  return (
    <div data-testid="debrief-screen" data-mission-id={pending.missionId}>
      <TerminalText>
        {`DEBRIEF: ${pending.missionId.toUpperCase()}  TIER ${pending.tier.toUpperCase()}`}
      </TerminalText>
      <ActionBar
        actions={[
          {
            label: 'ACKNOWLEDGE',
            action: {
              type: 'ACKNOWLEDGE_DEBRIEF',
              missionId: pending.missionId,
            },
            testId: 'acknowledge-button',
          },
        ]}
      />
    </div>
  )
}
