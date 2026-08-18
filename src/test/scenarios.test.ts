import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  SINGLE_AGENT_EARLY_NOTIFICATION,
  SEQUENTIAL_PRESSOR_ESCALATION,
  WEANING_SUPPORT,
  ANALGOSEDATION,
  DILTIAZEM_RATE_CONTROL,
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

describe('all six scenarios — structural sanity', () => {
  const scenarios = Object.values(SCENARIOS)

  it('are all registered exactly once, keyed by their own id', () => {
    expect(scenarios).toHaveLength(6)
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
    expect(ANALGOSEDATION.enableBlockOfCharting).toBe(false)
    expect(DILTIAZEM_RATE_CONTROL.enableBlockOfCharting).toBe(false)
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

  it('Phase 19g: phenylephrine gains an earlyNotificationThreshold, and both orders gain weanOrder (additive scenario-data change)', () => {
    const norepi = SEQUENTIAL_PRESSOR_ESCALATION.orders.find((o) => o.drugId === 'norepinephrine')!
    const phenylephrine = SEQUENTIAL_PRESSOR_ESCALATION.orders.find((o) => o.drugId === 'phenylephrine')!
    expect(phenylephrine.earlyNotificationThreshold).toBeCloseTo(0.3)
    // Most-recently-added agent (phenylephrine) weans first; the mainstay (norepinephrine)
    // weans last — same inverse-of-sequence convention as the flagship.
    expect(phenylephrine.weanOrder).toBe(1)
    expect(norepi.weanOrder).toBe(2)
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

describe('scenario — analgosedation', () => {
  it('is registered', () => {
    expect(SCENARIOS[ANALGOSEDATION.id]).toBe(ANALGOSEDATION)
  })

  it('has a non-empty learning objective', () => {
    expect(ANALGOSEDATION.objective.length).toBeGreaterThan(0)
  })

  it('has Block of Charting disabled', () => {
    expect(ANALGOSEDATION.enableBlockOfCharting).toBe(false)
  })

  it('pre-seeds fentanyl (sequence 1) as hanging so the independent double-check gate applies on its first initiate', () => {
    // submitDose's independent-check hard gate (state/store.ts) is only reachable when
    // `infusion` is truthy — a sequence-1 agent with no pre-seeded initialInfusions
    // entry would let the gate be silently skipped on its very first real initiate.
    expect(ANALGOSEDATION.initialInfusions).toHaveLength(1)
    const infusion = ANALGOSEDATION.initialInfusions[0]
    expect(infusion.drugId).toBe('fentanyl')
    expect(infusion.status).toBe('hanging')
    expect(infusion.beginBagCompleted).toBe(false)
  })

  it('dexmedetomidine (sequence 2) has no pre-seeded infusion, matching every other sequence-2 agent in this app', () => {
    const dexInfusion = ANALGOSEDATION.initialInfusions.find((i) => i.drugId === 'dexmedetomidine')
    expect(dexInfusion).toBeUndefined()
  })

  it('fentanyl targets painScore <= 4 and dexmedetomidine targets RASS between -2 and 0', () => {
    const fentanylOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'fentanyl')!
    const dexOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'dexmedetomidine')!
    expect(fentanylOrder.target).toEqual({ metric: 'painScore', comparator: '<=', value: 4, unit: 'score' })
    expect(dexOrder.target).toEqual({ metric: 'RASS', comparator: 'between', value: -2, valueHigh: 0, unit: 'score' })
  })

  it('orders match the Attachment B formulary defaults exactly', () => {
    for (const order of ANALGOSEDATION.orders) {
      const drug = getDrug(order.drugId)
      expect(order.startDose).toBe(drug.startDose)
      expect(order.increment).toBe(drug.titrationIncrement)
      expect(order.interval).toEqual(drug.titrationInterval)
      expect(order.maxDose).toBe(drug.maxDose)
    }
  })

  it('Phase 19g: dexmedetomidine gains an earlyNotificationThreshold (additive scenario-data change)', () => {
    const dexOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'dexmedetomidine')!
    expect(dexOrder.earlyNotificationThreshold).toBeCloseTo(0.5)
  })

  it("dexmedetomidine's activationThreshold is exactly fentanyl's startDose / maxDose (1/6) — analgesia established, not maxed out", () => {
    const dexOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'dexmedetomidine')!
    const fentanylOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'fentanyl')!
    expect(dexOrder.activationThreshold).toBeCloseTo(1 / 6)
    expect(dexOrder.activationThreshold).toBeCloseTo(fentanylOrder.startDose / fentanylOrder.maxDose)
  })

  // Phase 19h: direct clinical correction — dexmedetomidine's dose threshold is paired
  // with fentanyl's OWN painScore target being MET (analgesia established), not still
  // unmet. Getting this backwards would make sedation unavailable at exactly the moment
  // real practice calls for adding it (pain controlled, patient still agitated).
  it("dexmedetomidine's activation requires fentanyl's OWN target to be MET, not unmet", () => {
    const dexOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'dexmedetomidine')!
    expect(dexOrder.activationRequiresPriorTargetMet).toBe(true)
  })

  it('fentanyl targets no other order (sequence 1) so its own activationRequiresPriorTargetMet is irrelevant/unset', () => {
    const fentanylOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'fentanyl')!
    expect(fentanylOrder.activationRequiresPriorTargetMet).toBeUndefined()
  })

  // Phase 19h: direct clinical correction — pain and sedation are independent
  // parameters here, so both orders share weanOrder 1 (not a 1/2 sequence): neither
  // agent is gated behind the other's wean status the way pressors sharing one MAP
  // target are (see priorAgentsWeaned in state/store.ts — nothing has a STRICTLY lower
  // weanOrder than anything else, so the "clear priors first" check is a no-op).
  it('weanOrder: both agents share weanOrder 1 — independently weanable, no cross-drug priority', () => {
    const fentanylOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'fentanyl')!
    const dexOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'dexmedetomidine')!
    expect(dexOrder.weanOrder).toBe(1)
    expect(fentanylOrder.weanOrder).toBe(1)
  })

  it('fentanyl alone, at its ordered maximum, closes the pain-score gap to target', () => {
    const fentanylOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'fentanyl')!
    const drug = getDrug('fentanyl')
    const model = ANALGOSEDATION.responseModel.fentanyl!
    const contribution = projectDoseResponse(fentanylOrder.maxDose, drug.maxDose, model.maxPainScoreContribution!)
    const projected = ANALGOSEDATION.startingVitals.painScore + contribution
    expect(meetsTarget(projected, fentanylOrder.target)).toBe(true)
  })

  it('dexmedetomidine alone, at its ordered maximum, brings RASS into the light-sedation range', () => {
    const dexOrder = ANALGOSEDATION.orders.find((o) => o.drugId === 'dexmedetomidine')!
    const drug = getDrug('dexmedetomidine')
    const model = ANALGOSEDATION.responseModel.dexmedetomidine!
    const contribution = projectDoseResponse(dexOrder.maxDose, drug.maxDose, model.maxRassContribution!)
    const projected = ANALGOSEDATION.startingVitals.rass + contribution
    expect(meetsTarget(projected, dexOrder.target)).toBe(true)
  })

  it('is not a deterioration vignette', () => {
    expect(ANALGOSEDATION.deterioration).toEqual({ ratePerMinute: 0, maxDrop: 0 })
  })
})

