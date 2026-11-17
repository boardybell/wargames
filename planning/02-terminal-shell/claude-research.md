# Research: 02-terminal-shell

Web research synthesized 2026-11-17. No codebase research: fresh repo; the engine
contract comes from planning/01-simulation-core (claude-plan.md rev 2). Testing
stack inherited from split 01: Vitest 4 projects config (this split adds the jsdom
UI project), @fast-check/vitest where useful, Playwright arrives in split 08.

## 1. CRT visual effects in CSS/HTML

Phosphor glow: layered text-shadow is the primary tool (tight bright core + one or
two wide faint halos). It softens the aura without blurring the glyph, keeping text
sharp (https://css-tricks.com/old-timey-terminal-styling/). filter: drop-shadow()
creates a filter region and costs more under constant repaint; SVG feGaussianBlur
bloom is most authentic but worst and least predictable performance (historically
poor on Safari when animated); reserve for a static hero flourish only. Never
animate text-shadow or any filter per frame; breathing phosphor goes on a
duplicated layer or pseudo-element animating opacity (compositor-cheap). Cursor
blink: opacity animation with steps(2).

Scanlines: repeating-linear-gradient of transparent and faint black rows (3 to 4 px
period) on a single fixed overlay or ::after with pointer-events: none (keeps text
selectable; Firefox cares), and reset text-shadow in ::selection
(https://github.com/Imetomi/retro-futuristic-ui-design). 2 px reads as a fine
shadow mask, 5 px as an early monochrome tube; align to device pixels to limit
moire (https://codefronts.com/design-styles/css-retro-designs/crt-scanlines-and-screen-curvature/).
Plain rgba lines are nearly indistinguishable from mix-blend-mode and cheaper. A
rolling bar, if any, is one translating gradient element, transform only.

Vignette and curvature: radial-gradient vignette overlay plus inset box-shadow on
the bezel; generous border-radius on the glass container. True barrel distortion
(feDisplacementMap/WebGL) not worth it for selectable DOM text.

Fonts: Ultimate Oldschool PC Font Pack (CC BY-SA 4.0, ready WOFF, only correct at
integer multiples of native pixel height; attribute VileR)
(https://int10h.org/oldschool-pc-fonts/readme/). Glass TTY VT220: public domain,
closest to a 1983 raster terminal (https://github.com/svofski/glasstty). VT323
(OFL, Google Fonts) scales freely as fallback. DEC raster typography reference:
https://www.masswerk.at/nowgobang/2019/dec-crt-typography.

Performance: a full-screen composited layer at 2x DPI is roughly 16 MB GPU memory;
blanket will-change has crashed real apps
(https://www.mironsoft.de/en/blog/css-gpu-compositing-and-animation-performance,
https://cr0x.net/en/css-animations-performance-rules/). will-change: transform only
on the hero photo and terminal during the 700 ms push-in, removed after. No
backdrop-filter in this design; never animate a blur radius; animate only transform
and opacity on mobile.

Accessibility under styling: terminal is real DOM text (pre/output semantics); all
effects on separate non-interactive overlays; contrast measured on the base glyph
color, glow ignored.

## 2. The hero push-in

Core: FLIP with WAAPI element.animate(), transform + opacity only, transform-origin
0 0, finish promise sequences the crossfade and audio sting
(https://css-tricks.com/animating-layouts-with-the-flip-technique/). Easing
cubic-bezier(0.4, 0.0, 0.2, 1) or camera-dolly ease-in.

Geometry: keep the terminal full-viewport; scale the PHOTO so its screen region
grows to fill the viewport. Store the CRT screen rect as fractions of the photo's
natural dimensions per art-directed crop; compute the rendered rect under
object-fit: cover (scale = max(boxW/imgW, boxH/imgH), offsets = (box - rendered)/2,
screen-rect-on-screen = offset + fraction x rendered)
(https://github.com/erhangundogan/get-object-fit-rect,
https://gist.github.com/ciaranj/7177fb342102e571db2784dc831f868b). Push transform:
scale by k = max(vw/screenRectW, vh/screenRectH) with slight overshoot so the bezel
clears the edges, translating the rect center to viewport center. Recompute on
resize and orientation change. Portrait phones get an art-directed second crop via
picture, with per-source screen-rect metadata keyed by img.currentSrc.

Crossfade: mount the terminal at opacity 0 before the animation; fade it in over
the last ~250 ms while the photo fades out, with a tiny synchronized settle (scale
1.02 to 1) and a one-frame blue-white bloom flash at the handoff to hide residual
mis-register.

View Transitions API (Nov 2026): same-document is Baseline (Chrome/Edge 111+,
Safari 18+, Firefox 144+, ~93% support per https://caniuse.com/view-transitions);
cross-document still not Firefox. Verdict: skip it here. Snapshot interpolation
cannot hit an exact photographic rect with an overlapped crossfade synced to
audio; hand-rolled FLIP wins and works everywhere.

Reduced motion: matchMedia('(prefers-reduced-motion: reduce)') with a change
listener. Under reduce: 200 to 300 ms opacity crossfade instead of the push, and
suppress idle hero motion, rolling bars, phosphor flicker
(https://web.dev/articles/prefers-reduced-motion,
https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/).

## 3. Web Audio engine

Autoplay/unlock: AudioContext created pre-gesture starts suspended; resume() must
run inside user activation; iOS Safari requires it synchronously in the gesture
callback, not after an await (https://developer.chrome.com/blog/autoplay,
https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices,
https://js2devlog.com/en/devlog/ios-safari-audio-unlock). Safari can move a context
to interrupted; listen to statechange and re-resume on next gesture. The hero
click is a guaranteed activation: create one AudioContext app-wide and resume() in
that click handler even though the game starts muted (master gain 0); later unmute
is instant.

Architecture: three GainNode buses (effects, voice, ambience) into a master gain
into destination (https://www.w3.org/TR/webaudio-1.1/). Cue manifest: id, source
(synth recipe or URL), bus, base gain, transcript, interrupt policy (exclusive-on-
bus, queue, drop-if-stale). Transcript is load-bearing: feeds captions and the
polite live region. Short cues decoded to AudioBuffers up front.

Ducking: voice start: ambienceGain.gain.setTargetAtTime(0.3, t, 0.05); voice end:
setTargetAtTime(1.0, t, 0.3); cancelScheduledValues before re-ramping; micro-fade
5 to 10 ms before any stop() to avoid clicks
(http://alemangui.github.io/ramp-to-value). Exclusive voice: new line kills prior.

Stale cues: every playing cue tagged with a generation token incremented on
game-state change; queued cues check the token and drop silently. No lookahead
scheduler needed; synth sequences schedule frequency and gain steps directly.

Muted-by-default: master gain 0, role="switch" control showing true state, prefs
{master, voice, effects, ambience} persisted as JSON in localStorage, corrupt read
falls back to defaults silently.

Synthesis: square/triangle oscillators for clicks, beeps, two-tone chirps; white
noise AudioBuffer through a bandpass (1 to 3 kHz) for static and teletype texture;
every sound wrapped in a short exponential envelope (attack ~5 ms, release 30 to
100 ms) or it clicks. Zero asset weight for effects. AI voice ships as pre-rendered
files on the voice bus (speechSynthesis too inconsistent for a scripted character).

## 4. Accessible stylized game UX

Live regions: mount two permanent regions at boot (regions populated at creation
are unreliable): role="status" polite atomic for game events; role="alert"
assertive reserved for critical moments
(https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions,
https://www.a11y-collective.com/blog/aria-live/). The visible countdown gets
role="timer" (implies aria-live off, ticks never announced); push milestone
messages (threshold crossings) to the polite region instead. One announcer utility
debounces bursts and retriggers identical strings; test VoiceOver and NVDA.

Focus: on each screen change move focus to the new screen's heading or the
terminal input (tabindex=-1 + focus({preventScroll:true}))
(https://www.a11yflow.dev/blog/focus-management-spa-accessibility). Overlays are
native dialog with showModal(): top layer, automatic focus trap, inert background,
Escape, focus restoration (https://accessibility.build/guides/accessible-dialog).
Label with aria-labelledby and choose initial focus.

Shortcuts: global keydown bails on input/textarea/select targets,
isContentEditable, held modifiers, and e.isComposing
(https://github.com/home-assistant/frontend/pull/53491). Single-key shortcuts only
fire outside editable elements. The hero is a real button, so Enter/Space free.

Contrast: AA 4.5:1 normal text, 3:1 large text and UI components/focus indicators
(https://webaim.org/articles/contrast/). Measure the solid glyph core against the
background; glow is decoration. Halation from glowing text degrades readability
for astigmatic users (roughly a third of people); keep bloom radii moderate and
offer a reduce-glow toggle. Electric blue near #6CB6FF on #050A14 clears 4.5:1;
verify exact picks.

Reduced motion also governs autoplaying ambient effects (flicker loops, rolling
bars, idle drift) and the typewriter speed (near-instant under reduce)
(https://web.dev/articles/prefers-reduced-motion).

Hero button: one large button with a visible text prompt as its accessible name;
photo is decoration (alt=""). Countdown timing falls under WCAG 2.2.1 Timing
Adjustable; real-time gameplay qualifies for the essential exception; the menu
overlay already keeps the countdown honest.

## Recommendations for this shell

1. Real DOM terminal text with layered text-shadow; effects on pointer-events:
   none overlays; cursor opacity steps(2); nothing animates shadows or blurs.
2. Font: closest match to the reference screenshot wins; candidates Glass TTY
   VT220 (public domain), int10h pack at integer multiples, VT323 fallback.
3. Hand-rolled FLIP push-in with WAAPI; screen-rect-as-fractions metadata per
   art-directed crop; object-fit cover math; terminal full-viewport; 250 ms
   crossfade with bloom flash; will-change only during the 700 ms.
4. Reduced motion: fade instead of push, kill ambient loops, instant type-in.
5. One AudioContext resumed synchronously in the hero click; three buses + master;
   manifest with mandatory transcripts; setTargetAtTime ducking; generation-token
   stale-cue dropping; muted by default with persisted independent toggles.
6. Synthesized effects (zero assets); pre-rendered voice files.
7. Two persistent live regions; role="timer" countdown; milestone announcements
   through one debounced announcer.
8. Focus to new content on screen changes; native dialog for all overlays; global
   shortcuts bail on editable targets and composition.
9. Glyph core color clears 4.5:1 alone; restrained bloom; reduce-glow toggle
   beside sound and motion settings.
