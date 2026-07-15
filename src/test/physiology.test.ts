import { describe, expect, it } from 'vitest'
import {
  accumulateDeterioration,
  deriveBloodPressure,
  periodicVariability,
  projectDoseResponse,
  projectMap,
  responseFraction,
  stepTowardTarget,
} from '../engine/physiology'

describe('physiology.projectDoseResponse', () => {
  it('scales via sqrt(fraction) from 0 at dose 0 to the ceiling at maxDose', () => {
    expect(projectDoseResponse(0, 30, 10)).toBe(0)
    expect(projectDoseResponse(15, 30, 10)).toBeCloseTo(Math.sqrt(0.5) * 10) // ≈ 7.07
    expect(projectDoseResponse(30, 30, 10)).toBe(10)
  })

  it('is more responsive at low doses than a straight line would be', () => {
    // At 3/30 (10% of max), sqrt(0.1) ≈ 0.316 — over 3x the linear contribution at
    // that point (0.1 * 10 = 1) — this is what keeps early titrations from rounding
    // to zero on the monitor.
    const lowDoseContribution = projectDoseResponse(3, 30, 10)
    const linearEquivalent = (3 / 30) * 10
    expect(lowDoseContribution).toBeGreaterThan(linearEquivalent * 3)
  })

  it('clamps doses outside [0, maxDose]', () => {
    expect(projectDoseResponse(-5, 30, 10)).toBe(0)
    expect(projectDoseResponse(45, 30, 10)).toBe(10)
  })
})

describe('physiology.projectMap', () => {
  it('sums baseline plus every active agent contribution', () => {
    expect(projectMap(57, [5])).toBe(62)
    expect(projectMap(57, [5, 6])).toBe(68)
    expect(projectMap(57, [])).toBe(57)
  })
})

describe('physiology.responseFraction', () => {
  const lag = { minMinutes: 2, maxMinutes: 5 } // scenario response lag: 2-5 min

  it('is 0 before the lag has begun to settle', () => {
    expect(responseFraction(0, lag)).toBe(0)
    expect(responseFraction(2, lag)).toBe(0)
  })

  it('interpolates linearly between minMinutes and maxMinutes', () => {
    expect(responseFraction(3.5, lag)).toBeCloseTo(0.5)
  })

  it('is 1 at and after maxMinutes', () => {
    expect(responseFraction(5, lag)).toBe(1)
    expect(responseFraction(30, lag)).toBe(1)
  })

  it('settles immediately at minMinutes when the lag has no range', () => {
    const fixedLag = { minMinutes: 3 }
    expect(responseFraction(2, fixedLag)).toBe(0)
    expect(responseFraction(3, fixedLag)).toBe(1)
  })
})

describe('physiology.stepTowardTarget', () => {
  it('stays at currentMap when fraction is 0', () => {
    expect(stepTowardTarget(57, 65, 0)).toBe(57)
  })

  it('reaches projectedMap when fraction is 1', () => {
    expect(stepTowardTarget(57, 65, 1)).toBe(65)
  })

  it('interpolates and rounds at partial fractions', () => {
    expect(stepTowardTarget(57, 65, 0.5)).toBe(61)
  })

  it('clamps fractions outside [0, 1]', () => {
    expect(stepTowardTarget(57, 65, -1)).toBe(57)
    expect(stepTowardTarget(57, 65, 2)).toBe(65)
  })
})

