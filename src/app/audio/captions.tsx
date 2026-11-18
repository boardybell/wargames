// Renders the transcript of the currently playing voice or warning cue,
// whether or not audio is enabled or the context ever existed, so a muted
// player still reads the line. The announcer (section 09) receives the same
// text through an optional callback rather than a hard dependency.
import { useSyncExternalStore } from 'react'
import { getPlayingTranscript, onPlayingTranscript } from './player'

export function Captions() {
  const transcript = useSyncExternalStore(
    onPlayingTranscript,
    getPlayingTranscript,
    getPlayingTranscript,
  )
  // Keep the live region mounted and swap its text. Mounting and unmounting the
  // node in and out of the DOM is unreliable for screen readers; a persistent
  // region announces every change. When idle the region is present but empty.
  return (
    <p
      className="captions"
      data-testid="caption"
      aria-live="polite"
      data-empty={transcript ? undefined : 'true'}
    >
      {transcript ?? ''}
    </p>
  )
}
