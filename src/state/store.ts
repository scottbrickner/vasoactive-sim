import { create } from 'zustand'
import { deriveActivationText, deriveNextDecisionPoint } from '../engine/activation'
import { advance, minutesElapsed } from '../engine/clock'
import { autoEarlyNotificationDecisionPointId, resolveDecisionPoint } from '../engine/decisionPoints'
import { correctLocationFor } from '../engine/documentation'
import { evaluateDose, limitsFromOrder } from '../engine/guardrails'
import { isBlockOverMaxDuration, isPastRemovalThreshold } from '../engine/infusionLifecycle'
import {
  accumulateDeterioration,
  deriveBloodPressure,
  periodicVariability,
  projectDoseResponse,
  projectMap,
  responseFraction,
  stepTowardTarget,
} from '../engine/physiology'
import {
  computeMultiStepDoses,
  evaluateTitration,
  meetsTarget,
  resolveTargetValue,
  type TitrationAction,
  type TitrationResult,
} from '../engine/titrationEngine'
import { getDrug } from '../data/formulary'
import { MEDICATION_VERIFICATION } from '../data/policy'
import { DEFAULT_SCENARIO } from '../data/scenarios'
import type {
  BlockOfChartingRecord,
  DecisionTone,
  DrugDefinition,
  DrugId,
  GuardrailStatus,
  Infusion,
  LogEntry,
  Order,
  Phase,
  ProctorRecord,
  ScenarioConfig,
  SimMode,
  TitrationViolations,
  VitalSigns,
} from './types'

export type FeedbackTone = 'info' | 'success' | 'warning' | 'danger'

