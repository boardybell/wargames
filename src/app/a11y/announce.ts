// Announcement stand-in. Section 09 owns the real aria-live regions mounted
// at the app root; this section consumes a narrow announce() so screens can
// report changes. Until section 09 wires the regions, announcements fan out
// to any registered sink (the test spies on this).
export type AnnounceChannel = 'polite' | 'assertive'

export type AnnounceSink = (text: string, channel: AnnounceChannel) => void

const sinks = new Set<AnnounceSink>()

export function onAnnounce(sink: AnnounceSink): () => void {
  sinks.add(sink)
  return () => {
    sinks.delete(sink)
  }
}

export function announce(
  text: string,
  channel: AnnounceChannel = 'polite',
): void {
  for (const sink of sinks) sink(text, channel)
}

/** Test-only. */
export function __resetAnnounce(): void {
  sinks.clear()
}
