import { beforeEach, describe, expect, it } from 'vitest'
import { loadStoredSkillState, persistSkillState } from '../sync/skillTracking'
import type { AttemptRecord } from '../engine/skillAttempt'

const STORAGE_KEY = 'vasoactive-sim:skill-tracking'

const SAMPLE_ATTEMPT: AttemptRecord = {
  recordType: 'vasoactive-skill-attempt',
  attemptId: 'attempt-1',
  scenarioId: 'neutropenic-septic-shock',
  scenarioLabel: 'Septic shock from ascending cholangitis',
  mode: 'validation',
  learnerName: 'Jane Doe',
  learnerEmail: 'jane.doe@med.usc.edu',
  overallPercent: 95,
  categories: [],
  passed: true,
  recordedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  localStorage.clear()
})

describe('loadStoredSkillState', () => {
  it('returns an empty state when nothing is stored', () => {
    expect(loadStoredSkillState()).toEqual({ learnerIdentity: null, skillAttempts: [] })
  })

  it('round-trips a previously-stored valid state', () => {
    const state = { learnerIdentity: { name: 'Jane Doe', email: 'jane.doe@med.usc.edu' }, skillAttempts: [SAMPLE_ATTEMPT] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    expect(loadStoredSkillState()).toEqual(state)
  })

  it('falls back to empty state on corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadStoredSkillState()).toEqual({ learnerIdentity: null, skillAttempts: [] })
  })

  it('falls back to an empty skillAttempts array if the stored value is not an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ learnerIdentity: null, skillAttempts: 'not-an-array' }))
    expect(loadStoredSkillState().skillAttempts).toEqual([])
  })
})

describe('persistSkillState', () => {
  it('writes a retrievable JSON blob', () => {
    const state = { learnerIdentity: null, skillAttempts: [SAMPLE_ATTEMPT] }
    persistSkillState(state)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(state)
  })
})
