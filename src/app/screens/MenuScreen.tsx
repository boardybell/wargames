// The main menu: a fixed greeting over the engine's menu rows. The fourth
// row (GLOBAL FAILSAFE, the finale) is included by the engine's unlock
// selector only after every mission debrief is acknowledged, so it is absent
// from the DOM until then. Selecting an unsettled mission starts it;
// selecting a settled one opens its record (the engine-provided outcome).
import { useState } from 'react'
import { getMissionOrder, send, useCampaign } from '../state'
import { selectMenuRows, selectSettledOutcome } from '@engine'
import { MenuRows, type MenuRowItem } from '../terminal/MenuRows'
import { TerminalText } from '../terminal/TerminalText'
import { resolveMissionTitle } from './screenRegistry'

const FINALE_ID = 'finale'
const GREETING = [
  'GREETINGS PROFESSOR FALKEN',
  '',
  'SHALL WE PLAY A GAME?',
  '',
].join('\n')

function labelFor(missionId: string): string {
  return missionId === FINALE_ID ? 'GLOBAL FAILSAFE' : resolveMissionTitle(missionId)
}

export function MenuScreen() {
  const state = useCampaign()
  const order = getMissionOrder()
  const menu = selectMenuRows(state, order, FINALE_ID)
  const [recordFor, setRecordFor] = useState<string | null>(null)

  const rows: MenuRowItem[] = menu.rows.map((row) => ({
    id: row.missionId,
    label: labelFor(row.missionId),
  }))

  const onSelect = (id: string): void => {
    const settled = state.settled.some((s) => s.missionId === id)
    if (settled) {
      setRecordFor(id)
      return
    }
    // The finale is a mission module too (split 06 registers it under
    // FINALE_ID); selectMenuRows surfaces it as a row, so START_MISSION is the
    // correct entry. Until split 06 lands the engine rejects it as an unknown
    // mission, harmlessly.
    send({ type: 'START_MISSION', missionId: id })
  }

  const record = recordFor ? selectSettledOutcome(state, recordFor) : null

  return (
    <div data-testid="menu-screen">
      <TerminalText>{GREETING}</TerminalText>
      <MenuRows rows={rows} onSelect={onSelect} />
      {record && (
        <div data-testid="record-view" data-mission-id={record.missionId}>
          <TerminalText dim>
            {`RECORD: ${record.missionId.toUpperCase()}  TIER ${record.tier.toUpperCase()}  CAUSE ${record.cause.toUpperCase()}`}
          </TerminalText>
        </div>
      )}
    </div>
  )
}
