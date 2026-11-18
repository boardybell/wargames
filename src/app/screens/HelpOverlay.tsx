// The help overlay. It opens over the active screen without changing it, and
// its body is the same context HELP the terminal HELP command prints, from the
// same verb registry (section 04), so HELP-the-command and help-the-overlay
// show one truth. LIST GAMES appears only in the idle (menu) context.
import { useRef } from 'react'
import { getContextHelp } from '../terminal'
import { Dialog } from './Dialog'

export interface HelpOverlayProps {
  readonly open: boolean
  readonly activeScreen: string
  readonly onClose: () => void
}

export function HelpOverlay({ open, activeScreen, onClose }: HelpOverlayProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lines = getContextHelp(activeScreen)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="help-heading"
      testId="help-overlay"
      initialFocus={() => headingRef.current}
    >
      <h2 id="help-heading" ref={headingRef} tabIndex={-1}>
        HELP
      </h2>
      <p>TYPE A COMMAND, OR USE THE NUMBERED ROWS AND ARROW KEYS.</p>
      <ul className="help-list" data-testid="help-list">
        {lines.map((line) => (
          <li key={line.verb} data-testid={`help-${line.verb}`}>
            {line.helpText}
          </li>
        ))}
      </ul>
      <button type="button" data-testid="help-close" onClick={onClose}>
        CLOSE
      </button>
    </Dialog>
  )
}
