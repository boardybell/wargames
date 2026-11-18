// The public surface the rest of the shell consumes. Everything downstream
// (terminal framework, hero routing, audio warnings, cabinet lamps) reads
// this layer; nothing outside src/app/state/ calls engine dispatch or
// advanceToNow directly. setState and the storage internals stay private.
import { createCampaign, type EngineContext, type StoragePort } from '@engine'
import { setContext, setState } from './store'
import { registerWakeLifecycle, wake } from './wake'
import {
  flushPending,
  loadAtBoot,
  setPort,
} from './saveBinding'
import { registerMultiTab } from './multiTab'
import { mountAudio } from '../audio/mount'

export { useCampaign, getMissionOrder, getState, getContext } from './store'
export { send, type SendResult } from './send'
export { wake } from './wake'
export { onEngineEvent, type EngineEventConsumer, type Unsubscribe } from './events'
export {
  remainingFor,
  remainingTime,
  subscribeTick,
  startTicker,
  stopTicker,
} from './displayClock'
export { getRecoveryFlag, getLastSaveOk } from './saveBinding'
export { getMultiTabNotice, onMultiTabNotice } from './multiTab'

export interface InitOptions {
  readonly ctx: EngineContext
  /** The seed to start a fresh campaign from when no save is present. */
  readonly seedName: string
  /** Override the localStorage port (tests inject an in-memory one). */
  readonly port?: StoragePort
}

/** Called once at App boot: load the save, restore or create the campaign,
 *  register lifecycle listeners, and perform the initial wake. Returns a
 *  teardown that tests use to unregister listeners. */
export function init(options: InitOptions): () => void {
  setContext(options.ctx)
  if (options.port) setPort(options.port)

  const loaded = loadAtBoot()
  setState(
    loaded.state ??
      createCampaign(
        options.ctx,
        options.seedName,
        { extendedTime: false },
        Date.now(),
      ),
  )

  const teardownWake = registerWakeLifecycle()
  const teardownMultiTab = registerMultiTab()
  // Bring the audio subsystem to life: subscribe warnings to the engine relay,
  // pre-decode eager cues, and advance the staleness token on phase changes.
  // Safe before any gesture: the context stays suspended and muted until the
  // diegetic ENABLE SOUND prompt resumes it.
  const teardownAudio = mountAudio()
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') flushPending()
  }
  const onPageHide = (): void => flushPending()
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)

  // Reconcile any time that passed before the shell mounted.
  wake()

  return () => {
    teardownWake()
    teardownMultiTab()
    teardownAudio()
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onPageHide)
  }
}
