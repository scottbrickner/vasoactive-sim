import { beforeEach, describe, expect, it } from 'vitest'
import { useSimStore } from '../state/store'
import { DEFAULT_SCENARIO } from '../data/scenarios'

const NOREPI_ORDER_ID = 'order-norepinephrine-agent1'
const VASOPRESSIN_ORDER_ID = 'order-vasopressin-agent2'

beforeEach(() => {
  useSimStore.getState().startScenario(DEFAULT_SCENARIO, 'training')
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

  it('rejects an off-order starting dose without applying it (training-mode override, cancelled)', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2)
    // Training mode defers off-order attempts pending a learner decision — cancel it.
    expect(useSimStore.getState().pendingOverride).toMatchObject({ orderId: NOREPI_ORDER_ID, dose: 2, action: 'initiate' })
    useSimStore.getState().cancelDoseOverride()
    const state = useSimStore.getState()
    expect(norepiInfusion().status).toBe('hanging')
    expect(norepiInfusion().rate).toBe(0)
    expect(state.pendingOverride).toBeNull()
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

  it('rejects titrating sooner than the minimum interval (training-mode override, cancelled)', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // 0 minutes elapsed; needs 3
    expect(useSimStore.getState().pendingOverride?.violations.intervalTooSoon).toBe(true)
    useSimStore.getState().cancelDoseOverride()
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback?.title).toBe('Off-order — not applied')
  })

  it('rejects an incorrect increment (training-mode override, cancelled)', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2) // delta 1.5, ordered increment 0.5
    expect(useSimStore.getState().pendingOverride?.violations.wrongIncrement).toBe(true)
    useSimStore.getState().cancelDoseOverride()
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback?.title).toBe('Off-order — not applied')
  })

  it('applies a correctly timed, correctly incremented titration', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1)
    const state = useSimStore.getState()
    expect(norepiInfusion().rate).toBe(1)
    expect(norepiInfusion().lastActionMinute).toBe(3)
    expect(state.feedback).toMatchObject({ tone: 'info', title: '3 min have passed' })
  })

  it('blocks a dose above the Guardrails hard limit (the drug maximum) regardless of order status', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 999)
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Blocked by Guardrails' })
  })
})

describe('store — auto-advance by order interval', () => {
  it('a successfully applied titrate auto-advances the clock by the order interval', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0 — no auto-advance
    expect(useSimStore.getState().clockMinutes).toBe(0)
    useSimStore.getState().advanceClock(3) // manual, t=3
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // titrate — norepi's interval is 3 min
    expect(useSimStore.getState().clockMinutes).toBe(6)
  })

  it('does not auto-advance when a titrate is rejected (Guardrails hard limit)', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 999)
    expect(useSimStore.getState().clockMinutes).toBe(3)
  })

  it('does not auto-advance a deferred training-mode override that is cancelled', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // interval too soon — deferred
    expect(useSimStore.getState().clockMinutes).toBe(0)
    useSimStore.getState().cancelDoseOverride()
    expect(useSimStore.getState().clockMinutes).toBe(0)
  })

  it('auto-advances once a deferred training-mode override is confirmed', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // interval too soon — deferred
    useSimStore.getState().confirmDoseOverride()
    expect(useSimStore.getState().clockMinutes).toBe(3)
  })
})

