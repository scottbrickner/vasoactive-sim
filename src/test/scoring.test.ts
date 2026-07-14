import { beforeEach, describe, expect, it } from 'vitest'
import { useSimStore } from '../state/store'
import { scoreSession } from '../engine/scoring'
import { DEFAULT_SCENARIO } from '../data/scenarios'

const NOREPI_ORDER_ID = 'order-norepinephrine-agent1'
const VASOPRESSIN_ORDER_ID = 'order-vasopressin-agent2'

beforeEach(() => {
  useSimStore.getState().startScenario(DEFAULT_SCENARIO)
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
    s.submitDose(NOREPI_ORDER_ID, 1) // titrate at t=0, 0 min elapsed — too soon (needs 3)
    expect(categoryStatus('adherence')).toBe('partial')
    // Only one titration was attempted and it violated the interval, so 0-of-1 is
    // correctly "missed" here, not "partial" — partial would need a mix of both.
    expect(categoryStatus('intervalIncrement')).toBe('missed')
    const card = score()
    expect(card.opportunities.some((o) => /interval & increment/i.test(o) || /interval/i.test(o))).toBe(true)
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

describe('scoreSession — sequencing violation', () => {
  it('is partial when agent 2 is attempted before activation, but never "missed" (hard-blocked)', () => {
    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02)
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

describe('scoreSession — no activity at all', () => {
  it('reports n/a categories and a null overall percent', () => {
    const card = score()
    expect(card.categories.every((c) => c.status === 'n/a')).toBe(true)
    expect(card.overallPercent).toBeNull()
    expect(card.strengths).toEqual([])
    expect(card.opportunities).toEqual([])
  })
})
