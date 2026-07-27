import { create } from 'zustand'
import { deriveActivationText, deriveNextDecisionPoint } from '../engine/activation'
import { advance, minutesElapsed } from '../engine/clock'
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
  computeGuidedLeapDoses,
  evaluateTitration,
  meetsTarget,
  type TitrationAction,
  type TitrationResult,
} from '../engine/titrationEngine'
import { getDrug } from '../data/formulary'
import { DEFAULT_SCENARIO } from '../data/scenarios'
import type {
  BlockOfChartingRecord,
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

/**
 * Sequence > 1 orders activate once every lower-sequence order's infusion is at (or
 * past) `order.activationThreshold` of its own max — defaults to 1 ("at its own max")
 * when omitted — with target still unmet.
 */
export function priorAgentsActivationMet(
  infusions: Infusion[],
  orders: Order[],
  currentMap: number,
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
    const targetUnmet = currentMap < priorOrder.target.value
    return atThreshold && targetUnmet
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
function crossedEarlyNotificationThreshold(order: Order, priorDose: number, proposedDose: number, currentMap: number): boolean {
  if (order.earlyNotificationThreshold == null) return false
  const thresholdDose = order.maxDose * order.earlyNotificationThreshold
  return priorDose < thresholdDose && proposedDose >= thresholdDose && !meetsTarget(currentMap, order.target)
}

/**
 * After a manual (non-leap) titrate applies, bumps that order's pacing counter and —
 * once it reaches PACING_OFFER_THRESHOLD — opens a non-clinical pendingPacingOffer
 * pointed at the nearest upcoming milestone (see deriveNextDecisionPoint). Skipped
 * entirely the tick a clinical checkpoint fires (crossedEarlyThreshold) — the real
 * decision takes precedence over a workflow-pacing nudge, and resolves the same
 * "climbing for a while" pressure the pacing offer exists to address.
 */
function applyPacingTrigger(
  get: () => Pick<SimStore, 'orders' | 'infusions' | 'pacingTitrationsSinceOffer' | 'pendingCheckpoint' | 'pendingPacingOffer'>,
  set: (partial: Partial<SimStore>) => void,
  orderId: string,
  crossedEarlyThreshold: boolean,
) {
  const s = get()
  if (crossedEarlyThreshold) {
    set({ pacingTitrationsSinceOffer: { ...s.pacingTitrationsSinceOffer, [orderId]: 0 } })
    return
  }
  const count = (s.pacingTitrationsSinceOffer[orderId] ?? 0) + 1
  if (count < PACING_OFFER_THRESHOLD || s.pendingCheckpoint || s.pendingPacingOffer) {
    set({ pacingTitrationsSinceOffer: { ...s.pacingTitrationsSinceOffer, [orderId]: count } })
    return
  }
  const order = s.orders.find((o) => o.id === orderId)
  const infusion = s.infusions.find((i) => i.orderId === orderId)
  const nextPoint = order && infusion ? deriveNextDecisionPoint(order, s.orders, infusion.rate) : null
  set({
    pacingTitrationsSinceOffer: { ...s.pacingTitrationsSinceOffer, [orderId]: 0 },
    pendingPacingOffer:
      nextPoint && infusion
        ? { orderId, currentDose: infusion.rate, nextDecisionDose: nextPoint.dose, nextDecisionLabel: nextPoint.label }
        : s.pendingPacingOffer,
  })
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
 * An early-notification-threshold crossing (see crossedEarlyNotificationThreshold)
 * awaiting the learner's decision: notify the provider, or keep titrating the same
 * agent — optionally via a guided multi-step leap (see runGuidedTitrationLeap). Not
 * part of SimState — transient UI-adjacent store state, like PendingOverride.
 */
export interface PendingCheckpoint {
  orderId: string
  doseAtTrigger: number
  mapAtTrigger: number
  triggeredAtMinute: number
}

/** How many manual (non-leap) titrations on the same order trigger a pacing offer. */
const PACING_OFFER_THRESHOLD = 3

/**
 * A non-clinical "want to speed through this climb?" offer — distinct from
 * PendingCheckpoint, which is a real clinical decision (notify provider vs. continue) at
 * an exact threshold. This fires periodically (every PACING_OFFER_THRESHOLD manual
 * titrations) purely to cut down on repetitive clicking toward whatever the next
 * decision point actually is (see engine/activation.ts's deriveNextDecisionPoint). Not
 * part of SimState — transient UI-adjacent store state, like PendingOverride.
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
  lastPhysiologyUpdate: { minute: number; map: number; hr: number; spo2: number }
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
    lastPhysiologyUpdate: { minute: s.clockMinutes, map: s.vitals.map, hr: s.vitals.hr, spo2: s.vitals.spo2 },
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
  adherenceFlags: Record<string, boolean>
  lastPhysiologyUpdate: { minute: number; map: number; hr: number; spo2: number } | null
  /** Cumulative mmHg MAP has dropped below baseline from untreated time — see ScenarioConfig.deterioration. */
  deteriorationOffset: number
  activeBlockOfCharting: BlockOfChartingRecord | null
  blockOfChartingHistory: BlockOfChartingRecord[]
  /** A deferred off-order dose attempt awaiting the training-mode learner's decision. */
  pendingOverride: PendingOverride | null
  /** An early-notification-threshold crossing awaiting the learner's notify-vs-continue decision. */
  pendingCheckpoint: PendingCheckpoint | null
  /** Manual (non-leap) titration count since the last pacing offer, keyed by orderId — resets on offer/clinical-checkpoint. */
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
  /** Handles both initiation (no/hanging infusion) and titration (infusing), keyed by order. */
  submitDose: (orderId: string, dose: number) => void
  /** Applies a pending training-mode override: logs it as 'applied'/overridden and mutates the infusion. */
  confirmDoseOverride: () => void
  /** Rejects a pending training-mode override: logs it as 'off-order', infusion untouched. */
  cancelDoseOverride: () => void
  /** Declines to act on a pending early-notification checkpoint for now — no LogEntry (nothing happened). */
  dismissCheckpoint: () => void
  /** Declines a pending pacing offer for now — no LogEntry, resumes manual titration. */
  dismissPacingOffer: () => void
  /** Runs a guided multi-step titration leap toward targetDose for the checkpoint's (or pacing offer's) order, one correctly-spaced dose + auto-chart entry per step. */
  runGuidedTitrationLeap: (orderId: string, targetDose: number) => void
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
    adherenceFlags: {} as Record<string, boolean>,
    lastPhysiologyUpdate: null as { minute: number; map: number; hr: number; spo2: number } | null,
    deteriorationOffset: 0,
    activeBlockOfCharting: null as BlockOfChartingRecord | null,
    blockOfChartingHistory: [] as BlockOfChartingRecord[],
    pendingOverride: null as PendingOverride | null,
    pendingCheckpoint: null as PendingCheckpoint | null,
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

  submitDose: (orderId, dose) => {
    const state = get()
    const order = state.orders.find((o) => o.id === orderId)
    if (!order || state.phase !== 'sim') return
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
      return
    }

    if (infusion && infusion.status === 'stopped') {
      set({
        feedback: {
          tone: 'danger',
          title: 'Infusion paused',
          message: `${drug.name} is paused — restart at the prior rate, or discontinue, before titrating.`,
        },
      })
      return
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
          currentMap: state.vitals.map,
          priorAgentActivationMet:
            order.sequence === 1 || priorAgentsActivationMet(state.infusions, state.orders, state.vitals.map, order),
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
    // mutated elsewhere in this codebase (faithful audit trail).
    if (outcome === 'off-order' && state.mode === 'training') {
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
      return
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
      crossedEarlyNotificationThreshold(order, infusion?.rate ?? 0, dose, state.vitals.map)

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
    }

    // BCMA/I-TRACE verification only runs at Begin Bag / initiation (see Simulation.tsx's
    // narrowed PendingAction) — titrations are ungated, so only initiate entries are
    // "verifiable" at all (scoring.ts category 4 keys off key presence, not just value).
    set((s) => ({
      log: [...s.log, entry],
      verificationFlags: action === 'initiate' ? { ...s.verificationFlags, [entry.id]: true } : s.verificationFlags,
      adherenceFlags: { ...s.adherenceFlags, [entry.id]: result.status === 'ok' },
    }))

    if (finalOutcome === 'hardLimitBlocked') {
      set({
        feedback: {
          tone: 'danger',
          title: 'Blocked by Guardrails',
          message: `The Alaris pump will not accept ${dose} ${drug.unit} — outside the configured hard limit (${guardEval.limits.hardMin}-${guardEval.limits.hardMax} ${drug.unit}).`,
        },
      })
      return
    }

    if (finalOutcome === 'needs-provider') {
      set({
        feedback:
          state.mode === 'training'
            ? { tone: 'warning', title: 'Notify the provider', message: result.reasons.join(' ') }
            : { tone: 'danger', title: 'Not accepted', message: 'This dose was not accepted. Reassess and try again.' },
      })
      return
    }

    // finalOutcome === 'applied' — a clean order-compliant dose, or a validation-mode
    // silent override (see `overridden` above).
    set((s) => computeApplyUpdate(s, order, drug, infusion, action, dose))

    // Precedence: the early-notification checkpoint (if newly crossed) wins over the
    // routine post-titrate prompt — it opens an interactive decision panel instead of
    // just a toast (see TitrationCheckpointPanel), replacing the old
    // buildEarlyNotificationFeedback toast entirely. The routine post-titrate prompt
    // itself replaces the old generic "Titration applied" — naming the interval and
    // prompting reassessment rather than just confirming the dose landed. Initiate
    // keeps its own distinct message (it's not itself an interval to reassess after).
    // advanceClock's own more-urgent overrides (2hr-stopped, 4hr-block, deterioration-
    // started) still get final say, unchanged, since it runs after this and only
    // overwrites `feedback` when one of those newly applies.
    if (crossedEarlyThreshold) {
      set({ pendingCheckpoint: { orderId: order.id, doseAtTrigger: dose, mapAtTrigger: state.vitals.map, triggeredAtMinute: state.clockMinutes } })
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
    if (action === 'titrate' && !blockActive) applyPacingTrigger(get, set, order.id, crossedEarlyThreshold)

    // Both initiating and titrating advance the clock by the order's own interval — the
    // pump doesn't know or care which kind of dose-change just happened. A facilitator-
    // driven-vs-auto pacing toggle is planned for Phase 10 — auto is the only mode until
    // then.
    get().advanceClock(order.interval.minMinutes)
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
      crossedEarlyNotificationThreshold(order, infusion?.rate ?? 0, pending.dose, state.vitals.map)

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

    // Same precedence as submitDose's applied path: the early-notification checkpoint,
    // if newly crossed, wins over the routine "applied via override" confirmation.
    if (crossedEarlyThreshold) {
      set({
        pendingCheckpoint: {
          orderId: order.id,
          doseAtTrigger: pending.dose,
          mapAtTrigger: state.vitals.map,
          triggeredAtMinute: state.clockMinutes,
        },
      })
    } else {
      set({
        feedback: {
          tone: 'warning',
          title: 'Applied via override',
          message: `${drug.name} now at ${pending.dose} ${drug.unit} — logged as an override for debrief.`,
        },
      })
    }

    if (pending.action === 'titrate') applyPacingTrigger(get, set, order.id, crossedEarlyThreshold)

    get().advanceClock(order.interval.minMinutes)
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

  dismissCheckpoint: () => set({ pendingCheckpoint: null }),

  dismissPacingOffer: () => set({ pendingPacingOffer: null }),

  runGuidedTitrationLeap: (orderId, targetDose) => {
    const state = get()
    const matchesCheckpoint = state.pendingCheckpoint?.orderId === orderId
    const matchesPacingOffer = state.pendingPacingOffer?.orderId === orderId
    if (!matchesCheckpoint && !matchesPacingOffer) return
    const order = get().orders.find((o) => o.id === orderId)
    const infusion = get().infusions.find((i) => i.orderId === orderId)
    set({ pendingCheckpoint: null, pendingPacingOffer: null })
    if (!order || !infusion || infusion.status !== 'infusing') return
    const drug = getDrug(order.drugId)
    const plan = computeGuidedLeapDoses(infusion.rate, order.increment, order.maxDose, targetDose)

    let appliedCount = 0
    let interruptedByCheckpoint = false
    for (const dose of plan.doses) {
      const s = get()
      if (meetsTarget(s.vitals.map, order.target)) break
      const currentInfusion = s.infusions.find((i) => i.orderId === orderId) ?? null
      // A leap that starts below the clinical threshold (e.g. from a pacing offer, unlike
      // the clinical checkpoint's own leap, which always starts AT the crossing dose) can
      // cross it mid-flight — check every step, not just once at the start.
      const crossedThisStep = crossedEarlyNotificationThreshold(order, currentInfusion?.rate ?? 0, dose, s.vitals.map)
      const actionEntry: LogEntry = {
        id: nextId('log'),
        minute: s.clockMinutes,
        type: 'action',
        summary: `Titrate ${drug.name} to ${dose} ${drug.unit} — applied (guided titration leap).`,
        orderId: order.id,
        drugId: order.drugId,
        doseAction: 'titrate',
        dose,
        outcome: 'applied',
        autoGeneratedByLeap: true,
        earlyNotificationDue: crossedThisStep || undefined,
      }
      const vitalsEntry: LogEntry = { ...buildVitalsLogEntry(s.clockMinutes, s.vitals, s.clockMinutes), autoGeneratedByLeap: true }
      const applyUpdate = computeApplyUpdate(s, order, drug, currentInfusion, 'titrate', dose)
      set({
        infusions: applyUpdate.infusions,
        log: [...applyUpdate.log, vitalsEntry, actionEntry],
        lastPhysiologyUpdate: applyUpdate.lastPhysiologyUpdate,
        adherenceFlags: { ...s.adherenceFlags, [actionEntry.id]: true },
      })
      appliedCount += 1
      get().advanceClock(order.interval.minMinutes)
      if (crossedThisStep) {
        // Stop here — the same real decision a manually-titrating nurse would hit at this
        // exact dose takes over; no "leap complete" toast competing with the checkpoint.
        set((st) => ({
          pendingCheckpoint: { orderId: order.id, doseAtTrigger: dose, mapAtTrigger: s.vitals.map, triggeredAtMinute: s.clockMinutes },
          pacingTitrationsSinceOffer: { ...st.pacingTitrationsSinceOffer, [orderId]: 0 },
        }))
        interruptedByCheckpoint = true
        break
      }
    }

    if (!interruptedByCheckpoint) {
      const finalRate = get().infusions.find((i) => i.orderId === orderId)?.rate
      set({
        feedback:
          appliedCount > 0
            ? {
                tone: 'success',
                title: 'Guided titration complete',
                message: `${drug.name} titrated to ${finalRate} ${drug.unit} over ${appliedCount} step${appliedCount === 1 ? '' : 's'}. Review the timeline for each step's charted vitals.`,
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

    let map = state.vitals.map
    // "Clean" (pre-jitter) HR/SpO2 baselines — periodicVariability layers on top of
    // these afterward, same as it always has for HR; SpO2 stays jitter-free (Phase 8d
    // never added SpO2 jitter, and this phase doesn't either).
    let hrBase = state.scenario.startingVitals.hr
    let spo2Base = state.scenario.startingVitals.spo2
    if (state.lastPhysiologyUpdate) {
      const elapsed = minutesElapsed(nextMinute, state.lastPhysiologyUpdate.minute)
      const fraction = responseFraction(elapsed, state.scenario.responseLagMinutes)
      map = stepTowardTarget(state.lastPhysiologyUpdate.map, projectedMap, fraction)
      hrBase = stepTowardTarget(state.lastPhysiologyUpdate.hr, projectedHr, fraction)
      spo2Base = stepTowardTarget(state.lastPhysiologyUpdate.spo2, projectedSpo2, fraction)
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
    }
    set({
      clockMinutes: nextMinute,
      vitals: nextVitals,
      vitalsHistory: [...state.vitalsHistory, { minute: nextMinute, vitals: nextVitals }],
      deteriorationOffset: nextDeteriorationOffset,
      feedback,
    })
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
      lastPhysiologyUpdate: { minute: s.clockMinutes, map: s.vitals.map, hr: s.vitals.hr, spo2: s.vitals.spo2 },
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