describe('physiology — scenario narrative: norepi alone is insufficient, vasopressin closes the gap', () => {
  // Illustrative response ceilings for the worked scenario (57 -> target 65). Norepi
  // alone, even at its ordered max, is deliberately tuned to fall short of target —
  // this is what drives the need for agent 2, exactly as CLINICAL_SPEC.md describes.
  const baselineMap = 57
  const norepiCeiling = 5 // MAP contribution at norepi's max (30 mcg/min)
  const vasopressinCeiling = 6 // MAP contribution at vasopressin's max (0.04 units/min)

  it('norepinephrine at its ordered maximum, fully responded, still leaves MAP below target', () => {
    const contribution = projectDoseResponse(30, 30, norepiCeiling)
    const projected = projectMap(baselineMap, [contribution])
    const settled = stepTowardTarget(baselineMap, projected, 1)
    expect(settled).toBeLessThan(65)
  })

  it('adding vasopressin at max closes the gap to target', () => {
    const norepiContribution = projectDoseResponse(30, 30, norepiCeiling)
    const vasopressinContribution = projectDoseResponse(0.04, 0.04, vasopressinCeiling)
    const projected = projectMap(baselineMap, [norepiContribution, vasopressinContribution])
    const settled = stepTowardTarget(baselineMap, projected, 1)
    expect(settled).toBeGreaterThanOrEqual(65)
  })

  it('an under-dose yields a proportionally inadequate response, not an instant jump to target', () => {
    const contribution = projectDoseResponse(10, 30, norepiCeiling) // 1/3 of the way to max
    const projected = projectMap(baselineMap, [contribution])
    const settled = stepTowardTarget(baselineMap, projected, 1)
    expect(settled).toBeGreaterThan(baselineMap)
    expect(settled).toBeLessThan(65)
  })
})

describe('physiology.deriveBloodPressure', () => {
  const startingVitals = { hr: 118, sbp: 80, dbp: 46, map: 57, spo2: 96, rhythm: 'Sinus tachycardia' }

  it('reproduces the starting SBP/DBP when MAP is unchanged', () => {
    expect(deriveBloodPressure(57, startingVitals)).toEqual({ sbp: 80, dbp: 46 })
  })

  it('shifts both SBP and DBP up as MAP improves, holding pulse pressure constant', () => {
    const { sbp, dbp } = deriveBloodPressure(65, startingVitals)
    expect(sbp).toBeGreaterThan(80)
    expect(dbp).toBeGreaterThan(46)
    expect(sbp - dbp).toBe(80 - 46) // pulse pressure unchanged
  })

  it('shifts both down as MAP worsens', () => {
    const { sbp, dbp } = deriveBloodPressure(50, startingVitals)
    expect(sbp).toBeLessThan(80)
    expect(dbp).toBeLessThan(46)
  })
})

describe('physiology.accumulateDeterioration', () => {
  it('accrues proportionally to elapsed minutes', () => {
    expect(accumulateDeterioration(0, 5, 0.5, 15)).toBe(2.5)
    expect(accumulateDeterioration(2.5, 5, 0.5, 15)).toBe(5)
  })

  it('does not accrue further when elapsed is 0 (the caller freezes it this way once treated)', () => {
    expect(accumulateDeterioration(5, 0, 0.5, 15)).toBe(5)
  })

  it('caps at maxDrop, never exceeding it regardless of elapsed time', () => {
    expect(accumulateDeterioration(0, 1000, 0.5, 15)).toBe(15)
    expect(accumulateDeterioration(14, 100, 0.5, 15)).toBe(15)
  })
})

describe('physiology.periodicVariability', () => {
  it('is zero at minute + phaseOffset === 0', () => {
    expect(periodicVariability(0, 2.5, 7)).toBe(0)
    expect(periodicVariability(-3, 4, 11, 3)).toBeCloseTo(0)
  })

  it('never exceeds the given amplitude in either direction', () => {
    for (let minute = 0; minute < 50; minute++) {
      const v = periodicVariability(minute, 2.5, 7)
      expect(v).toBeGreaterThanOrEqual(-2.5)
      expect(v).toBeLessThanOrEqual(2.5)
    }
  })

  it('is periodic — repeats exactly one full period later', () => {
    expect(periodicVariability(3, 2.5, 7)).toBeCloseTo(periodicVariability(10, 2.5, 7))
  })

  it('is deterministic — same inputs always produce the same output', () => {
    expect(periodicVariability(17, 4, 11, 3)).toBe(periodicVariability(17, 4, 11, 3))
  })

  it('is exactly repeatable across the same call — not Math.random-based', () => {
    const a = periodicVariability(5, 2.5, 7)
    const b = periodicVariability(5, 2.5, 7)
    const c = periodicVariability(5, 2.5, 7)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})
