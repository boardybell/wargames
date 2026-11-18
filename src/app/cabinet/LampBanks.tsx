// The lamp matrices. Reads a LampController's state through a subscription and
// renders amber dot banks plus a restrained red alarm cluster. Idle banks
// breathe (one opacity tween) unless reduced motion is set, in which case they
// are static. Transition classes animate opacity only, consistent with the CRT
// stack's no-animated-filters rule. The red alarm is paired with a text label
// per the status-color rule and lights only when the controller's alarm is on.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useReducedMotion } from '../a11y/motion'
import { LampController, type LampBanksState } from './LampController'
import './cabinet.css'

/** The stable-instance pattern for a LampController: one instance for the life
 *  of the component, registered on mount and disposed on unmount. Callers use
 *  this rather than `new LampController()` in a render body, which would thrash
 *  subscriptions and reset lamp state on every render. */
export function useLampController(): LampController {
  const ref = useRef<LampController | null>(null)
  if (ref.current === null) ref.current = new LampController()
  const controller = ref.current
  useEffect(() => controller.register(), [controller])
  return controller
}

export function useLampBanks(controller: LampController): LampBanksState {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  )
}

export interface LampBanksProps {
  readonly controller: LampController
}

export function LampBanks({ controller }: LampBanksProps) {
  const state = useLampBanks(controller)
  const reduced = useReducedMotion()
  const idleClass = reduced ? 'lamp-bank' : 'lamp-bank lamp-breathe'

  return (
    <div className="lamp-banks" data-testid="lamp-banks">
      <div
        className={idleClass}
        data-testid="lamp-bank-phase"
        data-phase={state.phase}
      />
      <div
        className={idleClass}
        data-testid="lamp-bank-settlement"
        data-settlement={state.settlement ?? 'none'}
      />
      <div
        className={idleClass}
        data-testid="lamp-bank-branch"
        data-active={state.branchComplete ? 'true' : 'false'}
      />
      {state.alarm ? (
        <div className="lamp-alarm" data-testid="lamp-alarm" role="status">
          <span className="lamp-alarm-dot" aria-hidden="true" />
          <span className="lamp-alarm-label">DEFCON 1</span>
        </div>
      ) : null}
    </div>
  )
}
