// The account ledger: one row per account with its name, live balance, hold or
// limited state (limited rows show the cap and remaining allowance), and the
// HOLD / RELEASE / LIMIT controls. Legality comes from the engine rules against
// drained state; a rejected action renders the button DISABLED with the typed
// engine reason rendered INLINE next to it (never a tooltip alone). HOLD and
// RELEASE are freely reversible per account, so no confirmation dialogs. LIMIT
// takes a whole-dollar cap through the amount input. Every enabled control
// dispatches the IDENTICAL action object its typed command dispatches, routed
// through the BankScreen handlers so the relay cue fires on an action, never on
// a tick. Uppercase terminal diction, no em-dashes. No reason strings, clue
// logic, or settlement logic here.
import { useState } from 'react'
import type { CampaignAction } from '@engine'
import type { BankPayload } from '@engine/missions/bank/content'
import type { BankState } from '@engine/missions/bank/types'
import { TerminalText } from '../../terminal/TerminalText'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import { accountControl, accountDisplay, limitDraftReason } from './bankActions'
import { makeHoldAction, makeLimitAction, makeReleaseAction } from './verbs'

export interface LedgerViewProps {
  readonly payload: BankPayload
  readonly state: BankState
  readonly selectedAccountId: string | null
  readonly onSelect: (accountId: string) => void
  /** Dispatch a HOLD/RELEASE/LIMIT. BankScreen sends and plays the relay cue;
   *  the identical action object a typed command builds is passed here. */
  readonly onAction: (action: CampaignAction) => void
}

/** The state line for an account row: OPEN, HELD, or LIMITED with cap and
 *  remaining allowance. Read from drained substate only. */
function stateLine(display: ReturnType<typeof accountDisplay>): string {
  if (!display) return ''
  if (display.held) return 'HELD'
  if (display.limitedTo !== null) {
    return `LIMITED TO ${display.limitedTo} (REMAINING ${display.remaining ?? 0})`
  }
  return 'OPEN'
}

/** A control button whose disabled reason renders inline next to it (never a
 *  tooltip alone), mirroring the shell ActionBar idiom but routing the click
 *  through the screen handler so the relay cue is an action, not a render. */
function Control({
  label,
  testId,
  disabled,
  reason,
  onClick,
}: {
  readonly label: string
  readonly testId: string
  readonly disabled: boolean
  readonly reason?: string
  readonly onClick: () => void
}) {
  return (
    <span className="action-bar-item">
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </button>
      {disabled && reason ? (
        <span className="action-disabled-reason" data-testid={`${testId}-reason`}>
          {reason}
        </span>
      ) : null}
    </span>
  )
}

export function LedgerView({
  payload,
  state,
  selectedAccountId,
  onSelect,
  onAction,
}: LedgerViewProps) {
  // The amount input holds a per-account draft cap for LIMIT. A controlled text
  // input keyed by account id; a non-integer or blank draft disables the LIMIT
  // button with a clear reason, so no malformed cap ever dispatches.
  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({})

  return (
    <div data-testid="bank-ledger-view">
      <div className="bank-ledger-legend">
        <GlossaryTerm id="bank-liquidity" />{' '}
        <GlossaryTerm id="bank-limited-release" />
      </div>

      {payload.accounts.map((account) => {
        const display = accountDisplay(state, account.id)
        const control = accountControl(payload, state, account.id)
        const selected = account.id === selectedAccountId
        const draft = capDrafts[account.id] ?? ''
        const draftNum = Number(draft)
        const draftValid =
          draft.trim().length > 0 && Number.isInteger(draftNum) && draftNum >= 0

        // LIMIT eligibility is the engine fact; a blank or malformed draft is a
        // shell input fact rendered as its own reason so the player can read it.
        // When the draft IS a valid integer but the engine's real legality
        // against that specific cap would reject it (e.g. a cap below the spent
        // outflow), surface that typed engine reason inline and keep the button
        // disabled, never dispatch-then-reject.
        const limitReason: string | undefined = !control.limitEligible
          ? control.limitReason
          : !draftValid
            ? 'ENTER A WHOLE-DOLLAR CAP'
            : (limitDraftReason(payload, state, account.id, draftNum) ??
              undefined)

        return (
          <div
            key={account.id}
            data-testid={`account-row-${account.id}`}
            data-selected={selected ? 'true' : 'false'}
            data-held={display?.held ? 'true' : 'false'}
            className={selected ? 'account-row account-row-selected' : 'account-row'}
          >
            <button
              type="button"
              data-testid={`account-select-${account.id}`}
              aria-pressed={selected}
              onClick={() => onSelect(account.id)}
            >
              {`${account.id}  ${account.name}`}
            </button>
            <TerminalText dim>
              {`BALANCE ${display?.balance ?? 0}  ${stateLine(display)}  ${account.flavor}`}
            </TerminalText>
            <label className="bank-amount-input">
              LIMIT CAP (DOLLARS)
              <input
                type="text"
                inputMode="numeric"
                data-testid={`ledger-cap-${account.id}`}
                aria-label={`LIMIT CAP FOR ${account.id}`}
                value={draft}
                onChange={(e) =>
                  setCapDrafts((prev) => ({ ...prev, [account.id]: e.target.value }))
                }
              />
            </label>
            <div className="action-bar" data-testid={`ledger-actions-${account.id}`}>
              <Control
                label="HOLD"
                testId={`ledger-HOLD-${account.id}`}
                disabled={!control.holdLegal}
                reason={control.holdReason}
                onClick={() => onAction(makeHoldAction(account.id))}
              />
              <Control
                label="RELEASE"
                testId={`ledger-RELEASE-${account.id}`}
                disabled={!control.releaseLegal}
                reason={control.releaseReason}
                onClick={() => onAction(makeReleaseAction(account.id))}
              />
              <Control
                label="LIMIT"
                testId={`ledger-LIMIT-${account.id}`}
                disabled={limitReason !== undefined}
                reason={limitReason}
                onClick={() =>
                  onAction(makeLimitAction(account.id, draftValid ? draftNum : 0))
                }
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