describe('store — training/validation mode override flow', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0
  })

  it('training mode defers an off-order titration, leaving the infusion untouched', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // interval too soon
    const state = useSimStore.getState()
    expect(state.pendingOverride).not.toBeNull()
    expect(norepiInfusion().rate).toBe(0.5)
    expect(state.log.some((e) => e.dose === 1)).toBe(false) // deferred — not logged yet
  })

  it('confirmDoseOverride applies the dose and logs it as overridden, excluded from adherence', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // interval too soon
    useSimStore.getState().confirmDoseOverride()
    const state = useSimStore.getState()
    expect(norepiInfusion().rate).toBe(1)
    expect(state.pendingOverride).toBeNull()
    const entry = state.log.find((e) => e.dose === 1)!
    expect(entry.outcome).toBe('applied')
    expect(entry.overridden).toBe(true)
    expect(state.adherenceFlags[entry.id]).toBe(false)
    expect(state.feedback).toMatchObject({ tone: 'warning', title: 'Applied via override' })
  })

  it('cancelDoseOverride logs the attempt as off-order without applying it', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // interval too soon
    useSimStore.getState().cancelDoseOverride()
    const state = useSimStore.getState()
    expect(norepiInfusion().rate).toBe(0.5)
    const entry = state.log.find((e) => e.dose === 1)!
    expect(entry.outcome).toBe('off-order')
    expect(entry.overridden).toBeUndefined()
  })

  it('validation mode applies an off-order titration silently, scored as overridden', () => {
    useSimStore.setState({ mode: 'validation' })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // interval too soon
    const state = useSimStore.getState()
    expect(state.pendingOverride).toBeNull()
    expect(norepiInfusion().rate).toBe(1)
    const entry = state.log.find((e) => e.dose === 1)!
    expect(entry.outcome).toBe('applied')
    expect(entry.overridden).toBe(true)
    expect(state.adherenceFlags[entry.id]).toBe(false)
    expect(state.feedback).toMatchObject({ tone: 'info', title: '3 min have passed' })
  })

  it('needs-provider is a hard stop in both modes, never deferred', () => {
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 25, lastActionMinute: 0 } : i)),
      orders: s.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, maxDose: 25 } : o)),
      clockMinutes: 3,
    }))
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 26)
    expect(useSimStore.getState().pendingOverride).toBeNull()
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'warning', title: 'Notify the provider' })

    useSimStore.setState({ mode: 'validation', clockMinutes: 6 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 26)
    expect(useSimStore.getState().pendingOverride).toBeNull()
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Not accepted' })
  })
})

describe('store — early-notification threshold', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0
    // norepi maxDose 30; threshold 0.3 -> crosses at dose 9. Baseline MAP (57) stays below
    // the order's target (65) for the whole test since only the infusion rate is seeded
    // directly here, not run through physiology.
    useSimStore.setState((s) => ({
      orders: s.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, earlyNotificationThreshold: 0.3 } : o)),
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 8.5, lastActionMinute: 0 } : i)),
      clockMinutes: 3,
    }))
  })

  it('marks earlyNotificationDue and fires the notify-prompt the tick the threshold is crossed', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9) // 8.5 -> 9 crosses 30*0.3=9
    const state = useSimStore.getState()
    const entry = state.log.find((e) => e.dose === 9)!
    expect(entry.earlyNotificationDue).toBe(true)
    expect(state.feedback).toMatchObject({ tone: 'warning', title: 'Consider notifying the provider' })
  })

  it('does not refire on a later titration once already past the threshold', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9)
    useSimStore.setState({ clockMinutes: 6 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9.5)
    const entry = useSimStore.getState().log.find((e) => e.dose === 9.5)!
    expect(entry.earlyNotificationDue).toBeUndefined()
  })

  it('is skipped while a Block of Charting is active for this order', () => {
    useSimStore.setState({
      activeBlockOfCharting: {
        id: 'block-1',
        orderId: NOREPI_ORDER_ID,
        drugId: 'norepinephrine',
        startMinute: 3,
        endMinute: null,
      },
    })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9)
    const entry = useSimStore.getState().log.find((e) => e.dose === 9)!
    expect(entry.earlyNotificationDue).toBeUndefined()
  })

  it('is never set on an initiate, even one that would numerically cross a low threshold', () => {
    useSimStore.getState().startScenario(DEFAULT_SCENARIO, 'training')
    useSimStore.setState({ phase: 'sim' })
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.setState((s) => ({
      orders: s.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, earlyNotificationThreshold: 0.01 } : o)),
    }))
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate; 30*0.01=0.3, so 0.5 "crosses" it
    const entry = useSimStore.getState().log.find((e) => e.dose === 0.5)!
    expect(entry.earlyNotificationDue).toBeUndefined()
  })

  it('confirmDoseOverride also attaches earlyNotificationDue when the crossed dose applies via override', () => {
    // 9.5 is off-order (increment should be 0.5 from 8.5, so 9 is the compliant step) --
    // forces the deferred training-mode override path, whose applied entry needs the same
    // early-notification detection as submitDose's direct-apply path.
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9.5)
    expect(useSimStore.getState().pendingOverride).not.toBeNull()
    useSimStore.getState().confirmDoseOverride()
    const state = useSimStore.getState()
    const entry = state.log.find((e) => e.dose === 9.5)!
    expect(entry.overridden).toBe(true)
    expect(entry.earlyNotificationDue).toBe(true)
    expect(state.feedback).toMatchObject({ tone: 'warning', title: 'Consider notifying the provider' })
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
  it('blocks initiating agent 2 before agent 1 has reached its activation threshold with target unmet', () => {
    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02)
    expect(useSimStore.getState().pendingOverride?.violations.sequenceNotActivated).toBe(true)
    useSimStore.getState().cancelDoseOverride()
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

  it('activates agent 2 at 1/3 of norepi max (10 mcg/min), not only at its full max', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 10, lastActionMinute: 30 } : i)),
    }))

    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02)
    const state = useSimStore.getState()
    expect(state.infusions.some((i) => i.drugId === 'vasopressin')).toBe(true)
    expect(state.feedback).toMatchObject({ tone: 'success', title: 'Infusion started' })
  })

  it('does not activate agent 2 just below 1/3 of norepi max (9 mcg/min)', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 9, lastActionMinute: 30 } : i)),
    }))

    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02)
    expect(useSimStore.getState().pendingOverride?.violations.sequenceNotActivated).toBe(true)
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
          stoppedAtMinute: null,
          rateBeforePause: null,
        },
      ],
      lastPhysiologyUpdate: { minute: 0, map: 63 },
    }))
    useSimStore.getState().advanceClock(5)
    expect(useSimStore.getState().vitals.map).toBeGreaterThanOrEqual(65)
  })

  it('advanceClock derives live SBP/DBP from the new MAP, holding pulse pressure constant', () => {
    const startingVitals = useSimStore.getState().scenario.startingVitals
    const startingPulsePressure = startingVitals.sbp - startingVitals.dbp
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57 },
    }))
    useSimStore.getState().advanceClock(5) // MAP moves from 57 to 63 (norepi alone)
    const { sbp, dbp, map } = useSimStore.getState().vitals
    expect(map).toBe(63)
    expect(sbp).not.toBe(startingVitals.sbp)
    expect(dbp).not.toBe(startingVitals.dbp)
    expect(sbp - dbp).toBe(startingPulsePressure)
  })
})

