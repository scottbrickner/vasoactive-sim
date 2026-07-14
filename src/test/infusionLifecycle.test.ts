import { describe, expect, it } from 'vitest'
import {
  isBlockOverMaxDuration,
  isPastRemovalThreshold,
  isPastStableReviewThreshold,
  minutesStopped,
} from '../engine/infusionLifecycle'

describe('infusionLifecycle.minutesStopped', () => {
  it('computes elapsed minutes since the infusion was stopped', () => {
    expect(minutesStopped(150, 30)).toBe(120)
    expect(minutesStopped(30, 30)).toBe(0)
  })
})

describe('infusionLifecycle.isPastRemovalThreshold', () => {
  it('is false before 120 minutes stopped', () => {
    expect(isPastRemovalThreshold(100, 0)).toBe(false)
  })

  it('is true at and after 120 minutes stopped', () => {
    expect(isPastRemovalThreshold(120, 0)).toBe(true)
    expect(isPastRemovalThreshold(200, 0)).toBe(true)
  })
})

describe('infusionLifecycle.isPastStableReviewThreshold', () => {
  it('mirrors the same 120-minute threshold as a distinct policy trigger', () => {
    expect(isPastStableReviewThreshold(119, 0)).toBe(false)
    expect(isPastStableReviewThreshold(120, 0)).toBe(true)
  })
})

describe('infusionLifecycle.isBlockOverMaxDuration', () => {
  it('is false before 240 minutes elapsed', () => {
    expect(isBlockOverMaxDuration(0, 239)).toBe(false)
  })

  it('is true at and after 240 minutes elapsed', () => {
    expect(isBlockOverMaxDuration(0, 240)).toBe(true)
    expect(isBlockOverMaxDuration(60, 300)).toBe(true)
  })
})