export interface FeedbackMessage {
  tone: FeedbackTone
  title: string
  message: string
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

/**
 * A drug's own MAP contribution is 0 unless the scenario tunes a response ceiling for
 * it — or a facilitator has live-overridden that ceiling for the rest of the session
 * (see Facilitator.tsx's OverrideControls; `responseModelOverrides` takes precedence
 * over the scenario's own tuning when present).
 */
function contributionFor(
  infusion: Infusion,
  scenario: ScenarioConfig,
  responseModelOverrides: Partial<Record<DrugId, number>>,
): number {
  const maxMapContribution = responseModelOverrides[infusion.drugId] ?? scenario.responseModel[infusion.drugId]?.maxMapContribution
  if (maxMapContribution == null) return 0
  const drug = getDrug(infusion.drugId)
  return projectDoseResponse(infusion.rate, drug.maxDose, maxMapContribution)
}

/**
 * HR/SpO2 siblings of contributionFor — same sqrt-response shape, no facilitator
 * override (Phase 10's `responseModelOverrides` stays MAP-only; out of this phase's
 * scope). `maxHrContribution` is typically negative (easing tachycardia as MAP
 * normalizes) — `projectDoseResponse` handles a negative ceiling the same way it
 * handles a positive one, since it's just a scale factor on the sqrt curve.
 */
function hrContributionFor(infusion: Infusion, scenario: ScenarioConfig): number {
  const maxHrContribution = scenario.responseModel[infusion.drugId]?.maxHrContribution
  if (maxHrContribution == null) return 0
  const drug = getDrug(infusion.drugId)
  return projectDoseResponse(infusion.rate, drug.maxDose, maxHrContribution)
}

function spo2ContributionFor(infusion: Infusion, scenario: ScenarioConfig): number {
  const maxSpo2Contribution = scenario.responseModel[infusion.drugId]?.maxSpo2Contribution
  if (maxSpo2Contribution == null) return 0
  const drug = getDrug(infusion.drugId)
  return projectDoseResponse(infusion.rate, drug.maxDose, maxSpo2Contribution)
}

/** RASS sibling of hrContributionFor — same sqrt-response shape, no facilitator override (Phase 10's `vitalOverrides` stays HR/SBP/DBP/SpO2-only; RASS is out of that phase's scope). */
function rassContributionFor(infusion: Infusion, scenario: ScenarioConfig): number {
  const maxRassContribution = scenario.responseModel[infusion.drugId]?.maxRassContribution
  if (maxRassContribution == null) return 0
  const drug = getDrug(infusion.drugId)
  return projectDoseResponse(infusion.rate, drug.maxDose, maxRassContribution)
}

/** Pain-score sibling of hrContributionFor — same sqrt-response shape, no facilitator override. */
function painScoreContributionFor(infusion: Infusion, scenario: ScenarioConfig): number {
  const maxPainScoreContribution = scenario.responseModel[infusion.drugId]?.maxPainScoreContribution
  if (maxPainScoreContribution == null) return 0
  const drug = getDrug(infusion.drugId)
  return projectDoseResponse(infusion.rate, drug.maxDose, maxPainScoreContribution)
}

/**
 * Sequence > 1 orders activate once every lower-sequence order's infusion is at (or
 * past) `order.activationThreshold` of its own max — defaults to 1 ("at its own max")
 * when omitted — paired with that PRIOR order's own target being still UNMET by
 * default (same-target escalation: a second pressor activates because the first alone
 * isn't reaching the shared MAP goal), or MET when `order.activationRequiresPriorTargetMet`
 * is set (cross-parameter sequencing: sedation activates once analgesia's own goal is
 * *achieved*, per CP4-156.doc's "adequate analgesia before sedation" principle — Phase
 * 19h, added after a direct clinical correction that the original "still unmet" framing
 * doesn't fit a case where the two orders target genuinely different parameters).
 */
export function priorAgentsActivationMet(
  infusions: Infusion[],
  orders: Order[],
  vitals: VitalSigns,
  order: Order,
): boolean {
  const priorOrders = orders.filter((o) => o.sequence < order.sequence)
  if (priorOrders.length === 0) return true
  const fraction = order.activationThreshold ?? 1
  return priorOrders.every((priorOrder) => {
    const infusion = infusions.find((i) => i.orderId === priorOrder.id)
    if (!infusion) return false
    const thresholdDose = priorOrder.maxDose * fraction
    const atThreshold = infusion.rate >= thresholdDose - 1e-9
    // Routed through the shared meetsTarget/resolveTargetValue helper instead of the
    // old ad hoc `currentMap < priorOrder.target.value` — that hardcoded a '>=' MAP
    // comparator regardless of the prior order's actual target, a latent bug that never
    // surfaced because every prior-sequence order to date targets MAP with '>=', where
    // "target unmet" (`!meetsTarget`) and "current < value" are exactly equivalent.
    const priorTargetMet = meetsTarget(resolveTargetValue(vitals, priorOrder.target.metric), priorOrder.target)
    const targetCondition = order.activationRequiresPriorTargetMet ? priorTargetMet : !priorTargetMet
    return atThreshold && targetCondition
  })
}

/**
 * Down-titration's inverse of priorAgentsActivationMet: an order with `weanOrder`
 * requires every order with a LOWER `weanOrder` to be "cleared" first — its infusion
 * discontinued (absent from `infusions`), or brought down to at/below that order's own
 * startDose. Trivially true when `order.weanOrder` is unset.
 */
export function priorAgentsWeaned(infusions: Infusion[], orders: Order[], order: Order): boolean {
  const weanOrder = order.weanOrder
  if (weanOrder == null) return true
  const priorOrders = orders.filter((o) => o.weanOrder != null && o.weanOrder < weanOrder)
  return priorOrders.every((priorOrder) => {
    const infusion = infusions.find((i) => i.orderId === priorOrder.id)
    if (!infusion) return true
    return infusion.rate <= priorOrder.startDose + 1e-9
  })
}

/**
 * True the instant a titrate newly crosses `order.earlyNotificationThreshold` (a
 * fraction of THIS order's own maxDose, distinct from `activationThreshold`'s prior-
 * order fraction) with target still unmet — a provider-notification checkpoint earlier
 * than the existing at-max needs-provider trigger. Only true on the crossing tick
 * (`priorDose` below, `proposedDose` at/above), so it doesn't refire on every
 * subsequent titration past the threshold.
 */
function crossedEarlyNotificationThreshold(order: Order, priorDose: number, proposedDose: number, vitals: VitalSigns): boolean {
  if (order.earlyNotificationThreshold == null) return false
  const thresholdDose = order.maxDose * order.earlyNotificationThreshold
  return (
    priorDose < thresholdDose &&
    proposedDose >= thresholdDose &&
    !meetsTarget(resolveTargetValue(vitals, order.target.metric), order.target)
  )
}

/**
 * Phase 18: generalizes crossedEarlyNotificationThreshold's single-trigger check into
 * the full DecisionPoint trigger vocabulary (see state/types.ts's DecisionPointTrigger).
 * Checked after every dose that actually reaches an infusion (submitDose,
 * confirmDoseOverride, runMultiStepTitration's per-step loop) — mirrors
 * applyPacingTrigger's call-site pattern. Returns whichever decision point newly fires
 * this tick, or null; a decision point already shown this session (decisionPointsShown)
 * never re-fires. Falls back to the synthesized early-notification default (see
 * engine/decisionPoints.ts) for any order whose threshold crosses with no
 * scenario-authored decision point covering it — this is how the retired
 * TitrationCheckpointPanel's notify-vs-continue mechanic still fires for scenarios that
 * don't author their own custom decision points.
 */
/** True once every order with a `weanOrder` has an actively-infusing infusion — the state-shape half of the 'weanEligible' trigger (the other half, target-met, is checked by each caller against whichever order's target is in scope). */
function isWeanEligible(orders: Order[], infusions: Infusion[]): boolean {
  const weanOrders = orders.filter((o) => o.weanOrder != null)
  return weanOrders.length > 1 && weanOrders.every((o) => infusions.some((i) => i.orderId === o.id && i.status === 'infusing'))
}

/**
 * True once every DISTINCT metric targeted across `orders` is independently met —
 * replaces the old `orders[0]`-as-shared-reference hack, which assumed every order in
 * the scenario shares one physiologic target (true for every scenario through Phase
 * 18, but breaks for the analgosedation scenario's two simultaneous targets, painScore
 * and RASS). Groups by metric rather than checking every order individually since
 * multiple orders can share one metric (e.g. two MAP-targeted pressors) and only need
 * to be checked once each.
 */
function allTargetsMet(orders: Order[], vitals: VitalSigns): boolean {
  const metrics = new Set(orders.map((o) => o.target.metric))
  return Array.from(metrics).every((metric) => {
    const representative = orders.find((o) => o.target.metric === metric)!
    return meetsTarget(resolveTargetValue(vitals, metric), representative.target)
  })
}

/**
 * The clock-driven half of the 'weanEligible' trigger — in real play, MAP reaching
 * target is fundamentally a clock event (physiology interpolating toward its projected
 * value across advanceClock ticks), not necessarily a dose-entry event, and once
 * target IS met a further up-titration is itself off-order (evaluateTitration's
 * targetAlreadyMet check) — so relying only on deriveTriggeredDecisionPointId's
 * dose-triggered check (which only runs after a dose successfully APPLIES) would miss
 * the moment entirely for a learner who reaches target purely by waiting. Checked from
 * advanceClock, using the scenario's first order as the shared target reference (every
 * order sharing one physiologic target, e.g. one patient's MAP, is this sim's only
 * modeled case — see ScenarioConfig's doc comment).
 */
function deriveWeanEligibleDecisionPointId(
  scenario: ScenarioConfig,
  orders: Order[],
  infusions: Infusion[],
  vitals: VitalSigns,
  decisionPointsShown: Record<string, boolean>,
): string | null {
  if (!allTargetsMet(orders, vitals) || !isWeanEligible(orders, infusions)) return null
  const dp = (scenario.decisionPoints ?? []).find((d) => d.trigger.kind === 'weanEligible' && !decisionPointsShown[d.id])
  return dp?.id ?? null
}

function deriveTriggeredDecisionPointId(
  scenario: ScenarioConfig,
  orders: Order[],
  infusions: Infusion[],
  vitals: VitalSigns,
  decisionPointsShown: Record<string, boolean>,
  orderId: string,
  priorDose: number,
  proposedDose: number,
  action: TitrationAction,
): string | null {
  const order = orders.find((o) => o.id === orderId)
  if (!order) return null

  for (const dp of scenario.decisionPoints ?? []) {
    if (decisionPointsShown[dp.id]) continue
    if (dp.trigger.kind === 'earlyNotification' && dp.trigger.orderId === orderId) {
      if (crossedEarlyNotificationThreshold(order, priorDose, proposedDose, vitals)) return dp.id
    }
    if (
      dp.trigger.kind === 'weanEligible' &&
      meetsTarget(resolveTargetValue(vitals, order.target.metric), order.target) &&
      isWeanEligible(orders, infusions)
    ) {
      return dp.id
    }
    // Scoped to THIS order and to a real titrate (never an initiate — an initiate is
    // always the order's own startDose, not itself "a titration" to react to).
    if (dp.trigger.kind === 'postTitrate' && dp.trigger.orderId === orderId && action === 'titrate') return dp.id
  }

  const autoId = autoEarlyNotificationDecisionPointId(orderId)
  if (!decisionPointsShown[autoId] && crossedEarlyNotificationThreshold(order, priorDose, proposedDose, vitals)) {
    return autoId
  }

  return null
}

/**
 * Phase 19c: resolves a matching, not-yet-shown 'escalationAttempt' decision point for
 * this order. Deliberately a small standalone resolver beside deriveTriggeredDecisionPointId
 * rather than a case folded into that function's own loop — deriveTriggeredDecisionPointId
 * only ever runs AFTER a dose has successfully applied (its callers are all post-apply),
 * but 'escalationAttempt' fires on a BLOCKED attempt (hardLimitBlocked/needs-provider),
 * checked directly at submitDose's two hard-stop early-return branches, which return
 * before a dose ever applies. Same once-per-session decisionPointsShown guard as every
 * other trigger.
 */
function findEscalationAttemptDecisionPointId(
  scenario: ScenarioConfig,
  decisionPointsShown: Record<string, boolean>,
  orderId: string,
): string | null {
  const dp = (scenario.decisionPoints ?? []).find(
    (d) => d.trigger.kind === 'escalationAttempt' && d.trigger.orderId === orderId && !decisionPointsShown[d.id],
  )
  return dp?.id ?? null
}

/** Non-punitive tone derived from a real dose outcome — never authored (see DecisionTone's doc). */
function toneFromDoseOutcome(outcome: LogEntry['outcome'], overridden: boolean | undefined): DecisionTone {
  return outcome === 'applied' && !overridden ? 'good' : 'critical'
}

/**
 * After a manual (non-leap) titrate applies, bumps that order's pacing counter and —
 * once it reaches PACING_OFFER_THRESHOLD — opens a non-clinical pendingPacingOffer
 * pointed at the nearest upcoming milestone (see deriveNextDecisionPoint). Skipped
 * entirely the tick a clinical checkpoint fires (crossedEarlyThreshold) — the real
 * decision takes precedence over a workflow-pacing nudge, and resolves the same
 * "climbing for a while" pressure the pacing offer exists to address.
 *
 * `wasDecrease` — whether the manual titrate that just triggered this call lowered the
 * dose — is threaded straight into deriveNextDecisionPoint's `direction`, so a learner
 * weaning DOWN gets offered a downward milestone (this order's own startDose) instead of
 * an upward one. Computed by each call site (submitDose, confirmDoseOverride), which
 * both have the prior and just-applied dose in scope already.
 */
function applyPacingTrigger(
  get: () => Pick<SimStore, 'orders' | 'infusions' | 'pacingTitrationsSinceOffer' | 'pendingDecisionPoint' | 'pendingPacingOffer'>,
  set: (partial: Partial<SimStore>) => void,
  orderId: string,
  crossedEarlyThreshold: boolean,
  wasDecrease: boolean,
) {
  const s = get()
  if (crossedEarlyThreshold) {
    set({ pacingTitrationsSinceOffer: { ...s.pacingTitrationsSinceOffer, [orderId]: 0 } })
    return
  }
  const count = (s.pacingTitrationsSinceOffer[orderId] ?? 0) + 1
  if (count < PACING_OFFER_THRESHOLD || s.pendingDecisionPoint || s.pendingPacingOffer) {
    set({ pacingTitrationsSinceOffer: { ...s.pacingTitrationsSinceOffer, [orderId]: count } })
    return
  }
  const order = s.orders.find((o) => o.id === orderId)
  const infusion = s.infusions.find((i) => i.orderId === orderId)
  const nextPoint = order && infusion ? deriveNextDecisionPoint(order, s.orders, infusion.rate, wasDecrease ? 'down' : 'up') : null
  set({
    pacingTitrationsSinceOffer: { ...s.pacingTitrationsSinceOffer, [orderId]: 0 },
    pendingPacingOffer:
      nextPoint && infusion
        ? { orderId, currentDose: infusion.rate, nextDecisionDose: nextPoint.dose, nextDecisionLabel: nextPoint.label }
        : s.pendingPacingOffer,
  })
}

/**
 * Applies whatever clock advance was withheld while the decision point it triggered was
 * still pending (see the SimStore doc comment on pendingClockAdvanceMinutes) — called the
 * instant that decision resolves (chooseDecisionOption / dismissDecisionPoint), BEFORE
 * whatever the learner picked runs its own course. A no-op when nothing was deferred
 * (e.g. dismissing a decision point that isn't the kind submitDose/confirmDoseOverride/
 * runMultiStepTitration ever defer for — defensive, not expected to matter in practice).
 * Ordering matters: catching the clock up first means an option's own effect (which may
 * itself trigger — and defer for — a brand-new decision point) always starts from a
 * clean, non-deferred state, rather than stacking a second deferral on top of the first.
 */
function resolveDeferredClockAdvance(
  get: () => Pick<SimStore, 'pendingClockAdvanceMinutes' | 'advanceClock'>,
  set: (partial: Partial<SimStore>) => void,
) {
  const minutes = get().pendingClockAdvanceMinutes
  if (minutes == null) return
  set({ pendingClockAdvanceMinutes: null })
  get().advanceClock(minutes)
}

function nextChannelLetter(infusions: Infusion[]): string {
  const used = new Set(infusions.map((i) => i.channel))
  for (const letter of ['A', 'B', 'C', 'D']) {
    if (!used.has(letter)) return letter
  }
  return 'X'
}

/**
 * A deferred off-order attempt, awaiting the training-mode learner's confirm/cancel
 * decision (see submitDose). Not part of SimState — purely transient UI-adjacent store
 * state, like FeedbackMessage.
 */
export interface PendingOverride {
  orderId: string
  dose: number
  action: TitrationAction
  reasons: string[]
  violations: TitrationViolations
  guardrailStatus: GuardrailStatus
}

/**
 * A triggered decision point (see deriveTriggeredDecisionPointId) awaiting the
 * learner's pick — Phase 18's generalization of the retired PendingCheckpoint/
 * TitrationCheckpointPanel (notify-vs-continue only) into N authored options. Not part
 * of SimState — transient UI-adjacent store state, like PendingOverride. Deliberately
 * just the id, not a snapshot of dose/MAP at trigger time — the decision card renders
 * its situation prose from LIVE state (see engine/decisionPoints.ts), not a frozen copy.
 */
export interface PendingDecisionPoint {
  decisionPointId: string
}

/** How many manual (non-multi-step) titrations on the same order trigger a pacing offer. */
const PACING_OFFER_THRESHOLD = 3

/**
 * A non-clinical "want to speed through this climb?" offer — distinct from
 * PendingDecisionPoint, which is a real clinical decision at an authored trigger. This
 * fires periodically (every PACING_OFFER_THRESHOLD manual titrations) purely to cut
 * down on repetitive clicking toward whatever the next decision point actually is (see
 * engine/activation.ts's deriveNextDecisionPoint). Not part of SimState — transient
 * UI-adjacent store state, like PendingOverride.
 */
export interface PendingPacingOffer {
  orderId: string
  currentDose: number
  nextDecisionDose: number
  nextDecisionLabel: string
}

interface ApplyStateSlice {
  clockMinutes: number
  infusions: Infusion[]
  log: LogEntry[]
  vitals: ScenarioConfig['startingVitals']
}

/**
 * Shared "apply this dose to the infusion" logic — used by both a clean order-compliant
 * apply and an overridden/silently-applied one, so the two paths can't drift apart.
 */
function computeApplyUpdate(
  s: ApplyStateSlice,
  order: Order,
  drug: DrugDefinition,
  infusion: Infusion | null,
  action: TitrationAction,
  dose: number,
): Pick<ApplyStateSlice, 'infusions' | 'log'> & {
  lastPhysiologyUpdate: { minute: number; map: number; hr: number; spo2: number; rass: number; painScore: number }
} {
  const nextInfusion: Infusion = infusion
    ? {
        ...infusion,
        status: 'infusing',
        rate: dose,
        // The MAR's initial-rate record is fixed at initiation — later titrations
        // chart in iView instead (see data/policy.ts DOCUMENTATION_PLACEMENT) and
        // must never overwrite it.
        initialRate: action === 'initiate' ? dose : infusion.initialRate,
        lastActionMinute: s.clockMinutes,
      }
    : {
        id: nextId('infusion'),
        orderId: order.id,
        drugId: order.drugId,
        status: 'infusing',
        rate: dose,
        initialRate: dose,
        channel: nextChannelLetter(s.infusions),
        beginBagCompleted: true,
        lastActionMinute: s.clockMinutes,
        stoppedAtMinute: null,
        rateBeforePause: null,
      }
  const infusions = infusion
    ? s.infusions.map((i) => (i.id === nextInfusion.id ? nextInfusion : i))
    : [...s.infusions, nextInfusion]

  const marEntry: LogEntry[] =
    action === 'initiate'
      ? [
          {
            id: nextId('log'),
            minute: s.clockMinutes,
            type: 'documentation',
            location: correctLocationFor('initialRate'),
            summary: `Initial rate charted in MAR: ${drug.name} ${dose} ${drug.unit}.`,
          },
        ]
      : []

  return {
    infusions,
    log: [...s.log, ...marEntry],
    lastPhysiologyUpdate: {
      minute: s.clockMinutes,
      map: s.vitals.map,
      hr: s.vitals.hr,
      spo2: s.vitals.spo2,
      rass: s.vitals.rass,
      painScore: s.vitals.painScore,
    },
  }
}

/**
 * Shared iView chart-entry construction, used by both a live chartVitals() and a
 * backdated chartRetrospective() — so the two LogEntry shapes can't drift apart.
 * `enteredAtMinute` is the real clock minute of creation; passing one that differs
 * from `forMinute` is what makes an entry retrospective.
 */
function buildVitalsLogEntry(forMinute: number, vitals: VitalSigns, enteredAtMinute: number): LogEntry {
  const retrospective = enteredAtMinute !== forMinute
  return {
    id: nextId('log'),
    minute: forMinute,
    type: 'documentation',
    location: 'iView',
    summary: retrospective
      ? `Measurable criteria charted in iView for ${forMinute} min (entered retrospectively at ${enteredAtMinute} min): MAP ${vitals.map} mmHg, HR ${vitals.hr}.`
      : `Measurable criteria charted in iView: MAP ${vitals.map} mmHg, HR ${vitals.hr}.`,
    vitalsSnapshot: vitals,
    retrospective: retrospective || undefined,
    enteredAtMinute: retrospective ? enteredAtMinute : undefined,
  }
}

interface SimStore {
  phase: Phase
  mode: SimMode
  scenario: ScenarioConfig
  clockMinutes: number
  infusions: Infusion[]
  vitals: ScenarioConfig['startingVitals']
  orders: Order[]
  log: LogEntry[]
  verificationFlags: Record<string, boolean>
  /** Phase 19d: independent (two-nurse) double-check completion for high-alert drugs, keyed by the action's LogEntry id — mirrors verificationFlags exactly. */
  independentCheckFlags: Record<string, boolean>
  adherenceFlags: Record<string, boolean>
  lastPhysiologyUpdate: { minute: number; map: number; hr: number; spo2: number; rass: number; painScore: number } | null
  /** Cumulative mmHg MAP has dropped below baseline from untreated time — see ScenarioConfig.deterioration. */
  deteriorationOffset: number
  activeBlockOfCharting: BlockOfChartingRecord | null
  blockOfChartingHistory: BlockOfChartingRecord[]
  /** A deferred off-order dose attempt awaiting the training-mode learner's decision. */
  pendingOverride: PendingOverride | null
  /** A triggered "what's your next move" decision point awaiting the learner's pick (Phase 18). */
  pendingDecisionPoint: PendingDecisionPoint | null
  /**
   * The clock advance a dose change earned, held back while a decision point it
   * triggered is still pending (see resolveDeferredClockAdvance) — so the vitals a
   * decision card describes can't drift past what it says before the learner even
   * reads it. Applied the instant that decision resolves (chooseDecisionOption /
   * dismissDecisionPoint), before whatever the learner picked runs its own course.
   * Null whenever no decision point is pending.
   */
  pendingClockAdvanceMinutes: number | null
  /** Decision points already presented this session, keyed by decisionPointId — a once-per-session gate so a trigger (or its synthesized fallback) never re-fires after being shown. */
  decisionPointsShown: Record<string, boolean>
  /** Manual (non-leap) titration count since the last pacing offer, keyed by orderId — resets on offer/a decision point firing. */
  pacingTitrationsSinceOffer: Record<string, number>
  /** A non-clinical "speed through this climb?" offer awaiting the learner's decision. */
  pendingPacingOffer: PendingPacingOffer | null
  /** Snapshot of live vitals at each sim minute reached — see chartRetrospective. */
  vitalsHistory: { minute: number; vitals: ScenarioConfig['startingVitals'] }[]
  feedback: FeedbackMessage | null
  /** Who's proctoring this session and when, for a facilitated session — see sync/. Null for standalone solo practice; never gates anything. */
  proctor: ProctorRecord | null
  /**
   * A facilitator's live vital-sign overrides (Phase 10, educator tier only) — HR and
   * ART's two components (SBP/DBP) and SpO2 ONLY; MAP is deliberately not
   * independently overridable (it's derived/computed everywhere else in this engine —
   * see advanceClock). Absent keys fall back to the scenario's own computation.
   * Applied both live (every advanceClock tick) and to the NEXT scenario's opening
   * vitals (startScenario) — persists across scenario picks until cleared.
   */
  vitalOverrides: Partial<Pick<VitalSigns, 'hr' | 'sbp' | 'dbp' | 'spo2'>>
  /** A facilitator's live per-drug MAP-response-ceiling overrides, keyed by DrugId — supersedes the scenario's own responseModel entry when present (see contributionFor). Persists across scenario picks until cleared. */
  responseModelOverrides: Partial<Record<DrugId, number>>

