import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { priorAgentsWeaned, useSimStore } from '../state/store'
import { autoEarlyNotificationDecisionPointId } from '../engine/decisionPoints'
import { scoreSession } from '../engine/scoring'
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
    expect(state.lastPhysiologyUpdate).toEqual({ minute: 0, map: 57, hr: 118, spo2: 96 })
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

  it('sets verificationFlags and adherenceFlags keyed by the initiate action log entry (not Begin Bag, which is no longer its own verification event)', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    const state = useSimStore.getState()
    const actionEntry = state.log.find((e) => e.type === 'action' && e.doseAction === 'initiate')!
    expect(state.verificationFlags[actionEntry.id]).toBe(true)
    expect(state.adherenceFlags[actionEntry.id]).toBe(true)
    const beginBagEntry = state.log.find((e) => e.type === 'action' && e.doseAction == null)!
    expect(state.verificationFlags[beginBagEntry.id]).toBeUndefined()
  })
})

describe('store — titration mechanics', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
  })

  it('rejects titrating sooner than the minimum interval (training-mode override, cancelled)', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // valid — auto-advances, landing exactly at the interval boundary
    // Auto-advance means a real next action never lands "too soon" on its own — force 0
    // elapsed since the last change to exercise a genuine interval violation.
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, lastActionMinute: s.clockMinutes } : i)),
    }))
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5)
    expect(useSimStore.getState().pendingOverride?.violations.intervalTooSoon).toBe(true)
    useSimStore.getState().cancelDoseOverride()
    expect(norepiInfusion().rate).toBe(1)
    expect(useSimStore.getState().feedback?.title).toBe('Off-order — not applied')
  })

  it('rejects an incorrect increment (training-mode override, cancelled)', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2) // delta 1.5, ordered increment 0.5
    expect(useSimStore.getState().pendingOverride?.violations.wrongIncrement).toBe(true)
    useSimStore.getState().cancelDoseOverride()
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback?.title).toBe('Off-order — not applied')
  })

  it('applies a correctly timed, correctly incremented titration', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1)
    const state = useSimStore.getState()
    expect(norepiInfusion().rate).toBe(1)
    expect(norepiInfusion().lastActionMinute).toBe(3)
    expect(state.feedback).toMatchObject({ tone: 'info', title: '3 min have passed' })
  })

  it('blocks a dose above the Guardrails hard limit (the drug maximum) regardless of order status', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 999)
    expect(norepiInfusion().rate).toBe(0.5)
    expect(useSimStore.getState().feedback).toMatchObject({ tone: 'danger', title: 'Blocked by Guardrails' })
  })
})

describe('store — auto-advance by order interval', () => {
  it('a successfully applied initiate auto-advances the clock by the order interval', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate — norepi's interval is 3 min
    expect(useSimStore.getState().clockMinutes).toBe(3)
  })

  it('a successfully applied titrate auto-advances the clock by the order interval', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate, t=0 -> 3
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // titrate — interval already satisfied
    expect(useSimStore.getState().clockMinutes).toBe(6)
  })

  it('does not auto-advance when a titrate is rejected (Guardrails hard limit)', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // t=0 -> 3
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 999)
    expect(useSimStore.getState().clockMinutes).toBe(3)
  })

  it('does not auto-advance a deferred training-mode override that is cancelled', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // t=0 -> 3
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // valid — auto-advances to 6
    // Force 0 elapsed since the last change — a real next action never lands "too soon"
    // on its own now that every successful dose change auto-advances by the interval.
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, lastActionMinute: s.clockMinutes } : i)),
    }))
    const clockBefore = useSimStore.getState().clockMinutes
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // too soon — deferred
    expect(useSimStore.getState().clockMinutes).toBe(clockBefore)
    useSimStore.getState().cancelDoseOverride()
    expect(useSimStore.getState().clockMinutes).toBe(clockBefore)
  })

  it('auto-advances once a deferred training-mode override is confirmed', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // t=0 -> 3
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // valid — auto-advances to 6
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, lastActionMinute: s.clockMinutes } : i)),
    }))
    const clockBefore = useSimStore.getState().clockMinutes
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // too soon — deferred
    expect(useSimStore.getState().pendingOverride).not.toBeNull()
    useSimStore.getState().confirmDoseOverride()
    expect(useSimStore.getState().clockMinutes).toBe(clockBefore + 3)
  })
})