describe('store — vitals variability', () => {
  it('advanceClock layers periodic variability onto HR while MAP stays exact/deterministic', () => {
    const startingHr = useSimStore.getState().scenario.startingVitals.hr
    // An infusing infusion keeps deterioration from also moving MAP this tick, so this
    // test isolates variability's effect from that separate mechanism.
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
    }))
    useSimStore.getState().advanceClock(3)
    const state = useSimStore.getState()
    // At minute 3 with period 7, phase 0, the jitter is non-zero (not one of the
    // sine's zero-crossings) — this scenario's exact numbers make this deterministic.
    expect(state.vitals.hr).not.toBe(startingHr)
    expect(state.vitals.map).toBe(57) // no lastPhysiologyUpdate anchor yet — drug-response interpolation hasn't started, MAP untouched by variability
  })

  it('the same clock minute always produces the same HR jitter (deterministic, not random)', () => {
    useSimStore.getState().advanceClock(9)
    const first = useSimStore.getState().vitals.hr
    useSimStore.getState().advanceClock(0) // re-evaluate at the same minute
    const second = useSimStore.getState().vitals.hr
    expect(first).toBe(second)
  })

  it('preserves pulse pressure even with BP variability applied', () => {
    const startingVitals = useSimStore.getState().scenario.startingVitals
    const startingPulsePressure = startingVitals.sbp - startingVitals.dbp
    useSimStore.getState().advanceClock(13)
    const { sbp, dbp } = useSimStore.getState().vitals
    expect(sbp - dbp).toBe(startingPulsePressure)
  })
})

describe('store — pause and restart', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
  })

  it('pauseInfusion stops the infusion and records the pre-pause rate', () => {
    useSimStore.getState().pauseInfusion(norepiInfusion().id)
    const infusion = norepiInfusion()
    expect(infusion.status).toBe('stopped')
    expect(infusion.rate).toBe(0)
    expect(infusion.rateBeforePause).toBe(0.5)
    expect(infusion.stoppedAtMinute).toBe(0)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'info', title: 'Infusion paused' })
  })

  it('submitDose is rejected while paused, directing the nurse to restart or discontinue', () => {
    useSimStore.getState().pauseInfusion(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1)
    expect(norepiInfusion().rate).toBe(0)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Infusion paused' })
  })

  it('restartInfusion resumes at the rate in effect before the pause, not order.startDose', () => {
    useSimStore.getState().advanceClock(10)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // titrate first so pre-pause rate != startDose
    useSimStore.getState().pauseInfusion(norepiInfusion().id)
    useSimStore.getState().advanceClock(5)
    useSimStore.getState().restartInfusion(norepiInfusion().id)
    const infusion = norepiInfusion()
    expect(infusion.status).toBe('infusing')
    expect(infusion.rate).toBe(1)
    expect(infusion.rateBeforePause).toBeNull()
    expect(infusion.stoppedAtMinute).toBeNull()
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'success', title: 'Infusion restarted' })
  })
})

