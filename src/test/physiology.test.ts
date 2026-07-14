import { describe, expect, it } from 'vitest'
import { projectDoseResponse, projectMap, responseFraction, stepTowardTarget } from '../engine/physiology'

describe('physiology.projectDoseResponse', () => {
  it('scales linearly from 0 at dose 0 to the ceiling at maxDose', () => {
    expect(projectDoseResponse(0, 30, 10)).toBe(0)
    expect(projectDoseResponse(15, 30, 10)).toBe(5)
    expect(projectDoseResponse(30, 30, 10)).toBe(10)
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