  setPhase: (phase: Phase) => void
  /** Stamps the current time and records who's proctoring this session (see ProctorRecord doc). */
  setProctor: (name: string, email: string) => void
  /** (Re)initializes the live sim state from a scenario config — used by both "Begin simulation" and "Restart simulation". */
  startScenario: (scenario: ScenarioConfig, mode: SimMode) => void
  dismissFeedback: () => void

  /** Facilitator-only (Phase 10, educator tier): sets a live vital-sign override and logs it. */
  commitVitalOverride: (key: 'hr' | 'sbp' | 'dbp' | 'spo2', value: number) => void
  /** Facilitator-only: clears a single vital-sign override, letting the scenario's own computation resume next tick. */
  clearVitalOverride: (key: 'hr' | 'sbp' | 'dbp' | 'spo2') => void
  /** Facilitator-only: overrides a drug's MAP-response ceiling for the rest of the session. */
  setResponseModelOverride: (drugId: DrugId, maxMapContribution: number) => void
  /** Facilitator-only: clears a single drug's response-model override. */
  clearResponseModelOverride: (drugId: DrugId) => void
  /** Facilitator-only: immediately nudges MAP up by reducing the deterioration offset (blunt, not gradual). */
  forceImprove: (mmHg: number) => void
  /** Facilitator-only: immediately nudges MAP down by increasing the deterioration offset, capped at the scenario's maxDrop (blunt, not gradual). */
  forceWorsen: (mmHg: number) => void
  /** Facilitator-only: live-edits an in-progress order's max dose, increment, minimum interval, or target value. */
  updateOrder: (
    orderId: string,
    patch: Partial<{ maxDose: number; increment: number; intervalMinMinutes: number; targetValue: number }>,
  ) => void

  completeBeginBag: (infusionId: string) => void
  /**
   * Materializes a sequence>1 order's infusion the moment it becomes activation-eligible,
   * completing Begin Bag in the same action — closes the gap where a sequence>1 drug
   * (activated mid-sim) had no infusion object at all until first dose-submit, unlike a
   * sequence-1 drug (pre-seeded `hanging` by the scenario at minute 0). See the doc
   * comment on the implementation below for why "create" and "complete Begin Bag" are
   * one action here, not two.
   */
  beginBagForOrder: (orderId: string) => void
  /**
   * Handles both initiation (no/hanging infusion) and titration (infusing), keyed by
   * order. Returns the LogEntry it created (null if it bailed early or deferred to
   * pendingOverride) — chooseDecisionOption uses the return value to derive a real
   * DecisionTone from the actual outcome. `fromDecisionPanel: true` (set only by
   * chooseDecisionOption) skips the training-mode pendingOverride detour for an
   * off-order pick — the decision option's own authored feedback already carries the
   * coaching role that detour exists for; a normal, non-decision-panel manual titration
   * is completely unaffected. `opts.independentCheck` (Phase 19d) carries the second
   * nurse's identity for a drug requiring an independent double-check at initiation —
   * see MEDICATION_VERIFICATION and the hard gate inside this action.
   */
  submitDose: (
    orderId: string,
    dose: number,
    opts?: { fromDecisionPanel?: boolean; independentCheck?: { secondCheckName: string; secondCheckRole: string } },
  ) => LogEntry | null
  /** Applies a pending training-mode override: logs it as 'applied'/overridden and mutates the infusion. */
  confirmDoseOverride: () => void
  /** Rejects a pending training-mode override: logs it as 'off-order', infusion untouched. */
  cancelDoseOverride: () => void
  /** Opens a decision point by id, marking it shown for the rest of the session (Phase 18). */
  presentDecisionPoint: (decisionPointId: string) => void
  /** Resolves the pending decision point by running the picked option's real effect, deriving its tone from that real outcome, and logging one decision-tagged marker entry (Phase 18). */
  chooseDecisionOption: (optionId: string) => void
  /** Declines to act on a pending decision point for now — no LogEntry (nothing happened); it stays marked shown, so it won't re-fire. */
  dismissDecisionPoint: () => void
  /** Declines a pending pacing offer for now — no LogEntry, resumes manual titration. */
  dismissPacingOffer: () => void
  /** Runs a multi-step titration plan toward targetDose for the decision point's (or pacing offer's) order, one correctly-spaced dose + auto-chart entry per step. */
  runMultiStepTitration: (orderId: string, targetDose: number) => void
  notifyProvider: (orderId: string, reason?: string) => void
  chartVitals: () => void
  /** Backdates a chart entry to a past minute, auto-filling the vitals actually recorded then (vitalsHistory) — never freely entered or graded on recall. */
  chartRetrospective: (forMinute: number) => void
  advanceClock: (byMinutes: number) => void

