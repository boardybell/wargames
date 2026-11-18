// Mounts the overlay suite into the dialog host. Which one is open is driven
// by dialogState (settings and help are overlays, not engine phases); the
// corrupt-save notice is driven by the recovery flag independently.
import { closeOverlay, useOverlay } from './dialogState'
import { PauseDialog } from './PauseDialog'
import { SettingsDialog } from './SettingsDialog'
import { NewCampaignDialog } from './NewCampaignDialog'
import { HelpOverlay } from './HelpOverlay'
import { CorruptSaveNotice } from './CorruptSaveNotice'

export function DialogLayer({ activeScreen }: { readonly activeScreen: string }) {
  const overlay = useOverlay()
  return (
    <>
      <PauseDialog open={overlay === 'pause'} onClose={closeOverlay} />
      <SettingsDialog open={overlay === 'settings'} onClose={closeOverlay} />
      <NewCampaignDialog open={overlay === 'newCampaign'} onClose={closeOverlay} />
      <HelpOverlay
        open={overlay === 'help'}
        activeScreen={activeScreen}
        onClose={closeOverlay}
      />
      <CorruptSaveNotice />
    </>
  )
}
