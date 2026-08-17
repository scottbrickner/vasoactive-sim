import { beforeEach, describe, expect, it } from 'vitest'
import { useSimStore } from '../state/store'
import { isSkillPassed, scoreSession, type Scorecard } from '../engine/scoring'
import { DEFAULT_SCENARIO } from '../data/scenarios'
import { SKILL_SIGNOFF_CRITERIA } from '../data/policy'

const NOREPI_ORDER_ID = 'order-norepinephrine-agent1'
const VASOPRESSIN_ORDER_ID = 'order-vasopressin-agent2'

beforeEach(() => {
  useSimStore.getState().startScenario(DEFAULT_SCENARIO, 'training')
  useSimStore.setState({ phase: 'sim' })
})

function score() {
  return scoreSession(useSimStore.getState())
}

function categoryStatus(key: string) {
  return score().categories.find((c) => c.key === key)?.status
}

function norepiInfusionId() {
  return useSimStore.getState().infusions.find((i) => i.drugId === 'norepinephrine')!.id
}

describe('scoreSession — a clean, fully-compliant run', () => {
  beforeEach(() => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0, auto-advances to t=3
    s.chartRetrospective(0) // backdate to the true initiation minute — satisfies 'initiation'
    s.advanceClock(27) // t=30
    s.chartVitals() // satisfies 'plus30Start'
    s.advanceClock(3) // t=33
    s.chartVitals() // satisfies 'preTitration' for the titration below
    s.submitDose(NOREPI_ORDER_ID, 1) // titrate at t=33 (delta 0.5, interval easily satisfied), auto-advances to t=36
    s.advanceClock(27) // t=63
    s.chartVitals() // satisfies 'plus30PostTitration' (63 >= 33+30)
  })

  it('scores every applicable category as met, with providerNotification n/a', () => {
    const card = score()
    expect(categoryStatus('adherence')).toBe('met')
    expect(categoryStatus('intervalIncrement')).toBe('met')
    expect(categoryStatus('sequencing')).toBe('met')
    expect(categoryStatus('verification')).toBe('met')
    expect(categoryStatus('documentation')).toBe('met')
    expect(categoryStatus('providerNotification')).toBe('n/a')
    expect(card.overallPercent).toBe(100)
    expect(card.opportunities).toEqual([])
  })
})

describe('scoreSession — off-order titration', () => {
  it('flags adherence and interval/increment as partial when a titration is rejected', () => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate ok, auto-advances so interval is already satisfied
    s.submitDose(NOREPI_ORDER_ID, 2) // titrate — wrong increment (delta 1.5, ordered 0.5), deferred
    s.cancelDoseOverride() // training mode — logs it as off-order
    expect(categoryStatus('adherence')).toBe('partial')
    // Only one titration was attempted and it violated the interval, so 0-of-1 is
    // correctly "missed" here, not "partial" — partial would need a mix of both.
    expect(categoryStatus('intervalIncrement')).toBe('missed')
    const card = score()
    expect(card.opportunities.some((o) => /interval & increment/i.test(o) || /interval/i.test(o))).toBe(true)
  })
})

describe('scoreSession — overridden dose entries', () => {
  it('counts an overridden dose in the adherence denominator but not the numerator', () => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate ok, auto-advances so interval is already satisfied
    s.submitDose(NOREPI_ORDER_ID, 2) // titrate — wrong increment, deferred
    s.confirmDoseOverride() // training-mode override — applies despite being off-order
    // 1 clean (initiate) + 1 overridden (titrate) = 2 total, only 1 counted as adherent.
    expect(categoryStatus('adherence')).toBe('partial')
    const card = score()
    const adherence = card.categories.find((c) => c.key === 'adherence')!
    expect(adherence.detail).toMatch(/1 of 2/)
  })
})

describe('scoreSession — needs-provider and notification', () => {
  beforeEach(() => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5)
    // Prescriber-customized order max (25) below the drug's own Guardrails ceiling (30)
    // — the pump would still accept up to 30, so exceeding 25 is an order problem routed
    // to provider notification, not a Guardrails hard block (mirrors store.test.ts).
    useSimStore.setState((st) => ({
      orders: st.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, maxDose: 25 } : o)),
      infusions: st.infusions.map((i) =>
        i.drugId === 'norepinephrine' ? { ...i, rate: 25, lastActionMinute: 100 } : i,
      ),
    }))
    useSimStore.setState({ clockMinutes: 103 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 26) // needs-provider
  })

  it('is missed when no notification follows', () => {
    expect(categoryStatus('providerNotification')).toBe('missed')
  })

  it('is met once notifyProvider is called for the same order', () => {
    useSimStore.getState().notifyProvider(NOREPI_ORDER_ID, 'MAP still low at max norepi')
    expect(categoryStatus('providerNotification')).toBe('met')
  })
})

