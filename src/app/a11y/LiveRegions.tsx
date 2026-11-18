// The two persistent live regions, mounted once in the App shell as siblings
// of the dialog host, outside every screen root, so an assertive announcement
// still fires while a native modal dialog is open. They are visually hidden
// (clip-rect, not display:none, so assistive tech still reads them) and never
// unmounted across screen changes. The inner span is keyed on the sequence so
// an identical string re-reads: React replaces the text node, which the screen
// reader treats as a fresh utterance.
import { useSyncExternalStore } from 'react'
import { getRegionState, subscribeRegion } from './announce'
import './a11y.css'

export function LiveRegions() {
  const state = useSyncExternalStore(
    subscribeRegion,
    getRegionState,
    getRegionState,
  )
  return (
    <>
      <div
        className="sr-only"
        role="status"
        aria-atomic="true"
        data-testid="live-polite"
        data-seq={state.politeSeq}
      >
        <span key={state.politeSeq}>{state.politeText}</span>
      </div>
      <div
        className="sr-only"
        role="alert"
        aria-atomic="true"
        data-testid="live-assertive"
        data-seq={state.assertiveSeq}
      >
        <span key={state.assertiveSeq}>{state.assertiveText}</span>
      </div>
    </>
  )
}
