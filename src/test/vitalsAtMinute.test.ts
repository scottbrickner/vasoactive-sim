import { describe, expect, it } from 'vitest'
import { vitalsAtMinute } from '../engine/vitalsAtMinute'
import type { VitalSigns } from '../state/types'

function vitals(overrides: Partial<VitalSigns> = {}): VitalSigns {
  return { hr: 90, sbp: 100, dbp: 60, map: 73, spo2: 96, rhythm: 'Sinus', ...overrides }
}

describe('vitalsAtMinute', () => {
  it('is null when vitalsHistory is empty', () => {
    expect(vitalsAtMinute([], 10)).toBeNull()
  })

  it('is null when minute is before the first recorded entry', () => {
    const history = [{ minute: 5, vitals: vitals() }]
    expect(vitalsAtMinute(history, 2)).toBeNull()
  })

  it('returns the exact-minute match', () => {
    const v10 = vitals({ map: 80 })
    const history = [{ minute: 5, vitals: vitals({ map: 70 }) }, { minute: 10, vitals: v10 }]
    expect(vitalsAtMinute(history, 10)).toEqual(v10)
  })

  it('returns the latest entry at or before minute when minute falls between two entries', () => {
    const v5 = vitals({ map: 70 })
    const history = [{ minute: 5, vitals: v5 }, { minute: 15, vitals: vitals({ map: 85 }) }]
    expect(vitalsAtMinute(history, 12)).toEqual(v5)
  })

  it('is unaffected by out-of-order input (picks the true latest by minute, not by array position)', () => {
    const vLatest = vitals({ map: 90 })
    const history = [
      { minute: 20, vitals: vLatest },
      { minute: 5, vitals: vitals({ map: 70 }) },
      { minute: 10, vitals: vitals({ map: 75 }) },
    ]
    expect(vitalsAtMinute(history, 25)).toEqual(vLatest)
  })
})
