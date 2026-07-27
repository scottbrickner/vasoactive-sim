import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSkillTrackingStore } from '../state/skillTrackingStore'
import type { Scorecard } from '../engine/scoring'
import { SKILL_SIGNOFF_CRITERIA } from '../data/policy'

const PASSING_CARD: Scorecard = {
  categories: [{ key: 'adherence', label: 'Order adherence', status: 'met', detail: '' }],
  overallPercent: SKILL_SIGNOFF_CRITERIA.minOverallPercent,
  strengths: [],
  opportunities: [],
}

// Vitest shares one module instance per test file, so this store's state (and
// localStorage, which it persists to) would otherwise leak across it() blocks.
beforeEach(() => {
  localStorage.clear()
  useSkillTrackingStore.setState({ learnerIdentity: null, skillAttempts: [] })
})
afterEach(() => {
  localStorage.clear()
  useSkillTrackingStore.setState({ learnerIdentity: null, skillAttempts: [] })
})

describe('useSkillTrackingStore — setLearnerIdentity', () => {
  it('sets and persists the learner identity', () => {
    useSkillTrackingStore.getState().setLearnerIdentity({ name: 'Jane Doe', email: 'jane.doe@med.usc.edu' })
    expect(useSkillTrackingStore.getState().learnerIdentity).toEqual({ name: 'Jane Doe', email: 'jane.doe@med.usc.edu' })
    const persisted = JSON.parse(localStorage.getItem('vasoactive-sim:skill-tracking')!)
    expect(persisted.learnerIdentity).toEqual({ name: 'Jane Doe', email: 'jane.doe@med.usc.edu' })
  })
})

describe('useSkillTrackingStore — recordAttempt', () => {
  it('appends the built record to skillAttempts, persists it, and returns it', () => {
    useSkillTrackingStore.getState().setLearnerIdentity({ name: 'Jane Doe', email: 'jane.doe@med.usc.edu' })
    const record = useSkillTrackingStore.getState().recordAttempt({
      card: PASSING_CARD,
      scenarioId: 'neutropenic-septic-shock',
      scenarioLabel: 'Septic shock',
      mode: 'validation',
    })
    expect(useSkillTrackingStore.getState().skillAttempts).toEqual([record])
    expect(record.passed).toBe(true)
    expect(record.learnerName).toBe('Jane Doe')
    const persisted = JSON.parse(localStorage.getItem('vasoactive-sim:skill-tracking')!)
    expect(persisted.skillAttempts).toEqual([record])
  })

  it('produces a distinct attemptId for each call', () => {
    const first = useSkillTrackingStore.getState().recordAttempt({
      card: PASSING_CARD,
      scenarioId: 'scenario-a',
      scenarioLabel: 'A',
      mode: 'training',
    })
    const second = useSkillTrackingStore.getState().recordAttempt({
      card: PASSING_CARD,
      scenarioId: 'scenario-b',
      scenarioLabel: 'B',
      mode: 'training',
    })
    expect(first.attemptId).not.toBe(second.attemptId)
    expect(useSkillTrackingStore.getState().skillAttempts).toHaveLength(2)
  })

  it('does not mutate the already-set learner identity', () => {
    useSkillTrackingStore.getState().setLearnerIdentity({ name: 'Jane Doe', email: 'jane.doe@med.usc.edu' })
    useSkillTrackingStore.getState().recordAttempt({
      card: PASSING_CARD,
      scenarioId: 'neutropenic-septic-shock',
      scenarioLabel: 'Septic shock',
      mode: 'validation',
    })
    expect(useSkillTrackingStore.getState().learnerIdentity).toEqual({ name: 'Jane Doe', email: 'jane.doe@med.usc.edu' })
  })
})
