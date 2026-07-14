import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO, SCENARIOS } from '../data/scenarios'
import { FORMULARY } from '../data/formulary'

describe('first scenario — neutropenic septic shock', () => {
  it('is registered and set as the default', () => {
    expect(SCENARIOS[DEFAULT_SCENARIO.id]).toBe(DEFAULT_SCENARIO)
  })

  it('matches the CLINICAL_SPEC.md worked example patient and starting vitals', () => {
    expect(DEFAULT_SCENARIO.patient).toEqual({ ageYears: 55, sex: 'female', weightKg: 68 })
    expect(DEFAULT_SCENARIO.startingVitals.map).toBe(57)
    expect(DEFAULT_SCENARIO.startingVitals.hr).toBe(118)
  })

  it('hangs norepinephrine with Begin Bag incomplete and rate stopped', () => {
    const infusion = DEFAULT_SCENARIO.initialInfusion
    expect(infusion.drugId).toBe('norepinephrine')
    expect(infusion.status).toBe('hanging')
    expect(infusion.beginBagCompleted).toBe(false)
    expect(infusion.rate).toBe(0)
  })

  it('orders agent 1 (norepinephrine) matching the Attachment B default exactly', () => {
    const order = DEFAULT_SCENARIO.orders.find((o) => o.sequence === 1)!
    const drug = FORMULARY[order.drugId]
    expect(order.startDose).toBe(drug.startDose)
    expect(order.increment).toBe(drug.titrationIncrement)
    expect(order.interval).toEqual(drug.titrationInterval)
    expect(order.maxDose).toBe(drug.maxDose)
    expect(order.target).toEqual({ metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' })
  })

  it('orders agent 2 (vasopressin) to activate only once agent 1 is maxed and MAP is still low', () => {
    const order = DEFAULT_SCENARIO.orders.find((o) => o.sequence === 2)!
    expect(order.drugId).toBe('vasopressin')
    expect(order.activatesWhen).toMatch(/norepinephrine/i)
    expect(order.activatesWhen).toMatch(/30 mcg\/min/)
  })

  it('the initial infusion references a real order in the scenario', () => {
    const orderIds = new Set(DEFAULT_SCENARIO.orders.map((o) => o.id))
    expect(orderIds.has(DEFAULT_SCENARIO.initialInfusion.orderId)).toBe(true)
  })
})
