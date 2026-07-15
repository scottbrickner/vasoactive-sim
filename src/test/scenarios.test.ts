import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  SINGLE_AGENT_EARLY_NOTIFICATION,
  SEQUENTIAL_PRESSOR_ESCALATION,
  WEANING_SUPPORT,
} from '../data/scenarios'
import { FORMULARY, getDrug } from '../data/formulary'
import { deriveActivationText } from '../engine/activation'
import { projectDoseResponse } from '../engine/physiology'
import { meetsTarget } from '../engine/titrationEngine'
import type { DrugId, ScenarioConfig } from '../state/types'

describe('first scenario — neutropenic septic shock', () => {
  it('is registered and set as the default', () => {
    expect(SCENARIOS[DEFAULT_SCENARIO.id]).toBe(DEFAULT_SCENARIO)
  })

  it('matches the CLINICAL_SPEC.md worked example patient and starting vitals', () => {
    expect(DEFAULT_SCENARIO.patient).toEqual({ ageYears: 55, sex: 'female', weightKg: 68 })
    expect(DEFAULT_SCENARIO.startingVitals.map).toBe(57)
    expect(DEFAULT_SCENARIO.startingVitals.hr).toBe(118)
  })

  it('hangs norepinephrine with Begin Bag incomplete and rate stopped', () => {
    const infusion = DEFAULT_SCENARIO.initialInfusions[0]
    expect(infusion.drugId).toBe('norepinephrine')
    expect(infusion.status).toBe('hanging')
    expect(infusion.beginBagCompleted).toBe(false)
    expect(infusion.rate).toBe(0)
  })

  it('orders agent 1 (norepinephrine) matching the Attachment B default exactly', () => {
    const order = DEFAULT_SCENARIO.orders.find((o) => o.sequence === 1)!
    const drug = FORMULARY[order.drugId]
    expect(order.startDose).toBe(drug.startDose)
    expect(order.increment).toBe(drug.titrationIncrement)
    expect(order.interval).toEqual(drug.titrationInterval)
    expect(order.maxDose).toBe(drug.maxDose)
    expect(order.target).toEqual({ metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' })
  })

  it('orders agent 2 (vasopressin) to activate at 1/3 of norepi max with MAP still low', () => {
    const order = DEFAULT_SCENARIO.orders.find((o) => o.sequence === 2)!
    expect(order.drugId).toBe('vasopressin')
    expect(order.activationThreshold).toBeCloseTo(1 / 3)
    // `activatesWhen` is no longer hand-authored on the scenario itself — store.ts derives
    // it at init time (see engine/activation.ts) so display text can't drift from the
    // real threshold used by priorAgentsActivationMet.
    const activatesWhen = deriveActivationText(order, DEFAULT_SCENARIO.orders)
    expect(activatesWhen).toMatch(/norepinephrine/i)
    expect(activatesWhen).toMatch(/10 mcg\/min/)
    expect(activatesWhen).toMatch(/33%/)
  })

  it('every initial infusion references a real order in the scenario', () => {
    const orderIds = new Set(DEFAULT_SCENARIO.orders.map((o) => o.id))
    for (const infusion of DEFAULT_SCENARIO.initialInfusions) {
      expect(orderIds.has(infusion.orderId)).toBe(true)
    }
  })
})

/** The MAP contribution a drug reaches at its ORDERED maximum, mirroring store.ts's contributionFor exactly. */
function fullContribution(scenario: ScenarioConfig, drugId: DrugId): number {
  const model = scenario.responseModel[drugId]
  if (!model) return 0
  const drug = getDrug(drugId)
  const order = scenario.orders.find((o) => o.drugId === drugId)!
  return projectDoseResponse(order.maxDose, drug.maxDose, model.maxMapContribution)
}

describe('all four scenarios — structural sanity', () => {
  const scenarios = Object.values(SCENARIOS)

  it('are all registered exactly once, keyed by their own id', () => {
    expect(scenarios).toHaveLength(4)
    for (const s of scenarios) {
      expect(SCENARIOS[s.id]).toBe(s)
    }
  })

  it('each has a non-empty learning objective', () => {
    for (const s of scenarios) {
      expect(s.objective.length).toBeGreaterThan(0)
    }
  })

  it('every order references a drug that exists in the formulary', () => {
    for (const s of scenarios) {
      for (const order of s.orders) {
        expect(FORMULARY[order.drugId]).toBeDefined()
      }
    }
  })

  it('every initialInfusions entry references a real order in its own scenario', () => {
    for (const s of scenarios) {
      const orderIds = new Set(s.orders.map((o) => o.id))
      for (const infusion of s.initialInfusions) {
        expect(orderIds.has(infusion.orderId)).toBe(true)
      }
    }
  })

  it('only the flagship scenario has Block of Charting enabled', () => {
    expect(DEFAULT_SCENARIO.enableBlockOfCharting).toBe(true)
    expect(SINGLE_AGENT_EARLY_NOTIFICATION.enableBlockOfCharting).toBe(false)
    expect(SEQUENTIAL_PRESSOR_ESCALATION.enableBlockOfCharting).toBe(false)
    expect(WEANING_SUPPORT.enableBlockOfCharting).toBe(false)
  })
})

describe('scenario — single-agent early notification', () => {
  it('is a genuinely single-agent scenario', () => {
    expect(SINGLE_AGENT_EARLY_NOTIFICATION.orders).toHaveLength(1)
    expect(SINGLE_AGENT_EARLY_NOTIFICATION.orders[0].drugId).toBe('norepinephrine')
  })

  it('norepinephrine alone, at its ordered maximum, reaches target (unlike the flagship scenario)', () => {
    const order = SINGLE_AGENT_EARLY_NOTIFICATION.orders[0]
    const projected = SINGLE_AGENT_EARLY_NOTIFICATION.startingVitals.map + fullContribution(SINGLE_AGENT_EARLY_NOTIFICATION, 'norepinephrine')
    expect(meetsTarget(projected, order.target)).toBe(true)
  })

  it('has an early-notification checkpoint at 30% of the ordered maximum', () => {
    expect(SINGLE_AGENT_EARLY_NOTIFICATION.orders[0].earlyNotificationThreshold).toBeCloseTo(0.3)
  })

  it('has no activation or weaning requirements', () => {
    expect(SINGLE_AGENT_EARLY_NOTIFICATION.orders[0].activationThreshold).toBeUndefined()
    expect(SINGLE_AGENT_EARLY_NOTIFICATION.orders[0].weanOrder).toBeUndefined()
  })
})

describe('scenario — sequential pressor escalation', () => {
  it('is a fresh vignette, distinct from the flagship scenario', () => {
    expect(SEQUENTIAL_PRESSOR_ESCALATION.patient).not.toEqual(DEFAULT_SCENARIO.patient)
    expect(SEQUENTIAL_PRESSOR_ESCALATION.admissionReason).not.toBe(DEFAULT_SCENARIO.admissionReason)
  })

  it('norepinephrine alone, at its ordered maximum, falls short of target', () => {
    const order = SEQUENTIAL_PRESSOR_ESCALATION.orders.find((o) => o.drugId === 'norepinephrine')!
    const projected = SEQUENTIAL_PRESSOR_ESCALATION.startingVitals.map + fullContribution(SEQUENTIAL_PRESSOR_ESCALATION, 'norepinephrine')
    expect(meetsTarget(projected, order.target)).toBe(false)
  })

  it('norepinephrine + phenylephrine together reach target', () => {
    const order = SEQUENTIAL_PRESSOR_ESCALATION.orders.find((o) => o.drugId === 'norepinephrine')!
    const combined =
      fullContribution(SEQUENTIAL_PRESSOR_ESCALATION, 'norepinephrine') +
      fullContribution(SEQUENTIAL_PRESSOR_ESCALATION, 'phenylephrine')
    expect(meetsTarget(SEQUENTIAL_PRESSOR_ESCALATION.startingVitals.map + combined, order.target)).toBe(true)
  })

  it('phenylephrine activates well before norepinephrine is maxed out', () => {
    const phenylephrine = SEQUENTIAL_PRESSOR_ESCALATION.orders.find((o) => o.drugId === 'phenylephrine')!
    expect(phenylephrine.activationThreshold).toBeCloseTo(0.4)
  })
})

describe('scenario — weaning support', () => {
  it('pre-seeds all three agents already infusing', () => {
    expect(WEANING_SUPPORT.initialInfusions).toHaveLength(3)
    expect(WEANING_SUPPORT.initialInfusions.every((i) => i.status === 'infusing')).toBe(true)
  })

  it('starts comfortably above target', () => {
    const order = WEANING_SUPPORT.orders.find((o) => o.drugId === 'norepinephrine')!
    expect(meetsTarget(WEANING_SUPPORT.startingVitals.map, order.target)).toBe(true)
    expect(WEANING_SUPPORT.startingVitals.map).toBeGreaterThan(order.target.value + 5)
  })

  it('weanOrder is the exact inverse of sequence for every order', () => {
    for (const order of WEANING_SUPPORT.orders) {
      expect(order.weanOrder).toBe(4 - order.sequence)
    }
  })

  it('phenylephrine (the last-escalated agent) weans first; norepinephrine (the mainstay) weans last', () => {
    const phenylephrine = WEANING_SUPPORT.orders.find((o) => o.drugId === 'phenylephrine')!
    const norepinephrine = WEANING_SUPPORT.orders.find((o) => o.drugId === 'norepinephrine')!
    expect(phenylephrine.weanOrder).toBe(1)
    expect(norepinephrine.weanOrder).toBe(3)
  })
})
