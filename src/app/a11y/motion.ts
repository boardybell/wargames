// Motion-preference stand-in. Section 09 owns the real useMotionPreference
// hook that composes the media query with an in-app override; this reads the
// media query so the push-in and type-in can honor reduced motion now.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
