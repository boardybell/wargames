// A plain mission frame rendered until a mission split registers its own
// screen. It shows the mission title and status and an ActionBar from engine
// generics (FORFEIT is always available), so this split is fully operable
// against the test-double mission before any mission split lands.
import { useCampaign } from '../state'
import { ActionBar } from '../terminal/ActionBar'
import { TerminalText, StatusLine } from '../terminal/TerminalText'
import { resolveMissionTitle } from './screenRegistry'

export function FallbackMissionFrame({
  missionId,
}: {
  readonly missionId: string
}) {
  const state = useCampaign()
  const active = state.activeMission
  return (
    <div data-testid="mission-frame" data-mission-id={missionId}>
      <TerminalText>{resolveMissionTitle(missionId)}</TerminalText>
      <StatusLine>
        {active
          ? `MISSION IN PROGRESS`
          : `MISSION ${missionId.toUpperCase()} INACTIVE`}
      </StatusLine>
      <ActionBar
        actions={[
          {
            label: 'FORFEIT',
            action: { type: 'FORFEIT_MISSION' },
            testId: 'forfeit-button',
          },
        ]}
      />
    </div>
  )
}
