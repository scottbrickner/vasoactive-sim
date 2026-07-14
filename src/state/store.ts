import { create } from 'zustand'
import { advance, minutesElapsed } from '../engine/clock'
import { correctLocationFor } from '../engine/documentation'
import { evaluateDose, limitsFromOrder } from '../engine/guardrails'
import { projectDoseResponse, projectMap, responseFraction, stepTowardTarget } from '../engine/physiology'
import { evaluateTitration, type TitrationAction } from '../engine/titrationEngine'
import { getDrug } from '../data/formulary'
import { DEFAULT_SCENARIO } from '../data/scenarios'
import type { Infusion, LogEntry, Order, Phase, ScenarioConfig } from './types'

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

/** A drug's own MAP contribution is 0 unless the scenario tunes a response ceiling for it. */
function contributionFor(infusion: Infusion, scenario: ScenarioConfig): number {
  const model = scenario.responseModel[infusion.drugId]
  if (!model) return 0
  const drug = getDrug(infusion.drugId)
  return projectDoseResponse(infusion.rate, drug.maxDose, model.maxMapContribution)
}

/** Sequence > 1 orders activate once every lower-sequence order's infusion is at its own max with target unmet. */
export function priorAgentsActivationMet(
  infusions: Infusion[],
  orders: Order[],
  currentMap: number,
  order: Order,
): boolean {
  const priorOrders = orders.filter((o) => o.sequence < order.sequence)
  if (priorOrders.length === 0) return true
  return priorOrders.every((priorOrder) => {
    const infusion = infusions.find((i) => i.orderId === priorOrder.id)
    if (!infusion) return false
    const atMax = infusion.rate >= priorOrder.maxDose - 1e-9
    const targetUnmet = currentMap < priorOrder.target.value
    return atMax && targetUnmet
  })
}

function nextChannelLetter(infusions: Infusion[]): string {
  const used = new Set(infusions.map((i) => i.channel))
  for (const letter of ['A', 'B', 'C', 'D']) {
    if (!used.has(letter)) return letter
  }
  return 'X'
}

interface SimStore {
  phase: Phase
  scenario: ScenarioConfig
  clockMinutes: number
  infusions: Infusion[]
  vitals: ScenarioConfig['startingVitals']
  orders: Order[]
  log: LogEntry[]
  verificationFlags: Record<string, boolean>
  adherenceFlags: Record<string, boolean>
  lastPhysiologyUpdate: { minute: number; map: number } | null
  feedback: FeedbackMessage | null

  setPhase: (phase: Phase) => void
  /** (Re)initializes the live sim state from a scenario config — used by both "Begin simulation" and "Restart simulation". */
  startScenario: (scenario: ScenarioConfig) => void
  dismissFeedback: () => void

  completeBeginBag: (infusionId: string) => void
  /** Handles both initiation (no/hanging infusion) and titration (infusing), keyed by order. */
  submitDose: (orderId: string, dose: number) => void
  notifyProvider: (orderId: string, reason?: string) => void
  chartVitals: () => void
  advanceClock: (byMinutes: number) => void
}

function initialSimFields(scenario: ScenarioConfig) {
  return {
    scenario,
    clockMinutes: 0,
    infusions: [{ ...scenario.initialInfusion }],
    vitals: { ...scenario.startingVitals },
    orders: scenario.orders.map((o) => ({ ...o })),
    log: [] as LogEntry[],
    verificationFlags: {} as Record<string, boolean>,
    adherenceFlags: {} as Record<string, boolean>,
    lastPhysiologyUpdate: null as { minute: number; map: number } | null,
    feedback: null as FeedbackMessage | null,
  }
}

