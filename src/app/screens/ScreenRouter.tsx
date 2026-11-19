// Maps the engine phase to a screen and layers settings/help as overlays
// (local UI state, not engine phases). On every screen change it moves focus
// to the new screen root (section 09 refines the heading-vs-input choice).
// A shared CommandInput at the foot is wired to the active screen id so the
// grammar resolves screen verbs correctly, and its UI commands open overlays
// or acknowledge a debrief.
import { useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { getState, send, useCampaign } from '../state'
import { moveFocusTo } from '../a11y/focus'
import { CommandInput } from '../terminal/CommandInput'
import type { LocalUiCommand } from '../terminal/commandGrammar'
import { MenuScreen } from './MenuScreen'
import { DebriefScreen } from './DebriefScreen'
import { FallbackMissionFrame } from './FallbackMissionFrame'
import { resolveMissionScreen } from './screenRegistry'
import { pendingDebrief } from './pendingDebrief'
import { handleCapturedKey } from './inputStack'
import { openOverlay, closeOverlay, getOverlay } from './dialogState'
import { dispatchScreenUiCommand } from './screenUiCommands'
import { DialogLayer } from './DialogLayer'
import { FinaleEndingRoute } from '../missions/finale/FinaleEndingRoute'
import { FINALE_MISSION_ID } from '@engine/missions/finale/module'
import type { CampaignState } from '@engine'

export type OverlayId = 'settings' | 'help'

export function screenIdForState(state: CampaignState): string {
  switch (state.phase) {
    case 'menu':
      return 'menu'
    case 'mission':
      return `mission:${state.activeMission?.missionId ?? ''}`
    case 'debrief':
      return 'debrief'
    case 'finale':
      return 'finale'
    default:
      return 'menu'
  }
}

export interface ScreenRouterProps {
  readonly onListGames?: () => void
  readonly onSetSound?: (on: boolean) => void
}

export function ScreenRouter({ onListGames, onSetSound }: ScreenRouterProps) {
  const state = useCampaign()
  const screenId = screenIdForState(state)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    moveFocusTo(rootRef.current)
  }, [screenId])

  const handleUiCommand = (command: LocalUiCommand): void => {
    switch (command.kind) {
      case 'OPEN_HELP':
        openOverlay('help')
        break
      case 'OPEN_SETTINGS':
        openOverlay('settings')
        break
      case 'CLOSE_OVERLAY':
        closeOverlay()
        break
      case 'ACKNOWLEDGE': {
        const pending = pendingDebrief(getState())
        if (pending) {
          send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: pending.missionId })
        }
        break
      }
      case 'LIST_GAMES':
        onListGames?.()
        break
      case 'SET_SOUND':
        onSetSound?.(command.on)
        break
      case 'SCREEN':
        // A mission-scoped UI command: hand it to the screen that owns it.
        dispatchScreenUiCommand(command.screenId, command.detail)
        break
    }
  }

  const inMission = screenId.startsWith('mission:')

  // Capture-phase: resolve precedence before the event reaches the screen's
  // own handlers, so a running type-in or an active prompt swallows the key.
  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (handleCapturedKey(event.nativeEvent) === 'consumed') {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // Escape during a mission opens the pause dialog (there is no dialog open,
    // or the dialog layer would have consumed the key above).
    if (event.key === 'Escape' && inMission && getOverlay() === null) {
      event.preventDefault()
      openOverlay('pause')
    }
  }

  return (
    <>
      <div
        className="screen-root"
        data-testid="screen-root"
        data-active-screen={screenId}
        tabIndex={-1}
        ref={rootRef}
        onKeyDownCapture={onKeyDownCapture}
      >
        {inMission && (
          <button
            type="button"
            data-testid="menu-control"
            onClick={() => openOverlay('pause')}
          >
            MENU
          </button>
        )}
        <ActiveScreen screenId={screenId} state={state} />
        <CommandInput activeScreen={screenId} onUiCommand={handleUiCommand} />
      </div>
      {/* Overlays are native top-layer dialogs; they sit outside the
          focus-managed screen root. */}
      <DialogLayer activeScreen={screenId} />
    </>
  )
}

function ActiveScreen({
  screenId,
  state,
}: {
  readonly screenId: string
  readonly state: CampaignState
}) {
  if (screenId === 'menu') return <MenuScreen />
  if (screenId === 'debrief') {
    // A settled-but-unacknowledged FINALE surfaces its ending here rather than
    // the generic debrief: the engine settles the finale like any mission
    // (phase 'debrief'), so without this branch the climax would never reach
    // the EndingScreen. Regular missions keep DebriefScreen.
    const pending = pendingDebrief(state)
    if (pending?.missionId === FINALE_MISSION_ID) {
      return <FinaleEndingRoute state={state} outcome={pending} />
    }
    return <DebriefScreen />
  }
  if (screenId.startsWith('mission:')) {
    const missionId = state.activeMission?.missionId ?? ''
    const Registered = resolveMissionScreen(missionId)
    // Keyed by mission id so a mission-to-mission change remounts rather than
    // reusing the previous mission's component state.
    if (Registered) return <Registered key={missionId} missionId={missionId} />
    return <FallbackMissionFrame key={missionId} missionId={missionId} />
  }
  // finale and any other phase get the plain fallback frame until their
  // own split lands.
  return (
    <div data-testid="screen-fallback" data-screen-id={screenId}>
      {`[ ${screenId} ]`}
    </div>
  )
}
