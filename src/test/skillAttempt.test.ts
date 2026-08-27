import { describe, expect, it } from 'vitest'
import { buildAttemptRecord } from '../engine/skillAttempt'
import type { Scorecard } from '../engine/scoring'
import { SKILL_SIGNOFF_CRITERIA } from '../data/policy'

const PASSING_CARD: Scorecard = {
  categories: [{ key: 'adherence', label: 'Order adherence', status: 'met', detail: '' }],
  overallPercent: SKILL_SIGNOFF_CRITERIA.minOverallPercent,
  strengths: [],
  opportunities: [],
  coachingNotes: [],
}

function baseParams(overrides: Partial<Parameters<typeof buildAttemptRecord>[0]> = {}) {
  return {
    attemptId: 'attempt-1',
    scenarioId: 'neutropenic-septic-shock',
    scenarioLabel: 'Septic shock from ascending cholangitis',
    mode: 'validation' as const,
    identity: { name: 'Jane Doe', email: 'jane.doe@med.usc.edu' },
    card: PASSING_CARD,
    ...overrides,
  }
}

describe('buildAttemptRecord', () => {
  it('passes through attemptId/scenarioId/scenarioLabel/mode verbatim', () => {
    const record = buildAttemptRecord(baseParams())
    expect(record.attemptId).toBe('attempt-1')
    expect(record.scenarioId).toBe('neutropenic-septic-shock')
    expect(record.scenarioLabel).toBe('Septic shock from ascending cholangitis')
    expect(record.mode).toBe('validation')
    expect(record.recordType).toBe('vasoactive-skill-attempt')
  })

  it('fills learnerName/learnerEmail with empty strings when identity is null', () => {
    const record = buildAttemptRecord(baseParams({ identity: null }))
    expect(record.learnerName).toBe('')
    expect(record.learnerEmail).toBe('')
  })

  it('carries the identity through when present', () => {
    const record = buildAttemptRecord(baseParams())
    expect(record.learnerName).toBe('Jane Doe')
    expect(record.learnerEmail).toBe('jane.doe@med.usc.edu')
  })

  it('passed is true for a validation-mode run meeting the skill-signoff threshold', () => {
    const record = buildAttemptRecord(baseParams({ mode: 'validation', card: PASSING_CARD }))
    expect(record.passed).toBe(true)
  })

  it('passed is always false for a training-mode run, even with a passing Scorecard', () => {
    const record = buildAttemptRecord(baseParams({ mode: 'training', card: PASSING_CARD }))
    expect(record.passed).toBe(false)
  })

  it('passed is false for a validation-mode run that does not meet the threshold', () => {
    const failingCard: Scorecard = { ...PASSING_CARD, overallPercent: SKILL_SIGNOFF_CRITERIA.minOverallPercent - 1 }
    const record = buildAttemptRecord(baseParams({ mode: 'validation', card: failingCard }))
    expect(record.passed).toBe(false)
  })

  it('defaults recordedAt to an ISO-8601 timestamp when omitted', () => {
    const record = buildAttemptRecord(baseParams())
    expect(record.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('uses the supplied recordedAt when provided', () => {
    const record = buildAttemptRecord(baseParams({ recordedAt: '2026-01-01T00:00:00.000Z' }))
    expect(record.recordedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('carries overallPercent and categories through from the Scorecard', () => {
    const record = buildAttemptRecord(baseParams())
    expect(record.overallPercent).toBe(PASSING_CARD.overallPercent)
    expect(record.categories).toEqual(PASSING_CARD.categories)
  })
})
