// Shared front-end sound: one AudioContext, a master gain, the machine room,
// and the small synth voices (beep, chime, thud, siren) every screen uses.
import { setMachineRoomLevel, startMachineRoom } from './machineRoom'
import type { RoomLevel } from './machineRoom'

// ---------- sound (created and resumed on the activation gesture) ----------
let actx: AudioContext | null = null
let master: GainNode | null = null
let soundOn = false

export function ctx(): AudioContext | null {
  if (actx) return actx
  try {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (C) {
      actx = new C()
      master = actx.createGain()
      master.gain.value = 0.6
      master.connect(actx.destination)
    }
  } catch {
    actx = null
  }
  return actx
}

// The visitor's sound choice from the hero's SOUND switch, remembered across
// visits. null means they never chose, which counts as on.
const SOUND_KEY = 'wg.sound'
export function soundPref(): 'on' | 'off' | null {
  try {
    const v = window.localStorage.getItem(SOUND_KEY)
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}
export function saveSoundPref(v: 'on' | 'off'): void {
  try {
    window.localStorage.setItem(SOUND_KEY, v)
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

// Turn sound on and bring up the machine room. Must run inside a user gesture
// unless the browser already allows audio (autoplay permitted).
export function enableSound(level: RoomLevel): void {
  soundOn = true
  const c = ctx()
  if (!c || !master) return
  try {
    void c.resume()
  } catch {
    /* ignore */
  }
  startMachineRoom(c, master, level)
}

export function muteSound(): void {
  soundOn = false
  try {
    void actx?.suspend()
  } catch {
    /* ignore */
  }
}

// Start audio inside the activation gesture: the machine room keeps running
// underneath the terminal as a quieter bed so the machine is always audibly
// alive. An explicit SOUND OFF on the hero is respected.
export function startAudio(): void {
  if (soundPref() === 'off') return
  enableSound('terminal')
  setMachineRoomLevel('terminal')
}

export function beep(
  freq = 440,
  dur = 0.07,
  type: OscillatorType = 'square',
  gain = 0.14,
): void {
  if (!soundOn) return
  const c = ctx()
  if (!c || !master) return
  try {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = freq
    o.connect(g)
    g.connect(master)
    const t = c.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.start(t)
    o.stop(t + dur + 0.03)
  } catch {
    // never let a dead speaker break the game
  }
}
// A rising two-tone confirm.
export function chime(base = 520): void {
  beep(base, 0.09, 'square', 0.12)
  setTimeout(() => beep(base * 1.5, 0.12, 'square', 0.12), 90)
}
export const thud = (): void => {
  beep(70, 0.5, 'sine', 0.6)
  beep(45, 0.6, 'triangle', 0.45)
}
export function siren(): void {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => beep(i % 2 ? 760 : 560, 0.2, 'sawtooth', 0.14), i * 190)
  }
}

