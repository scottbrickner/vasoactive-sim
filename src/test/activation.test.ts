import { describe, expect, it } from 'vitest'
import { deriveActivationText, deriveNextDecisionPoint } from '../engine/activation'
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

// runGuidedTitrationLeap's pacing offer (state/store.ts's PendingPacingOffer) uses this to
// suggest a sensible fast-forward target — the nearest upcoming milestone, not just "max".
describe('deriveNextDecisionPoint', () => {
  it('picks the order\'s own early-notification threshold when it is the nearest milestone', () => {
    const order: Order = { ...norepiOrder, earlyNotificationThreshold: 0.3 }
    const point = deriveNextDecisionPoint(order, [order], 5)
    expect(point).toMatchObject({ dose: 9 }) // 30 * 0.3
    expect(point?.label).toMatch(/early-notification checkpoint/)
  })

  it('picks a dependent order\'s activation threshold when it is nearer than the early-notification threshold', () => {
    const order: Order = { ...norepiOrder, earlyNotificationThreshold: 0.9 } // 27
    const dependent = vasoOrder({ activationThreshold: 1 / 3 }) // norepi 10
    const point = deriveNextDecisionPoint(order, [order, dependent], 5)
    expect(point).toMatchObject({ dose: 10 })
    expect(point?.label).toMatch(/activating Vasopressin/)
  })

  it('falls back to the order\'s own maxDose when nothing else applies', () => {
    const point = deriveNextDecisionPoint(norepiOrder, [norepiOrder], 5)
    expect(point).toMatchObject({ dose: 30 })
    expect(point?.label).toMatch(/ordered maximum/)
  })

  it('returns null once currentDose is already at or past every milestone', () => {
    expect(deriveNextDecisionPoint(norepiOrder, [norepiOrder], 30)).toBeNull()
  })

  it('skips a milestone currentDose has already passed, picking the next one', () => {
    const order: Order = { ...norepiOrder, earlyNotificationThreshold: 0.3 } // 9
    const point = deriveNextDecisionPoint(order, [order], 9) // already at/past 9
    expect(point).toMatchObject({ dose: 30 })
  })
})
