// Buttons that dispatch engine actions through send(), rendering the engine's
// rejection reason inline next to the control (never a toast or dialog).
import { useState } from 'react'
import { send } from '../state'
import type { CampaignAction } from '@engine'
import './terminal.css'

export interface ActionBarItem {
  readonly label: string
  readonly action: CampaignAction
  readonly testId?: string
}

export function ActionBar({ actions }: { readonly actions: readonly ActionBarItem[] }) {
  const [rejection, setRejection] = useState<string | null>(null)

  const run = (action: CampaignAction): void => {
    const result = send(action)
    setRejection(result.rejected ? result.reason : null)
  }

  return (
    <div className="action-bar" data-testid="action-bar">
      {actions.map((item) => (
        <button
          key={item.label}
          type="button"
          data-testid={item.testId ?? `action-${item.label}`}
          onClick={() => run(item.action)}
        >
          {item.label}
        </button>
      ))}
      {rejection !== null && (
        <span
          className="action-rejection"
          role="alert"
          data-testid="action-rejection"
        >
          {`INVALID: ${rejection}`}
        </span>
      )}
    </div>
  )
}
