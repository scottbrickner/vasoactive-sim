import { describe, expect, it } from 'vitest'
import { rateAtMinute } from '../engine/infusionRateHistory'
import type { Infusion, LogEntry } from '../state/types'

let idCounter = 0
function doseEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  idCounter += 1
  return {
    id: `log-${idCounter}`,
    minute: 0,
    type: 'action',
    summary: 'dose entry',
    orderId: 'order-1',
    doseAction: 'titrate',
    outcome: 'applied',
    dose: 1,
    ...overrides,
  }
}

function discontinueEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  idCounter += 1
  return {
    id: `log-${idCounter}`,
    minute: 0,
    type: 'action',
    summary: 'discontinued',
    orderId: 'order-1',
    lifecycleAction: 'discontinue',
    ...overrides,
  }
}

function infusion(overrides: Partial<Infusion> = {}): Infusion {
  return {
    id: 'infusion-1',
    orderId: 'order-1',
    drugId: 'norepinephrine',
    status: 'infusing',
    rate: 5,
    initialRate: 5,
    channel: 'A',
    beginBagCompleted: true,
    lastActionMinute: null,
    stoppedAtMinute: null,
    rateBeforePause: null,
    ...overrides,
  }
}

describe('infusionRateHistory.rateAtMinute', () => {
  it('is null/not-discontinued before any dose action and no pre-seeded infusion', () => {
    const log: LogEntry[] = [doseEntry({ minute: 10, dose: 5, doseAction: 'initiate' })]
    expect(rateAtMinute('order-1', log, [], 5)).toEqual({ rate: null, isRateChangeAtMinute: false, discontinued: false })
  })

  it('flags the exact minute of an initiate as a rate-change', () => {
    const log: LogEntry[] = [doseEntry({ minute: 10, dose: 0.5, doseAction: 'initiate' })]
    expect(rateAtMinute('order-1', log, [], 10)).toEqual({ rate: 0.5, isRateChangeAtMinute: true, discontinued: false })
  })

  it('flags the exact minute of a titrate as a rate-change', () => {
    const log: LogEntry[] = [
      doseEntry({ minute: 10, dose: 0.5, doseAction: 'initiate' }),
      doseEntry({ minute: 13, dose: 1.0, doseAction: 'titrate' }),
    ]
    expect(rateAtMinute('order-1', log, [], 13)).toEqual({ rate: 1.0, isRateChangeAtMinute: true, discontinued: false })
  })

  it('holds a steady rate (no rate-change flag) between two dose events', () => {
    const log: LogEntry[] = [
      doseEntry({ minute: 10, dose: 0.5, doseAction: 'initiate' }),
      doseEntry({ minute: 13, dose: 1.0, doseAction: 'titrate' }),
    ]
    expect(rateAtMinute('order-1', log, [], 11)).toEqual({ rate: 0.5, isRateChangeAtMinute: false, discontinued: false })
    expect(rateAtMinute('order-1', log, [], 12)).toEqual({ rate: 0.5, isRateChangeAtMinute: false, discontinued: false })
  })

  it('renders D/C (null rate, discontinued: true) at/after the discontinue minute', () => {
    const log: LogEntry[] = [
      doseEntry({ minute: 10, dose: 0.5, doseAction: 'initiate' }),
      discontinueEntry({ minute: 20 }),
    ]
    expect(rateAtMinute('order-1', log, [], 20)).toEqual({ rate: null, isRateChangeAtMinute: false, discontinued: true })
    expect(rateAtMinute('order-1', log, [], 30)).toEqual({ rate: null, isRateChangeAtMinute: false, discontinued: true })
    // still shows the real rate for columns before the discontinuation
    expect(rateAtMinute('order-1', log, [], 15)).toEqual({ rate: 0.5, isRateChangeAtMinute: false, discontinued: false })
  })

  it('ignores dose entries for other orders and outcomes other than applied', () => {
    const log: LogEntry[] = [
      doseEntry({ minute: 10, dose: 5, doseAction: 'initiate', orderId: 'order-2' }),
      doseEntry({ minute: 11, dose: 5, doseAction: 'titrate', outcome: 'off-order' }),
    ]
    expect(rateAtMinute('order-1', log, [], 12)).toEqual({ rate: null, isRateChangeAtMinute: false, discontinued: false })
  })

  it('is unaffected by pause/restart lifecycle entries (no dose field, no discontinue)', () => {
    const log: LogEntry[] = [
      doseEntry({ minute: 10, dose: 0.5, doseAction: 'initiate' }),
      { id: 'pause-1', minute: 15, type: 'action', summary: 'paused', orderId: 'order-1', lifecycleAction: 'pause' },
      { id: 'restart-1', minute: 18, type: 'action', summary: 'restarted', orderId: 'order-1', lifecycleAction: 'restart' },
    ]
    expect(rateAtMinute('order-1', log, [], 18)).toEqual({ rate: 0.5, isRateChangeAtMinute: false, discontinued: false })
  })

  it('falls back to the pre-seeded infusion rate when no real dose entry exists yet (e.g. weaningSupport)', () => {
    const seeded = infusion({ status: 'infusing', rate: 12 })
    expect(rateAtMinute('order-1', [], [seeded], 0)).toEqual({ rate: 12, isRateChangeAtMinute: false, discontinued: false })
    // no rate-change highlight for the scenario's own starting state, unlike a real logged event
    expect(rateAtMinute('order-1', [], [seeded], 30)).toEqual({ rate: 12, isRateChangeAtMinute: false, discontinued: false })
  })

  it('does not use the pre-seeded fallback once a real dose entry exists — the log takes over', () => {
    const seeded = infusion({ status: 'infusing', rate: 12 })
    const log: LogEntry[] = [doseEntry({ minute: 10, dose: 15, doseAction: 'titrate' })]
    expect(rateAtMinute('order-1', log, [seeded], 5)).toEqual({ rate: 12, isRateChangeAtMinute: false, discontinued: false })
    expect(rateAtMinute('order-1', log, [seeded], 10)).toEqual({ rate: 15, isRateChangeAtMinute: true, discontinued: false })
  })

  it('does not use the pre-seeded fallback for a still-"hanging" (not-yet-begun) infusion', () => {
    const notYetBegun = infusion({ status: 'hanging', rate: 0 })
    expect(rateAtMinute('order-1', [], [notYetBegun], 0)).toEqual({ rate: null, isRateChangeAtMinute: false, discontinued: false })
  })
})
