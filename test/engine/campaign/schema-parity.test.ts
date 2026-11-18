import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { campaignStateSchema } from '@engine/campaign/state'
import type { CampaignState } from '@engine/campaign/state'
import type {
  AppliedMarker,
  CampaignPhase,
  Consequence,
  SettledOutcome,
  SourceCheckResult,
} from '@engine/campaign/types'

// Compile-time parity: the hand-authored interfaces in types.ts must
// stay mutually assignable with the schema-derived shapes, so the
// schema remains the source of truth and drift is a type error here.
type SchemaState = v.InferOutput<typeof campaignStateSchema>
type SchemaSettled = SchemaState['settled'][number]
type SchemaMarker = SchemaState['appliedConsequences'][number]
type SchemaCheck = SchemaState['sourceChecks'][number]
type SchemaConsequence = SchemaSettled['consequences'][number]
type SchemaPhase = SchemaState['phase']

type AssertMutual<A, B> = A extends B ? (B extends A ? true : never) : never

const settledParity: AssertMutual<SettledOutcome, SchemaSettled> = true
const markerParity: AssertMutual<AppliedMarker, SchemaMarker> = true
const checkParity: AssertMutual<SourceCheckResult, SchemaCheck> = true
const consequenceParity: AssertMutual<Consequence, SchemaConsequence> = true
const phaseParity: AssertMutual<CampaignPhase, SchemaPhase> = true
const stateParity: AssertMutual<CampaignState, SchemaState> = true

describe('schema-type parity', () => {
  it('hand interfaces and schema outputs are mutually assignable', () => {
    expect([
      settledParity,
      markerParity,
      checkParity,
      consequenceParity,
      phaseParity,
      stateParity,
    ]).toEqual([true, true, true, true, true, true])
  })
})
