/**
 * Alaris Guardrails Suite MX limit evaluation (BUILD_BRIEF §7). Maps a proposed dose
 * to `withinLimits | softLimitOverride | hardLimitBlocked`, mirroring how a real Drug
 * Library entry works: HARD limits are a pump/pharmacy-configured ceiling that cannot
 * be exceeded; SOFT limits are the order's own therapeutic range, which the pump
 * allows a nurse to override with justification.
 *
 * Distinct from titrationEngine.ts: this checks the dose VALUE against pump-configured
 * limits, independent of order mechanics like increment/interval/sequence. A dose can
 * be within Guardrails limits while still being off-order (wrong increment), and vice
 * versa (see titrationEngine.ts's module doc).
 */
import type { DrugDefinition, Order } from '../state/types'

export type GuardrailStatus = 'withinLimits' | 'softLimitOverride' | 'hardLimitBlocked'

export interface GuardrailLimits {
  hardMin: number
  hardMax: number
  softMin: number
  softMax: number
}

export interface GuardrailEvaluation {
  status: GuardrailStatus
  limits: GuardrailLimits
}

/**
 * Derives Guardrails limits for an order: the hard ceiling is the drug's own Attachment B
 * maximum (the Drug Library's configured dose ceiling), and the soft range is the order's
 * therapeutic start-to-max — a value outside the order's range but still within the drug's
 * hard maximum triggers a soft-limit alert rather than an outright block.
 */
export function limitsFromOrder(order: Order, drug: DrugDefinition): GuardrailLimits {
  return {
    hardMin: 0,
    hardMax: drug.maxDose,
    softMin: order.startDose,
    softMax: order.maxDose,
  }
}

export function evaluateDose(dose: number, limits: GuardrailLimits): GuardrailEvaluation {
  let status: GuardrailStatus
  if (dose < limits.hardMin || dose > limits.hardMax) {
    status = 'hardLimitBlocked'
  } else if (dose < limits.softMin || dose > limits.softMax) {
    status = 'softLimitOverride'
  } else {
    status = 'withinLimits'
  }
  return { status, limits }
}
