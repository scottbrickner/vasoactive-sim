import { describe, expect, it } from 'vitest'
import { attemptToCSV, csvCell } from '../sync/skillAttemptExport'
import type { AttemptRecord } from '../engine/skillAttempt'

describe('csvCell', () => {
  it('returns an empty string for null/undefined', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('leaves a plain value unescaped', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(95)).toBe('95')
    expect(csvCell(true)).toBe('true')
  })

  it('quotes and escapes a value containing a comma', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
  })

  it('quotes and doubles internal quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes a value containing a newline', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
})

function fixtureRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    recordType: 'vasoactive-skill-attempt',
    attemptId: 'attempt-1',
    scenarioId: 'neutropenic-septic-shock',
    scenarioLabel: 'Septic shock',
    mode: 'validation',
    learnerName: 'Jane Doe',
    learnerEmail: 'jane.doe@med.usc.edu',
    overallPercent: 95,
    categories: [
      { key: 'adherence', label: 'Order adherence', status: 'met', detail: 'All applied.' },
      { key: 'documentation', label: 'Documentation cadence & placement', status: 'partial', detail: '1 of 2 charted.' },
    ],
    passed: true,
    recordedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('attemptToCSV', () => {
  it('has a header row plus one row per category', () => {
    const csv = attemptToCSV(fixtureRecord())
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3) // header + 2 categories
    expect(lines[0]).toBe(
      'recordedAt,scenarioId,scenarioLabel,mode,learnerName,learnerEmail,overallPercent,passed,categoryKey,categoryLabel,categoryStatus,categoryDetail',
    )
  })

  it('repeats the session-level fields on every category row', () => {
    const csv = attemptToCSV(fixtureRecord())
    const lines = csv.split('\n')
    expect(lines[1]).toMatch(/^2026-01-01T00:00:00\.000Z,neutropenic-septic-shock,Septic shock,validation,Jane Doe/)
    expect(lines[2]).toMatch(/^2026-01-01T00:00:00\.000Z,neutropenic-septic-shock,Septic shock,validation,Jane Doe/)
  })
})