describe('store — training/validation mode override flow', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate, auto-advances to t=3
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // valid titrate — auto-advances to t=6
    // Every successful dose change now auto-advances the clock by exactly the order's
    // interval, so two consecutive real actions always land exactly at the interval
    // boundary — never "too soon" on their own. Force 0 elapsed since the last change so
    // the tests below can exercise a genuine interval violation.
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, lastActionMinute: s.clockMinutes } : i)),
    }))
  })

  it('training mode defers an off-order titration, leaving the infusion untouched', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // interval too soon (0 min since t=6)
    const state = useSimStore.getState()
    expect(state.pendingOverride).not.toBeNull()
    expect(norepiInfusion().rate).toBe(1)
    expect(state.log.some((e) => e.dose === 1.5)).toBe(false) // deferred — not logged yet
  })

  it('confirmDoseOverride applies the dose and logs it as overridden, excluded from adherence', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // interval too soon
    useSimStore.getState().confirmDoseOverride()
    const state = useSimStore.getState()
    expect(norepiInfusion().rate).toBe(1.5)
    expect(state.pendingOverride).toBeNull()
    const entry = state.log.find((e) => e.dose === 1.5)!
    expect(entry.outcome).toBe('applied')
    expect(entry.overridden).toBe(true)
    expect(state.adherenceFlags[entry.id]).toBe(false)
    expect(state.feedback).toMatchObject({ tone: 'warning', title: 'Applied via override' })
  })

  it('cancelDoseOverride logs the attempt as off-order without applying it', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // interval too soon
    useSimStore.getState().cancelDoseOverride()
    const state = useSimStore.getState()
    expect(norepiInfusion().rate).toBe(1)
    const entry = state.log.find((e) => e.dose === 1.5)!
    expect(entry.outcome).toBe('off-order')
    expect(entry.overridden).toBeUndefined()
  })

  it('validation mode applies an off-order titration silently, scored as overridden', () => {
    useSimStore.setState({ mode: 'validation' })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // interval too soon
    const state = useSimStore.getState()
    expect(state.pendingOverride).toBeNull()
    expect(norepiInfusion().rate).toBe(1.5)
    const entry = state.log.find((e) => e.dose === 1.5)!
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

  it('marks earlyNotificationDue and opens the decision point the tick the threshold is crossed', () => {
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9) // 8.5 -> 9 crosses 30*0.3=9
    const state = useSimStore.getState()
    const entry = state.log.find((e) => e.dose === 9)!
    expect(entry.earlyNotificationDue).toBe(true)
    expect(state.pendingDecisionPoint).toEqual({ decisionPointId: autoEarlyNotificationDecisionPointId(NOREPI_ORDER_ID) })
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
    expect(state.pendingDecisionPoint).toEqual({ decisionPointId: autoEarlyNotificationDecisionPointId(NOREPI_ORDER_ID) })
  })
})

describe('store — pacing offer', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0
  })

  it('opens a pacing offer after 3 manual titrations, pointed at the nearest milestone (vasopressin activation at 10)', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // 1st
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // 2nd
    expect(useSimStore.getState().pendingPacingOffer).toBeNull()
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2) // 3rd
    const offer = useSimStore.getState().pendingPacingOffer
    expect(offer).toMatchObject({ orderId: NOREPI_ORDER_ID, currentDose: 2, nextDecisionDose: 10 })
    expect(offer?.nextDecisionLabel).toMatch(/activating Vasopressin/)
  })

  it('dismissPacingOffer clears it with no LogEntry', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2)
    const logLengthBefore = useSimStore.getState().log.length
    useSimStore.getState().dismissPacingOffer()
    const state = useSimStore.getState()
    expect(state.pendingPacingOffer).toBeNull()
    expect(state.log.length).toBe(logLengthBefore)
  })

  it('runMultiStepTitration works from a pacing offer, same as from a decision point', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2)
    useSimStore.getState().runMultiStepTitration(NOREPI_ORDER_ID, 3)
    const state = useSimStore.getState()
    expect(state.pendingPacingOffer).toBeNull()
    expect(norepiInfusion().rate).toBe(3)
    expect(state.log.some((e) => e.autoGeneratedByMultiStep)).toBe(true)
  })

  it('the counter resets after an offer fires, requiring 3 more manual titrations before the next one', () => {
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2) // offer #1 opens
    useSimStore.getState().dismissPacingOffer()
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2.5)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 3)
    expect(useSimStore.getState().pendingPacingOffer).toBeNull()
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 3.5) // 3rd since offer #1
    expect(useSimStore.getState().pendingPacingOffer).not.toBeNull()
  })

  it('a multi-step plan started BELOW the clinical threshold (via a pacing offer) stops exactly at the crossing dose and opens the decision point, rather than sailing past it', () => {
    useSimStore.setState((s) => ({
      orders: s.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, earlyNotificationThreshold: 0.1 } : o)), // crosses at 3
    }))
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // 1st
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // 2nd
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2) // 3rd -> pacing offer opens
    expect(useSimStore.getState().pendingPacingOffer).not.toBeNull()
    // Ask the plan to go all the way to 9 — it should stop at 3 (the clinical threshold),
    // not run through it silently.
    useSimStore.getState().runMultiStepTitration(NOREPI_ORDER_ID, 9)
    const state = useSimStore.getState()
    expect(state.pendingPacingOffer).toBeNull()
    expect(state.pendingDecisionPoint).toEqual({ decisionPointId: autoEarlyNotificationDecisionPointId(NOREPI_ORDER_ID) })
    expect(norepiInfusion().rate).toBe(3)
    const steps = state.log.filter((e) => e.autoGeneratedByMultiStep && e.doseAction === 'titrate')
    expect(steps.map((e) => e.dose)).toEqual([2.5, 3])
  })

  it('a clinical decision-point crossing takes precedence and resets the pacing counter instead of opening a pacing offer', () => {
    // Threshold dose = 30 * (2/30) = 2 — crosses exactly on the 3rd manual titration below.
    useSimStore.setState((s) => ({
      orders: s.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, earlyNotificationThreshold: 2 / 30 } : o)),
    }))
    useSimStore.getState().advanceClock(3)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1) // 1st
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 1.5) // 2nd
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 2) // 3rd — also crosses the clinical threshold
    const state = useSimStore.getState()
    expect(state.pendingDecisionPoint).not.toBeNull()
    expect(state.pendingPacingOffer).toBeNull()
  })
})