describe('store — discontinue', () => {
  it('removes the infusion and charts discontinuation in MAR', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    const id = norepiInfusion().id
    useSimStore.getState().discontinueInfusion(id)
    const state = useSimStore.getState()
    expect(state.infusions.some((i) => i.id === id)).toBe(false)
    const marEntry = state.log.find(
      (e) => e.type === 'documentation' && e.location === 'MAR' && /Discontinuation/.test(e.summary),
    )
    expect(marEntry).toBeDefined()
    expect(state.feedback).toMatchObject({ tone: 'info', title: 'Infusion discontinued' })
  })

  it('can discontinue a paused infusion too', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.getState().pauseInfusion(norepiInfusion().id)
    const id = norepiInfusion().id
    useSimStore.getState().discontinueInfusion(id)
    expect(useSimStore.getState().infusions.some((i) => i.id === id)).toBe(false)
  })
})

describe('store — 2-hour off rule', () => {
  it('advanceClock warns once a paused infusion crosses 120 minutes stopped', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.getState().pauseInfusion(norepiInfusion().id)
    useSimStore.getState().advanceClock(119)
    expect(useSimStore.getState().feedback?.title).not.toBe('Infusion off for 2+ hours')
    useSimStore.getState().advanceClock(1) // total 120
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Infusion off for 2+ hours' })
  })
})

describe('store — Block of Charting', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
  })

  it('declareBlockOfCharting requires an infusing infusion for that order', () => {
    useSimStore.getState().declareBlockOfCharting(VASOPRESSIN_ORDER_ID) // not infusing
    expect(useSimStore.getState().activeBlockOfCharting).toBeNull()
  })

  it('declares a block and lets submitDose bypass interval/increment checks while active', () => {
    useSimStore.getState().declareBlockOfCharting(NOREPI_ORDER_ID)
    expect(useSimStore.getState().activeBlockOfCharting).toMatchObject({
      orderId: NOREPI_ORDER_ID,
      drugId: 'norepinephrine',
      startMinute: 0,
    })
    // Off-order under normal rules: 0 min elapsed (needs 3) and a jump far past the 0.5 increment.
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 10)
    expect(norepiInfusion().rate).toBe(10)
    const entry = useSimStore.getState().log.find((e) => e.doseAction === 'titrate')!
    expect(entry.outcome).toBe('applied')
    expect(entry.underBlockOfCharting).toBe(true)
  })

  it('still blocks a dose above the Guardrails hard limit even under an active block', () => {
    useSimStore.getState().declareBlockOfCharting(NOREPI_ORDER_ID)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 999)
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Blocked by Guardrails' })
  })

  it('closeBlockOfCharting records the episode in history', () => {
    useSimStore.getState().declareBlockOfCharting(NOREPI_ORDER_ID)
    useSimStore.getState().advanceClock(20)
    useSimStore.getState().closeBlockOfCharting()
    const state = useSimStore.getState()
    expect(state.activeBlockOfCharting).toBeNull()
    expect(state.blockOfChartingHistory).toHaveLength(1)
    expect(state.blockOfChartingHistory[0]).toMatchObject({ orderId: NOREPI_ORDER_ID, startMinute: 0, endMinute: 20 })
  })

  it('advanceClock warns once an active block exceeds 4 hours', () => {
    useSimStore.getState().declareBlockOfCharting(NOREPI_ORDER_ID)
    useSimStore.getState().advanceClock(239)
    expect(useSimStore.getState().feedback?.title).not.toBe('Block of Charting exceeds 4 hours')
    useSimStore.getState().advanceClock(1) // total 240
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'warning', title: 'Block of Charting exceeds 4 hours' })
  })
})