describe('scoreSession — early-notification threshold', () => {
  it('counts an earlyNotificationDue entry as a needed event, satisfied only by notifying the SPECIFIC order that needs it', () => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate norepi
    // Seed norepi at vasopressin's activation threshold (1/3 of 30 = 10) so vasopressin unlocks.
    useSimStore.setState((st) => ({
      infusions: st.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 10, lastActionMinute: 0 } : i)),
    }))
    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02) // initiate vasopressin
    useSimStore.setState((st) => ({
      orders: st.orders.map((o) => (o.id === VASOPRESSIN_ORDER_ID ? { ...o, earlyNotificationThreshold: 0.75 } : o)),
      // Re-anchor vasopressin's own lastActionMinute to 0 — its initiate now auto-advances
      // the shared clock too, so without this the explicit clockMinutes:30 below would
      // read as only 27 min elapsed since vaso's own last action (its interval is 30 min).
      infusions: st.infusions.map((i) => (i.drugId === 'vasopressin' ? { ...i, lastActionMinute: 0 } : i)),
      clockMinutes: 30,
    }))
    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.03) // titrate; crosses 0.04*0.75=0.03
    const entry = useSimStore.getState().log.find((e) => e.dose === 0.03)!
    expect(entry.earlyNotificationDue).toBe(true)
    expect(categoryStatus('providerNotification')).toBe('missed')

    // Regression check for the ProviderNotifyControl targeting bug: this event is on
    // vasopressin (sequence 2), so notifying the WRONG order (norepi, sequence 1 — what
    // the control used to hardcode) must NOT satisfy it.
    useSimStore.getState().notifyProvider(NOREPI_ORDER_ID, 'wrong order')
    expect(categoryStatus('providerNotification')).toBe('missed')

    useSimStore.getState().notifyProvider(VASOPRESSIN_ORDER_ID, 'MAP still low with vasopressin at 0.03')
    expect(categoryStatus('providerNotification')).toBe('met')
  })
})

describe('scoreSession — sequencing violation', () => {
  it('is partial when agent 2 is attempted before activation, but never "missed" (hard-blocked)', () => {
    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02)
    useSimStore.getState().cancelDoseOverride()
    expect(categoryStatus('sequencing')).toBe('partial')
  })
})

describe('scoreSession — missed documentation', () => {
  it('flags documentation as missed when nothing is ever charted', () => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5)
    expect(categoryStatus('documentation')).toBe('missed')
  })
})

describe('scoreSession — Block of Charting', () => {
  beforeEach(() => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5)
  })

  it('is n/a when no block has ever been declared', () => {
    expect(categoryStatus('blockOfCharting')).toBe('n/a')
  })

  it('is missed when the block is closed with no charting and no provider notification', () => {
    useSimStore.getState().declareBlockOfCharting(NOREPI_ORDER_ID)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 10)
    useSimStore.getState().closeBlockOfCharting()
    expect(categoryStatus('blockOfCharting')).toBe('missed')
  })

  it('is met once parameters are charted during the block and the provider is notified', () => {
    useSimStore.getState().declareBlockOfCharting(NOREPI_ORDER_ID)
    useSimStore.getState().chartVitals()
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 10)
    useSimStore.getState().notifyProvider(NOREPI_ORDER_ID, 'Rapid titration in effect')
    useSimStore.getState().closeBlockOfCharting()
    expect(categoryStatus('blockOfCharting')).toBe('met')
  })

  it('excludes block-of-charting dose entries from order adherence / interval-increment scoring', () => {
    useSimStore.getState().declareBlockOfCharting(NOREPI_ORDER_ID)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 10) // would be off-order under normal rules
    // Only the initiate (0.5, applied) counts toward adherence — the block titration is excluded.
    expect(categoryStatus('adherence')).toBe('met')
    expect(categoryStatus('intervalIncrement')).toBe('n/a')
  })
})

