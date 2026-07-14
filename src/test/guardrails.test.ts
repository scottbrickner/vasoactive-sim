import { describe, expect, it } from 'vitest'
import { evaluateDose, limitsFromOrder } from '../engine/guardrails'
import { FORMULARY } from '../data/formulary'
import { DEFAULT_SCENARIO } from '../data/scenarios'

const norepiOrder = DEFAULT_SCENARIO.orders.find((o) => o.drugId === 'norepinephrine')!
const norepiDrug = FORMULARY.norepinephrine
const norepiLimits = limitsFromOrder(norepiOrder, norepiDrug)

describe('guardrails.limitsFromOrder', () => {
  it('derives hard limits from the drug and soft limits from the order', () => {
    expect(norepiLimits).toEqual({ hardMin: 0, hardMax: 30, softMin: 0.5, softMax: 30 })
  })
})

describe('guardrails.evaluateDose', () => {
  it('is withinLimits for a dose inside the order range', () => {
    expect(evaluateDose(5, norepiLimits).status).toBe('withinLimits')
    expect(evaluateDose(norepiLimits.softMin, norepiLimits).status).toBe('withinLimits')
    expect(evaluateDose(norepiLimits.softMax, norepiLimits).status).toBe('withinLimits')
  })

  it('is hardLimitBlocked below zero or above the drug maximum', () => {
    expect(evaluateDose(-1, norepiLimits).status).toBe('hardLimitBlocked')
    expect(evaluateDose(31, norepiLimits).status).toBe('hardLimitBlocked')
  })

  it('is softLimitOverride below the order start dose but still >= 0', () => {
    // A custom drug/order where the pump's hard ceiling exceeds the order's own max,
    // e.g. a prescriber-limited order below Attachment B's default maximum.
    const limits = { hardMin: 0, hardMax: 40, softMin: 2.5, softMax: 20 }
    expect(evaluateDose(1, limits).status).toBe('softLimitOverride')
    expect(evaluateDose(25, limits).status).toBe('softLimitOverride')
    expect(evaluateDose(0, limits).status).toBe('softLimitOverride')
  })

  it('vasopressin: withinLimits at the shock-order bounds, hardLimitBlocked beyond the drug max', () => {
    const order = DEFAULT_SCENARIO.orders.find((o) => o.drugId === 'vasopressin')!
    const limits = limitsFromOrder(order, FORMULARY.vasopressin)
    expect(evaluateDose(0.02, limits).status).toBe('withinLimits')
    expect(evaluateDose(0.04, limits).status).toBe('withinLimits')
    expect(evaluateDose(0.05, limits).status).toBe('hardLimitBlocked')
  })
})
