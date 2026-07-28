import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { appendAttemptRow } from '../sync/skillTrackingWorkbook'
import type { AttemptRecord } from '../engine/skillAttempt'

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
    categories: [],
    passed: true,
    recordedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Reads the first sheet of workbook bytes back as an array-of-arrays, for assertions. */
function readRows(bytes: ArrayBuffer): unknown[][] {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true }) as unknown[][]
}

const HEADER = ['Recorded At', 'Learner Name', 'Learner Email', 'Scenario', 'Mode', 'Overall %', 'Passed', 'Attempt ID']

describe('appendAttemptRow', () => {
  it('first-ever call (null bytes) creates the header row plus one data row', () => {
    const bytes = appendAttemptRow(null, fixtureRecord())
    const rows = readRows(bytes)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(HEADER)
    expect(rows[1]).toEqual([
      '2026-01-01T00:00:00.000Z',
      'Jane Doe',
      'jane.doe@med.usc.edu',
      'Septic shock',
      'validation',
      95,
      true,
      'attempt-1',
    ])
  })

  it('a second call fed the first call\'s bytes appends a second row without disturbing the first', () => {
    const first = appendAttemptRow(null, fixtureRecord({ attemptId: 'attempt-1' }))
    const second = appendAttemptRow(first, fixtureRecord({ attemptId: 'attempt-2', learnerName: 'John Smith' }))
    const rows = readRows(second)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(HEADER)
    expect(rows[1][7]).toBe('attempt-1')
    expect(rows[2][7]).toBe('attempt-2')
    expect(rows[2][1]).toBe('John Smith')
  })

  it('preserves insertion order across 3+ sequential appends', () => {
    let bytes: ArrayBuffer | null = null
    const ids = ['a1', 'a2', 'a3', 'a4']
    for (const id of ids) {
      bytes = appendAttemptRow(bytes, fixtureRecord({ attemptId: id }))
    }
    const rows = readRows(bytes!)
    expect(rows).toHaveLength(1 + ids.length)
    expect(rows.slice(1).map((r) => r[7])).toEqual(ids)
  })

  it('writes passed as a native boolean, not a string', () => {
    const bytes = appendAttemptRow(null, fixtureRecord({ passed: true }))
    const rows = readRows(bytes)
    expect(rows[1][6]).toBe(true)
    expect(typeof rows[1][6]).toBe('boolean')

    const bytesFalse = appendAttemptRow(null, fixtureRecord({ passed: false }))
    const rowsFalse = readRows(bytesFalse)
    expect(rowsFalse[1][6]).toBe(false)
    expect(typeof rowsFalse[1][6]).toBe('boolean')
  })

  it('writes a null overallPercent as a blank cell, not "null" or 0', () => {
    const bytes = appendAttemptRow(null, fixtureRecord({ overallPercent: null }))
    const rows = readRows(bytes)
    // sheet_to_json with header:1 renders an empty/undefined cell as undefined in the array.
    expect(rows[1][5]).toBeUndefined()
  })

  it('still appends correctly after the sole sheet has been renamed', () => {
    const first = appendAttemptRow(null, fixtureRecord({ attemptId: 'attempt-1' }))
    const workbook = XLSX.read(first, { type: 'array' })
    const renamed = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(renamed, workbook.Sheets[workbook.SheetNames[0]], 'Renamed Tab')
    const renamedBytes = XLSX.write(renamed, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const second = appendAttemptRow(renamedBytes, fixtureRecord({ attemptId: 'attempt-2' }))
    const rows = readRows(second)
    expect(rows).toHaveLength(3)
    expect(rows[1][7]).toBe('attempt-1')
    expect(rows[2][7]).toBe('attempt-2')
  })
})
