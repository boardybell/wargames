import type { ReactNode } from 'react'
import './terminal.css'

/** A styled text block respecting the terminal rhythm (pre/output semantics,
 *  CRT theme tokens). dim renders secondary text. */
export function TerminalText({
  children,
  dim,
}: {
  readonly children: ReactNode
  readonly dim?: boolean
}) {
  return (
    <pre className="terminal-text" data-dim={dim ? 'true' : 'false'}>
      {children}
    </pre>
  )
}

/** A single-line status readout. */
export function StatusLine({ children }: { readonly children: ReactNode }) {
  return (
    <div className="terminal-status" role="status" data-testid="status-line">
      {children}
    </div>
  )
}

/** A secondary detail region. */
export function DetailPane({ children }: { readonly children: ReactNode }) {
  return (
    <div className="terminal-detail" data-testid="detail-pane">
      {children}
    </div>
  )
}