describe('scenario — diltiazem rate control', () => {
  it('is registered', () => {
    expect(SCENARIOS[DILTIAZEM_RATE_CONTROL.id]).toBe(DILTIAZEM_RATE_CONTROL)
  })

  it('has a non-empty learning objective', () => {
    expect(DILTIAZEM_RATE_CONTROL.objective.length).toBeGreaterThan(0)
  })

  it('has Block of Charting disabled', () => {
    expect(DILTIAZEM_RATE_CONTROL.enableBlockOfCharting).toBe(false)
  })

  it('is a genuinely single-agent scenario', () => {
    expect(DILTIAZEM_RATE_CONTROL.orders).toHaveLength(1)
    expect(DILTIAZEM_RATE_CONTROL.orders[0].drugId).toBe('diltiazem')
  })

  it('order matches the Attachment B formulary defaults exactly', () => {
    const order = DILTIAZEM_RATE_CONTROL.orders[0]
    const drug = getDrug('diltiazem')
    expect(order.startDose).toBe(drug.startDose)
    expect(order.increment).toBe(drug.titrationIncrement)
    expect(order.interval).toEqual(drug.titrationInterval)
    expect(order.maxDose).toBe(drug.maxDose)
  })

  it("targets a genuine HR range (60-100 bpm) via the 'between' comparator, not a single ceiling", () => {
    const order = DILTIAZEM_RATE_CONTROL.orders[0]
    expect(order.target).toEqual({ metric: 'HR', comparator: 'between', value: 60, valueHigh: 100, unit: 'bpm' })
  })

  it('starts elevated, outside the target range', () => {
    const order = DILTIAZEM_RATE_CONTROL.orders[0]
    expect(DILTIAZEM_RATE_CONTROL.startingVitals.hr).toBe(142)
    expect(meetsTarget(DILTIAZEM_RATE_CONTROL.startingVitals.hr, order.target)).toBe(false)
  })

  it('diltiazem alone, at its ordered maximum, brings HR into the rate-control range', () => {
    const order = DILTIAZEM_RATE_CONTROL.orders[0]
    const drug = getDrug('diltiazem')
    const model = DILTIAZEM_RATE_CONTROL.responseModel.diltiazem!
    const contribution = projectDoseResponse(order.maxDose, drug.maxDose, model.maxHrContribution!)
    const projected = DILTIAZEM_RATE_CONTROL.startingVitals.hr + contribution
    expect(meetsTarget(projected, order.target)).toBe(true)
  })

  it('has no activation or weaning requirements (single agent)', () => {
    expect(DILTIAZEM_RATE_CONTROL.orders[0].activationThreshold).toBeUndefined()
    expect(DILTIAZEM_RATE_CONTROL.orders[0].weanOrder).toBeUndefined()
  })

  it('Phase 19g: gains an earlyNotificationThreshold (additive scenario-data change)', () => {
    expect(DILTIAZEM_RATE_CONTROL.orders[0].earlyNotificationThreshold).toBeCloseTo(0.5)
  })
})

