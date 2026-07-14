import { beforeEach, describe, expect, it } from 'vitest'
import { useSimStore } from '../state/store'
import { DEFAULT_SCENARIO } from '../data/scenarios'

const NOREPI_ORDER_ID = 'order-norepinephrine-agent1'
const VASOPRESSIN_ORDER_ID = 'order-vasopressin-agent2'

beforeEach(() => {
  useSimStore.getState().startScenario(DEFAULT_SCENARIO)
  useSimStore.setState({ phase: 'sim' })
})

function norepiInfusion() {
  return useSimStore.getState().infusions.find((i) => i.drugId === 'norepinephrine')!
}

describe('store — Begin Bag gate', () => {
  it('blocks initiation before Begin Bag is completed', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    const state = useSimStore.getState()
    expect(norepiInfusion().status).toBe('hanging')
    expect(norepiInfusion().rate).toBe(0)
    expect(state.feedback).toMatchObject({ tone: 'danger', title: 'Begin Bag required' })
  })

  it('completeBeginBag marks the infusion complete and charts in MAR', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    const state = useSimStore.getState()
    expect(norepiInfusion().beginBagCompleted).toBe(true)
    expect(state.feedback).toMatchObject({ tone: 'success', title: 'Begin Bag complete' })
    const marEntry = state.log.find((e) => e.type === 'documentation' && e.location === 'MAR')
    expect(marEntry).toBeDefined()
    expect(marEntry!.summary).toMatch(/Begin Bag charted in MAR/)
  })
})

describe('store — initiation', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
  })

  it('applies a correctly-dosed initiation and charts the initial rate in MAR', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    const state = useSimStore.getState()
    expect(norepiInfusion().status).toBe('infusing')
    expect(norepiInfusion().rate).toBe(0.5)
    expect(norepiInfusion().lastActionMinute).toBe(0)
    expect(state.lastPhysiologyUpdate).toEqual({ minute: 0, map: 57 })
    expect(state.feedback).toMatchObject({ tone: 'success', title: 'Infusion started' })
    const marEntry = state.log.find((e) => e.type === 'documentation' && e.location === 'MAR' && /Initial rate/.test(e.summary))
    expect(marEntry).toBeDefined()
  })

  it('rejects an off-order starting dose without applying it', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2)
    const state = useSimStore.getState()
    expect(norepiInfusion().status).toBe('hanging')
    expect(norepiInfusion().rate).toBe(0)
    expect(state.feedback?.tone).toBe('warning')
    expect(state.feedback?.title).toBe('Off-order — not applied')
  })

  it('sets verificationFlags and adherenceFlags keyed by the action log entry', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    const state = useSimStore.getState()
    const actionEntry = state.log.find((e) => e.type === 'action')!
    expect(state.verificationFlags[actionEntry.id]).toBe(true)
    expect(state.adherenceFlags[actionEntry.id]).toBe(true)
  })
})

describe('store — titration mechanics', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
  })

  it('rejects titrating sooner than the minimum interval', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // 0 minutes elapsed; needs 3
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback?.title).toBe('Off-order — not applied')
  })

  it('rejects an incorrect increment', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2) // delta 1.5, ordered increment 0.5
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback?.title).toBe('Off-order — not applied')
  })

  it('applies a correctly timed, correctly incremented titration', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1)
    const state = useSimStore.getState()
    expect(norepiInfusion().rate).toBe(1)
    expect(norepiInfusion().lastActionMinute).toBe(3)
    expect(state.feedback).toMatchObject({ tone: 'success', title: 'Titration applied' })
  })

  it('blocks a dose above the Guardrails hard limit (the drug maximum) regardless of order status', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 999)
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Blocked by Guardrails' })
  })
})

