// A mission-local property suite over the REAL engine lifecycle and the
// REAL outlook module. The arbitrary generates sequences of valid-SHAPED
// actions (READ, FLAG, QUEUE, SEND, SEND_QUEUED, TRACE, CHECK SOURCE) at
// nondecreasing integer times inside the mission window, over the fixture
// seed's twelve message ids and both channels. Invalid-shaped actions are
// rejected by the module validator (surfaced as dispatch rejections), never
// a crash, and every invariant holds over whatever subset the engine
// accepts. The run count is modest (200) and the fast-check seed is pinned
// for a deterministic CI harness.
//
// Per section-04 implementation note 6: this suite is mission-local by
// design. The campaign-level fc.commands suite
// (test/engine/properties/model-commands.test.ts) is built around its own
// three test-double missions and does not accept additional mission modules,
// so the outlook module is exercised here rather than registered there.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import { OUTLOOK_PAYLOAD_BY_SEED } from '@engine/missions/outlook/payloads'
import { isSatisfiedDelivery } from '@engine/missions/outlook/rules'
import type { OutlookMessage, OutlookState } from '@engine/missions/outlook/types'
import {
  OUTLOOK_DURATION_MS,
  OUTLOOK_T0,
  outlookContextForSeed,
} from './fixtures/index'

const SEED = SEED_NAMES[0]!
const PAYLOAD = OUTLOOK_PAYLOAD_BY_SEED[SEED]!
const ENDS_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS
const CAPACITY = PAYLOAD.channelTuning.backupCapacity
const MESSAGE_IDS = PAYLOAD.messages.map((m) => m.id)
const MESSAGE_BY_ID = new Map<string, OutlookMessage>(
  PAYLOAD.messages.map((m) => [m.id, m]),
)
const SUPERSEDED_IDS = new Set(
  PAYLOAD.messages.filter((m) => m.supersededBy !== null).map((m) => m.id),
)
const DESKS = ['WEATHER_DESK', 'PAYROLL_DESK', 'AUDIT_DESK'] as const
const RECORD_IDS = Array.from(
  new Set(
    PAYLOAD.messages
      .map((m) => m.recordId)
      .filter((id): id is string => id !== null),
  ),
)

const FC_SEED = 0x0ac77 // pinned per the deterministic split-01 harness convention

type GenAction =
  | { readonly kind: 'READ'; readonly messageId: string }
  | { readonly kind: 'FLAG'; readonly messageId: string }
  | { readonly kind: 'QUEUE'; readonly messageId: string; readonly channel: 'primary' | 'backup' }
  | { readonly kind: 'SEND'; readonly messageId: string; readonly channel: 'primary' | 'backup'; readonly recipient: string }
  | { readonly kind: 'SEND_QUEUED'; readonly index: number; readonly recipient: string }
  | { readonly kind: 'TRACE'; readonly recordId: string }
  | { readonly kind: 'CHECK_SOURCE'; readonly recordId: string }

const messageIdArb = fc.constantFrom(...MESSAGE_IDS)
const channelArb = fc.constantFrom('primary' as const, 'backup' as const)
const deskArb = fc.constantFrom(...DESKS)
const recordIdArb = fc.constantFrom(...RECORD_IDS)

const genActionArb: fc.Arbitrary<GenAction> = fc.oneof(
  messageIdArb.map((messageId) => ({ kind: 'READ' as const, messageId })),
  messageIdArb.map((messageId) => ({ kind: 'FLAG' as const, messageId })),
  fc
    .tuple(messageIdArb, channelArb)
    .map(([messageId, channel]) => ({ kind: 'QUEUE' as const, messageId, channel })),
  fc
    .tuple(messageIdArb, channelArb, deskArb)
    .map(([messageId, channel, recipient]) => ({
      kind: 'SEND' as const,
      messageId,
      channel,
      recipient,
    })),
  fc
    .tuple(fc.integer({ min: 0, max: 8 }), deskArb)
    .map(([index, recipient]) => ({ kind: 'SEND_QUEUED' as const, index, recipient })),
  recordIdArb.map((recordId) => ({ kind: 'TRACE' as const, recordId })),
  recordIdArb.map((recordId) => ({ kind: 'CHECK_SOURCE' as const, recordId })),
)

interface TimedGenAction {
  readonly action: GenAction
  /** Delta ms from mission start. Nondecreasing across the sequence. */
  readonly delta: number
}

/** A sequence of actions at nondecreasing integer times within the window
 *  (plus a tail past the deadline so settlement always fires). */
const sequenceArb: fc.Arbitrary<TimedGenAction[]> = fc
  .array(
    fc.record({
      action: genActionArb,
      // Gap since the previous action, so a running sum is nondecreasing.
      gap: fc.integer({ min: 0, max: 40_000 }),
    }),
    { minLength: 0, maxLength: 24 },
  )
  .map((entries) => {
    let delta = 0
    return entries.map(({ action, gap }) => {
      delta += gap
      return { action, delta }
    })
  })