export const useSimStore = create<SimStore>((set, get) => ({
  phase: 'intro' as Phase,
  ...initialSimFields(DEFAULT_SCENARIO),

  setPhase: (phase) => set({ phase }),

  startScenario: (nextScenario) => set(initialSimFields(nextScenario)),

  dismissFeedback: () => set({ feedback: null }),

  completeBeginBag: (infusionId) => {
    const state = get()
    const infusion = state.infusions.find((i) => i.id === infusionId)
    if (!infusion || infusion.beginBagCompleted) return
    const drug = getDrug(infusion.drugId)

    const actionEntry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `Begin Bag verified for ${drug.name} — label matches order, bag matches pump program, line traced to patient (I-TRACE).`,
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
      verificationFlags: { ...s.verificationFlags, [actionEntry.id]: true },
      adherenceFlags: { ...s.adherenceFlags, [actionEntry.id]: true },
      feedback: {
        tone: 'success',
        title: 'Begin Bag complete',
        message: `${drug.name} is verified and ready to program.`,
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

    const guardEval = evaluateDose(dose, limitsFromOrder(order, drug))
    const result = evaluateTitration({
      action,
      order,
      currentDose: infusion?.rate ?? 0,
      proposedDose: dose,
      currentMinute: state.clockMinutes,
      lastActionMinute: infusion?.lastActionMinute ?? null,
      currentMap: state.vitals.map,
      priorAgentActivationMet:
        order.sequence === 1 || priorAgentsActivationMet(state.infusions, state.orders, state.vitals.map, order),
    })

    const applied = guardEval.status !== 'hardLimitBlocked' && result.status === 'ok'
    // result.status is 'ok' only when applied is true (see the `applied` check above), so
    // the else-else branch below never actually sees 'ok' — the cast reflects that.
    const outcome = (
      applied ? 'applied' : guardEval.status === 'hardLimitBlocked' ? 'hardLimitBlocked' : result.status
    ) as 'applied' | 'off-order' | 'needs-provider' | 'hardLimitBlocked'

    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'action',
      summary: `${action === 'initiate' ? 'Initiate' : 'Titrate'} ${drug.name} to ${dose} ${drug.unit} — ${outcome}.`,
      orderId: order.id,
      drugId: order.drugId,
      doseAction: action,
      outcome,
      violations: result.violations,
      guardrailStatus: guardEval.status,
    }

    set((s) => ({
      log: [...s.log, entry],
      verificationFlags: { ...s.verificationFlags, [entry.id]: true },
      adherenceFlags: { ...s.adherenceFlags, [entry.id]: result.status === 'ok' },
    }))

    // Guardrails hard limit is an absolute pump ceiling — it wins over everything else,
    // including needs-provider, because the pump would mechanically refuse the dose no
    // matter how clinically justified the request is. needs-provider is only reachable
    // in the band between the order's own max and the drug's (potentially higher) hard
    // ceiling — e.g. a prescriber-customized order max below Attachment B's default.
    if (guardEval.status === 'hardLimitBlocked') {
      set({
        feedback: {
          tone: 'danger',
          title: 'Blocked by Guardrails',
          message: `The Alaris pump will not accept ${dose} ${drug.unit} — outside the configured hard limit (${guardEval.limits.hardMin}-${guardEval.limits.hardMax} ${drug.unit}).`,
        },
      })
      return
    }

    if (result.status === 'needs-provider') {
      set({ feedback: { tone: 'warning', title: 'Notify the provider', message: result.reasons.join(' ') } })
      return
    }

    if (result.status === 'off-order') {
      set({ feedback: { tone: 'warning', title: 'Off-order — not applied', message: result.reasons.join(' ') } })
      return
    }

    // status === 'ok' — apply
    set((s) => {
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
        lastPhysiologyUpdate: { minute: s.clockMinutes, map: s.vitals.map },
      }
    })

    set({
      feedback: {
        tone: 'success',
        title: action === 'initiate' ? 'Infusion started' : 'Titration applied',
        message: `${drug.name} now at ${dose} ${drug.unit}.`,
      },
    })
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
    const entry: LogEntry = {
      id: nextId('log'),
      minute: state.clockMinutes,
      type: 'documentation',
      location: 'iView',
      summary: `Measurable criteria charted in iView: MAP ${state.vitals.map} mmHg, HR ${state.vitals.hr}.`,
      vitalsSnapshot: state.vitals,
    }
    set((s) => ({
      log: [...s.log, entry],
      feedback: { tone: 'success', title: 'Charted', message: 'Vitals recorded in iView.' },
    }))
  },

  advanceClock: (byMinutes) => {
    const state = get()
    const nextMinute = advance(state.clockMinutes, byMinutes)

    // Only MAP is modeled by the physiology engine (see engine/physiology.ts) — the
    // rest of the vitals stay at their scenario starting values through the sim.
    const contributions = state.infusions
      .filter((i) => i.status === 'infusing')
      .map((i) => contributionFor(i, state.scenario))
    const projectedMap = projectMap(state.scenario.startingVitals.map, contributions)

    let map = state.vitals.map
    if (state.lastPhysiologyUpdate) {
      const elapsed = minutesElapsed(nextMinute, state.lastPhysiologyUpdate.minute)
      const fraction = responseFraction(elapsed, state.scenario.responseLagMinutes)
      map = stepTowardTarget(state.lastPhysiologyUpdate.map, projectedMap, fraction)
    }

    set({ clockMinutes: nextMinute, vitals: { ...state.vitals, map } })
  },
}))
