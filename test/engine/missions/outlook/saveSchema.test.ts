import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { outlookSaveSchema } from '@engine/missions/outlook/types'
import type { OutlookState } from '@engine/missions/outlook/types'

const populated: OutlookState = {
  messages: {
    M01: { read: true, flagged: false },
    M05: { read: true, flagged: true },
  },
  queue: [{ messageId: 'M07', channel: 'primary' }],
  sends: [
    {
      messageId: 'M01',
      channel: 'primary',
      recipient: 'WEATHER_DESK',
      currentVersion: true,
      sentAt: 1_000_000,
      scheduledAckAt: 1_030_000,
      resolution: 'acknowledged',
    },
    {
      messageId: 'M02',
      channel: 'backup',
      recipient: 'PAYROLL_DESK',
      currentVersion: false,
      sentAt: 1_005_000,
      scheduledAckAt: 1_095_000,
      resolution: 'pending',
    },
  ],
  primaryStage: 1,
  backupRemaining: 4,
  deliveredRequired: {
    weather: { delivered: true, correct: true },
    payroll: { delivered: false, correct: false },
    audit: { delivered: false, correct: false },
  },
  auditRead: true,
  auditDelivered: false,
  ackAsOf: 1_030_000,
}

describe('outlook saveSchema', () => {
  it('round-trips a populated substate through JSON and the schema', () => {
    const revived = v.parse(
      outlookSaveSchema,
      JSON.parse(JSON.stringify(populated)),
    )
    expect(revived).toEqual(populated)
  })

  it('rejects a smuggled message body in the substate', () => {
    const smuggled = {
      ...populated,
      messages: {
        ...populated.messages,
        M01: { read: true, flagged: false, body: ['SMUGGLED COPY'] },
      },
    }
    expect(() => v.parse(outlookSaveSchema, smuggled)).toThrow()
  })

  it('rejects a smuggled subject string anywhere in the substate', () => {
    expect(() =>
      v.parse(outlookSaveSchema, { ...populated, subject: 'STORM WARNING' }),
    ).toThrow()
  })

  it('rejects a send record carrying authored copy', () => {
    const smuggled = {
      ...populated,
      sends: [{ ...populated.sends[0], body: ['LEAK'] }],
    }
    expect(() => v.parse(outlookSaveSchema, smuggled)).toThrow()
  })

  it('rejects a non-integer counter', () => {
    expect(() =>
      v.parse(outlookSaveSchema, { ...populated, backupRemaining: 4.5 }),
    ).toThrow()
  })
})
