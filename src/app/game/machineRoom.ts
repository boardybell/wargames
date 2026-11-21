// The WOPR machine room, synthesized live with Web Audio (no audio files).
// What a 1983 NORAD computer floor sounds like: the air handlers that keep the
// cabinets cool, 60 Hz mains hum from the power supplies, WOPR's signature
// bursts of computing chirps, tape drives seeking and spinning up, relay
// clicks, and a teletype chattering somewhere across the room.
//
// Browsers only allow sound after the visitor interacts with the page, so the
// room is started on the first gesture (or immediately, when the browser
// already allows it). It plays at full level on the hero and drops to a
// quieter background bed once the terminal is active, so it never fights the
// typing ticks and game sounds.

export type RoomLevel = 'hero' | 'terminal'

interface Room {
  readonly c: AudioContext
  readonly bus: GainNode
  readonly timers: number[]
  level: RoomLevel
}

let room: Room | null = null

const LEVEL_GAIN: Record<RoomLevel, number> = { hero: 1, terminal: 0.35 }

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}

function noiseBuffer(c: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else {
      d[i] = w
    }
  }
  return buf
}

/** Continuous beds: air handlers (filtered brown noise with a slow drift) and
 *  the 60 Hz power-supply hum with its harmonics. */
function startBeds(r: Room): void {
  const { c, bus } = r

  const air = c.createBufferSource()
  air.buffer = noiseBuffer(c, 6, true)
  air.loop = true
  const airLp = c.createBiquadFilter()
  airLp.type = 'lowpass'
  airLp.frequency.value = 520
  const airGain = c.createGain()
  airGain.gain.value = 0.55
  // Slow drift in the fan roar so the room breathes instead of droning.
  const drift = c.createOscillator()
  drift.frequency.value = 0.07
  const driftDepth = c.createGain()
  driftDepth.gain.value = 0.12
  drift.connect(driftDepth).connect(airGain.gain)
  air.connect(airLp).connect(airGain).connect(bus)
  air.start()
  drift.start()

  // A higher fan whine from the cabinet blowers.
  const hiss = c.createBufferSource()
  hiss.buffer = noiseBuffer(c, 4, false)
  hiss.loop = true
  const hissBp = c.createBiquadFilter()
  hissBp.type = 'bandpass'
  hissBp.frequency.value = 2400
  hissBp.Q.value = 0.8
  const hissGain = c.createGain()
  hissGain.gain.value = 0.012
  hiss.connect(hissBp).connect(hissGain).connect(bus)
  hiss.start()

  const humGain = c.createGain()
  humGain.gain.value = 0.05
  humGain.connect(bus)
  for (const [f, g] of [
    [60, 1],
    [120, 0.55],
    [180, 0.25],
    [240, 0.12],
  ] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f + rand(-0.15, 0.15)
    const og = c.createGain()
    og.gain.value = g
    o.connect(og).connect(humGain)
    o.start()
  }
}

function tone(
  r: Room,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
): void {
  const { c, bus } = r
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.004)
  g.gain.setValueAtTime(gain, at + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(bus)
  o.start(at)
  o.stop(at + dur + 0.02)
}

function noiseHit(
  r: Room,
  at: number,
  dur: number,
  freq: number,
  q: number,
  gain: number,
): void {
  const { c, bus } = r
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, Math.max(dur, 0.02) + 0.02, false)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(bp).connect(g).connect(bus)
  src.start(at)
  src.stop(at + dur + 0.02)
}

// WOPR's computing chatter: rapid runs of pure high blips, the sound of the
// machine thinking. Pitches come from a small set so a run sounds like data,
// not noise.
const CHIRP_SET = [1046, 1175, 1318, 1568, 1760, 2093, 2349, 2637]
function computeBurst(r: Room): void {
  const t0 = r.c.currentTime + 0.02
  const n = Math.floor(rand(6, 22))
  const step = rand(0.045, 0.075)
  const wave: OscillatorType = Math.random() < 0.7 ? 'sine' : 'square'
  const g = wave === 'sine' ? 0.05 : 0.018
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.18) continue
    const f = CHIRP_SET[Math.floor(Math.random() * CHIRP_SET.length)] ?? 1318
    tone(r, t0 + i * step, f, step * 0.8, wave, g)
  }
}

