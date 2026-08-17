import { describe, expect, it } from 'vitest'
import {
  autoEarlyNotificationDecisionPointId,
  buildAutoEarlyNotificationDecisionPoint,
  resolveDecisionPoint,
} from '../engine/decisionPoints'
import type { DecisionPoint, Order } from '../state/types'

const norepiOrder: Order = {
  id: 'order-norepinephrine-agent1',
  drugId: 'norepinephrine',
  sequence: 1,
  startDose: 0.5,
  maxDose: 30,
  increment: 0.5,
  interval: { minMinutes: 3, maxMinutes: 5 },
  target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
  earlyNotificationThreshold: 0.8,
}

describe('autoEarlyNotificationDecisionPointId', () => {
  it('is stable and order-scoped', () => {
    expect(autoEarlyNotificationDecisionPointId('order-a')).toBe('auto-early-notification-order-a')
    expect(autoEarlyNotificationDecisionPointId('order-a')).not.toBe(autoEarlyNotificationDecisionPointId('order-b'))
  })
})

describe('buildAutoEarlyNotificationDecisionPoint', () => {
  const dp = buildAutoEarlyNotificationDecisionPoint(norepiOrder)

  it('carries the order-scoped id and earlyNotification trigger/trapType', () => {
    expect(dp.id).toBe('auto-early-notification-order-norepinephrine-agent1')
    expect(dp.trapType).toBe('earlyNotification')
    expect(dp.trigger).toEqual({ kind: 'earlyNotification', orderId: norepiOrder.id })
  })

  it('offers exactly notify-provider and continue-titrating, both "covered"', () => {
    expect(dp.options).toHaveLength(2)
    expect(dp.options.map((o) => o.effect.kind).sort()).toEqual(['multiStepTitration', 'notifyProvider'])
    expect(dp.options.every((o) => o.group === 'covered')).toBe(true)
  })

  it('the continue option targets this order’s own maxDose', () => {
    const continueOption = dp.options.find((o) => o.effect.kind === 'multiStepTitration')
    expect(continueOption?.effect).toEqual({ kind: 'multiStepTitration', orderId: norepiOrder.id, targetDose: 30 })
  })
})

describe('resolveDecisionPoint', () => {
  it('prefers a scenario-authored decision point over the synthesized fallback', () => {
    const authored: DecisionPoint = {
      id: 'auto-early-notification-order-norepinephrine-agent1',
      trapType: 'missingOrder',
      trigger: { kind: 'earlyNotification', orderId: norepiOrder.id },
      situation: 'Custom situation',
      policyHint: 'Custom hint',
      options: [],
    }
    const resolved = resolveDecisionPoint([authored], [norepiOrder], authored.id)
    expect(resolved).toBe(authored)
  })

  it('falls back to the synthesized default for an unauthored auto-prefixed id', () => {
    const id = autoEarlyNotificationDecisionPointId(norepiOrder.id)
    const resolved = resolveDecisionPoint([], [norepiOrder], id)
    expect(resolved?.trapType).toBe('earlyNotification')
    expect(resolved?.id).toBe(id)
  })

  it('returns null for an unknown non-auto id', () => {
    expect(resolveDecisionPoint([], [norepiOrder], 'nonexistent')).toBeNull()
  })

  it('returns null for an auto-prefixed id whose order no longer exists', () => {
    expect(resolveDecisionPoint([], [], autoEarlyNotificationDecisionPointId('gone'))).toBeNull()
  })
})
