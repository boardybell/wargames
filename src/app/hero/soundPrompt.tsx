// The diegetic ENABLE SOUND? Y/N line. Renders as a terminal line after
// activation, only when the campaign is fresh and sound has never been
// configured. It registers at the active-diegetic-prompt layer of the input
// precedence stack so Y answers it without completing a type-in or selecting a
// menu row, and unrelated keys fall through. The answer persists in the single
// master sound preference that also backs the settings switch (section 07),
// never a shadow copy, so it never reappears, including across a reload.
import { useCallback, useEffect, useRef } from 'react'
import { clearPrompt, setPrompt } from '../screens/inputStack'
import { resumeAudio, setSoundPreference } from '../audio'
import { TerminalText } from '../terminal/TerminalText'

export interface SoundPromptProps {
  readonly onAnswered?: (enabled: boolean) => void
}

export function SoundPrompt({ onAnswered }: SoundPromptProps) {
  const answeredRef = useRef(false)
  const onAnsweredRef = useRef(onAnswered)
  onAnsweredRef.current = onAnswered

  // One answer path for both the keyboard (via the prompt layer) and the
  // buttons; a latch guards against answering twice (key then click).
  const answer = useCallback((enabled: boolean): void => {
    if (answeredRef.current) return
    answeredRef.current = true
    setSoundPreference(enabled ? 'on' : 'off')
    if (enabled) resumeAudio()
    clearPrompt()
    onAnsweredRef.current?.(enabled)
  }, [])

  useEffect(() => {
    setPrompt(['Y', 'y', 'N', 'n'], (key) => answer(key === 'Y' || key === 'y'))
    return () => clearPrompt()
  }, [answer])

  return (
    <div className="sound-prompt" data-testid="sound-prompt">
      <TerminalText>ENABLE SOUND? Y/N</TerminalText>
      <button
        type="button"
        data-testid="sound-yes"
        onClick={() => answer(true)}
      >
        Y
      </button>
      <button type="button" data-testid="sound-no" onClick={() => answer(false)}>
        N
      </button>
    </div>
  )
}