describe('store — decision point and multi-step titration', () => {
  beforeEach(() => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate at t=0
    useSimStore.setState((s) => ({
      orders: s.orders.map((o) => (o.id === NOREPI_ORDER_ID ? { ...o, earlyNotificationThreshold: 0.3 } : o)),
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 8.5, lastActionMinute: 0 } : i)),
      clockMinutes: 3,
    }))
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9) // crosses threshold, opens the decision point
  })

  it('dismissDecisionPoint clears it with no LogEntry, staying marked shown so it does not re-fire', () => {
    const logLengthBefore = useSimStore.getState().log.length
    useSimStore.getState().dismissDecisionPoint()
    const state = useSimStore.getState()
    expect(state.pendingDecisionPoint).toBeNull()
    expect(state.log.length).toBe(logLengthBefore)
    expect(state.decisionPointsShown[autoEarlyNotificationDecisionPointId(NOREPI_ORDER_ID)]).toBe(true)
  })

  it('runMultiStepTitration applies correctly-spaced dose + auto-chart entries and advances the clock', () => {
    const clockBefore = useSimStore.getState().clockMinutes
    useSimStore.getState().runMultiStepTitration(NOREPI_ORDER_ID, 10.5) // 9 -> 9.5, 10, 10.5 (increment 0.5)
    const state = useSimStore.getState()
    expect(state.pendingDecisionPoint).toBeNull()
    expect(norepiInfusion().rate).toBe(10.5)
    const doseEntries = state.log.filter((e) => e.autoGeneratedByMultiStep && e.doseAction === 'titrate')
    expect(doseEntries.map((e) => e.dose)).toEqual([9.5, 10, 10.5])
    const chartEntries = state.log.filter((e) => e.autoGeneratedByMultiStep && e.type === 'documentation')
    expect(chartEntries.length).toBe(3)
    expect(state.clockMinutes).toBe(clockBefore + 3 * 3) // 3 steps * order.interval.minMinutes (3)
  })

  it('runMultiStepTitration stops early once target MAP is met mid-plan', () => {
    useSimStore.setState({ vitals: { ...useSimStore.getState().vitals, map: 65 } }) // already at target (65)
    useSimStore.getState().runMultiStepTitration(NOREPI_ORDER_ID, 10.5)
    const doseEntries = useSimStore.getState().log.filter((e) => e.autoGeneratedByMultiStep && e.doseAction === 'titrate')
    expect(doseEntries.length).toBe(0)
    expect(norepiInfusion().rate).toBe(9)
  })

  it('pendingDecisionPoint locks the screen the same way pendingOverride does (participates in Simulation.tsx-style gating)', () => {
    const state = useSimStore.getState()
    expect(state.pendingDecisionPoint).not.toBeNull()
    // Simulation.tsx computes locked = pendingAction !== null || pendingOverride !== null || pendingDecisionPoint !== null || pendingPacingOffer !== null
    expect(state.pendingOverride === null && state.pendingDecisionPoint !== null).toBe(true)
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
      lastPhysiologyUpdate: { minute: 0, map: 57, hr: 118, spo2: 96 },
    }))
    useSimStore.getState().advanceClock(5) // scenario response lag is 2-5 min
    const state = useSimStore.getState()
    expect(state.clockMinutes).toBe(5)
    expect(state.vitals.map).toBe(63) // 57 baseline + 6 (norepi's tuned ceiling), norepi alone insufficient
  })

  it('leaves MAP unmoved before the response lag has begun', () => {
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57, hr: 118, spo2: 96 },
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
      lastPhysiologyUpdate: { minute: 0, map: 63, hr: 118, spo2: 96 },
    }))
    useSimStore.getState().advanceClock(5)
    expect(useSimStore.getState().vitals.map).toBeGreaterThanOrEqual(65)
  })

  it('advanceClock derives live SBP/DBP from the new MAP, holding pulse pressure constant', () => {
    const startingVitals = useSimStore.getState().scenario.startingVitals
    const startingPulsePressure = startingVitals.sbp - startingVitals.dbp
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57, hr: 118, spo2: 96 },
    }))
    useSimStore.getState().advanceClock(5) // MAP moves from 57 to 63 (norepi alone)
    const { sbp, dbp, map } = useSimStore.getState().vitals
    expect(map).toBe(63)
    expect(sbp).not.toBe(startingVitals.sbp)
    expect(dbp).not.toBe(startingVitals.dbp)
    expect(sbp - dbp).toBe(startingPulsePressure)
  })

  it('HR trends down and SpO2 trends up as norepinephrine fully responds (Phase 12)', () => {
    const startingHr = useSimStore.getState().scenario.startingVitals.hr
    const startingSpo2 = useSimStore.getState().scenario.startingVitals.spo2
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57, hr: startingHr, spo2: startingSpo2 },
    }))
    useSimStore.getState().advanceClock(5) // fully past the response lag (2-5 min)
    const { hr, spo2 } = useSimStore.getState().vitals
    // norepi's tuned maxHrContribution is -12, maxSpo2Contribution is +1 — HR eases
    // down from the tachycardic baseline, SpO2 nudges up, both by a plausible amount
    // (not exactly baseline-12/baseline+1, since periodicVariability jitter also
    // applies to HR — only SpO2 stays jitter-free and lands on the exact value).
    expect(hr).toBeLessThan(startingHr)
    expect(spo2).toBe(startingSpo2 + 1)
  })

  it('leaves HR/SpO2 at their starting values before the response lag has begun', () => {
    const startingHr = useSimStore.getState().scenario.startingVitals.hr
    const startingSpo2 = useSimStore.getState().scenario.startingVitals.spo2
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57, hr: startingHr, spo2: startingSpo2 },
    }))
    useSimStore.getState().advanceClock(1) // before minMinutes (2)
    expect(useSimStore.getState().vitals.spo2).toBe(startingSpo2)
  })

  it('a drug with no maxHrContribution/maxSpo2Contribution tuned leaves HR/SpO2 driven only by baseline+jitter', () => {
    const startingHr = useSimStore.getState().scenario.startingVitals.hr
    const startingSpo2 = useSimStore.getState().scenario.startingVitals.spo2
    useSimStore.setState((s) => ({
      // Strip norepi's HR/SpO2 tuning for this test only — confirms the omitted-field
      // default (0 contribution) actually applies, not just "happens to be untested."
      scenario: {
        ...s.scenario,
        responseModel: {
          ...s.scenario.responseModel,
          norepinephrine: { maxMapContribution: s.scenario.responseModel.norepinephrine!.maxMapContribution },
        },
      },
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 30 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 57, hr: startingHr, spo2: startingSpo2 },
    }))
    useSimStore.getState().advanceClock(5)
    // SpO2 is jitter-free, so with zero contribution it lands exactly on baseline.
    expect(useSimStore.getState().vitals.spo2).toBe(startingSpo2)
  })

  it('forceImprove/forceWorsen preserve the HR/SpO2 anchor, only touching MAP', () => {
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing', rate: 15 } : i)),
      lastPhysiologyUpdate: { minute: 0, map: 60, hr: 110, spo2: 97 },
      deteriorationOffset: 4,
    }))
    useSimStore.getState().forceImprove(2)
    const anchor = useSimStore.getState().lastPhysiologyUpdate
    expect(anchor?.hr).toBe(110)
    expect(anchor?.spo2).toBe(97)
    expect(anchor?.map).toBe(useSimStore.getState().vitals.map)
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
    expect(infusion.stoppedAtMinute).toBe(3) // initiate auto-advanced the clock to 3 before this
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
      startMinute: 3, // initiate auto-advanced the clock to 3 before this
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
    // startMinute 3 (initiate's auto-advance) + 20 min declared-block duration = endMinute 23.
    expect(state.blockOfChartingHistory[0]).toMatchObject({ orderId: NOREPI_ORDER_ID, startMinute: 3, endMinute: 23 })
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
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate, auto-advances to t=3
    useSimStore.getState().advanceClock(7) // t=10, new vitalsHistory entry
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

