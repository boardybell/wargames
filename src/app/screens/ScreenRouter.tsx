// Maps the engine phase to a screen and layers settings/help as overlays
// (local UI state, not engine phases). On every screen change it moves focus
// to the new screen root (section 09 refines the heading-vs-input choice).
// A shared CommandInput at the foot is wired to the active screen id so the
// grammar resolves screen verbs correctly, and its UI commands open overlays
// or acknowledge a debrief.
import { useEffect, useRef, useState } from 'react'
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
  const [overlay, setOverlay] = useState<OverlayId | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    moveFocusTo(rootRef.current)
  }, [screenId])

  const handleUiCommand = (command: LocalUiCommand): void => {
    switch (command.kind) {
      case 'OPEN_HELP':
        setOverlay('help')
        break
      case 'OPEN_SETTINGS':
        setOverlay('settings')
        break
      case 'CLOSE_OVERLAY':
        setOverlay(null)
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
    }
  }

  // Capture-phase: resolve precedence before the event reaches the screen's
  // own handlers, so a running type-in or an active prompt swallows the key.
  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (handleCapturedKey(event.nativeEvent) === 'consumed') {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return (
    <div
      className="screen-root"
      data-testid="screen-root"
      data-active-screen={screenId}
      tabIndex={-1}
      ref={rootRef}
      onKeyDownCapture={onKeyDownCapture}
    >
      <ActiveScreen screenId={screenId} state={state} />
      <CommandInput activeScreen={screenId} onUiCommand={handleUiCommand} />
      {overlay !== null && (
        <div data-testid="overlay-slot" data-overlay={overlay} />
      )}
    </div>
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
  if (screenId === 'debrief') return <DebriefScreen />
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