// A tape drive seeks: the capstan motor whirs up, the reel spins (a swept,
// band-limited rush), then it brakes with a clunk.
function tapeSeek(r: Room): void {
  const { c, bus } = r
  const t0 = c.currentTime + 0.02
  const dur = rand(0.8, 2.6)
  noiseHit(r, t0, 0.05, 180, 2, 0.25) // engage clunk
  const motor = c.createOscillator()
  motor.type = 'sawtooth'
  const spin = rand(150, 230)
  motor.frequency.setValueAtTime(40, t0)
  motor.frequency.exponentialRampToValueAtTime(spin, t0 + 0.35)
  motor.frequency.setValueAtTime(spin, t0 + dur - 0.3)
  motor.frequency.exponentialRampToValueAtTime(50, t0 + dur)
  const mLp = c.createBiquadFilter()
  mLp.type = 'lowpass'
  mLp.frequency.value = 500
  const mg = c.createGain()
  mg.gain.setValueAtTime(0.0001, t0)
  mg.gain.exponentialRampToValueAtTime(0.03, t0 + 0.3)
  mg.gain.setValueAtTime(0.03, t0 + dur - 0.25)
  mg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  motor.connect(mLp).connect(mg).connect(bus)
  motor.start(t0)
  motor.stop(t0 + dur + 0.05)

  const rush = c.createBufferSource()
  rush.buffer = noiseBuffer(c, dur + 0.1, false)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 3
  bp.frequency.setValueAtTime(400, t0)
  bp.frequency.exponentialRampToValueAtTime(rand(1200, 1900), t0 + dur * 0.6)
  bp.frequency.exponentialRampToValueAtTime(500, t0 + dur)
  const rg = c.createGain()
  rg.gain.setValueAtTime(0.0001, t0)
  rg.gain.exponentialRampToValueAtTime(0.05, t0 + 0.25)
  rg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  rush.connect(bp).connect(rg).connect(bus)
  rush.start(t0)
  rush.stop(t0 + dur + 0.1)
  noiseHit(r, t0 + dur, 0.07, 140, 2, 0.3) // brake clunk
}

// Relay bank: a few dry clicks close together.
function relays(r: Room): void {
  const t0 = r.c.currentTime + 0.02
  const n = Math.floor(rand(2, 7))
  let t = t0
  for (let i = 0; i < n; i++) {
    noiseHit(r, t, 0.012, rand(2500, 4200), 4, 0.16)
    t += rand(0.03, 0.16)
  }
}

// A teletype across the room: a line of muffled print-head strikes.
function teletype(r: Room): void {
  const t0 = r.c.currentTime + 0.02
  const chars = Math.floor(rand(14, 48))
  const rate = 1 / 10 // ten characters per second, Model 33 speed
  for (let i = 0; i < chars; i++) {
    if (Math.random() < 0.1) continue
    noiseHit(r, t0 + i * rate + rand(0, 0.01), 0.025, rand(900, 1400), 1.5, 0.06)
  }
  // Carriage return clunk at the end of the line.
  noiseHit(r, t0 + chars * rate + 0.08, 0.12, 260, 1.2, 0.12)
}

/** Fire `fn` at random intervals while the room is at hero level. */
function every(r: Room, lo: number, hi: number, fn: (r: Room) => void, first = 0): void {
  const loop = (): void => {
    if (room !== r) return
    if (r.level === 'hero') {
      try {
        fn(r)
      } catch {
        /* never let a sound break the page */
      }
    }
    r.timers.push(window.setTimeout(loop, rand(lo, hi) * 1000))
  }
  r.timers.push(window.setTimeout(loop, (first || rand(lo, hi)) * 1000))
}

/** Build the room on an AudioContext. Idempotent: a second call only resumes. */
export function startMachineRoom(c: AudioContext, out: AudioNode, level: RoomLevel): void {
  if (room) {
    setMachineRoomLevel(level)
    return
  }
  const bus = c.createGain()
  bus.gain.setValueAtTime(0.0001, c.currentTime)
  bus.gain.exponentialRampToValueAtTime(LEVEL_GAIN[level], c.currentTime + 2.5)
  bus.connect(out)
  const r: Room = { c, bus, timers: [], level }
  room = r
  try {
    startBeds(r)
  } catch {
    /* ignore */
  }
  every(r, 1.6, 4.2, computeBurst, 0.8)
  every(r, 7, 16, tapeSeek, 3.5)
  every(r, 2.5, 7, relays, 1.8)
  every(r, 12, 26, teletype, 6)
}

export function setMachineRoomLevel(level: RoomLevel): void {
  const r = room
  if (!r || r.level === level) return
  r.level = level
  const t = r.c.currentTime
  r.bus.gain.cancelScheduledValues(t)
  r.bus.gain.setValueAtTime(Math.max(r.bus.gain.value, 0.0001), t)
  r.bus.gain.exponentialRampToValueAtTime(LEVEL_GAIN[level], t + 1.5)
}

export function machineRoomRunning(): boolean {
  return room !== null
}
