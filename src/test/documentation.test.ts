import { describe, expect, it } from 'vitest'
import { buildCadenceStatusForOrders, buildOutstandingChartingItems, checkCadence, correctLocationFor, isCorrectlyPlaced } from '../engine/documentation'
import type { Infusion, LogEntry, Order } from '../state/types'

describe('documentation.correctLocationFor', () => {
  it('places Begin Bag, initial rate, and discontinuation in MAR', () => {
    expect(correctLocationFor('beginBag')).toBe('MAR')
    expect(correctLocationFor('initialRate')).toBe('MAR')
    expect(correctLocationFor('discontinuation')).toBe('MAR')
  })

  it('places titrations in iView', () => {
    expect(correctLocationFor('titration')).toBe('iView')
  })
})

describe('documentation.isCorrectlyPlaced', () => {
  it('is true when the location matches CP 4-156 placement', () => {
    expect(isCorrectlyPlaced('beginBag', 'MAR')).toBe(true)
    expect(isCorrectlyPlaced('titration', 'iView')).toBe(true)
  })

  it('is false when the location does not match', () => {
    expect(isCorrectlyPlaced('beginBag', 'iView')).toBe(false)
    expect(isCorrectlyPlaced('titration', 'MAR')).toBe(false)
  })
})

describe('documentation.checkCadence', () => {
  it('all 4 checkpoints met for a single titration, charted right on time', () => {
    // Initiate at 0, chart at 0 (initiation); chart at 30 (+30 start); titrate at 40,
    // charted at 35 (pre-titration, since 35 is after minute 0 and at/before 40); chart
    // at 70 (+30 post-titration, >= 40+30).
    const checks = checkCadence(0, [40], [0, 30, 35, 70])
    expect(checks.every((c) => c.met)).toBe(true)
    expect(checks.map((c) => c.point)).toEqual(['initiation', 'plus30Start', 'preTitration', 'plus30PostTitration'])
  })

  it('flags a missed initiation checkpoint (no charting at minute 0)', () => {
    const checks = checkCadence(0, [], [5])
    const initiation = checks.find((c) => c.point === 'initiation')!
    expect(initiation.met).toBe(false)
  })

  it('flags a missed +30-start checkpoint when nothing is charted after +30', () => {
    const checks = checkCadence(0, [], [0, 20])
    const plus30 = checks.find((c) => c.point === 'plus30Start')!
    expect(plus30.met).toBe(false)
  })

  it('flags a missed pre-titration checkpoint when nothing was charted since the last event', () => {
    // Charted at 0 (satisfies initiation) then titrated at 40 with no charting in between.
    const checks = checkCadence(0, [40], [0])
    const preTitration = checks.find((c) => c.point === 'preTitration')!
    expect(preTitration.met).toBe(false)
  })

  it('does not credit a stale chart entry from before the previous titration for a later pre-titration check', () => {
    // Two titrations at 10 and 40; charted once at 5 (before titration 1) but nothing
    // charted between titration 1 (10) and titration 2 (40).
    const checks = checkCadence(0, [10, 40], [5])
    const pre1 = checks.find((c) => c.point === 'preTitration' && c.titrationIndex === 1)!
    const pre2 = checks.find((c) => c.point === 'preTitration' && c.titrationIndex === 2)!
    expect(pre1.met).toBe(true)
    expect(pre2.met).toBe(false)
  })

  it('produces a preTitration/plus30PostTitration pair per titration, in order', () => {
    const checks = checkCadence(0, [10, 40], [0, 10, 40, 70])
    expect(checks.map((c) => `${c.point}${c.titrationIndex ?? ''}`)).toEqual([
      'initiation',
      'plus30Start',
      'preTitration1',
      'plus30PostTitration1',
      'preTitration2',
      'plus30PostTitration2',
    ])
  })

  it('marks the initiation checkpoint preSeeded when the 4th arg is true', () => {
    const checks = checkCadence(0, [], [0], true)
    const initiation = checks.find((c) => c.point === 'initiation')!
    expect(initiation.preSeeded).toBe(true)
  })

  it('leaves the initiation checkpoint without a preSeeded field when the 4th arg is omitted or false', () => {
    const omitted = checkCadence(0, [], [0])
    const explicitFalse = checkCadence(0, [], [0], false)
    expect(omitted.find((c) => c.point === 'initiation')!.preSeeded).toBeUndefined()
    expect(explicitFalse.find((c) => c.point === 'initiation')!.preSeeded).toBeUndefined()
  })
})

const norepiOrder: Order = {
  id: 'order-norepi',
  drugId: 'norepinephrine',
  sequence: 1,
  startDose: 0.5,
  maxDose: 30,
  increment: 0.5,
  interval: { minMinutes: 3, maxMinutes: 5 },
  target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
}

function doseEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'entry',
    minute: 0,
    type: 'action',
    summary: '',
    orderId: norepiOrder.id,
    doseAction: 'initiate',
    outcome: 'applied',
    ...overrides,
  }
}