describe('Phase 19g — decision-point bank shape sanity, all six scenarios', () => {
  const scenarios = Object.values(SCENARIOS)
  const EXPECTED_NEW_COUNT: Record<string, number> = {
    [DEFAULT_SCENARIO.id]: 1, // +1 on top of the flagship's existing Phase 18 pair
    [SINGLE_AGENT_EARLY_NOTIFICATION.id]: 3,
    [SEQUENTIAL_PRESSOR_ESCALATION.id]: 3,
    [WEANING_SUPPORT.id]: 3,
    [ANALGOSEDATION.id]: 3,
    [DILTIAZEM_RATE_CONTROL.id]: 3,
  }

  it('the flagship has exactly 3 decision points total (2 from Phase 18 + 1 new); every other scenario has exactly 3', () => {
    expect(DEFAULT_SCENARIO.decisionPoints).toHaveLength(3)
    for (const s of [SINGLE_AGENT_EARLY_NOTIFICATION, SEQUENTIAL_PRESSOR_ESCALATION, WEANING_SUPPORT, ANALGOSEDATION, DILTIAZEM_RATE_CONTROL]) {
      expect(s.decisionPoints).toHaveLength(EXPECTED_NEW_COUNT[s.id])
    }
  })

  it('every decision point id is unique within its own scenario (cross-scenario collisions are harmless — only one scenario is ever active per session)', () => {
    for (const s of scenarios) {
      const ids = (s.decisionPoints ?? []).map((dp) => dp.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('every option id is unique within its own decision point', () => {
    for (const s of scenarios) {
      for (const dp of s.decisionPoints ?? []) {
        const optionIds = dp.options.map((o) => o.id)
        expect(new Set(optionIds).size).toBe(optionIds.length)
      }
    }
  })

  it('every order-scoped trigger (earlyNotification/postTitrate/escalationAttempt) references a real order in its own scenario', () => {
    for (const s of scenarios) {
      const orderIds = new Set(s.orders.map((o) => o.id))
      for (const dp of s.decisionPoints ?? []) {
        if (dp.trigger.kind !== 'weanEligible') {
          expect(orderIds.has(dp.trigger.orderId)).toBe(true)
        }
      }
    }
  })

  it('every submitDose/submitDoseRelative/multiStepTitration/notifyProvider effect references a real order in its own scenario', () => {
    for (const s of scenarios) {
      const orderIds = new Set(s.orders.map((o) => o.id))
      for (const dp of s.decisionPoints ?? []) {
        for (const option of dp.options) {
          if ('orderId' in option.effect) {
            expect(orderIds.has(option.effect.orderId)).toBe(true)
          }
        }
      }
    }
  })

  it("every 'none'/'resumeManual' effect option carries a manualTone; every other kind omits it (never consulted, so authoring one would be misleading)", () => {
    for (const s of scenarios) {
      for (const dp of s.decisionPoints ?? []) {
        for (const option of dp.options) {
          if (option.effect.kind === 'none' || option.effect.kind === 'resumeManual') {
            expect(option.manualTone).toBeDefined()
          } else {
            expect(option.manualTone).toBeUndefined()
          }
        }
      }
    }
  })

  it("the diltiazem escalation ceiling's \"check the EKG first\" option is manualTone caution, not critical (the plan's explicitly-checked counter-example)", () => {
    const dp = DILTIAZEM_RATE_CONTROL.decisionPoints!.find((d) => d.id === 'diltiazem-rate-control-escalation')!
    const option = dp.options.find((o) => o.id === 'check-ekg')!
    expect(option.effect.kind).toBe('none')
    expect(option.manualTone).toBe('caution')
  })
})
