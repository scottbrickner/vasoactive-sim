/**
 * Pure resolution helpers for Phase 18's "what's your next move" decision points.
 * State/store.ts owns trigger DETECTION (session-transient, needs live infusions/
 * vitals — mirrors priorAgentsActivationMet/priorAgentsWeaned living there rather than
 * here); this module owns turning a decisionPointId back into the actual DecisionPoint
 * content to render/act on, including the one synthesized fallback (see below). No
 * React/DOM here per CLAUDE.md's engine-purity rule.
 */
import { getDrug } from '../data/formulary'
import { formatTargetGapText } from './orderText'
import type { DecisionPoint, Order } from '../state/types'

const AUTO_EARLY_NOTIFICATION_PREFIX = 'auto-early-notification-'

export function autoEarlyNotificationDecisionPointId(orderId: string): string {
  return `${AUTO_EARLY_NOTIFICATION_PREFIX}${orderId}`
}

/**
 * Default fallback decision point for any order that crosses its own
 * `earlyNotificationThreshold` (target still unmet) with no scenario-authored decision
 * point covering it — reproduces the retired TitrationCheckpointPanel's notify-vs-
 * continue mechanic as ordinary decision-point data instead of bespoke UI, so the
 * checkpoint isn't silently lost for scenarios that don't author their own custom
 * decision points around it (e.g. singleAgentEarlyNotification, whose whole objective
 * is built around this exact threshold).
 */
export function buildAutoEarlyNotificationDecisionPoint(order: Order): DecisionPoint {
  const drug = getDrug(order.drugId)
  return {
    id: autoEarlyNotificationDecisionPointId(order.id),
    trapType: 'earlyNotification',
    trigger: { kind: 'earlyNotification', orderId: order.id },
    situation: `You've titrated ${drug.name} toward its early-notification checkpoint and ${formatTargetGapText(order.target)}. What's your next move?`,
    policyHint: 'CP 4-156: notify the provider if the target isn’t reached within the ordered range, or continue titrating within your own order.',
    options: [
      {
        id: 'notify',
        label: 'Notify provider',
        caption: 'Document the assessment and await further orders.',
        group: 'covered',
        effect: { kind: 'notifyProvider', orderId: order.id },
        feedback: { text: 'Notifying the provider is always appropriate when the target still isn’t met.' },
      },
      {
        id: 'continue',
        label: `Continue titrating ${drug.name}`,
        caption: `Titrate toward ${order.maxDose} ${drug.unit}, within your own order.`,
        group: 'covered',
        effect: { kind: 'multiStepTitration', orderId: order.id, targetDose: order.maxDose },
        feedback: { text: 'Continuing to titrate within your own order is reasonable if the trend supports it.' },
      },
    ],
  }
}

/**
 * Resolves a decisionPointId back to its full DecisionPoint content — scenario-authored
 * first, falling back to the synthesized early-notification default (above) for any
 * order-scoped id this scenario didn't author one for. Returns null for an unknown id
 * (e.g. stale state from a scenario switch).
 */
export function resolveDecisionPoint(
  decisionPoints: DecisionPoint[],
  orders: Order[],
  decisionPointId: string,
): DecisionPoint | null {
  const authored = decisionPoints.find((dp) => dp.id === decisionPointId)
  if (authored) return authored
  if (decisionPointId.startsWith(AUTO_EARLY_NOTIFICATION_PREFIX)) {
    const orderId = decisionPointId.slice(AUTO_EARLY_NOTIFICATION_PREFIX.length)
    const order = orders.find((o) => o.id === orderId)
    if (order) return buildAutoEarlyNotificationDecisionPoint(order)
  }
  return null
}
