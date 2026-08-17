import { describe, expect, it } from 'vitest'
import {
  BLOCK_OF_CHARTING,
  DOCUMENTATION_CADENCE,
  DOCUMENTATION_PLACEMENT,
  MEDICATION_VERIFICATION,
  OFF_FOR_TWO_HOURS_RULE,
  RESTART_AFTER_PAUSE_RULE,
  SKILL_SIGNOFF_CRITERIA,
  STABLE_OFF_TWO_HOURS_RULE,
} from '../data/policy'
import type { DrugId } from '../state/types'

describe('policy constants (CP 4-156)', () => {
  it('has the 4-point documentation cadence in order', () => {
    expect(DOCUMENTATION_CADENCE.map((c) => c.point)).toEqual([
      'initiation',
      'plus30Start',
      'preTitration',
      'plus30PostTitration',
    ])
  })

  it('places Begin Bag, initial rate, and discontinuation in MAR; titrations in iView', () => {
    expect(DOCUMENTATION_PLACEMENT.beginBag).toBe('MAR')
    expect(DOCUMENTATION_PLACEMENT.initialRate).toBe('MAR')
    expect(DOCUMENTATION_PLACEMENT.titration).toBe('iView')
    expect(DOCUMENTATION_PLACEMENT.discontinuation).toBe('MAR')
  })

  it('requires an independent double-check only for fentanyl; every other DrugId (incl. dexmedetomidine/diltiazem) does not', () => {
    const allDrugIds: DrugId[] = [
      'norepinephrine',
      'epinephrine',
      'phenylephrine',
      'dopamine',
      'dobutamine',
      'milrinone',
      'vasopressin',
      'dexmedetomidine',
      'diltiazem',
      'fentanyl',
    ]
    for (const drugId of allDrugIds) {
      expect(MEDICATION_VERIFICATION[drugId]).toBeDefined()
      expect(MEDICATION_VERIFICATION[drugId].bcmaRequired).toBe(true)
      expect(MEDICATION_VERIFICATION[drugId].iTraceRequired).toBe(true)
      expect(MEDICATION_VERIFICATION[drugId].independentDoubleCheckRequired).toBe(drugId === 'fentanyl')
    }
  })

  it('defines the restart-after-pause and 2-hour rules', () => {
    expect(RESTART_AFTER_PAUSE_RULE.description).toMatch(/rate.*before the pause/i)
    expect(OFF_FOR_TWO_HOURS_RULE.thresholdMinutes).toBe(120)
    expect(STABLE_OFF_TWO_HOURS_RULE.thresholdMinutes).toBe(120)
  })

  it('lists the 7 required Block of Charting elements with a 4-hour max duration', () => {
    expect(BLOCK_OF_CHARTING.maxDurationMinutes).toBe(240)
    expect(BLOCK_OF_CHARTING.requiredElements).toHaveLength(7)
    expect(BLOCK_OF_CHARTING.requiredElements).toEqual(
      expect.arrayContaining([
        'Time of initiation',
        'Name of medication administered',
        'Physiological parameters evaluated',
      ]),
    )
  })

  it('defines the skill sign-off threshold (Phase 15) as a 90% bar with no missed category allowed', () => {
    expect(SKILL_SIGNOFF_CRITERIA.minOverallPercent).toBe(90)
    expect(SKILL_SIGNOFF_CRITERIA.requireNoMissedCategory).toBe(true)
  })
})
