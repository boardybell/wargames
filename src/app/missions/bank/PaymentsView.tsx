// The critical payments: one row per payment with its amount, source account,
// due offset, and a PAY button. PAY draws from the payment's specific account
// and is BLOCKED while that account is held; the disabled PAY button shows the
// held-account reason INLINE because release-or-limit-to-pay is the designed
// tension and the player has to be able to read it. A cleared payment shows its
// cleared status. Legality and the typed reason come from the engine selector;
// the view invents nothing. PAY dispatches the IDENTICAL action a typed command
// builds, routed through the BankScreen handler so the payment-outcome
// announcement fires on the action, never a tick. Uppercase diction, no
// em-dashes.
import type { CampaignAction } from '@engine'
import type { BankPayload } from '@engine/missions/bank/content'
import type { BankState } from '@engine/missions/bank/types'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import { paymentControl } from './bankActions'
import { makePayAction } from './verbs'

export interface PaymentsViewProps {
  readonly payload: BankPayload
  readonly state: BankState
  readonly onAction: (action: CampaignAction) => void
}

export function PaymentsView({ payload, state, onAction }: PaymentsViewProps) {
  return (
    <div data-testid="bank-payments-view">
      <div className="bank-payments-legend">
        <GlossaryTerm id="bank-critical-payment" />
      </div>

      {payload.payments.map((payment) => {
        const control = paymentControl(payload, state, payment.id)
        const account = payload.accounts.find((a) => a.id === payment.accountId)
        const testId = `payment-PAY-${payment.id}`

        return (
          <div
            key={payment.id}
            data-testid={`payment-row-${payment.id}`}
            data-cleared={control.cleared ? 'true' : 'false'}
            className="payment-row"
          >
            <TerminalText>
              {`${payment.id}  ${payment.amount} FROM ${payment.accountId}${
                account ? ` (${account.name})` : ''
              }  DUE +${payment.dueOffsetSeconds}S`}
            </TerminalText>
            <TerminalText dim>{payment.reason}</TerminalText>
            {control.cleared ? (
              <div data-testid={`payment-status-${payment.id}`}>
                <TerminalText>PAYMENT CLEARED</TerminalText>
              </div>
            ) : null}
            <div className="action-bar" data-testid={`payment-actions-${payment.id}`}>
              <span className="action-bar-item">
                <button
                  type="button"
                  data-testid={testId}
                  disabled={!control.payLegal}
                  onClick={() => onAction(makePayAction(payment.id))}
                >
                  {control.cleared ? 'CLEARED' : 'PAY'}
                </button>
                {/* The typed engine reason (ACCOUNT HELD, INSUFFICIENT BALANCE,
                    ALREADY CLEARED, and friends) renders inline next to it. */}
                {!control.payLegal && control.payReason ? (
                  <span
                    className="action-disabled-reason"
                    data-testid={`${testId}-reason`}
                  >
                    {control.payReason}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