  /** Stops an infusing infusion. Not verification-gated — no drug identity/dose is being administered. */
  pauseInfusion: (infusionId: string) => void
  /** Resumes a paused infusion at the rate in effect immediately before pausing (RESTART_AFTER_PAUSE_RULE) — not a free-choice dose. */
  restartInfusion: (infusionId: string) => void
  /** Removes the infusion entirely (CP 4-156: removed from pump, disconnected, discarded) and charts in MAR. */
  discontinueInfusion: (infusionId: string) => void
  /** Declares an emergent Block of Charting for an already-infusing order — titrate-as-needed until closed. */
  declareBlockOfCharting: (orderId: string) => void
  closeBlockOfCharting: () => void
}

function initialSimFields(
  scenario: ScenarioConfig,
  mode: SimMode,
  vitalOverrides: Partial<Pick<VitalSigns, 'hr' | 'sbp' | 'dbp' | 'spo2'>> = {},
) {
  return {
    mode,
    scenario,
    clockMinutes: 0,
    infusions: scenario.initialInfusions.map((i) => ({ ...i })),
    // A standing facilitator vital override (Phase 10) applies to this scenario's
    // OPENING vitals too, not just live mid-session ticks — see advanceClock.
    vitals: { ...scenario.startingVitals, ...vitalOverrides },
    orders: scenario.orders.map((o) => ({ ...o, activatesWhen: deriveActivationText(o, scenario.orders) })),
    log: [] as LogEntry[],
    verificationFlags: {} as Record<string, boolean>,
    independentCheckFlags: {} as Record<string, boolean>,
    adherenceFlags: {} as Record<string, boolean>,
    lastPhysiologyUpdate: null as
      | { minute: number; map: number; hr: number; spo2: number; rass: number; painScore: number }
      | null,
    deteriorationOffset: 0,
    activeBlockOfCharting: null as BlockOfChartingRecord | null,
    blockOfChartingHistory: [] as BlockOfChartingRecord[],
    pendingOverride: null as PendingOverride | null,
    pendingDecisionPoint: null as PendingDecisionPoint | null,
    pendingClockAdvanceMinutes: null as number | null,
    decisionPointsShown: {} as Record<string, boolean>,
    pacingTitrationsSinceOffer: {} as Record<string, number>,
    pendingPacingOffer: null as PendingPacingOffer | null,
    vitalsHistory: [{ minute: 0, vitals: { ...scenario.startingVitals } }],
    feedback: null as FeedbackMessage | null,
  }
}

export const useSimStore = create<SimStore>((set, get) => ({
  phase: 'intro' as Phase,
  // Not part of initialSimFields — proctor identity and facilitator overrides persist
  // across scenario restarts within the same facilitated session, unlike the rest of
  // sim state (vitalOverrides is explicitly re-applied to each new scenario's opening
  // vitals by startScenario below, rather than being wiped by it).
  proctor: null as ProctorRecord | null,
  vitalOverrides: {} as SimStore['vitalOverrides'],
  responseModelOverrides: {} as SimStore['responseModelOverrides'],
  ...initialSimFields(DEFAULT_SCENARIO, 'training'),

  setPhase: (phase) => set({ phase }),
  setProctor: (name, email) => set({ proctor: { name, email, recordedAt: new Date().toISOString() } }),

  startScenario: (nextScenario, mode) => set((s) => initialSimFields(nextScenario, mode, s.vitalOverrides)),

  dismissFeedback: () => set({ feedback: null }),

  commitVitalOverride: (key, value) => {
    const state = get()
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Facilitator set ${key.toUpperCase()} to ${value} (live override).`,
    }
    set((s) => ({
      vitals: { ...s.vitals, [key]: value },
      vitalOverrides: { ...s.vitalOverrides, [key]: value },
      log: [...s.log, entry],
    }))
  },

  clearVitalOverride: (key) =>
    set((s) => {
      const nextOverrides = { ...s.vitalOverrides }
      delete nextOverrides[key]
      return { vitalOverrides: nextOverrides }
    }),

  setResponseModelOverride: (drugId, maxMapContribution) =>
    set((s) => ({ responseModelOverrides: { ...s.responseModelOverrides, [drugId]: maxMapContribution } })),

  clearResponseModelOverride: (drugId) =>
    set((s) => {
      const next = { ...s.responseModelOverrides }
      delete next[drugId]
      return { responseModelOverrides: next }
    }),

  forceImprove: (mmHg) =>
    set((s) => {
      const delta = Math.min(mmHg, s.deteriorationOffset)
      return {
        deteriorationOffset: s.deteriorationOffset - delta,
        vitals: { ...s.vitals, map: s.vitals.map + delta },
        lastPhysiologyUpdate: s.lastPhysiologyUpdate
          ? { ...s.lastPhysiologyUpdate, minute: s.clockMinutes, map: s.vitals.map + delta }
          : s.lastPhysiologyUpdate,
      }
    }),

  forceWorsen: (mmHg) =>
    set((s) => {
      const maxDrop = s.scenario.deterioration.maxDrop
      const delta = Math.min(mmHg, Math.max(0, maxDrop - s.deteriorationOffset))
      return {
        deteriorationOffset: s.deteriorationOffset + delta,
        vitals: { ...s.vitals, map: s.vitals.map - delta },
        lastPhysiologyUpdate: s.lastPhysiologyUpdate
          ? { ...s.lastPhysiologyUpdate, minute: s.clockMinutes, map: s.vitals.map - delta }
          : s.lastPhysiologyUpdate,
      }
    }),

  updateOrder: (orderId, patch) => {
    const state = get()
    const order = state.orders.find((o) => o.id === orderId)
    if (!order) return
    const drug = getDrug(order.drugId)
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Facilitator edited the ${drug.name} order.`,
      orderId,
      drugId: order.drugId,
    }
    set((s) => ({
      orders: s.orders.map((o) => {
        if (o.id !== orderId) return o
        return {
          ...o,
          maxDose: patch.maxDose ?? o.maxDose,
          increment: patch.increment ?? o.increment,
          interval: patch.intervalMinMinutes != null ? { ...o.interval, minMinutes: patch.intervalMinMinutes } : o.interval,
          target: patch.targetValue != null ? { ...o.target, value: patch.targetValue } : o.target,
        }
      }),
      log: [...s.log, entry],
    }))
  },

  // Ungated, like pause/restart/discontinue — BCMA/I-TRACE verification is no longer a
  // separate Begin-Bag-time event (see submitDose's initiate path): the one comprehensive
  // check happens when the starting dose is programmed, covering the bag AND the dose
  // together, matching how a nurse actually verifies once at the bedside rather than twice.
  completeBeginBag: (infusionId) => {
    const state = get()
    const infusion = state.infusions.find((i) => i.id === infusionId)
    if (!infusion || infusion.beginBagCompleted) return
    const drug = getDrug(infusion.drugId)

    const actionEntry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Begin Bag: ${drug.name} bag hung, ready to program.`,
      orderId: infusion.orderId,
      drugId: infusion.drugId,
      outcome: 'applied',
    }
    const marEntry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'documentation',
      location: correctLocationFor('beginBag'),
      summary: `Begin Bag charted in MAR: ${drug.name}.`,
      orderId: infusion.orderId,
      drugId: infusion.drugId,
    }

    set((s) => ({
      infusions: s.infusions.map((i) => (i.id === infusionId ? { ...i, beginBagCompleted: true } : i)),
      log: [...s.log, actionEntry, marEntry],
      adherenceFlags: { ...s.adherenceFlags, [actionEntry.id]: true },
      feedback: {
        tone: 'success',
        title: 'Begin Bag complete',
        message: `${drug.name} is hung and ready — BCMA/I-TRACE verification happens when you program the starting dose.`,
      },
    }))
  },

  /**
   * Materializes a sequence>1 order's infusion the moment it becomes activation-eligible,
   * completing Begin Bag in the same action — for a newly-activating drug, hanging the bag
   * and charting it in MAR really is one real-world moment (unlike sequence-1's two-step UI
   * flow, which is only two clicks because the scenario data happens to pre-seed the hanging
   * state before the sim even starts, not because bag-hanging is inherently two steps). A
   * no-op if this order already has an infusion (shouldn't happen in practice — DoseEntryControl
   * only ever offers this action when `!infusion`).
   */
  beginBagForOrder: (orderId) => {
    const state = get()
    const order = state.orders.find((o) => o.id === orderId)
    if (!order || state.infusions.some((i) => i.orderId === orderId)) return
    const drug = getDrug(order.drugId)

    const infusion: Infusion = {
      id: nextId('infusion'),
      orderId,
      drugId: order.drugId,
      status: 'hanging',
      rate: 0,
      initialRate: null,
      channel: nextChannelLetter(state.infusions),
      beginBagCompleted: true,
      lastActionMinute: null,
      stoppedAtMinute: null,
      rateBeforePause: null,
    }
    const actionEntry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Begin Bag: ${drug.name} bag hung, ready to program.`,
      orderId,
      drugId: order.drugId,
      outcome: 'applied',
    }
    const marEntry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'documentation',
      location: correctLocationFor('beginBag'),
      summary: `Begin Bag charted in MAR: ${drug.name}.`,
      orderId,
      drugId: order.drugId,
    }

    set((s) => ({
      infusions: [...s.infusions, infusion],
      log: [...s.log, actionEntry, marEntry],
      adherenceFlags: { ...s.adherenceFlags, [actionEntry.id]: true },
      feedback: {
        tone: 'success',
        title: 'Begin Bag complete',
        message: `${drug.name} is hung and ready — BCMA/I-TRACE verification happens when you program the starting dose.`,
      },
    }))
  },

