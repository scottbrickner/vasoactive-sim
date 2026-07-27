/**
 * JSON/CSV export for skill-attempt records (Phase 15) — mirrors
 * zoll-r-series-simulator's sync/report.js (download/csvCell) and
 * sync/guidedSignoff.js (signoffToCSV/signoffFiles/exportSignoff*) shapes for naming
 * consistency across the shared platform (CLAUDE.md).
 */
import type { AttemptRecord } from '../engine/skillAttempt'

function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function slug(s: string): string {
  return (
    String(s || 'learner')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'learner'
  )
}

const ATTEMPT_CSV_COLUMNS = [
  'recordedAt',
  'scenarioId',
  'scenarioLabel',
  'mode',
  'learnerName',
  'learnerEmail',
  'overallPercent',
  'passed',
  'categoryKey',
  'categoryLabel',
  'categoryStatus',
  'categoryDetail',
]

function attemptRows(record: AttemptRecord): Record<string, unknown>[] {
  return record.categories.map((c) => ({
    recordedAt: record.recordedAt,
    scenarioId: record.scenarioId,
    scenarioLabel: record.scenarioLabel,
    mode: record.mode,
    learnerName: record.learnerName,
    learnerEmail: record.learnerEmail,
    overallPercent: record.overallPercent,
    passed: record.passed,
    categoryKey: c.key,
    categoryLabel: c.label,
    categoryStatus: c.status,
    categoryDetail: c.detail,
  }))
}

/** One CSV row per scored category, session fields repeated — mirrors ZOLL's signoffToCSV. */
export function attemptToCSV(record: AttemptRecord): string {
  const rows = [ATTEMPT_CSV_COLUMNS.join(',')]
  for (const row of attemptRows(record)) {
    rows.push(ATTEMPT_CSV_COLUMNS.map((k) => csvCell(row[k])).join(','))
  }
  return rows.join('\n')
}

/** History export ("My Skill Status" page) — same columns, every attempt's categories concatenated. */
export function attemptsToCSV(records: AttemptRecord[]): string {
  const rows = [ATTEMPT_CSV_COLUMNS.join(',')]
  for (const record of records) {
    for (const row of attemptRows(record)) {
      rows.push(ATTEMPT_CSV_COLUMNS.map((k) => csvCell(row[k])).join(','))
    }
  }
  return rows.join('\n')
}

/** Filenames + contents for both export formats — shared by the download and Teams-folder-save paths. */
export function attemptFiles(record: AttemptRecord) {
  const base = `vasoactive-skill-attempt-${record.scenarioId}-${slug(record.learnerName)}-${Date.now()}`
  return {
    json: { name: `${base}.json`, contents: JSON.stringify(record, null, 2), mime: 'application/json' },
    csv: { name: `${base}.csv`, contents: attemptToCSV(record), mime: 'text/csv' },
  }
}

export function exportAttemptJSON(record: AttemptRecord): void {
  const { json } = attemptFiles(record)
  download(json.name, json.contents, json.mime)
}

export function exportAttemptCSV(record: AttemptRecord): void {
  const { csv } = attemptFiles(record)
  download(csv.name, csv.contents, csv.mime)
}

export function exportAttemptsHistoryCSV(records: AttemptRecord[]): void {
  download(`vasoactive-skill-attempts-history-${Date.now()}.csv`, attemptsToCSV(records), 'text/csv')
}
