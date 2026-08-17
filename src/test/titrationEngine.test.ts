import { describe, expect, it } from 'vitest'
import { deriveActivationText } from '../engine/activation'
import { computeMultiStepDoses, evaluateTitration, meetsTarget } from '../engine/titrationEngine'
import { DEFAULT_SCENARIO } from '../data/scenarios'
import type { Order, VitalSigns } from '../state/types'

const norepiOrder = DEFAULT_SCENARIO.orders.find((o) => o.drugId === 'norepinephrine')!
// `activatesWhen` isn't baked into the raw scenario data anymore — store.ts derives it at
// init time (see engine/activation.ts) — so populate it here the same way, matching what
// evaluateTitration actually receives at runtime.
const vasopressinOrder: Order = {
  ...DEFAULT_SCENARIO.orders.find((o) => o.drugId === 'vasopressin')!,
  activatesWhen: deriveActivationText(
    DEFAULT_SCENARIO.orders.find((o) => o.drugId === 'vasopressin')!,
    DEFAULT_SCENARIO.orders,
  ),
}

const belowTargetMap = 57 // scenario baseline; target is MAP >= 65
const atTargetMap = 65

/** A full VitalSigns fixture with just `map` overridden — every other field inert for these MAP-target tests. */
function vitalsWithMap(map: number): VitalSigns {
  return { ...DEFAULT_SCENARIO.startingVitals, map }
}
const belowTargetVitals = vitalsWithMap(belowTargetMap)
const atTargetVitals = vitalsWithMap(atTargetMap)

function base(overrides: Partial<Parameters<typeof evaluateTitration>[0]> = {}) {
  return evaluateTitration({
    action: 'titrate',
    order: norepiOrder,
    currentDose: 0.5,
    proposedDose: 1,
    currentMinute: 3,
    lastActionMinute: 0,
    vitals: belowTargetVitals,
    priorAgentActivationMet: true,
    priorAgentsWeaned: true,
    ...overrides,
  })
}

describe('titrationEngine — initiation', () => {
  it('ok when the entered dose matches the order start dose', () => {
    const result = evaluateTitration({
      action: 'initiate',
      order: norepiOrder,
      currentDose: 0,
      proposedDose: 0.5,
      currentMinute: 0,
      lastActionMinute: null,
      vitals: belowTargetVitals,
      priorAgentActivationMet: true,
      priorAgentsWeaned: true,
    })
    expect(result).toEqual({ status: 'ok', reasons: [], violations: {} })
  })

  it('off-order when the entered dose does not match the order start dose', () => {
    const result = evaluateTitration({
      action: 'initiate',
      order: norepiOrder,
      currentDose: 0,
      proposedDose: 1,
      currentMinute: 0,
      lastActionMinute: null,
      vitals: belowTargetVitals,
      priorAgentActivationMet: true,
      priorAgentsWeaned: true,
    })
    expect(result.status).toBe('off-order')
    expect(result.reasons[0]).toMatch(/starting dose is 0\.5/i)
    expect(result.violations).toEqual({ wrongStartDose: true })
  })
})

describe('titrationEngine — titration mechanics', () => {
  it('ok for a correctly timed, correctly incremented titration', () => {
    expect(base()).toEqual({ status: 'ok', reasons: [], violations: {} })
  })

  it('off-order when titrated sooner than the minimum interval', () => {
    const result = base({ currentMinute: 2 })
    expect(result.status).toBe('off-order')
    expect(result.reasons.some((r) => /interval/i.test(r))).toBe(true)
    expect(result.violations.intervalTooSoon).toBe(true)
  })

  it('remains ok when titrated later than the reassessment window (not a hard cutoff)', () => {
    const result = base({ currentMinute: 30 })
    expect(result.status).toBe('ok')
  })

  it('off-order when the increment does not match the order', () => {
    const result = base({ proposedDose: 2 }) // delta 1.5, ordered increment is 0.5
    expect(result.status).toBe('off-order')
    expect(result.reasons.some((r) => /increment/i.test(r))).toBe(true)
    expect(result.violations.wrongIncrement).toBe(true)
  })

  it('off-order when the proposed dose is zero or negative', () => {
    const zero = base({ proposedDose: 0 })
    expect(zero.status).toBe('off-order')
    expect(zero.violations).toEqual({ invalidDose: true })
    expect(base({ proposedDose: -0.5 }).status).toBe('off-order')
  })

  it('tolerates floating-point noise in the increment check (vasopressin 0.02 -> 0.03)', () => {
    const result = evaluateTitration({
      action: 'titrate',
      order: vasopressinOrder,
      currentDose: 0.02,
      proposedDose: 0.03,
      currentMinute: 30,
      lastActionMinute: 0,
      vitals: belowTargetVitals,
      priorAgentActivationMet: true,
      priorAgentsWeaned: true,
    })
    expect(result).toEqual({ status: 'ok', reasons: [], violations: {} })
  })
})