function seedTwoAgentWeanOrder(vasopressinRate: number) {
  useSimStore.setState((s) => ({
    orders: s.orders.map((o) =>
      o.id === NOREPI_ORDER_ID ? { ...o, weanOrder: 2 } : o.id === VASOPRESSIN_ORDER_ID ? { ...o, weanOrder: 1 } : o,
    ),
    infusions: [
      { ...norepiInfusion(), status: 'infusing' as const, rate: 10, lastActionMinute: 0 },
      {
        id: 'infusion-vasopressin',
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

describe('store — priorAgentsWeaned', () => {
  it('is true when the order has no weanOrder requirement', () => {
    const state = useSimStore.getState()
    const order = state.orders.find((o) => o.id === NOREPI_ORDER_ID)!
    expect(priorAgentsWeaned(state.infusions, state.orders, order)).toBe(true)
  })

  it('is false while a lower-weanOrder agent is still above its own startDose', () => {
    seedTwoAgentWeanOrder(0.03) // vasopressin startDose is 0.02 — 0.03 is still above it
    const state = useSimStore.getState()
    const norepiOrder = state.orders.find((o) => o.id === NOREPI_ORDER_ID)!
    expect(priorAgentsWeaned(state.infusions, state.orders, norepiOrder)).toBe(false)
  })

  it('is true once the lower-weanOrder agent is back at or below its own startDose', () => {
    seedTwoAgentWeanOrder(0.02)
    const state = useSimStore.getState()
    const norepiOrder = state.orders.find((o) => o.id === NOREPI_ORDER_ID)!
    expect(priorAgentsWeaned(state.infusions, state.orders, norepiOrder)).toBe(true)
  })

  it('is true when the lower-weanOrder agent has been discontinued (its infusion absent)', () => {
    seedTwoAgentWeanOrder(0.03)
    useSimStore.setState((s) => ({ infusions: s.infusions.filter((i) => i.drugId !== 'vasopressin') }))
    const state = useSimStore.getState()
    const norepiOrder = state.orders.find((o) => o.id === NOREPI_ORDER_ID)!
    expect(priorAgentsWeaned(state.infusions, state.orders, norepiOrder)).toBe(true)
  })
})

describe('store — wean-order gating on titrate', () => {
  it('rejects (deferred, training-mode override) a down-titration before the lower-weanOrder agent is cleared', () => {
    seedTwoAgentWeanOrder(0.03)
    useSimStore.setState({ clockMinutes: 30 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9.5) // down from 10, delta 0.5 matches increment
    expect(useSimStore.getState().pendingOverride?.violations.wrongWeanOrder).toBe(true)
    expect(norepiInfusion().rate).toBe(10)
  })

  it('applies once the lower-weanOrder agent is cleared', () => {
    seedTwoAgentWeanOrder(0.02)
    useSimStore.setState({ clockMinutes: 30 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 9.5)
    expect(useSimStore.getState().pendingOverride).toBeNull()
    expect(norepiInfusion().rate).toBe(9.5)
  })

  it('does not gate an up-titration, even before the lower-weanOrder agent is cleared', () => {
    seedTwoAgentWeanOrder(0.03)
    useSimStore.setState({ clockMinutes: 30 })
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 10.5) // up from 10
    expect(useSimStore.getState().pendingOverride).toBeNull()
    expect(norepiInfusion().rate).toBe(10.5)
  })
})

describe('store — discontinueInfusion retroactive wean-order flagging', () => {
  it('stamps wrongWeanOrder on the discontinue log entry when a lower-weanOrder agent is still active', () => {
    seedTwoAgentWeanOrder(0.03)
    useSimStore.getState().discontinueInfusion(norepiInfusion().id)
    const entry = useSimStore.getState().log.find((e) => e.lifecycleAction === 'discontinue')!
    expect(entry.violations?.wrongWeanOrder).toBe(true)
    // Stays ungated — the infusion is removed despite the violation.
    expect(useSimStore.getState().infusions.some((i) => i.drugId === 'norepinephrine')).toBe(false)
  })

  it('does not flag discontinuation once the lower-weanOrder agent is already cleared', () => {
    seedTwoAgentWeanOrder(0.02)
    useSimStore.getState().discontinueInfusion(norepiInfusion().id)
    const entry = useSimStore.getState().log.find((e) => e.lifecycleAction === 'discontinue')!
    expect(entry.violations).toBeUndefined()
  })
})

describe('store — startScenario supports multiple initialInfusions', () => {
  it('seeds one Infusion per entry in scenario.initialInfusions', () => {
    const multiInfusionScenario = {
      ...DEFAULT_SCENARIO,
      initialInfusions: [
        DEFAULT_SCENARIO.initialInfusions[0],
        {
          id: 'infusion-vasopressin-seed',
          orderId: VASOPRESSIN_ORDER_ID,
          drugId: 'vasopressin' as const,
          status: 'infusing' as const,
          rate: 0.03,
          initialRate: 0.02,
          channel: 'B',
          beginBagCompleted: true,
          lastActionMinute: 0,
          stoppedAtMinute: null,
          rateBeforePause: null,
        },
      ],
    }
    useSimStore.getState().startScenario(multiInfusionScenario, 'training')
    const state = useSimStore.getState()
    expect(state.infusions).toHaveLength(2)
    expect(state.infusions.some((i) => i.drugId === 'norepinephrine')).toBe(true)
    expect(state.infusions.some((i) => i.drugId === 'vasopressin' && i.rate === 0.03)).toBe(true)
  })
})

describe('store — proctor record', () => {
  it('is null until setProctor is called', () => {
    expect(useSimStore.getState().proctor).toBeNull()
  })

  it('setProctor stamps a name, a separate email, and an ISO timestamp', () => {
    useSimStore.getState().setProctor('J. Rivera', 'j.rivera@med.usc.edu')
    const { proctor } = useSimStore.getState()
    expect(proctor?.name).toBe('J. Rivera')
    expect(proctor?.email).toBe('j.rivera@med.usc.edu')
    expect(proctor?.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    useSimStore.setState({ proctor: null })
  })

  it('survives a scenario restart (unlike the rest of sim state)', () => {
    useSimStore.getState().setProctor('J. Rivera', 'j.rivera@med.usc.edu')
    useSimStore.getState().startScenario(DEFAULT_SCENARIO, 'training')
    expect(useSimStore.getState().proctor?.name).toBe('J. Rivera')
    expect(useSimStore.getState().proctor?.email).toBe('j.rivera@med.usc.edu')
    useSimStore.setState({ proctor: null })
  })
})

describe('store — facilitator vital overrides', () => {
  afterEach(() => {
    useSimStore.setState({ vitalOverrides: {} })
  })

  it('commitVitalOverride sets the vital immediately and logs it', () => {
    useSimStore.getState().commitVitalOverride('hr', 140)
    const state = useSimStore.getState()
    expect(state.vitals.hr).toBe(140)
    expect(state.vitalOverrides.hr).toBe(140)
    expect(state.log.some((e) => /Facilitator set HR to 140/.test(e.summary))).toBe(true)
  })

  it('an override wins over the scenario baseline+jitter computation on the next advanceClock tick', () => {
    useSimStore.getState().commitVitalOverride('hr', 140)
    useSimStore.getState().advanceClock(3)
    expect(useSimStore.getState().vitals.hr).toBe(140)
  })

  it('SBP/DBP overrides both win over deriveBloodPressure on the next tick', () => {
    useSimStore.getState().commitVitalOverride('sbp', 200)
    useSimStore.getState().commitVitalOverride('dbp', 120)
    useSimStore.getState().advanceClock(3)
    const { vitals } = useSimStore.getState()
    expect(vitals.sbp).toBe(200)
    expect(vitals.dbp).toBe(120)
  })

  it('never overrides MAP — an HR override in isolation leaves MAP identical to the no-override case', () => {
    // Freeze deterioration (an infusing infusion) so MAP has no OTHER reason to move,
    // isolating whether the HR override itself leaks into the MAP computation.
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing' as const } : i)),
    }))
    useSimStore.getState().advanceClock(3)
    const mapWithoutOverride = useSimStore.getState().vitals.map

    useSimStore.getState().startScenario(DEFAULT_SCENARIO, 'training')
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, status: 'infusing' as const } : i)),
    }))
    useSimStore.getState().commitVitalOverride('hr', 140)
    useSimStore.getState().advanceClock(3)
    expect(useSimStore.getState().vitals.map).toBe(mapWithoutOverride)
  })

  it('clearVitalOverride lets the scenario computation resume on the next tick', () => {
    useSimStore.getState().commitVitalOverride('hr', 140)
    useSimStore.getState().clearVitalOverride('hr')
    useSimStore.getState().advanceClock(3)
    expect(useSimStore.getState().vitals.hr).not.toBe(140)
  })

  it('an active override applies to the NEXT scenario picked (opening vitals)', () => {
    useSimStore.getState().commitVitalOverride('spo2', 88)
    useSimStore.getState().startScenario(DEFAULT_SCENARIO, 'training')
    expect(useSimStore.getState().vitals.spo2).toBe(88)
  })
})

