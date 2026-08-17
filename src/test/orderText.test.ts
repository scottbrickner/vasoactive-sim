import { describe, expect, it } from 'vitest'
import { combineOrderText, deriveFullOrderText, deriveWeanPriorityText, formatInterval } from '../engine/orderText'
import { getDrug } from '../data/formulary'
import type { Order } from '../state/types'

const norepiOrder: Order = {
  id: 'order-norepinephrine-agent1',
  drugId: 'norepinephrine',
  sequence: 1,
  startDose: 0.5,
  maxDose: 30,
  increment: 0.5,
  interval: { minMinutes: 3, maxMinutes: 5 },
  target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
}

const vasopressinOrder: Order = {
  id: 'order-vasopressin-agent2',
  drugId: 'vasopressin',
  sequence: 2,
  startDose: 0.02,
  maxDose: 0.04,
  increment: 0.01,
  interval: { minMinutes: 30 },
  target: { metric: 'MAP', comparator: '>=', value: 65, unit: 'mmHg' },
  activationThreshold: 1 / 3,
}

describe('formatInterval', () => {
  it('renders a min-max range interval', () => {
    expect(formatInterval({ minMinutes: 3, maxMinutes: 5 })).toBe('q3-5 min')
  })

  it('renders a single fixed interval with no max', () => {
    expect(formatInterval({ minMinutes: 30 })).toBe('q30 min')
  })
})

describe('deriveFullOrderText', () => {
  it('renders the full start/increment/interval/max/target clause for a fixed-rate drug', () => {
    const drug = getDrug('norepinephrine')
    expect(deriveFullOrderText(norepiOrder, drug)).toBe(
      'Start at 0.5 mcg/min IV, titrate 0.5 mcg/min q3-5 min up to 30 mcg/min. Target MAP >= 65 mmHg.',
    )
  })

  it('renders correctly for a fractional-dose drug (vasopressin)', () => {
    const drug = getDrug('vasopressin')
    expect(deriveFullOrderText(vasopressinOrder, drug)).toBe(
      'Start at 0.02 units/min IV, titrate 0.01 units/min q30 min up to 0.04 units/min. Target MAP >= 65 mmHg.',
    )
  })
})

describe('deriveWeanPriorityText', () => {
  it('is undefined when no order in the set carries a weanOrder', () => {
    expect(deriveWeanPriorityText(norepiOrder, [norepiOrder, vasopressinOrder])).toBeUndefined()
  })

  it('returns the fixed policy sentence when any order carries a weanOrder', () => {
    const weaned: Order = { ...vasopressinOrder, weanOrder: 1 }
    expect(deriveWeanPriorityText(norepiOrder, [norepiOrder, weaned])).toBe(
      'Wean priority: most recently added agent comes off first.',
    )
    // applies to every order in the set, not just the one that carries weanOrder itself
    expect(deriveWeanPriorityText(weaned, [norepiOrder, weaned])).toBe(
      'Wean priority: most recently added agent comes off first.',
    )
  })
})

describe('combineOrderText', () => {
  it('is just the base clause for a sequence-1 order with no wean priority in play', () => {
    const drug = getDrug('norepinephrine')
    expect(combineOrderText(norepiOrder, drug, [norepiOrder, vasopressinOrder])).toBe(
      'Start at 0.5 mcg/min IV, titrate 0.5 mcg/min q3-5 min up to 30 mcg/min. Target MAP >= 65 mmHg.',
    )
  })

  it('appends the activation clause for a sequence>1 order', () => {
    const drug = getDrug('vasopressin')
    const text = combineOrderText(vasopressinOrder, drug, [norepiOrder, vasopressinOrder])
    expect(text).toContain('Start at 0.02 units/min IV, titrate 0.01 units/min q30 min up to 0.04 units/min. Target MAP >= 65 mmHg.')
    expect(text).toContain(
      'Activates when Norepinephrine at 10 mcg/min (33% of its ordered maximum) with MAP still < 65 mmHg.',
    )
  })

  it('appends both activation and wean-priority clauses when both apply', () => {
    const drug = getDrug('vasopressin')
    const weaned: Order = { ...vasopressinOrder, weanOrder: 1 }
    const norepiWeaned: Order = { ...norepiOrder, weanOrder: 2 }
    const text = combineOrderText(weaned, drug, [norepiWeaned, weaned])
    expect(text).toContain('Activates when')
    expect(text).toContain('Wean priority: most recently added agent comes off first.')
  })
})
