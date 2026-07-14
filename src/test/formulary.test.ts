import { describe, expect, it } from 'vitest'
import { FORMULARY, FORMULARY_LIST, getDrug, resolveInfusionRate } from '../data/formulary'
import type { DrugId } from '../state/types'

const ALL_DRUG_IDS: DrugId[] = [
  'norepinephrine',
  'epinephrine',
  'phenylephrine',
  'dopamine',
  'dobutamine',
  'milrinone',
  'vasopressin',
]

describe('formulary', () => {
  it('parses all 7 Attachment B entries with a well-formed shape', () => {
    expect(FORMULARY_LIST).toHaveLength(7)
    for (const id of ALL_DRUG_IDS) {
      const drug = getDrug(id)
      expect(drug.id).toBe(id)
      expect(drug.name.length).toBeGreaterThan(0)
      expect(drug.genericName.length).toBeGreaterThan(0)
      expect(drug.concentration.amount).toBeGreaterThan(0)
      expect(drug.concentration.volumeMl).toBeGreaterThan(0)
      expect(drug.startDose).toBeGreaterThan(0)
      expect(drug.maxDose).toBeGreaterThan(drug.startDose)
      expect(drug.monitoring.length).toBeGreaterThan(0)
      if (drug.titrationIncrement != null) {
        expect(drug.titrationIncrement).toBeGreaterThan(0)
      }
      if (drug.titrationInterval != null) {
        expect(drug.titrationInterval.minMinutes).toBeGreaterThan(0)
      }
    }
  })

  it('marks exactly the mcg/kg/min drugs as weight-based', () => {
    const weightBased = FORMULARY_LIST.filter((d) => d.weightBased).map((d) => d.id).sort()
    expect(weightBased).toEqual(['dobutamine', 'dopamine', 'milrinone'])
    for (const drug of FORMULARY_LIST) {
      expect(drug.weightBased).toBe(drug.unit === 'mcg/kg/min')
    }
  })

  it('leaves increment/interval null exactly where Attachment B is silent', () => {
    // Epinephrine: increment defined (1 mcg/min), interval left to the order.
    expect(FORMULARY.epinephrine.titrationIncrement).toBe(1)
    expect(FORMULARY.epinephrine.titrationInterval).toBeNull()

    // Milrinone: Attachment B gives no titration guidance at all.
    expect(FORMULARY.milrinone.titrationIncrement).toBeNull()
    expect(FORMULARY.milrinone.titrationInterval).toBeNull()

    // Vasopressin (shock): increment defined, interval left to the order.
    expect(FORMULARY.vasopressin.titrationIncrement).toBe(0.01)
    expect(FORMULARY.vasopressin.titrationInterval).toBeNull()

    // Norepinephrine: fully defined, with a min-max interval range.
    expect(FORMULARY.norepinephrine.titrationInterval).toEqual({ minMinutes: 3, maxMinutes: 5 })
  })

  it('norepinephrine is NOT weight-based (dosed in mcg/min per CLAUDE.md)', () => {
    expect(FORMULARY.norepinephrine.weightBased).toBe(false)
    expect(FORMULARY.norepinephrine.unit).toBe('mcg/min')
  })
})

describe('resolveInfusionRate — weight-based dosing', () => {
  const weightKg = 68

  it('computes the absolute rate for weight-based drugs at the scenario weight', () => {
    expect(resolveInfusionRate(FORMULARY.dopamine, 2, weightKg)).toBeCloseTo(136)
    expect(resolveInfusionRate(FORMULARY.dobutamine, 2.5, weightKg)).toBeCloseTo(170)
    expect(resolveInfusionRate(FORMULARY.milrinone, 0.25, weightKg)).toBeCloseTo(17)
  })

  it('scales linearly with weight', () => {
    expect(resolveInfusionRate(FORMULARY.dopamine, 1, 50)).toBeCloseTo(50)
    expect(resolveInfusionRate(FORMULARY.dopamine, 1, 100)).toBeCloseTo(100)
  })

  it('returns fixed-rate doses unchanged, regardless of weight', () => {
    expect(resolveInfusionRate(FORMULARY.norepinephrine, 0.5, weightKg)).toBe(0.5)
    expect(resolveInfusionRate(FORMULARY.norepinephrine, 0.5)).toBe(0.5)
    expect(resolveInfusionRate(FORMULARY.vasopressin, 0.02, weightKg)).toBe(0.02)
  })

  it('throws for a weight-based drug when no weight is supplied', () => {
    expect(() => resolveInfusionRate(FORMULARY.dopamine, 2)).toThrow(/weight/i)
  })
})