describe('store — facilitator response-model overrides', () => {
  afterEach(() => {
    useSimStore.setState({ responseModelOverrides: {} })
  })

  it('setResponseModelOverride changes the MAP contribution used by advanceClock', () => {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5)
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 30, lastActionMinute: 0 } : i)),
    }))
    useSimStore.getState().setResponseModelOverride('norepinephrine', 20) // scenario default is 6
    useSimStore.getState().advanceClock(30)
    // baseline 57 + up to 20 (norepi at its own max, fraction 1) → well above the
    // scenario's own tuned ceiling of 57+6=63.
    expect(useSimStore.getState().vitals.map).toBeGreaterThan(63)
  })

  it('clearResponseModelOverride reverts to the scenario default', () => {
    useSimStore.getState().setResponseModelOverride('norepinephrine', 20)
    useSimStore.getState().clearResponseModelOverride('norepinephrine')
    expect(useSimStore.getState().responseModelOverrides.norepinephrine).toBeUndefined()
  })
})

describe('store — facilitator deterioration force-buttons', () => {
  it('forceImprove reduces the deterioration offset and immediately raises MAP by the same amount', () => {
    useSimStore.setState({ deteriorationOffset: 10, vitals: { ...useSimStore.getState().vitals, map: 50 } })
    useSimStore.getState().forceImprove(4)
    const state = useSimStore.getState()
    expect(state.deteriorationOffset).toBe(6)
    expect(state.vitals.map).toBe(54)
  })

  it('forceImprove never reduces the offset below zero', () => {
    useSimStore.setState({ deteriorationOffset: 2 })
    useSimStore.getState().forceImprove(10)
    expect(useSimStore.getState().deteriorationOffset).toBe(0)
  })

  it('forceWorsen increases the deterioration offset and immediately lowers MAP by the same amount', () => {
    useSimStore.setState({ deteriorationOffset: 0, vitals: { ...useSimStore.getState().vitals, map: 60 } })
    useSimStore.getState().forceWorsen(4)
    const state = useSimStore.getState()
    expect(state.deteriorationOffset).toBe(4)
    expect(state.vitals.map).toBe(56)
  })

  it('forceWorsen never exceeds the scenario maxDrop', () => {
    const maxDrop = useSimStore.getState().scenario.deterioration.maxDrop
    useSimStore.setState({ deteriorationOffset: maxDrop - 2 })
    useSimStore.getState().forceWorsen(10)
    expect(useSimStore.getState().deteriorationOffset).toBe(maxDrop)
  })
})