describe('store — max dose and provider notification', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    // Seed norepi at its ordered maximum, matching what 59 valid titrations would produce.
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 30, lastActionMinute: 100 } : i)),
    }))
    useSimStore.setState({ clockMinutes: 103 })
  })

  it('blocks a dose above the Guardrails hard limit regardless of target status (order max === drug max here)', () => {
    // Norepi's order max and drug (hard-limit) max are numerically identical (both 30,
    // from Attachment B, no prescriber customization) -- any dose above 30 is a genuine
    // Guardrails hard block, and the pump would refuse it before "needs-provider" is
    // ever reached.
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 31)
    expect(norepiInfusion().rate).toBe(30)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Blocked by Guardrails' })
  })

  it("needs-provider when a prescriber-customized order max is exceeded but the drug's own Guardrails hard limit still allows it", () => {
    // Simulate a prescriber order capping norepi at 25 mcg/min (below Attachment B's 30
    // default) -- the pump would still accept up to 30, so exceeding 25 is an order
    // problem, not a pump problem, and CLINICAL_SPEC routes that to provider notification.
    useSimStore.setState((s) => ({
      orders: s.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, maxDose: 25 } : o)),
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 25 } : i)),
    }))
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 26)
    expect(norepiInfusion().rate).toBe(25)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'warning', title: 'Notify the provider' })
  })

  it('notifyProvider logs the notification and confirms', () => {
    useSimStore.getState().notifyProvider(NOREPI_ORDER_ID, 'MAP still low at max norepi')
    const state = useSimStore.getState()
    expect(state.feedback).toMatchObject({ tone: 'info', title: 'Provider notified' })
    expect(state.log.some((e) => /Provider notified/.test(e.summary) && /MAP still low/.test(e.summary))).toBe(true)
  })
})

describe('store — multi-agent sequence (vasopressin)', () => {
  it('blocks initiating agent 2 before agent 1 is maxed with target unmet', () => {
    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02)
    const state = useSimStore.getState()
    expect(state.infusions.some((i) => i.drugId === 'vasopressin')).toBe(false)
    expect(state.feedback?.title).toBe('Off-order — not applied')
  })

  it('creates and initiates agent 2 once agent 1 is maxed with MAP still below target', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 30, lastActionMinute: 100 } : i)),
    }))

    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02)
    const state = useSimStore.getState()
    const vaso = state.infusions.find((i) => i.drugId === 'vasopressin')
    expect(vaso).toMatchObject({ status: 'infusing', rate: 0.02, beginBagCompleted: true, channel: 'B' })
    expect(state.feedback).toMatchObject({ tone: 'success', title: 'Infusion started' })
  })
})

describe('store — physiology wiring', () => {
  it('advanceClock moves MAP toward the projected total once the response lag has fully elapsed', () => {
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57 },
    }))
    useSimStore.getState().advanceClock(5) // scenario response lag is 2-5 min
    const state = useSimStore.getState()
    expect(state.clockMinutes).toBe(5)
    expect(state.vitals.map).toBe(63) // 57 baseline + 6 (norepi's tuned ceiling), norepi alone insufficient
  })

  it('leaves MAP unmoved before the response lag has begun', () => {
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57 },
    }))
    useSimStore.getState().advanceClock(1) // before minMinutes (2)
    expect(useSimStore.getState().vitals.map).toBe(57)
  })

  it('adding vasopressin closes the gap to target after both have fully responded', () => {
    useSimStore.setState((s) => ({
      infusions: [
        ...s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing' as const, rate: 30 } : i)),
        {
          id: 'infusion-vasopressin',
          orderId: VASOPRESSIN_ORDER_ID,
          drugId: 'vasopressin' as const,
          status: 'infusing' as const,
          rate: 0.04,
          initialRate: 0.02,
          channel: 'B',
          beginBagCompleted: true,
          lastActionMinute: 0,
        },
      ],
      lastPhysiologyUpdate: { minute: 0, map: 63 },
    }))
    useSimStore.getState().advanceClock(5)
    expect(useSimStore.getState().vitals.map).toBeGreaterThanOrEqual(65)
  })
})

describe('store — documentation', () => {
  it('chartVitals logs to iView with a vitals snapshot', () => {
    useSimStore.getState().chartVitals()
    const state = useSimStore.getState()
    const entry = state.log.find((e) => e.type === 'documentation' && e.location === 'iView')
    expect(entry).toBeDefined()
    expect(entry!.vitalsSnapshot).toEqual(state.vitals)
    expect(state.feedback).toMatchObject({ tone: 'success', title: 'Charted' })
  })
})
