import { describe, expect, it } from 'vitest'
import { correctLocationFor, isCorrectlyPlaced } from '../engine/documentation'

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