describe('titrationEngine — target', () => {
  it('off-order for further up-titration once the target is already met', () => {
    const result = base({ vitals: atTargetVitals })
    expect(result.status).toBe('off-order')
    expect(result.reasons.some((r) => /target already met/i.test(r))).toBe(true)
    expect(result.violations.targetAlreadyMet).toBe(true)
  })
})

describe('titrationEngine — max dose and provider notification', () => {
  it('needs-provider when the proposed dose exceeds the order max and target is unmet', () => {
    const result = base({ currentDose: 29.5, proposedDose: 30.5, vitals: belowTargetVitals })
    expect(result.status).toBe('needs-provider')
    expect(result.reasons[0]).toMatch(/exceeds the ordered maximum/i)
    expect(result.violations).toEqual({ exceedsOrderMax: true })
  })

  it('off-order (not needs-provider) when the proposed dose exceeds the order max but target is already met', () => {
    const result = base({ currentDose: 29.5, proposedDose: 30.5, vitals: atTargetVitals })
    expect(result.status).toBe('off-order')
    expect(result.violations).toEqual({ exceedsOrderMax: true })
  })
})

describe('titrationEngine — multi-agent sequence', () => {
  it('off-order to initiate a sequence > 1 agent before its activation condition is met', () => {
    const result = evaluateTitration({
      action: 'initiate',
      order: vasopressinOrder,
      currentDose: 0,
      proposedDose: 0.02,
      currentMinute: 0,
      lastActionMinute: null,
      vitals: belowTargetVitals,
      priorAgentActivationMet: false,
      priorAgentsWeaned: true,
    })
    expect(result.status).toBe('off-order')
    expect(result.reasons[0]).toBe(vasopressinOrder.activatesWhen)
    expect(result.violations).toEqual({ sequenceNotActivated: true })
  })

  it('ok to initiate a sequence > 1 agent once its activation condition is met', () => {
    const result = evaluateTitration({
      action: 'initiate',
      order: vasopressinOrder,
      currentDose: 0,
      proposedDose: 0.02,
      currentMinute: 0,
      lastActionMinute: null,
      vitals: belowTargetVitals,
      priorAgentActivationMet: true,
      priorAgentsWeaned: true,
    })
    expect(result).toEqual({ status: 'ok', reasons: [], violations: {} })
  })

  it('sequence 1 orders ignore priorAgentActivationMet', () => {
    const result: Order = norepiOrder
    expect(result.sequence).toBe(1)
    const evaluated = base({ priorAgentActivationMet: false })
    expect(evaluated.status).toBe('ok')
  })

  // Regression: the sequence-activation gate must never fire on a titrate, only an
  // initiate — otherwise an already-infusing sequence>1 agent becomes permanently
  // unblockable (including for down-titration) the instant its target is met and
  // priorAgentActivationMet's own targetUnmet condition flips false (see engine/
  // titrationEngine.ts's doc comment). Surfaced by the weaning scenario, where
  // sequence>1 agents are pre-seeded already-infusing with MAP already above target.
  it('does not gate a titrate on a sequence > 1 agent even when priorAgentActivationMet is false', () => {
    const result = evaluateTitration({
      action: 'titrate',
      order: vasopressinOrder,
      currentDose: 0.03,
      proposedDose: 0.02,
      currentMinute: 30,
      lastActionMinute: 0,
      vitals: atTargetVitals,
      priorAgentActivationMet: false,
      priorAgentsWeaned: true,
    })
    expect(result.status).toBe('ok')
  })
})

describe('titrationEngine — weaning order', () => {
  const weanOrder2: Order = { ...norepiOrder, weanOrder: 2 }
  const weanOrder1: Order = { ...norepiOrder, weanOrder: 1 }

  it('off-order to down-titrate an agent with weanOrder > 1 before priorAgentsWeaned', () => {
    const result = base({ order: weanOrder2, currentDose: 10, proposedDose: 9.5, priorAgentsWeaned: false })
    expect(result.status).toBe('off-order')
    expect(result.violations).toEqual({ wrongWeanOrder: true })
  })

  it('ok to down-titrate the same agent once priorAgentsWeaned is true', () => {
    const result = base({ order: weanOrder2, currentDose: 10, proposedDose: 9.5, priorAgentsWeaned: true })
    expect(result.status).toBe('ok')
  })

  it('does not gate an up-titration, even when priorAgentsWeaned is false', () => {
    const result = base({ order: weanOrder2, currentDose: 9.5, proposedDose: 10, priorAgentsWeaned: false })
    expect(result.status).toBe('ok')
  })

  it('weanOrder === 1 is never gated regardless of priorAgentsWeaned', () => {
    const result = base({ order: weanOrder1, currentDose: 10, proposedDose: 9.5, priorAgentsWeaned: false })
    expect(result.status).toBe('ok')
  })

  it('an order with no weanOrder is never gated', () => {
    // norepiOrder now carries a real weanOrder (Phase 18 scenario data) — strip it
    // explicitly here to test the true "no weanOrder requirement at all" case.
    const noWeanOrder: Order = { ...norepiOrder, weanOrder: undefined }
    const result = base({ order: noWeanOrder, currentDose: 10, proposedDose: 9.5, priorAgentsWeaned: false })
    expect(result.status).toBe('ok')
  })
})

