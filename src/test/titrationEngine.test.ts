import { describe, expect, it } from 'vitest'
import { evaluateTitration } from '../engine/titrationEngine'
import { DEFAULT_SCENARIO } from '../data/scenarios'
import type { Order } from '../state/types'

const norepiOrder = DEFAULT_SCENARIO.orders.find((o) => o.drugId === 'norepinephrine')!
const vasopressinOrder = DEFAULT_SCENARIO.orders.find((o) => o.drugId === 'vasopressin')!

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
    })
    expect(result).toEqual({ status: 'ok', reasons: [] })
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
    })
    expect(result.status).toBe('off-order')
    expect(result.reasons[0]).toMatch(/starting dose is 0\.5/i)
  })
})

describe('titrationEngine — titration mechanics', () => {
  it('ok for a correctly timed, correctly incremented titration', () => {
    expect(base()).toEqual({ status: 'ok', reasons: [] })
  })

  it('off-order when titrated sooner than the minimum interval', () => {
    const result = base({ currentMinute: 2 })
    expect(result.status).toBe('off-order')
    expect(result.reasons.some((r) => /interval/i.test(r))).toBe(true)
  })

  it('remains ok when titrated later than the reassessment window (not a hard cutoff)', () => {
    const result = base({ currentMinute: 30 })
    expect(result.status).toBe('ok')
  })

  it('off-order when the increment does not match the order', () => {
    const result = base({ proposedDose: 2 }) // delta 1.5, ordered increment is 0.5
    expect(result.status).toBe('off-order')
    expect(result.reasons.some((r) => /increment/i.test(r))).toBe(true)
  })

  it('off-order when the proposed dose is zero or negative', () => {
    expect(base({ proposedDose: 0 }).status).toBe('off-order')
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
    })
    expect(result).toEqual({ status: 'ok', reasons: [] })
  })
})

describe('titrationEngine — target', () => {
  it('off-order for further up-titration once the target is already met', () => {
    const result = base({ currentMap: atTargetMap })
    expect(result.status).toBe('off-order')
    expect(result.reasons.some((r) => /target already met/i.test(r))).toBe(true)
  })
})

describe('titrationEngine — max dose and provider notification', () => {
  it('needs-provider when the proposed dose exceeds the order max and target is unmet', () => {
    const result = base({ currentDose: 29.5, proposedDose: 30.5, currentMap: belowTargetMap })
    expect(result.status).toBe('needs-provider')
    expect(result.reasons[0]).toMatch(/exceeds the ordered maximum/i)
  })

  it('off-order (not needs-provider) when the proposed dose exceeds the order max but target is already met', () => {
    const result = base({ currentDose: 29.5, proposedDose: 30.5, currentMap: atTargetMap })
    expect(result.status).toBe('off-order')
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
    })
    expect(result.status).toBe('off-order')
    expect(result.reasons[0]).toBe(vasopressinOrder.activatesWhen)
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
    })
    expect(result).toEqual({ status: 'ok', reasons: [] })
  })

  it('sequence 1 orders ignore priorAgentActivationMet', () => {
    const result: Order = norepiOrder
    expect(result.sequence).toBe(1)
    const evaluated = base({ priorAgentActivationMet: false })
    expect(evaluated.status).toBe('ok')
  })
})
