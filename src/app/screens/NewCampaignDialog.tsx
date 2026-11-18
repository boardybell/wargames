// New Campaign confirmation. Lists exactly the three named seeds from the
// engine catalog metadata (no free seed input, ever). Selecting a seed does
// nothing; an explicit confirm dispatches NEW_CAMPAIGN, which the save binding
// flushes immediately. Cancel closes with no dispatch.
import { useRef, useState } from 'react'
import { seedCatalogMetadata } from '@engine'
import { send } from '../state'
import { Dialog } from './Dialog'

export interface NewCampaignDialogProps {
  readonly open: boolean
  readonly onClose: () => void
}

export function NewCampaignDialog({ open, onClose }: NewCampaignDialogProps) {
  const seeds = seedCatalogMetadata()
  const [selected, setSelected] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  const confirm = (): void => {
    if (!selected) return
    send({ type: 'NEW_CAMPAIGN', seedName: selected })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="newcampaign-heading"
      testId="new-campaign-dialog"
      initialFocus={() => firstRef.current}
    >
      <h2 id="newcampaign-heading">NEW CAMPAIGN</h2>
      <p>STARTING A NEW CAMPAIGN ERASES THE CURRENT ONE.</p>
      <ul className="seed-list" data-testid="seed-list">
        {seeds.map((seed, i) => (
          <li key={seed.name}>
            <label>
              <input
                ref={i === 0 ? firstRef : undefined}
                type="radio"
                name="seed"
                value={seed.name}
                data-testid={`seed-${seed.name}`}
                checked={selected === seed.name}
                onChange={() => setSelected(seed.name)}
              />
              {` ${seed.name.toUpperCase()}: ${seed.description}`}
            </label>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button
          type="button"
          data-testid="new-campaign-confirm"
          disabled={!selected}
          onClick={confirm}
        >
          CONFIRM NEW CAMPAIGN
        </button>
        <button type="button" data-testid="new-campaign-cancel" onClick={onClose}>
          CANCEL
        </button>
      </div>
    </Dialog>
  )
}