function chartEntry(id: string, minute: number): LogEntry {
  return { id, minute, type: 'documentation', location: 'iView', summary: '' }
}

function norepiInfusion(overrides: Partial<Infusion> = {}): Infusion {
  return {
    id: 'infusion-norepi',
    orderId: norepiOrder.id,
    drugId: 'norepinephrine',
    status: 'infusing',
    rate: 0.5,
    initialRate: 0.5,
    channel: 'A',
    beginBagCompleted: true,
    lastActionMinute: 0,
    stoppedAtMinute: null,
    rateBeforePause: null,
    ...overrides,
  }
}

// buildCadenceStatusForOrders/buildOutstandingChartingItems (Phase 12d) are the shared
// source both scoring.ts's debrief category and the live CernerChartingStatus view build
// on — see engine/documentation.ts's doc comment.
describe('documentation.buildCadenceStatusForOrders', () => {
  it("returns one status per order with a real initiation entry, anchored to that entry's minute", () => {
    const doseEntries = [doseEntry({ id: 'e1', minute: 0, doseAction: 'initiate' })]
    const statuses = buildCadenceStatusForOrders([norepiOrder], [norepiInfusion()], doseEntries, [0])
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toMatchObject({ orderId: norepiOrder.id, drugId: 'norepinephrine' })
    expect(statuses[0].checks.find((c) => c.point === 'initiation')?.met).toBe(true)
  })

  it('anchors to minute 0 for a pre-seeded infusion with no real initiation entry', () => {
    const statuses = buildCadenceStatusForOrders([norepiOrder], [norepiInfusion()], [], [0])
    expect(statuses).toHaveLength(1)
    expect(statuses[0].checks.find((c) => c.point === 'initiation')?.dueAtMinute).toBe(0)
  })

  it('returns nothing for an order whose infusion never started (still hanging, no entries)', () => {
    const statuses = buildCadenceStatusForOrders([norepiOrder], [norepiInfusion({ status: 'hanging' })], [], [])
    expect(statuses).toEqual([])
  })

  it('includes a preTitration/plus30PostTitration pair for each titrate entry', () => {
    const doseEntries = [
      doseEntry({ id: 'e1', minute: 0, doseAction: 'initiate' }),
      doseEntry({ id: 'e2', minute: 10, doseAction: 'titrate' }),
    ]
    const statuses = buildCadenceStatusForOrders([norepiOrder], [norepiInfusion()], doseEntries, [0])
    expect(statuses[0].checks.map((c) => c.point)).toEqual([
      'initiation',
      'plus30Start',
      'preTitration',
      'plus30PostTitration',
    ])
  })
})

describe('documentation.buildOutstandingChartingItems', () => {
  it('is empty when everything due so far is charted and verified', () => {
    const doseEntries = [doseEntry({ id: 'e1', minute: 0, doseAction: 'initiate' })]
    const log = [...doseEntries, chartEntry('c1', 0), chartEntry('c2', 30)]
    const items = buildOutstandingChartingItems([norepiOrder], [norepiInfusion()], log, { e1: true })
    expect(items).toEqual([])
  })

  it('names each unmet checkpoint by drug name', () => {
    const doseEntries = [doseEntry({ id: 'e1', minute: 0, doseAction: 'initiate' })]
    const items = buildOutstandingChartingItems([norepiOrder], [norepiInfusion()], doseEntries, { e1: true })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.startsWith('Norepinephrine:'))).toBe(true)
  })

  it('flags an initiate entry that lacks verification', () => {
    const doseEntries = [doseEntry({ id: 'e1', minute: 0, doseAction: 'initiate' })]
    const items = buildOutstandingChartingItems([norepiOrder], [norepiInfusion()], doseEntries, {})
    expect(items.some((item) => /not yet verified/.test(item))).toBe(true)
  })

  it('is empty for an order whose infusion never started', () => {
    const items = buildOutstandingChartingItems([norepiOrder], [norepiInfusion({ status: 'hanging' })], [], {})
    expect(items).toEqual([])
  })

  it('labels the initiation checkpoint as shift assessment charting for a pre-seeded (weaningSupport-style) order, vs. initiation charting for a learner-initiated one', () => {
    // Pre-seeded: infusion already infusing, no real 'initiate' entry in the log at all.
    const preSeededItems = buildOutstandingChartingItems([norepiOrder], [norepiInfusion()], [], {})
    expect(preSeededItems.some((item) => /shift assessment charting/.test(item))).toBe(true)
    expect(preSeededItems.some((item) => /initiation charting/.test(item))).toBe(false)

    // Genuinely initiated: a real 'initiate' entry anchors the checkpoint instead.
    const doseEntries = [doseEntry({ id: 'e1', minute: 0, doseAction: 'initiate' })]
    const initiatedItems = buildOutstandingChartingItems([norepiOrder], [norepiInfusion()], doseEntries, { e1: true })
    expect(initiatedItems.some((item) => /initiation charting/.test(item))).toBe(true)
    expect(initiatedItems.some((item) => /shift assessment charting/.test(item))).toBe(false)
  })
})