describe('store — facilitator order editing', () => {
  it('updateOrder edits maxDose/increment/interval/target and logs it', () => {
    useSimStore.getState().updateOrder(NOREPI_ORDER_ID, { maxDose: 40, increment: 1, intervalMinMinutes: 5, targetValue: 70 })
    const order = useSimStore.getState().orders.find((o) => o.id === NOREPI_ORDER_ID)!
    expect(order.maxDose).toBe(40)
    expect(order.increment).toBe(1)
    expect(order.interval.minMinutes).toBe(5)
    expect(order.target.value).toBe(70)
    expect(useSimStore.getState().log.some((e) => /Facilitator edited the Norepinephrine order/.test(e.summary))).toBe(
      true,
    )
  })

  it('leaves fields not included in the patch untouched', () => {
    const before = useSimStore.getState().orders.find((o) => o.id === NOREPI_ORDER_ID)!
    useSimStore.getState().updateOrder(NOREPI_ORDER_ID, { maxDose: 40 })
    const after = useSimStore.getState().orders.find((o) => o.id === NOREPI_ORDER_ID)!
    expect(after.increment).toBe(before.increment)
    expect(after.interval).toEqual(before.interval)
    expect(after.target).toEqual(before.target)
  })

  it('does nothing for an unknown orderId', () => {
    const before = useSimStore.getState().orders
    useSimStore.getState().updateOrder('not-a-real-order', { maxDose: 999 })
    expect(useSimStore.getState().orders).toEqual(before)
  })
})

