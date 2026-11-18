// Buttons that dispatch engine actions through send(), rendering the engine's
// rejection reason inline next to the control (never a toast or dialog). An
// item may also arrive already disabled with a reason the caller computed from
// the engine validator: that reason renders inline BEFORE any attempt, next to
// the control, so an invalid move reads as unavailable with cause stated.
import { useState } from 'react'
import { send } from '../state'
import type { CampaignAction } from '@engine'
import './terminal.css'

export interface ActionBarItem {
  readonly label: string
  readonly action: CampaignAction
  readonly testId?: string
  /** When true the button is disabled and its reason renders inline. The
   *  reason comes from the engine validator, never duplicated client logic. */
  readonly disabled?: boolean
  readonly disabledReason?: string
}

export function ActionBar({ actions }: { readonly actions: readonly ActionBarItem[] }) {
  const [rejection, setRejection] = useState<string | null>(null)

  const run = (action: CampaignAction): void => {
    const result = send(action)
    setRejection(result.rejected ? result.reason : null)
  }

  return (
    <div className="action-bar" data-testid="action-bar">
      {actions.map((item) => {
        const testId = item.testId ?? `action-${item.label}`
        return (
          <span key={item.label} className="action-bar-item">
            <button
              type="button"
              data-testid={testId}
              disabled={item.disabled === true}
              onClick={() => run(item.action)}
            >
              {item.label}
            </button>
            {item.disabled === true && item.disabledReason ? (
              <span
                className="action-disabled-reason"
                data-testid={`${testId}-reason`}
              >
                {item.disabledReason}
              </span>
            ) : null}
          </span>
        )
      })}
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
