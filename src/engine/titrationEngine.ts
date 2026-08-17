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
import { formatTargetClause, formatTargetGapText } from './orderText'
import type { Order, TitrationTarget, TitrationViolations, VitalSigns } from '../state/types'

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
  vitals: VitalSigns
  /**
   * For sequence > 1 orders: whether this agent's activation condition is met (every
   * lower-sequence agent at its own ordered maximum with target still unmet). Ignored
   * for sequence 1.
   */
  priorAgentActivationMet: boolean
  /**
   * Whether every order with a lower `weanOrder` than this one has been "cleared" (see
   * priorAgentsWeaned in state/store.ts). Always computed and passed, mirroring
   * `priorAgentActivationMet` — ignored when `order.weanOrder` is 1 or unset.
   */
  priorAgentsWeaned: boolean
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

/** Reads whichever vital a target's `metric` actually names, so callers never hardcode `vitals.map`. */
export function resolveTargetValue(vitals: VitalSigns, metric: TitrationTarget['metric']): number {
  switch (metric) {
    case 'MAP':
      return vitals.map
    case 'HR':
      return vitals.hr
    case 'RASS':
      return vitals.rass
    case 'painScore':
      return vitals.painScore
  }
}

export function meetsTarget(currentValue: number, target: TitrationTarget): boolean {
  switch (target.comparator) {
    case '>=':
      return currentValue >= target.value
    case '<=':
      return currentValue <= target.value
    case 'between':
      return currentValue >= target.value && currentValue <= (target.valueHigh ?? target.value)
  }
}

const MAX_LEAP_STEPS = 500

function decimalPlacesOf(value: number): number {
  const str = value.toString()
  const dot = str.indexOf('.')
  return dot === -1 ? 0 : str.length - dot - 1
}

export interface MultiStepTitrationPlan {
  /** The sequence of intermediate doses a multi-step titration plan would apply, in order. */
  doses: number[]
  /** True when `requestedTarget` didn't land on a clean increment step (or exceeded the allowed max) and had to be snapped down to the nearest reachable dose. */
  wasSnappedDown: boolean
}

/**
 * Plans a multi-step titration from `currentDose` toward `requestedTarget`, stepping by
 * `increment`, bidirectional: `requestedTarget > currentDose` plans UPWARD, clamped to
 * never exceed `maxAllowedDose`; `requestedTarget < currentDose` plans DOWNWARD (e.g. a
 * weaning order's down-titration), clamped to never go below `minAllowedDose` (default
 * 0 — a plain 0 floor for a non-weaning order, since evaluateTitration only forbids
 * `<= 0`; callers weaning a `weanOrder` order pass its own `startDose` instead, matching
 * priorAgentsWeaned's own definition of "cleared"). `requestedTarget === currentDose` is
 * always a no-op empty plan, either direction. The downward branch is an exact mirror of
 * the upward one — same snapping/rounding/MAX_LEAP_STEPS logic, just stepping by
 * `-increment` and clamping against a floor instead of a ceiling. Pure — used by
 * runMultiStepTitration (state/store.ts) to both preview and apply the plan, so the
 * preview and what actually gets applied can never drift apart. (Renamed from
 * computeGuidedLeapDoses/GuidedLeapPlan in Phase 18 — "guided"/"leap" language was
 * dropped from learner-facing copy; this rename keeps the codebase's own vocabulary
 * consistent with what's shown on screen. Made bidirectional after a user-reported bug:
 * the mechanic was originally built up-only and silently couldn't help a learner
 * weaning a pressor down, per the weaningSupport scenario's whole teaching point.)
 */
export function computeMultiStepDoses(
  currentDose: number,
  increment: number,
  maxAllowedDose: number,
  requestedTarget: number,
  minAllowedDose: number = 0,
): MultiStepTitrationPlan {
  if (!Number.isFinite(requestedTarget) || increment <= 0) {
    return { doses: [], wasSnappedDown: false }
  }

  if (requestedTarget < currentDose) {
    const clampedTarget = Math.max(requestedTarget, minAllowedDose)
    const rawSteps = (currentDose - clampedTarget) / increment
    const steps = Math.min(Math.floor(rawSteps + EPSILON), MAX_LEAP_STEPS)
    if (steps <= 0) return { doses: [], wasSnappedDown: false }
    const decimalPlaces = Math.max(decimalPlacesOf(currentDose), decimalPlacesOf(increment))
    const doses = Array.from({ length: steps }, (_, i) => Number((currentDose - increment * (i + 1)).toFixed(decimalPlaces)))
    const finalDose = doses[doses.length - 1]
    const wasSnappedDown = finalDose - clampedTarget > EPSILON || clampedTarget > requestedTarget
    return { doses, wasSnappedDown }
  }

  if (requestedTarget <= currentDose) {
    return { doses: [], wasSnappedDown: false }
  }
  const clampedTarget = Math.min(requestedTarget, maxAllowedDose)
  const rawSteps = (clampedTarget - currentDose) / increment
  const steps = Math.min(Math.floor(rawSteps + EPSILON), MAX_LEAP_STEPS)
  if (steps <= 0) return { doses: [], wasSnappedDown: false }
  const decimalPlaces = Math.max(decimalPlacesOf(currentDose), decimalPlacesOf(increment))
  const doses = Array.from({ length: steps }, (_, i) => Number((currentDose + increment * (i + 1)).toFixed(decimalPlaces)))
  const finalDose = doses[doses.length - 1]
  const wasSnappedDown = clampedTarget - finalDose > EPSILON || clampedTarget < requestedTarget
  return { doses, wasSnappedDown }
}

export function evaluateTitration(request: TitrationRequest): TitrationResult {
  const {
    action,
    order,
    currentDose,
    proposedDose,
    currentMinute,
    lastActionMinute,
    vitals,
    priorAgentActivationMet,
    priorAgentsWeaned,
  } = request
  const currentValue = resolveTargetValue(vitals, order.target.metric)

  if (proposedDose <= 0) {
    return { status: 'off-order', reasons: ['Dose must be greater than 0.'], violations: { invalidDose: true } }
  }

  // Scoped to 'initiate' only — this gates a NEW dose entering play, not continued
  // management of an infusion that's already running (whether started via a normal
  // initiate or pre-seeded already-infusing by the scenario). Without this scoping, an
  // agent that successfully activated while target was unmet would become newly
  // unblockable — including for down-titration/weaning — the instant target is reached
  // and priorAgentActivationMet's own targetUnmet condition flips false. Bug surfaced by
  // the weaning scenario, where sequence>1 agents are pre-seeded infusing with MAP
  // already above target from the start.
  if (action === 'initiate' && order.sequence > 1 && !priorAgentActivationMet) {
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
  const targetMet = meetsTarget(currentValue, order.target)

  if (proposedDose < currentDose && order.weanOrder != null && order.weanOrder > 1 && !priorAgentsWeaned) {
    return {
      status: 'off-order',
      reasons: ['A lower-weanOrder agent has not yet been weaned — clear that agent before down-titrating this one.'],
      violations: { wrongWeanOrder: true },
    }
  }

  if (proposedDose > order.maxDose) {
    return !targetMet
      ? {
          status: 'needs-provider',
          reasons: [
            `Requested dose exceeds the ordered maximum (${order.maxDose}) with ${formatTargetGapText(order.target)} — notify the provider before proceeding.`,
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
    reasons.push(`Target already met (${formatTargetClause(order.target)}) — further up-titration is not indicated.`)
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
