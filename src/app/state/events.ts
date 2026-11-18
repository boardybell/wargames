// The exactly-once emitted-event relay. Because the engine's emitted array
// corresponds one-to-one with queue deletions and settlement transitions,
// exactly-once is structural: this relay never stores, dedupes, re-derives,
// or synthesizes events from the wall clock. It only fans each emitted event
// out to the registered consumers, in order. Audio warnings (07), the
// announcer (09), and lamp control (08) subscribe here.
import type { EngineEvent } from '@engine'

export type EngineEventConsumer = (event: EngineEvent) => void
export type Unsubscribe = () => void

const consumers = new Set<EngineEventConsumer>()

export function onEngineEvent(consumer: EngineEventConsumer): Unsubscribe {
  consumers.add(consumer)
  return () => {
    consumers.delete(consumer)
  }
}

/** Internal: send and wake call this once per dispatch/advance with the
 *  emitted array, in engine order. */
export function relayEvents(events: readonly EngineEvent[]): void {
  for (const event of events) {
    for (const consumer of consumers) consumer(event)
  }
}

/** Test-only. */
export function __resetConsumers(): void {
  consumers.clear()
}
