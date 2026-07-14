import { describe, expect, it } from 'vitest'
import {
  BLOCK_OF_CHARTING,
  DOCUMENTATION_CADENCE,
  DOCUMENTATION_PLACEMENT,
  MEDICATION_VERIFICATION,
  OFF_FOR_TWO_HOURS_RULE,
  RESTART_AFTER_PAUSE_RULE,
  STABLE_OFF_TWO_HOURS_RULE,
} from '../data/policy'

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

  it('does not require an independent double-check, but does require BCMA/I-TRACE at initiation and every titration', () => {
    expect(MEDICATION_VERIFICATION.independentDoubleCheckRequired).toBe(false)
    expect(MEDICATION_VERIFICATION.bcmaRequired).toBe(true)
    expect(MEDICATION_VERIFICATION.iTraceRequired).toBe(true)
    expect(MEDICATION_VERIFICATION.appliesTo).toEqual(['initiation', 'titration'])
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
})
