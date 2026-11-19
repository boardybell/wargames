// The one mutation path in the app. Samples Date.now(), calls the engine
// reducer, stores the result, relays emitted events exactly once, recaptures
// the display clock, and classifies the action for the save binding. On a
// rejection the store is untouched and no events relay (the engine emits
// none); the reason comes back for inline rendering by the caller.
import { dispatch, type CampaignAction } from '@engine'
import { getContext, getState, rebindContextForSeed, setState } from './store'
import { relayEvents } from './events'
import { captureClock } from './displayClock'
import { notifyAction, notifyWake } from './saveBinding'

export type SendResult =
  | { readonly rejected: false }
  | { readonly rejected: true; readonly reason: string }

export function send(action: CampaignAction): SendResult {
  const { state, emitted, rejection } = dispatch(
    getContext(),
    getState(),
    action,
    Date.now(),
  )
  // dispatch advances time BEFORE reducing the action, so even a rejected
  // action can have moved the clock and materialized timerMilestone or
  // settlement events (a deadline that expired in the gap). Those are real
  // and must be applied like a wake: store the advanced state, relay the
  // events, recapture the display clock. Only then report the rejection.
  setState(state)
  // A NEW_CAMPAIGN that switched seeds emits campaignReset with the new seed.
  // Rebind the context so the mission modules (which close over one seed's
  // payload) match the fresh campaign. No-op when the factory is unset.
  const reset = emitted.find((e) => e.type === 'campaignReset')
  if (reset?.type === 'campaignReset') {
    rebindContextForSeed(reset.seedName)
  }
  relayEvents(emitted)
  captureClock(state.lastNow)
  if (rejection) {
    notifyWake(emitted)
    return { rejected: true, reason: rejection.reason }
  }
  notifyAction(action, emitted)
  return { rejected: false }
}
