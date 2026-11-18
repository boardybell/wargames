// The corrupt-save notice. Driven solely by the recovery flag the state
// binding surfaces: recovered-backup says an earlier backup was restored so
// recent progress may be missing; reset says the save could not be recovered
// and a fresh campaign started. Neutral tone, no blame. Shown once per session
// until dismissed; it reads state and never writes any.
import { useRef } from 'react'
import { getRecoveryFlag } from '../state'
import { dismissCorrupt, useCorruptDismissed } from './dialogState'
import { Dialog } from './Dialog'

const COPY: Partial<Record<string, string>> = {
  'recovered-backup':
    'THE PRIMARY SAVE WAS UNREADABLE. AN EARLIER BACKUP WAS RESTORED, SO RECENT PROGRESS MAY BE MISSING.',
  reset:
    'THE SAVE COULD NOT BE RECOVERED. A FRESH CAMPAIGN HAS STARTED.',
}

export function CorruptSaveNotice() {
  const flag = getRecoveryFlag()
  const dismissed = useCorruptDismissed()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const copy = COPY[flag]

  // A clean load has no notice at all. For a real recovery flag we keep the
  // dialog mounted and close it by flipping open on dismiss, so the shared
  // close path lowers the precedence stack (an unmount-on-dismiss would strand
  // it, since removing a <dialog open> fires no close event).
  if (!copy) return null

  return (
    <Dialog
      open={!dismissed}
      onClose={dismissCorrupt}
      labelledBy="corrupt-heading"
      testId="corrupt-save-notice"
      initialFocus={() => headingRef.current}
    >
      <h2 id="corrupt-heading" ref={headingRef} tabIndex={-1}>
        SAVE NOTICE
      </h2>
      <p data-testid="corrupt-copy">{copy}</p>
      <button type="button" data-testid="corrupt-dismiss" onClick={dismissCorrupt}>
        ACKNOWLEDGE
      </button>
    </Dialog>
  )
}