describe('store — Phase 18 decision points (neutropenicSepticShock)', () => {
  /** Norepi active enough to activate vasopressin (>=10, 1/3 of 30), target still unmet — mirrors real early-scenario play. */
  function seedBothAgentsInfusing() {
    useSimStore.getState().completeBeginBag(norepiInfusion().id)
    useSimStore.getState().submitDose(NOREPI_ORDER_ID, 0.5) // initiate
    useSimStore.setState((s) => ({
      infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 10, lastActionMinute: 0 } : i)),
      vitals: { ...s.vitals, map: 60 },
    }))
    useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.02) // initiate (activation threshold met)
  }

  describe('documentation-placement decision point (fires on vasopressin\'s first titrate)', () => {
    beforeEach(() => {
      seedBothAgentsInfusing()
      useSimStore.setState((s) => ({
        infusions: s.infusions.map((i) => (i.drugId === 'vasopressin' ? { ...i, lastActionMinute: 0 } : i)),
        clockMinutes: 30,
      }))
      useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.03) // titrate -> triggers the decision point
    })

    it('opens the decision point scoped to vasopressin', () => {
      expect(useSimStore.getState().pendingDecisionPoint).toEqual({
        decisionPointId: 'neutropenic-septic-shock-documentation',
      })
    })

    it('does not fire on a norepinephrine titrate (scoped by orderId, not global)', () => {
      useSimStore.getState().dismissDecisionPoint()
      useSimStore.setState((s) => ({ infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, lastActionMinute: 0 } : i)), clockMinutes: 33 }))
      useSimStore.getState().submitDose(NOREPI_ORDER_ID, 10.5)
      expect(useSimStore.getState().pendingDecisionPoint).toBeNull()
    })

    it('picking "chart in iView" applies a real chartVitals entry, tone good, live training feedback', () => {
      useSimStore.getState().chooseDecisionOption('chart-iview')
      const state = useSimStore.getState()
      expect(state.pendingDecisionPoint).toBeNull()
      const marker = state.log.find((e) => e.decisionPointId === 'neutropenic-septic-shock-documentation')!
      expect(marker.decisionOptionId).toBe('chart-iview')
      expect(marker.decisionTone).toBe('good')
      expect(state.log.some((e) => e.type === 'documentation' && e.location === 'iView')).toBe(true)
      expect(state.feedback?.tone).toBe('success')
    })

    it('picking "chart in MAR" logs a critical-tone marker with no real documentation side effect', () => {
      const iViewCountBefore = useSimStore.getState().log.filter((e) => e.location === 'iView').length
      useSimStore.getState().chooseDecisionOption('chart-mar')
      const state = useSimStore.getState()
      const marker = state.log.find((e) => e.decisionOptionId === 'chart-mar')!
      expect(marker.decisionTone).toBe('critical')
      expect(state.log.filter((e) => e.location === 'iView').length).toBe(iViewCountBefore)
    })

    it('picking the fluid-bolus distractor logs a critical-tone marker with no infusion side effect', () => {
      const infusionsBefore = useSimStore.getState().infusions
      useSimStore.getState().chooseDecisionOption('fluid-bolus')
      const state = useSimStore.getState()
      const marker = state.log.find((e) => e.decisionOptionId === 'fluid-bolus')!
      expect(marker.decisionTone).toBe('critical')
      expect(state.infusions).toEqual(infusionsBefore)
    })

    it('validation mode withholds the policy hint live and shows only "Choice recorded"', () => {
      useSimStore.setState({ mode: 'validation' })
      useSimStore.getState().chooseDecisionOption('chart-iview')
      expect(useSimStore.getState().feedback).toMatchObject({ tone: 'info', title: 'Choice recorded' })
    })

    it('dismissDecisionPoint leaves it marked shown so it never re-fires', () => {
      useSimStore.getState().dismissDecisionPoint()
      useSimStore.setState((s) => ({ infusions: s.infusions.map((i) => (i.drugId === 'vasopressin' ? { ...i, lastActionMinute: 33 } : i)), clockMinutes: 63 }))
      useSimStore.getState().submitDose(VASOPRESSIN_ORDER_ID, 0.04)
      expect(useSimStore.getState().pendingDecisionPoint).toBeNull()
    })
  })

  describe('weaning decision point (both agents infusing, target met — fires from advanceClock)', () => {
    beforeEach(() => {
      seedBothAgentsInfusing()
      // Directly seed "both infusing, target met" and skip physiology interpolation
      // (lastPhysiologyUpdate: null) so advanceClock's tick doesn't reproject MAP away
      // from the value this test cares about — deterioration/jitter don't touch `map`
      // while an infusion is active, so it stays exactly 65 through the tick.
      useSimStore.setState((s) => ({
        infusions: s.infusions.map((i) => (i.drugId === 'norepinephrine' ? { ...i, rate: 20 } : { ...i, rate: 0.03 })),
        vitals: { ...s.vitals, map: 65 },
        lastPhysiologyUpdate: null,
      }))
      useSimStore.getState().advanceClock(1)
    })

    it('opens the weaning decision point once both agents infuse with target met', () => {
      expect(useSimStore.getState().pendingDecisionPoint).toEqual({
        decisionPointId: 'neutropenic-septic-shock-weaning',
      })
    })

    it('weaning vasopressin first applies cleanly (good tone) — it has the lower weanOrder', () => {
      useSimStore.getState().chooseDecisionOption('wean-vasopressin')
      const state = useSimStore.getState()
      const marker = state.log.find((e) => e.decisionOptionId === 'wean-vasopressin')!
      expect(marker.decisionTone).toBe('good')
      const vaso = state.infusions.find((i) => i.drugId === 'vasopressin')!
      expect(vaso.rate).toBeCloseTo(0.02, 5)
    })

    it('weaning norepinephrine first is blocked by wean sequence, applied via decision-panel override, critical tone', () => {
      useSimStore.getState().chooseDecisionOption('wean-norepinephrine')
      const state = useSimStore.getState()
      const marker = state.log.find((e) => e.decisionOptionId === 'wean-norepinephrine')!
      expect(marker.decisionTone).toBe('critical')
      // fromDecisionPanel skips the training-mode pendingOverride detour — applies immediately.
      expect(state.pendingOverride).toBeNull()
      const doseEntry = state.log.find((e) => e.orderId === NOREPI_ORDER_ID && e.doseAction === 'titrate' && e.dose === 19.5)
      expect(doseEntry?.overridden).toBe(true)
      expect(doseEntry?.violations?.wrongWeanOrder).toBe(true)
    })

    it('pushing norepinephrine past its ordered max is blocked by Guardrails, critical tone, infusion unchanged', () => {
      useSimStore.getState().chooseDecisionOption('push-norepinephrine')
      const state = useSimStore.getState()
      const marker = state.log.find((e) => e.decisionOptionId === 'push-norepinephrine')!
      expect(marker.decisionTone).toBe('critical')
      const norepi = state.infusions.find((i) => i.drugId === 'norepinephrine')!
      expect(norepi.rate).toBe(20)
    })

    it('participates in scoring category 9 once resolved', () => {
      useSimStore.getState().chooseDecisionOption('wean-vasopressin')
      const s = useSimStore.getState()
      const card = scoreSession({
        orders: s.orders,
        infusions: s.infusions,
        log: s.log,
        verificationFlags: s.verificationFlags,
        adherenceFlags: s.adherenceFlags,
        blockOfChartingHistory: s.blockOfChartingHistory,
      })
      const judgment = card.categories.find((c) => c.key === 'clinicalJudgment')!
      expect(judgment.status).toBe('met')
    })
  })
})