function toCampaignAction(gen: GenAction): CampaignAction {
  switch (gen.kind) {
    case 'READ':
      return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: gen.messageId } }
    case 'FLAG':
      return { type: 'MISSION_ACTION', payload: { kind: 'FLAG', messageId: gen.messageId } }
    case 'QUEUE':
      return {
        type: 'MISSION_ACTION',
        payload: { kind: 'QUEUE', messageId: gen.messageId, channel: gen.channel },
      }
    case 'SEND':
      return {
        type: 'MISSION_ACTION',
        payload: {
          kind: 'SEND',
          messageId: gen.messageId,
          channel: gen.channel,
          recipient: gen.recipient,
        },
      }
    case 'SEND_QUEUED':
      return {
        type: 'MISSION_ACTION',
        payload: { kind: 'SEND_QUEUED', index: gen.index, recipient: gen.recipient },
      }
    case 'TRACE':
      return { type: 'INSPECT_RECORD', recordId: gen.recordId }
    case 'CHECK_SOURCE':
      return { type: 'REQUEST_SOURCE_CHECK', recordId: gen.recordId }
  }
}

function startMission(ctx: EngineContext): CampaignState {
  const created = createCampaign(ctx, SEED, { extendedTime: false }, OUTLOOK_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'outlook' },
    OUTLOOK_T0,
  ).state
}

function sub(state: CampaignState): OutlookState | null {
  return (state.activeMission?.substate as OutlookState | undefined) ?? null
}

describe('outlook rules properties', () => {
  it('never negative backup capacity; never satisfies a superseded message; QUEUE is free; settles exactly once', () => {
    fc.assert(
      fc.property(sequenceArb, (sequence) => {
        const ctx = outlookContextForSeed(SEED)
        let state = startMission(ctx)
        const settlementEvents: EngineEvent[] = []

        for (const { action, delta } of sequence) {
          const now = OUTLOOK_T0 + delta
          const campaignAction = toCampaignAction(action)

          // Record backup capacity and send-log length before a bare QUEUE so
          // we can prove QUEUE never touches either.
          const before = sub(state)
          const isQueue =
            campaignAction.type === 'MISSION_ACTION' &&
            (campaignAction.payload as { kind?: string }).kind === 'QUEUE'
          const beforeBackup = before?.backupRemaining ?? null
          const beforeSends = before?.sends.length ?? null

          // Dispatch never throws: an invalid-shaped action is rejected by
          // the validator, surfaced as a rejection, and leaves state intact.
          const result = dispatch(ctx, state, campaignAction, now)
          settlementEvents.push(
            ...result.emitted.filter((e) => e.type === 'settlement'),
          )
          state = result.state

          const after = sub(state)
          if (after) {
            // Never negative backup capacity.
            expect(after.backupRemaining).toBeGreaterThanOrEqual(0)
            expect(after.backupRemaining).toBeLessThanOrEqual(CAPACITY)
          }

          // A successful QUEUE spends no capacity and logs no send.
          if (isQueue && !result.rejection && before && after) {
            expect(after.backupRemaining).toBe(beforeBackup)
            expect(after.sends.length).toBe(beforeSends)
          }

          // No send that routed a SUPERSEDED (stale) message id is ever a
          // satisfied required delivery, however the ack folds. Checked on
          // the live substate while the mission is still running.
          if (after && after.endsAt !== null) {
            for (const record of after.sends) {
              if (!SUPERSEDED_IDS.has(record.messageId)) continue
              const message = MESSAGE_BY_ID.get(record.messageId)!
              expect(isSatisfiedDelivery(record, message, after.endsAt)).toBe(false)
            }
          }
        }

        // Advance past the deadline so settlement always fires if it has not.
        const advanced = advanceCampaign(ctx, state, ENDS_AT + 10_000)
        settlementEvents.push(
          ...advanced.emitted.filter((e) => e.type === 'settlement'),
        )
        state = advanced.state

        // Exactly one settlement for the outlook mission, regardless of the
        // action tail.
        const outlookSettlements = settlementEvents.filter(
          (e) => e.type === 'settlement' && e.missionId === 'outlook',
        )
        expect(outlookSettlements).toHaveLength(1)
        expect(
          state.settled.filter((s) => s.missionId === 'outlook'),
        ).toHaveLength(1)

        // Satisfied required deliveries never exceed the three live heads,
        // and a run can only credit non-superseded versions (asserted per
        // step above against isSatisfiedDelivery).
        const outlook = state.settled.find((s) => s.missionId === 'outlook')!
        expect(outlook.metrics['required_delivered']!).toBeGreaterThanOrEqual(0)
        expect(outlook.metrics['required_delivered']!).toBeLessThanOrEqual(3)
      }),
      { numRuns: 200, seed: FC_SEED },
    )
  })
})
