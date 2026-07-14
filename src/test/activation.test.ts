import { describe, expect, it } from 'vitest'
import { deriveActivationText } from '../engine/activation'
import type { Order } from '../state/types'

const norepiOrder: Order = {
  id: 'order-norepi',
  drugId: 'norepinephrine',
  sequence: 1,
  startDose: 0.5,
  maxDose: 30,
  increment: 0.5,
  interval: { minMinutes: 3, maxMinutes: 5 },
  target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
}

function vasoOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-vaso',
    drugId: 'vasopressin',
    sequence: 2,
    startDose: 0.02,
    maxDose: 0.04,
    increment: 0.01,
    interval: { minMinutes: 30 },
    target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
    ...overrides,
  }
}

describe('deriveActivationText', () => {
  it('returns undefined for a sequence-1 order — nothing to activate', () => {
    expect(deriveActivationText(norepiOrder, [norepiOrder])).toBeUndefined()
  })

  it('falls back to "at its ordered maximum" when activationThreshold is omitted', () => {
    const order = vasoOrder()
    const text = deriveActivationText(order, [norepiOrder, order])
    expect(text).toMatch(/at its ordered maximum \(30 mcg\/min\)/)
    expect(text).toMatch(/MAP still < 65 mmHg/)
  })

  it('describes a fractional threshold as a dose and a percentage', () => {
    const order = vasoOrder({ activationThreshold: 1 / 3 })
    const text = deriveActivationText(order, [norepiOrder, order])
    expect(text).toMatch(/10 mcg\/min/)
    expect(text).toMatch(/33%/)
  })
})
