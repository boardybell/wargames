// Time passage. advanceCampaign clamps the incoming now to the engine's
// lastNow high-water mark, so a backward wall-clock jump can never un-expire
// a deadline. Double wakes are harmless by engine contract: catch-up is
// idempotent and a second call with the same now emits nothing. Wired to app
// start, visibilitychange-to-visible, pageshow with persisted true (bfcache
// resume), and window focus.
import { advanceCampaign } from '@engine'
import { getContext, getState, hasState, setState } from './store'
import { relayEvents } from './events'
import { captureClock } from './displayClock'
import { notifyWake } from './saveBinding'

export function wake(): void {
  if (!hasState()) return
  const { state, emitted } = advanceCampaign(
    getContext(),
    getState(),
    Date.now(),
  )
  setState(state)
  relayEvents(emitted)
  captureClock(state.lastNow)
  notifyWake(emitted)
}

/** Register the wake triggers once. Returns a teardown for tests. */
export function registerWakeLifecycle(): () => void {
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') wake()
  }
  const onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) wake()
  }
  const onFocus = (): void => wake()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onFocus)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('focus', onFocus)
  }
}
