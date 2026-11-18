import { describe, expect, it } from 'vitest'
import {
  channelAckAt,
  countSatisfiedDeliveries,
  isAcknowledgedWrongDesk,
  isSatisfiedDelivery,
  tierFromSatisfied,
  validateSend,
} from '@engine/missions/outlook/rules'
import type { ChannelTuning } from '@engine/missions/outlook/content'
import type {
  OutlookMessage,
  SendRecord,
} from '@engine/missions/outlook/types'

const TUNING: ChannelTuning = {
  backupCapacity: 5,
  primaryEtaSeconds: [30, 90],
  backupEtaSeconds: 120,
}

const weatherMsg: OutlookMessage = {
  id: 'M01',
  from: 'NODE 7',
  to: null,
  subject: 'STORM',
  body: ['EVIDENCE'],
  recordId: 'W02',
  requiredKind: 'weather',
  correctRecipient: 'WEATHER_DESK',
  supersededBy: null,
}

const supersededMsg: OutlookMessage = {
  ...weatherMsg,
  id: 'M02',
  requiredKind: 'weather',
  supersededBy: 'M01',
}

function send(overrides: Partial<SendRecord>): SendRecord {
  return {
    messageId: 'M01',
    channel: 'primary',
    recipient: 'WEATHER_DESK',
    currentVersion: true,
    sentAt: 1_000_000,
    scheduledAckAt: 1_030_000,
    resolution: 'acknowledged',
    ...overrides,
  }
}

describe('validateSend: stage and capacity', () => {
  it('primary send at stage 0 is free and legal', () => {
    expect(validateSend(0, 'primary', 5)).toEqual({ ok: true })
  })

  it('primary send at stage 1 is free and legal', () => {
    expect(validateSend(1, 'primary', 5)).toEqual({ ok: true })
  })

  it('primary send at stage 2 rejects with a reason and costs nothing', () => {
    const result = validateSend(2, 'primary', 5)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0)
  })

  it('backup send spends one of five capacity', () => {
    expect(validateSend(0, 'backup', 5)).toEqual({ ok: true })
  })

  it('backup send with zero capacity rejects', () => {
    const result = validateSend(0, 'backup', 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0)
  })

  it('backup remains usable at dark primary stage 2', () => {
    expect(validateSend(2, 'backup', 3)).toEqual({ ok: true })
  })
})

describe('channelAckAt: ETA per stage at dispatch time', () => {
  it('primary stage 0 uses the fast ETA', () => {
    expect(channelAckAt(1_000_000, 0, 'primary', TUNING)).toBe(1_030_000)
  })

  it('primary stage 1 uses the slowed ETA', () => {
    expect(channelAckAt(1_000_000, 1, 'primary', TUNING)).toBe(1_090_000)
  })

  it('backup uses the constant backup ETA regardless of stage', () => {
    expect(channelAckAt(1_000_000, 0, 'backup', TUNING)).toBe(1_120_000)
    expect(channelAckAt(1_000_000, 1, 'backup', TUNING)).toBe(1_120_000)
  })
})

describe('isSatisfiedDelivery: supersession, recipient, ack timing', () => {
  const endsAt = 1_200_000

  it('a current version to the correct desk acked before endsAt satisfies', () => {
    expect(
      isSatisfiedDelivery(send({}), weatherMsg, endsAt),
    ).toBe(true)
  })

  it('an ack scheduled exactly at endsAt still satisfies (buzzer)', () => {
    expect(
      isSatisfiedDelivery(send({ scheduledAckAt: endsAt }), weatherMsg, endsAt),
    ).toBe(true)
  })

  it('an ack scheduled after endsAt does not satisfy', () => {
    expect(
      isSatisfiedDelivery(
        send({ scheduledAckAt: endsAt + 1 }),
        weatherMsg,
        endsAt,
      ),
    ).toBe(false)
  })

  it('wrong recipient spends but does not satisfy', () => {
    expect(
      isSatisfiedDelivery(
        send({ recipient: 'PAYROLL_DESK' }),
        weatherMsg,
        endsAt,
      ),
    ).toBe(false)
  })

  it('a superseded message never satisfies regardless of recipient', () => {
    expect(
      isSatisfiedDelivery(
        send({ messageId: 'M02', currentVersion: false }),
        supersededMsg,
        endsAt,
      ),
    ).toBe(false)
  })

  it('a pending send does NOT satisfy until its ack has folded', () => {
    expect(
      isSatisfiedDelivery(send({ resolution: 'pending' }), weatherMsg, endsAt),
    ).toBe(false)
  })

  it('a rejected send never satisfies', () => {
    expect(
      isSatisfiedDelivery(send({ resolution: 'rejected' }), weatherMsg, endsAt),
    ).toBe(false)
  })
})

describe('isAcknowledgedWrongDesk', () => {
  const endsAt = 1_200_000

  it('an acknowledged ack to the wrong desk reads as wrong-desk, not satisfied', () => {
    const wrong = send({ recipient: 'PAYROLL_DESK', resolution: 'acknowledged' })
    expect(isAcknowledgedWrongDesk(wrong, weatherMsg, endsAt)).toBe(true)
    expect(isSatisfiedDelivery(wrong, weatherMsg, endsAt)).toBe(false)
  })

  it('a correct acknowledged ack is not a wrong-desk delivery', () => {
    expect(
      isAcknowledgedWrongDesk(send({ resolution: 'acknowledged' }), weatherMsg, endsAt),
    ).toBe(false)
  })

  it('a pending wrong-desk send is not a wrong-desk delivery until it folds', () => {
    expect(
      isAcknowledgedWrongDesk(
        send({ recipient: 'PAYROLL_DESK', resolution: 'pending' }),
        weatherMsg,
        endsAt,
      ),
    ).toBe(false)
  })
})

describe('tiering', () => {
  it('maps satisfied count to the tier ladder', () => {
    expect(tierFromSatisfied(3)).toBe('full')
    expect(tierFromSatisfied(2)).toBe('partial')
    expect(tierFromSatisfied(1)).toBe('poor')
    expect(tierFromSatisfied(0)).toBe('failed')
  })

  it('counts satisfied required deliveries across the send log', () => {
    const payloadMessages: OutlookMessage[] = [
      weatherMsg,
      {
        ...weatherMsg,
        id: 'M03',
        requiredKind: 'payroll',
        correctRecipient: 'PAYROLL_DESK',
      },
    ]
    const sends: SendRecord[] = [
      send({}),
      send({
        messageId: 'M03',
        recipient: 'PAYROLL_DESK',
        scheduledAckAt: 1_040_000,
      }),
    ]
    expect(
      countSatisfiedDeliveries(sends, payloadMessages, 1_200_000),
    ).toBe(2)
  })
})
