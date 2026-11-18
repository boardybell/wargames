// The integration: load routing decides whether the hero shows at all, the
// HeroScene hands off to the push-in, and the push-in reveals the terminal
// (ScreenRouter) beneath. A mid-engagement save skips the hero entirely. The
// wake on arrival that settles an expired session is performed by the store's
// init (section 02) before this mounts, so the resumed phase already drives
// the routing decision here.
import { useRef, useState } from 'react'
import { useCampaign } from '../state'
import { hasSoundPreference } from '../audio'
import { ScreenRouter } from '../screens'
import { moveFocusTo } from '../a11y/focus'
import { prefersReducedMotion } from '../a11y/motion'
import { decideInitialScreen } from './loadRouting'
import { HeroScene } from './HeroScene'
import type { HeroPhotoHandle } from './HeroScene'
import { SoundPrompt } from './soundPrompt'
import { runPushIn } from './pushIn'

export function HeroStage() {
  const state = useCampaign()
  const [activated, setActivated] = useState(
    () => decideInitialScreen(state) === 'engine',
  )
  const [showSoundPrompt, setShowSoundPrompt] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const freshAtMount = useRef(
    state.phase === 'menu' && state.settled.length === 0,
  )

  const onActivate = (handle: HeroPhotoHandle): void => {
    const terminalEl = terminalRef.current
    if (!terminalEl) {
      setActivated(true)
      return
    }
    runPushIn(
      {
        photoEl: handle.photoEl ?? terminalEl,
        terminalEl,
        glass: handle.glass,
        viewport: { w: window.innerWidth, h: window.innerHeight },
      },
      {
        reducedMotion: prefersReducedMotion(),
        onFinish: () => {
          setActivated(true)
          moveFocusTo(terminalEl)
          if (freshAtMount.current && !hasSoundPreference()) {
            setShowSoundPrompt(true)
          }
        },
      },
    )
  }

  if (activated) {
    return (
      <>
        <ScreenRouter />
        {showSoundPrompt && (
          <SoundPrompt onAnswered={() => setShowSoundPrompt(false)} />
        )}
      </>
    )
  }

  return (
    <>
      {/* The terminal mounts beneath the photo at opacity 0; the push-in
          crossfades it up. */}
      <div
        ref={terminalRef}
        data-testid="terminal-beneath"
        style={{ position: 'absolute', inset: 0, opacity: 0 }}
      >
        <ScreenRouter />
      </div>
      <HeroScene onActivate={onActivate} />
    </>
  )
}
