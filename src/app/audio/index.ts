// The audio subsystem public surface. Sections 05 and 06 consume the prefs
// and resume; later sections consume play/warnings/captions. The content
// (recorded voice and effect files) arrives from the media split through a
// manifest swap without touching any call site.
export {
  resumeAudio,
  getAudioContext,
  nowSeconds,
  setAudioPortImpl as setAudioPort,
  __resetContext,
} from './context'
export type {
  WebAudioPort,
  ContextLike,
  ContextState,
  ParamLike,
  GainLike,
  SourceLike,
  OscillatorLike,
  BufferLike,
} from './port'
export { browserAudioPort } from './port'

export {
  getAudioPrefs,
  setAudioPref,
  useAudioPrefs,
  getSoundPreference,
  hasSoundPreference,
  setSoundPreference,
  onAudioPrefs,
  type AudioPrefs,
  type SoundPreference,
  __resetPrefs,
} from './prefs'

export {
  CUE_MANIFEST,
  validateManifest,
  REQUIRED_CUE_IDS,
  SILENT_TICK_IDS,
  type CueDefinition,
  type CueId,
  type BusName,
} from './manifest'

export {
  play,
  enqueue,
  drainQueue,
  incrementGeneration,
  currentGeneration,
  preloadEager,
  decodeCountFor,
  stopBus,
  getPlayingTranscript,
  onPlayingTranscript,
  __resetPlayer,
} from './player'

export {
  getBuses,
  busFor,
  masterBus,
  ambienceBus,
  ambienceDuckNode,
  __resetBuses,
} from './buses'
export { registerWarnings, clearWarningGuard, __resetWarnings } from './warnings'
export { mountAudio } from './mount'
export { Captions } from './captions'

import { play } from './player'
import { __resetContext } from './context'
import { __resetPrefs } from './prefs'
import { __resetBuses } from './buses'
import { __resetPlayer } from './player'
import { __resetWarnings } from './warnings'

/** Fire the activation cue (section 05 plays this when the push-in finishes). */
export function playActivationCue(): void {
  play('activation')
}

/** Fire a key-tick cue (the type-in hook calls this per revealed character). */
export function playKeyTick(): void {
  play('key-tick')
}

/** Test-only: reset the whole subsystem. */
export function __resetAudio(): void {
  __resetWarnings()
  __resetPlayer()
  __resetBuses()
  __resetContext()
  __resetPrefs()
}