  submitDose: (orderId, dose, opts) => {
    const state = get()
    const order = state.orders.find((o) => o.id === orderId)
    if (!order || state.phase !== 'sim') return null
    const drug = getDrug(order.drugId)
    const infusion = state.infusions.find((i) => i.orderId === orderId) ?? null
    const action: TitrationAction = !infusion || infusion.status === 'hanging' ? 'initiate' : 'titrate'

    if (infusion && action === 'initiate' && !infusion.beginBagCompleted) {
      set({
        feedback: {
          tone: 'danger',
          title: 'Begin Bag required',
          message: `Complete Begin Bag verification for ${drug.name} in the MAR before starting this infusion.`,
        },
      })
      return null
    }

    // Phase 19d: an ADDITIONAL independent (two-nurse) double-check gate, on top of the
    // BCMA/I-TRACE check every drug gets, for genuinely high-alert drugs only (fentanyl,
    // per data/policy.ts's per-DrugId MEDICATION_VERIFICATION) — mirrors the
    // beginBagCompleted gate immediately above in placement/shape. Initiation only,
    // matching every other verification precedent in this sim (titration of an
    // already-verified infusion is never re-gated).
    if (
      infusion &&
      action === 'initiate' &&
      MEDICATION_VERIFICATION[order.drugId].independentDoubleCheckRequired &&
      !opts?.independentCheck
    ) {
      set({
        feedback: {
          tone: 'danger',
          title: 'Independent double-check required',
          message: `${drug.name} is high-alert — complete an independent (two-nurse) double-check before programming.`,
        },
      })
      return null
    }

    if (infusion && infusion.status === 'stopped') {
      set({
        feedback: {
          tone: 'danger',
          title: 'Infusion paused',
          message: `${drug.name} is paused — restart at the prior rate, or discontinue, before titrating.`,
        },
      })
      return null
    }

    // Block of Charting (CP 4-156's emergent pathway): once declared for THIS order, the
    // nurse may titrate as needed — order-compliance (interval/increment/max/sequence/
    // target) is bypassed. Guardrails' hard limit is NOT bypassed: it's a mechanical pump
    // ceiling, not a clinical judgment call, so even a declared emergency can't exceed it.
    // Only applies to titrate — a block doesn't let you skip Begin Bag / start-dose rules
    // for a brand-new infusion.
    const blockActive = action === 'titrate' && state.activeBlockOfCharting?.orderId === orderId

    const guardEval = evaluateDose(dose, limitsFromOrder(order, drug))
    const result: TitrationResult = blockActive
      ? { status: 'ok', reasons: [], violations: {} }
      : evaluateTitration({
          action,
          order,
          currentDose: infusion?.rate ?? 0,
          proposedDose: dose,
          currentMinute: state.clockMinutes,
          lastActionMinute: infusion?.lastActionMinute ?? null,
          vitals: state.vitals,
          priorAgentActivationMet:
            order.sequence === 1 || priorAgentsActivationMet(state.infusions, state.orders, state.vitals, order),
          priorAgentsWeaned: priorAgentsWeaned(state.infusions, state.orders, order),
        })

    // Guardrails hard limit is an absolute pump ceiling — it wins over everything else,
    // including needs-provider, because the pump would mechanically refuse the dose no
    // matter how clinically justified the request is. needs-provider is only reachable
    // in the band between the order's own max and the drug's (potentially higher) hard
    // ceiling — e.g. a prescriber-customized order max below Attachment B's default.
    const outcome = (
      guardEval.status === 'hardLimitBlocked' ? 'hardLimitBlocked' : result.status === 'ok' ? 'applied' : result.status
    ) as 'applied' | 'off-order' | 'needs-provider' | 'hardLimitBlocked'

    // Off-order in training mode needs a learner decision before the outcome is final —
    // deferred here rather than logged-then-patched, since a written LogEntry is never
    // mutated elsewhere in this codebase (faithful audit trail). Skipped when the pick
    // came from a decision panel (opts.fromDecisionPanel) — the option's own authored
    // feedback already explains the "why," so a second confirmation modal on top of the
    // decision card would be redundant; falls through to the same silent-apply path
    // validation mode already uses. A normal, non-decision-panel manual titration is
    // completely unaffected by this flag.
    if (outcome === 'off-order' && state.mode === 'training' && !opts?.fromDecisionPanel) {
      set({
        pendingOverride: {
          orderId,
          dose,
          action,
          reasons: result.reasons,
          violations: result.violations,
          guardrailStatus: guardEval.status,
        },
      })
      return null
    }

    // Validation mode applies an off-order dose silently — a real Alaris pump doesn't
    // know the written order, only its own Guardrails limits — and scores it at debrief
    // via `overridden` + adherenceFlags rather than blocking it live.
    const overridden = outcome === 'off-order' ? true : undefined
    const finalOutcome = overridden ? 'applied' : outcome

    // Only meaningful once the dose actually reaches the infusion — never for hard-blocked
    // or needs-provider attempts, which never applied at this rate.
    const crossedEarlyThreshold =
      finalOutcome === 'applied' &&
      action === 'titrate' &&
      !blockActive &&
      crossedEarlyNotificationThreshold(order, infusion?.rate ?? 0, dose, state.vitals)

    // Phase 19d: by the time we reach here, the hard gate above has already guaranteed
    // opts.independentCheck is present for any initiate on a drug requiring it — so this
    // is really "was the check required (and therefore performed)," not a live condition.
    const requiresIndependentCheck = action === 'initiate' && MEDICATION_VERIFICATION[order.drugId].independentDoubleCheckRequired

    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `${action === 'initiate' ? 'Initiate' : 'Titrate'} ${drug.name} to ${dose} ${drug.unit} — ${finalOutcome}${blockActive ? ' (Block of Charting)' : ''}.`,
      orderId: order.id,
      drugId: order.drugId,
      doseAction: action,
      dose,
      outcome: finalOutcome,
      violations: result.violations,
      guardrailStatus: guardEval.status,
      underBlockOfCharting: blockActive || undefined,
      overridden,
      earlyNotificationDue: crossedEarlyThreshold || undefined,
      secondCheckName: requiresIndependentCheck ? opts?.independentCheck?.secondCheckName : undefined,
      secondCheckRole: requiresIndependentCheck ? opts?.independentCheck?.secondCheckRole : undefined,
    }

    // BCMA/I-TRACE verification only runs at Begin Bag / initiation (see Simulation.tsx's
    // narrowed PendingAction) — titrations are ungated, so only initiate entries are
    // "verifiable" at all (scoring.ts category 4 keys off key presence, not just value).
    // independentCheckFlags mirrors verificationFlags exactly, but only for drugs whose
    // MEDICATION_VERIFICATION requires the independent double-check (see the hard gate
    // above, which is what actually guarantees this is true whenever it's required).
    set((s) => ({
      log: [...s.log, entry],
      verificationFlags: action === 'initiate' ? { ...s.verificationFlags, [entry.id]: true } : s.verificationFlags,
      independentCheckFlags: requiresIndependentCheck
        ? { ...s.independentCheckFlags, [entry.id]: true }
        : s.independentCheckFlags,
      adherenceFlags: { ...s.adherenceFlags, [entry.id]: result.status === 'ok' },
    }))

    if (finalOutcome === 'hardLimitBlocked') {
      // Phase 19c: a matching, not-yet-shown 'escalationAttempt' decision point (if any)
      // wins over the routine "Blocked by Guardrails" toast — presenting the real "what's
      // your next move" choice instead. No scenario authors this trigger yet (19g's job),
      // so this is a no-op for every scenario today — today's toast fires unchanged.
      const escalationId = findEscalationAttemptDecisionPointId(state.scenario, state.decisionPointsShown, orderId)
      if (escalationId) {
        get().presentDecisionPoint(escalationId)
        return entry
      }
      set({
        feedback: {
          tone: 'danger',
          title: 'Blocked by Guardrails',
          message: `The Alaris pump will not accept ${dose} ${drug.unit} — outside the configured hard limit (${guardEval.limits.hardMin}-${guardEval.limits.hardMax} ${drug.unit}).`,
        },
      })
      return entry
    }

    if (finalOutcome === 'needs-provider') {
      // Same precedence as the hardLimitBlocked branch above.
      const escalationId = findEscalationAttemptDecisionPointId(state.scenario, state.decisionPointsShown, orderId)
      if (escalationId) {
        get().presentDecisionPoint(escalationId)
        return entry
      }
      set({
        feedback:
          state.mode === 'training'
            ? { tone: 'warning', title: 'Notify the provider', message: result.reasons.join(' ') }
            : { tone: 'danger', title: 'Not accepted', message: 'This dose was not accepted. Reassess and try again.' },
      })
      return entry
    }

    // finalOutcome === 'applied' — a clean order-compliant dose, or a validation-mode/
    // decision-panel silent override (see `overridden` above).
    set((s) => computeApplyUpdate(s, order, drug, infusion, action, dose))

    // Precedence: a triggered decision point (if any — see deriveTriggeredDecisionPointId)
    // wins over the routine post-titrate prompt, opening the interactive decision card
    // instead of just a toast. The routine post-titrate prompt itself names the interval
    // and prompts reassessment rather than just confirming the dose landed. Initiate keeps
    // its own distinct message (it's not itself an interval to reassess after).
    // advanceClock's own more-urgent overrides (2hr-stopped, 4hr-block, deterioration-
    // started) still get final say, unchanged, since it runs after this and only
    // overwrites `feedback` when one of those newly applies.
    const freshAfterApply = get()
    const triggeredDecisionPointId = deriveTriggeredDecisionPointId(
      freshAfterApply.scenario,
      freshAfterApply.orders,
      freshAfterApply.infusions,
      freshAfterApply.vitals,
      freshAfterApply.decisionPointsShown,
      order.id,
      infusion?.rate ?? 0,
      dose,
      action,
    )
    if (triggeredDecisionPointId) {
      get().presentDecisionPoint(triggeredDecisionPointId)
    } else if (action === 'titrate') {
      set({
        feedback: {
          tone: 'info',
          title: `${order.interval.minMinutes} min have passed`,
          message: `${drug.name} now at ${dose} ${drug.unit}. Chart vitals and reassess before your next titration.`,
        },
      })
    } else {
      set({
        feedback: {
          tone: 'success',
          title: 'Infusion started',
          message: `${drug.name} now at ${dose} ${drug.unit}. Time will auto-advance ${order.interval.minMinutes} min — chart vitals and reassess before titrating.`,
        },
      })
    }

    // Every manual titrate on this order (clean or off-order-but-applied) counts toward
    // the pacing offer — skipped under Block of Charting, where free titration is already
    // sanctioned and a pacing nudge would just be noise. A one-time starting dose isn't
    // part of the "repeated manual titrations" pattern the pacing offer tracks.
    if (action === 'titrate' && !blockActive) applyPacingTrigger(get, set, order.id, crossedEarlyThreshold, dose < (infusion?.rate ?? 0))