// store.ts's early-notification-threshold detection reuses this exact comparator so the
// "crossed the threshold with target still unmet" check can never drift from the target-
// met check evaluateTitration itself uses (see engine/titrationEngine.ts's doc comment).
describe('titrationEngine — meetsTarget', () => {
  it('is false below the target value', () => {
    expect(meetsTarget(belowTargetMap, norepiOrder.target)).toBe(false)
  })

  it('is true at or above the target value', () => {
    expect(meetsTarget(atTargetMap, norepiOrder.target)).toBe(true)
    expect(meetsTarget(atTargetMap + 5, norepiOrder.target)).toBe(true)
  })
})

// runMultiStepTitration (state/store.ts) uses this exact plan for both the preview shown
// in TitrationCheckpointPanel and what actually gets applied, so the two can't drift apart.
describe('titrationEngine — computeMultiStepDoses', () => {
  it('produces a clean-increment step sequence toward the target', () => {
    const plan = computeMultiStepDoses(9, 0.5, 30, 10.5)
    expect(plan.doses).toEqual([9.5, 10, 10.5])
    expect(plan.wasSnappedDown).toBe(false)
  })

  it('snaps a non-aligned target down to the nearest reachable dose', () => {
    const plan = computeMultiStepDoses(8.5, 0.5, 30, 10.7)
    expect(plan.doses).toEqual([9, 9.5, 10, 10.5])
    expect(plan.wasSnappedDown).toBe(true)
  })

  it('returns an empty plan when the target equals the current dose (a no-op, either direction)', () => {
    expect(computeMultiStepDoses(9, 0.5, 30, 9).doses).toEqual([])
  })

  it('clamps to maxAllowedDose when the target exceeds it', () => {
    const plan = computeMultiStepDoses(29, 0.5, 30, 35)
    expect(plan.doses).toEqual([29.5, 30])
    expect(plan.wasSnappedDown).toBe(true)
  })

  it('returns an empty plan for non-finite or invalid input rather than crashing', () => {
    expect(computeMultiStepDoses(9, 0.5, 30, NaN).doses).toEqual([])
    expect(computeMultiStepDoses(9, 0.5, 30, -Infinity).doses).toEqual([])
    expect(computeMultiStepDoses(9, 0, 30, 15).doses).toEqual([])
  })

  it('handles the vasopressin float-precision case (0.02 -> 0.04 by 0.01)', () => {
    const plan = computeMultiStepDoses(0.02, 0.01, 0.04, 0.04)
    expect(plan.doses).toEqual([0.03, 0.04])
    expect(plan.wasSnappedDown).toBe(false)
  })
})

// Bidirectional since a user-reported bug: this mechanic was originally up-only and
// silently couldn't help a learner weaning a pressor DOWN (weaningSupport scenario).
// The downward branch mirrors the upward one above exactly — same fixtures, negated.
describe('titrationEngine — computeMultiStepDoses (downward/weaning plans)', () => {
  it('produces a clean-increment down-plan toward the target', () => {
    const plan = computeMultiStepDoses(10, 0.5, 30, 8.5)
    expect(plan.doses).toEqual([9.5, 9, 8.5])
    expect(plan.wasSnappedDown).toBe(false)
  })

  it('snaps a non-aligned downward target to the nearest reachable dose', () => {
    const plan = computeMultiStepDoses(10, 0.5, 30, 8.3)
    expect(plan.doses).toEqual([9.5, 9, 8.5])
    expect(plan.wasSnappedDown).toBe(true)
  })

  it('floors the down-plan at minAllowedDose rather than continuing toward a target below it', () => {
    const plan = computeMultiStepDoses(1, 0.5, 30, 0, 0.5)
    expect(plan.doses).toEqual([0.5])
    expect(plan.wasSnappedDown).toBe(true)
  })

  it('defaults minAllowedDose to 0 when omitted (a non-weaning order can be planned all the way down)', () => {
    const plan = computeMultiStepDoses(1, 0.5, 30, 0)
    expect(plan.doses).toEqual([0.5, 0])
    expect(plan.wasSnappedDown).toBe(false)
  })

  it('a target already at or above the current dose is the upward/no-op case, not a downward plan', () => {
    expect(computeMultiStepDoses(9, 0.5, 30, 9).doses).toEqual([])
    expect(computeMultiStepDoses(9, 0.5, 30, 10).doses).toEqual([9.5, 10])
  })
})
