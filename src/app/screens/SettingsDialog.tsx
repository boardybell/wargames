// The settings dialog: sound, motion, reduce glow, extended time, and the New
// Campaign entry point. Every control reads and writes the one backing value
// its consumers share (no shadow copies). Extended time is an engine
// preference, editable only before any mission has started; once started it
// locks with a visible explanation rather than vanishing.
import { useRef } from 'react'
import { send, useCampaign } from '../state'
import { setAudioPref, useAudioPrefs } from '../audio'
import { setMotionOverride, useReducedMotion } from '../a11y/motion'
import { setReduceGlow, useReduceGlow } from '../theme/reduceGlow'
import { GlossaryTerm } from '../a11y/GlossaryTerm'
import { openOverlay } from './dialogState'
import { Dialog } from './Dialog'

export interface SettingsDialogProps {
  readonly open: boolean
  readonly onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const state = useCampaign()
  const prefs = useAudioPrefs()
  const reducedMotion = useReducedMotion()
  const reduceGlow = useReduceGlow()
  const firstRef = useRef<HTMLInputElement>(null)
  const extendedLocked = state.startedMissionIds.length > 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="settings-heading"
      testId="settings-dialog"
      initialFocus={() => firstRef.current}
    >
      <h2 id="settings-heading">SETTINGS</h2>

      <fieldset>
        <legend>SOUND</legend>
        <label>
          <input
            ref={firstRef}
            type="checkbox"
            data-testid="toggle-master"
            checked={prefs.master}
            onChange={(e) => setAudioPref('master', e.target.checked)}
          />
          {' MASTER'}
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="toggle-effects"
            checked={prefs.effects}
            onChange={(e) => setAudioPref('effects', e.target.checked)}
          />
          {' EFFECTS'}
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="toggle-voice"
            checked={prefs.voice}
            onChange={(e) => setAudioPref('voice', e.target.checked)}
          />
          {' VOICE (AI-GENERATED)'}
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="toggle-ambience"
            checked={prefs.ambience}
            onChange={(e) => setAudioPref('ambience', e.target.checked)}
          />
          {' AMBIENCE'}
        </label>
      </fieldset>

      <fieldset>
        <legend>MOTION</legend>
        <label>
          <input
            type="checkbox"
            data-testid="toggle-motion"
            checked={reducedMotion}
            onChange={(e) => setMotionOverride(e.target.checked ? 'reduce' : 'full')}
          />
          {' REDUCE MOTION'}
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="toggle-reduce-glow"
            checked={reduceGlow}
            onChange={(e) => setReduceGlow(e.target.checked)}
          />
          {' REDUCE GLOW'}
        </label>
      </fieldset>

      <fieldset>
        <legend>
          <GlossaryTerm
            term="EXTENDED TIME"
            definition="Doubles every mission's countdown, for a calmer pace. It can only be chosen before the campaign begins."
          />
        </legend>
        <label>
          <input
            type="checkbox"
            data-testid="toggle-extended-time"
            checked={state.preferences.extendedTime}
            disabled={extendedLocked}
            onChange={(e) =>
              send({
                type: 'SET_PREFERENCE',
                preference: 'extendedTime',
                value: e.target.checked,
              })
            }
          />
          {' DOUBLE THE MISSION CLOCK'}
        </label>
        {extendedLocked && (
          <p data-testid="extended-time-lock">
            LOCKED: THE CAMPAIGN HAS BEGUN, SO TIMING IS FIXED FOR ITS DURATION.
          </p>
        )}
      </fieldset>

      <div className="dialog-actions">
        <button
          type="button"
          data-testid="settings-new-campaign"
          onClick={() => openOverlay('newCampaign')}
        >
          NEW CAMPAIGN
        </button>
        <button type="button" data-testid="settings-close" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </Dialog>
  )
}
