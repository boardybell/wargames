// The full-viewport activation scene: one button whose accessible name is the
// visible ACTIVATE TERMINAL label, a decorative hero photo, the live greeting
// positioned over the photo's computed glass point, and a small sound control
// that sits outside the button so toggling it never activates. Activation is
// single-use across click, pointer tap, Enter, and Space; the AudioContext is
// resumed synchronously inside every handler (a user gesture is required), and
// the push-in is handed to the caller exactly once.
import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { artNatural, artSources } from '../art'
import { resumeAudio } from '../audio'
import { Cursor } from '../crt/Cursor'
import { CENTER, computeGlassRect } from './glassRect'
import { HERO_CROPS } from './heroCrop'
import type { ArtSlotId } from './heroCrop'
import './hero.css'

export interface HeroPhotoHandle {
  readonly photoEl: HTMLElement | null
  readonly glass: { x: number; y: number; w: number; h: number }
}

export interface HeroSceneProps {
  readonly slot?: ArtSlotId
  readonly greeting?: string
  /** Invoked exactly once, after the synchronous audio resume, to run the
   *  push-in. The caller owns the terminal layer and the sequence. */
  readonly onActivate: (handle: HeroPhotoHandle) => void
}

export function HeroScene({
  slot = 'hero-desktop',
  greeting = 'GREETINGS PROFESSOR FALKEN',
  onActivate,
}: HeroSceneProps) {
  const activatedRef = useRef(false)
  const photoRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [greetingPos, setGreetingPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  const crop = HERO_CROPS[slot]
  const sources = artSources(slot)

  useLayoutEffect(() => {
    const measure = (): void => {
      const img = imgRef.current
      if (!img) return
      const box = img.getBoundingClientRect()
      const natural = {
        w: img.naturalWidth || artNatural(slot).w,
        h: img.naturalHeight || artNatural(slot).h,
      }
      const { greeting: point } = computeGlassRect(
        { w: box.width, h: box.height },
        natural,
        CENTER,
        crop,
      )
      setGreetingPos(point)
    }
    measure()
    // Recompute on resize, orientation change, and image-source selection (the
    // picture element may pick the portrait companion on phones). Activation
    // unmounts this scene, so no push-in-window suppression is needed here.
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const img = imgRef.current
    img?.addEventListener('load', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      img?.removeEventListener('load', measure)
    }
  }, [slot, crop])

  const glassOf = (): HeroPhotoHandle['glass'] => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0, w: 0, h: 0 }
    const box = img.getBoundingClientRect()
    const natural = {
      w: img.naturalWidth || artNatural(slot).w,
      h: img.naturalHeight || artNatural(slot).h,
    }
    return computeGlassRect(
      { w: box.width, h: box.height },
      natural,
      CENTER,
      crop,
    ).glass
  }

  const activate = (): void => {
    // Synchronous resume inside the gesture, before any guard or async work.
    resumeAudio()
    if (activatedRef.current) return
    activatedRef.current = true
    onActivate({ photoEl: photoRef.current, glass: glassOf() })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  }

  return (
    <>
      <button
        type="button"
        className="hero-button"
        data-testid="hero-button"
        onClick={activate}
        onPointerUp={activate}
        onKeyDown={onKeyDown}
      >
        <span className="hero-photo" ref={photoRef} data-testid="hero-photo" aria-hidden="true">
          <picture>
            <source srcSet={sources.avif} type="image/avif" />
            <img ref={imgRef} src={sources.jpg} alt="" data-testid="hero-img" />
          </picture>
          <span
            className="hero-greeting"
            data-testid="hero-greeting"
            style={{ left: `${greetingPos.x}px`, top: `${greetingPos.y}px` }}
          >
            {greeting}
            <Cursor />
          </span>
        </span>
        <span className="hero-label">ACTIVATE TERMINAL</span>
      </button>
      <div className="hero-sound" data-testid="hero-sound-control" />
    </>
  )
}
