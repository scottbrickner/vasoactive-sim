import { describe, expect, it } from 'vitest'
import { deriveActivationText } from '../engine/activation'
import { evaluateTitration, meetsTarget } from '../engine/titrationEngine'
import { DEFAULT_SCENARIO } from '../data/scenarios'
import type { Order } from '../state/types'

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

function base(overrides: Partial<Parameters<typeof evaluateTitration>[0]> = {}) {
  return evaluateTitration({
    action: 'titrate',
    order: norepiOrder,
    currentDose: 0.5,
    proposedDose: 1,
    currentMinute: 3,
    lastActionMinute: 0,
    currentMap: belowTargetMap,
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
      currentMap: belowTargetMap,
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
      currentMap: belowTargetMap,
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
      currentMap: belowTargetMap,
      priorAgentActivationMet: true,
      priorAgentsWeaned: true,
    })
    expect(result).toEqual({ status: 'ok', reasons: [], violations: {} })
  })
})

describe('titrationEngine — target', () => {
  it('off-order for further up-titration once the target is already met', () => {
    const result = base({ currentMap: atTargetMap })
    expect(result.status).toBe('off-order')
    expect(result.reasons.some((r) => /target already met/i.test(r))).toBe(true)
    expect(result.violations.targetAlreadyMet).toBe(true)
  })
})

describe('titrationEngine — max dose and provider notification', () => {
  it('needs-provider when the proposed dose exceeds the order max and target is unmet', () => {
    const result = base({ currentDose: 29.5, proposedDose: 30.5, currentMap: belowTargetMap })
    expect(result.status).toBe('needs-provider')
    expect(result.reasons[0]).toMatch(/exceeds the ordered maximum/i)
    expect(result.violations).toEqual({ exceedsOrderMax: true })
  })

  it('off-order (not needs-provider) when the proposed dose exceeds the order max but target is already met', () => {
    const result = base({ currentDose: 29.5, proposedDose: 30.5, currentMap: atTargetMap })
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
      currentMap: belowTargetMap,
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
      currentMap: belowTargetMap,
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
    const result = base({ currentDose: 10, proposedDose: 9.5, priorAgentsWeaned: false })
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
