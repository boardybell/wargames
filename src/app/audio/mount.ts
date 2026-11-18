// The audio bootstrap: one call the composition root makes so the subsystem is
// actually live instead of a tested library. It subscribes warnings to the
// engine relay, pre-decodes eager file cues, and advances the generation token
// on every phase change so a pile of stale queued cues from a backgrounded tab
// drops silently on return. Returns a teardown that unregisters everything.
import { onEngineEvent } from '../state/events'
import type { EngineEvent } from '@engine'
import { registerWarnings } from './warnings'
import { incrementGeneration, drainQueue, preloadEager } from './player'

export function mountAudio(): () => void {
  const teardownWarnings = registerWarnings()
  preloadEager()
  const teardownLifecycle = onEngineEvent((event: EngineEvent) => {
    if (event.type !== 'phaseChanged') return
    // Screen change: invalidate any queued cue captured under the old token,
    // then drain so current-token cues still play.
    incrementGeneration()
    drainQueue()
  })
  return () => {
    teardownWarnings()
    teardownLifecycle()
  }
}