describe('scoreSession — multi-step titration', () => {
  beforeEach(() => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0
    useSimStore.setState((st) => ({
      orders: st.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, earlyNotificationThreshold: 0.3 } : o)),
      infusions: st.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 8.5, lastActionMinute: 0 } : i)),
      clockMinutes: 3,
    }))
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9) // crosses threshold, opens the decision point
    useSimStore.getState().runMultiStepTitration(NOREPI_ORDER_ID, 10.5) // 9.5, 10, 10.5
  })

  it('excludes multi-step-generated dose entries from order adherence / interval-increment scoring', () => {
    // Only the initiate (0.5) and the manually-entered 9 count toward adherence/interval-
    // increment — the three auto-generated titrations are correct-by-construction, not a
    // demonstrated learner skill, so they're excluded from both categories' denominators.
    const normalDoseEntryCount = useSimStore
      .getState()
      .log.filter((e) => e.type === 'action' && e.doseAction != null && !e.autoGeneratedByMultiStep).length
    expect(normalDoseEntryCount).toBe(2)
    expect(categoryStatus('adherence')).toBe('met')
  })

  it('still satisfies documentation-cadence checkpoints via the auto-chart entries', () => {
    // Each step auto-charts vitals at its own minute, so preTitration for that step is
    // satisfied without any manual "Chart now" click.
    const card = score()
    const documentation = card.categories.find((c) => c.key === 'documentation')!
    expect(documentation.status).not.toBe('missed')
  })
})

describe('scoreSession — retrospective charting', () => {
  it('a backdated chartRetrospective entry satisfies the same cadence checkpoint a live chartVitals would', () => {
    const s = useSimStore.getState()
    s.completeBeginBag(norepiInfusionId())
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0, nothing charted live
    s.advanceClock(10) // t=10, no charting yet — documentation would otherwise be 'missed'
    s.chartRetrospective(0) // backdate the initiation checkpoint to when it actually happened
    // documentation.ts's checkCadence reads only the entry's `minute` (0), not
    // `enteredAtMinute` (10) — confirms a backdated entry integrates exactly like a
    // live one, with zero scoring.ts changes needed.
    expect(categoryStatus('documentation')).toBe('partial') // initiation met, +30Start not yet due
    const card = score()
    const doc = card.categories.find((c) => c.key === 'documentation')!
    expect(doc.detail).toMatch(/1 of 2/)
  })
})

function seedTwoAgentWeanOrder(vasopressinRate: number) {
  useSimStore.setState((s) => ({
    orders: s.orders.map((o) =>
      o.id === NOREPI_ORDER_ID ? { ...o, weanOrder: 2 } : o.id === VASOPRESSIN_ORDER_ID ? { ...o, weanOrder: 1 } : o,
    ),
    infusions: [
      ...s.infusions.filter((i) => i.drugId !== 'norepinephrine'),
      {
        id: 'infusion-norepi-seed',
        orderId: NOREPI_ORDER_ID,
        drugId: 'norepinephrine' as const,
        status: 'infusing' as const,
        rate: 10,
        initialRate: 0.5,
        channel: 'A',
        beginBagCompleted: true,
        lastActionMinute: 0,
        stoppedAtMinute: null,
        rateBeforePause: null,
      },
      {
        id: 'infusion-vasopressin-seed',
        orderId: VASOPRESSIN_ORDER_ID,
        drugId: 'vasopressin' as const,
        status: 'infusing' as const,
        rate: vasopressinRate,
        initialRate: 0.02,
        channel: 'B',
        beginBagCompleted: true,
        lastActionMinute: 0,
        stoppedAtMinute: null,
        rateBeforePause: null,
      },
    ],
  }))
}

