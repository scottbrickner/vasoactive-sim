/**
 * Pure .xlsx serialization for the shared skill-tracking workbook (Phase 16). No File
 * System Access API / DOM here — see sync/teamsFolder.ts for the read/write plumbing
 * and app/SkillAttemptPanel.tsx for the wiring. Mirrors the pure/DOM split already
 * used in sync/skillAttemptExport.ts (that file's csvCell/attemptToCSV/attemptFiles
 * are pure; only its download() is DOM-touching).
 *
 * Deliberate simplifications:
 * - `passed` is written as a native boolean, not 'Yes'/'No' text, so it's directly
 *   usable in Excel's own filters/COUNTIF/pivot tables.
 * - `recordedAt` is written as the raw ISO string, not converted to an Excel serial
 *   date — keeps this trivially pure and avoids timezone-conversion bugs. NPD can
 *   convert in Excel (DATEVALUE/TIMEVALUE or Power Query) if needed.
 * - No cell styling/column-widths survive a round-trip (SheetJS community-edition
 *   limitation) — if NPD manually formats the sheet, the next app-driven append won't
 *   preserve that formatting.
 * - The first sheet is read/written BY POSITION, not by name, so a human renaming the
 *   Excel tab doesn't break future appends (this workbook only ever has one sheet).
 */
import * as XLSX from 'xlsx'
import type { AttemptRecord } from '../engine/skillAttempt'

export const SKILL_TRACKING_WORKBOOK_FILENAME = 'Vasoactive-Sim-Skill-Tracking.xlsx'

const SHEET_NAME = 'Skill Attempts'

const HEADER_ROW = [
  'Recorded At',
  'Learner Name',
  'Learner Email',
  'Scenario',
  'Mode',
  'Overall %',
  'Passed',
  'Attempt ID',
] as const

function recordToRow(record: AttemptRecord): (string | number | boolean | null)[] {
  return [
    record.recordedAt,
    record.learnerName,
    record.learnerEmail,
    record.scenarioLabel,
    record.mode,
    record.overallPercent,
    record.passed,
    record.attemptId,
  ]
}

/**
 * Parses `existingWorkbookBytes` (or starts a fresh workbook with just the header row
 * if null — first-ever save), appends exactly one row for `record`, and returns the
 * new workbook serialized back to bytes. Callers own reading/writing those bytes.
 */
export function appendAttemptRow(existingWorkbookBytes: ArrayBuffer | null, record: AttemptRecord): ArrayBuffer {
  let rows: unknown[][]

  if (existingWorkbookBytes) {
    const workbook = XLSX.read(existingWorkbookBytes, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined
    rows = sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true }) as unknown[][]) : []
    if (rows.length === 0) rows = [[...HEADER_ROW]]
  } else {
    rows = [[...HEADER_ROW]]
  }

  rows.push(recordToRow(record))

  const newSheet = XLSX.utils.aoa_to_sheet(rows)
  const newWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, SHEET_NAME)

  return XLSX.write(newWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
