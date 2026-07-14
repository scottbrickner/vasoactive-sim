import { describe, expect, it } from 'vitest'
import { checkCadence, correctLocationFor, isCorrectlyPlaced } from '../engine/documentation'

describe('documentation.correctLocationFor', () => {
  it('places Begin Bag, initial rate, and discontinuation in MAR', () => {
    expect(correctLocationFor('beginBag')).toBe('MAR')
    expect(correctLocationFor('initialRate')).toBe('MAR')
    expect(correctLocationFor('discontinuation')).toBe('MAR')
  })

  it('places titrations in iView', () => {
    expect(correctLocationFor('titration')).toBe('iView')
  })
})

describe('documentation.isCorrectlyPlaced', () => {
  it('is true when the location matches CP 4-156 placement', () => {
    expect(isCorrectlyPlaced('beginBag', 'MAR')).toBe(true)
    expect(isCorrectlyPlaced('titration', 'iView')).toBe(true)
  })

  it('is false when the location does not match', () => {
    expect(isCorrectlyPlaced('beginBag', 'iView')).toBe(false)
    expect(isCorrectlyPlaced('titration', 'MAR')).toBe(false)
  })
})

describe('documentation.checkCadence', () => {
  it('all 4 checkpoints met for a single titration, charted right on time', () => {
    // Initiate at 0, chart at 0 (initiation); chart at 30 (+30 start); titrate at 40,
    // charted at 35 (pre-titration, since 35 is after minute 0 and at/before 40); chart
    // at 70 (+30 post-titration, >= 40+30).
    const checks = checkCadence(0, [40], [0, 30, 35, 70])
    expect(checks.every((c) => c.met)).toBe(true)
    expect(checks.map((c) => c.point)).toEqual(['initiation', 'plus30Start', 'preTitration', 'plus30PostTitration'])
  })

  it('flags a missed initiation checkpoint (no charting at minute 0)', () => {
    const checks = checkCadence(0, [], [5])
    const initiation = checks.find((c) => c.point === 'initiation')!
    expect(initiation.met).toBe(false)
  })

  it('flags a missed +30-start checkpoint when nothing is charted after +30', () => {
    const checks = checkCadence(0, [], [0, 20])
    const plus30 = checks.find((c) => c.point === 'plus30Start')!
    expect(plus30.met).toBe(false)
  })

  it('flags a missed pre-titration checkpoint when nothing was charted since the last event', () => {
    // Charted at 0 (satisfies initiation) then titrated at 40 with no charting in between.
    const checks = checkCadence(0, [40], [0])
    const preTitration = checks.find((c) => c.point === 'preTitration')!
    expect(preTitration.met).toBe(false)
  })

  it('does not credit a stale chart entry from before the previous titration for a later pre-titration check', () => {
    // Two titrations at 10 and 40; charted once at 5 (before titration 1) but nothing
    // charted between titration 1 (10) and titration 2 (40).
    const checks = checkCadence(0, [10, 40], [5])
    const pre1 = checks.find((c) => c.point === 'preTitration' && c.titrationIndex === 1)!
    const pre2 = checks.find((c) => c.point === 'preTitration' && c.titrationIndex === 2)!
    expect(pre1.met).toBe(true)
    expect(pre2.met).toBe(false)
  })

  it('produces a preTitration/plus30PostTitration pair per titration, in order', () => {
    const checks = checkCadence(0, [10, 40], [0, 10, 40, 70])
    expect(checks.map((c) => `${c.point}${c.titrationIndex ?? ''}`)).toEqual([
      'initiation',
      'plus30Start',
      'preTitration1',
      'plus30PostTitration1',
      'preTitration2',
      'plus30PostTitration2',
    ])
  })
})