describe('scoreSession — weaning sequence', () => {
  it('is n/a when the scenario has no weaning-order requirement', () => {
    expect(categoryStatus('weaning')).toBe('n/a')
  })

  it('is n/a when no actions have been taken yet, even with a weaning-order requirement configured', () => {
    seedTwoAgentWeanOrder(0.03)
    expect(categoryStatus('weaning')).toBe('n/a')
  })

  it('is partial when a down-titration is attempted before the lower-weanOrder agent is cleared', () => {
    seedTwoAgentWeanOrder(0.03)
    useSimStore.setState({ clockMinutes: 30 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9.5) // down-titration, deferred (training mode)
    useSimStore.getState().cancelDoseOverride()
    expect(categoryStatus('weaning')).toBe('partial')
  })

  it('is partial when discontinuation happens before the lower-weanOrder agent is cleared', () => {
    seedTwoAgentWeanOrder(0.03)
    const norepiId = useSimStore.getState().infusions.find((i) => i.drugId === 'norepinephrine')!.id
    useSimStore.getState().discontinueInfusion(norepiId)
    expect(categoryStatus('weaning')).toBe('partial')
  })

  it('is met when the lower-weanOrder agent is already cleared before down-titrating', () => {
    seedTwoAgentWeanOrder(0.02) // vasopressin already at its own startDose -- cleared
    useSimStore.setState({ clockMinutes: 30 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9.5)
    expect(categoryStatus('weaning')).toBe('met')
  })
})

describe('scoreSession — documentation cadence for pre-seeded infusions', () => {
  function seedPreExistingNorepiInfusion() {
    useSimStore.setState({
      infusions: [
        {
          id: 'infusion-preseeded',
          orderId: NOREPI_ORDER_ID,
          drugId: 'norepinephrine',
          status: 'infusing',
          rate: 10,
          initialRate: 10,
          channel: 'A',
          beginBagCompleted: true,
          lastActionMinute: null,
          stoppedAtMinute: null,
          rateBeforePause: null,
        },
      ],
    })
  }

  it('does not silently read n/a for an infusion that started already infusing (no real initiation LogEntry)', () => {
    seedPreExistingNorepiInfusion()
    expect(categoryStatus('documentation')).toBe('missed')
  })

  it('the pre-seeded infusion satisfies its initiation checkpoint via a chart at minute 0', () => {
    seedPreExistingNorepiInfusion()
    useSimStore.getState().chartVitals()
    const card = score()
    const doc = card.categories.find((c) => c.key === 'documentation')!
    expect(doc.status).toBe('partial') // initiation satisfied; +30Start not yet due
    expect(doc.detail).toMatch(/1 of 2/)
  })
})

describe('scoreSession — no activity at all', () => {
  it('reports n/a categories and a null overall percent', () => {
    const card = score()
    expect(card.categories.every((c) => c.status === 'n/a')).toBe(true)
    expect(card.overallPercent).toBeNull()
    expect(card.strengths).toEqual([])
    expect(card.opportunities).toEqual([])
  })
})

function fixtureCard(overrides: Partial<Scorecard> = {}): Scorecard {
  return {
    categories: [{ key: 'adherence', label: 'Order adherence', status: 'met', detail: '' }],
    overallPercent: 100,
    strengths: [],
    opportunities: [],
    ...overrides,
  }
}

describe('isSkillPassed', () => {
  it('is false when overallPercent is null (nothing was scoreable)', () => {
    expect(isSkillPassed(fixtureCard({ overallPercent: null }))).toBe(false)
  })

  it('is true at exactly the threshold with no missed category', () => {
    expect(isSkillPassed(fixtureCard({ overallPercent: SKILL_SIGNOFF_CRITERIA.minOverallPercent }))).toBe(true)
  })

  it('is false one point below the threshold', () => {
    expect(isSkillPassed(fixtureCard({ overallPercent: SKILL_SIGNOFF_CRITERIA.minOverallPercent - 1 }))).toBe(false)
  })

  it('is false when a category is "missed", even with a high overall percent', () => {
    // Unreachable via a real scoreSession() call given today's category count/weights,
    // but the requireNoMissedCategory guard itself needs direct coverage so it's proven
    // to not be a no-op.
    const card = fixtureCard({
      overallPercent: 95,
      categories: [
        { key: 'adherence', label: 'Order adherence', status: 'met', detail: '' },
        { key: 'documentation', label: 'Documentation cadence & placement', status: 'missed', detail: '' },
      ],
    })
    expect(isSkillPassed(card)).toBe(false)
  })
})

describe('scoreSession — category 9, clinical judgment (Phase 18 decision points)', () => {
  it('is n/a when no decision points were ever presented this session', () => {
    expect(categoryStatus('clinicalJudgment')).toBe('n/a')
  })

  it('is met when every resolved decision was "good"', () => {
    useSimStore.setState((s) => ({
      log: [
        ...s.log,
        { id: 'dp-1', minute: 10, type: 'action', summary: 'Decision', decisionPointId: 'dp', decisionOptionId: 'ok', decisionTone: 'good' },
      ],
    }))
    expect(categoryStatus('clinicalJudgment')).toBe('met')
  })

  it('is partial when picks are a mix of good and critical/caution', () => {
    useSimStore.setState((s) => ({
      log: [
        ...s.log,
        { id: 'dp-1', minute: 10, type: 'action', summary: 'Decision', decisionPointId: 'dp', decisionOptionId: 'ok', decisionTone: 'good' },
        { id: 'dp-2', minute: 20, type: 'action', summary: 'Decision', decisionPointId: 'dp', decisionOptionId: 'bad', decisionTone: 'critical' },
      ],
    }))
    expect(categoryStatus('clinicalJudgment')).toBe('partial')
  })

  it('is missed when every resolved decision was critical/caution', () => {
    useSimStore.setState((s) => ({
      log: [
        ...s.log,
        { id: 'dp-1', minute: 10, type: 'action', summary: 'Decision', decisionPointId: 'dp', decisionOptionId: 'bad', decisionTone: 'critical' },
      ],
    }))
    expect(categoryStatus('clinicalJudgment')).toBe('missed')
  })
})
