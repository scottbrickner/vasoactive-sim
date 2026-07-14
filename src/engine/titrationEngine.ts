/**
 * Titration engine (BUILD_BRIEF §7): given a proposed dose against the governing
 * order and current state, decides whether the action is safe to apply as entered.
 * Pure — no React/DOM, no store coupling. Enforces start dose, increment size,
 * minimum interval, max, target, and agent sequence per CP 4-156 (docs/CLINICAL_SPEC.md
 * #4, #6).
 *
 * Distinct from guardrails.ts: this checks compliance with the SPECIFIC ORDER;
 * guardrails.ts checks the dose against the Alaris pump's configured soft/hard limits.
 * A dose can be off-order (wrong increment) while still within Guardrails limits, and
 * vice versa — the sim evaluates both (CLINICAL_SPEC.md #6).
 */
import { isTitrationIntervalSatisfied } from './clock'
import type { Order, TitrationTarget, TitrationViolations } from '../state/types'

export type TitrationAction = 'initiate' | 'titrate'
export type TitrationStatus = 'ok' | 'off-order' | 'needs-provider'

export interface TitrationRequest {
  action: TitrationAction
  order: Order
  /** The infusion's rate immediately before this action (0 if not yet started). */
  currentDose: number
  proposedDose: number
  currentMinute: number
  /** Minute of the last dose-changing action for this infusion (initiation counts); null before initiation. */
  lastActionMinute: number | null
  currentMap: number
  /**
   * For sequence > 1 orders: whether this agent's activation condition is met (every
   * lower-sequence agent at its own ordered maximum with target still unmet). Ignored
   * for sequence 1.
   */
  priorAgentActivationMet: boolean
}

export interface TitrationResult {
  status: TitrationStatus
  reasons: string[]
  /** Structured mirror of `reasons` — see TitrationViolations doc (state/types.ts) for why. */
  violations: TitrationViolations
}

const EPSILON = 1e-9

/** Dose values like 0.01-0.02 units/min aren't exactly representable in binary floating point. */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

function meetsTarget(currentValue: number, target: TitrationTarget): boolean {
  switch (target.comparator) {
    case '>=':
      return currentValue >= target.value
  }
}

export function evaluateTitration(request: TitrationRequest): TitrationResult {
  const {
    action,
    order,
    currentDose,
    proposedDose,
    currentMinute,
    lastActionMinute,
    currentMap,
    priorAgentActivationMet,
  } = request

  if (proposedDose <= 0) {
    return { status: 'off-order', reasons: ['Dose must be greater than 0.'], violations: { invalidDose: true } }
  }

  if (order.sequence > 1 && !priorAgentActivationMet) {
    return {
      status: 'off-order',
      reasons: [order.activatesWhen ?? 'This agent has not yet been activated by the order.'],
      violations: { sequenceNotActivated: true },
    }
  }

  if (action === 'initiate') {
    return nearlyEqual(proposedDose, order.startDose)
      ? { status: 'ok', reasons: [], violations: {} }
      : {
          status: 'off-order',
          reasons: [`Ordered starting dose is ${order.startDose}; entered ${proposedDose}.`],
          violations: { wrongStartDose: true },
        }
  }

  // action === 'titrate'
  const targetMet = meetsTarget(currentMap, order.target)

  if (proposedDose > order.maxDose) {
    return !targetMet
      ? {
          status: 'needs-provider',
          reasons: [
            `Requested dose exceeds the ordered maximum (${order.maxDose}) with ${order.target.metric} still below target — notify the provider before proceeding.`,
          ],
          violations: { exceedsOrderMax: true },
        }
      : {
          status: 'off-order',
          reasons: [`Requested dose exceeds the ordered maximum (${order.maxDose}).`],
          violations: { exceedsOrderMax: true },
        }
  }

  const reasons: string[] = []
  const violations: TitrationViolations = {}

  if (targetMet && proposedDose > currentDose) {
    reasons.push(
      `Target already met (${order.target.metric} ${order.target.comparator} ${order.target.value} ${order.target.unit}) — further up-titration is not indicated.`,
    )
    violations.targetAlreadyMet = true
  }

  if (lastActionMinute != null && !isTitrationIntervalSatisfied(currentMinute, lastActionMinute, order.interval)) {
    reasons.push(`Minimum interval not met — ${order.interval.minMinutes} min required since the last change.`)
    violations.intervalTooSoon = true
  }

  const delta = Math.abs(proposedDose - currentDose)
  if (!nearlyEqual(delta, order.increment)) {
    reasons.push(`Ordered increment is ${order.increment}; requested change is ${delta}.`)
    violations.wrongIncrement = true
  }

  return reasons.length > 0 ? { status: 'off-order', reasons, violations } : { status: 'ok', reasons: [], violations: {} }
}