    // Both initiating and titrating advance the clock by the order's own interval — the
    // pump doesn't know or care which kind of dose-change just happened. A facilitator-
    // driven-vs-auto pacing toggle is planned for Phase 10 — auto is the only mode until
    // then. BUT when this same dose just triggered a decision point, the advance is
    // withheld instead of applied — advancing right away would let vitals keep
    // interpolating (and the wean-eligible clock check inside advanceClock keep firing)
    // past the exact moment the card's authored text describes, so a nurse reading it a
    // few seconds later could see a live number that already contradicts what the card
    // says. It's applied instead the moment that decision resolves — see
    // resolveDeferredClockAdvance.
    if (triggeredDecisionPointId) {
      set({ pendingClockAdvanceMinutes: order.interval.minMinutes })
    } else {
      get().advanceClock(order.interval.minMinutes)
    }

    return entry
  },

  confirmDoseOverride: () => {
    const state = get()
    const pending = state.pendingOverride
    if (!pending) return
    const order = state.orders.find((o) => o.id === pending.orderId)
    if (!order) {
      set({ pendingOverride: null })
      return
    }
    const drug = getDrug(order.drugId)
    const infusion = state.infusions.find((i) => i.orderId === pending.orderId) ?? null

    const crossedEarlyThreshold =
      pending.action === 'titrate' &&
      crossedEarlyNotificationThreshold(order, infusion?.rate ?? 0, pending.dose, state.vitals)

    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `${pending.action === 'initiate' ? 'Initiate' : 'Titrate'} ${drug.name} to ${pending.dose} ${drug.unit} — applied via override.`,
      orderId: order.id,
      drugId: order.drugId,
      doseAction: pending.action,
      dose: pending.dose,
      outcome: 'applied',
      violations: pending.violations,
      guardrailStatus: pending.guardrailStatus,
      overridden: true,
      earlyNotificationDue: crossedEarlyThreshold || undefined,
    }

    set((s) => ({
      log: [...s.log, entry],
      verificationFlags: pending.action === 'initiate' ? { ...s.verificationFlags, [entry.id]: true } : s.verificationFlags,
      adherenceFlags: { ...s.adherenceFlags, [entry.id]: false },
      pendingOverride: null,
    }))

    set((s) => computeApplyUpdate(s, order, drug, infusion, pending.action, pending.dose))

    // Same precedence as submitDose's applied path: a triggered decision point, if any,
    // wins over the routine "applied via override" confirmation.
    const freshAfterApply = get()
    const triggeredDecisionPointId = deriveTriggeredDecisionPointId(
      freshAfterApply.scenario,
      freshAfterApply.orders,
      freshAfterApply.infusions,
      freshAfterApply.vitals,
      freshAfterApply.decisionPointsShown,
      order.id,
      infusion?.rate ?? 0,
      pending.dose,
      pending.action,
    )
    if (triggeredDecisionPointId) {
      get().presentDecisionPoint(triggeredDecisionPointId)
    } else {
      set({
        feedback: {
          tone: 'warning',
          title: 'Applied via override',
          message: `${drug.name} now at ${pending.dose} ${drug.unit} — logged as an override for debrief.`,
        },
      })
    }

    if (pending.action === 'titrate')
      applyPacingTrigger(get, set, order.id, crossedEarlyThreshold, pending.dose < (infusion?.rate ?? 0))

    // Same deferred-advance treatment as submitDose's own applied path — see
    // resolveDeferredClockAdvance.
    if (triggeredDecisionPointId) {
      set({ pendingClockAdvanceMinutes: order.interval.minMinutes })
    } else {
      get().advanceClock(order.interval.minMinutes)
    }
  },

  cancelDoseOverride: () => {
    const state = get()
    const pending = state.pendingOverride
    if (!pending) return
    const order = state.orders.find((o) => o.id === pending.orderId)
    const drug = order ? getDrug(order.drugId) : null
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `${pending.action === 'initiate' ? 'Initiate' : 'Titrate'} ${drug?.name ?? ''} to ${pending.dose} ${drug?.unit ?? ''} — off-order.`,
      orderId: pending.orderId,
      drugId: order?.drugId,
      doseAction: pending.action,
      dose: pending.dose,
      outcome: 'off-order',
      violations: pending.violations,
      guardrailStatus: pending.guardrailStatus,
    }
    set((s) => ({
      log: [...s.log, entry],
      verificationFlags: pending.action === 'initiate' ? { ...s.verificationFlags, [entry.id]: true } : s.verificationFlags,
      adherenceFlags: { ...s.adherenceFlags, [entry.id]: false },
      pendingOverride: null,
      feedback: {
        tone: 'warning',
        title: 'Off-order — not applied',
        message: pending.reasons.join(' '),
      },
    }))
  },

  presentDecisionPoint: (decisionPointId) =>
    set((s) => ({
      pendingDecisionPoint: { decisionPointId },
      decisionPointsShown: { ...s.decisionPointsShown, [decisionPointId]: true },
      // Clear any stale toast from a prior action — the decision card is now the
      // primary attention surface, and a lingering toast (e.g. naming an old dose)
      // would contradict what the card and pump now show.
      feedback: null,
    })),

  chooseDecisionOption: (optionId) => {
    const state = get()
    const pending = state.pendingDecisionPoint
    const dp = pending
      ? resolveDecisionPoint(state.scenario.decisionPoints ?? [], state.orders, pending.decisionPointId)
      : null
    const option = dp?.options.find((o) => o.id === optionId)
    if (!dp || !option) return
    set({ pendingDecisionPoint: null })
    // Catch the clock up to what the triggering dose already earned BEFORE running
    // whatever the learner picked — see resolveDeferredClockAdvance's own doc for why
    // this has to happen first, not after.
    resolveDeferredClockAdvance(get, set)

    // Declining to act — no LogEntry, no scoring impact, the learner just resumes free
    // titration via the real dose-entry control. Doesn't unmark decisionPointsShown
    // (that already happened in presentDecisionPoint), so this specific point can't
    // re-fire, matching every other pick's once-per-session behavior.
    if (option.effect.kind === 'resumeManual') return

    // Tone is derived from the REAL effect's outcome wherever one exists — never
    // hand-authored (see DecisionTone's doc comment in state/types.ts). Each effect
    // kind reuses an existing store action verbatim; a decision point never bypasses
    // the real engine, it just offers a menu of real actions to choose from.
    let tone: DecisionTone
    const effect = option.effect
    switch (effect.kind) {
      case 'submitDose': {
        const entry = get().submitDose(effect.orderId, effect.dose, { fromDecisionPanel: true })
        tone = entry ? toneFromDoseOutcome(entry.outcome, entry.overridden) : 'critical'
        break
      }
      case 'submitDoseRelative': {
        const relOrder = get().orders.find((o) => o.id === effect.orderId)
        const relInfusion = get().infusions.find((i) => i.orderId === effect.orderId)
        const base = relInfusion?.rate ?? relOrder?.startDose ?? 0
        const dose = relOrder ? Math.round((base + effect.deltaSteps * relOrder.increment) * 1e6) / 1e6 : base
        const entry = get().submitDose(effect.orderId, dose, { fromDecisionPanel: true })
        tone = entry ? toneFromDoseOutcome(entry.outcome, entry.overridden) : 'critical'
        break
      }
      case 'multiStepTitration': {
        const before = get().infusions.find((i) => i.orderId === effect.orderId)?.rate ?? 0
        get().runMultiStepTitration(effect.orderId, effect.targetDose)
        const after = get().infusions.find((i) => i.orderId === effect.orderId)?.rate ?? 0
        tone = after !== before ? 'good' : 'caution'
        break
      }
      case 'notifyProvider':
        get().notifyProvider(effect.orderId, `Decision point: ${option.label}`)
        tone = 'good'
        break
      case 'chartVitals':
        get().chartVitals()
        tone = 'good'
        break
      case 'none':
        tone = option.manualTone ?? 'critical'
        break
    }

    const markerEntry: LogEntry = {
      id: nextId('log'),
      minute: get().clockMinutes,
      type: 'action',
      summary: `Decision (${dp.trapType}): chose "${option.label}".`,
      decisionPointId: dp.id,
      decisionOptionId: option.id,
      decisionTone: tone,
    }
    set((s) => ({ log: [...s.log, markerEntry] }))

    set({
      feedback:
        get().mode === 'training'
          ? {
              tone: tone === 'good' ? 'success' : tone === 'caution' ? 'warning' : 'danger',
              title: option.label,
              message: option.feedback.text,
            }
          : { tone: 'info', title: 'Choice recorded', message: 'This decision is reviewed at debrief.' },
    })
  },

  dismissDecisionPoint: () => {
    set({ pendingDecisionPoint: null })
    resolveDeferredClockAdvance(get, set)
  },

  dismissPacingOffer: () => set({ pendingPacingOffer: null }),

  runMultiStepTitration: (orderId, targetDose) => {
    // No pending-state guard here (unlike the retired runGuidedTitrationLeap's
    // checkpoint/pacing-offer match) — this action now has two legitimate callers:
    // chooseDecisionOption (which already clears pendingDecisionPoint before calling
    // this, by design — see there) and PacingOfferPanel's "Apply these steps" button
    // (only ever rendered for the order its own pendingPacingOffer names). Both are
    // UI-trusted call paths; the real safety check that matters is below (a real,
    // currently-infusing order to act on).
    const order = get().orders.find((o) => o.id === orderId)
    const infusion = get().infusions.find((i) => i.orderId === orderId)
    // Idempotent with chooseDecisionOption's own clear (redundant on that call path,
    // but this action can also be invoked directly — e.g. a test or a future UI call
    // site driving it straight from a still-pending decision point) — always leaves
    // both pending-panel fields clear before running.
    set({ pendingPacingOffer: null, pendingDecisionPoint: null })
    if (!order || !infusion || infusion.status !== 'infusing') return
    const drug = getDrug(order.drugId)
    const isDownward = targetDose < infusion.rate

    // Safety gate: mirrors evaluateTitration's own wrongWeanOrder check exactly (reusing
    // the same exported priorAgentsWeaned, not reimplementing it) — a down-titration
    // plan through this convenience mechanic must be refused under the exact same
    // condition a manual down-titrate would be, so the auto-titrate shortcut can never
    // become a silent way around the weaning safety net.
    if (isDownward && order.weanOrder != null && !priorAgentsWeaned(get().infusions, get().orders, order)) {
      set({
        feedback: {
          tone: 'danger',
          title: 'Lower-weanOrder agent not yet cleared',
          message: `A lower-weanOrder agent must be weaned to at or below its own starting dose before ${drug.name} can be titrated down — no steps were applied.`,
        },
      })
      return
    }

    // A weaning order's auto-down-titration floors at its own ordered starting dose
    // (matching priorAgentsWeaned's own definition of "cleared"), not all the way to 0 —
    // an order with no weanOrder floors at plain 0 (evaluateTitration only forbids <= 0).
    // Upward plans are unaffected — no floor argument applies to a climb.
    const plan = isDownward
      ? computeMultiStepDoses(infusion.rate, order.increment, order.maxDose, targetDose, order.weanOrder != null ? order.startDose : 0)
      : computeMultiStepDoses(infusion.rate, order.increment, order.maxDose, targetDose)

    let appliedCount = 0
    let interruptedByDecisionPoint = false
    for (const dose of plan.doses) {
      const s = get()
      // Only the upward case should stop the instant target is met — a downward/weaning
      // plan's whole premise is that target is ALREADY met throughout (that's why weaning
      // is safe to do), so this same check would wrongly break before applying even one
      // step of a legitimate down-titration.
      if (!isDownward && meetsTarget(resolveTargetValue(s.vitals, order.target.metric), order.target)) break
      const currentInfusion = s.infusions.find((i) => i.orderId === orderId) ?? null
      const actionEntry: LogEntry = {
        id: nextId('log'),
        minute: s.clockMinutes,
        type: 'action',
        summary: `Titrate ${drug.name} to ${dose} ${drug.unit} — applied (auto-charted, multi-step).`,
        orderId: order.id,
        drugId: order.drugId,
        doseAction: 'titrate',
        dose,
        outcome: 'applied',
        autoGeneratedByMultiStep: true,
      }
      const vitalsEntry: LogEntry = { ...buildVitalsLogEntry(s.clockMinutes, s.vitals, s.clockMinutes), autoGeneratedByMultiStep: true }
      const applyUpdate = computeApplyUpdate(s, order, drug, currentInfusion, 'titrate', dose)
      set({
        infusions: applyUpdate.infusions,
        log: [...applyUpdate.log, vitalsEntry, actionEntry],
        lastPhysiologyUpdate: applyUpdate.lastPhysiologyUpdate,
        adherenceFlags: { ...s.adherenceFlags, [actionEntry.id]: true },
      })
      appliedCount += 1

      // Check the decision trigger at the exact moment THIS dose applied — BEFORE
      // advancing the clock for it — matching submitDose/confirmDoseOverride's own
      // semantics (see resolveDeferredClockAdvance): a card must describe the instant
      // its triggering dose landed, not a later moment after this step's own interval
      // has already quietly moved the vitals further. A plan that starts below a real
      // decision-point trigger (e.g. from a pacing offer, unlike a decision option's own
      // plan, which always starts AT the crossing dose) can cross one mid-flight — check
      // every step, not just once at the start (see deriveTriggeredDecisionPointId).
      const fresh = get()
      const triggeredId = deriveTriggeredDecisionPointId(
        fresh.scenario,
        fresh.orders,
        fresh.infusions,
        fresh.vitals,
        fresh.decisionPointsShown,
        orderId,
        currentInfusion?.rate ?? 0,
        dose,
        'titrate',
      )
      if (triggeredId) {
        // Stop here — the same real decision a manually-titrating nurse would hit at
        // this exact dose takes over; no "steps applied" toast competing with the card,
        // and this step's own clock advance (plus every remaining planned step) stays
        // withheld until the decision resolves — see resolveDeferredClockAdvance.
        get().presentDecisionPoint(triggeredId)
        set((st) => ({
          pacingTitrationsSinceOffer: { ...st.pacingTitrationsSinceOffer, [orderId]: 0 },
          pendingClockAdvanceMinutes: order.interval.minMinutes,
        }))
        interruptedByDecisionPoint = true
        break
      }
      get().advanceClock(order.interval.minMinutes)
    }

    if (!interruptedByDecisionPoint) {
      const finalRate = get().infusions.find((i) => i.orderId === orderId)?.rate
      set({
        feedback:
          appliedCount > 0
            ? {
                tone: 'success',
                title: 'Multi-step titration complete',
                message: `${drug.name} titrated to ${finalRate} ${drug.unit} over ${appliedCount} step${appliedCount === 1 ? '' : 's'}. Review the history for each step's charted vitals.`,
              }
            : {
                tone: 'info',
                title: 'No titration needed',
                message: `${order.target.metric} target is already met — no additional steps were applied.`,
              },
      })
    }
  },

  notifyProvider: (orderId, reason) => {
    const state = get()
    const order = state.orders.find((o) => o.id === orderId)
    const drug = order ? getDrug(order.drugId) : null
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Provider notified${drug ? ` regarding ${drug.name}` : ''}${reason ? `: ${reason}` : '.'}`,
      orderId: order?.id,
      drugId: order?.drugId,
      isProviderNotification: true,
    }
    set((s) => ({
      log: [...s.log, entry],
      feedback: {
        tone: 'info',
        title: 'Provider notified',
        message: 'Documented. Await new orders before proceeding beyond the current order.',
      },
    }))
  },

  chartVitals: () => {
    const state = get()
    const entry = buildVitalsLogEntry(state.clockMinutes, state.vitals, state.clockMinutes)
    set((s) => ({
      log: [...s.log, entry],
      feedback: { tone: 'success', title: 'Charted', message: 'Vitals recorded in iView.' },
    }))
  },

  chartRetrospective: (forMinute) => {
    const state = get()
    if (forMinute < 0 || forMinute > state.clockMinutes) return
    // Closest snapshot at or before the requested minute — auto-filled, never freely
    // entered (see the type's doc comment: this isn't graded on recall).
    const candidate = state.vitalsHistory
      .filter((h) => h.minute <= forMinute)
      .reduce((best, h) => (best == null || h.minute > best.minute ? h : best), null as { minute: number; vitals: VitalSigns } | null)
    if (!candidate) return
    const entry = buildVitalsLogEntry(forMinute, candidate.vitals, state.clockMinutes)
    set((s) => ({
      log: [...s.log, entry],
      feedback: {
        tone: 'success',
        title: 'Charted',
        message: `Vitals recorded in iView for minute ${forMinute} (backdated).`,
      },
    }))
  },

  advanceClock: (byMinutes) => {
    const state = get()
    const nextMinute = advance(state.clockMinutes, byMinutes)

    // MAP, HR, and SpO2 are each modeled by the physiology engine — a pressor doesn't
    // just raise MAP, it also eases tachycardia and (mildly) improves oxygenation as
    // perfusion normalizes (see ScenarioConfig.responseModel's maxHrContribution/
    // maxSpo2Contribution). SBP/DBP stay MAP-derived (see deriveBloodPressure below).
    const infusingInfusions = state.infusions.filter((i) => i.status === 'infusing')
    const mapContributions = infusingInfusions.map((i) => contributionFor(i, state.scenario, state.responseModelOverrides))
    const projectedMap = projectMap(state.scenario.startingVitals.map, mapContributions)
    const hrContributions = infusingInfusions.map((i) => hrContributionFor(i, state.scenario))
    const projectedHr = projectMap(state.scenario.startingVitals.hr, hrContributions)
    const spo2Contributions = infusingInfusions.map((i) => spo2ContributionFor(i, state.scenario))
    const projectedSpo2 = projectMap(state.scenario.startingVitals.spo2, spo2Contributions)
    // RASS/painScore siblings of the HR/SpO2 passes above — no scenario targets either
    // yet (19a is foundation-only; the analgosedation scenario that actually exercises
    // these arrives in 19f), so these are currently always 0/0 in practice, but wired
    // through identically for when they do.
    const rassContributions = infusingInfusions.map((i) => rassContributionFor(i, state.scenario))
    const projectedRass = projectMap(state.scenario.startingVitals.rass, rassContributions)
    const painScoreContributions = infusingInfusions.map((i) => painScoreContributionFor(i, state.scenario))
    const projectedPainScore = projectMap(state.scenario.startingVitals.painScore, painScoreContributions)

    let map = state.vitals.map
    // "Clean" (pre-jitter) HR/SpO2 baselines — periodicVariability layers on top of
    // these afterward, same as it always has for HR; SpO2 stays jitter-free (Phase 8d
    // never added SpO2 jitter, and this phase doesn't either). RASS/painScore are
    // clinically-decided assessments, not continuously-measured vitals — never jittered,
    // matching the existing "never jitter a clinically-decided value" rule.
    let hrBase = state.scenario.startingVitals.hr
    let spo2Base = state.scenario.startingVitals.spo2
    let rassBase = state.scenario.startingVitals.rass
    let painScoreBase = state.scenario.startingVitals.painScore
    if (state.lastPhysiologyUpdate) {
      const elapsed = minutesElapsed(nextMinute, state.lastPhysiologyUpdate.minute)
      const fraction = responseFraction(elapsed, state.scenario.responseLagMinutes)
      map = stepTowardTarget(state.lastPhysiologyUpdate.map, projectedMap, fraction)
      hrBase = stepTowardTarget(state.lastPhysiologyUpdate.hr, projectedHr, fraction)
      spo2Base = stepTowardTarget(state.lastPhysiologyUpdate.spo2, projectedSpo2, fraction)
      rassBase = stepTowardTarget(state.lastPhysiologyUpdate.rass, projectedRass, fraction)
      painScoreBase = stepTowardTarget(state.lastPhysiologyUpdate.painScore, projectedPainScore, fraction)
    }

    // Untreated septic shock doesn't hold steady — MAP keeps declining, independent of
    // (and applied on top of) whatever the drug-response interpolation above produced.
    // Runs every tick, even before any titration has ever happened (unlike the block
    // above, which is gated on lastPhysiologyUpdate) — the whole point is that waiting
    // around without starting treatment has a cost. Freezes (accrues nothing further)
    // the instant any infusion is infusing again.
    const anyInfusing = state.infusions.some((i) => i.status === 'infusing')
    const elapsedTick = minutesElapsed(nextMinute, state.clockMinutes)
    const nextDeteriorationOffset = anyInfusing
      ? state.deteriorationOffset
      : accumulateDeterioration(
          state.deteriorationOffset,
          elapsedTick,
          state.scenario.deterioration.ratePerMinute,
          state.scenario.deterioration.maxDrop,
        )
    // Round after subtracting — `deteriorationOffset` itself stays an exact fractional
    // accumulator (so per-tick rounding doesn't compound error across many ticks), but
    // the displayed/charted MAP stays an integer mmHg, matching stepTowardTarget and
    // deriveBloodPressure elsewhere in this module.
    map = Math.round(map - (nextDeteriorationOffset - state.deteriorationOffset))

    // Derived checks only — this clock never ticks on its own, so there's no live timer
    // to own across windows (see engine/infusionLifecycle.ts's module doc). Default to
    // whatever feedback was already showing; only overwrite it if a rule newly applies.
    let feedback = state.feedback
    if (state.deteriorationOffset === 0 && nextDeteriorationOffset > 0) {
      feedback = {
        tone: 'warning',
        title: 'MAP trending down, untreated',
        message: 'No infusion is currently running — without treatment, hemodynamics will continue to decline.',
      }
    }
    const overdueInfusion = state.infusions.find(
      (i) => i.status === 'stopped' && i.stoppedAtMinute != null && isPastRemovalThreshold(nextMinute, i.stoppedAtMinute),
    )
    if (overdueInfusion) {
      const drug = getDrug(overdueInfusion.drugId)
      feedback = {
        tone: 'danger',
        title: 'Infusion off for 2+ hours',
        message: `${drug.name} has been paused for 2+ hours — per CP 4-156, remove it from the pump, disconnect, discard, and notify the provider.`,
      }
    }
    if (state.activeBlockOfCharting && isBlockOverMaxDuration(state.activeBlockOfCharting.startMinute, nextMinute)) {
      const drug = getDrug(state.activeBlockOfCharting.drugId)
      feedback = {
        tone: 'warning',
        title: 'Block of Charting exceeds 4 hours',
        message: `This Block of Charting for ${drug.name} has run past 4 hours — close it and open a new block per CP 4-156.`,
      }
    }

    // Natural beat-to-beat/respiratory variation, layered on top of the clean
    // (titration-responsive) values above — deliberately never applied to `map`
    // itself, since every clinical decision (target-met checks, the deterioration
    // trigger, this function's own `lastPhysiologyUpdate` interpolation anchor) keys
    // off it; jittering MAP would make "target reached" flicker tick to tick. HR has
    // no decision logic on its exact value, so it's safe to jitter directly. SBP/DBP
    // get the SAME jitter value (a parallel shift) rather than independent jitter
    // each, preserving the pulse pressure deriveBloodPressure already guarantees.
    // A facilitator's live vital override (see Facilitator.tsx's OverrideControls)
    // takes precedence over the scenario's own baseline+jitter computation — it's a
    // standing override, not a one-off, so it keeps winning every tick until cleared.
    const { hr: hrOverride, sbp: sbpOverride, dbp: dbpOverride, spo2: spo2Override } = state.vitalOverrides
    const hr = hrOverride ?? Math.round(hrBase + periodicVariability(nextMinute, 2.5, 7))
    const bpJitter = Math.round(periodicVariability(nextMinute, 4, 11, 3))
    const { sbp: baseSbp, dbp: baseDbp } = deriveBloodPressure(map, state.scenario.startingVitals)
    const nextVitals = {
      ...state.vitals,
      map,
      hr,
      sbp: sbpOverride ?? baseSbp + bpJitter,
      dbp: dbpOverride ?? baseDbp + bpJitter,
      spo2: spo2Override ?? spo2Base,
      rass: rassBase,
      painScore: painScoreBase,
    }
    set({
      clockMinutes: nextMinute,
      vitals: nextVitals,
      vitalsHistory: [...state.vitalsHistory, { minute: nextMinute, vitals: nextVitals }],
      deteriorationOffset: nextDeteriorationOffset,
      feedback,
    })

    // Phase 18: MAP reaching target is fundamentally a clock event — check the
    // 'weanEligible' trigger here too, not just after a dose (see
    // deriveWeanEligibleDecisionPointId's doc comment for why this half is needed).
    if (!get().pendingDecisionPoint) {
      const freshAfterTick = get()
      const weanTriggeredId = deriveWeanEligibleDecisionPointId(
        freshAfterTick.scenario,
        freshAfterTick.orders,
        freshAfterTick.infusions,
        freshAfterTick.vitals,
        freshAfterTick.decisionPointsShown,
      )
      if (weanTriggeredId) get().presentDecisionPoint(weanTriggeredId)
    }
  },

  pauseInfusion: (infusionId) => {
    const state = get()
    const infusion = state.infusions.find((i) => i.id === infusionId)
    if (!infusion || infusion.status !== 'infusing') return
    const drug = getDrug(infusion.drugId)
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `${drug.name} paused at ${infusion.rate} ${drug.unit}.`,
      orderId: infusion.orderId,
      drugId: infusion.drugId,
      lifecycleAction: 'pause',
    }
    set((s) => ({
      infusions: s.infusions.map((i) =>
        i.id === infusionId
          ? { ...i, status: 'stopped', rate: 0, rateBeforePause: i.rate, stoppedAtMinute: s.clockMinutes }
          : i,
      ),
      log: [...s.log, entry],
      feedback: {
        tone: 'info',
        title: 'Infusion paused',
        message: `${drug.name} stopped. Restart at the prior rate when appropriate, or discontinue.`,
      },
    }))
  },

  restartInfusion: (infusionId) => {
    const state = get()
    const infusion = state.infusions.find((i) => i.id === infusionId)
    if (!infusion || infusion.status !== 'stopped' || infusion.rateBeforePause == null) return
    const drug = getDrug(infusion.drugId)
    const rate = infusion.rateBeforePause
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `${drug.name} restarted at the rate in effect before the pause (${rate} ${drug.unit}).`,
      orderId: infusion.orderId,
      drugId: infusion.drugId,
      dose: rate,
      lifecycleAction: 'restart',
    }
    // Restart is ungated (no VerificationPanel — see Simulation.tsx's narrowed
    // PendingAction), so unlike Begin Bag/initiate it doesn't set verificationFlags at
    // all: no BCMA/I-TRACE check actually ran, and scoring.ts category 4 keys off key
    // presence in that record, not just its value.
    set((s) => ({
      infusions: s.infusions.map((i) =>
        i.id === infusionId
          ? { ...i, status: 'infusing', rate, rateBeforePause: null, stoppedAtMinute: null, lastActionMinute: s.clockMinutes }
          : i,
      ),
      log: [...s.log, entry],
      adherenceFlags: { ...s.adherenceFlags, [entry.id]: true },
      lastPhysiologyUpdate: {
        minute: s.clockMinutes,
        map: s.vitals.map,
        hr: s.vitals.hr,
        spo2: s.vitals.spo2,
        rass: s.vitals.rass,
        painScore: s.vitals.painScore,
      },
      feedback: {
        tone: 'success',
        title: 'Infusion restarted',
        message: `${drug.name} resumed at ${rate} ${drug.unit} — the rate in effect before the pause.`,
      },
    }))
  },

  discontinueInfusion: (infusionId) => {
    const state = get()
    const infusion = state.infusions.find((i) => i.id === infusionId)
    if (!infusion) return
    const drug = getDrug(infusion.drugId)
    const order = state.orders.find((o) => o.id === infusion.orderId)
    // Discontinue stays ungated (see restartInfusion's comment above) — a nurse can always
    // pull an infusion — but out-of-weanOrder discontinuation is retroactively flagged
    // here, purely for debrief scoring (category 8), not blocked live.
    const wrongWeanOrder = order && !priorAgentsWeaned(state.infusions, state.orders, order) ? true : undefined
    const actionEntry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `${drug.name} discontinued — removed from the pump, disconnected, discarded.`,
      orderId: infusion.orderId,
      drugId: infusion.drugId,
      lifecycleAction: 'discontinue',
      violations: wrongWeanOrder ? { wrongWeanOrder: true } : undefined,
    }
    const marEntry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'documentation',
      location: correctLocationFor('discontinuation'),
      summary: `Discontinuation charted in MAR: ${drug.name}.`,
      orderId: infusion.orderId,
      drugId: infusion.drugId,
    }
    // Discontinue is ungated too (see restartInfusion's comment above) — no verificationFlags entry.
    set((s) => ({
      infusions: s.infusions.filter((i) => i.id !== infusionId),
      log: [...s.log, actionEntry, marEntry],
      adherenceFlags: { ...s.adherenceFlags, [actionEntry.id]: true },
      feedback: {
        tone: 'info',
        title: 'Infusion discontinued',
        message: `${drug.name} removed from the pump and charted in MAR.`,
      },
    }))
  },

  declareBlockOfCharting: (orderId) => {
    const state = get()
    if (state.activeBlockOfCharting) return
    const order = state.orders.find((o) => o.id === orderId)
    const infusion = state.infusions.find((i) => i.orderId === orderId)
    if (!order || !infusion || infusion.status !== 'infusing') return
    const drug = getDrug(order.drugId)
    const block: BlockOfChartingRecord = {
      id: nextId('block'),
      orderId,
      drugId: order.drugId,
      startMinute: state.clockMinutes,
      endMinute: null,
    }
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Block of Charting declared for ${drug.name} — rapid titration in effect per CP 4-156.`,
      orderId,
      drugId: order.drugId,
      lifecycleAction: 'blockDeclared',
    }
    set((s) => ({
      activeBlockOfCharting: block,
      log: [...s.log, entry],
      feedback: {
        tone: 'warning',
        title: 'Block of Charting in effect',
        message: `Titrate ${drug.name} as needed. Document time, rates, and parameters evaluated when you close the block.`,
      },
    }))
  },

  closeBlockOfCharting: () => {
    const state = get()
    const block = state.activeBlockOfCharting
    if (!block) return
    const drug = getDrug(block.drugId)
    const closed: BlockOfChartingRecord = { ...block, endMinute: state.clockMinutes }
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Block of Charting closed for ${drug.name}.`,
      orderId: block.orderId,
      drugId: block.drugId,
      lifecycleAction: 'blockClosed',
    }
    set((s) => ({
      activeBlockOfCharting: null,
      blockOfChartingHistory: [...s.blockOfChartingHistory, closed],
      log: [...s.log, entry],
      feedback: {
        tone: 'success',
        title: 'Block of Charting closed',
        message: 'Confirm all required elements are documented: time/rates/max rate, parameters evaluated, provider notified.',
      },
    }))
  },
}))
