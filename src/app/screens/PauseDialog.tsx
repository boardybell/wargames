// The pause dialog. It opens from Escape or the MENU control during mission
// play, but there is no engine pause: the copy states plainly that the mission
// clock keeps running, and opening dispatches nothing. End Mission requires a
// typed confirmation word before it forfeits; Escape inside that confirmation
// backs out to the main view instead of closing.
import { useRef, useState } from 'react'
import { send } from '../state'
import { Dialog } from './Dialog'

const CONFIRM_WORD = 'END'

export interface PauseDialogProps {
  readonly open: boolean
  readonly onClose: () => void
}

export function PauseDialog({ open, onClose }: PauseDialogProps) {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const resumeRef = useRef<HTMLButtonElement>(null)

  const reset = (): void => {
    setConfirming(false)
    setTyped('')
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const matches = typed.trim().toUpperCase() === CONFIRM_WORD

  const endMission = (): void => {
    if (!matches) return
    send({ type: 'FORFEIT_MISSION' })
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      labelledBy="pause-heading"
      testId="pause-dialog"
      allowCancel={!confirming}
      initialFocus={() => resumeRef.current}
    >
      <h2 id="pause-heading">PAUSED</h2>
      <p>THE MISSION CLOCK KEEPS RUNNING WHILE THIS IS OPEN.</p>
      {!confirming ? (
        <div className="dialog-actions">
          <button
            ref={resumeRef}
            type="button"
            data-testid="pause-resume"
            onClick={close}
          >
            RESUME
          </button>
          <button
            type="button"
            data-testid="pause-end"
            onClick={() => setConfirming(true)}
          >
            END MISSION
          </button>
        </div>
      ) : (
        <div className="dialog-confirm" data-testid="pause-confirm">
          <label htmlFor="pause-confirm-input">
            {`TYPE ${CONFIRM_WORD} TO CONFIRM FORFEIT`}
          </label>
          <input
            id="pause-confirm-input"
            data-testid="pause-confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            data-testid="pause-confirm-button"
            disabled={!matches}
            onClick={endMission}
          >
            CONFIRM END MISSION
          </button>
          <button
            type="button"
            data-testid="pause-confirm-cancel"
            onClick={reset}
          >
            BACK
          </button>
        </div>
      )}
    </Dialog>
  )
}
