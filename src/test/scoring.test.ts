import { beforeEach, describe, expect, it } from 'vitest'
import { useSimStore } from '../state/store'
import { scoreSession } from '../engine/scoring'
import { DEFAULT_SCENARIO } from '../data/scenarios'

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
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0
    s.chartVitals() // t=0: satisfies 'initiation'
    s.advanceClock(30) // t=30
    s.chartVitals() // satisfies 'plus30Start'
    s.advanceClock(3) // t=33
    s.chartVitals() // satisfies 'preTitration' for the titration below
    s.submitDose(NOREPI_ORDER_ID, 1) // titrate at t=33 (delta 0.5, interval 33 >= 3)
    s.advanceClock(30) // t=63
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
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate ok
    s.submitDose(NOREPI_ORDER_ID, 1) // titrate at t=0, 0 min elapsed — too soon (needs 3), deferred
    s.cancelDoseOverride() // training mode — logs it as off-order, matching the old immediate-reject behavior
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
    s.submitDose(NOREPI_ORDER_ID, 0.5) // initiate ok
    s.submitDose(NOREPI_ORDER_ID, 1) // titrate at t=0 — too soon, deferred
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
