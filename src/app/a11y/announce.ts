// The single entry point for every spoken notification in the app. The
// engine-event relay (section 02) and the audio captions (section 07) route
// through announce(); the repaint ticker NEVER does, which is what keeps
// countdown ticks silent. There is no path to the live regions but this one.
//
// Polite announcements coalesce within an ~800ms burst window (identical
// strings collapse to one utterance, distinct strings queue and flush in
// arrival order) and retrigger across windows via a sequence bump so a screen
// reader re-reads an identical string. Assertive announcements write through
// immediately, with no coalescing and no debounce, so the finale's critical
// warnings are never delayed or dropped. A raw sink (onAnnounce) also fires on
// every call for tests and non-visual consumers.
export type AnnounceChannel = 'polite' | 'assertive'

export type AnnounceSink = (text: string, channel: AnnounceChannel) => void

export const POLITE_WINDOW_MS = 800

const sinks = new Set<AnnounceSink>()

export function onAnnounce(sink: AnnounceSink): () => void {
  sinks.add(sink)
  return () => {
    sinks.delete(sink)
  }
}

export interface RegionState {
  readonly politeText: string
  readonly politeSeq: number
  readonly assertiveText: string
  readonly assertiveSeq: number
}

let region: RegionState = {
  politeText: '',
  politeSeq: 0,
  assertiveText: '',
  assertiveSeq: 0,
}
const regionListeners = new Set<() => void>()

export function subscribeRegion(listener: () => void): () => void {
  regionListeners.add(listener)
  return () => regionListeners.delete(listener)
}

export function getRegionState(): RegionState {
  return region
}

function emitRegion(next: RegionState): void {
  region = next
  for (const listener of regionListeners) listener()
}

// The polite coalescer: a fixed-window burst. Within one ~800ms window
// identical strings collapse (dedup) and distinct strings accumulate in arrival
// order; at the window end they flush as ONE ordered utterance and the buffer
// clears. This bounds the announcer: a finale burst of N events reads once, not
// as an N-times-800ms drip, and the timer always clears after a single flush.
let buffer: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function enqueuePolite(text: string): void {
  if (!buffer.includes(text)) buffer.push(text)
  if (timer === null) timer = setTimeout(flushPolite, POLITE_WINDOW_MS)
}

function flushPolite(): void {
  timer = null
  if (buffer.length === 0) return
  const text = buffer.join('. ')
  buffer = []
  // Bump the sequence so an identical utterance across windows still re-reads.
  emitRegion({ ...region, politeText: text, politeSeq: region.politeSeq + 1 })
}

export function announce(
  text: string,
  channel: AnnounceChannel = 'polite',
): void {
  // The sink is RAW: it sees every call, including polite duplicates the region
  // later coalesces away. The region is the coalesced truth; the sink is a tap.
  for (const sink of sinks) sink(text, channel)
  if (channel === 'assertive') {
    emitRegion({
      ...region,
      assertiveText: text,
      assertiveSeq: region.assertiveSeq + 1,
    })
    return
  }
  enqueuePolite(text)
}

/** Test-only. */
export function __resetAnnounce(): void {
  sinks.clear()
  buffer = []
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  region = { politeText: '', politeSeq: 0, assertiveText: '', assertiveSeq: 0 }
  regionListeners.clear()
}
