import { describe, expect, it } from 'vitest'
import { advance, isDocumentationCheckpointDue, isTitrationIntervalSatisfied, minutesElapsed } from '../engine/clock'

describe('clock.advance', () => {
  it('adds minutes forward', () => {
    expect(advance(10, 5)).toBe(15)
  })

  it('throws on a negative step', () => {
    expect(() => advance(10, -1)).toThrow(/backwards/i)
  })
})

describe('clock.minutesElapsed', () => {
  it('computes elapsed minutes', () => {
    expect(minutesElapsed(15, 10)).toBe(5)
    expect(minutesElapsed(10, 10)).toBe(0)
  })

  it('throws when currentMinute precedes sinceMinute', () => {
    expect(() => minutesElapsed(5, 10)).toThrow(/backwards/i)
  })
})

describe('clock.isTitrationIntervalSatisfied', () => {
  // Norepinephrine: titrate 0.5 mcg/min every 3-5 min.
  const interval = { minMinutes: 3, maxMinutes: 5 }

  it('is not satisfied before the minimum interval', () => {
    expect(isTitrationIntervalSatisfied(12, 10, interval)).toBe(false)
  })

  it('is satisfied exactly at the minimum interval', () => {
    expect(isTitrationIntervalSatisfied(13, 10, interval)).toBe(true)
  })

  it('remains satisfied well past the reassessment window (maxMinutes is not a cutoff)', () => {
    expect(isTitrationIntervalSatisfied(30, 10, interval)).toBe(true)
  })

  it('works for a single fixed interval with no maxMinutes (e.g. phenylephrine q5min)', () => {
    const fixed = { minMinutes: 5 }
    expect(isTitrationIntervalSatisfied(14, 10, fixed)).toBe(false)
    expect(isTitrationIntervalSatisfied(15, 10, fixed)).toBe(true)
  })
})

describe('clock.isDocumentationCheckpointDue', () => {
  it('initiation and preTitration are due immediately (event-triggered)', () => {
    expect(isDocumentationCheckpointDue('initiation', 42, 42)).toBe(true)
    expect(isDocumentationCheckpointDue('preTitration', 42, 42)).toBe(true)
  })

  it('plus30Start and plus30PostTitration require 30 elapsed minutes', () => {
    expect(isDocumentationCheckpointDue('plus30Start', 20, 0)).toBe(false)
    expect(isDocumentationCheckpointDue('plus30Start', 30, 0)).toBe(true)
    expect(isDocumentationCheckpointDue('plus30PostTitration', 59, 30)).toBe(false)
    expect(isDocumentationCheckpointDue('plus30PostTitration', 60, 30)).toBe(true)
  })
})