describe('store — deterioration', () => {
  it('keeps the displayed MAP an integer even when the deterioration delta is fractional', () => {
    useSimStore.getState().advanceClock(5) // 0.5 mmHg/min * 5 min = 2.5, a fractional delta
    const state = useSimStore.getState()
    expect(state.deteriorationOffset).toBe(2.5) // the accumulator itself stays exact
    expect(Number.isInteger(state.vitals.map)).toBe(true)
    expect(state.vitals.map).toBe(55) // round(57 - 2.5)
  })

  it('advanceClock declines MAP when no infusion is running, even before any titration', () => {
    useSimStore.getState().advanceClock(10) // nothing started — norepi is still 'hanging'
    const state = useSimStore.getState()
    expect(state.deteriorationOffset).toBe(5) // 0.5 mmHg/min * 10 min
    expect(state.vitals.map).toBe(52) // 57 baseline - 5
  })

  it('freezes once an infusion is infusing, even across further clock advances', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0, no untreated time yet
    expect(useSimStore.getState().deteriorationOffset).toBe(0)
    useSimStore.getState().advanceClock(20) // infusing throughout — should not deteriorate
    expect(useSimStore.getState().deteriorationOffset).toBe(0)
  })

  it('resumes accruing once a previously-infusing infusion is paused', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.getState().advanceClock(10)
    expect(useSimStore.getState().deteriorationOffset).toBe(0)
    useSimStore.getState().pauseInfusion(norepiInfusion().id)
    useSimStore.getState().advanceClock(4)
    expect(useSimStore.getState().deteriorationOffset).toBe(2) // 0.5 * 4
  })

  it('caps at the scenario maxDrop regardless of how long it goes untreated', () => {
    useSimStore.getState().advanceClock(1000)
    expect(useSimStore.getState().deteriorationOffset).toBe(15)
  })

  it('surfaces a one-time warning the moment deterioration begins, not on every tick', () => {
    useSimStore.getState().advanceClock(5)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'warning', title: 'MAP trending down, untreated' })
    useSimStore.getState().dismissFeedback()
    useSimStore.getState().advanceClock(5) // still untreated, but not a fresh 0->>0 transition
    expect(useSimStore.getState().feedback).toBeNull()
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

describe('store — vitalsHistory and retrospective charting', () => {
  it('seeds vitalsHistory with the starting vitals at minute 0', () => {
    expect(useSimStore.getState().vitalsHistory).toEqual([{ minute: 0, vitals: DEFAULT_SCENARIO.startingVitals }])
  })

  it('advanceClock appends a new vitalsHistory entry each time', () => {
    useSimStore.getState().advanceClock(5)
    useSimStore.getState().advanceClock(5)
    const history = useSimStore.getState().vitalsHistory
    expect(history.map((h) => h.minute)).toEqual([0, 5, 10])
  })

  it('chartRetrospective backdates an entry using the vitals snapshot from that minute', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // t=0
    useSimStore.getState().advanceClock(10) // t=10, new vitalsHistory entry
    const vitalsAtTen = useSimStore.getState().vitals
    useSimStore.getState().advanceClock(5) // t=15 — current vitals now differ from t=10's

    useSimStore.getState().chartRetrospective(10)
    const state = useSimStore.getState()
    const entry = state.log.find((e) => e.type === 'documentation' && e.minute === 10)!
    expect(entry.retrospective).toBe(true)
    expect(entry.enteredAtMinute).toBe(15)
    expect(entry.vitalsSnapshot).toEqual(vitalsAtTen)
    expect(state.feedback).toMatchObject({ tone: 'success', title: 'Charted' })
  })

  it('falls back to the closest prior vitalsHistory entry when the exact minute has no snapshot', () => {
    useSimStore.getState().advanceClock(10) // vitalsHistory: [0, 10]
    const vitalsAtTen = useSimStore.getState().vitals
    useSimStore.getState().advanceClock(10) // vitalsHistory: [0, 10, 20]

    useSimStore.getState().chartRetrospective(15) // no exact entry for 15 — falls back to 10
    const entry = useSimStore.getState().log.find((e) => e.type === 'documentation' && e.minute === 15)!
    expect(entry.vitalsSnapshot).toEqual(vitalsAtTen)
  })

  it('does nothing when asked to chart a future minute', () => {
    useSimStore.getState().chartRetrospective(999)
    expect(useSimStore.getState().log.some((e) => e.minute === 999)).toBe(false)
  })

  it('a live chartVitals entry is not marked retrospective', () => {
    useSimStore.getState().chartVitals()
    const entry = useSimStore.getState().log.find((e) => e.type === 'documentation')!
    expect(entry.retrospective).toBeUndefined()
    expect(entry.enteredAtMinute).toBeUndefined()
  })
})
